# Progress

Keep this file short; detailed implementation history remains in git commits.

## Current status (2026-08-16)

- Product: **BCSDLab. Arcade**, a multi-tenant Unity WebGL hosting and issue-tracking platform.
- Branch: `main`, synced with `origin/main` at `4fc42d4` (PR #35 merged). `develop` is legacy/stale after PR #10; do not use it for new work.
- Workspaces: `server/` (Express + Mongoose), `web/` (Vite + React), `unity/` (drop-in C# and WebGL bridges).
- Public flow: `/arcade` -> `/play/:gameSlug[/:buildId]` -> `/report/:gameSlug[/:buildId]`.
- Dashboard: approved developers manage games, builds, reports, settings, collaborators, and articles.

## Delivered

- Auth, approval lifecycle, JWT/OAuth, collaborators, profiles, comments, and ownership-scoped moderation.
- Per-game WebGL build upload/storage/serving, dynamic play URLs, public issue ingestion, triage, votes, snapshots, and Discord fallback.
- Public Arcade/game/play/report pages, thumbnails, articles/blog CMS, Markdown descriptions, responsive dark-theme UX, and landing effects.
- SSR metadata/JSON-LD, localized SEO previews/bootstrap, canonical/OG/Twitter tags, robots, sitemap, and privacy routing.
- Legacy HMAC LiveOps and authenticated Arcade SDK v2: game tokens, leaderboards, cloud saves, editor tokens, code generation, and play login gates.
- StreamingAssets replacement and Addressables remote-content hosting with quotas, archive safety, stable game-scoped URLs, cache validators, and atomic storage updates.
- Recent merged work includes SEO home bootstrap and page-specific no-JS preview layouts (PR #35).

## Active TODO

- Run manual Unity Editor + uploaded WebGL E2E: token invalidation/refresh, score/save round trips, remote content, content-only re-upload, and responsive login gate.
- Check Safari/Firefox fallbacks for landing effects and Unity input; browser automation is not available in the normal verification baseline.
- Replace/renew the HTMLInCanvas Origin Trial token before its 2026-10-20 expiry and verify landing CTA/footer behavior.
- Add Vitest coverage for `web/`; keep server `node --test` coverage growing.
- Add production rate limiting for `POST /api/issues` and server-side upload type validation.
- Replace in-memory nonce/rate-limit state if deployment becomes multi-instance; submit/monitor the production sitemap in Search Console.
- Add `/en` Apache routing only when translation publishing is enabled.

## Verification baseline

```sh
cd server; npm test
cd web; npm run build
node --check <changed-server-module>
git diff --check
```

## Durable decisions

- Builds resolve by `gameId`/`buildId`; never hard-code `web/public/unity/Build` paths. Active URLs use `/play/:gameSlug` and `/play/:gameSlug/:buildId`.
- Build storage is local filesystem for now; S3/object storage is deferred.
- Discord uses the per-game webhook, falling back to `DISCORD_WEBHOOK_URL`; missing configuration is a no-op.
- Unity custom state and cloud-save bodies remain schemaless/opaque; keep the hand-written C# JSON writer and never render save JSON as HTML.
- Dashboard routes require approved developers. Public play metadata and issue ingestion remain public; v2-enabled games require a signed-in member before mounting Unity.
- SDK v2 uses short-lived game-scoped tokens and is separate from legacy HMAC; generated SDKs must not embed site JWTs or game secrets.
- Addressables URLs use immutable `gameId` + mandatory channel; hashed filenames are immutable-cacheable, unhashed files revalidate, and content remains decoupled from the runtime SDK.

## 2026-08-16 — develop sync and Glass footer

- Fast-forwarded local `develop` from `d674b8d` to `main` at `4fc42d4`; active work is now on `develop`.
- Replaced the landing footer's Displacement layer with a local Canvas UI Glass lens; marked footer copy and BCSD CI with `data-glass-target` for hover zoom.
- Added mobile/unsupported-browser CSS hover scaling and kept reduced-motion/HTML-in-canvas gating through `CanvasFxLayer`.
- Verification: `cd web && npm run build`, `git diff --check` passed. Visual browser inspection was unavailable because no browser backend was connected.
