# Implementation plan — build upload caps, safe swap, cache revalidation, thumbnail cache bug

Follow-up to the Builds-tab work already in the working tree (uncommitted). Four independent
items; 1–3 touch build/StreamingAssets handling, 4 is a separate thumbnail cache bug.

Repo: monorepo, `web/` = Vite + React, `server/` = Express + Mongoose. Server tests are
`node --test` under `server/test/`. Windows/PowerShell host.

---

## 1. Raise the StreamingAssets size caps to match multer (2 GB)

**Where:** `server/src/routes/games.js`, the `STREAMING_ASSETS_MAX_*` constants.

Current values were introduced by the previous pass and are more restrictive than the
existing multer limit (`fileSize: 2 * 1024 * 1024 * 1024`, `games.js:46`), so zips that used
to upload fine now fail with 413.

- `STREAMING_ASSETS_MAX_BYTES`: `512 MB` → `2 GB`, so the extracted total matches the multer
  per-file ceiling.
- `STREAMING_ASSETS_MAX_ENTRY_BYTES`: keep a **per-entry** cap and set it to **256 MB**.
  Do *not* raise this to 2 GB. `extractStreamingAssetsZip` calls `entry.getData()`, which
  buffers one whole entry in memory; the per-entry cap is what bounds peak RSS. With a
  256 MB entry cap, peak memory stays ~256 MB regardless of the 2 GB total.
- `STREAMING_ASSETS_MAX_ENTRIES`: leave at 100_000.

Notes:
- Extracted size can exceed the compressed zip size, so the total cap is not implied by the
  multer limit — both checks must stay.
- The running total check (`totalBytes + data.length > STREAMING_ASSETS_MAX_BYTES`) must stay
  *inside* the loop so a zip bomb aborts early rather than after full extraction.
- Confirm the deployment's reverse proxy / body limit also allows 2 GB on the upload host —
  `web/src/api.js:2` notes the upload subdomain bypasses Cloudflare, so the app-level limit
  should now be the binding one.

**Tests:** add coverage that an over-cap entry and an over-cap total each return 413, and
that the error propagates as `err.status` (the handler at `server/src/index.js:152` honors it).

---

## 2. Make the StreamingAssets replace atomic (safe swap)

**Where:** `server/src/routes/games.js`, `PUT /:gameId/builds/:buildId/streaming-assets`.

Current flow deletes the live directory *before* extracting:

```js
await fs.rm(path.join(dir, 'StreamingAssets'), { recursive: true, force: true });
const { relPaths, totalBytes } = await extractStreamingAssetsZip(req.file.path, dir);
```

If extraction throws — corrupt zip, cap exceeded, ENOSPC — the old assets are already gone
while the Build document still advertises the old counts. The build is silently broken.

**Fix:** extract to a sibling temp directory, then swap.

1. Refactor `extractStreamingAssetsZip(zipPath, buildDir)` so the destination root is an
   explicit parameter rather than hard-coded `path.join(buildDir, 'StreamingAssets')`. Keep
   the returned `relPaths` prefixed with `StreamingAssets/` (the `files.other` schema depends
   on that prefix), independent of the physical temp path.
2. Extract into `<buildDir>/.streaming-assets-tmp-<random>`.
3. On success, swap with a rollback-capable rename pair:
   - `rename(StreamingAssets → .streaming-assets-old-<random>)` (ignore ENOENT)
   - `rename(tmp → StreamingAssets)`
   - if the second rename throws, rename `.old` back and rethrow
   - on success `fs.rm(.old, { recursive: true, force: true })`
4. On any failure, `fs.rm(tmp, { recursive: true, force: true })` and leave the live
   directory untouched. Use `finally` so the temp dir never leaks.
5. Only mutate `build.files`, `streamingAssetsFileCount/Bytes/UpdatedAt` and `storageBytes`
   **after** the swap succeeds.

Also handle:
- **Disk headroom:** the temp copy doubles peak usage — with a 2 GB cap that is ~4 GB. Worth
  a comment; optionally pre-check free space.
- **Concurrent replaces** on the same build are currently unguarded and would interleave the
  swap. A per-build in-process lock (a `Map<buildId, Promise>` guard returning 409 while a
  replace is in flight) is enough; a full distributed lock is out of scope.
- Sweep stale `.streaming-assets-tmp-*` / `.streaming-assets-old-*` directories on startup
  or in `calculateBuildStorageBytes` so a crash mid-swap does not inflate storage forever.
  Make sure these dot-directories are never served by `GET /builds/:buildId/*`.

**Tests:** extend `server/test/build-streaming-assets.test.js` — force an extraction failure
(entry over the cap) and assert the pre-existing StreamingAssets files still exist, the
Build metadata is unchanged, and no temp directory remains.

---

## 3. Replace `no-store` on StreamingAssets with ETag revalidation

**Where:** `server/src/index.js`, the `GET /builds/:buildId/*` handler (~line 74).

The previous pass set `no-store, no-cache, must-revalidate` for StreamingAssets. That fixes
staleness but re-downloads every asset on every play session — bad for load time and for
egress, especially behind Cloudflare.

**Constraint that rules out the alternative:** URL versioning is *not* viable here. Unity
builds StreamingAssets URLs at runtime from `Application.streamingAssetsPath` + a relative
path inside the game code, so the server cannot inject a version token. And now that assets
can be replaced in place, `buildId` no longer identifies content. Conditional GETs are the
correct tool.

**Fix:**
- Keep `public, max-age=31536000, immutable` for the four Unity artifacts (`.loader.js`,
  `.data`, `.framework.js`, `.wasm`) — those are genuinely immutable per `buildId`.
