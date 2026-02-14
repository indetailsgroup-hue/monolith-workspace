/**
 * Path Emit
 *
 * Step 10.5.4: Emit paths as G-code (G1/G2/G3 commands)
 *
 * Converts Path objects to G-code motion commands:
 * - LINE segments → G1 (linear feed)
 * - ARC segments → G2 (CW) or G3 (CCW)
 */

import type { Path, Pt, SegLine, SegArc } from './planTypes.js';
import type { GCode } from './gcodeWriter.js';
import { pathStart } from './planTypes.js';

// ============================================================================
// Position Tracking
// ============================================================================

/**
 * Mutable state for tracking current tool position.
 */
export interface PositionState {
  x: number;
  y: number;
}

// ============================================================================
// Movement Helpers
// ============================================================================

/**
 * Rapid move to path start point.
 */
export function rapidToPathStart(
  gcode: GCode,
  path: Path,
  clearanceZ: number
): PositionState {
  const start = pathStart(path);
  gcode.safeZ();
  gcode.rapid(start.x, start.y);
  return { x: start.x, y: start.y };
}

/**
 * Move to a specific point at clearance Z.
 */
export function moveToPoint(
  gcode: GCode,
  pt: Pt,
  clearanceZ: number
): PositionState {
  gcode.rapid(undefined, undefined, clearanceZ);
  gcode.rapid(pt.x, pt.y);
  return { x: pt.x, y: pt.y };
}

// ============================================================================
// Segment Emission
// ============================================================================

/**
 * Emit a line segment as G1.
 */
function emitLineSegment(
  gcode: GCode,
  seg: SegLine,
  feed: number,
  state: PositionState
): void {
  gcode.linear(seg.b.x, seg.b.y, undefined, feed);
  state.x = seg.b.x;
  state.y = seg.b.y;
}

/**
 * Emit an arc segment as G2 (CW) or G3 (CCW).
 *
 * Uses I/J format (relative offset from current position to arc center).
 */
function emitArcSegment(
  gcode: GCode,
  seg: SegArc,
  feed: number,
  state: PositionState
): void {
  // Calculate I/J: relative offset from current position to center
  const I = seg.c.x - state.x;
  const J = seg.c.y - state.y;

  if (seg.cw) {
    // G2: Clockwise arc
    gcode.arcCW(seg.end.x, seg.end.y, I, J, feed);
  } else {
    // G3: Counter-clockwise arc
    gcode.arcCCW(seg.end.x, seg.end.y, I, J, feed);
  }

  state.x = seg.end.x;
  state.y = seg.end.y;
}

// ============================================================================
// Path Emission
// ============================================================================

/**
 * Emit a complete path at the current Z level.
 *
 * @param gcode - G-code writer
 * @param path - Path to emit
 * @param feed - Feed rate (mm/min)
 * @param state - Current position state (mutated)
 */
export function emitPathAtCurrentZ(
  gcode: GCode,
  path: Path,
  feed: number,
  state: PositionState
): void {
  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      emitLineSegment(gcode, seg as SegLine, feed, state);
    } else {
      emitArcSegment(gcode, seg as SegArc, feed, state);
    }
  }
}

/**
 * Emit path with lead-in positioning.
 *
 * Assumes tool is at clearance Z and needs to:
 * 1. Position above lead-in point
 * 2. Plunge to cutting depth
 * 3. Move to path start (if lead-in used)
 * 4. Cut the path
 */
export function emitPathWithSetup(
  gcode: GCode,
  path: Path,
  z: number,
  feed: number,
  plungeFeed: number,
  leadInPt?: Pt
): PositionState {
  const start = pathStart(path);
  const entryPt = leadInPt ?? start;

  // Position above entry point
  gcode.rapid(entryPt.x, entryPt.y);

  // Plunge to cutting depth
  gcode.linear(undefined, undefined, z, plungeFeed);

  // If using lead-in, move to actual path start
  const state: PositionState = { x: entryPt.x, y: entryPt.y };
  if (leadInPt && (leadInPt.x !== start.x || leadInPt.y !== start.y)) {
    gcode.linear(start.x, start.y, undefined, feed);
    state.x = start.x;
    state.y = start.y;
  }

  // Emit the path
  emitPathAtCurrentZ(gcode, path, feed, state);

  return state;
}

