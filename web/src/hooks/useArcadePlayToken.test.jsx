import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useArcadePlayToken,
  TOKEN_REFRESH_MS,
  TOKEN_RETRY_MS,
  TOKEN_REQUEST_DEBOUNCE_MS,
} from './useArcadePlayToken.js';
import { issuePlayToken } from '../api.js';

vi.mock('../api.js', () => ({ issuePlayToken: vi.fn() }));

const TOKEN_1 = { token: 'jwt-1', expiresIn: 900 };
const TOKEN_2 = { token: 'jwt-2', expiresIn: 900 };

const setup = (overrides = {}) => {
  const sendMessageRef = { current: vi.fn() };
  const tokenRef = { current: null };
  const props = {
    gameSlug: 'tetris',
    sdkV2Enabled: true,
    authLoading: false,
    user: { id: 'u1' },
    sendMessageRef,
    tokenRef,
    ...overrides,
  };
  const view = renderHook((p) => useArcadePlayToken(p), { initialProps: props });
  return { ...view, sendMessageRef, tokenRef, props };
};

// Flush already-resolved/rejected microtasks without moving the fake clock.
const flush = async () => {
  await act(async () => {});
};

// Advance the fake clock AND let any promise callbacks scheduled along the
// way run before returning.
const advance = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  issuePlayToken.mockReset();
  delete window.__arcadeSdkReady;
  delete window.__arcadeSdkRequestToken;
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__arcadeSdkReady;
  delete window.__arcadeSdkRequestToken;
});

describe('when disabled', () => {
  it('does not request a token when sdkV2Enabled is false', () => {
    setup({ sdkV2Enabled: false });
    expect(issuePlayToken).not.toHaveBeenCalled();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });

  it('does not request a token when user is null', () => {
    setup({ user: null });
    expect(issuePlayToken).not.toHaveBeenCalled();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });

  it('does not request a token when authLoading is true', () => {
    setup({ authLoading: true });
    expect(issuePlayToken).not.toHaveBeenCalled();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });

  it('does not request a token when gameSlug is empty', () => {
    setup({ gameSlug: '' });
    expect(issuePlayToken).not.toHaveBeenCalled();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });

  it('requires sdkV2Enabled to be strictly true (undefined does not connect)', () => {
    setup({ sdkV2Enabled: undefined });
    expect(issuePlayToken).not.toHaveBeenCalled();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });
});

describe('initial handshake', () => {
  it('requests exactly one token on mount, called with the game slug', () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup({ gameSlug: 'tetris' });
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    expect(issuePlayToken).toHaveBeenCalledWith('tetris');
  });

  it('stores the resolved token on tokenRef.current', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { tokenRef } = setup();
    await flush();
    expect(tokenRef.current).toEqual(TOKEN_1);
  });

  it('pushes the resolved token into Unity via SendMessage', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { sendMessageRef } = setup();
    await flush();
    expect(sendMessageRef.current).toHaveBeenCalledTimes(1);
    expect(sendMessageRef.current).toHaveBeenCalledWith(
      'ArcadeSdk',
      'SetCredential',
      JSON.stringify(TOKEN_1),
    );
  });

  it('registers both window.__arcadeSdk globals as functions', () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    expect(typeof window.__arcadeSdkReady).toBe('function');
    expect(typeof window.__arcadeSdkRequestToken).toBe('function');
  });

  it('does not call SendMessage while sendMessageRef.current is null, but pushes once Unity announces readiness late', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    // setup()'s returned `sendMessageRef` is always its own internal default,
    // so pass the null-current ref in via overrides and hang onto it directly
    // rather than trusting setup()'s return value for this one.
    const sendMessageRef = { current: null };
    const { tokenRef } = setup({ sendMessageRef });
    await expect(flush()).resolves.not.toThrow();
    expect(sendMessageRef.current).toBeNull();
    expect(tokenRef.current).toEqual(TOKEN_1);

    sendMessageRef.current = vi.fn();
    act(() => {
      window.__arcadeSdkReady();
    });
    expect(sendMessageRef.current).toHaveBeenCalledTimes(1);
    expect(sendMessageRef.current).toHaveBeenCalledWith(
      'ArcadeSdk',
      'SetCredential',
      JSON.stringify(TOKEN_1),
    );
  });
});

