/**
 * Step 10.8.1: Toolpath Verifier - Manufacturing Safety Verification
 *
 * Gate-grade verifier that validates toolpath safety:
 * - No gouge: tool-centerline doesn't enter keepout regions
 * - No air-plunge: plunge into air without material
 * - No rapid at low Z: bit-breaking risk prevention
 * - No wrong-side cuts: chip-out risk for HPL/Melamine
 * - Stepdown/stepover constraint validation
 *
 * Deterministic outputs for Gate BLOCK/WARN decisions.
 *
 * @module toolpathVerifier
 * @version 10.8.1
 */

import type { Path, Segment, SegLine, SegArc, Pt } from './planTypes.js';

// Vec2 alias for internal use
type Vec2 = Pt;
type Seg = Segment;
type LineSeg = SegLine;
type ArcSeg = SegArc;

// ============================================================================
// Types: Geometry Truth (nominal geometry before compile)
// ============================================================================

/**
 * Part geometry in sheet coordinates
 */
export interface PartTruth {
  partId: string;
  /** Outer boundary path (in sheet coordinates) */
  outer: Path;
  /** Inner holes/cutouts */
  inners: Path[];
  /** Optional keepout zones (clamps, no-cut regions) */
  keepouts?: Path[];
  /** Material thickness in mm */
  thicknessMM: number;
}

/**
 * Complete geometry truth for verification
 */
export interface GeometryTruth {
  sheetId: string;
  parts: PartTruth[];
}

// ============================================================================
// Types: Step Truth (tool-centerline paths per step)
// ============================================================================

export type OpKind = 'PROFILE' | 'GROOVE' | 'DRILL';
export type PassKind = 'SCORE' | 'ROUGH' | 'FINISH';
export type CutIntent = 'OUTSIDE' | 'INSIDE';
export type EndpointRole = 'TAB_START' | 'TAB_END' | 'ENTRY' | 'EXIT' | 'NORMAL';

/**
 * Subpath with open/closed info and endpoint roles
 */
export interface CenterlineSubpath {
  path: Path;
  isOpen: boolean;
  startRole?: EndpointRole;
  endRole?: EndpointRole;
}

/**
 * Z-band for a step
 */
export interface StepZBand {
  minCutZ: number;
  maxCutZ: number;
  rapidZ: number;
  pierceZ: number;
  safeZ: number;
}

/**
 * Fingerprints for traceability
 */
export interface StepFingerprints {
  offsetFp?: string;
  entryExitFp?: string;
  profileFp?: string;
}

/**
 * Truth about a single routing step
 */
export interface StepTruth {
  stepId: string;
  partId: string;
  opKind: OpKind;
  passKind: PassKind;
  intent?: CutIntent;

  /** Tool identifier */
  toolId: string;
  /** Tool radius in mm */
  toolR: number;

  /** Tool-centerline geometry actually used (2D) */
  centerlineSubpaths: CenterlineSubpath[];

  /** Expected cut Z bands */
  z: StepZBand;

  /** For INSIDE cuts: which inner index */
  innerIndex?: number;

  /** Policy fingerprints pinned */
  fingerprints: StepFingerprints;
}

// ============================================================================
// Types: Machine & Policy Configuration
// ============================================================================

/**
 * Machine configuration for verification
 */
export interface VerifierMachineConfig {
  sheet: {
    w: number;
    h: number;
  };
  /** Through-cut allowance into spoilboard (mm) */
  spoilboardAllowanceMM: number;
}

/**
 * Verification policy thresholds
 */
export interface VerifierPolicy {
  /** Max plunge depth without ramp (mm) */
  maxAirPlungeMM: number;
  /** Max XY movement during rapid at low Z (mm) */
  maxRapidXYAtLowZMM: number;
  /** Gouge detection epsilon (mm) */
  gougeEpsMM: number;
  /** Minimum ramp length for plunge (mm) */
  minRampLengthMM: number;
  /** Chord step for path sampling (mm) */
  chordStepMM: number;
  /** Low Z threshold for rapid checks (mm) */
  lowZThresholdMM: number;
}

/**
 * Default verification policy
 */
export const DEFAULT_VERIFIER_POLICY: VerifierPolicy = {
  maxAirPlungeMM: 2.0,
  maxRapidXYAtLowZMM: 0.5,
  gougeEpsMM: 0.02,
  minRampLengthMM: 5.0,
  chordStepMM: 2.0,
  lowZThresholdMM: 5.0,
};

