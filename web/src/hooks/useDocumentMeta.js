import { useEffect } from 'react';
import { useI18n } from '../i18n.jsx';
import { isLocalizedPath, stripLocale, withLocale } from '../i18n/localePath.js';

const DEFAULTS = {
  title: 'BCSDLab. Game Track 웹 게임 | BCSDLab. Arcade',
  description: 'BCSDLab. Game Track에서 만든 웹 게임을 모아둔 공간입니다. 설치 없이 브라우저에서 바로 플레이하세요.',
  image: '/bcsd_main_page_image.webp',
  url: typeof window === 'undefined' ? 'https://arcade.codingbot.kr' : window.location.origin,
  type: 'website',
  robots: 'noindex,follow',
};

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el && content !== undefined && content !== null) el.setAttribute('content', content);
}

function currentMetaContent(selector) {
  return document.querySelector(selector)?.getAttribute('content') || '';
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

function setAlternateLinks(alternates) {
  document.querySelectorAll('link[rel="alternate"][data-managed="1"]').forEach((node) => node.remove());
  if (!Array.isArray(alternates)) return;
  for (const alternate of alternates) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = alternate.hreflang;
    link.href = alternate.href;
    link.dataset.managed = '1';
    document.head.appendChild(link);
  }
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

function localizeUrl(value, lang) {
  const resolved = toAbsoluteUrl(value);
  if (!resolved) return resolved;
  try {
    const parsed = new URL(resolved);
    if (!isLocalizedPath(parsed.pathname)) return parsed.href;
    parsed.pathname = withLocale(stripLocale(parsed.pathname).path, lang);
    return parsed.href;
  } catch {
    return resolved;
  }
}

function defaultAlternates(lang) {
  const path = stripLocale(window.location.pathname).path;
  if (!isLocalizedPath(path)) return undefined;
  // Dynamic pages can only advertise hreflang after their translation row has
  // been joined. SSR owns those links; the client must not invent them.
  if (!['/', '/arcade', '/privacy'].includes(path)) return undefined;
  const suffix = path === '/' ? '' : path;
  return [
    { hreflang: 'ko', href: `${window.location.origin}${suffix}` },
    { hreflang: 'en', href: `${window.location.origin}/en${suffix}` },
    { hreflang: 'x-default', href: `${window.location.origin}${suffix}` },
  ];
}

function applyMeta({ title, description, image, url, type, robots, jsonLd, lang, alternates }) {
  if (title) {
    document.title = title;
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[name="twitter:title"]', title);
  }
  const resolvedDescription = description || DEFAULTS.description;
  setMetaContent('meta[name="description"]', resolvedDescription);
  setMetaContent('meta[property="og:description"]', resolvedDescription);
  setMetaContent('meta[name="twitter:description"]', resolvedDescription);
  const resolvedImage = image || DEFAULTS.image;
  if (resolvedImage) {
    const absoluteImage = toAbsoluteUrl(resolvedImage);
    setMetaContent('meta[property="og:image"]', absoluteImage);
    setMetaContent('meta[name="twitter:image"]', absoluteImage);
  }
  const resolvedUrl = url || window.location.href;
  setMetaContent('meta[property="og:url"]', resolvedUrl);
  setCanonical(resolvedUrl);
  setMetaContent('meta[property="og:type"]', type || DEFAULTS.type);
  setMetaContent('meta[name="robots"]', robots || currentMetaContent('meta[name="robots"]') || DEFAULTS.robots);
  setMetaContent('meta[property="og:locale"]', lang === 'en' ? 'en_US' : 'ko_KR');
  if (alternates !== undefined) {
    document.querySelectorAll('meta[property="og:locale:alternate"]').forEach((node) => node.remove());
    const alternate = Array.isArray(alternates)
      ? alternates.find((item) => item.hreflang === (lang === 'en' ? 'ko' : 'en'))
      : null;
    if (alternate) {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:locale:alternate');
      meta.setAttribute('content', lang === 'en' ? 'ko_KR' : 'en_US');
      document.head.appendChild(meta);
    }
    setAlternateLinks(Array.isArray(alternates) ? alternates : []);
  }
  setJsonLd(jsonLd);
  document.documentElement.lang = lang === 'en' ? 'en' : 'ko';
}

/** Updates document metadata and keeps locale/canonical tags in sync with the URL. */
export function useDocumentMeta({ title, description, image, url, type, robots, jsonLd, lang, alternates } = {}) {
  const context = useI18n();
  const resolvedLang = lang || context?.lang || 'ko';
  useEffect(() => {
    if (!title) return undefined;
    const previousLang = document.documentElement.lang;
    // Callers deliberately pass the canonical URL. In particular, an English
    // fallback page must be allowed to canonicalize back to Korean instead of
    // being silently localized back to /en here.
    const resolvedUrl = toAbsoluteUrl(url || window.location.href);
    const resolvedRobots = robots ?? (resolvedLang === 'en'
      ? currentMetaContent('meta[name="robots"]') || DEFAULTS.robots
      : 'index,follow');
    applyMeta({ title, description, image, url: resolvedUrl, type: type || 'website', robots: resolvedRobots, jsonLd, lang: resolvedLang, alternates });
    return () => {
      applyMeta({ ...DEFAULTS, url: DEFAULTS.url, lang: previousLang === 'en' ? 'en' : 'ko', alternates: undefined });
      setAlternateLinks([]);
      document.title = DEFAULTS.title;
      document.documentElement.lang = previousLang || 'ko';
    };
  }, [title, description, image, url, type, robots, jsonLd, resolvedLang, alternates]);
}

export { DEFAULTS, localizeUrl };
