import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import AdmZip from 'adm-zip';

import Game from '../src/models/Game.js';
import GameArticle from '../src/models/GameArticle.js';
import GameComment from '../src/models/GameComment.js';
import Build from '../src/models/Build.js';
import { Issue } from '../src/models/Issue.js';
import GameConfig from '../src/models/GameConfig.js';
import Leaderboard from '../src/models/Leaderboard.js';
import LeaderboardScore from '../src/models/LeaderboardScore.js';
import CloudSave from '../src/models/CloudSave.js';
import Translation from '../src/models/Translation.js';
import User from '../src/models/User.js';
import AddressableContent from '../src/models/AddressableContent.js';
import gameContentRouter, { CONTENT_ROOT } from '../src/routes/gameContent.js';
import gamesRouter from '../src/routes/games.js';
import authRouter from '../src/routes/auth.js';

process.env.JWT_SECRET ||= 'addressable-content-routes-test-secret';

const GAME_ID = '64b7f1c2d4e5f6a7b8c9d0e1';
const OWNER_ID = 'owner-content-test';
const COLLABORATOR_ID = 'collaborator-content-test';
const OUTSIDER_ID = 'outsider-content-test';

const game = {
  _id: GAME_ID,
  ownerId: OWNER_ID,
  collaborators: [COLLABORATOR_ID],
};

function authToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [name, contents] of entries) zip.addFile(name, Buffer.from(contents));
  return zip.toBuffer();
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function getContentList(server, userId, { gameId = GAME_ID } = {}) {
  return fetch(`${baseUrl(server)}/api/games/${gameId}/content`, {
    headers: userId ? { Authorization: `Bearer ${authToken(userId)}` } : {},
  });
}

async function uploadContent(server, userId, zipBuffer, { gameId = GAME_ID, channel = 'live', mode } = {}) {
  const form = new FormData();
  form.append('contentZip', new Blob([zipBuffer], { type: 'application/zip' }), 'content.zip');
  const qs = mode ? `?mode=${mode}` : '';
  return fetch(`${baseUrl(server)}/api/games/${gameId}/content/${channel}${qs}`, {
    method: 'PUT',
    headers: userId ? { Authorization: `Bearer ${authToken(userId)}` } : {},
    body: form,
  });
}

async function listContentFiles(server, userId, { gameId = GAME_ID, channel = 'live', query = '' } = {}) {
  return fetch(`${baseUrl(server)}/api/games/${gameId}/content/${channel}/files${query}`, {
    headers: userId ? { Authorization: `Bearer ${authToken(userId)}` } : {},
  });
}

async function deleteContent(server, userId, { gameId = GAME_ID, channel = 'live' } = {}) {
  return fetch(`${baseUrl(server)}/api/games/${gameId}/content/${channel}`, {
    method: 'DELETE',
    headers: userId ? { Authorization: `Bearer ${authToken(userId)}` } : {},
  });
}

let contentDocs = [];

function seedContentDoc(channel, overrides = {}) {
  const doc = {
    gameId: GAME_ID,
    channel,
    fileCount: 0,
    storageBytes: 0,
    lastUploadAt: null,
    async save() { return this; },
    ...overrides,
  };
  contentDocs.push(doc);
  return doc;
}

// ── Shared setup for the gameContent router tests ──────────────────────────
// Mirrors the module-level stub-then-restore-in-test.after pattern used by
// game-auth.test.js / game-token.test.js: install the fakes once, run every
// scenario against one live server, restore in a single top-level teardown.

const contentRouteOriginals = {
  userFindById: User.findById,
  gameFind: Game.find,
  gameFindById: Game.findById,
  buildAggregate: Build.aggregate,
  contentAggregate: AddressableContent.aggregate,
  contentFind: AddressableContent.find,
  contentFindOne: AddressableContent.findOne,
  contentDeleteOne: AddressableContent.deleteOne,
};

