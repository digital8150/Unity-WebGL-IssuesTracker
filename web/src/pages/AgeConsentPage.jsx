import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { confirmAge } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import PageLink from '../components/PageLink.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import './AuthPage.css';

export default function AgeConsentPage() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const navigate = usePageNavigate();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  if (user.ageConfirmedAt) {
    navigate(user.status === 'approved' ? '/dashboard' : '/pending', { replace: true });
    return null;
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const { user: fresh } = await confirmAge();
      login(localStorage.getItem('token'), fresh);
      navigate(fresh.status === 'approved' ? '/dashboard' : '/pending', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <nav className="auth-topbar">
        <PageLink to="/" className="auth-logo"><BrandLogo /></PageLink>
      </nav>

      <div className="auth-card">
        <h1 className="auth-title">{t.consent.title}</h1>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '24px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {t.consent.checkboxLabel}
        </label>

        <button
          className="btn btn-primary auth-submit"
          disabled={!checked || saving}
          onClick={handleConfirm}
        >
          {saving ? t.consent.confirming : t.consent.confirm}
        </button>
      </div>
    </div>
  );
}
