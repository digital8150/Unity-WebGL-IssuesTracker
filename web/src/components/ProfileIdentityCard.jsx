import React from 'react';
import { useI18n } from '../i18n.jsx';

function statusLabel(status, labels) {
  return labels[status] || status || '—';
}

/**
 * Shared account identity summary used by the dashboard and member profile
 * shells. The account data stays read-only here; editing belongs to the
 * companion ProfileNameForm component.
 */
export default function ProfileIdentityCard({ user }) {
  const { t } = useI18n();
  const roleLabel = user?.role === 'admin' ? t.profile.admin : t.profile.member;
  const statusLabels = {
    approved: t.profile.approved,
    pending: t.profile.pending,
    rejected: t.profile.rejected,
  };

  return (
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
  );
}
