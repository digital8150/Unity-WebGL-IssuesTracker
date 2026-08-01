# Progress

Shared, append-only-ish status log. Update at the end of any session that changes scope or completes a milestone. Keep entries terse.

> **[CRITICAL INSTRUCTION FOR AI AGENTS]**
> Due to token efficiency, all entries in this progress file **MUST be written in English**. 

## How to update this file
Append a new dated section above when scope shifts. Don't rewrite history — note what changed, what's still TODO, and any decisions made.

---

## Session 2026-08-01 — SEO implementation

### Completed
- Verified `web/index.html`, `web/src/hooks/useDocumentMeta.js`, and `server/src/index.js` with explicit UTF-8 decoding; all are valid UTF-8. Earlier mojibake was tool-output encoding, not file corruption.
- Added server-rendered SEO pages for home, Arcade, blog list/detail, and public game play pages with indexable HTML content, canonical URLs, robots directives, OG/Twitter metadata, and JSON-LD.
- Added sanitized server-side Markdown rendering so published blog content is included in crawler HTML without allowing raw unsafe HTML.
- Added dynamic `/robots.txt` and `/sitemap.xml` endpoints for published posts and public games with active builds.
- Added client-side metadata updates for SPA navigation and propagated game visibility to play-page metadata.

### Deployment
- Confirmed SSH access to `ubuntu@upload.codingbot.kr` using the configured key.
- Added Apache rewrite rules for `/`, `/arcade`, `/blog`, `/robots.txt`, and `/sitemap.xml` to reach Express before the SPA fallback.
- Backed up the Apache vhost, validated with `apache2ctl -t`, reloaded Apache, rebuilt the web app, and restarted PM2.
- Published commit `47e7fd1` to `main`; remote git status is clean and `arcade-server` is online.

### Verification
- Production checks returned `200`: HTML for public pages, `text/plain` for robots, `application/xml` for sitemap, and JavaScript assets from the deployed build.
- Verified server HTML includes headings/content and JSON-LD for home, Arcade, blog detail, and play pages.
- Verified `/login` returns the default `noindex,follow` shell.

### Follow-up
- Submit `/sitemap.xml` to Google Search Console and monitor indexing, impressions, CTR, and crawl errors.

## Session 2026-08-02 — Naver site verification

### Completed
- Verified the provided Naver HTML file and uploaded it to the production document root.
- Persisted the verification file under `web/public/` so future Vite builds keep serving it.
- Confirmed `https://arcade.codingbot.kr/naver9739b746627282c09f47d210a85ec964.html` returns HTTP 200 with the expected verification text.

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

## Session 2026-05-23 (3)

### Completed
- **Storage quota bar in sidebar**:
  - `User` model: added `storageQuota` field (default 500 MB).
  - `GET /api/auth/usage`: aggregates `storageBytes` across all builds owned by the user's games; returns `{ usedBytes, quotaBytes }`.
  - `getUsage()` added to `web/src/api.js`.
  - `StorageBar` component (`web/src/components/StorageBar.jsx`): fetches usage on mount, renders a labelled progress bar + used/total numbers. Bar turns orange at 80%, red at 95%.
  - Added to DashboardPage and GameDetailPage sidebars (above user info / language toggle).

---

## Session 2026-05-23 (2)

### Completed
- **Build deletion + storage tracking**:
  - `Build` model: added `storageBytes` field (populated on upload by summing `file.size` from multer).
  - `DELETE /api/games/:gameId/builds/:buildId`: verifies ownership, removes disk directory (`storage/builds/<buildId>/`), deletes Mongoose document.
  - `deleteBuild(gameId, buildId)` added to `web/src/api.js`.
  - Builds tab: shows total storage used across all builds; each build row shows its own size and a Delete button (with confirm dialog). Delete removes the row from local state immediately.

---

## Session 2026-05-23 (4)

### Completed — nolt.io-grade feedback management features
- **Expanded Issue model**: status (open/in-progress/resolved/closed), priority (none/low/medium/high), tags ([String]), comments (subdocument: body, authorName, timestamps).
- **Expanded Issues API**:
  - `PATCH /api/issues/:id` — status/priority/tags update (auth required).
  - `POST /api/issues/:id/comments` — add comment (auth required, authorName extracted from JWT).
  - `DELETE /api/issues/:id/comments/:commentId` — delete comment (auth required).
