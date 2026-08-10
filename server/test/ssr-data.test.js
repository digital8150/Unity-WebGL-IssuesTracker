import test from 'node:test';
import assert from 'node:assert/strict';

test('readSsrData safely consumes invalid JSON and removes the bootstrap node', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let removed = false;

  globalThis.document = {
    getElementById: () => ({
      textContent: '{not valid json',
      remove: () => { removed = true; },
    }),
  };
  globalThis.window = { location: { pathname: '/blog/post', search: '' } };

  try {
    const { readSsrData } = await import('../../web/src/utils/ssrData.js?invalid-json-test');
    assert.doesNotThrow(() => readSsrData('/blog/:slug'));
    assert.equal(readSsrData('/blog/:slug'), null);
    assert.equal(removed, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('readSsrData validates both the route key and current URL', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let removed = false;

  globalThis.document = {
    getElementById: () => ({
      textContent: JSON.stringify({
        route: '/blog/:slug',
        url: '/blog/post?page=2',
        data: { post: { title: 'Post' } },
      }),
      remove: () => { removed = true; },
    }),
  };
  globalThis.window = { location: { pathname: '/blog/post', search: '?page=2' } };

  try {
    const { readSsrData } = await import('../../web/src/utils/ssrData.js?valid-json-test');
    assert.deepEqual(readSsrData('/blog/:slug'), { post: { title: 'Post' } });
    assert.equal(removed, true);
    assert.equal(readSsrData('/other-route'), null);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

