import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';

import Game from '../src/models/Game.js';
import User from '../src/models/User.js';
import gamesRouter from '../src/routes/games.js';

process.env.JWT_SECRET ||= 'game-thumbnail-test-secret';

const game = {
  _id: 'game-thumbnail-test',
  ownerId: 'owner-thumbnail-test',
  collaborators: ['collaborator-thumbnail-test'],
  thumbnailUrl: '/thumbnails/game-thumbnail-test.png',
  async save() { return this; },
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

async function uploadThumbnail(server, contents, type = 'image/png', filename = 'thumbnail.png', userId = game.ownerId) {
  const form = new FormData();
  form.append('file', new Blob([contents], { type }), filename);
  return fetch(`http://127.0.0.1:${server.address().port}/api/games/${game._id}/thumbnail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken(userId)}` },
    body: form,
  });
}

test('thumbnail replacement versions files, removes orphans, and preserves MIME validation', async () => {
  const thumbnailRoot = path.resolve('storage', 'thumbnails');
  await fs.mkdir(thumbnailRoot, { recursive: true });
  await fs.rm(path.join(thumbnailRoot, 'game-thumbnail-test.png'), { force: true });
  await fs.rm(path.join(thumbnailRoot, 'game-thumbnail-test-orphan.webp'), { force: true });

  const originals = {
    userFindById: User.findById,
    gameFindOne: Game.findOne,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
  Game.findOne = async () => game;
  const server = await startServer();

  try {
    await fs.writeFile(path.join(thumbnailRoot, 'game-thumbnail-test.png'), 'legacy thumbnail');
    await fs.writeFile(path.join(thumbnailRoot, 'game-thumbnail-test-orphan.webp'), 'orphan thumbnail');

    const firstResponse = await uploadThumbnail(
      server,
      Buffer.from('first image'),
      'image/png',
      'thumbnail.png',
      game.collaborators[0],
    );
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    const firstUrl = firstBody.thumbnailUrl;
    assert.match(firstUrl, /^\/thumbnails\/game-thumbnail-test-[0-9a-f]{10}\.png$/);
    assert.equal(game.thumbnailUrl, firstUrl);
    await assert.rejects(fs.access(path.join(thumbnailRoot, 'game-thumbnail-test.png')));
    await assert.rejects(fs.access(path.join(thumbnailRoot, 'game-thumbnail-test-orphan.webp')));
    await assert.doesNotReject(fs.access(path.join(thumbnailRoot, path.basename(firstUrl))));

    const secondResponse = await uploadThumbnail(server, Buffer.from('second image'));
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    const secondUrl = secondBody.thumbnailUrl;
    assert.notEqual(secondUrl, firstUrl);
    assert.match(secondUrl, /^\/thumbnails\/game-thumbnail-test-[0-9a-f]{10}\.png$/);
    await assert.rejects(fs.access(path.join(thumbnailRoot, path.basename(firstUrl))));
    await assert.doesNotReject(fs.access(path.join(thumbnailRoot, path.basename(secondUrl))));

    const unsupportedResponse = await uploadThumbnail(server, Buffer.from('not an image'), 'text/plain', 'thumbnail.txt');
    assert.equal(unsupportedResponse.status, 400);
    assert.equal(game.thumbnailUrl, secondUrl);

    const deleteResponse = await fetch(
      `http://127.0.0.1:${server.address().port}/api/games/${game._id}/thumbnail`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken(game.collaborators[0])}` },
      },
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(game.thumbnailUrl, '');
    await assert.rejects(fs.access(path.join(thumbnailRoot, path.basename(secondUrl))));
    const remaining = (await fs.readdir(thumbnailRoot)).filter((name) => name.startsWith(`${game._id}`));
    assert.deepEqual(remaining, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originals.userFindById;
    Game.findOne = originals.gameFindOne;
    const entries = await fs.readdir(thumbnailRoot).catch(() => []);
    await Promise.all(entries
      .filter((name) => name.startsWith(`${game._id}`))
      .map((name) => fs.rm(path.join(thumbnailRoot, name), { force: true })));
  }
});
