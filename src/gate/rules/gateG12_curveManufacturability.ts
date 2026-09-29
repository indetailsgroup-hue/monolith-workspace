/**
 * Gate G12: Curved Panel Manufacturability Rules
 *
 * @module gate/rules/gateG12_curveManufacturability
 * @version 1.0.0
 *
 * Validates that kerf-bent curved panels can be safely manufactured.
 * Covers all 10 G12 error codes defined in design.md §Gate Rules:
 *
 *  BLOCKERS
 *  --------
 *  G12.1  RADIUS_BELOW_MIN       — inner radius below certified R_min for material/thickness
 *  G12.2  KERF_SPACING_TOO_TIGHT — spacing < bladeWidth + minWeb (saw blade cannot fit)
 *  G12.3  KERF_DEPTH_UNSAFE      — remaining web < max(15%T, skinMin+0.5mm)
 *  G12.4  FITTING_IN_KERF_ZONE   — existing drill point falls inside kerf zone + margin
 *  G12.5  MATERIAL_DATA_MISSING  — R_min catalog has no entry for material/thickness combo
 *  G12.6  SLOT_EDGE_INSUFFICIENT — mating-slot tab too close to panel edge
 *  G12.7  SLOT_PAIR_MISMATCH     — curvedEdge.count ≠ receiverSlots.length
 *  G12.8  SLOT_OVERLAPS_KERF     — mating slot overlaps a kerf cut position
 *
 *  WARNINGS
 *  --------
 *  G12.9  SCURVE_TRANSITION_SHORT — S-curve transition span < 2× max(r1,r2)
 *  G12.10 GRAIN_PARALLEL_TO_BEND  — wood grain runs parallel to the bend axis (splitting risk)
 *
 * ## Philosophy
 * "โรงงานก่อน ความสวยทีหลัง" — A curved panel that cannot be bent safely never reaches
 * the factory; better to block it here than to crack a sheet on the CNC bed.
 *
 * @example
 * import { runG12Rules } from './gateG12_curveManufacturability';
 *
 * const issues = runG12Rules({
 *   panels: [{ panelId: 'left-curve', profile, material: 'MDF', thickness: 12 }],
 *   patterns: [{ panelId: 'left-curve', patterns, tool }],
 *   drillPoints: [{ panelId: 'left-curve', x: 100, y: 50, diaMm: 5 }],
 *   slotPatterns: [{ panelId: 'left-curve', matingSlot }],
 *   policy: defaultG12Policy,
 * });
 */

import type { GateIssue } from '../types';
import { issueId } from '../utils/idGen';
import {
  lookupMinBendRadius,
  MATERIAL_CONSTANTS,
  type KerfMaterial,
} from '../../core/catalog/KerfBending';
import type { PanelProfile } from '../../core/types/Cabinet';
import type { KerfPattern } from '../../core/manufacturing/curve/kerfPatternGenerator';
import type { MatingSlotPattern } from '../../core/manufacturing/curve/matingSlotGenerator';
import type { KerfZone } from '../../core/manufacturing/curve/curveProfile';

// ============================================
// G12 POLICY
// ============================================

/**
 * Policy settings for G12 curved-panel manufacturability rules.
 *
 * Callers may override individual fields; defaults represent conservative
 * shop-floor safe values that have been certified in the specs.
 */
export interface G12Policy {
  /**
   * Margin added around each KerfZone when checking for drill-point conflicts (mm).
   * Default: 2mm — allows a small registration tolerance.
   */
  kerfZoneMarginMm?: number;
  /**
   * Minimum clear distance from a mating slot tab to the panel edge (mm).
   * Default: 8mm — matches System 32 minimum setback.
   */
  minSlotEdgeClearanceMm?: number;
  /**
   * Minimum web thickness as fraction of panel thickness (0–1).
   * Default: 0.15 (= 15%T, from spec §kerf-depth-safety).
   */
  minWebFraction?: number;
  /**
   * Absolute skin minimum for web check (mm).
   * Default: 0.5mm — added to skinMin when skin config is present.
   */
  skinMinAbsoluteMm?: number;
  /**
   * Minimum transition length for S-curve between the two inflection zones (mm).
   * Default: 2× max(r1, r2) is computed per-panel; this is the multiplier.
   */
  sCurveTransitionMultiplier?: number;
  /**
   * Tolerance for slot-pair count mismatch (allows ±0 by default — exact match required).
   * Default: 0
   */
  slotPairToleranceCount?: number;
  /**
   * Tolerance when checking mating slot vs kerf-cut overlap (mm).
   * Default: 0.1mm
   */
  slotKerfOverlapToleranceMm?: number;
}

