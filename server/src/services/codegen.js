import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const { SITE_ORIGIN = 'https://arcade.codingbot.kr' } = process.env;
const DEFAULT_SITE_ORIGIN = 'https://arcade.codingbot.kr';
const ARCADE_SDK_CS = fileURLToPath(new URL('../../../unity/Assets/Scripts/ArcadeSdk.cs', import.meta.url));
const ARCADE_SDK_JSLIB = fileURLToPath(new URL('../../../unity/Assets/Plugins/WebGL/ArcadeSdk.jslib', import.meta.url));
const arcadeSdkFileCache = new Map();

const XOR_KEY = 0x5a;

// Used to build C# string literals containing embedded JSON quotes/backslashes
// inside JS template literals without fighting nested-escaping ambiguity.
const BS = String.fromCharCode(92); // one backslash character

function obfuscateSecret(secret) {
  const bytes = Buffer.from(secret, 'utf8');
  const hex = Array.from(bytes, (b) => `0x${(b ^ XOR_KEY).toString(16).padStart(2, '0')}`);
  return hex.join(', ');
}

// Builds the generated ServerBridge.cs source for a single game, including only
// the sections for features the game has enabled. Returns { files, docs }.
export function generateServerBridge(game, { leaderboards, config }) {
  const hasLeaderboards = game.serverBackend.leaderboardEnabled && leaderboards.length > 0;
  const hasConfig = game.serverBackend.configEnabled && config.length > 0;
  const obfuscatedBytes = obfuscateSecret(game.serverBackend.secret);

  const submitScoreMethod = hasLeaderboards
    ? `
        /// <summary>Submits a score to the given leaderboard. rank is -1 if the score didn't make the Top-N.</summary>
        public void SubmitScore(string leaderboardKey, string playerName, long score, Action<bool, int> onComplete = null)
        {
            StartCoroutine(SubmitScoreRoutine(leaderboardKey, playerName, score, onComplete));
        }

        /// <summary>Fetches the current Top-N entries for a leaderboard.</summary>
        public void GetLeaderboard(string leaderboardKey, Action<bool, LeaderboardEntry[]> onComplete)
        {
            StartCoroutine(GetLeaderboardRoutine(leaderboardKey, onComplete));
        }`
    : '';

  const configMethod = hasConfig
    ? `
        /// <summary>Fetches the raw JSON string stored under this key; deserialize it yourself.</summary>
        public void GetConfig(string key, Action<bool, string> onComplete)
        {
            StartCoroutine(GetConfigRoutine(key, onComplete));
        }`
    : '';

  // string body = "{\"name\":\"" + JsonEscape(playerName) + "\",\"score\":" + score + "}";
  const submitBodyLine = `string body = "{${BS}"name${BS}":${BS}"" + JsonEscape(playerName) + "${BS}",${BS}"score${BS}":" + score + "}";`;

  const submitScoreRoutine = hasLeaderboards
    ? `
        private IEnumerator SubmitScoreRoutine(string leaderboardKey, string playerName, long score, Action<bool, int> onComplete)
        {
            ${submitBodyLine}
            string path = "/api/games/play/" + GameSlug + "/backend/leaderboard/" + leaderboardKey + "/submit";
            bool ok = false;
            string responseText = null;
            yield return SignedRequest("POST", path, body, (success, text) => { ok = success; responseText = text; });

            if (!ok) { onComplete?.Invoke(false, -1); yield break; }
            var res = JsonUtility.FromJson<SubmitResponse>(responseText);
            onComplete?.Invoke(true, res.rank);
        }

        private IEnumerator GetLeaderboardRoutine(string leaderboardKey, Action<bool, LeaderboardEntry[]> onComplete)
        {
            string path = "/api/games/play/" + GameSlug + "/backend/leaderboard/" + leaderboardKey;
            bool ok = false;
            string responseText = null;
            yield return SignedRequest("GET", path, null, (success, text) => { ok = success; responseText = text; });

            if (!ok) { onComplete?.Invoke(false, null); yield break; }
            var res = JsonUtility.FromJson<LeaderboardResponse>(responseText);
            onComplete?.Invoke(true, res.entries ?? new LeaderboardEntry[0]);
        }`
    : '';

  const configRoutine = hasConfig
    ? `
        private IEnumerator GetConfigRoutine(string key, Action<bool, string> onComplete)
        {
            string path = "/api/games/play/" + GameSlug + "/backend/config/" + key;
            bool ok = false;
            string responseText = null;
            yield return SignedRequest("GET", path, null, (success, text) => { ok = success; responseText = text; });

            if (!ok) { onComplete?.Invoke(false, null); yield break; }
            var res = JsonUtility.FromJson<ConfigResponse>(responseText);
            onComplete?.Invoke(true, res.value);
        }`
    : '';

  const submitResponseClass = hasLeaderboards
    ? `
        [Serializable] private class SubmitResponse { public bool ok; public int rank; }
        [Serializable] private class LeaderboardResponse { public string key; public string label; public string sort; public LeaderboardEntry[] entries; }`
    : '';

  const configResponseClass = hasConfig
    ? `
        [Serializable] private class ConfigResponse { public string key; public string value; }`
    : '';

  const leaderboardEntryStruct = hasLeaderboards
    ? `
    [Serializable]
    public struct LeaderboardEntry
    {
        public int rank;
        public string name;
        public long score;
    }`
    : '';

  // string body = "{\"nonce\":\"" + nonce + "\",\"ts\":" + nowMs + "}";
  const handshakeBodyLine = `string body = "{${BS}"nonce${BS}":${BS}"" + nonce + "${BS}",${BS}"ts${BS}":" + nowMs + "}";`;

  // "\n" (a literal 2-char backslash-n, not an actual newline) used as the canonical-string separator
  const NL = `${BS}n`;

  // Mirrors the hand-rolled JSON string escaper used in IssueTrackerIntegration.cs
  // (this repo avoids Newtonsoft; see unity/Assets/Scripts/IssueTrackerIntegration.cs).
  const jsonEscapeMethod = `
        private static string JsonEscape(string s)
        {
            var sb = new StringBuilder(s.Length + 8);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '${BS}${BS}': sb.Append("${BS}${BS}${BS}${BS}"); break;
                    case '"': sb.Append("${BS}${BS}${BS}""); break;
                    case '\\n': sb.Append("${BS}${BS}n"); break;
                    case '\\r': sb.Append("${BS}${BS}r"); break;
                    case '\\t': sb.Append("${BS}${BS}t"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
        }`;

  const code = `// Generated by BCSDLab. Arcade — "LiveOps settings / Legacy API". Do not edit by hand;
// regenerate from the dashboard whenever features change or the secret rotates.
//
// SECURITY NOTE: ObfuscatedSecret below is NOT a real secret. A WebGL build can
// always be decompiled or inspected in a browser debugger, so this value cannot
// be kept confidential from a determined attacker — the XOR pass only avoids
// tripping plaintext secret scanners (e.g. git push protection) and casual grep.
// Real protection against abuse is server-side: short-lived single-use session
// tokens, per-IP rate limiting, and (if configured) leaderboard score-range
// checks. Rotating the secret from the dashboard invalidates all sessions
// signed with the old one.

using System;
using System.Collections;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace ArcadeBackend
{
    public sealed class ServerBridge : MonoBehaviour
    {
        public static ServerBridge Instance { get; private set; }

        private const string ServerBaseUrl = "${SITE_ORIGIN}";
        private const string GameSlug = "${game.slug}";

        private static readonly byte[] ObfuscatedSecret = { ${obfuscatedBytes} };
        private const byte XorKey = 0x5A;

        private string _sessionToken;
        private long _sessionExpiresAtMs;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private static string GetSecret()
        {
            var bytes = new byte[ObfuscatedSecret.Length];
            for (int i = 0; i < bytes.Length; i++) bytes[i] = (byte)(ObfuscatedSecret[i] ^ XorKey);
            return Encoding.UTF8.GetString(bytes);
        }

        // ── Public API ──────────────────────────────────────────────────────────
${submitScoreMethod}${configMethod}

        // ── Session handshake ───────────────────────────────────────────────────

        private IEnumerator EnsureSession(Action<bool> onReady)
        {
            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_sessionToken != null && nowMs < _sessionExpiresAtMs - 5000)
            {
                onReady(true);
                yield break;
            }

            string nonce = Guid.NewGuid().ToString("N");
            ${handshakeBodyLine}
            string url = ServerBaseUrl + "/api/games/play/" + GameSlug + "/backend/handshake";

            using (var req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(body);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    onReady(false);
                    yield break;
                }

                var res = JsonUtility.FromJson<HandshakeResponse>(req.downloadHandler.text);
                _sessionToken = res.sessionToken;
                _sessionExpiresAtMs = nowMs + (long)res.expiresIn * 1000L;
                onReady(true);
            }
        }

        private IEnumerator SignedRequest(string method, string path, string body, Action<bool, string> onComplete)
        {
            bool sessionReady = false;
            yield return EnsureSession(ok => sessionReady = ok);
            if (!sessionReady) { onComplete(false, null); yield break; }

            long tsMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string bodyHash = Sha256Hex(body ?? "");
            string canonical = method + "${NL}" + path + "${NL}" + tsMs + "${NL}" + _sessionToken + "${NL}" + bodyHash;
            string signature = HmacSha256Hex(GetSecret(), canonical);

            string url = ServerBaseUrl + path;
            using (var req = new UnityWebRequest(url, method))
            {
                if (body != null)
                {
                    byte[] bodyRaw = Encoding.UTF8.GetBytes(body);
                    req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                    req.SetRequestHeader("Content-Type", "application/json");
                }
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("X-Arcade-Session", _sessionToken);
                req.SetRequestHeader("X-Arcade-Timestamp", tsMs.ToString());
                req.SetRequestHeader("X-Arcade-Signature", signature);
                yield return req.SendWebRequest();

                bool ok = req.result == UnityWebRequest.Result.Success;
                onComplete(ok, ok ? req.downloadHandler.text : null);
            }
        }
${submitScoreRoutine}${configRoutine}

        // ── JSON / crypto helpers ────────────────────────────────────────────────
${jsonEscapeMethod}

        private static string Sha256Hex(string input)
        {
            using (var sha = SHA256.Create())
            {
                return BytesToHex(sha.ComputeHash(Encoding.UTF8.GetBytes(input)));
            }
        }

        private static string HmacSha256Hex(string secret, string input)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
            {
                return BytesToHex(hmac.ComputeHash(Encoding.UTF8.GetBytes(input)));
            }
        }

        private static string BytesToHex(byte[] bytes)
        {
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (byte b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        [Serializable] private class HandshakeResponse { public string sessionToken; public int expiresIn; }${submitResponseClass}${configResponseClass}
    }
${leaderboardEntryStruct}
}
`;

  const docs = [];
  if (hasLeaderboards) {
    docs.push({
      title: 'Submit a score',
      body: '리더보드에 점수를 제출합니다. rank는 Top-N 밖이면 -1입니다.',
      snippet: `ServerBridge.Instance.SubmitScore("${leaderboards[0].key}", "Alice", 4200, (ok, rank) => {\n    if (ok) Debug.Log($"Submitted, rank={rank}");\n});`,
    });
    docs.push({
      title: 'Fetch a leaderboard',
      body: 'Top-N 항목을 가져옵니다.',
      snippet: `ServerBridge.Instance.GetLeaderboard("${leaderboards[0].key}", (ok, entries) => {\n    if (!ok) return;\n    foreach (var e in entries) Debug.Log($"{e.rank}. {e.name} - {e.score}");\n});`,
    });
  }
  if (hasConfig) {
    docs.push({
      title: 'Fetch dynamic config',
      body: '문자열 JSON 값을 받아 직접 역직렬화해 사용하세요.',
      snippet: `ServerBridge.Instance.GetConfig("${config[0].key}", (ok, json) => {\n    if (!ok) return;\n    var data = JsonUtility.FromJson<MyBalanceData>(json);\n});`,
    });
  }
  if (docs.length === 0) {
    docs.push({
      title: '기능이 활성화되지 않았습니다',
      body: '리더보드 또는 동적 설정 기능을 먼저 활성화하고, 최소 1개 이상의 리더보드/키를 등록하세요.',
      snippet: '',
    });
  }

  return {
    files: [{ filename: 'ServerBridge.cs', code }],
    docs,
  };
}

