import express from 'express';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import GameArticle, { MAX_GAME_ARTICLE_COMMENTS, slugify } from '../models/GameArticle.js';
import { optionalAuth, requireAuth, requireApproved } from '../middleware/auth.js';
import { requireTurnstileIfGuest } from '../middleware/turnstile.js';

const router = express.Router();

function isOwner(game, userId) {
  return String(game.ownerId) === String(userId);
}

function isAuthorized(game, userId) {
  return isOwner(game, userId)
    || game.collaborators.some((collaborator) => String(collaborator?._id ?? collaborator) === String(userId));
}

function canManageArticle(game, article, user) {
  return user.role === 'admin'
    || isOwner(game, user.sub)
    || String(article.author) === String(user.sub);
}

async function findGameForUser(gameId, userId) {
  if (!mongoose.isValidObjectId(gameId)) return null;
  const game = await Game.findById(gameId).select('ownerId collaborators name slug');
  return game && isAuthorized(game, userId) ? game : null;
}

function normalizeArticleInput(body = {}) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    slug: typeof body.slug === 'string' ? body.slug.trim() : '',
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
    content: typeof body.content === 'string' ? body.content : '',
    coverImageUrl: typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '',
    tags: Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : [],
    published: Boolean(body.published),
  };
}

async function uniqueSlug(gameId, requestedSlug, title, excludeId = null) {
  const base = slugify(requestedSlug || title) || `article-${Date.now()}`;
  let candidate = base;
  let suffix = 0;
  while (await GameArticle.exists({
    gameId,
    slug: candidate,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })) {
    candidate = `${base}-${++suffix}`;
  }
  return candidate;
}

// ── Public game article routes ──────────────────────────────────────────────

router.get('/play/:gameSlug/articles', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id name slug visibility');
    if (!game || game.visibility !== 'public') return res.status(404).json({ error: 'Game not found' });

    const articles = await GameArticle.find({ gameId: game._id, published: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .populate('author', 'name')
      .select('-content')
      .lean();
    res.json({ game: { id: game._id, name: game.name, slug: game.slug }, articles });
  } catch (err) {
    next(err);
  }
});

router.get('/play/:gameSlug/articles/:articleSlug', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id name slug visibility');
    if (!game || game.visibility !== 'public') return res.status(404).json({ error: 'Game not found' });

    const article = await GameArticle.findOne({
      gameId: game._id,
      slug: req.params.articleSlug,
      published: true,
    }).populate('author', 'name').lean();
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json({ article, game: { id: game._id, name: game.name, slug: game.slug } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/play/:gameSlug/articles/:articleSlug/comments',
  optionalAuth,
  requireTurnstileIfGuest,
  async (req, res, next) => {
    try {
      const { body: commentBody, authorName: guestName } = req.body ?? {};
      if (!commentBody || typeof commentBody !== 'string' || !commentBody.trim()) {
        return res.status(400).json({ error: 'Comment body is required' });
      }

      const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id');
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const authorName = req.user
        ? (typeof req.user.name === 'string' && req.user.name.trim() ? req.user.name.trim() : 'User')
        : (typeof guestName === 'string' && guestName.trim() ? guestName.trim() : 'Anonymous');
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        body: commentBody.trim(),
        authorName,
        createdAt: new Date(),
      };
      const article = await GameArticle.findOneAndUpdate(
        {
          gameId: game._id,
          slug: req.params.articleSlug,
          published: true,
          $expr: { $lt: [{ $size: { $ifNull: ['$comments', []] } }, MAX_GAME_ARTICLE_COMMENTS] },
        },
        { $push: { comments: comment } },
        { new: false },
      ).select('_id');
      if (!article) {
        const exists = await GameArticle.exists({
          gameId: game._id,
          slug: req.params.articleSlug,
          published: true,
        });
        if (!exists) return res.status(404).json({ error: 'Article not found' });
        return res.status(409).json({ error: 'Article comment limit reached' });
      }
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/play/:gameSlug/articles/:articleSlug/comments/:commentId',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.commentId)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
      }
      const game = await Game.findOne({ slug: req.params.gameSlug }).select('ownerId collaborators');
      if (!game || !isAuthorized(game, req.user.sub)) return res.status(404).json({ error: 'Article not found' });
      const article = await GameArticle.findOne({ gameId: game._id, slug: req.params.articleSlug });
      if (!article || !canManageArticle(game, article, req.user)) return res.status(403).json({ error: 'Forbidden' });
      await article.updateOne({ $pull: { comments: { _id: req.params.commentId } } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Dashboard game article CMS ──────────────────────────────────────────────

router.get('/:gameId/articles', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await findGameForUser(req.params.gameId, req.user.sub);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const articles = await GameArticle.find({ gameId: game._id })
      .sort({ createdAt: -1 })
      .populate('author', 'name')
      .select('-content')
      .lean();
    res.json({ game: { ...game.toObject() }, articles });
  } catch (err) {
    next(err);
  }
});

router.get('/:gameId/articles/:articleId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }
    const game = await findGameForUser(req.params.gameId, req.user.sub);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const article = await GameArticle.findOne({ _id: req.params.articleId, gameId: game._id })
      .populate('author', 'name')
      .lean();
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json({ article, game: { ...game.toObject() } });
  } catch (err) {
    next(err);
  }
});

router.post('/:gameId/articles', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await findGameForUser(req.params.gameId, req.user.sub);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const input = normalizeArticleInput(req.body);
    if (!input.title) return res.status(400).json({ error: 'title is required' });

    const post = await GameArticle.create({
      ...input,
      gameId: game._id,
      slug: await uniqueSlug(game._id, input.slug, input.title),
      publishedAt: input.published ? new Date() : null,
      author: req.user.sub,
    });
    await post.populate('author', 'name');
    res.status(201).json({ article: post });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
    next(err);
  }
});

router.patch('/:gameId/articles/:articleId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }
    const game = await findGameForUser(req.params.gameId, req.user.sub);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const existing = await GameArticle.findOne({ _id: req.params.articleId, gameId: game._id });
    if (!existing) return res.status(404).json({ error: 'Article not found' });
    if (!canManageArticle(game, existing, req.user)) return res.status(403).json({ error: 'Forbidden' });

    const input = normalizeArticleInput({ ...existing.toObject(), ...req.body });
    if (!input.title) return res.status(400).json({ error: 'title is required' });
    const updates = {
      ...input,
      slug: await uniqueSlug(game._id, input.slug, input.title, existing._id),
    };
    if (input.published && !existing.publishedAt) updates.publishedAt = new Date();
    const article = await GameArticle.findByIdAndUpdate(existing._id, updates, { new: true, runValidators: true })
      .populate('author', 'name')
      .lean();
    res.json({ article });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
    next(err);
  }
});

router.delete('/:gameId/articles/:articleId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }
    const game = await findGameForUser(req.params.gameId, req.user.sub);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const article = await GameArticle.findOne({ _id: req.params.articleId, gameId: game._id });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    if (!canManageArticle(game, article, req.user)) return res.status(403).json({ error: 'Forbidden' });
    await article.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
