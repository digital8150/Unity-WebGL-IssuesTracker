# Progress

Compact project snapshot. Keep this file short; use git history and source/docs for
implementation details. Entries are written in English for agent readability.

## Current snapshot — 2026-08-02

- Product: **BCSDLab. Arcade**, a multi-tenant Unity WebGL hosting and issue-tracking platform.
- Workspaces: `server/` (Express + Mongoose API), `web/` (Vite + React), `unity/` (drop-in C# + WebGL bridge).
- Public flow: `/arcade` → `/play/:gameSlug[/:buildId]` → `/report/:gameSlug[/:buildId]`.
- Dashboard flow: approved developer accounts manage games, builds, reports, settings, collaborators, and articles.

## Delivered capabilities

- Auth: JWT, GitHub/Discord OAuth, approved/pending/rejected lifecycle, admin user management, collaborators.
- Builds: per-game/version uploads for Unity loader/data/framework/wasm plus optional `StreamingAssets` zip; local server storage and dynamic public serving.
- Issues: public ingestion with `gameId`/`buildId`, Unity/browser snapshots, triage status/priority/tags, votes, comments, ownership scoping, and per-game Discord webhook with env fallback.
- Game pages: public/private arcade visibility, thumbnails, responsive WebGL play view, fullscreen, report flow, review information, GRAC rating/content marks, and game articles.
- Articles/blog: sanitized Markdown, public detail/list pages, admin editor, comments, image upload up to 10 MB, GIF-to-MP4 conversion, and per-game article CMS.
- Server integration: per-game HMAC session bridge, multiple top-N leaderboards, JSON config, score bounds, replay protection, generated Unity bridge code.
- SEO: server-rendered public home/Arcade/blog/game pages, canonical/OG/Twitter metadata, JSON-LD, robots, sitemap, and published game-article URLs.
- UX/runtime: dark theme, shared settings dirty-save protection, Growl Unity errors, GRAC local assets, and extension-resistant Unity keyboard capture diagnostics.

## Latest changes

- Hidden the entire public game-article section when a game has no published articles; loading and empty-state copy no longer occupy page space.
- Condensed this file from the previous session-by-session history; detailed history remains in git commits.

## Verification baseline

- `cd web; npm run build`
- `node --check` for changed server modules
- `git diff --check`
- Temporary MongoDB/API flows have covered build upload/serving, article CRUD/public visibility, review-info visibility, and server-backend security paths.

## Open / TODO

- Add automated tests: Vitest for `web/`, `node --test` for `server/`.
- Add production rate limiting for `POST /api/issues` and server-side upload type validation.
- Run a full E2E test with a real Unity WebGL build; `unity/` is intentionally not a standalone Unity project.
- Replace in-memory HMAC nonce/rate-limit state if deployment becomes multi-instance (Redis or Mongo TTL storage).
- Submit/monitor the production sitemap in Google Search Console and complete pending visual review/PR follow-up.

## Durable decisions

- Builds are resolved by `gameId`/`buildId`; never hard-code a copied `web/public/unity/Build` path.
- URL shape is `/play/:gameSlug` for the active build and `/play/:gameSlug/:buildId` for a specific build.
- Build storage is local filesystem for now; S3/object storage is deferred.
- Discord uses the per-game webhook when present, otherwise `DISCORD_WEBHOOK_URL`; missing configuration is a no-op.
- Unity custom state stays opaque/schemaless; the hand-rolled C# JSON writer is retained.
- Server-backend leaderboards are named per game, HMAC-protected, and top-N bounded; current nonce/rate-limit state assumes one process.

## 2026-08-10

- Replaced public home, arcade catalogue, article list, and play layouts with the Arcade redesign; added responsive dark-theme token usage.
- Added shared public nav, game card/artwork fallback, expanded footer, and play-page slim footer; removed unused landing mockups and ParticleCanvas.
- Added server-side blog `q` filtering with escaped case-insensitive title/summary matching and threaded it through the web API.
- Preserved Unity report bridge, canvas sizing, play SEO/JSON-LD, and all six GRAC review detail fields; omitted mockup-only genre/category/status/club links.
- Verification: `npm run build`, `node --check src/routes/blog.js`, and `git diff --check` passed; redesign CSS has no direct hex color literals.

## 2026-08-10 (public navigation and game articles)

- Removed the duplicate landing hero game-info CTA; kept the direct play CTA only.
- Reduced the full footer developer links to the dashboard entry; removed build/report and access-request duplicates.
- Added `/play/:gameSlug/articles` for game-scoped article lists; play-page updates now link there while `/blog` remains site-wide.
- Added SSR metadata/JSON-LD/sitemap coverage for game article lists; aligned home SSR copy and client canonical handling for blog pagination.
- Verification: `npm run build`, SEO render assertions, route/link assertions, `node --check` for SEO modules, and `git diff --check` passed.

## 2026-08-10 (public navigation cleanup)

- Unified home, Arcade, blog list, and blog detail on the reusable `PublicNav`; only the active item emphasis differs.
- Removed public-nav login, access-request, dashboard, and home-only all-games entry points; footer remains the developer dashboard entry.
- Changed the public article label to Blog/블로그 and made Games/게임 always link to `/arcade`.
- Removed duplicate auth actions from the report-page public nav as well.
- Verification: `npm run build` and `git diff --check` passed; no removed public-nav props/classes or auth links remain.

## 2026-08-10 (fullscreen Escape handling)

- Restored Chrome/Edge keyboard-lock timing for the play-page fullscreen control by locking `Escape` from `fullscreenchange` instead of immediately after `requestFullscreen()`.
- Unlock the keyboard on fullscreen exit and component cleanup so short `Escape` reaches the Unity game while a long press remains the browser escape hatch.

## 2026-08-10 (hero texture and shell loading polish)

- Removed the landing featured-hero diagonal texture; kept the existing darkening scrim unchanged.
- Added a first-paint shell skeleton, hidden SEO prerender container, and reduced-motion-aware app fade-in.
- Kept landing, Arcade, and Blog page data-loading states unchanged because each already renders a loading state.
- Verification: web build, SEO shell injection smoke assertions, server `node --check`, and `git diff --check` passed; no existing SEO assertion scripts were found under `server/`.

## 2026-08-10 (SEO guard tests, /privacy indexing, theme flash fix)

- Added the first server test suite: `npm test` in `server/` runs `node --test`.
  - `seo-route-coverage.test.js` — fails when a public route in `App.jsx` has no `seo.js` handler, when `seo.js` renders a route the client dropped, when a server-rendered route is also `Disallow`ed in robots.txt, when a static public route is missing from `sitemap.xml`, or when the shell stops defaulting to `noindex`. robots.txt `Disallow` rules are the single source of truth for "private".
  - `seo-inject.test.js` — asserts `injectSeoHtml` behaviour (not implementation) against the real shell, so an `index.html` edit that breaks the injection anchor fails loudly instead of silently serving an empty shell to crawlers.
  - `seo-privacy.test.js` — keeps `PRIVACY_POLICY_DATES` in sync with `web/src/data/privacyPolicyVersions.jsx`.
- `/privacy` and `/privacy/:date` are now server-rendered. The current revision is `index,follow` and listed in `sitemap.xml`; superseded revisions are `noindex,follow`, self-canonical, and link back to `/privacy`. Unknown dates fall through to `next()` rather than rendering.
- Fixed a theme flash: `ThemeProvider` only set `data-theme` in an effect, so the shell painted with the OS preference before snapping to the saved choice. An inline pre-paint script in `index.html` now resolves the theme, and the skeleton keys off `[data-theme]` instead of `prefers-color-scheme`.
- Confirmed in production that SSR is healthy (`/`, `/arcade`, `/blog` all return `index,follow` with JSON-LD and body text; sitemap lists 14 URLs). Slow indexing is domain age/authority, not markup.
- Verification: `cd web; npm run build`, `cd server; npm test` (20 passing), `node --check` on changed server modules, `git diff --check`, plus an injection check against the built `dist/index.html`.

## 2026-08-10 (route-aware shell skeletons)

- The first-paint skeleton now has three variants selected at runtime: `auth` (`/login`, `/register`, `/consent`, `/pending`, `/auth/callback`), `dash` (`/dashboard*`, `/admin/*`), and `public` (everything else, unchanged). Previously every route flashed the landing hero + card grid.
- Selection happens in the existing pre-paint inline script, which sets `data-shell` on `<html>`; the inline CSS reveals exactly one variant. Route classification runs before any `localStorage` access so blocked storage cannot also cost the correct variant, and it degrades to `public` on error.
- Trailing slashes are normalised (`/login/` matches `/login`, as React Router does). Segment-boundary matching keeps `/dashboardish` on the public variant.
- Shell cost: `dist/index.html` grew 767 B → 4.8 KB gzipped of render-blocking content.
- Verification: `npm run build`, `npm test` (20 passing), `git diff --check`, and a harness that extracts the shipped inline script and runs it against 13 paths plus trailing-slash/casing/blocked-storage edge cases.

## 2026-08-10 (PR preparation)

- Revalidated the SEO shell, privacy SSR, and route-coverage changes before commit.
- Verification: `server/npm test` (20 passing), `web/npm run build`, and `git diff --check`.

## 2026-08-10 (production SEO audit)

- Production `sitemap.xml` exposes 15 URLs; all return HTTP 200.
- 14 sitemap URLs return page-specific SSR `<main>` content, H1, canonical/OG metadata, and valid JSON-LD.
- Production `/privacy` is an exception: shell-only HTML with no H1/body/JSON-LD, `noindex,follow`, and home canonical while listed in the sitemap; redeploy/fix is pending.
- `/blog/what-is-webgl-pros-and-cons` has a 201-character meta description; consider shortening it for search snippets.
- Browser DOM/visual inspection was unavailable because no browser instance was connected; audit used direct production HTTP responses.

## 2026-08-10 (sitemap lastmod fix, /privacy root cause)

- `sitemap.xml` article-list entries (`/play/:gameSlug/articles`) took `lastmod` from `Game.updatedAt`; now derived from the newest `updatedAt || publishedAt` across that game's published articles. URL shape, slug lookup, and `null` fallback unchanged; no extra query.
- Production `/privacy` shell-only regression is **not** a deploy failure: the privacy SSR handler lives only in `67075f6` on `feat/polish-hero-and-ssr-flash`, never merged to `main`. The sitemap entry shipped earlier via `a409d6d` (on `main`), so the sitemap advertises a route production cannot render. Fix is to merge the branch and redeploy.
- Verification: `node --check src/routes/seo.js`, `cd server; npm test` (20 passing), `git diff --check`.

## 2026-08-10 (public-route SSR data bootstrap)

- Added independent robots patch commit `5d2ad08`: crawlers may read public blog, arcade, and game-play APIs; admin blog paths remain blocked by a longer rule.
- Added `__SSR_DATA__` JSON bootstrap injection with route-key + URL validation and one-time client consumption; `<` is escaped before script insertion.
- Bootstrapped `/blog/:slug`, `/arcade`, `/blog`, both game-article routes, and both play routes from existing SEO queries; public payloads whitelist fields and exclude email/admin/backend/build-storage data.
- Removed hidden `#seo-prerender` injection/CSS and server-side Markdown prerendering; kept the GRAC renderer for legal-notice compatibility. Removed unused server `marked`/`sanitize-html` dependencies and prerender-only media detection.
- Added route HTML bootstrap contract, sensitive-field, injection, and client-reader tests. Commit: `4e0f003`.
- Verification: `cd server; npm test` (33 passing), server `node --check`, `cd web; npm run build`, and `git diff --check` passed.
- Manual JS-on/API-blocked browser verification is pending because no browser session was available in this environment; run it before deployment, then verify rendered content in GSC.

## 2026-08-10 (visible SEO preview follow-up)

- Restored a small visible `#seo-preview` inside `#root` for every public SEO response: H1, summary, plain-text body/list content; no `aria-hidden`, transparent color, or hidden media.
- Kept `__SSR_DATA__` unchanged and made the preview replace the inline shell skeleton until `createRoot` mounts; server preview uses plain-text Markdown cleanup, not a second Markdown HTML renderer.
- Added route/injection assertions that raw public HTML contains non-empty visible text; server tests: 34 passing; web build passed.

## 2026-08-10 (hybrid SPA page transitions)

- Added React Router `viewTransition` navigation through `PageLink` and `usePageNavigate`, with hover/focus lazy-chunk prefetching and a non-null Suspense loading shell.
- Added keyed route enter fallback (`125ms` crossfade; blog/auth `8px` directional enter), native View Transitions root styling, and reduced-motion gates.
- Added slug-scoped game artwork shared-element names for landing/Arcade sources and PlayPage canvas/loading destinations; only the active card/hero source is named.
- Replaced internal SPA links across public, dashboard, admin, auth, article, report, and play surfaces with the transition-aware link wrapper.
- Verification: `cd web; npm run build` passed; reduced-motion/shared-name/link grep checks and `git diff --check` passed.

## 2026-08-10 (data-router view-transition fix)

- Lifted the complete route table into `createBrowserRouter` child data routes; kept the path order, catch-all redirect, protected-route props, and providers above `RouterProvider`.
- Replaced page-level `React.lazy`/Suspense routing with route-level `lazy`; centralized dynamic imports for router loading and hover/focus prefetch, preserving page chunks.
- Fallback CSS now keys off React Router's actual view-transition state, not feature detection; public routes use 240/150 ms timing with a 28 px directional slide, internal dashboard/admin routes use 125/90 ms.
- Verification: `cd web; npm run build` passed with separate Play/GameDetail/AdminBlogEditor/BlogPost and other page chunks; `git diff --check` passed. Entry bundle 304.40 kB -> 301.73 kB (no splitting regression).
- Browser-measured confirmation (Chrome, dev server): patched `document.startViewTransition` to count calls. Before the fix a `PageLink` navigation gave `calls: 0` — VT never fired, and the CSS fallback was simultaneously disabled by the `html:not(.supports-view-transitions)` gate, so zero transition ran. After the fix `/` -> `/blog` and `/blog` -> `/dashboard` (redirected to `/login`) gave `calls: 2, finished: 2, errors: []`.
- Root cause for the record: the route table lived in a **descendant** `<Routes>`, so `RouteContext.isDataRoute` was false and `useNavigate()` resolved to `useNavigateUnstable`, which calls `navigator.push` and silently drops the `viewTransition` option before it reaches `router.navigate`.
- Shared-element morph measured on both sources: landing `.l-featured-art` and Arcade `.game-card-media` each carried exactly one `game-art-<slug>` name at capture, destination `.play-canvas-frame` carried the match, `duplicateNames: []`, `finished: 1`.
## 2026-08-10 (landing loading-state cleanup)

- Replaced LandingPage's intermediate "게임을 불러오는 중" screen with skeletons that continue the inline `#app-shell-skeleton` from `index.html`: hero bars inside the real `.l-featured-inner`/`.l-hero-copy` boxes, and three 16/9 card skeletons in the real `.l-games-grid`. First paint now reads as skeleton -> content.
- The removed text was the only loading cue for assistive tech, so the skeletons carry `aria-busy` + `aria-label={t.arcade.loading}` and the bars are `aria-hidden`.
- Dropped the now-dead `.l-hero-loading` rule and the `.l-games-state` selector; `.l-featured-empty` stays (still used by the no-featured-game state).
- Verification: `npm run build` passed; `git diff --check` clean. Browser-measured with a 20s fetch stall: hero skeleton present, 3 card skeletons, 11 bars, hero height 590px (matches the loaded hero, so no layout shift), and "게임을 불러오는 중" no longer in visible text — only in `aria-label`.
- SEO regression check for the data-router refactor: `server/` untouched; every path the SEO router serves (`/`, `/privacy`, `/privacy/:date`, `/arcade`, `/blog`, `/blog/:slug`, `/play/:gameSlug/articles`, `/play/:gameSlug/articles/:articleSlug`, `/play/:gameSlug`, `/play/:gameSlug/:buildId`) still exists client-side with the same pattern; `readSsrData` call sites unchanged.
- Measured cold load of `/arcade` frame-by-frame: inline skeleton 136-225 ms, a 2 ms textless frame at mount, content from 244 ms — `trulyBlankTotalMs: 0`, so route-level `lazy` did not introduce a blank-screen gap. Caveat: measured against a warm local dev server; there is no root `HydrateFallback`, so a cold cache on a slow network could still expose a gap between `createRoot` clearing `#root` and the route chunk resolving.
- Still open: the "최근 아티클" section still renders a plain `{t.blog.loading}` text line (`LandingPage.jsx:251`) while everything around it is a skeleton.

## 2026-08-10 (SEO default copy)

- Replaced legacy bug-report/tester wording in default, home, and Arcade metadata with the approved BCSDLab. Game Track web-game description.
- Aligned `web/index.html`, client metadata fallbacks, server SSR constants/Arcade JSON-LD, and Korean/English home/Arcade copy.
- Verification: `web/npm run build`, `git diff --check`, and relevant SEO bootstrap tests passed; `server/npm test` has 31 passing and 3 pre-existing `seo-route-coverage` parser failures because the test still expects `<Route>` while `App.jsx` uses `createBrowserRouter`.

## 2026-08-10 (SEO route coverage test update)

- Updated `seo-route-coverage.test.js` to read the current `main.jsx` data-router route table (`pageRoute`, `protectedPageRoute`, and literal route entries) instead of the removed `<Route>` syntax in `App.jsx`.
- Verification: `server/npm test` passes all 34 tests; `git diff --check` passed.

## 2026-08-11 (production Apache: /privacy SSR routing fix)

- **Correction to the 2026-08-10 entry**: `/privacy` serving a shell-only page in production was **not** an unmerged-branch problem. Production Node (`main`, `17d885f`) serves `/privacy` correctly — verified by `curl http://127.0.0.1:4000/privacy` on the host: title `개인정보처리방침`, `index,follow`, self-canonical, full JSON-LD. The real cause was that `arcade.codingbot.kr.conf` had **no Apache rule routing `/privacy` to Express**, so it fell through to `FallbackResource /index.html` (the noindex shell with a home-page canonical) while `sitemap.xml` advertised it for crawling.
- Fix applied to production `/etc/apache2/sites-available/arcade.codingbot.kr.conf`:
  `RewriteRule ^/?privacy(/.*)?$ http://127.0.0.1:4000/privacy$1 [P,L]`, inserted after the `sitemap.xml` rule. Backup at `arcade.codingbot.kr.conf.bak-privacyfix-20260810172257`. `apache2ctl configtest` -> Syntax OK, `systemctl reload apache2` (graceful).
- Verified after reload: `/privacy` -> `index,follow` + canonical `https://arcade.codingbot.kr/privacy` + WebPage/WebSite/Organization JSON-LD; `/privacy/2026-07-08` canonicalises to `/privacy`; `/`, `/arcade`, `/blog`, `/play/project-adventure`, `/robots.txt`, `/sitemap.xml`, `/health`, `/login`, `/dashboard`, `/admin/users` all still 200.
- **Behaviour change**: an unknown revision date (e.g. `/privacy/1999-01-01`) now returns 404 instead of the 200 SPA shell, because Express `next()`s and nothing follows it. This is the better answer — the old 200 was a soft-404 that let crawlers index arbitrary fake revision URLs — but it was not an intended part of the fix.
- `/en` Apache rules deliberately **not** added yet: production Node returns 404 for `/en` until the translation branch ships, and adding them early only widens the risk surface.

## 2026-08-11 (production deploy-readiness state)

- Production `SiteSettings` document does not exist, so `getPolicy()` fails closed (`publishEnabled: false`, `enabled: false`). Deploying the translation branch is therefore safe on its own: `/en` stays `noindex`, emits no hreflang, and is absent from `sitemap.xml`; the worker does not drain. English exposure requires an admin to flip the toggle in `/admin/translations`.
- Production data at time of check: 0 `translations` rows, 2 published blog posts, 6 public games.
- Still open: `/en` Apache routing (must proxy **without stripping the prefix** — a stripped prefix loses `/en` from `req.originalUrl`, which makes `readSsrData` reject the bootstrap and silently degrade every `/en` page to a client fetch with no error anywhere).
## 2026-08-11 (profile and landing carousel)

- Updated local `main` to `origin/main` at `494e52f`, created `feat/profile-and-landing-carousel`, and restored the in-progress work onto it.
- Added `/dashboard/profile` with a dashboard My Page, account summary, and editable display name; added authenticated `PATCH /api/auth/me` with trimmed/length-checked `User.name` validation.
- Reworked the landing updated-game carousel into bottom-left dot navigation with an `UPDATED` label, 6.5-second auto-advance, pause-on-hover/focus, reduced-motion handling, slide entrance animation, and a left-only scrim that fades to transparent over the right-side artwork.
- Added English/Korean copy and route prefetch coverage for the profile page.
- Verification: `web/npm run build`, `server/npm test` (77 passing), `node --check src/routes/auth.js`, and `git diff --check` passed.

## 2026-08-11 (isolated PR previews)

- Added an isolated preview deployment design: each open same-repository PR gets `pr-<number>.preview.codingbot.kr` with a fresh production Mongo snapshot, copied build/media storage, disposable Mongo/app/gateway containers, and Apache Basic Auth/TLS.
- Preview sanitization removes user credentials/OAuth IDs, Discord/Gemini secrets, and game backend secrets; preview writes stay inside the disposable copy and redeploys refresh from production.
- Added preview-only dashboard sign-in, opt-in static serving for the app container, trusted `previewctl.sh`, fixed Docker assets, and the `PR Preview` workflow for CI success/PR close lifecycle.
- Installed the root-owned controller and `*.preview.codingbot.kr` Let’s Encrypt certificate on the remote host; verified a live `pr-23` preview returns 401 without Basic Auth, 200 with it, and serves production-snapshot arcade data.
- Verification: `server/npm test` (77 passing), `web/npm run build`, Node/Bash/YAML syntax checks, and live TLS/Apache/container smoke checks.

## 2026-08-11 (PR23 preview follow-up)

- Merged PR24 into `main`, merged `main` into PR23, and resolved the only conflict in `progress.md`; feature code merged cleanly.
- Rebuilt PR23 from the synchronized branch: React assets return 200, API data returns 200, and preview dashboard login redirects through `/auth/callback`.
- Fixed preview-comment shell quoting so generated credentials are not interpreted as commands; CI remains green.

## 2026-08-11 (preview access simplification)

- Removed Apache HTTP Basic Auth from PR previews; HTTPS URL access is direct, while dashboard sign-in remains preview-token based.
- Stopped publishing preview passwords or tokens as credentials in public PR comments; comments now contain only the preview URL and dashboard link.
- Merged the access/workflow fix as PR25 and verified the PR23 workflow through successful deploy and comment steps.
