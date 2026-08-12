# SDK/API v2 — 인증 기반 GBaaS

## Context

현재 "서버와 통합"(API v1)은 게임별 **공유 시크릿**을 XOR 난독화해 WebGL 빌드에 심고, HMAC 서명으로 리더보드/동적 JSON을 호출한다. `server/src/services/codegen.js:143-151`의 헤더 주석이 스스로 인정하듯 이 시크릿은 기밀이 될 수 없고, 서버는 **호출자가 누구인지 전혀 모른다** (세션 페이로드가 `{gid, iat, exp, jti}` 뿐 — `server/src/services/gameSecret.js:29-34`). 리더보드 엔트리도 자유 텍스트 `name`만 저장한다.

여기에 **Arcade ID 인증**을 도입한다. 사이트에서 소셜 로그인한 사용자의 자격증명 토큰을 플레이 페이지가 Unity 인스턴스에 주입하고, 게임은 그 토큰을 `Authorization: Bearer`로 실어 서버를 호출한다. 이로써 (a) 리더보드가 계정 단위로 기록되고, (b) **사용자별 클라우드 세이브**가 가능해지며, (c) 게임 안에서 별도 로그인 UI를 만들 필요가 없다.

전제 조건으로 로그인 계층을 재정의한다. 지금은 승인 안 된 계정이 `/pending`에 갇히지만, 앞으로는 **미승인 = 일반 회원**(플레이/댓글/마이페이지), **승인 = 개발자 계정**(대시보드 추가)으로만 나눈다. 별도 가입 플로우는 만들지 않는다.

API v1은 레거시로 그대로 유지한다.

---

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 빌드 격리 | **하지 않음.** 게임은 계속 same-origin 인-페이지 마운트. 동아리 내부 개발자만 업로드하므로 위험 수용 (아래 "보안" 참조) |
| 표시이름 | 신규 `nickname` 필드 **없음.** 기존 `User.name`을 그대로 사용하고, 회원 마이페이지에서 수정 가능하게 함 |
| 댓글 소유권 | Issue / BlogPost / GameArticle **세 곳 모두** |
| 진행 | Phase 0 → 3, 각 단계마다 검증 + 커밋 |
| 회원 티어 | `status !== 'approved'` = 일반 회원, `'approved'` = 개발자. **스키마 변경 없음** |

---

## Phase 0 — 회원 티어 · 마이페이지 · 네비 · 댓글 소유권

이 단계는 단독으로 배포 가능하며, **실존하는 인가 취약점 하나를 고친다.**

### 0.1 댓글 소유권 (서버)

세 스키마 모두 `authorId` 추가 (`ObjectId ref 'User'`, `default: null`):
- `server/src/models/Issue.js:29-35` `CommentSchema`
- `server/src/models/BlogPost.js`, `server/src/models/GameArticle.js`의 동일한 코멘트 서브도큐먼트

생성 경로 (`server/src/routes/issues.js:127-150` 및 blog/gameArticles의 대응 핸들러) — 이미 `optionalAuth`를 쓰고 있으므로:
```js
const authorId = req.user?.sub ?? null;
// authorName은 게스트일 때만 저장. 로그인 사용자는 조회 시 User.name을 live로 읽어
// 개명이 과거 댓글에도 반영되게 한다 (지금은 7일짜리 JWT 클레임이 박제됨)
```
조회 경로에서 `authorId`가 있으면 `.populate('comments.authorId', 'name')` 후 그 이름을 내보내고, 없으면 기존 `authorName` 폴백.

**삭제 인가 수정** — `server/src/routes/issues.js:177-191`은 현재 `requireAuth`만 걸려 있어 **로그인한 아무나 아무 댓글이나 삭제**할 수 있다 (소스 주석도 인정). 새 규칙:
```
본인(authorId === req.user.sub) || 게임 owner/collaborator || role === 'admin'
```
`authorId`가 없는 레거시 댓글은 **owner/collaborator/admin만** 삭제 가능 (이름 문자열 매칭 폴백은 만들지 않음 — 사칭으로 남의 댓글을 지울 수 있음).

`server/src/routes/backend.js:20-23`의 `isAuthorized(game, userId)`를 재사용한다.

### 0.2 로그인 후 분기 (웹)

