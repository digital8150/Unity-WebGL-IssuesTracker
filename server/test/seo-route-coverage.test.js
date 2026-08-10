// Guards the SEO layer against silent omission.
//
// `server/src/routes/seo.js` keeps a hand-maintained list of server-rendered
// public routes that runs in parallel with the client route table in
// `web/src/main.jsx`. Nothing links the two, and `web/index.html` ships
// `robots: noindex` by default -- so a new public route that nobody adds to
// seo.js is deployed noindex and missing from sitemap.xml, silently.
//
// These tests fail loudly when the two lists drift apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const CLIENT_ENTRY = path.join(repoRoot, 'web', 'src', 'main.jsx');
const SEO_ROUTES = path.join(repoRoot, 'server', 'src', 'routes', 'seo.js');

// Public routes that are deliberately not server-rendered. Every entry needs a
// reason -- if you are adding one, make sure "not indexed" is actually intended.
const NOT_INDEXED_BY_DESIGN = new Map([
  ['/play', 'Bare /play has no game bound to it; not a canonical URL.'],
  ['*', 'Client-side catch-all that redirects to /.'],
]);

// Non-page handlers in seo.js that have no counterpart in the client router.
const NON_PAGE_SEO_ROUTES = new Set(['/robots.txt', '/sitemap.xml']);

/** Collapses `:gameSlug`, `:slug`, ... to `:param` so both route tables compare equal. */
function normalize(routePath) {
  return routePath.replace(/:[A-Za-z0-9_]+/g, ':param');
}

function matchAll(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

async function readSources() {
  const [clientSource, seoSource] = await Promise.all([
    readFile(CLIENT_ENTRY, 'utf8'),
    readFile(SEO_ROUTES, 'utf8'),
  ]);
  return { clientSource, seoSource };
}

function clientRoutes(clientSource) {
  const found = [
    ...matchAll(clientSource, /(?:pageRoute|protectedPageRoute)\(\s*'([^']+)'/g),
    ...matchAll(clientSource, /\{\s*path:\s*'([^']+)'/g),
  ].map(normalize);
  assert.ok(found.length > 0, 'Could not parse any route path out of main.jsx');
  return [...new Set(found)];
}

function seoRoutes(seoSource) {
  const found = matchAll(seoSource, /router\.get\(\s*'([^']+)'/g).map(normalize);
  assert.ok(found.length > 0, 'Could not parse any router.get(...) out of seo.js');
  return [...new Set(found)];
}

/** Prefixes blocked in robots.txt, read from the same source that serves it. */
function disallowedPrefixes(seoSource) {
  const found = matchAll(seoSource, /'Disallow:\s*([^']+)'/g).map((value) => value.trim());
  assert.ok(found.length > 0, 'Could not parse any Disallow rules out of seo.js');
  return found;
}

function isDisallowed(routePath, prefixes) {
  return prefixes.some((prefix) => routePath === prefix || routePath.startsWith(prefix));
}

/** Body of the /sitemap.xml handler, so we can check which URLs it emits. */
function sitemapHandlerBody(seoSource) {
  const start = seoSource.indexOf("router.get('/sitemap.xml'");
  assert.notEqual(start, -1, 'seo.js no longer defines a /sitemap.xml handler');
  const end = seoSource.indexOf('router.get(', start + 1);
  assert.notEqual(end, -1, 'Could not find the end of the /sitemap.xml handler');
  return seoSource.slice(start, end);
}

test('every indexable public route is server-rendered by seo.js', async () => {
  const { clientSource, seoSource } = await readSources();
  const prefixes = disallowedPrefixes(seoSource);
  const covered = new Set(seoRoutes(seoSource));

  const missing = clientRoutes(clientSource).filter((routePath) => {
    if (isDisallowed(routePath, prefixes)) return false;
    if (NOT_INDEXED_BY_DESIGN.has(routePath)) return false;
    return !covered.has(routePath);
  });

  assert.deepEqual(
    missing,
    [],
    `Public route(s) with no server-rendered handler in server/src/routes/seo.js:\n` +
      missing.map((routePath) => `  - ${routePath}`).join('\n') +
      `\n\nThese ship with the default noindex shell from web/index.html and are absent ` +
      `from sitemap.xml. Add a handler in seo.js, add a robots.txt Disallow rule, or ` +
      `record the route in NOT_INDEXED_BY_DESIGN with a reason.`,
  );
});

test('seo.js has no handler for a route the client router dropped', async () => {
  const { clientSource, seoSource } = await readSources();
  const clientPaths = new Set(clientRoutes(clientSource));

  const orphaned = seoRoutes(seoSource).filter(
    (routePath) => !NON_PAGE_SEO_ROUTES.has(routePath) && !clientPaths.has(routePath),
  );

  assert.deepEqual(
    orphaned,
    [],
    `seo.js server-renders route(s) that no longer exist in web/src/main.jsx:\n` +
      orphaned.map((routePath) => `  - ${routePath}`).join('\n') +
      `\n\nThese return indexable HTML for URLs the app will bounce to /. Remove the handler.`,
  );
});

test('no route is both server-rendered and blocked in robots.txt', async () => {
  const { seoSource } = await readSources();
  const prefixes = disallowedPrefixes(seoSource);

  const contradictory = seoRoutes(seoSource).filter(
    (routePath) => !NON_PAGE_SEO_ROUTES.has(routePath) && isDisallowed(routePath, prefixes),
  );

  assert.deepEqual(
    contradictory,
    [],
    `Route(s) server-rendered for indexing but disallowed in robots.txt:\n` +
      contradictory.map((routePath) => `  - ${routePath}`).join('\n') +
      `\n\nCrawlers will never fetch the rendered HTML. Pick one.`,
  );
});

test('every static indexable route is listed in sitemap.xml', async () => {
  const { clientSource, seoSource } = await readSources();
  const prefixes = disallowedPrefixes(seoSource);
  const body = sitemapHandlerBody(seoSource);

  const staticIndexable = clientRoutes(clientSource).filter(
    (routePath) =>
      !routePath.includes(':') &&
      routePath !== '*' &&
      !isDisallowed(routePath, prefixes) &&
      !NOT_INDEXED_BY_DESIGN.has(routePath),
  );

  const missing = staticIndexable.filter((routePath) =>
    routePath === '/'
      ? !/loc:\s*siteOrigin\b/.test(body)
      : !body.includes('${siteOrigin}' + routePath),
  );

  assert.deepEqual(
    missing,
    [],
    `Static public route(s) absent from the /sitemap.xml handler:\n` +
      missing.map((routePath) => `  - ${routePath}`).join('\n') +
      `\n\nGoogle will only find them by crawling links. Add them to the urls array in seo.js.`,
  );
});

test('the HTML shell fails closed with a noindex default', async () => {
  const shell = await readFile(path.join(repoRoot, 'web', 'index.html'), 'utf8');
  const robots = shell.match(/<meta\s+name="robots"\s+content="([^"]*)"/i);

  assert.ok(robots, 'web/index.html must carry a <meta name="robots"> tag for injectSeoHtml to replace');
  assert.match(
    robots[1],
    /noindex/,
    'web/index.html must default to noindex so routes missing from seo.js fail closed rather ' +
      'than shipping an empty, indexable SPA shell.',
  );
});
