import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  GAME_DEV_TOKEN_TTL_S,
  GAME_TOKEN_TTL_S,
  getGameTokenSecret,
  signGameToken,
  verifyGameToken,
  verifyGameTokenDetailed,
} from '../src/services/gameToken.js';

const originalJwtSecret = process.env.JWT_SECRET;
const originalGameTokenSecret = process.env.GAME_TOKEN_SECRET;

function restoreSecrets() {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalGameTokenSecret === undefined) delete process.env.GAME_TOKEN_SECRET;
  else process.env.GAME_TOKEN_SECRET = originalGameTokenSecret;
}

test.after(restoreSecrets);

function claimsFor(token) {
  const claims = jwt.decode(token);
  assert.ok(claims && typeof claims === 'object');
  return claims;
}

test('game tokens use a key separate from the site JWT in both directions', () => {
  process.env.JWT_SECRET = 'site-secret';
  delete process.env.GAME_TOKEN_SECRET;

  const token = signGameToken({ userId: 'user-1', gameId: 'game-1', displayName: 'Player' });
  assert.equal(verifyGameToken(token)?.typ, 'game');

  const siteSignedGameClaim = jwt.sign(
    { sub: 'user-1', gid: 'game-1', name: 'Player', dev: false, typ: 'game' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: GAME_TOKEN_TTL_S },
  );
  assert.equal(verifyGameToken(siteSignedGameClaim), null);

  assert.throws(
    () => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }),
    /invalid signature|invalid token/i,
  );
});

test('GAME_TOKEN_SECRET is a dedicated rotation key', () => {
  process.env.JWT_SECRET = 'site-secret';
  process.env.GAME_TOKEN_SECRET = 'game-key-a';
  const token = signGameToken({ userId: 'user-1', gameId: 'game-1', displayName: 'Player' });
  assert.equal(verifyGameToken(token)?.gid, 'game-1');

  process.env.GAME_TOKEN_SECRET = 'game-key-b';
  assert.equal(verifyGameToken(token), null);

  const rotated = signGameToken({ userId: 'user-1', gameId: 'game-1', displayName: 'Player' });
  assert.equal(verifyGameToken(rotated)?.gid, 'game-1');
});

test('normal and development credentials carry the expected claims and TTLs', () => {
  process.env.JWT_SECRET = 'site-secret';
  process.env.GAME_TOKEN_SECRET = 'game-secret';

  const normal = claimsFor(signGameToken({ userId: 'user-1', gameId: 'game-1', displayName: 'Player' }));
  assert.equal(normal.sub, 'user-1');
  assert.equal(normal.gid, 'game-1');
  assert.equal(normal.name, 'Player');
  assert.equal(normal.typ, 'game');
  assert.equal(normal.dev, undefined);
  assert.equal(normal.exp - normal.iat, GAME_TOKEN_TTL_S);

  const developmentTokenValue = signGameToken({
    userId: 'user-1',
    gameId: 'game-1',
    displayName: 'Developer',
    dev: true,
  });
  const development = claimsFor(developmentTokenValue);
  assert.equal(development.dev, true);
  assert.equal(development.exp - development.iat, GAME_DEV_TOKEN_TTL_S);
  assert.equal(verifyGameToken(developmentTokenValue)?.dev, true);
});

test('verification rejects wrong typ and expired credentials', () => {
  process.env.JWT_SECRET = 'site-secret';
  process.env.GAME_TOKEN_SECRET = 'game-secret';

  const wrongType = jwt.sign(
    { sub: 'user-1', gid: 'game-1', name: 'Player', dev: false, typ: 'site' },
    getGameTokenSecret(),
    { algorithm: 'HS256', expiresIn: GAME_TOKEN_TTL_S },
  );
  assert.equal(verifyGameToken(wrongType), null);

  const expired = jwt.sign(
    { sub: 'user-1', gid: 'game-1', name: 'Player', dev: false, typ: 'game' },
    getGameTokenSecret(),
    { algorithm: 'HS256', expiresIn: -1 },
  );
  assert.equal(verifyGameToken(expired), null);
  assert.equal(verifyGameTokenDetailed(expired).error?.name, 'TokenExpiredError');
});