- `web/src/pages/AuthCallbackPage.jsx` / `LoginPage.jsx`: 로그인 성공 시 `status === 'approved'`면 `/dashboard`, 아니면 `/`(또는 `location.state.from`)로 보낸다. 미승인이라고 `/pending`으로 강제하지 않는다.
- `web/src/pages/PendingPage.jsx`: 이제 **대시보드에 접근하려는 미승인 회원**만 도달하는 페이지. 문구를 "가입 대기"에서 "일반 회원 → 개발자 승인 필요"로 바꾸고, `/me`와 `/arcade`로 가는 링크를 추가. 새로고침/로그아웃 버튼은 유지.
- `web/src/components/ProtectedRoute.jsx`는 변경 불필요 — `requireApproved: false`를 이미 지원한다.
- `web/src/context/AuthContext.jsx`에 파생값 `isDeveloper = user?.status === 'approved'`를 노출해 컴포넌트들이 문자열 비교를 그만두게 한다.

### 0.3 회원 마이페이지 `/me`

`web/src/pages/ProfilePage.jsx:79-137`의 두 덩어리를 공용 컴포넌트로 추출:
- `web/src/components/ProfileIdentityCard.jsx` — 아바타/이름/이메일/역할/상태 요약 (`.profile-summary-card`)
- `web/src/components/ProfileNameForm.jsx` — `updateMyProfile({ name })` 저장 폼 (dirty 추적 + 피드백 포함)

기존 `ProfilePage.jsx`(`/dashboard/profile`)는 `DashSidebar` + `StorageBar` 껍데기를 유지한 채 위 두 컴포넌트를 쓰도록 리팩터링. 새 `web/src/pages/MemberProfilePage.jsx`는 `PublicNav` + `Footer` 껍데기로 같은 두 컴포넌트를 렌더하고, 승인된 사용자에게는 "개발자 대시보드로" 링크를 추가로 보여준다.

라우팅:
```js
// web/src/routes.config.js
{ path: '/me', loaderKey: 'memberProfile', guard: { requireApproved: false }, localized: false },
```
`web/src/utils/routeLoaders.js`에 `memberProfile` 로더 추가.

표시이름은 `User.name`이고 `PATCH /api/auth/me`(`server/src/routes/auth.js:58`)가 이미 name-only 수정을 지원하므로 **서버 변경 없음**. 다만 리더보드 노출을 안내하는 헬퍼 문구를 `t.profile.displayNameHint`에 추가한다.

### 0.4 네비 유저 칩

`web/src/components/PublicNav.jsx`에 `useAuth()` 추가. `DarkModeToggle` 오른쪽에:
- 로그인 상태 → `<PageLink to="/me" className="public-nav-user">` : 인라인 SVG 아바타(원형 head + 어깨 arc, `currentColor`) + `user.name` (`max-width` + `text-overflow: ellipsis`)
- 비로그인 → `<PageLink to="/login" className="public-nav-link">{t.nav.login}</PageLink>`

`web/src/components/PublicNav.css`의 기존 브레이크포인트 활용 — **834px 이하에서 인증 어피던스 전체를 `display: none`**. 모바일 사용자의 로그인 경로는 플레이 게이트(3.2)와 `/login` 직접 진입으로 확보된다.

---

## Phase 1 — v2 서버 (토큰 · 모델 · 라우터)

### 1.1 게임 토큰 — `server/src/services/gameToken.js` (신규, 순수 모듈)

`gameSecret.js`와 같은 결의 순수 모듈로 두어 DB 없이 단위 테스트한다. 서명은 `jsonwebtoken`(기존 의존성)을 쓰되 **사이트 JWT와 다른 키**를 쓴다:

```js
const secret = () => process.env.GAME_TOKEN_SECRET
  || crypto.createHmac('sha256', process.env.JWT_SECRET).update('arcade-game-token-v2').digest();

export function signGameToken({ userId, gameId, displayName }) {
  return jwt.sign({ sub: String(userId), gid: String(gameId), name: displayName, typ: 'game' },
    secret(), { algorithm: 'HS256', expiresIn: GAME_TOKEN_TTL_S });
}
export function verifyGameToken(token) { /* jwt.verify(..., { algorithms: ['HS256'] }); typ !== 'game' → null */ }
```

키가 다르므로 **양방향 교차 수용이 암호학적으로 불가능하다** — 게임 토큰으로 `/api/auth/*`나 대시보드를 칠 수 없고, 사이트 JWT로 v2를 칠 수도 없다. 기존 발급 토큰은 건드리지 않는다. `GAME_TOKEN_SECRET` env는 회전용 탈출구.

- TTL **15분**, 페이지가 **9분**(60%)마다 갱신 + `401 {code:'token_expired'}` 반응형 갱신.
- 게임 식별자는 **토큰의 `gid`에서만** 온다. 리더보드 조회는 반드시 `Leaderboard.findOne({ gameId: token.gid, key })` — `{ key }` 단독 조회 금지.
- **에디터 개발 토큰**은 같은 함수가 `{ dev: true }` 클레임과 **7일 TTL**로 발급한다. 클레임 모양이 같으므로 서버 코드 경로는 하나로 유지된다.

