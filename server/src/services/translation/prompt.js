// Metadata and body are requested separately.
//
// Asking for both in one call let a runaway title destroy the whole chunk: the
// model translated the title correctly, then kept elaborating ("…Part 1:
// Features and Limitations Overview and Build Guide for Web Deployment
// Fundament…") until it hit maxOutputTokens, so the `content` array was never
// written and the JSON came back truncated. Splitting them means a title loop
// costs one tiny request and cannot touch the translated body.
export const METADATA_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
});

// Plain Markdown in, plain Markdown out.
//
// This used to ship an array of prose segments with the code blocks held back
// server-side and reassembled by index. It guaranteed byte-perfect code blocks
// but demanded the model return an exactly-matching array, and that contract
// broke constantly — the machinery, not the translation, was the thing failing.
// This is a draft engine: output is labelled as machine-translated, an admin can
// edit it, and a slightly imperfect page beats no page at all.
export const BODY_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    content: { type: 'string' },
    description: { type: 'string' },
  },
});

export const RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    content: { type: 'array', items: { type: 'string' } },
    description: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
  },
  // Gemini's response_schema accepts only a restricted OpenAPI 3.0 subset —
  // additionalProperties is rejected outright with an HTTP 400
  // ("Unknown name \"additionalProperties\""), which fails every request before
  // a single token is generated. Do not reintroduce JSON-Schema-only keywords
  // here. required is likewise omitted: a Game carries only description
  // while a post carries only title/summary/content/tags, so requiring all five
  // would force the model to invent the fields the other type does not have.
});

export function buildTranslationPrompt({
  source,
  glossary = [],
  precedingContext = '',
  maxChunkChars = 12000,
  errors = [],
  field = 'content',
  mode = 'body',
} = {}) {
  const segmentCount = Array.isArray(source?.[field]) ? source[field].length : 0;
  const errorNote = errors.length
    ? '\nPrevious validation failed. Fix every issue: ' + errors.join('; ')
    : '';
  const budget = 'title —200 characters; summary —400; description —500; every tag —50.';
  const bodyRules = [
    'Translate field: ' + field + '. It is a Markdown document. Return the translated Markdown as a single string in the same field.',
    'Reproduce the Markdown structure exactly: same headings and heading levels, same list structure, same emphasis, same blockquotes, same tables, same blank-line layout.',
    'Copy fenced code blocks verbatim — the fence, the language tag, and every line inside. Translate nothing within a code block, not even comments. Inline `code` spans are copied verbatim too.',
    'Copy every URL, link target, image path, and src attribute character-for-character. Translate link text and image alt text, never the destination.',
    'Copy raw HTML such as <iframe>, <video> and <source> exactly as written.',
    'Do not add, remove, summarise, or explain anything. Output the translation only.',
  ];
  // A title that keeps elaborating consumed the whole output budget in
  // production, so metadata requests say plainly that the title is a literal
  // translation and nothing more.
  const metadataRules = [
    'Translate the title, summary and tags only. This request carries no article body.',
    'Translate the title literally and stop. Do not add subtitles, part numbers, chapter labels, colons, or descriptive suffixes, and never summarise the body inside the title.',
  ];

  return [
    'Translate this Korean BCSDLab. Game Track content into natural English.',
    'Return JSON only and preserve the requested object shape.',
    ...(mode === 'metadata' ? metadataRules : bodyRules),
    'Never translate glossary terms: ' + (glossary.join(', ') || '(none)') + '.',
    'Keep tags in the same order and do not invent new tags. ASCII-only/glossary tags pass through unchanged.',
    'Do not alter Markdown delimiters that occur in a prose segment. Do not repeat preceding context in the output.',
    'Chunk budget: ' + maxChunkChars + '. Field budgets: ' + budget,
    precedingContext ? 'Preceding context for terminology only:\n' + precedingContext : '',
    errorNote,
    'SOURCE JSON:\n' + JSON.stringify(source ?? {}),
  ].filter(Boolean).join('\n\n');
}

export function buildGeneratePayload(options = {}) {
  const { thinking = false, sourceChars = 0, mode = 'body' } = options;
  const prompt = buildTranslationPrompt(options);
  const generationConfig = {
    // 0.2 was low enough to invite degenerate repetition: on one chunk the model
    // looped on the title ("…Device-Free-ly-and-Instantly-without-Installation-…")
    // until it burned 65,520 output tokens from a 1,936-token input and returned
    // truncated, unparseable JSON. Translation still wants a conservative
    // setting, just not one that makes the decoder greedy enough to loop.
    temperature: 0.5,
    // On a reasoning model this budget is shared with the thoughts, and the
    // thoughts go first. Sizing it for the translation alone starved the answer:
    // a 3997-character chunk spent 4397 tokens thinking and had 913 left to
    // write with, so the JSON came back truncated (finishReason=MAX_TOKENS).
    // Body requests therefore reserve room for both. The runaway this cap
    // originally guarded against was a looping title, which can no longer reach
    // a body request now that metadata is fetched separately — so only the tiny
    // metadata call still needs a tight ceiling.
    maxOutputTokens: mode === 'metadata'
      ? 2048
      : Math.min(32768, Math.max(8192, Math.ceil((sourceChars || 4000) * 3))),
    responseMimeType: 'application/json',
    responseSchema: mode === 'metadata' ? METADATA_SCHEMA : BODY_SCHEMA,
  };

  // Thinking is switched off by `generateContent`, not here: the parameter that
  // does it differs by model generation, so the working variant has to be
  // discovered per model at runtime. See THINKING_OFF_VARIANTS in gemini.js.
  generationConfig.__thinkingOff = !thinking;

  return {
    systemInstruction: {
      parts: [{ text: 'You are a careful technical translator. Output valid JSON and preserve markdown segment order.' }],
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };
}

/** Returns the payload with a specific thinking-off variant applied (or none). */
export function withThinkingVariant(payload, thinkingConfig) {
  const { __thinkingOff, ...generationConfig } = payload?.generationConfig || {};
  if (__thinkingOff && thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
  return { ...payload, generationConfig };
}

/** True when this payload asked for thinking to be disabled. */
export function wantsThinkingOff(payload) {
  return Boolean(payload?.generationConfig?.__thinkingOff);
}
