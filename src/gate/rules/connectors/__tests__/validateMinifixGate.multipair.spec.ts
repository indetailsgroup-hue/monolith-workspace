/**
 * Minifix Gate Validation - Multi-pair / Multi-panel Property Tests
 *
 * Comprehensive property-based tests covering:
 * - Multiple panels with nested structure
 * - Mix of MINIFIX and CAM_LOCK purposes
 * - Various failure scenarios (VALID, MISSING_PAIR, PAIR_NOT_FOUND, Y_MISMATCH, COAX_FAIL)
 * - No false positives verification
 * - Deterministic patch path verification
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 *
 * v1.0: Initial implementation
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateMinifixGate } from '../validateMinifixConnector';
import { MINIFIX_TOLERANCES } from '../minifixConstraintTypes';
import {
  makeCam,
  makeBolt,
  makeDrillMap,
  pairCamToBolt,
  v,
  AXIS,
  resetUidSequence,
} from './helpers/drillMapFactory';
import type { DrillMapPoint, DrillMap, Vec3Tuple } from '../../../../core/manufacturing/drillMap/types';

// ============================================
// TYPES
// ============================================

type ScenarioKind = 'VALID' | 'MISSING_PAIR' | 'PAIR_NOT_FOUND' | 'Y_MISMATCH' | 'COAX_FAIL';

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
// SCENARIO BUILDER
// ============================================

interface ScenarioResult {
  drillMap: DrillMap;
  allPoints: DrillMapPoint[];
  scenarios: ScenarioKind[];
  cams: DrillMapPoint[];
  bolts: DrillMapPoint[];
}

/**
 * Build a deterministic multi-panel drillMap from scenario list.
 * Each scenario produces one cam + (optional) bolt and wires pairedHoleId accordingly.
 *
 * Distributes points across 3 panels for realistic nested structure testing.
 */
function buildScenarioDrillMap(scenarios: ScenarioKind[]): ScenarioResult {
  resetUidSequence();

  // Create 3 panels for distribution
  const panels: Array<{ panelId: string; points: DrillMapPoint[] }> = [
    { panelId: 'panel-0', points: [] },
    { panelId: 'panel-1', points: [] },
    { panelId: 'panel-2', points: [] },
  ];

  const cams: DrillMapPoint[] = [];
  const bolts: DrillMapPoint[] = [];

  // Helper to distribute points across panels
  const putPoint = (idx: number, point: DrillMapPoint) => {
    panels[idx % panels.length].points.push(point);
  };

  scenarios.forEach((kind, i) => {
    // Alternate purpose to ensure filter supports both MINIFIX and CAM_LOCK
    const purpose: 'MINIFIX' | 'CAM_LOCK' = i % 2 === 0 ? 'MINIFIX' : 'CAM_LOCK';

    // Base Y position for cam (used to calculate pocket center)
    const baseY = 100;
    // Cam pocket center Y = baseY - camDepth/2 = 100 - 6.75 = 93.25 (18mm wood)
    const camPocketCenterY = baseY - 13.5 / 2;

    // Create cam with spread in Z for uniqueness
    const cam = makeCam({
      id: `cam-${i}`,
      position: v(0, baseY, i * 10),
    });
    // Override purpose for CAM_LOCK testing
    (cam as any).purpose = purpose;

    let bolt: DrillMapPoint | null = null;

    // Create bolt based on scenario (except MISSING_PAIR which has no bolt reference)
    if (kind !== 'MISSING_PAIR') {
      bolt = makeBolt({
        id: `bolt-${i}`,
        position: v(10, camPocketCenterY, i * 10), // Aligned Y by default
        normal: [-1, 0, 0], // Points toward cam
      });
      // Override purpose
      (bolt as any).purpose = purpose;
    }

    // Apply scenario-specific modifications
    switch (kind) {
      case 'VALID':
        // Perfect alignment - cam and bolt are properly paired and aligned
        pairCamToBolt(cam, bolt!);
        break;

      case 'MISSING_PAIR':
        // Cam has no pairedHoleId
        cam.pairedHoleId = undefined;
        break;

      case 'PAIR_NOT_FOUND':
        // Cam references non-existent bolt
        cam.pairedHoleId = `missing-bolt-${i}`;
        break;

      case 'Y_MISMATCH':
        // Proper pairing but Y offset exceeds tolerance
        pairCamToBolt(cam, bolt!);
        // Introduce 3mm Y offset (>> 0.2mm tolerance)
        bolt!.position = [bolt!.position[0], camPocketCenterY - 3, bolt!.position[2]];
        break;

      case 'COAX_FAIL':
        // Proper pairing and Y aligned, but radial offset (coaxial failure)
        pairCamToBolt(cam, bolt!);
        // Keep Y aligned to avoid Y mismatch
        // Break coaxial by offsetting cam in Z (radial direction when bolt axis is X)
        cam.position = [cam.position[0], cam.position[1], i * 10 + 2]; // 2mm Z offset
        // Bolt stays at original Z, creating radial misalignment
        bolt!.position = [10, camPocketCenterY, i * 10];
        break;
    }

    cams.push(cam);
    if (bolt) bolts.push(bolt);

    // Distribute across panels in mixed way
    putPoint(i, cam);
    if (bolt) putPoint(i + 1, bolt);
  });

  const drillMap = makeDrillMap(panels);
  const allPoints = drillMap.panels.flatMap((p) => p.points);

  return { drillMap, allPoints, scenarios, cams, bolts };
}

