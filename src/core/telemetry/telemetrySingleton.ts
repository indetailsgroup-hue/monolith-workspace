/**
 * telemetrySingleton.ts - Global Telemetry Instance
 *
 * PURPOSE:
 * - Single global telemetry store for entire app
 * - Easy access from any module
 * - Default disabled (opt-in)
 *
 * USAGE:
 * import { TELEMETRY } from '../telemetry/telemetrySingleton';
 *
 * // Enable
 * TELEMETRY.setEnabled(true);
 *
 * // Push events
 * TELEMETRY.push({ ts: nowMs(), level: 'INFO', kind: 'DRAG_TICK', ... });
 *
 * // Increment counters
 * TELEMETRY.inc('sat_checks');
 *
 * // Get snapshot for UI
 * const events = TELEMETRY.snapshot(200);
 */

import { TelemetryStore } from './telemetryStore';

/**
 * Global telemetry store instance
 *
 * Default: disabled, 800 event buffer
 */
export const TELEMETRY = new TelemetryStore({
  enabled: false,
  ringSize: 800,
  minLevel: 'INFO',
});

/**
 * Enable telemetry globally
 */
export function enableTelemetry(): void {
  TELEMETRY.setEnabled(true);
}

/**
 * Disable telemetry globally
 */
export function disableTelemetry(): void {
  TELEMETRY.setEnabled(false);
}

/**
 * Toggle telemetry
 */
export function toggleTelemetry(): boolean {
  const newState = !TELEMETRY.isEnabled();
  TELEMETRY.setEnabled(newState);
  return newState;
}

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  return TELEMETRY.isEnabled();
}

/**
 * Reset telemetry (clear all events and counters)
 */
export function resetTelemetry(): void {
  TELEMETRY.reset();
}
