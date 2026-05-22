const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

async function requestRaw(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function postIssue(payload) {
  return request('/api/issues', { method: 'POST', body: JSON.stringify(payload) });
}

export async function register(name, email, password) {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
}

export async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function getMe(token) {
  return request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

// ── Games ─────────────────────────────────────────────────────────────────────

export async function listGames() {
  return request('/api/games');
}

export async function createGame(name, discordWebhookUrl = '') {
  return request('/api/games', { method: 'POST', body: JSON.stringify({ name, discordWebhookUrl }) });
}

export async function getGame(gameId) {
  return request(`/api/games/${gameId}`);
}

export async function updateGame(gameId, fields) {
  return request(`/api/games/${gameId}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

// ── Builds ────────────────────────────────────────────────────────────────────

export async function uploadBuild(gameId, files, version = '') {
  const fd = new FormData();
  fd.append('version', version);
  for (const file of files) fd.append('files', file);
  return requestRaw(`/api/games/${gameId}/builds`, { method: 'POST', body: fd });
}

export async function activateBuild(gameId, buildId) {
  return request(`/api/games/${gameId}/builds/${buildId}/activate`, { method: 'PATCH' });
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getGameReports(gameId) {
  return request(`/api/games/${gameId}/reports`);
}

// ── Play (public) ─────────────────────────────────────────────────────────────

export async function getPlayInfo(gameSlug, buildId = null) {
  const path = buildId
    ? `/api/games/play/${gameSlug}/${buildId}`
    : `/api/games/play/${gameSlug}`;
  return request(path);
}
