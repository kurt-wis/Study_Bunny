import React from 'react';
import { TIER_LABEL } from '../../utils/tierDetection.js';

const TIER_COLORS = {
  cloud: 'bg-blue-100 text-blue-700',
  edge: 'bg-purple-100 text-purple-700',
  deterministic: 'bg-gray-100 text-gray-600',
};

const TIER_ICONS = {
  cloud: '☁️',
  edge: '💻',
  deterministic: '⚙️',
};

/**
 * Displays the effective tier as a badge (text + icon, not color-only per spec).
 */
export default function TierBadge({ tier }) {
  if (!tier) return null;
  const label = TIER_LABEL[tier] ?? tier;
  const colors = TIER_COLORS[tier] ?? 'bg-gray-100 text-gray-600';
  const icon = TIER_ICONS[tier] ?? '●';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${colors}`}
      aria-label={`Effective tier: ${label}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
