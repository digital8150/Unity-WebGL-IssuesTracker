# Implementation plan — Addressables remote content hosting

Goal: let a game developer upload their Addressables **remote** content (`ServerData/WebGL/`)
and have the platform serve it from a **stable, build-independent URL** with correct MIME,
caching, and range semantics.

Explicitly **not** in scope: any runtime SDK involvement. Addressables stays fully decoupled
from `ArcadeSdk` — the developer pastes a URL into their Addressables profile at Unity build
time and nothing is injected at runtime. See "Consequences of the no-SDK decision" below.

Repo: monorepo, `web/` = Vite + React, `server/` = Express + Mongoose. Server tests are
`node --test` under `server/test/`. Windows/PowerShell host.

---

## 0. Locked decisions

These were open questions; they are settled here so implementation does not stall.

1. **URL is keyed by `gameId`, never `gameSlug`.** `Game.slug` (`server/src/models/Game.js:25`)
   is only ever produced by `generateSlug` at creation (`server/src/routes/games.js:359`) and
   no PATCH path writes it, so it is *currently* immutable — but nothing enforces that. A
   future "edit slug" feature would silently break every shipped catalog. `gameId` is an
   immutable ObjectId.
2. **A `channel` path segment is mandatory** even though nothing needs it on day one. It is
   the only escape hatch for replacing content without breaking sessions holding an old
   catalog, and it cannot be added later without invalidating shipped catalogs.
3. **Upload defaults to merge, not replace.** The existing StreamingAssets endpoint is
   destructive (`games.js:662` drops all prior files). Applying that to Addressables would
   delete bundles that in-flight sessions still resolve through an older catalog. Replace is
   available as an explicit opt-in.
