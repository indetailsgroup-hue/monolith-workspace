/**
 * buildOperationGraph.panelScope.test.ts — S18 l5-cnc-safety fix round
 *
 * Reviewer findings (SoD review of 5b8e4d48):
 *  1. Dedupe key was position-only — a multi-panel graph with panel-local
 *     coordinates (DXF splits by panelId) drops legit operations that share
 *     coordinates across panels (system-32: mirror panels ALWAYS share local
 *     coords, e.g. shelf pins at [37,100,0] on LEFT and RIGHT side).
 *     Warning-only → silent under-drilling = red-line reversed.
 *  2. mapMinifixToOps attached NO workpieceContext, so panel-scoping the key
 *     would silently stop the intended drillmap-vs-connector dedupe.
 *  3. first-occurrence-wins dropped ops with CONFLICTING spec (diameter/
 *     depth/type) at the same coordinate as a warning — kept op may have the
 *     wrong spec. Policy: dedupe ONLY same-spec duplicates; same-position +
 *     different-spec must be a blocking ERROR (fail-closed, owner-visible).
 *
 * These tests lock the fixed behavior:
 *  - dedupe/validation keys are scoped by panelId (+ V/H direction)
 *  - minifix connector ops carry workpieceContext.panelId
 *  - same panel+position+compatible-direction with different spec → build error
 *    AND validateOperationGraph ERROR (defense in depth)
 */

