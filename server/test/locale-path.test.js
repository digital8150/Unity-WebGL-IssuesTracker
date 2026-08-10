import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalizedPath, resolveLang, stripLocale, withLocale } from '../../web/src/i18n/localePath.js';

test('locale path helpers keep public routes URL-deterministic', () => {
  assert.equal(withLocale('/', 'en'), '/en');
  assert.equal(withLocale('/en/blog/post?x=1', 'ko'), '/blog/post?x=1');
  assert.deepEqual(stripLocale('/en/blog/post'), { path: '/blog/post', locale: 'en' });
  assert.equal(isLocalizedPath('/dashboard'), false);
  assert.equal(resolveLang('/blog/post', 'en'), 'ko');
  assert.equal(resolveLang('/en/blog/post', 'ko'), 'en');
  assert.equal(resolveLang('/dashboard', 'en'), 'en');
});

test('i18n initialization cannot use the browser language for localized public routes', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = await readFile(path.resolve(here, '../../web/src/i18n.jsx'), 'utf8');
  assert.doesNotMatch(source, /navigator\.language/);
  assert.match(source, /resolveLang\(window\.location\.pathname/);
});
