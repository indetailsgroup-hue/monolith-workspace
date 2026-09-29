/**
 * Curve Profile Validation & Arc Segment Computation
 *
 * Phase 1 of the Curved Panel System (spec: .kiro/specs/curved-panel-system/).
 *
 * Responsibilities:
 *   - Validate PanelProfile geometry against panel dimensions
 *   - Compute arc segments (start/end angle, centre, sweep) for rendering / export
 *   - Compute Kerf_Zone (the region of the panel that must carry kerf cuts)
 *   - Surface G12 error codes as string arrays (gate wired in Phase 3)
 *
 * NOT responsible for:
 *   - Kerf cut generation (Phase 2: kerfPatternGenerator.ts)
 *   - Gate enforcement (Phase 3: gateG12_curveManufacturability.ts)
 *   - 3-D rendering (Phase 5)
 *   - Export (Phase 6)
 */

import type { PanelProfile, PanelEdge } from '../../types/Cabinet';

// ============================================
// RESULT TYPES
// ============================================

/** A single 2-D arc segment described in the panel's local XY plane. */
export interface ArcSegment {
  /** Centre of the circle that defines this arc (panel local coords, mm). */
  cx: number;
  cy: number;
  /** Radius (mm). */
  radius: number;
  /** Start angle in radians (standard math convention: CCW from +X). */
  startAngle: number;
  /** Sweep angle in radians (positive = CCW). */
  sweepAngle: number;
  /** Which panel edge this arc segment belongs to. */
  edge: PanelEdge;
}

/**
 * Kerf_Zone — the strip of the panel that must receive kerf cuts.
 *
 * The zone is expressed as a range along the edge direction (mm from the
 * panel's origin corner on that edge) and the kerf depth direction (mm from
 * the kerf face — i.e. the opposite face to the finished outer surface).
 *
 *   start / end  — position along the edge (0 = closer corner, mm)
 *   depth        — how far the kerf zone extends perpendicular to the edge (mm)
 *                  ≈ arc developed length; exact value computed by Phase 2 engine
 */
export interface KerfZone {
  edge: PanelEdge;
  start: number;   // mm from origin corner along edge
  end: number;     // mm from origin corner along edge
  depth: number;   // developed length of the bend zone (mm) ≈ arc length outer face
}

