// The privacy policy is authored twice: the rendered body lives in
// `web/src/data/privacyPolicyVersions.jsx` as JSX (which the server cannot
// import), and the server keeps its own list of effective dates for metadata,
// canonicalisation and sitemap output. These tests keep the two in sync and pin
// the indexing rules for superseded revisions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRIVACY_POLICY_DATES,
  renderPrivacyContent,
  resolvePrivacyVersion,
} from '../src/services/seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const WEB_VERSIONS = path.join(repoRoot, 'web', 'src', 'data', 'privacyPolicyVersions.jsx');

test('server and web agree on the published policy revisions', async () => {
  const source = await readFile(WEB_VERSIONS, 'utf8');
  const webDates = [...source.matchAll(/effectiveDate:\s*'([^']+)'/g)].map((match) => match[1]);

  assert.ok(webDates.length > 0, 'Could not parse any effectiveDate out of privacyPolicyVersions.jsx');
  assert.deepEqual(
    PRIVACY_POLICY_DATES,
    webDates,
    'PRIVACY_POLICY_DATES in server/src/services/seo.js drifted from ' +
      'web/src/data/privacyPolicyVersions.jsx. A new policy revision must be added to both, ' +
      'newest first, or /privacy will advertise a stale effective date to crawlers.',
  );
});

test('the newest revision is first', () => {
  const sorted = [...PRIVACY_POLICY_DATES].sort().reverse();
  assert.deepEqual(
    PRIVACY_POLICY_DATES,
    sorted,
    'PRIVACY_POLICY_DATES must be ordered most-recent-first; the first entry is served at /privacy.',
  );
});

test('bare /privacy resolves to the latest revision', () => {
  const version = resolvePrivacyVersion(undefined);
  assert.equal(version.effectiveDate, PRIVACY_POLICY_DATES[0]);
  assert.equal(version.isLatest, true);
});

test('a known past revision resolves but is not marked latest', () => {
  const past = PRIVACY_POLICY_DATES[1];
  if (!past) return; // Only one revision published so far.

  const version = resolvePrivacyVersion(past);
  assert.equal(version.effectiveDate, past);
  assert.equal(version.isLatest, false);
});

test('an unknown date is rejected rather than silently served', () => {
  assert.equal(resolvePrivacyVersion('1999-01-01'), null);
  assert.equal(resolvePrivacyVersion('../../etc/passwd'), null);
  assert.equal(resolvePrivacyVersion('<script>'), null);
});

test('rendered content carries the effective date and real policy text', () => {
  const html = renderPrivacyContent(resolvePrivacyVersion(undefined));

  assert.match(html, /<h1>개인정보처리방침<\/h1>/);
  assert.ok(html.includes(PRIVACY_POLICY_DATES[0]), 'The effective date must appear in the body');
  assert.match(html, /개인정보/);
  assert.ok(
    html.length > 400,
    'The server-rendered privacy body must carry enough text to be worth indexing, ' +
      'not just a heading.',
  );
});

test('a superseded revision links back to the current policy', () => {
  const past = PRIVACY_POLICY_DATES[1];
  if (!past) return;

  const html = renderPrivacyContent({ effectiveDate: past, isLatest: false });
  assert.match(html, /href="\/privacy"/, 'Superseded revisions must link to the current policy');
});
