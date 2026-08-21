import express from 'express';
import fs from 'node:fs/promises';
import BlogPost from '../models/BlogPost.js';
import GameArticle from '../models/GameArticle.js';
import Build from '../models/Build.js';
import Game from '../models/Game.js';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE_PATH,
  HOME_DESCRIPTION,
  HOME_TITLE,
  PRIVACY_POLICY_DATES,
  PRIVACY_TITLE,
  SITE_NAME,
  absoluteUrl,
  escapeXml,
  getGameReviewSeoData,
  injectSeoHtml,
  markdownToPlainText,
  publicImageUrl,
  resolvePrivacyVersion,
} from '../services/seo.js';
import { copy } from '../i18n/copy.js';
import {
  isPublishedTranslation,
  loadTranslations,
  mergeTranslation,
  publicTranslation,
  publicTranslationMeta,
  translationKey,
} from '../services/localeContent.js';
import { buildSitemapUrls, renderSitemapXml } from '../services/sitemap.js';
import { SEO_PAGE_ROUTES, ROBOTS_DISALLOW_WITH_LOCALE, localizedPath } from './seoRoutes.config.js';
import {
  toPublicArcadeGame,
  toPublicBlogPost,
  toPublicBlogSummary,
  toPublicBuild,
  toPublicGame,
  toPublicGameArticle,
  toPublicGameArticleSummary,
  toPublicPlayGame,
} from '../services/publicData.js';

