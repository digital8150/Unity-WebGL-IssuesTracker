using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;

namespace IssueTracker
{
    /// <summary>
    /// Drop-in singleton that buffers Unity logs and forwards bug reports
    /// to the hosting browser via a WebGL .jslib bridge.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class IssueTrackerIntegration : MonoBehaviour
    {
        public delegate Dictionary<string, object> CollectCustomStateHandler();

        public static IssueTrackerIntegration Instance { get; private set; }

        /// <summary>
        /// Invoked when a report is being assembled. Return a dictionary of
        /// custom state (scene name, player coords, inventory, ...) that
        /// will be serialized into the payload.
        /// </summary>
        public event CollectCustomStateHandler OnCollectCustomState;

        [SerializeField] private int logBufferSize = 200;

        private readonly Queue<LogEntry> logBuffer = new Queue<LogEntry>();
        private readonly object bufferLock = new object();

        [Serializable]
        private struct LogEntry
        {
            public string Message;
            public string StackTrace;
            public string Type;
            public string TimestampUtc;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void IssueTracker_SubmitReport(string payloadJson);
#else
        private static void IssueTracker_SubmitReport(string payloadJson)
        {
            Debug.Log($"[IssueTracker] (Editor stub) payload:\n{payloadJson}");
        }
#endif

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            Application.logMessageReceivedThreaded += HandleLog;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Application.logMessageReceivedThreaded -= HandleLog;
                Instance = null;
            }
        }

        private void HandleLog(string message, string stackTrace, LogType type)
        {
            var entry = new LogEntry
            {
                Message = message,
                StackTrace = stackTrace,
                Type = type.ToString(),
                TimestampUtc = DateTime.UtcNow.ToString("o"),
            };

            lock (bufferLock)
            {
                logBuffer.Enqueue(entry);
                while (logBuffer.Count > logBufferSize)
                {
                    logBuffer.Dequeue();
                }
            }
        }

        /// <summary>
        /// Called by the browser (via SendMessage) to trigger a report
        /// submission. Title and description originate from the web overlay.
        /// </summary>
        public void SubmitReport(string titleAndDescriptionJson)
        {
            try
            {
                var input = JsonUtility.FromJson<ReportInput>(titleAndDescriptionJson);
                BuildAndSend(input.title, input.description);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[IssueTracker] Failed to parse report input: {ex}");
            }
        }

        [Serializable]
        private struct ReportInput
        {
            public string title;
            public string description;
        }

        private void BuildAndSend(string title, string description)
        {
            Dictionary<string, object> customState = null;
            if (OnCollectCustomState != null)
            {
                try
                {
                    customState = OnCollectCustomState.Invoke();
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[IssueTracker] Custom state handler threw: {ex}");
                }
            }

            LogEntry[] logs;
            lock (bufferLock)
            {
                logs = logBuffer.ToArray();
            }

            var sb = new StringBuilder(4096);
            sb.Append('{');
            AppendJsonField(sb, "title", title); sb.Append(',');
            AppendJsonField(sb, "description", description); sb.Append(',');
            AppendJsonField(sb, "unityVersion", Application.unityVersion); sb.Append(',');
            AppendJsonField(sb, "platform", Application.platform.ToString()); sb.Append(',');
            AppendJsonField(sb, "productName", Application.productName); sb.Append(',');
            AppendJsonField(sb, "version", Application.version); sb.Append(',');
            AppendJsonField(sb, "timestampUtc", DateTime.UtcNow.ToString("o")); sb.Append(',');

            sb.Append("\"logs\":[");
            for (int i = 0; i < logs.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('{');
                AppendJsonField(sb, "type", logs[i].Type); sb.Append(',');
                AppendJsonField(sb, "timestampUtc", logs[i].TimestampUtc); sb.Append(',');
                AppendJsonField(sb, "message", logs[i].Message); sb.Append(',');
                AppendJsonField(sb, "stackTrace", logs[i].StackTrace);
                sb.Append('}');
            }
            sb.Append("],");

            sb.Append("\"customState\":");
            AppendDictionary(sb, customState);

            sb.Append('}');

            IssueTracker_SubmitReport(sb.ToString());
        }

        private static void AppendJsonField(StringBuilder sb, string key, string value)
        {
            sb.Append('"').Append(key).Append("\":");
            AppendJsonString(sb, value);
        }

        private static void AppendJsonString(StringBuilder sb, string value)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }

            sb.Append('"');
            foreach (var c in value)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            sb.Append("\\u").Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }

        private static void AppendDictionary(StringBuilder sb, Dictionary<string, object> dict)
        {
            if (dict == null)
            {
                sb.Append("null");
                return;
            }

            sb.Append('{');
            bool first = true;
            foreach (var kvp in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                AppendJsonString(sb, kvp.Key);
                sb.Append(':');
                AppendJsonValue(sb, kvp.Value);
            }
            sb.Append('}');
        }

        private static void AppendJsonValue(StringBuilder sb, object value)
        {
            switch (value)
            {
                case null:
                    sb.Append("null");
                    break;
                case string s:
                    AppendJsonString(sb, s);
                    break;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    break;
                case float f:
                    sb.Append(f.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    break;
                case double d:
                    sb.Append(d.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    break;
                case int or long or short or byte:
                    sb.Append(value.ToString());
                    break;
                case Vector3 v3:
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                        "{{\"x\":{0},\"y\":{1},\"z\":{2}}}", v3.x, v3.y, v3.z);
                    break;
                case Vector2 v2:
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                        "{{\"x\":{0},\"y\":{1}}}", v2.x, v2.y);
                    break;
                case Dictionary<string, object> nested:
                    AppendDictionary(sb, nested);
                    break;
                default:
                    AppendJsonString(sb, value.ToString());
                    break;
            }
        }
    }
}
