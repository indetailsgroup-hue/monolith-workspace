/**
 * Minifix Gate Validation - Snapshot Tests
 *
 * Captures the GateResult structure for regression testing.
 * If the result shape changes, snapshots will fail and require review.
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 *
 * v1.0: Initial implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateMinifixGate } from '../validateMinifixConnector';
import {
  makeCam,
  makeBolt,
  onePanel,
  twoPanels,
  pairCamToBolt,
  makeValidPair,
  makeYMismatchPair,
  resetUidSequence,
  v,
} from './helpers/drillMapFactory';

// ============================================
// SNAPSHOT NORMALIZER
// ============================================

/**
 * Normalize GateResult for snapshot stability.
 * Removes volatile fields like timestamps.
 */
function normalizeResult(result: ReturnType<typeof validateMinifixGate>) {
  return {
    gate: result.gate,
    status: result.status,
    summary: result.summary,
    findings: result.findings.map((f) => ({
      severity: f.severity,
      code: f.code,
      entityIds: f.entityIds,
      message: f.message,
      measured: f.measured,
      tolerance: f.tolerance,
      suggestedFix: f.suggestedFix
        ? {
            strategy: f.suggestedFix.strategy,
            // Normalize patch paths to be position-agnostic for snapshot stability
            hasPatch: f.suggestedFix.patch && f.suggestedFix.patch.length > 0,
            patchOp: f.suggestedFix.patch?.[0]?.op,
            patchPathPattern: f.suggestedFix.patch?.[0]?.path
              ? extractPathPattern(f.suggestedFix.patch[0].path)
              : null,
          }
        : undefined,
    })),
  };
}

/**
 * Extract path pattern for snapshot (makes it position-independent).
 */
function extractPathPattern(path: string): string {
  // Replace indices with placeholders for stable snapshots
  return path.replace(/\/panels\/\d+\/points\/\d+/g, '/panels/[N]/points/[M]');
}

// ============================================
// TEST SETUP
// ============================================

beforeEach(() => {
  resetUidSequence();
});

// ============================================
// PAIR INTEGRITY SNAPSHOTS
// ============================================

describe('validateMinifixGate (snapshot: pair integrity)', () => {
  it('PAIR-001: missing pairedHoleId', () => {
    const cam = makeCam({ id: 'cam-1', pairedHoleId: undefined });
    const bolt = makeBolt({ id: 'bolt-1' });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('PAIR-002: pairedHoleId not found', () => {
    const cam = makeCam({ id: 'cam-1', pairedHoleId: 'nonexistent-bolt' });
    const bolt = makeBolt({ id: 'bolt-1' });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('valid pairing (no pair integrity errors)', () => {
    const cam = makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1' });
    const bolt = makeBolt({ id: 'bolt-1' });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);

    // Filter to only pair integrity findings
    const pairFindings = result.findings.filter(
      (f) =>
        f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID' ||
        f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND'
    );

    expect(pairFindings).toEqual([]);
  });
});

// ============================================
// Y MISMATCH SNAPSHOTS
// ============================================

describe('validateMinifixGate (snapshot: Y mismatch)', () => {
  it('Y mismatch with deterministic patch path', () => {
    const { cam, bolt } = makeYMismatchPair(2.0, '1');
    const drillMap = onePanel([cam, bolt]);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('Y mismatch in multi-panel setup (patch path correctness)', () => {
    // Cam in panel A, bolt in panel B (cross-panel pair)
    const cam = makeCam({ id: 'cam-cross', y: 100, pairedHoleId: 'bolt-cross' });
    const bolt = makeBolt({ id: 'bolt-cross', y: 90 }); // Intentional mismatch

    const drillMap = twoPanels([cam], [bolt]);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('perfect alignment (no Y mismatch)', () => {
    const { cam, bolt } = makeValidPair('1');
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);

    // Filter to only Y mismatch findings
    const yFindings = result.findings.filter((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

    expect(yFindings).toEqual([]);
  });
});

// ============================================
// COAXIAL SNAPSHOTS
// ============================================

describe('validateMinifixGate (snapshot: coaxial)', () => {
  it('radial offset (coaxial failure)', () => {
    const cam = makeCam({
      id: 'cam-rad',
      position: v(0, 100, 5), // Z offset causes radial misalignment
      pairedHoleId: 'bolt-rad',
    });
    const bolt = makeBolt({
      id: 'bolt-rad',
      position: v(10, 93.75, 0),
      normal: [-1, 0, 0],
    });

    const drillMap = onePanel([cam, bolt]);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    expect(normalizeResult(result)).toMatchSnapshot();
  });
});

// ============================================
// COMBINED ERROR SNAPSHOTS
// ============================================

describe('validateMinifixGate (snapshot: combined errors)', () => {
  it('multiple errors: missing pairedHoleId + Y mismatch on another pair', () => {
    const cam1 = makeCam({ id: 'cam-1', pairedHoleId: undefined }); // PAIR-001
    const bolt1 = makeBolt({ id: 'bolt-1' });

    const { cam: cam2, bolt: bolt2 } = makeYMismatchPair(3.0, '2'); // Y-001

    const drillMap = onePanel([cam1, bolt1, cam2, bolt2]);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('full validation pass (valid multi-pair Y alignment)', () => {
    const pair1 = makeValidPair('1');
    const pair2 = makeValidPair('2');

    const drillMap = onePanel([pair1.cam, pair1.bolt, pair2.cam, pair2.bolt]);

    const result = validateMinifixGate(drillMap);

    // Valid pairs should have NO Y mismatch or pair integrity errors
    // May still have axis alignment errors due to simplified geometry
    const criticalErrors = result.findings.filter(
      (f) =>
        f.code === 'MONO_MINIFIX_Y_MISMATCH' ||
        f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID' ||
        f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND'
    );
    expect(criticalErrors).toEqual([]);
    expect(normalizeResult(result)).toMatchSnapshot();
  });
});

// ============================================
// EDGE CASE SNAPSHOTS
// ============================================

describe('validateMinifixGate (snapshot: edge cases)', () => {
  it('empty drillMap', () => {
    const result = validateMinifixGate(null);
    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('no Minifix points (only shelf pins)', () => {
    const shelfPin = {
      id: 'shelf-1',
      panelId: 'test-panel-001',
      operationId: 'op-shelf-1',
      position: [0, 100, 0] as [number, number, number],
      normal: [0, 1, 0] as [number, number, number],
      diameter: 5,
      depth: 10,
      throughHole: false,
      purpose: 'SHELF_PIN' as const,
      face: 'LEFT' as const,
      status: 'VALID' as const,
      componentType: 'PIN' as const,
    };

    const drillMap = onePanel([shelfPin]);
    const result = validateMinifixGate(drillMap);

    expect(normalizeResult(result)).toMatchSnapshot();
  });

  it('orphan bolt (no cam references it)', () => {
    const cam = makeCam({ id: 'cam-1', pairedHoleId: 'bolt-1' });
    const bolt1 = makeBolt({ id: 'bolt-1' });
    const bolt2 = makeBolt({ id: 'bolt-orphan' }); // No cam points to this

    const drillMap = onePanel([cam, bolt1, bolt2]);
    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    // Orphan bolt should not cause errors (it's just unused)
    expect(normalizeResult(result)).toMatchSnapshot();
  });
});
