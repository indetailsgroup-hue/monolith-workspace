/**
 * Step 10.8.2: Geometry Consistency Check (DXF vs G-code must match)
 *
 * Legal/QA grade verification that proves:
 * "What Gate approved (geometry/toolpath truth)" == "What factory runs (G-code)"
 *
 * Uses canonical sampling representation:
 * - Truth side: centerline paths → sample points
 * - G-code side: parsed motion commands → reconstructed segments → sample points
 * - Compare using grid-accelerated nearest-neighbor with tolerance
 *
 * @module geometryConsistency
 * @version 10.8.2
 */

import type { DialectId } from './gcodeDialects.js';
import type { StepTruth } from './toolpathVerifier.js';
import { samplePath2D, extractStepIdFromComment } from './toolpathVerifier.js';

// ============================================================================
// Types: 2D Geometry
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

// ============================================================================
// Types: Consistency Input
// ============================================================================

/**
 * Policy for consistency checking
 */
export interface ConsistencyPolicy {
  /** XY tolerance in mm */
  xyTolMM: number;
  /** Z tolerance in mm */
  zTolMM: number;
  /** Arc center (I,J) tolerance in mm */
  ijTolMM: number;
  /** Sample step for path discretization in mm */
  sampleStepMM: number;
  /** Allow arcs to be linearized (some controllers don't support arcs) */
  allowArcToLineApprox: boolean;
  /** Maximum allowed mismatch rate (0.02 = 2%) */
  maxMismatchRate: number;
  /** Minimum samples required for comparison */
  minSamplesRequired: number;
}

/**
 * Default consistency policy
 */
export const DEFAULT_CONSISTENCY_POLICY: ConsistencyPolicy = {
  xyTolMM: 0.05,
  zTolMM: 0.05,
  ijTolMM: 0.05,
  sampleStepMM: 2.0,
  allowArcToLineApprox: false,
  maxMismatchRate: 0.02,
  minSamplesRequired: 3,
};

/**
 * Input for consistency checking
 */
export interface ConsistencyInput {
  /** Truth side: step definitions with centerline paths */
  steps: Record<string, StepTruth>;
  /** Output side: G-code string */
  gcode: string;
  /** Dialect used for G-code generation */
  dialect: DialectId;
  /** Consistency policy */
  policy: ConsistencyPolicy;
}

// ============================================================================
// Types: Consistency Output
// ============================================================================

export type ConsistencySeverity = 'WARN' | 'BLOCK';

/**
 * Single consistency issue
 */
export interface ConsistencyIssue {
  code: string;
  severity: ConsistencySeverity;
  stepId?: string;
  detail: string;
  fingerprint: string;
}

/**
 * Consistency check statistics
 */
export interface ConsistencyStats {
  stepsChecked: number;
  movesChecked: number;
  samplesCompared: number;
  gcodeLines: number;
  gcodeCommands: number;
}

/**
 * Complete consistency report
 */
export interface ConsistencyReport {
  kind: 'OK' | 'BLOCK';
  issues: ConsistencyIssue[];
  stats: ConsistencyStats;
  fingerprint: string;
}

/**
 * Gate artifact for trust chain
 */
export interface GateConsistencyArtifact {
  consistencyFingerprint: string;
  kind: 'OK' | 'BLOCK';
  issueCounts: {
    mismatch: number;
    missing: number;
    lowSamples: number;
    other: number;
  };
  stats: ConsistencyStats;
  issuesTop: ConsistencyIssue[];
}

// ============================================================================
// Issue Codes
// ============================================================================

export const CONSISTENCY_CODE = {
  // BLOCK-level issues
  GCODE_STEP_MISSING: 'GCODE_STEP_MISSING',
  GEOM_MISMATCH: 'GEOM_MISMATCH',
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  EMPTY_GCODE: 'EMPTY_GCODE',
  PARSE_ERROR: 'PARSE_ERROR',

  // WARN-level issues
  TOO_FEW_SAMPLES: 'TOO_FEW_SAMPLES',
  ARC_LINEARIZED: 'ARC_LINEARIZED',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  STEP_BOUNDARY_MISSING: 'STEP_BOUNDARY_MISSING',
} as const;

