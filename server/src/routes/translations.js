import express from 'express';
import mongoose from 'mongoose';
import SiteSettings from '../models/SiteSettings.js';
import ModelQuota from '../models/ModelQuota.js';
import Translation from '../models/Translation.js';
import BlogPost from '../models/BlogPost.js';
import GameArticle from '../models/GameArticle.js';
import Game from '../models/Game.js';
import { requireAuth, requireApproved, requireAdmin } from '../middleware/auth.js';
import { getGeminiKey, getSettings, normalizeModelChain, publicSettings } from '../services/translation/settings.js';
import { listModels } from '../services/translation/gemini.js';
import { enqueueBackfill, enqueue, retryTranslation, sourceHash, validRefType } from '../services/translation/queue.js';
import { getTranslationWorkerStatus } from '../services/translation/worker.js';
import { translationMeta } from '../services/localeContent.js';

const router = express.Router();
router.use(requireAuth, requireApproved, requireAdmin);

const sourceModels = { BlogPost, GameArticle, Game };

function validLocale(locale) {
  return locale === 'en';
}

function validateRef(refType, refId, locale) {
  return validRefType(refType) && validLocale(locale) && mongoose.isValidObjectId(refId);
}

async function sourceFor(refType, refId) {
  const Model = sourceModels[refType];
  return Model.findById(refId).lean();
}

export function buildTranslationWorkerStatus({ runtime = {}, claimedCount = 0, expiredLockCount = 0 } = {}) {
  const claimed = Number(claimedCount) || 0;
  const expired = Number(expiredLockCount) || 0;
  return {
    ...runtime,
    claimedCount: claimed,
    expiredLockCount: expired,
    hasExpiredLock: expired > 0,
  };
}

router.get('/settings', async (_req, res, next) => {
  try {
    const row = await SiteSettings.findById('site').lean();
    let source = row?.geminiKeyLast4 ? 'db' : null;
    if (!source && process.env.GEMINI_API_KEY) source = 'env';
    res.json(publicSettings(row, source));
  } catch (error) { next(error); }
});

router.put('/settings', async (req, res, next) => {
  try {
    const current = await SiteSettings.findById('site').select('+geminiApiKey').lean();
    const updates = { updatedBy: req.user.sub };
    if (Object.prototype.hasOwnProperty.call(req.body, 'geminiApiKey')) {
      const key = String(req.body.geminiApiKey || '').trim();
      if (key) {
        updates.geminiApiKey = key;
        updates.geminiKeyLast4 = key.slice(-4);
      }
    }
    const nextTranslation = {
      ...(current?.translation || {}),
      ...(req.body.translation || {}),
    };
    nextTranslation.modelChain = normalizeModelChain(nextTranslation.modelChain);
    nextTranslation.targetLocales = ['en'];
    nextTranslation.maxChunkChars = Math.max(1000, Math.min(50000, Number(nextTranslation.maxChunkChars) || 4000));
    nextTranslation.dailyRequestCap = Math.max(0, Number(nextTranslation.dailyRequestCap) || 0);
    if (nextTranslation.modelChain.length) {
      const candidateKey = updates.geminiApiKey || current?.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!candidateKey) return res.status(400).json({ error: 'A Gemini key is required before saving a model chain' });
      const liveModels = await listModels(candidateKey);
      const validNames = new Set(liveModels.map((model) => model.name));
      const invalid = nextTranslation.modelChain.map((entry) => entry.model).filter((model) => !validNames.has(model));
      if (invalid.length) return res.status(400).json({ error: `Unknown Gemini model(s): ${invalid.join(', ')}`, models: liveModels });
    }
    updates.translation = nextTranslation;
    const row = await SiteSettings.findByIdAndUpdate('site', { $set: updates }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    res.json(publicSettings({ ...row, geminiKeyLast4: updates.geminiKeyLast4 || row.geminiKeyLast4 }, updates.geminiApiKey ? 'db' : (current?.geminiKeyLast4 ? 'db' : (process.env.GEMINI_API_KEY ? 'env' : null))));
  } catch (error) { next(error); }
});

router.post('/validate-key', async (req, res, next) => {
  try {
    const supplied = String(req.body?.geminiApiKey || '').trim();
    const key = supplied || (await getGeminiKey()).key;
    const models = await listModels(key);
    res.json({ ok: true, models });
  } catch (error) { next(error); }
});

router.get('/models', async (_req, res, next) => {
  try {
    const { key } = await getGeminiKey();
    res.json({ models: await listModels(key) });
  } catch (error) { next(error); }
});

