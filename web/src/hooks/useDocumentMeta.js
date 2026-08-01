import { useEffect } from 'react';

const DEFAULTS = {
  title: 'BCSDLab. Arcade',
  description: '브라우저에서 바로 플레이하고, 버그·제안을 제출하세요.',
  image: 'https://arcade.codingbot.kr/bcsd_main_page_image.webp',
  url: 'https://arcade.codingbot.kr',
  type: 'website',
  robots: 'noindex,follow',
};

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function setCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

function setJsonLd(data) {
  document.getElementById('seo-jsonld')?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = 'seo-jsonld';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function toAbsoluteUrl(value) {
  if (!value) return value;
  try { return new URL(value, window.location.origin).href; } catch { return value; }
}

function applyMeta({ title, description, image, url, type, robots, jsonLd }) {
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
    const absoluteImage = toAbsoluteUrl(image);
    setMetaContent('meta[property="og:image"]', absoluteImage);
    setMetaContent('meta[name="twitter:image"]', absoluteImage);
  }
  if (url) {
    setMetaContent('meta[property="og:url"]', url);
    setCanonical(url);
  }
  if (type) setMetaContent('meta[property="og:type"]', type);
  if (robots) setMetaContent('meta[name="robots"]', robots);
  setJsonLd(jsonLd);
}

/**
 * Dynamically updates document metadata for the current page and resets it
 * when the page unmounts during client-side navigation.
 *
 * @param {object} opts
 * @param {string} [opts.title]       Full page title
 * @param {string} [opts.description] Page description / og:description
 * @param {string} [opts.image]       Image URL for og:image
 * @param {string} [opts.url]         Canonical URL for og:url
 * @param {string} [opts.type]        og:type ('article' | 'website')
 * @param {string} [opts.robots]      robots directive
 * @param {object} [opts.jsonLd]      JSON-LD structured data
 */
export function useDocumentMeta({ title, description, image, url, type, robots = 'index,follow', jsonLd } = {}) {
  useEffect(() => {
    if (!title) return;
    applyMeta({
      title,
      description,
      image,
      url: url || window.location.href,
      type: type || 'website',
      robots,
      jsonLd,
    });

    return () => {
      applyMeta(DEFAULTS);
      document.title = DEFAULTS.title;
    };
  }, [title, description, image, url, type, robots, jsonLd]);
}
