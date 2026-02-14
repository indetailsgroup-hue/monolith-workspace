/**
 * alertTypes.ts - Alert Event Types
 *
 * PURPOSE:
 * - Define structured alert codes and events
 * - Support debugging and performance tuning
 * - Enable auto-suggest tuning recommendations
 *
 * ALERT CODES:
 * - SAT_SLOW: Collision check took too long (>5ms)
 * - CANDIDATES_HIGH: Too many snap candidates (>40)
 * - ENGAGE_FLIPFLOP: Snap engagement toggling rapidly
 * - DT_SPIKE: Frame hitch / low FPS
 * - NEAR_ITEMS_HIGH: Spatial query returned too many items (>80)
 * - VELOCITY_SPIKE: Velocity jumped unexpectedly
 * - PREDICTIVE_CLAMP: Predictive delta was clamped frequently
 */

import type { TelemetryEventBase, TelemetryLevel } from './telemetryTypes';

// ============================================
// ALERT CODES
// ============================================

export type AlertCode =
  | 'SAT_SLOW'
  | 'CANDIDATES_HIGH'
  | 'ENGAGE_FLIPFLOP'
  | 'DT_SPIKE'
  | 'NEAR_ITEMS_HIGH'
  | 'VELOCITY_SPIKE'
  | 'PREDICTIVE_CLAMP'
  | 'GATE_FAILED'
  | 'COLLISION_HIT';

// ============================================
// ALERT SEVERITY
// ============================================

export type AlertSeverity = 'INFO' | 'WARN' | 'ERROR';

export const ALERT_SEVERITY: Record<AlertCode, AlertSeverity> = {
  SAT_SLOW: 'WARN',
  CANDIDATES_HIGH: 'INFO',
  ENGAGE_FLIPFLOP: 'INFO',
  DT_SPIKE: 'WARN',
  NEAR_ITEMS_HIGH: 'INFO',
  VELOCITY_SPIKE: 'WARN',
  PREDICTIVE_CLAMP: 'INFO',
  GATE_FAILED: 'ERROR',
  COLLISION_HIT: 'WARN',
};

// ============================================
// ALERT EVENT
// ============================================

export interface TelemetryAlertEvent extends TelemetryEventBase {
  kind: 'ALERT';

  /** Alert code identifier */
  code: AlertCode;

  /** Human-readable title */
  title: string;

  /** Detailed description */
  detail: string;

  /** Metrics for debugging */
  metrics: Record<string, number>;

  /** Running count for this alert code */
  count: number;

  /** Configured cooldown (seconds) */
  cooldownSec: number;

  /** Suggested fix (optional) */
  suggestion?: string;
}

// ============================================
// ALERT METADATA
// ============================================

export interface AlertMetadata {
  code: AlertCode;
  title: string;
  description: string;
  severity: AlertSeverity;
  icon: string;
  color: string;
}

export const ALERT_METADATA: Record<AlertCode, AlertMetadata> = {
  SAT_SLOW: {
    code: 'SAT_SLOW',
    title: 'Collision Check Slow',
    description: 'SAT collision detection took too long',
    severity: 'WARN',
    icon: '⏱️',
    color: '#f87171',
  },
  CANDIDATES_HIGH: {
    code: 'CANDIDATES_HIGH',
    title: 'Candidate Count High',
    description: 'Too many snap candidates generated',
    severity: 'INFO',
    icon: '📦',
    color: '#fb923c',
  },
  ENGAGE_FLIPFLOP: {
    code: 'ENGAGE_FLIPFLOP',
    title: 'Snap Flip-Flop',
    description: 'Snap engagement toggling rapidly (jitter)',
    severity: 'INFO',
    icon: '🔄',
    color: '#a78bfa',
  },
  DT_SPIKE: {
    code: 'DT_SPIKE',
    title: 'Frame Hitch',
    description: 'Frame time spike detected (low FPS)',
    severity: 'WARN',
    icon: '🐢',
    color: '#ef4444',
  },
  NEAR_ITEMS_HIGH: {
    code: 'NEAR_ITEMS_HIGH',
    title: 'Near-field Density High',
    description: 'Spatial query returned too many items',
    severity: 'INFO',
    icon: '🎯',
    color: '#facc15',
  },
  VELOCITY_SPIKE: {
    code: 'VELOCITY_SPIKE',
    title: 'Velocity Spike',
    description: 'Velocity jumped unexpectedly',
    severity: 'WARN',
    icon: '⚡',
    color: '#f472b6',
  },
  PREDICTIVE_CLAMP: {
    code: 'PREDICTIVE_CLAMP',
    title: 'Predictive Clamp',
    description: 'Predictive delta was clamped (overspeed)',
    severity: 'INFO',
    icon: '📏',
    color: '#38bdf8',
  },
  GATE_FAILED: {
    code: 'GATE_FAILED',
    title: 'Gate Failed',
    description: 'Manufacturing gate check failed',
    severity: 'ERROR',
    icon: '🚫',
    color: '#dc2626',
  },
  COLLISION_HIT: {
    code: 'COLLISION_HIT',
    title: 'Collision Detected',
    description: 'Cabinet collision detected',
    severity: 'WARN',
    icon: '💥',
    color: '#f97316',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get alert metadata by code
 */
export function getAlertMetadata(code: AlertCode): AlertMetadata {
  return ALERT_METADATA[code];
}

/**
 * Get alert icon
 */
export function getAlertIcon(code: AlertCode): string {
  return ALERT_METADATA[code]?.icon ?? '⚠️';
}

/**
 * Get alert color
 */
export function getAlertColor(code: AlertCode): string {
  return ALERT_METADATA[code]?.color ?? '#94a3b8';
}

/**
 * Get alert severity level
 */
export function getAlertSeverity(code: AlertCode): TelemetryLevel {
  return ALERT_SEVERITY[code] ?? 'INFO';
}
