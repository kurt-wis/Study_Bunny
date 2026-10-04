/**
 * Cloud session — whether this device may use Cloud AI.
 *
 * Cloud AI is optional. It needs three things:
 *   1. the student is online,
 *   2. the student ticked the consent box (Profile → Optional Cloud AI),
 *   3. the student entered the access code their teacher or team shared.
 * The code is sent with each AI request and checked on the server. There are no
 * accounts and no sign-in; the code and consent live only on this device.
 */
import { getSetting, setSetting } from '../db/database.js';

const CODE_KEY = 'cloudAccessCode';

export async function getAccessCode() {
  const code = await getSetting(CODE_KEY, '');
  return typeof code === 'string' ? code.trim() : '';
}

export async function setAccessCode(code) {
  await setSetting(CODE_KEY, String(code ?? '').trim());
}

export async function cloudEnabled() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return Boolean(await getSetting('cloudConsent', false)) && Boolean(await getAccessCode());
}

/** Turn Cloud AI off on this device and forget the access code. */
export async function disableCloud() {
  await setSetting('cloudConsent', false);
  await setSetting(CODE_KEY, '');
}
