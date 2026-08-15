# Progress

Keep this file short; detailed implementation history remains in git commits.

## Current snapshot (2026-08-12)

- Product: **BCSDLab. Arcade**, a multi-tenant Unity WebGL hosting and issue-tracking platform.
- Workspaces: `server/` (Express + Mongoose), `web/` (Vite + React), `unity/` (drop-in C# and WebGL bridge).
- Public flow: `/arcade` -> `/play/:gameSlug[/:buildId]` -> `/report/:gameSlug[/:buildId]`.
- Dashboard: approved developers manage games, builds, reports, settings, collaborators, and articles.

## Delivered

- Auth, approval lifecycle, JWT/OAuth, admin users, collaborators, and profile editing.
- Per-game WebGL build upload/storage/serving, dynamic play URLs, and public issue ingestion.
- Issue triage, votes, comments, Unity/browser snapshots, ownership scoping, and Discord fallback.
- Public Arcade, game pages, thumbnails, responsive play/report views, review information, and articles/blog CMS.
- Server-backed HMAC sessions, leaderboards, JSON config, score bounds, replay protection, and Unity bridge generation.
- SSR metadata/JSON-LD, canonical/OG/Twitter tags, robots, sitemap, privacy revisions, and SEO bootstrap data.
- Dark-theme UX, route-aware shell skeletons, view transitions, shared artwork transitions, carousel controls, and preview deployments/error pages.

## Recent milestones

- 2026-08-10: Arcade/public navigation redesign, game-scoped articles, SEO/SSR bootstrap, privacy indexing, and data-router view transitions.
- 2026-08-11: Apache `/privacy` routing correction; profile page; landing carousel; isolated PR previews with access simplification, cleanup locking, and custom error catch-all.
- 2026-08-12 (game name editing)
  - Added dashboard editing for the game's Arcade name with Korean/English labels, validation, dirty-state tracking, save, and revert handling.
  - Hardened `PATCH /api/games/:gameId` name validation (string, non-empty after trim, max 100 characters).
  - Verification: `server/npm test` (77 passing), `web/npm run build`, `node --check src/routes/games.js`, and `git diff --check`.

## Verification baseline

- `cd web; npm run build`
- `cd server; npm test`
- `node --check` for changed server modules
- `git diff --check`

## Open / TODO

- Add Vitest coverage for `web/`; keep `node --test` coverage growing in `server/`.
- Add production rate limiting for `POST /api/issues` and server-side upload type validation.
- Run browser/SEO bootstrap checks with JavaScript disabled or API access blocked, plus a real Unity WebGL E2E pass.
- Run the pending Unity Editor + uploaded WebGL E2E pass for token invalidation/refresh, score and save round trips, and responsive login-gate checks.
- Add `/en` Apache routing only when translation publishing is enabled; preserve the `/en` prefix for SSR bootstrap validation.
- Replace in-memory HMAC nonce/rate-limit state if deployment becomes multi-instance.
- Submit and monitor the production sitemap in Google Search Console.

## Durable decisions

- Builds resolve by `gameId`/`buildId`; never hard-code `web/public/unity/Build` paths.
- URLs use `/play/:gameSlug` for the active build and `/play/:gameSlug/:buildId` for a specific build.
- Build storage is local filesystem for now; S3/object storage is deferred.
- Discord uses the per-game webhook, falling back to `DISCORD_WEBHOOK_URL`; missing configuration is a no-op.
- Unity custom state remains schemaless; retain the hand-written C# JSON writer.
- Leaderboards are per-game, HMAC-protected, and top-N bounded; current nonce/rate-limit state assumes one process.

## 2026-08-12 — build caps, atomic swaps, cache validators, thumbnail versioning

- Raised StreamingAssets extraction caps to 2 GB total / 256 MB per entry and preserved 413 propagation.
- Added temp-directory extraction, rollback-capable swaps, per-build replace locks, stale swap cleanup, and hidden swap paths.
- Added StreamingAssets ETag/Last-Modified revalidation while keeping Unity artifacts immutable-cacheable.
- Versioned thumbnail filenames by content hash; uploads/deletes sweep legacy and orphaned files, with dashboard merge protection.
- Verification: `server/npm test` (132 passing), `web/npm run build`, changed-module `node --check`, and `git diff --check`.

## 2026-08-12 — Arcade ID / GBaaS Phase 0–1

- Reframed pending/rejected accounts as regular members; developer approval now gates dashboard access only.
- Added `/me`, shared profile editing components, desktop public-nav auth affordance, and member/developer copy.
- Added live User-backed ownership for Issue, BlogPost, and GameArticle comments; legacy comment deletion remains manager/admin-only.
- Added separately signed 15-minute game tokens, revocable 7-day editor tokens, account leaderboards, cloud saves, and `/api/v2` routes.
- Added per-game `v2Enabled`/`cloudSaveEnabled`, public `sdkV2` play metadata, and dashboard backend token/flag endpoints.
- Corrected best-score replacement semantics: descending replaces lower stored scores; ascending replaces higher stored scores.
- Verification: `server/npm test` (117 passing), `web/npm run build`, changed-module `node --check`, and `git diff --check`.
- Next: Phase 2 Unity SDK/code generation, then Phase 3 play gate/dashboard UI/i18n and manual Unity WebGL E2E.

## 2026-08-12 — Arcade ID / GBaaS Phase 2–3

- Added static `ArcadeSdk.cs` + `ArcadeSdk.jslib`, EditorPrefs development-token bootstrap, browser credential injection, bounded token wait, and one-time 401 retry.
- Added authenticated generated-SDK delivery with `SITE_ORIGIN` substitution and per-game score/config/save examples.
- Added SDK v2 play-token refresh, Unity-first/token-first handshake, signed-out canvas gate, and en/ko copy.
- Added dashboard SDK v2 controls, generated files/docs, revocable editor token, account/legacy score tabs, test-record cleanup, and cloud-save metadata management.
- Added manager/admin score/save APIs with game scoping, pagination, and cloud-save body redaction.
- Verification: `server/npm test` (122 passing), `web/npm run build`, changed-module `node --check`, SDK bridge syntax check, and `git diff --check`.
- Remaining before merge: manual Unity Editor + uploaded WebGL E2E, including token reissue invalidation, 15-minute refresh, score/save round trips, and responsive login gate checks.

## 2026-08-12 — review fixes

- Rewrote player-facing and dashboard SDK v2 copy in both locales: removed internal architecture jargon ("account-backed"/"계정 기반"), leaked implementation rationale, and untranslated English labels in the `ko` block. `ARCADE ID` is retained as intentional branding.
- Made `isDev` part of the CloudSave unique identity so editor development-token saves can never overwrite or be deleted alongside real saves. Reverses the earlier "provenance is mutable" decision.
- Dropped the `user.email` fallback from play-token display names, which could expose a private email on a public leaderboard.
- Removed leaderboard rank query fan-out on both the submit and read paths.
- Fixed a CS1626 compile error in `ArcadeSdk.cs` (`yield break` inside a try/catch).
- Fixed render-phase navigation in `AgeConsentPage`, added play-token refresh retry, and stopped a repeating request loop in the leaderboard modal.
- Extracted shared comment helpers into `server/src/services/comments.js`; comment reads now target a pre-generated id instead of the array tail.
- Added `unity/` to the preview image so generated-SDK delivery works there.
- Updated server tests for provenance-separated cloud saves, deletion boundaries, loopback requests, comment ownership/creation, and shared fake-model helpers.
- Verification this run: `cd server && npm test` — 122 passing, 0 failing; `cd web && npm run build` — succeeded; changed-server-module `node --check` and `git diff --check` — passed.
- Manual Unity Editor and uploaded WebGL E2E verification remains outstanding.

## 2026-08-12 — LiveOps settings

- Reviewed `ArcadeSdk.cs` generation failure: checked-in preview image includes `COPY unity/`, but PR deployment builds with the host-installed `/usr/local/share/arcade-preview/Dockerfile`; verify that external asset after merge. No fix applied for this review-only item.
- Renamed the dashboard tab to **LiveOps settings** and added a persisted master switch plus mutually exclusive Legacy API / SDK v2 mode selection.
- Legacy mode now shows the shared secret and `ServerBridge.cs` generation only; SDK v2 mode shows `ArcadeSdk.cs`/`.jslib`, editor token, cloud saves, and shared resource definitions only.
- Added backwards-compatible `liveOpsEnabled` / `liveOpsMode` resolution and runtime gates for public v1/v2 calls.
- Verification: web build, server tests (124 passing), changed-server-module `node --check`, and `git diff --check`.

## 2026-08-12 — SDK delivery UX and localization

- Made every dashboard code block collapsible; generated SDK files start collapsed with copy/download controls still available.
- Localized SDK v2 game-specific example titles, descriptions, and log snippets by dashboard locale (`ko`/`en`).
- Verification: web build, server tests (124 passing), changed-server-module `node --check`, and `git diff --check`.

## 2026-08-12 — Legacy HMAC compatibility

- Treat legacy HMAC configuration as enabled when a newer schema materialized `liveOpsEnabled: false` without an explicit mode.
- Pin the inferred mode only when the master switch is explicitly changed, and preserve the existing `serverBackend.secret` through all LiveOps/mode updates.
- Added Legacy secret-preservation guidance and route/service regression coverage.
- Verification: web build, server tests (127 passing), changed-server-module `node --check`, and `git diff --check`.

## 2026-08-12 — Build upload feedback + StreamingAssets replacement

- Added XHR multipart upload progress, transfer metrics, server-processing state, cancel/terminal states, and selected-file manifests to the Builds tab.
- Added authorized StreamingAssets replacement endpoint with idempotent extraction, bounded zip handling, metadata, storage recomputation, and non-caching of replaced assets.
- Added expandable StreamingAssets file summaries and route coverage for authorization, stale-file removal, deduplication, and storage totals.
- Verification: `server/npm test` (128 passing), `web/npm run build`, changed-server-module `node --check`, and `git diff --check`.

## 2026-08-12 — Addressables remote content hosting

- Plan: `docs/plan-addressables-content-hosting.md`. Serve developer-uploaded Addressables remote content from a stable URL; no runtime SDK involvement by design.
- Public URL is `/content/<gameId>/<channel>/[BuildTarget]`, keyed by immutable `gameId` (never `slug`) so a catalog baked at Unity build time stays valid.
- Extracted the StreamingAssets zip pipeline into `services/assetArchive.js` (zip-slip guard, per-entry and running byte caps, wrapper-folder strip) and added merge alongside the existing atomic swap.
- Added `AddressableContent` model, `routes/gameContent.js` (list/upload/files/delete), per-channel upload locks, and directory-walk file inspector; the model deliberately stores counts only, not the path list.
- Added `createContentFileHandler` with filename-hash-driven cache policy, catalog revalidation, `Content-Length`, and single-range 206/416 support; `Content-Length` also added to the build and thumbnail handlers.
- Added a `content` dashboard tab that shows the RemoteLoadPath before the first upload, merge/replace upload with progress, stats, `hasMore` file inspector, and an unhashed-bundle warning.
- Content bytes now count toward `/api/auth/usage`; game deletion removes build/content directories, thumbnails, and Build/Issue/GameConfig/Leaderboard/LeaderboardScore/CloudSave documents (previously leaked).
- Verification: `server/npm test` (162 passing, 30 new), `web/npm run build`, changed-server-module `node --check`, `git diff --check`, and en/ko i18n key parity (45 `gc*` keys each).
- Production Apache: added `ProxyPass`/`ProxyPassReverse` for `/content/` to `arcade.codingbot.kr.conf` (backup `*.content-backup-20260812111909`), configtest + graceful reload, verified `/content/` reaches Express while the SPA fallback still works.
- `arcade.codingbot.kr` has no CDN in front (DNS resolves straight to the origin), so every content byte is served by this one host; browser `immutable` caching is the only layer protecting it.
- Outstanding: manual Unity WebGL E2E (remote load, content-only re-upload without a player rebuild, merge during a live session), and deploying this branch — production still runs `main` @ f609009, which has no `/content` route.

## Durable decisions — Addressables

- Content URLs are keyed by `gameId`; `Game.slug` has no immutability guarantee and must never appear in a content path.
- The `channel` segment is mandatory even while only `live` is used; it cannot be added later without invalidating shipped catalogs.
- Upload defaults to merge — replace deletes bundles that sessions holding an older catalog still resolve.
- Immutable caching is inferred from a 32-hex-character segment in the filename, never configured; unhashed bundles fall back to revalidation so stale content can always be corrected server-side.
- Addressables stays decoupled from `ArcadeSdk`. Consequence: the URL is baked at Unity build time, so remote content cannot be exercised in PR previews.

## 2026-08-14 — Addressables upload guardrails

- Added non-blocking upload layout warnings for missing catalogs, catalog hashes, and the `[BuildTarget]` directory; surfaced them in the content dashboard in en/ko.
- Enforced the existing owner-scoped storage quota for build, StreamingAssets, and Addressables uploads before staged files become live; quota rejection preserves existing content and cleans new build staging.
- Kept the 500 MB default quota; admins can raise it per developer through the existing user quota control.
- Added `docs/addressables-content-operations.md`: merge-only catalog rollback, versioned channel strategy, verification, and replace recovery limits.
- Added the Vite `/content` development proxy.
- Verification: `server/npm test` (170 passing), `web/npm run build`, changed-module `node --check`, and `git diff --check`.

## 2026-08-14 — Addressables review follow-up

- Catalog layout validation now accepts binary `catalog_*.bin` files and matches their `.hash` pair, sharing the filename pattern with content serving and archive metadata ordering.
- Public upload errors now expose allowlisted reason codes; quota errors include current, projected, and maximum bytes, with localized dashboard messages for builds and content.
- Owner quota serialization now queues cross-game uploads instead of returning `409`; it remains process-local and requires distributed coordination if the server becomes multi-instance.
- Corrected the zero-byte StreamingAssets fallback to use nullish coalescing.
- Verification: targeted server tests (39 passing) and `web/npm run build`.

## 2026-08-14 — Addressables review final verification

- Final verification: full `server/npm test` (172 passing), `web/npm run build`, changed-module `node --check`, and `git diff --check`.

## 2026-08-15 — Ignition + game long descriptions

- Added gated Canvas UI Blaze/FireLayer effects to the landing hero and full landing footer; CSS mesh-glow fallback remains visible when HTMLInCanvas is unavailable.
- Added the HTMLInCanvas Origin Trial meta placeholder for `arcade.codingbot.kr`; replace it with the issued token before production deployment. Planned expiry checkpoint: 2026-10-20.
- Added `Game.longDescription` (20,000 characters), MarkdownField editing with shared blog image upload/rendering, play-page Markdown rendering, SSR bootstrap/preview support, and en/ko dashboard copy.
- Added long-description translation fields and a separate Markdown body pass; expect higher Gemini request volume for games with detailed descriptions.
- Verification: full `server/npm test` (177 passing), `web/npm run build`, changed-server-module `node --check`, and `git diff --check`.
- Manual follow-up: issue and replace the Origin Trial token, then test landing CTA/footer interaction, reduced-motion/browser fallbacks, carousel flame palette changes, and dashboard/play-page image + Markdown flows.

## 2026-08-15 — Ignition review fixes + play-page comments

- Fixed the reason the blaze never appeared: `FireLayer` rendered its IntersectionObserver sentinel only while inactive, so activating it detached the observer target, which reported `isIntersecting: false` and switched the layer straight back off. The sentinel now stays mounted, intersection latches on instead of toggling, and the above-the-fold hero (`mode="fill"`) skips the observer entirely.
- Fixed the hero swallowing page scroll: Blaze inlines `overflow: auto` on the wrapper it moves the subtree into, turning the fixed-height hero into its own scroll container.
- Fixed a 286 px horizontal document overflow from the footer's `::before` glow bleeding ±15% with no clip on `.site-footer`.
- Retuned both blazes — the previous values were near-invisible, and the hero palette read the *darker* gradient stop so the flame sat on the backdrop it was sampled from. Sparks now take the brighter stop, the hero scrim gained a bottom band to give the fire a ground, and distortion is low enough to keep the headline legible.
- The footer's padding now moves onto the layer's content wrapper (guarded by `:has([data-fire-active])`) so the flame covers the whole footer instead of leaving a lit rectangle inset in unlit padding; fallback browsers keep the original padding.
- Replaced the invalid `__HTML_IN_CANVAS_ORIGIN_TRIAL_TOKEN__` meta with a commented block. Chrome rejects a placeholder and logs an error on every load. **Confirmed by measurement: the trial token, not `chrome://flags`, is what exposes the API to visitors** — in one Chrome 151, `canvasui.dev` had `drawElementImage` as a function while `localhost` had it undefined.
- Added play-page comments: `GameComment` (own collection, not embedded on `Game` — that document is read by the arcade list, play metadata, SSR, dashboard, and translation, several via `toObject()`, and `game.save()` from the settings form would race comment writes), public list/create/delete routes registered above `/play/:gameSlug/:buildId` so `/comments` is not parsed as a build id, a reusable `CommentSection`, and game deletion cleanup.
- Comment moderation: author, game owner/collaborator, or admin. The client only shows delete for author/admin because the play page carries no ownership signal.
- Verification: full `server/npm test` (183 passing, 6 new), `web/npm run build`, changed-module `node --check`, `git diff --check`, and a live browser pass on `/` and `/play/:slug` (blaze active on both layers, scroll restored, zero horizontal overflow, comment post/list/delete round trip in UTF-8).
- Still outstanding: a non-Chromium fallback check on real Safari/Firefox.

## 2026-08-15 — Origin Trial token + landing club footer

- Applied the issued HTMLInCanvas Origin Trial token for `arcade.codingbot.kr` in `web/index.html` (`isSubdomain: true`, **expires 2026-10-20** — renew at https://developer.chrome.com/origintrials). SSR inherits it through the existing `</head>` replacement, so no server change. The trial spans M148–M151, so re-registration may not be possible after expiry; the effects fall back silently.
- Landing-only two-tier footer (`<Footer variant="landing" />`): BCSD the club on top, Arcade below. Copy is taken from bcsdlab.com — "Build Communities, Share Dreams", the orbit metaphor, 한국기술교육대학교 IT 동아리, and a "동아리에 대해 더 알아보기" CTA to bcsdlab.com. en/ko both added.
- The club tier's mark is the official symbol, inlined as `BcsdSymbol.jsx` from `BCSD Logo-symbol.svg` (bcsdlab.com has no BI/CI section; the file came from the user). Paths are verbatim; the upstream `<style>` block using `.cls-1/2/3` was converted to `fill` attributes so those generic names cannot leak into the global stylesheet. A `mono` prop flattens the two brand purples to `currentColor` — the footer uses it to set symbol and "BCSD" wordmark as one lockup in a single off-white ink. The body path is `#1d1d1b` upstream and would vanish on the dark surface; as `currentColor` it reverses, and the eyes are counter-wound holes so they pick up the footer behind.
- `variant="landing"` now implies the blaze; the separate `fire` prop is gone. Other pages keep the short footer untouched (verified `/arcade`: 247 px, no club tier, no layer, original padding).
- The extra height is the point — 247 px gave the blaze nowhere to burn; the landing footer is now ~615 px, matching the canvasui.dev proportion.
- Fixed two activation artifacts the taller footer exposed: the layer collapsed to zero height for a frame because measuring only began after activation (now pre-measured off the sentinel while the children are still ordinary DOM), and it lit up one pixel past the fold showing an unpainted canvas frame (IntersectionObserver now uses `rootMargin: '0px 0px -20% 0px'`). Document height across activation is now 2320→2321 px.
- Confirmed hit testing works inside the canvas subtree: the CTA, track chips, footer nav links, and brand link all resolve through `elementFromPoint`. This closes the risk flagged in the previous entry.
- Verification: `server npm test` (183 passing), `web npm run build` with the token present in `dist/index.html`, and browser passes on `/`, `/en`, and `/arcade` with zero horizontal overflow.

## 2026-08-16 — Public comment form reuse

- Extracted the existing public blog comment form into shared `CommentForm`; blog articles and game pages now use the same fields, Turnstile flow, errors, and styling.
- Matched game comment list styling to the existing public comment UI and added bottom spacing before the slim footer (64px desktop, 48px mobile).
- Verification: `web npm run build` and `git diff --check`.

## 2026-08-16 — Focus-gated Unity keyboard capture

- Kept the `2f72cac` capture-phase promotion for Unity keyboard handlers, but wrapped Unity's `window`/canvas callbacks so they run only while the Unity canvas is the active element.
- Page inputs now retain keyboard events after canvas blur; focused Unity retains the extension-resistant capture behavior.
- Prevented browser scroll defaults for Space, arrow, PageUp/PageDown, Home, and End only while the Unity canvas owns focus.
- Verification: `node --check src/unityKeyboardDiagnostics.js`, `web npm run build`, and `git diff --check`; browser automation was unavailable in this environment.

## 2026-08-16 — Landing hero button highlight

- Confirmed the review finding: `.l-hero-primary::before` used `z-index: -1`, placing the specular layer below the button background.
- Raised the highlight to stack level 0 and placed the wrapped button label above it; preserved `pointer-events: none`.
- Verification: `web npm run build` and `git diff --check`.

## 2026-08-16 -- Home SEO bootstrap and preview graph

- Extracted shared public Arcade game/build/translation loading for `/` and `/arcade`; home now also loads three recent blog posts and bootstraps `{ games, posts }`.
- Extended SEO previews with section headings, configurable item caps, localized home/Arcade/blog nav, and the landing footer's club/site copy and links.
- Added recent game-article links plus the game article index link to Play previews; LandingPage consumes `/` bootstrap and skips its initial duplicate API requests.
- Verification: full `server/npm test` (187 passing), `web/npm run build`, changed-module checks, live `/`, `/en`, and `/sitemap.xml` HTTP checks; in-app browser runtime unavailable.

## 2026-08-16 -- SEO 작업 브랜치 이동 및 HTTP 확인

- `origin/main` 최신 커밋 `5846ef0`으로 local `main`을 fast-forward하고 `feature/home-seo-bootstrap`을 생성했다.
- 기존 `feature/game-specific-desc-and-comments`의 커밋은 이미 `origin/main`에 병합되어 있었고, SEO 미커밋 변경 8개 파일을 새 브랜치에 충돌 없이 복원했다.
- `curl http://localhost:5173/`은 Vite 클라이언트 셸이므로 SSR 데이터/링크가 없고, 제공된 `LandingPage.jsx`에는 `readSsrData("/")`와 bootstrap 중복 요청 가드가 반영되어 있다.
- `curl http://localhost:4000/` 및 `/en`에서 SSR 데이터, 게임/블로그, nav/footer 링크를 확인했고 `/play/project-adventure`의 아티클 목록 링크와 sitemap XML도 확인했다.
- Verification: `server/node --test` 189 passing, `git diff --check`; 이후 웹 빌드는 사용자 중단으로 완료되지 않았다.

## 2026-08-16 -- SEO preview layout fidelity

- Reworked `renderSeoPreview` into page-specific landing, listing, article, and play layouts with shared localized nav/footer, safe links/images, hero artwork, cards, article rows, Markdown blocks, game info, and GRAC review panels.
- Matched the no-JS preview styling in `web/index.html` to the public page rhythm: landing hero/footer, Arcade/blog grids and sidebar, editorial article frame, Play stage/rail, responsive breakpoints, and landing club copy.
- Play previews preserve the game-article index link even when the recent article list is empty; section action links are rendered independently of item presence.
- Added route-level layout regression assertions and kept legacy `items`/section item caps compatible.
- Verification: full `server/node --test` (191 passing), `web/npm run build`, changed-module `node --check`, `git diff --check`, live SSR checks on `/`, `/en/`, `/arcade`, `/blog`, and `/play/project-adventure`; in-app browser runtime unavailable.
