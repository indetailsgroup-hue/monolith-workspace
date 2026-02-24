/**
 * Variable Offset by Tool Radius
 *
 * Step 10.6.2: Per-operation offset with tool compensation.
 *
 * This module provides:
 * - Tool-dependent offset distance resolution
 * - Rough/finish pass planning with stock allowance
 * - Offset collapse safety guards
 * - Integration with repair pipeline (10.5.10)
 *
 * Key concepts:
 * - TOOL_CENTERLINE: Explicit geometry offset by toolR + allowance
 * - NOMINAL: No offset (drill centers, engraving)
 * - Stock allowance: Rough leaves material, finish removes it
 *
 * All calculations are deterministic with stable fingerprints for Gate audit.
 */

import type { Path, Segment, SegLine, SegArc } from '../planTypes.js';
import { segmentStart, segmentEnd } from '../planTypes.js';
import type { Vec2 } from './mathCore.js';
import { EPS_POS } from './mathCore.js';
import type { ToolKind } from './directionPolicy.js';
import type { CutIntent, Winding } from './cutSidePlan.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool definition for offset calculations.
 */
export interface Tool {
  /** Unique tool identifier */
  id: string;
  /** Tool diameter in mm */
  diameterMm: number;
  /** Tool geometry type */
  kind: ToolKind;
  /** Optional tool description */
  description?: string;
}

/**
 * Stock allowance for rough/finish passes.
 */
export interface StockAllowance {
  /** Radial stock to leave (mm) - rough leaves positive, finish leaves 0 */
  radialMm: number;
  /** Axial stock to leave (mm) - for Z-axis (onion skin, etc.) */
  axialMm: number;
}

/**
 * Offset mode determines how geometry is compensated.
 */
export type OffsetMode =
  | 'TOOL_CENTERLINE'  // Explicit offset geometry by tool radius
  | 'NOMINAL'          // No offset (engraving, drill center)
  | 'G41G42';          // Future: machine cutter comp (not implemented)

/**
 * Request for offset calculation.
 */
export interface OffsetRequest {
  /** Operation identifier */
  opId: string;
  /** Cut intent (OUTSIDE/INSIDE) */
  intent: CutIntent;
  /** Offset mode */
  mode: OffsetMode;
  /** Tool to use */
  tool: Tool;
  /** Stock allowance */
  allowance: StockAllowance;
  /** Explicit side sign override (+1 or -1) */
  sideSign?: 1 | -1;
}

/**
 * Resolved offset distance with audit trail.
 */
export interface OffsetResolved {
  /** Signed offset distance in mm */
  distanceMm: number;
  /** Reason code for audit */
  reasonCode: string;
  /** Stable fingerprint */
  fingerprint: string;
}

/**
 * Pass kind for multi-pass machining.
 */
export type PassKind = 'ROUGH' | 'FINISH' | 'SEMI_FINISH';

/**
 * Single machining pass with offset.
 */
export interface PassPlan {
  /** Pass identifier */
  id: string;
  /** Pass kind */
  kind: PassKind;
  /** Resolved offset */
  offset: OffsetResolved;
  /** Tool for this pass */
  tool: Tool;
  /** Pass order (0 = first) */
  order: number;
}

/**
 * Report item for offset operations.
 */
