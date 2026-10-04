import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportAllData, clearAllData } from '../../db/database.js';
import { loadOverview, formatDuration } from '../../services/home/overview.js';
import { initialsOf, notificationsSupported, playTone, requestReminderPermission } from '../../utils/preferences.js';
import { usePrefs } from '../../context/Prefs.jsx';
import CloudAccessPanel from '../../components/shared/CloudAccessPanel.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';
import Icon from '../../components/Icon.jsx';

const APP_VERSION = '0.1.0';

function Switch({ id, checked, onChange, labelledBy }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className="sb-switch"
    >
      <span />
    </button>
  );
}

/**
 * StudentProfile — "Profile & settings": who is studying, lifetime totals,
 * study preferences (reminders, sound, dark appearance) and data controls
 * (export, optional Cloud AI, clear everything). All stored on this device.
 */
export default function StudentProfile() {
  const navigate = useNavigate();
  const { prefs, setPref, reload } = usePrefs();
  const [overview, setOverview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadOverview()
      .then(o => { if (!cancelled) setOverview(o); })
      .catch(() => { if (!cancelled) setError('Could not load your study totals.'); });
    return () => { cancelled = true; };
  }, []);

  function startEdit() {
    setDraftName(prefs.name ?? '');
    setEditing(true);
  }

  async function saveName(e) {
    e.preventDefault();
    await setPref('name', draftName.trim());
    setEditing(false);
  }

  async function toggleReminders(on) {
    setNotice(null);
    if (!on) { await setPref('reminders', false); return; }
    const permission = await requestReminderPermission();
    if (permission === 'granted') {
      await setPref('reminders', true);
      setNotice('Reminders are on. You will get one nudge a day when cards are due and Study Bunny is open.');
    } else {
      await setPref('reminders', false);
      setNotice(permission === 'unsupported'
        ? 'This browser does not support notifications, so reminders stay off.'
        : 'Notifications are blocked for this site. Allow them in your browser settings to turn reminders on.');
    }
  }

  async function toggleSound(on) {
    await setPref('sound', on);
    if (on) playTone('correct');
  }

  async function onExport() {
    setError(null);
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `study-bunny-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('Your study data was downloaded as a JSON file.');
    } catch {
      setError('Could not export your data. Please try again.');
    }
  }

  async function onClear() {
    if (!confirm('Delete every document, all progress and your settings from this device? This cannot be undone.')) return;
    try {
      await clearAllData();
      await reload();
      navigate('/student');
    } catch {
      setError('Could not clear your data. Please try again.');
    }
  }

  const name = prefs.name?.trim();
  const streak = overview?.streak.current ?? 0;
  const since = overview?.since
    ? overview.since.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    : null;

  const totals = [
    { value: overview ? String(overview.sets.length) : '–', label: 'Study sets' },
    { value: overview ? String(overview.mastered) : '–', label: 'Topics mastered' },
    { value: overview ? formatDuration(overview.totalSeconds) : '–', label: 'Total focus' },
  ];

  const preferences = [
    { key: 'reminders', icon: 'bell', label: 'Study reminders', hint: 'Get a gentle nudge when cards are due', checked: prefs.reminders, onChange: toggleReminders, disabled: !notificationsSupported() },
    { key: 'sound', icon: 'sound', label: 'Sound effects', hint: 'Play sounds for answers and milestones', checked: prefs.sound, onChange: toggleSound },
    { key: 'dark', icon: 'moon', label: 'Dark appearance', hint: 'Reduce brightness while studying', checked: prefs.dark, onChange: on => setPref('dark', on) },
  ];

  return (
    <main className="max-w-[1010px] mx-auto px-4 sm:px-8 lg:px-[26px] py-8 lg:py-10 flex flex-col gap-[18px] sb-stagger">
      <header>
        <p className="sb-eyebrow">Your space</p>
        <h1 className="sb-title mt-1.5 mb-3">Profile &amp; settings</h1>
      </header>

      <section className="flex flex-wrap items-center gap-5 rounded-3xl px-6 py-7 sm:px-[30px]" style={{ background: 'var(--sb-mint)' }} aria-label="Your profile">
        <span className="sb-tile font-bold text-xl" style={{ width: 72, height: 72, borderRadius: 20, background: '#F3D5C6', color: '#5A3B2E', boxShadow: 'var(--sb-shadow)' }}>
          {initialsOf(name)}
        </span>
        {editing ? (
          <form onSubmit={saveName} className="flex-1 basis-[220px] flex flex-wrap items-end gap-3">
            <label className="flex-1 basis-[200px] text-xs font-bold">
              Your name
              <input
                className="sb-input mt-1"
                style={{ minHeight: 48 }}
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                maxLength={60}
                autoComplete="name"
                autoFocus
              />
            </label>
            <button type="submit" className="sb-btn">Save</button>
            <button type="button" className="sb-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <div className="flex-1 basis-[220px] min-w-0">
              <h2 className="sb-display text-[21px] truncate">{name || 'Add your name'}</h2>
              <p className="text-[13px] sb-body my-1">
                {since ? `Learning with Study Bunny since ${since}` : 'Upload your first notes to start learning'}
              </p>
              <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--sb-coral-ink)' }}>
                <Icon name="flame" size={14} /> {streak} day streak
              </p>
            </div>
            <button type="button" className="sb-btn-ghost" onClick={startEdit}>Edit profile</button>
          </>
        )}
      </section>

      <dl className="sb-card grid grid-cols-3 py-4 text-center m-0">
        {totals.map((t, i) => (
          <div key={t.label} style={i > 0 ? { borderLeft: '1px solid var(--sb-line)' } : undefined}>
            <dd className="sb-display text-[19px] m-0">{t.value}</dd>
            <dt className="text-xs sb-muted">{t.label}</dt>
          </div>
        ))}
      </dl>

      {notice && <p role="status" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--sb-sky-soft)', color: 'var(--sb-body)' }}>{notice}</p>}
      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start mt-2.5">
        <section className="sb-card p-[22px]" aria-labelledby="prefs-title">
          <div className="flex items-center gap-3 mb-4">
            <span className="sb-tile" style={{ background: 'var(--sb-mint)', color: 'var(--sb-primary)' }}><Icon name="profile" /></span>
            <div>
              <h2 id="prefs-title" className="sb-display text-base">Study preferences</h2>
              <p className="text-xs sb-muted">Personalize your daily learning</p>
            </div>
          </div>
          {preferences.map(p => (
            <div key={p.key} className="flex items-center gap-3.5 py-3" style={{ borderTop: '1px solid var(--sb-line-soft)' }}>
              <Icon name={p.icon} className="sb-muted" />
              <div className="flex-1 min-w-0">
                <div id={`pref-${p.key}`} className="font-bold text-[13px]">{p.label}</div>
                <div className="text-xs sb-muted">{p.hint}</div>
              </div>
              <Switch labelledBy={`pref-${p.key}`} checked={Boolean(p.checked)} onChange={p.onChange} />
            </div>
          ))}
        </section>

        <section className="sb-card p-[22px]" aria-labelledby="privacy-title">
          <div className="flex items-center gap-3 mb-4">
            <span className="sb-tile" style={{ background: 'var(--sb-mint)', color: 'var(--sb-primary)' }}><Icon name="shield" /></span>
            <div>
              <h2 id="privacy-title" className="sb-display text-base">Data &amp; privacy</h2>
              <p className="text-xs sb-muted">You are always in control</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onExport}
            className="w-full flex items-center gap-3.5 py-3 text-left"
            style={{ borderTop: '1px solid var(--sb-line-soft)', borderBottom: '1px solid var(--sb-line-soft)' }}
          >
            <Icon name="download" className="sb-muted" />
            <span className="flex-1">
              <span className="block font-bold text-[13px]">Export my study data</span>
              <span className="block text-xs sb-muted">Download a copy of your progress</span>
            </span>
            <Icon name="chevron" size={18} className="sb-muted" />
          </button>
          <div className="flex gap-3 my-4 px-4 py-3.5 rounded-xl" style={{ background: 'var(--sb-mint)' }}>
            <Icon name="shield" style={{ color: 'var(--sb-mint-ink)' }} />
            <div>
              <div className="font-bold text-[13px]" style={{ color: 'var(--sb-mint-ink)' }}>Your notes stay on this device</div>
              <p className="text-xs sb-body leading-relaxed">
                Study Bunny stores your documents and progress in this browser. Nothing is sent anywhere unless you turn on Cloud AI below.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClear} className="font-bold text-[13px]" style={{ color: 'var(--sb-coral-ink)' }}>
            Clear all local data
          </button>
        </section>
      </div>

      <CloudAccessPanel />

      <p className="text-center text-[11px] sb-muted mt-2">Study Bunny · Offline mode ready · Version {APP_VERSION}</p>
    </main>
  );
}
