import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LandingPage from './pages/LandingPage.jsx';

// Landing is eager (fastest first paint on "/"); every other route is split into
// its own chunk so a visitor only downloads the page they navigate to. Heavy deps
// (react-unity-webgl on Play, marked/dompurify on Blog, the JSON editors on the
// game dashboard) ride along in their own chunks instead of the initial bundle.
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const PendingPage = lazy(() => import('./pages/PendingPage.jsx'));
const AgeConsentPage = lazy(() => import('./pages/AgeConsentPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const GameDetailPage = lazy(() => import('./pages/GameDetailPage.jsx'));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage.jsx'));
const PlayPage = lazy(() => import('./pages/PlayPage.jsx'));
const ReportPage = lazy(() => import('./pages/ReportPage.jsx'));
const ArcadePage = lazy(() => import('./pages/ArcadePage.jsx'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage.jsx'));
const AdminBlogPage = lazy(() => import('./pages/AdminBlogPage.jsx'));
const AdminBlogEditorPage = lazy(() => import('./pages/AdminBlogEditorPage.jsx'));
const BlogListPage = lazy(() => import('./pages/BlogListPage.jsx'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage.jsx'));

export default function App() {
  return (
    <I18nProvider>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/consent" element={<ProtectedRoute requireApproved={false} requireAgeConsent={false}><AgeConsentPage /></ProtectedRoute>} />
          <Route path="/pending" element={<ProtectedRoute requireApproved={false}><PendingPage /></ProtectedRoute>} />
          <Route path="/arcade" element={<ArcadePage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy/:date" element={<PrivacyPolicyPage />} />

          {/* Blog (public) */}
          <Route path="/blog" element={<BlogListPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />

          {/* Per-game article CMS and public article detail */}
          <Route path="/dashboard/games/:gameId/articles" element={<ProtectedRoute><AdminBlogPage /></ProtectedRoute>} />
          <Route path="/dashboard/games/:gameId/articles/new" element={<ProtectedRoute><AdminBlogEditorPage /></ProtectedRoute>} />
          <Route path="/dashboard/games/:gameId/articles/:id/edit" element={<ProtectedRoute><AdminBlogEditorPage /></ProtectedRoute>} />
          <Route path="/play/:gameSlug/articles/:articleSlug" element={<BlogPostPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard/games/:gameId" element={<ProtectedRoute><GameDetailPage /></ProtectedRoute>} />
          <Route path="/dashboard/games/:gameId/issues/:issueId" element={<ProtectedRoute><IssueDetailPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsersPage /></ProtectedRoute>} />
          <Route path="/admin/blog" element={<ProtectedRoute><AdminBlogPage /></ProtectedRoute>} />
          <Route path="/admin/blog/new" element={<ProtectedRoute><AdminBlogEditorPage /></ProtectedRoute>} />
          <Route path="/admin/blog/:id/edit" element={<ProtectedRoute><AdminBlogEditorPage /></ProtectedRoute>} />

          <Route path="/play/:gameSlug" element={<PlayPage />} />
          <Route path="/play/:gameSlug/:buildId" element={<PlayPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/report/:gameSlug" element={<ReportPage />} />
          <Route path="/report/:gameSlug/:buildId" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </I18nProvider>
  );
}
