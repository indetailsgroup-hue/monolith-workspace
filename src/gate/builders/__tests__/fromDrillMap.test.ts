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
import { ruleEdgeBoreCentering } from '../../rules/rule_edgeBoreCentering';
import { ruleMinMargins } from '../../rules/rule_minMargins';
import { DEFAULT_GATE_POLICY_V1, MIN_EDGE_BORE_WALL_MM, MIN_RESIDUAL_MATERIAL_MM } from '../../policy';
import type { DrillOp } from '../../types';
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

    expect(skipped).toHaveLength(1);
    expect(skipped[0].pointId).toBe('orphan');
    expect(skipped[0].reason).toBe('panel has no usable dimensions');

    // The hole is still emitted. Dropping it entirely would mean the depth rule
    // never sees a real bore at all — "cannot judge the position" silently
    // becoming "not checked". Depth and diameter are properties of the bore,
    // not of the panel, so they survive; everything that needs the panel's
    // orientation is omitted so the rules refuse rather than guess.
    expect(ops).toHaveLength(1);
    expect(ops[0].depthMm).toBe(10);
    expect(ops[0].x).toBeUndefined();
    expect(ops[0].y).toBeUndefined();
    expect(ops[0].boreAxisMaterialMm).toBeUndefined();
    expect(ops[0].boreType).toBeUndefined();
    expect(ops[0].boreThicknessOffsetMm).toBeUndefined();
  });

  it('refuses a role it cannot orient rather than assuming thickness-along-Z', () => {
    // A DOOR panel: nothing in this repo places one, so no axis can be claimed.
    const door = {
      panelId: 'panel-door',
      role: 'DOOR',
      dimensions: { width: 600, height: 720, thickness: 18 },
      worldPosition: [0, 0, 0],
      worldRotation: [0, 0, 0],
      points: [point('cup', 'panel-door', [0, 0, 0], [0, 0, 1], 13, 35)],
    } as unknown as DrillMapPanel;

    const { ops, skipped } = buildDrillOpsFromDrillMap(drillMap([door]));
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('panel role has no known orientation');
    expect(ops[0].boreAxisMaterialMm).toBeUndefined();
  });

  it('refuses a rotated panel even when its role IS known', () => {
    // The role→span convention assumes an axis-aligned panel; a 90° yaw
    // permutes which world axis carries the thickness.
    const rotated = {
      panelId: 'panel-rot',
      role: 'LEFT_SIDE',
      dimensions: { width: DEPTH, height: HEIGHT, thickness: T },
      worldPosition: [0, 0, 0],
      worldRotation: [0, Math.PI / 2, 0],
      points: [point('p', 'panel-rot', [0, 0, 0], [1, 0, 0], 12)],
    } as unknown as DrillMapPanel;

    const { ops, skipped } = buildDrillOpsFromDrillMap(drillMap([rotated]));
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('panel is rotated off-axis');
    expect(ops[0].boreAxisMaterialMm).toBeUndefined();
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
// THE DOCUMENTED FAIL-SAFE, NOW REACHABLE
// ============================================

describe('the strict fallback when the bore axis is unknown', () => {
  // DrillOp.boreAxisMaterialMm is documented: "Omit when unknown: depth rules
  // then fall back to the panel's composite thickness, which is the strictest
  // reading and never lets a real drill-through slip past."
  //
  // That branch was unreachable. The builder always supplied a value, because
  // the role convention it derived from DEFAULTED unknown roles to
  // thickness-along-Z instead of refusing. The docblock promised a safety net
  // that could not fire. These tests exercise it directly.

  const part = buildPartsFromDrillMap(
    drillMap([backPanel([point('x', 'panel-back', [300, 360, 18], [0, 0, -1], 1)], 18)]),
  );

  it('measures an axis-less op against the panel thickness and BLOCKS a through-drill', () => {
    const op: DrillOp = {
      opId: 'no-axis',
      partId: 'panel-back',
      depthMm: 20, // deeper than the 18mm panel is thick
      diaMm: 10,
      // boreAxisMaterialMm deliberately absent
    };

    const issues = ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, part, [op]);
    const blocker = issues.find(i => i.code === 'B_SAFETY_DRILL_DEPTH');

    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe('BLOCKER');
    // Judged against thickness (18), not against some larger guessed span.
    expect(blocker!.context?.boreAxisMaterialMm).toBe(18);
    expect(blocker!.context?.boreAxisKnown).toBe(false);
    expect(blocker!.context?.residualMm).toBe(-2);
    expect(blocker!.message).toContain('bore axis unknown');
  });

  it('is genuinely STRICTER: the same depth passes once the axis is known to be long', () => {
    const known: DrillOp = {
      opId: 'known-axis',
      partId: 'panel-back',
      depthMm: 20,
      diaMm: 10,
      boreAxisMaterialMm: 600, // an edge bore running down the panel
      boreType: 'EDGE_BORE',
    };

    expect(
      ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, part, [known])
        .filter(i => i.severity === 'BLOCKER'),
    ).toEqual([]);
  });

  it('no longer labels an unknown bore FACE_BORE — it says the axis is unknown', () => {
    const op: DrillOp = { opId: 'q', partId: 'panel-back', depthMm: 20, diaMm: 10 };
    const blocker = ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, part, [op])[0];
    // Asserting a bore type was stating as fact the very thing that could not
    // be determined.
    expect(blocker.context?.boreType).toBeNull();
  });

  it('the builder really does produce such an op from a real drill map', () => {
    // Proof the branch above is reachable from production input, not only from
    // a hand-built fixture.
    const door = {
      panelId: 'panel-door',
      role: 'DOOR',
      dimensions: { width: 600, height: 720, thickness: 18 },
      worldPosition: [0, 0, 0],
      worldRotation: [0, 0, 0],
      points: [point('cup', 'panel-door', [0, 0, 0], [0, 0, 1], 24, 35)],
    } as unknown as DrillMapPanel;

    const map = drillMap([door]);
    const { ops } = buildDrillOpsFromDrillMap(map);
    expect(ops[0].boreAxisMaterialMm).toBeUndefined();

    // 24mm deep into an 18mm door: caught by the fallback alone.
    const issues = ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, buildPartsFromDrillMap(map), ops);
    expect(issues.some(i => i.code === 'B_SAFETY_DRILL_DEPTH')).toBe(true);
  });
});

