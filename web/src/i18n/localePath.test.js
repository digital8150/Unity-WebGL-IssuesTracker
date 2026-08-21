import { describe, it, expect } from 'vitest';
import {
  LOCALE_PREFIX,
  stripLocale,
  isLocalizedPath,
  withLocale,
  resolveLang,
} from './localePath.js';

describe('stripLocale', () => {
  it('strips a bare /en path', () => {
    expect(stripLocale('/en')).toEqual({ path: '/', locale: 'en' });
  });

  it('strips /en prefix from a nested path', () => {
    expect(stripLocale('/en/blog')).toEqual({ path: '/blog', locale: 'en' });
  });

  it('leaves a non-prefixed path as ko', () => {
    expect(stripLocale('/blog')).toEqual({ path: '/blog', locale: 'ko' });
  });

  it('treats root path as ko', () => {
    expect(stripLocale('/')).toEqual({ path: '/', locale: 'ko' });
  });

  it('preserves query and hash', () => {
    expect(stripLocale('/en/blog?page=2#top')).toEqual({ path: '/blog?page=2#top', locale: 'en' });
  });

  it('does not treat a path merely starting with "en" as English', () => {
    expect(stripLocale('/english')).toEqual({ path: '/english', locale: 'ko' });
    expect(stripLocale('/enterprise')).toEqual({ path: '/enterprise', locale: 'ko' });
  });

  it('defaults undefined, null, and empty string to root ko', () => {
    expect(stripLocale(undefined)).toEqual({ path: '/', locale: 'ko' });
    expect(stripLocale(null)).toEqual({ path: '/', locale: 'ko' });
    expect(stripLocale('')).toEqual({ path: '/', locale: 'ko' });
  });
});

describe('isLocalizedPath', () => {
  it('returns true for each known localized route', () => {
    const routes = [
      '/',
      '/arcade',
      '/privacy',
      '/privacy/2025-01-01',
      '/blog',
      '/blog/my-post',
      '/play/tetris',
      '/play/tetris/build123',
      '/play/tetris/articles',
      '/play/tetris/articles/how-to',
    ];
    routes.forEach((route) => {
      expect(isLocalizedPath(route)).toBe(true);
    });
  });

  it('returns true for the /en-prefixed form of a localized route', () => {
    expect(isLocalizedPath('/en/blog/my-post')).toBe(true);
    expect(isLocalizedPath('/en')).toBe(true);
  });

  it('returns false for non-localized or malformed routes', () => {
    expect(isLocalizedPath('/dashboard')).toBe(false);
    expect(isLocalizedPath('/login')).toBe(false);
    expect(isLocalizedPath('/dashboard/games/1')).toBe(false);
    expect(isLocalizedPath('/blog/a/b/c')).toBe(false);
  });

  it('ignores trailing slashes', () => {
    expect(isLocalizedPath('/arcade/')).toBe(true);
  });

  it('ignores query strings when matching', () => {
    expect(isLocalizedPath('/blog?page=2')).toBe(true);
  });
});

describe('withLocale', () => {
  it('adds the /en prefix for en', () => {
    expect(withLocale('/blog', 'en')).toBe('/en/blog');
  });

  it('adds bare /en prefix for root path', () => {
    expect(withLocale('/', 'en')).toBe('/en');
  });

  it('leaves ko paths unprefixed', () => {
    expect(withLocale('/blog', 'ko')).toBe('/blog');
  });

  it('strips an existing /en prefix when target is ko', () => {
    expect(withLocale('/en/blog', 'ko')).toBe('/blog');
  });

  it('is idempotent and does not double-prefix for en', () => {
    expect(withLocale('/en/blog', 'en')).toBe('/en/blog');
    expect(withLocale(withLocale('/blog', 'en'), 'en')).toBe('/en/blog');
  });

  it('defaults to ko when lang is omitted, and treats unknown langs as ko', () => {
    expect(withLocale('/blog')).toBe('/blog');
    expect(withLocale('/blog', 'fr')).toBe('/blog');
    expect(withLocale('/blog', undefined)).toBe('/blog');
  });

  it('preserves query and hash', () => {
    expect(withLocale('/blog?page=2#top', 'en')).toBe('/en/blog?page=2#top');
  });
});

describe('resolveLang', () => {
  it('resolves to en when the URL carries the /en prefix, regardless of storedPref', () => {
    expect(resolveLang('/en/blog', 'ko')).toBe('en');
    expect(resolveLang('/en', 'ko')).toBe('en');
  });

  it('resolves a localized non-prefixed route to ko even when storedPref is en', () => {
    expect(resolveLang('/arcade', 'en')).toBe('ko');
  });

  it('falls back to storedPref for a non-localized route', () => {
    expect(resolveLang('/dashboard', 'en')).toBe('en');
    expect(resolveLang('/dashboard', 'ko')).toBe('ko');
  });

  it('falls back to ko for a non-localized route with an invalid storedPref', () => {
    expect(resolveLang('/dashboard', null)).toBe('ko');
    expect(resolveLang('/dashboard', 'fr')).toBe('ko');
    expect(resolveLang('/dashboard', undefined)).toBe('ko');
  });
});

describe('LOCALE_PREFIX', () => {
  it('is frozen and holds the expected prefix map', () => {
    expect(Object.isFrozen(LOCALE_PREFIX)).toBe(true);
    expect(LOCALE_PREFIX).toEqual({ ko: '', en: '/en' });
  });
});
