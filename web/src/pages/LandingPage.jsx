import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './LandingPage.css';

const FEATURES = [
  {
    icon: '⬆',
    title: 'Upload & Share',
    desc: 'Upload your Unity WebGL build once. Get a shareable URL for testers instantly — no manual file copying, no deploys.',
  },
  {
    icon: '🎮',
    title: 'In-game Reporting',
    desc: 'Press F2 inside the game. The overlay captures title, description, console logs, GPU info, and custom game state automatically.',
  },
  {
    icon: '📋',
    title: 'Developer Dashboard',
    desc: 'All reports land in your dashboard, scoped to your game and build version. Filter, search, and track status.',
  },
  {
    icon: '🔔',
    title: 'Discord Alerts',
    desc: 'Connect a webhook and get a Discord notification the moment a tester files a report — with full context attached.',
  },
];

const STEPS = [
  { n: '01', title: 'Create a game', desc: 'Add your game to the dashboard and configure a Discord webhook if you want alerts.' },
  { n: '02', title: 'Upload your build', desc: 'Drag and drop the four Unity WebGL output files. We handle serving, compression, and versioning.' },
  { n: '03', title: 'Share the play URL', desc: 'Send testers the /play link. They open it in any browser — no download, no install.' },
  { n: '04', title: 'Collect bug reports', desc: 'Testers press F2, describe the issue, and submit. Reports appear in your dashboard instantly.' },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">BugDrop</span>
        <div className="landing-nav-links">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">Sign in</Link>
              <Link to="/register" className="btn btn-primary">Get started free</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">Unity WebGL · Bug Tracking Platform</div>
        <h1 className="hero-title">
          Ship faster.<br />
          <span className="gradient-text">Catch bugs in the wild.</span>
        </h1>
        <p className="hero-sub">
          Upload your Unity WebGL build, share a URL with testers, and collect structured bug reports straight from inside the game.
          No SDKs to fight, no server to manage.
        </p>
        <div className="hero-cta">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-lg">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/register" className="btn btn-primary btn-lg">Start for free</Link>
              <Link to="/login" className="btn btn-ghost btn-lg">Sign in</Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="section-label">Features</div>
        <h2 className="section-title">Everything you need to close the feedback loop</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <div className="section-label">How it works</div>
        <h2 className="section-title">Up and running in minutes</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.n} className="step">
              <div className="step-number">{s.n}</div>
              <div className="step-body">
                <h3 className="step-title">{s.title}</h3>
                <p className="step-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2 className="cta-title">Ready to stop chasing bugs over Discord?</h2>
        <p className="cta-sub">Free to start. No credit card required.</p>
        {!user && (
          <Link to="/register" className="btn btn-primary btn-lg">Create your account</Link>
        )}
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span className="landing-logo">BugDrop</span>
        <span className="footer-copy">Unity WebGL Issue Tracking Platform</span>
      </footer>
    </div>
  );
}
