import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';

import Build from '../src/models/Build.js';
import Game from '../src/models/Game.js';
import { Issue } from '../src/models/Issue.js';
import gamesRouter from '../src/routes/games.js';
import issuesRouter from '../src/routes/issues.js';
import { query } from './helpers/fake-models.js';

const GAME_ID = new mongoose.Types.ObjectId();
const BUILD_ID = new mongoose.Types.ObjectId();

const privateGame = {
  _id: GAME_ID,
  name: 'Unlisted game',
  slug: 'unlisted-game',
  description: 'Shared by direct link',
  longDescription: '',
  thumbnailUrl: '',
  visibility: 'private',
  ownerId: { _id: new mongoose.Types.ObjectId(), name: 'Developer' },
  reviewInfo: { enabled: false },
  serverBackend: { v2Enabled: false, cloudSaveEnabled: false },
  toObject() {
    return { ...this };
  },
};

const activeBuild = {
  _id: BUILD_ID,
  gameId: GAME_ID,
  version: '1.0.0',
  canvasWidth: 1280,
  canvasHeight: 720,
  files: {
    loader: 'game.loader.js',
    data: 'game.data',
    framework: 'game.framework.js',
    wasm: 'game.wasm',
    other: [],
  },
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/games', gamesRouter);
  app.use('/api/issues', issuesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('private visibility hides only the Arcade listing, not anonymous play or reporting', async () => {
  const originals = {
    gameFind: Game.find,
    gameFindOne: Game.findOne,
    gameFindById: Game.findById,
    buildFindOne: Build.findOne,
    issueCreate: Issue.create,
  };
  const originalTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  let arcadeFilter = null;
  let savedIssue = null;
  Game.find = (filter) => {
    arcadeFilter = filter;
    return query([]);
  };
  Game.findOne = () => query(privateGame);
  Game.findById = () => query({ discordWebhookUrl: '' });
  Build.findOne = () => query(activeBuild);
  Issue.create = async (body) => {
    savedIssue = { ...body };
    return { _id: new mongoose.Types.ObjectId(), ...body };
  };

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const arcadeResponse = await fetch(`${baseUrl}/api/games/arcade`);
    assert.equal(arcadeResponse.status, 200);
    assert.deepEqual((await arcadeResponse.json()).games, []);
    assert.deepEqual(arcadeFilter, { visibility: 'public' });

    for (const suffix of ['', `/${BUILD_ID}`]) {
      const playResponse = await fetch(`${baseUrl}/api/games/play/unlisted-game${suffix}`);
      assert.equal(playResponse.status, 200);
      const body = await playResponse.json();
      assert.equal(body.gameId, String(GAME_ID));
      assert.equal(body.buildId, String(BUILD_ID));
      assert.equal(body.visibility, 'private');
    }

    const issueResponse = await fetch(`${baseUrl}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Anonymous report',
        description: 'Submitted from an unlisted game',
        gameId: String(GAME_ID),
        buildId: String(BUILD_ID),
      }),
    });
    assert.equal(issueResponse.status, 201);
    assert.equal(savedIssue.title, 'Anonymous report');
    assert.equal(savedIssue.gameId, String(GAME_ID));
    assert.equal(savedIssue.buildId, String(BUILD_ID));

    // Let the fire-and-forget Discord lookup finish before restoring model stubs.
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    Game.find = originals.gameFind;
    Game.findOne = originals.gameFindOne;
    Game.findById = originals.gameFindById;
    Build.findOne = originals.buildFindOne;
    Issue.create = originals.issueCreate;
    if (originalTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalTurnstileSecret;
  }
});
