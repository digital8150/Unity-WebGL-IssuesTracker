import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import multer from 'multer';
import BlogPost from '../models/BlogPost.js';
import { requireAuth, requireApproved, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { requireTurnstileIfGuest } from '../middleware/turnstile.js';
import { BLOG_IMAGE_MAX_BYTES, convertGifToMp4 } from '../services/blogMedia.js';
import Translation from '../models/Translation.js';
import SiteSettings from '../models/SiteSettings.js';
import { loadTranslations, mergeTranslation, publicTranslation, publicTranslationMeta, translationPublishEnabled } from '../services/localeContent.js';
import { enqueue } from '../services/translation/queue.js';

const router = express.Router();
const BLOG_IMAGE_ROOT = path.resolve('storage', 'blog-images');
const blogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BLOG_IMAGE_MAX_BYTES },
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseBlogImageUpload(req, res, next) {
  blogUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum image size is 10MB.' });
    }
    return next(err);
  });
}

// ── Public routes ─────────────────────────────────────────────────────────────

// GET /api/blog — list published posts (paginated)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const tag = req.query.tag;
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const filter = { published: true };
    if (tag) filter.tags = tag;
    if (query) {
      const safeQuery = new RegExp(escapeRegex(query), 'i');
      filter.$or = [{ title: safeQuery }, { summary: safeQuery }];
    }

    const [posts, total] = await Promise.all([
      BlogPost.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'name')
        .select('-content')
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const rows = await loadTranslations('BlogPost', posts.map((post) => post._id), req.query.locale, Translation);
    const translatedPosts = posts.map((post) => mergeTranslation(post, publicTranslation(rows.get(String(post._id)), req.query.locale, publishEnabled), 'BlogPost'));
    const translations = Object.fromEntries(posts.map((post) => [String(post._id), publicTranslationMeta(rows.get(String(post._id)), req.query.locale, publishEnabled)]));
    res.json({ posts: translatedPosts, translation: translations, translations, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/blog/:slug — get single published post by slug
router.get('/:slug', async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, published: true })
      .populate('author', 'name')
      .lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const row = (await loadTranslations('BlogPost', [post._id], req.query.locale, Translation)).get(String(post._id));
    res.json({ post: mergeTranslation(post, publicTranslation(row, req.query.locale, publishEnabled), 'BlogPost'), translation: publicTranslationMeta(row, req.query.locale, publishEnabled) });
  } catch (err) {
    next(err);
  }
});

// ── Public comment routes ─────────────────────────────────────────────────────

