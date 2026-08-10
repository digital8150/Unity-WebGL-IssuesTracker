import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMarkdown } from '../src/services/translation/chunk.js';
import { fenceRanges, protect } from '../src/services/translation/protect.js';
import { buildTranslationPrompt } from '../src/services/translation/prompt.js';
import { describeMarkdownDrift, koreanRatio } from '../src/services/translation/validate.js';

// The pipeline now sends Markdown and takes Markdown back, so segmentation is
// no longer part of the request contract. It survives here for two jobs that
// still matter: splitting long documents on safe boundaries, and telling the
// Korean-passthrough detector which regions are copied verbatim by design.

const SAMPLE = [
  '# 제목',
  '',
  '본문 문단입니다. `UnityWebRequest` 를 씁니다.',
  '',
  '```js',
  '// 한국어 주석',
  'const value = 1;',
  '```',
  '',
  '[문서](https://example.test/a) 와 ![이미지](/blog-images/x.png) 입니다.',
].join('\n');

test('markdown chunks keep fenced blocks atomic and round-trip with blank separators', () => {
  const chunks = splitMarkdown(SAMPLE, 40);
  assert.ok(chunks.length > 1, 'expected the sample to split');
  for (const chunk of chunks) {
    const fences = (chunk.match(/^\s{0,3}```/gm) || []).length;
    assert.equal(fences % 2, 0, 'a fence was split across chunks');
  }
  assert.equal(chunks.join('\n\n').replace(/\s+/g, ''), SAMPLE.replace(/\s+/g, ''));
});

test('fences containing Markdown-looking text remain atomic', () => {
  const source = '앞 문단\n\n```md\n# 코드 안의 제목\n- 목록처럼 보이는 줄\n```\n\n뒤 문단';
  const ranges = fenceRanges(source);
  assert.equal(ranges.length, 1);
  const [start, end] = ranges[0];
  assert.match(source.slice(start, end), /^```md[\s\S]*```$/);
});

test('unterminated fences are protected through the end of the document', () => {
  const source = '문단\n\n```js\nconst a = 1;\n// 닫는 펜스 없음';
  const ranges = fenceRanges(source);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0][1], source.length);
});

test('segmentation still separates protected regions from prose', () => {
  const segmented = protect(SAMPLE, ['Unity', 'WebGL']);
  const protectedValues = segmented.segments.filter((s) => s.type !== 'prose').map((s) => s.value);
  assert.ok(protectedValues.some((value) => value.startsWith('```js')), 'code fence not protected');
  assert.ok(protectedValues.some((value) => value.includes('UnityWebRequest')), 'inline code not protected');
  // Every prose segment must contain a real word — fragments like ", " between
  // adjacent code spans are meaningless to translate and are kept server-side.
  for (const value of segmented.prose) {
    assert.match(value, /[\p{L}\p{N}]/u);
  }
});

test('markdown drift is reported without blocking the translation', () => {
  assert.deepEqual(describeMarkdownDrift(SAMPLE, SAMPLE), []);

  const droppedHeading = SAMPLE.replace('# 제목', '제목');
  assert.ok(describeMarkdownDrift(SAMPLE, droppedHeading).some((n) => /headings 1 -> 0/.test(n)));

  const brokenCode = SAMPLE.replace('const value = 1;', 'const other = 2;');
  assert.ok(describeMarkdownDrift(SAMPLE, brokenCode).some((n) => /code block contents changed/.test(n)));

  const lostUrl = SAMPLE.replace('https://example.test/a', 'https://example.test/b');
  assert.ok(describeMarkdownDrift(SAMPLE, lostUrl).some((n) => /URL\(s\) altered/.test(n)));

  const lostImage = SAMPLE.replace('/blog-images/x.png', '/blog-images/y.png');
  assert.ok(describeMarkdownDrift(SAMPLE, lostImage).some((n) => /URL\(s\) altered/.test(n)));
});

test('korean passthrough is measured outside protected regions', () => {
  assert.ok(koreanRatio('이 문장은 번역되지 않은 한국어입니다.') > 0.5);
  assert.ok(koreanRatio('This sentence is fully translated.') < 0.5);
  // Korean comments inside a code block are copied verbatim on purpose and must
  // not make an otherwise-English translation look like an untranslated echo.
  const englishWithKoreanCode = 'Everything here is translated prose.\n\n```js\n// 한국어 주석입니다\n```';
  assert.ok(koreanRatio(englishWithKoreanCode) < 0.5);
});

test('the body prompt asks for Markdown and forbids touching code or URLs', () => {
  const text = buildTranslationPrompt({ source: { content: '## 제목\n\n본문' }, glossary: ['Unity'], field: 'content' });
  assert.match(text, /Return the translated Markdown as a single string/);
  assert.match(text, /Copy fenced code blocks verbatim/);
  assert.match(text, /Translate nothing within a code block/);
  assert.match(text, /Copy every URL, link target, image path/);
  assert.match(text, /Unity/);
  assert.doesNotMatch(text, /prose segments/);
});
