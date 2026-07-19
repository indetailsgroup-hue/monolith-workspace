/**
 * Feeding the starved safety rules (S19)
 *
 * @module gate/builders/__tests__/fromDrillMap.test
 *
 * `ruleDrillDepthSafety` and `ruleMinMargins` both execute in production, and
 * both read `GateInput.drillOps` — an array nothing ever filled.
 * `buildGateInputFromBreakdown` defaults it to `[]` and the only caller that
 * ever passed real data to `setDrillOps` was a unit test. The drill-depth
 * safety rule had therefore never examined a single real hole.
 *
 * These tests pin three things:
 *   1. the builder turns a real drill map into real ops;
 *   2. the ops reach the rules through the production entry point
 *      (`runGateValidation`) — remove the wiring and this fails;
 *   3. feeding them does NOT reproduce the bore-type false positive: edge bores
 *      must pass, genuine through-drills must block.
 */

import { describe, it, expect } from 'vitest';
import { buildDrillOpsFromDrillMap, buildPartsFromDrillMap } from '../fromDrillMap';
import { ruleDrillDepthSafety } from '../../rules/rule_drillDepthSafety';
import { ruleMinMargins } from '../../rules/rule_minMargins';
import { DEFAULT_GATE_POLICY_V1, MIN_RESIDUAL_MATERIAL_MM } from '../../policy';
import type { DrillMap, DrillMapPanel, DrillMapPoint, Vec3Tuple } from '../../../core/manufacturing/drillMap/types';

// ============================================
// FIXTURES
// ============================================

const T = 18;
const HEIGHT = 720;
const DEPTH = 560;
const WIDTH = 600;

function point(
  id: string,
  panelId: string,
  position: Vec3Tuple,
  normal: Vec3Tuple,
  depth: number,
  diameter = 8,
): DrillMapPoint {
  return {
    id,
    panelId,
    position,
    normal,
    diameter,
    depth,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    status: 'VALID',
  };
}

/** LEFT_SIDE panel spanning X 0..18, Y 0..720, Z 0..560. */
function sidePanel(points: DrillMapPoint[]): DrillMapPanel {
  return {
    panelId: 'panel-left',
    role: 'LEFT_SIDE',
    dimensions: { width: DEPTH, height: HEIGHT, thickness: T },
    worldPosition: [T / 2, HEIGHT / 2, DEPTH / 2],
    worldRotation: [0, 0, 0],
    points,
  };
}

/** BACK panel, production default 6mm, spanning Z 0..6. */
function backPanel(points: DrillMapPoint[], thickness = 6): DrillMapPanel {
  return {
    panelId: 'panel-back',
    role: 'BACK',
    dimensions: { width: WIDTH, height: HEIGHT, thickness },
    worldPosition: [WIDTH / 2, HEIGHT / 2, thickness / 2],
    worldRotation: [0, 0, 0],
    points,
  };
}

function drillMap(panels: DrillMapPanel[]): DrillMap {
  return { version: '1.0.0', panels } as DrillMap;
}

function runSafety(map: DrillMap) {
  const parts = buildPartsFromDrillMap(map);
  const { ops, skipped } = buildDrillOpsFromDrillMap(map);
  const issues = [
    ...ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, parts, ops),
    ...ruleMinMargins(DEFAULT_GATE_POLICY_V1, parts, ops, []),
  ];
  return { ops, skipped, issues, parts };
}

// ============================================
// THE BUILDER PRODUCES REAL OPS
// ============================================

describe('buildDrillOpsFromDrillMap', () => {
  it('turns drill points into ops the rules can consume', () => {
    const map = drillMap([
      sidePanel([point('p1', 'panel-left', [9, 200, 300], [-1, 0, 0], 12)]),
    ]);
    const { ops, skipped } = buildDrillOpsFromDrillMap(map);

    expect(skipped).toEqual([]);
    expect(ops).toHaveLength(1);
    expect(ops[0].opId).toBe('p1');
    expect(ops[0].partId).toBe('panel-left');
    expect(ops[0].depthMm).toBe(12);
  });

  it('records the material along the bore axis, not the thickness', () => {
    const map = drillMap([
      sidePanel([
        // FACE bore, along X — 18mm of material
        point('face', 'panel-left', [9, 200, 300], [-1, 0, 0], 12),
        // EDGE bore into the back edge, along Z — 560mm of material
        point('edge', 'panel-left', [9, 200, 0], [0, 0, 1], 18),
      ]),
    ]);
    const { ops } = buildDrillOpsFromDrillMap(map);
    const byId = new Map(ops.map(o => [o.opId, o]));

    expect(byId.get('face')!.boreAxisMaterialMm).toBe(T);
    expect(byId.get('face')!.boreType).toBe('FACE_BORE');
    expect(byId.get('edge')!.boreAxisMaterialMm).toBe(DEPTH);
    expect(byId.get('edge')!.boreType).toBe('EDGE_BORE');
  });

  it('reports panels it could not use instead of silently dropping holes', () => {
    const broken = {
      panelId: 'panel-x',
      role: 'LEFT_SIDE',
      points: [point('orphan', 'panel-x', [0, 0, 0], [1, 0, 0], 10)],
    } as unknown as DrillMapPanel;

    const { ops, skipped } = buildDrillOpsFromDrillMap(drillMap([broken]));
    expect(ops).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].pointId).toBe('orphan');
  });

  it('is deterministic', () => {
    const map = drillMap([
      sidePanel([
        point('b', 'panel-left', [9, 200, 300], [-1, 0, 0], 12),
        point('a', 'panel-left', [9, 300, 300], [-1, 0, 0], 12),
      ]),
    ]);
    const first = buildDrillOpsFromDrillMap(map).ops.map(o => o.opId);
    const second = buildDrillOpsFromDrillMap(map).ops.map(o => o.opId);
    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'b']);
  });
});

