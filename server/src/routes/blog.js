import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import multer from 'multer';
import BlogPost from '../models/BlogPost.js';
import { requireAuth, requireApproved, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const BLOG_IMAGE_ROOT = path.resolve('storage', 'blog-images');
const blogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ── Public routes ─────────────────────────────────────────────────────────────

// GET /api/blog — list published posts (paginated)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const tag = req.query.tag;

    const filter = { published: true };
    if (tag) filter.tags = tag;

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

    res.json({ posts, total, page, limit, pages: Math.ceil(total / limit) });
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
    res.json({ post });
  } catch (err) {
    next(err);
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// POST /api/blog/admin/upload-image — upload image for blog
router.post(
  '/admin/upload-image',
  requireAuth, requireApproved, requireAdmin,
  blogUpload.single('file'),
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

      const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await fs.writeFile(path.join(BLOG_IMAGE_ROOT, fname), req.file.buffer);

      res.json({ imageUrl: `/blog-images/${fname}` });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/blog/admin/posts — list ALL posts (draft + published) for admin
router.get(
  '/admin/posts',
  requireAuth, requireApproved, requireAdmin,
  async (req, res, next) => {
    try {
      const posts = await BlogPost.find()
        .sort({ createdAt: -1 })
        .populate('author', 'name')
        .select('-content')
        .lean();
      res.json({ posts });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/blog/admin/posts/:id — get full post by id (admin)
router.get(
  '/admin/posts/:id',
  requireAuth, requireApproved, requireAdmin,
  async (req, res, next) => {
    try {
      const post = await BlogPost.findById(req.params.id).populate('author', 'name').lean();
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ post });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/blog/admin/posts — create post
router.post(
  '/admin/posts',
  requireAuth, requireApproved, requireAdmin,
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
      res.status(201).json({ post });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
      next(err);
    }
  },
);

// PATCH /api/blog/admin/posts/:id — update post
router.patch(
  '/admin/posts/:id',
  requireAuth, requireApproved, requireAdmin,
  async (req, res, next) => {
    try {
      const allowed = ['title', 'slug', 'summary', 'content', 'coverImageUrl', 'tags', 'published'];
      const updates = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }

      // Set publishedAt when publishing for first time
      if (updates.published === true) {
        const existing = await BlogPost.findById(req.params.id).select('publishedAt');
        if (existing && !existing.publishedAt) updates.publishedAt = new Date();
      }

      const post = await BlogPost.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
        .populate('author', 'name')
        .lean();
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ post });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
      next(err);
    }
  },
);

// DELETE /api/blog/admin/posts/:id — delete post
router.delete(
  '/admin/posts/:id',
  requireAuth, requireApproved, requireAdmin,
  async (req, res, next) => {
    try {
      const post = await BlogPost.findByIdAndDelete(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
