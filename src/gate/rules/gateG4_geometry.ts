/**
 * Gate G4: Geometry Safety Rules
 *
 * @module gate/rules/gateG4_geometry
 * @version 1.0.0
 *
 * Validates cabinet geometry for manufacturing safety:
 * - G4.1: OD Budget - Computed geometry fits within declared dimensions
 * - G4.2: Panel Overlap - No two panels occupy the same space
 * - G4.3: Edge Feasibility - Edge bands don't conflict with construction type
 *
 * ## Philosophy
 * These rules catch geometry errors that would cause:
 * - CNC collisions (overlapping panels)
 * - Incorrect cabinet fit (OD budget exceeded)
 * - Edge banding failures (back panel shouldn't have exposed edges)
 *
 * @example
 * const issues = [
 *   ...ruleG4_OdBudget(policy, cabinet),
 *   ...ruleG4_PanelOverlap(cabinet),
 *   ...ruleG4_EdgeFeasibility(cabinet),
 * ];
 */

import type { GateIssue } from '../types';
import { issueId } from '../utils/idGen';
import {
  computeCabinetAabbs,
  checkOdBudget,
  findOverlappingPanels,
  type CabinetForAabb,
} from '../../core/geometry/cabinetAabb';

// ============================================
// G4 POLICY EXTENSION
// ============================================

/**
 * Policy settings for G4 geometry rules.
 *
 * These can be merged with the main GatePolicy or used standalone.
 */
export interface G4Policy {
  /** Tolerance for OD budget check (mm), default 0.1mm */
  odToleranceMm?: number;
  /** Minimum overlap volume to report as BLOCKER (mm³), default 1mm³ */
  minOverlapVolumeToBlock?: number;
  /** Whether to allow edge banding on back panels, default false */
  allowBackPanelEdgeBanding?: boolean;
}

const DEFAULT_G4_POLICY: Required<G4Policy> = {
  odToleranceMm: 0.1,
  minOverlapVolumeToBlock: 1, // 1mm³ = tiny overlap still a problem
  allowBackPanelEdgeBanding: false,
};

// ============================================
// G4.1: OD BUDGET VALIDATION
// ============================================

/**
 * G4.1 - OD Budget Rule
 *
 * Validates that computed cabinet geometry doesn't exceed declared
 * outer dimensions (width × height × depth).
 *
 * ## Issue Codes
 * - `B_G4_OD_WIDTH_EXCEEDED` (BLOCKER): Width exceeds budget
 * - `B_G4_OD_HEIGHT_EXCEEDED` (BLOCKER): Height exceeds budget
 * - `B_G4_OD_DEPTH_EXCEEDED` (BLOCKER): Depth exceeds budget
 *
 * ## Common Causes
 * - Panel thickness not properly accounted in geometry
 * - Surface material thickness added after dimension calculation
 * - Back panel overlay increasing total depth
 *
 * @param policy - G4 policy settings
 * @param cabinet - Cabinet to validate
 * @returns Array of gate issues (empty if passes)
 *
 * @example
 * const issues = ruleG4_OdBudget({ odToleranceMm: 0.1 }, cabinet);
 * if (issues.some(i => i.severity === 'BLOCKER')) {
 *   console.error('Cabinet exceeds declared dimensions!');
 * }
 */
