import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import './LandingPage.css';

export default function LandingPage() {
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();

  return (
    <div className="landing">

      {/* Global Nav */}
      <nav className="l-nav">
        <span className="l-logo">BugDrop</span>
        <div className="l-nav-links">
          <button className="l-lang-toggle" onClick={toggleLang} aria-label="Toggle language">
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">{t.nav.dashboard}</Link>
          ) : (
            <>
              <Link to="/login" className="l-nav-link">{t.nav.signIn}</Link>
              <Link to="/register" className="btn btn-primary btn-sm">{t.nav.getStarted}</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Tile — white */}
      <section className="l-tile l-tile-white l-hero">
        <div className="l-tile-inner">
          <div className="l-badge">{t.hero.badge}</div>
          <h1 className="l-hero-title">
            {t.hero.title}<br />
            <span className="l-hero-accent">{t.hero.titleAccent}</span>
          </h1>
          <p className="l-hero-sub">{t.hero.subtitle}</p>
          <div className="l-hero-cta">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary">{t.hero.goDashboard}</Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">{t.hero.startFree}</Link>
                <Link to="/login" className="btn btn-secondary">{t.hero.signIn}</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Tile — parchment */}
      <section className="l-tile l-tile-parchment">
        <div className="l-tile-inner">
          <p className="l-section-label">{t.features.sectionLabel}</p>
          <h2 className="l-section-title">{t.features.title}</h2>
          <div className="l-features-grid">
            {t.features.items.map((f) => (
              <div key={f.title} className="l-feature-card">
                <h3 className="l-feature-title">{f.title}</h3>
                <p className="l-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works Tile — dark */}
      <section className="l-tile l-tile-dark">
        <div className="l-tile-inner">
          <p className="l-section-label l-label-on-dark">{t.howItWorks.sectionLabel}</p>
          <h2 className="l-section-title l-title-on-dark">{t.howItWorks.title}</h2>
          <div className="l-steps">
            {t.howItWorks.steps.map((s) => (
              <div key={s.n} className="l-step">
                <div className="l-step-number">{s.n}</div>
                <div className="l-step-body">
                  <h3 className="l-step-title">{s.title}</h3>
                  <p className="l-step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Tile — parchment */}
      <section className="l-tile l-tile-parchment l-cta-tile">
        <div className="l-tile-inner l-cta-inner">
          <h2 className="l-cta-title">{t.cta.title}</h2>
          <p className="l-cta-sub">{t.cta.subtitle}</p>
          {!user && (
            <Link to="/register" className="btn btn-primary">{t.cta.action}</Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="l-footer">
        <span className="l-logo l-footer-logo">BugDrop</span>
        <span className="l-footer-copy">{t.footer.tagline}</span>
      </footer>
    </div>
  );
}
