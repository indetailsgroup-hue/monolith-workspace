/**
 * Entry/Exit Strategy per Material
 *
 * Step 10.6.6: Material-aware lead-in/lead-out moves for CNC routing.
 *
 * This module provides:
 * - Entry/exit motion primitives (RAMP_LINE, MICRO_ARC, TANGENTIAL_LINE)
 * - Material-specific policies (HPL/Melamine need careful entry/exit)
 * - Endpoint role awareness (TAB_ENTRY/TAB_EXIT/NORMAL)
 * - Deterministic geometry generation with audit trail
 *
 * Key concepts:
 * - NORMAL endpoints: standard entry/exit (micro arc, ramp)
 * - TAB endpoints: stabilization moves to avoid chip-out near tabs
 * - Scrap side detection: micro arcs curve toward scrap, not material
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type { Segment, SegLine, SegArc } from '../planTypes.js';
import { segmentStart, segmentEnd } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  add,
  sub,
  mul,
  len,
  norm,
  perpLeft,
  angleOfPointDeg,
  pointAtAngleDeg,
  clamp,
} from './mathCore.js';
import type { EndpointRole, OpenSubpathEx } from './directionAwareTabs.js';
import type { MaterialKind, ToolKind, MillingMode } from './directionPolicy.js';
import type { CutIntent, Winding } from './cutSidePlan.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Kind of entry/exit motion.
 */
export type EntryExitKind =
  | 'NONE'              // No special motion
  | 'RAMP_LINE'         // Linear ramp into material
  | 'RAMP_HELIX'        // Helical ramp (3D, optional)
  | 'MICRO_ARC'         // Small arc lead-in/out on surface
  | 'TANGENTIAL_LINE'   // Tiny tangential line before cut
  | 'PRESCORE_PASS';    // HPL pre-score (shallow pass)

/**
 * Z-axis hint for depth planner.
 */
export interface ZHint {
  /** Type of Z motion */
  type: 'RAMP_TO_DEPTH' | 'PRESCORE' | 'PLUNGE';
  /** Target Z depth in mm (negative into material) */
  targetZ: number;
}

/**
 * Entry or exit policy with geometric parameters.
 */
export interface EntryExitPolicy {
  /** Kind of motion */
  kind: EntryExitKind;
  /** Length of micro move (0.5-3mm typical) */
  microLenMm?: number;
  /** Radius of micro arc (0.5-2mm typical) */
  microArcRMm?: number;
  /** Length of ramp (10-60mm) */
  rampLenMm?: number;
  /** Angle of ramp in degrees (1-5 typical) */
  rampAngleDeg?: number;
  /** Sweep angle for micro arc in degrees */
  microArcSweepDeg?: number;
  /** Pre-score depth for HPL (0.2-0.6mm) */
  prescoreDepthMm?: number;
  /** Pre-score feed rate scale (0.3-0.6) */
  prescoreFeedScale?: number;
  /** Z-axis hint for depth planner */
  zHint?: ZHint;
  /** Stable reason code for audit */
  reasonCode: string;
}

/**
 * Complete entry/exit decision for a subpath.
 */
export interface EntryExitDecision {
  /** Entry policy */
  entry: EntryExitPolicy;
  /** Exit policy */
  exit: EntryExitPolicy;
  /** Stable fingerprint for audit */
  fingerprint: string;
}

/**
 * Travel context for decision making.
 */
export interface TravelContext {
  /** Material type */
  material: MaterialKind;
  /** Tool type */
  tool: ToolKind;
  /** Milling mode (CLIMB/CONVENTIONAL) */
  milling: MillingMode;
  /** Cut intent (OUTSIDE/INSIDE) */
  intent: CutIntent;
  /** Tool radius in mm */
  toolR: number;
  /** Path winding direction */
  pathWinding: Winding;
}

/**
 * Side relative to travel direction.
 */
export type Side = 'LEFT' | 'RIGHT';

/**
 * Decorated subpath with entry/exit segments.
 */
export interface DecoratedSubpath {
  /** Prefix segments (entry motion) */
  prefix: Segment[];
  /** Core segments (original subpath) */
  core: Segment[];
  /** Suffix segments (exit motion) */
  suffix: Segment[];
  /** Metadata */
  meta: {
    entry: EntryExitPolicy;
    exit: EntryExitPolicy;
    fingerprint: string;
  };
}

/**
 * Report item for entry/exit strategy.
 */