// POST /api/blog/:slug/comments — add comment (optionalAuth; guests need Turnstile)
router.post(
  '/:slug/comments',
  optionalAuth,
  requireTurnstileIfGuest,
  async (req, res, next) => {
    try {
      const { body: commentBody, authorName: guestName } = req.body ?? {};
      if (!commentBody || typeof commentBody !== 'string' || !commentBody.trim()) {
        return res.status(400).json({ error: 'Comment body is required' });
      }

      const authorName = req.user
        ? (req.user.name || req.user.email || 'User')
        : (typeof guestName === 'string' && guestName.trim() ? guestName.trim() : 'Anonymous');

      const post = await BlogPost.findOneAndUpdate(
        { slug: req.params.slug, published: true },
        { $push: { comments: { body: commentBody.trim(), authorName } } },
        { new: true },
      ).select('comments');

      if (!post) return res.status(404).json({ error: 'Post not found' });
      const added = post.comments[post.comments.length - 1];
      res.status(201).json({ comment: added });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/blog/:slug/comments/:commentId — delete comment (requireAuth)
router.delete(
  '/:slug/comments/:commentId',
  requireAuth,
  async (req, res, next) => {
    try {
      const post = await BlogPost.findOneAndUpdate(
        { slug: req.params.slug },
        { $pull: { comments: { _id: req.params.commentId } } },
        { new: true },
      );
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Admin routes ──────────────────────────────────────────────────────────────

// POST /api/blog/admin/upload-image — upload image for blog
router.post(
  '/admin/upload-image',
  requireAuth, requireApproved,
  parseBlogImageUpload,
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const mimeToExt = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const ext = mimeToExt[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: 'Unsupported image type' });

      await fs.mkdir(BLOG_IMAGE_ROOT, { recursive: true });

      const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fname = `${baseName}.${ext === 'gif' ? 'mp4' : ext}`;
      const filePath = path.join(BLOG_IMAGE_ROOT, fname);

      try {
        if (ext === 'gif') await convertGifToMp4(req.file.buffer, filePath);
        else await fs.writeFile(filePath, req.file.buffer);
      } catch (err) {
        if (err.code === 'FFMPEG_NOT_FOUND') {
          return res.status(503).json({ error: 'GIF conversion is temporarily unavailable.' });
        }
        throw err;
      }

      res.json({
        imageUrl: `/blog-images/${fname}`,
        mediaType: ext === 'gif' ? 'video/mp4' : req.file.mimetype,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/blog/admin/posts — list posts; admins see all, others see own
router.get(
  '/admin/posts',
  requireAuth, requireApproved,
  async (req, res, next) => {
    try {
      const filter = req.user.role === 'admin' ? {} : { author: req.user.sub };
      const posts = await BlogPost.find(filter)
        .sort({ createdAt: -1 })
        .populate('author', 'name')
        .select('-content')
        .lean();
      const rows = await Translation.find({
        refType: 'BlogPost',
        refId: { $in: posts.map((post) => post._id) },
        locale: 'en',
      }).select('refId status origin noindex').lean();
      const byRefId = new Map(rows.map((row) => [String(row.refId), row]));
      res.json({
        posts: posts.map((post) => ({
          ...post,
          translationStatus: byRefId.get(String(post._id)) ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/blog/admin/posts/:id — get full post by id (own or admin)
router.get(
  '/admin/posts/:id',
  requireAuth, requireApproved,
  async (req, res, next) => {
    try {
      const post = await BlogPost.findById(req.params.id).populate('author', 'name').lean();
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (req.user.role !== 'admin' && String(post.author?._id ?? post.author) !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.json({ post });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/blog/admin/posts — create post (any approved user)
router.post(
  '/admin/posts',
  requireAuth, requireApproved,
  async (req, res, next) => {
    try {
      const { title, slug, summary, content, coverImageUrl, tags, published } = req.body;

      // Ensure slug uniqueness with suffix if needed
      let finalSlug = slug || title?.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s]+/g, '-');
      let attempt = 0;
      while (true) {
        const existing = await BlogPost.findOne({ slug: attempt === 0 ? finalSlug : `${finalSlug}-${attempt}` });
        if (!existing) {
          if (attempt > 0) finalSlug = `${finalSlug}-${attempt}`;
          break;
        }
        attempt++;
      }

      const post = new BlogPost({
        title,
        slug: finalSlug,
        summary,
        content,
        coverImageUrl,
        tags: tags || [],
        published: !!published,
        publishedAt: published ? new Date() : null,
        author: req.user.sub,
      });
      await post.save();
      enqueue({ refType: 'BlogPost', refId: post._id, source: post.toObject(), priority: post.published ? 10 : 0 }).catch((error) => console.error('[translation enqueue]', error));
      res.status(201).json({ post });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
      next(err);
    }
  },
);

// PATCH /api/blog/admin/posts/:id — update post (own or admin)
router.patch(
  '/admin/posts/:id',
  requireAuth, requireApproved,
  async (req, res, next) => {
    try {
      const existing = await BlogPost.findById(req.params.id).select('author publishedAt');
      if (!existing) return res.status(404).json({ error: 'Post not found' });
      if (req.user.role !== 'admin' && String(existing.author) !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const allowed = ['title', 'slug', 'summary', 'content', 'coverImageUrl', 'tags', 'published'];
      const updates = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }

      if (updates.published === true && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }

      const post = await BlogPost.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
        .populate('author', 'name')
        .lean();
      enqueue({ refType: 'BlogPost', refId: post._id, source: post }).catch((error) => console.error('[translation enqueue]', error));
      res.json({ post });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
      next(err);
    }
  },
);

// DELETE /api/blog/admin/posts/:id — delete post (own or admin)
router.delete(
  '/admin/posts/:id',
  requireAuth, requireApproved,
  async (req, res, next) => {
    try {
      const post = await BlogPost.findById(req.params.id).select('author');
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (req.user.role !== 'admin' && String(post.author) !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await post.deleteOne();
      Translation.deleteOne({ refType: 'BlogPost', refId: post._id, locale: 'en' }).catch((error) => console.error('[translation cleanup]', error));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
