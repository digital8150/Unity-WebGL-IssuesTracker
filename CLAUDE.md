# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product vision

This repo is becoming **`web-gl-game-issue-tracking-platform`** — a hosted, multi-tenant service where Unity WebGL developers:

1. **Upload a WebGL build** through the web dashboard (no manual file copying into `web/public/`).
2. Receive a **shareable play URL** (e.g. `/play/<gameSlug>` or `/play/<buildId>`) to send to testers.
3. **Testers** open the URL, play the game in the browser, and file bug reports / suggestions
4. **Developers** review incoming reports in a dashboard view, scoped to their game/build, with optional Discord webhook forwarding.

Key implications for any change:
- Builds are **per-project, per-version artifacts** stored on the server (filesystem or object storage) and served dynamically — they are **not** baked into the React app bundle anymore.
- Every issue report must be **associated with a `gameId` + `buildId`** so reports stay scoped to the right project.
- The platform is **multi-tenant**: dashboard routes need auth (developer accounts), but the `/play/<...>` route and the `POST /api/issues` ingestion endpoint stay public (testers should not need accounts).
- Discord webhook config moves from a global env var to **per-game settings** stored on the Game document. Keep the env var as a fallback / global default.

## Progress tracking

**Read `progress.md` at the start of every session** to learn what's done, what's pending, and any open decisions left by previous sessions. **Update `progress.md` at the end of a session** whenever you complete a milestone, change scope, or surface a new TODO/decision. Append a new dated section rather than rewriting prior entries. Keep entries terse — bullets, not prose.

## Repo shape

Monorepo with three independent workspaces. There is no root `package.json` — install and run each side separately.

- `unity/` — drop-in C# integration (`IssueTrackerIntegration.cs`) and WebGL bridge (`IssueTracker.jslib`). Intended to be copied into a downstream Unity project so the developer's game can emit issue payloads; this folder is **not** itself a Unity project (no `ProjectSettings/` etc.).
- `web/` — Vite + React host. Contains both the **developer dashboard** (upload builds, view reports, manage games) and the **tester play view** (`/play/<...>` that embeds the uploaded WebGL build via `react-unity-webgl` and shows the bug-report overlay).
- `server/` — Express + Mongoose API. Handles auth, build upload + storage, signed/public build serving, issue ingestion, and per-game Discord webhook fan-out.

## Common commands

```sh
# Backend (server/)
npm install
npm run dev          # node --watch src/index.js, listens on :4000
npm start            # production start

# Frontend (web/)
npm install
npm run dev          # vite dev on :5173, proxies /api → :4000
npm run build
npm run preview
```

No test suite or linter is configured yet. If you add one, prefer Vitest for `web/` and `node --test` for `server/`.

## Conventions to preserve

- **C# follows Microsoft C# Coding Conventions** (PascalCase types/methods/properties, camelCase fields/locals, namespace `IssueTracker`, XML doc comments on public surface). When extending `IssueTrackerIntegration.cs`, match the existing style — do **not** introduce Unity-style `m_` prefixes or other deviations.
- **The Unity C# JSON writer is deliberately hand-rolled** to avoid pulling in Newtonsoft and to keep `customState` keys ordering predictable. Don't replace it with `JsonUtility` (which can't handle `Dictionary<string, object>`) without a strong reason.
- **Custom state is opaque to the server.** Treat it as `Mixed`/JSON; don't add per-game fields to the schema.
- **Discord notifications are env-gated and per-game.** `sendDiscordNotification` no-ops when neither the game-level webhook nor `DISCORD_WEBHOOK_URL` is set — preserve that behavior. The env var is the global fallback; per-game settings on the `Game` document win when present.
- **Builds belong to a game.** Never reference a hard-coded `/unity/Build/...` path in new code. Builds are resolved via `gameId`/`buildId` through the API.

## Build upload + serving (platform model)

Builds are uploaded through the dashboard (`POST /api/games/:gameId/builds`, multipart) and stored server-side — **not** copied into `web/public/`. The server is responsible for:

- Accepting the four Unity WebGL artifacts (`*.loader.js`, `*.data`, `*.framework.js`, `*.wasm`) plus optional `StreamingAssets/`.
- Storing them under a per-build directory (e.g. `server/storage/builds/<buildId>/`) and recording metadata in a `Build` Mongoose model (`gameId`, `version`, `createdAt`, file map, optional `isActive` flag).
- Serving them publicly at a stable URL like `/builds/<buildId>/<filename>` with the correct MIME types (`application/wasm`, `application/octet-stream` for `.data`, gzip/br headers if compressed).

The tester play route (`/play/:gameSlug` or `/play/:buildId`) loads the build dynamically: `UnityGame.jsx` takes the loader/data/framework/wasm URLs as props rather than hard-coding `/unity/Build/...`. **There is no longer a "copy your build into `web/public/unity/Build/`" step** — that path only exists for legacy local testing and should be removed once upload works end-to-end.

## Environment

- Platform: Windows (PowerShell). Path-sensitive operations should use PowerShell syntax; `npm` scripts are cross-shell.
- Node 20+ recommended (uses top-level `await` and `node --watch`).
- MongoDB running locally on the default port for `npm run dev` to connect.
