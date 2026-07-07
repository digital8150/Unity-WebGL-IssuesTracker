import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import ParticleCanvas from '../components/ParticleCanvas.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import Footer from '../components/Footer.jsx';
import DarkModeToggle from '../components/DarkModeToggle.jsx';
import './LandingPage.css';

// ── Mock product surfaces. These are pure CSS/markup mockups so the landing
// page works even before any games or reports exist in the DB.

function MockDashboard({ t }) {
  return (
    <div className="l-mock l-mock-dash" aria-hidden="true">
      <div className="l-mock-topbar">
        <span className="l-mock-dot" />
        <span className="l-mock-dot" style={{ background: '#f5a623' }} />
        <span className="l-mock-dot" style={{ background: '#34c759' }} />
        <span className="l-mock-url">bcsdlab.arcade / dashboard / games / starbound</span>
      </div>
      <div className="l-mock-body">
        <div className="l-mock-side">
          <div className="l-mock-side-logo"><BrandLogo size="sm" /></div>
          <div className="l-mock-side-item active">My Games</div>
          <div className="l-mock-side-item">Arcade</div>
          <div className="l-mock-side-item">Admin</div>
        </div>
        <div className="l-mock-content">
          <div className="l-mock-h1">Starbound Prototype</div>
          <div className="l-mock-h-sub">/play/starbound-prototype</div>
          <div className="l-mock-tabs">
            <span>Builds (3)</span>
            <span className="active">Reports (12)</span>
            <span>Settings</span>
            <span>Arcade</span>
          </div>
          <div className="l-mock-rows">
            <div className="l-mock-row">
              <span className="l-mock-badge open">Open</span>
              <span className="l-mock-prio high" />
              <span className="l-mock-title">Boss room: enemies spawn outside the wall</span>
              <span className="l-mock-tag">bug</span>
              <span className="l-mock-date">2 min ago</span>
            </div>
            <div className="l-mock-row">
              <span className="l-mock-badge progress">In progress</span>
              <span className="l-mock-prio med" />
              <span className="l-mock-title">Inventory UI overlaps the minimap at 1280×720</span>
              <span className="l-mock-tag">bug</span>
              <span className="l-mock-date">14 min ago</span>
            </div>
            <div className="l-mock-row">
              <span className="l-mock-badge open">Open</span>
              <span className="l-mock-prio low" />
              <span className="l-mock-title">Add a way to skip the intro cutscene</span>
              <span className="l-mock-tag">suggestion</span>
              <span className="l-mock-date">1 h ago</span>
            </div>
            <div className="l-mock-row">
              <span className="l-mock-badge resolved">Resolved</span>
              <span className="l-mock-title">WebGL: black screen on Safari 17</span>
              <span className="l-mock-tag">bug</span>
              <span className="l-mock-date">yesterday</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockReport() {
  return (
    <div className="l-mock l-mock-report" aria-hidden="true">
      <div className="l-mock-topbar">
        <span className="l-mock-dot" />
        <span className="l-mock-dot" style={{ background: '#f5a623' }} />
        <span className="l-mock-dot" style={{ background: '#34c759' }} />
        <span className="l-mock-url">bcsdlab.arcade / report / starbound-prototype</span>
      </div>
      <div className="l-mock-report-body">
        <div className="l-mock-report-form">
          <div className="l-mock-overlay-h">Report a Bug</div>
          <div className="l-mock-field">
            <span className="l-mock-label">Title</span>
            <div className="l-mock-input">Boss room: enemies spawn outside the wall</div>
          </div>
          <div className="l-mock-field">
            <span className="l-mock-label">Description</span>
            <div className="l-mock-input multi">
              Walked into boss room from the south door, three enemies spawned outside the
              wall and couldn't be hit.
            </div>
          </div>
          <div className="l-mock-field">
            <span className="l-mock-label">Category</span>
            <div className="l-mock-field row" style={{ marginTop: 2 }}>
              <span className="l-mock-chip on">Bug</span>
              <span className="l-mock-chip">Suggestion</span>
            </div>
          </div>
          <div className="l-mock-submit">Submit Report →</div>
        </div>
        <div className="l-mock-snapshot">
          <div className="l-mock-snap-h">Debug snapshot · captured at click time</div>
          <div className="l-mock-snap-row"><span>Unity</span><span>2022.3.21f1 · WebGL</span></div>
          <div className="l-mock-snap-row"><span>Build</span><span>v0.4.1 · 7d3a92</span></div>
          <div className="l-mock-snap-row"><span>GPU</span><span>ANGLE / Apple M2 / Metal</span></div>
          <div className="l-mock-snap-row"><span>Viewport</span><span>1440 × 900</span></div>
          <div className="l-mock-snap-row"><span>Custom state</span><span>scene=BossRoom, hp=78</span></div>
          <div className="l-mock-snap-logs">
            <div className="l-mock-log err">[Error] Spawner: bounds check failed at (BossRoom, 14, 0, -7)</div>
            <div className="l-mock-log warn">[Warning] NavMesh: agent path partial</div>
            <div className="l-mock-log">[Log] Player entered BossRoom</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockArcade() {
  const games = [
    { name: 'Starbound Prototype', desc: 'Top-down roguelite ARPG. WIP.', grad: 'linear-gradient(135deg, #007cf0, #7928ca)' },
    { name: 'Pixel Tactics', desc: 'Turn-based tactics, demo build.', grad: 'linear-gradient(135deg, #ff4d4d, #f9cb28)' },
    { name: 'Neon Drift', desc: 'Synthwave time-trial racer.', grad: 'linear-gradient(135deg, #00dfd8, #ff0080)' },
    { name: 'Lab Defense', desc: 'Tower defense, 5-min playtest.', grad: 'linear-gradient(135deg, #7928ca, #00dfd8)' },
  ];
  return (
    <div className="l-mock l-mock-arcade" aria-hidden="true">
      <div className="l-mock-topbar">
        <span className="l-mock-dot" />
        <span className="l-mock-dot" style={{ background: '#f5a623' }} />
        <span className="l-mock-dot" style={{ background: '#34c759' }} />
        <span className="l-mock-url">bcsdlab.arcade / arcade</span>
      </div>
      <div className="l-mock-arcade-body">
        <div className="l-mock-arcade-h">
          <BrandLogo size="md" />
        </div>
        <div className="l-mock-arcade-grid">
          {games.map((g) => (
            <div key={g.name} className="l-mock-arcade-card">
              <div className="l-mock-arcade-thumb" style={{ background: g.grad }} />
              <div className="l-mock-arcade-title">{g.name}</div>
              <div className="l-mock-arcade-desc">{g.desc}</div>
              <div className="l-mock-arcade-cta">Play ▸</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navRef = useRef(null);

  useEffect(() => {
    function onScroll() {
      navRef.current?.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing">
      {/* Global Nav */}
      <nav className="l-nav" ref={navRef}>
        <Link to="/" className="l-logo"><BrandLogo size="md" /></Link>
        <div className="l-nav-links">
          <Link to="/arcade" className="l-nav-link">{t.nav.arcade}</Link>
          <Link to="/blog" className="l-nav-link">{t.nav.blog}</Link>
          <button className="l-lang-toggle" onClick={toggleLang} aria-label="Toggle language">
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <DarkModeToggle />
          {user ? (
            <Link
              to={user.status === 'approved' ? '/dashboard' : '/pending'}
              className="btn btn-primary btn-sm"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link to="/login" className="l-nav-link nav-signin">{t.nav.signIn}</Link>
              <Link to="/register" className="btn btn-primary btn-sm">{t.nav.getStarted}</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Tile */}
      <section className="l-tile l-tile-white l-hero">
        <ParticleCanvas count={55} />
        <div className="l-hero-mesh" aria-hidden="true" />
        <div className="l-tile-inner">
          <div className="l-badge">{t.hero.badge}</div>
          <h1 className="l-hero-title">
            {t.hero.title}<br />
            <span className="l-hero-accent">{t.hero.titleAccent}</span>
          </h1>
          <p className="l-hero-sub">{t.hero.subtitle}</p>
          <div className="l-hero-cta">
            {user ? (
              <>
                <Link
                  to={user.status === 'approved' ? '/dashboard' : '/pending'}
                  className="btn btn-primary"
                >
                  {t.hero.goDashboard}
                </Link>
                <Link to="/arcade" className="btn btn-secondary">{t.hero.goArcade}</Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">{t.hero.startFree}</Link>
                <Link to="/arcade" className="btn btn-secondary">{t.hero.goArcade}</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="l-tile l-tile-parchment">
        <div className="l-tile-inner">
          <p className="l-section-label">{t.features.sectionLabel}</p>
          <h2 className="l-section-title">{t.features.title}</h2>
          <div className="l-features-grid">
            {t.features.items.map((f, i) => (
              <div
                key={f.title}
                className="l-feature-card"
                style={{ animationDelay: `${0.05 + i * 0.06}s` }}
              >
                <h3 className="l-feature-title">{f.title}</h3>
                <p className="l-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase 1 — Dashboard */}
      <section className="l-tile l-tile-white l-showcase">
        <div className="l-tile-inner l-showcase-inner">
          <div className="l-showcase-copy">
            <p className="l-section-label">{t.showcase.sectionLabel}</p>
            <h2 className="l-section-title">{t.showcase.dashTitle}</h2>
            <p className="l-showcase-desc">{t.showcase.dashDesc}</p>
          </div>
          <div className="l-showcase-art">
            <MockDashboard t={t} />
          </div>
        </div>
      </section>

      {/* Showcase 2 — In-game report (reverse) */}
      <section className="l-tile l-tile-parchment l-showcase">
        <div className="l-tile-inner l-showcase-inner reverse">
          <div className="l-showcase-copy">
            <p className="l-section-label">REPORT PAGE</p>
            <h2 className="l-section-title">{t.showcase.reportTitle}</h2>
            <p className="l-showcase-desc">{t.showcase.reportDesc}</p>
          </div>
          <div className="l-showcase-art">
            <MockReport />
          </div>
        </div>
      </section>

      {/* Showcase 3 — Arcade gallery */}
      <section className="l-tile l-tile-white l-showcase">
        <div className="l-tile-inner l-showcase-inner">
          <div className="l-showcase-copy">
            <p className="l-section-label">ARCADE</p>
            <h2 className="l-section-title">{t.showcase.arcadeTitle}</h2>
            <p className="l-showcase-desc">{t.showcase.arcadeDesc}</p>
            <Link to="/arcade" className="btn btn-ghost l-showcase-link">
              {t.cta.browse} →
            </Link>
          </div>
          <div className="l-showcase-art">
            <MockArcade />
          </div>
        </div>
      </section>

      {/* Flow / How it works — dark band */}
      <section className="l-tile l-tile-dark">
        <div className="l-tile-inner">
          <p className="l-section-label l-label-on-dark">{t.flow.sectionLabel}</p>
          <h2 className="l-section-title l-title-on-dark">{t.flow.title}</h2>
          <div className="l-steps">
            {t.flow.steps.map((s) => (
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

      {/* CTA */}
      <section className="l-tile l-tile-parchment l-cta-tile">
        <div className="l-tile-inner l-cta-inner">
          <h2 className="l-cta-title">{t.cta.title}</h2>
          <p className="l-cta-sub">{t.cta.subtitle}</p>
          <div className="l-hero-cta">
            {!user && <Link to="/register" className="btn btn-primary">{t.cta.action}</Link>}
            <Link to="/arcade" className="btn btn-secondary">{t.cta.browse}</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
