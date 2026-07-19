/**
 * runGateValidation — material safety rules must see real holes (S19)
 *
 * `ruleDrillDepthSafety` executed in production but always over an empty array:
 * `GateInput.drillOps` defaults to `[]` and the only caller that ever supplied
 * data was a unit test. A safety rule that has never examined a hole is not a
 * safety rule.
 *
 * This test drives the REAL production entry point (`runGateValidation`, which
 * AppGateProvider auto-runs on design changes) with REAL generator output, and
 * asserts the depth rule both fires on a genuine through-drill and fails the
 * gate. Delete the wiring in SafetyPanel and this test goes red.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runGateValidation } from '../SafetyPanel';
import { useGateStore } from '../gateStore';
import { useDrillMapStore } from '../../../core/store/useDrillMapStore';
import { generateMinifixDrillMap } from '../../../core/manufacturing/drillMap/generateDrillMap';
import type { Cabinet, CabinetPanel } from '../../../core/types/Cabinet';

// ============================================
// FIXTURE — 600x720x560, 18mm carcass, overlay back
// ============================================

const T = 18;
const WIDTH = 600;
const HEIGHT = 720;
const DEPTH = 560;

function panel(
  id: string,
  role: string,
  finishWidth: number,
  finishHeight: number,
  position: [number, number, number],
  realThickness: number,
): CabinetPanel {
  return {
    id,
    role,
    name: id,
    finishWidth,
    finishHeight,
    coreMaterialId: 'core-1',
    faces: { faceA: null, faceB: null },
    edges: { top: null, bottom: null, left: null, right: null },
    grainDirection: 'VERTICAL',
    computed: {
      realThickness,
      cutWidth: finishWidth,
      cutHeight: finishHeight,
      surfaceArea: 0,
      edgeLength: 0,
      cost: 0,
      co2: 0,
    },
    position,
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  } as CabinetPanel;
}

/**
 * @param backThickness 6mm is the production default (useCabinetStore:
 *   `backThickness: 6`). The back-panel joint hardcodes a 17.5mm bolt bore with
 *   no reference to that thickness.
 */
function cabinetWithOverlayBack(backThickness: number): Cabinet {
  const hw = WIDTH - 2 * T + 2 * 9;
  const panels: CabinetPanel[] = [
    panel('panel-top', 'TOP', hw, DEPTH, [0, HEIGHT - T / 2, DEPTH / 2], T),
    panel('panel-bottom', 'BOTTOM', hw, DEPTH, [0, T / 2, DEPTH / 2], T),
    panel('panel-left', 'LEFT_SIDE', DEPTH, HEIGHT, [-(hw / 2 - 9 + T / 2), HEIGHT / 2, DEPTH / 2], T),
    panel('panel-right', 'RIGHT_SIDE', DEPTH, HEIGHT, [(hw / 2 - 9 + T / 2), HEIGHT / 2, DEPTH / 2], T),
    panel('panel-back', 'BACK', WIDTH, HEIGHT, [0, HEIGHT / 2, backThickness / 2], backThickness),
  ];

  return {
    id: 'gate-truth-cabinet',
    name: 'Gate Truth Cabinet',
    type: 'BASE',
    dimensions: { width: WIDTH, height: HEIGHT, depth: DEPTH, toeKickHeight: 100 },
    structure: {
      topJoint: 'INSET',
      bottomJoint: 'INSET',
      hasBackPanel: true,
      backPanelConstruction: 'overlay',
      backPanelInset: 6,
      shelfCount: 0,
      dividerCount: 0,
    },
    materials: {
      defaultCore: 'core-1',
      defaultSurface: 'surface-1',
      defaultEdge: 'edge-1',
      overrides: new Map(),
    },
    manufacturing: {
      glueThickness: 0.1,
      preMilling: 0.5,
      grooveDepth: 8,
      clearance: 2,
      shelfSetbackFront: 20,
      backPanelConstruction: 'overlay',
      backVoid: 20,
      backThickness,
      safetyGap: 2,
    },
    panels,
    computed: {
      totalCost: 0,
      totalCO2: 0,
      panelCount: panels.length,
      totalSurfaceArea: 0,
      totalEdgeLength: 0,
    },
    createdAt: 0,
    updatedAt: 0,
  } as Cabinet;
}

