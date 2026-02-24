// src/core/manufacturing/verify/geom/irExtract.v1.ts
/**
 * IR Geometry Extraction.
 *
 * Extracts executed cut geometry from IRProgram + TraceMap.
 * Converts IR moves to canonical geometry for comparison.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

import { IRProgram, IRMove } from "../../gcode/ir/gcodeIr.v1";
import { TraceMap, TraceStage } from "../../post/ir/traceMap.v1";
import { Point2D, BBox } from "./canonicalGeom.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Cut trace segment (extracted from IR).
 */
export interface CutTraceSeg {
  /** Segment kind */
  kind: "LINE" | "ARC";

  /** Start point */
  a: Point2D;

  /** End point */
  b: Point2D;

  /** Arc center (if arc) */
  c?: Point2D;

  /** Arc radius (if arc) */
  r?: number;

  /** Arc direction (if arc) */
  cw?: boolean;

  /** Source move index */
  moveIndex?: number;
}

/**
 * Executed path (extracted from IR).
 */
export interface ExecutedPath {
  /** Execution path ID */
  execPathId: string;

  /** Operation ID (from trace) */
  opId?: string;

  /** Part ID (from trace) */
  partId?: string;

  /** Manufacturing stage */
  stage?: TraceStage;

  /** Tool ID used */
  toolId?: string;

  /** Cutting Z level */
  z?: number;

  /** Path segments */
  segs: CutTraceSeg[];

  /** Is path closed (hint) */
  closedHint?: boolean;

  /** Bounding box */
  bbox: BBox;

  /** Total path length (mm) */
  lengthMm: number;

  /** Move index range */
  moveRange?: { start: number; end: number };
}

/**
 * Executed model (all extracted geometry).
 */
export interface ExecutedModel {
  /** Model version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** All extracted paths */
  paths: ExecutedPath[];

  /** Audit fingerprint */
  auditFp: string;

  /** Extraction timestamp */
  extractedAt?: string;

  /** Extractor version */
  extractorVersion?: string;
}

// =============================================================================
// EXTRACTION
// =============================================================================

/**
 * Extraction options.
 */
export interface ExtractionOptions {
  /** Safe Z threshold for cut detection */
  safeZThreshold: number;

  /** Continuity tolerance (mm) */
  continuityTol: number;

  /** Only extract CUT trace kinds */
  onlyCutTraces: boolean;

  /** Minimum segment length to include */
  minSegLength: number;
}

/**
 * Default extraction options.
 */
export const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
  safeZThreshold: 0.5,
  continuityTol: 0.1,
  onlyCutTraces: true,
  minSegLength: 0.01,
};

/**
 * Extract executed geometry from IR program.
 *
 * @param program IR program
 * @param traceMap Trace map (aligned with moves)
 * @param safeZ Safe Z height
 * @param options Extraction options
 * @returns Executed model
 */