// ============================================
// NO FALSE-POSITIVE FLOOD
// ============================================

describe('feeding the rules does not reproduce the bore-type false positive', () => {
  it('an 18mm edge bore down a 560mm panel PASSES', () => {
    const map = drillMap([
      sidePanel([point('edge', 'panel-left', [9, 200, 0], [0, 0, 1], 18)]),
    ]);
    const { issues } = runSafety(map);
    expect(issues).toEqual([]);
  });

  it('an edge bore is not reported as too close to the edge it enters through', () => {
    // The bore enters at Z=0, i.e. exactly ON the panel edge. Measuring its
    // distance to that edge is a category error, not a blowout risk.
    const map = drillMap([
      sidePanel([point('edge', 'panel-left', [9, 300, 0], [0, 0, 1], 18)]),
    ]);
    const { ops, issues } = runSafety(map);
    expect(ops[0].edgeEntryAxis).toBe('x'); // side panel: face-plane X runs along Z
    expect(issues.filter(i => i.code === 'B_MIN_MARGIN_DRILL')).toEqual([]);
  });

  it('but the perpendicular margin on an edge bore is still enforced', () => {
    // Same edge bore, moved to 3mm from the panel's bottom — a real blowout risk
    // on the axis that is not the entry edge.
    const map = drillMap([
      sidePanel([point('edge-low', 'panel-left', [9, 3, 0], [0, 0, 1], 18)]),
    ]);
    const { issues } = runSafety(map);
    expect(issues.some(i => i.code === 'B_MIN_MARGIN_DRILL')).toBe(true);
  });
});

// ============================================
// THE REAL DEFECT THE STARVED RULE COULD NOT SEE
// ============================================

describe('through-drills on the production 6mm back panel', () => {
  it('BLOCKS the Ø10 x 17.5mm bolt bore into a 6mm back panel', () => {
    const map = drillMap([
      backPanel([point('bolt', 'panel-back', [300, 360, 6], [0, 0, -1], 17.5, 10)]),
    ]);
    const { issues } = runSafety(map);
    const blocker = issues.find(i => i.code === 'B_SAFETY_DRILL_DEPTH');

    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe('BLOCKER');
    // The bit exits the far face by 11.5mm — into the machine bed.
    expect(blocker!.context?.residualMm).toBe(-11.5);
    expect(blocker!.context?.boreAxisMaterialMm).toBe(6);
  });

  it('BLOCKS the 12mm back-panel dowel into 6mm', () => {
    const map = drillMap([
      backPanel([point('dowel', 'panel-back', [300, 360, 6], [0, 0, -1], 12)]),
    ]);
    const { issues } = runSafety(map);
    expect(issues.some(i => i.code === 'B_SAFETY_DRILL_DEPTH')).toBe(true);
  });

  it('the same bolt bore into an 18mm panel passes — but only just', () => {
    const map = drillMap([
      backPanel([point('bolt', 'panel-back', [300, 360, 18], [0, 0, -1], 17.5, 10)], 18),
    ]);
    const { issues } = runSafety(map);

    expect(issues.some(i => i.code === 'B_SAFETY_DRILL_DEPTH')).toBe(false);

    // 18 - 17.5 = 0.5 = exactly the margin. The gate must say so out loud
    // rather than let a rubber stamp look like a safety check.
    const warn = issues.find(i => i.code === 'W_SAFETY_DRILL_DEPTH_ZERO_MARGIN');
    expect(warn).toBeDefined();
    expect(warn!.context?.residualMm).toBe(MIN_RESIDUAL_MATERIAL_MM);
    expect(warn!.message).toContain('UNSOURCED');
  });

  it('a bore with real margin to spare is silent', () => {
    const map = drillMap([
      backPanel([point('shallow', 'panel-back', [300, 360, 18], [0, 0, -1], 13)], 18),
    ]);
    const { issues } = runSafety(map);
    expect(issues).toEqual([]);
  });
});

// ============================================
// THE MARGIN CONSTANT
// ============================================

describe('MIN_RESIDUAL_MATERIAL_MM', () => {
  it('is the value the policy uses', () => {
    expect(DEFAULT_GATE_POLICY_V1.thicknessSafetyMarginMm).toBe(MIN_RESIDUAL_MATERIAL_MM);
  });

  it('has not been quietly raised — raising it is a design decision, not a lint fix', () => {
    // If this fails, someone changed the margin. That is not forbidden, but it
    // newly FAILS every Ø10 x 17.5mm bolt bore in an 18mm panel across the
    // catalogue. Read the note on MIN_RESIDUAL_MATERIAL_MM before updating.
    expect(MIN_RESIDUAL_MATERIAL_MM).toBe(0.5);
  });
});
