import { useEffect } from 'react';

const DEFAULTS = {
  title: 'BCSDLab. Arcade',
  description: '브라우저에서 바로 플레이하고, 버그·제안을 제출하세요.',
  image: 'https://arcade.codingbot.kr/bcsd_main_page_image.webp',
  url: 'https://arcade.codingbot.kr',
  type: 'website',
};

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function applyMeta({ title, description, image, url, type }) {
  if (title) {
    document.title = title;
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[name="twitter:title"]', title);
  }
  if (description) {
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[name="twitter:description"]', description);
  }
  if (image) {
    setMetaContent('meta[property="og:image"]', image);
    setMetaContent('meta[name="twitter:image"]', image);
  }
  if (url) {
    setMetaContent('meta[property="og:url"]', url);
  }
  if (type) {
    setMetaContent('meta[property="og:type"]', type);
  }
}

/**
 * Dynamically updates <head> meta/OG tags for the current page.
 * Resets to site defaults on unmount so navigation to other pages
 * doesn't carry stale values.
 *
 * @param {object} opts
 * @param {string} [opts.title]       Full page title (already formatted)
 * @param {string} [opts.description] Page description / og:description
 * @param {string} [opts.image]       Absolute URL for og:image
 * @param {string} [opts.url]         Canonical URL for og:url
 * @param {string} [opts.type]        og:type ('article' | 'website')
 */
export function useDocumentMeta({ title, description, image, url, type } = {}) {
  useEffect(() => {
    if (!title) return; // wait until data is ready
    applyMeta({ title, description, image, url: url || window.location.href, type: type || 'website' });

    return () => {
      applyMeta(DEFAULTS);
      document.title = DEFAULTS.title;
    };
  }, [title, description, image, url, type]);
}