import { describe, it, expect } from 'vitest';
import { buildFactoryPacket } from '../../../factory/packet/buildFactoryPacket';
import { buildOperationGraph } from '../buildOperationGraph';
import { markPacketAsValidated } from '../g9AssertValidPacket';
import { mapMinifixToOps } from '../mapMinifixToOps';
import {
  validateOperationGraph,
  ValidationCodes,
} from '../validateOperationGraph';
import { KDT_MACHINE } from '../../machine/presets/kdt';
import { exportDxfFromPacket } from '../../../core/export/dxfExportFromOperationGraph';
import type { DrillMap, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';
import type { PacketConnectors } from '../../../factory/packet/types';
import type {
  OperationGraph,
  DrillOperation,
} from '../../operation/operationTypes';
import type { Cabinet } from '../../../core/types/Cabinet';

// ============================================================================
// Fixtures
// ============================================================================

function createMirrorCabinet(): Cabinet {
  return {
    id: 'cab-mirror-001',
    name: 'Base Cabinet',
    dimensions: { width: 600, height: 720, depth: 560 },
    type: 'BASE',
    panels: [
      {
        id: 'panel-L',
        name: 'Left Side',
        role: 'LEFT_SIDE',
        visible: true,
        finishWidth: 560,
        finishHeight: 720,
        computed: { realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        edges: { left: null, right: 'EDGE_1MM', top: null, bottom: null },
      },
      {
        id: 'panel-R',
        name: 'Right Side',
        role: 'RIGHT_SIDE',
        visible: true,
        finishWidth: 560,
        finishHeight: 720,
        computed: { realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        edges: { left: 'EDGE_1MM', right: null, top: null, bottom: null },
      },
    ],
    compartments: [],
    materials: { coreId: 'MAT_MDF_18', surfaceId: null, edgingId: 'EDGE_1MM' },
  } as unknown as Cabinet;
}

function shelfPinPoint(id: string, panelId: string): DrillMapPoint {
  return {
    id,
    panelId,
    position: [37, 100, 0],
    normal: [0, 0, 1],
    diameter: 5,
    depth: 13,
    purpose: 'SHELF_PIN',
    componentType: 'PIN',
    status: 'VALID',
    face: 'A',
    throughHole: false,
  } as DrillMapPoint;
}

/**
 * The reviewer's live repro: mirror panels (LEFT + RIGHT side) each carry a
 * legit shelf pin at the SAME panel-local coordinate [37,100,0] — the
 * system-32 norm, not an edge case.
 */
function createMirrorPanelDrillMap(): DrillMap {
  return {
    version: 'drillmap.v1',
    cabinetId: 'cab-mirror-001',
    panels: [
      {
        panelId: 'panel-L',
        cabinetId: 'cab-mirror-001',
        role: 'LEFT_SIDE',
        dimensions: { width: 560, height: 720, thickness: 18 },
        worldPosition: [0, 0, 0],
        worldRotation: [0, 0, 0],
        points: [shelfPinPoint('dp-pin-L', 'panel-L')],
      },
      {
        panelId: 'panel-R',
        cabinetId: 'cab-mirror-001',
        role: 'RIGHT_SIDE',
        dimensions: { width: 560, height: 720, thickness: 18 },
        worldPosition: [582, 0, 0],
        worldRotation: [0, 0, 0],
        points: [shelfPinPoint('dp-pin-R', 'panel-R')],
      },
    ],
  };
}

/**
 * Spec conflict on ONE panel: a 5mm shelf-pin drill and a 15mm cam bore that
 * (erroneously) target the same coordinate. Neither may be silently dropped —
 * the kept op could have the wrong spec. Must be a blocking error.
 */
function createConflictingSpecDrillMap(): DrillMap {
  return {
    version: 'drillmap.v1',
    cabinetId: 'cab-conflict-001',
    panels: [
      {
        panelId: 'panel-L',
        cabinetId: 'cab-conflict-001',
        role: 'LEFT_SIDE',
        dimensions: { width: 560, height: 720, thickness: 18 },
        worldPosition: [0, 0, 0],
        worldRotation: [0, 0, 0],
        points: [
          shelfPinPoint('dp-pin-001', 'panel-L'),
          {
            id: 'dp-cam-001',
            panelId: 'panel-L',
            position: [37, 100, 0], // same coordinate as the shelf pin
            normal: [0, 0, 1],
            diameter: 15,
            depth: 12,
            purpose: 'CAM_LOCK',
            componentType: 'HOUSING',
            status: 'VALID',
            face: 'A',
            throughHole: false,
          } as DrillMapPoint,
        ],
      },
    ],
  };
}

async function buildGraphFrom(drillMap: DrillMap, cabinet: Cabinet) {
  const output = await buildFactoryPacket(
    { jobId: 'job-panelscope-001', projectId: 'proj-panelscope', toolVersion: 'test-1.0.0' },
    { cabinets: [cabinet], drillMap, gateResult: null }
  );
  const validated = markPacketAsValidated(output.packet);
  return { output, result: buildOperationGraph(validated, KDT_MACHINE) };
}

const posKey = (op: { position: { x: number; y: number; z: number } }): string =>
  `${op.position.x.toFixed(3)},${op.position.y.toFixed(3)},${op.position.z.toFixed(3)}`;

// ============================================================================
// 1 — mirror panels: same local coords on different panels are NOT duplicates
// ============================================================================

describe('buildOperationGraph — panel-scoped dedupe (reviewer live repro)', () => {
  it('keeps a legit shelf pin on EACH mirror panel at the same local coordinate', async () => {
    const { result } = await buildGraphFrom(createMirrorPanelDrillMap(), createMirrorCabinet());

    const pinOps = result.graph.operations.filter((op) => posKey(op) === '37.000,100.000,0.000');
    const panelIds = pinOps.map((op) => op.workpieceContext?.panelId).sort();

    // Both panels keep their pin — no silent under-drilling
    expect(pinOps).toHaveLength(2);
    expect(panelIds).toEqual(['panel-L', 'panel-R']);
    expect(result.stats.duplicatePositionsRemoved).toBe(0);
    expect(result.warnings.filter((w) => w.includes('DUPLICATE_POSITION'))).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('validateOperationGraph does NOT false-block the mirror-panel graph (prod caller buildGcodeBundle)', async () => {
    const { result } = await buildGraphFrom(createMirrorPanelDrillMap(), createMirrorCabinet());

    const validation = validateOperationGraph(result.graph, KDT_MACHINE);
    const dupIssues = validation.issues.filter(
      (i) => i.code === ValidationCodes.DUPLICATE_POSITION
    );
    expect(dupIssues).toHaveLength(0);
    expect(validation.valid).toBe(true);
  });

  it('both mirror pins reach the per-panel DXF split (no dropped hole in DXF)', async () => {
    const output = await buildFactoryPacket(
      { jobId: 'job-panelscope-dxf', projectId: 'proj-panelscope', toolVersion: 'test-1.0.0' },
      { cabinets: [createMirrorCabinet()], drillMap: createMirrorPanelDrillMap(), gateResult: null }
    );

    const dxf = await exportDxfFromPacket(output.packet, { machineId: 'KDT' });
    expect(dxf.ok).toBe(true);
    if (dxf.ok) {
      const left = dxf.panels.find((p) => p.panelId === 'panel-L');
      const right = dxf.panels.find((p) => p.panelId === 'panel-R');
      expect(left?.operationCount).toBeGreaterThanOrEqual(1);
      expect(right?.operationCount).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================================================
// 2 — mapMinifixToOps attaches panel identity (dedupe scoping prerequisite)
// ============================================================================

describe('mapMinifixToOps — workpieceContext.panelId attached', () => {
  const connectors: PacketConnectors = {
    version: 'connectors.v1',
    minifix: [
      {
        id: 'pair-001',
        status: 'VALID',
        cam: {
          pointId: 'cam-001',
          panelId: 'panel-A',
          position: [100, 50, 0],
          diameter: 15,
          depth: 12,
        },
        bolt: {
          pointId: 'bolt-001',
          panelId: 'panel-B',
          position: [100, 80, 0],
          diameter: 5,
          depth: 30,
        },
      },
    ],
    summary: { totalPairs: 1, validPairs: 1, warningPairs: 0, errorPairs: 0 },
  };

  it('cam op carries the cam panelId, bolt op carries the bolt panelId', () => {
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    const boltOp = result.operations.find((op) => op.id.includes('bolt'));

    expect(camOp?.workpieceContext?.panelId).toBe('panel-A');
    expect(boltOp?.workpieceContext?.panelId).toBe('panel-B');
  });
});

// ============================================================================
// 3 — same panel + position + different spec = blocking ERROR (not warn-drop)
// ============================================================================

describe('buildOperationGraph — conflicting-spec duplicate is a blocking error', () => {
  it('5mm shelf pin vs 15mm cam bore at the same panel coordinate → build error, not silent drop', async () => {
    const { result } = await buildGraphFrom(createConflictingSpecDrillMap(), createMirrorCabinet());

    const conflictErrors = result.errors.filter((e) =>
      e.includes('DUPLICATE_POSITION_CONFLICT')
    );
    expect(conflictErrors.length).toBeGreaterThanOrEqual(1);
    // Neither op is silently removed — both stay visible for the validator
    expect(result.stats.duplicatePositionsRemoved).toBe(0);
  });

  it('validateOperationGraph flags the conflicting pair as DUPLICATE_POSITION ERROR', async () => {
    const { result } = await buildGraphFrom(createConflictingSpecDrillMap(), createMirrorCabinet());

    const validation = validateOperationGraph(result.graph, KDT_MACHINE);
    const dupIssues = validation.issues.filter(
      (i) => i.code === ValidationCodes.DUPLICATE_POSITION
    );
    expect(dupIssues.length).toBeGreaterThanOrEqual(1);
    expect(validation.valid).toBe(false);
  });
});

// ============================================================================
// 4 — validateOperationGraph scoping rules (externally supplied graphs)
// ============================================================================

describe('validateOperationGraph — panel/direction-scoped DUPLICATE_POSITION', () => {
  const drillOp = (
    id: string,
    panelId?: string,
    direction?: 'V' | 'H'
  ): DrillOperation => ({
    type: 'DRILL',
    id,
    sourceId: `src-${id}`,
    toolId: 'DRILL_5',
    position: { x: 50, y: 60, z: 0 },
    depth: 10,
    direction,
    throughHole: false,
    ...(panelId
      ? {
          workpieceContext: {
            panelId,
            face: 'TOP' as const,
            appliedOffset: { x: 0, y: 0, z: 0 },
          },
        }
      : {}),
  });

  const makeGraph = (operations: OperationGraph['operations']): OperationGraph => ({
    machineId: KDT_MACHINE.id,
    safeZ: 50,
    rapidZ: 60,
    operations,
    metadata: {
      jobId: 'job-panel-scope-validate',
      sourceContentHash: 'hash',
      builtAt: '2026-01-01T00:00:00Z',
      toolVersion: 'test@1.0.0',
    },
    toolsUsed: ['DRILL_5'],
  });

  it('same coordinate on DIFFERENT panels is NOT a duplicate (external multi-panel graph)', () => {
    const graph = makeGraph([drillOp('op-a', 'panel-L'), drillOp('op-b', 'panel-R')]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    expect(
      validation.issues.some((i) => i.code === ValidationCodes.DUPLICATE_POSITION)
    ).toBe(false);
  });

  it('same coordinate on the SAME panel is still an ERROR', () => {
    const graph = makeGraph([drillOp('op-a', 'panel-L'), drillOp('op-b', 'panel-L')]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    const issue = validation.issues.find((i) => i.code === ValidationCodes.DUPLICATE_POSITION);
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('ERROR');
  });

  it('same panel + coordinate but explicit V vs H direction is NOT a duplicate', () => {
    const graph = makeGraph([
      drillOp('op-v', 'panel-L', 'V'),
      drillOp('op-h', 'panel-L', 'H'),
    ]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    expect(
      validation.issues.some((i) => i.code === ValidationCodes.DUPLICATE_POSITION)
    ).toBe(false);
  });

  it('undefined direction is treated as unknown → still collides with a defined direction', () => {
    const graph = makeGraph([
      drillOp('op-v', 'panel-L', 'V'),
      drillOp('op-unknown', 'panel-L', undefined),
    ]);
    const validation = validateOperationGraph(graph, KDT_MACHINE);

    expect(
      validation.issues.some((i) => i.code === ValidationCodes.DUPLICATE_POSITION)
    ).toBe(true);
  });
});
