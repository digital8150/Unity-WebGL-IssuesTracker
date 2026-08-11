import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import DashSidebar from '../components/DashSidebar.jsx';
import ProfileIdentityCard from '../components/ProfileIdentityCard.jsx';
import ProfileNameForm from '../components/ProfileNameForm.jsx';
import StorageBar from '../components/StorageBar.jsx';
import './DashboardPage.css';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = usePageNavigate();

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

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
          <ProfileIdentityCard user={user} />
          <ProfileNameForm />
        </div>
      </main>
    </div>
  );
}
