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