export interface EntryExitReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Audit record for entry/exit decisions.
 */
export interface EntryExitAudit {
  /** Subpath identifier */
  subpathId: string;
  /** Start endpoint role */
  startRole: EndpointRole;
  /** End endpoint role */
  endRole: EndpointRole;
  /** Entry policy applied */
  entry: EntryExitPolicy;
  /** Exit policy applied */
  exit: EntryExitPolicy;
  /** Decision fingerprint */
  fingerprint: string;
}

/**
 * Result of applying entry/exit strategy.
 */
export interface EntryExitResult {
  /** Decorated subpaths */
  subpaths: DecoratedSubpath[];
  /** Audit records */
  audits: EntryExitAudit[];
  /** Processing report */
  report: EntryExitReportItem[];
  /** Whether result is valid */
  valid: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MICRO_LEN_MM = 1.5;
const DEFAULT_MICRO_ARC_R_MM = 1.0;
const DEFAULT_MICRO_ARC_SWEEP_DEG = 60;
const DEFAULT_RAMP_LEN_MM = 30;
const DEFAULT_RAMP_ANGLE_DEG = 3.0;
const MIN_MICRO_R_MM = 0.5;
const MAX_MICRO_R_SCALE = 2.0;

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Get arc tangent direction at given angle.
 */
function arcTangentAtDeg(arc: SegArc, deg: number): Vec2 {
  const p = pointAtAngleDeg(arc.c, arc.r, deg);
  const radial = norm(sub(p, arc.c));
  const tCCW = perpLeft(radial);
  return arc.cw ? mul(tCCW, -1) : tCCW;
}

/**
 * Get start point of segment.
 */
function segStartPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).a;
  }
  const arc = seg as SegArc;
  return pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
}

/**
 * Get end point of segment.
 */
function segEndPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).b;
  }
  const arc = seg as SegArc;
  return pointAtAngleDeg(arc.c, arc.r, arc.endDeg);
}

/**
 * Get tangent direction at start of segment.
 */
function segTangentAtStart(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return norm(sub(line.b, line.a));
  }
  const arc = seg as SegArc;
  return arcTangentAtDeg(arc, arc.startDeg);
}

/**
 * Get tangent direction at end of segment.
 */
function segTangentAtEnd(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return norm(sub(line.b, line.a));
  }
  const arc = seg as SegArc;
  return arcTangentAtDeg(arc, arc.endDeg);
}

/**
 * Get point and tangent at subpath start.
 */
export function tangentAtSubpathStart(sp: OpenSubpathEx): { p: Vec2; t: Vec2 } {
  if (sp.segs.length === 0) {
    return { p: { x: 0, y: 0 }, t: { x: 1, y: 0 } };
  }
  const s0 = sp.segs[0];
  return { p: segStartPoint(s0), t: segTangentAtStart(s0) };
}

/**
 * Get point and tangent at subpath end.
 */
export function tangentAtSubpathEnd(sp: OpenSubpathEx): { p: Vec2; t: Vec2 } {
  if (sp.segs.length === 0) {
    return { p: { x: 0, y: 0 }, t: { x: 1, y: 0 } };
  }
  const sN = sp.segs[sp.segs.length - 1];
  return { p: segEndPoint(sN), t: segTangentAtEnd(sN) };
}

// ============================================================================
// Side Detection (Scrap vs Material)
// ============================================================================

/**
 * Get interior side from winding direction.
 *
 * Convention:
 * - CCW: interior is LEFT of travel direction
 * - CW: interior is RIGHT of travel direction
 */
export function interiorSideFromWinding(winding: Winding): Side {
  return winding === 'CCW' ? 'LEFT' : 'RIGHT';
}

/**
 * Get scrap side based on intent and winding.
 *
 * For OUTSIDE cut: scrap is outside (opposite of interior)
 * For INSIDE cut (hole): scrap is inside (same as interior)
 */
export function scrapSide(intent: CutIntent, winding: Winding): Side {
  const interior = interiorSideFromWinding(winding);
  if (intent === 'OUTSIDE') {
    return interior === 'LEFT' ? 'RIGHT' : 'LEFT';
  }
  // INSIDE: interior is scrap
  return interior;
}

/**
 * Get normal vector for given side.
 */
export function normalFromSide(t: Vec2, side: Side): Vec2 {
  const nL = perpLeft(t);
  return side === 'LEFT' ? nL : mul(nL, -1);
}

// ============================================================================
// Geometry Primitive Generators
// ============================================================================

