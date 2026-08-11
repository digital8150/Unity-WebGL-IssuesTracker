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
