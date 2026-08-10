import SiteSettings from '../../models/SiteSettings.js';

export const DEFAULT_TRANSLATION_SETTINGS = Object.freeze({
  enabled: false,
  publishEnabled: false,
  modelChain: [],
  targetLocales: ['en'],
  promptVersion: 'v1',
  maxChunkChars: 4000,
  dailyRequestCap: 0,
});

export async function getSettings(model = SiteSettings) {
  const row = await model.findById('site').lean();
  return {
    ...(row || {}),
    translation: { ...DEFAULT_TRANSLATION_SETTINGS, ...(row?.translation || {}) },
  };
}

export async function getGeminiKey(model = SiteSettings) {
  const row = await model.findById('site').select('+geminiApiKey').lean();
  if (row?.geminiApiKey) return { key: row.geminiApiKey, source: 'db', row };
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY, source: 'env', row };
  const error = new Error('Gemini API key is not configured');
  error.code = 'GEMINI_KEY_MISSING';
  throw error;
}

export function publicSettings(row, source = null) {
  const key = row?.geminiApiKey || '';
  return {
    configured: Boolean(key || row?.geminiKeyLast4) || source === 'env',
    last4: row?.geminiKeyLast4 || (source === 'env' && process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(-4) : ''),
    source: key ? 'db' : source,
    translation: { ...DEFAULT_TRANSLATION_SETTINGS, ...(row?.translation || {}) },
  };
}

export function normalizeModelChain(chain) {
  if (!Array.isArray(chain)) return [];
  return chain
    .map((entry) => ({
      model: String(entry?.model || '').trim(),
      rpd: Math.max(0, Number(entry?.rpd) || 0),
      rpm: Math.max(0, Number(entry?.rpm) || 0),
      enabled: entry?.enabled !== false,
    }))
    .filter((entry) => entry.model);
}