// ============================================================================
// G-code Parser (ISO Subset)
// ============================================================================

/**
 * Parsed G-code command
 */
export type GCmd =
  | { kind: 'COMMENT'; text: string }
  | { kind: 'RAPID'; to: Partial<XYZ> }
  | { kind: 'FEED'; to: Partial<XYZ>; feed?: number }
  | { kind: 'ARC'; cw: boolean; to: Partial<XYZ>; i: number; j: number; feed?: number }
  | { kind: 'TOOL_CHANGE'; toolNum: number }
  | { kind: 'SPINDLE'; on: boolean; rpm?: number }
  | { kind: 'UNKNOWN'; raw: string };

/**
 * Strip comment from G-code line
 */
function stripComment(line: string): { code: string; comment?: string } {
  const t = line.trim();

  // Full-line comment: (...)
  if (t.startsWith('(') && t.endsWith(')')) {
    return { code: '', comment: t.slice(1, -1) };
  }

  // Inline comment: extract and remove
  const parenMatch = t.match(/\(([^)]*)\)/);
  if (parenMatch) {
    const code = t.replace(/\([^)]*\)/g, '').trim();
    return { code, comment: parenMatch[1] };
  }

  // Semicolon comment
  const semiIdx = t.indexOf(';');
  if (semiIdx >= 0) {
    return { code: t.slice(0, semiIdx).trim(), comment: t.slice(semiIdx + 1).trim() };
  }

  return { code: t };
}

/**
 * Parse word-address pairs from G-code line
 */
function parseWords(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /([A-Z])\s*([+\-]?\d+(\.\d+)?)/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(s))) {
    out[m[1].toUpperCase()] = parseFloat(m[2]);
  }

  return out;
}

/**
 * Parse G-code string into command list (deterministic, ISO subset)
 */
export function parseGcodeISO(gcode: string): GCmd[] {
  const cmds: GCmd[] = [];
  const lines = gcode.split(/\r?\n/);

  for (const raw of lines) {
    const { code, comment } = stripComment(raw);

    // Handle comment
    if (comment != null && comment.length > 0) {
      cmds.push({ kind: 'COMMENT', text: comment });
    }

    const t = code.trim();
    if (!t) continue;

    const upper = t.toUpperCase();
    const w = parseWords(upper);

    // G0 - Rapid
    if (upper.includes('G0') && !upper.includes('G00')) {
      cmds.push({ kind: 'RAPID', to: { x: w.X, y: w.Y, z: w.Z } });
      continue;
    }
    if (upper.includes('G00')) {
      cmds.push({ kind: 'RAPID', to: { x: w.X, y: w.Y, z: w.Z } });
      continue;
    }

    // G1 - Feed
    if (upper.includes('G1') && !upper.includes('G10') && !upper.includes('G17') && !upper.includes('G18') && !upper.includes('G19')) {
      cmds.push({ kind: 'FEED', to: { x: w.X, y: w.Y, z: w.Z }, feed: w.F });
      continue;
    }
    if (upper.includes('G01')) {
      cmds.push({ kind: 'FEED', to: { x: w.X, y: w.Y, z: w.Z }, feed: w.F });
      continue;
    }

    // G2 - CW Arc
    if (upper.includes('G2') && !upper.includes('G20') && !upper.includes('G21') && !upper.includes('G28')) {
      cmds.push({
        kind: 'ARC',
        cw: true,
        to: { x: w.X, y: w.Y, z: w.Z },
        i: w.I ?? 0,
        j: w.J ?? 0,
        feed: w.F,
      });
      continue;
    }
    if (upper.includes('G02')) {
      cmds.push({
        kind: 'ARC',
        cw: true,
        to: { x: w.X, y: w.Y, z: w.Z },
        i: w.I ?? 0,
        j: w.J ?? 0,
        feed: w.F,
      });
      continue;
    }

    // G3 - CCW Arc
    if (upper.includes('G3') && !upper.includes('G30')) {
      cmds.push({
        kind: 'ARC',
        cw: false,
        to: { x: w.X, y: w.Y, z: w.Z },
        i: w.I ?? 0,
        j: w.J ?? 0,
        feed: w.F,
      });
      continue;
    }
    if (upper.includes('G03')) {
      cmds.push({
        kind: 'ARC',
        cw: false,
        to: { x: w.X, y: w.Y, z: w.Z },
        i: w.I ?? 0,
        j: w.J ?? 0,
        feed: w.F,
      });
      continue;
    }

    // Tool change
    if (upper.includes('T') && (upper.includes('M6') || upper.includes('M06'))) {
      cmds.push({ kind: 'TOOL_CHANGE', toolNum: w.T ?? 0 });
      continue;
    }
    if (upper.match(/^T\d+/)) {
      cmds.push({ kind: 'TOOL_CHANGE', toolNum: w.T ?? parseInt(upper.match(/T(\d+)/)?.[1] ?? '0') });
      continue;
    }

    // Spindle
    if (upper.includes('M3') || upper.includes('M03')) {
      cmds.push({ kind: 'SPINDLE', on: true, rpm: w.S });
      continue;
    }
    if (upper.includes('M5') || upper.includes('M05')) {
      cmds.push({ kind: 'SPINDLE', on: false });
      continue;
    }

    // Skip known non-motion codes
    if (upper.match(/^[GMNOST%]/)) {
      // Known control codes - ignore silently
      continue;
    }

    // Unknown command
    cmds.push({ kind: 'UNKNOWN', raw: t });
  }

  return cmds;
}