- **Games reports filtering**: support `GET /api/games/:gameId/reports?status=&priority=&tag=`. Added status/priority/tags fields to query.
- **api.js**: Added `updateIssue`, `addComment`, `deleteComment`. `getGameReports` now supports filter parameters.
- **GameDetailPage Reports Tab**:
  - Filter bar (text search + status chip filter + priority dropdown + sort) — client-side filtering.
  - Render color badges (StatusBadge) + priority dots (PriorityDot) on each report row.
  - Inline quick status change select dropdown on the right of each row.
  - Extracted into a separate `ReportsTab` component.
- **IssueDetailPage**:
  - Triage panel (status button group + priority button group + tag chip input) — optimistic updates.
  - Comments section: comment list + reply form + delete button.
- **i18n**: Added `triage` namespace (both en/ko).
- **CSS**: Added styles for filter bar, status badge, priority dot, triage panel, and comments.

---

## Session 2026-05-23 (5)

### Completed — Voting, Tester Board, and Collaborator Invitation

**Backend**
- `auth.js`: Included name in `signToken`. `GET /api/auth/search-users?q=` — search users by name/email (auth required).
- `middleware/auth.js`: Added `optionalAuth` middleware (parses token if present, otherwise passes through).
- `Issue` model: Added `votes: [ObjectId]` field.
- `issues.js`: `POST /:id/vote` — toggle voting, allowed for any authenticated user. `POST /:id/comments` — relaxed restriction (any authenticated user can comment, game owner check not required).
- `Game` model: Added `collaborators: [ObjectId]` field.
- Refactored `games.js`:
  - `isOwner` / `isAuthorized` helpers.
  - `GET /api/games` — Consolidated list returns both owned and collaborated games, including isOwner flag.
  - `GET/PATCH /:gameId` — PATCH restricted to owner, GET allowed for collaborators.
  - Build upload/activate allowed for collaborators. Build deletion restricted to owner.
  - `GET /:gameId/reports` — Allowed for collaborators, includes `voteCount` and `hasVoted`.
  - `GET /:gameId/collaborators` — Collaborator list.
  - `POST /:gameId/collaborators` — Invite by email (owner only).
  - `DELETE /:gameId/collaborators/:userId` — Remove collaborator (owner only).
  - `GET /play/:gameSlug/issues` — Public issues board (optionalAuth, closed issues excluded, sorted by votes).

**Frontend**
- `api.js`: Added `voteIssue`, `getPublicIssues`, `getCollaborators`, `inviteCollaborator`, `removeCollaborator`, `searchUsers`.
- `i18n.jsx`: Added `collab` and `board` namespaces (en/ko).
- `ReportPage.jsx`: Tabbed right panel (Debug Snapshot | Browse Reports). Browse tab supports viewing public issues, voting, expanding comments, prompting login for guests. Added login link in nav bar.
- `IssueDetailPage.jsx`: Added voting button in header (count + toggle), disabled if login is required.
- `GameDetailPage.jsx`: `CollaboratorSection` in Settings tab — collaborator list + email invite form + remove button (owner only). Discord webhook settings visible only to owners.
- `DashboardPage.jsx`: Show "Collaborator" badge for collaborated games on the dashboard.
- CSS: Added collaborator list/invite form, dashboard badges styles.

---

## Session 2026-05-23 (7) — Rebranding: BugDrop → BCSDLab. Arcade

### Backend
- `User` model: added `role` (`user`|`admin`), `status` (`pending`|`approved`|`rejected`). First registered user is automatically `admin` + `approved` (bootstrap).
- `middleware/auth.js`: Added `requireApproved`, `requireAdmin`.
- `auth.js`: Included role/status in register/login responses. New admin routes: `GET /api/auth/admin/users`, `PATCH /api/auth/admin/users/:id`, `DELETE /api/auth/admin/users/:id`. Prevented demoting/deleting the last admin.
- `Game` model: added `visibility` (`private`|`public`, default private), `description` (500-char max), `thumbnailUrl`.
- `games.js`: Applied `requireApproved` to all auth routes. `PATCH` allows updating visibility and description. New: `POST/DELETE /:gameId/thumbnail` (image upload limited to 5MB, supports png/jpeg/webp/gif), `GET /api/games/arcade` (public gallery, showing only games with active builds).
- `index.js`: Created `storage/thumbnails/` directory and added static serving for `/thumbnails/:filename`.
- Limit collaborator searches to users with status: `approved`.