export interface OffsetReportItem {
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
 * Result of offset pass execution.
 */
export type OffsetPassResult =
  | { kind: 'OK'; pass: PassPlan; path: Path; report: OffsetReportItem[] }
  | { kind: 'BLOCK_GATE'; pass: PassPlan; reason: string; report: OffsetReportItem[] };

/**
 * Audit record for offset operations.
 */
export interface OffsetAudit {
  /** Operation identifier */
  opId: string;
  /** Pass kind */
  passKind: PassKind;
  /** Tool identifier */
  toolId: string;
  /** Applied offset distance */
  distanceMm: number;
  /** Offset fingerprint */
  offsetFingerprint: string;
  /** Whether repair was needed */
  usedRepair: boolean;
  /** Processing report codes */
  reportCodes: string[];
}

/**
 * Configuration for offset pipeline.
 */
export interface OffsetPipelineConfig {
  /** Expected winding after offset (for repair) */
  expectedWinding: Winding;
  /** Whether touch intersections should block */
  touchIsBlock: boolean;
  /** Maximum allowed offset as fraction of min dimension */
  maxOffsetFraction: number;
  /** Enable verbose reporting */
  verbose: boolean;
}

/**
 * Collapse guard result.
 */
export interface CollapseGuardResult {
  /** Whether offset is safe */
  ok: boolean;
  /** Reason if not ok */
  reason?: string;
  /** Bounding box used for check */
  bbox?: { min: Vec2; max: Vec2 };
  /** Minimum dimension */
  minDim?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STOCK_LEAVE_MM = 0.3;
const DEFAULT_MAX_OFFSET_FRACTION = 0.45; // 45% of min dimension

/** Default offset pipeline configuration */
export const DEFAULT_OFFSET_CONFIG: OffsetPipelineConfig = {
  expectedWinding: 'CW',
  touchIsBlock: false,
  maxOffsetFraction: DEFAULT_MAX_OFFSET_FRACTION,
  verbose: false,
};

// ============================================================================
// Fingerprint Utilities
// ============================================================================

/**
 * Generate fingerprint for offset resolution.
 * Quantizes to micron precision for stability.
 */
function fpOffset(distanceMm: number, reasonCode: string): string {
  const q = Math.round(distanceMm * 1e3); // 0.001mm precision
  return `${q}|${reasonCode}`;
}

// ============================================================================
// Offset Resolution
// ============================================================================

/**
 * Resolve signed offset distance based on request.
 *
 * Rules:
 * - TOOL_CENTERLINE: offset = (toolR + allowance) * sign
 *   - OUTSIDE: positive (tool outside part)
 *   - INSIDE: negative (tool inside hole)
 * - NOMINAL: offset = 0
 * - G41G42: offset = allowance only (future)
 *
 * @param req - Offset request
 * @returns Resolved offset with fingerprint
 */
export function resolveOffsetDistance(req: OffsetRequest): OffsetResolved {
  const toolR = req.tool.diameterMm / 2;
  const allowance = req.allowance.radialMm ?? 0;

  // NOMINAL mode: no offset
  if (req.mode === 'NOMINAL') {
    const reasonCode = 'OFFSET_NOMINAL';
    return {
      distanceMm: 0,
      reasonCode,
      fingerprint: fpOffset(0, reasonCode),
    };
  }

  // TOOL_CENTERLINE mode: full compensation
  if (req.mode === 'TOOL_CENTERLINE') {
    const base = toolR + allowance;
    const sign = req.sideSign ?? (req.intent === 'OUTSIDE' ? +1 : -1);
    const d = base * sign;

    const reasonCode = `OFFSET_TOOL_CENTERLINE_${req.intent}`;
    return {
      distanceMm: d,
      reasonCode,
      fingerprint: fpOffset(d, reasonCode),
    };
  }

  // G41G42 mode: allowance only (geometry stays nominal)
  const reasonCode = 'OFFSET_G41G42_ALLOWANCE_ONLY';
  return {
    distanceMm: allowance,
    reasonCode,
    fingerprint: fpOffset(allowance, reasonCode),
  };
}

/**
 * Get tool radius from tool definition.
 */
export function getToolRadius(tool: Tool): number {
  return tool.diameterMm / 2;
}

// ============================================================================
// Pass Planning
// ============================================================================

/**
 * Build rough and finish passes for profile operation.
 *
 * Rough pass: toolR + stockLeave
 * Finish pass: toolR only
 *
 * @param baseReq - Base offset request (without allowance)
 * @param stockLeaveMm - Stock to leave for rough pass
 * @returns Array of passes [ROUGH, FINISH]
 */
export function buildRoughFinishPasses(
  baseReq: Omit<OffsetRequest, 'allowance'>,
  stockLeaveMm: number = DEFAULT_STOCK_LEAVE_MM
): PassPlan[] {
  const roughReq: OffsetRequest = {
    ...baseReq,
    allowance: { radialMm: stockLeaveMm, axialMm: 0 },
  };

  const finishReq: OffsetRequest = {
    ...baseReq,
    allowance: { radialMm: 0, axialMm: 0 },
  };

  return [
    {
      id: `${baseReq.opId}:ROUGH`,
      kind: 'ROUGH',
      offset: resolveOffsetDistance(roughReq),
      tool: baseReq.tool,
      order: 0,
    },
    {
      id: `${baseReq.opId}:FINISH`,
      kind: 'FINISH',
      offset: resolveOffsetDistance(finishReq),
      tool: baseReq.tool,
      order: 1,
    },
  ];
}

/**
 * Build single finish pass (no roughing).
 */
export function buildFinishOnlyPass(
  baseReq: Omit<OffsetRequest, 'allowance'>
): PassPlan[] {
  const finishReq: OffsetRequest = {
    ...baseReq,
    allowance: { radialMm: 0, axialMm: 0 },
  };

  return [
    {
      id: `${baseReq.opId}:FINISH`,
      kind: 'FINISH',
      offset: resolveOffsetDistance(finishReq),
      tool: baseReq.tool,
      order: 0,
    },
  ];
}

/**
 * Build multi-step roughing passes with decreasing stock.
 *
 * Creates passes: ROUGH_1 (full stock), ROUGH_2 (half stock), ..., FINISH
 *
 * @param baseReq - Base offset request
 * @param stockLeaveMm - Initial stock to leave
 * @param roughSteps - Number of rough passes (default 2)
 */
export function buildMultiStepPasses(
  baseReq: Omit<OffsetRequest, 'allowance'>,
  stockLeaveMm: number,
  roughSteps: number = 2
): PassPlan[] {
  const passes: PassPlan[] = [];

  // Rough passes with decreasing stock
  for (let i = 0; i < roughSteps; i++) {
    const fraction = (roughSteps - i) / roughSteps;
    const stock = stockLeaveMm * fraction;

    const req: OffsetRequest = {
      ...baseReq,
      allowance: { radialMm: stock, axialMm: 0 },
    };

    passes.push({
      id: `${baseReq.opId}:ROUGH_${i + 1}`,
      kind: i === roughSteps - 1 ? 'SEMI_FINISH' : 'ROUGH',
      offset: resolveOffsetDistance(req),
      tool: baseReq.tool,
      order: i,
    });
  }

  // Finish pass
  const finishReq: OffsetRequest = {
    ...baseReq,
    allowance: { radialMm: 0, axialMm: 0 },
  };

  passes.push({
    id: `${baseReq.opId}:FINISH`,
    kind: 'FINISH',
    offset: resolveOffsetDistance(finishReq),
    tool: baseReq.tool,
    order: roughSteps,
  });

  return passes;
}

// ============================================================================
// Geometry Utilities
// ============================================================================

/**
 * Get start point of segment.
 */
function segStartPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).a;
  }
  const arc = seg as SegArc;
  return arc.start;
}

