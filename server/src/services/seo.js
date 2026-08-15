import { copy } from '../i18n/copy.js';
import { localizedPath } from '../routes/seoRoutes.config.js';

export const SITE_NAME = copy.ko.siteName;
export const DEFAULT_DESCRIPTION = copy.ko.homeDescription;
export const HOME_TITLE = copy.ko.homeTitle;
export const HOME_DESCRIPTION = copy.ko.homeDescription;
export const DEFAULT_IMAGE_PATH = '/bcsd_main_page_image.webp';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function absoluteUrl(value, siteOrigin, fallback = DEFAULT_IMAGE_PATH) {
  const candidate = String(value || fallback);
  try {
    const parsed = new URL(candidate, siteOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return new URL(fallback, siteOrigin).href;
    return parsed.href;
  } catch {
    return new URL(fallback, siteOrigin).href;
  }
}

export function publicImageUrl(value, siteOrigin) {
  return absoluteUrl(value, siteOrigin, DEFAULT_IMAGE_PATH);
}

export function formatDate(value, locale = 'ko') {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

const GAME_RATING_LABELS = {
  all: '\uc804\uccb4 \uc774\uc6a9\uac00',
  over12: '12\uc138 \uc774\uc6a9\uac00',
  over15: '15\uc138 \uc774\uc6a9\uac00',
  over18: '\uccad\uc18c\ub144\uc774\uc6a9\ubd88\uac00',
};

const GAME_DESCRIPTOR_LABELS = {
  sexuality: '\uc120\uc815\uc131',
  violence: '\ud3ed\ub825\uc131',
  fear: '\uacf5\ud3ec',
  language: '\uc5b8\uc5b4\uc758 \ubd80\uc801\uc808\uc131',
  drugs: '\uc57d\ubb3c',
  crime: '\ubc94\uc8c4',
  gambling: '\uc0ac\ud589\uc131',
};

const GAME_RATING_MARK_PATHS = {
  all: '/grac/rating/all.png',
  over12: '/grac/rating/over12.png',
  over15: '/grac/rating/over15.png',
  over18: '/grac/rating/over18.png',
};

const GAME_DESCRIPTOR_MARK_PATHS = {
  sexuality: '/grac/descriptors/sexuality.png',
  violence: '/grac/descriptors/violence.png',
  fear: '/grac/descriptors/fear.png',
  language: '/grac/descriptors/language.png',
  drugs: '/grac/descriptors/drugs.png',
  crime: '/grac/descriptors/crime.png',
  gambling: '/grac/descriptors/gambling.png',
};

const GAME_REVIEW_FIELD_LABELS = {
  title: '\uc81c\uba85',
  businessName: '\uc0c1\ud638',
  rating: '\uc774\uc6a9\ub4f1\uae09',
  classificationNumber: '\ub4f1\uae09\ubd84\ub958\ubc88\ud638',
  classificationDate: '\ub4f1\uae09\ubd84\ub958\uc77c\uc790',
  developerReportNumber: '\uc81c\uc791\uc5c5\uc790 \uc2e0\uace0 \ubc88\ud638',
};

export function getGameReviewSeoData(reviewInfo, locale = 'ko') {
  if (!reviewInfo?.enabled) return { ratingLabel: '', descriptorLabels: [], additionalProperty: [] };
  const ratingLabel = GAME_RATING_LABELS[reviewInfo.rating] || '';
  const descriptorLabels = (reviewInfo.contentDescriptors || [])
    .map((key) => GAME_DESCRIPTOR_LABELS[key])
    .filter(Boolean);
  const details = [
    [GAME_REVIEW_FIELD_LABELS.title, reviewInfo.title],
    [GAME_REVIEW_FIELD_LABELS.businessName, reviewInfo.businessName],
    [GAME_REVIEW_FIELD_LABELS.rating, ratingLabel],
    [GAME_REVIEW_FIELD_LABELS.classificationNumber, reviewInfo.classificationNumber],
    [GAME_REVIEW_FIELD_LABELS.classificationDate, formatDate(reviewInfo.classificationDate, locale)],
    [GAME_REVIEW_FIELD_LABELS.developerReportNumber, reviewInfo.developerReportNumber],
  ];
  return {
    ratingLabel,
    descriptorLabels,
    additionalProperty: details.filter(([, value]) => value)
      .map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) })),
  };
}