// ============================================================================
// Multi-Pass Path Emission
// ============================================================================

export interface MultiPassOptions {
  /** Z depths to cut at (array of negative values) */
  depths: number[];
  /** Feed rate for cutting */
  cutFeed: number;
  /** Feed rate for plunging */
  plungeFeed: number;
  /** Clearance Z for rapids */
  clearanceZ: number;
  /** Lead-in point (optional) */
  leadInPt?: Pt;
  /** Lead-out point (optional) */
  leadOutPt?: Pt;
}

/**
 * Emit path with multiple depth passes.
 *
 * @param gcode - G-code writer
 * @param path - Path to cut
 * @param options - Multi-pass options
 * @returns Final position state
 */
export function emitPathMultiPass(
  gcode: GCode,
  path: Path,
  options: MultiPassOptions
): PositionState {
  const { depths, cutFeed, plungeFeed, clearanceZ, leadInPt, leadOutPt } = options;
  const start = pathStart(path);
  const entryPt = leadInPt ?? start;

  let state: PositionState = { x: 0, y: 0 };

  for (const z of depths) {
    // Rapid to clearance Z
    gcode.rapid(undefined, undefined, clearanceZ);

    // Position above entry point
    gcode.rapid(entryPt.x, entryPt.y);

    // Plunge to cutting depth
    gcode.linear(undefined, undefined, z, plungeFeed);

    state = { x: entryPt.x, y: entryPt.y };

    // Move to path start if using lead-in
    if (leadInPt && (leadInPt.x !== start.x || leadInPt.y !== start.y)) {
      gcode.linear(start.x, start.y, undefined, cutFeed);
      state.x = start.x;
      state.y = start.y;
    }

    // Cut the path
    emitPathAtCurrentZ(gcode, path, cutFeed, state);

    // Lead-out if provided
    if (leadOutPt) {
      gcode.linear(leadOutPt.x, leadOutPt.y, undefined, cutFeed);
      state.x = leadOutPt.x;
      state.y = leadOutPt.y;
    }
  }

  // Final retract
  gcode.rapid(undefined, undefined, clearanceZ);

  return state;
}

// ============================================================================
// Path Start/End Tangent Helpers
// ============================================================================

/**
 * Get the tangent direction at the start of a path.
 * Returns a unit vector pointing in the direction of travel.
 */
export function pathStartTangent(path: Path): Pt {
  if (path.segs.length === 0) {
    return { x: 1, y: 0 }; // Default: +X direction
  }

  const seg = path.segs[0];

  if (seg.kind === 'LINE') {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // Arc: tangent is perpendicular to radius at start
  const arc = seg as SegArc;
  const rx = arc.start.x - arc.c.x;
  const ry = arc.start.y - arc.c.y;

  // Tangent direction depends on CW/CCW
  // CCW: tangent is 90° CCW from radius
  // CW: tangent is 90° CW from radius
  let tx: number, ty: number;
  if (arc.cw) {
    tx = ry;
    ty = -rx;
  } else {
    tx = -ry;
    ty = rx;
  }

  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

/**
 * Get the tangent direction at the end of a path.
 * Returns a unit vector pointing in the direction of travel.
 */
export function pathEndTangent(path: Path): Pt {
  if (path.segs.length === 0) {
    return { x: 1, y: 0 };
  }

  const seg = path.segs[path.segs.length - 1];

  if (seg.kind === 'LINE') {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // Arc: tangent at end
  const arc = seg as SegArc;
  const rx = arc.end.x - arc.c.x;
  const ry = arc.end.y - arc.c.y;

  let tx: number, ty: number;
  if (arc.cw) {
    tx = ry;
    ty = -rx;
  } else {
    tx = -ry;
    ty = rx;
  }

  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}