// ============================================
// MULTI-PAIR PROPERTY TESTS
// ============================================

describe('validateMinifixGate (multi-pair, multi-panel property-based)', () => {
  it('produces expected error codes per scenario with no false positives for VALID pairs', () => {
    const arbScenarioList = fc.array(
      fc.constantFrom<ScenarioKind>('VALID', 'MISSING_PAIR', 'PAIR_NOT_FOUND', 'Y_MISMATCH', 'COAX_FAIL'),
      { minLength: 5, maxLength: 20 }
    );

    fc.assert(
      fc.property(arbScenarioList, (scenarioList) => {
        const { drillMap, scenarios } = buildScenarioDrillMap(scenarioList);
        // Use FIXED_BALL_OFFSET mode for error detection tests
        const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

        // Expected counts (lower bounds) per scenario
        const expectedMissing = scenarios.filter((s) => s === 'MISSING_PAIR').length;
        const expectedNotFound = scenarios.filter((s) => s === 'PAIR_NOT_FOUND').length;
        const expectedY = scenarios.filter((s) => s === 'Y_MISMATCH').length;
        const expectedCoax = scenarios.filter((s) => s === 'COAX_FAIL').length;

        // --- Pair integrity assertions ---

        // Each missing pairedHoleId must yield PAIR-001 at least once
        expect(countCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBeGreaterThanOrEqual(
          expectedMissing
        );

        // Each unresolved pairedHoleId must yield PAIR-002 at least once
        expect(countCode(result, 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBeGreaterThanOrEqual(
          expectedNotFound
        );

        // --- Geometry constraint assertions ---

        // For Y mismatch scenarios, must report Y mismatch
        expect(countCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBeGreaterThanOrEqual(expectedY);

        // For coax fail scenarios, must report NOT_COAXIAL or AXIS_NOT_POINTING
        const coaxCount =
          countCode(result, 'MONO_MINIFIX_NOT_COAXIAL') +
          countCode(result, 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING');
        expect(coaxCount).toBeGreaterThanOrEqual(expectedCoax);

        // --- No false positives for all-VALID case ---
        if (scenarios.every((s) => s === 'VALID')) {
          // All critical errors should be absent
          const criticalErrors = result.findings.filter(
            (f) =>
              f.code === 'MONO_MINIFIX_Y_MISMATCH' ||
              f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID' ||
              f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND' ||
              f.code === 'MONO_MINIFIX_NOT_COAXIAL'
          );
          expect(criticalErrors.length).toBe(0);
        }

        // --- Gate status assertion ---
        // If any scenario is invalid, result should FAIL
        if (scenarios.some((s) => s !== 'VALID')) {
          expect(result.status).toBe('FAIL');
        }
      }),
      { numRuns: 80 }
    );
  });

  it('Y_MISMATCH findings must include deterministic patch path (/position/1)', () => {
    // Deterministic handcrafted multi-panel case with one Y mismatch
    const scenarioList: ScenarioKind[] = ['VALID', 'Y_MISMATCH', 'VALID', 'VALID', 'PAIR_NOT_FOUND'];
    const { drillMap } = buildScenarioDrillMap(scenarioList);

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    const yFindings = result.findings.filter((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');
    expect(yFindings.length).toBeGreaterThanOrEqual(1);

    for (const f of yFindings) {
      const patch = f.suggestedFix?.patch ?? [];
      // Index should resolve; require at least one patch with correct path
      expect(patch.length).toBeGreaterThanOrEqual(1);
      expect(patch[0].path).toContain('/useDrillMapStore/drillMap/panels/');
      expect(patch[0].path).toContain('/points/');
      expect(patch[0].path).toContain('/position/1'); // Y-up axis
    }
  });

  it('handles mix of MINIFIX and CAM_LOCK purposes correctly', () => {
    // All scenarios use alternating purposes
    const scenarioList: ScenarioKind[] = [
      'VALID', // MINIFIX
      'VALID', // CAM_LOCK
      'Y_MISMATCH', // MINIFIX
      'MISSING_PAIR', // CAM_LOCK
      'VALID', // MINIFIX
      'PAIR_NOT_FOUND', // CAM_LOCK
    ];

    const { drillMap, cams, bolts } = buildScenarioDrillMap(scenarioList);

    // Verify alternating purposes
    expect(cams[0].purpose).toBe('MINIFIX');
    expect(cams[1].purpose).toBe('CAM_LOCK');
    expect(cams[2].purpose).toBe('MINIFIX');
    expect(cams[3].purpose).toBe('CAM_LOCK');

    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

    // Should detect errors for both MINIFIX and CAM_LOCK purposes
    expect(countCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBeGreaterThanOrEqual(1);
    expect(countCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBeGreaterThanOrEqual(1);
    expect(countCode(result, 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND')).toBeGreaterThanOrEqual(1);
  });

  it('correctly counts errors across multiple panels', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (validCount, yMismatchCount, missingCount) => {
          const scenarios: ScenarioKind[] = [
            ...Array(validCount).fill('VALID'),
            ...Array(yMismatchCount).fill('Y_MISMATCH'),
            ...Array(missingCount).fill('MISSING_PAIR'),
          ];

          // Shuffle for randomness
          scenarios.sort(() => Math.random() - 0.5);

          const { drillMap } = buildScenarioDrillMap(scenarios);
          // Use FIXED_BALL_OFFSET mode for error detection tests
          const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

          // Verify counts
          expect(countCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBe(yMismatchCount);
          expect(countCode(result, 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID')).toBe(missingCount);

          // Verify status
          if (yMismatchCount === 0 && missingCount === 0) {
            // All valid - no critical errors
            const criticalErrors = result.findings.filter(
              (f) =>
                f.code === 'MONO_MINIFIX_Y_MISMATCH' ||
                f.code === 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID' ||
                f.code === 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND'
            );
            expect(criticalErrors.length).toBe(0);
          } else {
            expect(result.status).toBe('FAIL');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('patch paths have correct panelIdx/pointIdx for distributed points', () => {
    // Create scenario where Y_MISMATCH bolt lands in different panels
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }), // Which scenario slot has Y_MISMATCH
        (yMismatchIdx) => {
          const scenarios: ScenarioKind[] = ['VALID', 'VALID', 'VALID'];
          scenarios[yMismatchIdx] = 'Y_MISMATCH';

          const { drillMap } = buildScenarioDrillMap(scenarios);
          // Use FIXED_BALL_OFFSET mode for error detection tests
          const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });

          const yFindings = result.findings.filter((f) => f.code === 'MONO_MINIFIX_Y_MISMATCH');

          if (yFindings.length > 0 && yFindings[0].suggestedFix?.patch?.[0]) {
            const path = yFindings[0].suggestedFix.patch[0].path;

            // Extract panel and point indices from path
            const panelMatch = path.match(/\/panels\/(\d+)\//);
            const pointMatch = path.match(/\/points\/(\d+)\//);

            expect(panelMatch).not.toBeNull();
            expect(pointMatch).not.toBeNull();

            const panelIdx = parseInt(panelMatch![1], 10);
            const pointIdx = parseInt(pointMatch![1], 10);

            // Verify the indices are within bounds
            expect(panelIdx).toBeGreaterThanOrEqual(0);
            expect(panelIdx).toBeLessThan(drillMap.panels.length);
            expect(pointIdx).toBeGreaterThanOrEqual(0);
            expect(pointIdx).toBeLessThan(drillMap.panels[panelIdx].points.length);

            // Verify the point at that location is actually a BOLT
            const targetPoint = drillMap.panels[panelIdx].points[pointIdx];
            expect(targetPoint.componentType).toBe('BOLT');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============================================
// STRESS TEST (Optional - for CI performance)
// ============================================

describe('validateMinifixGate (stress test)', () => {
  it('handles 100 pairs without timeout', () => {
    const scenarios: ScenarioKind[] = Array(100)
      .fill(null)
      .map((_, i) => (i % 5 === 0 ? 'Y_MISMATCH' : 'VALID'));

    const { drillMap } = buildScenarioDrillMap(scenarios);

    const startTime = performance.now();
    // Use FIXED_BALL_OFFSET mode for error detection tests
    const result = validateMinifixGate(drillMap, { solveMode: 'FIXED_BALL_OFFSET' });
    const endTime = performance.now();

    // Should complete in reasonable time (< 1 second)
    expect(endTime - startTime).toBeLessThan(1000);

    // Verify expected Y mismatch count (every 5th is Y_MISMATCH = 20 total)
    expect(countCode(result, 'MONO_MINIFIX_Y_MISMATCH')).toBe(20);
  });
});
