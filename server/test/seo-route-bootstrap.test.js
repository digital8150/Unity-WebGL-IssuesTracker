import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import seoRouter from '../src/routes/seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function query(value) {
  const chain = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    populate: () => chain,
    select: () => chain,
    lean: async () => value,
  };
  return chain;
}

const post = {
  _id: 'post-id',
  title: 'Public post',
  slug: 'public-post',
  summary: 'A public summary',
  content: '# Public post body',
  coverImageUrl: '/blog-images/post.webp',
  tags: ['webgl'],
  published: true,
  publishedAt: '2026-08-10T00:00:00.000Z',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  author: { _id: 'author-id', name: 'Author', email: 'owner@example.com', role: 'admin' },
  comments: [{
    _id: 'comment-id',
    body: 'Public comment',
    authorName: 'Tester',
    createdAt: '2026-08-10T01:00:00.000Z',
    email: 'tester@example.com',
  }],
  email: 'owner@example.com',
  role: 'admin',
  isOwner: true,
};

const relatedPost = {
  ...post,
  _id: 'related-post-id',
  title: 'Related public post',
  slug: 'related-public-post',
  comments: [],
};

const article = {
  _id: 'article-id',
  gameId: 'game-id',
  title: 'Public article',
  slug: 'public-article',
  summary: 'An article summary',
  content: '# Public article body',
  coverImageUrl: '/blog-images/article.webp',
  tags: ['patch'],
  published: true,
  publishedAt: '2026-08-10T00:00:00.000Z',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  author: { _id: 'author-id', name: 'Author', email: 'owner@example.com', role: 'admin' },
  comments: [],
  email: 'owner@example.com',
  role: 'admin',
};

const relatedArticle = {
  ...article,
  _id: 'related-article-id',
  title: 'Related public article',
  slug: 'related-public-article',
};

const game = {
  _id: 'game-id',
  name: 'Public game',
  slug: 'public-game',
  description: 'A public game',
  longDescription: '# Long game details\n\nThis is the full play-page guide.',
  thumbnailUrl: '/thumbnails/game.webp',
  visibility: 'public',
  ownerId: { _id: 'owner-id', name: 'Developer', email: 'owner@example.com' },
  collaborators: ['collaborator-id'],
  discordWebhookUrl: 'https://discord.example/webhook-secret',
  serverBackend: { secret: 'backend-secret', v2Enabled: true, cloudSaveEnabled: true },
  reviewInfo: {
    enabled: true,
    title: 'Game title',
    businessName: 'Business',
    rating: 'all',
    classificationNumber: '1234',
    classificationDate: '2026-08-10T00:00:00.000Z',
    developerReportNumber: '5678',
    contentDescriptors: [],
  },
};

const relatedGame = {
  ...game,
  _id: 'related-game-id',
  name: 'Related public game',
  slug: 'related-public-game',
};

const build = {
  _id: 'build-id',
  version: '1.0.0',
  canvasWidth: 1280,
  canvasHeight: 720,
  files: {
    loader: 'game.loader.js',
    data: 'game.data',
    framework: 'game.framework.js',
    wasm: 'game.wasm',
    other: ['StreamingAssets/config.json'],
  },
  storageBytes: 12345,
  secret: 'build-secret',
};

function fakeModels(gameRow = game) {
  return {
    BlogPost: {
      find: () => query([post, relatedPost]),
      countDocuments: async () => 2,
      findOne: () => query(post),
    },
    GameArticle: {
      find: () => query([article, relatedArticle]),
      findOne: () => query(article),
    },
    Build: {
      findOne: () => query(build),
    },
    Game: {
      find: () => query([gameRow, ...(gameRow.visibility === 'public' ? [relatedGame] : [])]),
      findOne: () => query(gameRow),
    },
  };
}

