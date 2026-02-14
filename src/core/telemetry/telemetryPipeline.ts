/**
 * telemetryPipeline.ts - Telemetry Event Pipeline
 *
 * PURPOSE:
 * - Wrap telemetry push with alert processing
 * - Maintain separation between core telemetry and alerts
 * - Provide single entry point for all telemetry events
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────┐
 * │                 telemetryPush(event)                │
 * ├─────────────────────────────────────────────────────┤
 * │  ┌──────────────┐     ┌─────────────────────────┐  │
 * │  │  TELEMETRY   │────▶│     AlertEngine         │  │
 * │  │  (ringbuf)   │     │  (rules + cooldown)     │  │
 * │  └──────────────┘     └─────────────────────────┘  │
 * │                              │                      │
 * │                              ▼                      │
 * │                       ┌─────────────────────────┐  │
 * │                       │   Auto-suggest Tuning   │  │
 * │                       │   (optional hooks)      │  │
 * │                       └─────────────────────────┘  │
 * └─────────────────────────────────────────────────────┘
 *
 * USAGE:
 * import { telemetryPush } from './telemetryPipeline';
 *
 * // Instead of TELEMETRY.push(ev)
 * telemetryPush(ev);
 */

import { TELEMETRY } from './telemetrySingleton';
import type { TelemetryEvent } from './telemetryTypes';
import { AlertEngine, DEFAULT_ALERT_CONFIG } from './alertEngine';
import { TuningSuggestionEngine, DEFAULT_TUNING_CONTEXT } from './tuningSuggestionEngine';

// ============================================
// GLOBAL ENGINES
// ============================================

/**
 * Global alert engine instance
 */
export const ALERTS = new AlertEngine(DEFAULT_ALERT_CONFIG);

/**
 * Global tuning suggestion engine instance
 *
 * Generates actionable parameter suggestions from alerts.
 * Use SUGGEST.setContext() to sync with runtime config.
 */
export const SUGGEST = new TuningSuggestionEngine(DEFAULT_TUNING_CONTEXT);

// ============================================
// PIPELINE FUNCTIONS
// ============================================

/**
 * Push event through telemetry pipeline
 *
 * 1. Pushes to TELEMETRY ring buffer
 * 2. Feeds to ALERTS engine for rule processing
 * 3. Feeds ALERT events to SUGGEST engine for tuning suggestions
 */
export function telemetryPush(ev: TelemetryEvent): void {
  // Push to ring buffer
  TELEMETRY.push(ev);

  // Feed to alert engine
  ALERTS.onEvent(ev);

  // Feed to suggestion engine (only processes ALERT events)
  SUGGEST.onEvent(ev);
}

/**
 * Push multiple events
 */
export function telemetryPushBatch(events: TelemetryEvent[]): void {
  for (const ev of events) {
    telemetryPush(ev);
  }
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

import { nowMs } from './timer';
import type {
  TelemetrySampleDrag,
  TelemetrySampleCollision,
  TelemetrySampleGate,
  TelemetrySampleSnap,
  TelemetrySamplePerf,
} from './telemetryTypes';

/**
 * Log drag tick event
 */
export function logDragTick(data: Omit<TelemetrySampleDrag, 'ts' | 'level' | 'kind'>): void {
  telemetryPush({
    ts: nowMs(),
    level: 'INFO',
    kind: 'DRAG_TICK',
    ...data,
  });
}

/**
 * Log collision check event
 */
export function logCollisionCheck(data: Omit<TelemetrySampleCollision, 'ts' | 'level' | 'kind'>): void {
  telemetryPush({
    ts: nowMs(),
    level: 'INFO',
    kind: 'COLLISION_CHECK',
    ...data,
  });
}

/**
 * Log gate result event
 */
export function logGateResult(data: Omit<TelemetrySampleGate, 'ts' | 'level' | 'kind'>): void {
  const level = data.errorCount > 0 ? 'ERROR' : (data.warnCount > 0 ? 'WARN' : 'INFO');
  telemetryPush({
    ts: nowMs(),
    level,
    kind: 'GATE_RESULT',
    ...data,
  });
}

/**
 * Log snap update event
 */
export function logSnapUpdate(data: Omit<TelemetrySampleSnap, 'ts' | 'level' | 'kind'>): void {
  telemetryPush({
    ts: nowMs(),
    level: 'INFO',
    kind: 'SNAP_UPDATE',
    ...data,
  });
}

/**
 * Log performance sample
 */
export function logPerfSample(data: Omit<TelemetrySamplePerf, 'ts' | 'level' | 'kind'>): void {
  telemetryPush({
    ts: nowMs(),
    level: data.ms > 10 ? 'WARN' : 'INFO',
    kind: 'PERF_SAMPLE',
    ...data,
  });
}

// ============================================
// CONTROL FUNCTIONS
// ============================================

/**
 * Enable both telemetry and alerts
 */
export function enablePipeline(): void {
  TELEMETRY.setEnabled(true);
  ALERTS.setEnabled(true);
}

/**
 * Disable both telemetry and alerts
 */
export function disablePipeline(): void {
  TELEMETRY.setEnabled(false);
  ALERTS.setEnabled(false);
}

/**
 * Toggle pipeline
 */
export function togglePipeline(): boolean {
  const newState = !TELEMETRY.isEnabled();
  TELEMETRY.setEnabled(newState);
  ALERTS.setEnabled(newState);
  return newState;
}

/**
 * Reset telemetry, alerts, and suggestions
 */
export function resetPipeline(): void {
  TELEMETRY.reset();
  ALERTS.reset();
  SUGGEST.reset();
}

/**
 * Get pipeline status
 */
export function getPipelineStatus(): {
  telemetryEnabled: boolean;
  alertsEnabled: boolean;
  suggestEnabled: boolean;
  eventCount: number;
  alertCounts: Record<string, number>;
  suggestionCounts: Record<string, number>;
} {
  return {
    telemetryEnabled: TELEMETRY.isEnabled(),
    alertsEnabled: ALERTS.isEnabled(),
    suggestEnabled: SUGGEST.isEnabled(),
    eventCount: TELEMETRY.totalCount(),
    alertCounts: ALERTS.getAlertCounts(),
    suggestionCounts: SUGGEST.getSuggestionCounts(),
  };
}
