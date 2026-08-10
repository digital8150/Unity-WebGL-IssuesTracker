function fenceRanges(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const ranges = [];
  let offset = 0;
  let start = -1;
  let fenceChar = '';
  let fenceLength = 0;
  lines.forEach((line, index) => {
    const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (start < 0 && open) {
      start = offset;
      fenceChar = open[1][0];
      fenceLength = open[1].length;
    } else if (start >= 0) {
      const close = line.match(new RegExp(`^\s{0,3}(${fenceChar}{${fenceLength},})\s*$`));
      if (close) {
        ranges.push([start, offset + line.length]);
        start = -1;
        fenceChar = '';
        fenceLength = 0;
      }
    }
    offset += line.length + (index < lines.length - 1 ? 1 : 0);
  });
  if (start >= 0) ranges.push([start, String(markdown ?? '').length]);
  return ranges;
}

function overlaps(range, ranges) {
  return ranges.some(([start, end]) => range[0] < end && range[1] > start);
}

function addMatches(text, regex, ranges, group = 0) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text))) {
    const value = match[group];
    const start = match.index + match[0].indexOf(value);
    const range = [start, start + value.length];
    if (range[1] > range[0] && !overlaps(range, ranges)) ranges.push(range);
  }
}

function hasHangul(value) {
  return /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/iu.test(String(value));
}

function addProtectedRanges(text, glossary) {
  // These ranges are deliberately kept in one place. Their boundaries are
  // also used by validation, so a change here changes the Markdown contract.
  const ranges = fenceRanges(text);
  addMatches(text, /(`+)(?!`)([\s\S]*?)\1(?!`)/g, ranges, 0);
  addMatches(text, /<(iframe|video)\b[^>]*>[\s\S]*?<\/\1\s*>|<source\b[^>]*\/?>/gi, ranges);
  addMatches(text, /!?\[[^\]]*\]\(([^)\s]+)([^)]*)\)/g, ranges, 1);
  addMatches(text, /(?:https?:\/\/|\/)(?:blog-images|builds)\/[^\s)<>"']+/gi, ranges);

  // Latin glossary terms such as Unity and WebGL are already English. Masking
  // them injects opaque tokens into ordinary prose and makes the model much
  // less likely to reproduce the surrounding text naturally. A glossary name
  // containing Hangul is different: it can plausibly be translated, so keep
  // that narrow class as an untouched protected segment.
  const sortedGlossary = [...glossary]
    .filter((term) => term && hasHangul(term))
    .sort((a, b) => String(b).length - String(a).length);
  for (const term of sortedGlossary) {
    addMatches(text, new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), ranges);
  }

  return ranges.sort((a, b) => a[0] - b[0]);
}

function pushSegment(segments, type, value) {
  if (!value) return;
  segments.push({ type, value });
}

/**
 * Split Markdown into model-visible prose and server-owned protected blocks.
 *
 * Protected values are never serialized into a prompt. Whitespace-only gaps
 * are retained as protected layout so the model cannot normalize separators.
 */
// A run between two protected blocks is only worth translating if it contains
// an actual word. Adjacent inline-code spans (``a`, `b`, `c``) leave fragments
// like ", " behind, and sending those as "prose segments" is nonsense the model
// cannot honour: asked to translate [", ", ", ", "(일부) 등…"] it merged and
// re-split the array and returned 54 strings where 19 were expected, failing
// the whole chunk. Anything without a letter or digit stays server-side.
function isTranslatable(value) {
  return /[\p{L}\p{N}]/u.test(String(value ?? ''));
}

export function segmentMarkdown(markdown, glossary = []) {
  const text = String(markdown ?? '');
  const ranges = addProtectedRanges(text, glossary);
  const segments = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) {
      const prose = text.slice(cursor, start);
      pushSegment(segments, isTranslatable(prose) ? 'prose' : 'protected', prose);
    }
    pushSegment(segments, 'protected', text.slice(start, end));
    cursor = end;
  }
  if (cursor < text.length) {
    const prose = text.slice(cursor);
    pushSegment(segments, isTranslatable(prose) ? 'prose' : 'protected', prose);
  }
  if (!segments.length) segments.push({ type: 'prose', value: text });
  return segments;
}

/**
 * Compatibility-named entry point for callers that previously masked text.
 * It now returns positional segments and performs no placeholder masking.
 */
export function protect(markdown, glossary = []) {
  const segments = segmentMarkdown(markdown, glossary);
  return {
    segments,
    prose: segments.filter((segment) => segment.type === 'prose').map((segment) => segment.value),
  };
}


export { fenceRanges };