async function getAppResponse(urlPath, models = fakeModels()) {
  const app = express();
  app.use(seoRouter({
    distRoot: path.join(repoRoot, 'web'),
    siteOrigin: 'https://example.test',
    models,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    return await fetch(`http://127.0.0.1:${port}${urlPath}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function parseBootstrap(html) {
  const match = html.match(/<script type="application\/json" id="__SSR_DATA__">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

function parseVisiblePreview(html) {
  const match = html.match(/<div id="seo-preview"[^>]*>([\s\S]*?<\/footer><\/div>)/);
  return match?.[1] ?? '';
}

function collectKeys(value, keys = []) {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return keys;
  }
  Object.entries(value).forEach(([key, child]) => {
    keys.push(key);
    collectKeys(child, keys);
  });
  return keys;
}

const cases = [
  { url: '/', route: '/', keys: ['games', 'posts'] },
  { url: '/privacy', route: null, keys: [] },
  { url: '/privacy/2026-07-08', route: null, keys: [] },
  { url: '/arcade', route: '/arcade', keys: ['games'] },
  { url: '/blog', route: '/blog', keys: ['page', 'pages', 'posts', 'total'] },
  { url: '/blog?page=2', route: '/blog', keys: ['page', 'pages', 'posts', 'total'] },
  { url: '/blog/public-post', route: '/blog/:slug', keys: ['post', 'relatedPosts'] },
  { url: '/play/public-game', route: '/play/:gameSlug', keys: ['articles', 'build', 'game', 'relatedGames'] },
  { url: '/play/public-game/build-id', route: '/play/:gameSlug/:buildId', keys: ['articles', 'build', 'game', 'relatedGames'] },
  { url: '/play/public-game/articles', route: '/play/:gameSlug/articles', keys: ['articles', 'game'] },
  { url: '/play/public-game/articles/public-article', route: '/play/:gameSlug/articles/:articleSlug', keys: ['article', 'game', 'relatedArticles'] },
];

for (const testCase of cases) {
  test(`public HTML bootstrap contract: ${testCase.url}`, async () => {
    const response = await getAppResponse(testCase.url);
    assert.equal(response.status, 200);
    const html = await response.text();
    const preview = parseVisiblePreview(html);
    const payload = parseBootstrap(html);

    assert.ok(preview, 'expected visible SEO preview HTML in the response');
    assert.match(preview, /<h1>[^<]+<\/h1>/);
    assert.doesNotMatch(preview, /aria-hidden|color:\s*transparent|opacity:\s*0/);
    assert.ok(
      preview.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length > 0,
      'visible SEO preview must contain text outside the bootstrap JSON',
    );

    if (!testCase.route) {
      assert.equal(payload, null);
      return;
    }

    assert.ok(payload, 'expected an SSR bootstrap script in the HTML response');
    assert.equal(payload.route, testCase.route);
    assert.equal(payload.url, testCase.url);
    assert.deepEqual(Object.keys(payload.data).sort(), [...testCase.keys].sort());
    assert.deepEqual(JSON.parse(JSON.stringify(payload.data)), payload.data, 'bootstrap must be valid JSON data');
  });
}

test('public route bootstrap payloads contain no private or administrative fields', async () => {
  const forbiddenKeys = new Set([
    'email', 'role', 'isOwner', 'discordWebhookUrl', 'serverBackend', 'secret',
    'collaborators', 'ownerId', 'published', 'storageBytes', 'files',
  ]);

  for (const testCase of cases.filter(({ route }) => route)) {
    const response = await getAppResponse(testCase.url);
    const payload = parseBootstrap(await response.text());
    const leakedKeys = collectKeys(payload.data).filter((key) => forbiddenKeys.has(key));
    assert.deepEqual(leakedKeys, [], `${testCase.url} leaked private bootstrap fields`);
  }
});

test('play bootstrap exposes only the public SDK v2 feature flags', async () => {
  const response = await getAppResponse('/play/public-game');
  const payload = parseBootstrap(await response.text());

  assert.deepEqual(payload.data.game.sdkV2, {
    enabled: true,
    cloudSaveEnabled: true,
  });
  assert.deepEqual(Object.keys(payload.data.game.sdkV2).sort(), ['cloudSaveEnabled', 'enabled']);
  assert.equal('serverBackend' in payload.data.game, false);
  assert.equal('secret' in payload.data.game, false);
  assert.equal(payload.data.game.longDescription, '# Long game details\n\nThis is the full play-page guide.');
});

test('play no-JS preview uses the long description body while metadata stays short', async () => {
  const response = await getAppResponse('/play/public-game');
  const html = await response.text();
  const preview = parseVisiblePreview(html);
  assert.match(preview, /Long game details/);
  assert.match(html, /<meta\s+name="description"[^>]+content="A public game"/);
});

test('unlisted game direct URLs stay public while search indexing stays disabled', async () => {
  const unlistedGame = {
    ...game,
    name: 'Unlisted game',
    slug: 'unlisted-game',
    visibility: 'private',
  };
  const routes = [
    { url: '/play/unlisted-game', route: '/play/:gameSlug' },
    { url: '/play/unlisted-game/build-id', route: '/play/:gameSlug/:buildId' },
    { url: '/play/unlisted-game/articles', route: '/play/:gameSlug/articles' },
    { url: '/play/unlisted-game/articles/public-article', route: '/play/:gameSlug/articles/:articleSlug' },
  ];

  for (const testCase of routes) {
    const response = await getAppResponse(testCase.url, fakeModels(unlistedGame));
    assert.equal(response.status, 200, `${testCase.url} must be directly accessible`);
    const html = await response.text();
    const payload = parseBootstrap(html);
    assert.equal(payload?.route, testCase.route);
    assert.equal(payload?.data?.game?.visibility, 'private');
    assert.match(html, /<meta\s+name="robots"[^>]+content="noindex,follow"/);
  }
});

test('home no-JS preview exposes game, article, nav, and footer links', async () => {
  const response = await getAppResponse('/');
  const html = await response.text();
  const preview = parseVisiblePreview(html);

  assert.match(preview, /href="\/play\/public-game"/);
  assert.match(preview, /href="\/blog\/public-post"/);
  assert.match(preview, /href="\/"/);
  assert.match(preview, /href="\/arcade"/);
  assert.match(preview, /href="\/blog"/);
  assert.match(preview, /href="\/privacy"/);
  assert.match(preview, /<h2>[^<]+<\/h2>/);
});

test('English home preview keeps all public navigation links under /en', async () => {
  const response = await getAppResponse('/en');
  const html = await response.text();
  const preview = parseVisiblePreview(html);

  assert.match(preview, /href="\/en"/);
  assert.match(preview, /href="\/en\/arcade"/);
  assert.match(preview, /href="\/en\/blog"/);
  assert.match(preview, /href="\/en\/privacy"/);
  assert.match(preview, /href="\/en\/play\/public-game"/);
  assert.match(preview, /href="\/en\/blog\/public-post"/);
});

test('play preview links recent articles and the game article index', async () => {
  const response = await getAppResponse('/play/public-game');
  const preview = parseVisiblePreview(await response.text());

  assert.match(preview, /href="\/play\/public-game\/articles\/public-article"/);
  assert.match(preview, /href="\/play\/public-game\/articles"/);
  assert.match(preview, /href="\/play\/related-public-game"/);
});

test('article previews link only to related content from the same scope', async () => {
  const blogPreview = parseVisiblePreview(await (await getAppResponse('/blog/public-post')).text());
  const gameArticlePreview = parseVisiblePreview(await (await getAppResponse('/play/public-game/articles/public-article')).text());

  assert.match(blogPreview, /href="\/blog\/related-public-post"/);
  assert.doesNotMatch(blogPreview, /href="\/play\/public-game\/articles\/related-public-article"/);
  assert.match(gameArticlePreview, /href="\/play\/public-game\/articles\/related-public-article"/);
  assert.doesNotMatch(gameArticlePreview, /href="\/blog\/related-public-post"/);
});

test('public previews use page-specific layout structures', async () => {
  const landingHtml = await (await getAppResponse('/')).text();
  const landing = parseVisiblePreview(landingHtml);
  assert.match(landingHtml, /data-layout="landing"/);
  assert.match(landing, /seo-preview-hero/);
  assert.match(landing, /seo-preview-grid seo-preview-grid--game/);
  assert.match(landing, /seo-preview-grid seo-preview-grid--article/);
  assert.match(landing, /<footer class="seo-preview-footer seo-preview-footer--landing">/);

  const arcadeHtml = await (await getAppResponse('/arcade')).text();
  const arcade = parseVisiblePreview(arcadeHtml);
  assert.match(arcadeHtml, /data-layout="arcade"/);
  assert.match(arcade, /seo-preview-main--listing/);
  assert.match(arcade, /seo-preview-grid seo-preview-grid--game/);
  assert.match(arcade, /<footer class="seo-preview-footer">/);

  const blogHtml = await (await getAppResponse('/blog')).text();
  const blog = parseVisiblePreview(blogHtml);
  assert.match(blogHtml, /data-layout="blog-list"/);
  assert.match(blog, /seo-preview-blog-layout/);
  assert.match(blog, /seo-preview-sidebar/);
  assert.match(blog, /seo-preview-grid seo-preview-grid--article/);

  const articleHtml = await (await getAppResponse('/blog/public-post')).text();
  const article = parseVisiblePreview(articleHtml);
  assert.match(articleHtml, /data-layout="article"/);
  assert.match(article, /seo-preview-longform/);
  assert.match(article, /seo-preview-article-cover/);
  assert.match(article, /seo-preview-markdown/);

  const playHtml = await (await getAppResponse('/play/public-game')).text();
  const play = parseVisiblePreview(playHtml);
  assert.match(playHtml, /data-layout="play"/);
  assert.match(play, /seo-preview-player-stage/);
  assert.match(play, /seo-preview-play-layout/);
  assert.match(play, /seo-preview-play-rail/);
  assert.match(play, /<footer class="seo-preview-footer seo-preview-footer--slim">/);
});
