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
import blogRouter from './routes/blog.js';

const {
  PORT = 4000,
  MONGO_URI = 'mongodb://localhost:27017/issue_tracker',
  CORS_ORIGIN = 'http://localhost:5173',
  JWT_SECRET = 'dev-secret-change-in-production',
} = process.env;

if (JWT_SECRET === 'dev-secret-change-in-production' && process.env.NODE_ENV === 'production') {
  console.warn('[warn] JWT_SECRET is not set — set it before deploying!');
}

const STORAGE_ROOT = path.resolve('storage', 'builds');
const THUMBNAIL_ROOT = path.resolve('storage', 'thumbnails');
await fs.mkdir(STORAGE_ROOT, { recursive: true });
await fs.mkdir(THUMBNAIL_ROOT, { recursive: true });

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/blog', blogRouter);

// ── Serve Unity build files ───────────────────────────────────────────────────

function baseMime(f) {
  if (f.endsWith('.wasm')) return 'application/wasm';
  if (f.endsWith('.data')) return 'application/octet-stream';
  if (f.endsWith('.js')) return 'application/javascript';
  if (f.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

app.get('/builds/:buildId/*', async (req, res, next) => {
  try {
    const filename = req.params[0];
    if (!filename || filename.includes('..')) return res.status(400).end();
    const filePath = path.join(STORAGE_ROOT, req.params.buildId, filename);
    try { await fs.access(filePath); } catch { return res.status(404).end(); }
    const bare = filename.replace(/\.(br|gz)$/, '');
    const contentType = baseMime(bare);
    const encoding = filename.endsWith('.br') ? 'br' : filename.endsWith('.gz') ? 'gzip' : null;
    res.setHeader('Content-Type', contentType);
    if (encoding) res.setHeader('Content-Encoding', encoding);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

// ── Serve game thumbnails ────────────────────────────────────────────────────

const THUMB_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

app.get('/thumbnails/:filename', async (req, res, next) => {
  try {
    const fname = req.params.filename;
    if (!fname || fname.includes('..') || fname.includes('/')) return res.status(400).end();
    const filePath = path.join(THUMBNAIL_ROOT, fname);
    try { await fs.access(filePath); } catch { return res.status(404).end(); }
    const ext = fname.split('.').pop();
    res.setHeader('Content-Type', THUMB_MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

await mongoose.connect(MONGO_URI);
console.log(`[mongo] connected: ${MONGO_URI}`);

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