User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
Game.find = () => ({ select: async () => [game] });
Game.findById = async (id) => (String(id) === GAME_ID ? game : null);
Build.aggregate = async () => [];
AddressableContent.aggregate = async () => [];
AddressableContent.find = (filter) => {
  const rows = contentDocs.filter((doc) => String(doc.gameId) === String(filter.gameId));
  return {
    sort: () => ({ lean: async () => rows.map((doc) => ({ ...doc })) }),
  };
};
AddressableContent.findOne = async (filter) => (
  contentDocs.find((doc) => String(doc.gameId) === String(filter.gameId) && doc.channel === filter.channel) || null
);
AddressableContent.deleteOne = async (filter) => {
  const before = contentDocs.length;
  contentDocs = contentDocs.filter((doc) => !(
    String(doc.gameId) === String(filter.gameId) && doc.channel === filter.channel
  ));
  return { deletedCount: before - contentDocs.length };
};

await fs.rm(path.join(CONTENT_ROOT, GAME_ID), { recursive: true, force: true });
const contentApp = express();
contentApp.use('/api/games', gameContentRouter);
contentApp.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
const contentServer = await listen(contentApp);

test.after(async () => {
  await close(contentServer);
  User.findById = contentRouteOriginals.userFindById;
  Game.find = contentRouteOriginals.gameFind;
  Game.findById = contentRouteOriginals.gameFindById;
  Build.aggregate = contentRouteOriginals.buildAggregate;
  AddressableContent.aggregate = contentRouteOriginals.contentAggregate;
  AddressableContent.find = contentRouteOriginals.contentFind;
  AddressableContent.findOne = contentRouteOriginals.contentFindOne;
  AddressableContent.deleteOne = contentRouteOriginals.contentDeleteOne;
  await fs.rm(path.join(CONTENT_ROOT, GAME_ID), { recursive: true, force: true });
});

test('lists an empty channel array with a well-formed defaultChannelUrl before any upload', async () => {
  const response = await getContentList(contentServer, OWNER_ID);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.channels, []);
  assert.equal(body.defaultChannel, 'live');
  const origin = (process.env.SITE_ORIGIN || 'https://arcade.codingbot.kr').replace(/\/$/, '');
  assert.equal(body.defaultChannelUrl, `${origin}/content/${GAME_ID}/live/`);
});

test('collaborators may list content; unrelated users get 404; anonymous callers get 401', async () => {
  const asCollaborator = await getContentList(contentServer, COLLABORATOR_ID);
  assert.equal(asCollaborator.status, 200);

  const asOutsider = await getContentList(contentServer, OUTSIDER_ID);
  assert.equal(asOutsider.status, 404);

  const unauthenticated = await getContentList(contentServer, undefined);
  assert.equal(unauthenticated.status, 401);
});

test('an invalid game id is rejected with 400 across all routes', async () => {
  const badGame = { gameId: 'not-a-valid-object-id' };
  assert.equal((await getContentList(contentServer, OWNER_ID, badGame)).status, 400);
  assert.equal((await uploadContent(contentServer, OWNER_ID, makeZip([['a.txt', 'a']]), badGame)).status, 400);
  assert.equal((await listContentFiles(contentServer, OWNER_ID, badGame)).status, 400);
  assert.equal((await deleteContent(contentServer, OWNER_ID, badGame)).status, 400);
});

test('an invalid channel is rejected with 400', async () => {
  // Routes lowercase the channel before validating it, so case alone (e.g.
  // "Live") is not a way to trigger this — only shapes that stay invalid
  // after lowercasing do.
  for (const channel of ['-bad', 'a'.repeat(33), 'bad_channel']) {
    assert.equal(
      (await uploadContent(contentServer, OWNER_ID, makeZip([['a.txt', 'a']]), { channel })).status,
      400,
      `expected channel "${channel}" to be rejected`,
    );
    assert.equal((await listContentFiles(contentServer, OWNER_ID, { channel })).status, 400);
    assert.equal((await deleteContent(contentServer, OWNER_ID, { channel })).status, 400);
  }
});

test('non-owners and non-collaborators receive 404, not the content of another developer\'s game', async () => {
  seedContentDoc('outsider-check');
  const upload = await uploadContent(contentServer, OUTSIDER_ID, makeZip([['a.txt', 'a']]), { channel: 'outsider-check' });
  assert.equal(upload.status, 404);
  const files = await listContentFiles(contentServer, OUTSIDER_ID, { channel: 'outsider-check' });
  assert.equal(files.status, 404);
  const del = await deleteContent(contentServer, OUTSIDER_ID, { channel: 'outsider-check' });
  assert.equal(del.status, 404);
});