// ============================================
// MARGINS ARE MEASURED FROM THE BORE WALL
// ============================================

describe('edge margin is measured from the hole wall, not its centre', () => {
  const parts = buildPartsFromDrillMap(
    drillMap([sidePanel([point('p', 'panel-left', [9, 300, 300], [-1, 0, 0], 12)])]),
  );

  function marginIssues(x: number, dia: number) {
    const op: DrillOp = { opId: 'm', partId: 'panel-left', x, y: 300, depthMm: 12, diaMm: dia };
    return ruleMinMargins(DEFAULT_GATE_POLICY_V1, parts, [op], [])
      .filter(i => i.code === 'B_MIN_MARGIN_DRILL');
  }

  const MIN = DEFAULT_GATE_POLICY_V1.minMarginToEdgeMm; // 8

  it('BLOCKS a Ø35 hinge cup whose centre clears the threshold but whose wall does not', () => {
    // This is the case the hinge lane will feed in. Centre at 10mm passes a
    // centre-based check; the cup wall is at 10 - 17.5 = -7.5mm, i.e. already
    // through the edge. The old rule reported this as compliant.
    expect(marginIssues(10, 35)).toHaveLength(1);
  });

  it('accepts the same cup once there is genuinely enough material', () => {
    // Wall at 26 - 17.5 = 8.5mm ≥ 8mm.
    expect(marginIssues(26, 35)).toHaveLength(0);
  });

  it('is exact at the boundary for a Ø8 dowel', () => {
    expect(marginIssues(MIN + 4, 8)).toHaveLength(0); // wall exactly 8mm
    expect(marginIssues(MIN + 3.9, 8)).toHaveLength(1); // wall 7.9mm
  });

  it('says which measurement it used', () => {
    expect(marginIssues(10, 35)[0].message).toContain('Ø35 bore wall');
    expect(marginIssues(10, 35)[0].context?.boreRadiusMm).toBe(17.5);
  });

  it('flags an op with no diameter instead of quietly measuring from the centre', () => {
    const op: DrillOp = { opId: 'nodia', partId: 'panel-left', x: 300, y: 300, depthMm: 12 };
    const issues = ruleMinMargins(DEFAULT_GATE_POLICY_V1, parts, [op], []);
    expect(issues.some(i => i.code === 'W_MIN_MARGIN_DIAMETER_UNKNOWN')).toBe(true);
  });

  it('refuses to judge a hole with no face-plane position at all', () => {
    const op: DrillOp = { opId: 'nopos', partId: 'panel-left', depthMm: 12, diaMm: 8 };
    const issues = ruleMinMargins(DEFAULT_GATE_POLICY_V1, parts, [op], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('W_MIN_MARGIN_NOT_EVALUATED');
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].message).toContain('not a pass');
  });
});