// Kept for legal-page consumers. The public play page renders the same data
// visibly from its bootstrap payload.
export function renderGameReviewContent(reviewInfo, siteOrigin) {
  if (!reviewInfo?.enabled) return '';
  const review = getGameReviewSeoData(reviewInfo);
  const ratingMark = GAME_RATING_MARK_PATHS[reviewInfo.rating]
    ? `<img src="${escapeHtml(absoluteUrl(GAME_RATING_MARK_PATHS[reviewInfo.rating], siteOrigin))}" alt="${escapeHtml(review.ratingLabel)}" width="113" height="131" />`
    : '';
  const descriptorMarks = (reviewInfo.contentDescriptors || [])
    .filter((key) => GAME_DESCRIPTOR_MARK_PATHS[key])
    .map((key) => `<img src="${escapeHtml(absoluteUrl(GAME_DESCRIPTOR_MARK_PATHS[key], siteOrigin))}" alt="${escapeHtml(GAME_DESCRIPTOR_LABELS[key])}" width="99" height="116" />`)
    .join('');
  const details = [
    [GAME_REVIEW_FIELD_LABELS.title, reviewInfo.title],
    [GAME_REVIEW_FIELD_LABELS.businessName, reviewInfo.businessName],
    [GAME_REVIEW_FIELD_LABELS.rating, review.ratingLabel],
    [GAME_REVIEW_FIELD_LABELS.classificationNumber, reviewInfo.classificationNumber],
    [GAME_REVIEW_FIELD_LABELS.classificationDate, formatDate(reviewInfo.classificationDate)],
    [GAME_REVIEW_FIELD_LABELS.developerReportNumber, reviewInfo.developerReportNumber],
  ].filter(([, value]) => value);
  return `<section aria-labelledby="game-rating-title"><h2 id="game-rating-title">\uac8c\uc784 \uc774\uc6a9 \ub4f1\uae09</h2><div aria-label="\ub4f1\uae09\ubd84\ub958 \ub9c8\ud06c">${ratingMark}</div>${descriptorMarks ? `<div aria-label="\ub0b4\uc6a9\uc815\ubcf4\ud45c\uc2dc\uc0ac\ud56d">${descriptorMarks}</div>` : ''}<dl>${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`;
}

export const PRIVACY_POLICY_DATES = ['2026-07-08'];
export const PRIVACY_TITLE = `${copy.ko.privacyTitle} — ${SITE_NAME}`;
export const PRIVACY_DESCRIPTION = copy.ko.privacyDescription;

export function resolvePrivacyVersion(date) {
  if (!date) return { effectiveDate: PRIVACY_POLICY_DATES[0], isLatest: true };
  if (!PRIVACY_POLICY_DATES.includes(date)) return null;
  return { effectiveDate: date, isLatest: date === PRIVACY_POLICY_DATES[0] };
}

function replaceMeta(html, attribute, key, content) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${attribute}="${escapedKey}"[^>]*>`, 'i');
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n  </head>`);
}

