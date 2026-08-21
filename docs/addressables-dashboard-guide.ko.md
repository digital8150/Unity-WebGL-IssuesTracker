# Unity Addressables 원격 콘텐츠 배포하기

> 게시 설정 제안
>
> - 제목: Unity Addressables 원격 콘텐츠 배포하기
> - 요약: Unity WebGL 게임의 Addressables 카탈로그와 번들을 Arcade에 업로드하고, 콘텐츠만 안전하게 갱신·검증·롤백하는 방법을 단계별로 알아봅니다.
> - 태그: `Unity`, `WebGL`, `Addressables`, `가이드`
> - 아래의 `스크린샷 삽입 위치` 블록은 게시 전에 실제 이미지로 교체하세요.

게임을 업데이트할 때마다 WebGL Player 전체를 다시 배포할 필요는 없습니다. Unity Addressables의 원격 콘텐츠 기능을 사용하면 카탈로그와 에셋 번들만 별도로 업로드해 새로운 스테이지, 캐릭터, 밸런스 데이터 등을 전달할 수 있습니다.

이 글에서는 Arcade 대시보드에 Addressables 원격 콘텐츠를 올리고, Unity 프로젝트의 `RemoteLoadPath`를 연결한 뒤, 이후 콘텐츠를 안전하게 갱신하고 되돌리는 방법을 설명합니다.

## 시작하기 전에

다음 항목을 준비해 주세요.

- Arcade에서 관리 권한이 있는 게임
- Unity 프로젝트에 설치된 Addressables 패키지
- 원격으로 배포할 Addressables 그룹
- 콘텐츠를 내려받아 확인할 WebGL 테스트 환경

테스트용 콘텐츠는 운영 채널과 분리하는 것을 권장합니다. 이미 서비스 중인 게임이라면 처음부터 `live` 채널에 시험 자료를 올리지 말고 `test`, `qa`, `preview-1` 같은 별도 채널을 사용하세요.

채널 이름에는 영문 소문자, 숫자, 하이픈만 사용할 수 있으며 최대 32자입니다.

## 1. 게임의 Addressables 콘텐츠 화면 열기

Arcade에 로그인한 뒤 대시보드에서 콘텐츠를 배포할 게임을 선택합니다. 게임 상세 화면에서 **Addressables 원격 콘텐츠** 탭을 여세요.

이 화면에서는 다음 작업을 할 수 있습니다.

- 채널별 `RemoteLoadPath` 확인과 복사
- 원격 콘텐츠 ZIP 업로드
- 외부 WebGL 호스트의 Origin 허용
- 업로드된 파일 수와 용량 확인
- 채널 안의 파일 목록 확인
- 더 이상 사용하지 않는 채널 삭제

> **스크린샷 삽입 위치 1 — 게임 상세 화면**
>
> 게임 상세 화면 전체와 **Addressables 원격 콘텐츠** 탭의 위치가 함께 보이도록 캡처하세요. 실제 게임명, 사용자 정보, 비공개 데이터는 가리거나 예제 프로젝트를 사용하세요.

## 2. 배포 채널과 RemoteLoadPath 정하기

Addressables 화면에서 사용할 채널을 입력합니다. 일반적인 운영 방식은 다음과 같습니다.

- `live`: 현재 배포 중인 Player가 사용하는 운영 콘텐츠
- `test` 또는 `qa`: 새 콘텐츠와 설정을 확인하는 테스트 콘텐츠
- `v2`: 기존 Player와 호환되지 않는 새 Player용 콘텐츠

채널은 단순한 폴더 이름이 아니라 **Player와 콘텐츠의 호환 범위**입니다. Player를 빌드한 뒤 채널을 바꾸면 기존 Player는 새 경로를 알 수 없으므로, Player를 빌드하기 전에 채널을 확정해야 합니다.

채널을 입력하면 대시보드에 다음과 같은 주소가 표시됩니다.

```text
https://<Arcade 주소>/content/<gameId>/<channel>/[BuildTarget]
```

표시된 값을 복사하세요. `[BuildTarget]`은 Unity가 빌드 대상에 맞게 치환하는 Addressables 프로필 변수이므로 `WebGL` 같은 문자열로 직접 바꾸지 말고 그대로 둡니다.

> **스크린샷 삽입 위치 2 — 채널과 RemoteLoadPath**
>
> 채널 입력란, 생성된 `RemoteLoadPath`, 복사 버튼이 한 화면에 보이도록 캡처하세요. 게시용 예제에서는 실제 gameId를 가상의 값으로 교체해도 됩니다.

