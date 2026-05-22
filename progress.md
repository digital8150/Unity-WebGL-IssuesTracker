# Progress

Shared, append-only-ish status log. Update at the end of any session that changes scope or completes a milestone. Keep entries terse.

## Landing page + dashboard auth (2026-05-23)

### Done
- **server**: `User` model (name, email, passwordHash + timestamps), `requireAuth` JWT middleware, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`. Wired into `index.js`. JWT_SECRET defaults to dev value with prod warning. Deps: `jsonwebtoken`, `bcryptjs`.
- **web**: `react-router-dom` installed. `AuthContext` (token in localStorage, rehydrates via `/api/auth/me` on load). `ProtectedRoute` (redirects to `/login`, restores intended path after auth). `App.jsx` is now a route shell. `main.jsx` wraps with `<BrowserRouter>` + `<AuthProvider>`. `api.js` refactored with a shared `request()` helper + `register`, `login`, `getMe` exports.
- **Landing page** (`/`): nav, hero with gradient headline, 4 feature cards, 4-step "how it works", CTA section, footer. Responsive. Name: **BugDrop**.
- **Login** (`/login`) and **Register** (`/register`) pages with full validation, error display, redirect-after-login.
- **Dashboard** (`/dashboard`, protected): sidebar with avatar/logout, empty state placeholder for game list.
- **PlayPage** (`/play`): existing game player extracted to `pages/PlayPage.jsx`, unchanged.
- `index.css`: global reset, CSS design-token variables (--bg, --primary, --surface, --border, --text-muted, etc.).

### Not started / TODO (carried from scope shift)
- **server**: `Game` + `Build` models; `POST /api/games`, `POST /api/games/:id/builds` (multipart upload), build file serving at `/builds/:buildId/:file` with correct MIME types.
- **web**: game create form, build upload UI, game detail page (reports list), dynamic UnityGame props.
- Attach `gameId`/`buildId` to issue reports.
- MIME/brotli handling for Unity `.wasm`/`.data` output.
- `.env` sample file documenting `JWT_SECRET`, `MONGO_URI`, `DISCORD_WEBHOOK_URL`.

## Scope shift: platform model (2026-05-23)

Project is being repositioned as **`web-gl-game-issue-tracking-platform`** — a hosted service, not a drop-in starter kit. See `CLAUDE.md` → "Product vision".

### What changes
- Developers **upload** Unity WebGL builds through the dashboard; no more manual copy into `web/public/unity/Build/`.
- Each game gets a shareable `/play/<...>` URL for testers; testers don't need accounts.
- Issue reports must carry `gameId` + `buildId`.
- Discord webhook config moves to **per-game** settings (env var stays as global fallback).
- Multi-tenant: dashboard routes need auth; play + ingestion stay public.

### New TODO (added by this scope shift)
- **server**: `Game` + `Build` Mongoose models; auth (dev accounts, sessions or JWT); `POST /api/games`, `POST /api/games/:id/builds` (multipart upload), `GET /builds/:buildId/:file` (static-ish serving with correct MIME for `.wasm`/`.data`); attach `gameId`/`buildId` to `Issue`.
- **server storage**: decide filesystem (`server/storage/builds/<buildId>/`) vs. S3-compatible. Filesystem first.
- **web dashboard**: login, game list, game detail (build history + upload form + reports list), per-game Discord webhook field.
- **web play view**: route `/play/:gameSlug` (or `/play/:buildId`) that fetches active build URLs and passes them as props to `UnityGame.jsx` (which currently hard-codes `/unity/Build/...`).
- **UnityGame.jsx**: accept loader/data/framework/wasm URLs as props instead of hard-coded paths.
- **Issue ingestion**: derive `gameId`/`buildId` from the play context (e.g. a token embedded in the page or a query param) so testers can't spoof it trivially.
- Decide MIME / compression handling for `.wasm` / `.data` (Unity 2021+ default is brotli — server must send `Content-Encoding: br`).

### Open decisions (new)
- Auth strategy: session cookies vs. JWT. Sessions simpler for dashboard-only auth.
- Build storage backend: local filesystem (simple, single-host) vs. S3-compatible (scales, but adds config). Default to filesystem until needed.
- URL shape: `/play/:gameSlug` (stable, human) vs. `/play/:buildId` (versioned) vs. both. Probably both — slug serves active build, explicit buildId for QA on old builds.

## Status: initial scaffold complete (2026-05-23)

### Done
- **unity/** — `IssueTrackerIntegration.cs` (singleton, log buffer via `Application.logMessageReceivedThreaded`, `OnCollectCustomState` event, hand-rolled JSON serializer for `Dictionary<string, object>`, `[DllImport("__Internal")]` bridge w/ editor stub). `IssueTracker.jslib` forwards payloads to `window.__issueTrackerReceive`. README with install steps.
- **web/** — Vite + React 18 + `react-unity-webgl`. `UnityGame.jsx`, `IssueReportOverlay.jsx` (F2 hotkey), `App.jsx` wires SendMessage → jslib → POST. `browserMetadata.js` probes WebGL renderer/GPU. `/api` proxied to :4000.
- **server/** — Express + Mongoose. `POST/GET /api/issues`, `Issue` model with `Mixed` customState/browser, Discord webhook service (env-gated, non-blocking).
- Root `README.md`, `.gitignore`, `CLAUDE.md`.

### Not started / TODO
- No tests, no linter (eslint/prettier) configured.
- No auth on the API — `POST /api/issues` is open. Add rate limiting / token before exposing publicly.
- No admin/dashboard UI for browsing reports (only raw `GET /api/issues` JSON).
- No Unity sample scene / .meta files — `unity/` is a drop-in folder, not a real Unity project. Verify the jslib + script actually build inside a real Unity project.
- E2E flow not yet exercised: needs an actual Unity WebGL build dropped into `web/public/unity/Build/` to verify the SendMessage → jslib → fetch round-trip.
- Discord embed not tested against a real webhook.

### Open decisions
- Whether to add a minimal admin viewer (Express-rendered or separate React page) before shipping.
- Log buffer size default (currently 200) — may want per-game override via inspector.

## GitHub OAuth + platform features (2026-05-23)

### Done
- **server/models/User.js**: added optional `githubId` (sparse unique), made `passwordHash` optional for OAuth users.
- **server/routes/auth.js**: `GET /api/auth/github` → GitHub authorize redirect; `GET /api/auth/github/callback` → exchange code, find/create user, issue JWT, redirect to `FRONTEND_URL/auth/callback?token=…`. Login route guards against missing `passwordHash`.
- **server/models/Game.js**: `name`, `slug` (auto-generated unique), `ownerId`, `discordWebhookUrl`. `generateSlug()` static.
- **server/models/Build.js**: `gameId`, `version`, `files` (`{loader,data,framework,wasm,other[]}`), `isActive`. `detectRole(filename)` export.
- **server/models/Issue.js**: added optional `gameId` + `buildId` fields.
- **server/routes/games.js**: `GET/POST /api/games`, `GET/PATCH /api/games/:gameId`, `POST /api/games/:gameId/builds` (multer memoryStorage → disk), `GET /api/games/:gameId/builds`, `PATCH /api/games/:gameId/builds/:buildId/activate`, `GET /api/games/:gameId/reports`. Public play API: `GET /api/games/play/:gameSlug[/:buildId]`.
- **server/index.js**: mounts games router, creates `storage/builds/` dir at startup, serves `/builds/:buildId/*` with correct MIME + Content-Encoding for `.br`/`.gz`.
- **server/.env.example**: documents `JWT_SECRET`, `SERVER_URL`, `FRONTEND_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DISCORD_WEBHOOK_URL`.
- **web/pages/AuthCallbackPage.jsx**: catches `?token=` from GitHub redirect, calls `/api/auth/me`, stores in AuthContext, navigates to `/dashboard`.
- **web/App.jsx**: added `/auth/callback`, `/dashboard/games/:gameId`, `/play/:gameSlug`, `/play/:gameSlug/:buildId` routes.
- **web/pages/LoginPage.jsx** + **RegisterPage.jsx**: "Continue/Sign up with GitHub" button (links to `/api/auth/github`). Error display for `?error=github`.
- **web/pages/AuthPage.css**: `.btn-github` + `.auth-divider` styles.
- **web/api.js**: added `listGames`, `createGame`, `getGame`, `updateGame`, `uploadBuild`, `activateBuild`, `getGameReports`, `getPlayInfo`.
- **web/pages/DashboardPage.jsx**: live game list from API, inline create-game form, game cards linking to detail.
- **web/pages/GameDetailPage.jsx** + **GameDetailPage.css**: tabbed view — Builds (upload form + build list + activate), Reports (issue list), Settings (per-game Discord webhook).
- **web/components/UnityGame.jsx**: now accepts `loaderUrl`, `dataUrl`, `frameworkUrl`, `codeUrl` as props (no hardcoded paths).
- **web/pages/PlayPage.jsx**: reads `gameSlug`/`buildId` from route params, fetches build URLs from `/api/games/play/…`, passes to `UnityGame`. Falls back to legacy local paths when no `gameSlug`. Issues now carry `gameId` + `buildId`.

### What you need to do for GitHub OAuth
1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:4000/api/auth/github/callback`
3. Copy **Client ID** and generate a **Client Secret**, then add to `server/.env`:
   ```
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   ```

### Still TODO
- Attach `gameId`/`buildId` in issue submission from the play page → already done above.
- Discord webhook per-game: service still reads `process.env.DISCORD_WEBHOOK_URL`; needs update to check `game.discordWebhookUrl` first (carry-over from original TODO).
- Issue detail view (full report with logs, custom state, browser info).
- No tests or linter configured.
- Production: rate-limit `POST /api/issues`; validate upload file types server-side.

## How to update this file
Append a new dated section above when scope shifts. Don't rewrite history — note what changed, what's still TODO, and any decisions made.
