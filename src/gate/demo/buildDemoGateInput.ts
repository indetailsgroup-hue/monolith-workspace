/**
 * Gate v0.1 — Demo Data Builder
 *
 * Creates deterministic GateInput scenarios so the team can test:
 *   A) PASS (0 blockers)
 *   B) DRILL_DEPTH_FAIL
 *   C) CUTSIZE_FAIL
 *   D) FITTING_SPACING_FAIL
 *   E) MIN_MARGIN_FAIL
 *
 * Usage:
 * - In Gate panel, set Policy Version to trigger scenario:
 *   "gate-pass-0.1"  → PASS
 *   "gate-depth-0.1" → DRILL_DEPTH_FAIL
 *   "gate-cut-0.1"   → CUTSIZE_FAIL
 *   "gate-fit-0.1"   → FITTING_SPACING_FAIL
 *   "gate-edge-0.1"  → MIN_MARGIN_FAIL
 */

import type {
  GateInput,
  PartSpec,
  MaterialSpec,
  EdgeSpec,
  DrillOp,
  FittingIntent,
  EdgeSide,
} from '../types';

// ============================================
// SCENARIO TYPES
// ============================================

export type DemoScenario =
  | 'PASS'
  | 'DRILL_DEPTH_FAIL'
  | 'CUTSIZE_FAIL'
  | 'FITTING_SPACING_FAIL'
  | 'MIN_MARGIN_FAIL';

// ============================================
// HELPER FACTORIES
// ============================================

function edge(enabled: boolean, thicknessMm: number, premillMm: number): EdgeSpec {
  return { enabled, thicknessMm, premillMm };
}

function edgesAll(off = false, thickness = 0.8, premill = 0.5): Record<EdgeSide, EdgeSpec> {
  const en = !off;
  return {
    L: edge(en, thickness, premill),
    R: edge(en, thickness, premill),
    T: edge(en, thickness, premill),
    B: edge(en, thickness, premill),
  };
}

function material(core: number, sA: number, sB: number): MaterialSpec {
  return {
    coreThicknessMm: core,
    surfaceAThicknessMm: sA,
    surfaceBThicknessMm: sB,
  };
}

// ============================================
// BASE DATA FACTORIES
// ============================================

function baseParts(): PartSpec[] {
  return [
    {
      partId: 'PANEL_SIDE_L',
      name: 'Side Left',
      finishW: 560,
      finishH: 720,
      material: material(16, 0.3, 0.3), // 16.6mm total
      edges: {
        ...edgesAll(false, 0.8, 0.5),
        B: edge(false, 0, 0), // bottom raw
      },
      tags: ['SIDE_PANEL'],
    },
    {
      partId: 'PANEL_SIDE_R',
      name: 'Side Right',
      finishW: 560,
      finishH: 720,
      material: material(16, 0.3, 0.3),
      edges: {
        ...edgesAll(false, 0.8, 0.5),
        B: edge(false, 0, 0),
      },
      tags: ['SIDE_PANEL'],
    },
    {
      partId: 'PANEL_BOTTOM',
      name: 'Bottom',
      finishW: 900,
      finishH: 560,
      material: material(16, 0.3, 0.3),
      edges: {
        ...edgesAll(false, 0.8, 0.5),
        B: edge(false, 0, 0), // back edge hidden
      },
      tags: ['BOTTOM'],
    },
    {
      partId: 'PANEL_BACK',
      name: 'Back Panel',
      finishW: 900,
      finishH: 720,
      material: material(9, 0.0, 0.0), // 9mm thin back
      edges: edgesAll(true, 0.0, 0.0), // no edging
      tags: ['BACK_PANEL'],
    },
    {
      partId: 'PANEL_SHELF_1',
      name: 'Shelf',
      finishW: 900,
      finishH: 540,
      material: material(16, 0.3, 0.3),
      edges: {
        ...edgesAll(false, 0.8, 0.5),
        B: edge(false, 0, 0), // back edge raw
      },
      tags: ['SHELF'],
    },
  ];
}

function baseDrills(): DrillOp[] {
  return [
    { opId: 'DRILL_1', partId: 'PANEL_SIDE_L', x: 37, y: 64, depthMm: 12, diaMm: 5 },
    { opId: 'DRILL_2', partId: 'PANEL_SIDE_R', x: 37, y: 64, depthMm: 12, diaMm: 5 },
    { opId: 'DRILL_3', partId: 'PANEL_BOTTOM', x: 100, y: 40, depthMm: 12, diaMm: 5 },
  ];
}

function baseFittings(): FittingIntent[] {
  return [
    { fittingId: 'MINIFIX_A1', partId: 'PANEL_SIDE_L', x: 37, y: 64, groupKey: 'MINIFIX_ROW_1' },
    { fittingId: 'MINIFIX_A2', partId: 'PANEL_SIDE_L', x: 37, y: 160, groupKey: 'MINIFIX_ROW_1' },
    { fittingId: 'MINIFIX_B1', partId: 'PANEL_SIDE_R', x: 37, y: 64, groupKey: 'MINIFIX_ROW_1' },
    { fittingId: 'MINIFIX_B2', partId: 'PANEL_SIDE_R', x: 37, y: 160, groupKey: 'MINIFIX_ROW_1' },
  ];
}

// ============================================
// SCENARIO BUILDERS
// ============================================

/**
 * Build demo GateInput for a specific scenario
 */