### Frontend — Rebranding
- Service name: **BugDrop** → **BCSDLab. Arcade**. Created `components/BrandLogo.jsx` (two-tone wordmark). Used across all pages (Dashboard, GameDetail, IssueDetail, Login, Register, Landing, Arcade, Admin, Pending).
- Overhauled `index.html` title, README, `i18n` (brand/copy/namespaces). Removed consumer-facing copywriting (e.g. "no credit card required"). Retuned tone as an internal tool.

### Frontend — New Pages
- **`/`** Landing page rewrote: hero + 6 feature cards + 3 showcase sections (mock dashboard/F2 overlay/arcade gallery) + 4-step flow (dark band) + CTA + footer. Focused on "no WebGL downloads," "F2 in-game reports," "automated debug snapshot," "Discord webhooks," "Arcade gallery," and "collaborators".
- **`/arcade`** (`ArcadePage`): Public/active-build game grid. Thumbnail falls back to gradient, shows game name, developer, description, latest version + Play button. Guests allowed.
- **`/pending`** (`PendingPage`): Waiting screen for pending/rejected users. "Check again" button refreshes status via `/api/auth/me`, auto-redirects to `/dashboard` upon approval.
- **`/admin/users`** (`AdminUsersPage`): Admin only. Filter chips (all/pending/approved/rejected), table: name/email/role/status/joined/actions. Inline actions for approve, reject, promote, demote, delete. GitHub provider badge, "you" badge.
- `App.jsx`: Added 4 new routes (`/arcade`, `/pending`, `/admin/users`). Added `requireApproved`/`requireAdmin` options in `ProtectedRoute`.
- `LoginPage`, `RegisterPage`, `AuthCallbackPage`: Redirect unapproved users to `/pending`.

### Frontend — GameDetailPage Arcade Settings
- Settings tab: `ArcadeSection` (owner only) — Private/Public card radio buttons, description textarea (500-char counter), 16:9 thumbnail upload/replace/remove, disables Public visibility with a warning if no active build exists.
- `api.js`: Added `getArcadeGames`, `uploadThumbnail`, `deleteThumbnail`, `listAllUsers`, `updateUser`, `deleteUser`.

### Decisions
- Service Name: **BCSDLab. Arcade** (chosen by user). Arcade gallery starts as a simple card grid — search/filter/tags deferred until game count grows.
- First-user auto-admin bootstrap: allows operator to approve other users without separate database seeding.
- Thumbnail storage: `storage/thumbnails/<gameId>.<ext>`, one per game. Cleans up old extensions on upload.
- Pending users get 403 on protected endpoints (e.g. `/api/games`, `/api/auth/usage`) — frontend redirects them to `/pending` page.

---

## Session 2026-05-23 (6) — ReportPage UX Improvement

### Completed
- **Layout Restructuring**: Extracted 'Browse Reports' list from the right panel tab, moved below form in full width. Right panel now dedicated exclusively to the Debug Snapshot (tabs removed).
- **Category tag selection**: Added chip picker (Bug/Suggestion presets) in the submission form. Selected tags are included in `POST /api/issues` payload.
- **Anonymous comments for testers**: Relaxed `POST /api/issues/:id/comments` to `optionalAuth`. Guest players can post comments by providing a name (defaults to 'Anonymous'). Added `authorName` parameter to `addComment` in `api.js`.

---

## Session 2026-05-26 — Full Blog Feature Implementation

### Backend
- Created `BlogPost` model: `title`, `slug` (unique index, auto-generated), `summary`, `content` (raw markdown), `coverImageUrl`, `tags[]`, `published` (bool), `publishedAt`, `author` (ref User), timestamps.
- Created `server/src/routes/blog.js`:
  - `GET /api/blog` — List published posts (published=true, sorted by latest, supports ?page&limit&tag).
  - `GET /api/blog/:slug` — Get single published post by slug.
  - `GET /api/blog/admin/posts` — Admin: List all posts (including drafts).
  - `GET /api/blog/admin/posts/:id` — Admin: Get full post details.
  - `POST /api/blog/admin/posts` — Admin: Create post. Slug collisions auto-resolved with -1, -2 suffixes.
  - `PATCH /api/blog/admin/posts/:id` — Admin: Edit post. Sets publishedAt automatically on initial publish.
  - `DELETE /api/blog/admin/posts/:id` — Admin: Delete post.
