/** ADR-061 shadow mode ขั้น 1 — compiler เทียบ pattern กับ drill map จริง */
import { describe, it, expect } from 'vitest';
import { runShadowCompare } from '../shadowCompare';
import type { DrillMap, DrillMapPoint } from '../../manufacturing/drillMap/types';

function pt(o: Partial<DrillMapPoint>): DrillMapPoint {
  return { id: 'x', panelId: 'P', position: [0, 0, 0], normal: [0, 0, -1], diameter: 15,
    depth: 13.5, purpose: 'MINIFIX', componentType: 'HOUSING', status: 'VALID', ...o } as DrillMapPoint;
}
function dm(points: DrillMapPoint[], bolts: DrillMapPoint[]): DrillMap {
  return { version: 't', panels: [
    { panelId: 'SIDE', role: 'SIDE', dimensions: { width: 600, height: 720, thickness: 18 }, worldPosition: [0,0,0], worldRotation: [0,0,0], points },
    { panelId: 'SHELF', role: 'SHELF', dimensions: { width: 600, height: 560, thickness: 18 }, worldPosition: [0,0,0], worldRotation: [0,0,0], points: bolts },
  ] } as unknown as DrillMap;
}

describe('runShadowCompare', () => {
  it('matches when actual positions sit on the placer grid', () => {
    // placer(STANDARD, jointLen=span+80): housings ตาม System32 grid 37..pitch32
    const bolts = [pt({ id: 'b1', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT', diameter: 10, depth: 17.5 }),
                   pt({ id: 'b2', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT', diameter: 10, depth: 17.5 })];
    const housings = [pt({ id: 'h1', position: [24, 37, 0], pairedHoleId: 'b1' }),
                      pt({ id: 'h2', position: [24, 69, 0], pairedHoleId: 'b2' })];
    const report = runShadowCompare(dm(housings, bolts));
    expect(report.jointsCompared).toBe(1);
    expect(report.results[0].featureParity).toBe(true);
    expect(report.results[0].actualGaps).toEqual([32]);
  });

  it('reports mismatch when generator pattern differs from placer', () => {
    const bolts = [pt({ id: 'b1', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT' }),
                   pt({ id: 'b2', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT' })];
    const housings = [pt({ id: 'h1', position: [24, 37, 0], pairedHoleId: 'b1' }),
                      pt({ id: 'h2', position: [24, 280, 0], pairedHoleId: 'b2' })]; // gap 243 นอก grid
    const report = runShadowCompare(dm(housings, bolts));
    expect(report.jointsCompared).toBe(1);
    expect(report.jointsMatched).toBe(0);
  });

  it('handles null drill map', () => {
    expect(runShadowCompare(null).jointsCompared).toBe(0);
  });
});
