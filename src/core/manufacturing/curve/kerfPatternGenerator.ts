/**
 * Kerf Pattern Generator — Phase 2
 *
 * Converts a validated PanelProfile + material + tool → deterministic KerfPattern.
 *
 * Responsibilities:
 *  - Iterate over each KerfZone produced by curveProfile
 *  - Call calculateKerfBending (Phase 0 engine) for each zone
 *  - Assemble KerfPattern with cut positions, depths, and trace source
 *  - Surface G12 error codes (BLOCKER) when bending is infeasible
 *
 * NOT responsible for:
 *  - Geometry validation (Phase 1: curveProfile.ts)
 *  - Gate enforcement (Phase 3: gateG12_curveManufacturability.ts)
 *  - DXF export (Phase 6)
 *
 * Spec: .kiro/specs/curved-panel-system/design.md §Phase 2
 * Engine: src/core/catalog/KerfBending.ts (calculateKerfBending)
 */

import {
  calculateKerfBending,
  kEffFromTool,
  type KerfToolProfile,
  type KerfMaterial,
  type KerfBendingResult,
} from '../../catalog/KerfBending';
import { computeCurveProfile, type KerfZone } from './curveProfile';
import type { PanelProfile, PanelEdge } from '../../types/Cabinet';

// ============================================
// PUBLIC TYPES
// ============================================

/**
 * A single kerf cut within a KerfPattern.
 *
 * All positions are in mm measured from the origin corner along the edge.
 */
export interface KerfCut {
  /** Distance along the edge (mm) from the origin corner. */
  position: number;
  /** Cut depth (mm) — full panel thickness minus web. */
  depth: number;
  /** Cut angle relative to the panel face (degrees); 0 = perpendicular. */
  angleDeg: number;
}

/**
 * Complete kerf pattern for one KerfZone (one bend arc).
 *
 * Deterministic: same inputs → same KerfPattern, byte-for-byte.
 */
export interface KerfPattern {
  /** Zone boundaries (mm along edge). */
  zone: { start: number; end: number };
  /**
   * Which panel edge this zone belongs to (TOP | BOTTOM | LEFT | RIGHT).
   * Used by KerfPatternOverlay to orient cut segments in 3-D canvas space.
   */
  edge: PanelEdge;
  /** Individual kerf cuts sorted by position ascending. */
  cuts: KerfCut[];
  /** Center-to-center spacing (mm). */
  spacing: number;
  /** Total number of cuts. */
  count: number;
  /** Tool used to produce this pattern. */
  tool: KerfToolProfile;
  /** Back-reference to the KerfBendingResult that drove this pattern (traceability). */
  source: KerfBendingResult;
}

/** Input to generateKerfPattern(). */
export interface KerfPatternInput {
  /** Panel profile (undefined → RECT → empty result). */
  profile: PanelProfile | undefined;
  /** Panel finish width (mm). */
  finishWidth: number;
  /** Panel finish height (mm). */
  finishHeight: number;
  /** Core material. */
  material: KerfMaterial;
  /** Panel core thickness (mm). */
  thickness: number;
  /** Cutting tool to use for kerf generation. */
  tool: KerfToolProfile;
  /**
   * Kerf profile type (straight / cross_hatch / radial / living_hinge).
   * Default: 'STRAIGHT' for single-arc panels.
   */
  kerfProfile?: 'STRAIGHT' | 'CROSS_HATCH' | 'RADIAL' | 'LIVING_HINGE';
}

/** Full output of generateKerfPattern(). */
export interface KerfPatternResult {
  /** True when all zones have feasible, block-free patterns. */
  valid: boolean;
  /** Accumulated G12 error codes across all zones. */
  errors: string[];
  /** One KerfPattern per KerfZone; empty for RECT profiles. */
  patterns: KerfPattern[];
}

// ============================================
// CORE GENERATOR
// ============================================

/**
 * Generate a deterministic KerfPattern for each KerfZone of the panel.
 *
 * Algorithm per zone:
 *  1. Resolve sweepDeg from zone depth (L_outer = R × sweepRad → θ = L_outer / R)
 *     We store R in the arc segment; sweepDeg comes from the profile directly.
 *  2. Call calculateKerfBending with:
 *       panelThickness = thickness
 *       panelWidth     = zone depth (≈ outer arc length, used as "panel length along bend")
 *       panelLength    = zone.end - zone.start
 *       bendRadius     = radius from profile
 *       bendAngle      = sweepDeg from profile
 *       material, tool, profile = kerfProfile
 *  3. Distribute kerfCount cuts evenly over [zone.start, zone.end] with
 *     startPosition / endPosition from cncParams.
 */
export function generateKerfPattern(input: KerfPatternInput): KerfPatternResult {
  const {
    profile,
    finishWidth,
    finishHeight,
    material,
    thickness,
    tool,
    kerfProfile = 'STRAIGHT',
  } = input;

  // --- Step 1: Compute curve profile geometry ---
  const curveResult = computeCurveProfile(profile, finishWidth, finishHeight);
  if (!curveResult.valid) {
    return { valid: false, errors: curveResult.errors, patterns: [] };
  }

  // RECT profile → no kerf cuts
  if (curveResult.kerfZones.length === 0) {
    return { valid: true, errors: [], patterns: [] };
  }

  // --- Step 2: Generate pattern per zone ---
  const patterns: KerfPattern[] = [];
  const errors: string[] = [];

  for (const zone of curveResult.kerfZones) {
    const result = generateZonePattern(zone, profile!, material, thickness, tool, kerfProfile);
    if (result.errors.length > 0) {
      errors.push(...result.errors.filter(e => !errors.includes(e)));
    }
    if (result.pattern) {
      patterns.push(result.pattern);
    }
  }

  const blockers = errors.filter(e => !e.startsWith('G12_SCURVE') && !e.startsWith('G12_GRAIN'));
  return {
    valid: blockers.length === 0,
    errors,
    patterns,
  };
}