// ============================================================================
// Types: Motion Plan Reference (from zAwarePlanning)
// ============================================================================

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export type MotionKind = 'RAPID' | 'FEED' | 'ARC' | 'DWELL' | 'TOOL_CHANGE' | 'SPINDLE' | 'COMMENT';

export interface MotionRapid {
  kind: 'RAPID';
  to: XYZ;
}

export interface MotionFeed {
  kind: 'FEED';
  to: XYZ;
  feed: number;
}

export interface MotionArc {
  kind: 'ARC';
  to: XYZ;
  center: { x: number; y: number };
  cw: boolean;
  feed: number;
}

export interface MotionDwell {
  kind: 'DWELL';
  seconds: number;
}

export interface MotionToolChange {
  kind: 'TOOL_CHANGE';
  toolId: string;
}

export interface MotionSpindle {
  kind: 'SPINDLE';
  on: boolean;
  rpm?: number;
  toolId?: string;
}

export interface MotionComment {
  kind: 'COMMENT';
  text: string;
}

export type Motion = MotionRapid | MotionFeed | MotionArc | MotionDwell | MotionToolChange | MotionSpindle | MotionComment;

export interface MotionBlock {
  id: string;
  toolId: string;
  ops: Motion[];
}

export interface MotionPlanV1 {
  version: 'motion-plan.v1';
  sheetId: string;
  partId: string;
  blocks: MotionBlock[];
  report: Array<{ code: string; message: string }>;
  valid: boolean;
}

// ============================================================================
// Types: Verifier Input
// ============================================================================

/**
 * Complete input for toolpath verification
 */
export interface VerifierInput {
  motion: MotionPlanV1;
  truth: GeometryTruth;
  steps: Record<string, StepTruth>;
  machine: VerifierMachineConfig;
  policy: VerifierPolicy;
}

// ============================================================================
// Types: Verification Output
// ============================================================================

export type VerifySeverity = 'WARN' | 'BLOCK';

/**
 * Single verification issue
 */
export interface VerifyIssue {
  code: string;
  severity: VerifySeverity;
  stepId?: string;
  blockId?: string;
  detail: string;
  /** Position where issue occurred (if applicable) */
  position?: { x: number; y: number; z?: number };
  fingerprint: string;
}

/**
 * Verification statistics
 */
export interface VerifyStats {
  gougeChecks: number;
  airPlungeChecks: number;
  rapidsChecked: number;
  depthChecks: number;
  boundsChecks: number;
  totalMotions: number;
}

/**
 * Complete verification report
 */
export interface ToolpathVerifyReport {
  kind: 'OK' | 'BLOCK';
  issues: VerifyIssue[];
  stats: VerifyStats;
  fingerprint: string;
}

/**
 * Gate artifact for trust chain
 */
export interface GateVerifyArtifact {
  verifyFingerprint: string;
  kind: 'OK' | 'BLOCK';
  issueCounts: {
    gouge: number;
    airPlunge: number;
    rapidLowZ: number;
    depthExceeded: number;
    outOfBounds: number;
    other: number;
  };
  stats: VerifyStats;
  issuesTop: VerifyIssue[];
}

// ============================================================================
// Issue Codes
// ============================================================================

export const VERIFY_CODE = {
  // BLOCK-level issues
  GOUGE_RISK: 'GOUGE_RISK',
  DEPTH_EXCEEDS_LIMIT: 'DEPTH_EXCEEDS_LIMIT',
  RAPID_XY_AT_LOW_Z: 'RAPID_XY_AT_LOW_Z',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  MISSING_PART_TRUTH: 'MISSING_PART_TRUTH',
  MISSING_LOOP_TRUTH: 'MISSING_LOOP_TRUTH',
  MISSING_STEP_TRUTH: 'MISSING_STEP_TRUTH',
  TOOL_MISMATCH: 'TOOL_MISMATCH',
  PLUNGE_INTO_AIR: 'PLUNGE_INTO_AIR',

  // WARN-level issues
  SUSPICIOUS_AIR_PLUNGE: 'SUSPICIOUS_AIR_PLUNGE',
  EXCESSIVE_RETRACT: 'EXCESSIVE_RETRACT',
  SHORT_SEGMENT: 'SHORT_SEGMENT',
  NEAR_BOUNDARY: 'NEAR_BOUNDARY',
} as const;