### 1.2 `server/src/middleware/gameAuth.js` (신규) — `requireGameToken`

- `Authorization: Bearer` 파싱 → `verifyGameToken` → `req.gameToken = payload`
- **쓰기 경로에서만** `User.findById(sub).select('status')` live 조회 (`requireApproved`와 같은 비용). `rejected`면 403. 읽기 경로는 30초 in-process 캐시 (`rateLimiter.js`와 같은 단일 프로세스 전제).
- `express.json({ limit: '2mb' })`가 전역이라 라우터 단위 파서 교체는 **무효**(`req._body` 때문). `Content-Length` 검사를 이 미들웨어에서 수행.
- v2에는 nonce/replay 방어를 **이식하지 않는다** — 점수 제출은 best-score upsert라 멱등이다.
- `dev: true` 토큰이면 추가로 `Game.findById(gid).select('serverBackend')`를 읽어 `iat < serverBackend.v2DevTokenIssuedAt`이면 거부한다 (대시보드 "재발급"이 곧 킬 스위치가 된다). 일반 토큰은 이 조회를 하지 않는다.

### 1.3 모델

`server/src/models/LeaderboardScore.js` (신규 컬렉션, v1의 임베디드 배열과 분리):
```js
{ leaderboardId, gameId, userId, displayName, score, meta, playCount, bestAt, createdAt, updatedAt }
index({ leaderboardId: 1, userId: 1 }, { unique: true })
index({ leaderboardId: 1, score: -1, bestAt: 1 })   // desc 보드
index({ leaderboardId: 1, score:  1, bestAt: 1 })   // asc 보드 (동점 시 선착순이므로 역인덱스로 대체 불가)
```
`displayName`은 비정규화하되 **제출할 때마다 `$set`** 하여 개명이 자동 반영되게 한다.

두 저장 모델 모두 `isDev: { type: Boolean, default: false }`를 갖는다 — 에디터 개발 토큰으로 들어온 기록을 대시보드에서 구분·일괄 삭제하기 위함이다. **인게임 읽기에서는 숨기지 않는다** (숨기면 테스트가 실제와 달라진다).

`server/src/models/CloudSave.js` (신규):
```js
{ gameId, userId, slot(/^[a-z0-9][a-z0-9_-]*$/, ≤32), data: String, size: Number, rev: Number }
index({ gameId: 1, userId: 1, slot: 1 }, { unique: true })
```
- 슬롯당 **64 KiB**, `Buffer.byteLength(data,'utf8')`로 검사 (`maxlength`는 UTF-16 코드유닛이라 한글이 3배 예산을 먹는다 — `GameConfig.value`의 8192도 같은 버그).
- 사용자·게임당 **슬롯 8개**. `JSON.parse` 통과 필수, 저장은 **원문 그대로** (게임이 바이트 동일하게 돌려받게).

`server/src/models/Game.js:56-61` `serverBackend`에 추가 (가산적, 기본 false):
```js
v2Enabled: { type: Boolean, default: false },
cloudSaveEnabled: { type: Boolean, default: false },
v2DevTokenIssuedAt: { type: Date, default: null },   // 에디터 토큰 킬 스위치
```

### 1.4 순수 쿼리 빌더 — `server/src/services/v2Queries.js` (신규)

테스트 가능성을 위해 쿼리 구성을 라우터에서 분리한다.

`buildBestScoreOps(...)` — 2단계 쓰기 (단일 upsert는 unique 인덱스를 밟는다):
```js
const better = lb.sort === 'asc' ? { $lt: score } : { $gt: score };
// A. 행 보장. E11000(동시 최초 제출)은 삼킨다.
updateOne({ leaderboardId, userId },
  { $setOnInsert: { gameId, score, meta, bestAt: now }, $set: { displayName }, $inc: { playCount: 1 } },
  { upsert: true });
// B. 더 좋을 때만 갱신. A가 방금 insert했으면 no-op.
updateOne({ leaderboardId, userId, score: better }, { $set: { score, meta, bestAt: now } });
```

`buildRankQuery(lb, me)` — 표시 순서와 동일한 타이브레이크, 인덱스 커버 카운트:
```js
{ $or: [{ score: betterThanMine }, { score: me.score, bestAt: { $lt: me.bestAt } }] }
// rank = 1 + countDocuments({ leaderboardId, ...q })
```

`resolveSaveWrite({ existing, body })` — CAS 판정:

| `rev` | 동작 |
|---|---|
| 생략 | 강제 쓰기, last-writer-wins, `$inc rev` |
| `0` | create-only, 이미 있으면 409 |
| `n>0` | `updateOne({..., rev:n}, {$set, $inc:{rev:1}})`, `matchedCount===0` → 409 |

409 본문에 **서버의 현재 상태를 포함**해 게임이 1왕복에 머지할 수 있게 한다: `{ error, code:'save_conflict', rev, data }`.

### 1.5 `server/src/routes/apiV2.js` (신규)

`seoRouter({ models })`(`server/src/index.js:117-121`)와 같은 **팩토리 패턴** — `export function apiV2Router({ models = {} } = {})`, 내부에서 `models.X ?? RealX`. 이것이 Mongo 없이 라우트 테스트를 가능하게 하는 유일한 방법이다.

`server/src/index.js:54` 바로 뒤에 `app.use('/api/v2', apiV2Router())` 마운트 — 전역 JSON 파서 뒤, `seoRouter`와 `SERVE_STATIC` catch-all 앞이며 `/api/`는 이미 catch-all과 `ROBOTS_DISALLOW`에서 제외된다.

| 메서드 · 경로 | 인증 | 비고 |
|---|---|---|
| `POST /games/:gameSlug/play-token` | `requireAuth` (사이트 JWT) | 발급. `v2Enabled` 아니면 404, `rejected` 사용자 403. `sub` 기준 30/min |
| `GET /me` | `requireGameToken` | `{ userId, displayName }` |
| `POST /leaderboards/:key/scores` | ↑ | 본문 `{ score, meta? }`. **이름은 절대 클라이언트에서 받지 않는다.** `scoreMin/Max` 클램프 유지, 30/min |
| `GET /leaderboards/:key` | ↑ | `{ entries: [{ rank, userId, displayName, score, isMe }] }`, 120/min |
| `GET /leaderboards/:key/me` | ↑ | 내 최고점 + 순위 |
| `GET /config/:key` | ↑ | v1과 **같은 `GameConfig` 데이터** 읽기 전용 |
| `GET·PUT·DELETE /saves/:slot` | ↑ | `cloudSaveEnabled` 필요. PUT 30/min, GET 120/min |

에디터 개발 토큰 발급은 v2 라우터가 아니라 대시보드 쪽(`server/src/routes/backend.js`, `requireAuth + requireApproved` + owner/collaborator)에 둔다 — 사이트 JWT로 인증하는 대시보드 액션이기 때문이다:

| `POST /:gameId/backend/v2/dev-token` | 개발자 본인을 `sub`으로, `dev:true` + 7일 TTL로 발급. 동시에 `serverBackend.v2DevTokenIssuedAt = now`를 갱신해 **이전에 발급된 토큰을 즉시 무효화**한다. `v2Enabled`가 꺼져 있어도 발급된다 (출시 전 테스트가 목적) |
|---|---|

레이트 리밋은 기존 `rateLimitMiddleware`를 쓰되 **IP가 아니라 `sub`+`gid`로 키잉** (`clientIp`는 `x-forwarded-for`를 무조건 신뢰하고 `trust proxy`가 설정된 적이 없어 위조 가능). 겸사겸사 `index.js`에 `app.set('trust proxy', 1)`를 추가한다.

### 1.6 v1/v2 공존

`Leaderboard` 문서 = **정의**(key, label, sort, bounds, enabled) — 양쪽 공유. `entries[]` = v1 저장소 전용. `LeaderboardScore` = v2 저장소 전용. 교차 쓰기 없음. 플래그는 보드별이 아니라 `Game.serverBackend.v2Enabled` **게임 단위** (반쪽 마이그레이션 상태를 만들지 않는다).

**v1 엔트리는 `userId`가 없어 마이그레이션 불가.** v2 보드는 빈 상태로 시작한다 — 대시보드에서 토글하기 전에 이 사실을 경고 문구로 노출한다.

`maxEntries`의 의미가 v2에서 바뀐다: 저장 상한이 아니라 **기본 페이지 크기**(`Math.min(query.limit ?? lb.maxEntries, 100)`). `LeaderboardScore`를 `maxEntries`로 프루닝하면 순위 개념 자체가 무너지므로 **절대 자르지 않는다.**

### 1.7 `getPlayInfo` 확장

`server/src/routes/games.js`의 play-info 응답에 공개 필드 `sdkV2: { enabled, cloudSaveEnabled }`를 추가한다. 플레이 페이지가 렌더 전에 게이트 여부를 알아야 하고, SSR 부트스트랩(`readSsrData('/play/:gameSlug')`)에도 실려야 한다.

---

## Phase 2 — Unity SDK v2 + 코드젠