/**
 * Create a tangential line segment.
 *
 * @param p - Start/end point
 * @param tDir - Tangent direction
 * @param lenMm - Line length
 * @param forward - If true, line goes forward; if false, backward
 * @returns Line segment
 */
export function makeTangentialLine(
  p: Vec2,
  tDir: Vec2,
  lenMm: number,
  forward: boolean
): SegLine {
  const dir = forward ? norm(tDir) : mul(norm(tDir), -1);
  const endPt = add(p, mul(dir, lenMm));
  return forward
    ? { kind: 'LINE', a: p, b: endPt }
    : { kind: 'LINE', a: endPt, b: p };
}

/**
 * Create a micro arc for lead-in/lead-out.
 *
 * The arc curves toward the scrap side, starting or ending at point p.
 *
 * @param p - Contact point
 * @param tDir - Tangent direction at p
 * @param r - Arc radius
 * @param sweepDeg - Sweep angle in degrees
 * @param side - Which side to curve toward
 * @param asLeadIn - If true, arc ends at p; if false, arc starts at p
 * @returns Arc segment
 */
export function makeMicroArc(
  p: Vec2,
  tDir: Vec2,
  r: number,
  sweepDeg: number,
  side: Side,
  asLeadIn: boolean
): SegArc {
  const n = normalFromSide(norm(tDir), side);
  const c = add(p, mul(n, r));
  const startDeg = angleOfPointDeg(c, p);

  // CW/CCW based on side
  const cw = side === 'RIGHT';

  // Calculate end angle
  const endDeg = cw
    ? ((startDeg - sweepDeg + 360) % 360)
    : ((startDeg + sweepDeg) % 360);

  const arcStartPt = pointAtAngleDeg(c, r, startDeg);
  const arcEndPt = pointAtAngleDeg(c, r, endDeg);

  if (asLeadIn) {
    // Lead-in: arc ends at p, so reverse direction
    return {
      kind: 'ARC',
      c,
      r,
      startDeg: endDeg,
      endDeg: startDeg,
      cw: !cw,
      start: arcEndPt,
      end: arcStartPt,
    };
  }

  // Lead-out: arc starts at p
  return {
    kind: 'ARC',
    c,
    r,
    startDeg,
    endDeg,
    cw,
    start: arcStartPt,
    end: arcEndPt,
  };
}

/**
 * Create entry line (approaches start tangentially).
 *
 * Line goes from (p - t*len) to p.
 */
export function makeEntryTangentialLine(
  p: Vec2,
  tDir: Vec2,
  lenMm: number
): SegLine {
  const dir = norm(tDir);
  const startPt = add(p, mul(dir, -lenMm));
  return { kind: 'LINE', a: startPt, b: p };
}

/**
 * Create exit line (leaves end tangentially).
 *
 * Line goes from p to (p + t*len).
 */
export function makeExitTangentialLine(
  p: Vec2,
  tDir: Vec2,
  lenMm: number
): SegLine {
  const dir = norm(tDir);
  const endPt = add(p, mul(dir, lenMm));
  return { kind: 'LINE', a: p, b: endPt };
}

// ============================================================================
// Decision Engine
// ============================================================================

/**
 * Generate fingerprint for entry/exit policies.
 */
function fpPolicy(entry: EntryExitPolicy, exit: EntryExitPolicy): string {
  return `${entry.kind}|${entry.reasonCode}::${exit.kind}|${exit.reasonCode}`;
}

/**
 * Check if material is fragile (chip-out sensitive).
 */
function isFragileMaterial(material: MaterialKind): boolean {
  return material === 'HPL' || material === 'MELAMINE';
}

/**
 * Decide entry/exit strategy based on context and endpoint roles.
 *
 * Policy rules:
 * 1. TAB endpoints: stabilization moves (tangential line)
 * 2. Fragile materials (HPL/Melamine): micro arc + ramp
 * 3. General materials: simple ramp or none
 *
 * @param ctx - Travel context
 * @param startRole - Role of start endpoint
 * @param endRole - Role of end endpoint
 * @returns Entry/exit decision
 */
