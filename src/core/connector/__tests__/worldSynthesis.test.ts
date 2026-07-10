/**
 * worldSynthesis parity — ADR-061(c) ขั้น 3:
 * synthesis (placer+catalog+panelBasis) ต้องตรง generateDrillMap 100% ในพิกัดโลก
 * ก่อนถึงจะมีสิทธิ์สลับตัวสร้าง
 */

import { describe, it, expect } from 'vitest';
import type { Cabinet, CabinetPanel } from '../../types/Cabinet';
import { generateMinifixDrillMap } from '../../manufacturing/drillMap/generateDrillMap';
import { synthesizeCornerMinifixWorld, compareWorldParity } from '../worldSynthesis';

const THICKNESS = 18;
const WIDTH = 600;
const HEIGHT = 720;
const DEPTH = 560;

function panel(o: {
  id: string; role: CabinetPanel['role']; w: number; h: number;
  position: [number, number, number];
}): CabinetPanel {
  return {
    id: o.id, role: o.role, name: o.id,
    finishWidth: o.w, finishHeight: o.h,
    coreMaterialId: 'core-1',
    faces: { faceA: null, faceB: null },
    edges: { top: null, bottom: null, left: null, right: null },
    grainDirection: 'HORIZONTAL',
    computed: { realThickness: THICKNESS, cutWidth: o.w, cutHeight: o.h, surfaceArea: 0, edgeLength: 0, cost: 0, co2: 0 },
    position: o.position, rotation: [0, 0, 0], visible: true, selected: false,
  } as CabinetPanel;
}

function overlayCabinet(): Cabinet {
  const hw = WIDTH - 2 * THICKNESS + 2 * 9;
  const sideX = hw / 2 - 9 + THICKNESS / 2;
  return {
    id: 'test-cab-overlay', name: 'Overlay Test', type: 'BASE',
    dimensions: { width: WIDTH, height: HEIGHT, depth: DEPTH, toeKickHeight: 100 },
    structure: {
      topJoint: 'OVERLAY', bottomJoint: 'OVERLAY',
      hasBackPanel: false, backPanelConstruction: 'inset', backPanelInset: 6,
      shelfCount: 0, dividerCount: 0,
    },
    materials: { defaultCore: 'core-1', defaultSurface: 'surface-1', defaultEdge: 'edge-1' },
    panels: [
      panel({ id: 'panel-top', role: 'TOP', w: hw, h: DEPTH, position: [0, HEIGHT - THICKNESS / 2, DEPTH / 2] }),
      panel({ id: 'panel-bottom', role: 'BOTTOM', w: hw, h: DEPTH, position: [0, THICKNESS / 2, DEPTH / 2] }),
      panel({ id: 'panel-left', role: 'LEFT_SIDE', w: DEPTH, h: HEIGHT, position: [-sideX, HEIGHT / 2, DEPTH / 2] }),
      panel({ id: 'panel-right', role: 'RIGHT_SIDE', w: DEPTH, h: HEIGHT, position: [sideX, HEIGHT / 2, DEPTH / 2] }),
    ],
  } as unknown as Cabinet;
}

describe('synthesizeCornerMinifixWorld', () => {
  it('OVERLAY 4 corners: CAM+BOLT ครบทุก S-position, สเปคตรง catalog', () => {
    const r = synthesizeCornerMinifixWorld(overlayCabinet());
    expect(r.skippedCorners).toEqual([]);
    // CAD_STANDARD @560 → 3 ตำแหน่ง × 4 มุม × 2 ชนิด = 24
    expect(r.bores).toHaveLength(24);
    const bolt = r.bores.find((b) => b.kind === 'BOLT');
    expect(bolt?.diameter).toBe(10);
    expect(bolt?.depth).toBe(17.5);
  });

  it('มุมไม่ 90° → skip แบบ no-guess (ไม่เดา)', () => {
    const cab = overlayCabinet();
    (cab.structure as { cornerAngles?: object }).cornerAngles = { topLeft: 45 };
    const r = synthesizeCornerMinifixWorld(cab);
    expect(r.skippedCorners.filter((s) => s.reason.includes('45'))).toHaveLength(1);
  });
});

describe('compareWorldParity vs generateDrillMap (ของจริง)', () => {
  it('OVERLAY: parity 100% ทุก bore ภายใน 0.5mm', () => {
    const cab = overlayCabinet();
    const dm = generateMinifixDrillMap(cab);
    const report = compareWorldParity(cab, dm);
    expect(report.skippedCorners).toEqual([]);
    expect(report.compared).toBe(24);
    expect(report.mismatches).toEqual([]);
    expect(report.matched).toBe(report.compared);
    expect(report.maxDeltaMm).toBeLessThanOrEqual(0.5);
  });

  it('AWI density: จำนวนเพิ่มและยัง parity เต็ม', () => {
    const cab = overlayCabinet();
    const dm = generateMinifixDrillMap(cab, {}, {}, { connectorDensity: 'AWI_PREMIUM' });
    const report = compareWorldParity(cab, dm, { density: 'AWI_PREMIUM' });
    expect(report.compared).toBe(4 * 5 * 2); // 5 ตำแหน่ง AWI @560
    expect(report.mismatches).toEqual([]);
    expect(report.matched).toBe(report.compared);
  });
});


describe('INSET world parity (v2)', () => {
  function insetCabinet(): Cabinet {
    const cab = overlayCabinet();
    (cab.structure as { topJoint: string; bottomJoint: string }).topJoint = 'INSET';
    (cab.structure as { topJoint: string; bottomJoint: string }).bottomJoint = 'INSET';
    return cab;
  }

  it('INSET: parity 100% ทุก bore ภายใน 0.5mm (CAD)', () => {
    const cab = insetCabinet();
    const dm = generateMinifixDrillMap(cab);
    const report = compareWorldParity(cab, dm);
    expect(report.skippedCorners).toEqual([]);
    expect(report.compared).toBe(24);
    expect(report.mismatches).toEqual([]);
    expect(report.matched).toBe(report.compared);
  });

  it('INSET + AWI: parity เต็ม 40 bores', () => {
    const cab = insetCabinet();
    const dm = generateMinifixDrillMap(cab, {}, {}, { connectorDensity: 'AWI_PREMIUM' });
    const report = compareWorldParity(cab, dm, { density: 'AWI_PREMIUM' });
    expect(report.compared).toBe(40);
    expect(report.mismatches).toEqual([]);
    expect(report.matched).toBe(40);
  });

  it('ผสม: top INSET + bottom OVERLAY — parity เต็มทั้งคู่', () => {
    const cab = overlayCabinet();
    (cab.structure as { topJoint: string }).topJoint = 'INSET';
    const dm = generateMinifixDrillMap(cab);
    const report = compareWorldParity(cab, dm);
    expect(report.skippedCorners).toEqual([]);
    expect(report.mismatches).toEqual([]);
    expect(report.matched).toBe(report.compared);
  });
});
