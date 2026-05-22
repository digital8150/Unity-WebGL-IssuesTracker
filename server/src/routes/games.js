import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import multer from 'multer';
import Game from '../models/Game.js';
import Build, { detectRole } from '../models/Build.js';
import { Issue } from '../models/Issue.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

// Resolved at import time so every request uses the same path.
const STORAGE_ROOT = path.resolve('storage', 'builds');

async function ensureBuildDir(buildId) {
  const dir = path.join(STORAGE_ROOT, String(buildId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ── Game CRUD ─────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const games = await Game.find({ ownerId: req.user.sub }).sort({ createdAt: -1 });
    res.json({ games });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
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
    res.status(201).json({ game });
  } catch (err) {
    next(err);
  }
});

router.get('/:gameId', requireAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const builds = await Build.find({ gameId: game._id }).sort({ createdAt: -1 });
    res.json({ game, builds });
  } catch (err) {
    next(err);
  }
});

router.patch('/:gameId', requireAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const { name, discordWebhookUrl } = req.body;
    if (name !== undefined) game.name = name;
    if (discordWebhookUrl !== undefined) game.discordWebhookUrl = discordWebhookUrl;
    await game.save();
    res.json({ game });
  } catch (err) {
    next(err);
  }
});

// ── Build upload ──────────────────────────────────────────────────────────────

router.post('/:gameId/builds', requireAuth, upload.array('files'), async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    const build = await Build.create({ gameId: game._id, version: req.body.version || '' });
    const dir = await ensureBuildDir(build._id);

    const filesMeta = { other: [] };
    for (const file of files) {
      const safe = path.basename(file.originalname);
      await fs.writeFile(path.join(dir, safe), file.buffer);
      const role = detectRole(safe);
      if (role === 'other') {
        filesMeta.other.push(safe);
      } else {
        filesMeta[role] = safe;
      }
    }
    build.files = filesMeta;
    await build.save();

    res.status(201).json({ build });
  } catch (err) {
    next(err);
  }
});

// ── Build list ────────────────────────────────────────────────────────────────

router.get('/:gameId/builds', requireAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const builds = await Build.find({ gameId: game._id }).sort({ createdAt: -1 });
    res.json({ builds });
  } catch (err) {
    next(err);
  }
});

// ── Activate build ────────────────────────────────────────────────────────────

router.patch('/:gameId/builds/:buildId/activate', requireAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
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
});

// ── Reports for a game ────────────────────────────────────────────────────────

router.get('/:gameId/reports', requireAuth, async (req, res, next) => {
  try {
    const game = await Game.findOne({ _id: req.params.gameId, ownerId: req.user.sub });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const issues = await Issue.find({ gameId: game._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('title description createdAt productName version buildId');
    res.json({ issues });
  } catch (err) {
    next(err);
  }
});

// ── Public play API ───────────────────────────────────────────────────────────

function buildUrls(buildId, files) {
  const base = `/builds/${buildId}`;
  return {
    loader: files.loader ? `${base}/${files.loader}` : null,
    data: files.data ? `${base}/${files.data}` : null,
    framework: files.framework ? `${base}/${files.framework}` : null,
    wasm: files.wasm ? `${base}/${files.wasm}` : null,
  };
}

router.get('/play/:gameSlug', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const build = await Build.findOne({ gameId: game._id, isActive: true });
    if (!build) return res.status(404).json({ error: 'No active build for this game' });
    res.json({
      gameId: game._id,
      gameName: game.name,
      buildId: build._id,
      urls: buildUrls(build._id, build.files),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/play/:gameSlug/:buildId', async (req, res, next) => {
  try {
    const game = await Game.findOne({ slug: req.params.gameSlug });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const build = await Build.findOne({ _id: req.params.buildId, gameId: game._id });
    if (!build) return res.status(404).json({ error: 'Build not found' });
    res.json({
      gameId: game._id,
      gameName: game.name,
      buildId: build._id,
      urls: buildUrls(build._id, build.files),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
