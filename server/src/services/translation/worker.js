import crypto from 'node:crypto';
import Translation from '../../models/Translation.js';
import SiteSettings from '../../models/SiteSettings.js';
import ModelQuota from '../../models/ModelQuota.js';
import BlogPost from '../../models/BlogPost.js';
import GameArticle from '../../models/GameArticle.js';
import Game from '../../models/Game.js';
import { getGeminiKey, getSettings } from './settings.js';
import {
  markQuotaExhausted,
  pacificDayKey,
  minuteKey,
  nextPacificMidnight,
  pickModel,
  reserveQuota,
} from './quota.js';
import { claimNext, complete, fail, release } from './queue.js';
import { isRateLimitWindow, retryDelaySeconds } from './http.js';
import { translateDocument } from './translate.js';
import { createTransitionLogger, error, isDebugLogging, log, ms, shortId, warn } from './log.js';

let activeWorker = null;

const sourceModels = { BlogPost, GameArticle, Game };

export function isTranslationDrainEnabled(settings) {
  return Boolean(settings?.translation?.enabled);
}

export function workerRuntimeStatus(state = activeWorker) {
  return {
    active: Boolean(state?.active),
    startedAt: state?.startedAt || null,
    lastDrainAttemptAt: state?.lastDrainAttemptAt || null,
    lastSuccessfulClaimAt: state?.lastSuccessfulClaimAt || null,
  };
}

