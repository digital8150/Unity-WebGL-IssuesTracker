import test from 'node:test';
import assert from 'node:assert/strict';
import { injectSeoHtml } from '../src/services/seo.js';

const shell = '<html lang="ko"><head><title>old</title><meta name="robots" content="noindex" /><meta property="og:locale" content="ko_KR" /><link rel="alternate" hreflang="old" href="/old" /></head><body><div id="root"></div></body></html>';
const alternates = [
  { hreflang: 'ko', href: 'https://example.test/blog/a' },
  { hreflang: 'en', href: 'https://example.test/en/blog/a' },
  { hreflang: 'x-default', href: 'https://example.test/blog/a' },
];

test('injectSeoHtml owns lang, alternates, and OpenGraph locale metadata', () => {
  const result = injectSeoHtml(shell, { title: 'English', description: 'Description', image: 'https://example.test/a.png', url: alternates[1].href, lang: 'en', alternates });
  assert.match(result, /<html lang="en">/);
  assert.equal((result.match(/rel="alternate"/g) || []).length, 3);
  assert.match(result, /property="og:locale" content="en_US"/);
  assert.match(result, /property="og:locale:alternate" content="ko_KR"/);
  const reinjected = injectSeoHtml(result, { title: 'English 2', description: 'Description', image: 'https://example.test/a.png', url: alternates[1].href, lang: 'en', alternates });
  assert.equal((reinjected.match(/rel="alternate"/g) || []).length, 3);
  assert.equal(injectSeoHtml(result, { title: 'Fallback', description: 'd', image: 'i', url: alternates[0].href, lang: 'en', alternates: null }).match(/rel="alternate"/g), null);
});