test('merge preserves an existing file by default while replace removes it, recomputing stats each time', async () => {
  const channel = 'live';
  seedContentDoc(channel);
  const liveDir = path.join(CONTENT_ROOT, GAME_ID, channel);
  await fs.mkdir(liveDir, { recursive: true });
  await fs.writeFile(path.join(liveDir, 'keep.txt'), 'keep me');

  const mergeResponse = await uploadContent(contentServer, OWNER_ID, makeZip([
    ['fresh.txt', 'fresh content'],
  ]), { channel });
  assert.equal(mergeResponse.status, 200);
  const mergeBody = await mergeResponse.json();
  assert.equal(mergeBody.content.mode, 'merge');
  assert.equal(mergeBody.content.fileCount, 2);
  assert.equal(mergeBody.content.storageBytes, Buffer.byteLength('keep me') + Buffer.byteLength('fresh content'));
  const origin = (process.env.SITE_ORIGIN || 'https://arcade.codingbot.kr').replace(/\/$/, '');
  assert.equal(mergeBody.content.publicUrl, `${origin}/content/${GAME_ID}/${channel}/`);
  await assert.doesNotReject(fs.access(path.join(liveDir, 'keep.txt')));
  await assert.doesNotReject(fs.access(path.join(liveDir, 'fresh.txt')));

  const replaceResponse = await uploadContent(contentServer, OWNER_ID, makeZip([
    ['only.txt', 'only file'],
  ]), { channel, mode: 'replace' });
  assert.equal(replaceResponse.status, 200);
  const replaceBody = await replaceResponse.json();
  assert.equal(replaceBody.content.mode, 'replace');
  assert.equal(replaceBody.content.fileCount, 1);
  assert.equal(replaceBody.content.storageBytes, Buffer.byteLength('only file'));
  await assert.rejects(fs.access(path.join(liveDir, 'keep.txt')));
  await assert.rejects(fs.access(path.join(liveDir, 'fresh.txt')));
  await assert.doesNotReject(fs.access(path.join(liveDir, 'only.txt')));
});

test('an unhashed .bundle in the upload is reported back on the response', async () => {
  const channel = 'unhashed-check';
  seedContentDoc(channel);
  const response = await uploadContent(contentServer, OWNER_ID, makeZip([
    ['WebGL/assets_all.bundle', 'unhashed bundle payload'],
    ['WebGL/assets_all_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle', 'hashed bundle payload'],
  ]), { channel });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.content.unhashedBundleCount, 1);
  assert.equal(body.content.uploadedUnhashedBundleCount, 1);
});

test('layout problems are returned as warnings without failing the upload', async () => {
  const channel = 'layout-warning';
  seedContentDoc(channel);
  const misplaced = await uploadContent(contentServer, OWNER_ID, makeZip([
    ['catalog_release.json', '{}'],
    ['catalog_release.hash', 'hash'],
    ['assets_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle', 'bundle'],
  ]), { channel, mode: 'replace' });
  assert.equal(misplaced.status, 200);
  const misplacedBody = await misplaced.json();
  assert.deepEqual(misplacedBody.warnings.map((warning) => warning.code), [
    'missing_build_target_directory',
  ]);

  const valid = await uploadContent(contentServer, OWNER_ID, makeZip([
    ['ServerData/WebGL/catalog_release.json', '{}'],
    ['ServerData/WebGL/catalog_release.hash', 'hash'],
    ['ServerData/WebGL/assets_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.bundle', 'bundle'],
  ]), { channel, mode: 'replace' });
  assert.equal(valid.status, 200);
  assert.deepEqual((await valid.json()).warnings, []);
});

test('quota rejection happens before a replace changes the live content tree', async () => {
  const channel = 'quota-reject';
  const content = seedContentDoc(channel, { fileCount: 1, storageBytes: 3 });
  const liveDir = path.join(CONTENT_ROOT, GAME_ID, channel);
  await fs.mkdir(liveDir, { recursive: true });
  await fs.writeFile(path.join(liveDir, 'old.txt'), 'old');

  const originalUserFindById = User.findById;
  const originalContentAggregate = AddressableContent.aggregate;
  User.findById = () => ({
    select: async () => ({ status: 'approved', role: 'user', storageQuota: 5 }),
  });
  AddressableContent.aggregate = async () => [{ _id: null, total: 3 }];
  try {
    const response = await uploadContent(contentServer, OWNER_ID, makeZip([
      ['WebGL/new.txt', 'this is larger than the quota'],
    ]), { channel, mode: 'replace' });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Storage quota exceeded' });
    assert.equal(await fs.readFile(path.join(liveDir, 'old.txt'), 'utf8'), 'old');
    await assert.rejects(fs.access(path.join(liveDir, 'WebGL', 'new.txt')));
    assert.equal(content.storageBytes, 3);
    assert.equal(content.fileCount, 1);
  } finally {
    User.findById = originalUserFindById;
    AddressableContent.aggregate = originalContentAggregate;
  }
});

