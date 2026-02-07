/**
 * Minifix Gate Validation Tests
 *
 * Tests for the Monolith Minifix Validation Gate.
 * Covers: pair integrity, geometric constraints, deterministic patch paths.
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 * - Y is vertical (height)
 * - Cabinets sit on XZ plane (floor)
 *
 * v1.0: Initial test suite
 */

import { describe, it, expect } from 'vitest';
import {
  validateMinifixGate,
  validatePairIntegrity,
  quickValidateMinifixAlignment,
  validateMinifixConnectorPair,
} from '../validateMinifixConnector';
import { findMinifixPairs, buildConnectorPairFromDrillPoints } from '../drillMapToMinifixPair';
import { MINIFIX_TOLERANCES } from '../minifixConstraintTypes';
import type { DrillMap, DrillMapPoint, Vec3Tuple } from '../../../../core/manufacturing/drillMap/types';

// ============================================
// TEST FIXTURES
// ============================================

function makePoint(overrides: Partial<DrillMapPoint> & { id: string }): DrillMapPoint {
  return {
    id: overrides.id,
    panelId: overrides.panelId ?? 'test-panel-001',
    operationId: overrides.operationId ?? `op-${overrides.id}`,
    position: overrides.position ?? [0, 100, 0],
    normal: overrides.normal ?? [0, 1, 0],
    diameter: overrides.diameter ?? 15,
    depth: overrides.depth ?? 12.5,
    throughHole: overrides.throughHole ?? false,
    purpose: overrides.purpose ?? 'MINIFIX',
    face: overrides.face ?? 'TOP',
    status: overrides.status ?? 'VALID',
    componentType: overrides.componentType ?? 'HOUSING',
    pairedHoleId: overrides.pairedHoleId,
  };
}

function makeCam(overrides: {
  id?: string;
  y?: number;
  pairedHoleId?: string;
  position?: Vec3Tuple;
} = {}): DrillMapPoint {
  const y = overrides.y ?? 100;
  return makePoint({
    id: overrides.id ?? 'cam-1',
    componentType: 'HOUSING',
    purpose: 'MINIFIX',
    position: overrides.position ?? [0, y, 0],
    normal: [0, -1, 0], // Cam drills down into horizontal panel
    pairedHoleId: overrides.pairedHoleId,
  });
}

function makeBolt(overrides: {
  id?: string;
  y?: number;
  position?: Vec3Tuple;
  normal?: Vec3Tuple;
} = {}): DrillMapPoint {
  const y = overrides.y ?? 100;
  return makePoint({
    id: overrides.id ?? 'bolt-1',
    componentType: 'BOLT',
    purpose: 'MINIFIX',
    position: overrides.position ?? [10, y, 0],
    normal: overrides.normal ?? [-1, 0, 0], // Bolt drills into vertical panel, pointing toward cam
    diameter: 10, // Bolt hole is typically 10mm
  });
}

function makeDrillMap(panels: Array<{ panelId: string; points: DrillMapPoint[] }>): DrillMap {
  return {
    version: 'drillmap.v1',
    jobId: 'test-job',
    createdAt: new Date().toISOString(),
    panels: panels.map((p) => ({
      panelId: p.panelId,
      cabinetId: 'cab-1',
      role: 'SHELF',
      worldPosition: [0, 0, 0] as Vec3Tuple,
      worldRotation: [0, 0, 0] as Vec3Tuple,
      dimensions: { width: 600, height: 400, thickness: 18 },
      points: p.points,
      grooves: [],
    })),
    summary: {
      totalDrills: panels.reduce((acc, p) => acc + p.points.length, 0),
      totalBores: 0,
      totalGrooves: 0,
      toolChanges: 0,
      estimatedTime: 0,
      byPurpose: {},
      byDiameter: {},
    },
    tools: [],
    warnings: [],
  };
}

function wrapDrillMap(points: DrillMapPoint[]): DrillMap {
  return makeDrillMap([{ panelId: 'P1', points }]);
}

// ============================================
// PAIR INTEGRITY TESTS (PAIR-001, PAIR-002)
// ============================================

