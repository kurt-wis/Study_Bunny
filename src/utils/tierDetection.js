/**
 * TierResolver — resolves cloud / edge / deterministic for each feature invocation.
 * Tier names (stable): 'cloud', 'edge', 'deterministic'
 *
 * Resolution order per invocation:
 *   1. Cloud  — if API health check passes AND user hasn't forced a lower tier
 *   2. Edge   — if a ready on-device provider is registered (stretch goal; none registered in MVP)
 *   3. Deterministic — always available fallback
 */

export const TIER = {
  CLOUD: 'cloud',
  EDGE: 'edge',
  DETERMINISTIC: 'deterministic',
};

export const TIER_LABEL = {
  [TIER.CLOUD]: 'Cloud AI',
  [TIER.EDGE]: 'On-device AI',
  [TIER.DETERMINISTIC]: 'Offline mode',
};

// Configurable API base URL — never a secret, just a deployment config.
// Falls back to the same origin (useful when API is co-deployed).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// In-memory health check cache (per browser session) to avoid hammering the API.
let _lastHealthCheck = null;  // { ok: bool, ts: Date }
const HEALTH_CACHE_MS = 30_000; // re-check every 30s

/**
 * Check if the cloud API is reachable.
 * Caches result for HEALTH_CACHE_MS to reduce network chatter.
 */
export async function checkCloudHealth() {
  const now = Date.now();
  if (_lastHealthCheck && now - _lastHealthCheck.ts < HEALTH_CACHE_MS) {
    return _lastHealthCheck.ok;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    _lastHealthCheck = { ok, ts: now };
    return ok;
  } catch {
    _lastHealthCheck = { ok: false, ts: now };
    return false;
  }
}

/** Force-invalidate the health cache (e.g. after a network change event). */
export function invalidateHealthCache() {
  _lastHealthCheck = null;
}

/**
 * Registered on-device (edge) providers. Features register themselves here
 * when they have a ready SLM. MVP: empty.
 * @type {Map<string, { ready: boolean }>}
 */
const _edgeProviders = new Map();

export function registerEdgeProvider(feature, descriptor) {
  _edgeProviders.set(feature, descriptor);
}

/**
 * Resolve the effective tier for a given feature invocation.
 *
 * @param {object} opts
 * @param {string} opts.feature - feature key (e.g. 'summarize', 'quiz', 'chat', 'intervention')
 * @param {'cloud'|'edge'|'deterministic'|null} opts.preference - manual override from user
 * @returns {Promise<{ tier: string, label: string, reason: string }>}
 */
export async function resolveTier({ feature, preference = null }) {
  // Manual preference for deterministic always wins
  if (preference === TIER.DETERMINISTIC) {
    return { tier: TIER.DETERMINISTIC, label: TIER_LABEL[TIER.DETERMINISTIC], reason: 'Manual preference' };
  }

  // Try cloud (unless user explicitly chose edge)
  if (preference !== TIER.EDGE) {
    const cloudOk = await checkCloudHealth();
    if (cloudOk) {
      return { tier: TIER.CLOUD, label: TIER_LABEL[TIER.CLOUD], reason: 'Cloud available' };
    }
  }

  // Try edge
  const edgeProvider = _edgeProviders.get(feature);
  if (edgeProvider?.ready) {
    return { tier: TIER.EDGE, label: TIER_LABEL[TIER.EDGE], reason: 'On-device model ready' };
  }

  // Always-available fallback
  return { tier: TIER.DETERMINISTIC, label: TIER_LABEL[TIER.DETERMINISTIC], reason: 'No higher tier available' };
}

/**
 * Convenience: detect tier without a feature preference context.
 * Used by services that just need the current tier.
 */
export async function detectTier() {
  const { tier } = await resolveTier({ feature: 'default' });
  return tier;
}
