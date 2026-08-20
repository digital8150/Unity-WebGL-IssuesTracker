const AUDIO_SETTLE_TIMEOUT_MS = 250;

function settleWithin(promise, timeoutMs, timeoutValue) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = window.setTimeout(() => resolve(timeoutValue), timeoutMs);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

function audioOperation(contexts, method) {
  const operations = [...contexts].map((context) => {
    if (!context || context.state === 'closed' || typeof context[method] !== 'function') {
      return Promise.resolve();
    }
    try {
      return Promise.resolve(context[method]());
    } catch {
      return Promise.resolve();
    }
  });
  return Promise.allSettled(operations);
}

export function installUnityAudioContextTracker(targetWindow, contexts) {
  const restores = [];

  for (const key of ['AudioContext', 'webkitAudioContext']) {
    const NativeAudioContext = targetWindow?.[key];
    if (typeof NativeAudioContext !== 'function') continue;

    function TrackedAudioContext(...args) {
      const context = Reflect.construct(NativeAudioContext, args, NativeAudioContext);
      contexts.add(context);
      return context;
    }

    try {
      Object.setPrototypeOf(TrackedAudioContext, NativeAudioContext);
      TrackedAudioContext.prototype = NativeAudioContext.prototype;
      targetWindow[key] = TrackedAudioContext;
      if (targetWindow[key] === TrackedAudioContext) {
        restores.push(() => {
          if (targetWindow[key] === TrackedAudioContext) targetWindow[key] = NativeAudioContext;
        });
      }
    } catch {
      // Some browsers expose the constructor as read-only. Unity's regular
      // unload path still runs; this tracker is only the failure fallback.
    }
  }

  return () => restores.reverse().forEach((restore) => restore());
}

export async function disposeUnityRuntime({
  unityInstance,
  detachAndUnload,
  audioContexts,
  container,
  timeoutMs = 4000,
}) {
  container?.querySelectorAll?.('audio, video').forEach((media) => {
    try { media.pause(); } catch { /* best-effort fallback */ }
  });

  await settleWithin(
    audioOperation(audioContexts, 'suspend'),
    AUDIO_SETTLE_TIMEOUT_MS,
    null,
  );

  if (!unityInstance || typeof detachAndUnload !== 'function') {
    await settleWithin(audioOperation(audioContexts, 'close'), AUDIO_SETTLE_TIMEOUT_MS, null);
    return { status: 'not-instantiated' };
  }

  const canvas = unityInstance.Module?.canvas;
  const unloadResult = Promise.resolve()
    .then(() => detachAndUnload())
    .then(
      () => ({ status: 'unloaded' }),
      (error) => ({ status: 'failed', error }),
    );

  const result = await settleWithin(unloadResult, timeoutMs, { status: 'timed-out' });
  await settleWithin(audioOperation(audioContexts, 'close'), AUDIO_SETTLE_TIMEOUT_MS, null);
  canvas?.remove?.();
  return result;
}
