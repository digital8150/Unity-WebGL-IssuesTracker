import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import express from 'express';

import Game from '../src/models/Game.js';
import User from '../src/models/User.js';
import Leaderboard from '../src/models/Leaderboard.js';
import GameConfig from '../src/models/GameConfig.js';
import backendRouter from '../src/routes/backend.js';
import { generateArcadeSdk } from '../src/services/codegen.js';

process.env.JWT_SECRET ||= 'v2-codegen-site-secret';

const sdkSourceReady = fs.existsSync(new URL('../../unity/Assets/Scripts/ArcadeSdk.cs', import.meta.url));

function query(value) {
  const chain = {
    select() {
      return chain;
    },
    sort() {
      return chain;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return chain;
}

function siteToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/games', backendRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, path, token) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const requestObject = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: raw ? JSON.parse(raw) : null,
      }));
    });
    requestObject.on('error', reject);
    requestObject.end();
  });
}

test('generateArcadeSdk serves both static files with origin substitution and examples', { skip: !sdkSourceReady && 'ArcadeSdk.cs is supplied by the Unity SDK worker' }, () => {
  const previousOrigin = process.env.SITE_ORIGIN;
  process.env.SITE_ORIGIN = 'https://sdk.example.test';
  try {
    const generated = generateArcadeSdk(
      { serverBackend: { cloudSaveEnabled: true } },
      {
        leaderboards: [{ key: 'weekly' }],
        config: [{ key: 'balance.json' }],
        locale: 'en',
      },
    );

    assert.deepEqual(generated.files.map((file) => file.filename), ['ArcadeSdk.cs', 'ArcadeSdk.jslib']);
    const csharp = generated.files.find((file) => file.filename === 'ArcadeSdk.cs').code;
    const jslib = generated.files.find((file) => file.filename === 'ArcadeSdk.jslib').code;
    assert.match(csharp, /ApiBaseUrl\s*=\s*"https:\/\/sdk\.example\.test"/);
    assert.doesNotMatch(csharp, /Xor|XOR|Obfuscat/);
    assert.match(jslib, /ArcadeSdk_Ready/);
    assert.match(jslib, /ArcadeSdk_RequestToken/);
    assert.doesNotMatch(JSON.stringify(generated), /Xor|XOR|Obfuscat/);
    assert.ok(generated.docs.some((doc) => doc.snippet.includes('weekly')));
    assert.ok(generated.docs.some((doc) => doc.snippet.includes('balance.json')));
    assert.ok(generated.docs.some((doc) => doc.snippet.includes('SaveData("main"')));

    const korean = generateArcadeSdk(
      { serverBackend: { cloudSaveEnabled: true } },
      {
        leaderboards: [{ key: 'weekly' }],
        config: [{ key: 'balance.json' }],
        locale: 'ko',
      },
    );
    assert.equal(korean.docs[0].title, 'SDK 초기화');
    assert.match(korean.docs[0].body, /GameObject/);
    assert.match(korean.docs[0].snippet, /로그인 사용자/);
    assert.ok(korean.docs.some((doc) => doc.title === '점수 제출'));
    assert.ok(korean.docs.some((doc) => doc.title === '게임 설정 읽기'));
  } finally {
    if (previousOrigin === undefined) delete process.env.SITE_ORIGIN;
    else process.env.SITE_ORIGIN = previousOrigin;
  }
});

test('generated-sdk delivery is limited to authorized game managers', { skip: !sdkSourceReady && 'ArcadeSdk.cs is supplied by the Unity SDK worker' }, async (t) => {
  const originalGameFindById = Game.findById;
  const originalUserFindById = User.findById;
  const originalLeaderboardFind = Leaderboard.find;
  const originalConfigFind = GameConfig.find;
  const game = {
    _id: 'game-a',
    ownerId: 'owner',
    collaborators: ['collaborator'],
    serverBackend: { v2Enabled: true, cloudSaveEnabled: true },
  };
  const users = new Map([
    ['owner', { _id: 'owner', status: 'approved', role: 'user', name: 'Owner' }],
    ['collaborator', { _id: 'collaborator', status: 'approved', role: 'user', name: 'Collaborator' }],
    ['outsider', { _id: 'outsider', status: 'approved', role: 'user', name: 'Outsider' }],
  ]);

  Game.findById = (id) => query(String(id) === game._id ? game : null);
  User.findById = (id) => query(users.get(String(id)) ?? null);
  Leaderboard.find = (filter) => query(filter.gameId === game._id && filter.enabled ? [{ key: 'weekly' }] : []);
  GameConfig.find = (filter) => query(filter.gameId === game._id && filter.enabled ? [{ key: 'balance.json' }] : []);

  t.after(() => {
    Game.findById = originalGameFindById;
    User.findById = originalUserFindById;
    Leaderboard.find = originalLeaderboardFind;
    GameConfig.find = originalConfigFind;
  });

  const server = await startServer();
  t.after(() => server.close());

  const owner = await request(server, '/api/games/game-a/backend/generated-sdk', siteToken('owner'));
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.body.files.map((file) => file.filename), ['ArcadeSdk.cs', 'ArcadeSdk.jslib']);

  const korean = await request(server, '/api/games/game-a/backend/generated-sdk?locale=ko', siteToken('owner'));
  assert.equal(korean.status, 200);
  assert.equal(korean.body.docs[0].title, 'SDK 초기화');

  const english = await request(server, '/api/games/game-a/backend/generated-sdk?locale=en', siteToken('owner'));
  assert.equal(english.status, 200);
  assert.equal(english.body.docs[0].title, 'Initialize the SDK');

  const collaborator = await request(server, '/api/games/game-a/backend/generated-sdk', siteToken('collaborator'));
  assert.equal(collaborator.status, 200);

  const outsider = await request(server, '/api/games/game-a/backend/generated-sdk', siteToken('outsider'));
  assert.equal(outsider.status, 404);
});
