# BugDrop — Unity WebGL Issue Tracking Platform

A hosted platform for Unity WebGL developers. Upload your build through the dashboard, share a play URL with testers, and collect structured bug reports straight from inside the game.

## Repo layout

```
unity/    Drop-in C# integration + .jslib bridge (copy into your Unity project)
web/      Vite + React — developer dashboard + tester play view
server/   Express + Mongoose API — auth, build storage, issue ingestion, Discord alerts
```

## Quick start

```sh
# 1. Backend
cd server
cp .env.example .env        # set MONGO_URI, JWT_SECRET, and optionally DISCORD_WEBHOOK_URL
npm install
npm run dev                 # listens on :4000

# 2. Frontend
cd ../web
npm install
npm run dev                 # http://localhost:5173  (proxies /api → :4000)
```

Open [http://localhost:5173](http://localhost:5173), create an account, and you'll land on the developer dashboard.

## How it works

### For developers
1. **Create an account** at `/register`.
2. **Create a game** in the dashboard and configure an optional Discord webhook.
3. **Upload your Unity WebGL build** (the four output files: `.loader.js`, `.data`, `.framework.js`, `.wasm`).
4. **Share the play URL** (`/play/<gameSlug>`) with testers — no download, no install required.
5. **Review incoming reports** in the dashboard, scoped to your game and build version.

### For testers
Open the play URL in any browser and press **F2** to open the bug report overlay. Fill in a title and description and submit. The platform automatically captures:
- Recent Unity console logs (errors, warnings, last N messages)
- Custom game state (position, level, inventory — whatever the game exposes)
- Browser metadata: GPU renderer, WebGL version, screen size, viewport, user agent

### End-to-end data flow

```
React overlay  →  Unity C# (SendMessage)  →  .jslib bridge  →  window.__issueTrackerReceive
     ↓
Merges browser metadata  →  POST /api/issues  →  MongoDB  →  Discord webhook (async)
```

1. **React overlay** (`web/src/pages/PlayPage.jsx`) gathers title + description, stashes browser/WebGL metadata, and calls `sendMessage("IssueTracker", "SubmitReport", json)`.
2. **Unity C#** (`unity/Assets/Scripts/IssueTrackerIntegration.cs`) snapshots the log buffer and custom state, then calls the `.jslib` bridge. The GameObject **must be named `IssueTracker`**.
3. **jslib** (`unity/Assets/Plugins/WebGL/IssueTracker.jslib`) forwards the payload to `window.__issueTrackerReceive`. Must live under `Assets/Plugins/WebGL/`.
4. **React receiver** merges browser metadata and `POST`s to `/api/issues` with the `gameId` and `buildId` in context.
5. **Express** validates, writes to MongoDB via the `Issue` model, and fires a Discord notification without awaiting.

## Unity integration

Copy two files into your Unity project:

| File | Destination |
|------|------------|
| `unity/Assets/Scripts/IssueTrackerIntegration.cs` | Any `Scripts/` folder |
| `unity/Assets/Plugins/WebGL/IssueTracker.jslib` | Must be under `Assets/Plugins/WebGL/` |

Add `IssueTrackerIntegration` to a GameObject named exactly **`IssueTracker`** in your scene.

To expose custom game state, subscribe to the `OnCollectCustomState` event:

```csharp
void Start() {
    IssueTrackerIntegration.OnCollectCustomState += collector => {
        collector["level"] = SceneManager.GetActiveScene().name;
        collector["hp"]    = player.health;
    };
}
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/issue_tracker` | MongoDB connection string |
| `JWT_SECRET` | Yes (prod) | insecure dev default | Secret for signing auth tokens — **always set in production** |
| `PORT` | No | `4000` | API server port |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `DISCORD_WEBHOOK_URL` | No | — | **미구현** — 현재는 이 값을 전역으로 사용. 추후 게임별 웹훅 URL로 대체 예정 (Game 모델 구현 시) |

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Create developer account |
| `POST` | `/api/auth/login` | — | Sign in, receive JWT |
| `GET`  | `/api/auth/me` | Bearer | Current user info |
| `POST` | `/api/issues` | — | Submit a bug report (called by the in-game overlay) |
| `GET`  | `/api/issues` | — | List recent issues |

> Build upload endpoints (`POST /api/games`, `POST /api/games/:id/builds`) are in progress.

## Tech stack

| Layer | Stack |
|-------|-------|
| Frontend | Vite + React 18, react-unity-webgl, react-router-dom |
| Backend | Node 20+, Express 4, Mongoose 8 |
| Database | MongoDB |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Notifications | Discord Incoming Webhooks |
