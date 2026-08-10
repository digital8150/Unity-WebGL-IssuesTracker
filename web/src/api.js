const API_BASE = import.meta.env.VITE_API_BASE ?? '';
// Upload subdomain bypasses Cloudflare proxy — no size/speed limits.
const UPLOAD_BASE = import.meta.env.VITE_UPLOAD_BASE ?? API_BASE;

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

async function requestRaw(path, options = {}, useUploadBase = false) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const base = useUploadBase ? UPLOAD_BASE : API_BASE;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function postIssue(payload) {
  return request('/api/issues', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getMe(token) {
  return request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

export async function getUsage() {
  return request('/api/auth/usage');
}

export async function confirmAge() {
  return request('/api/auth/confirm-age', { method: 'POST' });
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

// ── Game articles (public play page + dashboard CMS) ─────────────────────────

export async function listGameArticles(gameId) {
  return request(`/api/games/${gameId}/articles`);
}

export async function getGameArticle(gameId, articleId) {
  return request(`/api/games/${gameId}/articles/${articleId}`);
}

export async function createGameArticle(gameId, data) {
  return request(`/api/games/${gameId}/articles`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateGameArticle(gameId, articleId, data) {
  return request(`/api/games/${gameId}/articles/${articleId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteGameArticle(gameId, articleId) {
  return request(`/api/games/${gameId}/articles/${articleId}`, { method: 'DELETE' });
}

export async function listPublicGameArticles(gameSlug) {
  return request(`/api/games/play/${gameSlug}/articles`);
}

export async function getPublicGameArticle(gameSlug, articleSlug) {
  return request(`/api/games/play/${gameSlug}/articles/${articleSlug}`);
}

export async function addGameArticleComment(gameSlug, articleSlug, body, authorName, turnstileToken) {
  return request(`/api/games/play/${gameSlug}/articles/${articleSlug}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, authorName, turnstileToken }),
  });
}

export async function deleteGameArticleComment(gameSlug, articleSlug, commentId) {
  return request(`/api/games/play/${gameSlug}/articles/${articleSlug}/comments/${commentId}`, { method: 'DELETE' });
}

// ── Builds ────────────────────────────────────────────────────────────────────

export async function uploadBuild(gameId, files, { version = '', canvasWidth = 1920, canvasHeight = 1080, streamingAssetsZip = null } = {}) {
  const fd = new FormData();
  fd.append('version', version);
  fd.append('canvasWidth',  String(canvasWidth));
  fd.append('canvasHeight', String(canvasHeight));
  for (const file of files) fd.append('files', file);
  if (streamingAssetsZip) fd.append('streamingAssetsZip', streamingAssetsZip);
  return requestRaw(`/api/games/${gameId}/builds`, { method: 'POST', body: fd }, true);
}

export async function activateBuild(gameId, buildId) {
  return request(`/api/games/${gameId}/builds/${buildId}/activate`, { method: 'PATCH' });
}

export async function deleteBuild(gameId, buildId) {
  return request(`/api/games/${gameId}/builds/${buildId}`, { method: 'DELETE' });
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getGameReports(gameId, { status, priority, tag } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  return request(`/api/games/${gameId}/reports${qs ? `?${qs}` : ''}`);
}

export async function getIssue(issueId) {
  return request(`/api/issues/${issueId}`);
}

export async function updateIssue(issueId, fields) {
  return request(`/api/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function deleteIssue(issueId) {
  return request(`/api/issues/${issueId}`, { method: 'DELETE' });
}

export async function addComment(issueId, body, authorName) {
  return request(`/api/issues/${issueId}/comments`, { method: 'POST', body: JSON.stringify({ body, authorName }) });
}

export async function deleteComment(issueId, commentId) {
  return request(`/api/issues/${issueId}/comments/${commentId}`, { method: 'DELETE' });
}

export async function voteIssue(issueId) {
  return request(`/api/issues/${issueId}/vote`, { method: 'POST' });
}

// ── Public tester board ───────────────────────────────────────────────────────

export async function getPublicIssues(gameSlug) {
  return request(`/api/games/play/${gameSlug}/issues`);
}

// ── Collaborators ─────────────────────────────────────────────────────────────

export async function getCollaborators(gameId) {
  return request(`/api/games/${gameId}/collaborators`);
}

export async function inviteCollaborator(gameId, email) {
  return request(`/api/games/${gameId}/collaborators`, { method: 'POST', body: JSON.stringify({ email }) });
}

export async function removeCollaborator(gameId, userId) {
  return request(`/api/games/${gameId}/collaborators/${userId}`, { method: 'DELETE' });
}

// ── User search ───────────────────────────────────────────────────────────────

export async function searchUsers(q) {
  return request(`/api/auth/search-users?q=${encodeURIComponent(q)}`);
}

// ── Server backend (leaderboards / dynamic config) ─────────────────────────────

export async function getGameBackend(gameId) {
  return request(`/api/games/${gameId}/backend`);
}

export async function updateGameBackend(gameId, fields) {
  return request(`/api/games/${gameId}/backend`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function rotateGameSecret(gameId) {
  return request(`/api/games/${gameId}/backend/secret/rotate`, { method: 'POST' });
}

export async function getGeneratedCode(gameId) {
  return request(`/api/games/${gameId}/backend/generated-code`);
}

export async function createLeaderboard(gameId, fields) {
  return request(`/api/games/${gameId}/backend/leaderboards`, { method: 'POST', body: JSON.stringify(fields) });
}

export async function updateLeaderboard(gameId, lbId, fields) {
  return request(`/api/games/${gameId}/backend/leaderboards/${lbId}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function deleteLeaderboard(gameId, lbId) {
  return request(`/api/games/${gameId}/backend/leaderboards/${lbId}`, { method: 'DELETE' });
}

export async function getLeaderboardEntries(gameId, lbId) {
  return request(`/api/games/${gameId}/backend/leaderboards/${lbId}/entries`);
}

export async function deleteLeaderboardEntry(gameId, lbId, entryId) {
  return request(`/api/games/${gameId}/backend/leaderboards/${lbId}/entries/${entryId}`, { method: 'DELETE' });
}

export async function createConfigKey(gameId, fields) {
  return request(`/api/games/${gameId}/backend/config`, { method: 'POST', body: JSON.stringify(fields) });
}

export async function updateConfigKey(gameId, cfgId, fields) {
  return request(`/api/games/${gameId}/backend/config/${cfgId}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function deleteConfigKey(gameId, cfgId) {
  return request(`/api/games/${gameId}/backend/config/${cfgId}`, { method: 'DELETE' });
}

// ── Arcade (public gallery) ──────────────────────────────────────────────────

export async function getArcadeGames() {
  return request('/api/games/arcade');
}

// ── Game arcade settings ─────────────────────────────────────────────────────

export async function uploadThumbnail(gameId, file) {
  const fd = new FormData();
  fd.append('file', file);
  return requestRaw(`/api/games/${gameId}/thumbnail`, { method: 'POST', body: fd }, true);
}

export async function deleteThumbnail(gameId) {
  return request(`/api/games/${gameId}/thumbnail`, { method: 'DELETE' });
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listAllUsers() {
  return request('/api/auth/admin/users');
}

export async function updateUser(userId, fields) {
  return request(`/api/auth/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function deleteUser(userId) {
  return request(`/api/auth/admin/users/${userId}`, { method: 'DELETE' });
}

// ── Play (public) ─────────────────────────────────────────────────────────────

export async function getPlayInfo(gameSlug, buildId = null) {
  const path = buildId
    ? `/api/games/play/${gameSlug}/${buildId}`
    : `/api/games/play/${gameSlug}`;
  return request(path);
}

// ── Blog (public) ─────────────────────────────────────────────────────────────

export async function listBlogPosts({ page = 1, limit = 10, tag = '', q = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (tag) params.set('tag', tag);
  if (q) params.set('q', q);
  return request(`/api/blog?${params.toString()}`);
}

export async function getBlogPost(slug) {
  return request(`/api/blog/${slug}`);
}

// ── Blog Admin ────────────────────────────────────────────────────────────────

export async function listAdminBlogPosts() {
  return request('/api/blog/admin/posts');
}

export async function getAdminBlogPost(id) {
  return request(`/api/blog/admin/posts/${id}`);
}

export async function createBlogPost(data) {
  return request('/api/blog/admin/posts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateBlogPost(id, data) {
  return request(`/api/blog/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteBlogPost(id) {
  return request(`/api/blog/admin/posts/${id}`, { method: 'DELETE' });
}

export async function uploadBlogImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  return requestRaw('/api/blog/admin/upload-image', { method: 'POST', body: fd }, true);
}

// ── Blog Comments (public) ───────────────────────────────────────────────────

export async function addBlogComment(slug, body, authorName, turnstileToken) {
  return request(`/api/blog/${slug}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, authorName, turnstileToken }),
  });
}

export async function deleteBlogComment(slug, commentId) {
  return request(`/api/blog/${slug}/comments/${commentId}`, { method: 'DELETE' });
}

