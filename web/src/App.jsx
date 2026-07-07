import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import PendingPage from './pages/PendingPage.jsx';
import AgeConsentPage from './pages/AgeConsentPage.jsx';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GameDetailPage from './pages/GameDetailPage.jsx';
import IssueDetailPage from './pages/IssueDetailPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import ArcadePage from './pages/ArcadePage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminBlogPage from './pages/AdminBlogPage.jsx';
import AdminBlogEditorPage from './pages/AdminBlogEditorPage.jsx';
import BlogListPage from './pages/BlogListPage.jsx';
import BlogPostPage from './pages/BlogPostPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <I18nProvider>
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
    </I18nProvider>
  );
}

