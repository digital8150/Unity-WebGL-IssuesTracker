# BCSDLab. Arcade — Unity WebGL 배포 및 플레이테스트 플랫폼

BCSDLab. Game 트랙 내부 도구. Unity WebGL 빌드를 대시보드에서 업로드하고, 트랙원에게 플레이 URL을 공유하면 테스터가 브라우저에서 바로 플레이하며 버그/제안을 리포트할 수 있습니다. 모든 리포트에는 Unity 로그, 커스텀 게임 상태, 브라우저 환경, GPU 정보가 자동으로 포함됩니다. 공개 설정된 게임은 **Arcade** 갤러리에 노출됩니다.

## 레포 구조

```
unity/    C# 통합 스크립트 + .jslib 브릿지 (Unity 프로젝트에 복사해 사용)
web/      Vite + React — 개발자 대시보드 + 테스터 플레이 화면
server/   Express + Mongoose API — 인증, 빌드 저장, 이슈 수집, Discord 알림
```

## 빠른 시작

```sh
# 1. 백엔드
cd server
cp .env.example .env   # MONGO_URI, JWT_SECRET, 기타 설정
npm install
npm run dev            # :4000 에서 실행

# 2. 프론트엔드
cd ../web
npm install
npm run dev            # http://localhost:5173  (/api → :4000 프록시)
```

`http://localhost:5173` 에서 계정을 생성하면 개발자 대시보드로 이동합니다.

> 첫 번째 가입자는 자동으로 **admin** 권한이 부여됩니다. 이후 가입한 사용자는 admin이 승인해야 대시보드에 접근할 수 있습니다.

---

## 동작 방식

### 개발자 흐름

1. `/register` 에서 계정 생성 → admin 승인 대기.
2. 대시보드에서 **게임 생성** (이름, 슬러그 자동 생성).
3. **WebGL 빌드 업로드** — `.loader.js`, `.data`, `.framework.js`, `.wasm` 4개 파일을 업로드하면 서버에 저장됩니다.
4. 빌드를 **Activate** 하면 `/play/<gameSlug>` URL이 활성화됩니다.
5. 테스터에게 URL 공유 — 다운로드/설치 불필요.
6. 대시보드 **Reports 탭**에서 게임·빌드 단위로 리포트 확인, 상태·우선순위·태그 트리아지.
7. Settings 탭에서 Discord 웹훅, 아케이드 공개 여부, 썸네일, 협업자 초대 관리.

### 테스터 흐름

플레이 화면의 **버그 신고** 버튼을 누릅니다. 버튼은 Unity에 현재 상태 스냅샷 생성을 요청하고, 제목·설명을 작성할 별도 리포트 페이지를 새 탭으로 엽니다. 제출하면 다음 정보가 자동으로 첨부됩니다:

- Unity 콘솔 로그 (오류, 경고, 최근 N개)
- 커스텀 게임 상태 (위치, 레벨, HP 등 게임에서 노출한 값)
- 브라우저 메타데이터: GPU 렌더러, WebGL 버전, 화면 크기, 유저 에이전트
- 카테고리 태그 선택 (Bug / Suggestion 등)

비로그인 테스터도 **익명 댓글**을 작성할 수 있습니다.

### 데이터 흐름 (엔드-투-엔드)

```
플레이 화면의 버그 신고 버튼 → Unity C# (SendMessage) → .jslib 브릿지 → window.__issueTrackerReceive
                                                                                         ↓
                                              sessionStorage에 스냅샷 저장 → 별도 /report/<gameSlug> 페이지 열기
                                                                                         ↓
                                              브라우저 메타데이터 병합 → POST /api/issues → MongoDB + Discord 웹훅 (async)
```

---

## Unity 통합

Unity 프로젝트에 두 파일을 복사합니다:

| 파일 | 복사 위치 |
|------|-----------|
| `unity/Assets/Scripts/IssueTrackerIntegration.cs` | 임의의 `Scripts/` 폴더 |
| `unity/Assets/Plugins/WebGL/IssueTracker.jslib` | 반드시 `Assets/Plugins/WebGL/` 아래 |

씬에 `IssueTrackerIntegration` 컴포넌트를 붙인 GameObject를 생성하고 이름을 정확히 **`IssueTracker`** 로 설정합니다.

커스텀 게임 상태를 노출하려면 `OnCollectCustomState` 이벤트를 구독합니다:

```csharp
void Start() {
    IssueTrackerIntegration.OnCollectCustomState += collector => {
        collector["level"] = SceneManager.GetActiveScene().name;
        collector["hp"]    = player.health;
    };
}
```

---

## 주요 기능 목록

### 인증 / 사용자 관리
- 이메일+비밀번호 회원가입 / 로그인
- GitHub OAuth 로그인
- 역할: `user` / `admin`
- 상태: `pending` / `approved` / `rejected` (admin이 승인)
- 최초 가입자 자동 admin bootstrap

