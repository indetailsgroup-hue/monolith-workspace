/**
 * HealthBadge — colored pill showing ComponentHealth or WwUnitState status
 */
import React from 'react';
import { HEALTH_COLOR, WW_STATE_COLOR, WW_STATE_LABEL, WwUnitState } from '../../api/digitalShadowApi';
import type { HealthStatus } from '../../api/digitalShadowApi';

interface HealthBadgeProps {
  status: HealthStatus;
  size?: 'sm' | 'md';
}

interface StateBadgeProps {
  state: WwUnitState;
  size?: 'sm' | 'md';
}

const SIZE = { sm: { fontSize: 10, padding: '2px 7px' }, md: { fontSize: 12, padding: '3px 10px' } };

export function HealthBadge({ status, size = 'md' }: HealthBadgeProps): React.ReactElement {
  const color = HEALTH_COLOR[status] ?? '#6b7280';
  const { fontSize, padding } = SIZE[size];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: color + '22',
        border: `1px solid ${color}55`,
        color,
        borderRadius: 20,
        fontSize,
        fontWeight: 700,
        padding,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {status}
    </span>
  );
}

export function StateBadge({ state, size = 'md' }: StateBadgeProps): React.ReactElement {
  const color = WW_STATE_COLOR[state] ?? '#6b7280';
  const label = WW_STATE_LABEL[state] ?? 'UNKNOWN';
  const { fontSize, padding } = SIZE[size];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: color + '22',
        border: `1px solid ${color}55`,
        color,
        borderRadius: 20,
        fontSize,
        fontWeight: 700,
        padding,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
