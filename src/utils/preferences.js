/**
 * Preferences — small device-local settings behind the Profile screen.
 * Stored in the existing `appSettings` table; nothing leaves the device.
 */
import { getSetting, setSetting } from '../db/database.js';

export const DEFAULT_PREFS = Object.freeze({
  name: '',
  reminders: false,
  sound: false,
  dark: false,
});

const KEYS = { name: 'profileName', reminders: 'prefReminders', sound: 'prefSound', dark: 'prefDark' };

export async function loadPrefs() {
  const entries = await Promise.all(
    Object.entries(KEYS).map(async ([field, key]) => [field, await getSetting(key, DEFAULT_PREFS[field])]),
  );
  return { ...DEFAULT_PREFS, ...Object.fromEntries(entries) };
}

export async function savePref(field, value) {
  if (!(field in KEYS)) throw new Error(`Unknown preference: ${field}`);
  await setSetting(KEYS[field], value);
}

/** Apply the light/dark appearance to the document root. */
export function applyTheme(dark) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0F1A24' : '#F5FAFD');
}

/** Initials for the avatar tile ("Mika Alvarez" → "MA"). */
export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SB';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Sound effects (Web Audio, generated locally — no audio files) ───────────
let soundOn = false;
let audioCtx = null;

export function setSoundEnabled(on) {
  soundOn = Boolean(on);
}

const TONES = {
  correct: [[660, 0], [880, 0.09]],
  wrong: [[300, 0], [220, 0.11]],
  flip: [[520, 0]],
  done: [[523, 0], [659, 0.1], [784, 0.2]],
};

/** Play a short cue when sound effects are enabled. Never throws. */
export function playTone(kind) {
  if (!soundOn || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (const [freq, offset] of TONES[kind] ?? TONES.flip) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + offset;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch {
    /* audio is a nicety; ignore failures */
  }
}

// ── Study reminders (local notification when the app is opened with due cards) ─
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestReminderPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Show at most one "cards are due" nudge per day. */
export async function maybeRemind(dueCount, todayKey) {
  if (!notificationsSupported() || Notification.permission !== 'granted' || dueCount <= 0) return false;
  const last = await getSetting('lastReminderDay', null);
  if (last === todayKey) return false;
  await setSetting('lastReminderDay', todayKey);
  try {
    new Notification('Study Bunny', {
      body: `${dueCount} card${dueCount === 1 ? '' : 's'} due today. A short review keeps your streak alive.`,
      icon: '/pwa-192x192.png',
    });
    return true;
  } catch {
    return false;
  }
}
