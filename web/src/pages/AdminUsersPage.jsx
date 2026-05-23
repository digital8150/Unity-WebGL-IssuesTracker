import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { listAllUsers, updateUser, deleteUser } from '../api.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './DashboardPage.css';
import './AdminUsersPage.css';

const FILTERS = ['all', 'pending', 'approved', 'rejected'];

export default function AdminUsersPage() {
  const { user: me, logout } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const { users } = await listAllUsers();
      setUsers(users);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function patch(userId, fields) {
    setBusyId(userId);
    try {
      const { user } = await updateUser(userId, fields);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...user } : u)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(userId) {
    if (!window.confirm(t.admin.removeConfirm)) return;
    setBusyId(userId);
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const filtered = filter === 'all' ? users : users.filter((u) => u.status === filter);

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <Link to="/" className="dash-logo"><BrandLogo /></Link>
        <nav className="dash-nav">
          <Link className="dash-nav-item" to="/dashboard">{t.nav.dashboard}</Link>
          <Link className="dash-nav-item" to="/arcade">{t.nav.arcade}</Link>
          <span className="dash-nav-item active">{t.nav.admin}</span>
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-avatar">{me?.name?.[0]?.toUpperCase()}</div>
            <div className="dash-user-info">
              <div className="dash-user-name">{me?.name}</div>
              <div className="dash-user-email">{me?.email}</div>
            </div>
          </div>
          <button className="dash-footer-btn" onClick={toggleLang}>
            {lang === 'en' ? '한국어' : 'English'}
          </button>
          <button className="dash-footer-btn" onClick={handleLogout}>{t.nav.signOut}</button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-page-title">{t.admin.title}</h1>
            <p className="dash-page-sub">{t.admin.sub}</p>
          </div>
        </header>

        <div className="adm-filter">
          {FILTERS.map((f) => {
            const count = f === 'all' ? users.length : users.filter((u) => u.status === f).length;
            return (
              <button
                key={f}
                className={`adm-filter-chip${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {t.admin[`filter${f[0].toUpperCase()}${f.slice(1)}`]} <span className="adm-count">{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="dash-loading">{t.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="gd-empty-text">—</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t.admin.name}</th>
                  <th>{t.admin.email}</th>
                  <th>{t.admin.role}</th>
                  <th>{t.admin.status}</th>
                  <th>{t.admin.joined}</th>
                  <th className="adm-action-col">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = String(u.id) === String(me?.id);
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="adm-name-row">
                          <span className="adm-name">{u.name}</span>
                          {u.hasGithub && <span className="adm-github">{t.admin.githubBadge}</span>}
                          {isSelf && <span className="adm-self">you</span>}
                        </div>
                      </td>
                      <td className="adm-email">{u.email}</td>
                      <td><span className={`adm-role ${u.role}`}>{t.admin.roles[u.role]}</span></td>
                      <td><span className={`adm-status ${u.status}`}>{t.admin.statuses[u.status]}</span></td>
                      <td className="adm-date">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="adm-actions">
                        {u.status !== 'approved' && (
                          <button
                            className="btn-ghost adm-btn approve"
                            disabled={busy}
                            onClick={() => patch(u.id, { status: 'approved' })}
                          >
                            {t.admin.approve}
                          </button>
                        )}
                        {u.status === 'pending' && (
                          <button
                            className="btn-ghost adm-btn reject"
                            disabled={busy}
                            onClick={() => patch(u.id, { status: 'rejected' })}
                          >
                            {t.admin.reject}
                          </button>
                        )}
                        {u.status === 'approved' && u.role === 'user' && (
                          <button
                            className="btn-ghost adm-btn"
                            disabled={busy}
                            onClick={() => patch(u.id, { role: 'admin' })}
                          >
                            {t.admin.promote}
                          </button>
                        )}
                        {u.status === 'approved' && u.role === 'admin' && !isSelf && (
                          <button
                            className="btn-ghost adm-btn"
                            disabled={busy}
                            onClick={() => patch(u.id, { role: 'user' })}
                          >
                            {t.admin.demote}
                          </button>
                        )}
                        {!isSelf && (
                          <button
                            className="btn-ghost adm-btn danger"
                            disabled={busy}
                            onClick={() => handleDelete(u.id)}
                          >
                            {t.admin.remove}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
