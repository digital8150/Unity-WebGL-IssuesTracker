import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import seoRouter from '../src/routes/seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function query(value) {
  const chain = {
    sort: () => chain,
    populate: () => chain,
    select: () => chain,
    limit: () => chain,
    lean: async () => value,
  };
  return chain;
}

const rows = {
  BlogPost: {
    refType: 'BlogPost', refId: 'post-id', status: 'ready', noindex: false,
    fields: { title: 'EN_BLOG_TITLE', summary: 'EN_BLOG_SUMMARY', content: 'EN_BLOG_CONTENT' },
  },
  Game: {
    refType: 'Game', refId: 'game-id', status: 'ready', noindex: false,
    fields: { description: 'EN_GAME_DESCRIPTION' },
  },
  GameArticle: {
    refType: 'GameArticle', refId: 'article-id', status: 'ready', noindex: false,
    fields: { title: 'EN_ARTICLE_TITLE', summary: 'EN_ARTICLE_SUMMARY', content: 'EN_ARTICLE_CONTENT' },
  },
};

const post = {
  _id: 'post-id', title: 'KO_BLOG_TITLE', slug: 'blog-post', summary: 'KO_BLOG_SUMMARY',
  content: 'KO_BLOG_CONTENT', coverImageUrl: '', tags: [], published: true,
  author: { name: 'Author' }, publishedAt: '2026-08-10T00:00:00.000Z',
};

const game = {
  _id: 'game-id', name: 'KO_GAME_NAME', slug: 'game', description: 'KO_GAME_DESCRIPTION',
  thumbnailUrl: '', visibility: 'public', ownerId: { name: 'Developer' }, reviewInfo: { enabled: false },
};

const article = {
  _id: 'article-id', gameId: 'game-id', title: 'KO_ARTICLE_TITLE', slug: 'article',
  summary: 'KO_ARTICLE_SUMMARY', content: 'KO_ARTICLE_CONTENT', coverImageUrl: '', tags: [],
  published: true, author: { name: 'Author' }, publishedAt: '2026-08-10T00:00:00.000Z',
};

const build = {
  _id: 'build-id', version: '1.0.0', canvasWidth: 1280, canvasHeight: 720,
  files: { loader: 'game.loader.js', data: 'game.data', framework: 'game.framework.js', wasm: 'game.wasm', other: [] },
};

function disabledTranslationModels() {
  return {
    BlogPost: { findOne: () => query(post), find: () => query([post]), countDocuments: async () => 1 },
    GameArticle: { findOne: () => query(article), find: () => query([article]) },
    Game: { findOne: () => query(game), find: () => query([game]) },
    Build: { findOne: () => query(build) },
    Translation: {
      findOne: ({ refType }) => query(rows[refType]),
      find: ({ refType }) => query(rows[refType] ? [rows[refType]] : []),
    },
    SiteSettings: { findById: () => query({ translation: { publishEnabled: false } }) },
  };
}

async function getSsrResponse(urlPath) {
  const app = express();
  app.use(seoRouter({
    distRoot: path.join(repoRoot, 'web'),
    siteOrigin: 'https://example.test',
    models: disabledTranslationModels(),
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

function bootstrapFrom(html) {
  const match = html.match(/<script type="application\/json" id="__SSR_DATA__">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

const ssrCases = [
  { url: '/en/blog/blog-post', marker: 'EN_BLOG_TITLE', fallback: 'KO_BLOG_TITLE' },
  { url: '/en/play/game', marker: 'EN_GAME_DESCRIPTION', fallback: 'KO_GAME_DESCRIPTION' },
  { url: '/en/play/game/articles/article', marker: 'EN_ARTICLE_TITLE', fallback: 'KO_ARTICLE_TITLE' },
];

for (const { url, marker, fallback } of ssrCases) {
  test(`SSR publication kill switch keeps ${url} Korean`, async () => {
    const response = await getSsrResponse(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, new RegExp(marker));
    assert.match(html, new RegExp(fallback));
    assert.equal(bootstrapFrom(html)?.translation, null);
  });
}

test('API translation callers always pass locale explicitly to both helpers', async () => {
  const apiFiles = [
    'server/src/routes/blog.js',
    'server/src/routes/gameArticles.js',
    'server/src/routes/games.js',
  ];

  for (const relativePath of apiFiles) {
    const source = await readFile(path.join(repoRoot, relativePath), 'utf8');
    const calls = source.split('\n').filter((line) => /\bpublicTranslation(?:Meta)?\(/.test(line));
    assert.ok(calls.length, `${relativePath} should have translation calls`);
    for (const call of calls) {
      assert.match(call, /req\.query\.locale/, `${relativePath} has an ambiguous translation call: ${call.trim()}`);
    }
  }
});

test('game deletion cleans Game and all cascaded GameArticle translation rows', async () => {
  const source = await readFile(path.join(repoRoot, 'server/src/routes/games.js'), 'utf8');
  const start = source.indexOf("router.delete('/:gameId'");
  const end = source.indexOf('// Thumbnail upload', start);
  assert.ok(start >= 0, 'games route must expose a game-delete handler');
  assert.ok(end > start, 'game-delete handler must precede thumbnail routes');
  const handler = source.slice(start, end);

  assert.match(handler, /GameArticle\.find\(\{ gameId: game\._id \}\)\.select\('_id'\)\.lean\(\)/);
  assert.match(handler, /await GameArticle\.deleteMany\(\{ gameId: game\._id \}\)/);
  assert.match(handler, /Translation\.deleteOne\(\{ refType: 'Game', refId: game\._id, locale: 'en' \}\)\.catch\(\(error\) => console\.error\('\[translation cleanup\]', error\)\)/);
  assert.match(handler, /Translation\.deleteMany\(\{ refType: 'GameArticle', refId: \{ \$in: articles\.map\(\(article\) => article\._id\) \}, locale: 'en' \}\)\.catch\(\(error\) => console\.error\('\[translation cleanup\]', error\)\)/);
});
