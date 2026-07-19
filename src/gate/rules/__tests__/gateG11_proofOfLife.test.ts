/**
 * Gate G11 — proof of life on a multi-cabinet kitchen run (S19)
 *
 * @module gate/rules/__tests__/gateG11_proofOfLife.test
 *
 * The S19 fix removed 110 false-positive blockers from a 7-cabinet run. A drop
 * like that is only good news if the rule can still bite; a rule that was
 * quietly disabled would show the same drop, and would be far worse than the
 * false positives it replaced.
 *
 * So this file does two things on the SAME scene:
 *   1. asserts correct generator output raises no bore-type blockers;
 *   2. corrupts every dowel depth in that output and asserts the gate catches
 *      every single one.
 *
 * If someone "fixes" a future false positive by neutering the rule, (1) keeps
 * passing and (2) goes red.
 */

import { describe, it, expect } from 'vitest';
import { generateMinifixDrillMap } from '../../../core/manufacturing/drillMap/generateDrillMap';
import { validateG11FromDrillMap } from '../gateG11_minifixSystem32';
import { buildDrillOpsFromDrillMap, buildPartsFromDrillMap } from '../../builders/fromDrillMap';
import { ruleDrillDepthSafety } from '../rule_drillDepthSafety';
import { DEFAULT_GATE_POLICY_V1 } from '../../policy';
import type { Cabinet, CabinetPanel } from '../../../core/types/Cabinet';
import type { DrillMap } from '../../../core/manufacturing/drillMap/types';

// ============================================
// A KITCHEN RUN
// ============================================

function panel(
  id: string, role: string, fw: number, fh: number,
  position: [number, number, number], t: number,
): CabinetPanel {
  return {
    id, role, name: id, finishWidth: fw, finishHeight: fh,
    coreMaterialId: 'core-1',
    faces: { faceA: null, faceB: null },
    edges: { top: null, bottom: null, left: null, right: null },
    grainDirection: 'VERTICAL',
    computed: { realThickness: t, cutWidth: fw, cutHeight: fh, surfaceArea: 0, edgeLength: 0, cost: 0, co2: 0 },
    position, rotation: [0, 0, 0], visible: true, selected: false,
  } as CabinetPanel;
}

function makeCabinet(
  id: string, W: number, H: number, D: number,
  construction: 'inset' | 'overlay', backT: number, T = 18,
): Cabinet {
  const hw = W - 2 * T + 2 * 9;
  const panels: CabinetPanel[] = [
    panel(`${id}-top`, 'TOP', hw, D, [0, H - T / 2, D / 2], T),
    panel(`${id}-bottom`, 'BOTTOM', hw, D, [0, T / 2, D / 2], T),
    panel(`${id}-left`, 'LEFT_SIDE', D, H, [-(hw / 2 - 9 + T / 2), H / 2, D / 2], T),
    panel(`${id}-right`, 'RIGHT_SIDE', D, H, [(hw / 2 - 9 + T / 2), H / 2, D / 2], T),
    panel(`${id}-back`, 'BACK', W, H, [0, H / 2, backT / 2], backT),
  ];
  return {
    id, name: id, type: 'BASE',
    dimensions: { width: W, height: H, depth: D, toeKickHeight: 100 },
    structure: {
      topJoint: 'INSET', bottomJoint: 'INSET', hasBackPanel: true,
      backPanelConstruction: construction, backPanelInset: 6, shelfCount: 0, dividerCount: 0,
    },
    materials: { defaultCore: 'core-1', defaultSurface: 'surface-1', defaultEdge: 'edge-1', overrides: new Map() },
    manufacturing: {
      glueThickness: 0.1, preMilling: 0.5, grooveDepth: 8, clearance: 2, shelfSetbackFront: 20,
      backPanelConstruction: construction, backVoid: 20, backThickness: backT, safetyGap: 2,
    },
    panels,
    computed: { totalCost: 0, totalCO2: 0, panelCount: panels.length, totalSurfaceArea: 0, totalEdgeLength: 0 },
    createdAt: 0, updatedAt: 0,
  } as Cabinet;
}

