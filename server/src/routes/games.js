import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import multer from 'multer';
import mongoose from 'mongoose';
import Game, { GAME_CONTENT_DESCRIPTOR_KEYS, GAME_RATING_KEYS } from '../models/Game.js';
import GameArticle from '../models/GameArticle.js';
import Build, { detectRole } from '../models/Build.js';
import { Issue } from '../models/Issue.js';
import AddressableContent from '../models/AddressableContent.js';
import GameConfig from '../models/GameConfig.js';
import Leaderboard from '../models/Leaderboard.js';
import LeaderboardScore from '../models/LeaderboardScore.js';
import CloudSave from '../models/CloudSave.js';
import User from '../models/User.js';
import Translation from '../models/Translation.js';
import SiteSettings from '../models/SiteSettings.js';
import { requireAuth, optionalAuth, requireApproved } from '../middleware/auth.js';
import { loadTranslations, mergeTranslation, publicTranslation, publicTranslationMeta, translationPublishEnabled } from '../services/localeContent.js';
import { enqueue } from '../services/translation/queue.js';
import { toPublicSdkV2 } from '../services/publicData.js';
import {
  acquireAssetReplaceLock,
  extractAndSwapArchive,
  extractArchive,
  moveFile,
  sweepSwapArtifacts,
} from '../services/assetArchive.js';
import { acquireStorageQuotaLock, assertStorageQuota } from '../services/storageQuota.js';

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
  if (GAME_RATING_KEYS.includes(raw)) return raw;
  return Object.prototype.hasOwnProperty.call(LEGACY_RATING_ALIASES, raw)
    ? LEGACY_RATING_ALIASES[raw]
    : '';
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

const STORAGE_ROOT = path.resolve('storage', 'builds');
const CONTENT_ROOT = path.resolve('storage', 'content');
const THUMBNAIL_ROOT = path.resolve('storage', 'thumbnails');
const THUMBNAIL_MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const THUMBNAIL_EXTENSIONS = new Set(Object.values(THUMBNAIL_MIME_TO_EXT));
const STREAMING_ASSETS_SWAP_ARTIFACT_PREFIXES = [
  '.streaming-assets-tmp-',
  '.streaming-assets-old-',
];
const streamingAssetsReplaceLocks = new Map();

