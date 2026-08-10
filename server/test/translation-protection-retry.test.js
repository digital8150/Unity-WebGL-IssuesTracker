import test from 'node:test';
import assert from 'node:assert/strict';
import { translateDocument } from '../src/services/translation/translate.js';

// The pipeline sends Markdown and expects Markdown back. It used to ship an
// array of prose segments and reassemble by index, which guaranteed byte-perfect
// code blocks but demanded an exactly-matching array from the model — a contract
// that broke far more often than the translation itself. These tests pin the
// simpler behaviour: keep what the model returns, and only refuse output that
// would publish Korean at an English URL.

const gameModel = () => ({ find: () => ({ select: () => ({ lean: async () => [{ name: 'Project Adventure' }] }) }) });

function sourceFromPayload(payload) {
  return JSON.parse(payload.contents[0].parts[0].text.split('SOURCE JSON:')[1]);
}

function metadataReply() {
  return { title: 'Translated title', summary: 'Translated summary.', tags: [] };
}

/** Stub model: replaces Hangul runs with English, leaving all markup untouched. */
function pretendTranslate(onRequest) {
  return async (_model, payload) => {
    const source = sourceFromPayload(payload);
    onRequest?.(source, payload);
    if (payload.generationConfig.responseSchema.properties.title) return metadataReply();
    const field = 'description' in source ? 'description' : 'content';
    return { [field]: String(source[field] ?? '').replace(/[가-힣]+/g, 'English') };
  };
}

test('body requests carry Markdown as a single string, not an array', async () => {
  const seen = [];
  await translateDocument({
    refType: 'BlogPost',
    source: { title: '제목', summary: '요약', content: '## 머리말\n\n본문입니다.', tags: [] },
    model: 'test-model',
    apiKey: 'test-key',
    gameModel: gameModel(),
    generate: pretendTranslate((source, payload) => {
      if (!payload.generationConfig.responseSchema.properties.title) seen.push(source);
    }),
  });

  assert.equal(seen.length, 1);
  assert.equal(typeof seen[0].content, 'string');
  assert.match(seen[0].content, /## 머리말/);
});

test('chunked content is translated in order and rejoined', async () => {
  const chunks = [];
  const long = ['# 하나', '가'.repeat(1500), '## 둘', '나'.repeat(1500), '### 셋'].join('\n\n');
  const result = await translateDocument({
    refType: 'BlogPost',
    source: { title: '제목', summary: '요약', content: long, tags: [] },
    model: 'test-model',
    apiKey: 'test-key',
    maxChunkChars: 1200,
    gameModel: gameModel(),
    generate: pretendTranslate((source, payload) => {
      if (!payload.generationConfig.responseSchema.properties.title) chunks.push(source.content);
    }),
  });

  assert.ok(chunks.length > 1, 'expected the document to be split into several requests');
  assert.equal(chunks.join('\n\n').replace(/\s+/g, ''), long.replace(/\s+/g, ''));
  assert.doesNotMatch(result.fields.content, /[가-힣]/);
});

test('a model that echoes Korean back is refused rather than stored', async () => {
  await assert.rejects(
    () => translateDocument({
      refType: 'BlogPost',
      source: { title: '제목', summary: '요약', content: '이 문장은 번역되지 않았습니다.', tags: [] },
      model: 'test-model',
      apiKey: 'test-key',
      gameModel: gameModel(),
      // Echoes the source unchanged — publishing this would put Korean on /en.
      generate: async (_m, payload) => {
        const source = sourceFromPayload(payload);
        if (payload.generationConfig.responseSchema.properties.title) return metadataReply();
        return { content: source.content };
      },
    }),
    (error) => error.code === 'TRANSLATION_PASSTHROUGH',
  );
});

test('an empty body is refused', async () => {
  await assert.rejects(
    () => translateDocument({
      refType: 'BlogPost',
      source: { title: '제목', summary: '요약', content: '본문입니다.', tags: [] },
      model: 'test-model',
      apiKey: 'test-key',
      gameModel: gameModel(),
      generate: async (_m, payload) => (
        payload.generationConfig.responseSchema.properties.title ? metadataReply() : { content: '   ' }
      ),
    }),
    (error) => error.code === 'TRANSLATION_EMPTY',
  );
});

test('markdown drift is tolerated: an imperfect draft still gets stored', async () => {
  // The model drops a heading and mangles a code fence. Under the old contract
  // this failed the document outright; a labelled draft is worth more than none.
  const result = await translateDocument({
    refType: 'BlogPost',
    source: { title: '제목', summary: '요약', content: '# 머리말\n\n```js\nconst a = 1;\n```\n\n본문.', tags: [] },
    model: 'test-model',
    apiKey: 'test-key',
    gameModel: gameModel(),
    generate: async (_m, payload) => (
      payload.generationConfig.responseSchema.properties.title
        ? metadataReply()
        : { content: 'Heading dropped.\n\n```js\nconst b = 2;\n```\n\nBody.' }
    ),
  });

  assert.match(result.fields.content, /Body\./);
  assert.equal(result.fields.title, 'Translated title');
});

test('a Game translates its description only', async () => {
  let requested;
  const result = await translateDocument({
    refType: 'Game',
    source: { description: '쿼터뷰 퍼즐 게임입니다.' },
    model: 'test-model',
    apiKey: 'test-key',
    gameModel: gameModel(),
    generate: pretendTranslate((source) => { requested = source; }),
  });

  assert.deepEqual(Object.keys(requested), ['description']);
  assert.equal(typeof requested.description, 'string');
  assert.equal(result.fields.content, '');
  assert.doesNotMatch(result.fields.description, /[가-힣]/);
});
