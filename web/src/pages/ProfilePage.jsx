import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { updateMyProfile } from '../api.js';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import DashSidebar from '../components/DashSidebar.jsx';
import StorageBar from '../components/StorageBar.jsx';
import './DashboardPage.css';
import './ProfilePage.css';

function statusLabel(status, labels) {
  return labels[status] || status || '—';
}

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const { t } = useI18n();
  const navigate = usePageNavigate();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  useEffect(() => {
    setName(user?.name || '');
  }, [user?.name]);

  const trimmedName = name.trim();
  const isDirty = trimmedName !== (user?.name || '');

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!trimmedName || !isDirty || saving) return;

    setFeedback({ type: '', text: '' });
    setSaving(true);
    try {
      const { user: savedUser } = await updateMyProfile({ name: trimmedName });
      updateUser(savedUser);
      setFeedback({ type: 'success', text: t.profile.saved });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || t.profile.error });
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = user?.role === 'admin' ? t.profile.admin : t.profile.member;
  const statusLabels = {
    approved: t.profile.approved,
    pending: t.profile.pending,
    rejected: t.profile.rejected,
  };

  return (
    <div className="dash-layout">
      <DashSidebar
        user={user}
        active="profile"
        backLabel={t.dash.title}
        storage={<StorageBar label={t.storage.label} />}
        onLogout={handleLogout}
      />

      <main className="dash-main profile-main">
        <header className="profile-header">
          <div>
            <p className="profile-kicker">{t.profile.eyebrow}</p>
            <h1 className="dash-page-title">{t.profile.title}</h1>
            <p className="dash-page-sub">{t.profile.sub}</p>
          </div>
        </header>

        <div className="profile-grid">
          <section className="profile-card profile-summary-card">
            <div className="profile-summary-glow" aria-hidden="true" />
            <div className="profile-avatar-large" aria-hidden="true">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="profile-summary-copy">
              <p className="profile-card-kicker">{t.profile.identityTitle}</p>
              <h2>{user?.name}</h2>
              <p>{t.profile.identityDesc}</p>
            </div>
            <dl className="profile-meta-list">
              <div>
                <dt>{t.profile.email}</dt>
                <dd>{user?.email}</dd>
              </div>
              <div>
                <dt>{t.profile.role}</dt>
                <dd>{roleLabel}</dd>
              </div>
              <div>
                <dt>{t.profile.status}</dt>
                <dd>{statusLabel(user?.status, statusLabels)}</dd>
              </div>
            </dl>
          </section>

          <form className="profile-card profile-form-card" onSubmit={handleSubmit}>
            <div className="profile-form-heading">
              <p className="profile-card-kicker">02 / IDENTITY</p>
              <h2>{t.profile.displayName}</h2>
              <p>{t.profile.displayNameHint}</p>
            </div>

            <label className="profile-field">
              <span>{t.profile.displayName}</span>
              <input
                className="form-input"
                type="text"
                value={name}
                maxLength={100}
                autoComplete="name"
                onChange={(event) => {
                  setName(event.target.value);
                  setFeedback({ type: '', text: '' });
                }}
                required
              />
              <small>{t.profile.displayNameHint}</small>
            </label>

            <div className="profile-form-footer">
              <div aria-live="polite" className={`profile-feedback${feedback.type ? ` is-${feedback.type}` : ''}`}>
                {feedback.text}
              </div>
              <button className="btn btn-primary profile-save-button" type="submit" disabled={!isDirty || !trimmedName || saving}>
                {saving ? t.profile.saving : t.profile.save}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