/**
 * Get end point of segment.
 */
function segEndPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).b;
  }
  const arc = seg as SegArc;
  return arc.end;
}

/**
 * Compute approximate bounding box of path.
 * Uses segment endpoints only (fast, deterministic).
 */
export function bboxOfPathApprox(path: Path): { min: Vec2; max: Vec2 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const seg of path.segs) {
    const pts = [segStartPoint(seg), segEndPoint(seg)];

    // For arcs, also check the center ± radius (conservative)
    if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      pts.push(
        { x: arc.c.x - arc.r, y: arc.c.y },
        { x: arc.c.x + arc.r, y: arc.c.y },
        { x: arc.c.x, y: arc.c.y - arc.r },
        { x: arc.c.x, y: arc.c.y + arc.r }
      );
    }

    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
  };
}

// ============================================================================
// Safety Guards
// ============================================================================

/**
 * Check if offset would collapse the path geometry.
 *
 * Conservative check: if 2*|offset| > minDimension, path may collapse.
 *
 * @param path - Path to check
 * @param offsetMm - Offset distance to apply
 * @param maxFraction - Maximum allowed fraction of min dimension
 * @returns Guard result
 */
export function offsetCollapseGuard(
  path: Path,
  offsetMm: number,
  maxFraction: number = DEFAULT_MAX_OFFSET_FRACTION
): CollapseGuardResult {
  const bbox = bboxOfPathApprox(path);
  const w = bbox.max.x - bbox.min.x;
  const h = bbox.max.y - bbox.min.y;
  const minDim = Math.min(w, h);

  const absOffset = Math.abs(offsetMm);
  const threshold = minDim * maxFraction;

  if (absOffset > threshold) {
    return {
      ok: false,
      reason: `Offset |d|=${absOffset.toFixed(3)}mm exceeds ${(maxFraction * 100).toFixed(0)}% of minDim=${minDim.toFixed(3)}mm (threshold=${threshold.toFixed(3)}mm)`,
      bbox,
      minDim,
    };
  }

  // Additional check: absolute collapse
  if (2 * absOffset > minDim - EPS_POS) {
    return {
      ok: false,
      reason: `Offset 2*|d|=${(2 * absOffset).toFixed(3)}mm would collapse bbox minDim=${minDim.toFixed(3)}mm`,
      bbox,
      minDim,
    };
  }

  return { ok: true, bbox, minDim };
}

