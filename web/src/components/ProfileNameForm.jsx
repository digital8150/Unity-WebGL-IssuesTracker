import React, { useEffect, useState } from 'react';
import { updateMyProfile } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';

/** Shared display-name editor used by dashboard and public member profiles. */
export default function ProfileNameForm() {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  useEffect(() => {
    setName(user?.name || '');
  }, [user?.name]);

  const trimmedName = name.trim();
  const isDirty = trimmedName !== (user?.name || '');

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

  return (
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
  );
}
