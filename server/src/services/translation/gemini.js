import { fetchJson } from './http.js';
import { log, warn } from './log.js';
import { withoutThinkingConfig } from './prompt.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

export async function listModels(apiKey, { fetcher = fetchJson } = {}) {
  const body = await fetcher(`${API_ROOT}/models`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  return (body?.models || []).map((model) => ({
    name: String(model.name || '').replace(/^models\//, ''),
    displayName: model.displayName || model.name || '',
    description: model.description || '',
    supportedGenerationMethods: model.supportedGenerationMethods || [],
    inputTokenLimit: model.inputTokenLimit,
    outputTokenLimit: model.outputTokenLimit,
  }));
}

// Models that rejected `thinkingConfig`. Populated at runtime so one 400 per
// model is the entire cost of discovering it, instead of a dead-lettered queue.
const noThinkingConfigSupport = new Set();

// Gemini does not name the offending field when it refuses `thinkingConfig`:
// gemini-3.5-flash-lite answers a bare `400 Request contains an invalid
// argument.` with no `fieldViolations` and no mention of thinking anywhere in
// the body. Matching on the message therefore never fired, and every row in the
// queue dead-lettered. Treat any 400 as a candidate: `thinkingConfig` is the
// only optional field we add, a 400 is deterministic so retrying costs exactly
// one request, and if the argument was actually invalid for some other reason
// the retry surfaces that error instead.
function rejectsThinkingConfig(error) {
  return error?.status === 400;
}

export async function generateContent(model, payload, apiKey, { fetcher = fetchJson } = {}) {
  const modelPath = String(model).replace(/^models\//, '');
  const url = `${API_ROOT}/models/${encodeURIComponent(modelPath)}:generateContent`;
  const request = (sent) => fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(sent),
  });

  const effective = noThinkingConfigSupport.has(modelPath) ? withoutThinkingConfig(payload) : payload;
  let body;
  try {
    body = await request(effective);
  } catch (error) {
    if (!rejectsThinkingConfig(error) || !effective?.generationConfig?.thinkingConfig) {
      if (error?.status === 400) {
        warn(`    ${modelPath} HTTP 400 body: ${JSON.stringify(error.body?.error?.details || error.body?.error?.message || error.body || {}).slice(0, 400)}`);
      }
      throw error;
    }
    warn(`    ${modelPath} rejected thinkingConfig (HTTP 400) — retrying without it and remembering for this process`);
    noThinkingConfigSupport.add(modelPath);
    body = await request(withoutThinkingConfig(effective));
  }
  const candidate = body?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';

  // Without this the caller only ever sees "content is undefined" and has no way
  // to tell a refusal from a truncation from a thinking-budget blowout. Reasoning
  // models spend output tokens on thoughts, so MAX_TOKENS here usually means the
  // budget was consumed before the answer was written.
  const usage = body?.usageMetadata || {};
  const finish = candidate?.finishReason || 'none';
  log(`    gemini ${model} · finish=${finish} · text=${text.length}ch · tokens in=${usage.promptTokenCount ?? '?'} out=${usage.candidatesTokenCount ?? '?'} thoughts=${usage.thoughtsTokenCount ?? 0} total=${usage.totalTokenCount ?? '?'}`);
  if (finish !== 'STOP' && finish !== 'none') {
    warn(`    gemini stopped early: finishReason=${finish}${candidate?.finishMessage ? ` (${candidate.finishMessage})` : ''}`);
  }

  if (!text) {
    const err = new Error(`Gemini returned no text (finishReason=${finish})`);
    err.code = 'GEMINI_EMPTY_RESPONSE';
    err.finishReason = finish;
    throw err;
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced) {
      warn(`    gemini returned unparseable JSON · first 160ch: ${JSON.stringify(text.slice(0, 160))}`);
      const err = new Error(`Gemini returned invalid JSON (finishReason=${finish})`);
      err.code = 'GEMINI_INVALID_JSON';
      err.finishReason = finish;
      throw err;
    }
    parsed = JSON.parse(fenced[1]);
  }

  log(`    gemini payload keys: ${Object.keys(parsed || {}).map((k) => `${k}=${Array.isArray(parsed[k]) ? `array(${parsed[k].length})` : typeof parsed[k]}`).join(' ') || '(none)'}`);
  return parsed;
}

export { API_ROOT };