- `index.js`: Mount `blogRouter` at `/api/blog`.

### Frontend — Packages
- Installed `marked` (markdown parser) and `dompurify` (XSS sanitizer).

### Frontend — API (`web/src/api.js`)
- Added `listBlogPosts`, `getBlogPost`, `listAdminBlogPosts`, `getAdminBlogPost`, `createBlogPost`, `updateBlogPost`, `deleteBlogPost`.

### Frontend — Public Blog Pages
- `BlogListPage.jsx` + `BlogListPage.css` (`/blog`): Grid layout, 16:9 cover image with hover zoom, tag badges, summary, date, author, pagination. Matches Arcade page layout.
- `BlogPostPage.jsx` + `BlogPostPage.css` (`/blog/:slug`): markdown-body rendering via `marked` + `DOMPurify` + `highlight.js` (dark code blocks, tables, images, blockquotes, etc.).

### Frontend — Admin CMS
- `AdminBlogPage.jsx` + `AdminBlogPage.css` (`/admin/blog`): Table of all posts, status badges (published/draft), actions (edit, preview, delete).
- `AdminBlogEditorPage.jsx` + `AdminBlogEditorPage.css` (`/admin/blog/new`, `/admin/blog/:id/edit`):
  - Three view modes: Write / Split / Preview.
  - 12 toolbar actions: H2, H3, Bold, Italic, inline code, codeblock, link, bullet list, ordered list, blockquote, horizontal rule, image.
  - Tab key inserts 2-space indentation.
  - Auto-slug (from title) with manual override support.
  - Meta fields for title, slug, summary, tags, cover URL.
  - Publish toggle switch + separate "Save as Draft" / "Publish" buttons.

### Frontend — Navigation & Routing
- `App.jsx`: Added routes for `/blog`, `/blog/:slug`, `/admin/blog`, `/admin/blog/new`, and `/admin/blog/:id/edit` (admin protected).
- `LandingPage.jsx`, `ArcadePage.jsx`: Added Blog link next to Arcade in nav bar.
- `DashboardPage.jsx`, `AdminUsersPage.jsx`: Added Blog CMS link in sidebar.
- `i18n.jsx`: Added `nav.blog`, `nav.blogAdmin`, and `blog.*` namespaces in both English and Korean.

### Decisions
- Markdown rendering: `marked` (leveraging pre-installed `highlight.js` to minimize dependencies) + `DOMPurify`.
- Public access allowed for blog list/details without auth. Create/edit/delete restricted to `requireAdmin`.
- Image upload and static serving successfully integrated (local storage at `storage/blog-images/` and served at `/blog-images/:filename`).
- Build verification: successful `npm run build` with zero errors.

---

## Session 2026-05-26 (2) — Blog Image Upload Feature

### Backend
- Created `storage/blog-images/` directory and registered `/blog-images/:filename` route for static serving.
- New admin API endpoint `POST /api/blog/admin/upload-image` (multer-powered, 5MB limit, supports png/jpeg/webp/gif, random unique filename).

### Frontend — API & i18n
- Added `uploadBlogImage(file)` to `api.js`.
- `i18n.jsx`: Expanded namespaces with English/Korean translations for drag-and-drop, cover upload limits, uploading status, etc.

### Frontend — CMS Editor UX Improvements
- **Cover Image Upload**: Redesigned as a beautiful 16:9 dropzone with cover image preview. Supports drag-and-drop / local file browse, with "Remove" / "Replace" controls.
- **Content Image Upload (Drag-and-Drop / Paste)**:
  - Renders a glassmorphism drag-over overlay when dragging images over the textarea.
  - Triggers immediate upload when user drops or pastes (`Ctrl+V`) an image.
  - Inserts temporary placeholder `![Uploading file_name...]()` at cursor position. Auto-replaces it with final markdown `![file_name](imageUrl)` on upload success.
- **Toolbar Image Action**: Clicking 🖼️ opens a mini modal supporting local file upload or manual web image URL entry.

---

## Session 2026-05-28 — Blog write permission for all approved users