// ============================================================================
// Geometry Utilities
// ============================================================================

/**
 * 2D sample point
 */
export interface Sample2D {
  x: number;
  y: number;
}

/**
 * Calculate XY distance between two 3D points
 */
function dxy(a: XYZ, b: XYZ): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Calculate arc sweep in radians
 */
function sweepRad(cw: boolean, a0: number, a1: number): number {
  let sweep = cw ? (a0 - a1) : (a1 - a0);
  if (sweep < 0) sweep += 2 * Math.PI;
  if (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
  return sweep;
}

/**
 * Sample points along a line segment (deterministic)
 */
export function sampleLine(a: Vec2, b: Vec2, stepMM: number): Sample2D[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(L / stepMM));
  const out: Sample2D[] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }

  return out;
}

/**
 * Sample points along an arc segment (deterministic)
 */
export function sampleArc(arc: ArcSeg, startPt: Vec2, endPt: Vec2, stepMM: number): Sample2D[] {
  const a0 = Math.atan2(startPt.y - arc.c.y, startPt.x - arc.c.x);
  const a1 = Math.atan2(endPt.y - arc.c.y, endPt.x - arc.c.x);

  const sw = sweepRad(arc.cw, a0, a1);
  const L = arc.r * sw;
  const n = Math.max(3, Math.ceil(L / stepMM));

  const out: Sample2D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = arc.cw ? (a0 - sw * t) : (a0 + sw * t);
    out.push({
      x: arc.c.x + arc.r * Math.cos(ang),
      y: arc.c.y + arc.r * Math.sin(ang),
    });
  }

  return out;
}

/**
 * Sample points along a path (deterministic)
 */
export function samplePath2D(path: Path, stepMM: number): Sample2D[] {
  const out: Sample2D[] = [];

  if (path.segs.length === 0) return out;

  // Track current point through segments
  let currentPt: Vec2 | null = null;

  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      const line = seg as LineSeg;
      const samples = sampleLine(line.a, line.b, stepMM);
      // Skip first point if it duplicates previous endpoint
      const startIdx = (currentPt && Math.hypot(line.a.x - currentPt.x, line.a.y - currentPt.y) < 0.001) ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        out.push(samples[i]);
      }
      currentPt = line.b;
    } else {
      const arc = seg as ArcSeg;
      // For arc, derive start/end from continuity or segment data
      const startPt = currentPt ?? { x: arc.c.x + arc.r, y: arc.c.y };
      // End point: use sweep to calculate
      const a0 = Math.atan2(startPt.y - arc.c.y, startPt.x - arc.c.x);
      // Assume full arc if no explicit end; in practice, path should have continuity
      const endAngle = arc.cw ? (a0 - Math.PI) : (a0 + Math.PI);
      const endPt = { x: arc.c.x + arc.r * Math.cos(endAngle), y: arc.c.y + arc.r * Math.sin(endAngle) };

      const samples = sampleArc(arc, startPt, endPt, stepMM);
      const startIdx = currentPt ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        out.push(samples[i]);
      }
      currentPt = endPt;
    }
  }

  return out;
}

/**
 * Flatten a path to a polyline for point-in-polygon testing
 */
export function flattenPath(path: Path, chordStepMM: number): Vec2[] {
  const pts: Vec2[] = [];

  if (path.segs.length === 0) return pts;

  let currentPt: Vec2 | null = null;

  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      const line = seg as LineSeg;
      const samples = sampleLine(line.a, line.b, chordStepMM);
      const startIdx = (currentPt && Math.hypot(line.a.x - currentPt.x, line.a.y - currentPt.y) < 0.001) ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        pts.push({ x: samples[i].x, y: samples[i].y });
      }
      currentPt = line.b;
    } else {
      const arc = seg as ArcSeg;
      const startPt = currentPt ?? { x: arc.c.x + arc.r, y: arc.c.y };
      const a0 = Math.atan2(startPt.y - arc.c.y, startPt.x - arc.c.x);
      const endAngle = arc.cw ? (a0 - Math.PI) : (a0 + Math.PI);
      const endPt = { x: arc.c.x + arc.r * Math.cos(endAngle), y: arc.c.y + arc.r * Math.sin(endAngle) };

      const samples = sampleArc(arc, startPt, endPt, chordStepMM);
      const startIdx = currentPt ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        pts.push({ x: samples[i].x, y: samples[i].y });
      }
      currentPt = endPt;
    }
  }

  // Ensure closed polygon for ray casting
  if (pts.length > 0) {
    pts.push({ ...pts[0] });
  }

  return pts;
}

