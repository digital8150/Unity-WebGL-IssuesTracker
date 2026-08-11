import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  clearGameAuthCache,
  MAX_CONTENT_LENGTH,
  requireGameToken,
} from '../src/middleware/gameAuth.js';
import { getGameTokenSecret, signGameToken } from '../src/services/gameToken.js';

const originalJwtSecret = process.env.JWT_SECRET;
const originalGameTokenSecret = process.env.GAME_TOKEN_SECRET;
process.env.JWT_SECRET = 'site-secret-for-game-auth-tests';
process.env.GAME_TOKEN_SECRET = 'game-secret-for-game-auth-tests';

function restoreSecrets() {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalGameTokenSecret === undefined) delete process.env.GAME_TOKEN_SECRET;
  else process.env.GAME_TOKEN_SECRET = originalGameTokenSecret;
}

function token({ userId = 'user-1', gameId = 'game-1', displayName = 'Player', dev = false } = {}) {
  return signGameToken({ userId, gameId, displayName, dev });
}

function query(value, onSelect) {
  const pending = Promise.resolve(value);
  pending.select = (fields) => {
    onSelect?.(fields);
    return pending;
  };
  return pending;
}

function userModel(getUser) {
  const model = {
    calls: [],
    selected: [],
    findById(id) {
      model.calls.push(id);
      return query(getUser(id), (fields) => model.selected.push(fields));
    },
  };
  return model;
}

