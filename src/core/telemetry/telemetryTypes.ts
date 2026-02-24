/**
 * telemetryTypes.ts - Telemetry Event Types
 *
 * PURPOSE:
 * - Define structured telemetry events for debugging
 * - Support drag, collision, gate, and alert events
 * - Enable rich UI overlays without affecting deterministic output
 *
 * DESIGN:
 * - All events have common base (ts, level, kind)
 * - Specific event types add domain-specific fields
 * - Discriminated union for type-safe handling
 */

// ============================================
// BASE TYPES
// ============================================

export type TelemetryLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface TelemetryEventBase {
  /** Timestamp (performance.now() or Date.now()) */
  ts: number;

  /** Event severity level */
  level: TelemetryLevel;

  /** Event type discriminator */
  kind: string;
}

// ============================================
// DRAG EVENTS
// ============================================

export interface TelemetrySampleDrag extends TelemetryEventBase {
  kind: 'DRAG_TICK';

  /** Frame delta time (seconds) */
  dtSec: number;

  /** Estimated FPS */
  fps: number;

  /** Pointer world position (mm) */
  pointerWorld?: { x: number; y: number; z: number };

  /** Smoothed velocity (mm/s) */
  velocity?: { x: number; y: number; z: number };

  /** Speed magnitude (mm/s) */
  speed?: number;

  /** Raw velocity before smoothing */
  rawSpeed?: number;

  /** Fixed-step sub-steps emitted this frame */
  subSteps?: number;

  /** Fixed-step total steps since drag start */
  totalSteps?: number;

  /** Snap enabled */
  snapEnabled?: boolean;

  /** Snap engaged (within threshold) */
  engaged?: boolean;

  /** Current axis lock */
  axisLock?: 'NONE' | 'X' | 'Y' | 'Z';

  /** Number of snap candidates */
  candidateCount?: number;

  /** Active candidate index */
  activeIndex?: number;

  /** Active candidate type */
  activeType?: string;

  /** Predictive lookahead (ms) */
  lookaheadMs?: number;

  /** Predictive delta (mm) */
  predDelta?: { x: number; y: number; z: number };

  /** Was predictive delta clamped */
  predClamped?: boolean;

  /** Intent confidence (0-1) */
  intentConfidence?: number;

  /** Intent axis hint */
  intentAxis?: string;
}

// ============================================
// COLLISION EVENTS
// ============================================

export interface TelemetrySampleCollision extends TelemetryEventBase {
  kind: 'COLLISION_CHECK';

  /** Cabinet being moved */
  movedId: string;

  /** Number of near items from spatial query */
  nearItems: number;

  /** Total SAT pair checks attempted */
  satPairsTried: number;

  /** SAT hits (collisions found) */
  satHits: number;

  /** Time spent (ms) */
  ms: number;

  /** Collision phase */
  phase: 'PREVIEW' | 'GATE_BODY' | 'GATE_ENVELOPE';

  /** Hash cell size used */
  cellSize?: number;
}

// ============================================
// GATE EVENTS
// ============================================

export interface TelemetrySampleGate extends TelemetryEventBase {
  kind: 'GATE_RESULT';

  /** Cabinet checked */
  cabId: string;

  /** Gate passed */
  ok: boolean;

  /** Error count */
  errorCount: number;

  /** Warning count */
  warnCount: number;

  /** Time spent (ms) */
  ms: number;

  /** Error types */
  errorTypes?: string[];
}

// ============================================
// SNAP EVENTS
// ============================================

export interface TelemetrySampleSnap extends TelemetryEventBase {
  kind: 'SNAP_UPDATE';

  /** Session frame count */
  frameCount: number;

  /** Candidates generated */
  candidateCount: number;

  /** Engaged state */
  engaged: boolean;

  /** Axis lock */
  axisLock: 'NONE' | 'X' | 'Y' | 'Z';

  /** Sticky candidate ID */
  stickyCandidateId?: string;

  /** Engagement changed this frame */
  engagementChanged: boolean;

  /** Candidate changed this frame */
  candidateChanged: boolean;
}

// ============================================
// ALERT EVENTS
// ============================================

export interface TelemetryAlert extends TelemetryEventBase {
  kind: 'THRESHOLD_ALERT';

  /** Alert type */
  alertType: string;

  /** Measured value */
  value: number;

  /** Threshold that was exceeded */
  threshold: number;

  /** Human-readable message */
  message: string;

  /** Count of consecutive occurrences */
  consecutiveCount: number;
}

// ============================================
// PERFORMANCE EVENTS
// ============================================

export interface TelemetrySamplePerf extends TelemetryEventBase {
  kind: 'PERF_SAMPLE';

  /** Operation name */
  operation: string;

  /** Time spent (ms) */
  ms: number;

  /** Items processed */
  itemCount?: number;