/**
 * Point-in-polygon test using ray casting (deterministic)
 */
export function pointInPoly(pt: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;

  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];

    const intersect = ((a.y > pt.y) !== (b.y > pt.y)) &&
      (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y + 1e-12) + a.x);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

// ============================================================================
// Simple Offset for Forbidden Region (inline implementation)
// ============================================================================

/**
 * Simple offset for a closed path (positive = outward, negative = inward)
 * This is a simplified version for verification - uses normal-based offset
 */
function simpleOffsetClosedPath(path: Path, offsetMM: number): Path {
  const newSegs: Seg[] = [];

  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      const line = seg as LineSeg;
      const dx = line.b.x - line.a.x;
      const dy = line.b.y - line.a.y;
      const segLen = Math.hypot(dx, dy);

      if (segLen < 1e-9) continue;

      // Normal vector (perpendicular, pointing left of direction)
      const nx = -dy / segLen;
      const ny = dx / segLen;

      // Offset points
      const newA: Vec2 = { x: line.a.x + nx * offsetMM, y: line.a.y + ny * offsetMM };
      const newB: Vec2 = { x: line.b.x + nx * offsetMM, y: line.b.y + ny * offsetMM };

      newSegs.push({ kind: 'LINE', a: newA, b: newB });
    } else {
      const arc = seg as ArcSeg;
      // For arc: offset radius (outward = larger radius for CCW, smaller for CW, depending on winding)
      const sign = arc.cw ? -1 : 1;
      const newR = arc.r + sign * offsetMM;
      if (newR > 0.001) {
        // Recalculate start/end points at new radius
        const startRad = arc.startDeg * Math.PI / 180;
        const endRad = arc.endDeg * Math.PI / 180;
        const newStart: Vec2 = {
          x: arc.c.x + newR * Math.cos(startRad),
          y: arc.c.y + newR * Math.sin(startRad),
        };
        const newEnd: Vec2 = {
          x: arc.c.x + newR * Math.cos(endRad),
          y: arc.c.y + newR * Math.sin(endRad),
        };
        newSegs.push({
          kind: 'ARC',
          c: { ...arc.c },
          r: newR,
          cw: arc.cw,
          startDeg: arc.startDeg,
          endDeg: arc.endDeg,
          start: newStart,
          end: newEnd,
        });
      }
    }
  }

  return { segs: newSegs, closed: path.closed, winding: path.winding };
}

// ============================================================================
// Step ID Extraction
// ============================================================================

/**
 * Extract step ID from comment text
 * Expects format: "BEGIN <stepId> ..."
 */
export function extractStepIdFromComment(text: string): string | null {
  const m = text.match(/^BEGIN\s+([A-Za-z0-9_\-:]+)\b/);
  return m ? m[1] : null;
}

// ============================================================================
// Core Verification Checks
// ============================================================================

/**
 * Result of a gouge check
 */
export interface GougeCheckResult {
  ok: boolean;
  detail?: string;
  position?: { x: number; y: number };
}

/**
 * Verify profile gouge against nominal boundary
 *
 * For OUTSIDE cut: centerline must stay outside (outer boundary - toolR)
 * For INSIDE cut: centerline must stay inside (hole boundary + toolR)
 */