## 3. Unity Addressables 프로필 연결하기

Unity Editor에서 Addressables Groups 창을 열고, 사용할 프로필의 원격 경로를 설정합니다. Unity와 Addressables 패키지 버전에 따라 메뉴 이름이나 위치가 조금 다를 수 있습니다.

원격 그룹의 경로는 다음처럼 설정합니다.

```text
Remote Build Path: ServerData/[BuildTarget]
Remote Load Path:  대시보드에서 복사한 URL
```

그룹의 Build Path와 Load Path도 해당 원격 프로필 변수를 사용하도록 선택되어 있어야 합니다. 로컬 경로를 사용하는 그룹은 원격 콘텐츠 ZIP에 포함되지 않습니다.

> **스크린샷 삽입 위치 3 — Addressables Profiles**
>
> Unity의 Addressables Profiles 화면에서 `RemoteBuildPath`와 `RemoteLoadPath`가 모두 보이도록 캡처하세요. `RemoteLoadPath`의 gameId와 채널은 예제 값으로 가리는 것을 권장합니다.

### 번들 파일명에 해시 붙이기

원격 그룹의 고급 설정에서 **Bundle Naming Mode**를 **Append Hash to Filename**으로 설정하는 것을 권장합니다.

해시가 붙은 번들은 내용이 바뀌면 파일명도 바뀌기 때문에 브라우저가 1년 동안 안전하게 캐시할 수 있습니다. 해시가 없는 번들도 동작하지만, 매번 서버에 변경 여부를 확인해야 하므로 로딩 성능이 떨어집니다. 대시보드는 해시가 없는 번들을 업로드하면 경고를 표시합니다.

> **스크린샷 삽입 위치 4 — 원격 그룹 설정**
>
> 원격 그룹의 Build/Load Path와 `Bundle Naming Mode: Append Hash to Filename` 설정을 강조해 캡처하세요.

## 4. 원격 콘텐츠 빌드하기

Addressables Groups 창에서 새 콘텐츠 빌드를 실행합니다. 기존 Player용 콘텐츠만 갱신하는 경우에는 프로젝트에서 사용 중인 Addressables의 Content Update 워크플로를 따르세요.

빌드가 끝나면 일반적으로 다음과 같은 결과가 생성됩니다.

```text
ServerData/
└─ WebGL/
   ├─ catalog_....json 또는 catalog_....bin
   ├─ catalog_....hash
   ├─ ..._<32자리 해시>.bundle
   └─ ..._<32자리 해시>.bundle
```

확인할 사항은 세 가지입니다.

1. `WebGL` 디렉터리 바로 아래에 catalog 파일이 있어야 합니다.
2. 각 catalog 옆에 같은 이름의 `.hash` 파일이 있어야 합니다.
3. 원격 그룹의 `.bundle` 파일이 함께 있어야 합니다.

`ServerData` 폴더를 ZIP으로 압축하되, ZIP 내부에서 `WebGL/` 디렉터리 구조가 사라지지 않도록 주의하세요. `WebGL` 안의 파일만 모두 선택해 압축하면 `[BuildTarget]` 경로가 사라져 런타임에 404가 발생합니다.

```text
올바른 ZIP
└─ ServerData/
   └─ WebGL/
      ├─ catalog_....json
      ├─ catalog_....hash
      └─ ....bundle

잘못된 ZIP
├─ catalog_....json
├─ catalog_....hash
└─ ....bundle
```

업로드한 ZIP은 나중에 롤백할 때 필요합니다. 파일명에 채널과 릴리스 버전을 포함해 별도로 보관하세요.

```text
예: addressables-test-2026.08.21.zip
```

## 5. 대시보드에 업로드하기

Addressables 원격 콘텐츠 화면에서 ZIP 파일과 업로드 모드를 선택합니다.

처음 업로드하거나 일반적인 콘텐츠 업데이트를 배포할 때는 **병합**을 사용하세요.

### 병합

- 새 파일과 변경된 파일을 채널에 추가합니다.
- ZIP에 없는 기존 번들은 유지합니다.
- 번들을 먼저 설치하고 catalog와 hash를 마지막에 반영합니다.
- 이전 catalog를 사용 중인 플레이 세션이 기존 번들을 계속 받을 수 있습니다.
- 이전 catalog/hash를 보관했다면 롤백할 수 있습니다.

### 교체

- 채널의 기존 파일을 모두 제거하고 ZIP의 내용만 설치합니다.
- 이전 catalog가 참조하는 번들도 삭제될 수 있습니다.
- 자동 복구나 서버 측 버전 기록이 없습니다.

