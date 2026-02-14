/**
 * Simulation Kernel (Dry-Run Verifier)
 *
 * Step 10.7.3: Factory-safety baseline verification for MotionPlanV1.
 *
 * This module provides:
 * - Kinematic simulation (move sequence validation)
 * - Safety checks (bounds, depth, Z rules, spindle state)
 * - Arc geometry validation (radius, Z-constant, sweep)
 * - Feed rate validation
 * - Statistics collection (cut length, time estimate)
 * - SimReport generation for Gate integration
 *
 * Key concepts:
 * - SimContext: Sheet bounds, Z rules, limits
 * - SimState: Current position, tool, spindle tracking
 * - SimIssue: Detected problem with severity
 * - SimReport: Complete verification result
 *
 * This is a "fast deterministic verifier" not a 3D physics sim.
 * Full collision detection extends in 10.8.x.
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type {
  XYZ,
  Motion,
  MotionBlock,
  MotionPlanV1,
} from './offsetKernel/zAwarePlanning.js';

// ============================================================================
// Types: Simulation Context
// ============================================================================

/**
 * Sheet definition for bounds checking.
 */
export interface SimSheet {
  /** Sheet width (mm) */
  w: number;
  /** Sheet height (mm) */
  h: number;
  /** Origin offset */
  origin: { x: number; y: number };
}

/**
 * Z-axis rules for simulation.
 */
export interface SimZRules {
  /** Safe clearance Z (mm) */
  safeZ: number;
  /** Rapid travel Z (mm) */
  rapidZ: number;
  /** Pierce height Z (mm) */
  pierceZ: number;
  /** Maximum cut depth (mm, positive value) */
  maxDepth: number;
}

/**
 * Tool information for simulation.
 */
export interface SimToolInfo {
  /** Tool radius map (toolId → radius in mm) */
  toolRMap: Record<string, number>;
}

/**
 * Simulation limits.
 */
export interface SimLimits {
  /** Maximum feed rate (mm/min) */
  maxFeed: number;
  /** Minimum feed rate (mm/min) */
  minFeed: number;
  /** Maximum allowed rapid Z drop (mm) */
  maxRapidZDrop: number;
  /** Tolerance epsilon (mm) */
  eps: number;
  /** Minimum segment length before warning (mm) */
  minSegmentLen: number;
}

/**
 * Complete simulation context.
 */
export interface SimContext {
  /** Sheet definition */
  sheet: SimSheet;
  /** Z-axis rules */
  z: SimZRules;
  /** Tool information */
  tool: SimToolInfo;
  /** Simulation limits */
  limits: SimLimits;
}

// ============================================================================
// Types: Simulation Results
// ============================================================================

/**
 * Issue severity level.
 */
export type SimSeverity = 'INFO' | 'WARN' | 'BLOCK';

/**
 * Detected issue during simulation.
 */
export interface SimIssue {
  /** Issue code */
  code: string;
  /** Severity level */
  severity: SimSeverity;
  /** Block ID where issue occurred */
  blockId?: string;
  /** Step ID (if available) */
  stepId?: string;
  /** Tool ID */
  toolId?: string;
  /** Motion index in sequence */
  atLine?: number;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
}

/**
 * Simulation statistics.
 */
export interface SimStats {
  /** Number of tool changes */
  toolChanges: number;
  /** Number of rapid moves */
  rapids: number;
  /** Number of feed moves */
  feeds: number;
  /** Number of arc moves */
  arcs: number;
  /** Number of dwell commands */
  dwells: number;
  /** Total cutting length (mm) */
  totalCutLengthMM: number;
  /** Total rapid length (mm) */
  totalRapidLengthMM: number;
  /** Minimum Z reached (mm) */
  minZ: number;
  /** Maximum Z reached (mm) */
  maxZ: number;
  /** Estimated cut time (minutes) */
  cutTimeMinEst: number;
  /** Number of Z oscillations (retract cycles) */
  zOscillations: number;
}

/**
 * Complete simulation report.
 */
