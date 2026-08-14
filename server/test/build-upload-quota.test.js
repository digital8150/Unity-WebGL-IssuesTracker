import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';

import Game from '../src/models/Game.js';
import Build from '../src/models/Build.js';
import User from '../src/models/User.js';
import AddressableContent from '../src/models/AddressableContent.js';
import gamesRouter from '../src/routes/games.js';

process.env.JWT_SECRET ||= 'build-upload-quota-test-secret';

test('a build upload over quota is rejected and its staged build is removed', async () => {
  const ownerId = 'owner-build-quota-test';
  const game = { _id: 'game-build-quota-test', ownerId, collaborators: [] };
  const buildId = 'build-upload-quota-test';
  const buildDir = path.resolve('storage', 'builds', buildId);
  let deleted = false;
  const build = {
    _id: buildId,
    storageBytes: 0,
    async save() { return this; },
    async deleteOne() { deleted = true; },
  };
  const originals = {
    userFindById: User.findById,
    gameFind: Game.find,
    gameFindById: Game.findById,
    buildAggregate: Build.aggregate,
    buildCreate: Build.create,
    contentAggregate: AddressableContent.aggregate,
  };

  User.findById = () => ({
    select: async () => ({ status: 'approved', role: 'user', storageQuota: 5 }),
  });
  Game.find = () => ({ select: async () => [game] });
  Game.findById = async () => game;
  Build.aggregate = async () => [];
  Build.create = async () => build;
  AddressableContent.aggregate = async () => [];

  await fs.rm(buildDir, { recursive: true, force: true });
  const app = express();
  app.use('/api/games', gamesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const form = new FormData();
    form.append('files', new Blob(['larger than five bytes']), 'game.data');
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/games/${game._id}/builds`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt.sign({ sub: ownerId }, process.env.JWT_SECRET)}` },
        body: form,
      },
    );
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Storage quota exceeded' });
    assert.equal(deleted, true);
    await assert.rejects(fs.access(buildDir));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originals.userFindById;
    Game.find = originals.gameFind;
    Game.findById = originals.gameFindById;
    Build.aggregate = originals.buildAggregate;
    Build.create = originals.buildCreate;
    AddressableContent.aggregate = originals.contentAggregate;
    await fs.rm(buildDir, { recursive: true, force: true });
  }
});