// ============================================================================
// Segment Reconstruction from G-code
// ============================================================================

/**
 * Reconstructed 2D segment from G-code
 */
export type Seg2D =
  | { kind: 'LINE'; a: Vec2; b: Vec2; z: number }
  | { kind: 'ARC'; a: Vec2; b: Vec2; c: Vec2; cw: boolean; z: number };

/**
 * Apply partial XYZ to current position (modal behavior)
 */
function applyPartial(cur: XYZ, p: Partial<XYZ>): XYZ {
  return {
    x: p.x ?? cur.x,
    y: p.y ?? cur.y,
    z: p.z ?? cur.z,
  };
}

/**
 * Bucket of segments for a step
 */
export interface SegmentBucket {
  stepId: string | null;
  segs: Seg2D[];
}

/**
 * Convert parsed G-code commands to segment buckets by step
 */
export function gcodeToSegments(cmds: GCmd[]): SegmentBucket[] {
  let cur: XYZ = { x: 0, y: 0, z: 0 };
  let currentStepId: string | null = null;

  const buckets: SegmentBucket[] = [];
  let active: SegmentBucket = { stepId: currentStepId, segs: [] };
  buckets.push(active);

  for (const c of cmds) {
    if (c.kind === 'COMMENT') {
      // Try to extract step ID from comment
      // Support formats: "BEGIN stepId ...", "(BEGIN stepId ...)", "stepId: ..."
      let sid = extractStepIdFromComment(c.text);
      if (!sid && c.text.startsWith('BEGIN ')) {
        sid = extractStepIdFromComment(c.text);
      }
      if (!sid) {
        const match = c.text.match(/^BEGIN\s+([A-Za-z0-9_\-:]+)/);
        if (match) sid = match[1];
      }

      if (sid) {
        currentStepId = sid;
        active = { stepId: currentStepId, segs: [] };
        buckets.push(active);
      }
      continue;
    }

    if (c.kind === 'RAPID') {
      const to = applyPartial(cur, c.to);
      // Rapids are travel moves, not cutting - don't add to geometry
      cur = to;
      continue;
    }

    if (c.kind === 'FEED') {
      const to = applyPartial(cur, c.to);
      // Add feed move as line segment
      active.segs.push({
        kind: 'LINE',
        a: { x: cur.x, y: cur.y },
        b: { x: to.x, y: to.y },
        z: to.z,
      });
      cur = to;
      continue;
    }

    if (c.kind === 'ARC') {
      const to = applyPartial(cur, c.to);
      // Center is incremental from start (I, J)
      const center = { x: cur.x + c.i, y: cur.y + c.j };
      active.segs.push({
        kind: 'ARC',
        a: { x: cur.x, y: cur.y },
        b: { x: to.x, y: to.y },
        c: center,
        cw: c.cw,
        z: to.z,
      });
      cur = to;
      continue;
    }

    // Tool change, spindle, unknown - update state but no geometry
    if (c.kind === 'TOOL_CHANGE' || c.kind === 'SPINDLE' || c.kind === 'UNKNOWN') {
      continue;
    }
  }

  // Remove empty buckets
  return buckets.filter(b => b.segs.length > 0);
}