test('rejects an upload missing the contentZip field', async () => {
  const channel = 'missing-file-check';
  seedContentDoc(channel);
  const response = await fetch(`${baseUrl(contentServer)}/api/games/${GAME_ID}/content/${channel}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken(OWNER_ID)}` },
    body: new FormData(),
  });
  assert.equal(response.status, 400);
});

test('rejects an unrecognized mode value', async () => {
  const channel = 'bad-mode-check';
  seedContentDoc(channel);
  const response = await uploadContent(contentServer, OWNER_ID, makeZip([['a.txt', 'a']]), { channel, mode: 'wipe' });
  assert.equal(response.status, 400);
});

test('GET files paginates the extracted tree and enforces the inspector limit cap', async () => {
  const channel = 'file-inspector';
  seedContentDoc(channel);
  const liveDir = path.join(CONTENT_ROOT, GAME_ID, channel);
  await fs.rm(liveDir, { recursive: true, force: true });
  await fs.mkdir(liveDir, { recursive: true });
  for (const name of ['a.txt', 'b.txt', 'c.txt']) {
    await fs.writeFile(path.join(liveDir, name), name);
  }

  const firstPage = await listContentFiles(contentServer, OWNER_ID, { channel, query: '?offset=0&limit=2' });
  assert.equal(firstPage.status, 200);
  const firstBody = await firstPage.json();
  assert.deepEqual(firstBody.files.map((file) => file.path), ['a.txt', 'b.txt']);
  assert.equal(firstBody.hasMore, true);

  const secondPage = await listContentFiles(contentServer, OWNER_ID, { channel, query: '?offset=2&limit=2' });
  const secondBody = await secondPage.json();
  assert.deepEqual(secondBody.files.map((file) => file.path), ['c.txt']);
  assert.equal(secondBody.hasMore, false);

  const overCap = await listContentFiles(contentServer, OWNER_ID, { channel, query: '?limit=501' });
  assert.equal(overCap.status, 400);

  const badOffset = await listContentFiles(contentServer, OWNER_ID, { channel, query: '?offset=-1' });
  assert.equal(badOffset.status, 400);
});

test('DELETE purges the channel directory and its document', async () => {
  const channel = 'delete-check';
  seedContentDoc(channel);
  const liveDir = path.join(CONTENT_ROOT, GAME_ID, channel);
  await fs.mkdir(liveDir, { recursive: true });
  await fs.writeFile(path.join(liveDir, 'bundle.bundle'), 'payload');

  const response = await deleteContent(contentServer, OWNER_ID, { channel });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true });
  await assert.rejects(fs.access(liveDir));

  const listing = await getContentList(contentServer, OWNER_ID);
  const listingBody = await listing.json();
  assert.equal(listingBody.channels.some((row) => row.channel === channel), false);
});

