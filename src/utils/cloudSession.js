/**
 * Cloud session — whether this device may use Cloud AI.
 *
 * Cloud AI is optional. It needs:
 *   1. the student is online,
 *   2. the student ticked the consent box (Profile → Optional Cloud AI),
 *   3. the access code, but only if the site asks for one. A site set up in
 *      open "demo" mode needs no code.
 * The code is sent with each AI request and checked on the server. There are no
 * accounts and no sign-in; the code and consent live only on this device.
 */
import { getSetting, setSetting } from '../db/database.js';

const CODE_KEY = 'cloudAccessCode';
const PROBE_CACHE_MS = 30_000;

let healthProbe = null; // set by apiTransport to avoid a circular import
let lastProbe = null;   // { at, codeRequired }

export function setHealthProbe(fn) {
  healthProbe = fn;
}

/** Forget what we know about the site (after settings change). */
export function resetCloudProbe() {
  lastProbe = null;
}

async function siteNeedsCode() {
  if (!healthProbe) return true;
  if (lastProbe && Date.now() - lastProbe.at < PROBE_CACHE_MS) return lastProbe.codeRequired;
  const info = await healthProbe();
  lastProbe = { at: Date.now(), codeRequired: !info.ok || info.codeRequired };
  return lastProbe.codeRequired;
}

export async function getAccessCode() {
  const code = await getSetting(CODE_KEY, '');
  return typeof code === 'string' ? code.trim() : '';
}

export async function setAccessCode(code) {
  await setSetting(CODE_KEY, String(code ?? '').trim());
}

export async function cloudEnabled() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!await getSetting('cloudConsent', false)) return false;
  if (await getAccessCode()) return true;
  return !await siteNeedsCode();
}

/** Turn Cloud AI off on this device and forget the access code. */
export async function disableCloud() {
  await setSetting('cloudConsent', false);
  await setSetting(CODE_KEY, '');
}