function readArcadeSdkFile(filename, path) {
  if (arcadeSdkFileCache.has(path)) return arcadeSdkFileCache.get(path);
  try {
    const source = fs.readFileSync(path, 'utf8');
    arcadeSdkFileCache.set(path, source);
    return source;
  } catch (error) {
    const wrapped = new Error(`Arcade SDK asset is unavailable: ${filename}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function csharpString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}

function injectApiBaseUrl(source, siteOrigin) {
  const replacement = csharpString(siteOrigin);
  return source.replace(
    /(\bApiBaseUrl\s*=\s*")[^"]*(")/g,
    (_match, prefix, suffix) => `${prefix}${replacement}${suffix}`,
  );
}

function firstKey(items, fallback) {
  return items.find((item) => typeof item?.key === 'string' && item.key.length > 0)?.key ?? fallback;
}

function arcadeSdkDocs(game, leaderboards, config) {
  const leaderboardKey = firstKey(leaderboards, 'main');
  const configKey = firstKey(config, 'settings');
  const docs = [
    {
      title: 'Initialize the SDK',
      body: 'Add ArcadeSdk to a GameObject named ArcadeSdk. The play page supplies the short-lived credential before gameplay starts.',
      snippet: 'ArcadeSdk.Instance.OnReady += () => Debug.Log($"Signed in as {ArcadeSdk.Instance.DisplayName}");',
    },
  ];

  if (leaderboards.length > 0) {
    docs.push(
      {
        title: 'Submit a score',
        body: 'Scores are associated with the signed-in account; the display name is never accepted from the game payload.',
        snippet: `ArcadeSdk.Instance.SubmitScore("${leaderboardKey}", 4200, (ok, rank) => {\n    if (ok) Debug.Log($"Submitted, rank={rank}");\n});`,
      },
      {
        title: 'Read the leaderboard',
        body: 'Fetch the signed-in player leaderboard and inspect rank, userId, displayName, score, and isMe.',
        snippet: `ArcadeSdk.Instance.GetLeaderboard("${leaderboardKey}", (ok, entries) => {\n    if (!ok) return;\n    foreach (var entry in entries) Debug.Log($"{entry.rank}. {entry.displayName} - {entry.score}");\n});`,
      },
      {
        title: 'Read your rank',
        body: 'Get the current best score and tie-aware rank for the signed-in account.',
        snippet: `ArcadeSdk.Instance.GetMyRank("${leaderboardKey}", (ok, result) => {\n    if (ok) Debug.Log($"My rank={result.rank}, score={result.score}");\n});`,
      },
    );
  }

  if (config.length > 0) {
    docs.push({
      title: 'Read game config',
      body: 'Config values are returned as their original JSON string so the game can deserialize its own schema.',
      snippet: `ArcadeSdk.Instance.GetConfig("${configKey}", (ok, json) => {\n    if (!ok) return;\n    var settings = JsonUtility.FromJson<MySettings>(json);\n});`,
    });
  }

  if (game?.serverBackend?.cloudSaveEnabled) {
    docs.push({
      title: 'Load and save data',
      body: 'Cloud saves preserve the original JSON string and return a revision for compare-and-swap writes.',
      snippet: 'ArcadeSdk.Instance.LoadSave("main", (ok, save) => { /* save.data, save.rev */ });\nArcadeSdk.Instance.SaveData("main", "{\\"coins\\":100}", 0, (ok, save) => { /* save.rev */ });\nArcadeSdk.Instance.DeleteSave("main", ok => { /* deleted */ });',
    });
  }

  return docs;
}

/**
 * Build the static signed-in player SDK drop-in and game-specific examples.
 * The source files remain authoritative Unity assets; this function only
 * injects the deployment origin into the C# constant and never embeds a
 * game secret or XOR obfuscation path.
 */
export function generateArcadeSdk(game, { leaderboards = [], config = [] } = {}) {
  const siteOrigin = process.env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN;
  const csharp = injectApiBaseUrl(
    readArcadeSdkFile('ArcadeSdk.cs', ARCADE_SDK_CS),
    siteOrigin,
  );
  const jslib = readArcadeSdkFile('ArcadeSdk.jslib', ARCADE_SDK_JSLIB);

  return {
    files: [
      { filename: 'ArcadeSdk.cs', code: csharp },
      { filename: 'ArcadeSdk.jslib', code: jslib },
    ],
    docs: arcadeSdkDocs(game, leaderboards, config),
  };
}
