import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import multer from 'multer';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
import Game, { GAME_CONTENT_DESCRIPTOR_KEYS, GAME_RATING_KEYS } from '../models/Game.js';
import Build, { detectRole } from '../models/Build.js';
import { Issue } from '../models/Issue.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth, requireApproved } from '../middleware/auth.js';

const router = Router();

const LEGACY_RATING_ALIASES = {
  '전체이용가': 'all',
  '전체 이용가': 'all',
  '12세이용가': 'over12',
  '12세 이용가': 'over12',
  '15세이용가': 'over15',
  '15세 이용가': 'over15',
  '청소년이용불가': 'over18',
  '청소년 이용불가': 'over18',
};

function normalizeGameRating(value) {
  const raw = String(value ?? '').trim();
  return GAME_RATING_KEYS.includes(raw) ? raw : (LEGACY_RATING_ALIASES[raw] ?? '');
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});
const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function moveFile(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.rm(src, { force: true });
    } else {
      throw err;
    }
  }
}

const STORAGE_ROOT = path.resolve('storage', 'builds');
const THUMBNAIL_ROOT = path.resolve('storage', 'thumbnails');

async function ensureBuildDir(buildId) {
  const dir = path.join(STORAGE_ROOT, String(buildId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Extracts a StreamingAssets zip into `<buildDir>/StreamingAssets/`, preserving
// nested folder structure. Returns { relPaths, totalBytes } where relPaths are
// paths relative to buildDir (e.g. "StreamingAssets/sub/data.json").
async function extractStreamingAssetsZip(zipPath, buildDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  // If every entry shares one common top-level folder named "streamingassets",
  // the developer zipped the folder itself — strip that one wrapper so we don't
  // end up with StreamingAssets/StreamingAssets/....
  const firstSegments = entries.map((e) => e.entryName.split('/')[0]);
  const stripWrapper =
    entries.length > 0 &&
    firstSegments.every((seg) => seg.toLowerCase() === 'streamingassets');

  const destRoot = path.join(buildDir, 'StreamingAssets');
  const relPaths = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const rawParts = entry.entryName.split('/').filter(Boolean);
    const parts = stripWrapper ? rawParts.slice(1) : rawParts;
    if (!parts.length || parts.some((p) => p === '..' || p === '.')) continue;

    const relPath = path.posix.join(...parts);
    const dest = path.join(destRoot, ...parts);
    if (!dest.startsWith(destRoot + path.sep) && dest !== destRoot) continue; // zip-slip guard

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.getData());
    const stat = await fs.stat(dest);
    totalBytes += stat.size;
    relPaths.push(path.posix.join('StreamingAssets', relPath));
  }

  return { relPaths, totalBytes };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isOwner(game, userId) {
  return game.ownerId.toString() === String(userId);
}

function isAuthorized(game, userId) {
  if (isOwner(game, userId)) return true;
  return game.collaborators.some((c) => (c._id ?? c).toString() === String(userId));
}

// ── Public Arcade gallery ────────────────────────────────────────────────────
// Listed before authenticated routes so the path resolves first.

router.get('/arcade', async (_req, res, next) => {
  try {
    const games = await Game.find({ visibility: 'public' })
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name')
      .select('name slug description thumbnailUrl ownerId updatedAt')
      .lean();

    // Only include games that actually have an active build to play.
    const withBuilds = await Promise.all(
      games.map(async (g) => {
        const build = await Build.findOne({ gameId: g._id, isActive: true })
          .select('_id version createdAt')
          .lean();
        if (!build) return null;
        return {
          id: g._id,
          name: g.name,
          slug: g.slug,
          description: g.description ?? '',
          thumbnailUrl: g.thumbnailUrl ?? '',
          developerName: g.ownerId?.name ?? null,
          updatedAt: g.updatedAt,
          latestBuildVersion: build.version || null,
        };
      }),
    );
    res.json({ games: withBuilds.filter(Boolean) });
  } catch (err) {
    next(err);
  }
});

// ── Game CRUD ─────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const uid = new mongoose.Types.ObjectId(req.user.sub);
    const games = await Game.find({
      $or: [{ ownerId: uid }, { collaborators: uid }],
    })
      .sort({ createdAt: -1 })
      .populate('collaborators', 'name email');

    const tagged = games.map((g) => ({
      ...g.toObject(),
      isOwner: isOwner(g, req.user.sub),
    }));
    res.json({ games: tagged });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const { name, discordWebhookUrl } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const slug = await Game.generateSlug(name);
    const game = await Game.create({
      name: name.trim(),
      slug,
      ownerId: req.user.sub,
      discordWebhookUrl: discordWebhookUrl || '',
    });
    res.status(201).json({ game: { ...game.toObject(), isOwner: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/:gameId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('collaborators', 'name email');
    if (!game || !isAuthorized(game, req.user.sub)) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const builds = await Build.find({ gameId: game._id }).sort({ createdAt: -1 });
    res.json({ game: { ...game.toObject(), isOwner: isOwner(game, req.user.sub) }, builds });
  } catch (err) {
    next(err);
  }
});

// Settings update — owner only
router.patch('/:gameId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const { name, discordWebhookUrl, visibility, description, reviewInfo } = req.body;
    if (name !== undefined) game.name = name;
    if (discordWebhookUrl !== undefined) game.discordWebhookUrl = discordWebhookUrl;
    if (visibility !== undefined && ['private', 'public'].includes(visibility)) {
      game.visibility = visibility;
    }
    if (description !== undefined) game.description = String(description).slice(0, 500);
    if (reviewInfo !== undefined) {
      const nextReview = reviewInfo && typeof reviewInfo === 'object' ? reviewInfo : {};
      const parsedDate = nextReview.classificationDate ? new Date(nextReview.classificationDate) : null;
      const contentDescriptors = Array.isArray(nextReview.contentDescriptors)
        ? nextReview.contentDescriptors.filter((key) => GAME_CONTENT_DESCRIPTOR_KEYS.includes(key))
        : [];
      game.reviewInfo = {
        enabled: Boolean(nextReview.enabled),
        title: String(nextReview.title ?? '').trim().slice(0, 200),
        businessName: String(nextReview.businessName ?? '').trim().slice(0, 200),
        rating: normalizeGameRating(nextReview.rating),
        classificationNumber: String(nextReview.classificationNumber ?? '').trim().slice(0, 100),
        classificationDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
        developerReportNumber: String(nextReview.developerReportNumber ?? '').trim().slice(0, 100),
        contentDescriptors,
      };
    }
    await game.save();
    res.json({ game: { ...game.toObject(), isOwner: true } });
  } catch (err) {
    next(err);
  }
});

