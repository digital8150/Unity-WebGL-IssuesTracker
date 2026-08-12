import test from 'node:test';
import assert from 'node:assert/strict';

import { Issue } from '../src/models/Issue.js';
import BlogPost from '../src/models/BlogPost.js';
import GameArticle from '../src/models/GameArticle.js';
import Game from '../src/models/Game.js';
import issueRouter, {
  canDeleteIssueComment,
  serializeIssueComment,
} from '../src/routes/issues.js';
import blogRouter, {
  canDeleteBlogComment,
  serializeBlogComment,
} from '../src/routes/blog.js';
import gameArticleRouter, {
  canDeleteGameArticleComment,
  serializeGameArticleComment,
} from '../src/routes/gameArticles.js';

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
  assert.equal(canDeleteGameArticleComment({ comment: legacy, userId: 'other', game, role: 'user' }), false);
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

function routeHandler(router, routePath) {
  const layer = router.stack.find((item) => item.route?.path === routePath && item.route.methods.post);
  assert.ok(layer, `POST ${routePath} should exist`);
  return layer.route.stack.at(-1).handle;
}

function query(value, onPopulate = () => {}) {
  const chain = {
    select() {
      return chain;
    },
    populate(path) {
      onPopulate(path);
      return chain;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return chain;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function populatedDocument(comment, authorName = 'Alice') {
  const readComment = { ...comment };
  if (readComment.authorId) {
    readComment.authorId = { _id: readComment.authorId, name: authorName };
  }
  const comments = [readComment];
  comments.id = (id) => comments.find((item) => String(item._id) === String(id));
  return { comments };
}

async function invoke(handler, { params, body, user }) {
  const req = { params, body, user };
  const res = response();
  await handler(req, res, (error) => {
    if (error) throw error;
  });
  return res;
}

test('comment creation persists authors and serialized reads expose populated names', async (t) => {
  const original = {
    issueUpdate: Issue.findByIdAndUpdate,
    blogUpdate: BlogPost.findOneAndUpdate,
    gameFindOne: Game.findOne,
    articleUpdate: GameArticle.findOneAndUpdate,
  };
  const persisted = { issue: null, blog: null, article: null };

  Issue.findByIdAndUpdate = (_id, update) => {
    persisted.issue = update.$push.comments;
    return query(populatedDocument(persisted.issue), (path) => assert.equal(path, 'comments.authorId'));
  };
  BlogPost.findOneAndUpdate = (_filter, update) => {
    persisted.blog = update.$push.comments;
    return query({ comments: populatedDocument(persisted.blog).comments }, (path) => assert.equal(path, 'comments.authorId'));
  };
  Game.findOne = () => query({ _id: 'game-1' });
  GameArticle.findOneAndUpdate = (_filter, update) => {
    persisted.article = update.$push.comments;
    return query({ _id: 'article-1' });
  };
  t.after(() => {
    Issue.findByIdAndUpdate = original.issueUpdate;
    BlogPost.findOneAndUpdate = original.blogUpdate;
    Game.findOne = original.gameFindOne;
    GameArticle.findOneAndUpdate = original.articleUpdate;
  });

  const handlers = [
    {
      name: 'issue',
      handler: routeHandler(issueRouter, '/:id/comments'),
      params: { id: 'issue-1' },
      serializer: serializeIssueComment,
    },
    {
      name: 'blog',
      handler: routeHandler(blogRouter, '/:slug/comments'),
      params: { slug: 'post-1' },
      serializer: serializeBlogComment,
    },
    {
      name: 'article',
      handler: routeHandler(gameArticleRouter, '/play/:gameSlug/articles/:articleSlug/comments'),
      params: { gameSlug: 'game', articleSlug: 'article' },
      serializer: serializeGameArticleComment,
    },
  ];

  for (const route of handlers) {
    const authenticated = await invoke(route.handler, {
      params: route.params,
      body: { body: '  hello  ' },
      user: { sub: 'user-1', name: 'Alice' },
    });
    assert.equal(authenticated.statusCode, 201, `${route.name} authenticated status`);
    assert.equal(persisted[route.name].authorId, 'user-1', `${route.name} persists authenticated author`);
    assert.equal(authenticated.body.comment.authorId, 'user-1', `${route.name} serializes author id`);
    assert.equal(authenticated.body.comment.authorName, 'Alice', `${route.name} serializes author name`);

    const guest = await invoke(route.handler, {
      params: route.params,
      body: { body: 'guest', authorName: 'Guest' },
    });
    assert.equal(guest.statusCode, 201, `${route.name} guest status`);
    assert.equal(persisted[route.name].authorId, null, `${route.name} persists nullable guest author`);
    assert.equal(guest.body.comment.authorId, undefined, `${route.name} omits guest author id`);
    assert.equal(guest.body.comment.authorName, 'Guest', `${route.name} preserves guest name`);

    const read = route.serializer({
      _id: 'read-comment',
      body: 'read',
      authorId: { _id: 'user-1', name: 'Renamed' },
      authorName: 'Old name',
    });
    assert.equal(read.authorId, 'user-1', `${route.name} read exposes populated author id`);
    assert.equal(read.authorName, 'Renamed', `${route.name} read prefers populated author name`);
  }
});
