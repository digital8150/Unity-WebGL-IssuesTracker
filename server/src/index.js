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
import backendRouter from './routes/backend.js';
import blogRouter from './routes/blog.js';
import BlogPost from './models/BlogPost.js';
import Game from './models/Game.js';
import Build from './models/Build.js';

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
// `verify` captures the exact raw bytes of the request body so the game-backend
// HMAC middleware can hash precisely what the client signed (JSON.stringify of
// the parsed body could re-serialize differently than what was sent).
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/games', backendRouter);
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

// ── Serve blog images ─────────────────────────────────────────────────────────

const BLOG_IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

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

// ── Blog post OG injection for crawlers (must come before static/SPA fallback) ─
// Crawlers don't execute JS, so useDocumentMeta never runs for them.
// This route reads the built index.html and injects per-post meta tags server-side.

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function injectOgTag(html, attrType, key, newContent) {
  return html.replace(
    new RegExp(`(<meta\\s+${attrType}="${key}"[^>]+content=")[^"]*(")`),
    `$1${newContent}$2`,
  );
}

app.get('/blog/:slug', async (req, res, next) => {
  try {
    let html;
    try {
      html = await fs.readFile(`${DIST_ROOT}/index.html`, 'utf8');
    } catch {
      return next(); // dist not built yet (dev mode) — fall through
    }

    const post = await BlogPost.findOne({ slug: req.params.slug, published: true }).lean();
    if (post) {
      const title     = escapeAttr(`${post.title} — BCSDLab. Arcade`);
      const desc      = escapeAttr(post.summary || '');
      const image     = post.coverImageUrl
        ? (post.coverImageUrl.startsWith('http') ? post.coverImageUrl : `${SITE_ORIGIN}${post.coverImageUrl}`)
        : `${SITE_ORIGIN}/bcsd_main_page_image.webp`;
      const canonical = `${SITE_ORIGIN}/blog/${post.slug}`;

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
      html = injectOgTag(html, 'name',     'description',       desc);
      html = injectOgTag(html, 'property', 'og:title',          title);
      html = injectOgTag(html, 'property', 'og:description',    desc);
      html = injectOgTag(html, 'property', 'og:image',          image);
      html = injectOgTag(html, 'property', 'og:url',            canonical);
      html = injectOgTag(html, 'property', 'og:type',           'article');
      html = injectOgTag(html, 'name',     'twitter:title',     title);
      html = injectOgTag(html, 'name',     'twitter:description', desc);
      html = injectOgTag(html, 'name',     'twitter:image',     image);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// ── Play page OG injection for crawlers (must come before static/SPA fallback) ─

async function renderPlayMeta(req, res, next) {
  try {
    let html;
    try {
      html = await fs.readFile(`${DIST_ROOT}/index.html`, 'utf8');
    } catch {
      return next(); // dist not built yet (dev mode) — fall through
    }

    const game = await Game.findOne({ slug: req.params.gameSlug }).lean();
    if (game) {
      const build = req.params.buildId
        ? await Build.findOne({ _id: req.params.buildId, gameId: game._id }).lean()
        : await Build.findOne({ gameId: game._id, isActive: true }).lean();

      const title     = escapeAttr(`${game.name} — BCSDLab. Arcade`);
      const desc      = escapeAttr(game.description || '브라우저에서 바로 플레이하고, 버그·제안을 제출하세요.');
      const image     = game.thumbnailUrl
        ? (game.thumbnailUrl.startsWith('http') ? game.thumbnailUrl : `${SITE_ORIGIN}${game.thumbnailUrl}`)
        : `${SITE_ORIGIN}/bcsd_main_page_image.webp`;
      const canonical = `${SITE_ORIGIN}/play/${game.slug}${build && req.params.buildId ? `/${build._id}` : ''}`;

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
      html = injectOgTag(html, 'name',     'description',       desc);
      html = injectOgTag(html, 'property', 'og:title',          title);
      html = injectOgTag(html, 'property', 'og:description',    desc);
      html = injectOgTag(html, 'property', 'og:image',          image);
      html = injectOgTag(html, 'property', 'og:url',            canonical);
      html = injectOgTag(html, 'property', 'og:type',           'website');
      html = injectOgTag(html, 'name',     'twitter:title',     title);
      html = injectOgTag(html, 'name',     'twitter:description', desc);
      html = injectOgTag(html, 'name',     'twitter:image',     image);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

app.get('/play/:gameSlug', renderPlayMeta);
app.get('/play/:gameSlug/:buildId', renderPlayMeta);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

await mongoose.connect(MONGO_URI);
console.log(`[mongo] connected: ${MONGO_URI}`);

app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