토큰이 `gid`를 품고 있어 **게임별로 다른 코드가 필요 없다.** 따라서 v1의 `ServerBridge.cs`(전량 생성)와 달리 v2는 `IssueTracker` 방식대로 **정적 드롭인 파일 2개**로 두고, 대시보드는 그것을 CodeBlock으로 제공한다. 코드젠은 **게임별 사용 예제 스니펫**(리더보드 키, config 키, 세이브 슬롯)만 만든다.

### 2.1 `unity/Assets/Plugins/WebGL/ArcadeSdk.jslib` (신규)

`IssueTracker.jslib`의 컨벤션 그대로 (`mergeInto`, `var`, 2-space, `typeof x === 'function'` 가드, `console.warn('[ArcadeSdk] …')`). void 함수 2개만 — **JS→C# 문자열 반환은 리포 전체에 선례가 없으므로 만들지 않는다:**

```js
ArcadeSdk_Ready: function () { … window.__arcadeSdkReady() … },
ArcadeSdk_RequestToken: function () { … window.__arcadeSdkRequestToken() … },
```

### 2.2 `unity/Assets/Scripts/ArcadeSdk.cs` (신규)

`namespace ArcadeBackend`(생성 코드의 기존 네임스페이스 재사용), `[DisallowMultipleComponent] public sealed class ArcadeSdk : MonoBehaviour`, `Instance` 싱글턴 + `DontDestroyOnLoad`, `#if UNITY_WEBGL && !UNITY_EDITOR` DllImport + 에디터 스텁. 필드는 `_` 접두사 없는 camelCase (`AGENTS.md:62`). JSON 쓰기는 손수 만든 StringBuilder, 읽기는 `[Serializable] private struct` + `JsonUtility.FromJson<T>`.

**GameObject 이름 자동 교정** — `sendMessage`는 클래스가 아니라 **GameObject 이름**을 타깃하므로, 이름이 다르면 전부 조용히 실패한다:
```csharp
if (gameObject.name != "ArcadeSdk") { Debug.LogWarning("[ArcadeSdk] …"); gameObject.name = "ArcadeSdk"; }
DontDestroyOnLoad(gameObject);
ArcadeSdk_Ready();   // 페이지가 이미 토큰을 들고 있을 수 있다
```

주입 진입점 (브라우저 전용, 게임 코드용 아님):
```csharp
public void SetCredential(string credentialJson)  // { token, userId, displayName, expiresAt }
```

공개 API는 생성 코드의 기존 비동기 규약을 따른다 — `public void Foo(..., Action<bool,T> onComplete = null) => StartCoroutine(FooRoutine(...))`:
`SubmitScore(key, score, cb)` · `GetLeaderboard(key, cb)` · `GetMyRank(key, cb)` · `GetConfig(key, cb)` · `LoadSave(slot, cb)` · `SaveData(slot, json, rev, cb)` · `DeleteSave(slot, cb)` · `IsReady` · `UserId` · `DisplayName` · `OnReady`.

**만료 처리 — 코루틴 게이트 (콜백 큐 아님):**
```csharp
private IEnumerator EnsureCredential()  // 없으면 ArcadeSdk_RequestToken() 후 최대 10초 대기
```
모든 라우틴이 `yield return EnsureCredential()`로 시작. 401을 받으면 credential을 버리고 **정확히 한 번만** 재시도. 두 번째 401은 실패 처리. 루프 금지, 10초 타임아웃, `onComplete`는 **항상** 호출된다 (게임이 멈추지 않게).

### 2.3 에디터 테스트 경로 (브라우저 주입 에뮬레이션)

v1의 `ServerBridge`는 HMAC 서명이 C# 안에 있어 에디터에서도 그대로 동작했지만, **v2는 토큰이 브라우저에서 오므로 에디터에서 완전히 죽는다.** 업로드 전에 Play 모드에서 테스트할 수 있어야 하므로, `SetCredential` 주입을 에디터에서 흉내 내는 경로를 만든다.

**토큰 보관** — 씬 파일에 토큰이 박제되는 걸 피하기 위해 두 경로를 두고, `EditorPrefs`를 우선한다:
```csharp
#if UNITY_EDITOR
    [Header("에디터 전용 — 빌드에는 포함되지 않습니다")]
    [SerializeField] private string editorDevToken;   // 편의용. 씬 YAML에 저장되므로 공개 리포 주의
    [SerializeField] private string apiBaseUrlOverride;  // 로컬 서버(:4000) 대상 테스트용

    private string ResolveEditorToken()
        => UnityEditor.EditorPrefs.GetString("ArcadeSdk.DevToken", "") is { Length: > 0 } saved
            ? saved : editorDevToken;   // EditorPrefs 우선 — 씬/리포에 흔적을 남기지 않는다
#endif
```
필드 선언 자체를 `#if UNITY_EDITOR`로 감싸므로 **토큰이 WebGL 빌드에 물리적으로 들어갈 수 없다.**

