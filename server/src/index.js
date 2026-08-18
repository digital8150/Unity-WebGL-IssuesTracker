import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import issuesRouter from './routes/issues.js';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import gameContentRouter, { CONTENT_ROOT, contentCors } from './routes/gameContent.js';
import gameArticlesRouter from './routes/gameArticles.js';
import backendRouter from './routes/backend.js';
import blogRouter from './routes/blog.js';
import translationsRouter from './routes/translations.js';
import seoRouter from './routes/seo.js';
import apiV2Router from './routes/apiV2.js';
import { createBlogImageFileHandler, createBuildFileHandler, createContentFileHandler, createThumbnailFileHandler } from './services/buildFiles.js';
import { startTranslationWorker } from './services/translation/worker.js';
import Translation from './models/Translation.js';
import SiteSettings from './models/SiteSettings.js';
import { publicErrorBody } from './services/errorResponse.js';

const {
  PORT = 4000,
  MONGO_URI = 'mongodb://localhost:27017/issue_tracker',
  CORS_ORIGIN = 'http://localhost:5173',
  JWT_SECRET = 'dev-secret-change-in-production',
  SITE_ORIGIN = 'https://arcade.codingbot.kr',
} = process.env;

if (JWT_SECRET === 'dev-secret-change-in-production' && process.env.NODE_ENV === 'production') {
  console.warn('[warn] JWT_SECRET is not set — set it before deploying!');
}

const STORAGE_ROOT = path.resolve('storage', 'builds');
const DIST_ROOT = path.resolve('../web/dist');
const THUMBNAIL_ROOT = path.resolve('storage', 'thumbnails');
const BLOG_IMAGE_ROOT = path.resolve('storage', 'blog-images');
await fs.mkdir(STORAGE_ROOT, { recursive: true });
await fs.mkdir(CONTENT_ROOT, { recursive: true });
await fs.mkdir(THUMBNAIL_ROOT, { recursive: true });
await fs.mkdir(BLOG_IMAGE_ROOT, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/games', gameArticlesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/games', gameContentRouter);
app.use('/api/games', backendRouter);
app.use('/api/blog', blogRouter);
app.use('/api/admin/translations', translationsRouter);
app.use('/api/v2', apiV2Router());

app.get('/builds/:buildId/*', createBuildFileHandler(STORAGE_ROOT));
// Per-game allowed origins (Game.allowedOrigins) let a WebGL player hosted
// elsewhere (e.g. GitHub Pages) fetch this game's Addressables content
// cross-origin; see contentCors in routes/gameContent.js for the policy.
app.options('/content/:gameId/:channel/*', contentCors);
app.get('/content/:gameId/:channel/*', contentCors, createContentFileHandler(CONTENT_ROOT));
app.get('/thumbnails/:filename', createThumbnailFileHandler(THUMBNAIL_ROOT));

app.get('/blog-images/:filename', createBlogImageFileHandler(BLOG_IMAGE_ROOT));

// Public SEO pages must be mounted before Apache's static SPA fallback.
app.use(seoRouter({
  distRoot: DIST_ROOT,
  siteOrigin: SITE_ORIGIN,
  models: { Translation, SiteSettings },
}));

// Preview containers own the web build as well as the API. Production keeps
// serving the SPA from Apache, so this is opt-in and does not change the
// production request path.
if (process.env.SERVE_STATIC === 'true') {
  app.use(express.static(DIST_ROOT));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api/')
      || req.path.startsWith('/builds/')
      || req.path.startsWith('/content/')
      || req.path.startsWith('/thumbnails/')
      || req.path.startsWith('/blog-images/')
    ) {
      return next();
    }
    res.sendFile(path.join(DIST_ROOT, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json(publicErrorBody(err));
});

await mongoose.connect(MONGO_URI);
console.log(`[mongo] connected: ${MONGO_URI}`);

const translationWorker = startTranslationWorker();
const stopTranslationWorker = () => translationWorker?.stop?.();
process.once('SIGTERM', stopTranslationWorker);
process.once('SIGINT', stopTranslationWorker);

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
