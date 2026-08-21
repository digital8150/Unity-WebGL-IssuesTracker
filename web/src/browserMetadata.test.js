import { describe, it, expect, beforeEach, vi } from 'vitest';

const makeGl = (overrides = {}) => ({
  VERSION: 'V',
  SHADING_LANGUAGE_VERSION: 'SLV',
  VENDOR: 'VEN',
  RENDERER: 'REN',
  getParameter: vi.fn((p) => `param:${p}`),
  getExtension: vi.fn(() => null),
  ...overrides,
});

const stubCanvas = (gl) => {
  const getContext = vi.fn(() => gl);
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) =>
    tag === 'canvas' ? { getContext } : realCreateElement(tag)
  );
  return { getContext };
};

// jsdom ships no canvas implementation, so an un-stubbed getContext() logs
// "Not implemented" and makes the no-WebGL path depend on jsdom internals
// rather than on the branch under test. Return null explicitly instead.
const stubNoWebgl = () => {
  const getContext = vi.fn(() => null);
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) =>
    tag === 'canvas' ? { getContext } : realCreateElement(tag)
  );
  return { getContext };
};

beforeEach(() => {
  vi.resetModules();
});

describe('base metadata', () => {
  // These cases assert the non-WebGL fields, but collectBrowserMetadata() always
  // probes. Stub the probe away so they neither depend on nor log jsdom's
  // unimplemented canvas.
  beforeEach(() => {
    stubNoWebgl();
  });

  it('returns userAgent, platform, language matching navigator, and url matching location.href', async () => {
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.userAgent).toBe(navigator.userAgent);
    expect(meta.platform).toBe(navigator.platform);
    expect(meta.language).toBe(navigator.language);
    expect(meta.url).toBe(location.href);
  });

  it('returns screen as { width, height, dpr } matching window.screen and devicePixelRatio', async () => {
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.screen).toEqual({
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio,
    });
  });

  it('returns viewport as { width, height } matching window.innerWidth/innerHeight', async () => {
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.viewport).toEqual({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  });

  it('timestampUtc is a valid ISO-8601 UTC string that round-trips', async () => {
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.timestampUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(meta.timestampUtc).toISOString()).toBe(meta.timestampUtc);
  });

  it('is JSON-serializable without throwing', async () => {
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(() => JSON.stringify(meta)).not.toThrow();
  });
});

describe('when WebGL is unavailable', () => {
  it('omits the webgl key when getContext returns null for both webgl2 and webgl', async () => {
    const { getContext } = stubNoWebgl();
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2');
    expect(getContext).toHaveBeenNthCalledWith(2, 'webgl');
    expect(meta).not.toHaveProperty('webgl');
    expect(meta.userAgent).toBe(navigator.userAgent);
    expect(meta.url).toBe(location.href);
  });

  it('does not throw and omits webgl when getContext throws', async () => {
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas'
        ? {
            getContext: vi.fn(() => {
              throw new Error('boom');
            }),
          }
        : realCreateElement(tag)
    );
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    let meta;
    expect(() => {
      meta = collectBrowserMetadata();
    }).not.toThrow();
    expect(meta).not.toHaveProperty('webgl');
  });

  it('does not throw and omits webgl when document.createElement itself throws', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('createElement boom');
    });
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    let meta;
    expect(() => {
      meta = collectBrowserMetadata();
    }).not.toThrow();
    expect(meta).not.toHaveProperty('webgl');
  });
});