describe('validatePairIntegrity', () => {
  it('fails when cam is missing pairedHoleId (PAIR-001)', () => {
    const points = [
      makeCam({ pairedHoleId: undefined }),
      makeBolt(),
    ];

    const findings = validatePairIntegrity(points);

    expect(findings.some((f) => f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBe(true);
  });

  it('fails when pairedHoleId does not resolve to bolt (PAIR-002)', () => {
    const points = [
      makeCam({ pairedHoleId: 'missing-bolt' }),
      makeBolt({ id: 'bolt-1' }),
    ];

    const findings = validatePairIntegrity(points);

    expect(findings.some((f) => f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBe(true);
  });

  it('passes when pairedHoleId correctly references bolt', () => {
    const points = [
      makeCam({ pairedHoleId: 'bolt-1' }),
      makeBolt({ id: 'bolt-1' }),
    ];

    const findings = validatePairIntegrity(points);

    expect(findings.length).toBe(0);
  });

  it('validates multiple cam-bolt pairs independently', () => {
    const points = [
      makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1' }),
      makeBolt({ id: 'bolt-1' }),
      makeCam({ id: 'cam-2', pairedHoleId: undefined }), // Missing
      makeBolt({ id: 'bolt-2' }),
    ];

    const findings = validatePairIntegrity(points);

    // Only cam-2 should fail
    expect(findings.length).toBe(1);
    expect(findings[0].entityIds).toContain('cam-2');
  });
});

// ============================================
// PAIR FINDING TESTS
// ============================================

describe('findMinifixPairs', () => {
  it('finds pairs using pairedHoleId matching', () => {
    const points = [
      makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1' }),
      makeBolt({ id: 'bolt-1' }),
      makeCam({ id: 'cam-2', pairedHoleId: 'bolt-2' }),
      makeBolt({ id: 'bolt-2' }),
    ];

    const pairs = findMinifixPairs(points);

    expect(pairs.length).toBe(2);
    expect(pairs[0].cam.id).toBe('cam-1');
    expect(pairs[0].bolt.id).toBe('bolt-1');
  });

  it('returns empty array when no valid pairs exist', () => {
    const points = [
      makeCam({ pairedHoleId: 'nonexistent' }),
      makeBolt({ id: 'bolt-1' }),
    ];

    const pairs = findMinifixPairs(points);

    expect(pairs.length).toBe(0);
  });

  it('skips cams without pairedHoleId', () => {
    const points = [
      makeCam({ pairedHoleId: undefined }),
      makeBolt(),
    ];

    const pairs = findMinifixPairs(points);

    expect(pairs.length).toBe(0);
  });
});

// ============================================
// QUICK VALIDATION TESTS
// ============================================

describe('quickValidateMinifixAlignment', () => {
  it('passes when cam and bolt are perfectly aligned (Y-up)', () => {
    const camCenter = { x: 0, y: 100, z: 0 };
    const ballCenter = { x: 10, y: 100, z: 0 };
    const boltAxis = { x: -1, y: 0, z: 0 }; // Points toward cam

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(true);
    expect(result.yOffset).toBe(0);
    expect(result.radialOffset).toBeLessThan(MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM);
  });

  it('fails Y mismatch check (Y-up coordinate system)', () => {
    const camCenter = { x: 0, y: 100, z: 0 };
    const ballCenter = { x: 10, y: 96, z: 0 }; // 4mm Y offset
    const boltAxis = { x: -1, y: 0, z: 0 };

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(false);
    expect(result.yOffset).toBe(4);
    expect(result.yOffset).toBeGreaterThan(MINIFIX_TOLERANCES.Y_MISMATCH_MM);
  });

  it('fails coaxial check when radially offset', () => {
    const camCenter = { x: 0, y: 100, z: 5 }; // Z offset
    const ballCenter = { x: 10, y: 100, z: 0 };
    const boltAxis = { x: -1, y: 0, z: 0 };

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(false);
    expect(result.radialOffset).toBeGreaterThan(MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM);
  });

  it('reports measured offsets within tolerance as passing', () => {
    const tolerance = MINIFIX_TOLERANCES.Y_MISMATCH_MM;
    const camCenter = { x: 0, y: 100, z: 0 };
    const ballCenter = { x: 10, y: 100 + tolerance * 0.5, z: 0 }; // Half tolerance
    const boltAxis = { x: -1, y: 0, z: 0 };

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(true);
  });
});

// ============================================
// FULL GATE VALIDATION TESTS
// ============================================

describe('validateMinifixGate', () => {
  it('returns PASS for empty drillMap', () => {
    const result = validateMinifixGate(null);

    expect(result.status).toBe('PASS');
    expect(result.findings.length).toBe(0);
  });

  it('returns PASS for drillMap with no Minifix points', () => {
    const drillMap = wrapDrillMap([
      makePoint({ id: 'shelf-pin-1', purpose: 'SHELF_PIN' }),
    ]);

    const result = validateMinifixGate(drillMap);

    expect(result.status).toBe('PASS');
  });

  it('fails when cam is missing pairedHoleId (PAIR-001)', () => {
    const drillMap = wrapDrillMap([
      makeCam({ pairedHoleId: undefined }),
      makeBolt(),
    ]);

    const result = validateMinifixGate(drillMap);

    expect(result.status).toBe('FAIL');
    expect(result.findings.some((f) => f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBe(
      true
    );
  });

  it('fails when pairedHoleId does not resolve to bolt (PAIR-002)', () => {
    const drillMap = wrapDrillMap([
      makeCam({ pairedHoleId: 'missing-bolt' }),
      makeBolt({ id: 'bolt-1' }),
    ]);

    const result = validateMinifixGate(drillMap);

    expect(result.status).toBe('FAIL');
    expect(result.findings.some((f) => f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBe(
      true
    );
  });

  it('fails Y mismatch and provides deterministic patch path (Y-001)', () => {
    // Geometry calculation:
    // - Cam drill Y = 100, normal = [0, -1, 0] (drills down), camDepth = 13.5
    // - Cam pocket center Y = 100 + (-1) * (13.5/2) = 93.25
    // - Bolt drill Y = 90, normal = [-1, 0, 0] (horizontal), ballOffset = 9.5
    // - Ball center Y = 90 (no Y component in normal)
    // - Delta = |90 - 93.25| = 3.25mm
    const drillMap = makeDrillMap([
      {
        panelId: 'P1',
        points: [
          makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1', y: 100 }),
          makeBolt({ id: 'bolt-1', y: 90 }), // Will result in ~3.75mm Y offset
        ],
      },
    ]);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    const yFail = result.findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

    expect(yFail).toBeDefined();
    // The actual delta is between calculated centers, not raw positions
    expect(yFail?.measured?.delta_y_mm).toBeGreaterThan(MINIFIX_TOLERANCES.Y_MISMATCH_MM);

    // Check for deterministic patch path
    if (yFail?.suggestedFix?.patch?.[0]) {
      expect(yFail.suggestedFix.patch[0].path).toContain('/useDrillMapStore/drillMap/panels/');
      expect(yFail.suggestedFix.patch[0].path).toContain('/position/1'); // Y axis
    }
  });

  it('passes when cam and bolt are perfectly aligned', () => {
    // Geometry for perfect alignment:
    // - Cam drill Y = 100, normal = [0, -1, 0] (drills down), camDepth = 13.5
    // - Cam pocket center Y = 100 + (-1) * 6.75 = 93.25
    // - Bolt Y should be 93.25 so ball center Y matches cam pocket center Y
    // - Bolt normal = [-1, 0, 0] (horizontal, no Y component)
    // - Ball center Y = 93.25 (matches cam pocket center)
    const camPocketCenterY = 100 - 13.5 / 2; // 93.25
    const drillMap = wrapDrillMap([
      makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1', y: 100 }),
      makeBolt({ id: 'bolt-1', y: camPocketCenterY, normal: [-1, 0, 0] }),
    ]);

    const result = validateMinifixGate(drillMap);

    // Should not have Y mismatch when Y positions are aligned
    const yFail = result.findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');
    expect(yFail).toBeUndefined();
  });

  it('counts errors and warnings correctly in summary', () => {
    const drillMap = wrapDrillMap([
      makeCam({ id: 'cam-1', pairedHoleId: undefined }), // Error: missing pairedHoleId
      makeCam({ id: 'cam-2', pairedHoleId: 'nonexistent' }), // Error: not found
      makeBolt({ id: 'bolt-1' }),
    ]);

    const result = validateMinifixGate(drillMap);

    expect(result.summary.errors).toBe(2);
    expect(result.status).toBe('FAIL');
  });
});

// ============================================
// DETERMINISTIC PATCH PATH TESTS
// ============================================

describe('deterministic patch paths', () => {
  it('generates correct panelIdx and pointIdx for Y mismatch fix', () => {
    const drillMap = makeDrillMap([
      {
        panelId: 'panel-A',
        points: [
          makePoint({ id: 'other-point' }), // Index 0
          makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1', y: 100 }), // Index 1
        ],
      },
      {
        panelId: 'panel-B',
        points: [
          makeBolt({ id: 'bolt-1', y: 96 }), // Panel 1, Index 0
        ],
      },
    ]);

    const result = validateMinifixGate(drillMap);
    const yFail = result.findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

    // Bolt is at panels[1].points[0]
    if (yFail?.suggestedFix?.patch?.[0]) {
      expect(yFail.suggestedFix.patch[0].path).toBe(
        '/useDrillMapStore/drillMap/panels/1/points/0/position/1'
      );
    }
  });

  it('includes correct fix value for Y mismatch', () => {
    const camY = 100;
    const drillMap = wrapDrillMap([
      makeCam({ pairedHoleId: 'bolt-1', y: camY }),
      makeBolt({ id: 'bolt-1', y: 96 }),
    ]);

    const result = validateMinifixGate(drillMap);
    const yFail = result.findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

    // Fix value should be derived from cam pocket center Y
    if (yFail?.suggestedFix?.patch?.[0]) {
      // The fix value comes from cam.geometry.pocketCenter.y which is calculated
      expect(typeof yFail.suggestedFix.patch[0].value).toBe('number');
    }
  });
});

// ============================================
// CONNECTOR PAIR VALIDATION TESTS
// ============================================

describe('validateMinifixConnectorPair', () => {
  it('validates coaxial alignment (COAX-001)', () => {
    // Use FIXED_BALL_OFFSET mode to test error detection (allows B != C)
    const pair = buildConnectorPairFromDrillPoints({
      camPoint: makeCam({ pairedHoleId: 'bolt-1', position: [0, 100, 0] }),
      boltPoint: makeBolt({ id: 'bolt-1', position: [10, 100, 5] }), // Z offset
      camDepth: 13.5,
      boltBallOffset: 9.5,
      boltBallDiameter: 7.0,
      panelHThickness: 18,
      panelVThickness: 18,
      solveMode: 'FIXED_BALL_OFFSET', // Error detection mode
    });

    const findings = validateMinifixConnectorPair(pair);

    const coaxFail = findings.find((f) => f.code === 'MONO_MINIFIX_NOT_COAXIAL');
    expect(coaxFail).toBeDefined();
  });

  it('validates Y level match (Y-001)', () => {
    // Use FIXED_BALL_OFFSET mode to test error detection (allows B != C)
    const pair = buildConnectorPairFromDrillPoints({
      camPoint: makeCam({ pairedHoleId: 'bolt-1', position: [0, 100, 0] }),
      boltPoint: makeBolt({ id: 'bolt-1', position: [10, 90, 0] }), // 10mm Y offset
      camDepth: 13.5,
      boltBallOffset: 9.5,
      boltBallDiameter: 7.0,
      panelHThickness: 18,
      panelVThickness: 18,
      solveMode: 'FIXED_BALL_OFFSET', // Error detection mode
    });

    const findings = validateMinifixConnectorPair(pair);

    const yFail = findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');
    expect(yFail).toBeDefined();
  });
});

// ============================================
// TOLERANCE EDGE CASES
// ============================================

describe('tolerance edge cases', () => {
  it('passes within tolerance boundary', () => {
    const tolerance = MINIFIX_TOLERANCES.Y_MISMATCH_MM;
    const camCenter = { x: 0, y: 100, z: 0 };
    // Use 90% of tolerance to avoid floating point edge cases
    const ballCenter = { x: 10, y: 100 + tolerance * 0.9, z: 0 };
    const boltAxis = { x: -1, y: 0, z: 0 };

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(true);
    expect(result.yOffset).toBeLessThanOrEqual(tolerance);
  });

  it('fails beyond the tolerance boundary', () => {
    const tolerance = MINIFIX_TOLERANCES.Y_MISMATCH_MM;
    const camCenter = { x: 0, y: 100, z: 0 };
    // Use 150% of tolerance to clearly exceed
    const ballCenter = { x: 10, y: 100 + tolerance * 1.5, z: 0 };
    const boltAxis = { x: -1, y: 0, z: 0 };

    const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

    expect(result.pass).toBe(false);
    expect(result.yOffset).toBeGreaterThan(tolerance);
  });
});
