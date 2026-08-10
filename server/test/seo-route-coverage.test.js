import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../../web/src/routes.config.js';
import { SEO_PAGE_ROUTES, ROBOTS_DISALLOW, ROBOTS_DISALLOW_WITH_LOCALE, localizedPath } from '../src/routes/seoRoutes.config.js';
import seoRouter from '../src/routes/seo.js';
import { buildSitemapUrls, renderSitemapXml } from '../src/services/sitemap.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const NOT_INDEXED_BY_DESIGN = new Map([
  ['/play', 'Bare /play has no game bound to it.'],
  ['/en/play', 'Bare /en/play has no game bound to it.'],
  ['*', 'Client-side catch-all redirects to /.'],
]);

function normalize(routePath) {
  return routePath.replace(/:[A-Za-z0-9_]+/g, ':param');
}

function registeredPaths() {
  const router = seoRouter({
    distRoot: '/nonexistent',
    siteOrigin: 'https://x.test',
    models: { BlogPost: {}, GameArticle: {}, Build: {}, Game: {}, Translation: {}, SiteSettings: {} },
  });
  return router.stack.map((layer) => layer.route?.path).filter(Boolean).map(normalize);
}

test('client and server share the same public SEO route descriptors', () => {
  const clientPublic = ROUTES.filter((route) => route.path !== '*' && !route.path.startsWith('/dashboard') && !route.path.startsWith('/admin') && !route.path.startsWith('/login') && !route.path.startsWith('/register') && !route.path.startsWith('/auth') && !route.path.startsWith('/consent') && !route.path.startsWith('/pending') && !route.path.startsWith('/report'));
  const serverPublic = SEO_PAGE_ROUTES.map((route) => route.path);
  assert.deepEqual(
    clientPublic.filter((route) => route.localized).map((route) => normalize(route.path)).sort(),
    serverPublic.map((pathName) => normalize(pathName)).sort(),
  );
});

test('the actual Express stack contains exactly one ko route and an en twin', () => {
  const paths = registeredPaths();
  for (const route of SEO_PAGE_ROUTES) {
    assert.equal(paths.filter((pathName) => pathName === normalize(route.path)).length, 1, `${route.path} must be registered once`);
    if (route.localized) {
      assert.equal(paths.filter((pathName) => pathName === normalize(localizedPath(route.path, 'en'))).length, 1, `${route.path} must have one /en twin`);
    }
  }
});

test('robots disallows every private page twin under /en', () => {
  for (const blocked of ROBOTS_DISALLOW.filter((pathName) => !pathName.startsWith('/api/'))) {
    assert.ok(ROBOTS_DISALLOW_WITH_LOCALE.includes(`/en${blocked}`), `missing /en twin for ${blocked}`);
  }
});

test('main.jsx delegates route authority to routes.config.js', async () => {
  const source = await readFile(path.join(repoRoot, 'web/src/main.jsx'), 'utf8');
  assert.match(source, /from ['"]\.\/routes\.config\.js['"]/);
  assert.doesNotMatch(source, /path:\s*['"]\//);
});

test('sitemap emits complete alternate blocks and excludes unavailable English members', () => {
  const urls = buildSitemapUrls({
    siteOrigin: 'https://example.test',
    publishEnabled: true,
    privacyDate: '2026-07-08',
    posts: [
      { _id: 'post-ready', slug: 'ready', published: true, updatedAt: '2026-08-01' },
      { _id: 'post-pending', slug: 'pending', published: true, updatedAt: '2026-08-02' },
    ],
    games: [{ _id: 'game-1', slug: 'one', visibility: 'public' }],
    builds: [{ gameId: 'game-1', isActive: true, updatedAt: '2026-08-01' }],
    articles: [],
    translationsByRef: new Map([
      ['BlogPost:post-ready', { refType: 'BlogPost', refId: 'post-ready', status: 'ready', noindex: false }],
      ['BlogPost:post-pending', { refType: 'BlogPost', refId: 'post-pending', status: 'pending', noindex: false }],
      ['Game:game-1', { refType: 'Game', refId: 'game-1', status: 'ready', noindex: false }],
    ]),
  });
  const xml = renderSitemapXml(urls);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /https:\/\/example\.test\/en\/blog\/ready/);
  assert.doesNotMatch(xml, /https:\/\/example\.test\/en\/blog\/pending/);
  assert.match(xml, /hreflang="ko"/);
  assert.match(xml, /hreflang="en"/);
  assert.match(xml, /hreflang="x-default"/);
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
  const readyBlocks = blocks.filter((block) => block.includes('/blog/ready'));
  assert.equal(readyBlocks.length, 2);
  for (const block of readyBlocks) {
    assert.equal((block.match(/rel="alternate"/g) || []).length, 3);
  }
});

test('the HTML shell fails closed with a noindex default', async () => {
  const shell = await readFile(path.join(repoRoot, 'web/index.html'), 'utf8');
  assert.match(shell, /<meta\s+name="robots"\s+content="[^"]*noindex/i);
});
