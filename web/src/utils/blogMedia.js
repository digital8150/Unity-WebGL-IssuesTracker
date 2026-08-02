export function isVideoMediaUrl(value) {
  try {
    const parsed = new URL(String(value), window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.pathname.toLowerCase().endsWith('.mp4');
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createBlogMarkdownRenderer(Renderer) {
  const renderer = new Renderer();
  const defaultRenderer = new Renderer();
  renderer.image = function image(token) {
    if (!isVideoMediaUrl(token.href)) return defaultRenderer.image.call(this, token);

    return `<video autoplay loop muted playsinline preload="metadata" aria-label="${escapeHtml(token.text || 'Animated image')}"><source src="${escapeHtml(token.href)}" type="video/mp4"></video>`;
  };
  return renderer;
}
