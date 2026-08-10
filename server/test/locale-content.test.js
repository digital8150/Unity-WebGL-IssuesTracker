import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTranslation, publicTranslation, publicTranslationMeta, TRANSLATABLE, translationMeta } from '../src/services/localeContent.js';

test('mergeTranslation is a pure whitelist merge with empty-value fallback', () => {
  const source = { _id: '1', title: '한국어', summary: '원문 요약', content: '# 원문', tags: ['태그'], privateField: 'keep' };
  const row = { status: 'ready', origin: 'machine', translatedAt: '2026-08-10', noindex: false, fields: { title: 'English', summary: '', content: 'English body', tags: [] } };
  const merged = mergeTranslation(source, row, 'BlogPost');
  assert.deepEqual(merged, { ...source, title: 'English', content: 'English body' });
  assert.deepEqual(source, { _id: '1', title: '한국어', summary: '원문 요약', content: '# 원문', tags: ['태그'], privateField: 'keep' });
  assert.deepEqual(translationMeta(row), { origin: 'machine', translatedAt: '2026-08-10', noindex: false });
  assert.strictEqual(mergeTranslation(source, null, 'BlogPost'), source);
});

test('publication kill switch blocks fields and metadata for every translation type', () => {
  const row = {
    status: 'ready',
    origin: 'machine',
    translatedAt: '2026-08-10',
    noindex: false,
    fields: {
      title: 'English title',
      summary: 'English summary',
      content: 'English content',
      tags: ['English tag'],
      description: 'English description',
    },
  };

  for (const refType of Object.keys(TRANSLATABLE)) {
    const source = {
      _id: `${refType}-id`,
      title: 'Korean title',
      summary: 'Korean summary',
      content: 'Korean content',
      tags: ['Korean tag'],
      description: 'Korean description',
    };
    assert.equal(publicTranslation(row, 'en', false), null, `${refType} row must be hidden when disabled`);
    assert.equal(publicTranslationMeta(row, 'en', false), null, `${refType} metadata must be hidden when disabled`);
    assert.deepEqual(
      mergeTranslation(source, publicTranslation(row, 'en', false), refType),
      source,
      `${refType} fields must not merge when disabled`,
    );
  }
});

test('Korean requests cannot publish an English row passed directly', () => {
  const row = {
    status: 'ready',
    origin: 'machine',
    fields: { title: 'English title', description: 'English description' },
  };

  for (const refType of Object.keys(TRANSLATABLE)) {
    assert.equal(publicTranslation(row, 'ko', true), null, `${refType} row must be hidden for Korean`);
    assert.equal(publicTranslationMeta(row, 'ko', true), null, `${refType} metadata must be hidden for Korean`);
  }
});
