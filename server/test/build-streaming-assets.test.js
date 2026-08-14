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
import AddressableContent from '../src/models/AddressableContent.js';
import gamesRouter, { extractStreamingAssetsZip } from '../src/routes/games.js';

process.env.JWT_SECRET ||= 'build-streaming-assets-test-secret';

const game = {
  _id: 'game-streaming-test',
  ownerId: 'owner-streaming-test',
  collaborators: ['collaborator-streaming-test'],
};

function authToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [name, contents] of entries) zip.addFile(name, Buffer.from(contents));
  return zip.toBuffer();
}

function makeZipWithDeclaredSize(name, contents, declaredSize) {
  const buffer = makeZip([[name, contents]]);
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x02014b50) {
      buffer.writeUInt32LE(declaredSize, offset + 24);
      break;
    }
  }
  return buffer;
}

async function startServer() {
  const app = express();
  app.use('/api/games', gamesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function replaceStreamingAssets(server, userId, zipBuffer, buildId = 'build-streaming-test') {
  const { port } = server.address();
  const form = new FormData();
  form.append(
    'streamingAssetsZip',
    new Blob([zipBuffer], { type: 'application/zip' }),
    'streaming-assets.zip',
  );
  return fetch(`http://127.0.0.1:${port}/api/games/${game._id}/builds/${buildId}/streaming-assets`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken(userId)}` },
    body: form,
  });
}

test('StreamingAssets replacement is authorized, idempotent, and recomputes storage', async () => {
  const storageRoot = path.resolve('storage', 'builds');
  const buildId = 'build-streaming-test';
  const buildDir = path.join(storageRoot, buildId);
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(path.join(buildDir, 'StreamingAssets'), { recursive: true });
  await fs.mkdir(path.join(buildDir, '.streaming-assets-old-stale'), { recursive: true });

  const files = {
    loader: 'game.loader.js',
    data: 'game.data',
    framework: 'game.framework.js',
    wasm: 'game.wasm',
    other: ['notes.txt', 'StreamingAssets/stale.txt', 'StreamingAssets/old.bin', 'notes.txt'],
  };
  const diskFiles = {
    'game.loader.js': 'loader',
    'game.data': 'data',
    'game.framework.js': 'framework',
    'game.wasm': 'wasm',
    'notes.txt': 'keep this file',
    'StreamingAssets/stale.txt': 'stale',
    'StreamingAssets/old.bin': 'old',
  };
  for (const [relative, contents] of Object.entries(diskFiles)) {
    const filePath = path.join(buildDir, ...relative.split('/'));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }

  const build = {
    _id: buildId,
    gameId: game._id,
    files,
    storageBytes: 999999,
    async save() { return this; },
  };
  const originals = {
    userFindById: User.findById,
    gameFind: Game.find,
    gameFindById: Game.findById,
    buildAggregate: Build.aggregate,
    buildFindOne: Build.findOne,
    contentAggregate: AddressableContent.aggregate,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
  Game.find = () => ({ select: async () => [game] });
  Game.findById = async () => game;
  Build.aggregate = async () => [{ _id: null, total: build.storageBytes }];
  Build.findOne = async () => build;
  AddressableContent.aggregate = async () => [];

  const server = await startServer();
  try {
    const unauthorized = await replaceStreamingAssets(server, 'outsider-streaming-test', makeZip([
      ['StreamingAssets/ignored.txt', 'ignored'],
    ]));
    assert.equal(unauthorized.status, 404);

    const missingAuth = await fetch(
      `http://127.0.0.1:${server.address().port}/api/games/${game._id}/builds/${buildId}/streaming-assets`,
      { method: 'PUT' },
    );
    assert.equal(missingAuth.status, 401);

    const freshEntries = [
      ['StreamingAssets/new/asset.txt', 'fresh asset'],
      ['StreamingAssets/renamed.json', '{"fresh":true}'],
    ];
    const response = await replaceStreamingAssets(
      server,
      'owner-streaming-test',
      makeZip(freshEntries),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.build._id, buildId);

    await assert.rejects(fs.access(path.join(buildDir, 'StreamingAssets', 'stale.txt')));
    await assert.rejects(fs.access(path.join(buildDir, 'StreamingAssets', 'old.bin')));
    await assert.doesNotReject(fs.access(path.join(buildDir, 'StreamingAssets', 'new', 'asset.txt')));

    assert.deepEqual(build.files.other, [
      'notes.txt',
      'StreamingAssets/new/asset.txt',
      'StreamingAssets/renamed.json',
    ]);
    assert.equal(new Set(build.files.other).size, build.files.other.length);
    assert.equal(build.streamingAssetsFileCount, 2);
    assert.equal(build.streamingAssetsBytes, Buffer.byteLength('fresh asset') + Buffer.byteLength('{"fresh":true}'));

    let expectedStorage = 0;
    for (const relative of [
      'game.loader.js', 'game.data', 'game.framework.js', 'game.wasm', 'notes.txt',
      'StreamingAssets/new/asset.txt', 'StreamingAssets/renamed.json',
    ]) {
      expectedStorage += (await fs.stat(path.join(buildDir, ...relative.split('/')))).size;
    }
    assert.equal(build.storageBytes, expectedStorage);
    assert.ok(build.streamingAssetsUpdatedAt instanceof Date);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originals.userFindById;
    Game.find = originals.gameFind;
    Game.findById = originals.gameFindById;
    Build.aggregate = originals.buildAggregate;
    Build.findOne = originals.buildFindOne;
    AddressableContent.aggregate = originals.contentAggregate;
    await fs.rm(buildDir, { recursive: true, force: true });
  }
});