// ============================================
// ZONE-LEVEL PATTERN
// ============================================

interface ZonePatternResult {
  errors: string[];
  pattern: KerfPattern | null;
}

function generateZonePattern(
  zone: KerfZone,
  profile: PanelProfile,
  material: KerfMaterial,
  thickness: number,
  tool: KerfToolProfile,
  kerfProfile: 'STRAIGHT' | 'CROSS_HATCH' | 'RADIAL' | 'LIVING_HINGE'
): ZonePatternResult {
  const errors: string[] = [];

  // Extract bendRadius and sweepDeg from the profile for this edge
  const { bendRadius, sweepDeg } = extractBendParams(profile, zone);
  if (bendRadius === null) {
    // RECT or unknown — no cuts
    return { errors: [], pattern: null };
  }

  // Zone span along the edge
  const zoneSpan = zone.end - zone.start;

  // Call the Phase 0 engine
  const bendingResult = calculateKerfBending({
    panelThickness: thickness,
    panelWidth: zone.depth,        // outer arc length ≈ developed length
    panelLength: zoneSpan,         // span along the edge
    bendRadius,
    bendAngle: sweepDeg,
    material,
    tool,
    profile: kerfProfile,
  });

  // Collect blockers from engine result
  if (bendingResult.errors.length > 0) {
    errors.push(...bendingResult.errors);
  }

  // Blockers mean we cannot produce a valid pattern
  const blockers = bendingResult.errors.filter(
    e => !e.startsWith('G12_SCURVE') && !e.startsWith('G12_GRAIN')
  );
  if (blockers.length > 0) {
    return { errors, pattern: null };
  }

  // --- Distribute cuts along the zone ---
  const cuts = distributeKerfCuts(zone, bendingResult);

  const pattern: KerfPattern = {
    zone: { start: zone.start, end: zone.end },
    edge: zone.edge,
    cuts,
    spacing: bendingResult.kerfSpacing,
    count: bendingResult.kerfCount,
    tool,
    source: bendingResult,
  };

  return { errors, pattern };
}

// ============================================
// CUT DISTRIBUTION
// ============================================

/**
 * Place kerfCount cuts evenly within the zone, using cncParams startPosition
 * as the offset from zone.start.
 *
 * Positions are sorted ascending (deterministic).
 */
function distributeKerfCuts(zone: KerfZone, result: KerfBendingResult): KerfCut[] {
  const { kerfCount, kerfSpacing, kerfDepth, cncParams } = result;

  if (kerfCount <= 0) return [];

  const cuts: KerfCut[] = [];
  const firstPos = zone.start + cncParams.startPosition;

  for (let i = 0; i < kerfCount; i++) {
    const position = firstPos + i * kerfSpacing;
    // Clamp to zone bounds
    if (position > zone.end + 0.001) break;
    cuts.push({
      position: Math.min(position, zone.end),
      depth: kerfDepth,
      angleDeg: 0,  // perpendicular to panel face (spec default)
    });
  }

  // Sort by position ascending (ensures determinism regardless of engine order)
  cuts.sort((a, b) => a.position - b.position);
  return cuts;
}

// ============================================
// PROFILE PARAM EXTRACTION
// ============================================

/**
 * Extract (bendRadius, sweepDeg) for the given zone's edge from the PanelProfile.
 * Returns null for RECT (no bending).
 */
function extractBendParams(
  profile: PanelProfile,
  zone: KerfZone
): { bendRadius: number; sweepDeg: number } | { bendRadius: null; sweepDeg: null } {
  if (profile.kind === 'RECT') {
    return { bendRadius: null, sweepDeg: null };
  }

  if (profile.kind === 'ARC') {
    return { bendRadius: profile.radius, sweepDeg: profile.sweepDeg };
  }

  if (profile.kind === 'S_CURVE') {
    // First zone: use r1/sweepDeg1; second zone (if ever split): use r2/sweepDeg2
    // For now use the dominant arc (r1) — matingSlotGenerator handles the split
    return { bendRadius: profile.r1, sweepDeg: profile.sweepDeg1 };
  }

  if (profile.kind === 'ROUNDED_CORNER') {
    // Each ROUNDED_CORNER zone is a 90° quarter-circle
    const cornerRadius = resolveCornerRadius(profile.corners, zone);
    if (cornerRadius === null) return { bendRadius: null, sweepDeg: null };
    return { bendRadius: cornerRadius, sweepDeg: 90 };
  }

  return { bendRadius: null, sweepDeg: null };
}

/** Resolve which corner radius applies to this zone's edge. */
function resolveCornerRadius(
  corners: { TL?: number; TR?: number; BL?: number; BR?: number },
  zone: KerfZone
): number | null {
  // Zones for ROUNDED_CORNER are assigned per-corner in curveProfile.ts
  // The edge field tells us LEFT/RIGHT; we pick the first defined corner for that edge
  if (zone.edge === 'LEFT') {
    return corners.TL ?? corners.BL ?? null;
  }
  if (zone.edge === 'RIGHT') {
    return corners.TR ?? corners.BR ?? null;
  }
  if (zone.edge === 'TOP') {
    return corners.TL ?? corners.TR ?? null;
  }
  if (zone.edge === 'BOTTOM') {
    return corners.BL ?? corners.BR ?? null;
  }
  return null;
}

// ============================================
// RE-EXPORT useful types from engine
// ============================================
export type { KerfToolProfile, KerfMaterial, KerfBendingResult };