### Completed
- **Backend**: All `requireAdmin` guards on blog write routes replaced with `requireApproved`.
  - `GET /api/blog/admin/posts` — admin sees all posts; others see only their own.
  - `GET /api/blog/admin/posts/:id` — 403 if not own post and not admin.
  - `POST /api/blog/admin/posts` — any approved user can create.
  - `PATCH /api/blog/admin/posts/:id` — 403 if not own post and not admin (ownership check moved before update).
  - `DELETE /api/blog/admin/posts/:id` — 403 if not own post and not admin.
  - `POST /api/blog/admin/upload-image` — any approved user.
- **Frontend**:
  - `App.jsx`: blog CMS routes (`/admin/blog*`) changed from `requireAdmin` to standard `ProtectedRoute` (approved only).
  - `DashboardPage.jsx`: Blog CMS nav link shown to all approved users; Admin Users link stays admin-only.
  - `AdminBlogPage.jsx`: Edit/Delete buttons visible only to post author or admin.

---

## Session 2026-05-28 — Dark Mode

### Completed
- **`ThemeContext.jsx`**: reads `localStorage` + `prefers-color-scheme` on init, writes `data-theme` attribute to `<html>`, exposes `theme`/`toggleTheme`.
- **`DarkModeToggle.jsx`**: sun/moon SVG button with `.dark-mode-toggle` global style in `index.css`.
- **`index.css`**: added `[data-theme="dark"]` override block (canvas, ink, hairline, shadow, primary, link tokens).
- **`main.jsx`**: wrapped app with `<ThemeProvider>`.
- Added `DarkModeToggle` to every page nav/sidebar footer:
  - Landing, Arcade, BlogList, BlogPost, Play, Report (public nav bar)
  - Login (auth topbar — wrapped in `auth-topbar-right` flex container)
  - Dashboard, GameDetail, IssueDetail, AdminUsers, AdminBlog, AdminBlogEditor (sidebar footer, `dash-footer-row` layout)
- **`DashboardPage.css`**: added `.dash-footer-row` (flex row for lang toggle + dark mode button).
- **`AuthPage.css`**: added `[data-theme="dark"] .auth-topbar` + `.auth-topbar-right`.

---

## Session 2026-05-29 — Cloudflare Turnstile bot challenge + Blog comments

### Backend
- `server/src/middleware/turnstile.js` (new): `requireTurnstile` (all callers) and `requireTurnstileIfGuest` (guests only, after optionalAuth). Both skip when `TURNSTILE_SECRET_KEY` is unset (dev mode).
- `BlogPost` model: added `comments` subdocument array (`body`, `authorName`, `createdAt`).
- `server/src/routes/blog.js`:
  - `POST /api/blog/:slug/comments` — optionalAuth + requireTurnstileIfGuest. Authenticated users can comment freely; guests must pass Turnstile.
  - `DELETE /api/blog/:slug/comments/:commentId` — requireAuth.
- `server/src/routes/issues.js`: `POST /` now uses `requireTurnstile` (always verify for public report submission).
- `server/.env.example` + `web/.env.example`: documented `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY`. Default dev sitekey `1x00000000000000000000AA` (always-passes test key).

### Frontend
- `web/src/components/TurnstileWidget.jsx` (new): mounts Cloudflare Turnstile widget from CDN (`render=explicit`). Single script load shared across all instances. Exposes `onToken`, `onExpire`, `resetRef`, `theme` props.
- `LoginPage.jsx`: renders TurnstileWidget; GitHub/Discord OAuth buttons are dimmed and click-blocked until challenge passes. Uses `SKIP_CHALLENGE` flag so dev sitekey (always-passes) auto-unlocks.
- `ReportPage.jsx`: TurnstileWidget inserted above submit button. Token included as `turnstileToken` in `postIssue` payload. Widget resets after submit (success or error).
- `BlogPostPage.jsx`: full comment section below article body — comment list, delete button (admin only), comment form with name field for guests, TurnstileWidget for guests only. `addBlogComment` / `deleteBlogComment` wired.
- `web/src/api.js`: added `addBlogComment(slug, body, authorName, turnstileToken)`, `deleteBlogComment(slug, commentId)`.
- `web/src/i18n.jsx`: added `auth.turnstileHint`, `blog.comments/noComments/leaveComment/commentPlaceholder/guestNamePlaceholder/submitComment/posting/deleteComment/commentError` in both en/ko.
- `BlogPostPage.css`: comment list, comment item, comment form, Turnstile hint styles.