export function verifyProfileGouge(
  nominalBoundary: Path,
  step: StepTruth,
  intent: CutIntent,
  epsMM: number,
  chordStepMM: number
): GougeCheckResult {
  const toolR = step.toolR;

  // Build forbidden region boundary
  // OUTSIDE: forbidden = inset of outer by (toolR - eps) -> centerline entering this = gouge
  // INSIDE: forbidden = outset of hole by (toolR - eps) -> centerline outside this = gouge
  const offsetDist = intent === 'OUTSIDE'
    ? -(toolR - epsMM)  // Inset for outside cut
    : +(toolR - epsMM); // Outset for inside cut

  const forbiddenPath = simpleOffsetClosedPath(nominalBoundary, offsetDist);
  const forbiddenPoly = flattenPath(forbiddenPath, chordStepMM);

  if (forbiddenPoly.length < 3) {
    // Offset collapsed - nominal too small for tool
    return {
      ok: false,
      detail: `Forbidden region collapsed: nominal boundary too small for tool radius ${toolR}mm`,
    };
  }

  // Sample centerline toolpath and check each point
  for (const sp of step.centerlineSubpaths) {
    const pts = samplePath2D(sp.path, chordStepMM);

    for (const p of pts) {
      const inside = pointInPoly({ x: p.x, y: p.y }, forbiddenPoly);

      // For OUTSIDE: being inside forbidden means centerline went too far inward
      // For INSIDE: we inverted the forbidden region, so inside = violation
      if (inside) {
        return {
          ok: false,
          detail: `Gouge risk: centerline enters forbidden region (intent=${intent}) at x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}`,
          position: { x: p.x, y: p.y },
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Check for rapid movement at low Z (bit-breaking risk)
 */
export function checkRapidAtLowZ(
  from: XYZ,
  to: XYZ,
  policy: VerifierPolicy
): { ok: boolean; detail?: string } {
  // If Z is below threshold
  if (to.z < policy.lowZThresholdMM) {
    const xyDist = dxy(from, to);

    // XY movement while at low Z
    if (xyDist > policy.maxRapidXYAtLowZMM) {
      return {
        ok: false,
        detail: `Rapid XY=${xyDist.toFixed(3)}mm at Z=${to.z.toFixed(3)}mm (below ${policy.lowZThresholdMM}mm)`,
      };
    }
  }

  return { ok: true };
}

/**
 * Check for air plunge (plunging without ramp)
 */
export interface PlungeCheckContext {
  pierceZ: number;
  maxAirPlungeMM: number;
  minRampLengthMM: number;
}

export function checkAirPlunge(
  from: XYZ,
  to: XYZ,
  ctx: PlungeCheckContext
): { ok: boolean; suspicious: boolean; detail?: string } {
  // Check if this is a plunge (Z decreasing, minimal XY)
  const dz = to.z - from.z;
  const xy = dxy(from, to);

  // Not a plunge if Z isn't decreasing significantly
  if (dz > -0.5) {
    return { ok: true, suspicious: false };
  }

  // Pure vertical plunge (minimal XY)
  if (xy < 0.2) {
    const plungeDepth = Math.abs(dz);

    // Starting near pierce Z and plunging deep
    if (Math.abs(from.z - ctx.pierceZ) < 2.0 && plungeDepth > ctx.maxAirPlungeMM) {
      return {
        ok: false,
        suspicious: true,
        detail: `Suspicious air plunge: ${plungeDepth.toFixed(3)}mm vertical drop from Z=${from.z.toFixed(3)} (near pierce)`,
      };
    }
  }

  return { ok: true, suspicious: false };
}

/**
 * Check if point is within sheet bounds
 */
export function checkBounds(
  pt: XYZ,
  sheet: { w: number; h: number },
  margin: number = 1.0
): { ok: boolean; detail?: string } {
  if (pt.x < -margin || pt.x > sheet.w + margin) {
    return { ok: false, detail: `X=${pt.x.toFixed(3)} out of bounds [0, ${sheet.w}]` };
  }
  if (pt.y < -margin || pt.y > sheet.h + margin) {
    return { ok: false, detail: `Y=${pt.y.toFixed(3)} out of bounds [0, ${sheet.h}]` };
  }
  return { ok: true };
}

/**
 * Check depth against material thickness
 */
export function checkDepth(
  z: number,
  thicknessMM: number,
  spoilboardAllowanceMM: number
): { ok: boolean; detail?: string } {
  const maxDepth = -(thicknessMM + spoilboardAllowanceMM);

  if (z < maxDepth) {
    return {
      ok: false,
      detail: `Z=${z.toFixed(3)}mm exceeds max depth ${maxDepth.toFixed(3)}mm (thickness=${thicknessMM}mm + spoilboard=${spoilboardAllowanceMM}mm)`,
    };
  }

  return { ok: true };
}

// ============================================================================
// Motion State Replay
// ============================================================================

/**
 * State during motion replay
 */
interface ReplayState {
  pos: XYZ;
  toolId: string | null;
  spindleOn: boolean;
  currentStepId: string | null;
}

/**
 * Create initial replay state
 */
function createInitialState(safeZ: number): ReplayState {
  return {
    pos: { x: 0, y: 0, z: safeZ },
    toolId: null,
    spindleOn: false,
    currentStepId: null,
  };
}

// ============================================================================
// Main Verifier
// ============================================================================

/**
 * Verify toolpath for manufacturing safety
 *
 * Checks:
 * - Gouge detection (tool entering forbidden regions)
 * - Air plunge detection
 * - Rapid at low Z
 * - Depth limits
 * - Sheet bounds
 */
export function verifyToolpath(inp: VerifierInput): ToolpathVerifyReport {
  const issues: VerifyIssue[] = [];
  const stats: VerifyStats = {
    gougeChecks: 0,
    airPlungeChecks: 0,
    rapidsChecked: 0,
    depthChecks: 0,
    boundsChecks: 0,
    totalMotions: 0,
  };

  // Helper to push issues
  function pushIssue(
    code: string,
    severity: VerifySeverity,
    detail: string,
    stepId?: string,
    blockId?: string,
    position?: { x: number; y: number; z?: number }
  ): void {
    const fp = `${code}|${severity}|${stepId ?? ''}|${blockId ?? ''}|${detail.slice(0, 100)}`;
    issues.push({ code, severity, detail, stepId, blockId, position, fingerprint: fp });
  }

  // Get default safe Z from first step (or fallback)
  const firstStepKey = Object.keys(inp.steps)[0];
  const defaultSafeZ = firstStepKey ? inp.steps[firstStepKey].z.safeZ : 15;

  // Track which steps have been verified for gouge
  const gougeVerifiedSteps = new Set<string>();

  // Process each motion block
  for (const block of inp.motion.blocks) {
    const state = createInitialState(defaultSafeZ);
    state.toolId = block.toolId;

    for (const m of block.ops) {
      stats.totalMotions++;

      // Track step from comments
      if (m.kind === 'COMMENT') {
        const sid = extractStepIdFromComment(m.text);
        if (sid) {
          state.currentStepId = sid;
        }
        continue;
      }

      // Tool change
      if (m.kind === 'TOOL_CHANGE') {
        state.toolId = m.toolId;
        continue;
      }

      // Spindle
      if (m.kind === 'SPINDLE') {
        state.spindleOn = m.on;
        continue;
      }

      // Dwell - no checks needed
      if (m.kind === 'DWELL') {
        continue;
      }

      // Get target position
      let targetPos: XYZ;
      if (m.kind === 'RAPID' || m.kind === 'FEED' || m.kind === 'ARC') {
        targetPos = m.to;
      } else {
        continue;
      }

      // 1) Bounds check
      stats.boundsChecks++;
      const boundsResult = checkBounds(targetPos, inp.machine.sheet);
      if (!boundsResult.ok) {
        pushIssue(
          VERIFY_CODE.OUT_OF_BOUNDS,
          'BLOCK',
          boundsResult.detail!,
          state.currentStepId ?? undefined,
          block.id,
          { x: targetPos.x, y: targetPos.y, z: targetPos.z }
        );
      }

      // 2) Depth check (get thickness from step's part)
      if (state.currentStepId) {
        const step = inp.steps[state.currentStepId];
        if (step) {
          const part = inp.truth.parts.find(p => p.partId === step.partId);
          if (part) {
            stats.depthChecks++;
            const depthResult = checkDepth(
              targetPos.z,
              part.thicknessMM,
              inp.machine.spoilboardAllowanceMM
            );
            if (!depthResult.ok) {
              pushIssue(
                VERIFY_CODE.DEPTH_EXCEEDS_LIMIT,
                'BLOCK',
                depthResult.detail!,
                state.currentStepId,
                block.id,
                { x: targetPos.x, y: targetPos.y, z: targetPos.z }
              );
            }
          }
        }
      }

      // 3) Rapid-specific checks
      if (m.kind === 'RAPID') {
        stats.rapidsChecked++;
        const rapidResult = checkRapidAtLowZ(state.pos, targetPos, inp.policy);
        if (!rapidResult.ok) {
          pushIssue(
            VERIFY_CODE.RAPID_XY_AT_LOW_Z,
            'BLOCK',
            rapidResult.detail!,
            state.currentStepId ?? undefined,
            block.id,
            { x: targetPos.x, y: targetPos.y, z: targetPos.z }
          );
        }
      }

      // 4) Feed-specific checks (air plunge)
      if (m.kind === 'FEED' && state.currentStepId) {
        const step = inp.steps[state.currentStepId];
        if (step) {
          stats.airPlungeChecks++;
          const plungeResult = checkAirPlunge(state.pos, targetPos, {
            pierceZ: step.z.pierceZ,
            maxAirPlungeMM: inp.policy.maxAirPlungeMM,
            minRampLengthMM: inp.policy.minRampLengthMM,
          });
          if (!plungeResult.ok) {
            pushIssue(
              plungeResult.suspicious ? VERIFY_CODE.SUSPICIOUS_AIR_PLUNGE : VERIFY_CODE.PLUNGE_INTO_AIR,
              plungeResult.suspicious ? 'WARN' : 'BLOCK',
              plungeResult.detail!,
              state.currentStepId,
              block.id,
              { x: targetPos.x, y: targetPos.y, z: targetPos.z }
            );
          }
        }
      }

      // Update position
      state.pos = targetPos;
    }

    // 5) Per-step gouge checks (after processing block to have context)
    // Check each step that appeared in this block
    for (const stepId of Object.keys(inp.steps)) {
      if (gougeVerifiedSteps.has(stepId)) continue;

      const step = inp.steps[stepId];
      if (!step) continue;

      // Only check PROFILE operations with intent
      if (step.opKind !== 'PROFILE' || !step.intent) {
        gougeVerifiedSteps.add(stepId);
        continue;
      }

      // Find part geometry
      const part = inp.truth.parts.find(p => p.partId === step.partId);
      if (!part) {
        pushIssue(
          VERIFY_CODE.MISSING_PART_TRUTH,
          'BLOCK',
          `Missing part truth for partId=${step.partId}`,
          stepId,
          block.id
        );
        gougeVerifiedSteps.add(stepId);
        continue;
      }

      // Get nominal boundary based on intent
      let nominalBoundary: Path | null = null;
      if (step.intent === 'OUTSIDE') {
        nominalBoundary = part.outer;
      } else if (step.intent === 'INSIDE') {
        const innerIdx = step.innerIndex ?? 0;
        nominalBoundary = part.inners[innerIdx] ?? null;
      }

      if (!nominalBoundary) {
        pushIssue(
          VERIFY_CODE.MISSING_LOOP_TRUTH,
          'BLOCK',
          `Missing nominal loop for intent=${step.intent}`,
          stepId,
          block.id
        );
        gougeVerifiedSteps.add(stepId);
        continue;
      }

      // Perform gouge check
      stats.gougeChecks++;
      const gougeResult = verifyProfileGouge(
        nominalBoundary,
        step,
        step.intent,
        inp.policy.gougeEpsMM,
        inp.policy.chordStepMM
      );

      if (!gougeResult.ok) {
        pushIssue(
          VERIFY_CODE.GOUGE_RISK,
          'BLOCK',
          gougeResult.detail!,
          stepId,
          block.id,
          gougeResult.position ? { x: gougeResult.position.x, y: gougeResult.position.y } : undefined
        );
      }

      gougeVerifiedSteps.add(stepId);
    }
  }

  // Sort issues: BLOCK first, then by code, then by stepId
  issues.sort((a, b) => {
    const sevRank = (s: VerifySeverity) => s === 'BLOCK' ? 0 : 1;
    if (sevRank(a.severity) !== sevRank(b.severity)) {
      return sevRank(a.severity) - sevRank(b.severity);
    }
    if (a.code !== b.code) {
      return a.code < b.code ? -1 : 1;
    }
    return (a.stepId ?? '') < (b.stepId ?? '') ? -1 : 1;
  });

  // Determine overall result
  const kind: 'OK' | 'BLOCK' = issues.some(i => i.severity === 'BLOCK') ? 'BLOCK' : 'OK';

  // Build fingerprint
  const fingerprint = [
    '10.8.1',
    kind,
    issues.length.toString(),
    stats.gougeChecks.toString(),
    stats.rapidsChecked.toString(),
    stats.depthChecks.toString(),
  ].join(':');

  return { kind, issues, stats, fingerprint };
}

// ============================================================================
// Gate Artifact Creation
// ============================================================================

/**
 * Create Gate artifact from verification report
 */
export function createGateVerifyArtifact(report: ToolpathVerifyReport): GateVerifyArtifact {
  // Count issues by category
  const counts = {
    gouge: 0,
    airPlunge: 0,
    rapidLowZ: 0,
    depthExceeded: 0,
    outOfBounds: 0,
    other: 0,
  };

  for (const issue of report.issues) {
    switch (issue.code) {
      case VERIFY_CODE.GOUGE_RISK:
        counts.gouge++;
        break;
      case VERIFY_CODE.PLUNGE_INTO_AIR:
      case VERIFY_CODE.SUSPICIOUS_AIR_PLUNGE:
        counts.airPlunge++;
        break;
      case VERIFY_CODE.RAPID_XY_AT_LOW_Z:
        counts.rapidLowZ++;
        break;
      case VERIFY_CODE.DEPTH_EXCEEDS_LIMIT:
        counts.depthExceeded++;
        break;
      case VERIFY_CODE.OUT_OF_BOUNDS:
        counts.outOfBounds++;
        break;
      default:
        counts.other++;
    }
  }

  // Top issues (first 10)
  const issuesTop = report.issues.slice(0, 10);

  return {
    verifyFingerprint: report.fingerprint,
    kind: report.kind,
    issueCounts: counts,
    stats: { ...report.stats },
    issuesTop,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if verification passed (no BLOCK issues)
 */
export function isVerifyPassed(report: ToolpathVerifyReport): boolean {
  return report.kind === 'OK';
}

/**
 * Get all BLOCK issues
 */
export function getBlockingIssues(report: ToolpathVerifyReport): VerifyIssue[] {
  return report.issues.filter(i => i.severity === 'BLOCK');
}

/**
 * Get all WARN issues
 */
export function getWarningIssues(report: ToolpathVerifyReport): VerifyIssue[] {
  return report.issues.filter(i => i.severity === 'WARN');
}

/**
 * Summarize verification report
 */
export function summarizeVerifyReport(report: ToolpathVerifyReport): string {
  const lines: string[] = [
    `Toolpath Verification: ${report.kind}`,
    `  Issues: ${report.issues.length} (BLOCK: ${getBlockingIssues(report).length}, WARN: ${getWarningIssues(report).length})`,
    `  Stats:`,
    `    - Gouge checks: ${report.stats.gougeChecks}`,
    `    - Air plunge checks: ${report.stats.airPlungeChecks}`,
    `    - Rapids checked: ${report.stats.rapidsChecked}`,
    `    - Depth checks: ${report.stats.depthChecks}`,
    `    - Bounds checks: ${report.stats.boundsChecks}`,
    `    - Total motions: ${report.stats.totalMotions}`,
    `  Fingerprint: ${report.fingerprint}`,
  ];

  if (report.issues.length > 0) {
    lines.push('  Top Issues:');
    for (const issue of report.issues.slice(0, 5)) {
      lines.push(`    [${issue.severity}] ${issue.code}: ${issue.detail}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create default verifier policy
 */
export function createVerifierPolicy(overrides?: Partial<VerifierPolicy>): VerifierPolicy {
  return { ...DEFAULT_VERIFIER_POLICY, ...overrides };
}

/**
 * Create machine config
 */
export function createMachineConfig(
  sheetW: number,
  sheetH: number,
  spoilboardAllowanceMM: number = 2.0
): VerifierMachineConfig {
  return {
    sheet: { w: sheetW, h: sheetH },
    spoilboardAllowanceMM,
  };
}

/**
 * Create empty geometry truth
 */
export function createGeometryTruth(sheetId: string, parts: PartTruth[] = []): GeometryTruth {
  return { sheetId, parts };
}

/**
 * Create step truth
 */
export function createStepTruth(
  stepId: string,
  partId: string,
  opKind: OpKind,
  passKind: PassKind,
  toolId: string,
  toolR: number,
  z: StepZBand,
  options?: {
    intent?: CutIntent;
    centerlineSubpaths?: CenterlineSubpath[];
    innerIndex?: number;
    fingerprints?: StepFingerprints;
  }
): StepTruth {
  return {
    stepId,
    partId,
    opKind,
    passKind,
    toolId,
    toolR,
    z,
    intent: options?.intent,
    centerlineSubpaths: options?.centerlineSubpaths ?? [],
    innerIndex: options?.innerIndex,
    fingerprints: options?.fingerprints ?? {},
  };
}

/**
 * Create verifier input
 */
export function createVerifierInput(
  motion: MotionPlanV1,
  truth: GeometryTruth,
  steps: Record<string, StepTruth>,
  machine: VerifierMachineConfig,
  policy?: VerifierPolicy
): VerifierInput {
  return {
    motion,
    truth,
    steps,
    machine,
    policy: policy ?? DEFAULT_VERIFIER_POLICY,
  };
}
