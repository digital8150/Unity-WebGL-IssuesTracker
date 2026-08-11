import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import Footer from '../components/Footer.jsx';
import PageLink from '../components/PageLink.jsx';
import ProfileIdentityCard from '../components/ProfileIdentityCard.jsx';
import ProfileNameForm from '../components/ProfileNameForm.jsx';
import PublicNav from '../components/PublicNav.jsx';
import './MemberProfilePage.css';
import './ProfilePage.css';

export default function MemberProfilePage() {
  const { user, isDeveloper } = useAuth();
  const { t } = useI18n();

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

          {isDeveloper && (
            <PageLink to="/dashboard" className="btn btn-secondary member-profile-dashboard-link">
              {t.profile.dashboardLink}
            </PageLink>
          )}
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