async function ensureBuildDir(buildId) {
  const dir = path.join(STORAGE_ROOT, String(buildId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function removeGameThumbnailFiles(gameId, currentThumbnailUrl = '') {
  await fs.mkdir(THUMBNAIL_ROOT, { recursive: true });
  const prefix = String(gameId);
  const currentName = currentThumbnailUrl ? path.basename(currentThumbnailUrl) : '';
  if (currentName) await fs.rm(path.join(THUMBNAIL_ROOT, currentName), { force: true });

  let entries;
  try {
    entries = await fs.readdir(THUMBNAIL_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (THUMBNAIL_EXTENSIONS.has(ext)) {
      await fs.rm(path.join(THUMBNAIL_ROOT, entry.name), { force: true });
    }
  }
}

// Extracts a StreamingAssets zip into an explicit destination root, preserving
// nested folder structure. Returns { relPaths, totalBytes } where relPaths are
// paths relative to the build directory (e.g. "StreamingAssets/sub/data.json").
async function extractStreamingAssetsZip(zipPath, destinationRoot, limits = {}) {
  return extractArchive(zipPath, destinationRoot, {
    prefix: 'StreamingAssets',
    wrapperNames: ['streamingassets'],
    label: 'StreamingAssets',
    limits,
  });
}

async function sweepStreamingAssetsSwapArtifacts(buildDir) {
  return sweepSwapArtifacts(buildDir, STREAMING_ASSETS_SWAP_ARTIFACT_PREFIXES);
}

function acquireStreamingAssetsReplaceLock(buildId) {
  return acquireAssetReplaceLock(buildId, streamingAssetsReplaceLocks);
}

async function extractAndSwapStreamingAssets(zipPath, buildDir, beforeCommit) {
  // A replacement temporarily needs room for both the old and new trees.
  // With the 2 GB extracted cap, peak disk usage can therefore approach 4 GB.
  return extractAndSwapArchive(zipPath, buildDir, {
    liveDirName: 'StreamingAssets',
    tempPrefix: '.streaming-assets-tmp-',
    oldPrefix: '.streaming-assets-old-',
    extractOptions: {
      prefix: 'StreamingAssets',
      wrapperNames: ['streamingassets'],
      label: 'StreamingAssets',
    },
    beforeCommit,
  });
}

function uniqueOtherFiles(files) {
  return [...new Set((Array.isArray(files) ? files : []).filter(Boolean))];
}

async function calculateBuildStorageBytes(buildDir, files, { sweepArtifacts = true } = {}) {
  if (sweepArtifacts) await sweepStreamingAssetsSwapArtifacts(buildDir);
  const names = uniqueOtherFiles([
    files?.loader,
    files?.data,
    files?.framework,
    files?.wasm,
    ...(files?.other || []),
  ]);
  let total = 0;
  for (const name of names) {
    const relative = String(name).split('/').filter(Boolean);
    const filePath = path.join(buildDir, ...relative);
    if (!filePath.startsWith(buildDir + path.sep)) continue;
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) total += stat.size;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return total;
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

router.get('/arcade', async (req, res, next) => {
  try {
    const games = await Game.find({ visibility: 'public' })
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name')
      .select('name slug description thumbnailUrl ownerId updatedAt')
      .lean();

    // Only include games that actually have an active build to play.
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const gameRows = await loadTranslations('Game', games.map((game) => game._id), req.query.locale, Translation);
    const withBuilds = await Promise.all(
      games.map(async (g) => {
        const build = await Build.findOne({ gameId: g._id, isActive: true })
          .select('_id version createdAt')
          .lean();
        if (!build) return null;
        const translated = mergeTranslation(g, publicTranslation(gameRows.get(String(g._id)), req.query.locale, publishEnabled), 'Game');
        return {
          id: g._id,
          name: g.name,
          slug: g.slug,
          description: translated.description ?? '',
          thumbnailUrl: g.thumbnailUrl ?? '',
          developerName: g.ownerId?.name ?? null,
          updatedAt: g.updatedAt,
          latestBuildVersion: build.version || null,
        };
      }),
    );
    res.json({ games: withBuilds.filter(Boolean), translation: Object.fromEntries(games.map((game) => [String(game._id), publicTranslationMeta(gameRows.get(String(game._id)), req.query.locale, publishEnabled)])) });
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
    enqueue({ refType: 'Game', refId: game._id, source: game.toObject(), priority: 5 }).catch((error) => console.error('[translation enqueue]', error));
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
    const previousDescription = game.description;
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'Game name must be a string.' });
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Game name cannot be empty.' });
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'Game name must be 100 characters or fewer.' });
      }
      game.name = trimmedName;
    }
    if (discordWebhookUrl !== undefined) game.discordWebhookUrl = discordWebhookUrl;
    if (visibility !== undefined && ['private', 'public'].includes(visibility)) {
      game.visibility = visibility;
    }
    if (description !== undefined) game.description = String(description).slice(0, 500);
    if (reviewInfo !== undefined) {
      const nextReview = reviewInfo && typeof reviewInfo === 'object' ? reviewInfo : {};
      const parsedDate = nextReview.classificationDate ? new Date(nextReview.classificationDate) : null;
      const contentDescriptors = Array.isArray(nextReview.contentDescriptors)
        ? [...new Set(nextReview.contentDescriptors.filter((key) => GAME_CONTENT_DESCRIPTOR_KEYS.includes(key)))]
        : [];
      const rating = normalizeGameRating(nextReview.rating);
      game.reviewInfo = {
        enabled: Boolean(nextReview.enabled) && Boolean(rating),
        title: String(nextReview.title ?? '').trim().slice(0, 200),
        businessName: String(nextReview.businessName ?? '').trim().slice(0, 200),
        rating,
        classificationNumber: String(nextReview.classificationNumber ?? '').trim().slice(0, 100),
        classificationDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
        developerReportNumber: String(nextReview.developerReportNumber ?? '').trim().slice(0, 100),
        contentDescriptors,
      };
    }
    await game.save();
    if (description !== undefined && String(previousDescription ?? '') !== String(game.description ?? '')) {
      enqueue({ refType: 'Game', refId: game._id, source: game.toObject(), priority: 10 }).catch((error) => console.error('[translation enqueue]', error));
    }
    res.json({ game: { ...game.toObject(), isOwner: true } });
  } catch (err) {
    next(err);
  }
});

