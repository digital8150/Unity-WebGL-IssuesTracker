# Unity Client — Issue Tracker Integration

Drop-in WebGL bug-report capture for any Unity project.

## Install

1. Copy `Assets/Scripts/IssueTrackerIntegration.cs` and `Assets/Plugins/WebGL/IssueTracker.jslib` into your Unity project (preserve the `Plugins/WebGL/` path so Unity recognises the jslib).
2. Add an empty GameObject named `IssueTracker` to your bootstrap scene and attach `IssueTrackerIntegration`.
3. (Optional) Subscribe to `OnCollectCustomState` to attach game-specific state. Multiple scripts can subscribe; their dictionaries will be merged into a single object (duplicate keys will be overwritten by the last subscriber):

```csharp
void Start()
{
    // Example in Player script
    IssueTracker.IssueTrackerIntegration.Instance.OnCollectCustomState += () =>
        new Dictionary<string, object>
        {
            { "hp", player.Health },
            { "pos", player.transform.position }
        };
}
```

## How the play page triggers a report

The play page's **Report a Bug** button calls `unityInstance.SendMessage("IssueTracker", "SubmitReport", '{"manualTrigger":true}')`.

The C# side appends buffered logs + custom state, serializes to JSON, and hands the payload back to JS via `IssueTracker_SubmitReport` (declared in `IssueTracker.jslib`). The JS side forwards it to `window.__issueTrackerReceive`; the play page stores that snapshot and opens the dedicated report page, where the tester enters the title and description.

## Authenticated Arcade SDK v2

SDK v2 adds account-backed leaderboards, dynamic config reads, and optional cloud saves. In the dashboard's **Server Integration → SDK v2** section, enable SDK v2 and copy both generated files into the matching Unity paths:

- `Assets/Scripts/ArcadeSdk.cs`
- `Assets/Plugins/WebGL/ArcadeSdk.jslib`

Add `ArcadeSdk` to a bootstrap-scene GameObject. The component automatically corrects the GameObject name to `ArcadeSdk`, which is required for the play page's `SendMessage` credential injection. Wait for `ArcadeSdk.Instance.OnReady` before making account-backed calls.

```csharp
using ArcadeBackend;

void Start()
{
    ArcadeSdk.Instance.OnReady += () =>
    {
        ArcadeSdk.Instance.SubmitScore("main", 4200, (ok, rank) =>
            Debug.Log(ok ? $"Rank: {rank}" : "Score submission failed"));
    };
}
```

For Editor Play mode, issue a seven-day development token from the same dashboard section. The recommended local-only setup is:

```csharp
UnityEditor.EditorPrefs.SetString("ArcadeSdk.DevToken", "paste-token-here");
```

The inspector token field is a fallback and is serialized into the scene, so never commit a populated field to a public repository. Reissuing the token immediately invalidates the previous editor token. The browser build does not include either editor-only field; it receives a 15-minute game-scoped token from the host page and refreshes through the WebGL bridge.

## WebGL build settings

- Compression: Gzip or Brotli (both work; configure server `Content-Encoding` accordingly).
- Set `Player Settings → Resolution and Presentation → WebGL Template` to a minimal template if you do not need Unity's default UI.
- StreamingAssets: upload the four `Build/` artifacts (`*.loader.js`, `*.data`, `*.framework.js`, `*.wasm`) as usual. If your project has a `StreamingAssets/` folder, zip that folder (either the folder itself or just its contents) and upload it via the separate "StreamingAssets (zip)" field on the build upload form — the server extracts it preserving the folder structure and serves it at `/builds/<buildId>/StreamingAssets/...`.