describe('refresh scheduling', () => {
  it('schedules a renewal that fires a second request after TOKEN_REFRESH_MS', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    await flush();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    await advance(TOKEN_REFRESH_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
  });

  it('replaces tokenRef.current with the refreshed token and pushes it to Unity again', async () => {
    issuePlayToken.mockResolvedValueOnce(TOKEN_1).mockResolvedValueOnce(TOKEN_2);
    const { tokenRef, sendMessageRef } = setup();
    await flush();
    await advance(TOKEN_REFRESH_MS);
    expect(tokenRef.current).toEqual(TOKEN_2);
    expect(sendMessageRef.current).toHaveBeenCalledTimes(2);
    expect(sendMessageRef.current).toHaveBeenLastCalledWith(
      'ArcadeSdk',
      'SetCredential',
      JSON.stringify(TOKEN_2),
    );
  });

  it('does not fire the renewal early', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    await flush();
    await advance(TOKEN_REFRESH_MS - 1000);
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
  });
});

describe('failure and retry', () => {
  it('logs console.warn on rejection and does not set tokenRef.current', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    issuePlayToken.mockRejectedValueOnce(new Error('network down'));
    const { tokenRef } = setup();
    await flush();
    expect(warnSpy).toHaveBeenCalled();
    expect(tokenRef.current).toBeNull();
  });

  it('retries after TOKEN_RETRY_MS and succeeds on the retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    issuePlayToken.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(TOKEN_1);
    const { tokenRef, sendMessageRef } = setup();
    await flush();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    await advance(TOKEN_RETRY_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
    expect(tokenRef.current).toEqual(TOKEN_1);
    expect(sendMessageRef.current).toHaveBeenCalledWith(
      'ArcadeSdk',
      'SetCredential',
      JSON.stringify(TOKEN_1),
    );
  });

  it('treats a response missing .token as a failure and retries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    issuePlayToken.mockResolvedValueOnce({ expiresIn: 900 }).mockResolvedValueOnce(TOKEN_1);
    const { tokenRef } = setup();
    await flush();
    expect(warnSpy).toHaveBeenCalled();
    expect(tokenRef.current).toBeNull();
    await advance(TOKEN_RETRY_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
    expect(tokenRef.current).toEqual(TOKEN_1);
  });

  it('treats a null/undefined resolved response as a failure without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    issuePlayToken.mockResolvedValueOnce(null);
    const { tokenRef } = setup();
    await expect(flush()).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(tokenRef.current).toBeNull();
  });
});

describe('debounce', () => {
  it('does not fire a second network call immediately after a manual requestToken() call', () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    act(() => {
      window.__arcadeSdkRequestToken();
    });
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
  });

  it('fires the deferred request once the debounce window elapses', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    await flush(); // let the in-flight request finish so the guard clears
    act(() => {
      window.__arcadeSdkRequestToken();
    });
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    await advance(TOKEN_REQUEST_DEBOUNCE_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
  });

  it('collapses multiple rapid requestToken() calls into a single deferred request', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    setup();
    await flush();
    act(() => {
      window.__arcadeSdkRequestToken();
      window.__arcadeSdkRequestToken();
      window.__arcadeSdkRequestToken();
    });
    await advance(TOKEN_REQUEST_DEBOUNCE_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
  });
});

