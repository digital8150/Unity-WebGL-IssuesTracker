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

### Completed — nolt.io-급 피드백 관리 기능
- **Issue 모델 확장**: `status` (open/in-progress/resolved/closed), `priority` (none/low/medium/high), `tags` ([String]), `comments` (subdocument: body, authorName, timestamps) 추가.
- **Issues API 확장**:
  - `PATCH /api/issues/:id` — status/priority/tags 업데이트 (auth 필요).
  - `POST /api/issues/:id/comments` — 댓글 추가 (auth 필요, authorName은 JWT에서 추출).
  - `DELETE /api/issues/:id/comments/:commentId` — 댓글 삭제 (auth 필요).
- **Games reports 필터링**: `GET /api/games/:gameId/reports?status=&priority=&tag=` 지원. select에 status/priority/tags 추가.
- **api.js**: `updateIssue`, `addComment`, `deleteComment` 추가. `getGameReports`에 필터 파라미터 지원.
- **GameDetailPage Reports 탭**:
  - 필터 바 (텍스트 검색 + 상태 칩 필터 + 우선순위 드롭다운 + 정렬) — 클라이언트 사이드 필터링.
  - 각 리포트 행에 색깔 배지 (StatusBadge) + 우선순위 점 (PriorityDot) 표시.
  - 행 우측에 빠른 상태 변경 select 드롭다운.
  - `ReportsTab` 컴포넌트로 분리.
- **IssueDetailPage**:
  - 트리아지 패널 (상태 버튼 그룹 + 우선순위 버튼 그룹 + 태그 칩 입력) — 낙관적 업데이트.
  - 댓글 섹션: 댓글 목록 + 작성 폼 + 삭제 버튼.
- **i18n**: `triage` 네임스페이스 추가 (en/ko 모두).
- **CSS**: 필터 바, 상태 배지, 우선순위 점, 트리아지 패널, 댓글 스타일 추가.

---

## Session 2026-05-23 (5)

### Completed — 투표·테스터 보드·협업자 초대

**백엔드**
- `auth.js`: `signToken`에 `name` 포함. `GET /api/auth/search-users?q=` — 이름/이메일로 유저 검색 (auth 필요).
- `middleware/auth.js`: `optionalAuth` 추가 (토큰 있으면 파싱, 없으면 그냥 통과).
- `Issue` 모델: `votes: [ObjectId]` 필드 추가.
- `issues.js`: `POST /:id/vote` — 토글 방식, 임의 인증 유저. `POST /:id/comments` — 임의 인증 유저로 완화 (게임 소유자 불필요).
- `Game` 모델: `collaborators: [ObjectId]` 필드 추가.
- `games.js` 전면 재작성:
  - `isOwner` / `isAuthorized` 헬퍼.
  - `GET /api/games` — 소유+협업 게임 통합 반환, `isOwner` 플래그 포함.
  - `GET/PATCH /:gameId` — PATCH는 소유자 전용, GET은 협업자 허용.
  - Build upload/activate — 협업자 허용. Build 삭제 — 소유자 전용.
  - `GET /:gameId/reports` — 협업자 허용, `voteCount/hasVoted` 포함.
  - `GET /:gameId/collaborators` — 협업자 목록.
  - `POST /:gameId/collaborators` — 이메일로 초대 (소유자 전용).
  - `DELETE /:gameId/collaborators/:userId` — 제거 (소유자 전용).
  - `GET /play/:gameSlug/issues` — **공개** 이슈 보드 (optionalAuth, closed 제외, 투표순 정렬).

**프론트엔드**
- `api.js`: `voteIssue`, `getPublicIssues`, `getCollaborators`, `inviteCollaborator`, `removeCollaborator`, `searchUsers` 추가.
- `i18n.jsx`: `collab`, `board` 네임스페이스 추가 (en/ko).
- `ReportPage.jsx`: 우측 패널 탭화 (Debug Snapshot | Browse Reports). Browse 탭에서 게임의 공개 이슈 목록 열람, 투표 버튼, 댓글 확장 패널, 미로그인 시 로그인 유도. 네비게이션 바에 로그인 링크 추가.
- `IssueDetailPage.jsx`: 헤더에 투표 버튼(카운트+토글), 로그인 필요 시 비활성.
- `GameDetailPage.jsx`: Settings 탭에 `CollaboratorSection` 컴포넌트 — 협업자 목록 + 이메일 초대 폼 + 제거 버튼 (소유자 전용). Discord webhook은 소유자에게만 표시.
- `DashboardPage.jsx`: 협업자로 참여한 게임에 "Collaborator" 배지 표시.
- CSS: 협업자 목록/초대 폼, 대시보드 배지 추가.

---

## Session 2026-05-23 (7) — 리브랜딩: BugDrop → **BCSDLab. Arcade**