router.get('/status', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const expiredLockAt = new Date(now.getTime() - 15 * 60_000);
    const [counts, quotas, failed, claimedCount, expiredLockCount] = await Promise.all([
      Translation.aggregate([{ $group: { _id: { status: '$status', refType: '$refType' }, count: { $sum: 1 } } }]),
      ModelQuota.find({ model: { $in: settings.translation.modelChain.map((entry) => entry.model) } }).sort({ model: 1, window: 1, key: -1 }).limit(200).lean(),
      Translation.find({ status: 'failed' }).select('refType refId attempts lastError updatedAt').sort({ updatedAt: -1 }).limit(100).lean(),
      Translation.countDocuments({ status: 'translating' }),
      Translation.countDocuments({ status: 'translating', lockedAt: { $lt: expiredLockAt } }),
    ]);
    res.json({
      today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()),
      translation: settings.translation,
      counts: counts.map((row) => ({ status: row._id.status, refType: row._id.refType, count: row.count })),
      quotas,
      failed,
      worker: buildTranslationWorkerStatus({
        runtime: getTranslationWorkerStatus(),
        claimedCount,
        expiredLockCount,
      }),
    });
  } catch (error) { next(error); }
});

router.post('/backfill', async (req, res, next) => {
  try {
    const refTypes = req.body?.refType ? [req.body.refType] : ['BlogPost', 'GameArticle', 'Game'];
    const result = {};
    for (const refType of refTypes) {
      if (!validRefType(refType)) return res.status(400).json({ error: `Invalid refType: ${refType}` });
      result[refType] = await enqueueBackfill({ refType, locale: 'en', force: Boolean(req.body?.force) });
    }
    res.json({ result, count: Object.values(result).reduce((sum, item) => sum + item.count, 0) });
  } catch (error) { next(error); }
});

router.get('/:refType/:refId/:locale', async (req, res, next) => {
  try {
    if (!validateRef(req.params.refType, req.params.refId, req.params.locale)) return res.status(400).json({ error: 'Invalid translation reference' });
    const row = await Translation.findOne(req.params).lean();
    res.json({ translation: row, meta: translationMeta(row) });
  } catch (error) { next(error); }
});

router.put('/:refType/:refId/:locale', async (req, res, next) => {
  try {
    const { refType, refId, locale } = req.params;
    if (!validateRef(refType, refId, locale)) return res.status(400).json({ error: 'Invalid translation reference' });
    const source = await sourceFor(refType, refId);
    if (!source) return res.status(404).json({ error: 'Source document not found' });
    const fields = req.body?.fields && typeof req.body.fields === 'object' ? req.body.fields : req.body;
    const allowed = refType === 'Game' ? ['description', 'longDescription'] : ['title', 'summary', 'content', 'tags'];
    const safeFields = {};
    for (const field of allowed) {
      if (field === 'tags') safeFields[field] = Array.isArray(fields?.[field]) ? fields[field].map(String) : [];
      else if (fields?.[field] !== undefined) {
        const value = String(fields[field]);
        if (field === 'longDescription' && value.length > 20000) {
          return res.status(400).json({ error: 'Game long description must be 20000 characters or fewer.' });
        }
        safeFields[field] = value;
      }
    }
    const update = {
      $set: {
        fields: safeFields,
        status: 'ready',
        origin: 'human',
        reviewedAt: new Date(),
        translatedAt: new Date(),
        lastError: '',
        sourceHash: sourceHash(refType, source),
      },
    };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'noindex')) {
      update.$set.noindex = Boolean(req.body.noindex);
    }
    const row = await Translation.findOneAndUpdate(
      { refType, refId, locale },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ translation: row, meta: translationMeta(row) });
  } catch (error) { next(error); }
});

async function retranslate(req, res, next, force) {
  try {
    const { refType, refId, locale } = req.params;
    if (!validateRef(refType, refId, locale)) return res.status(400).json({ error: 'Invalid translation reference' });
    const source = await sourceFor(refType, refId);
    if (!source) return res.status(404).json({ error: 'Source document not found' });
    const row = await enqueue({ refType, refId, source, locale, force, priority: 20 });
    res.json({ translation: row, meta: translationMeta(row) });
  } catch (error) { next(error); }
}

router.post('/:refType/:refId/:locale/retranslate', (req, res, next) => retranslate(req, res, next, true));
router.post('/:refType/:refId/:locale/retry', async (req, res, next) => {
  try {
    if (!validateRef(req.params.refType, req.params.refId, req.params.locale)) return res.status(400).json({ error: 'Invalid translation reference' });
    const row = await retryTranslation(req.params.refType, req.params.refId, req.params.locale);
    res.json({ translation: row, meta: translationMeta(row) });
  } catch (error) { next(error); }
});

router.patch('/:refType/:refId/:locale/noindex', async (req, res, next) => {
  try {
    if (!validateRef(req.params.refType, req.params.refId, req.params.locale)) return res.status(400).json({ error: 'Invalid translation reference' });
    const row = await Translation.findOneAndUpdate(
      req.params,
      { $set: { noindex: Boolean(req.body?.noindex) } },
      { new: true },
    ).lean();
    if (!row) return res.status(404).json({ error: 'Translation not found' });
    res.json({ translation: row, meta: translationMeta(row) });
  } catch (error) { next(error); }
});

export default router;
