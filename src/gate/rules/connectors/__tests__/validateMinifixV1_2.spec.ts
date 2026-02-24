/**
 * Tests for v1.2 Connector Validation Rules
 *
 * New rules:
 * - MONO-MINIFIX-DEPTH-001: CAM depth vs panel thickness
 * - MONO-MINIFIX-DEPTH-002: Bolt depth vs panel edge
 * - MONO-MINIFIX-EDGE-001: CAM edge clearance
 * - MONO-MINIFIX-DIST-001: Distance B validation
 * - MONO-MINIFIX-PAIR-003: Duplicate bolt target
 * - MONO-MINIFIX-PAIR-004: Orphan bolt detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeCam,
  makeBolt,
  makePoint,
  onePanel,
  makeValidPair,
  resetUidSequence,
} from './helpers/drillMapFactory';
import {
  validateMinifixGate,
  validatePairIntegrity,
  validateMinifixConnectorPair,
} from '../validateMinifixConnector';
import { buildConnectorPairFromDrillPoints } from '../drillMapToMinifixPair';
import { MINIFIX_TOLERANCES } from '../minifixConstraintTypes';
import type { DrillMapPoint } from '../../../../core/manufacturing/drillMap/types';

beforeEach(() => {
  resetUidSequence();
});

// ============================================
// PAIR INTEGRITY: Duplicate Bolt Target (PAIR-003)
// ============================================

describe('MONO-MINIFIX-PAIR-003: Duplicate bolt target', () => {
  it('should PASS when each bolt is targeted by exactly one CAM', () => {
    const { cam: cam1, bolt: bolt1 } = makeValidPair('1');
    const { cam: cam2, bolt: bolt2 } = makeValidPair('2');
    const points: DrillMapPoint[] = [cam1, bolt1, cam2, bolt2];

    const findings = validatePairIntegrity(points);
    const dupFindings = findings.filter(f => f.code === 'MONO_MINIFIX_DUPLICATE_BOLT_TARGET');
    expect(dupFindings).toHaveLength(0);
  });

  it('should FAIL when two CAMs target the same bolt', () => {
    const bolt = makeBolt({ id: 'shared-bolt', y: 93.25 });
    const cam1 = makeCam({ id: 'cam-A', y: 100, pairedHoleId: 'shared-bolt' });
    const cam2 = makeCam({ id: 'cam-B', y: 100, pairedHoleId: 'shared-bolt' });
    const points: DrillMapPoint[] = [cam1, cam2, bolt];

    const findings = validatePairIntegrity(points);
    const dupFindings = findings.filter(f => f.code === 'MONO_MINIFIX_DUPLICATE_BOLT_TARGET');
    expect(dupFindings).toHaveLength(1);
    expect(dupFindings[0].entityIds).toContain('shared-bolt');
    expect(dupFindings[0].entityIds).toContain('cam-A');
    expect(dupFindings[0].entityIds).toContain('cam-B');
  });

  it('should report correct cam_count in measured field', () => {
    const bolt = makeBolt({ id: 'bolt-shared', y: 93.25 });
    const cam1 = makeCam({ id: 'cam-X', y: 100, pairedHoleId: 'bolt-shared' });
    const cam2 = makeCam({ id: 'cam-Y', y: 100, pairedHoleId: 'bolt-shared' });
    const cam3 = makeCam({ id: 'cam-Z', y: 100, pairedHoleId: 'bolt-shared' });
    const points: DrillMapPoint[] = [cam1, cam2, cam3, bolt];

    const findings = validatePairIntegrity(points);
    const dupFindings = findings.filter(f => f.code === 'MONO_MINIFIX_DUPLICATE_BOLT_TARGET');
    expect(dupFindings).toHaveLength(1);
    expect(dupFindings[0].measured?.cam_count).toBe(3);
  });
});

// ============================================
// PAIR INTEGRITY: Orphan Bolt (PAIR-004)
// ============================================

describe('MONO-MINIFIX-PAIR-004: Orphan bolt detection', () => {
  it('should PASS when all bolts are paired', () => {
    const { cam, bolt } = makeValidPair('1');
    const points: DrillMapPoint[] = [cam, bolt];

    const findings = validatePairIntegrity(points);
    const orphanFindings = findings.filter(f => f.code === 'MONO_MINIFIX_ORPHAN_BOLT');
    expect(orphanFindings).toHaveLength(0);
  });

  it('should WARN when a bolt has no CAM paired to it', () => {
    const orphanBolt = makeBolt({ id: 'orphan-bolt', y: 93.25 });
    const { cam, bolt } = makeValidPair('1');
    const points: DrillMapPoint[] = [cam, bolt, orphanBolt];

    const findings = validatePairIntegrity(points);
    const orphanFindings = findings.filter(f => f.code === 'MONO_MINIFIX_ORPHAN_BOLT');
    expect(orphanFindings).toHaveLength(1);
    expect(orphanFindings[0].entityIds).toContain('orphan-bolt');
    expect(orphanFindings[0].severity).toBe('WARNING');
  });

  it('should not report orphan if bolt has reverse pairing', () => {
    const cam = makeCam({ id: 'cam-reverse', y: 100 });
    const bolt = makeBolt({ id: 'bolt-reverse', y: 93.25 });
    // Reverse pairing: bolt.pairedHoleId → cam
    bolt.pairedHoleId = 'cam-reverse';
    const points: DrillMapPoint[] = [cam, bolt];

    const findings = validatePairIntegrity(points);
    const orphanFindings = findings.filter(f => f.code === 'MONO_MINIFIX_ORPHAN_BOLT');
    expect(orphanFindings).toHaveLength(0);
  });
});

// ============================================
// DEPTH: CAM vs Panel Thickness (DEPTH-001)
// ============================================

describe('MONO-MINIFIX-DEPTH-001: CAM depth vs panel thickness', () => {
  it('should PASS when CAM depth leaves sufficient material', () => {
    // 13.5mm CAM in 18mm panel → 4.5mm remaining (> 2mm min)
    const { cam, bolt } = makeValidPair('1');
    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap, { panelThickness: 18 });

    const depthFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL');
    expect(depthFindings).toHaveLength(0);
  });

  it('should FAIL when CAM depth nearly equals panel thickness', () => {
    const { cam, bolt } = makeValidPair('1');
    // Use very thin panel: 14mm, cam depth 13.5mm → 0.5mm remaining (< 2mm)
    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap, { panelThickness: 14, camDepth: 13.5 });

    const depthFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL');
    expect(depthFindings).toHaveLength(1);
    expect(depthFindings[0].severity).toBe('ERROR');
  });

  it('should PASS for standard 18mm panel with 13.5mm cam', () => {
    const pair = buildConnectorPairFromDrillPoints({
      camPoint: makeCam({ id: 'cam-std', y: 100, pairedHoleId: 'bolt-std' }),
      boltPoint: makeBolt({ id: 'bolt-std', y: 93.25 }),
      camDepth: 13.5,
      boltBallOffset: 9.5,
      boltBallDiameter: 7.0,
      panelHThickness: 18,
      panelVThickness: 18,
    });

    const findings = validateMinifixConnectorPair(pair);
    const depthFindings = findings.filter(f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL');
    expect(depthFindings).toHaveLength(0);
  });
});

// ============================================
// DEPTH: Bolt vs Panel Edge (DEPTH-002)
// ============================================

describe('MONO-MINIFIX-DEPTH-002: Bolt depth vs panel edge', () => {
  it('should PASS when bolt depth leaves sufficient material', () => {
    // 34mm bolt in 18mm panel... actually bolt depth 34mm > 18mm!
    // But bolt depth in the pair builder uses the DrillMapPoint.depth directly
    // Default bolt depth: 34mm, panel thickness: 18mm → this should fail
    // Let's use realistic values
    const bolt = makeBolt({ id: 'bolt-depth' });
    bolt.depth = 12; // 12mm depth in 18mm panel → 6mm remaining
    const cam = makeCam({ id: 'cam-depth', y: 100, pairedHoleId: 'bolt-depth' });

    const pair = buildConnectorPairFromDrillPoints({
      camPoint: cam,
      boltPoint: bolt,
      camDepth: 13.5,
      boltBallOffset: 9.5,
      boltBallDiameter: 7.0,
      panelHThickness: 18,
      panelVThickness: 18,
    });

    const findings = validateMinifixConnectorPair(pair);
    const depthFindings = findings.filter(f => f.code === 'MONO_MINIFIX_BOLT_DEPTH_EXCEEDS_PANEL');
    expect(depthFindings).toHaveLength(0);
  });

  it('should FAIL when bolt depth exceeds panel edge dimension', () => {
    const bolt = makeBolt({ id: 'bolt-deep' });
    bolt.depth = 17; // 17mm depth in 18mm panel → 1mm remaining (< 2mm)
    const cam = makeCam({ id: 'cam-deep', y: 100, pairedHoleId: 'bolt-deep' });

    const pair = buildConnectorPairFromDrillPoints({
      camPoint: cam,
      boltPoint: bolt,
      camDepth: 13.5,
      boltBallOffset: 9.5,
      boltBallDiameter: 7.0,
      panelHThickness: 18,
      panelVThickness: 18,
    });

    const findings = validateMinifixConnectorPair(pair);
    const depthFindings = findings.filter(f => f.code === 'MONO_MINIFIX_BOLT_DEPTH_EXCEEDS_PANEL');
    expect(depthFindings).toHaveLength(1);
    expect(depthFindings[0].severity).toBe('ERROR');
  });
});

// ============================================
// EDGE: CAM Edge Clearance (EDGE-001)
// ============================================

describe('MONO-MINIFIX-EDGE-001: CAM edge clearance', () => {
  it('should PASS when CAM has sufficient edge clearance', () => {
    const cam = makeCam({ id: 'cam-edge', y: 100, pairedHoleId: 'bolt-edge' });
    cam.edgeDistance = 24; // 24mm from edge, cam radius 7.5mm → 16.5mm clearance
    const bolt = makeBolt({ id: 'bolt-edge', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const edgeFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE');
    expect(edgeFindings).toHaveLength(0);
  });

  it('should FAIL when CAM overlaps panel edge', () => {
    const cam = makeCam({ id: 'cam-edge-bad', y: 100, pairedHoleId: 'bolt-edge-bad' });
    cam.edgeDistance = 5; // 5mm from edge, cam radius 7.5mm → -2.5mm clearance!
    const bolt = makeBolt({ id: 'bolt-edge-bad', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const edgeFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE');
    expect(edgeFindings).toHaveLength(1);
    expect(edgeFindings[0].severity).toBe('ERROR');
    expect(edgeFindings[0].measured?.clearance_mm).toBeLessThan(0);
  });

  it('should skip check when edgeDistance is not set', () => {
    const cam = makeCam({ id: 'cam-no-edge', y: 100, pairedHoleId: 'bolt-no-edge' });
    // edgeDistance is undefined
    const bolt = makeBolt({ id: 'bolt-no-edge', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const edgeFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE');
    expect(edgeFindings).toHaveLength(0);
  });
});

// ============================================
// DISTANCE: Distance B Validation (DIST-001)
// ============================================

describe('MONO-MINIFIX-DIST-001: Distance B validation', () => {
  it('should PASS when Distance B is 24mm (standard)', () => {
    const cam = makeCam({ id: 'cam-distb', y: 100, pairedHoleId: 'bolt-distb' });
    cam.drillingDistanceB = 24;
    const bolt = makeBolt({ id: 'bolt-distb', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const distFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    expect(distFindings).toHaveLength(0);
  });

  it('should WARN when Distance B deviates from standard', () => {
    const cam = makeCam({ id: 'cam-distb-bad', y: 100, pairedHoleId: 'bolt-distb-bad' });
    cam.drillingDistanceB = 34; // 34mm — 10mm off from 24mm standard
    const bolt = makeBolt({ id: 'bolt-distb-bad', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const distFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    expect(distFindings).toHaveLength(1);
    expect(distFindings[0].severity).toBe('WARNING');
    expect(distFindings[0].measured?.distance_b_mm).toBe(34);
  });

  it('should PASS when Distance B is within tolerance', () => {
    const cam = makeCam({ id: 'cam-distb-ok', y: 100, pairedHoleId: 'bolt-distb-ok' });
    cam.drillingDistanceB = 24.5; // 0.5mm off — within 1mm tolerance
    const bolt = makeBolt({ id: 'bolt-distb-ok', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const distFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    expect(distFindings).toHaveLength(0);
  });

  it('should skip when drillingDistanceB is not set', () => {
    const cam = makeCam({ id: 'cam-distb-none', y: 100, pairedHoleId: 'bolt-distb-none' });
    // drillingDistanceB is undefined
    const bolt = makeBolt({ id: 'bolt-distb-none', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap);
    const distFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    expect(distFindings).toHaveLength(0);
  });
});

// ============================================
// INTEGRATION: All new rules in validateMinifixGate
// ============================================

describe('v1.2 integration in validateMinifixGate', () => {
  it('should include new constraint codes in tolerance constants', () => {
    expect(MINIFIX_TOLERANCES.CAM_MIN_REMAINING_DEPTH_MM).toBe(2.0);
    expect(MINIFIX_TOLERANCES.BOLT_MIN_REMAINING_DEPTH_MM).toBe(2.0);
    expect(MINIFIX_TOLERANCES.CAM_EDGE_CLEARANCE_MM).toBe(7.5);
    expect(MINIFIX_TOLERANCES.DISTANCE_B_STANDARD_MM).toBe(24.0);
    expect(MINIFIX_TOLERANCES.DISTANCE_B_TOLERANCE_MM).toBe(1.0);
  });

  it('should PASS a clean valid pair with no new findings', () => {
    const { cam, bolt } = makeValidPair('clean');
    cam.edgeDistance = 24; // Good edge distance
    cam.drillingDistanceB = 24; // Standard B distance
    bolt.depth = 12; // Safe bolt depth
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap, { panelThickness: 18, camDepth: 13.5 });

    // Filter only new v1.2 codes
    const v12Codes = [
      'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL',
      'MONO_MINIFIX_BOLT_DEPTH_EXCEEDS_PANEL',
      'MONO_MINIFIX_CAM_EDGE_CLEARANCE',
      'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE',
      'MONO_MINIFIX_DUPLICATE_BOLT_TARGET',
      'MONO_MINIFIX_ORPHAN_BOLT',
    ];
    const v12Findings = result.findings.filter(f => v12Codes.includes(f.code));
    expect(v12Findings).toHaveLength(0);
  });

  it('should aggregate multiple v1.2 issues', () => {
    const cam = makeCam({ id: 'cam-multi', y: 100, pairedHoleId: 'bolt-multi' });
    cam.edgeDistance = 3; // Too close to edge
    cam.drillingDistanceB = 40; // Wrong distance B
    const bolt = makeBolt({ id: 'bolt-multi', y: 93.25 });
    const drillMap = onePanel([cam, bolt]);

    const result = validateMinifixGate(drillMap, { panelThickness: 14, camDepth: 13.5 });

    // Should have edge clearance warning/error AND distance B warning AND depth issue
    const edgeFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE');
    const distFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    const depthFindings = result.findings.filter(f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL');

    expect(edgeFindings.length).toBeGreaterThan(0);
    expect(distFindings.length).toBeGreaterThan(0);
    expect(depthFindings.length).toBeGreaterThan(0);
  });
});
