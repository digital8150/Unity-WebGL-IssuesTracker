import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { getMe } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './AuthPage.css';

export default function PendingPage() {
  const { user, login, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  if (!user) {
    return <RedirectToLogin />;
  }

  if (user.status === 'approved') {
    navigate('/dashboard', { replace: true });
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
        <Link to="/" className="auth-logo"><BrandLogo /></Link>
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
          {!rejected && (
            <button className="btn btn-primary" onClick={handleRefresh} disabled={checking}>
              {checking ? t.loading : t.pending.refresh}
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleSignOut}>
            {t.pending.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}

function RedirectToLogin() {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}
