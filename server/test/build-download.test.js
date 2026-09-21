import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import AdmZip from 'adm-zip';

import Game from '../src/models/Game.js';
import Build from '../src/models/Build.js';
import User from '../src/models/User.js';
import gamesRouter, { buildDownloadFilename } from '../src/routes/games.js';
import { createZipFromDirectory } from '../src/services/assetArchive.js';

process.env.JWT_SECRET ||= 'build-download-test-secret';

const game = {
  _id: 'game-download-test',
  slug: 'cool-webgl-game',
  name: 'Cool WebGL Game',
  ownerId: 'owner-download-test',
  collaborators: ['collaborator-download-test'],
};

function authToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

async function startServer() {
  const app = express();
  app.use('/api/games', gamesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('buildDownloadFilename formats safe and descriptive filenames', () => {
  assert.equal(
    buildDownloadFilename({ slug: 'my-game' }, { _id: '123', version: 'v1.0.0' }),
    'my-game-v1.0.0-123.zip',
  );
  assert.equal(
    buildDownloadFilename({ name: 'Awesome Game / 2026!' }, { _id: 'abc', version: '2.1' }),
    'awesome-game-2026-2.1-abc.zip',
  );
  assert.equal(
    buildDownloadFilename({ slug: 'game-only' }, { _id: 'xyz' }),
    'game-only-xyz.zip',
  );
  assert.equal(
    buildDownloadFilename(null, null),
    'game-build.zip',
  );
});

test('createZipFromDirectory archives files, preserves posix paths, and ignores hidden files', async () => {
  const testDir = path.resolve('storage', 'test-create-zip');
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, 'StreamingAssets', 'sub'), { recursive: true });
  await fs.mkdir(path.join(testDir, '.hidden-dir'), { recursive: true });

  await fs.writeFile(path.join(testDir, 'game.loader.js'), 'console.log("loader");');
  await fs.writeFile(path.join(testDir, 'StreamingAssets', 'sub', 'data.json'), '{"key":"val"}');
  await fs.writeFile(path.join(testDir, '.DS_Store'), 'ignored');
  await fs.writeFile(path.join(testDir, '.hidden-dir', 'secret.txt'), 'ignored');

  try {
    const zipBuffer = await createZipFromDirectory(testDir);
    assert.ok(Buffer.isBuffer(zipBuffer));

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().map((e) => e.entryName).sort();
    assert.deepEqual(entries, ['StreamingAssets/sub/data.json', 'game.loader.js']);

    assert.equal(zip.readAsText('game.loader.js'), 'console.log("loader");');
    assert.equal(zip.readAsText('StreamingAssets/sub/data.json'), '{"key":"val"}');

    const missingDirZip = await createZipFromDirectory(path.join(testDir, 'does-not-exist'));
    assert.equal(missingDirZip, null);
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('build download route enforces auth, approval, permissions, and returns zip archive', async () => {
  const storageRoot = path.resolve('storage', 'builds');
  const buildId = 'build-download-test-id';
  const buildDir = path.join(storageRoot, buildId);

  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(path.join(buildDir, 'StreamingAssets'), { recursive: true });
  await fs.mkdir(path.join(buildDir, '.streaming-assets-tmp-stale'), { recursive: true });

  const diskFiles = {
    'game.loader.js': 'loader-content',
    'game.data': 'data-content',
    'game.framework.js': 'framework-content',
    'game.wasm': 'wasm-content',
    'StreamingAssets/data.json': '{"hello":"world"}',
  };
  for (const [rel, content] of Object.entries(diskFiles)) {
    const filePath = path.join(buildDir, ...rel.split('/'));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  await fs.writeFile(path.join(buildDir, '.streaming-assets-tmp-stale', 'junk.txt'), 'junk');
  await fs.writeFile(path.join(buildDir, '.DS_Store'), 'junk');

  const buildDoc = {
    _id: buildId,
    gameId: game._id,
    version: '1.2.3',
  };

  const originals = {
    gameFindById: Game.findById,
    buildFindOne: Build.findOne,
    userFindById: User.findById,
  };

  Game.findById = async (id) => (String(id) === game._id ? game : null);
  Build.findOne = async (query) => (query?._id === buildId && query?.gameId === game._id ? buildDoc : null);
  User.findById = (id) => ({
    select: async () => ({
      _id: id,
      status: id === 'pending-user' ? 'pending' : 'approved',
      role: 'developer',
    }),
  });

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api/games/${game._id}/builds/${buildId}`;

  try {
    // 1. Unauthenticated request -> 401
    const unauth = await fetch(`${base}/download`);
    assert.equal(unauth.status, 401);

    // 2. Pending approval user -> 403
    const pending = await fetch(`${base}/download`, {
      headers: { Authorization: `Bearer ${authToken('pending-user')}` },
    });
    assert.equal(pending.status, 403);

    // 3. Unauthorized user (neither owner nor collaborator) -> 404
    const outsider = await fetch(`${base}/download`, {
      headers: { Authorization: `Bearer ${authToken('outsider-user')}` },
    });
    assert.equal(outsider.status, 404);

    // 4. Missing build -> 404
    const missingBuild = await fetch(`http://127.0.0.1:${port}/api/games/${game._id}/builds/nonexistent/download`, {
      headers: { Authorization: `Bearer ${authToken('owner-download-test')}` },
    });
    assert.equal(missingBuild.status, 404);

    // 5. Successful download by owner
    const ownerRes = await fetch(`${base}/download`, {
      headers: { Authorization: `Bearer ${authToken('owner-download-test')}` },
    });
    assert.equal(ownerRes.status, 200);
    assert.equal(ownerRes.headers.get('content-type'), 'application/zip');
    assert.equal(
      ownerRes.headers.get('content-disposition'),
      'attachment; filename="cool-webgl-game-1.2.3-build-download-test-id.zip"',
    );
    const ownerBuf = Buffer.from(await ownerRes.arrayBuffer());
    const ownerZip = new AdmZip(ownerBuf);
    const ownerEntries = ownerZip.getEntries().map((e) => e.entryName).sort();
    assert.deepEqual(ownerEntries, [
      'StreamingAssets/data.json',
      'game.data',
      'game.framework.js',
      'game.loader.js',
      'game.wasm',
    ]);
    assert.equal(ownerZip.readAsText('StreamingAssets/data.json'), '{"hello":"world"}');
    assert.equal(ownerZip.readAsText('game.loader.js'), 'loader-content');

    // 6. Successful download by collaborator via /export alias
    const collabRes = await fetch(`${base}/export`, {
      headers: { Authorization: `Bearer ${authToken('collaborator-download-test')}` },
    });
    assert.equal(collabRes.status, 200);
    assert.equal(collabRes.headers.get('content-type'), 'application/zip');
  } finally {
    Game.findById = originals.gameFindById;
    Build.findOne = originals.buildFindOne;
    User.findById = originals.userFindById;
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(buildDir, { recursive: true, force: true });
  }
});
