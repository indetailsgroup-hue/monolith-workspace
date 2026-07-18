/**
 * buildOperationGraph.dedupe.test.ts — S18 l5-cnc-safety Slice 1
 *
 * ADR-065 red-line guard: DUPLICATE_POSITION dedupe.
 *
 * A real packet from buildFactoryPacket carries minifix points BOTH in
 * drillmap.json (as CAM_LOCK/BOLT drill points) AND in connectors.minifix.json
 * (as cam/bolt pairs). buildOperationGraph maps both sources, so without a
 * coordinate dedupe the machine would drill the same position twice.
 *
 * These tests lock the guard:
 *  - no two operations in the built graph share the same position
 *  - dropped duplicates are surfaced as DUPLICATE_POSITION warnings
 *  - validateOperationGraph exposes a DUPLICATE_POSITION validation code
 *    as defense-in-depth for externally supplied graphs
 */

import { describe, it, expect } from 'vitest';
import { buildFactoryPacket } from '../../../factory/packet/buildFactoryPacket';
import { buildOperationGraph } from '../buildOperationGraph';
import { markPacketAsValidated } from '../g9AssertValidPacket';
import {
  validateOperationGraph,
  ValidationCodes,
} from '../validateOperationGraph';
import { KDT_MACHINE } from '../../machine/presets/kdt';
import type { DrillMap } from '../../../core/manufacturing/drillMap/types';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';
import type { Cabinet } from '../../../core/types/Cabinet';

// ============================================================================
// Fixtures — real packet via buildFactoryPacket (not hand-built mocks)
// ============================================================================