export function getTranslationWorkerStatus() {
  return workerRuntimeStatus();
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function quotaUsage(chain, now) {
  const rows = await ModelQuota.find({
    model: { $in: chain.map((entry) => entry.model) },
    $or: [
      { window: 'day', key: pacificDayKey(now) },
      { window: 'minute', key: minuteKey(now) },
    ],
  }).lean();
  const usage = new Map();
  for (const row of rows) {
    usage.set(`${row.model}:${row.window}:${row.key}`, {
      count: row.count,
      exhaustedAt: row.exhaustedAt,
    });
  }
  return usage;
}

/**
 * A quota rejection says nothing about the document — it says this model is
 * spent. Charging it to the row's five attempts meant a rate limit could
 * dead-letter perfectly translatable content before the fallback chain was ever
 * tried, which is exactly what happened in production.
 */
export function isQuotaFailure(error) {
  if (error?.status === 429) return true;
  if (error?.code === 'QUOTA_SLOT_UNAVAILABLE') return true;
  const text = `${error?.message || ''} ${JSON.stringify(error?.body?.error || {})}`;
  return /quota|rate.?limit|resource[_ ]?exhausted/i.test(text);
}

async function handleTranslationError(row, failure) {
  const attempt = Number(row.attempts) || 0;
  warn(`FAILED ${row.refType} ${shortId(row.refId)} · attempt ${attempt + 1}/5 · model=${row.__reservedModel || '-'}${failure.status ? ` · HTTP ${failure.status}` : ''} · ${failure.code || failure.message}`);
  if (failure.errors?.length) warn(`  validation: ${failure.errors.slice(0, 4).join(' | ')}`);

  const error = failure;
  if (error.status === 401 || error.status === 403) {
    warn('  bad API key — disabling the worker so the queue is not burned against it');
    // A bad key should stop the queue instead of burning attempts against
    // every pending document.
    await SiteSettings.findByIdAndUpdate('site', { $set: { 'translation.enabled': false } });
  }

  if (isQuotaFailure(error)) {
    const retryDelay = retryDelaySeconds(error.body);
    // Prefer what the body actually says. Treating an unlabelled 429 as daily
    // exhaustion killed a model for a whole day over a 13-millisecond
    // per-minute limit, and the queue lost its entire fallback chain with it.
    // Only a body that names a daily metric, or a retry hint too long to wait
    // out, is allowed to burn the day.
    const shortWindow = isRateLimitWindow(error.body);
    const daily = !shortWindow && (retryDelay === null || retryDelay > 90);
    const window = daily ? 'day' : 'minute';
    warn(`  quota: ${row.__reservedModel} exhausted (${window}, retryDelay=${retryDelay ?? 'none'}) — releasing the row so the next model in the chain picks it up immediately`);
    if (row.__reservedModel) {
      await markQuotaExhausted({ model: row.__reservedModel, window, quotaModel: ModelQuota });
    }
    // Released, not failed: no attempt is consumed and there is no backoff, so
    // the very next loop iteration re-claims the row and pickModel() hands it
    // to the following entry in the chain.
    await release(row._id, { nextAttemptAt: new Date() });
    return;
  }

  await fail(row, error);
}

async function processRow(row, settings) {
  const now = new Date();
  const usage = await quotaUsage(settings.translation.modelChain, now);
  const entry = pickModel(settings.translation.modelChain, usage, now);
  if (!entry) {
    await release(row._id, { nextAttemptAt: new Date(now.getTime() + 1000) });
    return false;
  }

  // One reservation per API call, not per row: a row issues 1 metadata request
  // plus one per chunk, so reserving once here let the worker run ~4x over the
  // configured RPM before Google rejected it.
  let reservedCalls = 0;
  const reserveRequest = async () => {
    const at = new Date();
    const reservation = await reserveQuota({ model: entry.model, entry, now: at, quotaModel: ModelQuota });
    if (!reservation.day || !reservation.minute) {
      const err = new Error(`Quota slot unavailable for ${entry.model} (${!reservation.day ? 'daily' : 'per-minute'})`);
      err.code = 'QUOTA_SLOT_UNAVAILABLE';
      err.window = reservation.day ? 'minute' : 'day';
      throw err;
    }
    reservedCalls += 1;
  };

  try {
    await reserveRequest();
  } catch (reserveError) {
    if (row.__reservedModel === undefined) row.__reservedModel = entry.model;
    warn(`  quota: ${entry.model} had no free slot — releasing for the next model`);
    await markQuotaExhausted({ model: entry.model, window: reserveError?.window || 'minute', quotaModel: ModelQuota });
    // Another worker took the last slot after pickModel(). Not a translation
    // failure — release the claim so it is retried without burning an attempt.
    await release(row._id, { nextAttemptAt: new Date(now.getTime() + 1000) });
    return false;
  }
  let firstCallConsumed = false;

  row.__reservedModel = entry.model;
  const dayUsed = Number(usage.get(`${entry.model}:day:${pacificDayKey(now)}`)?.count || 0);
  log(`  model=${entry.model} · day ${dayUsed + 1}/${entry.rpd || '?'} · rpm=${entry.rpm || '?'}`);
  try {
    const key = await getGeminiKey();
    const Source = sourceModels[row.refType];
    const source = Source ? await Source.findById(row.refId).lean() : null;
    if (!source) {
      warn(`  source ${row.refType} ${shortId(row.refId)} no longer exists — dead-lettering`);
      await fail(row, new Error('Source document no longer exists'));
      return true;
    }
    const result = await translateDocument({
      refType: row.refType,
      source,
      model: entry.model,
      apiKey: key.key,
      maxChunkChars: settings.translation.maxChunkChars,
      promptVersion: settings.translation.promptVersion,
      // The first call is already paid for by the reservation above.
      reserveRequest: async () => {
        if (!firstCallConsumed) { firstCallConsumed = true; return; }
        await reserveRequest();
      },
    });
    await complete(row._id, result.fields, { modelName: entry.model });
    log(`  ${reservedCalls} API call(s) charged to ${entry.model}`);
    log(`  stored ${row.refType} ${shortId(row.refId)} · title=${result.fields?.title ? 'yes' : '-'} · content=${(result.fields?.content || '').length}ch · desc=${(result.fields?.description || '').length}ch · tags=${(result.fields?.tags || []).length}`);
  } catch (error) {
    await handleTranslationError(row, error);
  } finally {
    delete row.__reservedModel;
  }
  return true;
}

export function startTranslationWorker({ enabled = true, intervalMs = 5000 } = {}) {
  if (!enabled || activeWorker) return activeWorker || { stop() {} };

  const controller = new AbortController();
  const workerId = `${process.pid}-${crypto.randomUUID()}`;
  const state = {
    active: true,
    startedAt: new Date(),
    lastDrainAttemptAt: null,
    lastSuccessfulClaimAt: null,
    controller,
    currentClaim: null,
    promise: null,
    stop() {
      state.active = false;
      controller.abort();
      if (state.currentClaim) {
        Translation.updateOne(
          { _id: state.currentClaim, status: 'translating', lockedBy: workerId },
          { $set: { status: 'pending', nextAttemptAt: new Date(), lockedAt: null, lockedBy: '' } },
        ).catch(() => {});
      }
    },
  };

  log(`worker started · pid=${process.pid} · poll=${intervalMs}ms${isDebugLogging() ? ' · debug' : ''}`);

  state.promise = (async () => {
    // The loop ticks every few seconds; announce idle/blocked states only when
    // they change so the log shows transitions instead of a wall of repeats.
    const announce = createTransitionLogger();

    while (!controller.signal.aborted) {
      try {
        state.lastDrainAttemptAt = new Date();
        const settings = await getSettings();
        if (!isTranslationDrainEnabled(settings)) {
          announce('disabled', 'paused · translation.enabled is off in SiteSettings');
          await sleep(intervalMs, controller.signal);
          continue;
        }
        if (!settings.translation.modelChain.length) {
          announce('nochain', 'paused · no models configured in the fallback chain');
          await sleep(intervalMs, controller.signal);
          continue;
        }

        const now = new Date();
        const usage = await quotaUsage(settings.translation.modelChain, now);
        if (settings.translation.dailyRequestCap > 0) {
          const total = settings.translation.modelChain.reduce(
            (sum, entry) => sum + Number(usage.get(`${entry.model}:day:${pacificDayKey(now)}`)?.count || 0),
            0,
          );
          if (total >= settings.translation.dailyRequestCap) {
            announce('cap', `paused · daily request cap reached (${total}/${settings.translation.dailyRequestCap}) · resumes ${nextPacificMidnight(now).toISOString()}`);
            await sleep(Math.max(intervalMs, nextPacificMidnight(now).getTime() - now.getTime()), controller.signal);
            continue;
          }
        }
        if (!pickModel(settings.translation.modelChain, usage, now)) {
          announce('quota', `paused · every model in the chain is out of quota · resumes ${nextPacificMidnight(now).toISOString()}`);
          await sleep(Math.max(intervalMs, nextPacificMidnight(now).getTime() - now.getTime()), controller.signal);
          continue;
        }
        const row = await claimNext(workerId, now);
        if (!row) {
          announce('idle', 'idle · queue empty, waiting for work');
          await sleep(intervalMs, controller.signal);
          continue;
        }
        announce('busy', `claimed ${row.refType} ${shortId(row.refId)} · attempt ${(Number(row.attempts) || 0) + 1}`);
        state.lastSuccessfulClaimAt = now;
        state.currentClaim = row._id;
        const startedAt = Date.now();
        try {
          await processRow(row, settings);
          log(`finished ${row.refType} ${shortId(row.refId)} in ${ms(startedAt)}`);
        } finally {
          state.currentClaim = null;
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          error('worker loop error:', err);
          await sleep(intervalMs, controller.signal);
        }
      }
    }
    log('worker stopped');
  })();

  activeWorker = state;
  return state;
}

export function stopTranslationWorker() {
  activeWorker?.stop();
  activeWorker = null;
}
