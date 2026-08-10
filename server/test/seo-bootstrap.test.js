import test from 'node:test';
import assert from 'node:assert/strict';

import { toPublicBlogPost } from '../src/services/publicData.js';

test('public blog bootstrap keeps only fields the article page needs', () => {
  const result = toPublicBlogPost({
    _id: 'post-id',
    title: 'Public title',
    slug: 'public-title',
    summary: 'Public summary',
    content: '# Public body',
    coverImageUrl: '/blog-images/cover.webp',
    tags: ['webgl'],
    publishedAt: '2026-08-10T00:00:00.000Z',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    published: true,
    email: 'owner@example.com',
    role: 'admin',
    isOwner: true,
    author: { _id: 'user-id', name: 'Author', email: 'owner@example.com', role: 'admin' },
    comments: [{
      _id: 'comment-id',
      body: 'A public comment',
      authorName: 'Tester',
      createdAt: '2026-08-10T01:00:00.000Z',
      email: 'tester@example.com',
    }],
  });

  assert.deepEqual(Object.keys(result).sort(), [
    '_id', 'author', 'comments', 'content', 'coverImageUrl', 'createdAt',
    'publishedAt', 'slug', 'summary', 'tags', 'title', 'updatedAt',
  ].sort());
  assert.deepEqual(result.author, { name: 'Author' });
  assert.deepEqual(result.comments, [{
    _id: 'comment-id',
    body: 'A public comment',
    authorName: 'Tester',
    createdAt: '2026-08-10T01:00:00.000Z',
  }]);
  assert.equal('email' in result, false);
  assert.equal('role' in result, false);
  assert.equal('isOwner' in result, false);
  assert.equal('email' in result.author, false);
  assert.equal('email' in result.comments[0], false);
});