// Delete game — owner only
router.delete('/:gameId', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const articles = await GameArticle.find({ gameId: game._id }).select('_id').lean();
    const builds = await Build.find({ gameId: game._id }).select('_id').lean();

    // Remove filesystem payloads before deleting their owning documents. This
    // keeps a failed database deletion recoverable while ensuring a successful
    // game deletion cannot leave build/content bytes outside quota accounting.
    await Promise.all(builds.map((build) => fs.rm(
      path.join(STORAGE_ROOT, String(build._id)),
      { recursive: true, force: true },
    )));
    await fs.rm(path.join(CONTENT_ROOT, String(game._id)), { recursive: true, force: true });
    await removeGameThumbnailFiles(game._id, game.thumbnailUrl);

    await GameArticle.deleteMany({ gameId: game._id });
    await Build.deleteMany({ gameId: game._id });
    await Issue.deleteMany({ gameId: game._id });
    await AddressableContent.deleteMany({ gameId: game._id });
    await GameConfig.deleteMany({ gameId: game._id });
    await LeaderboardScore.deleteMany({ gameId: game._id });
    await Leaderboard.deleteMany({ gameId: game._id });
    await CloudSave.deleteMany({ gameId: game._id });
    await game.deleteOne();
    Translation.deleteOne({ refType: 'Game', refId: game._id, locale: 'en' }).catch((error) => console.error('[translation cleanup]', error));
    Translation.deleteMany({ refType: 'GameArticle', refId: { $in: articles.map((article) => article._id) }, locale: 'en' }).catch((error) => console.error('[translation cleanup]', error));
    res.json({ ok: true });
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

      const ext = THUMBNAIL_MIME_TO_EXT[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: 'Unsupported image type' });

      await fs.mkdir(THUMBNAIL_ROOT, { recursive: true });
      await removeGameThumbnailFiles(game._id, game.thumbnailUrl);

      const digest = createHash('sha1').update(req.file.buffer).digest('hex').slice(0, 10);
      const fname = `${game._id}-${digest}.${ext}`;
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
    await removeGameThumbnailFiles(game._id, game.thumbnailUrl);
    if (game.thumbnailUrl) {
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
    let uploadedPaths = [];
    let build = null;
    let buildDir = null;
    let buildSaved = false;
    let releaseQuotaLock = null;
    try {
      const files = req.files?.files || [];
      const streamingAssetsZip = req.files?.streamingAssetsZip?.[0] || null;
      const allUploaded = [...files, ...(streamingAssetsZip ? [streamingAssetsZip] : [])];
      uploadedPaths = allUploaded.map((file) => file.path);

      const game = await Game.findById(req.params.gameId);
      if (!game || !isAuthorized(game, req.user.sub)) {
        for (const f of allUploaded) await fs.rm(f.path, { force: true });
        return res.status(404).json({ error: 'Game not found' });
      }

      if (!files.length) {
        for (const f of allUploaded) await fs.rm(f.path, { force: true });
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const ownerId = game.ownerId?._id ?? game.ownerId;
      releaseQuotaLock = await acquireStorageQuotaLock(ownerId);

      const canvasWidth  = parseInt(req.body.canvasWidth,  10) || 1920;
      const canvasHeight = parseInt(req.body.canvasHeight, 10) || 1080;
      build = await Build.create({
        gameId: game._id,
        version: req.body.version || '',
        canvasWidth,
        canvasHeight,
      });
      const dir = await ensureBuildDir(build._id);
      buildDir = dir;

      const filesMeta = { other: [] };
      for (const file of files) {
        const safe = path.basename(file.originalname);
        const dest = path.join(dir, safe);
        await moveFile(file.path, dest);
        const role = detectRole(safe);
        if (role === 'other') {
          filesMeta.other.push(safe);
        } else {
          filesMeta[role] = safe;
        }
      }

      if (streamingAssetsZip) {
        const { relPaths, totalBytes: streamingAssetsBytes } = await extractStreamingAssetsZip(
          streamingAssetsZip.path,
          path.join(dir, 'StreamingAssets'),
        );
        filesMeta.other.push(...relPaths);
        build.streamingAssetsFileCount = relPaths.length;
        build.streamingAssetsBytes = streamingAssetsBytes;
        build.streamingAssetsUpdatedAt = new Date();
        await fs.rm(streamingAssetsZip.path, { force: true });
      }

      filesMeta.other = uniqueOtherFiles(filesMeta.other);
      build.files = filesMeta;
      const storageBytes = await calculateBuildStorageBytes(dir, filesMeta);
      await assertStorageQuota(ownerId, {
        additionalGameIds: [game._id],
        incomingBytes: storageBytes,
      });
      build.storageBytes = storageBytes;
      await build.save();
      buildSaved = true;

      res.status(201).json({ build });
    } catch (err) {
      if (build && !buildSaved) {
        if (buildDir) await fs.rm(buildDir, { recursive: true, force: true });
        try {
          await build.deleteOne();
        } catch (cleanupError) {
          err.cleanupError = cleanupError;
        }
      }
      next(err);
    } finally {
      releaseQuotaLock?.();
      await Promise.all(uploadedPaths.map((filePath) => fs.rm(filePath, { force: true })));
    }
  },
);

