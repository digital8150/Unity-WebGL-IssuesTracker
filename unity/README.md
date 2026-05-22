# Unity Client — Issue Tracker Integration

Drop-in WebGL bug-report capture for any Unity project.

## Install

1. Copy `Assets/Scripts/IssueTrackerIntegration.cs` and `Assets/Plugins/WebGL/IssueTracker.jslib` into your Unity project (preserve the `Plugins/WebGL/` path so Unity recognises the jslib).
2. Add an empty GameObject named `IssueTracker` to your bootstrap scene and attach `IssueTrackerIntegration`.
3. (Optional) Subscribe to `OnCollectCustomState` to attach game-specific state:

```csharp
void Start()
{
    IssueTracker.IssueTrackerIntegration.Instance.OnCollectCustomState += () =>
        new Dictionary<string, object>
        {
            { "scene", SceneManager.GetActiveScene().name },
            { "playerPos", player.transform.position },
            { "hp", player.Health },
        };
}
```

## How the web overlay triggers a report

The React host calls `unityInstance.SendMessage("IssueTracker", "SubmitReport", '{"title":"...","description":"..."}')`.

The C# side appends buffered logs + custom state, serializes to JSON, and hands the payload back to JS via `IssueTracker_SubmitReport` (declared in `IssueTracker.jslib`). The JS side forwards it to `window.__issueTrackerReceive`, which the React app defines.

## WebGL build settings

- Compression: Gzip or Brotli (both work; configure server `Content-Encoding` accordingly).
- Set `Player Settings → Resolution and Presentation → WebGL Template` to a minimal template if you do not need Unity's default UI.
