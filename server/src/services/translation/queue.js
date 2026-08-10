import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Translation from '../../models/Translation.js';
import BlogPost from '../../models/BlogPost.js';
import GameArticle from '../../models/GameArticle.js';
import Game from '../../models/Game.js';
import { TRANSLATABLE } from '../localeContent.js';
import { computeBackoff } from './quota.js';

function sourceFields(refType, source) {
  const fields = TRANSLATABLE[refType] || [];
  return fields.map((field) => field === 'tags'
    ? (Array.isArray(source?.[field]) ? source[field] : [])
    : String(source?.[field] ?? ''));
}

export function sourceHash(refType, source) {
  return crypto.createHash('sha256').update(JSON.stringify(sourceFields(refType, source))).digest('hex');
}

export async function enqueue({ refType, refId, source, locale = 'en', priority = 0, force = false, model = Translation } = {}) {
  if (!TRANSLATABLE[refType]) throw new Error(`Unsupported translation refType: ${refType}`);
  const hash = sourceHash(refType, source);
  const existing = await model.findOne({ refType, refId, locale }).lean();
  if (existing && existing.sourceHash === hash && existing.status === 'ready' && !force) return existing;
  const humanStale = existing?.origin === 'human' && !force;
  const status = humanStale ? 'stale' : 'pending';
  return model.findOneAndUpdate(
    { refType, refId, locale },
    {
      $set: {
        sourceHash: hash,
        status,
        priority,
        nextAttemptAt: new Date(),
        ...(humanStale ? {} : { lastError: '', lockedAt: null, lockedBy: '' }),
      },
      $setOnInsert: { origin: 'machine', attempts: 0, noindex: false },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function claimNext(workerId, now = new Date(), model = Translation) {
  const expiredAt = new Date(now.getTime() - 15 * 60_000);
  return model.findOneAndUpdate(
    {
      $or: [
        {
          status: 'pending',
          nextAttemptAt: { $lte: now },
          $or: [{ lockedAt: null }, { lockedAt: { $lt: expiredAt } }],
        },
        // A process can die after the atomic claim and before complete/fail.
        // Reclaim the translating row once its lease has expired.
        { status: 'translating', lockedAt: { $lt: expiredAt } },
      ],
    },
    { $set: { status: 'translating', lockedAt: now, lockedBy: workerId } },
    { sort: { priority: -1, nextAttemptAt: 1 }, new: true },
  ).lean();
}

export async function complete(rowId, fields, { model = Translation, modelName = '' } = {}) {
  return model.findOneAndUpdate(
    { _id: rowId, status: 'translating' },
    {
      $set: {
        fields,
        status: 'ready',
        origin: 'machine',
        model: modelName,
        translatedAt: new Date(),
        lastError: '',
        lockedAt: null,
        lockedBy: '',
      },
    },
    { new: true },
  ).lean();
}

export async function release(rowId, { model = Translation, nextAttemptAt = new Date() } = {}) {
  return model.findOneAndUpdate(
    { _id: rowId, status: 'translating' },
    { $set: { status: 'pending', nextAttemptAt, lockedAt: null, lockedBy: '' } },
    { new: true },
  ).lean();
}

export async function fail(row, error, { model = Translation, now = new Date() } = {}) {
  const attempts = (Number(row?.attempts) || 0) + 1;
  const dead = attempts >= 5;
  return model.findOneAndUpdate(
    { _id: row._id, status: 'translating' },
    {
      $set: {
        attempts,
        status: dead ? 'failed' : 'pending',
        lastError: String(error?.message || error || '').slice(0, 2000),
        nextAttemptAt: new Date(now.getTime() + computeBackoff(attempts)),
        lockedAt: null,
        lockedBy: '',
      },
    },
    { new: true },
  ).lean();
}

export async function retryTranslation(refType, refId, locale = 'en', model = Translation) {
  return model.findOneAndUpdate(
    { refType, refId, locale },
    { $set: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: '', lockedAt: null, lockedBy: '' } },
    { new: true },
  ).lean();
}

export async function enqueueBackfill({ refType, locale = 'en', force = false, models = {} } = {}) {
  const Post = models.BlogPost || BlogPost;
  const Article = models.GameArticle || GameArticle;
  const GameModel = models.Game || Game;
  const rows = refType === 'BlogPost'
    ? await Post.find({ published: true }).lean()
    : refType === 'GameArticle'
      ? await Article.find({ published: true }).populate('gameId', 'visibility').lean()
      : await GameModel.find({ visibility: 'public' }).lean();
  const candidates = refType === 'GameArticle'
    ? rows.filter((row) => row.gameId?.visibility === 'public')
    : rows;
  let count = 0;
  for (const row of candidates) {
    await enqueue({ refType, refId: row._id, source: row, locale, force });
    count += 1;
  }
  return { count };
}

export function validRefType(value) {
  return Object.prototype.hasOwnProperty.call(TRANSLATABLE, value);
}

export function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}
