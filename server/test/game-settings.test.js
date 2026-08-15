import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

import Game from '../src/models/Game.js';
import User from '../src/models/User.js';
import Translation from '../src/models/Translation.js';
import gamesRouter from '../src/routes/games.js';

process.env.JWT_SECRET ||= 'game-settings-test-secret';

const ownerId = 'owner-game-settings-test';
const otherUserId = 'other-game-settings-test';
const game = {
  _id: 'game-settings-test',
  ownerId,
  name: 'Settings game',
  slug: 'settings-game',
  visibility: 'private',
  description: 'Short summary',
  longDescription: '',
  reviewInfo: {},
  async save() { return this; },
  toObject() { return { ...this }; },
};

function authToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

function approvedUser() {
  return { status: 'approved', role: 'user' };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/games', gamesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function patchGame(server, body, userId = ownerId) {
  return fetch('http://127.0.0.1:' + server.address().port + '/api/games/' + game._id, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + authToken(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('game settings persist longDescription, reject overflow, enqueue changes, and scope ownership', async () => {
  const originals = {
    userFindById: User.findById,
    gameFindOne: Game.findOne,
    translationFindOne: Translation.findOne,
    translationFindOneAndUpdate: Translation.findOneAndUpdate,
  };
  let enqueueCount = 0;
  User.findById = () => ({ select: async () => approvedUser() });
  Game.findOne = async ({ ownerId: requestedOwnerId } = {}) => (
    requestedOwnerId === ownerId ? game : null
  );
  Translation.findOne = () => ({ lean: async () => null });
  Translation.findOneAndUpdate = () => ({ lean: async () => { enqueueCount += 1; return {}; } });
  const server = await startServer();

  try {
    const saveResponse = await patchGame(server, { longDescription: '# Full game guide\n\n![Screenshot](/blog-images/game.webp)' });
    assert.equal(saveResponse.status, 200);
    assert.equal(game.longDescription, '# Full game guide\n\n![Screenshot](/blog-images/game.webp)');

    const overflowResponse = await patchGame(server, { longDescription: 'x'.repeat(20001) });
    assert.equal(overflowResponse.status, 400);
    assert.match((await overflowResponse.json()).error, /20000/);
    assert.equal(game.longDescription.length, 56);

    const summaryResponse = await patchGame(server, { description: 'Updated summary' });
    assert.equal(summaryResponse.status, 200);
    assert.equal(game.description, 'Updated summary');
    assert.equal(enqueueCount, 2);

    const forbiddenResponse = await patchGame(server, { longDescription: 'nope' }, otherUserId);
    assert.equal(forbiddenResponse.status, 404);
    assert.equal(game.longDescription, '# Full game guide\n\n![Screenshot](/blog-images/game.webp)');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originals.userFindById;
    Game.findOne = originals.gameFindOne;
    Translation.findOne = originals.translationFindOne;
    Translation.findOneAndUpdate = originals.translationFindOneAndUpdate;
  }
});
