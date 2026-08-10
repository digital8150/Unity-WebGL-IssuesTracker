import React from 'react';
import BrandLogo from './BrandLogo.jsx';
import DarkModeToggle from './DarkModeToggle.jsx';
import PageLink from './PageLink.jsx';
import { useI18n } from '../i18n.jsx';

/** Shared dashboard navigation; page-specific content stays in the caller. */
export default function DashSidebar({
  user,
  active = '',
  backHref = '/dashboard',
  backLabel,
  gameScope = false,
  gameArticleLabel,
  storage = null,
  onLogout,
  onNavigate,
}) {
  const { lang, toggleLang, t } = useI18n();
  const isAdmin = user?.role === 'admin';
  const firstLabel = backLabel || t.nav.dashboard;
  const linkProps = onNavigate ? { onClick: onNavigate } : {};

  return (
    <aside className="dash-sidebar">
      <PageLink to="/" className="dash-logo" {...linkProps}><BrandLogo /></PageLink>
      <nav className="dash-nav">
        {active === 'dashboard' ? (
          <span className="dash-nav-item active">{firstLabel}</span>
        ) : (
          <PageLink className="dash-nav-item" to={backHref} {...linkProps}>{firstLabel}</PageLink>
        )}
        <PageLink className={`dash-nav-item${active === 'arcade' ? ' active' : ''}`} to="/arcade" {...linkProps}>{t.nav.arcade}</PageLink>
        {gameScope ? (
          <>
            <PageLink className="dash-nav-item" to="/admin/blog" {...linkProps}>{t.nav.blogAdmin} CMS</PageLink>
            <span className="dash-nav-item active">{gameArticleLabel || t.gameArticles.adminTitle}</span>
          </>
        ) : active === 'blog' ? (
          <span className="dash-nav-item active">{t.nav.blogAdmin} CMS</span>
        ) : (
          <PageLink className="dash-nav-item" to="/admin/blog" {...linkProps}>{t.nav.blogAdmin} CMS</PageLink>
        )}
        {isAdmin && (
          active === 'translations' ? (
            <span className="dash-nav-item active">{t.nav.translations}</span>
          ) : (
            <PageLink className="dash-nav-item" to="/admin/translations" {...linkProps}>
              {t.nav.translations}
            </PageLink>
          )
        )}
        {isAdmin && (active === 'admin' ? (
          <span className="dash-nav-item active">{t.nav.admin}</span>
        ) : (
          <PageLink className="dash-nav-item" to="/admin/users" {...linkProps}>{t.nav.admin}</PageLink>
        ))}
      </nav>
      <div className="dash-sidebar-footer">
        {storage}
        <div className="dash-user">
          <div className="dash-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div className="dash-user-info">
            <div className="dash-user-name">{user?.name}</div>
            <div className="dash-user-email">{user?.email}</div>
          </div>
        </div>
        <div className="dash-footer-row">
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '\uD55C\uAD6D\uC5B4' : 'English'}
          </button>
          <DarkModeToggle />
        </div>
        {onLogout && <button className="dash-footer-btn" onClick={onLogout}>{t.nav.signOut}</button>}
      </div>
    </aside>
  );
}