export function ruleG4_OdBudget(
  policy: G4Policy,
  cabinet: CabinetForAabb
): GateIssue[] {
  const issues: GateIssue[] = [];
  const p = { ...DEFAULT_G4_POLICY, ...policy };

  // Compute AABBs for all panels
  const { cabinetAabb } = computeCabinetAabbs(cabinet);

  // Check against declared dimensions
  const result = checkOdBudget(
    cabinetAabb,
    cabinet.dimensions.width,
    cabinet.dimensions.height,
    cabinet.dimensions.depth,
    p.odToleranceMm
  );

  if (!result.pass) {
    // Report each exceeded dimension as separate blocker
    if (result.deltaWidth > p.odToleranceMm) {
      issues.push({
        id: issueId('B_G4_OD_WIDTH_EXCEEDED', cabinet.id, result.deltaWidth),
        severity: 'BLOCKER',
        code: 'B_G4_OD_WIDTH_EXCEEDED',
        message: `Cabinet width ${result.computedWidth.toFixed(1)}mm exceeds declared ${cabinet.dimensions.width}mm by ${result.deltaWidth.toFixed(2)}mm`,
        context: {
          declared: cabinet.dimensions.width,
          computed: Math.round(result.computedWidth * 100) / 100,
          delta: Math.round(result.deltaWidth * 100) / 100,
          tolerance: p.odToleranceMm,
        },
      });
    }

    if (result.deltaHeight > p.odToleranceMm) {
      issues.push({
        id: issueId('B_G4_OD_HEIGHT_EXCEEDED', cabinet.id, result.deltaHeight),
        severity: 'BLOCKER',
        code: 'B_G4_OD_HEIGHT_EXCEEDED',
        message: `Cabinet height ${result.computedHeight.toFixed(1)}mm exceeds declared ${cabinet.dimensions.height}mm by ${result.deltaHeight.toFixed(2)}mm`,
        context: {
          declared: cabinet.dimensions.height,
          computed: Math.round(result.computedHeight * 100) / 100,
          delta: Math.round(result.deltaHeight * 100) / 100,
          tolerance: p.odToleranceMm,
        },
      });
    }

    if (result.deltaDepth > p.odToleranceMm) {
      issues.push({
        id: issueId('B_G4_OD_DEPTH_EXCEEDED', cabinet.id, result.deltaDepth),
        severity: 'BLOCKER',
        code: 'B_G4_OD_DEPTH_EXCEEDED',
        message: `Cabinet depth ${result.computedDepth.toFixed(1)}mm exceeds declared ${cabinet.dimensions.depth}mm by ${result.deltaDepth.toFixed(2)}mm`,
        context: {
          declared: cabinet.dimensions.depth,
          computed: Math.round(result.computedDepth * 100) / 100,
          delta: Math.round(result.deltaDepth * 100) / 100,
          tolerance: p.odToleranceMm,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G4.2: PANEL OVERLAP DETECTION
// ============================================

/**
 * G4.2 - Panel Overlap Rule
 *
 * Validates that no two panels occupy the same physical space.
 * Panel collisions would cause CNC cutting errors and assembly failures.
 *
 * ## Issue Codes
 * - `B_G4_PANEL_OVERLAP` (BLOCKER): Two panels occupy same space
 *
 * ## Common Causes
 * - Incorrect panel positioning after dimension change
 * - Shelf positioned inside side panel
 * - Back panel not properly offset for overlay mode
 *
 * @param cabinet - Cabinet to validate
 * @param policy - Optional G4 policy settings
 * @returns Array of gate issues (empty if no overlaps)
 *
 * @example
 * const issues = ruleG4_PanelOverlap(cabinet);
 * for (const issue of issues) {
 *   console.error(issue.message);
 * }
 */
export function ruleG4_PanelOverlap(
  cabinet: CabinetForAabb,
  policy: G4Policy = {}
): GateIssue[] {
  const issues: GateIssue[] = [];
  const p = { ...DEFAULT_G4_POLICY, ...policy };

  // Compute AABBs and find overlaps
  const { panelAabbs } = computeCabinetAabbs(cabinet);
  const overlaps = findOverlappingPanels(panelAabbs);

  // Report each overlap as a blocker
  for (const overlap of overlaps) {
    if (overlap.overlapVolume >= p.minOverlapVolumeToBlock) {
      issues.push({
        id: issueId('B_G4_PANEL_OVERLAP', overlap.panelA, overlap.panelB, overlap.overlapVolume),
        severity: 'BLOCKER',
        code: 'B_G4_PANEL_OVERLAP',
        message: `Panels ${overlap.roleA} and ${overlap.roleB} overlap by ${overlap.overlapVolume.toFixed(0)}mm³`,
        partIds: [overlap.panelA, overlap.panelB],
        context: {
          panelA: overlap.panelA,
          panelB: overlap.panelB,
          roleA: overlap.roleA,
          roleB: overlap.roleB,
          overlapVolumeMm3: Math.round(overlap.overlapVolume),
        },
      });
    }
  }

  return issues;
}

// ============================================
// G4.3: EDGE BANDING FEASIBILITY
// ============================================

/**
 * Panel interface with edge information for G4.3
 */
interface PanelWithEdges {
  id: string;
  role: string;
  name: string;
  edges?: {
    top?: string | null;
    bottom?: string | null;
    left?: string | null;
    right?: string | null;
  };
  [key: string]: unknown;
}

/**
 * Cabinet interface with structure and panels for G4.3
 */
interface CabinetForEdgeFeasibility {
  id: string;
  structure: {
    hasBackPanel: boolean;
    backPanelConstruction: 'inset' | 'overlay';
    [key: string]: unknown;
  };
  panels: PanelWithEdges[];
  [key: string]: unknown;
}

/**
 * G4.3 - Edge Banding Feasibility Rule
 *
 * Validates that edge banding assignments are feasible for the
 * panel's construction context:
 * - BACK panels in overlay mode shouldn't have visible edges
 * - BACK panels in inset mode can have front edge banding
 *
 * ## Issue Codes
 * - `W_G4_BACK_PANEL_EDGE` (WARNING): Back panel has edge banding in overlay mode
 *
 * ## Rationale
 * In overlay mode, the back panel sits behind the carcass, so edge
 * banding is hidden and wasteful. In inset mode, the front edge
 * may be visible and require banding.
 *
 * @param cabinet - Cabinet to validate
 * @param policy - Optional G4 policy settings
 * @returns Array of gate issues (empty if all edges are feasible)
 *
 * @example
 * const issues = ruleG4_EdgeFeasibility(cabinet);
 * if (issues.length > 0) {
 *   console.warn('Some edge banding may be unnecessary');
 * }
 */
export function ruleG4_EdgeFeasibility(
  cabinet: CabinetForEdgeFeasibility,
  policy: G4Policy = {}
): GateIssue[] {
  const issues: GateIssue[] = [];
  const p = { ...DEFAULT_G4_POLICY, ...policy };

  // Skip if edge banding on back panels is allowed
  if (p.allowBackPanelEdgeBanding) {
    return issues;
  }

  // Only check in overlay mode - inset mode back panel may need edges
  if (!cabinet.structure.hasBackPanel || cabinet.structure.backPanelConstruction !== 'overlay') {
    return issues;
  }

  // Find back panel(s) and check for edge banding
  for (const panel of cabinet.panels) {
    if (panel.role !== 'BACK') continue;

    const edges = panel.edges;
    if (!edges) continue;

    // Check each edge for applied banding
    const appliedEdges: string[] = [];
    if (edges.top) appliedEdges.push('top');
    if (edges.bottom) appliedEdges.push('bottom');
    if (edges.left) appliedEdges.push('left');
    if (edges.right) appliedEdges.push('right');

    if (appliedEdges.length > 0) {
      issues.push({
        id: issueId('W_G4_BACK_PANEL_EDGE', panel.id, appliedEdges.join(',')),
        severity: 'WARNING',
        code: 'W_G4_BACK_PANEL_EDGE',
        message: `Back panel "${panel.name}" has edge banding on ${appliedEdges.join(', ')} - these edges are hidden in overlay mode`,
        partIds: [panel.id],
        context: {
          panelName: panel.name,
          construction: 'overlay',
          edgesWithBanding: appliedEdges.join(','), // Stringify for context compatibility
        },
      });
    }
  }

  return issues;
}

// ============================================
// COMBINED G4 VALIDATOR
// ============================================

/**
 * Run all G4 geometry rules on a cabinet.
 *
 * Convenience function to run G4.1, G4.2, and G4.3 together.
 *
 * @param policy - G4 policy settings
 * @param cabinet - Cabinet to validate (must satisfy all interfaces)
 * @returns Combined array of all G4 gate issues
 *
 * @example
 * const issues = runG4Rules({}, cabinet);
 * const blockers = issues.filter(i => i.severity === 'BLOCKER');
 * if (blockers.length > 0) {
 *   throw new Error('Geometry validation failed');
 * }
 */
export function runG4Rules(
  policy: G4Policy,
  cabinet: CabinetForAabb & CabinetForEdgeFeasibility
): GateIssue[] {
  return [
    ...ruleG4_OdBudget(policy, cabinet),
    ...ruleG4_PanelOverlap(cabinet, policy),
    ...ruleG4_EdgeFeasibility(cabinet, policy),
  ];
}
