import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { usePageNavigate } from '../hooks/usePageTransition.js';
import Footer from '../components/Footer.jsx';
import PageLink from '../components/PageLink.jsx';
import ProfileIdentityCard from '../components/ProfileIdentityCard.jsx';
import ProfileNameForm from '../components/ProfileNameForm.jsx';
import PublicNav from '../components/PublicNav.jsx';
import './MemberProfilePage.css';
import './ProfilePage.css';

export default function MemberProfilePage() {
  const { user, isDeveloper, logout } = useAuth();
  const { t } = useI18n();
  const navigate = usePageNavigate();

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="member-profile-page">
      <PublicNav active="profile" />

      <main className="member-profile-main">
        <header className="member-profile-header">
          <div className="member-profile-header-copy">
            <p className="profile-kicker">{t.profile.memberEyebrow}</p>
            <h1>{t.profile.memberTitle}</h1>
            <p>{t.profile.memberSub}</p>
          </div>

          <div className="member-profile-header-actions">
            {isDeveloper && (
              <PageLink to="/dashboard" className="btn btn-secondary member-profile-dashboard-link">
                {t.profile.dashboardLink}
              </PageLink>
            )}
            <button
              type="button"
              className="btn btn-ghost member-profile-dashboard-link"
              onClick={handleLogout}
            >
              {t.nav.signOut}
            </button>
          </div>
        </header>

        <div className="profile-grid member-profile-grid">
          <ProfileIdentityCard user={user} />
          <ProfileNameForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}
