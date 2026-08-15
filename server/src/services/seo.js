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

function normalizePreviewHref(value) {
  const href = String(value ?? '').trim();
  if (!href) return '';
  if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#')) return href;
  try {
    const parsed = new URL(href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizePreviewImage(value) {
  return normalizePreviewHref(value);
}

function previewClassToken(value, fallback = 'document') {
  const token = String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return token || fallback;
}

function renderPreviewBrand(href, className = '') {
  return `<a class="seo-preview-brand${className ? ` ${className}` : ''}" href="${escapeHtml(normalizePreviewHref(href) || '/')}"><span>BCSDLab.</span><strong>Arcade</strong></a>`;
}

function renderPreviewTags(tags) {
  const values = Array.isArray(tags) ? tags : tags ? [tags] : [];
  return values.slice(0, 3).map((tag) => {
    const label = markdownToPlainText(tag);
    return label ? `<span class="seo-preview-tag">${escapeHtml(label)}</span>` : '';
  }).join('');
}

function renderPreviewImage(item, kind) {
  const image = normalizePreviewImage(item?.image || item?.coverImageUrl);
  const title = markdownToPlainText(item?.title ?? item?.name);
  const initial = escapeHtml(title.charAt(0).toUpperCase() || 'A');
  const imageStyle = image ? ` style="background-image: url('${escapeHtml(image)}')"` : '';
  return `<div class="seo-preview-card-media seo-preview-card-media--${previewClassToken(kind, 'item')}"${imageStyle}>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />` : `<span>${initial}</span>`}</div>`;
}

function renderPreviewItemMeta(item, locale) {
  const values = [];
  const explicitMeta = Array.isArray(item?.meta) ? item.meta : item?.meta ? [item.meta] : [];
  values.push(...explicitMeta.map((value) => markdownToPlainText(value)).filter(Boolean));
  if (item?.date) {
    const date = formatDate(item.date, locale);
    if (date) values.push(date);
  }
  if (item?.author) values.push(markdownToPlainText(item.author));
  if (!values.length) return '';
  return `<div class="seo-preview-card-meta">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>`;
}

function renderPreviewCard(item, kind, locale) {
  const itemTitle = markdownToPlainText(item?.title ?? item?.name);
  if (!itemTitle) return '';
  const itemSummary = markdownToPlainText(item?.summary ?? item?.description);
  const href = normalizePreviewHref(item?.href);
  const tags = renderPreviewTags(item?.tags);
  const media = renderPreviewImage(item, kind);
  const body = `<div class="seo-preview-card-body">${tags ? `<div class="seo-preview-card-tags">${tags}</div>` : ''}<h3>${escapeHtml(itemTitle)}</h3>${itemSummary ? `<p>${escapeHtml(itemSummary)}</p>` : ''}${renderPreviewItemMeta(item, locale)}${item?.actionLabel ? `<span class="seo-preview-card-action">${escapeHtml(markdownToPlainText(item.actionLabel))} <span>→</span></span>` : ''}</div>`;
  const inner = `${media}${body}`;
  return `<article class="seo-preview-card seo-preview-card--${previewClassToken(kind, 'item')}">${href ? `<a href="${escapeHtml(href)}">${inner}</a>` : `<div>${inner}</div>`}</article>`;
}

function renderPreviewArticleRow(item, locale) {
  const title = markdownToPlainText(item?.title ?? item?.name);
  if (!title) return '';
  const summary = markdownToPlainText(item?.summary ?? item?.description);
  const href = normalizePreviewHref(item?.href);
  const image = normalizePreviewImage(item?.image || item?.coverImageUrl);
  const initial = escapeHtml(title.charAt(0).toUpperCase() || 'A');
  const media = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />`
    : `<span>${initial}</span>`;
  const tag = Array.isArray(item?.tags) ? markdownToPlainText(item.tags[0]) : markdownToPlainText(item?.tags);
  const date = item?.date ? formatDate(item.date, locale) : '';
  const meta = `${tag ? `<span class="seo-preview-article-row-tag">${escapeHtml(tag)}</span>` : ''}${date ? `<time datetime="${escapeHtml(item.date)}">${escapeHtml(date)}</time>` : ''}`;
  const inner = `<div class="seo-preview-article-row-thumb">${media}</div><div class="seo-preview-article-row-copy">${meta ? `<div class="seo-preview-article-row-meta">${meta}</div>` : ''}<h3>${escapeHtml(title)}</h3>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}</div>`;
  return `<article class="seo-preview-article-row">${href ? `<a href="${escapeHtml(href)}">${inner}</a>` : `<div>${inner}</div>`}</article>`;
}

function renderPreviewItems(items, maxItems, { kind = 'list', locale = 'ko' } = {}) {
  const values = (Array.isArray(items) ? items : []).slice(0, maxItems);
  if (!values.length) return '';
  const resolvedKind = kind === 'list' ? (values.some((item) => item?.kind === 'game') ? 'game' : values.some((item) => item?.kind === 'article') ? 'article' : kind) : kind;
  if (resolvedKind === 'game' || resolvedKind === 'article') {
    const cards = values.map((item) => renderPreviewCard(item, item?.kind || resolvedKind, locale)).join('');
    return cards ? `<div class="seo-preview-grid seo-preview-grid--${previewClassToken(resolvedKind)}">${cards}</div>` : '';
  }
  if (resolvedKind === 'article-row') {
    const rows = values.map((item) => renderPreviewArticleRow(item, locale)).join('');
    return rows ? `<div class="seo-preview-article-list">${rows}</div>` : '';
  }
  const itemMarkup = values.map((item) => {
    const itemTitle = markdownToPlainText(item?.title ?? item?.name);
    if (!itemTitle) return '';
    const itemSummary = markdownToPlainText(item?.summary ?? item?.description);
    const href = normalizePreviewHref(item?.href);
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

function renderPreviewSections(sections, maxItems, locale) {
  return (Array.isArray(sections) ? sections : []).map((section) => {
    const kind = section?.kind || section?.variant || 'list';
    const listMarkup = renderPreviewItems(section?.items, maxItems, { kind, locale });
    const heading = markdownToPlainText(section?.heading);
    const eyebrow = markdownToPlainText(section?.eyebrow);
    const actionHref = normalizePreviewHref(section?.action?.href);
    const actionLabel = markdownToPlainText(section?.action?.label);
    const count = Number.isFinite(Number(section?.count)) ? `<span class="seo-preview-section-count">${escapeHtml(section.count)}</span>` : '';
    if (!listMarkup && !heading && !eyebrow && !actionHref && !count) return '';
    const headingMarkup = heading || eyebrow || actionHref || count
      ? `<header class="seo-preview-section-heading"><div>${eyebrow ? `<p class="seo-preview-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}</div>${actionHref && actionLabel ? `<a class="seo-preview-section-link" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : count}</header>`
      : '';
    return `<section class="seo-preview-section seo-preview-section--${previewClassToken(kind, 'list')}">${headingMarkup}${listMarkup}</section>`;
  }).join('');
}

function renderPreviewMarkdown(value) {
  const source = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return '';
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = markdownToPlainText(paragraph.join(' '));
    if (text) blocks.push(`<p>${escapeHtml(text)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list?.items.length) return;
    const tag = list.ordered ? 'ol' : 'ul';
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${escapeHtml(markdownToPlainText(item))}</li>`).join('')}</${tag}>`);
    list = null;
  };

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(3, trimmed.indexOf(' '));
      blocks.push(`<h${level}>${escapeHtml(markdownToPlainText(heading[1]))}</h${level}>`);
      continue;
    }
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${escapeHtml(markdownToPlainText(quote[1]))}</blockquote>`);
      continue;
    }
    if (/^\s*(?:---|___|\*\s*\*\s*\*)\s*$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push('<hr />');
      continue;
    }
    const listItem = trimmed.match(/^([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(listItem[2]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return blocks.join('');
}

function renderPreviewNotice(notice) {
  if (!notice?.text) return '';
  const href = normalizePreviewHref(notice.href);
  return `<p class="seo-preview-notice">${href ? `<a href="${escapeHtml(href)}">${escapeHtml(notice.text)}</a>` : escapeHtml(notice.text)}</p>`;
}

function renderPreviewNav(locale, localizedCopy) {
  const links = [
    { href: localizedPath('/arcade', locale), label: localizedCopy.arcadeTitle },
    { href: localizedPath('/blog', locale), label: localizedCopy.blogTitle },
  ];
  const languageHref = localizedPath('/', locale === 'en' ? 'ko' : 'en');
  const languageLabel = locale === 'en' ? '한국어' : 'EN';
  return `<nav class="seo-preview-nav" aria-label="${escapeHtml(localizedCopy.siteName)}">${renderPreviewBrand(localizedPath('/', locale), 'seo-preview-nav-brand') }<div class="seo-preview-nav-links">${links.map(({ href, label }) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join('')}<a class="seo-preview-language" href="${escapeHtml(languageHref)}">${languageLabel}</a></div></nav>`;
}

function renderPreviewFooter(locale, localizedCopy, variant = 'full') {
  if (variant === 'none') return '';
  const footer = localizedCopy.footer || {};
  const footerLink = (href, label, className = 'seo-preview-footer-link') => `<a class="${className}" href="${escapeHtml(normalizePreviewHref(href) || '/')}">${escapeHtml(label)}</a>`;
  if (variant === 'slim') {
    return `<footer class="seo-preview-footer seo-preview-footer--slim"><div class="seo-preview-footer-bottom"><span>${escapeHtml(footer.copyright)}</span><span class="seo-preview-footer-slim-links">${footerLink('/dashboard', footer.trackDashboard)}${footerLink(localizedPath('/privacy', locale), footer.privacyPolicy)}</span></div></footer>`;
  }
  const isLanding = variant === 'landing';
  return `<footer class="seo-preview-footer${isLanding ? ' seo-preview-footer--landing' : ''}">
    ${isLanding ? `<section class="seo-preview-club"><div class="seo-preview-club-copy"><p class="seo-preview-eyebrow">${escapeHtml(footer.bcsdEyebrow)}</p><p class="seo-preview-footer-headline">${escapeHtml(footer.bcsdHeadline)}</p><p class="seo-preview-footer-copy">${escapeHtml(footer.bcsdBody)}</p><a class="seo-preview-club-cta" href="https://bcsdlab.com/" target="_blank" rel="noreferrer noopener">${escapeHtml(footer.bcsdCta)} <span>→</span></a></div><div class="seo-preview-club-mark" aria-label="BCSD">BCSD</div></section>` : ''}
    <div class="seo-preview-footer-inner"><div class="seo-preview-footer-brand">${renderPreviewBrand(localizedPath('/', locale), 'seo-preview-footer-brand-link')}<p>${escapeHtml(footer.tagline)}</p></div><div class="seo-preview-footer-columns"><nav aria-label="${escapeHtml(footer.playHeading)}"><span>${escapeHtml(footer.playHeading)}</span>${footerLink(localizedPath('/arcade', locale), footer.playAllGames)}${footerLink(localizedPath('/blog', locale), footer.playArticles)}</nav><nav aria-label="${escapeHtml(footer.trackHeading)}"><span>${escapeHtml(footer.trackHeading)}</span>${footerLink('/dashboard', footer.trackDashboard)}</nav></div></div>
    <div class="seo-preview-footer-bottom"><span>${escapeHtml(footer.copyright)}</span>${footerLink(localizedPath('/privacy', locale), footer.privacyPolicy)}</div>
  </footer>`;
}

function renderPreviewHero(hero, fallbackTitle, fallbackSummary, locale) {
  const data = hero || {};
  const title = markdownToPlainText(data.title || fallbackTitle);
  const summary = markdownToPlainText(data.summary || fallbackSummary);
  const image = normalizePreviewImage(data.image);
  const style = image ? ` style="--seo-preview-hero-image: url('${escapeHtml(image)}')"` : '';
  const meta = Array.isArray(data.meta) ? data.meta.map((value) => markdownToPlainText(value)).filter(Boolean) : [];
  const href = normalizePreviewHref(data.href);
  const dots = Array.isArray(data.pagination) && data.pagination.length > 1
    ? `<div class="seo-preview-hero-pagination" aria-label="${escapeHtml(data.paginationLabel || '')}">${data.pagination.slice(0, 5).map((item, index) => `<span class="seo-preview-hero-dot${index === 0 ? ' is-selected' : ''}"></span>`).join('')}</div>`
    : '';
  return `<section class="seo-preview-hero${image ? '' : ' seo-preview-hero--empty'}"${style}><div class="seo-preview-hero-inner"><div class="seo-preview-hero-copy">${data.eyebrow ? `<div class="seo-preview-hero-meta-row"><span class="seo-preview-pill">${escapeHtml(data.eyebrow)}</span>${meta.length ? `<span class="seo-preview-hero-meta">${escapeHtml(meta.join(' · '))}</span>` : ''}</div>` : ''}<h1>${escapeHtml(title)}</h1>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}${href && data.actionLabel ? `<div class="seo-preview-hero-actions"><a class="seo-preview-hero-primary" href="${escapeHtml(href)}">${escapeHtml(data.actionLabel)} <span>→</span></a>${data.note ? `<span class="seo-preview-hero-note">${escapeHtml(data.note)}</span>` : ''}</div>` : ''}</div></div>${dots}</section>`;
}

function renderPreviewPageHeader(page, title, summary) {
  const data = page || {};
  const backHref = normalizePreviewHref(data.backHref);
  const heading = markdownToPlainText(data.title || title);
  const description = markdownToPlainText(data.summary || summary);
  return `<header class="seo-preview-page-header">${backHref ? `<a class="seo-preview-back" href="${escapeHtml(backHref)}">← ${escapeHtml(data.backLabel || 'Back')}</a>` : ''}${data.eyebrow ? `<p class="seo-preview-eyebrow">${escapeHtml(data.eyebrow)}</p>` : ''}<h1>${escapeHtml(heading)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
}

function renderPreviewListing(preview, localizedCopy, itemLimit, locale) {
  const page = preview.page || {};
  const sections = renderPreviewSections(preview.sections, itemLimit, locale) || renderPreviewItems(preview.items, itemLimit, { kind: preview.itemKind || 'list', locale });
  const body = preview.body ? renderPreviewParagraphs(preview.body, 'seo-preview-body') : '';
  if (preview.layout === 'blog-list' && preview.sidebar) {
    const sidebar = preview.sidebar;
    const tags = (Array.isArray(sidebar.tags) ? sidebar.tags : []).slice(0, 12).map((tag) => `<a class="seo-preview-filter-tag" href="${escapeHtml(normalizePreviewHref(`${sidebar.tagHref || localizedPath('/blog', locale)}?tag=${encodeURIComponent(tag)}`))}">#${escapeHtml(tag)}</a>`).join('');
    return `<main class="seo-preview-main seo-preview-main--blog-list"><div class="seo-preview-blog-layout"><aside class="seo-preview-sidebar"><div><label class="seo-preview-filter-label" for="seo-preview-search">${escapeHtml(sidebar.searchLabel || 'Search')}</label><input id="seo-preview-search" type="search" placeholder="${escapeHtml(sidebar.searchPlaceholder || '')}" /></div>${tags ? `<div><p class="seo-preview-filter-label">${escapeHtml(sidebar.tagsLabel || 'Tags')}</p><div class="seo-preview-filter-tags">${tags}</div></div>` : ''}${sidebar.resetLabel ? `<a class="seo-preview-reset" href="${escapeHtml(normalizePreviewHref(sidebar.resetHref || localizedPath('/blog', locale)))}">${escapeHtml(sidebar.resetLabel)}</a>` : ''}</aside><section class="seo-preview-results">${renderPreviewPageHeader(page, preview.title, preview.summary)}${sections}</section></div></main>`;
  }
  return `<main class="seo-preview-main seo-preview-main--listing">${renderPreviewPageHeader(page, preview.title, preview.summary)}${body}${sections}</main>`;
}

function renderPreviewArticle(preview, itemLimit, locale) {
  const article = preview.article || preview;
  const image = normalizePreviewImage(article.coverImage || article.image);
  const imageMarkup = image ? `<div class="seo-preview-article-cover" style="background-image: url('${escapeHtml(image)}')"><img src="${escapeHtml(image)}" alt="" loading="eager" decoding="async" /></div>` : '';
  const backHref = normalizePreviewHref(article.backHref || preview.backHref);
  const body = renderPreviewMarkdown(article.body ?? preview.body);
  const sections = renderPreviewSections(preview.sections, itemLimit, locale);
  return `<main class="seo-preview-main seo-preview-main--article"><article class="seo-preview-longform">${renderPreviewNotice(preview.notice)}${backHref ? `<a class="seo-preview-back" href="${escapeHtml(backHref)}">← ${escapeHtml(article.backLabel || preview.backLabel || 'Back')}</a>` : ''}${imageMarkup}<header class="seo-preview-longform-header">${article.context ? `<p class="seo-preview-eyebrow">${escapeHtml(markdownToPlainText(article.context))}</p>` : ''}${article.tags?.length ? `<div class="seo-preview-card-tags">${renderPreviewTags(article.tags)}</div>` : ''}<h1>${escapeHtml(markdownToPlainText(article.title || preview.title))}</h1>${article.date || article.author ? `<div class="seo-preview-longform-meta">${article.date ? `<time datetime="${escapeHtml(article.date)}">${escapeHtml(formatDate(article.date, locale))}</time>` : ''}${article.author ? `<span>${escapeHtml(markdownToPlainText(article.author))}</span>` : ''}</div>` : ''}${article.summary || preview.summary ? `<p class="seo-preview-longform-summary">${escapeHtml(markdownToPlainText(article.summary || preview.summary))}</p>` : ''}</header><hr />${body ? `<div class="seo-preview-markdown">${body}</div>` : ''}${sections}</article></main>`;
}

function renderPreviewGameInfo(player) {
  const values = [
    [player?.developerLabel || 'Developer', player?.developer || '—'],
    [player?.latestBuildLabel || 'Latest build', player?.version || '—'],
  ];
  const rows = values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(markdownToPlainText(value))}</dd></div>`).join('');
  return `<section class="seo-preview-info-card"><p class="seo-preview-eyebrow">${escapeHtml(player?.infoHeading || 'GAME INFO')}</p><dl>${rows}</dl></section>`;
}

function renderPreviewReview(review) {
  if (!review || (!review.ratingLabel && !review.descriptorLabels?.length && !review.additionalProperty?.length)) return '';
  const properties = (Array.isArray(review.additionalProperty) ? review.additionalProperty : []).map((property) => `<div><dt>${escapeHtml(property.name)}</dt><dd>${escapeHtml(property.value)}</dd></div>`).join('');
  return `<section class="seo-preview-info-card"><p class="seo-preview-eyebrow">${escapeHtml(review.heading || 'GAME RATING')}</p>${review.ratingLabel ? `<strong class="seo-preview-rating">${escapeHtml(review.ratingLabel)}</strong>` : ''}${review.descriptorLabels?.length ? `<p class="seo-preview-descriptors">${review.descriptorLabels.map((label) => escapeHtml(label)).join(' · ')}</p>` : ''}${properties ? `<dl>${properties}</dl>` : ''}</section>`;
}

function renderPreviewPlay(preview, itemLimit, locale) {
  const player = preview.player || {};
  const image = normalizePreviewImage(player.image);
  const playerStyle = image ? ` style="--seo-preview-player-image: url('${escapeHtml(image)}')"` : '';
  const playerMeta = [player.version].map((value) => markdownToPlainText(value)).filter(Boolean);
  const sections = renderPreviewSections(preview.sections, itemLimit, locale);
  const body = renderPreviewMarkdown(preview.content ?? preview.body);
  const reviewMarkup = renderPreviewReview(preview.review);
  const relatedMarkup = preview.related ? `<section class="seo-preview-info-card"><p class="seo-preview-eyebrow">${escapeHtml(preview.related.heading || '')}</p>${renderPreviewItems(preview.related.items, itemLimit, { kind: 'article', locale })}</section>` : '';
  const railMarkup = `${renderPreviewGameInfo(player)}${reviewMarkup}${relatedMarkup}`;
  const contentMeta = [player.developer, player.version].map((value) => markdownToPlainText(value)).filter(Boolean);
  const descriptionHeading = player.descriptionLabel || 'DESCRIPTION';
  const description = body ? '' : markdownToPlainText(preview.summary);
  return `<section class="seo-preview-player"${playerStyle}><div class="seo-preview-player-bar"><a href="${escapeHtml(normalizePreviewHref(player.backHref || localizedPath('/arcade', locale)) || localizedPath('/arcade', locale))}">←</a>${renderPreviewBrand(localizedPath('/', locale), 'seo-preview-player-brand')}<span class="seo-preview-player-divider"></span><strong>${escapeHtml(markdownToPlainText(player.title || preview.title))}</strong><span class="seo-preview-player-meta">${escapeHtml(playerMeta.join(' · '))}</span></div><div class="seo-preview-player-stage"><div class="seo-preview-player-placeholder"><span>WEBGL</span><p>${escapeHtml(player.placeholder || 'Playable in your browser')}</p></div></div></section><main class="seo-preview-main seo-preview-main--play"><div class="seo-preview-play-layout${railMarkup ? '' : ' seo-preview-play-layout--solo'}"><article class="seo-preview-play-content">${renderPreviewNotice(preview.notice)}<header><h1>${escapeHtml(markdownToPlainText(preview.title))}</h1>${contentMeta.length ? `<div class="seo-preview-play-meta">${contentMeta.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>` : ''}<h2 class="seo-preview-play-description-heading">${escapeHtml(descriptionHeading)}</h2>${description ? `<p class="seo-preview-play-summary">${escapeHtml(description)}</p>` : ''}</header>${body ? `<div class="seo-preview-markdown">${body}</div>` : ''}${sections}</article>${railMarkup ? `<aside class="seo-preview-play-rail">${railMarkup}</aside>` : ''}</div></main>`;
}

export function renderSeoPreview({ title, summary = '', body = '', items = [], sections = [], notice = null, locale = 'ko', maxItems = 12, layout = 'document', hero = null, page = null, article = null, sidebar = null, player = null, review = null, related = null, content = null, footerVariant = null, backHref = '', backLabel = '' } = {}) {
  const itemLimit = normalizePreviewItemLimit(maxItems);
  const localizedCopy = copy[locale] || copy.ko;
  const resolvedLayout = previewClassToken(layout, 'document');
  const preview = { title, summary, body, content, items, sections, notice, layout: resolvedLayout, hero, page, article, sidebar, player, review, related, backHref, backLabel };
  const pageMarkup = resolvedLayout === 'landing'
    ? `${renderPreviewHero(hero, title, summary, locale)}<main class="seo-preview-main seo-preview-main--landing"><article class="seo-preview-landing-content">${renderPreviewNotice(notice)}${renderPreviewSections(sections, itemLimit, locale) || renderPreviewItems(items, itemLimit, { kind: 'list', locale })}</article></main>`
    : resolvedLayout === 'article' || resolvedLayout === 'privacy'
      ? renderPreviewArticle(preview, itemLimit, locale)
      : resolvedLayout === 'play'
        ? renderPreviewPlay(preview, itemLimit, locale)
        : renderPreviewListing(preview, localizedCopy, itemLimit, locale);
  const resolvedFooterVariant = footerVariant || (resolvedLayout === 'landing' ? 'landing' : resolvedLayout === 'play' ? 'slim' : 'full');
  return `<div id="seo-preview" class="seo-preview seo-preview--${escapeHtml(resolvedLayout)}" data-layout="${escapeHtml(resolvedLayout)}">${renderPreviewNav(locale, localizedCopy)}${pageMarkup}${renderPreviewFooter(locale, localizedCopy, resolvedFooterVariant)}</div>`;
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