  /** Memory usage (bytes) */
  memoryBytes?: number;
}

// ============================================
// ALERT ENGINE EVENTS (from alertTypes.ts)
// ============================================

/**
 * Alert event from AlertEngine
 * Full definition in alertTypes.ts, declared here for union type
 */
export interface TelemetryAlertEventPlaceholder extends TelemetryEventBase {
  kind: 'ALERT';
  code: string;
  title: string;
  detail: string;
  metrics: Record<string, number>;
  count: number;
  cooldownSec: number;
  suggestion?: string;
}

// ============================================
// SUGGESTION ENGINE EVENTS (from tuningSuggestionTypes.ts)
// ============================================

/**
 * Suggestion event from TuningSuggestionEngine
 * Full definition in tuningSuggestionTypes.ts, declared here for union type
 */
export interface TuningSuggestionEventPlaceholder extends TelemetryEventBase {
  kind: 'SUGGESTION';
  fromAlert: string;
  code: string;
  title: string;
  rationale: string;
  proposed: Record<string, unknown>;
  confidence: number;
  count: number;
  priority: number;
  expectedImpact?: string;
}

// ============================================
// SHADOW REPORT EVENTS (from shadowTelemetry.ts)
// ============================================

/**
 * Shadow simulation report event
 * Full definition in shadowTelemetry.ts, declared here for union type
 */
export interface TelemetryShadowReportPlaceholder extends TelemetryEventBase {
  kind: 'SHADOW_REPORT';
  report: {
    id: string;
    durationSec: number;
    verdict: 'IMPROVES' | 'MIXED' | 'WORSENS' | 'INCONCLUSIVE';
    delta: {
      collisionMsAvgPct: number;
      satPairsAvgPct: number;
      nearItemsAvgPct: number;
      candidateAvgPct: number;
      flipFlopPct: number;
    };
    notes: string[];
    ts: number;
  };
  verdict: 'IMPROVES' | 'MIXED' | 'WORSENS' | 'INCONCLUSIVE';
  collisionDeltaPct: number;
  candidateDeltaPct: number;
}

// ============================================
// TUNING AUDIT EVENTS (from auditTelemetry.ts)
// ============================================

/**
 * Tuning audit event placeholder
 * Full definition in auditTelemetry.ts, declared here for union type
 */
export interface TuningAuditEventPlaceholder extends TelemetryEventBase {
  kind: 'TUNING_AUDIT';
  action: 'APPLY' | 'ROLLBACK' | 'REJECT';
  sessionId: string | null;
  reportId: string | null;
  patch?: Record<string, { from: number; to: number }>;
  reasons?: string[];
  warnings?: string[];
  configSnapshot?: Record<string, number>;
  activeDurationMs?: number;
}

// ============================================
// UNION TYPE
// ============================================

export type TelemetryEvent =
  | TelemetrySampleDrag
  | TelemetrySampleCollision
  | TelemetrySampleGate
  | TelemetrySampleSnap
  | TelemetryAlert
  | TelemetrySamplePerf
  | TelemetryAlertEventPlaceholder
  | TuningSuggestionEventPlaceholder
  | TelemetryShadowReportPlaceholder
  | TuningAuditEventPlaceholder;

// ============================================
// TYPE GUARDS
// ============================================

export function isDragEvent(ev: TelemetryEvent): ev is TelemetrySampleDrag {
  return ev.kind === 'DRAG_TICK';
}

export function isCollisionEvent(ev: TelemetryEvent): ev is TelemetrySampleCollision {
  return ev.kind === 'COLLISION_CHECK';
}

export function isGateEvent(ev: TelemetryEvent): ev is TelemetrySampleGate {
  return ev.kind === 'GATE_RESULT';
}

export function isSnapEvent(ev: TelemetryEvent): ev is TelemetrySampleSnap {
  return ev.kind === 'SNAP_UPDATE';
}

export function isAlertEvent(ev: TelemetryEvent): ev is TelemetryAlert {
  return ev.kind === 'THRESHOLD_ALERT';
}

export function isPerfEvent(ev: TelemetryEvent): ev is TelemetrySamplePerf {
  return ev.kind === 'PERF_SAMPLE';
}

export function isAlertEngineEvent(ev: TelemetryEvent): ev is TelemetryAlertEventPlaceholder {
  return ev.kind === 'ALERT';
}

export function isSuggestionEvent(ev: TelemetryEvent): ev is TuningSuggestionEventPlaceholder {
  return ev.kind === 'SUGGESTION';
}

export function isShadowReportEvent(ev: TelemetryEvent): ev is TelemetryShadowReportPlaceholder {
  return ev.kind === 'SHADOW_REPORT';
}

export function isTuningAuditEvent(ev: TelemetryEvent): ev is TuningAuditEventPlaceholder {
  return ev.kind === 'TUNING_AUDIT';
}
