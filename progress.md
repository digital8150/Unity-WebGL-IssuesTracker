# Progress

Shared, append-only-ish status log. Update at the end of any session that changes scope or completes a milestone. Keep entries terse.

## How to update this file
Append a new dated section above when scope shifts. Don't rewrite history — note what changed, what's still TODO, and any decisions made.

---

## All completed work (through 2026-05-23)

### Server
- `User` model: name, email, optional passwordHash, optional `githubId` (sparse unique), timestamps.
- `requireAuth` JWT middleware.
- `POST /api/auth/register`, `POST /api/auth/login` (guards missing passwordHash for OAuth users), `GET /api/auth/me`.
- `GET /api/auth/github` → GitHub authorize redirect; `GET /api/auth/github/callback` → code exchange, find/create user, issue JWT, redirect to `FRONTEND_URL/auth/callback?token=…`.
- `Game` model: name, slug (auto-generated unique), ownerId, discordWebhookUrl. `generateSlug()` static.
- `Build` model: gameId, version, files `{loader,data,framework,wasm,other[]}`, isActive. `detectRole(filename)` export.
- `Issue` model: all original fields + optional `gameId` + `buildId`.
- `GET/POST /api/games`, `GET/PATCH /api/games/:gameId`, `POST /api/games/:gameId/builds` (multer memoryStorage → disk), `GET /api/games/:gameId/builds`, `PATCH /api/games/:gameId/builds/:buildId/activate`, `GET /api/games/:gameId/reports`.
- Public play API: `GET /api/games/play/:gameSlug[/:buildId]`.
- `index.js`: mounts games router, creates `storage/builds/` at startup, serves `/builds/:buildId/*` with correct MIME + `Content-Encoding` for `.br`/`.gz`.
- `server/.env.example`: documents `PORT`, `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `SERVER_URL`, `FRONTEND_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DISCORD_WEBHOOK_URL`.

### Web
- `react-router-dom` installed. `AuthContext` (token in localStorage, rehydrates via `/api/auth/me`). `ProtectedRoute`. `main.jsx` wraps with `<BrowserRouter>` + `<AuthProvider>`.
- `api.js`: shared `request()` + `requestRaw()` (FormData) helpers; `register`, `login`, `getMe`, `listGames`, `createGame`, `getGame`, `updateGame`, `uploadBuild`, `activateBuild`, `getGameReports`, `getPlayInfo`.
- `index.css`: global reset + CSS design-token variables.
- **Landing page** (`/`): nav, hero, 4 feature cards, how-it-works, CTA, footer. Product name: **BugDrop**.
- **Login** (`/login`) + **Register** (`/register`): email/password forms + "Continue with GitHub" button + divider. Error display for `?error=github`.
- **AuthCallbackPage** (`/auth/callback`): catches `?token=` from GitHub redirect, stores in AuthContext, navigates to `/dashboard`.
- **Dashboard** (`/dashboard`, protected): live game list from API, inline create-game form, game cards.
- **GameDetailPage** (`/dashboard/games/:gameId`, protected): tabbed — Builds (upload form + build list + activate), Reports, Settings (per-game Discord webhook).
- **PlayPage** (`/play/:gameSlug[/:buildId]`): fetches build URLs from `/api/games/play/…`, passes to `UnityGame`. Issues carry `gameId` + `buildId`. Legacy local path fallback when no `gameSlug`.
- **UnityGame.jsx**: accepts `loaderUrl`, `dataUrl`, `frameworkUrl`, `codeUrl` as props (no hardcoded paths).

### Unity
- `IssueTrackerIntegration.cs`: singleton, log buffer, `OnCollectCustomState` event, hand-rolled JSON serializer, `[DllImport("__Internal")]` bridge with editor stub.
- `IssueTracker.jslib`: forwards payloads to `window.__issueTrackerReceive`.

---

## Session 2026-05-23

### Completed
- **Issue detail view**: `IssueDetailPage.jsx` + `IssueDetailPage.css` added.
  - Route: `/dashboard/games/:gameId/issues/:issueId` (protected).
  - Shows: description, build info (product/version/Unity/platform/gameId/buildId), browser env (UA, screen, viewport, WebGL renderer/vendor), custom game state (JSON), console logs with type-colored rows and expandable stack traces (collapse at 20 entries).
  - Report rows in GameDetailPage Reports tab are now `<Link>` elements with hover highlight.
  - `getIssue(issueId)` added to `api.js` → hits existing `GET /api/issues/:id`.

---

## Open / TODO (as of 2026-05-23)

- ~~**Discord per-game webhook**~~: done (see Session 2026-05-23).
- ~~**Issue detail view**~~: done (see Session 2026-05-23).
- ~~**Discord per-game webhook**~~: done (see Session 2026-05-23).
- No tests or linter configured (prefer Vitest for web, `node --test` for server).
- Production: rate-limit `POST /api/issues`; validate upload file types server-side.
- `unity/` is a drop-in folder, not a real Unity project — E2E flow untested with an actual WebGL build.

## Decisions made
- Auth: JWT (not sessions). GitHub OAuth produces same JWT format as email/password.
- Build storage: local filesystem (`server/storage/builds/<buildId>/`). S3 deferred.
- URL shape: `/play/:gameSlug` (active build) + `/play/:gameSlug/:buildId` (specific build).
- Compression: server detects `.br`/`.gz` suffix and sets `Content-Encoding` accordingly.
