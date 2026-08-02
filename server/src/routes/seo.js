import express from 'express';
import fs from 'node:fs/promises';
import BlogPost from '../models/BlogPost.js';
import GameArticle from '../models/GameArticle.js';
import Build from '../models/Build.js';
import Game from '../models/Game.js';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE_PATH,
  SITE_NAME,
  absoluteUrl,
  escapeXml,
  formatDate,
  getGameReviewSeoData,
  injectSeoHtml,
  publicImageUrl,
  renderArcadeContent,
  renderBlogListContent,
  renderBlogPostContent,
  renderHomeContent,
  renderPlayContent,
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
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
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

  router.get('/play/:gameSlug/articles/:articleSlug', async (req, res, next) => {
    try {
      const game = await Game.findOne({ slug: req.params.gameSlug }).populate('ownerId', 'name').lean();
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
        robots: game.visibility === 'public' ? 'index,follow' : 'noindex,follow',
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
        content: renderBlogPostContent(article, siteOrigin),
      }), game.visibility === 'public' ? undefined : 'private, no-store');
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
