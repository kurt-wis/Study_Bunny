const env = import.meta.env ?? {};
let managerPromise;
export const cloudConfigured = Boolean(env.VITE_API_BASE_URL && env.VITE_COGNITO_AUTHORITY && env.VITE_COGNITO_CLIENT_ID && env.VITE_COGNITO_DOMAIN);

async function manager() {
  if (!cloudConfigured) throw new Error('Cloud AI has not been configured for this deployment.');
  managerPromise ??= import('oidc-client-ts').then(({ UserManager, WebStorageStateStore }) => new UserManager({
    authority: env.VITE_COGNITO_AUTHORITY,
    client_id: env.VITE_COGNITO_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: 'code', scope: 'openid email study-bunny/study',
    automaticSilentRenew: true, loadUserInfo: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  }));
  return managerPromise;
}

export async function getAccessToken() {
  if (!cloudConfigured) return null;
  const user = await (await manager()).getUser();
  return user && !user.expired ? user.access_token : null;
}

export async function cloudEnabled() {
  if (!cloudConfigured || !navigator.onLine) return false;
  const { getSetting } = await import('../db/database.js');
  return Boolean(await getSetting('cloudConsent', false)) && Boolean(await getAccessToken());
}

export async function signIn() {
  const m = await manager();
  await m.clearStaleState();
  return m.signinRedirect();
}

let callbackPromise;
export function finishSignIn() {
  // StrictMode may mount callback twice; exchanging an OAuth code twice fails.
  callbackPromise ??= manager().then(m => m.signinRedirectCallback());
  return callbackPromise;
}

export async function signOut() {
  const m = await manager();
  m.stopSilentRenew();
  await m.removeUser();
  const { setSetting } = await import('../db/database.js');
  await setSetting('cloudConsent', false);
  const url = new URL('/logout', env.VITE_COGNITO_DOMAIN);
  url.searchParams.set('client_id', env.VITE_COGNITO_CLIENT_ID);
  url.searchParams.set('logout_uri', `${window.location.origin}/student`);
  window.location.assign(url.href);
}