export function decideEntryExit(
  ctx: TravelContext,
  startRole: EndpointRole,
  endRole: EndpointRole
): EntryExitDecision {
  const { material, tool, toolR } = ctx;

  // Compute micro parameters based on tool radius
  const microLen = clamp(toolR * 0.6, 0.6, 2.0);
  const microArcR = clamp(toolR * 0.5, MIN_MICRO_R_MM, toolR * MAX_MICRO_R_SCALE);

  const fragile = isFragileMaterial(material);
  const isCompression = tool === 'COMPRESSION';
  const rampLen = fragile ? 40 : 20;
  const rampAng = fragile ? 2.0 : 3.0;

  // Default policies
  let entry: EntryExitPolicy = { kind: 'NONE', reasonCode: 'E_NONE' };
  let exit: EntryExitPolicy = { kind: 'NONE', reasonCode: 'X_NONE' };

  // ==================== ENTRY ====================
  if (startRole === 'TAB_ENTRY') {
    // TAB entry: stabilize with tangential approach
    if (fragile) {
      entry = {
        kind: 'TANGENTIAL_LINE',
        microLenMm: microLen,
        reasonCode: 'E_TAB_TANGENTIAL_STABILIZE',
        zHint: { type: 'RAMP_TO_DEPTH', targetZ: 0 },
      };
    } else {
      entry = {
        kind: 'TANGENTIAL_LINE',
        microLenMm: microLen * 0.5,
        reasonCode: 'E_TAB_TANGENTIAL',
      };
    }
  } else if (startRole === 'TAB_EXIT') {
    // Exiting tab area - gentle entry
    entry = {
      kind: fragile ? 'TANGENTIAL_LINE' : 'NONE',
      microLenMm: fragile ? microLen : undefined,
      reasonCode: fragile ? 'E_TAB_EXIT_TANGENTIAL' : 'E_TAB_EXIT_NONE',
    };
  } else {
    // NORMAL entry
    if (fragile) {
      entry = {
        kind: 'MICRO_ARC',
        microArcRMm: microArcR,
        microLenMm: microLen,
        microArcSweepDeg: DEFAULT_MICRO_ARC_SWEEP_DEG,
        rampLenMm: rampLen,
        rampAngleDeg: rampAng,
        reasonCode: isCompression ? 'E_HPL_MICRO_ARC_COMPRESSION' : 'E_HPL_MICRO_ARC',
      };
    } else {
      entry = {
        kind: 'RAMP_LINE',
        rampLenMm: rampLen,
        rampAngleDeg: rampAng,
        reasonCode: 'E_GENERAL_RAMP',
      };
    }
  }

  // ==================== EXIT ====================
  if (endRole === 'TAB_EXIT') {
    // TAB exit: avoid stop-on-edge with tangential lead-out
    if (fragile) {
      exit = {
        kind: 'TANGENTIAL_LINE',
        microLenMm: microLen,
        reasonCode: 'X_TAB_TANGENTIAL_OUT',
      };
    } else {
      exit = {
        kind: 'TANGENTIAL_LINE',
        microLenMm: microLen * 0.5,
        reasonCode: 'X_TAB_TANGENTIAL',
      };
    }
  } else if (endRole === 'TAB_ENTRY') {
    // Approaching tab - gentle exit
    exit = {
      kind: fragile ? 'TANGENTIAL_LINE' : 'NONE',
      microLenMm: fragile ? microLen : undefined,
      reasonCode: fragile ? 'X_TAB_ENTRY_TANGENTIAL' : 'X_TAB_ENTRY_NONE',
    };
  } else {
    // NORMAL exit
    if (fragile) {
      exit = {
        kind: 'MICRO_ARC',
        microArcRMm: microArcR,
        microLenMm: microLen,
        microArcSweepDeg: DEFAULT_MICRO_ARC_SWEEP_DEG,
        reasonCode: 'X_HPL_MICRO_LEADOUT',
      };
    } else {
      exit = { kind: 'NONE', reasonCode: 'X_GENERAL_NONE' };
    }
  }

  const fingerprint = fpPolicy(entry, exit);
  return { entry, exit, fingerprint };
}

// ============================================================================
// Subpath Decoration
// ============================================================================

/**
 * Decorate a subpath with entry/exit segments.
 *
 * Creates prefix (entry) and suffix (exit) segments based on policy.
 *
 * @param sp - Open subpath with endpoint roles
 * @param ctx - Travel context including path winding
 * @returns Decorated subpath with prefix/core/suffix
 */