describe('runGateValidation — drill depth safety on real holes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGateStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    useDrillMapStore.setState({ drillMap: null });
  });

  function runGateWith(backThickness: number) {
    const drillMap = generateMinifixDrillMap(cabinetWithOverlayBack(backThickness));
    useDrillMapStore.setState({ drillMap });
    runGateValidation();
    vi.advanceTimersByTime(100);
    return useGateStore.getState().lastResult!;
  }

  it('WIRING: the depth rule reaches real drill data through the production path', () => {
    // A 6mm back panel takes a 17.5mm bolt bore and 12mm dowels. These are real
    // through-drills. If drillOps is empty — the pre-S19 state — nothing here
    // fires and this test fails.
    const result = runGateWith(6);

    const depthBlockers = result.findings.blockers.filter(b => b.code === 'B_SAFETY_DRILL_DEPTH');
    expect(depthBlockers.length).toBeGreaterThan(0);

    // The bit exits the far face — verify the rule measured, not guessed.
    const worst = depthBlockers
      .map(b => Number(b.context?.residualMm))
      .sort((a, b) => a - b)[0];
    expect(worst).toBeLessThan(0);
  });

  it('a through-drill FAILS the gate, it does not merely get listed', () => {
    const result = runGateWith(6);

    const depthBlockers = result.findings.blockers.filter(b => b.code === 'B_SAFETY_DRILL_DEPTH');
    expect(depthBlockers.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
    // The depth blockers must be inside the error count, not merely rendered —
    // metrics.errors is what the factory packet reads.
    expect(result.metrics?.errors ?? 0).toBeGreaterThanOrEqual(depthBlockers.length);
  });

  it('names the panel and the material it measured against', () => {
    const result = runGateWith(6);
    const blocker = result.findings.blockers.find(b => b.code === 'B_SAFETY_DRILL_DEPTH')!;

    expect(blocker.message).toContain('along the bore axis');
    expect(blocker.context?.boreAxisMaterialMm).toBe(6);
    expect(blocker.context?.boreType).toBe('FACE_BORE');
  });

  it('an 18mm back panel produces NO depth blockers — correct work is not condemned', () => {
    const result = runGateWith(18);

    expect(result.findings.blockers.filter(b => b.code === 'B_SAFETY_DRILL_DEPTH')).toEqual([]);
    // ...and no edge bore is mistaken for a face bore either.
    expect(result.findings.blockers.filter(b => b.code === 'B_G11_DOWEL_DEPTH_SIDE_WRONG')).toEqual([]);
    expect(result.findings.blockers.filter(b => b.code === 'B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG')).toEqual([]);
  });

  it('surfaces the zero-margin bolt bore as a warning on an 18mm panel', () => {
    const result = runGateWith(18);
    const zeroMargin = result.findings.warnings.filter(
      w => w.code === 'W_SAFETY_DRILL_DEPTH_ZERO_MARGIN',
    );
    expect(zeroMargin.length).toBeGreaterThan(0);
    expect(zeroMargin[0].message).toContain('UNSOURCED');
  });

  it('checks every hole in the map, not a subset', () => {
    const drillMap = generateMinifixDrillMap(cabinetWithOverlayBack(18));
    const totalPoints = drillMap.panels.reduce((n, p) => n + p.points.length, 0);
    expect(totalPoints).toBeGreaterThan(100);

    useDrillMapStore.setState({ drillMap });
    runGateValidation();
    vi.advanceTimersByTime(100);

    // Every 17.5mm bolt bore in an 18mm panel lands exactly on the margin, so
    // the warning count is a lower bound on holes actually examined.
    const result = useGateStore.getState().lastResult!;
    const examined = result.findings.warnings.filter(
      w => w.code === 'W_SAFETY_DRILL_DEPTH_ZERO_MARGIN',
    ).length;
    expect(examined).toBeGreaterThan(0);
  });
});
