using System;
using System.Collections;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace ArcadeBackend
{
    /// <summary>
    /// Authenticated Arcade ID client for Unity WebGL games.
    /// Add one instance to a bootstrap scene and use <see cref="Instance"/>
    /// from game code after <see cref="OnReady"/> has fired.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ArcadeSdk : MonoBehaviour
    {
        private const string ApiBaseUrl = "https://arcade.codingbot.kr";
        private const string EditorTokenKey = "ArcadeSdk.DevToken";
        private const float CredentialWaitSeconds = 10f;

        public static ArcadeSdk Instance { get; private set; }

        /// <summary>Raised once when a usable game credential is available.</summary>
        public event Action OnReady;

        /// <summary>True after a credential has been accepted and is ready for requests.</summary>
        public bool IsReady => isReady && !string.IsNullOrEmpty(credential);

        /// <summary>The authenticated Arcade user id, or an empty string before readiness.</summary>
        public string UserId => userId ?? string.Empty;

        /// <summary>The authenticated user's current display name.</summary>
        public string DisplayName => displayName ?? string.Empty;

        private string credential;
        private string userId;
        private string displayName;
        private string expiresAt;
        private bool isReady;
        private bool tokenRequestInFlight;

#if UNITY_EDITOR
        [Header("에디터 전용 — 빌드에는 포함되지 않습니다")]
        [SerializeField] private string editorDevToken;
        [SerializeField] private string apiBaseUrlOverride;
#endif

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void ArcadeSdk_Ready();

        [DllImport("__Internal")]
        private static extern void ArcadeSdk_RequestToken();
#else
        private static void ArcadeSdk_Ready() { }

        private static void ArcadeSdk_RequestToken() { }
#endif

        /// <summary>
        /// Receives the browser's credential envelope via Unity SendMessage.
        /// The expected shape is { token, userId, displayName, expiresAt }.
        /// </summary>
        public void SetCredential(string credentialJson)
        {
            tokenRequestInFlight = false;

            if (string.IsNullOrEmpty(credentialJson))
            {
                InvalidateCredential();
                Debug.LogWarning("[ArcadeSdk] Received an empty credential.");
                return;
            }

            try
            {
                var incoming = JsonUtility.FromJson<CredentialEnvelope>(credentialJson);
                if (incoming == null || string.IsNullOrEmpty(incoming.token))
                {
                    InvalidateCredential();
                    Debug.LogWarning("[ArcadeSdk] Received an invalid credential envelope.");
                    return;
                }

                credential = incoming.token;
                userId = incoming.userId ?? string.Empty;
                displayName = incoming.displayName ?? string.Empty;
                expiresAt = incoming.expiresAt ?? string.Empty;
                MarkReady();
            }
            catch (Exception exception)
            {
                InvalidateCredential();
                Debug.LogWarning("[ArcadeSdk] Failed to parse credential: " + exception.Message);
            }
        }

        /// <summary>Submits a score and passes the current rank as the second callback argument, or -1 on failure.</summary>
        public void SubmitScore(string leaderboardKey, long score, Action<bool, int> onComplete = null)
        {
            StartCoroutine(SubmitScoreRoutine(leaderboardKey, score, onComplete));
        }

        /// <summary>Fetches the visible entries for a leaderboard.</summary>
        public void GetLeaderboard(
            string leaderboardKey,
            Action<bool, LeaderboardEntry[]> onComplete = null)
        {
            StartCoroutine(GetLeaderboardRoutine(leaderboardKey, onComplete));
        }

        /// <summary>
        /// Fetches the authenticated user's best entry. The result is null when
        /// the user has not submitted a score to this board yet.
        /// </summary>
        public void GetMyRank(
            string leaderboardKey,
            Action<bool, LeaderboardEntry> onComplete = null)
        {
            StartCoroutine(GetMyRankRoutine(leaderboardKey, onComplete));
        }

        /// <summary>Fetches the raw JSON value stored under a config key.</summary>
        public void GetConfig(string key, Action<bool, string> onComplete = null)
        {
            StartCoroutine(GetConfigRoutine(key, onComplete));
        }

        /// <summary>Loads one authenticated cloud-save slot.</summary>
        public void LoadSave(string slot, Action<bool, SaveResult> onComplete = null)
        {
            StartCoroutine(LoadSaveRoutine(slot, onComplete));
        }

        /// <summary>
        /// Stores a JSON string in one cloud-save slot. Pass -1 to omit the
        /// revision for a last-writer-wins write; pass 0 for create-only or a
        /// positive revision for compare-and-swap.
        /// </summary>
        public void SaveData(
            string slot,
            string json,
            int rev,
            Action<bool, SaveResult> onComplete = null)
        {
            StartCoroutine(SaveDataRoutine(slot, json, rev, onComplete));
        }

        /// <summary>Deletes one authenticated cloud-save slot.</summary>
        public void DeleteSave(string slot, Action<bool> onComplete = null)
        {
            StartCoroutine(DeleteSaveRoutine(slot, onComplete));
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            if (gameObject.name != "ArcadeSdk")
            {
                Debug.LogWarning("[ArcadeSdk] GameObject must be named ArcadeSdk for browser SendMessage. Renaming it now.");
                gameObject.name = "ArcadeSdk";
            }

            DontDestroyOnLoad(gameObject);

#if UNITY_EDITOR
            StartCoroutine(EditorBootstrapRoutine());
#else
            // The page may already hold a token, so ask it to push the current
            // credential as soon as the Unity object exists.
            ArcadeSdk_Ready();
#endif
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        private IEnumerator EditorBootstrapRoutine()
        {
#if UNITY_EDITOR
            var token = ResolveEditorToken();
            if (string.IsNullOrEmpty(token))
            {
                Debug.LogWarning("[ArcadeSdk] 에디터 개발 토큰이 없습니다. 대시보드 → 서버와 통합 → SDK v2에서 발급하세요.");
                yield break;
            }

            credential = token;
            tokenRequestInFlight = false;
            yield return HydrateFromMeRoutine();
#else
            yield break;
#endif
        }

#if UNITY_EDITOR
        private string ResolveEditorToken()
        {
            var saved = UnityEditor.EditorPrefs.GetString(EditorTokenKey, string.Empty);
            return string.IsNullOrEmpty(saved) ? editorDevToken : saved;
        }
#endif

        private IEnumerator HydrateFromMeRoutine()
        {
            ApiResponse response = default(ApiResponse);
            yield return SendRequest("GET", "/api/v2/me", null, result => response = result);

            if (!response.success)
            {
                if (response.statusCode == 401)
                {
                    Debug.LogError("[ArcadeSdk] 개발 토큰이 만료/무효입니다. 대시보드에서 재발급하세요.");
                }
                else
                {
                    Debug.LogError("[ArcadeSdk] 에디터 개발 토큰 검증에 실패했습니다. HTTP " + response.statusCode + ".");
                }

                InvalidateCredential();
                yield break;
            }

            MeResponse hydrated = null;
            Exception parseException = null;
            try
            {
                hydrated = JsonUtility.FromJson<MeResponse>(response.body);
            }
            catch (Exception exception)
            {
                parseException = exception;
            }

            if (parseException != null)
            {
                Debug.LogError("[ArcadeSdk] /api/v2/me 응답을 읽지 못했습니다: " + parseException.Message);
                InvalidateCredential();
                yield break;
            }

            if (hydrated == null || string.IsNullOrEmpty(hydrated.userId))
            {
                Debug.LogError("[ArcadeSdk] /api/v2/me 응답이 올바르지 않습니다.");
                InvalidateCredential();
                yield break;
            }

            userId = hydrated.userId;
            displayName = hydrated.displayName ?? string.Empty;
            MarkReady();
        }

        private IEnumerator EnsureCredential(Action<bool> onReady)
        {
            if (IsReady)
            {
                onReady(true);
                yield break;
            }

#if UNITY_EDITOR
            Debug.LogError("[ArcadeSdk] 에디터 개발 토큰이 준비되지 않았습니다. 대시보드에서 발급하거나 EditorPrefs에 저장하세요.");
            onReady(false);
            yield break;
#elif UNITY_WEBGL
            if (!tokenRequestInFlight)
            {
                tokenRequestInFlight = true;
                ArcadeSdk_RequestToken();
            }

            var deadline = Time.realtimeSinceStartup + CredentialWaitSeconds;
            while (!IsReady && Time.realtimeSinceStartup < deadline)
            {
                yield return null;
            }

            tokenRequestInFlight = false;
            if (!IsReady)
            {
                Debug.LogError("[ArcadeSdk] 브라우저에서 게임 토큰을 10초 안에 받지 못했습니다.");
            }

            onReady(IsReady);
#else
            Debug.LogError("[ArcadeSdk] ArcadeSdk credentials are only available in WebGL or the Unity Editor.");
            onReady(false);
            yield break;
#endif
        }

        private IEnumerator SendAuthorizedRequest(
            string method,
            string path,
            string body,
            Action<ApiResponse> onComplete)
        {
            ApiResponse response = default(ApiResponse);
            yield return SendRequest(method, path, body, result => response = result);
            if (response.statusCode != 401)
            {
                onComplete(response);
                yield break;
            }

            // A request receives one and only one retry. The browser owns token
            // refresh; clearing the old credential makes EnsureCredential wait
            // for the replacement instead of replaying the expired token.
            InvalidateCredential();
            bool refreshed = false;
            yield return EnsureCredential(result => refreshed = result);
            if (!refreshed)
            {
                onComplete(new ApiResponse(false, 401, null));
                yield break;
            }

            yield return SendRequest(method, path, body, result => response = result);
            onComplete(response);
        }

        private IEnumerator SendRequest(
            string method,
            string path,
            string body,
            Action<ApiResponse> onComplete)
        {
            var url = ResolveBaseUrl() + path;
            using (var request = new UnityWebRequest(url, method))
            {
                if (!string.IsNullOrEmpty(body))
                {
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                    request.SetRequestHeader("Content-Type", "application/json");
                }

                request.downloadHandler = new DownloadHandlerBuffer();
                if (!string.IsNullOrEmpty(credential))
                {
                    request.SetRequestHeader("Authorization", "Bearer " + credential);
                }

                yield return request.SendWebRequest();

                var statusCode = request.responseCode;
                var success = request.result == UnityWebRequest.Result.Success
                    && statusCode >= 200
                    && statusCode < 300;
                onComplete(new ApiResponse(success, statusCode, request.downloadHandler.text));
            }
        }

        private IEnumerator SubmitScoreRoutine(
            string leaderboardKey,
            long score,
            Action<bool, int> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, -1);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "POST",
                "/api/v2/leaderboards/" + EscapePathSegment(leaderboardKey) + "/scores",
                BuildScoreBody(score),
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, -1);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<SubmitResponse>(response.body);
                Complete(onComplete, parsed != null && parsed.ok, parsed == null ? -1 : parsed.rank);
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse score response: " + exception.Message);
                Complete(onComplete, false, -1);
            }
        }

        private IEnumerator GetLeaderboardRoutine(
            string leaderboardKey,
            Action<bool, LeaderboardEntry[]> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, new LeaderboardEntry[0]);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "GET",
                "/api/v2/leaderboards/" + EscapePathSegment(leaderboardKey),
                null,
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, new LeaderboardEntry[0]);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<LeaderboardResponse>(response.body);
                Complete(onComplete, parsed != null, parsed?.entries ?? new LeaderboardEntry[0]);
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse leaderboard response: " + exception.Message);
                Complete(onComplete, false, new LeaderboardEntry[0]);
            }
        }

        private IEnumerator GetMyRankRoutine(
            string leaderboardKey,
            Action<bool, LeaderboardEntry> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "GET",
                "/api/v2/leaderboards/" + EscapePathSegment(leaderboardKey) + "/me",
                null,
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<MyRankResponse>(response.body);
                Complete(onComplete, parsed != null, parsed?.entry);
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse rank response: " + exception.Message);
                Complete(onComplete, false, null);
            }
        }

        private IEnumerator GetConfigRoutine(string key, Action<bool, string> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "GET",
                "/api/v2/config/" + EscapePathSegment(key),
                null,
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<ConfigResponse>(response.body);
                Complete(onComplete, parsed != null, parsed?.value);
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse config response: " + exception.Message);
                Complete(onComplete, false, null);
            }
        }

        private IEnumerator LoadSaveRoutine(string slot, Action<bool, SaveResult> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "GET",
                "/api/v2/saves/" + EscapePathSegment(slot),
                null,
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<SaveResponse>(response.body);
                Complete(onComplete, parsed != null, parsed == null ? null : parsed.ToPublic());
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse save response: " + exception.Message);
                Complete(onComplete, false, null);
            }
        }

        private IEnumerator SaveDataRoutine(
            string slot,
            string json,
            int rev,
            Action<bool, SaveResult> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "PUT",
                "/api/v2/saves/" + EscapePathSegment(slot),
                BuildSaveBody(json, rev),
                result => response = result);
            if (!response.success)
            {
                Complete(onComplete, false, null);
                yield break;
            }

            try
            {
                var parsed = JsonUtility.FromJson<SaveResponse>(response.body);
                Complete(onComplete, parsed != null, parsed == null ? null : parsed.ToPublic());
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[ArcadeSdk] Failed to parse save response: " + exception.Message);
                Complete(onComplete, false, null);
            }
        }

        private IEnumerator DeleteSaveRoutine(string slot, Action<bool> onComplete)
        {
            bool ready = false;
            yield return EnsureCredential(result => ready = result);
            if (!ready)
            {
                Complete(onComplete, false);
                yield break;
            }

            ApiResponse response = default(ApiResponse);
            yield return SendAuthorizedRequest(
                "DELETE",
                "/api/v2/saves/" + EscapePathSegment(slot),
                null,
                result => response = result);
            Complete(onComplete, response.success);
        }

        private void MarkReady()
        {
            var wasReady = IsReady;
            isReady = !string.IsNullOrEmpty(credential);
            if (isReady && !wasReady)
            {
                var handler = OnReady;
                if (handler == null) return;
                try
                {
                    handler.Invoke();
                }
                catch (Exception exception)
                {
                    Debug.LogException(exception);
                }
            }
        }

        private void InvalidateCredential()
        {
            credential = null;
            userId = null;
            displayName = null;
            expiresAt = null;
            isReady = false;
            tokenRequestInFlight = false;
        }

        private string ResolveBaseUrl()
        {
#if UNITY_EDITOR
            if (!string.IsNullOrEmpty(apiBaseUrlOverride))
            {
                return apiBaseUrlOverride.TrimEnd('/');
            }
#endif
            return ApiBaseUrl;
        }

        private static string EscapePathSegment(string value)
        {
            return Uri.EscapeDataString(value ?? string.Empty);
        }

        private static string BuildScoreBody(long score)
        {
            var builder = new StringBuilder(32);
            builder.Append("{\"score\":");
            builder.Append(score.ToString(CultureInfo.InvariantCulture));
            builder.Append('}');
            return builder.ToString();
        }

        private static string BuildSaveBody(string json, int rev)
        {
            var builder = new StringBuilder((json == null ? 0 : json.Length) + 32);
            builder.Append("{\"data\":");
            AppendJsonString(builder, json);
            if (rev >= 0)
            {
                builder.Append(",\"rev\":");
                builder.Append(rev.ToString(CultureInfo.InvariantCulture));
            }

            builder.Append('}');
            return builder.ToString();
        }

        private static void AppendJsonString(StringBuilder builder, string value)
        {
            if (value == null)
            {
                builder.Append("null");
                return;
            }

            builder.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '\\': builder.Append("\\\\"); break;
                    case '"': builder.Append("\\\""); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (character < 0x20)
                        {
                            builder.Append("\\u");
                            builder.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            builder.Append(character);
                        }
                        break;
                }
            }

            builder.Append('"');
        }

        private static void Complete<T>(Action<bool, T> callback, bool success, T value)
        {
            if (callback != null) callback(success, value);
        }

        private static void Complete(Action<bool> callback, bool success)
        {
            if (callback != null) callback(success);
        }

        [Serializable]
        public sealed class LeaderboardEntry
        {
            public int rank;
            public string userId;
            public string displayName;
            public long score;
            public bool isMe;
        }

        [Serializable]
        public sealed class SaveResult
        {
            public string slot;
            public string data;
            public int size;
            public int rev;
            public string createdAt;
            public string updatedAt;
        }

        [Serializable]
        private sealed class CredentialEnvelope
        {
            public string token;
            public string userId;
            public string displayName;
            public string expiresAt;
        }

        [Serializable]
        private sealed class MeResponse
        {
            public string userId;
            public string displayName;
        }

        [Serializable]
        private sealed class SubmitResponse
        {
            public bool ok;
            public int rank;
        }

        [Serializable]
        private sealed class LeaderboardResponse
        {
            public LeaderboardEntry[] entries;
        }

        [Serializable]
        private sealed class MyRankResponse
        {
            public LeaderboardEntry entry;
        }

        [Serializable]
        private sealed class ConfigResponse
        {
            public string value;
        }

        [Serializable]
        private sealed class SaveResponse
        {
            public string slot;
            public string data;
            public int size;
            public int rev;
            public string createdAt;
            public string updatedAt;

            public SaveResult ToPublic()
            {
                return new SaveResult
                {
                    slot = slot,
                    data = data,
                    size = size,
                    rev = rev,
                    createdAt = createdAt,
                    updatedAt = updatedAt,
                };
            }
        }

        private struct ApiResponse
        {
            public readonly bool success;
            public readonly long statusCode;
            public readonly string body;

            public ApiResponse(bool success, long statusCode, string body)
            {
                this.success = success;
                this.statusCode = statusCode;
                this.body = body;
            }
        }
    }
}
