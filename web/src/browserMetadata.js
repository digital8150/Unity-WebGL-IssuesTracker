// WebGL capabilities don't change during a session — probe once and cache.
// Each getContext() call consumes one of the browser's ~16 WebGL context slots;
// not releasing it eventually kills the Unity player context with
// "Too many active WebGL contexts."
let _webglCache = undefined;

function probeWebgl() {
  if (_webglCache !== undefined) return _webglCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) { _webglCache = null; return null; }

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    _webglCache = {
      version:                gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor:   dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };

    // Explicitly release so this probe context never counts against the limit.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return _webglCache;
  } catch {
    _webglCache = null;
    return null;
  }
}

export function collectBrowserMetadata() {
  const webgl = probeWebgl();
  const meta = {
    userAgent:    navigator.userAgent,
    platform:     navigator.platform,
    language:     navigator.language,
    screen:       { width: window.screen.width, height: window.screen.height, dpr: window.devicePixelRatio },
    viewport:     { width: window.innerWidth,   height: window.innerHeight },
    url:          location.href,
    timestampUtc: new Date().toISOString(),
  };
  if (webgl) meta.webgl = webgl;
  return meta;
}
