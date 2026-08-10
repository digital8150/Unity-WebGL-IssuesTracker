import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_SCHEMA, METADATA_SCHEMA, buildGeneratePayload } from '../src/services/translation/prompt.js';

test('translation prompt carries glossary and field budgets', () => {
  const payload = buildGeneratePayload({ source: { title: '제목', content: '본문' }, glossary: ['Unity', 'BCSDLab.'], maxChunkChars: 12000 });
  const text = payload.contents[0].parts[0].text;
  assert.match(text, /Unity/);
  assert.match(text, /200/);
  assert.match(text, /400/);
  assert.match(text, /500/);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  // Body requests must not be able to return metadata: a runaway title used to
  // consume the output budget and leave the translated content unwritten.
  assert.deepEqual(payload.generationConfig.responseSchema, BODY_SCHEMA);
  assert.equal(payload.generationConfig.responseSchema.properties.content.type, 'string');
  assert.equal(payload.generationConfig.responseSchema.properties.description.type, 'string');
  assert.equal('title' in payload.generationConfig.responseSchema.properties, false);
  assert.equal('tags' in payload.generationConfig.responseSchema.properties, false);
});

test('metadata requests use the metadata schema and forbid title elaboration', () => {
  const payload = buildGeneratePayload({ source: { title: '제목', summary: '요약', tags: [] }, mode: 'metadata' });
  assert.deepEqual(payload.generationConfig.responseSchema, METADATA_SCHEMA);
  assert.equal('content' in payload.generationConfig.responseSchema.properties, false);
  assert.match(payload.contents[0].parts[0].text, /Translate the title literally and stop/);
  assert.match(payload.contents[0].parts[0].text, /part numbers/);
});

test('neither schema carries JSON-Schema-only keywords Gemini rejects', () => {
  for (const schema of [BODY_SCHEMA, METADATA_SCHEMA]) {
    assert.equal('additionalProperties' in schema, false);
    assert.equal('required' in schema, false);
  }
});

test('body requests ask for Markdown in and Markdown out', () => {
  const payload = buildGeneratePayload({ source: { content: '## 제목\n\n본문' }, field: 'content' });
  const text = payload.contents[0].parts[0].text;
  assert.equal(payload.generationConfig.responseSchema.properties.content.type, 'string');
  assert.match(text, /Return the translated Markdown as a single string/);
  assert.match(text, /Copy fenced code blocks verbatim/);
  assert.match(text, /Copy every URL, link target, image path/);
  assert.match(text, /Copy raw HTML/);
  assert.doesNotMatch(text, /array of \d+ prose segments/);
});
