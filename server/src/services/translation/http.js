import { warn } from './log.js';

export class TranslationHttpError extends Error {
  constructor(message, { status = 0, body = null, url = '' } = {}) {
    super(message);
    this.name = 'TranslationHttpError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function retryableRateLimit(body) {
  const delay = retryDelaySeconds(body);
  return delay !== null && delay <= 90;
}

function delayMs(attempt) {
  return Math.min(30_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
}

export function retryDelaySeconds(body) {
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  for (const detail of details) {
    const raw = detail?.retryInfo?.retryDelay;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (raw && typeof raw === 'object' && Number.isFinite(Number(raw.seconds))) return Number(raw.seconds);
    const match = String(raw || '').match(/^(\d+(?:\.\d+)?)s$/);
    if (match) return Number(match[1]);
  }
  // Gemini often puts the hint in prose instead of retryInfo, e.g.
  // "Please retry in 13.29357ms." Missing it made a 13-millisecond per-minute
  // limit look like an unparseable quota error, and the worker responded by
  // marking the model dead for the rest of the day.
  const text = String(body?.error?.message || '');
  const prose = text.match(/retry in\s+(\d+(?:\.\d+)?)\s*(ms|s|seconds?)/i);
  if (prose) {
    const value = Number(prose[1]);
    return /^ms$/i.test(prose[2]) ? value / 1000 : value;
  }
  return null;
}

/**
 * True when a 429 is a short-window rate limit rather than the daily allowance.
 * Google labels the metric in the body; `..._per_minute` and the free-tier
 * request metric are per-minute buckets that recover on their own.
 */
export function isRateLimitWindow(body) {
  const text = JSON.stringify(body?.error || {});
  if (/per_?day|PerDay|daily/i.test(text)) return false;
  return /per_?minute|PerMinute|free_tier_requests|requests per minute|RPM/i.test(text);
}

// A whole blog post is translated in one request, so a slow generation is
// normal rather than a fault. 120s was too tight: every attempt aborted
// mid-generation and the retry resent the same large payload from scratch,
// burning three quota slots and ~6 minutes to make zero progress.
// Override with TRANSLATION_HTTP_TIMEOUT_MS.
export const DEFAULT_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.TRANSLATION_HTTP_TIMEOUT_MS) || 300_000,
);

// A timeout means the request was too big to finish, not that the service
// blipped — resending it unchanged usually just times out again. Give it one
// extra shot rather than the full retry budget used for transient 5xx/429s.
const TIMEOUT_RETRIES = 1;

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

export async function fetchJson(url, options = {}) {
  const { retries = 3, signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  let lastError;
  let timeoutAttempts = 0;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { ...fetchOptions, signal: signal || AbortSignal.timeout(timeoutMs) });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      if (response.ok) return body;
      const error = new TranslationHttpError(
        body?.error?.message || `Translation request failed: ${response.status}`,
        { status: response.status, body, url },
      );
      const maxRateLimitAttempt = Math.min(2, retries);
      if (!retryableStatus(response.status)
        || (response.status === 429 && (!retryableRateLimit(body) || attempt >= maxRateLimitAttempt))
        || attempt >= retries) throw error;
      lastError = error;
      const retryAfter = retryDelaySeconds(body);
      const wait = retryAfter ? retryAfter * 1000 : delayMs(attempt);
      warn(`    http ${response.status} after ${Date.now() - startedAt}ms — retry ${attempt + 1}/${retries} in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    } catch (error) {
      if (error instanceof TranslationHttpError
        && (!retryableStatus(error.status)
          || (error.status === 429 && (!retryableRateLimit(error.body) || attempt >= Math.min(2, retries))))) throw error;
      if (isTimeout(error)) {
        timeoutAttempts += 1;
        if (timeoutAttempts > TIMEOUT_RETRIES) {
          warn(`    http timed out after ${Date.now() - startedAt}ms (limit ${timeoutMs}ms) — giving up; the payload is too large to finish in time, lower maxChunkChars`);
          throw error;
        }
      }
      if (attempt >= retries) throw error;
      lastError = error;
      const wait = delayMs(attempt);
      warn(`    http ${isTimeout(error) ? `timed out (limit ${timeoutMs}ms)` : error.message} after ${Date.now() - startedAt}ms — retry ${attempt + 1}/${retries} in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError || new Error('Translation request failed');
}
