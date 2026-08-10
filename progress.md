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
