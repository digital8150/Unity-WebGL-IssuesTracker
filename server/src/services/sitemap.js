import { translationKey, isPublishedTranslation } from './localeContent.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function dateValue(value) {
  return value ? new Date(value) : null;
}

function addAlternateSet(entry, siteOrigin, publishEnabled) {
  if (entry.static) {
    if (!publishEnabled) {
      entry.alternates = null;
      return entry;
    }
    const rootPath = entry.path || new URL(entry.loc).pathname;
    const suffix = rootPath === '/' ? '' : rootPath;
    entry.alternates = [
      { hreflang: 'ko', href: `${siteOrigin}${suffix}` },
      { hreflang: 'en', href: `${siteOrigin}/en${suffix}` },
      { hreflang: 'x-default', href: `${siteOrigin}${suffix}` },
    ];
    return entry;
  }
  const row = entry.translation;
  if (!isPublishedTranslation(row, publishEnabled)) {
    entry.alternates = null;
    return entry;
  }
  const path = entry.path;
  entry.alternates = [
    { hreflang: 'ko', href: `${siteOrigin}${path}` },
    { hreflang: 'en', href: `${siteOrigin}/en${path}` },
    { hreflang: 'x-default', href: `${siteOrigin}${path}` },
  ];
  return entry;
}

function translationFor(translationsByRef, refType, refId) {
  if (!translationsByRef) return null;
  if (translationsByRef instanceof Map) {
    return translationsByRef.get(translationKey(refType, refId))
      ?? translationsByRef.get(String(refId))
      ?? null;
  }
  if (Array.isArray(translationsByRef)) {
    return translationsByRef.find((row) => row.refType === refType && String(row.refId) === String(refId)) || null;
  }
  return translationsByRef[translationKey(refType, refId)] ?? translationsByRef[String(refId)] ?? null;
}

export function buildSitemapUrls({
  posts = [],
  games = [],
  articles = [],
  builds = [],
  translationsByRef = new Map(),
  siteOrigin,
  publishEnabled = false,
  privacyDate = null,
} = {}) {
  const urls = [
    addAlternateSet({ loc: siteOrigin, path: '/', lastmod: null, static: true }, siteOrigin, publishEnabled),
    addAlternateSet({ loc: `${siteOrigin}/arcade`, path: '/arcade', lastmod: null, static: true }, siteOrigin, publishEnabled),
    addAlternateSet({ loc: `${siteOrigin}/blog`, path: '/blog', lastmod: posts[0]?.updatedAt || null, static: true }, siteOrigin, publishEnabled),
    addAlternateSet({ loc: `${siteOrigin}/privacy`, path: '/privacy', lastmod: privacyDate, static: true }, siteOrigin, publishEnabled),
  ];

  for (const post of posts.filter((item) => item.published !== false)) {
    const path = `/blog/${post.slug}`;
    urls.push(addAlternateSet({
      loc: `${siteOrigin}${path}`,
      path,
      lastmod: post.updatedAt || post.publishedAt,
      translation: translationFor(translationsByRef, 'BlogPost', post._id),
    }, siteOrigin, publishEnabled));
  }

  const buildList = Array.isArray(builds) ? builds : [];
  const buildForGame = (game) => buildList.find((build) => String(build.gameId) === String(game._id ?? game.id) && (build.isActive ?? true));
  for (const game of games.filter((item) => item.visibility === 'public' || item.visibility === undefined)) {
    const build = game.activeBuild || buildForGame(game);
    if (!build) continue;
    const path = `/play/${game.slug}`;
    urls.push(addAlternateSet({
      loc: `${siteOrigin}${path}`,
      path,
      lastmod: build.updatedAt || game.updatedAt,
      refType: 'Game',
      refId: game._id ?? game.id,
      translation: translationFor(translationsByRef, 'Game', game._id ?? game.id),
    }, siteOrigin, publishEnabled));
  }

  const publicGameIds = new Set(games.filter((game) => game.visibility === 'public' || game.visibility === undefined).map((game) => String(game._id ?? game.id)));
  const gameSlugById = new Map(games.map((game) => [String(game._id ?? game.id), game.slug]));
  const articlesByGame = new Map();
  for (const article of articles.filter((item) => item.published !== false && publicGameIds.has(String(item.gameId)))) {
    if (!articlesByGame.has(String(article.gameId))) articlesByGame.set(String(article.gameId), []);
    articlesByGame.get(String(article.gameId)).push(article);
  }
  for (const [gameId, gameArticles] of articlesByGame) {
    const slug = gameSlugById.get(gameId);
    if (!slug) continue;
    const game = games.find((item) => String(item._id ?? item.id) === gameId);
    const path = `/play/${slug}/articles`;
    const listHasPublishedTranslation = gameArticles.some((article) => isPublishedTranslation(
      translationFor(translationsByRef, 'GameArticle', article._id),
      publishEnabled,
    ));
    urls.push(addAlternateSet({
      loc: `${siteOrigin}${path}`,
      path,
      lastmod: gameArticles.reduce((latest, article) => {
        const candidate = dateValue(article.updatedAt || article.publishedAt);
        return !latest || (candidate && candidate > latest) ? candidate : latest;
      }, null),
      static: false,
      // The list has no persisted translation row of its own. It is eligible
      // when at least one public article translation makes the English list
      // materially different from the Korean source list.
      translation: listHasPublishedTranslation ? { status: 'ready', noindex: false, origin: 'machine' } : null,
      refType: 'GameArticleList',
      refId: gameId,
    }, siteOrigin, publishEnabled));
    for (const article of gameArticles) {
      const articlePath = `/play/${slug}/articles/${article.slug}`;
      urls.push(addAlternateSet({
        loc: `${siteOrigin}${articlePath}`,
        path: articlePath,
        lastmod: article.updatedAt || article.publishedAt,
        translation: translationFor(translationsByRef, 'GameArticle', article._id),
      }, siteOrigin, publishEnabled));
    }
  }

  // Keep the Korean source URL even when its English row is missing. The
  // translated member is derived only from `alternates` during XML rendering.
  return urls;
}

export function renderSitemapXml(urls = []) {
  const body = urls.map((entry) => {
    const lastmod = entry.lastmod ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : '';
    const alternates = (entry.alternates || []).map((alternate) =>
      `<xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`).join('');
    const translatedLoc = entry.alternates?.find((alternate) => alternate.hreflang === 'en')?.href;
    const loc = entry.loc;
    const root = `<url><loc>${escapeXml(loc)}</loc>${lastmod}${alternates}</url>`;
    if (!translatedLoc) return root;
    return `${root}<url><loc>${escapeXml(translatedLoc)}</loc>${lastmod}${alternates}</url>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`;
}