### Decisions
- Guest blog commenters must pass Turnstile; authenticated users are trusted (no widget shown).
- Login page: challenge is client-side only (OAuth redirect provides its own security); `SKIP_CHALLENGE=true` when test sitekey detected so local dev is unaffected.
- Report submission (`POST /api/issues`): always requires Turnstile server-side (public tester endpoint).

---

## Session 2026-07-06 — StreamingAssets upload/serving support

### Completed
- **Server**: `POST /:gameId/builds` now accepts an optional `streamingAssetsZip` field (`upload.fields([{name:'files'},{name:'streamingAssetsZip',maxCount:1}])`) alongside the existing flat `files` array. New `extractStreamingAssetsZip()` helper (`games.js`) uses `adm-zip` to extract the zip into `storage/builds/<buildId>/StreamingAssets/`, preserving nested folder structure, stripping a single enclosing `StreamingAssets/` wrapper if the developer zipped the folder itself, and defensively re-validating each entry path against zip-slip. Extracted relative paths (e.g. `StreamingAssets/sub/file.json`) are appended to the existing `Build.files.other[]` array — no schema change needed.
- `buildUrls()` in `games.js` now derives `streamingAssets: "/builds/<id>/StreamingAssets"` (or `null`) by checking `files.other` for a `StreamingAssets/` prefix; flows through `playResponse()` unchanged otherwise.
- Static file server (`index.js` `/builds/:buildId/*`) needed **no changes** — its wildcard route already served arbitrary nested paths correctly.
- **Frontend**: `UnityGame.jsx` accepts/passes a new `streamingAssetsUrl` prop into `useUnityContext`. `PlayPage.jsx` passes `buildInfo.urls.streamingAssets` through. `GameDetailPage.jsx` upload form gained a second, optional "StreamingAssets (zip)" file field (single `.zip`); `api.js`'s `uploadBuild()` appends it as `streamingAssetsZip` when present. Build list rows show a `StreamingAssets` chip when present. i18n strings added (en/ko).
- `unity/README.md`: documented the StreamingAssets zip-upload workflow under "WebGL build settings".
- New dependency: `server/package.json` → `adm-zip`.

