import { useEffect, useRef } from 'react';
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
  // Captured on the first render only, before this page's own applyMeta call
  // below can touch <html lang>. Used by the unmount-only effect further down
  // to know what to restore once this page is actually torn down.
  const previousLangRef = useRef(typeof document === 'undefined' ? 'ko' : document.documentElement.lang);

  // Deliberately has no cleanup. Callers routinely pass an inline `jsonLd`/
  // `alternates` object that gets a new reference on every render (e.g. a
  // list page whose jsonLd embeds a computed canonical URL), so this effect
  // re-runs far more often than the page itself actually changes. If a reset
  // lived in this effect's cleanup, each such re-run would briefly reset
  // <meta name="robots"> to the noindex default below, and since callers that
  // don't pass `robots` explicitly re-derive their value from "whatever's
  // currently in the DOM" (to defer to the server's index/noindex decision),
  // that transient reset would stick — silently noindexing an otherwise
  // indexable page after the very first client-side re-render. That is
  // exactly what happened to /en/blog: BlogListPage never passes `robots`,
  // its inline `jsonLd` changes reference on every render, and the resulting
  // reset-then-reread cycle poisoned the tag to `noindex,follow` in Google's
  // rendered DOM even though the SSR response was `index,follow`.
  useEffect(() => {
    if (!title) return;
    // Callers deliberately pass the canonical URL. In particular, an English
    // fallback page must be allowed to canonicalize back to Korean instead of
    // being silently localized back to /en here.
    const resolvedUrl = toAbsoluteUrl(url || window.location.href);
    const resolvedRobots = robots ?? (resolvedLang === 'en'
      ? currentMetaContent('meta[name="robots"]') || DEFAULTS.robots
      : 'index,follow');
    applyMeta({ title, description, image, url: resolvedUrl, type: type || 'website', robots: resolvedRobots, jsonLd, lang: resolvedLang, alternates });
  }, [title, description, image, url, type, robots, jsonLd, resolvedLang, alternates]);

  // Empty deps: this cleanup only fires when the page truly unmounts (route
  // change to something that isn't this component), never on a dependency
  // change within the same mounted page.
  useEffect(() => () => {
    applyMeta({ ...DEFAULTS, url: DEFAULTS.url, lang: previousLangRef.current === 'en' ? 'en' : 'ko', alternates: undefined });
    setAlternateLinks([]);
    document.title = DEFAULTS.title;
    document.documentElement.lang = previousLangRef.current || 'ko';
  }, []);
}

export { DEFAULTS, localizeUrl };
