import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import multer from 'multer';
import mongoose from 'mongoose';
import Game from '../models/Game.js';
import AddressableContent from '../models/AddressableContent.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import {
  acquireAssetReplaceLock,
  calculateDirectoryStats,
  extractAndMergeArchive,
  extractAndSwapArchive,
  listDirectoryFiles,
  sweepSwapArtifacts,
} from '../services/assetArchive.js';

const router = Router();

export const CONTENT_ROOT = path.resolve('storage', 'content');
const CONTENT_PUBLIC_ORIGIN = (process.env.SITE_ORIGIN || 'https://arcade.codingbot.kr').replace(/\/$/, '');
const CONTENT_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Swap artifacts live beside the channel directories under the game root, so
// their prefixes must carry the channel. A shared prefix would let an upload to
// one channel sweep away an in-flight extraction for a different channel — the
// per-channel lock does not serialize those, because the channels differ.
// `isAssetSwapArtifactPath` still matches these by the leading `.content-tmp-`.
function contentSwapPrefixes(channel) {
  return {
    tempPrefix: `.content-tmp-${channel}-`,
    oldPrefix: `.content-old-${channel}-`,
  };
}
const CONTENT_MAX_FILE_INSPECTOR_LIMIT = 500;
const contentReplaceLocks = new Map();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, os.tmpdir()),
    filename: (_req, file, callback) => callback(
      null,
      `${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.originalname)}`,
    ),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

function isValidGameId(gameId) {
  return mongoose.Types.ObjectId.isValid(gameId);
}

function isValidChannel(channel) {
  return CONTENT_CHANNEL_PATTERN.test(String(channel || ''));
}

function contentUrl(gameId, channel) {
  return `${CONTENT_PUBLIC_ORIGIN}/content/${gameId}/${channel}/`;
}

function channelPath(gameId, channel) {
  return path.join(CONTENT_ROOT, String(gameId), channel);
}

function publicChannel(content, gameId, channel, extra = {}) {
  return {
    channel,
    fileCount: Number(content?.fileCount || 0),
    storageBytes: Number(content?.storageBytes || 0),
    lastUploadAt: content?.lastUploadAt || null,
    publicUrl: contentUrl(gameId, channel),
    ...extra,
  };
}