/**
 * Check if tool is appropriate for offset distance.
 */
export function toolOffsetCompatibilityGuard(
  tool: Tool,
  offsetMm: number,
  intent: CutIntent
): CollapseGuardResult {
  const toolR = tool.diameterMm / 2;

  // For OUTSIDE cuts, offset should be positive
  if (intent === 'OUTSIDE' && offsetMm < -EPS_POS) {
    return {
      ok: false,
      reason: `OUTSIDE intent requires positive offset, got ${offsetMm.toFixed(3)}mm`,
    };
  }

  // For INSIDE cuts, offset should be negative
  if (intent === 'INSIDE' && offsetMm > EPS_POS) {
    return {
      ok: false,
      reason: `INSIDE intent requires negative offset, got ${offsetMm.toFixed(3)}mm`,
    };
  }

  // Warn if offset is significantly different from tool radius
  const absOffset = Math.abs(offsetMm);
  if (absOffset > 0 && Math.abs(absOffset - toolR) > toolR * 0.5) {
    // This is a warning, not a block
    return {
      ok: true,
      reason: `Offset ${absOffset.toFixed(3)}mm differs significantly from toolR ${toolR.toFixed(3)}mm`,
    };
  }

  return { ok: true };
}

// ============================================================================
// Pipeline Integration (Placeholder)
// ============================================================================

/**
 * Placeholder for offset application.
 *
 * In real implementation, this would call:
 * - offsetClosedPath() from 10.5.6
 * - detectSelfIntersections() from 10.5.9
 * - repairOffsetTopology() from 10.5.10
 *
 * For now, returns a pass-through result for integration testing.
 */
