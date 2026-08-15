import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import Game from '../src/models/Game.js';
import GameComment from '../src/models/GameComment.js';
import User from '../src/models/User.js';
import gamesRouter from '../src/routes/games.js';
import { query } from './helpers/fake-models.js';

process.env.JWT_SECRET ||= 'game-comments-test-secret';

const GAME_ID = new mongoose.Types.ObjectId();
const OWNER_ID = new mongoose.Types.ObjectId();
const AUTHOR_ID = new mongoose.Types.ObjectId();
const STRANGER_ID = new mongoose.Types.ObjectId();

function authToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET);
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

function url(server, suffix) {
  return `http://127.0.0.1:${server.address().port}/api/games/play/demo${suffix}`;
}

/** Swaps the Mongoose statics the routes touch and restores them afterwards. */
async function withStubs(stubs, run) {
  const originals = new Map();
  for (const [model, methods] of stubs) {
    for (const [name, value] of Object.entries(methods)) {
      originals.set(`${model.modelName}.${name}`, [model, name, model[name]]);
      model[name] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [, [model, name, original]] of originals) model[name] = original;
  }
}

const gameDoc = { _id: GAME_ID, ownerId: OWNER_ID, collaborators: [], slug: 'demo' };

test('lists game comments newest first with a paging cursor', async () => {
  const rows = [
    { _id: 'c1', gameId: GAME_ID, body: 'newer', authorName: 'Guest', createdAt: new Date('2026-08-02') },
    { _id: 'c2', gameId: GAME_ID, body: 'older', authorName: 'Guest', createdAt: new Date('2026-08-01') },
  ];
  const server = await startServer();
  try {
    await withStubs([
      [Game, { findOne: () => query(gameDoc) }],
      [GameComment, {
        find: () => query(rows),
        countDocuments: async () => rows.length,
      }],
    ], async () => {
      const res = await fetch(url(server, '/comments'));
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.total, 2);
      assert.equal(data.hasMore, false);
      assert.deepEqual(data.comments.map((c) => c.body), ['newer', 'older']);
    });
  } finally {
    server.close();
  }
});

test('rejects an empty body and a body over the length cap', async () => {
  const server = await startServer();
  try {
    await withStubs([[Game, { findOne: () => query(gameDoc) }]], async () => {
      const empty = await fetch(url(server, '/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '   ' }),
      });
      assert.equal(empty.status, 400);

      const tooLong = await fetch(url(server, '/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'x'.repeat(2001) }),
      });
      assert.equal(tooLong.status, 400);
    });
  } finally {
    server.close();
  }
});

test('a guest comment stores the supplied name and a signed-in one does not', async () => {
  const server = await startServer();
  const created = [];
  try {
    await withStubs([
      [Game, { findOne: () => query(gameDoc) }],
      [GameComment, {
        countDocuments: async () => 0,
        create: async (doc) => { created.push(doc); return { ...doc, _id: 'new-comment' }; },
      }],
      [User, { findById: () => ({ select: () => ({ lean: async () => ({ role: 'user' }) }) }) }],
    ], async () => {
      const guest = await fetch(url(server, '/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'hi', authorName: '  Tester  ' }),
      });
      assert.equal(guest.status, 201);
      assert.equal(created[0].authorName, 'Tester');
      assert.equal(created[0].authorId, null);

      const member = await fetch(url(server, '/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken(AUTHOR_ID)}` },
        body: JSON.stringify({ body: 'hi', authorName: 'spoofed' }),
      });
      assert.equal(member.status, 201);
      // A signed-in author is resolved from authorId, so no name is stored.
      assert.equal(created[1].authorName, undefined);
      assert.equal(String(created[1].authorId), String(AUTHOR_ID));
    });
  } finally {
    server.close();
  }
});

test('refuses new comments once the per-game cap is reached', async () => {
  const server = await startServer();
  try {
    await withStubs([
      [Game, { findOne: () => query(gameDoc) }],
      [GameComment, { countDocuments: async () => 500, create: async () => assert.fail('should not create') }],
    ], async () => {
      const res = await fetch(url(server, '/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'over the line' }),
      });
      assert.equal(res.status, 409);
    });
  } finally {
    server.close();
  }
});

test('deletion is allowed for the author and the game owner but not a stranger', async () => {
  const server = await startServer();
  const commentId = new mongoose.Types.ObjectId();

  async function attempt(userId, { role = 'user' } = {}) {
    let deleted = false;
    const comment = {
      _id: commentId,
      gameId: GAME_ID,
      authorId: AUTHOR_ID,
      async deleteOne() { deleted = true; },
    };
    const status = await withStubs([
      [Game, { findOne: () => query(gameDoc) }],
      [GameComment, { findOne: () => query(comment) }],
      // Real tokens carry no role claim, so isAdminUser() reads the User
      // collection; that path needs a connection it cannot get here.
      [User, {
        db: { readyState: 1 },
        findById: () => ({ select: () => ({ lean: async () => ({ role }) }) }),
      }],
    ], async () => {
      const res = await fetch(url(server, `/comments/${commentId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken(userId)}` },
      });
      return res.status;
    });
    return { status, deleted };
  }

  try {
    assert.deepEqual(await attempt(AUTHOR_ID), { status: 200, deleted: true });
    assert.deepEqual(await attempt(OWNER_ID), { status: 200, deleted: true });
    assert.deepEqual(await attempt(STRANGER_ID), { status: 403, deleted: false });
    assert.deepEqual(await attempt(STRANGER_ID, { role: 'admin' }), { status: 200, deleted: true });
  } finally {
    server.close();
  }
});

test('a comment route is not swallowed by the build-id play route', async () => {
  const server = await startServer();
  try {
    await withStubs([
      [Game, { findOne: () => query(null) }],
    ], async () => {
      const res = await fetch(url(server, '/comments'));
      // 404 from the comments handler, not a build lookup.
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, 'Game not found');
    });
  } finally {
    server.close();
  }
});