describe('when WebGL is available', () => {
  it("prefers 'webgl2': the second 'webgl' call is never made", async () => {
    const gl = makeGl();
    const { getContext } = stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    collectBrowserMetadata();
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it("falls back to 'webgl' when 'webgl2' returns null", async () => {
    const gl = makeGl();
    const getContext = vi.fn((type) => (type === 'webgl2' ? null : gl));
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? { getContext } : realCreateElement(tag)
    );
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    collectBrowserMetadata();
    expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2');
    expect(getContext).toHaveBeenNthCalledWith(2, 'webgl');
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it('populates webgl.version and webgl.shadingLanguageVersion from gl.getParameter(gl.VERSION/SHADING_LANGUAGE_VERSION)', async () => {
    const gl = makeGl({
      VERSION: 'VERSION_CONST',
      SHADING_LANGUAGE_VERSION: 'SLV_CONST',
      getParameter: vi.fn((p) => {
        if (p === 'VERSION_CONST') return 'WebGL 2.0';
        if (p === 'SLV_CONST') return 'GLSL ES 3.00';
        return `other:${p}`;
      }),
    });
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.webgl.version).toBe('WebGL 2.0');
    expect(meta.webgl.shadingLanguageVersion).toBe('GLSL ES 3.00');
  });

  it('without the debug extension, vendor/renderer come from gl.VENDOR/gl.RENDERER', async () => {
    const gl = makeGl({
      VENDOR: 'VENDOR_CONST',
      RENDERER: 'RENDERER_CONST',
      getParameter: vi.fn((p) => {
        if (p === 'VENDOR_CONST') return 'Plain Vendor';
        if (p === 'RENDERER_CONST') return 'Plain Renderer';
        return `other:${p}`;
      }),
      getExtension: vi.fn(() => null),
    });
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.webgl.vendor).toBe('Plain Vendor');
    expect(meta.webgl.renderer).toBe('Plain Renderer');
  });

  it('with the debug extension, vendor/renderer come from UNMASKED_VENDOR_WEBGL/UNMASKED_RENDERER_WEBGL', async () => {
    const gl = makeGl({
      VENDOR: 'VENDOR_CONST',
      RENDERER: 'RENDERER_CONST',
      getParameter: vi.fn((p) => {
        if (p === 'VENDOR_CONST') return 'Masked Vendor';
        if (p === 'RENDERER_CONST') return 'Masked Renderer';
        if (p === 'UV') return 'Unmasked Vendor';
        if (p === 'UR') return 'Unmasked Renderer';
        return `other:${p}`;
      }),
      getExtension: vi.fn((name) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_VENDOR_WEBGL: 'UV', UNMASKED_RENDERER_WEBGL: 'UR' }
          : null
      ),
    });
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const meta = collectBrowserMetadata();
    expect(meta.webgl.vendor).toBe('Unmasked Vendor');
    expect(meta.webgl.renderer).toBe('Unmasked Renderer');
  });
});

describe('context leak guard', () => {
  it('calls loseContext() exactly once after probing', async () => {
    const loseContext = vi.fn();
    const gl = makeGl({
      getExtension: vi.fn((name) =>
        name === 'WEBGL_lose_context' ? { loseContext } : null
      ),
    });
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    collectBrowserMetadata();
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when WEBGL_lose_context is unsupported', async () => {
    const gl = makeGl({ getExtension: vi.fn(() => null) });
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    expect(() => collectBrowserMetadata()).not.toThrow();
  });
});

describe('probe caching', () => {
  it('probes only ONCE across multiple collectBrowserMetadata() calls', async () => {
    const gl = makeGl();
    const { getContext } = stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    collectBrowserMetadata();
    collectBrowserMetadata();
    collectBrowserMetadata();
    expect(document.createElement).toHaveBeenCalledWith('canvas');
    expect(document.createElement.mock.calls.filter((c) => c[0] === 'canvas')).toHaveLength(1);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it('still returns the same webgl payload on the second and third calls', async () => {
    const gl = makeGl();
    stubCanvas(gl);
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const first = collectBrowserMetadata();
    const second = collectBrowserMetadata();
    const third = collectBrowserMetadata();
    expect(second.webgl).toEqual(first.webgl);
    expect(third.webgl).toEqual(first.webgl);
  });

  it('caches the NEGATIVE result too: three calls still perform only one probe attempt', async () => {
    const { getContext } = stubNoWebgl();
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    const first = collectBrowserMetadata();
    collectBrowserMetadata();
    collectBrowserMetadata();
    expect(first).not.toHaveProperty('webgl');
    expect(document.createElement.mock.calls.filter((c) => c[0] === 'canvas')).toHaveLength(1);
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it('timestampUtc is NOT cached across calls separated in time', async () => {
    stubNoWebgl();
    const { collectBrowserMetadata } = await import('./browserMetadata.js');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
      const first = collectBrowserMetadata();
      vi.setSystemTime(new Date('2020-01-01T00:00:05.000Z'));
      const second = collectBrowserMetadata();
      expect(first.timestampUtc).not.toBe(second.timestampUtc);
    } finally {
      vi.useRealTimers();
    }
  });
});