router.put(
  '/:gameId/builds/:buildId/streaming-assets',
  requireAuth,
  requireApproved,
  upload.single('streamingAssetsZip'),
  async (req, res, next) => {
    const uploadedPath = req.file?.path;
    const releaseLock = acquireStreamingAssetsReplaceLock(req.params.buildId);
    let releaseQuotaLock = null;
    if (!releaseLock) {
      if (uploadedPath) await fs.rm(uploadedPath, { force: true });
      return res.status(409).json({ error: 'A StreamingAssets replacement is already in progress' });
    }
    try {
      const game = await Game.findById(req.params.gameId);
      if (!game || !isAuthorized(game, req.user.sub)) {
        return res.status(404).json({ error: 'Game not found' });
      }
      if (!req.file) return res.status(400).json({ error: 'No StreamingAssets zip uploaded' });

      const build = await Build.findOne({ _id: req.params.buildId, gameId: game._id });
      if (!build) return res.status(404).json({ error: 'Build not found' });

      const ownerId = game.ownerId?._id ?? game.ownerId;
      releaseQuotaLock = await acquireStorageQuotaLock(ownerId);

      const dir = await ensureBuildDir(build._id);
      const files = build.files?.toObject ? build.files.toObject() : { ...(build.files || {}) };
      const survivingOther = uniqueOtherFiles(files.other).filter((file) => !file.startsWith('StreamingAssets/'));
      let projectedStorageBytes = 0;
      const { relPaths, totalBytes } = await extractAndSwapStreamingAssets(
        req.file.path,
        dir,
        async ({ extracted }) => {
          const nonStreamingBytes = await calculateBuildStorageBytes(
            dir,
            { ...files, other: survivingOther },
            { sweepArtifacts: false },
          );
          projectedStorageBytes = nonStreamingBytes + extracted.totalBytes;
          await assertStorageQuota(ownerId, {
            additionalGameIds: [game._id],
            replacedBytes: build.storageBytes,
            incomingBytes: projectedStorageBytes,
          });
        },
      );
      files.other = uniqueOtherFiles([...survivingOther, ...relPaths]);
      build.files = files;
      build.streamingAssetsFileCount = relPaths.length;
      build.streamingAssetsBytes = totalBytes;
      build.streamingAssetsUpdatedAt = new Date();
      build.storageBytes = projectedStorageBytes ?? await calculateBuildStorageBytes(dir, files);
      await build.save();

      res.json({ build });
    } catch (err) {
      next(err);
    } finally {
      releaseQuotaLock?.();
      releaseLock();
      if (uploadedPath) await fs.rm(uploadedPath, { force: true });
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

function playResponse(game, build, translation = null) {
  const translatedGame = mergeTranslation(game.toObject ? game.toObject() : game, translation, 'Game');
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
    description:   translatedGame.description || '',
    thumbnailUrl:  translatedGame.thumbnailUrl || '',
    visibility:    translatedGame.visibility || 'private',
    reviewInfo,
    sdkV2: toPublicSdkV2(game),
    developerName: translatedGame.ownerId?.name ?? null,
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
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const row = (await loadTranslations('Game', [game._id], req.query.locale, Translation)).get(String(game._id));
    const translation = publicTranslation(row, req.query.locale, publishEnabled);
    res.json({ ...playResponse(game, build, translation), translation: publicTranslationMeta(row, req.query.locale, publishEnabled) });
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
    const publishEnabled = await translationPublishEnabled(req.query.locale, SiteSettings);
    const row = (await loadTranslations('Game', [game._id], req.query.locale, Translation)).get(String(game._id));
    const translation = publicTranslation(row, req.query.locale, publishEnabled);
    res.json({ ...playResponse(game, build, translation), translation: publicTranslationMeta(row, req.query.locale, publishEnabled) });
  } catch (err) {
    next(err);
  }
});

export { extractStreamingAssetsZip };
export default router;
