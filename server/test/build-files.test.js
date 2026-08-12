import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';

import { createBuildFileHandler } from '../src/services/buildFiles.js';

async function startServer(storageRoot) {
  const app = express();
  app.get('/builds/:buildId/*', createBuildFileHandler(storageRoot));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('StreamingAssets use ETag revalidation while Unity artifacts stay immutable', async () => {
  const storageRoot = path.resolve('storage', 'build-file-handler-test');
  const buildDir = path.join(storageRoot, 'build-id');
  const assetPath = path.join(buildDir, 'StreamingAssets', 'config.json');
  await fs.rm(storageRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.mkdir(path.join(buildDir, '.streaming-assets-old-test'), { recursive: true });
  await fs.writeFile(assetPath, 'first');
  await fs.writeFile(path.join(buildDir, 'game.wasm'), 'wasm');
  await fs.writeFile(path.join(buildDir, '.streaming-assets-old-test', 'secret.txt'), 'secret');

  const server = await startServer(storageRoot);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const first = await fetch(`${baseUrl}/builds/build-id/StreamingAssets/config.json`);
    assert.equal(first.status, 200);
    assert.equal(await first.text(), 'first');
    assert.equal(first.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    const oldEtag = first.headers.get('etag');
    assert.ok(oldEtag);
    assert.ok(first.headers.get('last-modified'));

    const unchanged = await fetch(`${baseUrl}/builds/build-id/StreamingAssets/config.json`, {
      headers: { 'If-None-Match': oldEtag },
    });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), '');

    await fs.writeFile(assetPath, 'second');
    const replaced = await fetch(`${baseUrl}/builds/build-id/StreamingAssets/config.json`, {
      headers: { 'If-None-Match': oldEtag },
    });
    assert.equal(replaced.status, 200);
    assert.equal(await replaced.text(), 'second');
    assert.notEqual(replaced.headers.get('etag'), oldEtag);

    const artifact = await fetch(`${baseUrl}/builds/build-id/game.wasm`);
    assert.equal(artifact.status, 200);
    assert.equal(artifact.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(artifact.headers.get('content-type'), 'application/wasm');

    const hiddenSwapArtifact = await fetch(`${baseUrl}/builds/build-id/.streaming-assets-old-test/secret.txt`);
    assert.equal(hiddenSwapArtifact.status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});
