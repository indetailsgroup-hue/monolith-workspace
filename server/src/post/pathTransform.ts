/**
 * Path Transform
 *
 * Step 10.5.4: Transform paths by part placement and rotation
 *
 * Handles coordinate transformation from part-local to sheet-global:
 * - Part placement (x, y offset)
 * - Part rotation (0° or 90°)
 * - Both endpoints and arc centers
 */

import type { Path, Pt, Segment, SegLine, SegArc } from './planTypes.js';

// ============================================================================
// Transform Context
// ============================================================================

export interface PathTransformContext {
  /** Part width in part-local coordinates */
  partW: number;
  /** Part height in part-local coordinates */
  partH: number;
  /** Part rotation (0 or 90 degrees) */
  rot: 0 | 90;
  /** Part placement X on sheet */
  placeX: number;
  /** Part placement Y on sheet */
  placeY: number;
}

// ============================================================================
// Point Transform
// ============================================================================

/**
 * Transform a point from part-local to sheet-global coordinates.
 *
 * For rotation = 0: direct translation
 * For rotation = 90: rotate 90° CCW then translate
 */
export function transformPoint(
  p: Pt,
  ctx: PathTransformContext
): Pt {
  const { partW, partH, rot, placeX, placeY } = ctx;

  if (rot === 0) {
    // No rotation, just translate
    return {
      x: placeX + p.x,
      y: placeY + p.y,
    };
  }

  // 90° CCW rotation: (x, y) -> (-y + partH, x)
  // Then translate by placement
  return {
    x: placeX + (partH - p.y),
    y: placeY + p.x,
  };
}

// ============================================================================
// Segment Transform
// ============================================================================

/**
 * Transform a line segment.
 */
function transformLineSegment(
  seg: SegLine,
  ctx: PathTransformContext
): SegLine {
  return {
    kind: 'LINE',
    a: transformPoint(seg.a, ctx),
    b: transformPoint(seg.b, ctx),
  };
}

/**
 * Transform an arc segment.
 *
 * Note: For rigid transformations (rotation + translation),
 * the CW/CCW direction is preserved.
 */
function transformArcSegment(
  seg: SegArc,
  ctx: PathTransformContext
): SegArc {
  const center = transformPoint(seg.c, ctx);
  const start = transformPoint(seg.start, ctx);
  const end = transformPoint(seg.end, ctx);

  // For 90° rotation, angles rotate by 90°
  let startDeg = seg.startDeg;
  let endDeg = seg.endDeg;

  if (ctx.rot === 90) {
    // Rotate angles by 90° CCW
    startDeg = (seg.startDeg + 90) % 360;
    endDeg = (seg.endDeg + 90) % 360;
  }

  return {
    kind: 'ARC',
    c: center,
    r: seg.r, // Radius preserved
    startDeg,
    endDeg,
    cw: seg.cw, // Direction preserved for rigid transform
    start,
    end,
  };
}

/**
 * Transform a single segment.
 */
function transformSegment(
  seg: Segment,
  ctx: PathTransformContext
): Segment {
  if (seg.kind === 'LINE') {
    return transformLineSegment(seg, ctx);
  }
  return transformArcSegment(seg, ctx);
}

// ============================================================================
// Path Transform
// ============================================================================

/**
 * Transform a complete path from part-local to sheet-global coordinates.
 *
 * @param path - Path in part-local coordinates
 * @param ctx - Transform context
 * @returns Path in sheet-global coordinates
 */
export function transformPath(
  path: Path,
  ctx: PathTransformContext
): Path {
  return {
    closed: path.closed,
    segs: path.segs.map(seg => transformSegment(seg, ctx)),
    winding: path.winding, // Winding preserved for rigid transform
  };
}

/**
 * Transform path with separate parameters (convenience function).
 */
export function transformPathPartToSheet(input: {
  path: Path;
  partW: number;
  partH: number;
  rot: 0 | 90;
  placeX: number;
  placeY: number;
}): Path {
  return transformPath(input.path, {
    partW: input.partW,
    partH: input.partH,
    rot: input.rot,
    placeX: input.placeX,
    placeY: input.placeY,
  });
}

// ============================================================================
// Batch Transform
// ============================================================================

/**
 * Transform multiple paths with the same context.
 */
export function transformPaths(
  paths: Path[],
  ctx: PathTransformContext
): Path[] {
  return paths.map(path => transformPath(path, ctx));
}

// ============================================================================
// Inverse Transform (Sheet to Part)
// ============================================================================

/**
 * Transform a point from sheet-global to part-local coordinates.
 */
export function inverseTransformPoint(
  p: Pt,
  ctx: PathTransformContext
): Pt {
  const { partW, partH, rot, placeX, placeY } = ctx;

  if (rot === 0) {
    return {
      x: p.x - placeX,
      y: p.y - placeY,
    };
  }

  // Inverse of 90° CCW rotation
  // Forward: (x, y) -> (partH - y + placeX, x + placeY)
  // Inverse: (sx, sy) -> (sy - placeY, partH - (sx - placeX))
  return {
    x: p.y - placeY,
    y: partH - (p.x - placeX),
  };
}

/**
 * Transform a path from sheet-global to part-local coordinates.
 */
export function inverseTransformPath(
  path: Path,
  ctx: PathTransformContext
): Path {
  const inverseCtx: PathTransformContext = {
    ...ctx,
    // For inverse, we apply opposite rotation
    rot: ctx.rot === 0 ? 0 : 90,
  };

  // For proper inverse, we need custom logic
  const segs = path.segs.map(seg => {
    if (seg.kind === 'LINE') {
      return {
        kind: 'LINE' as const,
        a: inverseTransformPoint(seg.a, ctx),
        b: inverseTransformPoint(seg.b, ctx),
      };
    }
    const arc = seg as SegArc;
    let startDeg = arc.startDeg;
    let endDeg = arc.endDeg;
    if (ctx.rot === 90) {
      startDeg = (arc.startDeg - 90 + 360) % 360;
      endDeg = (arc.endDeg - 90 + 360) % 360;
    }
    return {
      kind: 'ARC' as const,
      c: inverseTransformPoint(arc.c, ctx),
      r: arc.r,
      startDeg,
      endDeg,
      cw: arc.cw,
      start: inverseTransformPoint(arc.start, ctx),
      end: inverseTransformPoint(arc.end, ctx),
    };
  });

  return {
    closed: path.closed,
    segs,
    winding: path.winding,
  };
}