**주입 에뮬레이션** — `Awake`의 `#if UNITY_WEBGL && !UNITY_EDITOR` 분기와 대칭으로:
```csharp
#if UNITY_EDITOR
    var token = ResolveEditorToken();
    if (string.IsNullOrEmpty(token))
    {
        Debug.LogWarning("[ArcadeSdk] 에디터 개발 토큰이 없습니다. 대시보드 → 서버와 통합 → SDK v2에서 발급하세요.");
    }
    else
    {
        credential = token;
        StartCoroutine(HydrateFromMeRoutine());   // GET /api/v2/me → userId, displayName 채우고 OnReady 발사
    }
#else
    ArcadeSdk_Ready();   // 브라우저: 페이지가 SetCredential을 밀어 넣는다
#endif
```
`GET /api/v2/me`를 한 번 호출하는 이유는 JWT 페이로드를 C#에서 파싱하지 않기 위해서이자, **토큰 유효성을 즉시 큰 소리로 검증**하기 위해서다 — 401이면 `Debug.LogError("[ArcadeSdk] 개발 토큰이 만료/무효입니다. 대시보드에서 재발급하세요.")`. 브라우저 경로는 페이지가 이미 `userId`/`displayName`을 함께 주므로 이 요청을 하지 않는다.

**`EnsureCredential`의 에디터 분기** — `ArcadeSdk_RequestToken()`은 에디터 스텁(no-op)이라 그대로 두면 10초를 헛되이 기다린다. 에디터에서는 즉시 실패시키고 원인을 로그로 알린다.

에디터에는 CORS가 없으므로 프로덕션 `SITE_ORIGIN`을 그대로 때려도 되고, 로컬 서버는 `apiBaseUrlOverride`로 돌린다.

**기록 오염 관리:** 개발 토큰은 개발자 **본인 계정**으로 실제 리더보드/세이브에 쓴다 (best-score-per-user이므로 개발자당 한 행). 다만 `isDev: true`로 표시되어 대시보드에서 배지로 구분되고 일괄 삭제할 수 있다.

### 2.4 코드젠 · 배달

`server/src/services/codegen.js`에 `generateArcadeSdk(game, { leaderboards, config })` 추가 — 두 파일의 본문(`ApiBaseUrl`만 `SITE_ORIGIN`으로 치환)과 게임별 사용 예제 `docs`를 반환. **XOR 난독화 경로는 v2에 존재하지 않는다** — 헤더 주석이 드디어 사실을 쓸 수 있다.

새 엔드포인트 `GET /api/games/:gameId/backend/generated-sdk` (`server/src/routes/backend.js:85`의 v1 `generated-code`는 그대로 유지). 대시보드는 기존 `CodeBlock`(`web/src/pages/GameDetailPage.jsx:1172-1210`, Copy + Blob 다운로드)으로 두 파일을 렌더한다.

---

## Phase 3 — 플레이 게이트 · 대시보드 UI · i18n

### 3.1 토큰 주입 (`web/src/pages/PlayPage.jsx`)

`useAuth()` 추가. `sdkV2.enabled`이고 로그인 상태면 `POST /api/v2/games/:slug/play-token` → 9분 타이머로 갱신.

**두 가지 순서를 모두 처리해야 한다.** `ArcadeSdk_Ready()`는 Unity `Awake`에서 발사되는데, 이는 react-unity-webgl이 `isLoaded`를 세우기 **전**일 수 있다 (즉 `sendMessageFn.current`가 아직 null):
```js
const push = () => { if (tokenRef.current) sendMessageFn.current?.('ArcadeSdk','SetCredential', JSON.stringify(tokenRef.current)); };
window.__arcadeSdkReady = push;                     // Unity가 먼저 뜬 경우
window.__arcadeSdkRequestToken = debouncedRefresh;  // 최소 2초 간격
// 기존 onReady 핸들러에서도 push() 호출                // 토큰이 먼저 준비된 경우
```
언마운트 시 두 전역 모두 `delete` (기존 `window.__issueTrackerReceive` 패턴과 동일, `PlayPage.jsx:131-139`).

### 3.2 로그인 게이트