export function buildDemoGateInput(
  snapshotId: string,
  scenario: DemoScenario = 'PASS'
): GateInput {
  const parts = baseParts();
  const drillOps = baseDrills();
  const fittings = baseFittings();

  // Cabinet level data for back-panel rules
  const cabinet = { backPanelThicknessMm: 9 };

  // ============================================
  // SCENARIO: PASS (0 blockers)
  // ============================================
  if (scenario === 'PASS') {
    return { snapshotId, parts, drillOps, fittings, cabinet };
  }

  // ============================================
  // SCENARIO: DRILL_DEPTH_FAIL
  // Drill exceeds safe thickness on thin back panel
  // PANEL_BACK: 9mm, margin 0.5mm → max depth 8.5mm
  // ============================================
  if (scenario === 'DRILL_DEPTH_FAIL') {
    drillOps.push({
      opId: 'DRILL_FAIL_1',
      partId: 'PANEL_BACK',
      x: 50,
      y: 50,
      depthMm: 10, // > 8.5mm safe max → BLOCKER
      diaMm: 5,
    });
    return { snapshotId, parts, drillOps, fittings, cabinet };
  }

  // ============================================
  // SCENARIO: CUTSIZE_FAIL
  // Edge thickness > finish size → negative cut
  // ============================================
  if (scenario === 'CUTSIZE_FAIL') {
    const target = parts.find((p) => p.partId === 'PANEL_SHELF_1');
    if (target) {
      target.finishW = 10; // absurdly small
      target.finishH = 10;
      target.edges = edgesAll(false, 2.0, 0.0); // 2mm edges eat 8mm total
      // Cut = 10 - 2 - 2 + 0 + 0 = 6mm (still positive but very small)
      // Let's make it worse:
      target.edges = {
        L: edge(true, 6, 0),
        R: edge(true, 6, 0),
        T: edge(true, 6, 0),
        B: edge(true, 6, 0),
      };
      // Cut = 10 - 6 - 6 = -2mm → BLOCKER
    }
    return { snapshotId, parts, drillOps, fittings, cabinet };
  }

  // ============================================
  // SCENARIO: FITTING_SPACING_FAIL
  // Two fittings < 32mm apart
  // ============================================
  if (scenario === 'FITTING_SPACING_FAIL') {
    fittings.push({
      fittingId: 'MINIFIX_TOO_CLOSE_1',
      partId: 'PANEL_SIDE_L',
      x: 100,
      y: 100,
      groupKey: 'CLOSE',
    });
    fittings.push({
      fittingId: 'MINIFIX_TOO_CLOSE_2',
      partId: 'PANEL_SIDE_L',
      x: 110,
      y: 110,
      groupKey: 'CLOSE',
    });
    // Distance = √((110-100)² + (110-100)²) = √200 ≈ 14.1mm < 32mm → BLOCKER
    return { snapshotId, parts, drillOps, fittings, cabinet };
  }

  // ============================================
  // SCENARIO: MIN_MARGIN_FAIL
  // Drill and fitting too close to edge
  // ============================================
  if (scenario === 'MIN_MARGIN_FAIL') {
    // Policy min margin = 8mm, min setback = 18mm
    drillOps.push({
      opId: 'DRILL_NEAR_EDGE',
      partId: 'PANEL_BOTTOM',
      x: 3, // < 8mm from edge → BLOCKER
      y: 3,
      depthMm: 10,
      diaMm: 5,
    });
    fittings.push({
      fittingId: 'FIT_NEAR_EDGE',
      partId: 'PANEL_BOTTOM',
      x: 5, // < 18mm from edge → BLOCKER
      y: 5,
      groupKey: 'EDGE',
    });
    return { snapshotId, parts, drillOps, fittings, cabinet };
  }

  // Fallback: PASS
  return { snapshotId, parts, drillOps, fittings, cabinet };
}

// ============================================
// POLICY VERSION PARSER
// ============================================

/**
 * Parse policy version string to determine scenario
 *
 * Examples:
 *   "gate-pass-0.1"  → PASS
 *   "gate-depth-0.1" → DRILL_DEPTH_FAIL
 *   "gate-cut-0.1"   → CUTSIZE_FAIL
 *   "gate-fit-0.1"   → FITTING_SPACING_FAIL
 *   "gate-edge-0.1"  → MIN_MARGIN_FAIL
 *   "policy-1.0.0"   → PASS (default)
 */
export function parseScenarioFromPolicyVersion(policyVersion: string): DemoScenario {
  const lower = policyVersion.toLowerCase();

  if (lower.includes('depth')) return 'DRILL_DEPTH_FAIL';
  if (lower.includes('cut')) return 'CUTSIZE_FAIL';
  if (lower.includes('fit') || lower.includes('spacing')) return 'FITTING_SPACING_FAIL';
  if (lower.includes('edge') || lower.includes('margin')) return 'MIN_MARGIN_FAIL';
  if (lower.includes('pass') || lower.includes('ok')) return 'PASS';

  // Default to PASS for unknown policy versions
  return 'PASS';
}

/**
 * Build demo input using policy version to select scenario
 */
export function buildDemoGateInputFromPolicy(
  snapshotId: string,
  policyVersion: string
): GateInput {
  const scenario = parseScenarioFromPolicyVersion(policyVersion);
  return buildDemoGateInput(snapshotId, scenario);
}
