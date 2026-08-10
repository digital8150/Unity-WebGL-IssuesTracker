import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { isVideoMediaUrl } from './blogMedia.js';

export const SITE_NAME = 'BCSDLab. Arcade';
export const DEFAULT_DESCRIPTION = '브라우저에서 바로 플레이하고, 버그·제안을 제출하세요.';
export const HOME_TITLE = 'Unity WebGL 게임과 버그 리포트 — BCSDLab. Arcade';
export const HOME_DESCRIPTION = 'Unity WebGL 게임을 브라우저에서 플레이하고 세션 스냅샷과 함께 테스터 버그 리포트를 수집하세요.';
export const DEFAULT_IMAGE_PATH = '/bcsd_main_page_image.webp';

marked.setOptions({ breaks: true, gfm: true });

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

function renderPublicBlogMedia(value, alt, siteOrigin, dimensions = '') {
  const src = publicImageUrl(value, siteOrigin);
  const escapedSrc = escapeHtml(src);
  const escapedAlt = escapeHtml(alt);

  if (isVideoMediaUrl(src)) {
    return `<video autoplay loop muted playsinline preload="metadata" aria-label="${escapedAlt}"${dimensions}><source src="${escapedSrc}" type="video/mp4" /></video>`;
  }

  return `<img src="${escapedSrc}" alt="${escapedAlt}"${dimensions} />`;
}

export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
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

export function getGameReviewSeoData(reviewInfo) {
  if (!reviewInfo?.enabled) {
    return { ratingLabel: '', descriptorLabels: [], additionalProperty: [] };
  }

  const ratingLabel = GAME_RATING_LABELS[reviewInfo.rating] || '';
  const descriptorLabels = (reviewInfo.contentDescriptors || [])
    .map((key) => GAME_DESCRIPTOR_LABELS[key])
    .filter(Boolean);
  const details = [
    [GAME_REVIEW_FIELD_LABELS.title, reviewInfo.title],
    [GAME_REVIEW_FIELD_LABELS.businessName, reviewInfo.businessName],
    [GAME_REVIEW_FIELD_LABELS.rating, ratingLabel],
    [GAME_REVIEW_FIELD_LABELS.classificationNumber, reviewInfo.classificationNumber],
    [GAME_REVIEW_FIELD_LABELS.classificationDate, formatDate(reviewInfo.classificationDate)],
    [GAME_REVIEW_FIELD_LABELS.developerReportNumber, reviewInfo.developerReportNumber],
  ];

  return {
    ratingLabel,
    descriptorLabels,
    additionalProperty: details
      .filter(([, value]) => value)
      .map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) })),
  };
}

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

export function renderGameArticlesContent(game, articles, siteOrigin) {
  if (!articles?.length) return '';

  const cards = articles.map((article) => {
    const href = `/play/${game.slug}/articles/${article.slug}`;
    const image = article.coverImageUrl
      ? renderPublicBlogMedia(article.coverImageUrl, article.title, siteOrigin, ' width="640" height="360"')
      : '';
    const date = formatDate(article.publishedAt || article.createdAt);
    return `<article><a href="${escapeHtml(href)}">${image}<h3>${escapeHtml(article.title)}</h3></a>${article.summary ? `<p>${escapeHtml(article.summary)}</p>` : ''}${date ? `<time datetime="${escapeHtml(new Date(article.publishedAt || article.createdAt).toISOString())}">${escapeHtml(date)}</time>` : ''}</article>`;
  }).join('');

  return `<section aria-labelledby="game-articles-title"><h2 id="game-articles-title">\uac8c\uc784 \uc5c5\ub370\uc774\ud2b8 \ubc0f \uc544\ud2f0\ud074</h2><p><a href="/play/${escapeHtml(game.slug)}/articles">\uac8c\uc784 \uc544\ud2f0\ud074 \uc804\uccb4 \ubcf4\uae30</a></p>${cards}</section>`;
}

export function renderGameArticleListContent(game, articles, siteOrigin) {
  const description = game.description || '\uac8c\uc784\uc758 \ud328\uce58\ub178\ud2b8, \uac1c\ubc1c \uc5c5\ub370\uc774\ud2b8\uc640 \uc18c\uc2dd\uc744 \ud655\uc778\ud574 \ubcf4\uc138\uc694.';
  const listing = articles?.length
    ? renderGameArticlesContent(game, articles, siteOrigin)
    : '<section aria-labelledby="game-articles-title"><h2 id="game-articles-title">\uac8c\uc784 \uc5c5\ub370\uc774\ud2b8 \ubc0f \uc544\ud2f0\ud074</h2><p>\uc544\uc9c1 \uacf5\uac1c\ub41c \uac8c\uc784 \uc544\ud2f0\ud074\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p></section>';
  return `${navHtml()}<main><article><nav aria-label="\uc774\ub3d9 \uacbd\ub85c"><a href="/play/${escapeHtml(game.slug)}">${escapeHtml(game.name)}</a> / \uc544\ud2f0\ud074</nav><header><p>GAME ARTICLES</p><h1>${escapeHtml(game.name)}</h1><p>${escapeHtml(description)}</p></header>${listing}</article></main>${footerHtml()}`;
}

