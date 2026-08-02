import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import issuesRouter from './routes/issues.js';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import gameArticlesRouter from './routes/gameArticles.js';
import backendRouter from './routes/backend.js';
import blogRouter from './routes/blog.js';
import seoRouter from './routes/seo.js';

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

function baseMime(filename) {
  if (filename.endsWith('.wasm')) return 'application/wasm';
  if (filename.endsWith('.data')) return 'application/octet-stream';
  if (filename.endsWith('.js')) return 'application/javascript';
  if (filename.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

app.get('/builds/:buildId/*', async (req, res, next) => {
  try {
    const filename = req.params[0];
    if (!filename || filename.includes('..')) return res.status(400).end();
    const filePath = path.join(STORAGE_ROOT, req.params.buildId, filename);
    try { await fs.access(filePath); } catch { return res.status(404).end(); }
    const bare = filename.replace(/\.(br|gz)$/, '');
    const encoding = filename.endsWith('.br') ? 'br' : filename.endsWith('.gz') ? 'gzip' : null;
    res.setHeader('Content-Type', baseMime(bare));
    if (encoding) res.setHeader('Content-Encoding', encoding);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

const THUMB_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

app.get('/thumbnails/:filename', async (req, res, next) => {
  try {
    const fname = req.params.filename;
    if (!fname || fname.includes('..') || fname.includes('/')) return res.status(400).end();
    const filePath = path.join(THUMBNAIL_ROOT, fname);
    try { await fs.access(filePath); } catch { return res.status(404).end(); }
    const ext = fname.split('.').pop().toLowerCase();
    res.setHeader('Content-Type', THUMB_MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

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
app.use(seoRouter({ distRoot: DIST_ROOT, siteOrigin: SITE_ORIGIN }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

await mongoose.connect(MONGO_URI);
console.log(`[mongo] connected: ${MONGO_URI}`);

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
