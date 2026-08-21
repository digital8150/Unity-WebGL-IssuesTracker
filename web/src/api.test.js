import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withLocale, postIssue, uploadBuild } from './api.js';

// ── helpers ──────────────────────────────────────────────────────────────

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

let lastXhr;

class FakeXhr {
  constructor() {
    this.upload = {};
    this.headers = {};
    this.sent = false;
    this.aborted = false;
    this.status = 200;
    this.responseText = '{}';
    lastXhr = this;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key, value) {
    this.headers[key] = value;
  }
  send(body) {
    this.sent = true;
    this.body = body;
  }
  abort() {
    this.aborted = true;
  }
}

beforeEach(() => {
  localStorage.clear();
});

// ── Part 1: withLocale ──────────────────────────────────────────────────

describe('withLocale', () => {
  it('leaves the path unchanged for locale "ko"', () => {
    expect(withLocale('/api/games', 'ko')).toBe('/api/games');
  });

  it('leaves the path unchanged when locale is omitted (defaults to ko)', () => {
    expect(withLocale('/api/games')).toBe('/api/games');
  });

  it('appends ?locale=en for locale "en" on a path with no query string', () => {
    expect(withLocale('/api/games', 'en')).toBe('/api/games?locale=en');
  });

  it('appends &locale=en for locale "en" on a path that already has a query string', () => {
    expect(withLocale('/api/games?page=2', 'en')).toBe('/api/games?page=2&locale=en');
  });

  it('leaves the path unchanged for an unrecognized locale like "fr"', () => {
    expect(withLocale('/api/games', 'fr')).toBe('/api/games');
  });
});

// ── Part 2: request(), driven via postIssue ─────────────────────────────

describe('request (via postIssue)', () => {
  it('sends Content-Type: application/json and calls the expected URL/method', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await postIssue({ title: 'bug' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/issues');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('adds Authorization: Bearer <token> when a token is stored', async () => {
    localStorage.setItem('token', 'abc123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await postIssue({ title: 'bug' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer abc123');
  });

  it('omits the Authorization header entirely when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await postIssue({ title: 'bug' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('resolves with the parsed JSON body on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postIssue({ title: 'bug' })).resolves.toEqual({ id: '1', ok: true });
  });

  it('rejects with the body error message and status on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Nope' }, { ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postIssue({})).rejects.toMatchObject({ message: 'Nope', status: 400 });
  });

  it('falls back to "Request failed: <status>" when the body has no error field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postIssue({})).rejects.toMatchObject({ message: 'Request failed: 500', status: 500 });
  });

  it('copies a string code onto the error, and omits a non-string code', async () => {
    const fetchMockWithCode = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'bad', code: 'E_BAD' }, { ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMockWithCode);
    await expect(postIssue({})).rejects.toMatchObject({ code: 'E_BAD' });

    const fetchMockWithNumericCode = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'bad', code: 42 }, { ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMockWithNumericCode);
    let caught;
    try {
      await postIssue({});
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toHaveProperty('code');
  });

  it('copies usedBytes/quotaBytes/projectedBytes when they are finite numbers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: 'Quota exceeded', usedBytes: 100, quotaBytes: 200, projectedBytes: 150 },
        { ok: false, status: 413 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(postIssue({})).rejects.toMatchObject({
      status: 413,
      usedBytes: 100,
      quotaBytes: 200,
      projectedBytes: 150,
    });
  });

  it('does not copy quota fields when non-numeric, Infinity, or NaN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: 'Quota exceeded', usedBytes: '100', quotaBytes: Infinity, projectedBytes: NaN },
        { ok: false, status: 413 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    let caught;
    try {
      await postIssue({});
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toHaveProperty('usedBytes');
    expect(caught).not.toHaveProperty('quotaBytes');
    expect(caught).not.toHaveProperty('projectedBytes');
  });

  it('still rejects with the fallback message when res.json() rejects on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('malformed body')),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(postIssue({})).rejects.toMatchObject({ message: 'Request failed: 500', status: 500 });
  });
});

// ── Part 3: uploadMultipart(), driven via uploadBuild ───────────────────