export function decorateSubpathWithEntryExit(
  sp: OpenSubpathEx,
  ctx: TravelContext
): DecoratedSubpath {
  const start = tangentAtSubpathStart(sp);
  const end = tangentAtSubpathEnd(sp);

  const decision = decideEntryExit(ctx, sp.startRole, sp.endRole);

  const prefix: Segment[] = [];
  const suffix: Segment[] = [];

  // ==================== ENTRY EMISSION ====================
  if (decision.entry.kind === 'TANGENTIAL_LINE' && decision.entry.microLenMm) {
    // Tangential approach: line from (p - t*len) to p
    prefix.push(makeEntryTangentialLine(start.p, start.t, decision.entry.microLenMm));
  }

  if (decision.entry.kind === 'MICRO_ARC' && decision.entry.microArcRMm) {
    const side = scrapSide(ctx.intent, ctx.pathWinding);
    const sweepDeg = decision.entry.microArcSweepDeg ?? DEFAULT_MICRO_ARC_SWEEP_DEG;
    const arc = makeMicroArc(start.p, start.t, decision.entry.microArcRMm, sweepDeg, side, true);
    prefix.push(arc);
  }

  // ==================== EXIT EMISSION ====================
  if (decision.exit.kind === 'TANGENTIAL_LINE' && decision.exit.microLenMm) {
    // Tangential lead-out: line from p to (p + t*len)
    suffix.push(makeExitTangentialLine(end.p, end.t, decision.exit.microLenMm));
  }

  if (decision.exit.kind === 'MICRO_ARC' && decision.exit.microArcRMm) {
    const side = scrapSide(ctx.intent, ctx.pathWinding);
    const sweepDeg = decision.exit.microArcSweepDeg ?? DEFAULT_MICRO_ARC_SWEEP_DEG;
    const arc = makeMicroArc(end.p, end.t, decision.exit.microArcRMm, sweepDeg, side, false);
    suffix.push(arc);
  }

  return {
    prefix,
    core: sp.segs.slice(),
    suffix,
    meta: {
      entry: decision.entry,
      exit: decision.exit,
      fingerprint: decision.fingerprint,
    },
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Apply entry/exit strategy to all subpaths.
 *
 * @param subpaths - Open subpaths from tab generation (10.6.5)
 * @param ctx - Travel context
 * @returns Complete result with decorated subpaths and audit
 */
export function applyEntryExitStrategy(
  subpaths: OpenSubpathEx[],
  ctx: TravelContext
): EntryExitResult {
  const decoratedSubpaths: DecoratedSubpath[] = [];
  const audits: EntryExitAudit[] = [];
  const report: EntryExitReportItem[] = [];
  let valid = true;

  for (const sp of subpaths) {
    const decorated = decorateSubpathWithEntryExit(sp, ctx);
    decoratedSubpaths.push(decorated);

    // Create audit record
    audits.push({
      subpathId: sp.id,
      startRole: sp.startRole,
      endRole: sp.endRole,
      entry: decorated.meta.entry,
      exit: decorated.meta.exit,
      fingerprint: decorated.meta.fingerprint,
    });

    // Report entry/exit decisions
    report.push({
      code: 'ENTRY_EXIT_APPLIED',
      detail: `Subpath ${sp.id}: entry=${decorated.meta.entry.kind} exit=${decorated.meta.exit.kind}`,
      fingerprint: `10.6.6:APPLY:${sp.id}:${decorated.meta.fingerprint}`,
      severity: 'INFO',
    });

    // Validate micro arc radius
    if (decorated.meta.entry.microArcRMm !== undefined) {
      if (decorated.meta.entry.microArcRMm < MIN_MICRO_R_MM) {
        report.push({
          code: 'MICRO_ARC_TOO_SMALL',
          detail: `Entry micro arc radius ${decorated.meta.entry.microArcRMm}mm < ${MIN_MICRO_R_MM}mm`,
          fingerprint: `10.6.6:SMALL_ARC:${sp.id}:ENTRY`,
          severity: 'WARN',
        });
      }
    }

    if (decorated.meta.exit.microArcRMm !== undefined) {
      if (decorated.meta.exit.microArcRMm < MIN_MICRO_R_MM) {
        report.push({
          code: 'MICRO_ARC_TOO_SMALL',
          detail: `Exit micro arc radius ${decorated.meta.exit.microArcRMm}mm < ${MIN_MICRO_R_MM}mm`,
          fingerprint: `10.6.6:SMALL_ARC:${sp.id}:EXIT`,
          severity: 'WARN',
        });
      }
    }
  }

  // Summary
  const entryKinds = new Set(audits.map((a) => a.entry.kind));
  const exitKinds = new Set(audits.map((a) => a.exit.kind));

  report.push({
    code: 'ENTRY_EXIT_COMPLETE',
    detail: `Applied entry/exit to ${subpaths.length} subpath(s). Entry kinds: ${[...entryKinds].join(',')}. Exit kinds: ${[...exitKinds].join(',')}`,
    fingerprint: `10.6.6:COMPLETE:${subpaths.length}:${entryKinds.size}:${exitKinds.size}`,
    severity: 'INFO',
  });

  return {
    subpaths: decoratedSubpaths,
    audits,
    report,
    valid,
  };
}

// ============================================================================
// Safety Checks
// ============================================================================

/**
 * Perform safety checks on entry/exit result.
 *
 * Checks:
 * - Micro arc radius bounds
 * - Consistent entry/exit for all subpaths
 * - No blocking issues
 */
export function entryExitSafetyCheck(
  result: EntryExitResult,
  ctx: TravelContext
): { severity: 'OK' | 'WARN' | 'BLOCK'; issues: EntryExitReportItem[] } {
  const issues: EntryExitReportItem[] = [];

  // Check: all fragile materials should have entry/exit moves
  if (isFragileMaterial(ctx.material)) {
    for (const audit of result.audits) {
      if (audit.startRole === 'PATH_START' && audit.entry.kind === 'NONE') {
        issues.push({
          code: 'FRAGILE_NO_ENTRY',
          detail: `Subpath ${audit.subpathId}: fragile material ${ctx.material} has no entry move`,
          fingerprint: `10.6.6:FRAGILE_NO_ENTRY:${audit.subpathId}`,
          severity: 'WARN',
        });
      }
    }
  }

  // Check: micro arc not larger than reasonable
  for (const audit of result.audits) {
    const maxR = ctx.toolR * MAX_MICRO_R_SCALE;

    if (audit.entry.microArcRMm && audit.entry.microArcRMm > maxR) {
      issues.push({
        code: 'MICRO_ARC_TOO_LARGE',
        detail: `Entry micro arc ${audit.entry.microArcRMm}mm > ${maxR}mm (${MAX_MICRO_R_SCALE}x toolR)`,
        fingerprint: `10.6.6:LARGE_ARC:${audit.subpathId}:ENTRY`,
        severity: 'WARN',
      });
    }

    if (audit.exit.microArcRMm && audit.exit.microArcRMm > maxR) {
      issues.push({
        code: 'MICRO_ARC_TOO_LARGE',
        detail: `Exit micro arc ${audit.exit.microArcRMm}mm > ${maxR}mm (${MAX_MICRO_R_SCALE}x toolR)`,
        fingerprint: `10.6.6:LARGE_ARC:${audit.subpathId}:EXIT`,
        severity: 'WARN',
      });
    }
  }

  const hasBlock = issues.some((i) => i.severity === 'BLOCK');
  const hasWarn = issues.some((i) => i.severity === 'WARN');

  return {
    severity: hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'OK',
    issues,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create default travel context for HPL with compression bit.
 */
export function defaultHPLContext(toolR: number, pathWinding: Winding = 'CW'): TravelContext {
  return {
    material: 'HPL',
    tool: 'COMPRESSION',
    milling: 'CLIMB',
    intent: 'OUTSIDE',
    toolR,
    pathWinding,
  };
}

/**
 * Create default travel context for plywood with downcut bit.
 */
export function defaultPlywoodContext(toolR: number, pathWinding: Winding = 'CW'): TravelContext {
  return {
    material: 'PLYWOOD',
    tool: 'DOWNCUT',
    milling: 'CLIMB',
    intent: 'OUTSIDE',
    toolR,
    pathWinding,
  };
}

/**
 * Get all decorated segments as flat array.
 */
export function flattenDecoratedSubpath(decorated: DecoratedSubpath): Segment[] {
  return [...decorated.prefix, ...decorated.core, ...decorated.suffix];
}

/**
 * Get all blocking issues from result.
 */
export function getEntryExitBlockingIssues(result: EntryExitResult): EntryExitReportItem[] {
  return result.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if result is valid.
 */
export function isEntryExitResultValid(result: EntryExitResult): boolean {
  return result.valid && getEntryExitBlockingIssues(result).length === 0;
}

/**
 * Get fingerprints of all issues.
 */
export function getEntryExitFingerprints(result: EntryExitResult): string[] {
  return result.report.map((r) => r.fingerprint);
}
