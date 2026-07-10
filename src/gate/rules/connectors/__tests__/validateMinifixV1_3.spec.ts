/**
 * Minifix Validation v1.3 Tests — Hardware-Derived Field Alignment
 *
 * Tests for 10 gaps found in audit:
 * - GAP 1,5: Per-panel thickness (mixed cabinets)
 * - GAP 2: BALL_TO_POCKET diagnostic
 * - GAP 3: boltDirection cross-check
 * - GAP 4: targetPocketCenter cross-check
 * - GAP 6: CAM edge clearance stricter threshold
 * - GAP 7: Bolt edge clearance (new)
 * - GAP 8: Distance B by panel thickness
 * - GAP 9: No console.log in validation
 * - GAP 10: DrillMapPoint.status propagation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeCam,
  makeBolt,
  makeValidPair,
  makeValidPairWithFields,
  onePanel,
  onePanelWithThickness,
  twoPanelsWithThickness,
  resetUidSequence,
} from './helpers/drillMapFactory';
import { validateMinifixGate } from '../validateMinifixConnector';
import type { DrillMapPoint } from '../../../../core/manufacturing/drillMap/types';

beforeEach(() => {
  resetUidSequence();
});

// ============================================
// GAP 1+5: Per-panel thickness
// ============================================

describe('v1.3 GAP 1+5: Per-panel thickness', () => {
  it('should use panel thickness from DrillMapPanel for depth checks', () => {
    // CAM on 16mm panel with 13.5mm depth → remaining 2.5mm → should PASS (>= 2.0mm min)
    const { cam, bolt } = makeValidPair('thick');
    cam.panelId = 'panel-thin';
    bolt.panelId = 'panel-thick';

    const drillMap = {
      version: 'drillmap.v1',
      panels: [
        {
          panelId: 'panel-thin',
          cabinetId: 'cab-1',
          role: 'TOP',
          worldPosition: [0, 0, 0] as [number, number, number],
          worldRotation: [0, 0, 0] as [number, number, number],
          dimensions: { width: 600, height: 400, thickness: 16 },
          points: [cam],
          grooves: [],
        },
        {
          panelId: 'panel-thick',
          cabinetId: 'cab-1',
          role: 'LEFT_SIDE',
          worldPosition: [0, 0, 0] as [number, number, number],
          worldRotation: [0, 0, 0] as [number, number, number],
          dimensions: { width: 600, height: 400, thickness: 18 },
          points: [bolt],
          grooves: [],
        },
      ],
    };

    // Default camDepth=13.5 on 16mm panel → remaining = 16-13.5 = 2.5 → PASS
    const result = validateMinifixGate(drillMap);
    const depthFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL'
    );
    expect(depthFindings).toHaveLength(0);
  });

  it('should FAIL when cam depth exceeds thin panel', () => {
    const { cam, bolt } = makeValidPair('thin');
    cam.panelId = 'panel-thin';
    bolt.panelId = 'panel-thick';

    const drillMap = {
      version: 'drillmap.v1',
      panels: [
        {
          panelId: 'panel-thin',
          cabinetId: 'cab-1',
          role: 'TOP',
          worldPosition: [0, 0, 0] as [number, number, number],
          worldRotation: [0, 0, 0] as [number, number, number],
          dimensions: { width: 600, height: 400, thickness: 14 },
          points: [cam],
          grooves: [],
        },
        {
          panelId: 'panel-thick',
          cabinetId: 'cab-1',
          role: 'LEFT_SIDE',
          worldPosition: [0, 0, 0] as [number, number, number],
          worldRotation: [0, 0, 0] as [number, number, number],
          dimensions: { width: 600, height: 400, thickness: 18 },
          points: [bolt],
          grooves: [],
        },
      ],
    };

    // camDepth=13.5 on 14mm panel → remaining = 0.5 < 2.0mm → FAIL
    const result = validateMinifixGate(drillMap);
    const depthFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_CAM_DEPTH_EXCEEDS_PANEL'
    );
    expect(depthFindings).toHaveLength(1);
    expect(depthFindings[0].severity).toBe('ERROR');
  });
});

// ============================================
// GAP 7: Bolt edge clearance
// ============================================

describe('v1.3 GAP 7: Bolt edge clearance (EDGE-002)', () => {
  it('should PASS when bolt has sufficient edge clearance', () => {
    const { cam, bolt } = makeValidPair('edge');
    bolt.edgeDistance = 12; // Ø10mm → radius 5mm → clearance 7mm > 5mm threshold

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(0);
  });

  it('should FAIL when bolt is too close to panel edge', () => {
    const { cam, bolt } = makeValidPair('edge');
    bolt.edgeDistance = 8; // Ø10mm → radius 5mm → clearance 3mm < 5mm threshold

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(1);
    expect(edgeFindings[0].severity).toBe('ERROR');
    expect(edgeFindings[0].measured?.clearance_mm).toBe(3);
  });

  it('should FAIL when bolt overlaps panel edge', () => {
    const { cam, bolt } = makeValidPair('edge');
    bolt.edgeDistance = 3; // Ø10mm → radius 5mm → clearance -2mm

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(1);
    expect(edgeFindings[0].measured?.clearance_mm).toBe(-2);
  });

  it('should SKIP when bolt edgeDistance is undefined', () => {
    const { cam, bolt } = makeValidPair('skip');
    // bolt.edgeDistance is undefined by default

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(0);
  });
});

// ============================================
// GAP 6: CAM edge clearance stricter threshold
// ============================================

describe('v1.3 GAP 6: CAM edge clearance uses proper tolerance (7.5mm)', () => {
  it('should PASS when CAM has clearance above 7.5mm', () => {
    const { cam, bolt } = makeValidPair('cam-edge');
    cam.edgeDistance = 16; // Ø15mm → radius 7.5mm → clearance 8.5mm > 7.5mm

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(0);
  });

  it('should FAIL when CAM has clearance below 7.5mm (insufficient margin)', () => {
    const { cam, bolt } = makeValidPair('cam-edge');
    cam.edgeDistance = 10; // Ø15mm → radius 7.5mm → clearance 2.5mm < 7.5mm

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(1);
    expect(edgeFindings[0].severity).toBe('ERROR');
    expect(edgeFindings[0].measured?.clearance_mm).toBe(2.5);
  });

  it('should FAIL when CAM overlaps panel edge', () => {
    const { cam, bolt } = makeValidPair('cam-edge');
    cam.edgeDistance = 5; // Ø15mm → radius 7.5mm → clearance -2.5mm

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const edgeFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_CAM_EDGE_CLEARANCE'
    );
    expect(edgeFindings).toHaveLength(1);
    expect(edgeFindings[0].measured?.clearance_mm).toBe(-2.5);
  });
});

// ============================================
// GAP 3: boltDirection cross-check
// ============================================

describe('v1.3 GAP 3: boltDirection cross-check (DIAG-001)', () => {
  it('should NOT warn when boltDirection matches computed axis', () => {
    const { cam, bolt } = makeValidPair('dir');
    // S16: แกนจริง = จาก bolt ไป pocket ที่ Dim A (ครึ่งความหนาแผ่น 18/2) ตาม generator
    const pocket = [
      cam.position[0] + cam.normal[0] * 9,
      cam.position[1] + cam.normal[1] * 9,
      cam.position[2] + cam.normal[2] * 9,
    ];
    const v = [pocket[0] - bolt.position[0], pocket[1] - bolt.position[1], pocket[2] - bolt.position[2]];
    const len = Math.hypot(v[0], v[1], v[2]);
    bolt.boltDirection = [v[0] / len, v[1] / len, v[2] / len];

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const dirFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_DIRECTION_MISMATCH'
    );
    expect(dirFindings).toHaveLength(0);
  });

  it('should WARN when boltDirection is significantly misaligned', () => {
    const { cam, bolt } = makeValidPair('dir');
    bolt.boltDirection = [0, -1, 0]; // Points downward instead of toward cam (90° off)

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const dirFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_DIRECTION_MISMATCH'
    );
    expect(dirFindings).toHaveLength(1);
    expect(dirFindings[0].severity).toBe('WARNING');
  });

  it('should SKIP when boltDirection is undefined', () => {
    const { cam, bolt } = makeValidPair('dir');
    // boltDirection is undefined by default

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const dirFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_BOLT_DIRECTION_MISMATCH'
    );
    expect(dirFindings).toHaveLength(0);
  });
});

// ============================================
// GAP 4: targetPocketCenter cross-check
// ============================================

describe('v1.3 GAP 4: targetPocketCenter cross-check (DIAG-002)', () => {
  it('should NOT warn when targetPocketCenter matches computed', () => {
    const { cam, bolt } = makeValidPairWithFields('tpc');

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const tpcFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POCKET_CENTER_MISMATCH'
    );
    // May have INFO from BALL_TO_POCKET diagnostic, filter to WARNING only
    const warnings = tpcFindings.filter(f => f.severity === 'WARNING');
    expect(warnings).toHaveLength(0);
  });

  it('should WARN when targetPocketCenter is significantly off', () => {
    const { cam, bolt } = makeValidPair('tpc');
    // Set targetPocketCenter 5mm off from where computed value would be
    const camDepthHalf = 13.5 / 2;
    bolt.targetPocketCenter = [
      cam.position[0] + cam.normal[0] * camDepthHalf + 5, // 5mm X offset
      cam.position[1] + cam.normal[1] * camDepthHalf,
      cam.position[2] + cam.normal[2] * camDepthHalf,
    ];

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const tpcFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POCKET_CENTER_MISMATCH' && f.severity === 'WARNING'
    );
    expect(tpcFindings).toHaveLength(1);
    expect(tpcFindings[0].measured?.distance_mm).toBeGreaterThan(1.0);
  });

  it('should SKIP when targetPocketCenter is undefined', () => {
    const { cam, bolt } = makeValidPair('tpc');
    // targetPocketCenter is undefined by default

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const tpcWarnings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POCKET_CENTER_MISMATCH' && f.severity === 'WARNING'
    );
    expect(tpcWarnings).toHaveLength(0);
  });
});

// ============================================
// GAP 8: Distance B by panel thickness
// ============================================

describe('v1.3 GAP 8: Distance B linked to panel thickness', () => {
  it('should PASS for 18mm panel with B=24mm (standard)', () => {
    const { cam, bolt } = makeValidPair('db');
    cam.drillingDistanceB = 24;

    const drillMap = onePanelWithThickness([cam, bolt], 18);
    const result = validateMinifixGate(drillMap);

    const dbFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE'
    );
    expect(dbFindings).toHaveLength(0);
  });

  it('should PASS for 16mm panel with B=22mm', () => {
    const { cam, bolt } = makeValidPair('db');
    cam.drillingDistanceB = 22;
    // Ensure panelId matches so thickness lookup works
    cam.panelId = 'panel-A';
    bolt.panelId = 'panel-A';

    const drillMap = onePanelWithThickness([cam, bolt], 16);
    const result = validateMinifixGate(drillMap);

    const dbFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE'
    );
    expect(dbFindings).toHaveLength(0);
  });

  it('should WARN for 16mm panel with B=24mm (wrong for this thickness)', () => {
    const { cam, bolt } = makeValidPair('db');
    cam.drillingDistanceB = 24; // Expected 22mm for 16mm wood
    cam.panelId = 'panel-A';
    bolt.panelId = 'panel-A';

    const drillMap = onePanelWithThickness([cam, bolt], 16);
    const result = validateMinifixGate(drillMap);

    const dbFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE'
    );
    expect(dbFindings).toHaveLength(1);
    expect(dbFindings[0].severity).toBe('WARNING');
    expect(dbFindings[0].measured?.expected_b_mm).toBe(22);
  });

  it('should PASS for 19mm panel with B=25mm', () => {
    const { cam, bolt } = makeValidPair('db');
    cam.drillingDistanceB = 25;
    cam.panelId = 'panel-A';
    bolt.panelId = 'panel-A';

    const drillMap = onePanelWithThickness([cam, bolt], 19);
    const result = validateMinifixGate(drillMap);

    const dbFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE'
    );
    expect(dbFindings).toHaveLength(0);
  });

  it('should use default B=24mm for unknown panel thickness', () => {
    const { cam, bolt } = makeValidPair('db');
    cam.drillingDistanceB = 24;
    cam.panelId = 'panel-A';
    bolt.panelId = 'panel-A';

    // 20mm is not in the lookup table
    const drillMap = onePanelWithThickness([cam, bolt], 20);
    const result = validateMinifixGate(drillMap);

    const dbFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE'
    );
    expect(dbFindings).toHaveLength(0);
  });
});

// ============================================
// GAP 10: DrillMapPoint.status propagation
// ============================================

describe('v1.3 GAP 10: DrillMapPoint.status propagation', () => {
  it('should propagate ERROR status as INFO finding', () => {
    const { cam, bolt } = makeValidPair('status');
    cam.status = 'ERROR';
    cam.statusMessage = 'Upstream issue detected';

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const statusFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POINT_STATUS_PROPAGATED'
    );
    expect(statusFindings.length).toBeGreaterThanOrEqual(1);
    const camFinding = statusFindings.find(f => f.entityIds.includes(cam.id));
    expect(camFinding).toBeDefined();
    expect(camFinding!.severity).toBe('INFO');
    expect(camFinding!.message).toContain('Upstream issue detected');
  });

  it('should propagate WARNING status as INFO finding', () => {
    const { cam, bolt } = makeValidPair('status');
    bolt.status = 'WARNING';

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const statusFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POINT_STATUS_PROPAGATED'
    );
    const boltFinding = statusFindings.find(f => f.entityIds.includes(bolt.id));
    expect(boltFinding).toBeDefined();
    expect(boltFinding!.severity).toBe('INFO');
  });

  it('should NOT propagate VALID status', () => {
    const { cam, bolt } = makeValidPair('status');
    // Both are VALID by default

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const statusFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POINT_STATUS_PROPAGATED'
    );
    expect(statusFindings).toHaveLength(0);
  });
});

// ============================================
// GAP 2: BALL_TO_POCKET diagnostic
// ============================================

describe('v1.3 GAP 2: BALL_TO_POCKET diagnostic', () => {
  it('should emit INFO when BALL_TO_POCKET auto-correction is significant', () => {
    // Create a pair where bolt is intentionally misaligned
    const cam = makeCam({ id: 'cam-diag', y: 100, pairedHoleId: 'bolt-diag' });
    const bolt = makeBolt({
      id: 'bolt-diag',
      y: 80, // Intentionally 20mm off from cam pocket center
      normal: [-1, 0, 0],
    });

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    // The default BALL_TO_POCKET mode auto-corrects B to C,
    // but diagnostic should report the gap
    const diagFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POCKET_CENTER_MISMATCH' && f.severity === 'INFO'
    );
    expect(diagFindings.length).toBeGreaterThanOrEqual(1);
    expect(diagFindings[0].measured?.auto_correction_distance_mm).toBeGreaterThan(1.0);
  });

  it('should NOT emit diagnostic when bolt is well-aligned', () => {
    const { cam, bolt } = makeValidPair('diag');

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    const diagFindings = result.findings.filter(
      f => f.code === 'MONO_MINIFIX_POCKET_CENTER_MISMATCH' && f.severity === 'INFO'
    );
    expect(diagFindings).toHaveLength(0);
  });
});

// ============================================
// Integration test: Full hardware field validation
// ============================================

describe('v1.3 Integration: Full hardware field validation', () => {
  it('should validate all hardware fields with makeValidPairWithFields', () => {
    const { cam, bolt } = makeValidPairWithFields('int');
    // Ensure panelId matches the panel in onePanel()
    cam.panelId = 'panel-A';
    bolt.panelId = 'panel-A';

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    // With all fields properly set, there should be no errors
    const errors = result.findings.filter(f => f.severity === 'ERROR');
    // Show what error(s) we got to help debug
    expect(errors.map(e => `${e.code}: ${e.message}`)).toEqual([]);
  });

  it('should catch multiple issues on a bad pair', () => {
    const cam = makeCam({ id: 'cam-bad', y: 100, pairedHoleId: 'bolt-bad' });
    cam.edgeDistance = 5;           // Too close to edge (clearance -2.5mm)
    cam.drillingDistanceB = 30;     // Wrong Distance B for 18mm wood

    const bolt = makeBolt({
      id: 'bolt-bad',
      y: 80,                         // Misaligned Y
      normal: [-1, 0, 0],
      edgeDistance: 3,                // Too close to edge (clearance -2mm)
      boltDirection: [0, -1, 0],     // 90° off from expected direction
    });

    const drillMap = onePanel([cam, bolt]);
    const result = validateMinifixGate(drillMap);

    // Should catch: CAM edge, Distance B, bolt edge, bolt direction mismatch
    const codes = result.findings.map(f => f.code);
    expect(codes).toContain('MONO_MINIFIX_CAM_EDGE_CLEARANCE');
    expect(codes).toContain('MONO_MINIFIX_DISTANCE_B_OUT_OF_RANGE');
    expect(codes).toContain('MONO_MINIFIX_BOLT_EDGE_CLEARANCE');
    expect(codes).toContain('MONO_MINIFIX_BOLT_DIRECTION_MISMATCH');
  });
});
