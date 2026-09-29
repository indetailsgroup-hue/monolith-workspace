/**
 * Curve Fields Computer
 *
 * Computes `developedLength` and `kerfCount` for a CabinetPanel whose profile
 * is a curved kind (ARC, S_CURVE, ROUNDED_CORNER).
 *
 * Called from panelToCutListRow() so each PacketCutListRow carries accurate
 * bend-development data for the nesting / cut-optimisation pipeline.
 *
 * @module curveFieldsComputer
 */

import type { CabinetPanel } from '../../../core/types/Cabinet';
import type { KerfMaterial, KerfToolProfile } from '../../../core/catalog/KerfBending';
import { computeCurveProfile } from '../../../core/manufacturing/curve/curveProfile';
import { generateKerfPattern } from '../../../core/manufacturing/curve/kerfPatternGenerator';

// ============================================
// PUBLIC RESULT TYPE
// ============================================

export interface CurveFields {
  /**
   * Developed (flat) arc length of the curved zone, in mm.
   * = Σ kerfZone.depth across all kerf zones.
   * For ARC: R × sweepRad
   * For S_CURVE: r1 × sweep1Rad + r2 × sweep2Rad
   * For ROUNDED_CORNER: Σ(rₙ × π/2) per defined corner
   */
  developedLength: number;
  /**
   * Total number of kerf cuts required to achieve the bend.
   * = Σ pattern.cuts.length across all KerfPatterns.
   */
  kerfCount: number;
  /**
   * Projected depth of the curved zone along the bend axis (mm).
   * This is the amount by which the finish dimension SHRINKS vs the flat blank
   * because curvature consumes length.
   *
   * For ARC:     R × (1 − cos(sweepRad))
   * For S_CURVE: r1×(1−cos(s1r)) + r2×(1−cos(s2r))
   * For ROUNDED_CORNER: corners affect both axes independently; set to 0
   *   (caller should skip flat-blank correction for ROUNDED_CORNER).
   */
  projectedDepth: number;
  /**
   * Which panel edge carries the primary curve (ARC / S_CURVE only).
   * null for ROUNDED_CORNER (curve is at corners, not a single full edge).
   * Used by the nesting optimizer to know which blank dimension to correct.
   */
  curvedEdge: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | null;
}

// ============================================
// MATERIAL RESOLUTION
// ============================================

/**
 * Heuristic: map a generic coreMaterialId string to the nearest KerfMaterial.
 * Order of priority:
 *  1. Exact match (case-insensitive)
 *  2. Substring match
 *  3. fallback (default 'MDF')
 */
function heuristicMaterial(id: string): KerfMaterial {
  const upper = id.toUpperCase();
  if (upper.includes('PLYWOOD') || upper.includes('PLY')) return 'PLYWOOD';
  if (upper.includes('PARTICLE') || upper.includes('PB') || upper.includes('CHIPBOARD')) return 'PARTICLE_BOARD';
  if (upper.includes('HMR') || upper.includes('MOISTURE')) return 'HMR';
  // MDF is the widest default in the catalog
  return 'MDF';
}

/**
 * Resolve a CabinetPanel's coreMaterialId to a KerfMaterial enum value.
 *
 * @param coreMaterialId  - The panel's raw material string
 * @param materialMap     - Optional caller-supplied exact overrides
 * @param fallback        - Override the built-in 'MDF' fallback
 */
export function resolveMaterial(
  coreMaterialId: string,
  materialMap?: Record<string, KerfMaterial>,
  fallback?: KerfMaterial,
): KerfMaterial {
  if (materialMap && Object.prototype.hasOwnProperty.call(materialMap, coreMaterialId)) {
    return materialMap[coreMaterialId];
  }
  const heuristic = heuristicMaterial(coreMaterialId);
  // If heuristic didn't fall through to MDF, trust it even without a map
  if (heuristic !== 'MDF') return heuristic;
  // MDF could be correct OR could be the default — honour the explicit fallback
  return fallback ?? 'MDF';
}

// ============================================
// DEFAULT TOOL
// ============================================

/**
 * Default SAW tool profile used when the caller doesn't supply one.
 * 3.2 mm blade kerf, k_eff = 3.4 mm — suitable for 18 mm MDF/plywood.
 */
export const DEFAULT_KERF_TOOL: KerfToolProfile = {
  kind: 'SAW',
  bladeKerf: 3.2,
  kEff: 3.4,
  maxDepth: 30,
};

// ============================================
// CORE COMPUTATION
// ============================================

/**
 * Compute `developedLength` and `kerfCount` for a curved panel.
 *
 * Returns `null` when the panel is RECT / undefined / invalid profile —
 * the caller leaves the cut-list row fields as `undefined`.
 *
 * @param panel     - Source CabinetPanel (must have `profile`, `finishWidth`,
 *                    `finishHeight`, and `computed.realThickness`)
 * @param tool      - KerfToolProfile (defaults to DEFAULT_KERF_TOOL)
 * @param material  - Resolved KerfMaterial for this panel
 */
export function computeCurveFields(
  panel: CabinetPanel,
  tool: KerfToolProfile,
  material: KerfMaterial,
): CurveFields | null {
  const { profile, finishWidth, finishHeight } = panel;
  const thickness = panel.computed?.realThickness ?? 18; // sensible default

  // Flat or missing profile → no curve fields
  if (!profile || profile.kind === 'RECT') return null;

  // Step 1: Compute arc geometry to get kerfZones → developedLength
  const curveResult = computeCurveProfile(profile, finishWidth, finishHeight);

  if (!curveResult.valid || curveResult.kerfZones.length === 0) return null;

  // developedLength = Σ kerfZone.depth (outer arc length per zone)
  const developedLength = curveResult.kerfZones.reduce(
    (sum, zone) => sum + zone.depth,
    0,
  );

  // Step 2: Compute projectedDepth and curvedEdge from profile geometry
  // projectedDepth = how much the finish dimension is LESS than the flat blank
  // along the curved axis (the curvature "consumes" length perpendicular to the edge).
  let projectedDepth = 0;
  let curvedEdge: CurveFields['curvedEdge'] = null;

  if (profile.kind === 'ARC') {
    const sweepRad = (profile.sweepDeg * Math.PI) / 180;
    projectedDepth = profile.radius * (1 - Math.cos(sweepRad));
    curvedEdge = profile.edge;
  } else if (profile.kind === 'S_CURVE') {
    const s1r = (profile.sweepDeg1 * Math.PI) / 180;
    const s2r = (profile.sweepDeg2 * Math.PI) / 180;
    projectedDepth = profile.r1 * (1 - Math.cos(s1r)) + profile.r2 * (1 - Math.cos(s2r));
    curvedEdge = profile.edge;
  }
  // ROUNDED_CORNER: corners affect two axes independently; projectedDepth stays 0,
  // curvedEdge stays null — the optimizer skips flat-blank correction for these.

  // Step 3: Generate kerf pattern to count cuts
  const patternResult = generateKerfPattern({
    profile,
    finishWidth,
    finishHeight,
    material,
    thickness,
    tool,
  });

  // kerfCount = Σ pattern.cuts.length
  const kerfCount = patternResult.patterns.reduce(
    (n, p) => n + p.cuts.length,
    0,
  );

  return { developedLength, kerfCount, projectedDepth, curvedEdge };
}
