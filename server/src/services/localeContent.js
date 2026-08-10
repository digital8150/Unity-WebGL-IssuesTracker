import Translation from '../models/Translation.js';

export const TRANSLATABLE = Object.freeze({
  BlogPost: ['title', 'summary', 'content', 'tags'],
  GameArticle: ['title', 'summary', 'content', 'tags'],
  Game: ['description'],
});

function idString(value) {
  const id = value?._id ?? value?.id ?? value;
  return id === null || id === undefined ? null : String(id);
}

export async function loadTranslations(refType, ids, locale, model = Translation) {
  if (locale !== 'en' || !TRANSLATABLE[refType]) return new Map();
  const values = [...new Set((ids || []).map(idString).filter(Boolean))];
  if (!values.length) return new Map();
  const rows = await model.find({ refType, refId: { $in: values }, locale: 'en' }).lean();
  return new Map(rows.map((row) => [idString(row.refId), row]));
}

export function mergeTranslation(doc, row, refType) {
  if (!doc || !row || !['ready', 'stale'].includes(row.status) || row.noindex || !TRANSLATABLE[refType]) return doc;
  const result = { ...doc };
  const allowed = TRANSLATABLE[refType];
  for (const field of allowed) {
    const value = row.fields?.[field];
    if (field === 'tags') {
      if (Array.isArray(value) && value.length) result.tags = [...value];
    } else if (typeof value === 'string' && value.trim()) {
      result[field] = value;
    }
  }
  return result;
}

export function translationMeta(row) {
  if (!row || !['ready', 'stale'].includes(row.status)) return null;
  return {
    origin: row.origin || 'machine',
    translatedAt: row.translatedAt ?? null,
    noindex: Boolean(row.noindex),
  };
}

export function publicTranslation(row, locale, publishEnabled) {
  return locale === 'en' && publishEnabled && isUsableTranslation(row) ? row : null;
}

export function publicTranslationMeta(row, locale, publishEnabled) {
  const usable = publicTranslation(row, locale, publishEnabled);
  if (!usable) return null;
  const meta = translationMeta(usable);
  // A stale row is useful as a continuity fallback after a Korean edit, but it
  // must not become an indexable English page until it is translated again.
  return usable.status === 'stale' ? { ...meta, noindex: true } : meta;
}

export async function translationPublishEnabled(locale, settingsModel) {
  if (locale !== 'en' || !settingsModel) return false;
  try {
    const row = await settingsModel.findById('site').select('translation.publishEnabled').lean();
    return Boolean(row?.translation?.publishEnabled);
  } catch {
    // Public API reads fail closed when the publication switch cannot be read.
    return false;
  }
}

export function isPublishedTranslation(row, publishEnabled) {
  return Boolean(publishEnabled && row?.status === 'ready' && !row.noindex);
}

export function isUsableTranslation(row) {
  return Boolean(['ready', 'stale'].includes(row?.status) && !row.noindex);
}

export function translationKey(refType, refId) {
  return `${refType}:${idString(refId)}`;
}