describe('cleanup', () => {
  it('deletes both window.__arcadeSdk globals on unmount', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { unmount } = setup();
    await flush();
    unmount();
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
  });

  it('nulls tokenRef.current on unmount', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { unmount, tokenRef } = setup();
    await flush();
    expect(tokenRef.current).toEqual(TOKEN_1);
    unmount();
    expect(tokenRef.current).toBeNull();
  });

  it('does not fire a request after unmount', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { unmount } = setup();
    await flush();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    unmount();
    await advance(TOKEN_REFRESH_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
  });

  it('ignores a token request that resolves after unmount', async () => {
    let resolveFn;
    issuePlayToken.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const { unmount, tokenRef, sendMessageRef } = setup();
    unmount();
    resolveFn({ token: 'late' });
    await flush();
    expect(tokenRef.current).toBeNull();
    expect(sendMessageRef.current).not.toHaveBeenCalled();
  });

  it('does not warn or retry when the in-flight request rejects after unmount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rejectFn;
    issuePlayToken.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFn = reject;
      }),
    );
    const { unmount } = setup();
    unmount();
    rejectFn(new Error('too late'));
    await flush();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
    await advance(TOKEN_RETRY_MS);
    expect(issuePlayToken).toHaveBeenCalledTimes(1);
  });
});

describe('dependency changes', () => {
  it('re-runs the effect and issues a new token when user identity changes', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { rerender, props } = setup();
    await flush();
    expect(issuePlayToken).toHaveBeenCalledTimes(1);

    // The re-run builds a fresh closure whose lastRequestAt starts at 0, so the
    // debounce cannot defer it — the new user's token is requested immediately.
    rerender({ ...props, user: { id: 'u2' } });
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
  });

  it('issues a token for the new slug when gameSlug changes', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { rerender, props } = setup();
    await flush();

    rerender({ ...props, gameSlug: 'pong' });
    expect(issuePlayToken).toHaveBeenCalledTimes(2);
    expect(issuePlayToken.mock.calls.at(-1)).toEqual(['pong']);
  });

  it('keeps the globals registered across a dependency change', async () => {
    // React runs the previous cleanup before the next effect, so the bridge must
    // end up re-registered — with the new run's closures, not the old ones.
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { rerender, props } = setup();
    await flush();
    const firstReady = window.__arcadeSdkReady;
    const firstRequest = window.__arcadeSdkRequestToken;

    rerender({ ...props, gameSlug: 'pong' });

    expect(typeof window.__arcadeSdkReady).toBe('function');
    expect(typeof window.__arcadeSdkRequestToken).toBe('function');
    expect(window.__arcadeSdkReady).not.toBe(firstReady);
    expect(window.__arcadeSdkRequestToken).not.toBe(firstRequest);
  });

  it('does not let an unmounting instance tear down a live instance’s bridge', async () => {
    // Two play pages can overlap for a frame during a route transition. The
    // second registration wins, and when the first unmounts its cleanup must
    // leave the survivor's globals alone — that is what the identity check in
    // the cleanup exists for. Without it, the still-mounted page loses the
    // bridge Unity calls into and the player is silently cut off.
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const first = setup({ gameSlug: 'tetris' });
    await flush();

    const second = setup({ gameSlug: 'pong' });
    await flush();
    const liveReady = window.__arcadeSdkReady;
    const liveRequest = window.__arcadeSdkRequestToken;

    first.unmount();

    expect(window.__arcadeSdkReady).toBe(liveReady);
    expect(window.__arcadeSdkRequestToken).toBe(liveRequest);
    second.unmount();
  });

  it('tears down globals and nulls tokenRef.current when sdkV2Enabled flips to false', async () => {
    issuePlayToken.mockResolvedValue(TOKEN_1);
    const { rerender, props, tokenRef } = setup();
    await flush();
    expect(tokenRef.current).toEqual(TOKEN_1);

    rerender({ ...props, sdkV2Enabled: false });
    expect(window.__arcadeSdkReady).toBeUndefined();
    expect(window.__arcadeSdkRequestToken).toBeUndefined();
    expect(tokenRef.current).toBeNull();
  });
});
