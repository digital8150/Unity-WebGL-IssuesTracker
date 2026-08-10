import { fetchJson } from './http.js';
import { log, warn } from './log.js';
import { withThinkingVariant, wantsThinkingOff } from './prompt.js';

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

// How to switch reasoning off, in the order we try it.
//
// The parameter is generation-specific and Gemini never names the field it
// rejected — gemini-3.6-flash answers a bare "400 Request contains an invalid
// argument." to `thinkingBudget`. Probed directly against the API:
//   thinkingLevel: 'low'  -> 200, thoughtsTokenCount 0   (Gemini 3.x)
//   thinkingBudget: 0     -> 400                          (Gemini 3.x)
//   thinkingBudget: 0     -> 200                          (Gemini 2.5.x)
//   omitted entirely      -> 200, but reasoning stays ON
// Sending the wrong one used to strip thinking control altogether, so the model
// spent most of its output budget thinking and the answer came back truncated.
const THINKING_OFF_VARIANTS = [
  { label: "thinkingLevel:'low'", config: { thinkingLevel: 'low' } },
  { label: 'thinkingBudget:0', config: { thinkingConfig: { thinkingBudget: 0 } } },
  { label: 'none', config: null },
];

// model -> index into THINKING_OFF_VARIANTS that the model accepted.
const thinkingVariantByModel = new Map();

function normalizeVariant(entry) {
  if (!entry.config) return null;
  return entry.config.thinkingConfig ? entry.config.thinkingConfig : entry.config;
}

function rejectsRequest(error) {
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

  let body;
  if (!wantsThinkingOff(payload)) {
    body = await request(withThinkingVariant(payload, null));
  } else {
    // Start from whatever this model accepted last time, then walk the list.
    let index = thinkingVariantByModel.get(modelPath) ?? 0;
    for (;;) {
      const entry = THINKING_OFF_VARIANTS[index];
      try {
        body = await request(withThinkingVariant(payload, normalizeVariant(entry)));
        if (thinkingVariantByModel.get(modelPath) !== index) {
          thinkingVariantByModel.set(modelPath, index);
          log(`    ${modelPath} disables reasoning with ${entry.label}`);
        }
        break;
      } catch (error) {
        const next = index + 1;
        if (!rejectsRequest(error) || next >= THINKING_OFF_VARIANTS.length) {
          if (error?.status === 400) {
            warn(`    ${modelPath} HTTP 400 body: ${JSON.stringify(error.body?.error?.details || error.body?.error?.message || error.body || {}).slice(0, 400)}`);
          }
          throw error;
        }
        warn(`    ${modelPath} rejected ${entry.label} — trying ${THINKING_OFF_VARIANTS[next].label}`);
        index = next;
      }
    }
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
    const thoughts = Number(usage.thoughtsTokenCount) || 0;
    const written = Number(usage.candidatesTokenCount) || 0;
    if (finish === 'MAX_TOKENS' && thoughts > written) {
      warn(`    the output budget went mostly to reasoning (${thoughts} thought vs ${written} written)`
        + ` — raise maxOutputTokens or use a model whose thinking can be disabled`);
    }
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