- For `StreamingAssets/...` paths, send `Cache-Control: public, max-age=0, must-revalidate`
  plus a validator, and answer conditional requests with `304`:
  - `stat()` the file and derive a strong-ish ETag from `size` + `mtimeMs`
    (e.g. `W/"<size>-<mtimeMs>"`), and set `Last-Modified`.
  - If `If-None-Match` matches (or `If-Modified-Since` is not older than `mtime`), return
    `res.status(304).end()` **before** opening the read stream.
- Unchanged assets then cost one small conditional request instead of a full transfer, and
  Cloudflare honors the 304s.

Implementation detail: the handler currently pipes `createReadStream` directly, so Express
adds no validators — they must be set explicitly. Do not switch to `res.sendFile` blindly;
the handler already sets `Content-Encoding` for `.br`/`.gz` and that must be preserved.

**Tests:** a request with a matching `If-None-Match` returns 304 with an empty body; after a
StreamingAssets replace the ETag changes and a full 200 is returned; the four Unity artifacts
still get `immutable`.

---

## 4. Thumbnail replace/remove/re-upload shows the old image (root cause + fix)

### Diagnosis (confirmed — not a data-loss bug)

The thumbnail URL is **content-independent**: `games.js:373` writes
`game.thumbnailUrl = '/thumbnails/<gameId>.<ext>'`. `server/src/index.js:96` serves it with
`Cache-Control: public, max-age=3600` and **no ETag and no Last-Modified** — the handler
pipes `createReadStream` directly, and Express's automatic ETag only applies to `res.send`.
So every thumbnail gets a one-hour cache entry with no way to revalidate it.

That produces all three reported symptoms:

1. **Replace + save reverts to the old image.** Uploading a same-extension image overwrites
   the bytes at the same path and returns an *identical* `thumbnailUrl` string, so
   `savedSettings.thumbnailUrl` does not change, `<img src>` does not change
   (`GameDetailPage.jsx:483-486`), and no re-fetch happens at all. Even forcing one would hit
   the still-valid cache entry. Two independent causes for the same wrong result.
2. **Remove shows the gradient fallback.** `DELETE` sets `thumbnailUrl=''`, the src goes
   falsy and the fallback renders. Correct behavior — but it only unmounts the `<img>`; the
   HTTP cache entry survives.
3. **Uploading a new image resurrects the old one.** A new file with the same extension
   yields the same URL again; the `<img>` remounts against a cache entry that is still inside
   its hour, so the browser serves the previous bytes. The new file is on disk and the DB is
   correct — only the cache is stale.

Confirming detail: changing extension (jpg → png) changes the URL and works fine, which is
why the bug looks intermittent. The POST route already deletes all four extensions before
writing (`games.js:366-370`), so disk and DB stay consistent. This is purely cache
invalidation.

Aggravating factor: `web/src/api.js:2` documents a Cloudflare proxy in front of the main
domain, so `max-age=3600` also pins the old bytes at the edge, where the app cannot purge
them. A client-side `?v=` cache-buster alone is therefore not sufficient to trust.

### Fix — version the stored filename (server-side, authoritative)

Unlike StreamingAssets, we own this URL end to end (it is persisted on the Game document), so
content-addressed naming is available and is the robust fix.

1. In `POST /:gameId/thumbnail` (`games.js:344`), write to
   `<gameId>-<token>.<ext>` where `<token>` is a short content hash (sha1 of `req.file.buffer`,
   first 8–10 hex chars) or `Date.now().toString(36)`. Prefer the content hash so re-uploading
   an identical image is a no-op URL.
2. Before writing, delete the previous file using the **old `game.thumbnailUrl` basename**,
   and keep a glob-style sweep of `<gameId>*.{png,jpg,webp,gif}` so pre-existing unversioned
   files and any orphans from interrupted uploads are cleaned up. Do not rely on the fixed
   four-extension list alone anymore.
3. Persist the new versioned `thumbnailUrl` and return it, as today.
4. In `server/src/index.js:88`, the filename guard already rejects `..` and `/`; keep it and
   make sure the widened filename pattern still passes. Now that names are content-addressed,
   switch the header to `public, max-age=31536000, immutable`.
5. `DELETE /:gameId/thumbnail` (`games.js:382`) already removes
   `path.basename(game.thumbnailUrl)`; extend it to the same `<gameId>*` sweep so a stale
   versioned file cannot survive a delete.

Because the URL now changes on every distinct image, the React `<img src>` changes on its own
and no frontend change is strictly required. Still worth doing in `GameDetailPage.jsx`:

- After a successful upload, `savedSettings.thumbnailUrl` receives a genuinely new string —
  verify the preview updates without a manual reload.
- `handleSave` (`GameDetailPage.jsx:546-556`) uploads the thumbnail *after* `updateGame`;
  confirm `updateGame` never echoes a stale `thumbnailUrl` back into `setGame`, since
  `setGame((prev) => ({ ...prev, ...(updated || {}) }))` would clobber the fresh value if the
  update response carries the old URL. Order the state merges so the thumbnail result wins.

**Migration:** existing rows hold unversioned `/thumbnails/<gameId>.<ext>` URLs. They keep
working (the file is still there and still served); they simply become versioned on the next
upload. No backfill required — but do not delete unversioned files except through the sweep
described above.

**Tests:** add `server/test/game-thumbnail.test.js` — uploading twice with the same extension
yields two different `thumbnailUrl` values, the previous file is removed from disk, delete
removes the versioned file, and unsupported MIME types still 400.

---

## Verification for all four items

```sh
cd server && npm test          # currently 128 passing; must stay green
cd web && npm run build
```

Append a dated section to `progress.md` per CLAUDE.md. Keep i18n strings in
`web/src/i18n.jsx` for both `ko` (primary) and `en` if any user-facing copy is added.