test('a concurrent upload to the same channel returns 409 for the loser', async () => {
  const channel = 'race-channel';
  seedContentDoc(channel);

  // A large multi-entry archive keeps the extraction loop busy long enough
  // (many individual fs.mkdir/writeFile/stat awaits) for a second, trivial
  // upload aimed at the same channel to observe the lock as already held.
  const manyEntries = Array.from({ length: 1500 }, (_, index) => [`file-${index}.bin`, 'x']);
  const slowZip = makeZip(manyEntries);
  const fastZip = makeZip([['fast.txt', 'fast']]);

  const slowPromise = uploadContent(contentServer, OWNER_ID, slowZip, { channel });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const fastPromise = uploadContent(contentServer, OWNER_ID, fastZip, { channel });

  const [slowResponse, fastResponse] = await Promise.all([slowPromise, fastPromise]);
  const statuses = [slowResponse.status, fastResponse.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

// ── Game deletion removes its Addressables content directory ──────────────

test('game deletion is owner-only and removes all game-scoped files and records', async () => {
  const deletionGameId = '64b7f1c2d4e5f6a7b8c9d0f0';
  const deletionOwnerId = 'owner-deletion-test';
  const deletionCollaboratorId = 'collaborator-deletion-test';
  const deletionBuildId = '64b7f1c2d4e5f6a7b8c9d0f1';
  const deletionArticleId = '64b7f1c2d4e5f6a7b8c9d0f2';
  const thumbnailName = `${deletionGameId}-cover.png`;
  let gameDeleted = false;
  const gameDoc = {
    _id: deletionGameId,
    ownerId: deletionOwnerId,
    collaborators: [deletionCollaboratorId],
    thumbnailUrl: `/thumbnails/${thumbnailName}`,
    async deleteOne() { gameDeleted = true; return { deletedCount: 1 }; },
  };
  const contentDir = path.join(CONTENT_ROOT, deletionGameId);
  const buildDir = path.resolve('storage', 'builds', deletionBuildId);
  const thumbnailPath = path.resolve('storage', 'thumbnails', thumbnailName);
  await fs.rm(contentDir, { recursive: true, force: true });
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.rm(thumbnailPath, { force: true });
  await fs.mkdir(path.join(contentDir, 'live'), { recursive: true });
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
  await fs.writeFile(path.join(contentDir, 'live', 'bundle.bundle'), 'payload');
  await fs.writeFile(path.join(buildDir, 'game.wasm'), 'payload');
  await fs.writeFile(thumbnailPath, 'thumbnail');

  const app = express();
  app.use('/api/games', gamesRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await listen(app);

  const originals = {
    userFindById: User.findById,
    gameFindOne: Game.findOne,
    articleFind: GameArticle.find,
    buildFind: Build.find,
    articleDeleteMany: GameArticle.deleteMany,
    commentDeleteMany: GameComment.deleteMany,
    buildDeleteMany: Build.deleteMany,
    issueDeleteMany: Issue.deleteMany,
    contentDeleteMany: AddressableContent.deleteMany,
    configDeleteMany: GameConfig.deleteMany,
    scoreDeleteMany: LeaderboardScore.deleteMany,
    leaderboardDeleteMany: Leaderboard.deleteMany,
    saveDeleteMany: CloudSave.deleteMany,
    translationDeleteOne: Translation.deleteOne,
    translationDeleteMany: Translation.deleteMany,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
  Game.findOne = async ({ ownerId } = {}) => (ownerId === deletionOwnerId ? gameDoc : null);
  GameArticle.find = () => ({ select: () => ({ lean: async () => [{ _id: deletionArticleId }] }) });
  Build.find = () => ({ select: () => ({ lean: async () => [{ _id: deletionBuildId }] }) });
  const deletedRecords = new Set();
  GameArticle.deleteMany = async () => { deletedRecords.add('articles'); return { deletedCount: 1 }; };
  GameComment.deleteMany = async () => { deletedRecords.add('comments'); return { deletedCount: 1 }; };
  Build.deleteMany = async () => { deletedRecords.add('builds'); return { deletedCount: 1 }; };
  Issue.deleteMany = async () => { deletedRecords.add('issues'); return { deletedCount: 1 }; };
  AddressableContent.deleteMany = async () => { deletedRecords.add('content'); return { deletedCount: 1 }; };
  GameConfig.deleteMany = async () => { deletedRecords.add('configs'); return { deletedCount: 1 }; };
  LeaderboardScore.deleteMany = async () => { deletedRecords.add('scores'); return { deletedCount: 1 }; };
  Leaderboard.deleteMany = async () => { deletedRecords.add('leaderboards'); return { deletedCount: 1 }; };
  CloudSave.deleteMany = async () => { deletedRecords.add('saves'); return { deletedCount: 1 }; };
  Translation.deleteOne = async () => { deletedRecords.add('gameTranslation'); return { deletedCount: 1 }; };
  Translation.deleteMany = async () => { deletedRecords.add('articleTranslations'); return { deletedCount: 1 }; };

  try {
    const collaboratorResponse = await fetch(`${baseUrl(server)}/api/games/${deletionGameId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken(deletionCollaboratorId)}` },
    });
    assert.equal(collaboratorResponse.status, 404);
    assert.equal(gameDeleted, false);
    await assert.doesNotReject(fs.access(contentDir));
    await assert.doesNotReject(fs.access(buildDir));
    await assert.doesNotReject(fs.access(thumbnailPath));

    const response = await fetch(`${baseUrl(server)}/api/games/${deletionGameId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken(deletionOwnerId)}` },
    });
    assert.equal(response.status, 200);
    await assert.rejects(fs.access(contentDir));
    await assert.rejects(fs.access(buildDir));
    await assert.rejects(fs.access(thumbnailPath));
    assert.equal(gameDeleted, true);
    assert.deepEqual([...deletedRecords].sort(), [
      'articleTranslations',
      'articles',
      'builds',
      'comments',
      'configs',
      'content',
      'gameTranslation',
      'issues',
      'leaderboards',
      'saves',
      'scores',
    ]);
  } finally {
    await close(server);
    User.findById = originals.userFindById;
    Game.findOne = originals.gameFindOne;
    GameArticle.find = originals.articleFind;
    Build.find = originals.buildFind;
    GameArticle.deleteMany = originals.articleDeleteMany;
    GameComment.deleteMany = originals.commentDeleteMany;
    Build.deleteMany = originals.buildDeleteMany;
    Issue.deleteMany = originals.issueDeleteMany;
    AddressableContent.deleteMany = originals.contentDeleteMany;
    GameConfig.deleteMany = originals.configDeleteMany;
    LeaderboardScore.deleteMany = originals.scoreDeleteMany;
    Leaderboard.deleteMany = originals.leaderboardDeleteMany;
    CloudSave.deleteMany = originals.saveDeleteMany;
    Translation.deleteOne = originals.translationDeleteOne;
    Translation.deleteMany = originals.translationDeleteMany;
    await fs.rm(contentDir, { recursive: true, force: true });
    await fs.rm(buildDir, { recursive: true, force: true });
    await fs.rm(thumbnailPath, { force: true });
  }
});

// ── GET /api/auth/usage quota aggregation ──────────────────────────────────

test('usage sums Build and AddressableContent storageBytes across the caller\'s games', async () => {
  const app = express();
  app.use('/api/auth', authRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await listen(app);

  const originals = {
    userFindById: User.findById,
    gameFind: Game.find,
    buildAggregate: Build.aggregate,
    contentAggregate: AddressableContent.aggregate,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user', storageQuota: 700 * 1024 * 1024 }) });
  Game.find = () => ({ select: async () => [{ _id: 'game-a' }, { _id: 'game-b' }] });
  Build.aggregate = async () => [{ _id: null, total: 1_000_000 }];
  AddressableContent.aggregate = async () => [{ _id: null, total: 2_500_000 }];

  try {
    const response = await fetch(`${baseUrl(server)}/api/auth/usage`, {
      headers: { Authorization: `Bearer ${authToken('quota-user')}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.usedBytes, 3_500_000);
    assert.equal(body.quotaBytes, 700 * 1024 * 1024);
  } finally {
    await close(server);
    User.findById = originals.userFindById;
    Game.find = originals.gameFind;
    Build.aggregate = originals.buildAggregate;
    AddressableContent.aggregate = originals.contentAggregate;
  }
});

test('usage falls back to 0 used and the default quota when there is nothing to aggregate', async () => {
  const app = express();
  app.use('/api/auth', authRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await listen(app);

  const originals = {
    userFindById: User.findById,
    gameFind: Game.find,
    buildAggregate: Build.aggregate,
    contentAggregate: AddressableContent.aggregate,
  };
  User.findById = () => ({ select: async () => ({ status: 'approved', role: 'user' }) });
  Game.find = () => ({ select: async () => [] });
  Build.aggregate = async () => [];
  AddressableContent.aggregate = async () => [];

  try {
    const response = await fetch(`${baseUrl(server)}/api/auth/usage`, {
      headers: { Authorization: `Bearer ${authToken('quota-user-empty')}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.usedBytes, 0);
    assert.equal(body.quotaBytes, 500 * 1024 * 1024);
  } finally {
    await close(server);
    User.findById = originals.userFindById;
    Game.find = originals.gameFind;
    Build.aggregate = originals.buildAggregate;
    AddressableContent.aggregate = originals.contentAggregate;
  }
});