### 게임 / 빌드 관리
- 게임 생성, 슬러그 자동 생성
- WebGL 빌드 업로드 (멀티파트, multer memoryStorage → disk)
- 빌드 목록, 버전 activate, 빌드 삭제 (파일 + DB)
- 빌드별 스토리지 용량 추적 및 사이드바 쿼터 바 (80% 주황, 95% 빨강)

### 아케이드 갤러리 (`/arcade`)
- 공개(public) + 활성 빌드가 있는 게임만 노출
- 썸네일 업로드 (16:9, 최대 5MB, png/jpeg/webp/gif)
- 게임명, 개발자명, 설명, 최신 버전 + Play 버튼

### 이슈 리포트
- `status`: open / in-progress / resolved / closed
- `priority`: none / low / medium / high
- `tags`: 자유 태그 + Bug/Suggestion 프리셋 칩 피커
- `votes`: 로그인 유저 투표 (토글 방식)
- `comments`: 로그인/비로그인 모두 댓글 가능 (비로그인 시 이름 입력)

### 대시보드 Reports 탭 필터
- 텍스트 검색, 상태 칩, 우선순위 드롭다운, 정렬 (클라이언트 사이드)
- 각 행에 StatusBadge + PriorityDot
- 행 우측 빠른 상태 변경 드롭다운

### IssueDetailPage
- 빌드 정보, 브라우저 환경, 커스텀 게임 상태(JSON), 콘솔 로그(타입별 컬러, 스택 트레이스 확장)
- 트리아지 패널: 상태/우선순위 버튼 그룹 + 태그 칩 입력 (낙관적 업데이트)
- 댓글 섹션: 목록 + 작성 폼 + 삭제

### 협업자
- 게임 소유자가 이메일로 협업자 초대
- 협업자는 빌드 업로드/activate, 리포트 조회 가능 (삭제·설정 변경은 소유자 전용)
- 대시보드에서 협업 게임에 "Collaborator" 배지 표시

### Discord 웹훅
- 게임별 웹훅 URL 설정 (Settings 탭, 소유자 전용)
- `DISCORD_WEBHOOK_URL` 환경 변수를 전역 폴백으로 사용
- 이슈 저장 후 비동기 발송 (실패해도 저장 성공)

### 관리자 (`/admin/users`)
- 전체 사용자 목록 (필터: all / pending / approved / rejected)
- approve / reject / promote / demote / delete 인라인 액션
- 마지막 admin demote/delete 차단

### 다국어 (한국어 / 영어)
- `web/src/i18n.jsx` 에서 네임스페이스별 문자열 관리

---

## 환경 변수 (`server/.env`)

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/issue_tracker` | MongoDB 연결 문자열 |
| `JWT_SECRET` | Yes (prod) | 개발용 기본값 | JWT 서명 키 — **운영 환경에서는 반드시 설정** |
| `GAME_TOKEN_SECRET` | No | `JWT_SECRET`에서 별도 키 파생 | SDK v2 게임 토큰 전용 회전 키 |
| `PORT` | No | `4000` | API 서버 포트 |
| `CORS_ORIGIN` | No | `http://localhost:5173` | 허용 CORS 오리진 |
| `SERVER_URL` | No | `http://localhost:4000` | 빌드/썸네일 공개 URL 베이스 |
| `FRONTEND_URL` | No | `http://localhost:5173` | GitHub OAuth 콜백 리다이렉트 대상 |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth App Client Secret |
| `DISCORD_CLIENT_ID` | No | — | Discord OAuth App Client ID |
| `DISCORD_CLIENT_SECRET` | No | — | Discord OAuth App Client Secret |
| `DISCORD_WEBHOOK_URL` | No | — | 전역 Discord 웹훅 폴백 |

---

## API 요약

### 인증
| Method | Path | Auth | 설명 |
|--------|------|------|------|
| `POST` | `/api/auth/register` | — | 계정 생성 |
| `POST` | `/api/auth/login` | — | 로그인, JWT 반환 |
| `GET` | `/api/auth/me` | Bearer | 현재 유저 정보 |
| `GET` | `/api/auth/github` | — | GitHub OAuth 시작 |
| `GET` | `/api/auth/github/callback` | — | GitHub OAuth 콜백 |
| `GET` | `/api/auth/usage` | Bearer | 스토리지 사용량 조회 |
| `GET` | `/api/auth/search-users` | Bearer | 유저 검색 (협업자 초대용) |
| `GET` | `/api/auth/admin/users` | Admin | 전체 유저 목록 |
| `PATCH` | `/api/auth/admin/users/:id` | Admin | 유저 role/status 변경 |
| `DELETE` | `/api/auth/admin/users/:id` | Admin | 유저 삭제 |