export const DEFAULT_G12_POLICY: Required<G12Policy> = {
  kerfZoneMarginMm: 2,
  minSlotEdgeClearanceMm: 8,
  minWebFraction: 0.15,
  skinMinAbsoluteMm: 0.5,
  sCurveTransitionMultiplier: 2,
  slotPairToleranceCount: 0,
  slotKerfOverlapToleranceMm: 0.1,
};

// ============================================
// INPUT TYPES
// ============================================

/** Curved-panel descriptor used as input to G12 rules. */
export interface G12PanelInput {
  /** Part identifier — appears in every GateIssue.partIds. */
  panelId: string;
  /** PanelProfile from CabinetPanel.profile. */
  profile: PanelProfile;
  /** Core material. */
  material: KerfMaterial;
  /** Core thickness (mm). */
  thickness: number;
  /**
   * Grain direction relative to the panel face ('ALONG_LENGTH' | 'ALONG_WIDTH').
   * Omit when grain is unknown; grain check is skipped.
   */
  grainDirection?: 'ALONG_LENGTH' | 'ALONG_WIDTH';
  /**
   * Skin minimum thickness (mm) if a skin is applied (from SkinConfig).
   * Used in kerf-depth web check: web ≥ skinMin + skinMinAbsoluteMm.
   */
  skinMinMm?: number;
}

/** Pre-computed KerfPatterns for a panel (from generateKerfPattern). */
export interface G12PatternInput {
  panelId: string;
  /** KerfZones derived from the panel's PanelProfile. */
  kerfZones: KerfZone[];
  /** Patterns — one per KerfZone (may be empty for RECT). */
  patterns: KerfPattern[];
  /** Tool used (for bladeWidth / spacing-tight check). */
  tool: import('../../core/catalog/KerfBending').KerfToolProfile;
}

/** Drill-point on a panel face (from DrillMap). */
export interface G12DrillPoint {
  panelId: string;
  x: number;
  y: number;
  diaMm?: number;
}

/** Mating slot pattern for a panel. */
export interface G12SlotInput {
  panelId: string;
  matingSlot: MatingSlotPattern;
  /**
   * Panel finish dimensions (mm) — required for edge-clearance check.
   */
  finishWidth: number;
  finishHeight: number;
}

/** Full G12 input aggregate. */
export interface G12Input {
  panels: G12PanelInput[];
  /** Pre-computed patterns — parallel to panels (same panelId). */
  patterns?: G12PatternInput[];
  /** Drill points on each panel face. */
  drillPoints?: G12DrillPoint[];
  /** Mating slot patterns (Phase 2.5 output). */
  slotPatterns?: G12SlotInput[];
  /** Policy overrides. */
  policy?: G12Policy;
}

// ============================================
// G12.1 — RADIUS_BELOW_MIN
// ============================================

/**
 * G12.1 — Radius Below Minimum
 *
 * Blocks when the requested inner bend radius is below the certified
 * minimum for the given material/thickness combination.
 *
 * ## Issue Code
 * - `B_G12_RADIUS_BELOW_MIN` (BLOCKER)
 *
 * @example
 * // MDF 12mm, R_min=96mm; panel requests R=60mm → BLOCKER
 */
