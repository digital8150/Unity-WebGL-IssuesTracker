import express from 'express';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import User from '../models/User.js';
import GameArticle, { MAX_GAME_ARTICLE_COMMENTS, slugify } from '../models/GameArticle.js';
import Translation from '../models/Translation.js';
import SiteSettings from '../models/SiteSettings.js';
import { optionalAuth, requireAuth, requireApproved } from '../middleware/auth.js';
import { requireTurnstileIfGuest } from '../middleware/turnstile.js';
import { isPublishedTranslation, loadTranslations, mergeTranslation, publicTranslation, publicTranslationMeta, translationPublishEnabled } from '../services/localeContent.js';
import { enqueue } from '../services/translation/queue.js';
import { isAdminUser, sameId, serializeComment } from '../services/comments.js';

const router = express.Router();

function isOwner(game, userId) {
  return String(game.ownerId) === String(userId);
}

function isAuthorized(game, userId) {
  return isOwner(game, userId)
    || game.collaborators.some((collaborator) => String(collaborator?._id ?? collaborator) === String(userId));
}

export function canDeleteGameArticleComment({ comment, userId, game, role } = {}) {
  return role === 'admin'
    || (comment?.authorId && sameId(comment.authorId, userId))
    || (game && (sameId(game.ownerId, userId)
      || (Array.isArray(game.collaborators) && game.collaborators.some((collaborator) => sameId(collaborator, userId)))));
}

export const serializeGameArticleComment = serializeComment;

function serializeGameArticle(article) {
  if (!article) return article;
  const value = article?.toObject ? article.toObject() : { ...article };
  return {
    ...value,
    comments: Array.isArray(value.comments)
      ? value.comments.map((comment) => serializeGameArticleComment(comment))
      : [],
  };
}

function canManageArticle(game, article, user) {
  return user.role === 'admin'
    || isAuthorized(game, user.sub)
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
    const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id name slug description visibility');
    if (!game || game.visibility !== 'public') return res.status(404).json({ error: 'Game not found' });

    const articles = await GameArticle.find({ gameId: game._id, published: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .populate('author', 'name')
      .populate('comments.authorId', 'name')
      .select('-content')
      .lean();
    const serializedArticles = articles.map(serializeGameArticle);
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const gameRow = (await loadTranslations('Game', [game._id], req.query.locale, Translation)).get(String(game._id));
    const articleRows = await loadTranslations('GameArticle', serializedArticles.map((article) => article._id), req.query.locale, Translation);
    const publicGameRow = publicTranslation(gameRow, req.query.locale, publishEnabled);
    const publicArticles = serializedArticles.map((article) => mergeTranslation(article, publicTranslation(articleRows.get(String(article._id)), req.query.locale, publishEnabled), 'GameArticle'));
    const publishedArticleRows = serializedArticles
      .map((article) => articleRows.get(String(article._id)))
      .filter((row) => isPublishedTranslation(row, publishEnabled));
    const listTranslation = req.query.locale === 'en' && publishedArticleRows.length
      ? { origin: publishedArticleRows.some((row) => row.origin === 'machine') ? 'machine' : 'human', translatedAt: null, noindex: false }
      : null;
    res.json({ game: { id: game._id, name: game.name, slug: game.slug, description: mergeTranslation(game.toObject(), publicGameRow, 'Game').description }, articles: publicArticles, translation: listTranslation, gameTranslation: publicTranslationMeta(gameRow, req.query.locale, publishEnabled), translations: Object.fromEntries(serializedArticles.map((article) => [String(article._id), publicTranslationMeta(articleRows.get(String(article._id)), req.query.locale, publishEnabled)])) });
  } catch (err) {
    next(err);
  }
});

router.get('/play/:gameSlug/articles/:articleSlug', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id name slug description visibility');
    if (!game || game.visibility !== 'public') return res.status(404).json({ error: 'Game not found' });

    const article = await GameArticle.findOne({
      gameId: game._id,
      slug: req.params.articleSlug,
      published: true,
    }).populate('author', 'name').populate('comments.authorId', 'name').lean();
    if (!article) return res.status(404).json({ error: 'Article not found' });
    const serializedArticle = serializeGameArticle(article);
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const [gameRow, articleRow] = await Promise.all([
      loadTranslations('Game', [game._id], req.query.locale, Translation),
      loadTranslations('GameArticle', [serializedArticle._id], req.query.locale, Translation),
    ]);
    const gameTranslation = gameRow.get(String(game._id));
    const articleTranslation = articleRow.get(String(serializedArticle._id));
    const translatedGame = mergeTranslation(game.toObject(), publicTranslation(gameTranslation, req.query.locale, publishEnabled), 'Game');
    const translatedArticle = mergeTranslation(serializedArticle, publicTranslation(articleTranslation, req.query.locale, publishEnabled), 'GameArticle');
    res.json({ article: translatedArticle, game: { id: game._id, name: game.name, slug: game.slug, description: translatedGame.description }, translation: publicTranslationMeta(articleTranslation, req.query.locale, publishEnabled) });
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
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        body: commentBody.trim(),
        authorId: req.user?.sub ?? null,
        createdAt: new Date(),
      };
      if (!req.user) {
        comment.authorName = typeof guestName === 'string' && guestName.trim()
          ? guestName.trim()
          : 'Anonymous';
      }
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
      res.status(201).json({ comment: serializeGameArticleComment(comment, req.user?.name || req.user?.email || 'User') });
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
      if (!game) return res.status(404).json({ error: 'Article not found' });
      const article = await GameArticle.findOne({ gameId: game._id, slug: req.params.articleSlug });
      if (!article) return res.status(404).json({ error: 'Article not found' });
      const comment = (article.comments ?? []).find((item) => sameId(item?._id, req.params.commentId));
      if (!comment) return res.status(404).json({ error: 'Comment not found' });
      const admin = await isAdminUser(req);
      if (!canDeleteGameArticleComment({
        comment,
        userId: req.user.sub,
        game,
        role: admin ? 'admin' : req.user.role,
      })) return res.status(403).json({ error: 'Forbidden' });
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
      .populate('comments.authorId', 'name')
      .select('-content')
      .lean();
    const serializedArticles = articles.map(serializeGameArticle);
    const rows = await Translation.find({
      refType: 'GameArticle',
      refId: { $in: serializedArticles.map((article) => article._id) },
      locale: 'en',
    }).select('refId status origin noindex').lean();
    const byRefId = new Map(rows.map((row) => [String(row.refId), row]));
    res.json({
      game: { ...game.toObject() },
      articles: serializedArticles.map((article) => ({
        ...article,
        translationStatus: byRefId.get(String(article._id)) ?? null,
      })),
    });
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
      .populate('comments.authorId', 'name')
      .lean();
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json({ article: serializeGameArticle(article), game: { ...game.toObject() } });
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
    enqueue({ refType: 'GameArticle', refId: post._id, source: post.toObject(), priority: post.published ? 10 : 0 }).catch((error) => console.error('[translation enqueue]', error));
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
      .populate('comments.authorId', 'name')
      .lean();
    const serializedArticle = serializeGameArticle(article);
    enqueue({ refType: 'GameArticle', refId: serializedArticle._id, source: serializedArticle }).catch((error) => console.error('[translation enqueue]', error));
    res.json({ article: serializedArticle });
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
    Translation.deleteOne({ refType: 'GameArticle', refId: article._id, locale: 'en' }).catch((error) => console.error('[translation cleanup]', error));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
