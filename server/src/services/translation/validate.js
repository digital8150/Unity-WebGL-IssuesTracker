import { fenceRanges, protect } from './protect.js';

function count(value, regex) {
  return [...String(value ?? '').matchAll(regex)].length;
}

// Absolute links, plus the site-relative asset paths that `protect.js` masks.
//
// A bare `/word` must NOT count as a URL. Korean prose uses `/` as a plain
// separator ("3D/2D", "COOP/COEP", "쿼터뷰/탑뷰"), and matching those made the
// validator demand that the second half of every such pair survive translation
// byte-for-byte — rejecting perfectly good translations. On a real 9104-char
// post this regex previously produced 25 "URLs" of which only 2 were real.
const URL_PATTERN = /https?:\/\/[^\s)<>"']+|\/(?:blog-images|builds|grac|thumbnails)\/[^\s)<>"']+/g;

function urls(value) {
  return [...String(value ?? '').matchAll(URL_PATTERN)].map((match) => match[0]);
}

function htmlSources(value, tag) {
  const tags = [...String(value ?? '').matchAll(new RegExp('<' + tag + '\\b[^>]*>', 'gi'))];
  return tags.map((match) => match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
}

function frequency(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

function countOccurrences(value, term) {
  const text = String(value ?? '');
  const needle = String(term ?? '');
  if (!needle) return 0;
  let countValue = 0;
  let position = 0;
  while (position <= text.length - needle.length) {
    const found = text.indexOf(needle, position);
    if (found < 0) break;
    countValue += 1;
    position = found + needle.length;
  }
  return countValue;
}

function fieldText(value) {
  return Array.isArray(value) ? value.map(String).join('\u0000') : String(value ?? '');
}

export function koreanRatio(value, glossary = []) {
  // All protected values, including Hangul glossary names, are excluded from
  // this detector because they are intentionally preserved rather than
  // translated. Structural validation below still checks those values.
  const prose = protect(value, glossary).segments
    .filter((segment) => segment.type === 'prose')
    .map((segment) => segment.value)
    .join('');
  const compact = prose.replace(/\s/g, '');
  if (!compact.length) return 0;
  return (compact.match(/[\uac00-\ud7a3]/g) || []).length / compact.length;
}

function validateGlossary(source, translated, glossary, fields) {
  const errors = [];
  for (const term of glossary || []) {
    if (!String(term ?? '')) continue;
    for (const field of fields) {
      const sourceCount = countOccurrences(fieldText(source[field]), term);
      if (!sourceCount) continue;
      const translatedCount = countOccurrences(fieldText(translated[field]), term);
      if (translatedCount !== sourceCount) {
        errors.push('glossary term changed or missing in ' + field + ': ' + term);
      }
    }
  }
  return errors;
}

/**
 * `scope` limits the checks to the fields a given request actually returned.
 *
 * Metadata and body are now separate API calls, so a body response legitimately
 * contains no title/summary/tags. Validating the whole document against a
 * body-only reply reported "title is missing from the translation" on every
 * chunk and burned the entire retry budget on a translation that was fine.
 *   'body'     — markdown structure only (fences, URLs, embeds, headings)
 *   'metadata' — title/summary/tags only (presence, glossary, budgets)
 *   'all'      — the assembled document, before it is stored
 */
export function validateTranslation(source = {}, translated = {}, { budgets = {}, glossary = [], scope = 'all' } = {}) {
  const errors = [];
  const sourceMarkdown = source.content || source.description || '';
  const outputMarkdown = translated.content || translated.description || '';
  const checkBody = scope === 'all' || scope === 'body';
  const checkMetadata = scope === 'all' || scope === 'metadata';
  const contentFields = [
    ...(checkMetadata ? ['title', 'summary'] : []),
    ...(checkBody ? ['content', 'description'] : []),
  ];

  for (const field of contentFields) {
    if (String(source[field] ?? '').trim() && !String(translated[field] ?? '').trim()) {
      errors.push(field + ' is missing from the translation');
    }
  }

  if (checkBody) {
  const sourceFences = fenceRanges(sourceMarkdown).map(([start, end]) => sourceMarkdown.slice(start, end));
  const outputFences = fenceRanges(outputMarkdown).map(([start, end]) => outputMarkdown.slice(start, end));
  if (sourceFences.length !== outputFences.length || sourceFences.some((value, index) => value !== outputFences[index])) {
    errors.push('fenced code blocks changed');
  }

  const sourceUrls = frequency(urls(sourceMarkdown));
  const outputUrls = frequency(urls(outputMarkdown));
  const allUrls = new Set([...sourceUrls.keys(), ...outputUrls.keys()]);
  for (const url of allUrls) {
    if ((sourceUrls.get(url) || 0) !== (outputUrls.get(url) || 0)) {
      errors.push(sourceUrls.has(url) ? 'URL changed or missing: ' + url : 'unexpected URL: ' + url);
    }
  }

  if (count(sourceMarkdown, /!\[/g) !== count(outputMarkdown, /!\[/g)
    || count(sourceMarkdown, /\]\(/g) !== count(outputMarkdown, /\]\(/g)) {
    errors.push('markdown link/image syntax changed');
  }

  for (const tag of ['iframe', 'video', 'source']) {
    if (count(sourceMarkdown, new RegExp('<' + tag + '\\b', 'gi')) !== count(outputMarkdown, new RegExp('<' + tag + '\\b', 'gi'))
      || htmlSources(sourceMarkdown, tag).join('\u0000') !== htmlSources(outputMarkdown, tag).join('\u0000')) {
      errors.push(tag + ' markup changed');
    }
  }

  if (count(sourceMarkdown, /^\s{0,3}#{1,6}\s+/gm) !== count(outputMarkdown, /^\s{0,3}#{1,6}\s+/gm)) {
    errors.push('heading structure changed');
  }
  }

  errors.push(...validateGlossary(source, translated, glossary, checkMetadata ? contentFields.concat('tags') : contentFields));

  for (const field of contentFields) {
    if (String(translated[field] ?? '').trim() && koreanRatio(translated[field], glossary) > 0.5) {
      errors.push('translation appears to pass through Korean text in ' + field);
    }
  }

  if (checkMetadata
    && Array.isArray(source.tags)
    && (!Array.isArray(translated.tags) || source.tags.length !== translated.tags.length)) {
    errors.push('tag count changed');
  }

  const limits = {
    ...(checkMetadata ? { title: 200, summary: 400 } : {}),
    ...(checkBody ? { description: 500 } : {}),
    ...(budgets || {}),
  };
  for (const [field, limit] of Object.entries(limits)) {
    if (translated[field] && String(translated[field]).length > limit) {
      errors.push(field + ' exceeds ' + limit + ' characters');
    }
  }
  if (checkMetadata && Array.isArray(translated.tags) && translated.tags.some((tag) => String(tag).length > 50)) {
    errors.push('tag exceeds 50 characters');
  }
  return { ok: errors.length === 0, valid: errors.length === 0, errors };
}

export function assertValidTranslation(source, translated, options) {
  const result = validateTranslation(source, translated, options);
  if (!result.ok) {
    const error = new Error(result.errors.join('; '));
    error.code = 'TRANSLATION_VALIDATION_FAILED';
    error.errors = result.errors;
    throw error;
  }
  return translated;
}

/**
 * Reports how the translated Markdown drifted from the source.
 *
 * These are advisory only. The pipeline keeps the translation regardless: it is
 * a labelled machine draft with an admin edit path, and refusing to store an
 * otherwise good translation because one heading count moved left the English
 * site empty. Surfacing drift in the log (and in admin) is the useful part.
 */
export function describeMarkdownDrift(source = '', output = '') {
  const notes = [];
  const src = String(source);
  const out = String(output);

  const srcFences = fenceRanges(src).map(([a, b]) => src.slice(a, b));
  const outFences = fenceRanges(out).map(([a, b]) => out.slice(a, b));
  if (srcFences.length !== outFences.length) {
    notes.push(`code blocks ${srcFences.length} -> ${outFences.length}`);
  } else if (srcFences.some((value, index) => value !== outFences[index])) {
    notes.push('code block contents changed');
  }

  const srcUrls = frequency(urls(src));
  const outUrls = frequency(urls(out));
  const missing = [...srcUrls.keys()].filter((url) => (outUrls.get(url) || 0) !== srcUrls.get(url));
  if (missing.length) notes.push(`URL(s) altered: ${missing.slice(0, 3).join(', ')}`);

  for (const tag of ['iframe', 'video', 'source']) {
    const pattern = new RegExp('<' + tag + '\b', 'gi');
    if (count(src, pattern) !== count(out, pattern)) notes.push(`${tag} count changed`);
  }

  const srcHeadings = count(src, /^\s{0,3}#{1,6}\s+/gm);
  const outHeadings = count(out, /^\s{0,3}#{1,6}\s+/gm);
  if (srcHeadings !== outHeadings) notes.push(`headings ${srcHeadings} -> ${outHeadings}`);

  return notes;
}
