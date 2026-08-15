import test from 'node:test';
import assert from 'node:assert/strict';

import { toPublicPlayGame } from '../src/services/publicData.js';

test('toPublicPlayGame mirrors SDK v2 flags without exposing backend settings', () => {
  const result = toPublicPlayGame({
    _id: 'game-id',
    name: 'Public game',
    slug: 'public-game',
    description: 'Description',
    longDescription: '# Long description',
    thumbnailUrl: '/thumbnails/game.webp',
    visibility: 'public',
    ownerId: { _id: 'owner-id', name: 'Developer', email: 'private@example.com' },
    discordWebhookUrl: 'https://discord.example/private',
    serverBackend: {
      secret: 'backend-secret',
      v2Enabled: true,
      cloudSaveEnabled: false,
    },
  });

  assert.deepEqual(result.sdkV2, { enabled: true, cloudSaveEnabled: false });
  assert.equal(result.longDescription, '# Long description');
  assert.equal('serverBackend' in result, false);
  assert.equal('secret' in result, false);
  assert.equal('discordWebhookUrl' in result, false);
  assert.equal('email' in result, false);
});
