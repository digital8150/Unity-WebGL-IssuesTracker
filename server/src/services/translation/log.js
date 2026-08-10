// Structured console logging for the translation pipeline.
//
// The pipeline is fully asynchronous and its only previous observability was a
// single `console.error` in the worker catch block, so a stalled or looping
// queue looked identical to an idle one from the dev server output. These
// helpers make each stage announce itself with a stable `[translation] ` prefix
// that is easy to grep and easy to filter out.
//
// Deliberately logs identifiers, counts, and timings only — never document
// bodies, translated text, prompts, or API keys.

const PREFIX = '[translation]';

// Chatty per-request lines are opt-in so a busy backfill cannot drown the log.
// Set TRANSLATION_LOG=debug to enable them.
const DEBUG = process.env.TRANSLATION_LOG === 'debug';

export function isDebugLogging() {
  return DEBUG;
}

export function shortId(value) {
  const text = String(value ?? '');
  return text.length > 8 ? `…${text.slice(-6)}` : text;
}

export function ms(startedAt) {
  return `${Date.now() - startedAt}ms`;
}

export function log(...parts) {
  console.log(PREFIX, ...parts);
}

export function debug(...parts) {
  if (DEBUG) console.log(PREFIX, ...parts);
}

export function warn(...parts) {
  console.warn(PREFIX, ...parts);
}

export function error(...parts) {
  console.error(PREFIX, ...parts);
}

/**
 * Logs a state transition only when it actually changes.
 * The worker loop ticks every few seconds; without this, "waiting for work"
 * would print hundreds of identical lines an hour and hide the useful ones.
 */
export function createTransitionLogger() {
  let previous = null;
  return (state, ...parts) => {
    if (state === previous) return false;
    previous = state;
    log(...parts);
    return true;
  };
}
