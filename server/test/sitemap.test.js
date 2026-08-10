import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemapUrls, renderSitemapXml } from '../src/services/sitemap.js';

test('sitemap keeps Korean sources and only emits translated members for ready rows', () => {
  const urls = buildSitemapUrls({ siteOrigin: 'https://example.test', publishEnabled: true, posts: [{ _id: 'a', slug: 'a', published: true }, { _id: 'b', slug: 'b', published: true }], translationsByRef: new Map([['BlogPost:a', { refType: 'BlogPost', refId: 'a', status: 'ready', noindex: false }]]) });
  const xml = renderSitemapXml(urls);
  assert.match(xml, /<urlset[^>]*xmlns:xhtml/);
  assert.match(xml, /<loc>https:\/\/example\.test\/blog\/a<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.test\/en\/blog\/a<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.test\/blog\/b<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/example\.test\/en\/blog\/b<\/loc>/);
});