// Thumbnail upload — owner only
router.post(
  '/:gameId/thumbnail',
  requireAuth,
  requireApproved,
  thumbUpload.single('file'),
  async (req, res, next) => {
    try {
      const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
      if (!game) return res.status(404).json({ error: 'Game not found' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const mimeToExt = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const ext = mimeToExt[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: 'Unsupported image type' });

      await fs.mkdir(THUMBNAIL_ROOT, { recursive: true });

      // Delete any pre-existing thumbnails (different extensions).
      for (const oldExt of Object.values(mimeToExt)) {
        const oldPath = path.join(THUMBNAIL_ROOT, `${game._id}.${oldExt}`);
        await fs.rm(oldPath, { force: true });
      }

      const fname = `${game._id}.${ext}`;
      await fs.writeFile(path.join(THUMBNAIL_ROOT, fname), req.file.buffer);
      game.thumbnailUrl = `/thumbnails/${fname}`;
      await game.save();
      res.json({ thumbnailUrl: game.thumbnailUrl });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:gameId/thumbnail', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.thumbnailUrl) {
      const fname = path.basename(game.thumbnailUrl);
      await fs.rm(path.join(THUMBNAIL_ROOT, fname), { force: true });
      game.thumbnailUrl = '';
      await game.save();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Collaborators ─────────────────────────────────────────────────────────────

router.get('/:gameId/collaborators', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('collaborators', 'name email');
    if (!game || !isAuthorized(game, req.user.sub)) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({ collaborators: game.collaborators });
  } catch (err) {
    next(err);
  }
});

// Invite by email — owner only
router.post('/:gameId/collaborators', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const invitee = await User.findOne({
      email: email.toLowerCase().trim(),
      status: 'approved',
    }).select('name email');
    if (!invitee) return res.status(404).json({ error: 'No approved user found with that email' });

    if (isOwner(game, invitee._id)) {
      return res.status(400).json({ error: 'That user is already the owner' });
    }
    if (game.collaborators.some((c) => c.toString() === String(invitee._id))) {
      return res.status(409).json({ error: 'User is already a collaborator' });
    }

    game.collaborators.push(invitee._id);
    await game.save();
    res.status(201).json({ collaborator: { id: invitee._id, name: invitee.name, email: invitee.email } });
  } catch (err) {
    next(err);
  }
});

