/**
 * mapDrillMapToOps.boreAxis.test.ts
 *
 * The blind-hole depth check must measure a bore against the material along its
 * OWN axis, not blindly against panel thickness. This is the machine-facing
 * twin of the gate G11 bore-axis fix: a face bore eats the ~18mm thickness, an
 * edge bore runs down the panel's hundreds-of-mm length/width, and where the
 * axis cannot be established we fall back to the strictest reading (thickness).
 */

import { describe, it, expect } from 'vitest';
import { mapDrillMapToOps } from '../mapDrillMapToOps';
import type { DrillMap, DrillMapPoint, DrillMapPanel } from '../../../core/manufacturing/drillMap/types';

// A LEFT_SIDE panel stands upright: thickness along X, cabinet depth (560) along
// Z, height along Y. panelSpanFromRole('LEFT_SIDE', width, height, thickness)
// therefore yields span = [thickness, height, width] = [18, 720, 560].
function sidePanel(points: DrillMapPoint[], overrides?: Partial<DrillMapPanel>): DrillMapPanel {
  return {
    panelId: 'left-1',
    role: 'LEFT_SIDE',
    points,
    dimensions: { width: 560, height: 720, thickness: 18 },
    worldPosition: [0, 0, 0],
    worldRotation: [0, 0, 0],
    ...overrides,
  };
}

function point(overrides: Partial<DrillMapPoint>): DrillMapPoint {
  return {
    id: 'pt',
    panelId: 'left-1',
    position: [0, 0, 0],
    normal: [1, 0, 0],
    diameter: 8,
    depth: 12,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    status: 'VALID',
    throughHole: false,
    ...overrides,
  };
}

function drillMap(panel: DrillMapPanel): DrillMap {
  return {
    version: '2.0',
    panels: [panel],
    stats: { totalPoints: panel.points.length, byPurpose: {} },
    generatedAt: new Date().toISOString(),
  };
}

const warningFor = (result: ReturnType<typeof mapDrillMapToOps>, id: string): string | undefined =>
  result.warnings?.find((w) => w.includes(`Point ${id}:`) && w.includes('exceeds available material'));

describe('mapDrillMapToOps - blind-hole depth vs bore axis', () => {
  it('does NOT flag a side-panel back-edge dowel deep along the 560mm depth', () => {
    // Normal along Z = boring into the back edge, down the panel's depth.
    // 30mm is far inside the 560mm the bore actually travels — correct joinery.
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'edge-dowel', normal: [0, 0, -1], depth: 30 })])),
    );
    expect(warningFor(result, 'edge-dowel')).toBeUndefined();
  });

  it('DOES flag a genuine face-bore drill-through', () => {
    // Normal along X = boring into the face, across the 18mm thickness.
    // 20mm exits the far face — a real breakthrough.
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'face-through', normal: [1, 0, 0], depth: 20, purpose: 'BOLT', componentType: 'BOLT', diameter: 10 })])),
    );
    const w = warningFor(result, 'face-through');
    expect(w).toBeDefined();
    expect(w).toContain('20mm');
    expect(w).toContain('18mm'); // measured against thickness, which IS the bore axis here
  });

  it('does NOT flag a face bore that stays within thickness', () => {
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'face-blind', normal: [1, 0, 0], depth: 12 })])),
    );
    expect(warningFor(result, 'face-blind')).toBeUndefined();
  });

  it('takes the STRICT path (thickness) when the panel role is unknown', () => {
    // Same deep-along-Z geometry that passes on a known side panel, but the role
    // gives no orientation, so the axis is unknowable. A permissive guess would
    // clear a 30mm bore; the strict fallback measures it against 18mm and flags.
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'mystery', normal: [0, 0, -1], depth: 30 })], { role: 'MYSTERY_ROLE' })),
    );
    const w = warningFor(result, 'mystery');
    expect(w).toBeDefined();
    expect(w).toContain('18mm');
  });

  it('takes the STRICT path when the panel is rotated off-axis', () => {
    // A 90° yaw permutes which world axis carries the thickness, so the
    // axis-aligned span convention cannot describe it → measure against thickness.
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'rotated', normal: [0, 0, -1], depth: 30 })], { worldRotation: [0, Math.PI / 2, 0] })),
    );
    expect(warningFor(result, 'rotated')).toBeDefined();
  });

  it('takes the STRICT path when the normal is degenerate', () => {
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'no-normal', normal: [0, 0, 0], depth: 30 })])),
    );
    expect(warningFor(result, 'no-normal')).toBeDefined();
  });

  it('never flags a through-hole regardless of depth', () => {
    const result = mapDrillMapToOps(
      drillMap(sidePanel([point({ id: 'through', normal: [1, 0, 0], depth: 999, throughHole: true })])),
    );
    expect(warningFor(result, 'through')).toBeUndefined();
  });
});
