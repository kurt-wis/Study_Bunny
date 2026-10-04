import React from 'react';
import { TIER_LABEL } from '../../utils/tierDetection.js';
import Icon from '../Icon.jsx';

const TIER_ICONS = {
  cloud: 'cloud',
  edge: 'chip',
  deterministic: 'shield',
};

/**
 * Displays the effective tier as a badge (text + icon, not color-only per spec).
 */
export default function TierBadge({ tier }) {
  if (!tier) return null;
  const label = TIER_LABEL[tier] ?? tier;
  return (
    <span
      className="sb-chip"
      style={tier === 'cloud' ? { background: 'var(--sb-sky)', color: 'var(--sb-primary)' } : undefined}
      aria-label={`Effective tier: ${label}`}
    >
      <Icon name={TIER_ICONS[tier] ?? 'shield'} size={13} />
      {label}
    </span>
  );
}
