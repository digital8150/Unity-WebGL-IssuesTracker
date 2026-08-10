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
  PRIVACY_DESCRIPTION,
  PRIVACY_POLICY_DATES,
  PRIVACY_TITLE,
  SITE_NAME,
  absoluteUrl,
  escapeXml,
  formatDate,
  getGameReviewSeoData,
  injectSeoHtml,
  publicImageUrl,
  renderArcadeContent,
  renderBlogListContent,
  renderGameArticleListContent,
  renderGameArticleContent,
  renderBlogPostContent,
  renderHomeContent,
  renderPlayContent,
  renderPrivacyContent,
  resolvePrivacyVersion,
} from '../services/seo.js';

function seoRouter({ distRoot, siteOrigin }) {
  const router = express.Router();

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

  router.get('/robots.txt', (_req, res) => {
    const body = [
      'User-agent: *',
      'Allow: /',
      'Allow: /api/blog/',
      'Allow: /api/games/arcade',
      'Allow: /api/games/play/',
      'Disallow: /api/blog/admin/',
      'Disallow: /api/',
      'Disallow: /dashboard',
      'Disallow: /admin/',
      'Disallow: /login',
      'Disallow: /register',
      'Disallow: /auth/',
      'Disallow: /pending',
      'Disallow: /consent',
      'Disallow: /report/',
      `Sitemap: ${siteOrigin}/sitemap.xml`,
      '',
    ].join('\n');
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(body);
  });

  router.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const [posts, games] = await Promise.all([
        BlogPost.find({ published: true })
          .select('slug publishedAt updatedAt')
          .sort({ publishedAt: -1 })
          .lean(),
        Game.find({ visibility: 'public' })
          .select('slug updatedAt')
          .sort({ updatedAt: -1 })
          .lean(),
      ]);

      const urls = [
        { loc: siteOrigin, lastmod: null },
        { loc: `${siteOrigin}/arcade`, lastmod: null },
        { loc: `${siteOrigin}/blog`, lastmod: posts[0]?.updatedAt || null },
        // Only the current policy; superseded revisions are noindex by design.
        { loc: `${siteOrigin}/privacy`, lastmod: PRIVACY_POLICY_DATES[0] },
        ...posts.map((post) => ({
          loc: `${siteOrigin}/blog/${post.slug}`,
          lastmod: post.updatedAt || post.publishedAt,
        })),
      ];

      const activeGames = await Promise.all(games.map(async (game) => {
        const build = await Build.findOne({ gameId: game._id, isActive: true }).select('_id updatedAt').lean();
        return build ? { loc: `${siteOrigin}/play/${game.slug}`, lastmod: build.updatedAt || game.updatedAt } : null;
      }));
      urls.push(...activeGames.filter(Boolean));

      const gameArticles = await GameArticle.find({
        gameId: { $in: games.map((game) => game._id) },
        published: true,
      })
        .select('gameId slug publishedAt updatedAt')
        .lean();
      const gameSlugs = new Map(games.map((game) => [String(game._id), game.slug]));
      const gameLastModified = new Map();
      gameArticles.forEach((article) => {
        const articleDate = article.updatedAt || article.publishedAt;
        const articleTime = articleDate ? new Date(articleDate).getTime() : NaN;
        if (!Number.isFinite(articleTime)) return;
        const gameId = String(article.gameId);
        const currentDate = gameLastModified.get(gameId);
        if (!currentDate || articleTime > new Date(currentDate).getTime()) {
          gameLastModified.set(gameId, articleDate);
        }
      });
      urls.push(...[...new Set(gameArticles.map((article) => String(article.gameId)))]
        .map((gameId) => {
          const gameSlug = gameSlugs.get(gameId);
          return gameSlug
            ? { loc: `${siteOrigin}/play/${gameSlug}/articles`, lastmod: gameLastModified.get(gameId) || null }
            : null;
        })
        .filter(Boolean));
      urls.push(...gameArticles
        .map((article) => {
          const gameSlug = gameSlugs.get(String(article.gameId));
          return gameSlug
            ? { loc: `${siteOrigin}/play/${gameSlug}/articles/${article.slug}`, lastmod: article.updatedAt || article.publishedAt }
            : null;
        })
        .filter(Boolean));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(({ loc, lastmod }) => `<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`).join('')}</urlset>`;
      res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(xml);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (_req, res, next) => {
    const shell = await readShell(next);
    if (!shell) return;
    const url = siteOrigin;
    sendHtml(res, injectSeoHtml(shell, {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
      url,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url,
        inLanguage: 'ko-KR',
        publisher: { '@type': 'Organization', name: 'BCSDLab.' },
      },
      content: renderHomeContent(),
    }));
  });

  // The current policy is indexable; superseded revisions stay crawlable but are
  // marked noindex and canonicalised to /privacy so they cannot outrank it.
  function renderPrivacy(req, res, next) {
    const version = resolvePrivacyVersion(req.params.date);
    if (!version) return next();

    return readShell(next).then((shell) => {
      if (!shell) return;
      const canonical = version.isLatest ? `${siteOrigin}/privacy` : `${siteOrigin}/privacy/${version.effectiveDate}`;
      sendHtml(res, injectSeoHtml(shell, {
        title: PRIVACY_TITLE,
        description: PRIVACY_DESCRIPTION,
        image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
        url: canonical,
        robots: version.isLatest ? 'index,follow' : 'noindex,follow',
        jsonLd: version.isLatest ? {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: '개인정보처리방침',
          description: PRIVACY_DESCRIPTION,
          url: canonical,
          inLanguage: 'ko-KR',
          datePublished: version.effectiveDate,
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: siteOrigin },
          publisher: { '@type': 'Organization', name: 'BCSDLab.' },
        } : null,
        content: renderPrivacyContent(version),
      }));
    }).catch(next);
  }

  router.get('/privacy', renderPrivacy);
  router.get('/privacy/:date', renderPrivacy);

  router.get('/arcade', async (_req, res, next) => {
    try {
      const games = await Game.find({ visibility: 'public' })
        .sort({ updatedAt: -1 })
        .populate('ownerId', 'name')
        .select('name slug description thumbnailUrl ownerId updatedAt')
        .lean();
      const withBuilds = await Promise.all(games.map(async (game) => {
        const build = await Build.findOne({ gameId: game._id, isActive: true }).select('version').lean();
        if (!build) return null;
        return {
          ...game,
          developerName: game.ownerId?.name ?? null,
          latestBuildVersion: build.version || null,
        };
      }));
      const visibleGames = withBuilds.filter(Boolean);
      const shell = await readShell(next);
      if (!shell) return;
      const url = `${siteOrigin}/arcade`;
      sendHtml(res, injectSeoHtml(shell, {
        title: `Arcade — ${SITE_NAME}`,
        description: 'BCSDLab. Game Track이 공개한 Unity WebGL 게임을 브라우저에서 바로 플레이하세요.',
        image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
        url,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'BCSDLab. Arcade',
          description: '브라우저에서 바로 플레이할 수 있는 Unity WebGL 게임 갤러리',
          url,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: visibleGames.map((game, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: game.name,
              url: `${siteOrigin}/play/${game.slug}`,
            })),
          },
        },
        content: renderArcadeContent(visibleGames, siteOrigin),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/blog', async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = 9;
      const filter = { published: true };
      const [posts, total] = await Promise.all([
        BlogPost.find(filter)
          .sort({ publishedAt: -1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('author', 'name')
          .select('-content')
          .lean(),
        BlogPost.countDocuments(filter),
      ]);
      const pages = Math.max(1, Math.ceil(total / limit));
      const shell = await readShell(next);
      if (!shell) return;
      const url = page === 1 ? `${siteOrigin}/blog` : `${siteOrigin}/blog?page=${page}`;
      sendHtml(res, injectSeoHtml(shell, {
        title: page === 1 ? `블로그 — ${SITE_NAME}` : `블로그 ${page}페이지 — ${SITE_NAME}`,
        description: 'BCSDLab. Game Track의 개발 일지, 업데이트와 Unity WebGL 아티클입니다.',
        image: absoluteUrl(DEFAULT_IMAGE_PATH, siteOrigin),
        url,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'BCSDLab. Arcade 블로그',
          url,
          inLanguage: 'ko-KR',
        },
        content: renderBlogListContent(posts, page, pages, siteOrigin),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/blog/:slug', async (req, res, next) => {
    try {
      const post = await BlogPost.findOne({ slug: req.params.slug, published: true })
        .populate('author', 'name')
        .lean();
      if (!post) return res.status(404).send('Post not found');
      const shell = await readShell(next);
      if (!shell) return;
      const url = `${siteOrigin}/blog/${post.slug}`;
      const image = publicImageUrl(post.coverImageUrl, siteOrigin);
      sendHtml(res, injectSeoHtml(shell, {
        title: `${post.title} — ${SITE_NAME}`,
        description: post.summary || DEFAULT_DESCRIPTION,
        image,
        url,
        type: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.summary || DEFAULT_DESCRIPTION,
          image,
          url,
          datePublished: post.publishedAt || post.createdAt,
          dateModified: post.updatedAt || post.publishedAt || post.createdAt,
          author: { '@type': 'Person', name: post.author?.name || 'BCSDLab.' },
          publisher: { '@type': 'Organization', name: 'BCSDLab.' },
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        },
        content: renderBlogPostContent(post, siteOrigin),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/play/:gameSlug/articles', async (req, res, next) => {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug, visibility: 'public' })
        .populate('ownerId', 'name')
        .lean();
      if (!game) return res.status(404).send('Game not found');

      const articles = await GameArticle.find({ gameId: game._id, published: true })
        .sort({ publishedAt: -1, createdAt: -1 })
        .populate('author', 'name')
        .select('-content')
        .lean();
      const shell = await readShell(next);
      if (!shell) return;
      const url = `${siteOrigin}/play/${game.slug}/articles`;
      const image = publicImageUrl(game.thumbnailUrl, siteOrigin);
      const description = game.description || '\uac8c\uc784\uc758 \ud328\uce58\ub178\ud2b8, \uac1c\ubc1c \uc5c5\ub370\uc774\ud2b8\uc640 \uc18c\uc2dd\uc744 \ud655\uc778\ud574 \ubcf4\uc138\uc694.';
      sendHtml(res, injectSeoHtml(shell, {
        title: `${game.name} \u00b7 \uac8c\uc784 \uc544\ud2f0\ud074 \u2014 ${SITE_NAME}`,
        description,
        image,
        url,
        robots: articles.length > 0 ? 'index,follow' : 'noindex,follow',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${game.name} \u00b7 \uac8c\uc784 \uc544\ud2f0\ud074`,
          description,
          url,
          isPartOf: { '@type': 'VideoGame', name: game.name, url: `${siteOrigin}/play/${game.slug}` },
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: articles.map((article, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: article.title,
              url: `${siteOrigin}/play/${game.slug}/articles/${article.slug}`,
            })),
          },
        },
        content: renderGameArticleListContent(game, articles, siteOrigin),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/play/:gameSlug/articles/:articleSlug', async (req, res, next) => {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug, visibility: 'public' })
        .populate('ownerId', 'name')
        .lean();
      if (!game) return res.status(404).send('Game not found');
      const article = await GameArticle.findOne({
        gameId: game._id,
        slug: req.params.articleSlug,
        published: true,
      }).populate('author', 'name').lean();
      if (!article) return res.status(404).send('Article not found');

      const shell = await readShell(next);
      if (!shell) return;
      const url = `${siteOrigin}/play/${game.slug}/articles/${article.slug}`;
      const image = publicImageUrl(article.coverImageUrl || game.thumbnailUrl, siteOrigin);
      sendHtml(res, injectSeoHtml(shell, {
        title: `${article.title} · ${game.name} — ${SITE_NAME}`,
        description: article.summary || game.description || DEFAULT_DESCRIPTION,
        image,
        url,
        type: 'article',
        robots: 'index,follow',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.summary || game.description || DEFAULT_DESCRIPTION,
          image,
          url,
          datePublished: article.publishedAt || article.createdAt,
          dateModified: article.updatedAt || article.publishedAt || article.createdAt,
          author: { '@type': 'Person', name: article.author?.name || game.ownerId?.name || 'BCSDLab.' },
          isPartOf: { '@type': 'VideoGame', name: game.name, url: `${siteOrigin}/play/${game.slug}` },
        },
        content: renderGameArticleContent(article, game, siteOrigin),
      }));
    } catch (err) {
      next(err);
    }
  });

  async function renderPlay(req, res, next) {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug }).populate('ownerId', 'name').lean();
      if (!game) return res.status(404).send('Game not found');
      const build = req.params.buildId
        ? await Build.findOne({ _id: req.params.buildId, gameId: game._id }).lean()
        : await Build.findOne({ gameId: game._id, isActive: true }).lean();
      if (!build) return res.status(404).send('Build not found');
      const isPublic = game.visibility === 'public';
      const articles = isPublic
        ? await GameArticle.find({ gameId: game._id, published: true })
          .sort({ publishedAt: -1, createdAt: -1 })
          .select('title slug summary coverImageUrl tags publishedAt createdAt updatedAt')
          .lean()
        : [];
      const shell = await readShell(next);
      if (!shell) return;
      const canonical = `${siteOrigin}/play/${game.slug}`;
      const image = publicImageUrl(game.thumbnailUrl, siteOrigin);
      const reviewSeo = getGameReviewSeoData(game.reviewInfo);
      sendHtml(res, injectSeoHtml(shell, {
        title: `${game.name} — ${SITE_NAME}`,
        description: game.description || DEFAULT_DESCRIPTION,
        image,
        url: canonical,
        robots: isPublic ? 'index,follow' : 'noindex,follow',
        jsonLd: isPublic ? {
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: game.name,
          description: game.description || DEFAULT_DESCRIPTION,
          image,
          url: canonical,
          gamePlatform: 'Web browser',
          applicationCategory: 'Game',
          author: game.ownerId?.name ? { '@type': 'Person', name: game.ownerId.name } : undefined,
          version: build.version || undefined,
          contentRating: reviewSeo.ratingLabel || undefined,
          keywords: reviewSeo.descriptorLabels.length ? reviewSeo.descriptorLabels.join(', ') : undefined,
          additionalProperty: reviewSeo.additionalProperty.length ? reviewSeo.additionalProperty : undefined,
          hasPart: articles.length ? articles.map((article) => ({
            '@type': 'Article',
            headline: article.title,
            description: article.summary || undefined,
            url: `${siteOrigin}/play/${game.slug}/articles/${article.slug}`,
            datePublished: article.publishedAt || article.createdAt,
            dateModified: article.updatedAt || article.publishedAt || article.createdAt,
          })) : undefined,
        } : null,
        content: renderPlayContent(game, build, siteOrigin, articles),
      }), isPublic ? undefined : 'private, no-store');
    } catch (err) {
      next(err);
    }
  }

  router.get('/play/:gameSlug', renderPlay);
  router.get('/play/:gameSlug/:buildId', renderPlay);

  return router;
}

export default seoRouter;