function queryValue(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function previewImage(value, siteOrigin) {
  return value ? publicImageUrl(value, siteOrigin) : '';
}

function gamePreviewItem(game, siteOrigin, localizedCopy, locale) {
  return {
    kind: 'game',
    title: game.name,
    description: game.description,
    href: localizedPath(`/play/${game.slug}`, locale),
    image: previewImage(game.thumbnailUrl, siteOrigin),
    meta: [
      game.developerName || '',
      game.latestBuildVersion ? `${localizedCopy.version} ${game.latestBuildVersion}` : '',
    ].filter(Boolean),
    actionLabel: localizedCopy.preview?.playNow,
  };
}

function blogPreviewItem(post, siteOrigin, localizedCopy, locale, path = `/blog/${post.slug}`) {
  return {
    kind: 'article',
    title: post.title,
    summary: post.summary,
    href: localizedPath(path, locale),
    image: previewImage(post.coverImageUrl, siteOrigin),
    tags: post.tags,
    date: post.publishedAt || post.createdAt,
    author: post.author?.name,
    actionLabel: localizedCopy.preview?.readArticle,
  };
}

export function pageUrl(siteOrigin, path, locale) {
  const localized = localizedPath(path, locale);
  // The Korean home page is the one route where `absoluteUrl` would append a
  // trailing slash while `alternateSet` and the sitemap emit bare `siteOrigin`.
  // Google treats those as different URLs, and an hreflang cluster that does
  // not point at each page's own canonical is ignored wholesale — so keep the
  // canonical byte-identical to the alternate/sitemap form.
  if (localized === '/') return siteOrigin;
  return absoluteUrl(localized, siteOrigin);
}

export function alternateSet(siteOrigin, path, locale, { publishEnabled, dynamic = false, translation = null, listReady = false } = {}) {
  if (!publishEnabled || (dynamic && !isPublishedTranslation(translation, publishEnabled) && !listReady)) return null;
  const canonicalPath = path === '/' ? '' : path;
  return [
    { hreflang: 'ko', href: `${siteOrigin}${canonicalPath}` },
    { hreflang: 'en', href: `${siteOrigin}/en${canonicalPath}` },
    { hreflang: 'x-default', href: `${siteOrigin}${canonicalPath}` },
  ];
}

export function seoRouter({ distRoot, siteOrigin, models = {}, translationPolicy = null } = {}) {
  const router = express.Router();
  const blogPostModel = models.BlogPost ?? BlogPost;
  const gameArticleModel = models.GameArticle ?? GameArticle;
  const buildModel = models.Build ?? Build;
  const gameModel = models.Game ?? Game;
  // Tests can inject only the content models. Production passes the real
  // settings/translation models from index.js; absent stores fail closed
  // instead of buffering a Mongoose query forever in a DB-free test.
  const translationModel = models.Translation ?? null;
  const settingsModel = models.SiteSettings ?? null;
  const emptyTranslationModel = { find: () => ({ lean: async () => [] }) };

  async function readShell(next) {
    try {
      return await fs.readFile(`${distRoot}/index.html`, 'utf8');
    } catch {
      next();
      return null;
    }
  }

  function sendHtml(res, html, cacheControl = 'public, max-age=60, stale-while-revalidate=300') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    res.send(html);
  }

  async function getPolicy(locale) {
    if (translationPolicy) return { ...translationPolicy.translation, ...translationPolicy };
    if (!settingsModel) return { publishEnabled: false, enabled: false };
    try {
      const row = await settingsModel.findById('site').lean();
      return row?.translation || { publishEnabled: false, enabled: false };
    } catch {
      // SEO must fail closed when settings cannot be read.
      return { publishEnabled: false, enabled: false };
    }
  }

  async function findTranslation(refType, refId, locale) {
    if (!refId || !translationModel) return null;
    return translationModel.findOne({ refType, refId, locale: 'en' }).lean();
  }

  async function loadAlternateRows(refType, ids, policy) {
    if (!translationModel || !policy.publishEnabled || !ids.length) return new Map();
    const rows = await translationModel.find({ refType, refId: { $in: ids }, locale: 'en' }).lean();
    return new Map(rows.map((row) => [String(row.refId), row]));
  }

  async function loadPublicArcadeGames(locale, policy) {
    const games = await gameModel.find({ visibility: 'public' })
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name')
      .select('name slug description thumbnailUrl ownerId updatedAt')
      .lean();
    const gameTranslations = await loadTranslations('Game', games.map((game) => game._id), locale, translationModel || emptyTranslationModel);
    const withBuilds = await Promise.all(games.map(async (game) => {
      const build = await buildModel.findOne({ gameId: game._id, isActive: true }).select('version').lean();
      if (!build) return null;
      const translatedGame = mergeTranslation(game, publicTranslation(gameTranslations.get(String(game._id)), locale, policy.publishEnabled), 'Game');
      return { ...translatedGame, developerName: game.ownerId?.name ?? null, latestBuildVersion: build.version || null };
    }));
    const visibleGames = withBuilds.filter(Boolean);
    const arcadeTranslation = locale === 'en' && games.some((game) => {
      const row = publicTranslation(gameTranslations.get(String(game._id)), locale, policy.publishEnabled);
      return row?.origin === 'machine';
    }) ? { status: 'ready', origin: 'machine', noindex: false } : null;
    return { games: visibleGames, translation: arcadeTranslation };
  }

  async function loadRelatedArcadeGames(gameId, locale, policy) {
    const games = await gameModel.aggregate([
      { $match: { _id: { $ne: gameId }, visibility: 'public' } },
      { $sort: { updatedAt: -1 } },
      {
        $lookup: {
          from: buildModel.collection?.name || 'builds',
          let: { gameId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$gameId', '$$gameId'] }, { $eq: ['$isActive', true] }] } } },
            { $project: { _id: 0, version: 1 } },
            { $limit: 1 },
          ],
          as: 'activeBuilds',
        },
      },
      { $match: { 'activeBuilds.0': { $exists: true } } },
      { $limit: 3 },
      {
        $project: {
          name: 1,
          slug: 1,
          description: 1,
          thumbnailUrl: 1,
          ownerId: 1,
          updatedAt: 1,
          latestBuildVersion: { $arrayElemAt: ['$activeBuilds.version', 0] },
        },
      },
    ]);
    const populatedGames = await gameModel.populate(games, { path: 'ownerId', select: 'name' });
    const gameTranslations = await loadTranslations('Game', populatedGames.map((candidate) => candidate._id), locale, translationModel || emptyTranslationModel);
    return populatedGames.map((candidate) => {
      const translatedGame = mergeTranslation(candidate, publicTranslation(gameTranslations.get(String(candidate._id)), locale, policy.publishEnabled), 'Game');
      return { ...translatedGame, developerName: candidate.ownerId?.name ?? null };
    });
  }

  async function loadRecentBlogPosts(locale, policy) {
    const posts = await blogPostModel.find({ published: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(3)
      .populate('author', 'name')
      .select('-content')
      .lean();
    const rows = await loadTranslations('BlogPost', posts.map((post) => post._id), locale, translationModel || emptyTranslationModel);
    return posts.map((post) => mergeTranslation(post, publicTranslation(rows.get(String(post._id)), locale, policy.publishEnabled), 'BlogPost'));
  }

  async function loadRelatedBlogPosts(post, locale, policy) {
    const candidates = await blogPostModel.find({ published: true, _id: { $ne: post._id } })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(4)
      .populate('author', 'name')
      .select('-content')
      .lean();
    const related = candidates.filter((candidate) => String(candidate._id) !== String(post._id)).slice(0, 3);
    const rows = await loadTranslations('BlogPost', related.map((candidate) => candidate._id), locale, translationModel || emptyTranslationModel);
    return related.map((candidate) => mergeTranslation(candidate, publicTranslation(rows.get(String(candidate._id)), locale, policy.publishEnabled), 'BlogPost'));
  }

  async function loadRelatedGameArticles(gameId, article, locale, policy) {
    const candidates = await gameArticleModel.find({ gameId, published: true, _id: { $ne: article._id } })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(4)
      .populate('author', 'name')
      .select('-content')
      .lean();
    const related = candidates.filter((candidate) => String(candidate._id) !== String(article._id)).slice(0, 3);
    const rows = await loadTranslations('GameArticle', related.map((candidate) => candidate._id), locale, translationModel || emptyTranslationModel);
    return related.map((candidate) => mergeTranslation(candidate, publicTranslation(rows.get(String(candidate._id)), locale, policy.publishEnabled), 'GameArticle'));
  }

  function render({ req, res, next, locale, path, policy, title, description, image, type = 'website', robots = 'index,follow', jsonLd, preview, bootstrap = null, dynamic = false, translation = null, listReady = false }) {
    return readShell(next).then((shell) => {
      if (!shell) return;
      const publishedTranslation = publicTranslation(translation, locale, policy.publishEnabled);
      const indexableTranslation = locale === 'en' && isPublishedTranslation(translation, policy.publishEnabled);
      const translated = locale === 'en' && dynamic && !publishedTranslation;
      const requiresTranslation = locale === 'en' && dynamic;
      const effectiveRobots = locale === 'en' && (!policy.publishEnabled || (requiresTranslation && !indexableTranslation))
        ? 'noindex,follow'
        : robots;
      // If the English row is missing or forced noindex, the body is byte-for-byte
      // Korean. Its cross-locale canonical is therefore honest, not a redirect.
      const canonical = locale === 'en' && policy.publishEnabled && (!requiresTranslation || (indexableTranslation && !translated))
        ? pageUrl(siteOrigin, path, 'en')
        : pageUrl(siteOrigin, path, 'ko');
      const alternates = effectiveRobots.startsWith('noindex') ? null : alternateSet(siteOrigin, path, locale, {
        publishEnabled: policy.publishEnabled,
        dynamic,
        translation,
        listReady,
      });
      const resolvedJsonLd = jsonLd
        ? { ...jsonLd, url: canonical, inLanguage: locale === 'en' ? 'en-US' : 'ko-KR' }
        : null;
      const resolvedPreview = preview
        ? { ...preview, locale, notice: locale === 'en' && publishedTranslation?.origin === 'machine'
          ? { text: copy.en.machineNotice, href: pageUrl(siteOrigin, path, 'ko') }
          : preview.notice }
        : null;
      const resolvedBootstrap = bootstrap
        ? { ...bootstrap, url: req.originalUrl, locale, translation: publicTranslationMeta(translation, locale, policy.publishEnabled) }
        : null;
      sendHtml(res, injectSeoHtml(shell, {
        title,
        description,
        image,
        url: canonical,
        type,
        robots: effectiveRobots,
        lang: locale,
        alternates,
        jsonLd: resolvedJsonLd,
        preview: resolvedPreview,
        bootstrap: resolvedBootstrap,
      }));
    }).catch(next);
  }

  router.get('/robots.txt', (_req, res) => {
    const body = [
      'User-agent: *',
      'Allow: /',
      'Allow: /api/blog/',
      'Allow: /api/games/arcade',
      'Allow: /api/games/play/',
      ...ROBOTS_DISALLOW_WITH_LOCALE.map((path) => `Disallow: ${path}`),
      `Sitemap: ${siteOrigin}/sitemap.xml`,
      '',
    ].join('\n');
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(body);
  });

  router.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const [posts, games, articles, builds, settings] = await Promise.all([
        blogPostModel.find({ published: true }).select('_id slug published publishedAt updatedAt').sort({ publishedAt: -1 }).lean(),
        gameModel.find({ visibility: 'public' }).select('_id slug visibility updatedAt').sort({ updatedAt: -1 }).lean(),
        gameArticleModel.find({ published: true }).select('_id gameId slug published publishedAt updatedAt').lean(),
        buildModel.find({ isActive: true }).select('_id gameId isActive updatedAt').lean(),
        settingsModel ? settingsModel.findById('site').lean().catch(() => null) : Promise.resolve(null),
      ]);
      const publishEnabled = Boolean(settings?.translation?.publishEnabled);
      const translations = publishEnabled
        ? await (translationModel || { find: () => ({ select: () => ({ lean: async () => [] }) }) }).find({ locale: 'en', status: 'ready', noindex: { $ne: true } }).select('refType refId status noindex origin translatedAt').lean()
        : [];
      const translationMap = new Map(translations.map((row) => [translationKey(row.refType, row.refId), row]));
      const urls = buildSitemapUrls({
        posts,
        games,
        articles,
        builds,
        translationsByRef: translationMap,
        siteOrigin,
        publishEnabled,
        privacyDate: PRIVACY_POLICY_DATES[0],
      });
      res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(renderSitemapXml(urls));
    } catch (err) {
      next(err);
    }
  });

  async function renderHome(req, res, next, locale) {
    const c = copy[locale];
    const policy = await getPolicy(locale);
    const [{ games, translation }, recentPosts] = await Promise.all([
      loadPublicArcadeGames(locale, policy),
      loadRecentBlogPosts(locale, policy),
    ]);
    const previewGames = games.map((game) => gamePreviewItem(game, siteOrigin, c, locale));
    const previewPosts = recentPosts.map((post) => blogPreviewItem(post, siteOrigin, c, locale));
    const featuredGame = games[0] || null;
    const previewCopy = c.preview || {};
    return render({
      req, res, next, locale, policy, path: '/', translation,
      title: locale === 'en' ? c.homeTitle : HOME_TITLE,
      description: locale === 'en' ? c.homeDescription : HOME_DESCRIPTION,
      image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, publisher: { '@type': 'Organization', name: 'BCSDLab.' } },
      bootstrap: { route: '/', data: { games: games.map(toPublicArcadeGame), posts: recentPosts.map(toPublicBlogSummary) } },
      preview: {
        layout: 'landing',
        title: locale === 'en' ? c.homeTitle : HOME_TITLE,
        summary: locale === 'en' ? c.homeDescription : HOME_DESCRIPTION,
        maxItems: Math.max(games.length, 3),
        hero: featuredGame ? {
          eyebrow: previewCopy.updatedEyebrow,
          title: featuredGame.name,
          summary: featuredGame.description || c.homeDescription,
          href: localizedPath(`/play/${featuredGame.slug}`, locale),
          image: previewImage(featuredGame.thumbnailUrl, siteOrigin),
          meta: [featuredGame.developerName || '', featuredGame.latestBuildVersion ? `${c.version} ${featuredGame.latestBuildVersion}` : ''].filter(Boolean),
          actionLabel: previewCopy.playNow,
          note: previewCopy.featuredInstallNote,
          pagination: games.slice(0, 5),
          paginationLabel: previewCopy.updatedEyebrow,
        } : {
          eyebrow: previewCopy.featuredEyebrow,
          title: c.arcadeTitle,
          summary: c.arcadeDescription,
          href: localizedPath('/arcade', locale),
          actionLabel: c.arcadeTitle,
        },
        sections: [
          { eyebrow: previewCopy.gamesEyebrow, heading: c.homeGamesTitle || c.arcadeTitle, kind: 'game', items: previewGames },
          { eyebrow: previewCopy.recentEyebrow, heading: c.homeRecentArticlesTitle || c.blogTitle, kind: 'article', action: { href: localizedPath('/blog', locale), label: previewCopy.viewAll }, items: previewPosts },
        ],
        footerVariant: 'landing',
      },
    });
  }

  async function renderPrivacy(req, res, next, locale) {
    const version = resolvePrivacyVersion(req.params.date);
    if (!version) return next();
    const policy = await getPolicy(locale);
    const c = copy[locale];
    const path = version.isLatest ? '/privacy' : `/privacy/${version.effectiveDate}`;
    return render({
      req, res, next, locale, policy, path,
      title: `${c.privacyTitle} — ${SITE_NAME}`,
      description: c.privacyDescription,
      image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
      robots: version.isLatest ? 'index,follow' : 'noindex,follow',
      jsonLd: version.isLatest ? { '@context': 'https://schema.org', '@type': 'WebPage', name: c.privacyTitle, description: c.privacyDescription, datePublished: version.effectiveDate, isPartOf: { '@type': 'WebSite', name: SITE_NAME } } : null,
      preview: {
        layout: 'privacy',
        title: c.privacyTitle,
        summary: c.privacyDescription,
        body: `${c.effectiveDate}: ${version.effectiveDate}`,
        footerVariant: 'full',
      },
    });
  }

  async function renderArcade(req, res, next, locale) {
    const policy = await getPolicy(locale);
    const { games: visibleGames, translation: arcadeTranslation } = await loadPublicArcadeGames(locale, policy);
    const c = copy[locale];
    return render({
      req, res, next, locale, policy, path: '/arcade', title: `${c.arcadeTitle} — ${SITE_NAME}`,
      description: c.arcadeDescription, image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin), translation: arcadeTranslation,
      jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.arcadeTitle, description: c.arcadeDescription, mainEntity: { '@type': 'ItemList', itemListElement: visibleGames.map((game, index) => ({ '@type': 'ListItem', position: index + 1, name: game.name, url: pageUrl(siteOrigin, `/play/${game.slug}`, locale) })) } },
      bootstrap: { route: '/arcade', data: { games: visibleGames.map(toPublicArcadeGame) } },
      preview: {
        layout: 'arcade',
        title: c.arcadeTitle,
        summary: c.arcadeDescription,
        page: { eyebrow: c.preview?.arcadeEyebrow },
        sections: [{ kind: 'game', items: visibleGames.map((game) => gamePreviewItem(game, siteOrigin, c, locale)) }],
        footerVariant: 'full',
      },
    });
  }

  async function renderBlogList(req, res, next, locale) {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = 9;
    const skip = (page - 1) * limit;
    const filter = { published: true };
    const [posts, total] = await Promise.all([
      blogPostModel.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit).populate('author', 'name').select('-content').lean(),
      blogPostModel.countDocuments(filter),
    ]);
    const policy = await getPolicy(locale);
    const rows = await loadTranslations('BlogPost', posts.map((post) => post._id), locale, translationModel || emptyTranslationModel);
    const translatedPosts = posts.map((post) => mergeTranslation(post, publicTranslation(rows.get(String(post._id)), locale, policy.publishEnabled), 'BlogPost'));
    const listTranslation = locale === 'en' && posts.some((post) => {
      const row = publicTranslation(rows.get(String(post._id)), locale, policy.publishEnabled);
      return row?.origin === 'machine';
    }) ? { status: 'ready', origin: 'machine', noindex: false } : null;
    const c = copy[locale];
    const path = '/blog';
    return render({
      req, res, next, locale, policy, path, title: page > 1 ? `${c.blogPageTitle(page)} — ${SITE_NAME}` : `${c.blogTitle} — ${SITE_NAME}`,
      description: c.blogDescription, image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin), translation: listTranslation,
      jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: c.blogTitle },
      bootstrap: { route: '/blog', data: { posts: translatedPosts.map(toPublicBlogSummary), total, page, pages: Math.ceil(total / limit) } },
      preview: {
        layout: 'blog-list',
        title: page > 1 ? c.blogPageTitle(page) : c.blogTitle,
        summary: c.blogDescription,
        page: { eyebrow: c.preview?.blogEyebrow },
        sidebar: {
          searchLabel: c.preview?.searchLabel,
          searchPlaceholder: c.preview?.searchPlaceholder,
          tagsLabel: c.preview?.tagsLabel,
          resetLabel: c.preview?.resetFilters,
          tags: [...new Set(translatedPosts.flatMap((post) => post.tags || []))],
          tagHref: localizedPath('/blog', locale),
          resetHref: localizedPath('/blog', locale),
        },
        sections: [{ kind: 'article', items: translatedPosts.map((post) => blogPreviewItem(post, siteOrigin, c, locale)) }],
        footerVariant: 'full',
      },
    });
  }

  async function renderBlogPost(req, res, next, locale) {
    const post = await blogPostModel.findOne({ slug: req.params.slug, published: true })
      .populate('author', 'name')
      .populate('comments.authorId', 'name')
      .lean();
    if (!post) return next();
    const policy = await getPolicy(locale);
    const [translation, relatedPosts] = await Promise.all([
      findTranslation('BlogPost', post._id, locale),
      loadRelatedBlogPosts(post, locale, policy),
    ]);
    const effective = mergeTranslation(post, publicTranslation(translation, locale, policy.publishEnabled), 'BlogPost');
    const c = copy[locale];
    const path = `/blog/${post.slug}`;
    return render({
      req, res, next, locale, policy, path, dynamic: true, translation,
      title: `${effective.title} — ${SITE_NAME}`, description: effective.summary || DEFAULT_DESCRIPTION,
      image: publicImageUrl(effective.coverImageUrl, siteOrigin), type: 'article',
      jsonLd: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: effective.title, description: effective.summary || undefined, image: publicImageUrl(effective.coverImageUrl, siteOrigin), datePublished: post.publishedAt || post.createdAt, dateModified: post.updatedAt || post.publishedAt || post.createdAt, author: { '@type': 'Person', name: post.author?.name || 'BCSDLab.' } },
      bootstrap: { route: '/blog/:slug', data: { post: toPublicBlogPost(effective), relatedPosts: relatedPosts.map(toPublicBlogSummary) } },
      preview: {
        layout: 'article',
        title: effective.title,
        summary: effective.summary,
        article: {
          title: effective.title,
          summary: effective.summary,
          body: effective.content,
          coverImage: effective.coverImageUrl,
          tags: effective.tags,
          date: post.publishedAt || post.createdAt,
          author: post.author?.name,
          backHref: localizedPath('/blog', locale),
          backLabel: c.blogTitle,
        },
        sections: [{
          heading: c.relatedArticlesTitle,
          kind: 'article',
          items: relatedPosts.map((relatedPost) => blogPreviewItem(relatedPost, siteOrigin, c, locale)),
        }],
        footerVariant: 'full',
      },
    });
  }

  // Game.visibility is an Arcade-listing flag, not an access-control boundary.
  async function renderGameArticles(req, res, next, locale) {
    const game = await gameModel.findOne({ slug: req.params.gameSlug }).select('_id name slug description thumbnailUrl visibility').lean();
    if (!game) return next();
    const articles = await gameArticleModel.find({ gameId: game._id, published: true }).sort({ publishedAt: -1, createdAt: -1 }).populate('author', 'name').select('-content').lean();
    const policy = await getPolicy(locale);
    const gameTranslation = await findTranslation('Game', game._id, locale);
    const effectiveGame = mergeTranslation(game, publicTranslation(gameTranslation, locale, policy.publishEnabled), 'Game');
    const articleRows = locale === 'en'
      ? await loadTranslations('GameArticle', articles.map((article) => article._id), locale, translationModel || emptyTranslationModel)
      : await loadAlternateRows('GameArticle', articles.map((article) => article._id), policy);
    const effectiveArticles = articles.map((article) => mergeTranslation(article, publicTranslation(articleRows.get(String(article._id)), locale, policy.publishEnabled), 'GameArticle'));
    const c = copy[locale];
    const path = `/play/${game.slug}/articles`;
    const publishedArticleRows = articles
      .map((article) => articleRows.get(String(article._id)))
      .filter((row) => isPublishedTranslation(row, policy.publishEnabled));
    const listReady = publishedArticleRows.length > 0;
    const listTranslation = listReady
      ? { status: 'ready', noindex: false, origin: publishedArticleRows.some((row) => row.origin === 'machine') ? 'machine' : 'human' }
      : null;
    return render({
      req, res, next, locale, policy, path, dynamic: true, translation: listTranslation, listReady,
      title: `${effectiveGame.name} · ${c.gameArticlesTitle} — ${SITE_NAME}`, description: effectiveGame.description || c.gameArticlesDescription,
      image: publicImageUrl(effectiveGame.thumbnailUrl, siteOrigin),
      robots: game.visibility === 'public' ? 'index,follow' : 'noindex,follow',
      jsonLd: game.visibility === 'public'
        ? { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${effectiveGame.name} · ${c.gameArticlesTitle}`, description: effectiveGame.description || c.gameArticlesDescription, isPartOf: { '@type': 'VideoGame', name: effectiveGame.name } }
        : undefined,
      bootstrap: { route: '/play/:gameSlug/articles', data: { game: toPublicGame(effectiveGame), articles: effectiveArticles.map(toPublicGameArticleSummary) } },
      preview: {
        layout: 'game-articles',
        title: `${effectiveGame.name} · ${c.gameArticlesTitle}`,
        summary: effectiveGame.description || c.gameArticlesDescription,
        page: {
          backHref: localizedPath(`/play/${game.slug}`, locale),
          backLabel: c.preview?.backToGame,
          eyebrow: c.preview?.gameArticlesEyebrow,
          title: effectiveGame.name,
          summary: effectiveGame.description || c.gameArticlesDescription,
        },
        sections: [{
          eyebrow: c.preview?.devlogEyebrow,
          heading: c.gameArticlesTitle,
          count: effectiveArticles.length,
          kind: 'article',
          items: effectiveArticles.map((article) => blogPreviewItem(article, siteOrigin, c, locale, `/play/${game.slug}/articles/${article.slug}`)),
        }],
        footerVariant: 'full',
      },
    });
  }

  async function renderGameArticle(req, res, next, locale) {
    const game = await gameModel.findOne({ slug: req.params.gameSlug }).select('_id name slug description thumbnailUrl visibility').lean();
    if (!game) return next();
    const article = await gameArticleModel.findOne({ gameId: game._id, slug: req.params.articleSlug, published: true })
      .populate('author', 'name')
      .populate('comments.authorId', 'name')
      .lean();
    if (!article) return next();
    const policy = await getPolicy(locale);
    const [gameTranslation, translation, relatedArticles] = await Promise.all([
      findTranslation('Game', game._id, locale),
      findTranslation('GameArticle', article._id, locale),
      loadRelatedGameArticles(game._id, article, locale, policy),
    ]);
    const effectiveGame = mergeTranslation(game, publicTranslation(gameTranslation, locale, policy.publishEnabled), 'Game');
    const effectiveArticle = mergeTranslation(article, publicTranslation(translation, locale, policy.publishEnabled), 'GameArticle');
    const c = copy[locale];
    const path = `/play/${game.slug}/articles/${article.slug}`;
    return render({
      req, res, next, locale, policy, path, dynamic: true, translation,
      title: `${effectiveArticle.title} · ${effectiveGame.name} — ${SITE_NAME}`, description: effectiveArticle.summary || effectiveGame.description || c.gameArticlesDescription,
      image: publicImageUrl(effectiveArticle.coverImageUrl || effectiveGame.thumbnailUrl, siteOrigin), type: 'article',
      robots: game.visibility === 'public' ? 'index,follow' : 'noindex,follow',
      jsonLd: game.visibility === 'public'
        ? { '@context': 'https://schema.org', '@type': 'Article', headline: effectiveArticle.title, description: effectiveArticle.summary || undefined, datePublished: article.publishedAt || article.createdAt, dateModified: article.updatedAt || article.publishedAt || article.createdAt, author: { '@type': 'Person', name: article.author?.name || 'BCSDLab.' }, isPartOf: { '@type': 'VideoGame', name: effectiveGame.name } }
        : undefined,
      bootstrap: { route: '/play/:gameSlug/articles/:articleSlug', data: { article: toPublicGameArticle(effectiveArticle), game: toPublicGame(effectiveGame), relatedArticles: relatedArticles.map(toPublicGameArticleSummary) } },
      preview: {
        layout: 'article',
        title: effectiveArticle.title,
        summary: effectiveArticle.summary,
        article: {
          title: effectiveArticle.title,
          summary: effectiveArticle.summary,
          body: effectiveArticle.content,
          coverImage: effectiveArticle.coverImageUrl || effectiveGame.thumbnailUrl,
          tags: effectiveArticle.tags,
          date: article.publishedAt || article.createdAt,
          author: article.author?.name,
          context: effectiveGame.name,
          backHref: localizedPath(`/play/${game.slug}`, locale),
          backLabel: c.preview?.backToGame,
        },
        sections: [{
          heading: c.relatedArticlesTitle,
          kind: 'article',
          items: relatedArticles.map((relatedArticle) => blogPreviewItem(relatedArticle, siteOrigin, c, locale, `/play/${game.slug}/articles/${relatedArticle.slug}`)),
        }],
        footerVariant: 'full',
      },
    });
  }

  async function renderPlay(req, res, next, locale) {
    const game = await gameModel.findOne({ slug: req.params.gameSlug })
      .populate('ownerId', 'name')
      .select('_id name slug description longDescription thumbnailUrl visibility ownerId reviewInfo serverBackend')
      .lean();
    if (!game) return next();
    const buildQuery = req.params.buildId ? { _id: req.params.buildId, gameId: game._id } : { gameId: game._id, isActive: true };
    const build = await buildModel.findOne(buildQuery).lean();
    if (!build) return next();
    const articles = await gameArticleModel.find({ gameId: game._id, published: true }).sort({ publishedAt: -1, createdAt: -1 }).populate('author', 'name').select('-content').limit(3).lean();
    const policy = await getPolicy(locale);
    const [gameTranslation, articleRows, relatedGames] = await Promise.all([
      findTranslation('Game', game._id, locale),
      loadTranslations('GameArticle', articles.map((article) => article._id), locale, translationModel || emptyTranslationModel),
      loadRelatedArcadeGames(game._id, locale, policy),
    ]);
    const effectiveGame = mergeTranslation(game, publicTranslation(gameTranslation, locale, policy.publishEnabled), 'Game');
    const effectiveArticles = articles.map((article) => mergeTranslation(article, publicTranslation(articleRows.get(String(article._id)), locale, policy.publishEnabled), 'GameArticle'));
    const c = copy[locale];
    const path = req.params.buildId ? `/play/${game.slug}/${req.params.buildId}` : `/play/${game.slug}`;
    const review = getGameReviewSeoData(game.reviewInfo, locale);
    const playData = { game: toPublicPlayGame(effectiveGame), build: toPublicBuild(build), articles: effectiveArticles.map(toPublicGameArticleSummary), relatedGames: relatedGames.map(toPublicArcadeGame) };
    return render({
      req, res, next, locale, policy, path, dynamic: true, translation: gameTranslation,
      title: `${effectiveGame.name} — ${SITE_NAME}`, description: effectiveGame.description || c.gamePlayDescription(effectiveGame.name), image: publicImageUrl(effectiveGame.thumbnailUrl, siteOrigin),
      robots: game.visibility === 'public' ? 'index,follow' : 'noindex,follow',
      jsonLd: game.visibility === 'public'
        ? { '@context': 'https://schema.org', '@type': 'VideoGame', name: effectiveGame.name, description: effectiveGame.description || undefined, image: publicImageUrl(effectiveGame.thumbnailUrl, siteOrigin), gamePlatform: 'Web browser', applicationCategory: 'Game', author: effectiveGame.developerName ? { '@type': 'Person', name: effectiveGame.developerName } : undefined, version: build.version || undefined, contentRating: review.ratingLabel || undefined, keywords: review.descriptorLabels.length ? review.descriptorLabels.join(', ') : undefined, additionalProperty: review.additionalProperty.length ? review.additionalProperty : undefined }
        : undefined,
      bootstrap: { route: req.params.buildId ? '/play/:gameSlug/:buildId' : '/play/:gameSlug', data: playData },
      preview: {
        layout: 'play',
        title: effectiveGame.name,
        summary: effectiveGame.description || c.gamePlayDescription(effectiveGame.name),
        content: effectiveGame.longDescription || effectiveGame.description,
        player: {
          title: effectiveGame.name,
          developer: effectiveGame.developerName || '',
          version: build.version || '',
          infoHeading: c.preview?.gameInfo,
          developerLabel: c.preview?.developerLabel || c.developer,
          latestBuildLabel: c.preview?.latestBuildLabel || c.version,
          descriptionLabel: c.preview?.descriptionLabel,
          image: previewImage(effectiveGame.thumbnailUrl, siteOrigin),
          backHref: localizedPath('/arcade', locale),
          placeholder: c.preview?.playerPlaceholder,
        },
        review: { ...review, heading: c.preview?.gameRating },
        related: {
          heading: c.preview?.continuePlaying,
          kind: 'game',
          items: relatedGames.map((relatedGame) => gamePreviewItem(relatedGame, siteOrigin, c, locale)),
        },
        sections: [{
          eyebrow: c.preview?.devlogEyebrow,
          heading: c.gameArticlesTitle,
          action: {
            href: localizedPath(`/play/${game.slug}/articles`, locale),
            label: c.preview?.viewAll,
          },
          kind: 'article-row',
          items: effectiveArticles.map((article) => blogPreviewItem(article, siteOrigin, c, locale, `/play/${game.slug}/articles/${article.slug}`)),
        }],
        footerVariant: 'slim',
      },
    });
  }

  const handlers = {
    home: renderHome,
    privacy: renderPrivacy,
    privacyDate: renderPrivacy,
    arcade: renderArcade,
    blogList: renderBlogList,
    blogPost: renderBlogPost,
    gameArticles: renderGameArticles,
    gameArticle: renderGameArticle,
    play: renderPlay,
    playBuild: renderPlay,
  };

  for (const route of SEO_PAGE_ROUTES) {
    router.get(route.path, (req, res, next) => handlers[route.key](req, res, next, 'ko'));
    if (route.localized) {
      router.get(localizedPath(route.path, 'en'), (req, res, next) => handlers[route.key](req, res, next, 'en'));
    }
  }

  return router;
}

export default seoRouter;