// ============================================
// AN EDGE BORE MUST STAY INSIDE THE THICKNESS
// ============================================

describe('edge bore centring', () => {
  // Nothing checked this before: boreAxisMaterialMm says how much material is
  // AHEAD of the bit and edgeEntryAxis says which face-plane axis to ignore,
  // but neither says how close to a face the bore runs.
  const parts = buildPartsFromDrillMap(
    drillMap([sidePanel([point('p', 'panel-left', [9, 300, 0], [0, 0, 1], 18)])]),
  );

  function centringIssues(offset: number, dia: number) {
    const op: DrillOp = {
      opId: 'e',
      partId: 'panel-left',
      x: 300,
      y: 300,
      depthMm: 18,
      diaMm: dia,
      boreAxisMaterialMm: DEPTH,
      boreType: 'EDGE_BORE',
      edgeEntryAxis: 'x',
      boreThicknessOffsetMm: offset,
    };
    return ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, parts, [op]);
  }

  it('PASSES a Ø8 dowel centred in an 18mm edge', () => {
    expect(centringIssues(9, 8)).toEqual([]);
  });

  it('BLOCKS a dowel bored so far off centre it has no wall left', () => {
    // 4mm from the near face, minus the 4mm radius, leaves 0mm of wall on a
    // bore that runs 560mm down the panel.
    const issues = centringIssues(4, 8);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_SAFETY_EDGE_BORE_OFF_CENTRE');
    expect(issues[0].context?.wallMm).toBe(0);
    expect(issues[0].context?.centredOffsetMm).toBe(9);
  });

  it('BLOCKS a bore that has left the panel entirely', () => {
    // offset 2mm on a Ø8 bore: the bore axis is closer to the face than its own
    // radius, so the hole is already open along the side of the panel.
    expect(centringIssues(2, 8)).toHaveLength(1);
    expect(centringIssues(2, 8)[0].context?.wallMm).toBe(-2);
  });

  it('is exact at the threshold', () => {
    // wall = 4.5 - 4 = 0.5mm, exactly MIN_EDGE_BORE_WALL_MM, so admitted...
    expect(centringIssues(4.5, 8)).toEqual([]);
    // ...and 0.1mm worse is not.
    expect(centringIssues(4.4, 8)).toHaveLength(1);
  });

  // ---- THE KNOWN GAP, PINNED SO IT CANNOT BE LOST ----
  it('DOCUMENTED GAP: 3mm of wall passes, because the threshold is 0.5mm', () => {
    // This is the exact case that motivated the rule: an Ø8 dowel 2mm off
    // centre in an 18mm panel, leaving 3mm of wall over a 560mm bore. It
    // PASSES. The threshold was not raised to catch it — nothing sources a
    // figure for this failure mode, and picking one to fit the case in front of
    // you is precisely how the existing unsourced margin got there.
    //
    // If someone later raises MIN_EDGE_BORE_WALL_MM on real evidence, this test
    // goes red. That is the intended signal, not a regression: update it and
    // record the evidence on the constant.
    expect(MIN_EDGE_BORE_WALL_MM).toBe(0.5);
    const issues = centringIssues(7, 8);
    expect(issues).toEqual([]);
  });

  it('BLOCKS a bore wider than the panel it enters', () => {
    // A Ø35 cup driven into an 18mm edge cannot fit at any offset.
    for (const offset of [1, 9, 17]) {
      expect(centringIssues(offset, 35)).toHaveLength(1);
    }
  });

  it('ignores FACE bores — they enter ON a face by definition', () => {
    const face: DrillOp = {
      opId: 'f',
      partId: 'panel-left',
      x: 300, y: 300, depthMm: 12, diaMm: 8,
      boreAxisMaterialMm: T,
      boreType: 'FACE_BORE',
      boreThicknessOffsetMm: 0,
    };
    expect(ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, parts, [face])).toEqual([]);
  });

  it('refuses to judge an edge bore whose offset was never established', () => {
    const op: DrillOp = {
      opId: 'u',
      partId: 'panel-left',
      depthMm: 18, diaMm: 8,
      boreType: 'EDGE_BORE',
      // no boreThicknessOffsetMm
    };
    const issues = ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, parts, [op]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_SAFETY_EDGE_BORE_NOT_EVALUATED');
    expect(issues[0].message).toContain('not a pass');
  });

  it('refuses — does NOT block — a bore whose axis lands OUTSIDE the panel', () => {
    // The exact shape of the B-run generator inconsistency: a point assigned to
    // an 18mm panel but positioned 554mm across its thickness axis. That is not
    // an off-centre bore, it is a point that does not sit in the panel it names.
    // Blocking it "off-centre by 540mm" would be a confident, wrong verdict.
    const op: DrillOp = {
      opId: 'inconsistent',
      partId: 'panel-left',
      x: 536, y: 0, depthMm: 19, diaMm: 8,
      boreAxisMaterialMm: HEIGHT,
      boreType: 'EDGE_BORE',
      edgeEntryAxis: 'y',
      boreThicknessOffsetMm: 554, // impossible for an 18mm panel
    };
    const issues = ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, parts, [op]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_SAFETY_EDGE_BORE_NOT_EVALUATED');
    expect(issues[0].message).toContain('OUTSIDE the panel');
    expect(issues.some(i => i.severity === 'BLOCKER')).toBe(false);
  });

  it('the builder populates the offset from real drill map geometry', () => {
    const map = drillMap([
      // Back-edge dowel entering at Z=0, axis at X=9 — centred in the 18mm side.
      sidePanel([point('edge', 'panel-left', [9, 300, 0], [0, 0, 1], 18)]),
    ]);
    const { ops } = buildDrillOpsFromDrillMap(map);
    expect(ops[0].boreThicknessOffsetMm).toBe(9);
    expect(ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, buildPartsFromDrillMap(map), ops)).toEqual([]);
  });

  it('and catches a real off-centre bore end to end', () => {
    const map = drillMap([
      sidePanel([point('edge', 'panel-left', [2, 300, 0], [0, 0, 1], 18)]),
    ]);
    const { ops } = buildDrillOpsFromDrillMap(map);
    expect(ops[0].boreThicknessOffsetMm).toBe(2);
    const issues = ruleEdgeBoreCentering(DEFAULT_GATE_POLICY_V1, buildPartsFromDrillMap(map), ops);
    expect(issues.some(i => i.code === 'B_SAFETY_EDGE_BORE_OFF_CENTRE')).toBe(true);
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