### 게임 / 빌드
| Method | Path | Auth | 설명 |
|--------|------|------|------|
| `GET` | `/api/games` | Bearer | 내 게임 목록 (소유+협업) |
| `POST` | `/api/games` | Bearer | 게임 생성 |
| `GET` | `/api/games/arcade` | — | 공개 아케이드 목록 |
| `GET` | `/api/games/:gameId` | Bearer | 게임 상세 |
| `PATCH` | `/api/games/:gameId` | Bearer(owner) | 게임 설정 수정 |
| `POST` | `/api/games/:gameId/builds` | Bearer | 빌드 업로드 |
| `GET` | `/api/games/:gameId/builds` | Bearer | 빌드 목록 |
| `PATCH` | `/api/games/:gameId/builds/:buildId/activate` | Bearer | 빌드 활성화 |
| `DELETE` | `/api/games/:gameId/builds/:buildId` | Bearer(owner) | 빌드 삭제 |
| `POST` | `/api/games/:gameId/thumbnail` | Bearer(owner) | 썸네일 업로드 |
| `DELETE` | `/api/games/:gameId/thumbnail` | Bearer(owner) | 썸네일 삭제 |
| `GET` | `/api/games/:gameId/reports` | Bearer | 리포트 목록 (필터: status/priority/tag) |
| `GET` | `/api/games/:gameId/collaborators` | Bearer | 협업자 목록 |
| `POST` | `/api/games/:gameId/collaborators` | Bearer(owner) | 협업자 초대 |
| `DELETE` | `/api/games/:gameId/collaborators/:userId` | Bearer(owner) | 협업자 제거 |
| `GET` | `/api/games/play/:gameSlug` | — | 플레이용 빌드 URL 조회 (active) |
| `GET` | `/api/games/play/:gameSlug/:buildId` | — | 플레이용 빌드 URL 조회 (특정 빌드) |
| `GET` | `/api/games/play/:gameSlug/issues` | optionalAuth | 공개 이슈 보드 |
| `POST` | `/api/games/:gameId/backend/v2/dev-token` | Bearer(developer) | Unity Editor용 7일 개발 토큰 발급·재발급 |

### 인증 기반 게임 API v2

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| `POST` | `/api/v2/games/:gameSlug/play-token` | Site Bearer | 게임 범위 15분 토큰 발급 |
| `GET` | `/api/v2/me` | Game Bearer | 게임 토큰의 계정 정보 조회 |
| `POST` | `/api/v2/leaderboards/:key/scores` | Game Bearer | 계정별 최고 점수 제출 |
| `GET` | `/api/v2/leaderboards/:key` | Game Bearer | 계정 기반 리더보드 조회 |
| `GET` | `/api/v2/leaderboards/:key/me` | Game Bearer | 내 최고 점수와 순위 조회 |
| `GET` | `/api/v2/config/:key` | Game Bearer | 게임 동적 JSON 조회 |
| `GET/PUT/DELETE` | `/api/v2/saves/:slot` | Game Bearer | 사용자별 클라우드 세이브 관리 |

### 이슈
| Method | Path | Auth | 설명 |
|--------|------|------|------|
| `POST` | `/api/issues` | — | 이슈 제출 (별도 리포트 페이지) |
| `GET` | `/api/issues/:id` | — | 이슈 상세 |
| `PATCH` | `/api/issues/:id` | Bearer | status/priority/tags 업데이트 |
| `POST` | `/api/issues/:id/vote` | Bearer | 투표 토글 |
| `POST` | `/api/issues/:id/comments` | optionalAuth | 댓글 작성 |
| `DELETE` | `/api/issues/:id/comments/:commentId` | Bearer | 댓글 삭제 |

---

## 기술 스택

| 레이어 | 스택 |
|--------|------|
| 프론트엔드 | Vite + React 18, react-unity-webgl, react-router-dom |
| 백엔드 | Node 20+, Express 4, Mongoose 8 |
| 데이터베이스 | MongoDB |
| 인증 | JWT (jsonwebtoken + bcryptjs) + GitHub OAuth |
| 파일 저장 | 서버 로컬 파일시스템 (`server/storage/`) |
| 알림 | Discord Incoming Webhooks |

---

## 알려진 한계 / TODO

- 테스트·린터 미설정 (web: Vitest, server: `node --test` 권장).
- `POST /api/issues` rate-limit 미적용 (운영 전 추가 필요).
- 파일 업로드 시 서버 사이드 타입 검증 미흡.
- `unity/` 폴더는 드랍인 스크립트만 포함 — 실제 WebGL 빌드로 E2E 테스트 미진행.
- 빌드 파일 저장소: 현재 로컬 파일시스템. S3 등 오브젝트 스토리지로 전환 필요 (운영 시).