**교체는 완전한 전체 아카이브로 채널을 재구성할 때만 사용하세요. 운영 채널의 일상적인 업데이트에는 사용하지 않는 것이 안전합니다.**

업로드가 끝나면 화면에 표시되는 레이아웃 경고를 확인합니다. HTTP 성공 응답은 ZIP 설치가 끝났다는 의미일 뿐, Unity가 catalog를 정상적으로 읽을 수 있다는 의미는 아닙니다.

> **스크린샷 삽입 위치 5 — ZIP 업로드**
>
> ZIP 선택, `병합` 모드, 업로드 진행률이 보이는 화면을 캡처하세요. 별도의 테스트 채널과 테스트용 ZIP을 사용하세요.

> **스크린샷 삽입 위치 6 — 업로드 결과**
>
> 채널 현황의 파일 수·용량·마지막 업로드 시각과 레이아웃 경고 영역이 보이도록 캡처하세요. 가능하면 경고가 없는 정상 예제를 사용하세요.

## 6. 외부 WebGL 호스트의 Origin 허용하기

Arcade에서 제공하는 플레이 페이지가 콘텐츠를 내려받는 경우에는 별도 설정이 필요하지 않습니다. Player와 콘텐츠가 같은 Origin을 사용하기 때문입니다.

GitHub Pages, itch.io, 사내 테스트 서버 또는 로컬 개발 서버에서 Player를 제공한다면 **허용된 외부 Origin**에 Player의 Origin을 추가해야 합니다.

```text
https://username.github.io
https://game.example.com
http://localhost:5173
```

Origin에는 프로토콜, 호스트, 필요한 경우 포트만 입력합니다.

```text
허용: https://game.example.com
허용: http://localhost:5173
거부: https://game.example.com/play/my-game
거부: https://game.example.com/
거부: *.example.com
```

`localhost`와 `127.0.0.1`, HTTP와 HTTPS, 서로 다른 포트는 모두 다른 Origin입니다. 실제 WebGL 페이지의 주소창과 브라우저 개발자 도구에서 Origin을 확인해 정확하게 등록하세요.

> **스크린샷 삽입 위치 7 — 허용된 외부 Origin**
>
> Addressables 화면의 Origin 입력란과 예제 Origin 하나가 등록된 상태를 캡처하세요. 개인 로컬 경로나 내부 도메인은 노출하지 마세요.

## 7. 브라우저에서 배포 결과 확인하기

업로드 직후에는 반드시 실제 WebGL Player에서 원격 에셋을 불러와 확인합니다.

1. 브라우저 개발자 도구를 엽니다.
2. **Network** 탭에서 캐시를 비운 뒤 Player를 새로 엽니다.
3. `catalog`, `hash`, `bundle`로 요청을 필터링합니다.
4. catalog와 hash가 성공하는지 확인합니다.
5. 새 콘텐츠가 들어 있는 bundle이 200 또는 정상적인 캐시 응답으로 내려오는지 확인합니다.
6. Console 탭에 CORS 오류와 404가 없는지 확인합니다.

응답 헤더는 다음 기준으로 확인할 수 있습니다.

| 파일 | 예상 Content-Type | 예상 캐시 정책 |
|---|---|---|
| `catalog_*.json` | `application/json` | `no-cache` 및 ETag 재검증 |
| `catalog_*.bin` | `application/octet-stream` | `no-cache` 및 ETag 재검증 |
| `catalog_*.hash`, `*.hash` | `text/plain` | `no-cache` 및 ETag 재검증 |
| 해시가 붙은 `*.bundle` | `application/octet-stream` | 1년 `immutable` |
| 해시가 없는 `*.bundle` | `application/octet-stream` | 매번 재검증 |

압축 파일명이 `.br` 또는 `.gz`로 끝나는 경우에는 각각 `Content-Encoding: br`, `Content-Encoding: gzip`도 확인합니다. Unity 번들 내부의 LZ4/LZMA 압축은 HTTP Content-Encoding과 다른 개념이므로 별도의 인코딩 헤더가 없어도 정상입니다.

> **스크린샷 삽입 위치 8 — 브라우저 Network 탭**
>
> catalog, hash, bundle 요청의 Status와 Response Headers가 보이도록 캡처하세요. URL의 gameId를 공개해도 되는지 먼저 확인하세요.

## 8. 콘텐츠 업데이트 배포하기

운영 콘텐츠를 갱신할 때는 다음 순서를 반복합니다.