export interface SimReport {
  /** Overall result */
  kind: 'OK' | 'BLOCK';
  /** All detected issues */
  issues: SimIssue[];
  /** Simulation statistics */
  stats: SimStats;
  /** Stable fingerprint */
  fingerprint: string;
}

/**
 * Gate artifact for trust chain.
 */
export interface GateSimArtifact {
  /** Simulation fingerprint */
  simFingerprint: string;
  /** Overall result */
  kind: 'OK' | 'BLOCK';
  /** Issue counts by severity */
  issueCounts: { INFO: number; WARN: number; BLOCK: number };
  /** Statistics */
  stats: SimStats;
  /** Top issues (limited to 50) */
  issuesTop: SimIssue[];
}

// ============================================================================
// Types: Internal State
// ============================================================================

/**
 * Internal simulation state.
 */
interface SimState {
  /** Current position */
  cur: XYZ;
  /** Current tool ID */
  toolId: string | null;
  /** Spindle state */
  spindleOn: boolean;
  /** Current block ID */
  blockId: string | null;
  /** Current step ID */
  stepId: string | null;
  /** Previous Z (for oscillation tracking) */
  prevZ: number;
  /** Z direction history for oscillation detection */
  zHistory: number[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default simulation limits.
 */
export const DEFAULT_SIM_LIMITS: SimLimits = {
  maxFeed: 20000,
  minFeed: 1,
  maxRapidZDrop: 100,
  eps: 0.001,
  minSegmentLen: 0.1,
};

/**
 * Default Z rules.
 */
export const DEFAULT_Z_RULES: SimZRules = {
  safeZ: 15,
  rapidZ: 5,
  pierceZ: 1,
  maxDepth: 60,
};

/**
 * Issue codes.
 */
export const SIM_ISSUE_CODES = {
  // BLOCK severity
  RAPID_TOO_LOW: 'RAPID_TOO_LOW',
  RAPID_OUT_OF_BOUNDS: 'RAPID_OUT_OF_BOUNDS',
  FEED_INVALID: 'FEED_INVALID',
  FEED_OUT_OF_BOUNDS: 'FEED_OUT_OF_BOUNDS',
  CUT_WITH_SPINDLE_OFF: 'CUT_WITH_SPINDLE_OFF',
  DEPTH_EXCEEDS_LIMIT: 'DEPTH_EXCEEDS_LIMIT',
  ARC_INVALID: 'ARC_INVALID',
  ARC_OUT_OF_BOUNDS: 'ARC_OUT_OF_BOUNDS',
  ARC_WITH_SPINDLE_OFF: 'ARC_WITH_SPINDLE_OFF',
  MOTION_UNKNOWN: 'MOTION_UNKNOWN',

  // WARN severity
  SEGMENT_TOO_SHORT: 'SEGMENT_TOO_SHORT',
  EXCESSIVE_Z_OSCILLATION: 'EXCESSIVE_Z_OSCILLATION',
  AIR_CUT_DETECTED: 'AIR_CUT_DETECTED',
  NO_CUTTING_DETECTED: 'NO_CUTTING_DETECTED',
  ARC_VERY_SMALL: 'ARC_VERY_SMALL',

  // INFO severity
  TOOL_CHANGE: 'TOOL_CHANGE',
  SPINDLE_STATE_CHANGE: 'SPINDLE_STATE_CHANGE',
} as const;

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Check if number is finite.
 */
function isFiniteNum(x: number): boolean {
  return Number.isFinite(x);
}

/**
 * Squared distance between 2D points.
 */
function dist2Sq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Distance between 2D points.
 */
function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(dist2Sq(a, b));
}

/**
 * 3D segment length.
 */
function segLen3(a: XYZ, b: XYZ): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Calculate angle in radians.
 */
function angleRad(c: { x: number; y: number }, p: { x: number; y: number }): number {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

/**
 * Normalize angle to [0, 2π).
 */
function normAng(a: number): number {
  const TAU = Math.PI * 2;
  while (a < 0) a += TAU;
  while (a >= TAU) a -= TAU;
  return a;
}

/**
 * Calculate arc sweep in radians.
 */
function sweepRad(cw: boolean, a0: number, a1: number): number {
  a0 = normAng(a0);
  a1 = normAng(a1);

  if (!cw) {
    // CCW
    let d = a1 - a0;
    if (d <= 0) d += Math.PI * 2;
    return d;
  } else {
    // CW
    let d = a0 - a1;
    if (d <= 0) d += Math.PI * 2;
    return d;
  }
}

/**
 * Calculate 2D arc length.
 */
function arcLen2D(
  from: XYZ,
  to: XYZ,
  c: { x: number; y: number },
  cw: boolean,
  r: number
): number {
  const a0 = angleRad(c, { x: from.x, y: from.y });
  const a1 = angleRad(c, { x: to.x, y: to.y });
  const sw = sweepRad(cw, a0, a1);
  return r * sw;
}

/**
 * Estimate time in minutes for a given length and feed.
 */
function timeMin(lengthMM: number, feedMMmin: number): number {
  if (feedMMmin <= 1e-9) return 0;
  return lengthMM / feedMMmin;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * Validate arc geometry.
 */
function arcValidate(
  from: XYZ,
  to: XYZ,
  c: { x: number; y: number },
  eps: number
): { ok: boolean; detail?: string; r?: number } {
  // Check center is finite
  if (!isFiniteNum(c.x) || !isFiniteNum(c.y)) {
    return { ok: false, detail: 'ARC center not finite' };
  }

  // Check Z is constant (router safety)
  if (Math.abs(from.z - to.z) > eps) {
    return {
      ok: false,
      detail: `ARC Z not constant (${from.z.toFixed(3)} -> ${to.z.toFixed(3)})`,
    };
  }

  // Calculate radii from center
  const r0 = Math.sqrt(dist2Sq({ x: from.x, y: from.y }, c));
  const r1 = Math.sqrt(dist2Sq({ x: to.x, y: to.y }, c));

  // Check radii are finite
  if (!isFiniteNum(r0) || !isFiniteNum(r1)) {
    return { ok: false, detail: 'ARC radius not finite' };
  }

  // Check radii match (within tolerance)
  const tolerance = Math.max(eps, r0 * 1e-4);
  if (Math.abs(r0 - r1) > tolerance) {
    return {
      ok: false,
      detail: `ARC radius mismatch r0=${r0.toFixed(4)} r1=${r1.toFixed(4)}`,
    };
  }

  // Check radius is not too small
  if (r0 < eps) {
    return { ok: false, detail: 'ARC radius too small' };
  }

  return { ok: true, r: (r0 + r1) / 2 };
}

/**
 * Check if point is within sheet bounds.
 */
function inBoundsXY(p: XYZ, ctx: SimContext, margin: number): boolean {
  const ox = ctx.sheet.origin.x;
  const oy = ctx.sheet.origin.y;

  return (
    p.x >= ox - margin &&
    p.y >= oy - margin &&
    p.x <= ox + ctx.sheet.w + margin &&
    p.y <= oy + ctx.sheet.h + margin
  );
}

/**
 * Check if depth is within limit.
 */
function depthOk(z: number, ctx: SimContext): boolean {
  return z >= -Math.abs(ctx.z.maxDepth) - ctx.limits.eps;
}

// ============================================================================
// Main Simulator
// ============================================================================

/**
 * Simulate a MotionPlanV1 and generate report.
 *
 * Checks:
 * - RAPID moves stay above rapidZ
 * - All moves within sheet bounds
 * - Depth within maxDepth limit
 * - Spindle on before cutting
 * - Arc geometry valid
 * - Feed rates within limits
 *
 * @param plan - Motion plan to simulate
 * @param ctx - Simulation context
 * @returns Simulation report
 */
export function simulateMotionPlan(
  plan: MotionPlanV1,
  ctx: SimContext
): SimReport {
  const issues: SimIssue[] = [];

  const stats: SimStats = {
    toolChanges: 0,
    rapids: 0,
    feeds: 0,
    arcs: 0,
    dwells: 0,
    totalCutLengthMM: 0,
    totalRapidLengthMM: 0,
    minZ: +Infinity,
    maxZ: -Infinity,
    cutTimeMinEst: 0,
    zOscillations: 0,
  };

  const state: SimState = {
    cur: {
      x: ctx.sheet.origin.x,
      y: ctx.sheet.origin.y,
      z: ctx.z.safeZ,
    },
    toolId: null,
    spindleOn: false,
    blockId: null,
    stepId: null,
    prevZ: ctx.z.safeZ,
    zHistory: [],
  };

  const eps = ctx.limits.eps;

  /**
   * Push issue to list with fingerprint.
   */
  function pushIssue(issue: Omit<SimIssue, 'fingerprint'>): void {
    const fp = `${issue.code}|${issue.severity}|${issue.blockId ?? ''}|${issue.atLine ?? -1}|${issue.detail.slice(0, 50)}`;
    issues.push({ ...issue, fingerprint: fp });
  }

  /**
   * Update Z statistics.
   */
  function updateZ(z: number): void {
    stats.minZ = Math.min(stats.minZ, z);
    stats.maxZ = Math.max(stats.maxZ, z);

    // Track Z oscillations
    if (state.zHistory.length > 0) {
      const lastZ = state.zHistory[state.zHistory.length - 1];
      const direction = z > lastZ ? 1 : z < lastZ ? -1 : 0;

      if (state.zHistory.length >= 2 && direction !== 0) {
        const prevDirection =
          state.zHistory[state.zHistory.length - 1] >
          state.zHistory[state.zHistory.length - 2]
            ? 1
            : -1;

        if (direction !== prevDirection) {
          stats.zOscillations++;
        }
      }
    }

    state.zHistory.push(z);
    if (state.zHistory.length > 100) {
      state.zHistory.shift();
    }
  }

  let line = 0;

  // Process each block
  for (const block of plan.blocks) {
    state.blockId = block.id;
    state.toolId = block.toolId;

    const toolR = ctx.tool.toolRMap[block.toolId] ?? 0;
    const margin = Math.max(toolR, 1.0);

    // Process each motion
    for (const m of block.ops) {
      line++;

      // Skip comments
      if (m.kind === 'COMMENT') {
        // Extract step ID from comment if present
        const match = m.text.match(/SUBPATH|BLOCK|STEP|stepId=(\S+)/i);
        if (match && match[1]) {
          state.stepId = match[1];
        }
        continue;
      }

      // Tool change
      if (m.kind === 'TOOL_CHANGE') {
        stats.toolChanges++;
        state.toolId = m.toolId;
        state.spindleOn = false;
        continue;
      }

      // Spindle control
      if (m.kind === 'SPINDLE') {
        state.spindleOn = m.on;
        continue;
      }

      // Dwell
      if (m.kind === 'DWELL') {
        stats.dwells++;
        continue;
      }

      // Rapid move
      if (m.kind === 'RAPID') {
        stats.rapids++;

        // Check RAPID doesn't go too low
        if (m.to.z < ctx.z.rapidZ - eps) {
          pushIssue({
            code: SIM_ISSUE_CODES.RAPID_TOO_LOW,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Rapid to z=${m.to.z.toFixed(3)} below rapidZ=${ctx.z.rapidZ}`,
          });
        }

        // Check bounds
        if (!inBoundsXY(m.to, ctx, margin)) {
          pushIssue({
            code: SIM_ISSUE_CODES.RAPID_OUT_OF_BOUNDS,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Rapid XY out of bounds: x=${m.to.x.toFixed(3)} y=${m.to.y.toFixed(3)}`,
          });
        }

        // Update lengths
        const L = segLen3(state.cur, m.to);
        stats.totalRapidLengthMM += L;

        state.cur = m.to;
        updateZ(state.cur.z);
        continue;
      }

      // Feed move
      if (m.kind === 'FEED') {
        stats.feeds++;

        // Validate feed rate
        if (
          !isFiniteNum(m.feedMMmin) ||
          m.feedMMmin < ctx.limits.minFeed ||
          m.feedMMmin > ctx.limits.maxFeed
        ) {
          pushIssue({
            code: SIM_ISSUE_CODES.FEED_INVALID,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Feed=${m.feedMMmin} out of range [${ctx.limits.minFeed}, ${ctx.limits.maxFeed}]`,
          });
        }

        // Check spindle is on when cutting
        if (!state.spindleOn && m.to.z < ctx.z.pierceZ - eps) {
          pushIssue({
            code: SIM_ISSUE_CODES.CUT_WITH_SPINDLE_OFF,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: 'FEED into material with spindle off',
          });
        }

        // Check depth limit
        if (!depthOk(m.to.z, ctx)) {
          pushIssue({
            code: SIM_ISSUE_CODES.DEPTH_EXCEEDS_LIMIT,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `z=${m.to.z.toFixed(3)} below -maxDepth=-${ctx.z.maxDepth}`,
          });
        }

        // Check bounds
        if (!inBoundsXY(m.to, ctx, margin)) {
          pushIssue({
            code: SIM_ISSUE_CODES.FEED_OUT_OF_BOUNDS,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Feed XY out of bounds x=${m.to.x.toFixed(3)} y=${m.to.y.toFixed(3)}`,
          });
        }

        // Calculate length and time
        const L = segLen3(state.cur, m.to);

        // Check for very short segments
        if (L < ctx.limits.minSegmentLen && m.to.z < ctx.z.pierceZ - eps) {
          pushIssue({
            code: SIM_ISSUE_CODES.SEGMENT_TOO_SHORT,
            severity: 'WARN',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Segment length ${L.toFixed(4)}mm below minimum ${ctx.limits.minSegmentLen}mm`,
          });
        }

        // Track cut length (if below pierce Z)
        if (Math.min(state.cur.z, m.to.z) < ctx.z.pierceZ - eps) {
          stats.totalCutLengthMM += L;
        }

        stats.cutTimeMinEst += timeMin(L, m.feedMMmin);

        state.cur = m.to;
        updateZ(state.cur.z);
        continue;
      }

      // Arc move
      if (m.kind === 'ARC') {
        stats.arcs++;

        // Check spindle is on when cutting
        if (!state.spindleOn && m.to.z < ctx.z.pierceZ - eps) {
          pushIssue({
            code: SIM_ISSUE_CODES.ARC_WITH_SPINDLE_OFF,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: 'ARC into material with spindle off',
          });
        }

        // Check depth limit
        if (!depthOk(m.to.z, ctx)) {
          pushIssue({
            code: SIM_ISSUE_CODES.DEPTH_EXCEEDS_LIMIT,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `ARC z=${m.to.z.toFixed(3)} below -maxDepth=-${ctx.z.maxDepth}`,
          });
        }

        // Check bounds
        if (!inBoundsXY(m.to, ctx, margin)) {
          pushIssue({
            code: SIM_ISSUE_CODES.ARC_OUT_OF_BOUNDS,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: `Arc end XY out of bounds x=${m.to.x.toFixed(3)} y=${m.to.y.toFixed(3)}`,
          });
        }

        // Validate arc geometry
        const v = arcValidate(state.cur, m.to, m.centerXY, eps);

        if (!v.ok) {
          pushIssue({
            code: SIM_ISSUE_CODES.ARC_INVALID,
            severity: 'BLOCK',
            blockId: block.id,
            toolId: block.toolId,
            atLine: line,
            detail: v.detail ?? 'Arc geometry invalid',
          });
        } else {
          // Check for very small arcs
          if (v.r! < 0.5) {
            pushIssue({
              code: SIM_ISSUE_CODES.ARC_VERY_SMALL,
              severity: 'WARN',
              blockId: block.id,
              toolId: block.toolId,
              atLine: line,
              detail: `Arc radius ${v.r!.toFixed(4)}mm very small`,
            });
          }

          // Calculate arc length
          const L = arcLen2D(state.cur, m.to, m.centerXY, m.cw, v.r!);

          // Track cut length
          if (state.cur.z < ctx.z.pierceZ - eps) {
            stats.totalCutLengthMM += L;
          }

          stats.cutTimeMinEst += timeMin(L, m.feedMMmin);
        }

        state.cur = m.to;
        updateZ(state.cur.z);
        continue;
      }

      // Unknown motion type
      pushIssue({
        code: SIM_ISSUE_CODES.MOTION_UNKNOWN,
        severity: 'BLOCK',
        blockId: block.id,
        toolId: block.toolId,
        atLine: line,
        detail: 'Unknown motion kind',
      });
    }
  }

  // Post-simulation checks

  // Fix stats if no Z was tracked
  if (!isFiniteNum(stats.minZ)) {
    stats.minZ = ctx.z.safeZ;
    stats.maxZ = ctx.z.safeZ;
  }

  // Check for excessive Z oscillation
  if (stats.zOscillations > 50 && stats.totalCutLengthMM > 0) {
    const oscillationsPerMm = stats.zOscillations / stats.totalCutLengthMM;
    if (oscillationsPerMm > 0.1) {
      pushIssue({
        code: SIM_ISSUE_CODES.EXCESSIVE_Z_OSCILLATION,
        severity: 'WARN',
        detail: `Excessive Z oscillations: ${stats.zOscillations} in ${stats.totalCutLengthMM.toFixed(1)}mm cut`,
      });
    }
  }

  // Check for no cutting
  if (stats.totalCutLengthMM < 1 && stats.feeds + stats.arcs > 10) {
    pushIssue({
      code: SIM_ISSUE_CODES.NO_CUTTING_DETECTED,
      severity: 'WARN',
      detail: `${stats.feeds + stats.arcs} feed/arc moves but only ${stats.totalCutLengthMM.toFixed(2)}mm cut length`,
    });
  }

  // Determine overall result
  const hasBlock = issues.some((i) => i.severity === 'BLOCK');
  const kind: SimReport['kind'] = hasBlock ? 'BLOCK' : 'OK';

  // Build fingerprint
  const fingerprint = `10.7.3:${kind}:${issues.length}:${Math.round(stats.totalCutLengthMM)}:${Math.round(stats.totalRapidLengthMM)}`;

  return {
    kind,
    issues,
    stats,
    fingerprint,
  };
}

// ============================================================================
// Issue Sorting (Deterministic)
// ============================================================================

/**
 * Get severity rank for sorting.
 */
function severityRank(s: SimSeverity): number {
  switch (s) {
    case 'BLOCK':
      return 2;
    case 'WARN':
      return 1;
    case 'INFO':
      return 0;
  }
}

/**
 * Normalize and sort issues deterministically.
 *
 * Sort order: severity (desc), code (asc), line (asc)
 */
export function normalizeIssues(issues: SimIssue[]): SimIssue[] {
  return issues.slice().sort((a, b) => {
    // Sort by severity (highest first)
    const ra = severityRank(a.severity);
    const rb = severityRank(b.severity);
    if (rb !== ra) return rb - ra;

    // Sort by code
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;

    // Sort by line number
    return (a.atLine ?? 0) - (b.atLine ?? 0);
  });
}

// ============================================================================
// Gate Integration
// ============================================================================

/**
 * Create Gate artifact from simulation report.
 */
export function createGateSimArtifact(report: SimReport): GateSimArtifact {
  const issueCounts = {
    INFO: 0,
    WARN: 0,
    BLOCK: 0,
  };

  for (const issue of report.issues) {
    issueCounts[issue.severity]++;
  }

  // Get top 50 issues (normalized order)
  const issuesTop = normalizeIssues(report.issues).slice(0, 50);

  return {
    simFingerprint: report.fingerprint,
    kind: report.kind,
    issueCounts,
    stats: report.stats,
    issuesTop,
  };
}

/**
 * Check if simulation passed for Gate.
 */
export function isSimulationPassed(report: SimReport): boolean {
  return report.kind === 'OK';
}

/**
 * Get blocking issues from report.
 */
export function getBlockingIssues(report: SimReport): SimIssue[] {
  return report.issues.filter((i) => i.severity === 'BLOCK');
}

/**
 * Get warning issues from report.
 */
export function getWarningIssues(report: SimReport): SimIssue[] {
  return report.issues.filter((i) => i.severity === 'WARN');
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create default simulation context.
 */
export function createSimContext(
  sheetW: number,
  sheetH: number,
  overrides: Partial<SimContext> = {}
): SimContext {
  return {
    sheet: {
      w: sheetW,
      h: sheetH,
      origin: overrides.sheet?.origin ?? { x: 0, y: 0 },
    },
    z: {
      ...DEFAULT_Z_RULES,
      ...overrides.z,
    },
    tool: {
      toolRMap: overrides.tool?.toolRMap ?? {},
    },
    limits: {
      ...DEFAULT_SIM_LIMITS,
      ...overrides.limits,
    },
  };
}

/**
 * Create simulation context from machine profile.
 */
export function createSimContextFromProfile(
  sheetW: number,
  sheetH: number,
  zRules: SimZRules,
  toolRMap: Record<string, number>
): SimContext {
  return {
    sheet: { w: sheetW, h: sheetH, origin: { x: 0, y: 0 } },
    z: zRules,
    tool: { toolRMap },
    limits: DEFAULT_SIM_LIMITS,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Summarize simulation report for logging.
 */
export function summarizeSimReport(report: SimReport): string {
  const { stats, issues } = report;
  const blockCount = issues.filter((i) => i.severity === 'BLOCK').length;
  const warnCount = issues.filter((i) => i.severity === 'WARN').length;

  return (
    `Sim ${report.kind}: ` +
    `cut=${stats.totalCutLengthMM.toFixed(1)}mm ` +
    `rapid=${stats.totalRapidLengthMM.toFixed(1)}mm ` +
    `time=${stats.cutTimeMinEst.toFixed(2)}min ` +
    `moves=${stats.rapids}R/${stats.feeds}F/${stats.arcs}A ` +
    `issues=${blockCount}B/${warnCount}W`
  );
}

/**
 * Format simulation time estimate.
 */
export function formatSimTime(report: SimReport): string {
  const minutes = report.stats.cutTimeMinEst;
  if (minutes < 1) {
    return `${(minutes * 60).toFixed(0)}s`;
  }
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toFixed(0)}m`;
}

/**
 * Get issue summary by code.
 */
export function getIssueSummaryByCode(
  report: SimReport
): Record<string, number> {
  const summary: Record<string, number> = {};

  for (const issue of report.issues) {
    summary[issue.code] = (summary[issue.code] ?? 0) + 1;
  }

  return summary;
}

/**
 * Check if report has any depth violations.
 */
export function hasDepthViolations(report: SimReport): boolean {
  return report.issues.some((i) => i.code === SIM_ISSUE_CODES.DEPTH_EXCEEDS_LIMIT);
}

/**
 * Check if report has any bounds violations.
 */
export function hasBoundsViolations(report: SimReport): boolean {
  return report.issues.some(
    (i) =>
      i.code === SIM_ISSUE_CODES.RAPID_OUT_OF_BOUNDS ||
      i.code === SIM_ISSUE_CODES.FEED_OUT_OF_BOUNDS ||
      i.code === SIM_ISSUE_CODES.ARC_OUT_OF_BOUNDS
  );
}

/**
 * Check if report has any arc geometry issues.
 */
export function hasArcIssues(report: SimReport): boolean {
  return report.issues.some(
    (i) =>
      i.code === SIM_ISSUE_CODES.ARC_INVALID ||
      i.code === SIM_ISSUE_CODES.ARC_VERY_SMALL
  );
}
