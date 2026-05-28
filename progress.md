# Progress

Shared, append-only-ish status log. Update at the end of any session that changes scope or completes a milestone. Keep entries terse.

> **[CRITICAL INSTRUCTION FOR AI AGENTS]**
> Due to token efficiency, all entries in this progress file **MUST be written in English**. 

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

## Open / TODO (as of 2026-05-28)

- No tests or linter configured (prefer Vitest for web, `node --test` for server).
- Production: rate-limit `POST /api/issues`; validate upload file types server-side.
- `unity/` is a drop-in folder, not a real Unity project — E2E flow untested with an actual WebGL build.

## Decisions made
- Auth: JWT (not sessions). GitHub OAuth produces same JWT format as email/password.
- Build storage: local filesystem (`server/storage/builds/<buildId>/`). S3 deferred.
- URL shape: `/play/:gameSlug` (active build) + `/play/:gameSlug/:buildId` (specific build).
- Compression: server detects `.br`/`.gz` suffix and sets `Content-Encoding` accordingly.