function replaceCanonical(html, url) {
  const tag = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  const pattern = /<link\s+rel="canonical"[^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n  </head>`);
}

export function markdownToPlainText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderPreviewParagraphs(value, className) {
  const plainText = markdownToPlainText(value);
  if (!plainText) return '';
  return plainText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .map((paragraph) => `<p class="${className}">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`).join('');
}

function renderPreviewItems(items, maxItems) {
  const itemMarkup = (Array.isArray(items) ? items : []).slice(0, maxItems).map((item) => {
    const itemTitle = markdownToPlainText(item?.title ?? item?.name);
    if (!itemTitle) return '';
    const itemSummary = markdownToPlainText(item?.summary ?? item?.description);
    const href = String(item?.href || '');
    const titleMarkup = href ? `<a href="${escapeHtml(href)}">${escapeHtml(itemTitle)}</a>` : `<strong>${escapeHtml(itemTitle)}</strong>`;
    return `<li class="seo-preview-item">${titleMarkup}${itemSummary ? `<p>${escapeHtml(itemSummary)}</p>` : ''}</li>`;
  }).join('');
  return itemMarkup ? `<ul class="seo-preview-list">${itemMarkup}</ul>` : '';
}

function normalizePreviewItemLimit(value) {
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 12;
}

function renderPreviewSections(sections, maxItems) {
  return (Array.isArray(sections) ? sections : []).map((section) => {
    const listMarkup = renderPreviewItems(section?.items, maxItems);
    if (!listMarkup) return '';
    const heading = markdownToPlainText(section?.heading);
    return `<section class="seo-preview-section">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}${listMarkup}</section>`;
  }).join('');
}

function renderPreviewNav(locale, localizedCopy) {
  const links = [
    { href: localizedPath('/', locale), label: localizedCopy.siteName },
    { href: localizedPath('/arcade', locale), label: localizedCopy.arcadeTitle },
    { href: localizedPath('/blog', locale), label: localizedCopy.blogTitle },
  ];
  return `<nav class="seo-preview-nav" aria-label="${escapeHtml(localizedCopy.siteName)}">${links.map(({ href, label }, index) => `<a${index === 0 ? ' class="seo-preview-nav-brand"' : ''} href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join('')}</nav>`;
}

function renderPreviewFooter(locale, localizedCopy) {
  const footer = localizedCopy.footer || {};
  const footerLink = (href, label) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  return `<footer class="seo-preview-footer">
    <section class="seo-preview-club">
      <p class="seo-preview-eyebrow">${escapeHtml(footer.bcsdEyebrow)}</p>
      <p class="seo-preview-footer-headline">${escapeHtml(footer.bcsdHeadline)}</p>
      <p class="seo-preview-footer-copy">${escapeHtml(footer.bcsdBody)}</p>
      <a href="https://bcsdlab.com/" target="_blank" rel="noreferrer noopener">${escapeHtml(footer.bcsdCta)}</a>
    </section>
    <section class="seo-preview-site">
      <p class="seo-preview-footer-copy">${escapeHtml(footer.tagline)}</p>
      <nav aria-label="${escapeHtml(footer.playHeading)}">
        ${footerLink(localizedPath('/arcade', locale), footer.playAllGames)}
        ${footerLink(localizedPath('/blog', locale), footer.playArticles)}
      </nav>
      <nav aria-label="${escapeHtml(footer.trackHeading)}">
        ${footerLink('/dashboard', footer.trackDashboard)}
      </nav>
    </section>
    <div class="seo-preview-footer-bottom">
      <span>${escapeHtml(footer.copyright)}</span>
      ${footerLink(localizedPath('/privacy', locale), footer.privacyPolicy)}
    </div>
  </footer>`;
}

export function renderSeoPreview({ title, summary = '', body = '', items = [], sections = [], notice = null, locale = 'ko', maxItems = 12 } = {}) {
  const itemLimit = normalizePreviewItemLimit(maxItems);
  const sectionMarkup = renderPreviewSections(sections, itemLimit);
  const legacyListMarkup = sectionMarkup ? '' : renderPreviewItems(items, itemLimit);
  const noticeMarkup = notice?.text
    ? `<p class="seo-preview-notice">${notice.href ? `<a href="${escapeHtml(notice.href)}">${escapeHtml(notice.text)}</a>` : escapeHtml(notice.text)}</p>`
    : '';
  const localizedCopy = copy[locale] || copy.ko;
  return `<div id="seo-preview">${renderPreviewNav(locale, localizedCopy)}<main class="seo-preview-main"><article class="seo-preview-article">${noticeMarkup}<h1>${escapeHtml(markdownToPlainText(title))}</h1>${renderPreviewParagraphs(summary, 'seo-preview-summary')}${renderPreviewParagraphs(body, 'seo-preview-body')}${legacyListMarkup}${sectionMarkup}</article>${renderPreviewFooter(locale, localizedCopy)}</main></div>`;
}

function replaceHtmlLang(html, lang) {
  const value = lang === 'en' ? 'en' : 'ko';
  if (/<html\b[^>]*\blang=/i.test(html)) return html.replace(/(<html\b[^>]*\blang=")[^"]*("[^>]*>)/i, `$1${value}$2`);
  return html.replace(/<html\b([^>]*)>/i, `<html lang="${value}"$1>`);
}

function replaceAlternates(html, alternates) {
  let result = html.replace(/\s*<link\s+[^>]*rel="alternate"[^>]*>/gi, '');
  if (!Array.isArray(alternates) || !alternates.length) return result;
  const tags = alternates.map((alternate) => `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" data-managed="1" />`).join('\n  ');
  return result.replace('</head>', `  ${tags}\n  </head>`);
}

function localeCode(lang) {
  return lang === 'en' ? 'en_US' : 'ko_KR';
}

export function injectSeoHtml(html, {
  title,
  description,
  image,
  url,
  type = 'website',
  robots = 'index,follow',
  lang = 'ko',
  alternates = null,
  jsonLd = null,
  preview = null,
  bootstrap = null,
} = {}) {
  let result = replaceHtmlLang(html, lang);
  result = replaceAlternates(result, alternates);
  result = result.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = replaceMeta(result, 'name', 'description', description);
  result = replaceMeta(result, 'name', 'robots', robots);
  result = replaceMeta(result, 'property', 'og:title', title);
  result = replaceMeta(result, 'property', 'og:description', description);
  result = replaceMeta(result, 'property', 'og:image', image);
  result = replaceMeta(result, 'property', 'og:url', url);
  result = replaceMeta(result, 'property', 'og:type', type);
  result = replaceMeta(result, 'property', 'og:locale', localeCode(lang));
  result = result.replace(/\s*<meta\s+property="og:locale:alternate"[^>]*>/gi, '');
  const alternateLocale = lang === 'en' ? 'ko_KR' : 'en_US';
  if (Array.isArray(alternates) && alternates.some((item) => item.hreflang === (lang === 'en' ? 'ko' : 'en'))) {
    result = result.replace('</head>', `  <meta property="og:locale:alternate" content="${alternateLocale}" />\n  </head>`);
  }
  result = replaceMeta(result, 'name', 'twitter:title', title);
  result = replaceMeta(result, 'name', 'twitter:description', description);
  result = replaceMeta(result, 'name', 'twitter:image', image);
  result = replaceCanonical(result, url);

  const jsonLdTag = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  result = result.replace('<!-- SEO_JSON_LD -->', jsonLdTag);
  const serializedBootstrap = bootstrap === null || bootstrap === undefined ? '' : JSON.stringify(bootstrap);
  const bootstrapTag = serializedBootstrap ? `<script type="application/json" id="__SSR_DATA__">${serializedBootstrap.replace(/</g, '\\u003c')}</script>` : '';
  const previewMarkup = preview === null || preview === undefined ? '' : renderSeoPreview(preview);
  if (bootstrapTag || previewMarkup) {
    const rootOpenTag = /<div\s+id=(['"])root\1[^>]*>/i;
    result = result.replace(rootOpenTag, (openingTag) => {
      const previewRootTag = previewMarkup ? openingTag.replace(/>$/, ' data-seo-preview="true">') : openingTag;
      return `${bootstrapTag}${previewRootTag}${previewMarkup}`;
    });
  }
  return result;
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
