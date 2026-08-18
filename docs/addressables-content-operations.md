# Addressables content operations

This runbook covers remote Addressables content served from
`/content/<gameId>/<channel>/[BuildTarget]`.

## Channel strategy

- Treat a channel as a player/content compatibility line, not as a temporary folder.
- Use `live` for the current line and create a new channel such as `v2` when a new player
  build must be isolated from the catalogs and bundles used by existing players.
- Bake the selected channel into the Unity Addressables `RemoteLoadPath` before building the
  player. Changing a channel later requires a player rebuild.
- Keep the previous channel available until clients using it have aged out.

Routine content-only releases should use **merge**. Merge writes bundles first and catalog
metadata last, and it keeps bundles that an older catalog may still reference. Avoid
**replace** for a live channel: after a successful replace the previous directory is deleted
and there is no server-side revision history to restore.

## Before every merge upload

1. Build remote content into `ServerData/[BuildTarget]`.
2. Zip `ServerData/` itself. Do not zip only the contents of `ServerData/WebGL/`; doing so
   removes the directory represented by `[BuildTarget]` and makes runtime URLs return 404.
3. Save every currently deployed catalog — `catalog_*.json` or `catalog_*.bin`, depending on the
   catalog format the project builds — together with the `.hash` file of the exact same base
   name in the release archive. Name the archive with the channel and release identifier.
4. Confirm the account has enough free storage. Builds and Addressables content share the
   account storage quota; an upload that would exceed it is rejected before live files change.
5. Upload with **merge** and review every layout warning in the dashboard.

The upload API deliberately returns layout problems as `warnings`, not errors. A successful
HTTP response means extraction and installation completed; it does not mean Unity can resolve
the catalog unless the catalog/hash pair is directly below a build-target directory.

## Verification

For each uploaded build target:

1. Request `/content/<gameId>/<channel>/<BuildTarget>/catalog_*.json` — or `catalog_*.bin` when
   the project builds binary catalogs — and the `.hash` file of the exact same base name.
2. Request at least one bundle named by that catalog and confirm it returns 200.
3. Start the WebGL player with a cold browser cache and load content that is unique to the new
   release.
4. Repeat with an already-running session when the release must remain compatible with older
   catalogs.

Do not promote or delete the previous channel until these checks pass.

## Roll back a merge release

Merge is the only upload mode with a practical rollback path. It retains old bundles, so a
previous catalog can point to them again.

1. Stop further uploads to the affected channel.
2. Take the previous catalog — `catalog_*.json` or `catalog_*.bin` — and the `.hash` file of the
   exact same base name from the release archive. A catalog paired with a `.hash` from a
   different release does not roll back cleanly.
3. Put both files under the same `[BuildTarget]/` path they originally used and create a zip.
   For example: `ServerData/WebGL/catalog_2026.08.json` and
   `ServerData/WebGL/catalog_2026.08.hash`, or `ServerData/WebGL/catalog_2026.08.bin` and
   `ServerData/WebGL/catalog_2026.08.hash` for binary catalogs.
4. Upload that zip to the same channel using **merge**. Never use replace for rollback.
5. Fetch the catalog and hash with cache revalidation, then run the verification steps above.

This works only while every bundle referenced by the old catalog is still present. Deleting a
channel or using replace removes that guarantee. If replace has already succeeded, recovery
requires re-uploading a complete known-good `ServerData/` archive or moving clients to another
intact channel; the platform cannot restore the deleted directory automatically.

Quota checks serialize storage updates per owner because the quota covers all of that owner's
games. Uploads to different games wait for the check to finish instead of being rejected. The
mutex is in-process only; a multi-instance deployment must replace it with a distributed lock or
an atomic storage reservation.

## Cross-origin (CORS) content access

A WebGL player hosted on this platform loads its own game's content same-origin — no CORS
involved. A player hosted elsewhere (GitHub Pages, itch.io, a self-managed static host) with
its Addressables `RemoteLoadPath` pointing back at this server's `/content/<gameId>/<channel>/`
URLs makes a genuine cross-origin request, which the browser blocks unless that origin is
explicitly allowed.

- Add the player's origin (e.g. `https://username.github.io`) on the dashboard's Addressables
  content tab, under **Allowed external origins**. Scheme + host (+ port) only — no path, no
  trailing slash.
- Changes take effect immediately; the server also runs a 30-second fallback in-process cache
  so a save always beats the TTL, but that cache is per server process — a multi-instance
  deployment needs either a shared cache or to route all `/content/` traffic to a single
  instance until that is added (`server/src/routes/gameContent.js`, `contentCors`).
- This platform's own origin (`SITE_ORIGIN`) is always allowed and never needs a manual entry.
- Up to 20 origins per game. There is no wildcard/`*` option — every origin is explicit.
- This setting only affects `/content/`. It does not affect `/builds/` (the player itself is
  still expected to load from wherever it's hosted) or the dashboard/API's own CORS policy
  (`CORS_ORIGIN`, unrelated and SPA-scoped).

## Retiring content

- Prefer retiring an entire old channel after its player population has aged out.
- Use replace only for a deliberate full reconstruction from a complete, verified archive.
- Record the game ID, channel, player version, catalog/hash pair, upload mode, and verification
  result for each release.
