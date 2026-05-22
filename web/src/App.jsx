import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GameDetailPage from './pages/GameDetailPage.jsx';
import IssueDetailPage from './pages/IssueDetailPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/dashboard/games/:gameId" element={<ProtectedRoute><GameDetailPage /></ProtectedRoute>} />
        <Route path="/dashboard/games/:gameId/issues/:issueId" element={<ProtectedRoute><IssueDetailPage /></ProtectedRoute>} />
        <Route path="/play/:gameSlug" element={<PlayPage />} />
        <Route path="/play/:gameSlug/:buildId" element={<PlayPage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </I18nProvider>
  );
}
