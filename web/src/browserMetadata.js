export function collectBrowserMetadata() {
  const meta = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: { width: window.screen.width, height: window.screen.height, dpr: window.devicePixelRatio },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    url: location.href,
    timestampUtc: new Date().toISOString(),
  };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      meta.webgl = {
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    }
  } catch {
    // ignore — webgl probe is best-effort
  }

  return meta;
}
