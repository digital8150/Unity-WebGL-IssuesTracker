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

## 2026-08-16 — Landing hero tweaks + footer Droplets/Bubble combo

- Landing hero: removed the carousel's prev/next arrow buttons (dots-only pagination now), raised hero `min-height` 640px → 780px, set Blaze `distortion` 0 → 0.6, and vertically centered the hero copy (`align-items: flex-end` → `center`).
- Landing "recent articles" now reuses `ArticleCardGrid` (the blog list's large-cover/title/summary/author card) instead of the old small `l-recent-card` row layout, so it visually matches the game grid. Removed the now-dead `l-recent-card*` CSS and `RecentArticle` component.
- Footer: replaced the Glass lens with two Canvas UI effects — Droplets (ambient rain-on-glass over the footer, cursor wipes drops off) and Bubble (cursor-trailing droplet). Vendored `Bubble.tsx` from the Canvas UI registry alongside the already-present `Droplets.tsx`; both documented in `canvasui/README.md`. Glass.tsx stays vendored but unused. Removed all `data-glass-target` attributes/CSS (Glass-only per-element zoom mechanism).
- First attempt nested Bubble around Droplets (one `CanvasFxLayer` wrapping the other). Live-tested in Chrome via claude-in-chrome: both layers activated (`data-fx-active`, correct canvas counts confirmed via devtools), but Droplets never appeared on screen — confirmed the user's suspicion that Chrome's html-in-canvas capture doesn't composite one live WebGL/`layoutsubtree` canvas nested inside another. **Nesting two DOM-capturing Canvas UI effects doesn't work; don't retry it.**
- Second attempt: un-nested them as siblings — Droplets (`mode="measure"`) owns the real footer DOM, Bubble ran `mode="fill"` with no children (purely decorative overlay via z-index). Worked, but rendered as a flat dark/glassy bead with no text refraction, since it had no content to refract — visually read as "a black oil drop covering the screen" per user feedback.
- Third attempt: gave Bubble a second `aria-hidden`/`inert` copy of `footerContent` to refract (visually identical, non-interactive, excluded from a11y tree). While live-testing this in Chrome, Droplets' own `mode="measure"` layer stopped activating at all — its lazy IntersectionObserver-gated activation never fired in that session (root cause not confirmed; possibly related to the automation-driven tab being "visible" but unfocused). User called it off before this was root-caused.
- **Final decision (user's call): dropped Bubble entirely, kept Droplets alone.** Reverted `Footer.jsx`/`Footer.css` to the single-effect shape (structurally the same as the original Glass setup, just for Droplets). `Bubble.tsx` stays vendored but unused, like `Glass.tsx`; the false-starts are documented in `Footer.jsx`'s comment and `canvasui/README.md` so they aren't retried blind.
- Verification: `cd web && npx vite build` clean; the working single-Droplets state was live-tested with `npm run dev` + claude-in-chrome earlier in the session (DOM inspection + screenshots confirmed rain visible on the real footer text).

## 2026-08-16 — Footer rolls a random Canvas UI effect; slogan moved under BI/CI

- Since layering Canvas UI effects doesn't work (see above), the landing footer now picks **one** effect at random from an 8-entry roster each time it mounts, instead of always using Droplets: Droplets (unchanged hand-tuned options), Glass (defaults), Blaze (`sparkColor`/`smokeColor` recolored white), Bubble (example defaults), Liquid (`color: [0.7, 0.7, 0.7]`), Magnify (defaults), Glyph Rain (`color`/`headColor` recolored achromatic white/gray, was blue), Particle Reveal (defaults). Picked once via `useState(() => …)` on mount, not per render, so the WebGL context isn't torn down and rebuilt every re-render.
- Vendored the four missing components from the Canvas UI registry the same way Blaze/Droplets/Bubble were: `Liquid.tsx`, `Magnify.tsx`, `GlyphRain.tsx`, `ParticleReveal.tsx` (fetched via `curl`/node script, stripped the Next.js `"use client"` line, source otherwise upstream-shaped). All confirm the same html-in-canvas DOM-capture contract (`children`/`className`/`style` props) as the existing ones, so they drop straight into `CanvasFxLayer` with `mode="measure"`.
- Moved `bcsdEyebrow` ("BUILD COMMUNITIES, SHARE DREAMS") out of the club copy column and renamed it `bcsdSlogan`; it now renders under the BCSD symbol+wordmark lockup as a tagline (`site-footer-club-identity` wraps the mark + new `.site-footer-club-slogan`) instead of as an eyebrow above the headline.
- Updated `canvasui/README.md` with the new roster, the four new vendored-component entries, and moved the Droplets/Bubble nesting failure notes into a "Nesting history" subsection (still don't retry that blind).
- Verification: `cd web && npx vite build` clean; `git diff --check` clean (only benign LF/CRLF warnings). Not yet live-tested in a browser — no browser backend was connected this session, so the 8 effects' actual on-screen appearance (especially Particle Reveal/Magnify/GlyphRain, which are new to this footer) is unverified.

## 2026-08-19 — Addressables content: per-game CORS allowlist for externally-hosted players

- Fixed a gap flagged (but left unaddressed) in `docs/plan-addressables-content-hosting.md`:
  a WebGL player hosted off-platform (GitHub Pages, itch.io, …) whose Addressables
  `RemoteLoadPath` points at this server's `/content/<gameId>/<channel>/` made a genuine
  cross-origin request that the single-origin `cors({ origin: CORS_ORIGIN })` middleware
  couldn't satisfy — no ACAO header for that origin, and Range/If-None-Match aren't
  CORS-safelisted so the browser preflighted every request and got blocked.
- Added `Game.allowedOrigins` (`server/src/models/Game.js`), validated/normalized in the
  existing `PATCH /api/games/:gameId` settings route (`normalizeAllowedOrigins` in
  `routes/games.js`: scheme+host[:port] only, no path/trailing slash, max 20, deduped
  case-insensitively).
- New `contentCors` middleware in `routes/gameContent.js`, mounted ahead of
  `createContentFileHandler` for both `GET` and `OPTIONS` on `/content/:gameId/:channel/*`
  in `index.js`. Reflects the request's `Origin` back as `Access-Control-Allow-Origin` only
  when it matches `SITE_ORIGIN` (always allowed) or an entry in that game's
  `allowedOrigins`; sets `Vary: Origin`, exposes `Content-Length/Content-Range/ETag/
  Accept-Ranges`, and answers preflights with `Access-Control-Allow-Methods/Headers/Max-Age`.
  Same-origin requests (no `Origin` header) skip the DB lookup entirely.
- In-process 30s TTL cache (`allowedOriginsCache` Map) keyed by `gameId`, invalidated
  synchronously by the settings route via `invalidateAllowedOriginsCache` so a save takes
  effect immediately rather than waiting out the TTL — same in-process-only caveat as the
  storage-quota lock already documented for a multi-instance deployment.
- Dashboard: new "Allowed external origins" panel in `GameContentTab.jsx` (right after the
  RemoteLoadPath URL card), reusing `updateGame`/the collaborator-list CSS classes — add/remove
  origins with immediate persistence, matching `CollaboratorSection`'s UX. Full ko/en i18n.
- New `server/test/addressable-content-cors.test.js` (8 cases: same-origin bypass, SITE_ORIGIN
  always-allow, allowed/disallowed origin ACAO presence, preflight shape, cache invalidation,
  invalid-gameId passthrough) plus an `allowedOrigins` validation case added to
  `game-settings.test.js`. Scope was deliberately just `/content/`, not `/builds/` — the
  latter's own player is expected to load from wherever it's hosted, not from a foreign origin.
- Docs: `docs/addressables-content-operations.md` gained a "Cross-origin (CORS) content
  access" runbook section; `docs/plan-addressables-content-hosting.md`'s CORS gap note marked
  done with a pointer to the implementation.
- Verification: `cd server && npm test` (198/198 pass, was 189), `cd web && npm run build`
  clean, `node --check` on every changed server file.

## 2026-08-16 — Canvas UI fallback hardening and account/play UI cleanup

- Added WebGL program-link failure cleanup so Canvas UI effects fall back to plain DOM instead of rendering against invalid programs; made array-valued options compare element-wise.
- Scoped Liquid pointer listeners to the captured content element and documented the vendored-source patches.
- Added member-profile logout/dashboard actions, removed the dashboard Arcade link, and simplified play review metadata presentation.
- Verification: `cd web && npm run build`, `git diff --check` passed; browser visual inspection remains unavailable.

## 2026-08-20 — Addressables CORS review follow-up

- Canonicalized saved and request origins with URL parsing, including lowercase hosts and removal of HTTP/HTTPS default ports while rejecting paths, queries, fragments, and credentials.
- Made Addressables content mutation controls owner-only in the dashboard; collaborators retain read-only URLs, allowlist, stats, and file inspection.
- Verification: `cd server && npm test` (198/198), `cd web && npm run build`, server syntax checks, and `git diff --check` passed.

## 2026-08-20 — Collaborator management parity and owner-only game deletion

- User decision supersedes the prior owner-only content-controls review change: collaborators can manage settings, thumbnails, builds/content, LiveOps, articles, and collaborators at owner-equivalent scope.
- Added an owner-only game deletion danger zone in Settings; the existing API now awaits cleanup of builds/content/thumbnails and every game-scoped model/translation before deleting the Game record.
- Added owner-vs-collaborator deletion and cascade coverage; verification: `cd server && npm test` (198/198), `cd web && npm run build`, syntax checks, and `git diff --check` passed.

## 2026-08-20 — Browser-native dialog removal

- Replaced every application `alert`/`confirm` call with the existing custom Growl/Modal system; added a reusable localized `ConfirmDialog` wrapper for destructive and non-destructive confirmations.
- Moved shared Modal styling into the component, added dialog semantics, and routed Unity loader alert fallbacks exclusively into Growl notifications.
- Removed the native `beforeunload` prompt; unsaved in-app navigation remains protected by the existing custom settings-leave Modal.
- Verification: exhaustive source audit found no native dialog calls or unload prompts, `cd web && npm run build`, `cd server && npm test` (198/198), and `git diff --check` passed.

## 2026-08-20 — Unity fatal-error and teardown containment

- Root cause confirmed against the deployed My Universe loader: its fatal-error path calls bare `alert(...)`, while the prior UnityGame-scoped interceptor could be restored before a late loader error fired. Native alerts are now intercepted for the full app lifetime and rendered through Growl.
- Replaced the unhandled `unload()` call on React unmount with the react-unity-webgl 9.x immediate detach/unload path, guarded by the live Unity instance and awaited before SPA navigation.
- Track Unity-created Web Audio contexts so fatal or partial initialization failures suspend/close audio immediately; failed, timed-out, or never-instantiated runtimes use a document navigation when leaving as the final cleanup boundary.
- Added an inline stopped-runtime/reload state and localized session-closing state. Verification: Unity lifecycle helper checks, `cd web && npm run build`, `cd server && npm test` (198/198), native-dialog source audit, and `git diff --check` passed. Browser automation was unavailable; PR-preview retest remains required after deployment.

## 2026-08-21 — Addressables OPTIONS/CORS fix and developer guide

- Fixed production preflights being consumed by the platform-wide `cors` middleware before per-game `contentCors`; global CORS now skips `/content/**` while remaining unchanged for APIs/dashboard traffic.
- Expanded the Addressables CORS suite to run with the real middleware order and cover API CORS isolation plus HEAD/OPTIONS from allowed external and localhost origins.
- Added `docs/addressables-dashboard-guide.ko.md`, a blog-ready dashboard-user guide for channel selection, Unity profile setup, ZIP layout, merge updates, external origins, browser verification, and rollback, with eight screenshot placeholders.
- Verification: `cd server && npm.cmd test` (200/200), `cd web && npm.cmd run build`, server syntax checks, and `git diff --check` passed.