### Backend
- `User` 모델: `role` (`user`|`admin`), `status` (`pending`|`approved`|`rejected`) 추가. 최초 가입자는 자동 `admin` + `approved` (bootstrap).
- `middleware/auth.js`: `requireApproved`, `requireAdmin` 추가.
- `auth.js`: register/login 응답에 role/status 포함. 신규 admin 라우트 `GET /api/auth/admin/users`, `PATCH /api/auth/admin/users/:id`, `DELETE /api/auth/admin/users/:id`. 마지막 admin demote/delete 차단.
- `Game` 모델: `visibility` (`private`|`public`, default private), `description` (500자), `thumbnailUrl` 추가.
- `games.js`: 모든 인증 라우트에 `requireApproved` 적용. PATCH가 visibility/description 수정 허용. 신규: `POST/DELETE /:gameId/thumbnail` (이미지 업로드 5MB 제한, png/jpeg/webp/gif), `GET /api/games/arcade` (public 갤러리, active build 있는 게임만 노출).
- `index.js`: `storage/thumbnails/` 디렉터리 + `/thumbnails/:filename` 정적 서빙.
- 협업자 초대는 `status: 'approved'` 인 유저만 검색되도록 제한.

### Frontend — 리브랜딩
- 서비스 이름: **BugDrop** → **BCSDLab. Arcade**. `components/BrandLogo.jsx` 신설 (두 톤 워드마크). 모든 페이지(Dashboard, GameDetail, IssueDetail, Login, Register, Landing, Arcade, Admin, Pending)에서 사용.
- `index.html` title, README, i18n 전면 개편 (브랜드/카피/네임스페이스). "신용카드 불필요" 등 소비자형 멘트 제거. 트랙 내부 도구로 톤 재조정.

### Frontend — 신규 페이지
- **`/`** Landing 재작성: hero + 6개 feature card + 3개 showcase 섹션 (mock 대시보드/F2 오버레이/아케이드 갤러리) + 4-step flow (다크 밴드) + CTA + footer. 새 카피는 "WebGL 다운로드 불필요", "F2 인게임 리포트", "자동 디버깅 스냅샷", "Discord 웹훅", "Arcade 갤러리", "협업자" 중심.
- **`/arcade`** (`ArcadePage`): public/active-build 게임 그리드. 썸네일 → 폴백 그라디언트, 게임명, 개발자명, 설명, latest version + Play 버튼. 비로그인 접근 허용.
- **`/pending`** (`PendingPage`): 신규 가입자 / rejected 유저용 대기 화면. "Check again" 버튼은 `/api/auth/me`로 상태 새로고침, 승인되면 자동으로 `/dashboard`.
- **`/admin/users`** (`AdminUsersPage`): admin 전용. 필터 칩(all/pending/approved/rejected), 테이블: 이름/이메일/role/status/joined/actions. approve, reject, promote, demote, delete 인라인 액션. GitHub 가입자 배지, "you" 배지.
- `App.jsx`: 신규 라우트 4개 (`/arcade`, `/pending`, `/admin/users`) 추가. `ProtectedRoute`에 `requireApproved`/`requireAdmin` 옵션 추가.
- `LoginPage`, `RegisterPage`, `AuthCallbackPage`: 승인되지 않은 유저는 `/pending`으로 리다이렉트.

### Frontend — GameDetailPage 아케이드 설정
- Settings 탭에 `ArcadeSection` 신설 (소유자 전용): Private/Public 카드형 라디오, 설명 텍스트에어리어 (500자 카운터), 16:9 썸네일 업로드/교체/제거, 활성 빌드 없으면 Public 비활성 + 경고 표시.
- `api.js`: `getArcadeGames`, `uploadThumbnail`, `deleteThumbnail`, `listAllUsers`, `updateUser`, `deleteUser` 추가.

### Decisions
- 서비스 이름: **BCSDLab. Arcade** (사용자가 후보 중 선택). 아케이드 갤러리는 단순 카드 그리드로 시작 — 검색/필터/태그는 게임 수가 늘면 추가.
- 최초 가입자 자동 admin 전략: 운영자가 별도 시드 없이 첫 가입 후 본인 계정으로 다른 사용자 승인 가능.
- 썸네일 저장: `storage/thumbnails/<gameId>.<ext>` 한 게임당 한 장. 이전 확장자는 업로드 시 정리.
- pending 유저는 `/api/games`, `/api/auth/usage` 등 모든 보호 라우트에서 403 — 프론트는 `/pending` 화면으로 우회.

---

## Session 2026-05-23 (6)

### Completed — ReportPage UX 개선
- **레이아웃 재구성**: 리포트 보기(Browse Reports)를 우측 패널 탭에서 꺼내 폼 아래 전체 너비 섹션으로 이동. 우측 패널은 항상 디버그 스냅샷만 표시 (탭 제거).
- **리포트 제출 시 태그 선택**: 폼에 카테고리 칩 피커 추가 (Bug / Suggestion 프리셋). 선택한 태그가 `POST /api/issues` 페이로드에 포함됨.
- **테스터 익명 댓글**: `POST /api/issues/:id/comments` 를 `optionalAuth`로 변경. 비로그인 사용자도 이름 입력 후 댓글 작성 가능 (이름 미입력 시 'Anonymous'). `api.js` `addComment`에 `authorName` 파라미터 추가.

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