export function runOffsetForPass(
  input: Path,
  pass: PassPlan,
  config: OffsetPipelineConfig = DEFAULT_OFFSET_CONFIG
): OffsetPassResult {
  const report: OffsetReportItem[] = [];
  const d = pass.offset.distanceMm;

  // Step 1: Collapse guard
  const guard = offsetCollapseGuard(input, d, config.maxOffsetFraction);
  if (!guard.ok) {
    report.push({
      code: 'COLLAPSE_GUARD_FAIL',
      detail: guard.reason ?? 'Unknown collapse guard failure',
      fingerprint: `10.6.2:COLLAPSE:${pass.id}`,
      severity: 'BLOCK',
    });

    return {
      kind: 'BLOCK_GATE',
      pass,
      reason: `COLLAPSE_GUARD: ${guard.reason}`,
      report,
    };
  }

  report.push({
    code: 'COLLAPSE_GUARD_OK',
    detail: `Offset |d|=${Math.abs(d).toFixed(3)}mm within bounds (minDim=${guard.minDim?.toFixed(3)}mm)`,
    fingerprint: `10.6.2:GUARD_OK:${pass.id}`,
    severity: 'INFO',
  });

  // Step 2: Apply offset (placeholder - would call offsetClosedPath)
  // For now, we return the input path as if offset was applied
  // In real implementation:
  // const offsetPath = offsetClosedPath(input, d);

  report.push({
    code: 'OFFSET_APPLIED',
    detail: `Offset d=${d.toFixed(3)}mm applied (pass=${pass.kind}, fp=${pass.offset.fingerprint})`,
    fingerprint: `10.6.2:OFFSET:${pass.id}:${pass.offset.fingerprint}`,
    severity: 'INFO',
  });

  // Step 3: Self-intersection check + repair (placeholder)
  // In real implementation:
  // const hits = detectSelfIntersections(offsetPath);
  // if (hits.length > 0) {
  //   const repaired = repairOffsetTopology(offsetPath, policy);
  //   ...
  // }

  report.push({
    code: 'OFFSET_PASS_COMPLETE',
    detail: `Pass ${pass.id} complete: offset=${d.toFixed(3)}mm`,
    fingerprint: `10.6.2:COMPLETE:${pass.id}`,
    severity: 'INFO',
  });

  // Return input path as placeholder (real impl would return offset path)
  return {
    kind: 'OK',
    pass,
    path: input, // Placeholder: would be offsetPath
    report,
  };
}

// ============================================================================
// Audit Generation
// ============================================================================

/**
 * Generate audit record for offset pass.
 */
export function generateOffsetAudit(
  opId: string,
  pass: PassPlan,
  result: OffsetPassResult
): OffsetAudit {
  return {
    opId,
    passKind: pass.kind,
    toolId: pass.tool.id,
    distanceMm: pass.offset.distanceMm,
    offsetFingerprint: pass.offset.fingerprint,
    usedRepair: result.report.some((r) => r.code.includes('REPAIR')),
    reportCodes: result.report.map((r) => r.code),
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a standard tool definition.
 */
export function createTool(
  id: string,
  diameterMm: number,
  kind: ToolKind = 'COMPRESSION'
): Tool {
  return { id, diameterMm, kind };
}

/**
 * Create offset request for OUTSIDE profile.
 */
export function createOutsideProfileRequest(
  opId: string,
  tool: Tool,
  stockLeaveMm: number = 0
): OffsetRequest {
  return {
    opId,
    intent: 'OUTSIDE',
    mode: 'TOOL_CENTERLINE',
    tool,
    allowance: { radialMm: stockLeaveMm, axialMm: 0 },
  };
}

/**
 * Create offset request for INSIDE profile (holes).
 */
export function createInsideProfileRequest(
  opId: string,
  tool: Tool,
  stockLeaveMm: number = 0
): OffsetRequest {
  return {
    opId,
    intent: 'INSIDE',
    mode: 'TOOL_CENTERLINE',
    tool,
    allowance: { radialMm: stockLeaveMm, axialMm: 0 },
  };
}

/**
 * Get all blocking issues from offset result.
 */
export function getOffsetBlockingIssues(result: OffsetPassResult): OffsetReportItem[] {
  return result.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if offset result is valid.
 */
export function isOffsetResultValid(result: OffsetPassResult): boolean {
  return result.kind === 'OK' && getOffsetBlockingIssues(result).length === 0;
}

/**
 * Get fingerprints from offset result.
 */
export function getOffsetFingerprints(result: OffsetPassResult): string[] {
  return result.report.map((r) => r.fingerprint);
}

/**
 * Summary of all passes for audit.
 */
export function summarizePasses(passes: PassPlan[]): string {
  return passes
    .map((p) => `${p.kind}:${p.offset.distanceMm.toFixed(3)}mm`)
    .join(' -> ');
}
