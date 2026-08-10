// Guards `injectSeoHtml` against silent no-ops.
//
// It rewrites the built HTML shell by string replacement. Every assertion here
// is deliberately behavioural -- "the output contains the content" rather than
// "the output matches this exact wrapper" -- because the failure mode we care
// about is an edit to web/index.html that stops a marker from matching, leaving
// injection to quietly do nothing while the build still succeeds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectSeoHtml } from '../src/services/seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const SENTINEL = 'SENTINEL_SERVER_RENDERED_BODY';
const CONTENT = `<main data-test="sentinel"><h1>${SENTINEL}</h1></main>`;

function readShell() {
  return readFile(path.join(repoRoot, 'web', 'index.html'), 'utf8');
}

function baseOptions(overrides = {}) {
  return {
    title: 'Test Title',
    description: 'Test description',
    image: 'https://example.test/image.webp',
    url: 'https://example.test/some/page',
    ...overrides,
  };
}

test('server-rendered content actually lands in the output', async () => {
  const result = injectSeoHtml(await readShell(), baseOptions({ content: CONTENT }));

  assert.ok(
    result.includes(SENTINEL),
    'injectSeoHtml dropped the server-rendered body. The shell in web/index.html no longer ' +
      'contains the anchor the injection replaces, so every public page is now serving an ' +
      'empty SPA shell to crawlers.',
  );
});

test('injected content sits inside the React root container', async () => {
  const result = injectSeoHtml(await readShell(), baseOptions({ content: CONTENT }));

  const rootStart = result.indexOf('id="root"');
  assert.notEqual(rootStart, -1, 'The shell must keep an element with id="root"');
  assert.ok(
    result.indexOf(SENTINEL) > rootStart,
    'Server-rendered content must live inside #root so createRoot().render() clears it on mount. ' +
      'Content outside #root is never removed and will stay visible under the mounted app.',
  );
});

test('metadata is rewritten for an indexable page', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({ title: 'My Game — Arcade', description: 'A description.', content: CONTENT }),
  );

  assert.match(result, /<title>My Game — Arcade<\/title>/);
  assert.match(result, /<meta\s+name="robots"\s+content="index,follow"/);
  assert.match(result, /<meta\s+name="description"\s+content="A description\."/);
  assert.match(result, /<meta\s+property="og:title"\s+content="My Game — Arcade"/);
  assert.match(result, /<meta\s+property="og:url"\s+content="https:\/\/example\.test\/some\/page"/);
  assert.match(result, /<meta\s+name="twitter:title"\s+content="My Game — Arcade"/);
  assert.match(result, /<link\s+rel="canonical"\s+href="https:\/\/example\.test\/some\/page"/);

  assert.doesNotMatch(
    result,
    /content="noindex/,
    'The shell default noindex must be replaced on indexable pages.',
  );
});

test('a private page keeps noindex', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({ robots: 'noindex,follow', content: CONTENT }),
  );

  assert.match(result, /<meta\s+name="robots"\s+content="noindex,follow"/);
  assert.doesNotMatch(result, /content="index,follow"/);
});

test('JSON-LD is injected and cannot break out of its script tag', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({
      content: CONTENT,
      jsonLd: { '@context': 'https://schema.org', '@type': 'VideoGame', name: '</script><img>' },
    }),
  );

  assert.match(result, /<script type="application\/ld\+json">/);
  assert.match(result, /"@type":"VideoGame"/);
  assert.ok(
    !result.includes('</script><img>'),
    'A "<" inside JSON-LD must be escaped to \\u003c or a crafted game name can inject markup.',
  );
});

test('the JSON-LD placeholder is consumed even when a page has no structured data', async () => {
  const result = injectSeoHtml(await readShell(), baseOptions({ content: CONTENT }));

  assert.ok(
    !result.includes('<!-- SEO_JSON_LD -->'),
    'The SEO_JSON_LD marker must be replaced (with an empty string when jsonLd is null), ' +
      'otherwise the marker is stale and future JSON-LD injection will silently no-op.',
  );
});

test('HTML-significant characters in metadata are escaped', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({ title: 'Quote " and <tag>', description: 'Ampersand & angle <', content: CONTENT }),
  );

  assert.ok(!/<title>[^<]*<tag>/.test(result), 'Title must be HTML-escaped');
  assert.ok(
    !/content="[^"]*"[^"]*"/.test(result.match(/<meta\s+name="description"[^>]*>/)?.[0] ?? ''),
    'A quote in the description must not terminate the content attribute early',
  );
});

test('omitting content leaves the shell renderable', async () => {
  const shell = await readShell();
  const result = injectSeoHtml(shell, baseOptions());

  assert.ok(result.includes('id="root"'), 'The React mount point must survive injection');
  assert.ok(result.includes('src="/src/main.jsx"') || result.includes('.js"'),
    'The module script tag must survive injection');
});