// ============================================================================
// Canonical Sampling
// ============================================================================

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
 * Sample points along a line segment
 */
function sampleLine(a: Vec2, b: Vec2, stepMM: number): Vec2[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(L / stepMM));
  const out: Vec2[] = [];

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
 * Sample points along an arc segment (from reconstructed G-code)
 */
function sampleArcFromSeg(seg: Extract<Seg2D, { kind: 'ARC' }>, stepMM: number): Vec2[] {
  const r = Math.hypot(seg.a.x - seg.c.x, seg.a.y - seg.c.y);
  if (r < 0.001) return [seg.a, seg.b];

  const a0 = Math.atan2(seg.a.y - seg.c.y, seg.a.x - seg.c.x);
  const a1 = Math.atan2(seg.b.y - seg.c.y, seg.b.x - seg.c.x);
  const sw = sweepRad(seg.cw, a0, a1);
  const L = r * sw;
  const n = Math.max(3, Math.ceil(L / stepMM));

  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = seg.cw ? (a0 - sw * t) : (a0 + sw * t);
    out.push({
      x: seg.c.x + r * Math.cos(ang),
      y: seg.c.y + r * Math.sin(ang),
    });
  }

  return out;
}

/**
 * Sample all segments in a bucket
 */
function sampleSegments(segs: Seg2D[], stepMM: number): Vec2[] {
  const pts: Vec2[] = [];

  for (const seg of segs) {
    if (seg.kind === 'LINE') {
      const samples = sampleLine(seg.a, seg.b, stepMM);
      // Skip first point if it duplicates previous
      const startIdx = pts.length > 0 &&
        Math.hypot(samples[0].x - pts[pts.length - 1].x, samples[0].y - pts[pts.length - 1].y) < 0.001
        ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        pts.push(samples[i]);
      }
    } else {
      const samples = sampleArcFromSeg(seg, stepMM);
      const startIdx = pts.length > 0 &&
        Math.hypot(samples[0].x - pts[pts.length - 1].x, samples[0].y - pts[pts.length - 1].y) < 0.001
        ? 1 : 0;
      for (let i = startIdx; i < samples.length; i++) {
        pts.push(samples[i]);
      }
    }
  }

  return pts;
}

// ============================================================================
// Grid-Accelerated Nearest Neighbor
// ============================================================================

type GridKey = string;

/**
 * Get grid cell key for a point
 */
function cellKey(p: Vec2, cell: number): GridKey {
  const ix = Math.floor(p.x / cell);
  const iy = Math.floor(p.y / cell);
  return `${ix},${iy}`;
}

/**
 * Build spatial hash grid from points
 */
function buildGrid(pts: Vec2[], cell: number): Map<GridKey, Vec2[]> {
  const g = new Map<GridKey, Vec2[]>();

  for (const p of pts) {
    const k = cellKey(p, cell);
    const arr = g.get(k) ?? [];
    arr.push(p);
    g.set(k, arr);
  }

  return g;
}

/**
 * Check if there's a point within tolerance (grid-accelerated)
 */
function nearestWithin(grid: Map<GridKey, Vec2[]>, p: Vec2, cell: number, tol: number): boolean {
  const ix = Math.floor(p.x / cell);
  const iy = Math.floor(p.y / cell);
  let best = Infinity;

  // Check 3x3 neighborhood
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const k = `${ix + dx},${iy + dy}`;
      const arr = grid.get(k);
      if (!arr) continue;

      for (const q of arr) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < best) best = d;
        if (best <= tol) return true;
      }
    }
  }

  return false;
}

/**
 * Count misses (points without nearby match)
 */
function countMisses(pts: Vec2[], targetGrid: Map<GridKey, Vec2[]>, cell: number, tol: number): number {
  let misses = 0;
  for (const p of pts) {
    if (!nearestWithin(targetGrid, p, cell, tol)) {
      misses++;
    }
  }
  return misses;
}