function gameModel(getGame) {
  const model = {
    calls: [],
    selected: [],
    findById(id) {
      model.calls.push(id);
      return query(getGame(id), (fields) => model.selected.push(fields));
    },
  };
  return model;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function run(middleware, overrides = {}) {
  const req = {
    headers: {},
    params: { gameSlug: 'request-param-must-not-be-trusted' },
    ...overrides,
  };
  const res = response();
  let nextCalled = false;
  let nextError = null;
  await middleware(req, res, (error) => {
    nextCalled = true;
    nextError = error || null;
  });
  return { req, res, nextCalled, nextError };
}

test.after(() => {
  clearGameAuthCache();
  restoreSecrets();
});

test('Bearer parsing authenticates pending members and trusts user/game ids from the token', async () => {
  const user = userModel((id) => id === 'user-from-token' ? { status: 'pending' } : null);
  const game = gameModel(() => ({ serverBackend: {} }));
  const middleware = requireGameToken({ models: { User: user, Game: game } });

  const result = await run(middleware, {
    headers: { authorization: `Bearer ${token({ userId: 'user-from-token', gameId: 'game-from-token' })}` },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, null);
  assert.equal(result.req.gameToken.sub, 'user-from-token');
  assert.equal(result.req.gameToken.gid, 'game-from-token');
  assert.deepEqual(user.calls, ['user-from-token']);
  assert.deepEqual(user.selected, ['status']);
  assert.deepEqual(game.calls, []);
});

test('rejected users are blocked and read checks use a 30-second status cache', async () => {
  let currentStatus = 'rejected';
  const user = userModel(() => ({ status: currentStatus }));
  const game = gameModel(() => ({ serverBackend: {} }));
  clearGameAuthCache(user);
  const middleware = requireGameToken({ models: { User: user, Game: game } });
  const headers = { authorization: `Bearer ${token()}` };

  const first = await run(middleware, { headers });
  assert.equal(first.res.statusCode, 403);
  assert.equal(first.res.body.code, 'account_rejected');

  currentStatus = 'approved';
  const second = await run(middleware, { headers });
  assert.equal(second.res.statusCode, 403);
  assert.equal(user.calls.length, 1);
});

test('write checks read live user status instead of using the read cache', async () => {
  let currentStatus = 'rejected';
  const user = userModel(() => ({ status: currentStatus }));
  const game = gameModel(() => ({ serverBackend: {} }));
  clearGameAuthCache(user);
  const middleware = requireGameToken({ write: true, models: { User: user, Game: game } });
  const headers = { authorization: `Bearer ${token()}` };

  const first = await run(middleware, { headers });
  assert.equal(first.res.statusCode, 403);

  currentStatus = 'approved';
  const second = await run(middleware, { headers });
  assert.equal(second.nextCalled, true);
  assert.equal(user.calls.length, 2);
});

test('development tokens honor the game v2DevTokenIssuedAt kill switch', async () => {
  const developmentToken = token({ dev: true, userId: 'developer', gameId: 'game-from-token' });
  const decoded = jwt.decode(developmentToken);
  const user = userModel(() => ({ status: 'approved' }));
  const game = gameModel((id) => id === 'game-from-token'
    ? { serverBackend: { v2DevTokenIssuedAt: new Date((decoded.iat + 1) * 1000) } }
    : null);
  clearGameAuthCache(user);
  const middleware = requireGameToken({ models: { User: user, Game: game } });

  const revoked = await run(middleware, {
    headers: { authorization: `Bearer ${developmentToken}` },
  });
  assert.equal(revoked.res.statusCode, 401);
  assert.equal(revoked.res.body.code, 'token_revoked');
  assert.deepEqual(game.calls, ['game-from-token']);

  const validGame = gameModel(() => ({ serverBackend: { v2DevTokenIssuedAt: new Date((decoded.iat - 1) * 1000) } }));
  clearGameAuthCache(user);
  const validMiddleware = requireGameToken({ models: { User: user, Game: validGame } });
  const valid = await run(validMiddleware, {
    headers: { authorization: `Bearer ${developmentToken}` },
  });
  assert.equal(valid.nextCalled, true);
  assert.deepEqual(validGame.calls, ['game-from-token']);
});

test('regular tokens do not perform the dev game lookup', async () => {
  const user = userModel(() => ({ status: 'approved' }));
  const game = gameModel(() => { throw new Error('regular tokens must not query Game'); });
  clearGameAuthCache(user);
  const middleware = requireGameToken({ models: { User: user, Game: game } });

  const result = await run(middleware, { headers: { authorization: `Bearer ${token()}` } });
  assert.equal(result.nextCalled, true);
  assert.equal(game.calls.length, 0);
});

test('expired credentials return the refreshable token_expired code', async () => {
  const expired = jwt.sign(
    { sub: 'user-1', gid: 'game-1', name: 'Player', dev: false, typ: 'game' },
    getGameTokenSecret(),
    { algorithm: 'HS256', expiresIn: -1 },
  );
  const user = userModel(() => ({ status: 'approved' }));
  clearGameAuthCache(user);
  const middleware = requireGameToken({ models: { User: user, Game: gameModel(() => null) } });

  const result = await run(middleware, { headers: { authorization: `Bearer ${expired}` } });
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.body.code, 'token_expired');
  assert.equal(user.calls.length, 0);
});

test('missing or malformed Bearer credentials are rejected', async () => {
  const user = userModel(() => ({ status: 'approved' }));
  const middleware = requireGameToken({ models: { User: user, Game: gameModel(() => null) } });

  for (const authorization of [undefined, 'Basic token', 'Bearer']) {
    const headers = authorization === undefined ? {} : { authorization };
    const result = await run(middleware, { headers });
    assert.equal(result.res.statusCode, 401);
  }
});

test('Content-Length above 2 MiB is rejected before authentication', async () => {
  const user = userModel(() => ({ status: 'approved' }));
  const middleware = requireGameToken({ models: { User: user, Game: gameModel(() => null) } });

  const result = await run(middleware, {
    headers: {
      'content-length': String(MAX_CONTENT_LENGTH + 1),
      authorization: `Bearer ${token()}`,
    },
  });
  assert.equal(result.res.statusCode, 413);
  assert.equal(result.res.body.code, 'payload_too_large');
  assert.equal(user.calls.length, 0);
});
