import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import issuesRouter from './routes/issues.js';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import gameArticlesRouter from './routes/gameArticles.js';
import backendRouter from './routes/backend.js';
import blogRouter from './routes/blog.js';
import translationsRouter from './routes/translations.js';
import seoRouter from './routes/seo.js';
import apiV2Router from './routes/apiV2.js';
import { createBuildFileHandler, createThumbnailFileHandler } from './services/buildFiles.js';
import { startTranslationWorker } from './services/translation/worker.js';
import Translation from './models/Translation.js';
import SiteSettings from './models/SiteSettings.js';

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
app.use('/api/games', backendRouter);
app.use('/api/blog', blogRouter);
app.use('/api/admin/translations', translationsRouter);
app.use('/api/v2', apiV2Router());

app.get('/builds/:buildId/*', createBuildFileHandler(STORAGE_ROOT));
app.get('/thumbnails/:filename', createThumbnailFileHandler(THUMBNAIL_ROOT));

const BLOG_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
};

app.get('/blog-images/:filename', async (req, res, next) => {
  try {
    const fname = req.params.filename;
    if (!fname || fname.includes('..') || fname.includes('/')) return res.status(400).end();
    const filePath = path.join(BLOG_IMAGE_ROOT, fname);
    try { await fs.access(filePath); } catch { return res.status(404).end(); }
    const ext = fname.split('.').pop().toLowerCase();
    res.setHeader('Content-Type', BLOG_IMAGE_MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

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
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

await mongoose.connect(MONGO_URI);
console.log(`[mongo] connected: ${MONGO_URI}`);

const translationWorker = startTranslationWorker();
const stopTranslationWorker = () => translationWorker?.stop?.();
process.once('SIGTERM', stopTranslationWorker);
process.once('SIGINT', stopTranslationWorker);

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