4. **Immutable caching is auto-detected from the filename**, not configured. A file whose
   basename contains a 32-hex-character segment (Addressables' content hash) is served
   `immutable`; everything else revalidates. This avoids an unrecoverable footgun — a
   developer who disabled hashed bundle names would otherwise pin stale content in every
   returning player's browser cache for a year with no server-side remedy.

---

## 1. URL and storage contract

**Public URL** (this is the string the dashboard shows the developer):

```text
https://arcade.codingbot.kr/content/<gameId>/<channel>/
```

The developer sets their Addressables profile **RemoteLoadPath** to:

```text
https://arcade.codingbot.kr/content/<gameId>/<channel>/[BuildTarget]
```

and **RemoteBuildPath** to the usual `ServerData/[BuildTarget]`. They then zip
`ServerData/` (or `ServerData/WebGL/`) and upload it.

**On-disk layout**, mirroring `STORAGE_ROOT` in `games.js:66`:

```text
server/storage/content/<gameId>/<channel>/WebGL/*.bundle
server/storage/content/<gameId>/<channel>/WebGL/catalog_*.json
```

Validation:
- `gameId` — must satisfy `mongoose.Types.ObjectId.isValid`; reject otherwise with 400.
- `channel` — `^[a-z0-9][a-z0-9-]{0,31}$`. Default `live`.
- The `[BuildTarget]` segment (`WebGL`) comes from inside the uploaded zip; the server does
  not synthesize it. Reuse the existing single-wrapper-folder strip logic
  (`games.js:133-139`) so a zip of `ServerData/` and a zip of its *contents* both land
  correctly — extend it to strip a leading `serverdata` wrapper as well as `streamingassets`.

**Effort: ~0.5 day** (mostly the shared-extractor refactor in §3).

---

## 2. Model — `server/src/models/AddressableContent.js`

```js
{
  gameId: { type: ObjectId, ref: 'Game', required: true, index: true },
  channel: { type: String, required: true, default: 'live' },
  fileCount: { type: Number, default: 0 },
  storageBytes: { type: Number, default: 0 },
  lastUploadAt: { type: Date, default: null },
}
// compound unique index on { gameId, channel }
```

**Deliberately does not store the file list.** `Build.files.other` stores every extracted
StreamingAssets path (`Build.js:14`), which at the 100k-entry cap approaches Mongo's 16 MB
document limit. Addressables content is exactly the workload that would hit it. The file
inspector reads the directory on demand instead (§5).

**Effort: ~0.25 day.**

---

## 3. Extract the zip pipeline into a shared service

**Where:** new `server/src/services/assetArchive.js`; `games.js` imports from it.

Move, unchanged in behavior, from `games.js`:
- `streamingAssetsError` (`games.js:114`)
- `extractStreamingAssetsZip` (`games.js:123`) → generalize as
  `extractArchive(zipPath, destinationRoot, { prefix, wrapperNames, limits })`
  where `prefix` is `'StreamingAssets'` for the existing caller and `''` for content,
  and `wrapperNames` is `['streamingassets']` / `['serverdata']`.
- the swap/rollback/lock trio (`games.js:183`, `:199`, `:212`) → parameterize the live
  directory name and the `.tmp-`/`.old-` prefixes.

Keep every existing guard intact: the zip-slip check (`games.js:158`), the per-entry cap, and
the **running** total check inside the loop so a zip bomb aborts early.

Add a merge mode: extract to the temp dir as today, then instead of swapping, walk the temp
tree and `moveFile` (`games.js:53`) each file over the live tree, creating directories as
needed. Per-file atomic is sufficient for merge semantics.

Caps for content — Addressables payloads are larger than StreamingAssets, but raising the
multer ceiling (`games.js:46`, 2 GB) is out of scope. Start with the same numbers
(`100_000` / `256 MB` / `2 GB`) so peak RSS stays bounded by the per-entry cap; revisit only
if a real project trips it.

> This refactor is the single highest-risk item in the plan because it touches the working
> build-upload path. It must land with the existing StreamingAssets tests green and
> unmodified — if a test needs editing, the refactor changed behavior.

**Effort: ~0.75 day.**

---

## 4. Upload + management endpoints

**Where:** new `server/src/routes/gameContent.js`, mounted in `server/src/index.js` next to
the existing `app.use('/api/games', gamesRouter)` lines (`index.js:52-54`).

All routes: `requireAuth`, `requireApproved`, and the same ownership check `games.js` uses
(`isAuthorized(game, req.user.sub)` — owner or collaborator), returning 404 (not 403) on
failure to match existing behavior.

| Route | Behavior |
|---|---|
| `GET /api/games/:gameId/content` | List channels for the game + the public base URL for each. |
| `PUT /api/games/:gameId/content/:channel` | multipart `contentZip`. Query/body `mode=merge\|replace`, default `merge`. Reuses the per-target lock so concurrent uploads 409, same as `games.js:645`. |
| `GET /api/games/:gameId/content/:channel/files` | Paginated directory walk (`?offset=&limit=`) for the inspector. Never loads the whole tree into one response. |
| `DELETE /api/games/:gameId/content/:channel` | Purge the channel directory and the document. |

After every mutation, recompute `storageBytes` by walking the channel directory (a variant of
`calculateBuildStorageBytes`, `games.js:258`, that stats the tree rather than a name list).

Also: **delete the content directory when the game is deleted.** Add the
`storage/content/<gameId>` removal to `DELETE /:gameId` (`games.js:440`) — otherwise every
deleted game leaks its entire Addressables payload.

> ⚠️ **Pre-existing bug found while writing this plan, not caused by it.** `DELETE /:gameId`
> removed only `GameArticle` documents, the `Game`, and its translations. It did **not**
> delete `Build` documents, `Issue` documents, `storage/builds/<buildId>/` directories, or
> thumbnail files. Deleting a game therefore orphaned its entire build payload on disk
> permanently — and because `/api/auth/usage` (`auth.js:131`) scopes its aggregation to
> currently-owned games, that orphaned disk usage stopped counting against the owner's quota.
>
> **Resolved as part of this work** rather than deferred: the deletion path now removes build
> and content directories and thumbnail files, plus `Build`, `Issue`, `AddressableContent`,
> `GameConfig`, `Leaderboard`, `LeaderboardScore`, and `CloudSave` documents. Deletion is
> therefore expected to leave no payload behind for the game.

**Effort: ~0.75 day.**

---

## 5. Serving handler

**Where:** `server/src/services/buildFiles.js`, new `createContentFileHandler(contentRoot)`.
Mount in `index.js` beside the existing static handlers (`index.js:59-60`):

```js
app.get('/content/:gameId/:channel/*', createContentFileHandler(CONTENT_ROOT));
```

Start from `createBuildFileHandler` (`buildFiles.js:35`) and change four things.

### 5a. MIME

```text
.bundle            → application/octet-stream
.json              → application/json
.hash              → text/plain
.bin               → application/octet-stream
otherwise          → application/octet-stream
```
Keep the existing `.br`/`.gz` suffix → `Content-Encoding` handling (`buildFiles.js:51-54`);
Addressables does not produce those names, but it costs nothing and is consistent.

### 5b. Cache policy — inverted relative to StreamingAssets

The current StreamingAssets branch sets `max-age=0, must-revalidate` on *everything*
(`buildFiles.js:59`). For content:

```js
const HASHED = /[0-9a-f]{32}/i;
const isCatalog = /^catalog.*\.(json|bin|hash)$/i.test(base)
               || base.endsWith('.hash');

if (isCatalog)                       → 'no-cache' + ETag + Last-Modified (revalidate)
else if (HASHED.test(base))          → 'public, max-age=31536000, immutable'
else                                 → 'public, max-age=0, must-revalidate' + ETag
```

Rationale for the fallback being *revalidate*, not immutable: a developer who turned off
hashed bundle names gets correct-but-slower behavior instead of permanently poisoned client
caches. The dashboard surfaces this (§7) so they can fix it and get the fast path.

Reuse `matchesEtag` (`buildFiles.js:27`) and the `if-modified-since` comparison
(`buildFiles.js:63-69`) verbatim for the revalidating branches.

### 5c. `Content-Length` — currently missing everywhere

`createBuildFileHandler` pipes without setting a length (`buildFiles.js:74`), so responses go
out chunked. Set `Content-Length: stat.size` on every 200. This is what lets Unity's loader
report real progress and lets any CDN in front of the origin cache the object.

Worth applying to `createBuildFileHandler` too, in the same pass — it is a one-line
improvement to the existing build path with no behavioral risk.

### 5d. Range requests — the only genuinely new code

```text
Always: res.setHeader('Accept-Ranges', 'bytes')

If req.headers.range matches /^bytes=(\d*)-(\d*)$/:
  resolve start/end (suffix form `bytes=-N` = last N bytes)
  if unsatisfiable (start >= size):
    416 + 'Content-Range: bytes */<size>'
  else:
    206
    'Content-Range: bytes <start>-<end>/<size>'
    'Content-Length: <end - start + 1>'
    createReadStream(filePath, { start, end })
Else: 200 as above.
```

Only single-range is supported; a multi-range header (`bytes=0-9,20-29`) should fall through
to a normal 200 rather than attempting multipart/byteranges.

Note `res.status(304)` must not carry `Content-Length` — set the length only on the 200/206
paths.

**Effort: ~0.75 day.**

---

## 6. Quota

`GET /api/auth/usage` (`server/src/routes/auth.js:129`) aggregates `Build.storageBytes` only.
Add a second aggregation over `AddressableContent.storageBytes` for the same `gameIds` and sum
both into `usedBytes`. Without this, content hosting silently bypasses the quota entirely.

**Decision needed from the product side:** the default quota is `500 MB`
(`auth.js:140`). A single Addressables catalog will often exceed that on its own. Either
raise the default or make it clear in the dashboard that content counts against it — but do
not ship the feature with content excluded from the aggregation.

**Effort: ~0.25 day.**

---

## 7. Dashboard UI

**Placement: a new `content` tab on the game detail page**, not the LiveOps tab.

Two concrete reasons it must not go under LiveOps:
- `ServerIntegrationTab.jsx:417` wraps the entire tab body in `{liveOpsEnabled && ...}`.
  Turning the LiveOps master switch off would hide content management, blocking a game that
  uses Addressables without leaderboards or cloud saves.
- That tab's model is a mutually-exclusive Legacy-vs-v2 mode pick
  (`ServerIntegrationTab.jsx:171`). Addressables is orthogonal to that axis and valid in
  either mode, or with LiveOps off entirely.

**Where:** `web/src/pages/GameDetailPage.jsx` — add a tab button next to the existing ones
(`:1601-1616`) and a `{tab === 'content' && ...}` panel (pattern at `:1622`). Put the panel
body in a new `web/src/pages/GameContentTab.jsx` rather than growing the 1900-line page file.

Panel contents:

1. **The URL card, shown before any upload exists.** This is the most important element on
   the page — with no runtime injection, the developer needs this string *before* they build
   in Unity. Show the full `RemoteLoadPath` value including the `/[BuildTarget]` suffix, with
   a copy button, plus a one-paragraph "paste this into your Addressables profile" note.
2. **Upload** — reuse `uploadMultipart` (`web/src/api.js:199` pattern) for XHR progress; the
   Builds tab already has the progress/cancel/terminal-state UI to copy.
3. **Mode selector** — merge (default) / replace, with replace clearly marked destructive.
4. **Stats** — file count, size, last upload, channel.
5. **File inspector** — paginated against the `/files` endpoint. The StreamingAssets
   expandable summary is the visual precedent.
6. **Unhashed-bundle warning** — if the upload response reports bundles without a 32-hex
   segment, show a warning explaining they are served without long-lived caching and pointing
   at Addressables' bundle naming setting. Cheap to compute during extraction.

New API client functions in `web/src/api.js` under a `// ── Addressables content ──` section,
matching the existing style.

**Effort: ~1 day.**

---

## 8. i18n

Add `ko` and `en` strings to `web/src/i18n.jsx` in both locale blocks (the existing
StreamingAssets keys near `:264` and `:1018` show the convention). Per `progress.md`, both
blocks must be fully translated — no English strings left inside `ko`.

**Effort: ~0.25 day.**

---

## 9. Ops — production Apache

`/content/` must be proxied to Node in production, exactly as `/builds/` and `/thumbnails/`
are. The production Apache config is host-managed and **not in this repo** — `docs/` records
prior incidents from exactly this gap (`apache-en-proxy.md`, and the `/privacy` routing
correction in `progress.md`). Treat it as a required release step, not an afterthought.

Preview environments need no change: `deploy/preview/previewctl.sh:253` proxies `/` wholesale.
If `SERVE_STATIC=true` is used, add `/content/` to the SPA-fallback exclusion list at
`server/src/index.js:98-102`, otherwise asset 404s return `index.html`.

CORS needs no change as long as content is served from the same origin as the play page.
`cors({ origin: CORS_ORIGIN })` (`index.js:43`) is SPA-scoped; if content ever moves to a
separate CDN hostname, that becomes a required addition.

---

## 10. Tests — `server/test/`

Follow the existing `node --test` style.

Extraction / upload:
- zip-slip entry is skipped; over-cap entry and over-cap total each 413 with `err.status`
- `serverdata` / `ServerData` wrapper folder stripped; already-inner zip unaffected
- merge preserves a file absent from the new zip; replace removes it
- concurrent upload to the same channel returns 409
- invalid `channel` and invalid `gameId` return 400
- non-owner returns 404
- `storageBytes` and `fileCount` reflect the tree after each mode
- game deletion removes the content directory

Serving:
- hashed `.bundle` → `immutable`; `catalog_x.json` → revalidating + ETag; unhashed bundle →
  `must-revalidate`
- `Content-Length` present on 200; `Accept-Ranges: bytes` always
- `Range: bytes=0-99` → 206 with correct `Content-Range` and body length
- suffix range `bytes=-50`; unsatisfiable range → 416
- multi-range header falls back to 200
- `If-None-Match` on the catalog → 304 with no `Content-Length`
- `..` traversal → 400

Quota:
- `/api/auth/usage` sums build + content bytes

**Effort: ~0.5 day.**

---

## 11. Verification (per `progress.md` baseline)

```sh
cd server; npm test          # existing count must not regress; new cases added
cd web; npm run build
node --check server/src/routes/gameContent.js
node --check server/src/services/assetArchive.js
node --check server/src/services/buildFiles.js
git diff --check
```

Manual pass that the automated tests cannot cover:
1. Build a real Unity WebGL project with a remote Addressables group pointed at the dashboard
   URL, upload the zip, and confirm the game loads remote assets from `/content/...`.
2. Re-upload changed content **without rebuilding the player** and confirm the client picks it
   up — this is the entire point of the feature and the one thing that proves the cache policy
   is right. Verify in DevTools that the catalog revalidates (200/304) while bundles come from
   disk cache.
3. Confirm a returning session is not broken mid-play by a merge upload.

---

## 12. Effort summary

| Section | Days |
|---|---|
| 1. URL/storage contract | 0.5 |
| 2. Model | 0.25 |
| 3. Shared archive service refactor | 0.75 |
| 4. Endpoints | 0.75 |
| 5. Serving handler (incl. Range) | 0.75 |
| 6. Quota | 0.25 |
| 7. Dashboard UI | 1.0 |
| 8. i18n | 0.25 |
| 10. Tests | 0.5 |
| **Total** | **~5 days** |

Unity-side work: **zero**. Ops: one Apache rule.

---

## Consequences of the no-SDK decision

Accepted deliberately; recorded so they are not rediscovered as bugs.

- **The URL is baked at Unity build time.** Changing the platform domain, or moving content to
  a CDN hostname, invalidates every shipped catalog until each game is rebuilt. Mitigation if
  this ever becomes real: serve `/content/` from a hostname chosen for permanence, or add the
  runtime `InternalIdTransformFunc` override at that point.
- **Remote content cannot be exercised in PR preview environments**, which run on a different
  hostname. Developers test locally with a separate Addressables profile. Acceptable.
- **Content is public and unauthenticated**, matching `/builds/` today. Anyone with a `gameId`
  can enumerate and download assets. If signed access is ever introduced it must cover builds
  and content together, or it accomplishes nothing.

---

## Out of scope / follow-ups

- `addressables_content_state.bin` custody (would make Unity's "Update a Previous Build"
  reproducible across machines and CI). Real value, but independent of this plan.
- Orphaned-bundle garbage collection beyond the blunt `replace` mode.
- Multi-range (`multipart/byteranges`) responses.
- Raising the 2 GB multer ceiling.