`sdkV2.enabled && !user`이면 `.play-canvas-frame` 안에 `<UnityGame>` 대신 게이트 패널을 렌더: 자물쇠 아이콘 + "로그인하고 게임을 플레이하세요" + `/login`으로 가는 버튼(`state.from`으로 복귀). **캔버스만 게이팅**한다 — SSR 부트스트랩, 메타/JSON-LD, 게임 설명, 아티클, 관련 게임은 크롤러와 비로그인 방문자에게 그대로 보여야 한다.

### 3.3 대시보드 (`web/src/pages/ServerIntegrationTab.jsx`)

v1 섹션들 아래에 "SDK v2 (인증 기반)" 서브섹션 추가:
- `v2Enabled` / `cloudSaveEnabled` 체크박스 (기존 `handleToggle` 재사용) + **"켜면 이 게임은 로그인 필수가 되고, 기존 v1 리더보드 기록은 인게임에 더 이상 표시되지 않습니다"** 경고
- SDK 파일 2개 CodeBlock + 게임별 예제
- **에디터 테스트 토큰** — 기존 시크릿 UI(`ServerIntegrationTab.jsx:190-203`)와 같은 모양의 읽기전용 필드 + 복사 + "발급/재발급" 버튼, 만료일 표시. 안내 문구 3줄: ① `EditorPrefs`에 넣는 방법(권장) ② 인스펙터 필드는 씬 파일에 저장되니 공개 리포에 커밋 금지 ③ 재발급하면 이전 토큰은 즉시 무효
- 리더보드/세이브 목록에서 `isDev` 행에 "테스트" 배지 + "테스트 기록 전체 삭제" 버튼

리더보드 엔트리 모달을 탭 2개로: **계정 (v2)** — 순위/표시이름/점수/플레이 수/갱신일, 페이지네이션, 행별 삭제 / **레거시 (v1)** — 기존 임베디드 엔트리, 읽기 전용 + 전체 삭제. v2 탭은 `!v2Enabled`일 때, 레거시 탭은 `entries.length === 0`일 때 숨긴다.

대시보드 전용 신규 엔드포인트는 `apiV2.js`가 아니라 `server/src/routes/backend.js`에 (owner/collaborator/admin): `GET /:gameId/backend/leaderboards/:lbId/scores?page=`, `DELETE …/scores/:scoreId`.

### 3.4 i18n

`web/src/i18n.jsx`의 `en`/`ko` **양쪽** 브랜치에 신규 키 추가: `nav.login`, `nav.myPage`, `profile.*` 회원용 문구, `play.loginRequired*`, `gameDetail.siV2*`, `pending.*` 재작성 문구.

---

## 보안 — 답변과 남는 위험

**"게임이 localStorage에서 토큰을 그냥 읽을 수 있는데 왜 주입하나?"** — 악의적 개발자 방어가 목적이 아니다 (그건 수용하기로 함). 주입이 사는 이유는 넷:

1. **권한 축소.** 사이트 JWT는 7일 + 전권이라 그 게임이 대시보드 API·다른 게임·계정 설정까지 호출할 수 있다. v2 토큰은 `gid` 하나에 묶인 15분짜리라 **선의의 게임이 실수로 새어나가도** (크래시 리포트, 로그 수집, 애널리틱스 SDK, 저장된 HAR) 피해가 그 게임의 점수/세이브로 국한된다.
2. **계약의 안정성.** 게임이 우리 저장소 키 이름(`localStorage['token']`)에 의존하면, 우리가 저장 방식을 바꾸는 순간 배포된 모든 빌드가 깨진다.
3. **키 분리.** 게임 토큰은 파생 키로 서명되므로 v2 토큰으로 `/api/auth/*`를 칠 수 없다 — 게임이 실수로든 고의로든 계정을 조작할 수 없다.
4. **갱신.** 15분 만료를 페이지가 조용히 갱신해 밀어 넣는다. 게임이 스스로 재로그인을 처리할 필요가 없다.

**수용한 위험 (명시적):** 빌드는 same-origin 인-페이지 마운트라 게임 JS가 `localStorage['token']`을 읽을 수 있다. 승인된 동아리 개발자만 업로드하므로 수용한다. 근본 해결은 별도 출처 sandbox iframe + `postMessage`이며, 향후 마일스톤으로 남긴다.

