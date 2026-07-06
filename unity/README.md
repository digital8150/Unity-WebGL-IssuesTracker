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

## How the web overlay triggers a report

The React host calls `unityInstance.SendMessage("IssueTracker", "SubmitReport", '{"title":"...","description":"..."}')`.

The C# side appends buffered logs + custom state, serializes to JSON, and hands the payload back to JS via `IssueTracker_SubmitReport` (declared in `IssueTracker.jslib`). The JS side forwards it to `window.__issueTrackerReceive`, which the React app defines.

## WebGL build settings

- Compression: Gzip or Brotli (both work; configure server `Content-Encoding` accordingly).
- Set `Player Settings → Resolution and Presentation → WebGL Template` to a minimal template if you do not need Unity's default UI.
- StreamingAssets: upload the four `Build/` artifacts (`*.loader.js`, `*.data`, `*.framework.js`, `*.wasm`) as usual. If your project has a `StreamingAssets/` folder, zip that folder (either the folder itself or just its contents) and upload it via the separate "StreamingAssets (zip)" field on the build upload form — the server extracts it preserving the folder structure and serves it at `/builds/<buildId>/StreamingAssets/...`.