describe('uploadMultipart (via uploadBuild)', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('opens POST against the builds URL and sends a FormData instance', async () => {
    uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    expect(lastXhr.method).toBe('POST');
    expect(lastXhr.url).toBe('/api/games/game1/builds');
    expect(lastXhr.sent).toBe(true);
    expect(lastXhr.body).toBeInstanceOf(FormData);
  });

  it('never sets Content-Type, so the browser can generate the multipart boundary', async () => {
    uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    expect(lastXhr.headers).not.toHaveProperty('Content-Type');
    expect(Object.keys(lastXhr.headers)).toEqual([]);
  });

  it('sets the Authorization header when a token is stored', async () => {
    localStorage.setItem('token', 'tok-1');
    uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    expect(lastXhr.headers['Authorization']).toBe('Bearer tok-1');
  });

  it('does not set the Authorization header when no token is stored', async () => {
    uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    expect(lastXhr.headers).not.toHaveProperty('Authorization');
  });

  it('resolves with the parsed JSON body on a 200 with valid JSON responseText', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.status = 200;
    lastXhr.responseText = JSON.stringify({ buildId: 'b1' });
    lastXhr.onload();

    await expect(promise).resolves.toEqual({ buildId: 'b1' });
  });

  it('resolves with {} when responseText is an empty string', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.status = 200;
    lastXhr.responseText = '';
    lastXhr.onload();

    await expect(promise).resolves.toEqual({});
  });

  it('resolves with {} when responseText is malformed JSON on a 2xx', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.status = 200;
    lastXhr.responseText = '{not valid json';
    lastXhr.onload();

    await expect(promise).resolves.toEqual({});
  });

  it('rejects with an apiError carrying status and body error message on a 409', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.status = 409;
    lastXhr.responseText = JSON.stringify({ error: 'Conflict' });
    lastXhr.onload();

    await expect(promise).rejects.toMatchObject({ message: 'Conflict', status: 409 });
  });

  it('rejects with fallback "Request failed: 500" when body has no error field', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.status = 500;
    lastXhr.responseText = JSON.stringify({});
    lastXhr.onload();

    await expect(promise).rejects.toMatchObject({ message: 'Request failed: 500', status: 500 });
  });

  it('forwards upload progress to onProgress', async () => {
    const onProgress = vi.fn();
    uploadBuild('game1', [new File(['x'], 'game.wasm')], { onProgress });
    await Promise.resolve();

    lastXhr.upload.onprogress({ loaded: 50, total: 100, lengthComputable: true });

    expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 100 });
  });

  it('reports total: 0 when lengthComputable is false', async () => {
    const onProgress = vi.fn();
    uploadBuild('game1', [new File(['x'], 'game.wasm')], { onProgress });
    await Promise.resolve();

    lastXhr.upload.onprogress({ loaded: 50, total: 100, lengthComputable: false });

    expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 0 });
  });

  it('onerror rejects with "Network request failed"', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.onerror();

    await expect(promise).rejects.toThrow('Network request failed');
  });

  it('ontimeout rejects with "Request timed out"', async () => {
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')]);
    await Promise.resolve();

    lastXhr.ontimeout();

    await expect(promise).rejects.toThrow('Request timed out');
  });

  it('rejects with AbortError and never calls send when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')], { signal: controller.signal });
    await Promise.resolve();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(lastXhr.sent).toBe(false);
  });

  it('rejects with AbortError and calls xhr.abort() when aborted mid-flight', async () => {
    const controller = new AbortController();
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')], { signal: controller.signal });
    await Promise.resolve();

    expect(lastXhr.sent).toBe(true);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(lastXhr.aborted).toBe(true);
  });

  it('settle-once: firing onload after an abort does not change the outcome', async () => {
    const controller = new AbortController();
    const promise = uploadBuild('game1', [new File(['x'], 'game.wasm')], { signal: controller.signal });
    await Promise.resolve();

    const thenSpy = vi.fn();
    promise.then(thenSpy, () => {}); // swallow the expected rejection so it isn't "unhandled"

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    lastXhr.status = 200;
    lastXhr.responseText = JSON.stringify({ buildId: 'b1' });
    lastXhr.onload();
    await Promise.resolve();

    // The promise was already rejected, so a resolve handler must never fire.
    expect(thenSpy).not.toHaveBeenCalled();
  });
});
