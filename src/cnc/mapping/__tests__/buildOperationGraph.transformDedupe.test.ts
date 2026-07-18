/**
 * buildOperationGraph.transformDedupe.test.ts — S18 l5-cnc-safety re-review fix
 *
 * ADR-065 red-line guard on the D4 TRANSFORM path.
 *
 * The dedupe guard keys operations by panelId + position. When workpiece
 * transforms are enabled (generateGcodeForJob passes workpieceTransforms via
 * drillMapOptions), drillmap-sourced ops are transformed into MACHINE
 * coordinates — but connector-sourced ops (mapMinifixToOps) previously never
 * received the transforms and stayed in RAW panel coordinates. The same
 * physical hole then produced two different dedupe keys: no duplicate drop,
 * no warning, no validator ERROR — the machine would drill the hole twice.
 *
 * These tests lock the fix:
 *  - connector ops are transformed with the SAME per-panel context as
 *    drillmap ops, so the dedupe guard fires on the transform path too
 *  - surviving ops are in machine coordinates (not raw)
 *  - the no-transform path is byte-identical to the previous behavior
 */

import { describe, it, expect } from 'vitest';
import { buildFactoryPacket } from '../../../factory/packet/buildFactoryPacket';
import { buildOperationGraph } from '../buildOperationGraph';
import { markPacketAsValidated } from '../g9AssertValidPacket';
import { mapMinifixToOps } from '../mapMinifixToOps';
import { KDT_MACHINE } from '../../machine/presets/kdt';
import type { DrillMap } from '../../../core/manufacturing/drillMap/types';
import type { WorkpieceTransformContext } from '../../transform/workpieceTypes';
import type { Operation } from '../../operation/operationTypes';
import type { Cabinet } from '../../../core/types/Cabinet';
import type { PacketConnectors, PacketMinifixPair } from '../../../factory/packet/types';

// ============================================================================
// Fixtures — real packet via buildFactoryPacket (same scenario as the
// no-transform dedupe suite: minifix pair present in BOTH drillmap.json and
// connectors.minifix.json)
// ============================================================================