/** Full validation + geometry result for a panel's PanelProfile. */
export interface CurveProfileResult {
  /** True when profile passes all geometric feasibility checks. */
  valid: boolean;
  /** G12 error codes from the validation (BLOCKER + WARNING). */
  errors: string[];
  /** Arc segments for rendering / DXF export. */
  arcSegments: ArcSegment[];
  /** Kerf zone descriptors (one per distinct bend edge). */
  kerfZones: KerfZone[];
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Return the dimension of the panel along the given edge (width or height).
 * LEFT/RIGHT edges run along the height axis; TOP/BOTTOM run along the width.
 */
function edgeLength(edge: PanelEdge, w: number, h: number): number {
  return edge === 'LEFT' || edge === 'RIGHT' ? h : w;
}

/**
 * Return the panel dimension perpendicular to the edge (depth-of-bend).
 * Used to check R ≤ half-dimension (spec: radius must fit inside the panel).
 */
function edgeDepth(edge: PanelEdge, w: number, h: number): number {
  return edge === 'LEFT' || edge === 'RIGHT' ? w : h;
}

// ============================================
// ARC CENTRE CALCULATION
// ============================================

/**
 * Compute the centre of the bending circle for a single-arc edge.
 *
 * Coordinate system: panel lower-left = (0, 0); X = width; Y = height.
 * The arc centre is inset from the edge by `radius` (the bend is concave
 * when viewed from inside the cabinet).
 */
function arcCentre(
  edge: PanelEdge,
  radius: number,
  w: number,
  h: number
): { cx: number; cy: number } {
  switch (edge) {
    case 'TOP':    return { cx: w / 2, cy: h - radius };
    case 'BOTTOM': return { cx: w / 2, cy: radius };
    case 'LEFT':   return { cx: radius, cy: h / 2 };
    case 'RIGHT':  return { cx: w - radius, cy: h / 2 };
  }
}

/** Start angle (rad) for the arc on a given edge (tangent-entry from left corner). */
function arcStartAngle(edge: PanelEdge): number {
  switch (edge) {
    case 'TOP':    return Math.PI;           // 180° — arc sweeps CW from left end
    case 'BOTTOM': return 0;                 //   0° — arc sweeps CCW from right end
    case 'LEFT':   return Math.PI * 1.5;     // 270° — arc sweeps from bottom
    case 'RIGHT':  return Math.PI * 0.5;     //  90° — arc sweeps from top
  }
}

// ============================================
// VALIDATE PROFILE
// ============================================

/**
 * Validate a PanelProfile against the panel's finish dimensions.
 *
 * Returns errors[] only — geometry (arcSegments, kerfZones) is populated by
 * `computeCurveProfile()` only when valid === true.
 *
 * G12 codes surfaced here (Phase 1 subset; full gate in Phase 3):
 *   G12_RADIUS_BELOW_MIN — radius zero or negative
 *   G12_FITTING_IN_KERF_ZONE — radius > half the perpendicular dimension (arc won't fit)
 *   G12_SCURVE_TRANSITION_SHORT — r1 == r2 and sweepDeg1 + sweepDeg2 ≥ 180° (WARNING)
 */
export function validatePanelProfile(
  profile: PanelProfile,
  finishWidth: number,
  finishHeight: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (profile.kind === 'RECT') {
    return { valid: true, errors: [] };
  }

  if (profile.kind === 'ROUNDED_CORNER') {
    const { corners } = profile;
    const defined = [corners.TL, corners.TR, corners.BL, corners.BR].filter(
      (r): r is number => r !== undefined
    );
    for (const r of defined) {
      if (r <= 0) {
        errors.push('G12_RADIUS_BELOW_MIN');
      }
    }
    // Check adjacent corners don't overlap on shorter dimension
    const minDim = Math.min(finishWidth, finishHeight);
    const maxCornerSum = (corners.TL ?? 0) + (corners.BR ?? 0);
    const maxCornerSum2 = (corners.TR ?? 0) + (corners.BL ?? 0);
    if (maxCornerSum > minDim || maxCornerSum2 > minDim) {
      errors.push('G12_FITTING_IN_KERF_ZONE');
    }
    return { valid: errors.length === 0, errors };
  }

  if (profile.kind === 'ARC') {
    const { edge, radius, sweepDeg } = profile;
    if (radius <= 0) {
      errors.push('G12_RADIUS_BELOW_MIN');
    }
    if (sweepDeg <= 0 || sweepDeg > 180) {
      errors.push('G12_FITTING_IN_KERF_ZONE');
    }
    // Radius must fit inside the panel perpendicular to the edge
    const perp = edgeDepth(edge, finishWidth, finishHeight);
    if (radius > perp / 2) {
      errors.push('G12_FITTING_IN_KERF_ZONE');
    }
    return { valid: errors.length === 0, errors };
  }

  if (profile.kind === 'S_CURVE') {
    const { edge, r1, r2, sweepDeg1, sweepDeg2 } = profile;
    if (r1 <= 0 || r2 <= 0) {
      errors.push('G12_RADIUS_BELOW_MIN');
    }
    if (sweepDeg1 <= 0 || sweepDeg2 <= 0) {
      errors.push('G12_FITTING_IN_KERF_ZONE');
    }
    // Tangency warning: if radii equal and combined sweep ≥ 180° → inflection is near-degenerate
    if (r1 === r2 && sweepDeg1 + sweepDeg2 >= 180) {
      errors.push('G12_SCURVE_TRANSITION_SHORT');  // WARNING — not a full blocker
    }
    // Combined footprint check: both arcs must fit along the edge
    const along = edgeLength(edge, finishWidth, finishHeight);
    // Chord footprint per arc ≈ 2R × sin(sweep/2); sum must be ≤ edge length
    const chord1 = 2 * r1 * Math.sin((sweepDeg1 * Math.PI) / 360);
    const chord2 = 2 * r2 * Math.sin((sweepDeg2 * Math.PI) / 360);
    if (chord1 + chord2 > along) {
      errors.push('G12_FITTING_IN_KERF_ZONE');
    }
    return { valid: errors.filter(e => e !== 'G12_SCURVE_TRANSITION_SHORT').length === 0, errors };
  }

  // Exhaustive check — should never reach here with a typed union
  return { valid: true, errors: [] };
}

// ============================================
// COMPUTE ARC SEGMENTS & KERF ZONES
// ============================================

/**
 * Compute arc segments and kerf zones for a validated ARC profile.
 * Assumes profile has already passed validatePanelProfile().
 */
function computeArcSegments(
  edge: PanelEdge,
  radius: number,
  sweepDeg: number,
  w: number,
  h: number
): { arcSegments: ArcSegment[]; kerfZones: KerfZone[] } {
  const { cx, cy } = arcCentre(edge, radius, w, h);
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const startAngle = arcStartAngle(edge);

  const arcSegments: ArcSegment[] = [
    { cx, cy, radius, startAngle, sweepAngle: sweepRad, edge },
  ];

  // Kerf zone: strip along the edge, depth = outer arc length
  const L_outer = radius * sweepRad;  // arc length at the given radius (inner face)
  const along = edgeLength(edge, w, h);
  // Zone spans the arc's projected footprint; approximate as chord + 10% margin
  const halfChord = radius * Math.sin(sweepRad / 2);
  const start = Math.max(0, along / 2 - halfChord * 1.1);
  const end   = Math.min(along, along / 2 + halfChord * 1.1);

  const kerfZones: KerfZone[] = [{ edge, start, end, depth: L_outer }];

  return { arcSegments, kerfZones };
}

/**
 * Compute arc segments and kerf zones for a validated S_CURVE profile.
 * Two tangent-continuous arcs — second arc starts where first ends.
 */
function computeSCurveSegments(
  edge: PanelEdge,
  r1: number,
  r2: number,
  sweepDeg1: number,
  sweepDeg2: number,
  w: number,
  h: number
): { arcSegments: ArcSegment[]; kerfZones: KerfZone[] } {
  const sweep1Rad = (sweepDeg1 * Math.PI) / 180;
  const sweep2Rad = (sweepDeg2 * Math.PI) / 180;
  const startAngle1 = arcStartAngle(edge);

  // Arc 1 centre — inset from edge by r1
  const { cx: cx1, cy: cy1 } = arcCentre(edge, r1, w, h);
  // Arc 2 is tangent to arc 1 at the end of sweep1; centre displaced along tangent
  // Simplified placement: offset cx1 by the chord footprint of arc1 in edge direction
  const tangentOffset = r1 * Math.sin(sweep1Rad);
  const isHoriz = edge === 'TOP' || edge === 'BOTTOM';
  const cx2 = isHoriz ? cx1 + tangentOffset : cx1;
  const cy2 = isHoriz ? cy1 : cy1 + tangentOffset;

  const arcSegments: ArcSegment[] = [
    { cx: cx1, cy: cy1, radius: r1, startAngle: startAngle1, sweepAngle: sweep1Rad, edge },
    { cx: cx2, cy: cy2, radius: r2, startAngle: startAngle1 + sweep1Rad, sweepAngle: -sweep2Rad, edge },
  ];

  // Kerf zone spans the full S-curve footprint
  const L_outer = r1 * sweep1Rad + r2 * sweep2Rad;
  const along = edgeLength(edge, w, h);
  const halfFootprint = (r1 * Math.sin(sweep1Rad / 2) + r2 * Math.sin(sweep2Rad / 2)) * 1.1;
  const start = Math.max(0, along / 2 - halfFootprint);
  const end   = Math.min(along, along / 2 + halfFootprint);

  const kerfZones: KerfZone[] = [{ edge, start, end, depth: L_outer }];

  return { arcSegments, kerfZones };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Validate a PanelProfile and — if valid — compute arc segments and kerf zones.
 *
 * Call this function whenever a panel's profile changes (store action, import).
 * The result is used by:
 *   - Phase 3 gate (check errors[])
 *   - Phase 4 DrillMap (kerfZones for exclusion)
 *   - Phase 5 3-D viz (arcSegments)
 *   - Phase 6 DXF export (arcSegments)
 *
 * @param profile  PanelProfile from CabinetPanel.profile (undefined → treated as RECT)
 * @param finishWidth   Panel finish width (mm)
 * @param finishHeight  Panel finish height (mm)
 */
export function computeCurveProfile(
  profile: PanelProfile | undefined,
  finishWidth: number,
  finishHeight: number
): CurveProfileResult {
  // Absent profile = flat RECT — always valid, no geometry to emit
  const p: PanelProfile = profile ?? { kind: 'RECT' };

  const { valid, errors } = validatePanelProfile(p, finishWidth, finishHeight);

  if (!valid) {
    return { valid: false, errors, arcSegments: [], kerfZones: [] };
  }

  if (p.kind === 'RECT') {
    return { valid: true, errors: [], arcSegments: [], kerfZones: [] };
  }

  if (p.kind === 'ROUNDED_CORNER') {
    // Each defined corner becomes a quarter-circle arc segment
    const arcSegments: ArcSegment[] = [];
    const kerfZones: KerfZone[] = [];
    const corners: Array<[keyof typeof p.corners, PanelEdge, number, number]> = [
      ['TL', 'LEFT',   0,          finishHeight],
      ['TR', 'RIGHT',  finishWidth, finishHeight],
      ['BL', 'LEFT',   0,          0],
      ['BR', 'RIGHT',  finishWidth, 0],
    ];
    for (const [key, edge, _ox, _oy] of corners) {
      const r = p.corners[key];
      if (r !== undefined && r > 0) {
        const { arcSegments: segs, kerfZones: zones } = computeArcSegments(
          edge, r, 90, finishWidth, finishHeight
        );
        arcSegments.push(...segs);
        kerfZones.push(...zones);
      }
    }
    return { valid: true, errors, arcSegments, kerfZones };
  }

  if (p.kind === 'ARC') {
    const { arcSegments, kerfZones } = computeArcSegments(
      p.edge, p.radius, p.sweepDeg, finishWidth, finishHeight
    );
    return { valid: true, errors, arcSegments, kerfZones };
  }

  if (p.kind === 'S_CURVE') {
    const { arcSegments, kerfZones } = computeSCurveSegments(
      p.edge, p.r1, p.r2, p.sweepDeg1, p.sweepDeg2, finishWidth, finishHeight
    );
    return { valid: true, errors, arcSegments, kerfZones };
  }

  // Exhaustive
  return { valid: true, errors: [], arcSegments: [], kerfZones: [] };
}