### Verified
- Registered a test admin user directly (email/password register route no longer exists — only GitHub/Discord OAuth remain; minted a JWT manually with the server's `JWT_SECRET` for API testing), created a game, uploaded 4 fake build files + a zip containing `root.json` and `sub/nested.json`.
- Confirmed `Build.files.other` = `["StreamingAssets/root.json","StreamingAssets/sub/nested.json"]`, files landed correctly on disk under `storage/builds/<id>/StreamingAssets/...`, `GET /api/games/play/:slug` returned `urls.streamingAssets`, and `GET /builds/<id>/StreamingAssets/sub/nested.json` served the file. Confirmed `..` traversal attempts still 400. Cleaned up all test data (user/game/build) afterward.

### Decisions
- Kept the existing flat multi-file `Build/` upload picker unchanged; StreamingAssets is a separate optional zip upload rather than switching to a `webkitdirectory` folder picker — avoids touching the existing upload flow and matches how a developer would naturally hand off a folder (zip it). User confirmed this choice over the folder-picker alternative.

---

## 2026-07-07 — Per-game server backend: Top-N leaderboards + dynamic JSON config

### Server
- `Game.serverBackend` sub-object: `leaderboardEnabled`, `configEnabled`, `secret` (64-hex, rotatable), `secretRotatedAt`.
- `Leaderboard` model: `gameId`, `key`, `label`, `sort` (`desc`/`asc`), `maxEntries` (≤100), `scoreMin`/`scoreMax` (optional anti-cheat bounds), embedded `entries[]`. Top-N enforced atomically via `$push` + `$each` + `$sort` + `$slice` — no unbounded growth.
- `GameConfig` model: `gameId`, `key`, `value` (raw JSON string, validated with `JSON.parse` on write), `enabled`.
- `services/gameSecret.js`: HMAC/session-token helpers (`issueSessionToken`, `verifySessionToken`, 120s TTL).
- `services/rateLimiter.js`: in-memory single-use nonce store + fixed-window rate limiter (single-process only — no Redis/Mongo TTL backing yet).
- `middleware/gameHmac.js`: `verifyGameHmac({ requireFeature, consumeNonce })` — verifies `X-Arcade-Session/-Timestamp/-Signature` headers against the per-game secret; nonce consumption only on score submit (single-use), not on reads.
- `index.js`: `express.json()` now captures `req.rawBody` via a `verify` callback so HMAC verification hashes the exact bytes the client signed (not a re-`JSON.stringify`'d approximation).
- `routes/backend.js`: dashboard CRUD (`/api/games/:gameId/backend/...`, JWT) for settings/secret-rotate/leaderboards/config/generated-code, plus public HMAC'd routes (`/api/games/play/:gameSlug/backend/...`) for handshake/submit/read. No public unsigned leaderboard-read endpoint exists.
- `services/codegen.js`: generates a per-game `ServerBridge.cs` (coroutine-based `UnityWebRequest`, singleton, hand-rolled JSON escaping matching `IssueTrackerIntegration.cs`'s style) + an integration guide, with the secret embedded as an XOR-obfuscated byte array (explicitly documented as *not* real security — real protection is server-side session/nonce/rate-limit/score-bounds).

### Web
- `ServerIntegrationTab.jsx` (new): feature toggles, leaderboard manager (create/edit/delete + view/delete entries), config manager (create/edit/delete keys), generated-code viewer + guide. Mounted as a new "서버와 통합" tab in `GameDetailPage.jsx`, sibling to "게임에 통합".
- `GameDetailPage.jsx`: exported `CodeBlock` so `ServerIntegrationTab.jsx` can reuse it (small circular import between the two files — resolves fine since both usages are inside function bodies, not module-eval time; confirmed via `vite build`).
- `api.js`: client functions for all `/backend` dashboard endpoints.
- `i18n.jsx`: full en/ko key set under `gameDetail.si*`, including the security-limitation notice shown in the dashboard.

### Verified
- Full flow tested end-to-end against a live server + MongoDB with a throwaway test user/game (cleaned up after): dashboard secret rotation, leaderboard/config CRUD, generated-code fetch; public handshake → signed submit → signed read; Top-N capping (verified 4 submits against `maxEntries=3` correctly dropped the lowest); score-range rejection (400 outside `[scoreMin,scoreMax]`); replay rejection (409 on reusing a session's `jti` for a second submit); missing/invalid signature rejection (401); unknown game slug (404).
- `vite build` succeeds with the new tab wired in — no import or JSX errors.

### Decisions made (with product owner)
- Multiple named leaderboards per game (not single).
- Single-process deployment assumed — in-memory nonce/rate-limit state is acceptable; would need Redis or a Mongo TTL collection to go multi-instance.
- Leaderboard `scoreMin`/`scoreMax` anti-cheat bounds: included, optional per leaderboard.
- No public unsigned leaderboard-read endpoint (e.g. for embeddable web widgets) — deliberately not built.
- Secret embedding in generated code: XOR-obfuscated byte array (not plaintext, not a separate gitignored asset) — accepted that Inspector-serialized fields are equally exposed if committed (Unity scene/prefab YAML is text), so obfuscating in the generated `.cs` is the simplest option that still avoids tripping plaintext secret scanners.

### Open / TODO
- If deployment ever goes multi-instance, replace the in-memory nonce/rate-limiter with a Redis or Mongo-TTL-backed store.
- No automated tests for the new routes/services (repo still has no test suite configured).

## Open / TODO (as of 2026-05-29)

- No tests or linter configured (prefer Vitest for web, `node --test` for server).
- Production: rate-limit `POST /api/issues`; validate upload file types server-side.
- `unity/` is a drop-in folder, not a real Unity project — E2E flow untested with an actual WebGL build.

## Decisions made
- Auth: JWT (not sessions). GitHub OAuth produces same JWT format as email/password.
- Build storage: local filesystem (`server/storage/builds/<buildId>/`). S3 deferred.
- URL shape: `/play/:gameSlug` (active build) + `/play/:gameSlug/:buildId` (specific build).
- Compression: server detects `.br`/`.gz` suffix and sets `Content-Encoding` accordingly.

---

## Session 2026-07-27 - Unity WebGL keyboard input diagnostics

### Investigation
- No play-route React or third-party listener was found that cancels ordinary
  `W/A/S/D` events. The dashboard modal Escape listener is not mounted on
  `/play` and does not cancel keyboard events.
- The uploaded Unity framework registers Emscripten keyboard callbacks and
  calls `preventDefault()` only when its Unity callback reports the event as
  handled.
- Leading suspects are the service canvas's explicit `tabIndex={1}`, its focus
  state, the build's `WebGLInput.captureAllKeyboardInput` value, and the older
  `inputmode="none"` workaround. The IME-only explanation is contradicted by
  reproduction with an English input source and on macOS.

### Completed
- Added opt-in diagnostics at `?unityKeyboardDebug=1`.
- Diagnostics record keyboard/composition propagation checkpoints, active
  element, composed path, cancellation method stacks, listener registrations,
  pointer/focus transitions, and canvas input attributes.
- Added `window.__unityKeyboardDebug.export()` for copying a complete JSON trace.
- Added `docs/unity-keyboard-input-debugging.md` with findings and collection
  instructions.

### Verified
- `npm run build` succeeds.
- Headless Chrome delivered a trusted `KeyW` event to the focused Unity canvas;
  all capture/bubble checkpoints and JSON export were recorded correctly.

### Next
- Collect failing normal-input and successful composition-input traces from the
  deployed game before changing focus or keyboard-capture behavior.

---

## Session 2026-07-27 - Production keyboard trace analysis

### Findings
- Analyzed `log.txt` from `/play/my-universe`: 172 trusted keyboard events,
  Unity loaded, and the canvas focused for all recorded game-key events.
- No composition events were captured; all recorded events had
  `isComposing=false`, so the successful IME path still needs a separate trace.
- All 43 `A/S/D` keydown/keyup events stopped after `document:bubble` and never
  reached the window bubble checkpoint. `W` and Escape reached window normally.
- Only Unity/Emscripten keyboard listeners were registered during the trace:
  keydown/keyup/keypress on both window and canvas. No React hotkey listener was
  found.
- The production HTML is transformed by Cloudflare Rocket Loader, and Unity
  keyboard callback stacks include `rocket-loader.min.js`. Rocket Loader is now
  the strongest service-only interference candidate, but requires an A/B test.

### Next
- Disable Rocket Loader for `/play/*` with a Cloudflare Configuration Rule,
  purge/cache-bypass, and retest before changing Unity canvas behavior.
- If needed, add `data-cfasync="false"` to the app entry script as a secondary
  exclusion and capture a separate successful IME/composition trace.

---

## Session 2026-07-27 - Rocket Loader A/B result

### Findings
- Confirmed Rocket Loader was actually disabled, not merely cached: production
  HTML contains an unmodified `type="module"` entry script, and `output2.txt`
  contains no Rocket Loader registration or callback stack.
- The input problem persists without Rocket Loader, so it is not the root cause.
- Before the address-bar trick, `D` produces only `key=d`, `code=KeyD`,
  `keyCode=68`; it stops after `document:bubble`, while `W` reaches window and
  is accepted by Unity.
- After the trick, each `A/D` press produces a `key=Process`, `keyCode=229`
  keydown followed by the ordinary 65/68 event. The Process event retains
  `code=KeyA/KeyD`, reaches window, and makes the game respond.
- The next service-vs-standalone A/B targets are the forced canvas
  `inputmode="none"` attribute and positive `tabIndex={1}`.

### Next
- Remove only `inputmode="none"` and retest first.
- If unchanged, use the standalone Unity template's canvas tabindex behavior
  (typically `-1`) and retest separately.
- Extend diagnostics to capture direct `cancelBubble`/`returnValue` writes and a
  late document-bubble checkpoint if event propagation still diverges by key.

---

## Session 2026-07-27 - Extension-resistant Unity keyboard capture

### Finding
- Confirmed the remaining failure was caused by a browser extension. With
  extensions disabled, ordinary Unity keyboard input works.
- Blocked events still reach `window:capture`; Unity/Emscripten's six keyboard
  `jsEventHandler` listeners were registered for the bubble phase.

### Completed
- Added a narrowly scoped EventTarget wrapper before Unity initialization.
- Forces `capture: true` only for Unity's window/canvas
  `keydown`/`keypress`/`keyup` `jsEventHandler` registrations.
- Mirrors the forced capture option on removal and cleans up captured listeners
  when the Unity view unmounts.
- Keeps all non-Unity event listeners unchanged.

### Verified
- `npm run build` succeeds.
- Headless Chrome confirmed a `jsEventHandler` requested with `capture:false`
  runs at event phase 1, while an ordinary listener remains at event phase 3.
- Confirmed the forced listener is removed correctly and diagnostics report
  `capture:true` for both its add and remove operations.
