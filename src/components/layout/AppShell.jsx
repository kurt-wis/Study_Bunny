import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon, { BunnyMark } from '../Icon.jsx';
import { usePrefs } from '../../context/Prefs.jsx';
import { initialsOf } from '../../utils/preferences.js';

const NAV = [
  { key: 'home', label: 'Home', to: '/student', icon: 'home' },
  { key: 'review', label: 'Review', to: '/student/review', icon: 'review' },
  { key: 'quiz', label: 'Quiz', to: '/student/quiz', icon: 'quiz' },
  { key: 'profile', label: 'Profile', to: '/student/profile', icon: 'profile' },
];

/** Which workspace section a path belongs to (document sub-pages included). */
export function sectionFor(pathname) {
  if (/\/profile(\/|$)/.test(pathname)) return 'profile';
  if (/\/review(\/|$)/.test(pathname)) return 'review';
  if (/\/quiz(\/|$)/.test(pathname)) return 'quiz';
  return 'home';
}

/**
 * AppShell — the workspace frame around every screen: a side menu on wide
 * screens and a bottom tab bar on phones.
 */
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const { prefs } = usePrefs();
  const active = sectionFor(pathname);
  const name = prefs.name?.trim();

  return (
    <div className="min-h-screen lg:flex" style={{ background: 'var(--sb-bg)', color: 'var(--sb-ink)' }}>
      <aside
        className="hidden lg:flex flex-col gap-1.5 w-[248px] shrink-0 sticky top-0 h-screen px-[22px] py-7 overflow-y-auto"
        style={{ background: 'var(--sb-surface)', borderRight: '1px solid var(--sb-line)' }}
      >
        <Link to="/student" className="flex items-center gap-2.5 mb-8" aria-label="Study Bunny home">
          <BunnyMark />
          <span className="sb-display text-[19px]" style={{ color: 'var(--sb-primary)' }}>Study Bunny</span>
        </Link>
        <nav aria-label="Workspace" className="flex flex-col gap-1.5">
          <div className="sb-eyebrow text-[11px] ml-3 mb-1" style={{ letterSpacing: '0.14em' }}>Workspace</div>
          {NAV.map(item => (
            <Link key={item.key} to={item.to} className="sb-nav-link" aria-current={active === item.key ? 'page' : undefined}>
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div
          className="mt-auto flex gap-2.5 p-3.5 rounded-[14px]"
          style={{ background: 'var(--sb-sky-soft)', border: '1px solid var(--sb-line)' }}
        >
          <Icon name="shield" size={22} style={{ color: 'var(--sb-primary)' }} />
          <div>
            <div className="font-bold text-[13px]">Offline ready</div>
            <div className="text-xs leading-snug sb-muted">Your progress is saved on this device.</div>
          </div>
        </div>
        <Link to="/student/profile" className="flex items-center gap-2.5 mt-3 p-2 rounded-xl" aria-label="Open profile and settings">
          <span className="sb-tile font-bold text-sm" style={{ background: '#F3D5C6', color: '#5A3B2E' }}>{initialsOf(name)}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-[13px] truncate">{name || 'Your profile'}</span>
            <span className="block text-xs sb-muted">Student</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      </aside>

      <div className="flex-1 min-w-0 pb-28 lg:pb-0">{children}</div>

      <nav
        aria-label="Workspace"
        className="lg:hidden fixed left-3 right-3 bottom-3 z-20 flex gap-1 p-1.5 rounded-[22px]"
        style={{ background: 'var(--sb-surface)', border: '1px solid var(--sb-line)', boxShadow: '0 10px 30px rgba(27,43,68,0.12)' }}
      >
        {NAV.map(item => (
          <Link key={item.key} to={item.to} className="sb-tab-link" aria-current={active === item.key ? 'page' : undefined}>
            <Icon name={item.icon} size={22} />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
