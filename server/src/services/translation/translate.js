import Game from '../../models/Game.js';
import { buildGlossary } from './glossary.js';
import { splitMarkdown, precedingContext } from './chunk.js';
import { buildGeneratePayload } from './prompt.js';
import { describeMarkdownDrift, koreanRatio } from './validate.js';
import { generateContent } from './gemini.js';
import { log, ms, warn } from './log.js';

function sourceFields(refType, source) {
  if (refType === 'Game') return { description: String(source?.description || '') };
  return {
    title: String(source?.title || ''),
    summary: String(source?.summary || ''),
    content: String(source?.content || ''),
    tags: Array.isArray(source?.tags) ? source.tags.map(String) : [],
  };
}

function applyTagPolicy(sourceTags, translatedTags, glossary) {
  return sourceTags.map((tag, index) => {
    const value = String(tag || '');
    if (!/[가-힣]/.test(value) || glossary.some((term) => term.toLowerCase() === value.toLowerCase())) return value;
    return String(translatedTags?.[index] || value);
  });
}

function truncateAtWordBoundary(value, limit) {
  const text = String(value ?? '').trim();
  if (text.length <= limit) return text;
  const candidate = text.slice(0, limit + 1);
  const boundary = candidate.lastIndexOf(' ');
  const end = boundary >= Math.floor(limit * 0.6) ? boundary : limit;
  return candidate.slice(0, end).trim();
}

// `reserveRequest` is called before EVERY API call. Quota used to be reserved
// once per queue row while a single row issues 1 metadata + N chunk requests,
// so the counters under-reported by the chunk count and the worker sailed past
// the configured RPM until Google returned a real 429.
export async function translateDocument({ refType, source, model, apiKey, maxChunkChars = 12000, promptVersion = 'v1', gameModel = Game, generate = generateContent, reserveRequest = null } = {}) {
  const callModel = async (payload) => {
    if (reserveRequest) await reserveRequest();
    return generate(model, payload, apiKey);
  };
  const original = sourceFields(refType, source);
  const gameNames = await gameModel.find().select('name').lean();
  const glossary = buildGlossary(gameNames.map((game) => game.name));
  const sourceText = original.content || original.description || '';
  const contentChunks = splitMarkdown(sourceText, maxChunkChars);
  const translatedChunks = [];
  let context = '';
  let firstResult = null;

  log(`  ${refType} · ${sourceText.length}ch · ${contentChunks.length} chunk(s) · glossary=${glossary.length}`);

  // Metadata gets its own small request. When it shared a call with the body a
  // runaway title ate the output budget and the translated content was never
  // written; isolated, the same failure costs one cheap request and the body
  // still gets through. A Game has no title/summary/tags, so it skips this.
  let metadata = {};
  const wantsMetadata = refType !== 'Game'
    && Boolean(original.title || original.summary || (original.tags || []).length);
  if (wantsMetadata) {
    const metaStartedAt = Date.now();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        metadata = await callModel(buildGeneratePayload({
          source: { title: original.title, summary: original.summary, tags: original.tags },
          glossary,
          maxChunkChars,
          sourceChars: original.title.length + original.summary.length,
          mode: 'metadata',
          field: 'title',
        })) || {};
        log(`  metadata in ${ms(metaStartedAt)} · title=${metadata.title ? `${metadata.title.length}ch` : '-'} · summary=${(metadata.summary || '').length}ch · tags=${(metadata.tags || []).length}`);
        break;
      } catch (metaError) {
        if (attempt === 1) throw metaError;
        warn(`  metadata attempt 1/2 failed (${metaError.code || metaError.message}) — retrying`);
      }
    }
  }

  let chunkIndex = 0;
  for (const chunk of contentChunks) {
    const field = refType === 'Game' ? 'description' : 'content';
    chunkIndex += 1;
    log(`  chunk ${chunkIndex}/${contentChunks.length} · ${chunk.length}ch of markdown`);

    const requestStartedAt = Date.now();
    const result = await callModel(buildGeneratePayload({
      source: refType === 'Game' ? { description: chunk } : { content: chunk },
      glossary,
      precedingContext: context,
      maxChunkChars,
      sourceChars: chunk.length,
      field,
      mode: 'body',
    }));
    const translatedText = String(result?.[field] ?? '').trim();
    log(`    replied in ${ms(requestStartedAt)} · ${translatedText.length}ch`);

    // The one fatal check: an untranslated echo must never be stored, because
    // it would publish a Korean page at an English URL. Everything else is
    // reported and kept — this is a labelled draft an admin can edit, and a
    // slightly imperfect page is worth more than a blocked queue.
    if (!translatedText) {
      const error = new Error(`Model returned no ${field} for chunk ${chunkIndex}`);
      error.code = 'TRANSLATION_EMPTY';
      throw error;
    }
    if (koreanRatio(translatedText) > 0.5) {
      const error = new Error(`Model echoed Korean back for chunk ${chunkIndex}`);
      error.code = 'TRANSLATION_PASSTHROUGH';
      throw error;
    }

    const drift = describeMarkdownDrift(chunk, translatedText);
    if (drift.length) warn(`    markdown drift (kept anyway): ${drift.join(' | ')}`);

    if (!firstResult) firstResult = result;
    translatedChunks.push(translatedText);
    context = precedingContext(translatedText);
  }

  const translated = {
    title: String(metadata.title ?? ''),
    // Search metadata can be shortened safely at a word boundary after the
    // single corrective model attempt. Titles are intentionally not clipped;
    // an invalid title remains a hard validation failure.
    summary: truncateAtWordBoundary(metadata.summary ?? '', 400),
    content: refType === 'Game' ? '' : translatedChunks.join('\n\n'),
    description: refType === 'Game'
      ? truncateAtWordBoundary(translatedChunks.join('\n\n'), 500)
      : truncateAtWordBoundary(metadata.description ?? '', 500),
    tags: applyTagPolicy(original.tags || [], metadata.tags, glossary),
  };
  return { fields: translated, model, promptVersion };
}


export { sourceFields };