async function assertNoStreamingSwapArtifacts(buildDir) {
  const entries = await fs.readdir(buildDir, { withFileTypes: true });
  assert.deepEqual(
    entries.filter((entry) => (
      entry.name.startsWith('.streaming-assets-tmp-')
      || entry.name.startsWith('.streaming-assets-old-')
    )),
    [],
  );
}

test('an over-cap StreamingAssets entry returns 413 and preserves the live tree and metadata', async () => {
  const buildId = 'build-streaming-entry-cap-test';
  const buildDir = path.join(path.resolve('storage', 'builds'), buildId);
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(path.join(buildDir, 'StreamingAssets'), { recursive: true });
  await fs.writeFile(path.join(buildDir, 'StreamingAssets', 'old.txt'), 'old asset');

  const build = {
    _id: buildId,
    gameId: game._id,
    files: { loader: 'game.loader.js', data: 'game.data', framework: 'game.framework.js', wasm: 'game.wasm', other: ['StreamingAssets/old.txt'] },
    streamingAssetsFileCount: 1,
    streamingAssetsBytes: Buffer.byteLength('old asset'),
    streamingAssetsUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
    storageBytes: 123,
    async save() { return this; },
  };
  const originals = {
    userFindById: User.findById,
    gameFindById: Game.findById,
    buildFindOne: Build.findOne,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
  Game.findById = async () => game;
  Build.findOne = async () => build;

  const server = await startServer();
  try {
    const response = await replaceStreamingAssets(
      server,
      'owner-streaming-test',
      makeZipWithDeclaredSize('StreamingAssets/too-large.bin', 'x', 256 * 1024 * 1024 + 1),
      buildId,
    );
    assert.equal(response.status, 413);
    assert.equal(await response.text(), JSON.stringify({ error: 'A StreamingAssets file is too large' }));
    assert.equal(await fs.readFile(path.join(buildDir, 'StreamingAssets', 'old.txt'), 'utf8'), 'old asset');
    assert.deepEqual(build.files.other, ['StreamingAssets/old.txt']);
    assert.equal(build.streamingAssetsFileCount, 1);
    assert.equal(build.streamingAssetsBytes, Buffer.byteLength('old asset'));
    assert.equal(build.storageBytes, 123);
    await assertNoStreamingSwapArtifacts(buildDir);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originals.userFindById;
    Game.findById = originals.gameFindById;
    Build.findOne = originals.buildFindOne;
    await fs.rm(buildDir, { recursive: true, force: true });
  }
});

test('an over-cap extracted StreamingAssets total carries status 413', async () => {
  const buildDir = path.join(path.resolve('storage', 'builds'), 'build-streaming-total-cap-test');
  const zipPath = path.join(buildDir, 'input.zip');
  const destination = path.join(buildDir, '.streaming-assets-test-dest');
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(zipPath, makeZip([
    ['first.bin', 'aa'],
    ['second.bin', 'bb'],
  ]));

  try {
    await assert.rejects(
      () => extractStreamingAssetsZip(zipPath, destination, { maxEntryBytes: 2, maxBytes: 3 }),
      (error) => {
        assert.equal(error.status, 413);
        assert.equal(error.message, 'StreamingAssets zip is too large after extraction');
        return true;
      },
    );
    assert.equal(await fs.readFile(path.join(destination, 'first.bin'), 'utf8'), 'aa');
  } finally {
    await fs.rm(buildDir, { recursive: true, force: true });
  }
});
