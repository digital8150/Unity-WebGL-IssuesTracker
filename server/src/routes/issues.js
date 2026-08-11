import { Router } from 'express';
import { Issue } from '../models/Issue.js';
import Game from '../models/Game.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { sendDiscordNotification } from '../services/discord.js';

const router = Router();

const ALLOWED_STATUSES  = ['open', 'in-progress', 'resolved', 'closed'];
const ALLOWED_PRIORITIES = ['none', 'low', 'medium', 'high'];

function sameId(left, right) {
  const leftId = left?._id ?? left?.id ?? left;
  const rightId = right?._id ?? right?.id ?? right;
  return leftId !== null && leftId !== undefined
    && rightId !== null && rightId !== undefined
    && String(leftId) === String(rightId);
}

export function canDeleteIssueComment({ comment, userId, game, role } = {}) {
  if (role === 'admin') return true;
  if (comment?.authorId && sameId(comment.authorId, userId)) return true;
  if (!game) return false;
  return sameId(game.ownerId, userId)
    || (Array.isArray(game.collaborators) && game.collaborators.some((collaborator) => sameId(collaborator, userId)));
}

export function serializeIssueComment(comment, fallbackAuthorName = '') {
  if (!comment) return comment;
  const value = comment?.toObject ? comment.toObject() : { ...comment };
  const populatedName = value.authorId && typeof value.authorId === 'object'
    ? String(value.authorId.name ?? '').trim()
    : '';
  const storedName = String(value.authorName ?? '').trim();
  const currentName = value.authorId && String(fallbackAuthorName ?? '').trim();
  const { authorId, ...serialized } = value;
  const publicAuthorId = authorId?._id ?? authorId;
  return {
    ...serialized,
    ...(publicAuthorId ? { authorId: String(publicAuthorId) } : {}),
    authorName: populatedName || currentName || storedName || 'Anonymous',
  };
}

function serializeIssue(issue) {
  if (!issue) return issue;
  const value = issue?.toObject ? issue.toObject() : { ...issue };
  return {
    ...value,
    comments: Array.isArray(value.comments)
      ? value.comments.map((comment) => serializeIssueComment(comment))
      : [],
  };
}

async function isAdminUser(req) {
  if (req.user?.role !== undefined) return req.user.role === 'admin';
  if (!req.user?.sub || User.db.readyState !== 1) return false;
  try {
    const user = await User.findById(req.user.sub).select('role').lean();
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

// ── Create issue (public — testers don't need auth) ───────────────────────────

router.post('/', requireTurnstile, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.title || typeof body.title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const issue = await Issue.create(body);

    // Fire-and-forget — don't block the response on Discord.
    (async () => {
      try {
        const game = issue.gameId ? await Game.findById(issue.gameId).select('discordWebhookUrl').lean() : null;
        await sendDiscordNotification(issue, game?.discordWebhookUrl || '');
      } catch (err) {
        console.warn('[discord] notification failed:', err.message);
      }
    })();

    res.status(201).json({ id: issue._id });
  } catch (err) {
    next(err);
  }
});

// ── List issues ───────────────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const issues = await Issue.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select('title description createdAt productName version status priority tags votes');
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

// ── Get single issue ──────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id).populate('comments.authorId', 'name');
    if (!issue) return res.status(404).json({ error: 'Not found' });
    res.json(serializeIssue(issue));
  } catch (err) {
    next(err);
  }
});

// ── Update triage fields (status / priority / tags) — game owner or collaborator ─

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status, priority, tags } = req.body ?? {};
    const update = {};

    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }
      update.status = status;
    }

    if (priority !== undefined) {
      if (!ALLOWED_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}` });
      }
      update.priority = priority;
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
      update.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const issue = await Issue.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!issue) return res.status(404).json({ error: 'Not found' });
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// ── Toggle vote (any authenticated user) ─────────────────────────────────────

router.post('/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const issue = await Issue.findById(req.params.id).select('votes');
    if (!issue) return res.status(404).json({ error: 'Not found' });

    const alreadyVoted = issue.votes.some((v) => v.toString() === userId);
    const update = alreadyVoted
      ? { $pull:  { votes: userId } }
      : { $addToSet: { votes: userId } };

    const updated = await Issue.findByIdAndUpdate(req.params.id, update, { new: true }).select('votes');
    res.json({
      voteCount: updated.votes.length,
      hasVoted:  !alreadyVoted,
    });
  } catch (err) {
    next(err);
  }
});

// ── Add comment (authenticated users or guests with a name) ──────────────────

router.post('/:id/comments', optionalAuth, async (req, res, next) => {
  try {
    const { body: commentBody, authorName: guestName } = req.body ?? {};
    if (!commentBody || typeof commentBody !== 'string' || !commentBody.trim()) {
      return res.status(400).json({ error: 'Comment body is required' });
    }

    const comment = {
      body: commentBody.trim(),
      authorId: req.user?.sub ?? null,
    };
    if (!req.user) {
      comment.authorName = typeof guestName === 'string' && guestName.trim()
        ? guestName.trim()
        : 'Anonymous';
    }
    const issue = await Issue.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: comment } },
      { new: true },
    ).populate('comments.authorId', 'name');
    if (!issue) return res.status(404).json({ error: 'Not found' });
    const added = issue.comments[issue.comments.length - 1];
    res.status(201).json({ comment: serializeIssueComment(added, req.user?.name || req.user?.email || 'User') });
  } catch (err) {
    next(err);
  }
});

// ── Delete issue (game owner or collaborator only) ───────────────────────────

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id).select('gameId');
    if (!issue) return res.status(404).json({ error: 'Not found' });

    if (issue.gameId) {
      const game = await Game.findById(issue.gameId).select('ownerId collaborators');
      if (game) {
        const userId = req.user.sub;
        const isAuthorized =
          game.ownerId.toString() === userId ||
          game.collaborators.some((c) => c.toString() === userId);
        if (!isAuthorized) return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await Issue.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Delete comment (author, game manager, or admin) ──────────────────────────

router.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id).select('gameId comments');
    if (!issue) return res.status(404).json({ error: 'Not found' });
    const comment = (issue.comments ?? []).find((item) => sameId(item?._id, req.params.commentId));
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const game = issue.gameId
      ? await Game.findById(issue.gameId).select('ownerId collaborators')
      : null;
    const admin = await isAdminUser(req);
    if (!canDeleteIssueComment({ comment, userId: req.user.sub, game, role: admin ? 'admin' : req.user.role })) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Issue.findByIdAndUpdate(
      req.params.id,
      { $pull: { comments: { _id: req.params.commentId } } },
      { new: true },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
