/**
 * Factory Packet Determinism Tests
 *
 * Verifies that the same input always produces the same output.
 * This is critical for manufacturing trust chain integrity.
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import { describe, it, expect } from 'vitest';
import {
  sha256,
  roundToPrecision,
  serializeDeterministic,
  serializeDeterministicPretty,
  computeContentHash,
} from '../manifestHash';
import { buildDrillMapData, buildDrillMapJson } from '../builders/buildDrillMap';
import { buildConnectorsData } from '../builders/buildConnectors';
import { buildCutListData, buildCutListJson } from '../builders/buildCutList';
import { buildGateResultData } from '../builders/buildGateResult';
import type { DrillMap, DrillMapPanel } from '../../../core/manufacturing/drillMap/types';
import type { Cabinet } from '../../../core/types/Cabinet';
import type { GateResult } from '../../../gate/ui/gateTypes';

// ============================================
// TEST FIXTURES
// ============================================

function createMockDrillMap(): DrillMap {
  const panel: DrillMapPanel = {
    panelId: 'panel-001',
    cabinetId: 'cab-001',
    role: 'LEFT_SIDE',
    worldPosition: [0, 0, 0],
    worldRotation: [0, 0, 0],
    dimensions: { width: 600, height: 720, thickness: 18 },
    points: [
      {
        id: 'point-002', // Intentionally out of order to test sorting
        panelId: 'panel-001',
        operationId: 'op-002',
        position: [37, 360, 9],
        normal: [1, 0, 0],
        diameter: 8,
        depth: 30,
        throughHole: false,
        purpose: 'DOWEL',
        face: 'LEFT',
        status: 'VALID',
        componentType: 'DOWEL',
      },
      {
        id: 'point-001',
        panelId: 'panel-001',
        operationId: 'op-001',
        position: [37, 100, 9],
        normal: [1, 0, 0],
        diameter: 15,
        depth: 12.5,
        throughHole: false,
        purpose: 'MINIFIX',
        face: 'LEFT',
        status: 'VALID',
        componentType: 'HOUSING',
        pairedHoleId: 'point-003',
      },
    ],
    grooves: [],
  };

  return {
    version: 'drillmap.v1',
    jobId: 'job-test-001',
    createdAt: '2024-01-15T10:00:00.000Z',
    panels: [panel],
    summary: {
      totalDrills: 2,
      totalBores: 1,
      totalGrooves: 0,
      toolChanges: 1,
      estimatedTime: 2.5,
      byPurpose: { MINIFIX: 1, DOWEL: 1 },
      byDiameter: { 15: 1, 8: 1 },
    },
    tools: [
      { toolId: 'tool-01', name: '15mm Boring', diameter: 15, type: 'BORE', usageCount: 1, totalLength: 12.5 },
      { toolId: 'tool-02', name: '8mm Dowel', diameter: 8, type: 'DRILL', usageCount: 1, totalLength: 30 },
    ],
    warnings: [],
  };
}

function createMockCabinet(): Cabinet {
  return {
    id: 'cab-001',
    name: 'Base Cabinet',
    dimensions: {
      width: 600,
      height: 720,
      depth: 560,
    },
    type: 'BASE',
    panels: [
      {
        id: 'panel-002', // Out of order to test sorting
        name: 'Right Side',
        role: 'RIGHT_SIDE',
        visible: true,
        finishWidth: 600,
        finishHeight: 720,
        computed: { realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        edges: { left: 'EDGE_1MM', right: null, top: null, bottom: null },
      },
      {
        id: 'panel-001',
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
    materials: {
      coreId: 'MAT_MDF_18',
      surfaceId: null,
      edgingId: 'EDGE_1MM',
    },
  } as unknown as Cabinet;
}

function createMockGateResult(): GateResult {
  return {
    passed: true,
    runAt: '2024-01-15T10:05:00.000Z',
    policyVersion: '1.0.0',
    findings: {
      blockers: [],
      warnings: [
        {
          key: 'warn-001',
          code: 'MINIFIX_EDGE_DISTANCE',
          message: 'Edge distance is close to minimum',
          severity: 'WARNING',
          entityIds: ['point-001'],
        },
      ],
      info: [],
    },
  };
}

// ============================================
// SHA-256 TESTS
// ============================================

describe('SHA-256 Hashing', () => {
  it('should produce consistent hash for same input', async () => {
    const input = 'Hello, World!';
    const hash1 = await sha256(input);
    const hash2 = await sha256(input);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
  });

  it('should produce different hash for different input', async () => {
    const hash1 = await sha256('input1');
    const hash2 = await sha256('input2');

    expect(hash1).not.toBe(hash2);
  });

  it('should match known SHA-256 output', async () => {
    // Known SHA-256 of empty string
    const emptyHash = await sha256('');
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

// ============================================
// NUMBER PRECISION TESTS
// ============================================

describe('Number Precision', () => {
  it('should round to 3 decimal places by default', () => {
    expect(roundToPrecision(1.23456789)).toBe(1.235);
    expect(roundToPrecision(1.2341)).toBe(1.234);
    expect(roundToPrecision(1.0)).toBe(1);
  });

  it('should handle custom precision', () => {
    expect(roundToPrecision(1.23456789, 2)).toBe(1.23);
    expect(roundToPrecision(1.23456789, 5)).toBe(1.23457);
  });

  it('should handle edge cases', () => {
    expect(roundToPrecision(0.0001)).toBe(0);
    expect(roundToPrecision(0.0005)).toBe(0.001);
    // Note: Math.round(-1234.5) = -1234 (towards positive infinity)
    expect(roundToPrecision(-1.2345)).toBe(-1.234);
    expect(roundToPrecision(-1.2346)).toBe(-1.235);
  });
});

// ============================================
// DETERMINISTIC SERIALIZATION TESTS
// ============================================

describe('Deterministic JSON Serialization', () => {
  it('should sort object keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const json = serializeDeterministic(obj);
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed);

    expect(keys).toEqual(['a', 'm', 'z']);
  });

  it('should round numbers in nested objects', () => {
    const obj = { nested: { value: 1.23456789 } };
    const json = serializeDeterministic(obj);

    expect(json).toContain('1.235');
  });

  it('should produce same output for same input (determinism)', () => {
    const obj = { b: 2, a: 1, nested: { y: 2, x: 1 } };

    const json1 = serializeDeterministic(obj);
    const json2 = serializeDeterministic(obj);

    expect(json1).toBe(json2);
  });

  it('should handle arrays without sorting elements', () => {
    const arr = [3, 1, 2];
    const json = serializeDeterministic(arr);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual([3, 1, 2]); // Array order preserved
  });
});

// ============================================
// CONTENT HASH TESTS
// ============================================

describe('Content Hash', () => {
  it('should produce consistent hash regardless of input order', async () => {
    const hashes1 = ['hash_a', 'hash_b', 'hash_c'];
    const hashes2 = ['hash_c', 'hash_a', 'hash_b'];

    const result1 = await computeContentHash(hashes1);
    const result2 = await computeContentHash(hashes2);

    expect(result1).toBe(result2);
  });
});

// ============================================
// DRILL MAP BUILDER TESTS
// ============================================

describe('DrillMap Builder Determinism', () => {
  it('should produce same output for same input', () => {
    const drillMap = createMockDrillMap();

    const json1 = buildDrillMapJson(drillMap);
    const json2 = buildDrillMapJson(drillMap);

    expect(json1).toBe(json2);
  });

  it('should sort panels by panelId', () => {
    const drillMap = createMockDrillMap();
    const data = buildDrillMapData(drillMap);

    expect(data.panels[0].panelId).toBe('panel-001');
  });

  it('should sort points by id within each panel', () => {
    const drillMap = createMockDrillMap();
    const data = buildDrillMapData(drillMap);

    // Points should be sorted by id
    expect(data.panels[0].points[0].id).toBe('point-001');
    expect(data.panels[0].points[1].id).toBe('point-002');
  });

  it('should handle null drillMap', () => {
    const data = buildDrillMapData(null);

    expect(data.version).toBe('drillmap.v1');
    expect(data.panels).toHaveLength(0);
  });
});

// ============================================
// CUT LIST BUILDER TESTS
// ============================================

describe('CutList Builder Determinism', () => {
  it('should produce same output for same input', () => {
    const cabinet = createMockCabinet();

    const json1 = buildCutListJson(cabinet);
    const json2 = buildCutListJson(cabinet);

    expect(json1).toBe(json2);
  });

  it('should sort rows by cabinetId then partId', () => {
    const cabinet = createMockCabinet();
    const data = buildCutListData(cabinet);

    // Should be sorted by partId within cabinet
    expect(data.rows[0].partId).toBe('panel-001');
    expect(data.rows[1].partId).toBe('panel-002');
  });

  it('should calculate cut dimensions correctly', () => {
    const cabinet = createMockCabinet();
    const data = buildCutListData(cabinet);

    // Left side has right edge (1mm), premill (0.5mm)
    // cutW = finishW - edgeL - edgeR + premillL + premillR
    // cutW = 600 - 0 - 1 + 0 + 0.5 = 599.5
    const leftSide = data.rows.find(r => r.partId === 'panel-001');
    expect(leftSide?.cutW).toBe(599.5);
  });

  it('should handle empty cabinets array', () => {
    const data = buildCutListData([]);

    expect(data.version).toBe('cutlist.v1');
    expect(data.rows).toHaveLength(0);
  });
});

// ============================================
// GATE RESULT BUILDER TESTS
// ============================================

describe('GateResult Builder Determinism', () => {
  it('should produce same output for same input', () => {
    const gateResult = createMockGateResult();

    const data1 = buildGateResultData(gateResult);
    const data2 = buildGateResultData(gateResult);

    expect(JSON.stringify(data1)).toBe(JSON.stringify(data2));
  });

  it('should sort findings by key', () => {
    const gateResult: GateResult = {
      passed: false,
      runAt: '2024-01-15T10:00:00.000Z',
      policyVersion: '1.0.0',
      findings: {
        blockers: [
          { key: 'z-blocker', code: 'CODE_Z', message: 'Z', severity: 'BLOCKER', entityIds: [] },
          { key: 'a-blocker', code: 'CODE_A', message: 'A', severity: 'BLOCKER', entityIds: [] },
        ],
        warnings: [],
        info: [],
      },
    };

    const data = buildGateResultData(gateResult);

    expect(data.findings.blockers[0].key).toBe('a-blocker');
    expect(data.findings.blockers[1].key).toBe('z-blocker');
  });

  it('should handle null gateResult', () => {
    const data = buildGateResultData(null);

    expect(data.version).toBe('gate.v1');
    expect(data.passed).toBe(false);
    expect(data.summary.blockerCount).toBe(0);
  });
});

// ============================================
// CONNECTORS BUILDER TESTS
// ============================================

describe('Connectors Builder Determinism', () => {
  it('should produce same output for same input', () => {
    const drillMap = createMockDrillMap();

    const data1 = buildConnectorsData(drillMap);
    const data2 = buildConnectorsData(drillMap);

    expect(JSON.stringify(data1)).toBe(JSON.stringify(data2));
  });

  it('should handle null drillMap', () => {
    const data = buildConnectorsData(null);

    expect(data.version).toBe('connectors.v1');
    expect(data.minifix).toHaveLength(0);
    expect(data.summary.totalPairs).toBe(0);
  });
});
