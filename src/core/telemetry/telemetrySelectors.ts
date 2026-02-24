/**
 * telemetrySelectors.ts - UI Adapter for Telemetry Data
 *
 * PURPOSE:
 * - Extract specific event types from event stream
 * - Compute aggregations for UI display
 * - Provide typed accessors for overlay components
 */

import type {
  TelemetryEvent,
  TelemetrySampleDrag,
  TelemetrySampleCollision,
  TelemetrySampleGate,
  TelemetrySampleSnap,
  TelemetryAlert,
  TelemetrySamplePerf,
} from './telemetryTypes';

// ============================================
// LATEST EVENT SELECTORS
// ============================================

/**
 * Get latest drag event
 */
export function latestDrag(events: TelemetryEvent[]): TelemetrySampleDrag | null {
  for (const ev of events) {
    if (ev.kind === 'DRAG_TICK') return ev as TelemetrySampleDrag;
  }
  return null;
}

/**
 * Get latest collision event
 */
export function latestCollision(events: TelemetryEvent[]): TelemetrySampleCollision | null {
  for (const ev of events) {
    if (ev.kind === 'COLLISION_CHECK') return ev as TelemetrySampleCollision;
  }
  return null;
}

/**
 * Get latest gate event
 */
export function latestGate(events: TelemetryEvent[]): TelemetrySampleGate | null {
  for (const ev of events) {
    if (ev.kind === 'GATE_RESULT') return ev as TelemetrySampleGate;
  }
  return null;
}

/**
 * Get latest snap event
 */
export function latestSnap(events: TelemetryEvent[]): TelemetrySampleSnap | null {
  for (const ev of events) {
    if (ev.kind === 'SNAP_UPDATE') return ev as TelemetrySampleSnap;
  }
  return null;
}

/**
 * Get latest alert
 */
export function latestAlert(events: TelemetryEvent[]): TelemetryAlert | null {
  for (const ev of events) {
    if (ev.kind === 'THRESHOLD_ALERT') return ev as TelemetryAlert;
  }
  return null;
}

/**
 * Get latest perf sample
 */
export function latestPerf(events: TelemetryEvent[]): TelemetrySamplePerf | null {
  for (const ev of events) {
    if (ev.kind === 'PERF_SAMPLE') return ev as TelemetrySamplePerf;
  }
  return null;
}

// ============================================
// FILTERED LISTS
// ============================================

/**
 * Get all alerts
 */
export function allAlerts(events: TelemetryEvent[], limit: number = 20): TelemetryAlert[] {
  return events
    .filter((ev): ev is TelemetryAlert => ev.kind === 'THRESHOLD_ALERT')
    .slice(0, limit);
}

/**
 * Get all errors
 */
export function allErrors(events: TelemetryEvent[], limit: number = 20): TelemetryEvent[] {
  return events.filter(ev => ev.level === 'ERROR').slice(0, limit);
}

/**
 * Get all warnings
 */
export function allWarnings(events: TelemetryEvent[], limit: number = 20): TelemetryEvent[] {
  return events.filter(ev => ev.level === 'WARN').slice(0, limit);
}

// ============================================
// AGGREGATIONS
// ============================================

/**
 * Compute average FPS from drag events
 */
export function avgFps(events: TelemetryEvent[], sampleCount: number = 10): number {
  const dragEvents = events
    .filter((ev): ev is TelemetrySampleDrag => ev.kind === 'DRAG_TICK')
    .slice(0, sampleCount);

  if (dragEvents.length === 0) return 0;

  const sum = dragEvents.reduce((acc, ev) => acc + (ev.fps ?? 0), 0);
  return sum / dragEvents.length;
}

/**
 * Compute average collision check time
 */
export function avgCollisionMs(events: TelemetryEvent[], sampleCount: number = 10): number {
  const collisionEvents = events
    .filter((ev): ev is TelemetrySampleCollision => ev.kind === 'COLLISION_CHECK')
    .slice(0, sampleCount);

  if (collisionEvents.length === 0) return 0;

  const sum = collisionEvents.reduce((acc, ev) => acc + ev.ms, 0);
  return sum / collisionEvents.length;
}

/**
 * Compute total SAT checks
 */
export function totalSatChecks(events: TelemetryEvent[]): number {
  return events
    .filter((ev): ev is TelemetrySampleCollision => ev.kind === 'COLLISION_CHECK')
    .reduce((acc, ev) => acc + ev.satPairsTried, 0);
}

/**
 * Compute gate pass rate
 */
export function gatePassRate(events: TelemetryEvent[]): { passed: number; total: number; rate: number } {
  const gateEvents = events.filter((ev): ev is TelemetrySampleGate => ev.kind === 'GATE_RESULT');

  const passed = gateEvents.filter(ev => ev.ok).length;
  const total = gateEvents.length;
  const rate = total > 0 ? passed / total : 0;

  return { passed, total, rate };
}

// ============================================
// SUMMARY OBJECT
// ============================================

export interface TelemetrySummary {
  // FPS
  fps: number;
  fpsClass: 'excellent' | 'good' | 'acceptable' | 'poor';

  // Drag
  dragSpeed: number;
  dragSubSteps: number;
  dragTotalSteps: number;

  // Snap
  snapEnabled: boolean;
  snapEngaged: boolean;
  snapAxisLock: string;
  snapCandidateCount: number;
  snapActiveIndex: number;
  snapLookaheadMs: number;

  // Collision
  collisionMs: number;
  satChecks: number;
  satHits: number;

  // Gate
  gateOk: boolean;
  gateErrors: number;
  gateWarnings: number;

  // Alerts
  activeAlerts: number;
  latestAlertMessage: string | null;
}

/**
 * Create summary from events
 */
export function createSummary(events: TelemetryEvent[]): TelemetrySummary {
  const drag = latestDrag(events);
  const collision = latestCollision(events);
  const gate = latestGate(events);
  const alerts = allAlerts(events);
  const alert = alerts[0];

  const fps = drag?.fps ?? 0;
  let fpsClass: TelemetrySummary['fpsClass'] = 'poor';
  if (fps >= 55) fpsClass = 'excellent';
  else if (fps >= 45) fpsClass = 'good';
  else if (fps >= 30) fpsClass = 'acceptable';

  return {
    fps,
    fpsClass,

    dragSpeed: drag?.speed ?? 0,
    dragSubSteps: drag?.subSteps ?? 0,
    dragTotalSteps: drag?.totalSteps ?? 0,

    snapEnabled: drag?.snapEnabled ?? false,
    snapEngaged: drag?.engaged ?? false,
    snapAxisLock: drag?.axisLock ?? 'NONE',
    snapCandidateCount: drag?.candidateCount ?? 0,
    snapActiveIndex: drag?.activeIndex ?? 0,
    snapLookaheadMs: drag?.lookaheadMs ?? 0,

    collisionMs: collision?.ms ?? 0,
    satChecks: collision?.satPairsTried ?? 0,
    satHits: collision?.satHits ?? 0,

    gateOk: gate?.ok ?? true,
    gateErrors: gate?.errorCount ?? 0,
    gateWarnings: gate?.warnCount ?? 0,

    activeAlerts: alerts.length,
    latestAlertMessage: alert?.message ?? null,
  };
}
