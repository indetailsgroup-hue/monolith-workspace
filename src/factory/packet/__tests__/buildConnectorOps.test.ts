/** ADR-061(c) — connector-ops.json: emitToOpNodes caller จริงตัวแรก */
import { describe, it, expect } from 'vitest';
import { buildConnectorOpsData } from '../builders/buildConnectorOps';
import type { DrillMap, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

function pt(o: Partial<DrillMapPoint>): DrillMapPoint {
  return { id: 'x', panelId: 'P', position: [0, 0, 0], normal: [0, 0, -1], diameter: 15,
    depth: 13.5, purpose: 'MINIFIX', componentType: 'HOUSING', status: 'VALID', ...o } as DrillMapPoint;
}
const dm = (side: DrillMapPoint[], shelf: DrillMapPoint[]): DrillMap => ({
  version: 't', panels: [
    { panelId: 'SIDE', role: 'SIDE', dimensions: { width: 600, height: 720, thickness: 18 }, worldPosition: [0,0,0], worldRotation: [0,0,0], points: side },
    { panelId: 'SHELF', role: 'SHELF', dimensions: { width: 600, height: 560, thickness: 18 }, worldPosition: [0,0,0], worldRotation: [0,0,0], points: shelf },
  ],
}) as unknown as DrillMap;

describe('buildConnectorOpsData', () => {
  it('สังเคราะห์ OpNodes ต่อ joint: CAM+BOLT ต่อ S-position บน grid', () => {
    const bolts = [pt({ id: 'b1', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT' }),
                   pt({ id: 'b2', panelId: 'SHELF', purpose: 'BOLT', componentType: 'BOLT' })];
    const housings = [pt({ id: 'h1', position: [24, 37, 0], pairedHoleId: 'b1' }),
                      pt({ id: 'h2', position: [24, 133, 0], pairedHoleId: 'b2' })];
    const d = buildConnectorOpsData(dm(housings, bolts));
    expect(d.version).toBe('connector-ops.v1');
    expect(d.role).toBe('PARALLEL_ARTIFACT');
    expect(d.summary.totalJoints).toBe(1);
    const j = d.joints[0];
    expect(j.count).toBe(2);
    expect(j.sPositions.every((s, i, a) => i === 0 || s - a[i-1] >= 32)).toBe(true);
    // 2 positions × (CAM+BOLT) = 4 OpNodes, kind DRILL_HOLE, sleeve spec Ø10×17.5
    expect(j.opNodes).toHaveLength(4);
    const bolt = j.opNodes.find(n => String(n.params.featureId) === 'BOLT');
    expect(bolt?.params.diameter).toBe(10);
    expect(bolt?.params.depth).toBe(17.5);
    expect(j.opNodes.every(n => n.kind === 'DRILL_HOLE')).toBe(true);
    expect(j.opNodes.every(n => String(n.sourceIntentId).startsWith('connector-os:'))).toBe(true);
  });

  it('null drill map → artifact ว่างแบบ deterministic', () => {
    const d = buildConnectorOpsData(null);
    expect(d.summary.totalJoints).toBe(0);
    expect(d.joints).toEqual([]);
  });
});
