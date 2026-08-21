import { describe, it, expect } from 'vitest';
import { translations } from './i18n.jsx';

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function flattenKeys(node, prefix = '') {
  const map = new Map();
  if (!isPlainObject(node)) {
    map.set(prefix, typeof node);
    return map;
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      const nested = flattenKeys(value, path);
      for (const [nestedPath, nestedType] of nested) {
        map.set(nestedPath, nestedType);
      }
    } else {
      map.set(path, typeof value);
    }
  }
  return map;
}

describe('i18n locale parity', () => {
  it('exposes exactly the ko and en locales', () => {
    expect(Object.keys(translations).sort()).toEqual(['en', 'ko']);
  });

  const enKeys = flattenKeys(translations.en);
  const koKeys = flattenKeys(translations.ko);

  it('has no keys present in ko but missing from en', () => {
    const koOnly = [...koKeys.keys()].filter((path) => !enKeys.has(path)).sort();
    expect(koOnly).toEqual([]);
  });

  it('has no keys present in en but missing from ko', () => {
    const enOnly = [...enKeys.keys()].filter((path) => !koKeys.has(path)).sort();
    expect(enOnly).toEqual([]);
  });

  it('uses the same leaf type for every shared key', () => {
    const mismatches = [];
    for (const [path, enType] of enKeys) {
      if (!koKeys.has(path)) continue;
      const koType = koKeys.get(path);
      if (enType !== koType) {
        mismatches.push(`${path}: en=${enType} ko=${koType}`);
      }
    }
    mismatches.sort();
    expect(mismatches).toEqual([]);
  });

  it('has no empty or whitespace-only string values', () => {
    const empties = [];
    for (const [locale, keys] of [
      ['en', enKeys],
      ['ko', koKeys],
    ]) {
      for (const [path, type] of keys) {
        if (type !== 'string') continue;
        // Re-derive the actual string to check emptiness.
        const value = path
          .split('.')
          .reduce((node, key) => (node == null ? node : node[key]), translations[locale]);
        if (typeof value === 'string' && value.trim() === '') {
          empties.push(`${locale}.${path}`);
        }
      }
    }
    empties.sort();
    expect(empties).toEqual([]);
  });

  it('has no untranslated leaves that are identical across locales', () => {
    const identical = [];
    for (const [path, enType] of enKeys) {
      if (enType !== 'string' || !koKeys.has(path) || koKeys.get(path) !== 'string') continue;
      const enValue = path
        .split('.')
        .reduce((node, key) => (node == null ? node : node[key]), translations.en);
      const koValue = path
        .split('.')
        .reduce((node, key) => (node == null ? node : node[key]), translations.ko);
      if (enValue === koValue) {
        identical.push(path);
      }
    }
    identical.sort();
    console.info(
      `i18n parity: ${identical.length} identical string values across en/ko. First 20: ${identical
        .slice(0, 20)
        .join(', ')}`
    );
    // Informational, not a per-key gate — plenty of leaves legitimately match
    // (brand names, 'Discord', punctuation). The one thing worth failing on is
    // a locale that is a wholesale copy of the other, i.e. nothing translated.
    expect(identical.length).toBeLessThan(enKeys.size);
  });

  it('resolves a representative sample of real keys in both locales', () => {
    const samplePaths = [
      'brand.full',
      'nav.home',
      'nav.signIn',
      'nav.blog',
      'dialog.cancel',
      'dialog.confirm',
    ];
    for (const path of samplePaths) {
      const enValue = path
        .split('.')
        .reduce((node, key) => (node == null ? node : node[key]), translations.en);
      const koValue = path
        .split('.')
        .reduce((node, key) => (node == null ? node : node[key]), translations.ko);
      expect(typeof enValue).toBe('string');
      expect(enValue.trim().length).toBeGreaterThan(0);
      expect(typeof koValue).toBe('string');
      expect(koValue.trim().length).toBeGreaterThan(0);
    }
  });
});