// ============================================================================
// Consistency Checker
// ============================================================================

/**
 * Check geometry consistency between truth and G-code
 */
export function checkGeometryConsistency(inp: ConsistencyInput): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];
  const stats: ConsistencyStats = {
    stepsChecked: 0,
    movesChecked: 0,
    samplesCompared: 0,
    gcodeLines: inp.gcode.split(/\r?\n/).length,
    gcodeCommands: 0,
  };

  // Helper to push issues
  function pushIssue(
    code: string,
    severity: ConsistencySeverity,
    detail: string,
    stepId?: string
  ): void {
    const fp = `${code}|${severity}|${stepId ?? ''}|${detail.slice(0, 100)}`;
    issues.push({ code, severity, detail, stepId, fingerprint: fp });
  }

  // Check for empty G-code
  if (!inp.gcode || inp.gcode.trim().length === 0) {
    pushIssue(CONSISTENCY_CODE.EMPTY_GCODE, 'BLOCK', 'G-code is empty');
    return {
      kind: 'BLOCK',
      issues,
      stats,
      fingerprint: `10.8.2:BLOCK:1:0:0`,
    };
  }

  // Parse G-code
  const cmds = parseGcodeISO(inp.gcode);
  stats.gcodeCommands = cmds.length;

  // Check for unknown commands
  const unknownCmds = cmds.filter(c => c.kind === 'UNKNOWN') as Array<{ kind: 'UNKNOWN'; raw: string }>;
  if (unknownCmds.length > 0) {
    const sample = unknownCmds.slice(0, 3).map(c => c.raw).join(', ');
    pushIssue(
      CONSISTENCY_CODE.UNKNOWN_COMMAND,
      'WARN',
      `Found ${unknownCmds.length} unknown commands: ${sample}...`
    );
  }

  // Check for arc usage (if arc linearization is disallowed)
  if (!inp.policy.allowArcToLineApprox) {
    const hasArcs = cmds.some(c => c.kind === 'ARC');
    const truthHasArcs = Object.values(inp.steps).some(st =>
      st.centerlineSubpaths.some(sp =>
        sp.path.segs.some(s => s.kind === 'ARC')
      )
    );

    if (truthHasArcs && !hasArcs) {
      pushIssue(
        CONSISTENCY_CODE.ARC_LINEARIZED,
        'WARN',
        'Truth has arcs but G-code contains no arc commands (G2/G3)'
      );
    }
  }

  // Reconstruct segments from G-code
  const buckets = gcodeToSegments(cmds);

  // Map stepId -> gcode segments
  const gByStep = new Map<string, Seg2D[]>();
  for (const b of buckets) {
    if (!b.stepId) continue;
    const arr = gByStep.get(b.stepId) ?? [];
    arr.push(...b.segs);
    gByStep.set(b.stepId, arr);
  }

  // Check if any step boundaries were found
  if (gByStep.size === 0 && Object.keys(inp.steps).length > 0) {
    pushIssue(
      CONSISTENCY_CODE.STEP_BOUNDARY_MISSING,
      'WARN',
      'No step boundary comments found in G-code (expected BEGIN <stepId>)'
    );
  }

  const tol = inp.policy.xyTolMM;
  const cell = Math.max(tol, inp.policy.sampleStepMM);

  // Check each truth step
  const sortedStepIds = Object.keys(inp.steps).sort();

  for (const stepId of sortedStepIds) {
    const st = inp.steps[stepId];

    // Only check PROFILE and GROOVE operations (drill has different geometry)
    if (st.opKind !== 'PROFILE' && st.opKind !== 'GROOVE') {
      continue;
    }

    stats.stepsChecked++;

    // Get G-code segments for this step
    const gsegs = gByStep.get(stepId);
    if (!gsegs || gsegs.length === 0) {
      // If step boundaries are missing, we can't definitively say step is missing
      if (gByStep.size > 0) {
        pushIssue(
          CONSISTENCY_CODE.GCODE_STEP_MISSING,
          'BLOCK',
          `No G-code geometry found for step ${stepId}`,
          stepId
        );
      }
      continue;
    }

    stats.movesChecked += gsegs.length;

    // Sample truth centerline paths
    const truthPts: Vec2[] = [];
    for (const sp of st.centerlineSubpaths) {
      const samples = samplePath2D(sp.path, inp.policy.sampleStepMM);
      for (const s of samples) {
        truthPts.push({ x: s.x, y: s.y });
      }
    }

    // Sample G-code segments
    const gPts = sampleSegments(gsegs, inp.policy.sampleStepMM);

    // Check sample counts
    if (truthPts.length < inp.policy.minSamplesRequired || gPts.length < inp.policy.minSamplesRequired) {
      pushIssue(
        CONSISTENCY_CODE.TOO_FEW_SAMPLES,
        'WARN',
        `Low sample count: truth=${truthPts.length}, gcode=${gPts.length}`,
        stepId
      );
      continue;
    }

    // Build grids for comparison
    const gGrid = buildGrid(gPts, cell);
    const tGrid = buildGrid(truthPts, cell);

    // Truth -> G-code: check each truth point has nearby G-code point
    const miss1 = countMisses(truthPts, gGrid, cell, tol);
    stats.samplesCompared += truthPts.length;

    // G-code -> Truth: check each G-code point has nearby truth point
    const miss2 = countMisses(gPts, tGrid, cell, tol);
    stats.samplesCompared += gPts.length;

    // Calculate mismatch rates
    const missRate1 = miss1 / truthPts.length;
    const missRate2 = miss2 / gPts.length;

    // Check against threshold
    if (missRate1 > inp.policy.maxMismatchRate || missRate2 > inp.policy.maxMismatchRate) {
      pushIssue(
        CONSISTENCY_CODE.GEOM_MISMATCH,
        'BLOCK',
        `Geometry mismatch: truth->gcode=${(missRate1 * 100).toFixed(2)}%, gcode->truth=${(missRate2 * 100).toFixed(2)}% (tol=${tol}mm, threshold=${(inp.policy.maxMismatchRate * 100).toFixed(1)}%)`,
        stepId
      );
    }

    // Check for potential unit mismatch (coords way off)
    const gBbox = computeBbox(gPts);
    const tBbox = computeBbox(truthPts);

    if (gBbox && tBbox) {
      const gSize = Math.max(gBbox.max.x - gBbox.min.x, gBbox.max.y - gBbox.min.y);
      const tSize = Math.max(tBbox.max.x - tBbox.min.x, tBbox.max.y - tBbox.min.y);

      // If sizes differ by more than 10x, likely unit mismatch
      if (tSize > 0 && gSize > 0) {
        const ratio = gSize / tSize;
        if (ratio > 10 || ratio < 0.1) {
          pushIssue(
            CONSISTENCY_CODE.UNIT_MISMATCH,
            'BLOCK',
            `Possible unit mismatch: gcode size=${gSize.toFixed(1)}mm, truth size=${tSize.toFixed(1)}mm (ratio=${ratio.toFixed(2)})`,
            stepId
          );
        }
      }
    }
  }

  // Sort issues: BLOCK first, then by code, then by stepId
  issues.sort((a, b) => {
    const sevRank = (s: ConsistencySeverity) => s === 'BLOCK' ? 0 : 1;
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
    '10.8.2',
    kind,
    issues.length.toString(),
    stats.stepsChecked.toString(),
    stats.samplesCompared.toString(),
  ].join(':');

  return { kind, issues, stats, fingerprint };
}

