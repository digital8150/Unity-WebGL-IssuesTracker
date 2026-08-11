import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Issue } from '../src/models/Issue.js';
import BlogPost from '../src/models/BlogPost.js';
import GameArticle from '../src/models/GameArticle.js';
import {
  canDeleteIssueComment,
  serializeIssueComment,
} from '../src/routes/issues.js';
import {
  canDeleteBlogComment,
  serializeBlogComment,
} from '../src/routes/blog.js';
import {
  canDeleteGameArticleComment,
  serializeGameArticleComment,
} from '../src/routes/gameArticles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function commentSchema(model) {
  return model.schema.path('comments').schema;
}

test('all comment schemas retain a nullable User author reference', () => {
  for (const model of [Issue, BlogPost, GameArticle]) {
    const schema = commentSchema(model);
    const authorId = schema.path('authorId');
    assert.ok(authorId, `${model.modelName} comments should define authorId`);
    assert.equal(authorId.options.ref, 'User');
    assert.equal(authorId.options.default, null);
  }
});

test('authenticated comment ownership and legacy fallback are enforced', () => {
  const game = { ownerId: 'owner', collaborators: ['collaborator'] };
  const owned = { authorId: 'author' };
  const legacy = { authorId: null };

  assert.equal(canDeleteIssueComment({ comment: owned, userId: 'author', game, role: 'user' }), true);
  assert.equal(canDeleteIssueComment({ comment: owned, userId: 'other', game, role: 'user' }), false);
  assert.equal(canDeleteIssueComment({ comment: legacy, userId: 'other', game, role: 'user' }), false);
  assert.equal(canDeleteIssueComment({ comment: legacy, userId: 'owner', game, role: 'user' }), true);
  assert.equal(canDeleteIssueComment({ comment: legacy, userId: 'collaborator', game, role: 'user' }), true);
  assert.equal(canDeleteIssueComment({ comment: legacy, userId: 'other', game, role: 'admin' }), true);

  const postComment = { authorId: 'author' };
  assert.equal(canDeleteBlogComment({ comment: postComment, userId: 'author', postAuthorId: 'owner', role: 'user' }), true);
  assert.equal(canDeleteBlogComment({ comment: postComment, userId: 'owner', postAuthorId: 'owner', role: 'user' }), true);
  assert.equal(canDeleteBlogComment({ comment: postComment, userId: 'other', postAuthorId: 'owner', role: 'user' }), false);
  assert.equal(canDeleteBlogComment({ comment: { authorId: null }, userId: 'other', postAuthorId: 'owner', role: 'user' }), false);
  assert.equal(canDeleteBlogComment({ comment: { authorId: null }, userId: 'other', postAuthorId: 'owner', role: 'admin' }), true);

  assert.equal(canDeleteGameArticleComment({ comment: owned, userId: 'author', game, role: 'user' }), true);
  assert.equal(canDeleteGameArticleComment({ comment: owned, userId: 'other', game, role: 'user' }), false);
  assert.equal(canDeleteGameArticleComment({ comment: legacy, userId: 'owner', game, role: 'user' }), true);
  assert.equal(canDeleteGameArticleComment({ comment: legacy, userId: 'other', game, role: 'admin' }), true);
});

test('serializers prefer a populated live name and preserve guest fallback', () => {
  const populated = { _id: 'comment', body: 'hello', authorId: { _id: 'user', name: 'Renamed' }, authorName: 'Old name' };
  const guest = { _id: 'guest', body: 'hello', authorId: null, authorName: 'Guest name' };

  for (const serialize of [serializeIssueComment, serializeBlogComment, serializeGameArticleComment]) {
    assert.equal(serialize(populated).authorName, 'Renamed');
    assert.equal(serialize(populated).authorId, 'user');
    assert.equal(serialize(guest).authorName, 'Guest name');
    assert.equal(serialize(guest).authorId, undefined);
  }
});

test('comment creation routes persist authorId for authenticated users and populate reads', async () => {
  for (const relativePath of [
    'server/src/routes/issues.js',
    'server/src/routes/blog.js',
    'server/src/routes/gameArticles.js',
  ]) {
    const source = await readFile(path.join(repoRoot, relativePath), 'utf8');
    assert.match(source, /authorId: req\.user\?\.sub \?\? null/);
    assert.match(source, /comments\.authorId', 'name'/);
  }
});