async function findAuthorizedGame(req, res) {
  if (!isValidGameId(req.params.gameId)) {
    res.status(400).json({ error: 'Invalid game id' });
    return null;
  }
  const game = await Game.findById(req.params.gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  const userId = String(req.user.sub);
  const ownerId = String(game.ownerId?._id ?? game.ownerId);
  const collaborators = Array.isArray(game.collaborators) ? game.collaborators : [];
  const authorized = ownerId === userId || collaborators.some((collaborator) => (
    String(collaborator?._id ?? collaborator) === userId
  ));
  if (!authorized) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  return game;
}

function parseMode(req) {
  const mode = String(req.query.mode ?? req.body?.mode ?? 'merge').toLowerCase();
  return mode === 'merge' || mode === 'replace' ? mode : null;
}

function parsePageParam(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return null;
  return parsed;
}

// A zip the developer cannot open is their problem, not a server fault. Cap
// violations already carry a status, and filesystem errno failures (ENOSPC,
// EACCES, …) are genuine server errors — everything else here is adm-zip
// failing to parse the upload, which is a 400 rather than a 500.
async function extractContent(zipPath, gameRoot, options, mode) {
  try {
    return mode === 'replace'
      ? await extractAndSwapArchive(zipPath, gameRoot, options)
      : await extractAndMergeArchive(zipPath, gameRoot, options);
  } catch (error) {
    if (error?.status || error?.code) throw error;
    const badZip = new Error('Content zip could not be read');
    badZip.status = 400;
    throw badZip;
  }
}

async function saveContentStats(gameId, channel, stats) {
  let content = await AddressableContent.findOne({ gameId, channel });
  if (!content) content = new AddressableContent({ gameId, channel });
  content.fileCount = stats.fileCount;
  content.storageBytes = stats.storageBytes;
  content.lastUploadAt = new Date();
  await content.save();
  return content;
}

router.get('/:gameId/content', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const game = await findAuthorizedGame(req, res);
    if (!game) return;
    const rows = await AddressableContent.find({ gameId: game._id }).sort({ channel: 1 }).lean();
    // The dashboard must be able to show the RemoteLoadPath before any content
    // exists — the developer needs it at Unity build time, which precedes the
    // first upload. Resolving the origin here keeps SITE_ORIGIN server-side.
    res.json({
      channels: rows.map((row) => publicChannel(row, game._id, row.channel)),
      defaultChannel: 'live',
      defaultChannelUrl: contentUrl(game._id, 'live'),
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:gameId/content/:channel',
  requireAuth,
  requireApproved,
  upload.single('contentZip'),
  async (req, res, next) => {
    const uploadedPath = req.file?.path;
    const channel = String(req.params.channel || '').toLowerCase();
    let releaseLock = null;
    try {
      if (!isValidGameId(req.params.gameId)) {
        return res.status(400).json({ error: 'Invalid game id' });
      }
      if (!isValidChannel(channel)) {
        return res.status(400).json({ error: 'Invalid content channel' });
      }
      const mode = parseMode(req);
      if (!mode) return res.status(400).json({ error: 'mode must be merge or replace' });

      const game = await findAuthorizedGame(req, res);
      if (!game) return;
      if (!req.file) return res.status(400).json({ error: 'No content zip uploaded' });

      releaseLock = acquireAssetReplaceLock(`${game._id}:${channel}`, contentReplaceLocks);
      if (!releaseLock) {
        return res.status(409).json({ error: 'A content upload is already in progress for this channel' });
      }

      const gameRoot = path.join(CONTENT_ROOT, String(game._id));
      await fs.mkdir(gameRoot, { recursive: true });
      const { tempPrefix, oldPrefix } = contentSwapPrefixes(channel);
      await sweepSwapArtifacts(gameRoot, [tempPrefix, oldPrefix]);

      const archiveOptions = {
        prefix: '',
        wrapperNames: ['serverdata', 'streamingassets'],
        label: 'Addressables content',
      };
      const extracted = await extractContent(req.file.path, gameRoot, {
        liveDirName: channel,
        tempPrefix,
        oldPrefix,
        extractOptions: archiveOptions,
      }, mode);

      const targetRoot = channelPath(game._id, channel);
      const stats = await calculateDirectoryStats(targetRoot);
      const content = await saveContentStats(game._id, channel, stats);
      res.status(200).json({
        content: publicChannel(content, game._id, channel, {
          unhashedBundleCount: stats.unhashedBundleCount,
          mode,
          uploadedUnhashedBundleCount: extracted.unhashedBundleCount,
        }),
      });
    } catch (error) {
      next(error);
    } finally {
      if (uploadedPath) await fs.rm(uploadedPath, { force: true });
      releaseLock?.();
    }
  },
);

router.get('/:gameId/content/:channel/files', requireAuth, requireApproved, async (req, res, next) => {
  try {
    const channel = String(req.params.channel || '').toLowerCase();
    if (!isValidChannel(channel)) return res.status(400).json({ error: 'Invalid content channel' });
    const game = await findAuthorizedGame(req, res);
    if (!game) return;

    const offset = parsePageParam(req.query.offset, 0);
    const limit = parsePageParam(req.query.limit, 100, CONTENT_MAX_FILE_INSPECTOR_LIMIT);
    if (offset === null || limit === null || limit < 1) {
      return res.status(400).json({ error: `offset must be a non-negative integer and limit must be 1-${CONTENT_MAX_FILE_INSPECTOR_LIMIT}` });
    }
    const result = await listDirectoryFiles(channelPath(game._id, channel), { offset, limit });
    res.json({ ...result, offset, limit, channel, publicUrl: contentUrl(game._id, channel) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:gameId/content/:channel', requireAuth, requireApproved, async (req, res, next) => {
  const channel = String(req.params.channel || '').toLowerCase();
  let releaseLock = null;
  try {
    if (!isValidChannel(channel)) return res.status(400).json({ error: 'Invalid content channel' });
    const game = await findAuthorizedGame(req, res);
    if (!game) return;

    releaseLock = acquireAssetReplaceLock(`${game._id}:${channel}`, contentReplaceLocks);
    if (!releaseLock) return res.status(409).json({ error: 'A content upload is already in progress for this channel' });
    await fs.rm(channelPath(game._id, channel), { recursive: true, force: true });
    await AddressableContent.deleteOne({ gameId: game._id, channel });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  } finally {
    releaseLock?.();
  }
});

export { CONTENT_CHANNEL_PATTERN };
export default router;