**그 외 남는 위험:**
- **점수는 여전히 클라이언트 권위적이다.** 인증이 주는 건 무결성이 아니라 **책임 추적성**(신원·차단·사용자별 레이트 리밋)이다. `scoreMin/scoreMax` 클램프와 레이트 리밋은 계속 유효한 방어선이다.
- **JWT는 철회 불가.** TTL 15분 + 쓰기 경로 live 상태 조회(읽기는 30초 캐시)로 차단이 최대 30초 안에 반영되게 한다. `User.sessionsValidFrom: Date`를 추가하고 `token.iat`와 비교하면 관리자가 전 세션을 무효화할 수 있다 (선택, 조회를 이미 하므로 공짜).
- **클라우드 세이브 = 사용자 통제 저장소.** 슬롯당 64 KiB · 8슬롯 · 레이트 리밋으로 남용을 막는다. 대시보드에서 세이브 데이터를 보여줄 일이 생기면 **반드시 텍스트로만** 렌더 (저장형 XSS).
- **기존 갭 (범위 밖이지만 기록):** OAuth 플로우에 `state` CSRF 파라미터가 없다 (`server/src/routes/auth.js:149-252`). 일반 회원 로그인이 생기면 노출면이 넓어지므로 별도로 다룰 가치가 있다.
- **인메모리 레이트 리밋/캐시는 단일 프로세스 전제** — `progress.md`의 기존 TODO를 v2도 그대로 물려받는다.

---

## 인증으로 열리는 추가 GBaaS 기능 (제안, 이번 범위 밖)

우선순위 순:

1. **업적/스탯** — 대시보드에서 업적 카탈로그 정의, `POST /api/v2/achievements/:key/unlock`. 마이페이지에서 게임 전체 업적을 모아 보여주면 회원 티어에 존재 이유가 생긴다. 클라우드 세이브 다음으로 값어치가 크다.
2. **플레이 세션 텔레메트리** — 하트비트로 플레이타임/최종 플레이 기록. 아케이드의 "이어서 하기" 레일에 실데이터를 공급하고, 개발자에게는 DAU/리텐션 지표가 된다.
3. **사용자별 LiveOps 변형** — `GET /config/:key`가 `userId` 해시 기반으로 버킷을 배정해 변형 값을 반환. 동적 JSON에 A/B 테스트를 얹는 것.
4. **공유 상태 / 비동기 멀티플레이** — 고스트 데이터, 일일 챌린지 시드처럼 게임 단위로 공유되는 소형 KV.
5. **버그 리포트 자동 귀속** — 기존 이슈 리포트에 로그인 사용자를 연결. 매우 작은 작업이고 자연스럽다.
6. **게임별 차단 목록** — 개발자가 특정 사용자를 리더보드에서 제외.

---

## 검증

각 Phase 종료 시:
```sh
cd server; npm test          # node --test, 현재 77 passing
cd web; npm run build
node --check src/routes/apiV2.js   # 변경된 서버 모듈마다
git diff --check
```

**신규 테스트** (기존 `node:test` + 모델 주입 패턴; `server/test/translation-route-guards.test.js`의 체이너블 `query()` 페이크 재사용):
- `test/game-token.test.js` — 양방향 교차 수용 거부, `typ` 검증, 만료, `gid` 불일치
- `test/v2-queries.test.js` — `buildBestScoreOps`(asc/desc 양쪽), `buildRankQuery` 타이브레이크, `resolveSaveWrite` 4가지 분기
- `test/v2-auth-guard.test.js` — **게임 A 토큰으로 게임 B 보드 접근 → 404** (핵심 스코핑 테스트)
- `test/v2-leaderboard.test.js`, `test/v2-cloudsave.test.js` — 페이크 모델로 라우트 레벨
- `test/comment-authorization.test.js` — 남의 댓글 삭제 거부, 레거시 댓글은 owner만

**수동 E2E** (Phase 3 후):
1. 미승인 계정으로 로그인 → `/`로 착지, 네비에 유저 칩, `/me`에서 표시이름 변경 → 저장 확인
2. 데스크톱/모바일(≤834px) 네비 확인 — 모바일에서 칩 미표시
3. 승인 계정으로 SDK 2파일 복사 → Unity 프로젝트에 붙이고 **에디터 개발 토큰으로 Play 모드에서 점수 제출/세이브 검증** → 대시보드에 "테스트" 배지로 보이는지 확인 → 재발급 후 옛 토큰이 401을 받는지 확인
4. `v2Enabled` 켜고 WebGL 빌드 업로드
4. 로그아웃 상태로 `/play/:slug` → 캔버스 자리에 로그인 게이트, **메타/설명/아티클은 정상 렌더**
5. 로그인 후 플레이 → 점수 제출 → 리더보드에 표시이름으로 노출 → 세이브 저장/로드 → 15분 넘겨 갱신 동작 확인
6. 댓글 작성 → 본인 삭제 가능, 다른 계정으로는 불가

`progress.md`에 날짜 섹션을 덧붙이고, `AGENTS.md`/`CLAUDE.md`의 데이터 흐름·컨벤션 절과 `unity/README.md`를 갱신한다.