/**
 * Compute bounding box of points
 */
function computeBbox(pts: Vec2[]): { min: Vec2; max: Vec2 } | null {
  if (pts.length === 0) return null;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
  };
}

// ============================================================================
// Gate Artifact Creation
// ============================================================================

/**
 * Create Gate artifact from consistency report
 */
export function createGateConsistencyArtifact(report: ConsistencyReport): GateConsistencyArtifact {
  // Count issues by category
  const counts = {
    mismatch: 0,
    missing: 0,
    lowSamples: 0,
    other: 0,
  };

  for (const issue of report.issues) {
    switch (issue.code) {
      case CONSISTENCY_CODE.GEOM_MISMATCH:
      case CONSISTENCY_CODE.UNIT_MISMATCH:
        counts.mismatch++;
        break;
      case CONSISTENCY_CODE.GCODE_STEP_MISSING:
      case CONSISTENCY_CODE.EMPTY_GCODE:
        counts.missing++;
        break;
      case CONSISTENCY_CODE.TOO_FEW_SAMPLES:
        counts.lowSamples++;
        break;
      default:
        counts.other++;
    }
  }

  // Top issues (first 10)
  const issuesTop = report.issues.slice(0, 10);

  return {
    consistencyFingerprint: report.fingerprint,
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
 * Check if consistency check passed
 */
export function isConsistencyPassed(report: ConsistencyReport): boolean {
  return report.kind === 'OK';
}

/**
 * Get all BLOCK issues
 */
export function getConsistencyBlockingIssues(report: ConsistencyReport): ConsistencyIssue[] {
  return report.issues.filter(i => i.severity === 'BLOCK');
}

/**
 * Get all WARN issues
 */
export function getConsistencyWarningIssues(report: ConsistencyReport): ConsistencyIssue[] {
  return report.issues.filter(i => i.severity === 'WARN');
}

/**
 * Summarize consistency report
 */
export function summarizeConsistencyReport(report: ConsistencyReport): string {
  const lines: string[] = [
    `Geometry Consistency Check: ${report.kind}`,
    `  Issues: ${report.issues.length} (BLOCK: ${getConsistencyBlockingIssues(report).length}, WARN: ${getConsistencyWarningIssues(report).length})`,
    `  Stats:`,
    `    - Steps checked: ${report.stats.stepsChecked}`,
    `    - Moves checked: ${report.stats.movesChecked}`,
    `    - Samples compared: ${report.stats.samplesCompared}`,
    `    - G-code lines: ${report.stats.gcodeLines}`,
    `    - G-code commands: ${report.stats.gcodeCommands}`,
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
 * Create consistency policy with overrides
 */
export function createConsistencyPolicy(overrides?: Partial<ConsistencyPolicy>): ConsistencyPolicy {
  return { ...DEFAULT_CONSISTENCY_POLICY, ...overrides };
}

/**
 * Create consistency input
 */
export function createConsistencyInput(
  steps: Record<string, StepTruth>,
  gcode: string,
  dialect: DialectId,
  policy?: ConsistencyPolicy
): ConsistencyInput {
  return {
    steps,
    gcode,
    dialect,
    policy: policy ?? DEFAULT_CONSISTENCY_POLICY,
  };
}

/**
 * Get G-code statistics without full consistency check
 */
export function getGcodeStats(gcode: string): {
  lines: number;
  commands: number;
  rapids: number;
  feeds: number;
  arcs: number;
  comments: number;
} {
  const cmds = parseGcodeISO(gcode);

  return {
    lines: gcode.split(/\r?\n/).length,
    commands: cmds.length,
    rapids: cmds.filter(c => c.kind === 'RAPID').length,
    feeds: cmds.filter(c => c.kind === 'FEED').length,
    arcs: cmds.filter(c => c.kind === 'ARC').length,
    comments: cmds.filter(c => c.kind === 'COMMENT').length,
  };
}

/**
 * Validate G-code format (basic sanity check)
 */
export function validateGcodeFormat(gcode: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!gcode || gcode.trim().length === 0) {
    issues.push('G-code is empty');
    return { valid: false, issues };
  }

  const lines = gcode.split(/\r?\n/);
  const cmds = parseGcodeISO(gcode);

  // Check for minimum content
  if (cmds.length < 3) {
    issues.push(`Too few commands (${cmds.length})`);
  }

  // Check for motion commands
  const hasMotion = cmds.some(c => c.kind === 'RAPID' || c.kind === 'FEED' || c.kind === 'ARC');
  if (!hasMotion) {
    issues.push('No motion commands found (G0/G1/G2/G3)');
  }

  // Check for very long lines (potential formatting issue)
  const longLines = lines.filter(l => l.length > 500);
  if (longLines.length > 0) {
    issues.push(`Found ${longLines.length} very long lines (>500 chars)`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
