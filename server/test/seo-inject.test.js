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

test('metadata is rewritten for an indexable page', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({ title: 'My Game — Arcade', description: 'A description.' }),
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
    baseOptions({ robots: 'noindex,follow' }),
  );

  assert.match(result, /<meta\s+name="robots"\s+content="noindex,follow"/);
  assert.doesNotMatch(result, /content="index,follow"/);
});

test('JSON-LD is injected and cannot break out of its script tag', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({
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

test('bootstrap JSON is injected before #root and cannot break out of its script tag', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({
      bootstrap: {
        route: '/blog/:slug',
        url: '/blog/example',
        data: { post: { title: '</script><img src=x>' } },
      },
    }),
  );
  const match = result.match(/<script type="application\/json" id="__SSR_DATA__">([\s\S]*?)<\/script>/);

  assert.ok(match, 'injectSeoHtml must emit the bootstrap script when bootstrap data is provided');
  assert.doesNotMatch(match[1], /</, 'Bootstrap JSON must escape < before it enters an HTML script tag');
  assert.deepEqual(JSON.parse(match[1]).data.post, { title: '</script><img src=x>' });
  assert.ok(
    result.indexOf(match[0]) < result.indexOf('id="root"'),
    'Bootstrap data must be outside #root so createRoot does not remove it before the page reads it',
  );
});

test('visible SEO preview is injected inside #root without hiding its text', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({
      preview: {
        title: 'Preview title',
        summary: 'Preview summary',
        body: '# Body heading\n\nBody **text**',
      },
    }),
  );
  const match = result.match(/<div id="seo-preview">([\s\S]*?<\/article><\/main><\/div>)/);

  assert.ok(match, 'injectSeoHtml must emit a visible preview when preview data is provided');
  assert.match(match[1], /<h1>Preview title<\/h1>/);
  assert.match(match[1], /Preview summary/);
  assert.match(match[1], /Body text/);
  assert.doesNotMatch(match[1], /aria-hidden|color:\s*transparent|opacity:\s*0/);
  assert.match(result, /<div id="root" data-seo-preview="true">/);
});

test('omitting bootstrap leaves no bootstrap script in the shell', async () => {
  const result = injectSeoHtml(await readShell(), baseOptions());

  assert.doesNotMatch(result, /id="__SSR_DATA__"/);
});

test('the JSON-LD placeholder is consumed even when a page has no structured data', async () => {
  const result = injectSeoHtml(await readShell(), baseOptions());

  assert.ok(
    !result.includes('<!-- SEO_JSON_LD -->'),
    'The SEO_JSON_LD marker must be replaced (with an empty string when jsonLd is null), ' +
      'otherwise the marker is stale and future JSON-LD injection will silently no-op.',
  );
});

test('HTML-significant characters in metadata are escaped', async () => {
  const result = injectSeoHtml(
    await readShell(),
    baseOptions({ title: 'Quote " and <tag>', description: 'Ampersand & angle <' }),
  );

  assert.ok(!/<title>[^<]*<tag>/.test(result), 'Title must be HTML-escaped');
  assert.ok(
    !/content="[^"]*"[^"]*"/.test(result.match(/<meta\s+name="description"[^>]*>/)?.[0] ?? ''),
    'A quote in the description must not terminate the content attribute early',
  );
});

test('omitting bootstrap leaves the shell renderable', async () => {
  const shell = await readShell();
  const result = injectSeoHtml(shell, baseOptions());

  assert.ok(result.includes('id="root"'), 'The React mount point must survive injection');
  assert.ok(result.includes('src="/src/main.jsx"') || result.includes('.js"'),
    'The module script tag must survive injection');
});