export function ruleG12_RadiusBelowMin(panels: G12PanelInput[]): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of panels) {
    const arcs = extractArcParams(panel.profile);
    for (const arc of arcs) {
      let R_min: number;
      try {
        R_min = lookupMinBendRadius(panel.thickness, panel.material);
      } catch {
        // Missing data handled by ruleG12_MaterialDataMissing
        continue;
      }
      if (arc.radius < R_min) {
        issues.push({
          id: issueId('B_G12_RADIUS_BELOW_MIN', panel.panelId, arc.edge, arc.radius),
          severity: 'BLOCKER',
          code: 'B_G12_RADIUS_BELOW_MIN',
          message: `Panel "${panel.panelId}" edge ${arc.edge}: radius ${arc.radius}mm is below minimum ${R_min}mm for ${panel.material} ${panel.thickness}mm`,
          partIds: [panel.panelId],
          context: {
            requestedRadius: arc.radius,
            minimumRadius: R_min,
            material: panel.material,
            thickness: panel.thickness,
            edge: arc.edge,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================
// G12.2 — KERF_SPACING_TOO_TIGHT
// ============================================

/**
 * G12.2 — Kerf Spacing Too Tight
 *
 * Blocks when the computed cut spacing is narrower than the sum of
 * blade/bit width and a minimum web between adjacent cuts.
 * A physically impossible pattern that would remove all material.
 *
 * ## Issue Code
 * - `B_G12_KERF_SPACING_TOO_TIGHT` (BLOCKER)
 */
export function ruleG12_KerfSpacingTooTight(
  panels: G12PanelInput[],
  patternInputs: G12PatternInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panelInput of patternInputs) {
    const panel = panels.find(p => p.panelId === panelInput.panelId);
    if (!panel) continue;

    const bladeWidth = resolveBladeWidth(panelInput.tool);
    // Minimum web: 15%T between cuts (same threshold as depth check)
    const minWeb = policy.minWebFraction * panel.thickness;
    const minSpacing = bladeWidth + minWeb;

    for (const pattern of panelInput.patterns) {
      if (pattern.spacing < minSpacing) {
        issues.push({
          id: issueId(
            'B_G12_KERF_SPACING_TOO_TIGHT',
            panelInput.panelId,
            pattern.zone.start,
            pattern.spacing
          ),
          severity: 'BLOCKER',
          code: 'B_G12_KERF_SPACING_TOO_TIGHT',
          message: `Panel "${panelInput.panelId}" zone [${pattern.zone.start}–${pattern.zone.end}mm]: spacing ${pattern.spacing.toFixed(2)}mm < minimum ${minSpacing.toFixed(2)}mm (blade ${bladeWidth}mm + web ${minWeb.toFixed(2)}mm)`,
          partIds: [panelInput.panelId],
          context: {
            spacing: pattern.spacing,
            minimumSpacing: minSpacing,
            bladeWidth,
            minWebMm: minWeb,
            zoneStart: pattern.zone.start,
            zoneEnd: pattern.zone.end,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================
// G12.3 — KERF_DEPTH_UNSAFE
// ============================================

/**
 * G12.3 — Kerf Depth Unsafe
 *
 * Blocks when the remaining web (panel thickness − kerf depth) is below
 * the safer of:
 *   a) 15% of panel thickness, or
 *   b) skinMin + 0.5mm when a skin is configured
 *
 * ## Issue Code
 * - `B_G12_KERF_DEPTH_UNSAFE` (BLOCKER)
 */
export function ruleG12_KerfDepthUnsafe(
  panels: G12PanelInput[],
  patternInputs: G12PatternInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const patternInput of patternInputs) {
    const panel = panels.find(p => p.panelId === patternInput.panelId);
    if (!panel) continue;

    const T = panel.thickness;
    const fractionMin = policy.minWebFraction * T;
    const skinMin =
      panel.skinMinMm !== undefined
        ? panel.skinMinMm + policy.skinMinAbsoluteMm
        : 0;
    const minWeb = Math.max(fractionMin, skinMin);

    for (const pattern of patternInput.patterns) {
      for (const cut of pattern.cuts) {
        const web = T - cut.depth;
        if (web < minWeb) {
          issues.push({
            id: issueId(
              'B_G12_KERF_DEPTH_UNSAFE',
              patternInput.panelId,
              cut.position,
              cut.depth
            ),
            severity: 'BLOCKER',
            code: 'B_G12_KERF_DEPTH_UNSAFE',
            message: `Panel "${patternInput.panelId}" cut at ${cut.position.toFixed(1)}mm: web ${web.toFixed(2)}mm < minimum ${minWeb.toFixed(2)}mm (${(policy.minWebFraction * 100).toFixed(0)}%T = ${fractionMin.toFixed(2)}mm)`,
            partIds: [patternInput.panelId],
            context: {
              cutPosition: cut.position,
              cutDepth: cut.depth,
              webMm: web,
              minWebMm: minWeb,
              thicknessMm: T,
            },
          });
        }
      }
    }
  }

  return issues;
}

// ============================================
// G12.4 — FITTING_IN_KERF_ZONE
// ============================================

/**
 * G12.4 — Fitting In Kerf Zone
 *
 * Blocks when an existing drill point (e.g. shelf pin, minifix cam) falls
 * inside a kerf zone expanded by the kerfZoneMarginMm policy.
 *
 * ## Issue Code
 * - `B_G12_FITTING_IN_KERF_ZONE` (BLOCKER)
 */
export function ruleG12_FittingInKerfZone(
  patternInputs: G12PatternInput[],
  drillPoints: G12DrillPoint[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const patternInput of patternInputs) {
    const panelDrills = drillPoints.filter(d => d.panelId === patternInput.panelId);
    if (panelDrills.length === 0) continue;

    for (const zone of patternInput.kerfZones) {
      const zStart = zone.start - policy.kerfZoneMarginMm;
      const zEnd = zone.end + policy.kerfZoneMarginMm;

      for (const drill of panelDrills) {
        // Check the coordinate axis that matches the zone edge orientation
        const coord = edgeCoord(zone.edge, drill.x, drill.y);
        const radius = (drill.diaMm ?? 0) / 2;
        const drillMin = coord - radius;
        const drillMax = coord + radius;

        // Overlap test: drill footprint intersects expanded zone
        if (drillMin < zEnd && drillMax > zStart) {
          issues.push({
            id: issueId(
              'B_G12_FITTING_IN_KERF_ZONE',
              patternInput.panelId,
              zone.edge,
              drill.x,
              drill.y
            ),
            severity: 'BLOCKER',
            code: 'B_G12_FITTING_IN_KERF_ZONE',
            message: `Panel "${patternInput.panelId}" drill at (${drill.x}, ${drill.y})mm conflicts with kerf zone [${zone.start}–${zone.end}mm] on edge ${zone.edge} (margin ±${policy.kerfZoneMarginMm}mm)`,
            partIds: [patternInput.panelId],
            context: {
              drillX: drill.x,
              drillY: drill.y,
              drillDia: drill.diaMm ?? 0,
              kerfZoneStart: zone.start,
              kerfZoneEnd: zone.end,
              edge: zone.edge,
              marginMm: policy.kerfZoneMarginMm,
            },
          });
        }
      }
    }
  }

  return issues;
}

// ============================================
// G12.5 — MATERIAL_DATA_MISSING
// ============================================

/**
 * G12.5 — Material Data Missing
 *
 * Blocks when the R_min catalog has no entry (or a null entry) for the
 * requested material/thickness combination.
 * Common for PARTICLE_BOARD (not certifiable for kerf bending).
 *
 * ## Issue Code
 * - `B_G12_MATERIAL_DATA_MISSING` (BLOCKER)
 */
export function ruleG12_MaterialDataMissing(panels: G12PanelInput[]): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of panels) {
    // Only check panels with non-RECT profiles
    if (panel.profile.kind === 'RECT') continue;

    try {
      lookupMinBendRadius(panel.thickness, panel.material);
    } catch {
      issues.push({
        id: issueId('B_G12_MATERIAL_DATA_MISSING', panel.panelId, panel.material, panel.thickness),
        severity: 'BLOCKER',
        code: 'B_G12_MATERIAL_DATA_MISSING',
        message: `Panel "${panel.panelId}": no kerf-bending data for ${panel.material} ${panel.thickness}mm — material may not be certifiable for bending`,
        partIds: [panel.panelId],
        context: {
          material: panel.material,
          thickness: panel.thickness,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G12.6 — SLOT_EDGE_INSUFFICIENT
// ============================================

/**
 * G12.6 — Slot Edge Insufficient
 *
 * Blocks when any mating slot tab sits too close to the panel edge —
 * less than minSlotEdgeClearanceMm. Below this limit the tab will
 * break out during glue-up or fail under racking load.
 *
 * ## Issue Code
 * - `B_G12_SLOT_EDGE_INSUFFICIENT` (BLOCKER)
 */
export function ruleG12_SlotEdgeInsufficient(
  slotInputs: G12SlotInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const slotInput of slotInputs) {
    const { panelId, matingSlot, finishWidth, finishHeight } = slotInput;
    const min = policy.minSlotEdgeClearanceMm;

    for (const slot of matingSlot.receiverSlots) {
      const [x, y] = slot.position;
      const halfW = slot.width / 2;
      // slot.depth = tab insertion depth (Z-axis into receiver), not face-plane footprint
      // Use halfW for both axes as the on-face footprint dimension.

      // Distance to each panel edge
      const toLeft = x - halfW;
      const toRight = finishWidth - x - halfW;
      const toBottom = y - halfW;
      const toTop = finishHeight - y - halfW;

      const minDist = Math.min(toLeft, toRight, toBottom, toTop);
      if (minDist < min) {
        issues.push({
          id: issueId('B_G12_SLOT_EDGE_INSUFFICIENT', panelId, matingSlot.pairKey, x, y),
          severity: 'BLOCKER',
          code: 'B_G12_SLOT_EDGE_INSUFFICIENT',
          message: `Panel "${panelId}" slot (pair ${matingSlot.pairKey}) at (${x.toFixed(1)}, ${y.toFixed(1)})mm: edge clearance ${minDist.toFixed(2)}mm < minimum ${min}mm`,
          partIds: [panelId],
          context: {
            slotX: x,
            slotY: y,
            clearanceMm: minDist,
            minimumClearanceMm: min,
            pairKey: matingSlot.pairKey,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================
// G12.7 — SLOT_PAIR_MISMATCH
// ============================================

/**
 * G12.7 — Slot Pair Mismatch
 *
 * Blocks when the number of finger tabs declared on the curved edge
 * does not match the number of receiver slots — they will not mate.
 *
 * ## Issue Code
 * - `B_G12_SLOT_PAIR_MISMATCH` (BLOCKER)
 */
export function ruleG12_SlotPairMismatch(
  slotInputs: G12SlotInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const slotInput of slotInputs) {
    const { panelId, matingSlot } = slotInput;
    const tabCount = matingSlot.curvedEdge.count;
    const slotCount = matingSlot.receiverSlots.length;
    const delta = Math.abs(tabCount - slotCount);

    if (delta > policy.slotPairToleranceCount) {
      issues.push({
        id: issueId('B_G12_SLOT_PAIR_MISMATCH', panelId, matingSlot.pairKey, tabCount, slotCount),
        severity: 'BLOCKER',
        code: 'B_G12_SLOT_PAIR_MISMATCH',
        message: `Panel "${panelId}" slot pair "${matingSlot.pairKey}": curved edge declares ${tabCount} tab(s) but receiver has ${slotCount} slot(s) — mating impossible`,
        partIds: [panelId],
        context: {
          pairKey: matingSlot.pairKey,
          tabCount,
          slotCount,
          delta,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G12.8 — SLOT_OVERLAPS_KERF
// ============================================

/**
 * G12.8 — Slot Overlaps Kerf
 *
 * Blocks when a mating slot position overlaps with a kerf cut position
 * within slotKerfOverlapToleranceMm. A slot in a kerf zone would remove
 * material that the kerf relies on for the web.
 *
 * ## Issue Code
 * - `B_G12_SLOT_OVERLAPS_KERF` (BLOCKER)
 */
export function ruleG12_SlotOverlapsKerf(
  patternInputs: G12PatternInput[],
  slotInputs: G12SlotInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];
  const tol = policy.slotKerfOverlapToleranceMm;

  for (const patternInput of patternInputs) {
    const panelSlots = slotInputs.filter(s => s.panelId === patternInput.panelId);
    if (panelSlots.length === 0) continue;

    // Collect all cut positions across all patterns
    const cutPositions: number[] = patternInput.patterns.flatMap(p => p.cuts.map(c => c.position));

    for (const slotInput of panelSlots) {
      const { matingSlot } = slotInput;
      for (const slot of matingSlot.receiverSlots) {
        const [slotX] = slot.position;
        const halfSlotW = slot.width / 2;

        for (const cutPos of cutPositions) {
          // Overlap: slot footprint [slotX-halfW, slotX+halfW] vs cut point
          if (cutPos > slotX - halfSlotW - tol && cutPos < slotX + halfSlotW + tol) {
            issues.push({
              id: issueId(
                'B_G12_SLOT_OVERLAPS_KERF',
                patternInput.panelId,
                matingSlot.pairKey,
                slotX,
                cutPos
              ),
              severity: 'BLOCKER',
              code: 'B_G12_SLOT_OVERLAPS_KERF',
              message: `Panel "${patternInput.panelId}" slot (pair ${matingSlot.pairKey}) at x=${slotX.toFixed(1)}mm overlaps kerf cut at ${cutPos.toFixed(1)}mm — web integrity compromised`,
              partIds: [patternInput.panelId],
              context: {
                slotX,
                slotWidth: slot.width,
                kerfCutPosition: cutPos,
                toleranceMm: tol,
                pairKey: matingSlot.pairKey,
              },
            });
          }
        }
      }
    }
  }

  return issues;
}

// ============================================
// G12.9 — SCURVE_TRANSITION_SHORT (WARNING)
// ============================================

/**
 * G12.9 — S-Curve Transition Too Short
 *
 * Warns when an S-curve profile has a transition span (flat section
 * between the two arcs) shorter than 2× the larger radius.
 * Short transitions create overlapping KerfZones and may produce
 * stress concentrations at the inflection point.
 *
 * ## Issue Code
 * - `W_G12_SCURVE_TRANSITION_SHORT` (WARNING)
 */
export function ruleG12_SCurveTransitionShort(
  panels: G12PanelInput[],
  policy: Required<G12Policy>
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of panels) {
    if (panel.profile.kind !== 'S_CURVE') continue;

    const { r1, r2, sweepDeg1, sweepDeg2 } = panel.profile;
    const minTransition = policy.sCurveTransitionMultiplier * Math.max(r1, r2);

    // Arc lengths: L = R × θ_rad
    const arc1 = r1 * (sweepDeg1 * Math.PI) / 180;
    const arc2 = r2 * (sweepDeg2 * Math.PI) / 180;
    // Total developed length of both arcs
    const totalArc = arc1 + arc2;

    // We can only flag this if the arcs together are too short
    // (no explicit transition field — infer from total geometry)
    if (totalArc < minTransition) {
      issues.push({
        id: issueId('W_G12_SCURVE_TRANSITION_SHORT', panel.panelId, r1, r2),
        severity: 'WARNING',
        code: 'W_G12_SCURVE_TRANSITION_SHORT',
        message: `Panel "${panel.panelId}" S-curve: total arc length ${totalArc.toFixed(1)}mm may be insufficient for smooth transition (recommended ≥ ${minTransition.toFixed(1)}mm = ${policy.sCurveTransitionMultiplier}× max(r1,r2))`,
        partIds: [panel.panelId],
        context: {
          r1,
          r2,
          sweepDeg1,
          sweepDeg2,
          totalArcMm: totalArc,
          recommendedMinMm: minTransition,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G12.10 — GRAIN_PARALLEL_TO_BEND (WARNING)
// ============================================

/**
 * G12.10 — Grain Parallel To Bend
 *
 * Warns when the wood grain direction runs parallel to the bend axis.
 * Bending parallel to grain concentrates shear stress along annual
 * rings and significantly increases the risk of delamination or
 * splitting — especially in solid wood or thick veneer-core PLY.
 *
 * ## Issue Code
 * - `W_G12_GRAIN_PARALLEL_TO_BEND` (WARNING)
 */
export function ruleG12_GrainParallelToBend(panels: G12PanelInput[]): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of panels) {
    if (panel.grainDirection === undefined) continue;
    if (panel.profile.kind === 'RECT') continue;

    const arcs = extractArcParams(panel.profile);
    for (const arc of arcs) {
      const grainIsParallel =
        (arc.edge === 'TOP' || arc.edge === 'BOTTOM') && panel.grainDirection === 'ALONG_WIDTH' ||
        (arc.edge === 'LEFT' || arc.edge === 'RIGHT') && panel.grainDirection === 'ALONG_LENGTH';

      if (grainIsParallel) {
        issues.push({
          id: issueId('W_G12_GRAIN_PARALLEL_TO_BEND', panel.panelId, arc.edge, panel.grainDirection),
          severity: 'WARNING',
          code: 'W_G12_GRAIN_PARALLEL_TO_BEND',
          message: `Panel "${panel.panelId}" edge ${arc.edge}: grain direction ${panel.grainDirection} is parallel to bend axis — risk of splitting or delamination`,
          partIds: [panel.panelId],
          context: {
            edge: arc.edge,
            grainDirection: panel.grainDirection,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================
// AGGREGATOR
// ============================================

/**
 * Run all G12 curved-panel manufacturability rules.
 *
 * @param input - G12 validation input aggregate
 * @returns All GateIssues from every G12 sub-rule
 *
 * @example
 * const issues = runG12Rules(input);
 * const blockers = issues.filter(i => i.severity === 'BLOCKER');
 * if (blockers.length > 0) throw new Error('Curved panel not manufacturable');
 */
export function runG12Rules(input: G12Input): GateIssue[] {
  const policy: Required<G12Policy> = { ...DEFAULT_G12_POLICY, ...input.policy };
  const panels = input.panels;
  const patternInputs = input.patterns ?? [];
  const drillPoints = input.drillPoints ?? [];
  const slotInputs = input.slotPatterns ?? [];

  return [
    ...ruleG12_MaterialDataMissing(panels),                                    // G12.5 first — others depend on R_min
    ...ruleG12_RadiusBelowMin(panels),                                         // G12.1
    ...ruleG12_KerfSpacingTooTight(panels, patternInputs, policy),             // G12.2
    ...ruleG12_KerfDepthUnsafe(panels, patternInputs, policy),                 // G12.3
    ...ruleG12_FittingInKerfZone(patternInputs, drillPoints, policy),          // G12.4
    ...ruleG12_SlotEdgeInsufficient(slotInputs, policy),                       // G12.6
    ...ruleG12_SlotPairMismatch(slotInputs, policy),                           // G12.7
    ...ruleG12_SlotOverlapsKerf(patternInputs, slotInputs, policy),            // G12.8
    ...ruleG12_SCurveTransitionShort(panels, policy),                          // G12.9 (WARNING)
    ...ruleG12_GrainParallelToBend(panels),                                    // G12.10 (WARNING)
  ];
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Extract { edge, radius } pairs from any PanelProfile kind.
 * Returns empty array for RECT.
 */
function extractArcParams(
  profile: PanelProfile
): Array<{ edge: string; radius: number }> {
  switch (profile.kind) {
    case 'RECT':
      return [];
    case 'ARC':
      return [{ edge: profile.edge, radius: profile.radius }];
    case 'S_CURVE':
      return [
        { edge: profile.edge, radius: profile.r1 },
        { edge: profile.edge, radius: profile.r2 },
      ];
    case 'ROUNDED_CORNER': {
      const corners = profile.corners;
      return Object.entries(corners)
        .filter((entry): entry is [string, number] => entry[1] !== undefined)
        .map(([corner, radius]) => ({ edge: corner, radius }));
    }
  }
}

/**
 * Resolve the nominal blade/bit width (k_eff) from a KerfToolProfile.
 *
 * For SAW: bladeKerf is the physical slot width.
 * For ROUTER: bitDiameter is the physical slot width.
 */
function resolveBladeWidth(tool: import('../../core/catalog/KerfBending').KerfToolProfile): number {
  if (tool.kind === 'SAW') return tool.bladeKerf;
  return tool.bitDiameter;
}

/**
 * Map a KerfZone edge to the drill coordinate axis it runs along.
 *
 * TOP / BOTTOM zones run along the panel X axis (width dimension).
 * LEFT / RIGHT zones run along the panel Y axis (height dimension).
 *
 * The coordinate returned is used to test whether a drill point
 * falls within the zone span [zone.start, zone.end].
 */
function edgeCoord(
  edge: string,
  x: number,
  y: number
): number {
  // TOP/BOTTOM zones → kerf cuts run along X (zone.start/end are X positions)
  if (edge === 'TOP' || edge === 'BOTTOM') return x;
  // LEFT/RIGHT zones → kerf cuts run along Y
  return y;
}