function createMockCabinet(): Cabinet {
  return {
    id: 'cab-tdedupe-001',
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

function createDrillMapWithMinifix(): DrillMap {
  return {
    version: 'drillmap.v1',
    cabinetId: 'cab-tdedupe-001',
    panels: [
      {
        panelId: 'panel-L',
        cabinetId: 'cab-tdedupe-001',
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
        cabinetId: 'cab-tdedupe-001',
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

/** Per-panel transform contexts with distinct non-zero placements. */
function createWorkpieceTransforms(): Map<string, WorkpieceTransformContext> {
  return new Map<string, WorkpieceTransformContext>([
    [
      'panel-L',
      {
        panelId: 'panel-L',
        frame: {
          datum: 'FRONT_LEFT',
          face: 'TOP',
          dimensions: { length: 600, width: 720, thickness: 18 },
        },
        placement: { offset: { x: 500, y: 100, z: 0 }, rotationZ: 0 },
      },
    ],
    [
      'panel-B',
      {
        panelId: 'panel-B',
        frame: {
          datum: 'FRONT_LEFT',
          face: 'TOP',
          dimensions: { length: 600, width: 560, thickness: 18 },
        },
        placement: { offset: { x: 1500, y: 200, z: 0 }, rotationZ: 0 },
      },
    ],
  ]);
}

/** Panel-scoped position key — mirrors buildOperationGraph's dedupe key. */
const panelPositionKey = (op: Operation): string =>
  `${op.workpieceContext?.panelId ?? ''}|${op.position.x.toFixed(3)},${op.position.y.toFixed(3)},${op.position.z.toFixed(3)}`;

async function buildGraphWithTransforms() {
  const output = await buildFactoryPacket(
    { jobId: 'job-tdedupe-001', projectId: 'proj-tdedupe', toolVersion: 'test-1.0.0' },
    { cabinets: [createMockCabinet()], drillMap: createDrillMapWithMinifix(), gateResult: null }
  );
  const validated = markPacketAsValidated(output.packet);
  const workpieceTransforms = createWorkpieceTransforms();
  const result = buildOperationGraph(validated, KDT_MACHINE, {
    drillMapOptions: {
      workpieceTransforms,
      attachWorkpieceContext: true,
    },
  });
  return { output, result };
}

// ============================================================================
// D4 transform path — dedupe must fire in machine coordinates
// ============================================================================

describe('buildOperationGraph — DUPLICATE_POSITION dedupe on D4 transform path (ADR-065)', () => {
  it('packet carries the minifix pair in BOTH drillMap and connectors (leak precondition)', async () => {
    const { output } = await buildGraphWithTransforms();

    const allPoints = output.packet.drillMap.panels.flatMap((p) => p.points);
    expect(allPoints.some((pt) => pt.id === 'dp-cam-001')).toBe(true);
    expect(allPoints.some((pt) => pt.id === 'dp-bolt-001')).toBe(true);
    expect(output.packet.connectors.minifix).toHaveLength(1);
  });

  it('no two operations share the same panel+position after build with transforms', async () => {
    const { result } = await buildGraphWithTransforms();

    const keys = result.graph.operations.map(panelPositionKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('duplicates on the transform path are dropped with DUPLICATE_POSITION warnings (fail-visible)', async () => {
    const { result } = await buildGraphWithTransforms();

    const dupWarnings = result.warnings.filter((w) => w.includes('DUPLICATE_POSITION'));
    // cam + bolt each collide once → at least 2 dropped duplicates reported
    expect(dupWarnings.length).toBeGreaterThanOrEqual(2);
    expect(result.stats.duplicatePositionsRemoved).toBeGreaterThanOrEqual(2);
    expect(result.errors).toHaveLength(0);
  });

  it('all surviving operations are in MACHINE coordinates (raw connector coords must not survive)', async () => {
    const { result } = await buildGraphWithTransforms();

    const keys = new Set(result.graph.operations.map(panelPositionKey));
    // machine coords = raw + panel placement offset
    expect(keys.has('panel-L|600.000,200.000,0.000')).toBe(true); // shelf pin (100,100)+(500,100)
    expect(keys.has('panel-L|800.000,150.000,0.000')).toBe(true); // cam (300,50)+(500,100)
    expect(keys.has('panel-B|1800.000,280.000,0.000')).toBe(true); // bolt (300,80)+(1500,200)

    // raw (untransformed) connector coordinates must NOT appear in the graph
    expect(keys.has('panel-L|300.000,50.000,0.000')).toBe(false);
    expect(keys.has('panel-B|300.000,80.000,0.000')).toBe(false);
  });

  it('graph has exactly one op per physical hole (shelf + cam + bolt = 3)', async () => {
    const { result } = await buildGraphWithTransforms();

    expect(result.graph.operations).toHaveLength(3);
  });
});

// ============================================================================
// mapMinifixToOps — unit-level transform behavior
// ============================================================================

const createMinifixPair = (): PacketMinifixPair => ({
  id: 'pair-t-001',
  status: 'VALID',
  cam: {
    pointId: 'cam-t-001',
    panelId: 'panel-L',
    position: [300, 50, 0],
    diameter: 15,
    depth: 12,
  },
  bolt: {
    pointId: 'bolt-t-001',
    panelId: 'panel-B',
    position: [300, 80, 0],
    diameter: 5,
    depth: 30,
  },
});

const createConnectors = (pairs: PacketMinifixPair[]): PacketConnectors => ({
  version: 'connectors.v1',
  minifix: pairs,
  summary: {
    totalPairs: pairs.length,
    validPairs: pairs.length,
    warningPairs: 0,
    errorPairs: 0,
  },
});

describe('mapMinifixToOps — workpiece transforms (D4 parity with mapDrillMapToOps)', () => {
  it('transforms connector op positions into machine coordinates per panel', () => {
    const result = mapMinifixToOps(createConnectors([createMinifixPair()]), KDT_MACHINE, {
      workpieceTransforms: createWorkpieceTransforms(),
      attachWorkpieceContext: true,
    });

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    const boltOp = result.operations.find((op) => op.id.includes('bolt'));

    expect(camOp?.position).toEqual({ x: 800, y: 150, z: 0 }); // (300,50)+(500,100)
    expect(boltOp?.position).toEqual({ x: 1800, y: 280, z: 0 }); // (300,80)+(1500,200)
  });

  it('keeps panel identity and records the original workpiece position for audit', () => {
    const result = mapMinifixToOps(createConnectors([createMinifixPair()]), KDT_MACHINE, {
      workpieceTransforms: createWorkpieceTransforms(),
      attachWorkpieceContext: true,
    });

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    expect(camOp?.workpieceContext?.panelId).toBe('panel-L');
    expect(camOp?.workpieceContext?.appliedOffset).toEqual({ x: 500, y: 100, z: 0 });
    expect(camOp?.workpieceContext?.workpiecePosition).toEqual({ x: 300, y: 50, z: 0 });
  });

  it('leaves ops untouched for panels without a transform context (partial map)', () => {
    const onlyPanelL = new Map([['panel-L', createWorkpieceTransforms().get('panel-L')!]]);
    const result = mapMinifixToOps(createConnectors([createMinifixPair()]), KDT_MACHINE, {
      workpieceTransforms: onlyPanelL,
      attachWorkpieceContext: true,
    });

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    const boltOp = result.operations.find((op) => op.id.includes('bolt'));

    expect(camOp?.position).toEqual({ x: 800, y: 150, z: 0 }); // transformed
    expect(boltOp?.position).toEqual({ x: 300, y: 80, z: 0 }); // raw (no context)
    expect(boltOp?.workpieceContext?.appliedOffset).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('no-transform path is unchanged: raw positions, zero appliedOffset (regression lock)', () => {
    const result = mapMinifixToOps(createConnectors([createMinifixPair()]), KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    const boltOp = result.operations.find((op) => op.id.includes('bolt'));

    expect(camOp?.position).toEqual({ x: 300, y: 50, z: 0 });
    expect(boltOp?.position).toEqual({ x: 300, y: 80, z: 0 });
    expect(camOp?.workpieceContext).toEqual({
      panelId: 'panel-L',
      face: 'TOP',
      appliedOffset: { x: 0, y: 0, z: 0 },
    });
    expect(boltOp?.workpieceContext).toEqual({
      panelId: 'panel-B',
      face: 'TOP',
      appliedOffset: { x: 0, y: 0, z: 0 },
    });
  });
});
