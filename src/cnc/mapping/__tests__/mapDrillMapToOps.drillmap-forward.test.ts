/**
 * mapDrillMapToOps.drillmap-forward.test.ts
 *
 * Tests that DrillMap visualization metadata is correctly forwarded
 * through Operation → workpieceContext.drillmap.
 *
 * @version 1.0.0 - Phase D4.2
 */

import { describe, it, expect } from 'vitest';
import { mapDrillMapToOps } from '../mapDrillMapToOps';
import type { DrillMap, DrillMapPoint, DrillMapPanel } from '../../../core/manufacturing/drillMap/types';

// ============================================================================
// Fixtures
// ============================================================================

function createPoint(overrides?: Partial<DrillMapPoint>): DrillMapPoint {
  return {
    id: 'pt-001',
    panelId: 'panel-1',
    position: [100, 200, 0],
    normal: [0, 0, -1],
    diameter: 15,
    depth: 12,
    purpose: 'CAM_LOCK',
    componentType: 'HOUSING',
    status: 'VALID',
    pairId: 'pair-001',
    targetPocketCenter: [100, 200, 0],
    face: 'A',
    cornerType: 'TOP_LEFT',
    connectedPanelRole: 'LEFT_SIDE',
    ...overrides,
  };
}

function createDrillMap(points: DrillMapPoint[]): DrillMap {
  const panel: DrillMapPanel = {
    panelId: 'panel-1',
    role: 'LEFT_SIDE',
    points,
    dimensions: { width: 600, height: 400, thickness: 18 },
    worldPosition: [0, 0, 0],
    worldRotation: [0, 0, 0],
  };

  return {
    version: '2.0',
    panels: [panel],
    stats: {
      totalPoints: points.length,
      byPurpose: {},
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Tests: Metadata forwarding
// ============================================================================

describe('mapDrillMapToOps - drillmap metadata forwarding', () => {
  it('forwards pointId from DrillMapPoint.id', () => {
    const drillMap = createDrillMap([createPoint({ id: 'my-special-point' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    expect(result.operations.length).toBeGreaterThan(0);
    const op = result.operations[0];
    expect(op.workpieceContext?.drillmap?.pointId).toBe('my-special-point');
  });

  it('forwards pairId', () => {
    const drillMap = createDrillMap([createPoint({ pairId: 'pair-xyz' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.pairId).toBe('pair-xyz');
  });

  it('forwards face6 from DrillMapPoint.face', () => {
    const drillMap = createDrillMap([createPoint({ face: 'LEFT' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.face6).toBe('LEFT');
  });

  it('sets edgeSide for edge faces (H-direction)', () => {
    for (const face of ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as const) {
      const drillMap = createDrillMap([createPoint({ face })]);
      const result = mapDrillMapToOps(drillMap, undefined, {});

      const dm = result.operations[0].workpieceContext?.drillmap;
      expect(dm?.edgeSide).toBe(face);
      expect(dm?.face6).toBe(face);
    }
  });

  it('does not set edgeSide for surface faces (V-direction)', () => {
    for (const face of ['A', 'B'] as const) {
      const drillMap = createDrillMap([createPoint({ face })]);
      const result = mapDrillMapToOps(drillMap, undefined, {});

      const dm = result.operations[0].workpieceContext?.drillmap;
      expect(dm?.edgeSide).toBeUndefined();
      expect(dm?.face6).toBe(face);
    }
  });

  it('forwards normal as Position3D', () => {
    const drillMap = createDrillMap([createPoint({ normal: [0, 1, 0] })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('forwards cornerType', () => {
    const drillMap = createDrillMap([createPoint({ cornerType: 'BOTTOM_RIGHT' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.cornerType).toBe('BOTTOM_RIGHT');
  });

  it('uses targetPocketCenter as anchor when available', () => {
    const drillMap = createDrillMap([
      createPoint({
        position: [100, 200, 0],
        targetPocketCenter: [110, 210, 5],
      }),
    ]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.anchor).toEqual({ x: 110, y: 210, z: 5 });
  });

  it('falls back to position as anchor when no targetPocketCenter', () => {
    const drillMap = createDrillMap([
      createPoint({
        position: [100, 200, 0],
        targetPocketCenter: undefined,
      }),
    ]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.anchor).toEqual({ x: 100, y: 200, z: 0 });
  });

  it('forwards connectedPanelRole', () => {
    const drillMap = createDrillMap([createPoint({ connectedPanelRole: 'TOP_PANEL' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.connectedPanelRole).toBe('TOP_PANEL');
  });

  it('derives direction V for surface faces', () => {
    const drillMap = createDrillMap([createPoint({ face: 'A' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const op = result.operations[0];
    if (op.type === 'BORE') {
      expect(op.direction).toBe('V');
    }
  });

  it('derives direction H for edge faces', () => {
    const drillMap = createDrillMap([
      createPoint({ face: 'LEFT', purpose: 'BOLT', diameter: 10 }),
    ]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const op = result.operations[0];
    if (op.type === 'BORE' || op.type === 'DRILL') {
      expect(op.direction).toBe('H');
    }
  });

  it('forwards pairKeyV2', () => {
    const drillMap = createDrillMap([createPoint({ pairKeyV2: 'pair2-TOP_LEFT-37' })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.pairKeyV2).toBe('pair2-TOP_LEFT-37');
  });

  it('forwards undefined pairKeyV2 for legacy points', () => {
    const drillMap = createDrillMap([createPoint({ pairKeyV2: undefined })]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const dm = result.operations[0].workpieceContext?.drillmap;
    expect(dm?.pairKeyV2).toBeUndefined();
  });

  it('does NOT mutate op.position (truth preserved)', () => {
    const drillMap = createDrillMap([createPoint()]);
    const result = mapDrillMapToOps(drillMap, undefined, {});

    const op = result.operations[0];
    // Position should be direct copy from DrillMapPoint.position
    expect(op.position).toEqual({ x: 100, y: 200, z: 0 });
  });
});
