import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAddressablesLayout } from '../src/services/addressablesLayout.js';

test('Addressables layout validation accepts a catalog/hash pair under one build target', () => {
  assert.deepEqual(validateAddressablesLayout([
    { path: 'WebGL/catalog_release.json' },
    { path: 'WebGL/catalog_release.hash' },
    { path: 'WebGL/assets_0123456789abcdef0123456789abcdef.bundle' },
  ]), []);
  assert.deepEqual(validateAddressablesLayout([
    { path: 'WebGL/catalog_release.bin' },
    { path: 'WebGL/catalog_release.hash' },
    { path: 'WebGL/assets_0123456789abcdef0123456789abcdef.bundle' },
  ]), []);
});

test('Addressables layout validation reports missing catalog, hash, and build-target placement', () => {
  assert.deepEqual(validateAddressablesLayout([
    { path: 'WebGL/assets_0123456789abcdef0123456789abcdef.bundle' },
  ]).map((warning) => warning.code), ['missing_catalog']);

  assert.deepEqual(validateAddressablesLayout([
    { path: 'WebGL/catalog_release.json' },
  ]).map((warning) => warning.code), ['missing_catalog_hash']);
  assert.deepEqual(validateAddressablesLayout([
    { path: 'WebGL/catalog_release.bin' },
  ]).map((warning) => warning.code), ['missing_catalog_hash']);

  assert.deepEqual(validateAddressablesLayout([
    { path: 'catalog_release.json' },
    { path: 'catalog_release.hash' },
  ]).map((warning) => warning.code), ['missing_build_target_directory']);
});