1. Unity에서 기존 Player와 호환되는 Addressables 콘텐츠 업데이트를 만듭니다.
2. catalog, hash, 새 bundle이 포함된 `ServerData` ZIP을 만듭니다.
3. ZIP을 릴리스 보관소에 별도로 저장합니다.
4. Player가 사용하는 것과 동일한 채널을 선택합니다.
5. **병합** 모드로 업로드합니다.
6. 레이아웃 경고와 채널 통계를 확인합니다.
7. 캐시를 비운 새 브라우저에서 새 콘텐츠를 확인합니다.
8. 이미 실행 중이던 세션도 계속 필요한 에셋을 받을 수 있는지 확인합니다.

catalog와 hash는 브라우저가 서버에 변경 여부를 다시 확인하고, 해시가 붙은 새 번들은 새로운 URL로 내려옵니다. 따라서 이전 번들의 장기 캐시 때문에 새 catalog가 갱신되지 않는 문제를 피할 수 있습니다.

## 9. 이전 콘텐츠로 롤백하기

병합 배포 후 문제가 발견되었다면, 이전 릴리스에서 보관한 catalog와 hash를 사용해 되돌릴 수 있습니다.

1. 해당 채널의 추가 업로드를 잠시 중단합니다.
2. 이전 릴리스의 catalog와 **정확히 짝이 맞는** `.hash` 파일을 준비합니다.
3. 원래와 같은 `ServerData/[BuildTarget]/` 경로로 ZIP을 만듭니다.
4. 같은 채널에 **병합** 모드로 업로드합니다.
5. catalog와 hash가 재검증되는지 확인합니다.
6. 이전 콘텐츠가 실제 Player에서 다시 로드되는지 확인합니다.

이 방법은 이전 catalog가 참조하는 번들이 채널에 남아 있을 때만 작동합니다. 채널을 삭제했거나 교체 모드로 업로드했다면, 이전의 전체 `ServerData` 아카이브를 다시 올려야 합니다.

## 배포 전 최종 체크리스트

- [ ] 테스트 콘텐츠와 운영 콘텐츠에 서로 다른 채널을 사용했다.
- [ ] Player를 빌드하기 전에 `RemoteLoadPath`와 채널을 확정했다.
- [ ] ZIP 안에 `[BuildTarget]` 디렉터리 구조가 유지되어 있다.
- [ ] catalog와 같은 이름의 hash 파일이 함께 있다.
- [ ] 번들 이름에 32자리 콘텐츠 해시가 붙어 있다.
- [ ] 일반 업데이트는 병합 모드로 업로드했다.
- [ ] 외부 호스트를 사용한다면 정확한 Origin을 등록했다.
- [ ] 브라우저에서 catalog, hash, bundle 요청을 확인했다.
- [ ] Console에 CORS 오류와 404가 없다.
- [ ] 업로드 ZIP과 이전 catalog/hash를 릴리스별로 보관했다.

## 자주 묻는 질문

### 콘텐츠를 올리면 WebGL Player도 자동으로 바뀌나요?

아닙니다. Player에 포함된 `RemoteLoadPath`가 같은 채널을 가리키고, 새 catalog와 콘텐츠가 기존 Player와 호환될 때만 Player 재빌드 없이 업데이트할 수 있습니다.

### 테스트가 끝난 뒤 test 채널을 live로 이름만 바꿀 수 있나요?

채널은 URL의 일부이며 Player에 포함됩니다. 채널 이름을 바꾸는 방식으로 승격할 수는 없습니다. 운영 Player가 `live`를 사용한다면 검증된 콘텐츠를 `live` 채널에 별도로 병합 업로드해야 합니다.

### 업로드는 성공했는데 게임에서 catalog를 찾지 못합니다.

ZIP 내부에서 `WebGL/` 같은 `[BuildTarget]` 디렉터리가 사라지지 않았는지 먼저 확인하세요. catalog와 hash가 ZIP 최상위에 있으면 대시보드의 `RemoteLoadPath`와 실제 파일 경로가 맞지 않습니다.

### 로컬에서는 CORS 오류가 나고 배포 페이지에서는 정상입니다.

로컬 Player의 정확한 Origin을 허용 목록에 추가하세요. 예를 들어 개발 서버가 `http://localhost:5173`이라면 프로토콜과 포트를 포함해 그대로 등록해야 합니다.

### 채널을 삭제해도 되나요?

그 채널을 사용하는 Player가 더 이상 없고, 롤백에도 필요하지 않다는 것을 확인한 뒤 삭제하세요. 채널 삭제는 해당 채널의 모든 catalog, hash, bundle을 제거하며 자동 복구할 수 없습니다.

