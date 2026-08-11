import React, { useEffect, useState } from 'react';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { getMe } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import PageLink from '../components/PageLink.jsx';
import './AuthPage.css';

export default function PendingPage() {
  const { user, login, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navigate = usePageNavigate();
  const [checking, setChecking] = useState(false);
  const myPageLabel = t.nav.myPage || t.nav.profile;

  useEffect(() => {
    if (user?.status === 'approved') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, user?.status]);

  if (!user) {
    return <RedirectToLogin />;
  }

  if (user.status === 'approved') {
    return null;
  }

  async function handleRefresh() {
    const token = localStorage.getItem('token');
    if (!token) return;
    setChecking(true);
    try {
      const { user: fresh } = await getMe(token);
      login(token, fresh);
      if (fresh.status === 'approved') navigate('/dashboard', { replace: true });
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }

  function handleSignOut() {
    logout();
    navigate('/', { replace: true });
  }

  const rejected = user.status === 'rejected';

  return (
    <div className="auth-page">
      <nav className="auth-topbar">
        <PageLink to="/" className="auth-logo"><BrandLogo /></PageLink>
        <button className="l-lang-toggle auth-lang-toggle" onClick={toggleLang}>
          {lang === 'en' ? '한국어' : 'English'}
        </button>
      </nav>

      <div className="auth-card pending-card">
        <div className="pending-icon" aria-hidden="true">
          {rejected ? '✕' : '⏳'}
        </div>
        <h1 className="auth-title">{t.pending.title}</h1>
        <p className="auth-subtitle">{t.pending.sub}</p>
        <p className="pending-body">{rejected ? t.pending.rejected : t.pending.desc}</p>

        <div className="pending-meta">
          <span>{user.email}</span>
        </div>

        <div className="pending-actions">
          <PageLink to="/me" className="btn btn-secondary">
            {myPageLabel}
          </PageLink>
          <PageLink to="/arcade" className="btn btn-secondary">
            {t.nav.arcade}
          </PageLink>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={checking}>
            {checking ? t.loading : t.pending.refresh}
          </button>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            {t.pending.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}

function RedirectToLogin() {
  const navigate = usePageNavigate();
  React.useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}