function createMockCabinet(): Cabinet {
  return {
    id: 'cab-dedupe-001',
    name: 'Base Cabinet',
    dimensions: { width: 600, height: 720, depth: 560 },
    type: 'BASE',
    panels: [
      {
        id: 'panel-L',
        name: 'Left Side',
        role: 'LEFT_SIDE',
        visible: true,
        finishWidth: 600,
        finishHeight: 720,
        computed: { realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        edges: { left: null, right: 'EDGE_1MM', top: null, bottom: null },
      },
    ],
    compartments: [],
    materials: { coreId: 'MAT_MDF_18', surfaceId: null, edgingId: 'EDGE_1MM' },
  } as unknown as Cabinet;
}

/**
 * DrillMap with a minifix pair: the cam/bolt points appear as drill points
 * (CAM_LOCK HOUSING + BOLT) and are pair-linked so buildConnectorsData also
 * extracts them into connectors.minifix — the exact double-mapping scenario.
 */
function createDrillMapWithMinifix(): DrillMap {
  return {
    version: 'drillmap.v1',
    cabinetId: 'cab-dedupe-001',
    panels: [
      {
        panelId: 'panel-L',
        cabinetId: 'cab-dedupe-001',
        role: 'LEFT_SIDE',
        dimensions: { width: 600, height: 720, thickness: 18 },
        worldPosition: [0, 0, 0],
        worldRotation: [0, 0, 0],
        points: [
          {
            id: 'dp-shelf-001',
            panelId: 'panel-L',
            position: [100, 100, 0],
            normal: [0, 0, 1],
            diameter: 5,
            depth: 13,
            purpose: 'SHELF_PIN',
            componentType: 'PIN',
            status: 'VALID',
            face: 'A',
            throughHole: false,
          },
          {
            id: 'dp-cam-001',
            panelId: 'panel-L',
            position: [300, 50, 0],
            normal: [0, 0, 1],
            diameter: 15,
            depth: 12,
            purpose: 'CAM_LOCK',
            componentType: 'HOUSING',
            status: 'VALID',
            face: 'A',
            throughHole: false,
            pairedHoleId: 'dp-bolt-001',
            drillingDistanceB: 24,
          },
        ],
      },
      {
        panelId: 'panel-B',
        cabinetId: 'cab-dedupe-001',
        role: 'BOTTOM',
        dimensions: { width: 600, height: 560, thickness: 18 },
        worldPosition: [0, 0, 0],
        worldRotation: [0, 0, 0],
        points: [
          {
            id: 'dp-bolt-001',
            panelId: 'panel-B',
            position: [300, 80, 0],
            normal: [0, 1, 0],
            diameter: 10,
            depth: 17,
            purpose: 'BOLT',
            componentType: 'BOLT',
            status: 'VALID',
            face: 'TOP',
            throughHole: false,
            pairedHoleId: 'dp-cam-001',
          },
        ],
      },
    ],
  };
}

const positionKey = (op: { position: { x: number; y: number; z: number } }): string =>
  `${op.position.x.toFixed(3)},${op.position.y.toFixed(3)},${op.position.z.toFixed(3)}`;

async function buildGraphFromRealPacket() {
  const output = await buildFactoryPacket(
    { jobId: 'job-dedupe-001', projectId: 'proj-dedupe', toolVersion: 'test-1.0.0' },
    { cabinets: [createMockCabinet()], drillMap: createDrillMapWithMinifix(), gateResult: null }
  );
  const validated = markPacketAsValidated(output.packet);
  return { output, result: buildOperationGraph(validated, KDT_MACHINE) };
}

// ============================================================================
// Slice 1 — dedupe in buildOperationGraph
// ============================================================================

describe('buildOperationGraph — DUPLICATE_POSITION dedupe (ADR-065)', () => {
  it('real packet carries the minifix pair in BOTH drillMap and connectors (leak precondition)', async () => {
    const { output } = await buildGraphFromRealPacket();

    // cam point present in packet drillMap
    const allPoints = output.packet.drillMap.panels.flatMap((p) => p.points);
    expect(allPoints.some((pt) => pt.id === 'dp-cam-001')).toBe(true);
    expect(allPoints.some((pt) => pt.id === 'dp-bolt-001')).toBe(true);

    // and the same points are extracted as a connector pair
    expect(output.packet.connectors.minifix).toHaveLength(1);
    expect(output.packet.connectors.minifix[0].cam.pointId).toBe('dp-cam-001');
    expect(output.packet.connectors.minifix[0].bolt.pointId).toBe('dp-bolt-001');
  });

  it('no two operations share the same position after build', async () => {
    const { result } = await buildGraphFromRealPacket();

    const keys = result.graph.operations.map(positionKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('dropped duplicates are reported as DUPLICATE_POSITION warnings (fail-visible, not silent)', async () => {
    const { result } = await buildGraphFromRealPacket();

    const dupWarnings = result.warnings.filter((w) => w.includes('DUPLICATE_POSITION'));
    // cam + bolt each collide once → at least 2 dropped duplicates reported
    expect(dupWarnings.length).toBeGreaterThanOrEqual(2);
  });

  it('stats expose how many duplicate-position operations were removed', async () => {
    const { result } = await buildGraphFromRealPacket();

    expect(result.stats.duplicatePositionsRemoved).toBeGreaterThanOrEqual(2);
    // graph size = totalOperations - removed duplicates
    expect(result.graph.operations.length).toBe(
      result.stats.totalOperations - result.stats.duplicatePositionsRemoved
    );
  });

  it('shelf pin and minifix operations all survive dedupe at their own coordinates', async () => {
    const { result } = await buildGraphFromRealPacket();

    const keys = new Set(result.graph.operations.map(positionKey));
    expect(keys.has('100.000,100.000,0.000')).toBe(true); // shelf pin
    expect(keys.has('300.000,50.000,0.000')).toBe(true); // cam
    expect(keys.has('300.000,80.000,0.000')).toBe(true); // bolt
  });
});

// ============================================================================
// Slice 1 — DUPLICATE_POSITION validation code (defense-in-depth)
// ============================================================================

describe('validateOperationGraph — DUPLICATE_POSITION code', () => {
  const dupOp = (id: string): DrillOperation => ({
    type: 'DRILL',
    id,
    sourceId: `src-${id}`,
    toolId: 'DRILL_5',
    position: { x: 50, y: 60, z: 0 },
    depth: 10,
    throughHole: false,
  });

  const makeGraph = (operations: OperationGraph['operations']): OperationGraph => ({
    machineId: KDT_MACHINE.id,
    safeZ: 50,
    rapidZ: 60,
    operations,
    metadata: {
      jobId: 'job-validate-dup',
      sourceContentHash: 'hash',
      builtAt: '2026-01-01T00:00:00Z',
      toolVersion: 'test@1.0.0',
    },
    toolsUsed: ['DRILL_5'],
  });

  it('exposes DUPLICATE_POSITION in ValidationCodes', () => {
    expect(ValidationCodes.DUPLICATE_POSITION).toBe('DUPLICATE_POSITION');
  });

  it('flags a graph containing two operations at the same position as ERROR', () => {
    const graph = makeGraph([dupOp('op-a'), dupOp('op-b')]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    const issue = validation.issues.find((i) => i.code === ValidationCodes.DUPLICATE_POSITION);
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('ERROR');
    expect(validation.valid).toBe(false);
  });

  it('does not flag operations at distinct positions', () => {
    const graph = makeGraph([
      dupOp('op-a'),
      { ...dupOp('op-b'), position: { x: 80, y: 60, z: 0 } },
    ]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    expect(
      validation.issues.some((i) => i.code === ValidationCodes.DUPLICATE_POSITION)
    ).toBe(false);
  });
});
