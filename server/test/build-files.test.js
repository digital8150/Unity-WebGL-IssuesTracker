import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';

import { createBlogImageFileHandler, createBuildFileHandler, createContentFileHandler } from '../src/services/buildFiles.js';

async function startServer(storageRoot) {
  const app = express();
  app.get('/builds/:buildId/*', createBuildFileHandler(storageRoot));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function startContentServer(contentRoot) {
  const app = express();
  app.get('/content/:gameId/:channel/*', createContentFileHandler(contentRoot));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

const CONTENT_GAME_ID = '64b7f1c2d4e5f6a7b8c9d0aa';
const CONTENT_CHANNEL = 'live';

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

test('content handler applies cache policy by filename shape, revalidates catalogs, and rejects traversal', async () => {
  const contentRoot = path.resolve('storage', 'content-file-handler-test');
  const channelDir = path.join(contentRoot, CONTENT_GAME_ID, CONTENT_CHANNEL);
  await fs.rm(contentRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(channelDir, 'WebGL'), { recursive: true });
  await fs.mkdir(path.join(channelDir, '.content-tmp-test'), { recursive: true });
  await fs.writeFile(
    path.join(channelDir, 'WebGL', 'assets_all_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle'),
    'hashed bundle payload',
  );
  await fs.writeFile(path.join(channelDir, 'WebGL', 'assets_all.bundle'), 'unhashed bundle payload');
  await fs.writeFile(path.join(channelDir, 'catalog_1.json'), '{"version":1}');
  await fs.writeFile(path.join(channelDir, 'catalog_1.bin'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(channelDir, '.content-tmp-test', 'secret.txt'), 'secret');

  const server = await startContentServer(contentRoot);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const prefix = `${baseUrl}/content/${CONTENT_GAME_ID}/${CONTENT_CHANNEL}`;

    const hashed = await fetch(`${prefix}/WebGL/assets_all_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle`);
    assert.equal(hashed.status, 200);
    assert.equal(hashed.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(hashed.headers.get('content-type'), 'application/octet-stream');
    assert.equal(hashed.headers.get('accept-ranges'), 'bytes');
    assert.equal(hashed.headers.get('content-length'), String(Buffer.byteLength('hashed bundle payload')));
    assert.equal(hashed.headers.get('etag'), null);

    const unhashed = await fetch(`${prefix}/WebGL/assets_all.bundle`);
    assert.equal(unhashed.status, 200);
    assert.equal(unhashed.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(unhashed.headers.get('accept-ranges'), 'bytes');
    assert.ok(unhashed.headers.get('etag'));

    const catalog = await fetch(`${prefix}/catalog_1.json`);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get('cache-control'), 'no-cache');
    assert.equal(catalog.headers.get('content-type'), 'application/json');
    const catalogEtag = catalog.headers.get('etag');
    assert.ok(catalogEtag);
    assert.ok(catalog.headers.get('last-modified'));

    const binaryCatalog = await fetch(`${prefix}/catalog_1.bin`);
    assert.equal(binaryCatalog.status, 200);
    assert.equal(binaryCatalog.headers.get('cache-control'), 'no-cache');
    assert.equal(binaryCatalog.headers.get('content-type'), 'application/octet-stream');

    const revalidated = await fetch(`${prefix}/catalog_1.json`, {
      headers: { 'If-None-Match': catalogEtag },
    });
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.headers.get('content-length'), null);
    assert.equal(await revalidated.text(), '');

    const hiddenSwapArtifact = await fetch(`${prefix}/.content-tmp-test/secret.txt`);
    assert.equal(hiddenSwapArtifact.status, 404);

    const traversal = await fetch(`${prefix}/..%2Fescape.txt`);
    assert.equal(traversal.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(contentRoot, { recursive: true, force: true });
  }
});

test('content handler supports single-range requests and falls back to 200 for multi-range headers', async () => {
  const contentRoot = path.resolve('storage', 'content-file-handler-range-test');
  const channelDir = path.join(contentRoot, CONTENT_GAME_ID, CONTENT_CHANNEL);
  await fs.rm(contentRoot, { recursive: true, force: true });
  await fs.mkdir(channelDir, { recursive: true });
  const body = '0123456789'.repeat(100); // exactly 1000 bytes
  await fs.writeFile(path.join(channelDir, 'data.bin'), body);

  const server = await startContentServer(contentRoot);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const url = `${baseUrl}/content/${CONTENT_GAME_ID}/${CONTENT_CHANNEL}/data.bin`;

    const partial = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 0-99/1000');
    assert.equal(partial.headers.get('content-length'), '100');
    const partialText = await partial.text();
    assert.equal(partialText.length, 100);
    assert.equal(partialText, body.slice(0, 100));

    const suffix = await fetch(url, { headers: { Range: 'bytes=-50' } });
    assert.equal(suffix.status, 206);
    assert.equal(suffix.headers.get('content-range'), 'bytes 950-999/1000');
    assert.equal(suffix.headers.get('content-length'), '50');
    assert.equal(await suffix.text(), body.slice(950));

    const unsatisfiable = await fetch(url, { headers: { Range: 'bytes=2000-3000' } });
    assert.equal(unsatisfiable.status, 416);
    assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */1000');

    const multiRange = await fetch(url, { headers: { Range: 'bytes=0-9,20-29' } });
    assert.equal(multiRange.status, 200);
    assert.equal(multiRange.headers.get('content-length'), '1000');
    assert.equal((await multiRange.text()).length, 1000);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(contentRoot, { recursive: true, force: true });
  }
});

test('If-None-Match takes precedence over If-Modified-Since on revalidated content', async () => {
  const contentRoot = path.resolve('storage', 'content-conditional-test');
  const channelDir = path.join(contentRoot, CONTENT_GAME_ID, CONTENT_CHANNEL, 'WebGL');
  await fs.rm(contentRoot, { recursive: true, force: true });
  await fs.mkdir(channelDir, { recursive: true });
  await fs.writeFile(path.join(channelDir, 'catalog_a.json'), '{"v":1}');

  const server = await startContentServer(contentRoot);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/content/${CONTENT_GAME_ID}/${CONTENT_CHANNEL}/WebGL/catalog_a.json`;
  try {
    const first = await fetch(url);
    const etag = first.headers.get('etag');
    const lastModified = first.headers.get('last-modified');
    assert.ok(etag);

    // A matching validator still revalidates.
    const matched = await fetch(url, { headers: { 'if-none-match': etag } });
    assert.equal(matched.status, 304);

    // Rewriting within the same clock second leaves Last-Modified unchanged, so
    // honoring If-Modified-Since alongside a stale ETag would serve a 304 for
    // content the client does not have. RFC 9110 requires ignoring the date.
    await fs.writeFile(path.join(channelDir, 'catalog_a.json'), '{"v":2}');
    const stale = await fetch(url, {
      headers: { 'if-none-match': etag, 'if-modified-since': lastModified },
    });
    assert.equal(stale.status, 200);
    assert.equal(await stale.text(), '{"v":2}');

    // Without If-None-Match the date validator still applies on its own.
    const dateOnly = await fetch(url, {
      headers: { 'if-modified-since': stale.headers.get('last-modified') },
    });
    assert.equal(dateOnly.status, 304);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(contentRoot, { recursive: true, force: true });
  }
});

test('blog images are served with their mime type rather than failing', async () => {
  const blogRoot = path.resolve('storage', 'blog-image-handler-test');
  await fs.rm(blogRoot, { recursive: true, force: true });
  await fs.mkdir(blogRoot, { recursive: true });
  await fs.writeFile(path.join(blogRoot, 'photo.jpg'), 'jpeg-bytes');
  await fs.writeFile(path.join(blogRoot, 'clip.mp4'), 'mp4-bytes');

  const app = express();
  app.get('/blog-images/:filename', createBlogImageFileHandler(blogRoot));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    // Regression: this handler previously called an unimported createReadStream,
    // so every blog image returned 500 instead of its bytes.
    const jpeg = await fetch(`http://127.0.0.1:${port}/blog-images/photo.jpg`);
    assert.equal(jpeg.status, 200);
    assert.equal(jpeg.headers.get('content-type'), 'image/jpeg');
    assert.equal(jpeg.headers.get('content-length'), String(Buffer.byteLength('jpeg-bytes')));
    assert.equal(await jpeg.text(), 'jpeg-bytes');

    const mp4 = await fetch(`http://127.0.0.1:${port}/blog-images/clip.mp4`);
    assert.equal(mp4.status, 200);
    assert.equal(mp4.headers.get('content-type'), 'video/mp4');

    const missing = await fetch(`http://127.0.0.1:${port}/blog-images/nope.png`);
    assert.equal(missing.status, 404);

    const traversal = await fetch(`http://127.0.0.1:${port}/blog-images/..%2Fsecret.txt`);
    assert.equal(traversal.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(blogRoot, { recursive: true, force: true });
  }
});