export function renderMarkdown(markdown) {
  const renderer = new marked.Renderer();
  const defaultRenderer = new marked.Renderer();
  renderer.image = function image(token) {
    if (!isVideoMediaUrl(token.href)) return defaultRenderer.image.call(this, token);

    return `<video autoplay loop muted playsinline preload="metadata" aria-label="${escapeHtml(token.text || 'Animated image')}"><source src="${escapeHtml(token.href)}" type="video/mp4" /></video>`;
  };

  const rendered = marked.parse(markdown || '', { renderer });
  return sanitizeHtml(rendered, {
    allowedTags: [
      'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
      'hr', 'img', 'li', 'ol', 'p', 'pre', 'source', 'strong', 'table', 'tbody',
      'td', 'th', 'thead', 'tr', 'ul', 'video',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      code: ['class'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      source: ['src', 'type'],
      video: ['aria-label', 'autoplay', 'height', 'loop', 'muted', 'playsinline', 'preload', 'role', 'width'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      source: ['http', 'https'],
      video: ['http', 'https'],
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
  });
}

function navHtml() {
  return `<nav aria-label="주요 메뉴"><a href="/">BCSDLab. Arcade</a> · <a href="/arcade">아케이드</a> · <a href="/blog">블로그</a></nav>`;
}

function footerHtml() {
  return '<footer><p>BCSDLab. Arcade · Unity WebGL 게임 배포와 테스터 피드백 플랫폼</p></footer>';
}

export function renderHomeContent() {
  return `${navHtml()}<main>
    <header><p>BCSDLAB. ARCADE</p><h1>Unity WebGL 게임을 브라우저에서 바로 플레이하세요</h1><p>${HOME_DESCRIPTION}</p><p><a href="/arcade">전체 게임 보기</a> · <a href="/blog">사이트 아티클 읽기</a></p></header>
    <section aria-labelledby="games-title"><h2 id="games-title">공개 게임을 바로 플레이</h2><p>Game Track이 공개한 게임을 다운로드 없이 브라우저에서 실행하고, 플레이 페이지에서 버그와 제안을 제출할 수 있습니다.</p><p><a href="/arcade">아케이드 둘러보기</a></p></section>
    <section aria-labelledby="flow-title"><h2 id="flow-title">플레이부터 피드백까지</h2><ol><li>공개 게임의 플레이 URL을 엽니다.</li><li>브라우저에서 Unity WebGL 게임을 플레이합니다.</li><li>플레이 페이지에서 버그 또는 제안을 제출합니다.</li><li>게임별 대시보드에서 리포트를 확인합니다.</li></ol></section>
  </main>${footerHtml()}`;
}

export function renderArcadeContent(games, siteOrigin) {
  const cards = games.length
    ? games.map((game) => {
      const image = game.thumbnailUrl
        ? `<img src="${escapeHtml(publicImageUrl(game.thumbnailUrl, siteOrigin))}" alt="${escapeHtml(game.name)} 게임 썸네일" />`
        : '';
      return `<article><a href="/play/${escapeHtml(game.slug)}">${image}<h2>${escapeHtml(game.name)}</h2></a>${game.developerName ? `<p>개발자: ${escapeHtml(game.developerName)}</p>` : ''}${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}${game.latestBuildVersion ? `<p>버전 ${escapeHtml(game.latestBuildVersion)}</p>` : ''}<p><a href="/play/${escapeHtml(game.slug)}">게임 플레이</a></p></article>`;
    }).join('')
    : '<p>아직 공개된 게임이 없습니다.</p>';

  return `${navHtml()}<main><header><p>PUBLIC GAME GALLERY</p><h1>BCSDLab. Arcade</h1><p>Game 트랙이 공개한 Unity WebGL 게임을 브라우저에서 바로 플레이하세요.</p></header><section aria-label="공개 게임 목록">${cards}</section></main>${footerHtml()}`;
}

export function renderBlogListContent(posts, page, pages, siteOrigin) {
  const cards = posts.length
    ? posts.map((post) => {
      const image = post.coverImageUrl
        ? renderPublicBlogMedia(post.coverImageUrl, `${post.title} 커버 이미지`, siteOrigin)
        : '';
      const date = formatDate(post.publishedAt || post.createdAt);
      return `<article>${image}<p>${post.tags?.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(' ') || ''}</p><h2><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ''}<p>${escapeHtml(date)}${post.author?.name ? ` · ${escapeHtml(post.author.name)}` : ''}</p><a href="/blog/${escapeHtml(post.slug)}">글 읽기</a></article>`;
    }).join('')
    : '<p>아직 공개된 글이 없습니다.</p>';
  const pagination = pages > 1
    ? `<nav aria-label="블로그 페이지"><p>페이지 ${page} / ${pages}</p>${page > 1 ? `<a href="/blog?page=${page - 1}">이전</a>` : ''} ${page < pages ? `<a href="/blog?page=${page + 1}">다음</a>` : ''}</nav>`
    : '';

  return `${navHtml()}<main><header><p>TECHNICAL BLOG</p><h1>블로그</h1><p>BCSDLab. Game Track의 개발 일지, 업데이트와 Unity WebGL 아티클입니다.</p></header><section aria-label="블로그 글 목록">${cards}</section>${pagination}</main>${footerHtml()}`;
}

export function renderBlogPostContent(post, siteOrigin) {
  const image = post.coverImageUrl
    ? renderPublicBlogMedia(post.coverImageUrl, `${post.title} 커버 이미지`, siteOrigin)
    : '';
  const date = formatDate(post.publishedAt || post.createdAt);
  const tags = post.tags?.length ? `<p>${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(' ')}</p>` : '';
  return `${navHtml()}<main><article><nav aria-label="이동 경로"><a href="/blog">블로그</a> / ${escapeHtml(post.title)}</nav>${image}<header>${tags}<h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(date)}${post.author?.name ? ` · ${escapeHtml(post.author.name)}` : ''}</p>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ''}</header><div class="markdown-body">${renderMarkdown(post.content)}</div></article></main>${footerHtml()}`;
}

export function renderGameArticleContent(post, game, siteOrigin) {
  const image = post.coverImageUrl
    ? renderPublicBlogMedia(post.coverImageUrl, `${post.title} 커버 이미지`, siteOrigin)
    : '';
  const date = formatDate(post.publishedAt || post.createdAt);
  const tags = post.tags?.length ? `<p>${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(' ')}</p>` : '';
  const gameHref = `/play/${game.slug}`;
  return `${navHtml()}<main><article><nav aria-label="이동 경로"><a href="${escapeHtml(gameHref)}">${escapeHtml(game.name)}</a> / ${escapeHtml(post.title)}</nav>${image}<header>${tags}<h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(date)}${post.author?.name ? ` · ${escapeHtml(post.author.name)}` : ''}</p>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ''}</header><div class="markdown-body">${renderMarkdown(post.content)}</div></article></main>${footerHtml()}`;
}

export function renderPlayContent(game, build, siteOrigin, articles = []) {
  const image = game.thumbnailUrl
    ? `<img src="${escapeHtml(publicImageUrl(game.thumbnailUrl, siteOrigin))}" alt="${escapeHtml(game.name)} 게임 썸네일" />`
    : '';
  const reviewContent = renderGameReviewContent(game.reviewInfo, siteOrigin);
  const articlesContent = renderGameArticlesContent(game, articles, siteOrigin);
  return `${navHtml()}<main><article>${image}<header><p>UNITY WEBGL GAME</p><h1>${escapeHtml(game.name)}</h1>${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}<p>${game.ownerId?.name ? `개발자: ${escapeHtml(game.ownerId.name)} · ` : ''}${build.version ? `버전 ${escapeHtml(build.version)}` : ''}</p></header>${reviewContent}<section aria-label="게임 플레이"><h2>브라우저에서 게임 플레이</h2><p>게임을 로드하는 동안 이 페이지의 플레이 영역을 이용할 수 있습니다.</p><p><a href="/report/${escapeHtml(game.slug)}">버그 또는 제안 제출</a></p></section>${articlesContent}</article></main>${footerHtml()}`;
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

export function injectSeoHtml(html, { title, description, image, url, type = 'website', robots = 'index,follow', jsonLd = null, content = '' }) {
  let result = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = replaceMeta(result, 'name', 'description', description);
  result = replaceMeta(result, 'name', 'robots', robots);
  result = replaceMeta(result, 'property', 'og:title', title);
  result = replaceMeta(result, 'property', 'og:description', description);
  result = replaceMeta(result, 'property', 'og:image', image);
  result = replaceMeta(result, 'property', 'og:url', url);
  result = replaceMeta(result, 'property', 'og:type', type);
  result = replaceMeta(result, 'name', 'twitter:title', title);
  result = replaceMeta(result, 'name', 'twitter:description', description);
  result = replaceMeta(result, 'name', 'twitter:image', image);
  result = replaceCanonical(result, url);

  const jsonLdTag = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  result = result.replace('<!-- SEO_JSON_LD -->', jsonLdTag);
  if (content) result = result.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
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