export function extractExecutedGeometry(
  program: IRProgram,
  traceMap: TraceMap,
  safeZ: number,
  options: Partial<ExtractionOptions> = {}
): ExecutedModel {
  const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
  const paths: ExecutedPath[] = [];

  // State
  let x = 0,
    y = 0,
    z = safeZ;
  let currentPath: CutTraceSeg[] = [];
  let currentMeta: {
    opId?: string;
    partId?: string;
    stage?: TraceStage;
    toolId?: string;
    z?: number;
    startMove: number;
  } | null = null;

  const moves = program.moves;
  const traces = traceMap.traces;

  // Finalize current path
  function finalizePath(endMove: number): void {
    if (currentPath.length === 0 || !currentMeta) return;

    const bbox = calculateSegsBBox(currentPath);
    const lengthMm = calculateSegsLength(currentPath);
    const closedHint = isPathClosedHint(currentPath, opts.continuityTol);

    const execPath: ExecutedPath = {
      execPathId: `exec_${paths.length}`,
      opId: currentMeta.opId,
      partId: currentMeta.partId,
      stage: currentMeta.stage,
      toolId: currentMeta.toolId,
      z: currentMeta.z,
      segs: currentPath,
      closedHint,
      bbox,
      lengthMm,
      moveRange: { start: currentMeta.startMove, end: endMove },
    };

    paths.push(execPath);
    currentPath = [];
    currentMeta = null;
  }

  // Process moves
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const trace = traces[i];

    // RAPID - break current path
    if (move.kind === "RAPID") {
      finalizePath(i - 1);
      x = move.x ?? x;
      y = move.y ?? y;
      z = move.z ?? z;
      continue;
    }

    // LINEAR
    if (move.kind === "LINEAR") {
      const nx = move.x ?? x;
      const ny = move.y ?? y;
      const nz = move.z ?? z;

      // Check if this is a cut move
      const isCut = opts.onlyCutTraces
        ? trace?.kind === "CUT"
        : nz < safeZ - opts.safeZThreshold;

      if (isCut) {
        // Check continuity
        if (currentPath.length > 0) {
          const lastEnd = currentPath[currentPath.length - 1].b;
          const dist = Math.hypot(x - lastEnd.x, y - lastEnd.y);
          if (dist > opts.continuityTol) {
            finalizePath(i - 1);
          }
        }

        // Start new path if needed
        if (!currentMeta) {
          currentMeta = {
            opId: trace?.opId,
            partId: trace?.partId,
            stage: trace?.stage,
            toolId: trace?.toolId,
            z: nz,
            startMove: i,
          };
        }

        // Add segment
        const segLen = Math.hypot(nx - x, ny - y);
        if (segLen >= opts.minSegLength) {
          currentPath.push({
            kind: "LINE",
            a: { x, y },
            b: { x: nx, y: ny },
            moveIndex: i,
          });
        }
      } else {
        // Not a cut - finalize current path
        finalizePath(i - 1);
      }

      x = nx;
      y = ny;
      z = nz;
      continue;
    }

    // ARC
    if (move.kind === "ARC_CW" || move.kind === "ARC_CCW") {
      const nx = move.x;
      const ny = move.y;
      const cx = x + move.i;
      const cy = y + move.j;
      const isClockwise = move.kind === "ARC_CW";

      // Check if this is a cut move
      const isCut = opts.onlyCutTraces
        ? trace?.kind === "CUT"
        : z < safeZ - opts.safeZThreshold;

      if (isCut) {
        // Check continuity
        if (currentPath.length > 0) {
          const lastEnd = currentPath[currentPath.length - 1].b;
          const dist = Math.hypot(x - lastEnd.x, y - lastEnd.y);
          if (dist > opts.continuityTol) {
            finalizePath(i - 1);
          }
        }

        // Start new path if needed
        if (!currentMeta) {
          currentMeta = {
            opId: trace?.opId,
            partId: trace?.partId,
            stage: trace?.stage,
            toolId: trace?.toolId,
            z: z,
            startMove: i,
          };
        }

        // Calculate radius
        const r = Math.hypot(x - cx, y - cy);

        // Add arc segment
        currentPath.push({
          kind: "ARC",
          a: { x, y },
          b: { x: nx, y: ny },
          c: { x: cx, y: cy },
          r,
          cw: isClockwise,
          moveIndex: i,
        });
      } else {
        finalizePath(i - 1);
      }

      x = nx;
      y = ny;
      continue;
    }

    // Other moves - potentially break path
    if (move.kind === "TOOL_CHANGE" || move.kind === "SPINDLE_OFF") {
      finalizePath(i - 1);
    }
  }

  // Finalize any remaining path
  finalizePath(moves.length - 1);

  return {
    version: "1.0",
    jobId: program.jobId,
    sheetId: program.sheetId,
    paths,
    auditFp: program.audit.irFp,
    extractedAt: new Date().toISOString(),
    extractorVersion: "0.10.8.2",
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate bounding box from segments.
 */
function calculateSegsBBox(segs: CutTraceSeg[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const seg of segs) {
    minX = Math.min(minX, seg.a.x, seg.b.x);
    minY = Math.min(minY, seg.a.y, seg.b.y);
    maxX = Math.max(maxX, seg.a.x, seg.b.x);
    maxY = Math.max(maxY, seg.a.y, seg.b.y);

    if (seg.kind === "ARC" && seg.c && seg.r) {
      // Simplified arc bbox (add center +/- radius)
      minX = Math.min(minX, seg.c.x - seg.r);
      minY = Math.min(minY, seg.c.y - seg.r);
      maxX = Math.max(maxX, seg.c.x + seg.r);
      maxY = Math.max(maxY, seg.c.y + seg.r);
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate total length of segments.
 */
function calculateSegsLength(segs: CutTraceSeg[]): number {
  let total = 0;

  for (const seg of segs) {
    if (seg.kind === "LINE") {
      total += Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
    } else if (seg.kind === "ARC" && seg.r) {
      // Arc length = r * |sweep|
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const chord = Math.hypot(dx, dy);
      // Approximate sweep from chord
      const sweep = 2 * Math.asin(Math.min(1, chord / (2 * seg.r)));
      total += seg.r * sweep;
    }
  }

  return total;
}

/**
 * Check if path forms a closed loop.
 */
function isPathClosedHint(segs: CutTraceSeg[], tolerance: number): boolean {
  if (segs.length === 0) return false;

  const start = segs[0].a;
  const end = segs[segs.length - 1].b;

  return Math.hypot(end.x - start.x, end.y - start.y) <= tolerance;
}

/**
 * Get executed paths for a specific part.
 */
export function getPathsForPart(
  model: ExecutedModel,
  partId: string
): ExecutedPath[] {
  return model.paths.filter((p) => p.partId === partId);
}

/**
 * Get executed paths for a specific stage.
 */
export function getPathsForStage(
  model: ExecutedModel,
  stage: TraceStage
): ExecutedPath[] {
  return model.paths.filter((p) => p.stage === stage);
}

/**
 * Get THROUGH paths for a part.
 */
export function getThroughPathsForPart(
  model: ExecutedModel,
  partId: string
): ExecutedPath[] {
  return model.paths.filter((p) => p.partId === partId && p.stage === "THROUGH");
}

/**
 * Find longest path (likely outer boundary).
 */
export function findLongestPath(paths: ExecutedPath[]): ExecutedPath | undefined {
  if (paths.length === 0) return undefined;

  return paths.reduce((longest, path) =>
    path.lengthMm > longest.lengthMm ? path : longest
  );
}

/**
 * Check if two bboxes overlap.
 */
export function bboxOverlap(a: BBox, b: BBox, tolerance: number = 0): boolean {
  return !(
    a.maxX < b.minX - tolerance ||
    a.minX > b.maxX + tolerance ||
    a.maxY < b.minY - tolerance ||
    a.minY > b.maxY + tolerance
  );
}