// Remove collaborator — owner only
router.delete(
  '/:gameId/collaborators/:userId',
  requireAuth,
  requireApproved,
  async (req, res, next) => {
    try {
      const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
      if (!game) return res.status(404).json({ error: 'Game not found' });
      game.collaborators = game.collaborators.filter((c) => c.toString() !== req.params.userId);
      await game.save();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Build upload — owner or collaborator ──────────────────────────────────────

router.post(
  '/:gameId/builds',
  requireAuth,
  requireApproved,
  upload.fields([{ name: 'files' }, { name: 'streamingAssetsZip', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const files = req.files?.files || [];
      const streamingAssetsZip = req.files?.streamingAssetsZip?.[0] || null;
      const allUploaded = [...files, ...(streamingAssetsZip ? [streamingAssetsZip] : [])];

      const game = await Game.findById(req.params.gameId);
      if (!game || !isAuthorized(game, req.user.sub)) {
        for (const f of allUploaded) await fs.rm(f.path, { force: true });
        return res.status(404).json({ error: 'Game not found' });
      }

      if (!files.length) {
        for (const f of allUploaded) await fs.rm(f.path, { force: true });
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const canvasWidth  = parseInt(req.body.canvasWidth,  10) || 1920;
      const canvasHeight = parseInt(req.body.canvasHeight, 10) || 1080;
      const build = await Build.create({
        gameId: game._id,
        version: req.body.version || '',
        canvasWidth,
        canvasHeight,
      });
      const dir = await ensureBuildDir(build._id);

      const filesMeta = { other: [] };
      let totalBytes = 0;
      for (const file of files) {
        const safe = path.basename(file.originalname);
        const dest = path.join(dir, safe);
        await moveFile(file.path, dest);
        const stat = await fs.stat(dest);
        totalBytes += stat.size;
        const role = detectRole(safe);
        if (role === 'other') {
          filesMeta.other.push(safe);
        } else {
          filesMeta[role] = safe;
        }
      }

      if (streamingAssetsZip) {
        const { relPaths, totalBytes: zipBytes } = await extractStreamingAssetsZip(streamingAssetsZip.path, dir);
        filesMeta.other.push(...relPaths);
        totalBytes += zipBytes;
        await fs.rm(streamingAssetsZip.path, { force: true });
      }

      build.files = filesMeta;
      build.storageBytes = totalBytes;
      await build.save();

      res.status(201).json({ build });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:gameId/builds', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game || !isAuthorized(game, req.user.sub)) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const builds = await Build.find({ gameId: game._id }).sort({ createdAt: -1 });
    res.json({ builds });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:gameId/builds/:buildId/activate',
  requireAuth,
  requireApproved,
  async (req, res, next) => {
    try {
      const game = await Game.findById(req.params.gameId);
      if (!game || !isAuthorized(game, req.user.sub)) {
        return res.status(404).json({ error: 'Game not found' });
      }
      await Build.updateMany({ gameId: game._id }, { isActive: false });
      const build = await Build.findOneAndUpdate(
        { _id: req.params.buildId, gameId: game._id },
        { isActive: true },
        { new: true },
      );
      if (!build) return res.status(404).json({ error: 'Build not found' });
      res.json({ build });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:gameId/builds/:buildId',
  requireAuth,
  requireApproved,
  async (req, res, next) => {
    try {
      const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const build = await Build.findOne({ _id: req.params.buildId, gameId: game._id });
      if (!build) return res.status(404).json({ error: 'Build not found' });
      const dir = path.join(STORAGE_ROOT, String(build._id));
      await fs.rm(dir, { recursive: true, force: true });
      await build.deleteOne();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:gameId/reports', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game || !isAuthorized(game, req.user.sub)) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const filter = { gameId: game._id };
    const { status, priority, tag } = req.query;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (tag) filter.tags = tag;

    const issues = await Issue.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('title description createdAt productName version buildId status priority tags votes');

    const uid = req.user.sub;
    const result = issues.map((i) => ({
      ...i.toObject(),
      voteCount: i.votes.length,
      hasVoted:  i.votes.some((v) => v.toString() === uid),
      votes: undefined,
    }));
    res.json({ issues: result });
  } catch (err) {
    next(err);
  }
});

// ── Public issues board (for testers) ────────────────────────────────────────

router.get('/play/:gameSlug/issues', optionalAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).select('_id');
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const issues = await Issue.find({ gameId: game._id, status: { $ne: 'closed' } })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('title description status priority tags votes createdAt comments')
      .lean();

    const uid = req.user?.sub;
    const result = issues.map((i) => ({
      _id:         i._id,
      title:       i.title,
      description: i.description,
      status:      i.status,
      priority:    i.priority,
      tags:        i.tags,
      createdAt:   i.createdAt,
      voteCount:   i.votes?.length ?? 0,
      hasVoted:    uid ? (i.votes ?? []).some((v) => v.toString() === uid) : false,
      commentCount: i.comments?.length ?? 0,
    }));

    result.sort((a, b) => b.voteCount - a.voteCount || new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ issues: result });
  } catch (err) {
    next(err);
  }
});

// ── Public play API ───────────────────────────────────────────────────────────

function buildUrls(buildId, files) {
  const base = `/builds/${buildId}`;
  return {
    loader:    files.loader    ? `${base}/${files.loader}`    : null,
    data:      files.data      ? `${base}/${files.data}`      : null,
    framework: files.framework ? `${base}/${files.framework}` : null,
    wasm:      files.wasm      ? `${base}/${files.wasm}`      : null,
    streamingAssets: files.other?.some((f) => f.startsWith('StreamingAssets/'))
      ? `${base}/StreamingAssets`
      : null,
  };
}

function playResponse(game, build) {
  const reviewInfo = game.reviewInfo?.enabled
    ? {
        title: game.reviewInfo.title || '',
        businessName: game.reviewInfo.businessName || '',
        rating: game.reviewInfo.rating || '',
        classificationNumber: game.reviewInfo.classificationNumber || '',
        classificationDate: game.reviewInfo.classificationDate || null,
        developerReportNumber: game.reviewInfo.developerReportNumber || '',
        contentDescriptors: game.reviewInfo.contentDescriptors || [],
      }
    : null;

  return {
    gameId:        game._id,
    gameSlug:      game.slug,
    gameName:      game.name,
    description:   game.description || '',
    thumbnailUrl:  game.thumbnailUrl || '',
    visibility:    game.visibility || 'private',
    reviewInfo,
    developerName: game.ownerId?.name ?? null,
    buildId:       build._id,
    buildVersion:  build.version || null,
    canvasWidth:   build.canvasWidth  ?? 1920,
    canvasHeight:  build.canvasHeight ?? 1080,
    urls: buildUrls(build._id, build.files),
  };
}

router.get('/play/:gameSlug', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).populate('ownerId', 'name');
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const build = await Build.findOne({ gameId: game._id, isActive: true });
    if (!build) return res.status(404).json({ error: 'No active build for this game' });
    res.json(playResponse(game, build));
  } catch (err) {
    next(err);
  }
});

router.get('/play/:gameSlug/:buildId', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug }).populate('ownerId', 'name');
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const build = await Build.findOne({ _id: req.params.buildId, gameId: game._id });
    if (!build) return res.status(404).json({ error: 'Build not found' });
    res.json(playResponse(game, build));
  } catch (err) {
    next(err);
  }
});

export default router;
