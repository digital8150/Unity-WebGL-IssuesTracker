import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const SITE_NAME = 'BCSDLab. Arcade';
export const DEFAULT_DESCRIPTION = '브라우저에서 바로 플레이하고, 버그·제안을 제출하세요.';
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

export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

export function renderMarkdown(markdown) {
  const rendered = marked.parse(markdown || '');
  return sanitizeHtml(rendered, {
    allowedTags: [
      'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
      'hr', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td',
      'th', 'thead', 'tr', 'ul',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      code: ['class'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
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
  const features = [
    ['Unity WebGL 배포', 'Unity WebGL 빌드를 업로드하고 별도의 다운로드 없이 브라우저에서 실행하세요.'],
    ['게임 내 버그 리포트', '테스터가 게임을 플레이하면서 F2로 버그와 제안을 바로 제출할 수 있습니다.'],
    ['자동 디버그 스냅샷', 'Unity 로그, 브라우저 환경, WebGL 정보와 게임 상태를 리포트에 함께 저장합니다.'],
    ['협업형 이슈 관리', '상태, 우선순위, 태그, 댓글과 투표로 게임별 이슈를 정리하세요.'],
    ['Discord 알림', '새 리포트를 게임별 Discord webhook으로 전달할 수 있습니다.'],
    ['Arcade 공개 갤러리', '공개한 게임을 Arcade에 등록하고 공유 가능한 플레이 URL을 만드세요.'],
  ];

  return `${navHtml()}<main>
    <header><p>BCSDLab. Game Track</p><h1>게임을 웹에 바로 배포하세요</h1><p>다운로드 없이 Unity WebGL 게임을 플레이하고, 게임 안에서 버그와 제안을 수집하세요.</p><p><a href="/register">가입 신청</a> · <a href="/arcade">아케이드 둘러보기</a></p></header>
    <section aria-labelledby="features-title"><h2 id="features-title">Unity WebGL 워크플로우에 최적화된 기능</h2><ul>${features.map(([title, description]) => `<li><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></li>`).join('')}</ul></section>
    <section aria-labelledby="flow-title"><h2 id="flow-title">Unity 빌드부터 리포트까지</h2><ol><li>게임을 만들고 WebGL 빌드를 업로드합니다.</li><li>테스터에게 플레이 URL을 공유합니다.</li><li>테스터가 F2로 버그를 제출합니다.</li><li>대시보드에서 리포트를 확인하고 처리합니다.</li></ol></section>
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
        ? `<img src="${escapeHtml(publicImageUrl(post.coverImageUrl, siteOrigin))}" alt="${escapeHtml(post.title)} 커버 이미지" />`
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
    ? `<img src="${escapeHtml(publicImageUrl(post.coverImageUrl, siteOrigin))}" alt="${escapeHtml(post.title)} 커버 이미지" />`
    : '';
  const date = formatDate(post.publishedAt || post.createdAt);
  const tags = post.tags?.length ? `<p>${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(' ')}</p>` : '';
  return `${navHtml()}<main><article><nav aria-label="이동 경로"><a href="/blog">블로그</a> / ${escapeHtml(post.title)}</nav>${image}<header>${tags}<h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(date)}${post.author?.name ? ` · ${escapeHtml(post.author.name)}` : ''}</p>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ''}</header><div class="markdown-body">${renderMarkdown(post.content)}</div></article></main>${footerHtml()}`;
}

export function renderPlayContent(game, build, siteOrigin) {
  const image = game.thumbnailUrl
    ? `<img src="${escapeHtml(publicImageUrl(game.thumbnailUrl, siteOrigin))}" alt="${escapeHtml(game.name)} 게임 썸네일" />`
    : '';
  return `${navHtml()}<main><article>${image}<header><p>UNITY WEBGL GAME</p><h1>${escapeHtml(game.name)}</h1>${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}<p>${game.ownerId?.name ? `개발자: ${escapeHtml(game.ownerId.name)} · ` : ''}${build.version ? `버전 ${escapeHtml(build.version)}` : ''}</p></header><section aria-label="게임 플레이"><h2>브라우저에서 게임 플레이</h2><p>게임을 로드하는 동안 이 페이지의 플레이 영역을 이용할 수 있습니다.</p><p><a href="/report/${escapeHtml(game.slug)}">버그 또는 제안 제출</a></p></section></article></main>${footerHtml()}`;
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
