/**
 * Minifix Gate Validation - Property-based Tests
 *
 * Uses fast-check to generate randomized test cases.
 * Catches edge cases that manual tests might miss.
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 *
 * v1.0: Initial implementation
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateMinifixGate,
  validatePairIntegrity,
  quickValidateMinifixAlignment,
} from '../validateMinifixConnector';
import { MINIFIX_TOLERANCES } from '../minifixConstraintTypes';
import {
  makeCam,
  makeBolt,
  onePanel,
  twoPanels,
  pairCamToBolt,
  makeValidPair,
  makeYMismatchPair,
  v,
  resetUidSequence,
} from './helpers/drillMapFactory';
import type { DrillMapPoint } from '../../../../core/manufacturing/drillMap/types';

// ============================================
// HELPER FUNCTIONS
// ============================================

function hasCode(result: { findings?: Array<{ code: string }> }, code: string): boolean {
  return result.findings?.some((f) => f.code === code) ?? false;
}

function countCode(result: { findings?: Array<{ code: string }> }, code: string): number {
  return result.findings?.filter((f) => f.code === code).length ?? 0;
}

// ============================================
// Y MISMATCH PROPERTY TESTS
// ============================================

describe('validateMinifixGate (property: Y mismatch)', () => {
  const tolerance = MINIFIX_TOLERANCES.Y_MISMATCH_MM;

  it('Y offset > tolerance → MUST FAIL with MONO_MINIFIX_Y_MISMATCH', () => {
    fc.assert(
      fc.property(
        // Generate Y offset beyond tolerance [tol+0.01 .. 10]
        fc.double({ min: tolerance + 0.01, max: 10, noNaN: true }).map((x) =>
          Number(x.toFixed(3))
        ),
        (yOffset) => {
          resetUidSequence();
          const { cam, bolt } = makeYMismatchPair(yOffset, 'prop');

          const drillMap = onePanel([cam, bolt]);
          // Use FIXED_BALL_OFFSET mode for error detection tests
          const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

          expect(result.status).toBe('FAIL');
          expect(hasCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Y offset within tolerance → MUST NOT have MONO_MINIFIX_Y_MISMATCH', () => {
    fc.assert(
      fc.property(
        // Generate Y offset within tolerance [-tol*0.9 .. +tol*0.9]
        fc.double({ min: -tolerance * 0.9, max: tolerance * 0.9, noNaN: true }).map((x) =>
          Number(x.toFixed(3))
        ),
        (yOffset) => {
          resetUidSequence();
          const { cam, bolt } = makeYMismatchPair(yOffset, 'prop');

          const drillMap = onePanel([cam, bolt]);
          const result = validateMinifixGate(drillMap);

          expect(hasCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('quickValidateMinifixAlignment: Y offset beyond tolerance → pass=false', () => {
    fc.assert(
      fc.property(
        fc.double({ min: tolerance + 0.01, max: 10, noNaN: true }),
        (dy) => {
          const camCenter = { x: 0, y: 100, z: 0 };
          const ballCenter = { x: 10, y: 100 + dy, z: 0 };
          const boltAxis = { x: -1, y: 0, z: 0 };

          const result = quickValidateMinifixAlignment(camCenter, ballCenter, boltAxis);

          expect(result.pass).toBe(false);
          expect(result.yOffset).toBeGreaterThan(tolerance);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// PAIR INTEGRITY PROPERTY TESTS
// ============================================

describe('validateMinifixGate (property: pair integrity)', () => {
  it('PAIR-001: missing pairedHoleId → MUST include MONO_MINIFIX_MISSING_PAIRED_HOLE_ID', () => {
    fc.assert(
      fc.property(
        // Generate random cam Y position
        fc.double({ min: 50, max: 200, noNaN: true }),
        (camY) => {
          resetUidSequence();
          const cam = makeCam({ y: camY, pairedHoleId: undefined });
          const bolt = makeBolt({ id: 'bolt-1' });
          const drillMap = onePanel([cam, bolt]);

          const result = validateMinifixGate(drillMap);

          expect(result.status).toBe('FAIL');
          expect(hasCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('PAIR-002: pairedHoleId → non-existent bolt → MUST include MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND', () => {
    fc.assert(
      fc.property(
        // Generate random "missing" suffix
        fc.string({ minLength: 1, maxLength: 12 }),
        (suffix) => {
          resetUidSequence();
          const cam = makeCam({ pairedHoleId: `missing-${suffix}` });
          const bolt = makeBolt({ id: 'bolt-actual' });
          const drillMap = onePanel([cam, bolt]);

          const result = validateMinifixGate(drillMap);

          expect(result.status).toBe('FAIL');
          expect(hasCode(result, 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Valid pairedHoleId → MUST NOT have pair integrity errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (seed) => {
          resetUidSequence();
          const boltId = `bolt-${seed}`;
          const cam = makeCam({ pairedHoleId: boltId });
          const bolt = makeBolt({ id: boltId });
          const drillMap = onePanel([cam, bolt]);

          const result = validateMinifixGate(drillMap);

          expect(hasCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBe(false);
          expect(hasCode(result, 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================
// COAXIAL PROPERTY TESTS
// ============================================

describe('validateMinifixGate (property: coaxial)', () => {
  const radialTolerance = MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM;

  it('radial offset > tolerance → MUST have coaxial or axis error', () => {
    fc.assert(
      fc.property(
        // Generate Z offset (radial offset when bolt axis is X)
        fc.double({ min: radialTolerance + 0.5, max: 10, noNaN: true }),
        (zOffset) => {
          resetUidSequence();
          // Cam at [0, 100, zOffset], bolt at [10, 93.75, 0]
          // Bolt axis is [-1, 0, 0], so radial direction includes Z
          const cam = makeCam({
            id: 'cam-rad',
            position: v(0, 100, zOffset),
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

          // Should have either NOT_COAXIAL or BOLT_AXIS_NOT_POINTING
          const hasCoaxialError =
            hasCode(result, 'MONO_MINIFIX_NOT_COAXIAL') ||
            hasCode(result, 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING');

          expect(result.status).toBe('FAIL');
          expect(hasCoaxialError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================
// MULTI-PAIR PROPERTY TESTS
// ============================================

describe('validateMinifixGate (property: multi-pair)', () => {
  it('N valid pairs → all pass, no Y mismatch errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (pairCount) => {
          resetUidSequence();
          const points: DrillMapPoint[] = [];

          for (let i = 0; i < pairCount; i++) {
            const { cam, bolt } = makeValidPair(String(i + 1));
            points.push(cam, bolt);
          }

          const drillMap = onePanel(points);
          const result = validateMinifixGate(drillMap);

          // Should not have Y mismatch errors
          const yMismatchCount = countCode(result, 'MONO_MINIFIX_Y_MISMATCH');
          expect(yMismatchCount).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Mix of valid/invalid pairs → failure count matches invalid count', () => {
    const tolerance = MINIFIX_TOLERANCES.Y_MISMATCH_MM;
    fc.assert(
      fc.property(
        // Generate array of Y offsets, excluding exact boundary values (±tolerance).
        // At the exact boundary (e.g. offset = ±0.20), intermediate geometry
        // computations (93.25 + offset then subtract 93.25) introduce IEEE 754
        // rounding that can push dy slightly above or below tolerance,
        // making the outcome unpredictable. Filtering ±tolerance avoids this.
        fc.array(
          fc.double({ min: -5, max: 5, noNaN: true })
            .map((x) => Number(x.toFixed(2)))
            .filter((x) => Math.abs(Math.abs(x) - tolerance) > 0.005),
          { minLength: 2, maxLength: 8 }
        ),
        (yOffsets) => {
          resetUidSequence();
          const points: DrillMapPoint[] = [];
          let expectedYMismatchCount = 0;

          yOffsets.forEach((offset, i) => {
            const { cam, bolt } = makeYMismatchPair(offset, String(i + 1));
            points.push(cam, bolt);

            // Count how many should fail Y mismatch
            // Note: We need to account for the geometry calculation
            // Ball center Y vs Cam pocket center Y
            if (Math.abs(offset) > tolerance) {
              expectedYMismatchCount++;
            }
          });

          const drillMap = onePanel(points);
          // Use FIXED_BALL_OFFSET mode for error detection tests
          const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

          const actualYMismatchCount = countCode(result, 'MONO_MINIFIX_Y_MISMATCH');
          expect(actualYMismatchCount).toBe(expectedYMismatchCount);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Pairs across multiple panels → validation works correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (pairsInA, pairsInB) => {
          resetUidSequence();
          const pointsA: DrillMapPoint[] = [];
          const pointsB: DrillMapPoint[] = [];

          // Generate pairs in panel A
          for (let i = 0; i < pairsInA; i++) {
            const { cam, bolt } = makeValidPair(`A${i + 1}`);
            pointsA.push(cam, bolt);
          }

          // Generate pairs in panel B
          for (let i = 0; i < pairsInB; i++) {
            const { cam, bolt } = makeValidPair(`B${i + 1}`);
            pointsB.push(cam, bolt);
          }

          const drillMap = twoPanels(pointsA, pointsB);
          const result = validateMinifixGate(drillMap);

          // All valid pairs should pass
          const yMismatchCount = countCode(result, 'MONO_MINIFIX_Y_MISMATCH');
          expect(yMismatchCount).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Some cams missing pairedHoleId → exactly that many PAIR-001 errors', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }),
        (hasPairedHoleIds) => {
          resetUidSequence();
          const points: DrillMapPoint[] = [];
          let expectedMissingCount = 0;

          hasPairedHoleIds.forEach((hasPairedId, i) => {
            const boltId = `bolt-${i + 1}`;
            const cam = makeCam({
              id: `cam-${i + 1}`,
              pairedHoleId: hasPairedId ? boltId : undefined,
            });
            const bolt = makeBolt({ id: boltId });
            points.push(cam, bolt);

            if (!hasPairedId) {
              expectedMissingCount++;
            }
          });

          const drillMap = onePanel(points);
          const result = validateMinifixGate(drillMap);

          const actualMissingCount = countCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID');
          expect(actualMissingCount).toBe(expectedMissingCount);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================
// DETERMINISTIC PATCH PATH PROPERTY TESTS
// ============================================

describe('validateMinifixGate (property: deterministic patch paths)', () => {
  it('Y mismatch fix patch path contains correct panel/point indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }), // panel index
        fc.integer({ min: 0, max: 5 }), // number of other points before bolt
        (panelIdx, pointsBefore) => {
          resetUidSequence();

          // Build panels with bolt at specific location
          const panels = [];
          for (let p = 0; p <= panelIdx; p++) {
            const points: DrillMapPoint[] = [];

            if (p === panelIdx) {
              // Add filler points before bolt
              for (let i = 0; i < pointsBefore; i++) {
                points.push(makeCam({ id: `filler-${p}-${i}` }));
              }

              // Add cam and bolt with Y mismatch
              const { cam, bolt } = makeYMismatchPair(1.0, `target`);
              points.push(cam, bolt);
            } else {
              // Add some dummy points to other panels
              points.push(makeCam({ id: `dummy-${p}` }));
            }

            panels.push({ panelId: `panel-${p}`, points });
          }

          const drillMap = {
            version: 'drillmap.v1' as const,
            jobId: 'test',
            createdAt: new Date().toISOString(),
            panels: panels.map((p) => ({
              panelId: p.panelId,
              cabinetId: 'cab-1',
              role: 'SHELF',
              worldPosition: [0, 0, 0] as [number, number, number],
              worldRotation: [0, 0, 0] as [number, number, number],
              dimensions: { width: 600, height: 400, thickness: 18 },
              points: p.points,
              grooves: [],
            })),
            summary: {
              totalDrills: 0,
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

          // Use FIXED_BALL_OFFSET mode for error detection tests
          const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });
          const yFail = result.findings.find((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

          if (yFail?.suggestedFix?.patch?.[0]) {
            const path = yFail.suggestedFix.patch[0].path;
            // Bolt is after cam (which is after fillers), so pointIdx = pointsBefore + 1
            const expectedBoltIdx = pointsBefore + 1;
            expect(path).toContain(`/panels/${panelIdx}/`);
            expect(path).toContain(`/points/${expectedBoltIdx}/`);
            expect(path).toContain('/position/1'); // Y axis
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