/** Base units, a tall unit and wall units; mixed inset/overlay backs. */
function kitchenRun(): Cabinet[] {
  return [
    makeCabinet('base-600', 600, 720, 560, 'overlay', 6),
    makeCabinet('base-800', 800, 720, 560, 'overlay', 6),
    makeCabinet('base-450', 450, 720, 560, 'inset', 6),
    makeCabinet('tall-600', 600, 2100, 560, 'overlay', 6),
    makeCabinet('wall-600', 600, 700, 330, 'overlay', 6),
    makeCabinet('wall-900', 900, 700, 330, 'inset', 6),
    makeCabinet('base-1000', 1000, 720, 560, 'overlay', 18),
  ];
}

const BORE_TYPE_CODES = [
  'B_G11_DOWEL_DEPTH_SIDE_WRONG',
  'B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG',
  'B_G11_DRILL_TYPE_HORIZONTAL_NOT_FACE',
];

function dowelDepthBlockers(map: DrillMap): number {
  return validateG11FromDrillMap(map).issues.filter(
    i => i.severity === 'BLOCKER' && i.code.startsWith('B_G11_DOWEL_DEPTH'),
  ).length;
}

describe('G11 on a 7-cabinet kitchen run', () => {
  const maps = kitchenRun().map(c => generateMinifixDrillMap(c));

  it('drills a substantial scene (guards against an empty-scene false pass)', () => {
    const points = maps.reduce((n, m) => n + m.panels.reduce((k, p) => k + p.points.length, 0), 0);
    expect(points).toBeGreaterThan(800);
  });

  it('raises ZERO bore-type blockers on correct generator output', () => {
    const found: string[] = [];
    for (const map of maps) {
      for (const issue of validateG11FromDrillMap(map).issues) {
        if (issue.severity === 'BLOCKER' && BORE_TYPE_CODES.includes(issue.code)) {
          found.push(`${issue.code}: ${issue.message}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('PROOF OF LIFE: catches every corrupted dowel depth on the same scene', () => {
    let injected = 0;
    let caught = 0;

    for (const cab of kitchenRun()) {
      const map = generateMinifixDrillMap(cab);
      const before = dowelDepthBlockers(map);

      // Swap 12 <-> 18: drill each face bore to edge depth and vice versa.
      // Every one of these is a genuine, assembly-breaking defect.
      for (const p of map.panels) {
        for (const pt of p.points) {
          if (pt.purpose !== 'DOWEL') continue;
          if (pt.depth === 12) { pt.depth = 18; injected++; }
          else if (pt.depth === 18) { pt.depth = 12; injected++; }
        }
      }

      caught += dowelDepthBlockers(map) - before;
    }

    expect(injected).toBeGreaterThan(300);
    // Every corrupted hole must be reported. Anything less means the rule has
    // blind spots; zero means it was disabled.
    expect(caught).toBe(injected);
  });

  it('PROOF OF LIFE: the material rule catches every over-deep bore', () => {
    let injected = 0;
    let caught = 0;

    for (const map of maps) {
      const parts = buildPartsFromDrillMap(map);
      const before = ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, parts, buildDrillOpsFromDrillMap(map).ops)
        .filter(i => i.severity === 'BLOCKER').length;

      // Drive every hole 5mm past its own panel's thickness.
      const deepened = buildDrillOpsFromDrillMap(map).ops.map(op => ({
        ...op,
        depthMm: (op.boreAxisMaterialMm ?? 18) + 5,
      }));
      injected += deepened.length;

      caught += ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, parts, deepened)
        .filter(i => i.severity === 'BLOCKER').length;
      // `before` is real drill-through on the 6mm back panels; not double counted
      // because `deepened` replaces rather than adds to the op list.
      void before;
    }

    expect(injected).toBeGreaterThan(800);
    expect(caught).toBe(injected);
  });

  it('examines every hole — the rule is fed, not starved', () => {
    for (const map of maps) {
      const points = map.panels.reduce((n, p) => n + p.points.length, 0);
      const { ops, skipped } = buildDrillOpsFromDrillMap(map);
      expect(skipped).toEqual([]);
      expect(ops).toHaveLength(points);
    }
  });
});
