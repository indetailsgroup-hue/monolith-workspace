/**
 * Gate G11 Tests - Minifix/System32/Dowel Validation
 *
 * @module gate/rules/__tests__/gateG11_minifixSystem32.test
 * @version 2.0.0 (v4.0 Side-covers-Top Construction)
 *
 * Tests for G11 gate validation rules based on Häfele engineering standards.
 *
 * v4.0 Side-covers-Top Construction:
 * - SIDE panels: FACE_BORE with 12mm depth (into inner face)
 * - HORIZ panels: EDGE_BORE with 18mm depth (into left/right edge for DOWEL)
 * - CAM: FACE_BORE on HORIZ panels
 * - BOLT: FACE_BORE on SIDE panels (horizontal X drilling)
 */

import { describe, it, expect } from 'vitest';
import {
  runG11Rules,
  ruleG11_DistanceB,
  ruleG11_DowelDepth,
  ruleG11_DrillType,
  ruleG11_MatingAlignment,
  ruleG11_BoltCamAlignment,
  G11_CONSTANTS,
  type G11DrillPoint,
  type G11Panel,
  type G11Policy,
} from '../gateG11_minifixSystem32';
import {
  calculateExpectedConnectorCount,
  getExpectedDowelDepth,
  getExpectedBoreType,
  isSidePanel,
  isHorizontalPanel,
} from '../gateG11_types';

// ============================================
// TEST FIXTURES
// ============================================

/**
 * Create a test drill point with defaults.
 */
function createDrillPoint(overrides: Partial<G11DrillPoint> & {
  id: string;
  purpose: string;
}): G11DrillPoint {
  return {
    panelId: 'panel-1',
    position: [0, 0, 0],
    normal: [1, 0, 0],
    diameter: 8,
    depth: 18,
    componentType: 'DOWEL',
    ...overrides,
  };
}

/**
 * Create a CAM drill point on horizontal panel.
 *
 * G11.5: CAM position must align with BOLT tip for physical assembly.
 *
 * @param position - Optional world position [x, y, z]. If not provided, defaults based on edgeDistance.
 */
function createCamPoint(
  id: string,
  edgeDistance: number,
  cornerType: string,
  position?: [number, number, number]
): G11DrillPoint {
  // Default position: X = edgeDistance from panel edge (assuming panel starts at x=18mm for INSET)
  const defaultX = 18 + edgeDistance; // 18mm panel thickness + Distance B
  const defaultPosition: [number, number, number] = position || [defaultX, 700, 37];

  return createDrillPoint({
    id,
    purpose: 'CAM_LOCK',
    componentType: 'HOUSING',
    diameter: 15,
    depth: 12.5,
    position: defaultPosition,
    normal: [0, -1, 0], // Face bore (into TOP panel)
    edgeDistance,
    cornerType,
    connectedPanelRole: 'TOP',
  });
}

/**
 * Create a BOLT drill point on side panel.
 *
 * v4.0 Side-covers-Top: BOLT on SIDE panel uses FACE_BORE
 * (horizontal X drilling into inner face)
 *
 * G11.5: BOLT tip must reach CAM pocket center.
 * - BOLT entry: inner face of SIDE panel (X = 18mm for LEFT panel)
 * - BOLT tip: entry + 24mm protrusion in opposite direction of drill normal
 * - For LEFT panel: tip = [18 + 24, Y, Z] = [42, Y, Z]
 *
 * @param position - Optional world position [x, y, z]
 * @param pairedCamId - Optional ID of paired CAM point for G11.5 validation
 */
function createBoltPoint(
  id: string,
  cornerType: string,
  position?: [number, number, number],
  pairedCamId?: string
): G11DrillPoint {
  const isLeft = cornerType.includes('LEFT');
  // Default position: inner face of SIDE panel
  const defaultX = isLeft ? 18 : 582; // 18mm for left, 600-18 for right (assuming 600mm cabinet)
  const defaultPosition: [number, number, number] = position || [defaultX, 700, 37];

  return createDrillPoint({
    id,
    purpose: 'BOLT',
    componentType: 'BOLT',
    diameter: 10,
    depth: 17.5,
    position: defaultPosition,
    // v4.0: FACE_BORE on SIDE (horizontal X drilling into inner face)
    normal: isLeft ? [-1, 0, 0] : [1, 0, 0],
    cornerType,
    connectedPanelRole: isLeft ? 'LEFT_SIDE' : 'RIGHT_SIDE',
    pairedHoleId: pairedCamId,
  });
}

/**
 * Create a DOWEL drill point.
 *
 * v4.0 Side-covers-Top Construction - Normal vectors for bore type:
 * - SIDE panel: FACE_BORE with horizontal normal [±1, 0, 0] (into inner face)
 * - HORIZ panel: EDGE_BORE with horizontal normal [±1, 0, 0] (into left/right edge)
 *
 * Note: Both are horizontal drilling but different panels!
 */
function createDowelPoint(
  id: string,
  panelRole: string,
  depth: number,
  position: [number, number, number],
  pairId?: string
): G11DrillPoint {
  const isSide = isSidePanel(panelRole);
  // v4.0: SIDE=FACE_BORE (horizontal into face), HORIZ=EDGE_BORE (horizontal into edge)
  // Both use horizontal normal, but different semantic meaning
  return createDrillPoint({
    id,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    diameter: 8,
    depth,
    position,
    // v4.0: Both SIDE and HORIZ dowels drill horizontally (X axis)
    normal: [1, 0, 0],
    connectedPanelRole: panelRole,
    pairId,
  });
}

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('G11 Helper Functions', () => {
  describe('getExpectedDowelDepth', () => {
    // v4.0 Side-covers-Top: SIDE=12mm (face bore), HORIZ=18mm (edge bore)
    it('should return 12mm for SIDE panels (v4.0 face bore)', () => {
      expect(getExpectedDowelDepth('LEFT_SIDE')).toBe(12);
      expect(getExpectedDowelDepth('RIGHT_SIDE')).toBe(12);
      expect(getExpectedDowelDepth('SIDE')).toBe(12);
    });

    it('should return 18mm for horizontal panels (v4.0 edge bore)', () => {
      expect(getExpectedDowelDepth('TOP')).toBe(18);
      expect(getExpectedDowelDepth('BOTTOM')).toBe(18);
      expect(getExpectedDowelDepth('SHELF')).toBe(18);
    });
  });

  describe('getExpectedBoreType', () => {
    // v4.0 Side-covers-Top: SIDE=FACE_BORE, HORIZ=FACE_BORE for CAM, EDGE_BORE for DOWEL
    it('should return FACE_BORE for SIDE panels (v4.0 face drilling)', () => {
      expect(getExpectedBoreType('LEFT_SIDE')).toBe('FACE_BORE');
      expect(getExpectedBoreType('RIGHT_SIDE')).toBe('FACE_BORE');
    });

    it('should return FACE_BORE for horizontal panels', () => {
      expect(getExpectedBoreType('TOP')).toBe('FACE_BORE');
      expect(getExpectedBoreType('BOTTOM')).toBe('FACE_BORE');
    });
  });

  describe('isSidePanel / isHorizontalPanel', () => {
    it('should correctly identify side panels', () => {
      expect(isSidePanel('LEFT_SIDE')).toBe(true);
      expect(isSidePanel('RIGHT_SIDE')).toBe(true);
      expect(isSidePanel('TOP')).toBe(false);
    });

    it('should correctly identify horizontal panels', () => {
      expect(isHorizontalPanel('TOP')).toBe(true);
      expect(isHorizontalPanel('BOTTOM')).toBe(true);
      expect(isHorizontalPanel('LEFT_SIDE')).toBe(false);
    });
  });

  describe('calculateExpectedConnectorCount', () => {
    it('should return 2 for minimum depth', () => {
      expect(calculateExpectedConnectorCount(100)).toBe(2);
    });

    it('should calculate correctly for 560mm depth', () => {
      // usable = 560 - 74 = 486
      // count = max(2, floor(486 / 224) + 2) = max(2, 2 + 2) = 4
      expect(calculateExpectedConnectorCount(560)).toBe(4);
    });

    it('should calculate correctly for 800mm depth', () => {
      // usable = 800 - 74 = 726
      // count = max(2, floor(726 / 224) + 2) = max(2, 3 + 2) = 5
      expect(calculateExpectedConnectorCount(800)).toBe(5);
    });
  });
});

// ============================================
// G11.1 DISTANCE B TESTS
// ============================================

describe('G11.1 Distance B Validation', () => {
  it('should PASS when Distance B is exactly 24mm', () => {
    const points = [
      createCamPoint('cam-1', 24, 'TOP_LEFT'),
    ];

    const issues = ruleG11_DistanceB(points);

    expect(issues.length).toBe(0);
  });

  it('should PASS when Distance B is within tolerance (24mm ± 1mm)', () => {
    const points = [
      createCamPoint('cam-1', 24.5, 'TOP_LEFT'),
      createCamPoint('cam-2', 23.5, 'TOP_RIGHT'),
    ];

    const issues = ruleG11_DistanceB(points);

    expect(issues.length).toBe(0);
  });

  it('should PASS for alternate Distance B (34mm) when allowed', () => {
    const points = [
      createCamPoint('cam-1', 34, 'TOP_LEFT'),
    ];

    const issues = ruleG11_DistanceB(points, { allowAlternateDistanceB: true });

    expect(issues.length).toBe(0);
  });

  it('should WARN when Distance B is slightly out of tolerance', () => {
    const points = [
      createCamPoint('cam-1', 26, 'TOP_LEFT'), // 2mm off
    ];

    const issues = ruleG11_DistanceB(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G11_DISTANCE_B_OUT_OF_TOLERANCE');
  });

  it('should BLOCK when Distance B appears to be from wrong reference', () => {
    const points = [
      createCamPoint('cam-1', 37, 'TOP_LEFT'), // Looks like measured from FRONT (first hole)
    ];

    const issues = ruleG11_DistanceB(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DISTANCE_B_WRONG_REFERENCE');
    expect(issues[0].message).toContain('mate edge');
  });

  it('should skip points without edgeDistance', () => {
    const points = [
      createDrillPoint({
        id: 'cam-1',
        purpose: 'CAM_LOCK',
        connectedPanelRole: 'TOP',
        // No edgeDistance
      }),
    ];

    const issues = ruleG11_DistanceB(points);

    expect(issues.length).toBe(0);
  });
});

// ============================================
// G11.2 DOWEL DEPTH TESTS (v4.0 Side-covers-Top)
// ============================================

describe('G11.2 Dowel Depth Validation', () => {
  // v4.0: SIDE=12mm (face bore), HORIZ=18mm (edge bore)
  it('should PASS when SIDE dowel is 12mm (v4.0 face bore)', () => {
    const points = [
      createDowelPoint('dowel-1', 'LEFT_SIDE', 12, [0, 0, 0]),
    ];

    const issues = ruleG11_DowelDepth(points);

    expect(issues.length).toBe(0);
  });

  it('should PASS when TOP/BOTTOM dowel is 18mm (v4.0 edge bore)', () => {
    const points = [
      createDowelPoint('dowel-1', 'TOP', 18, [0, 0, 0]),
      createDowelPoint('dowel-2', 'BOTTOM', 18, [0, 0, 0]),
    ];

    const issues = ruleG11_DowelDepth(points);

    expect(issues.length).toBe(0);
  });

  it('should BLOCK when SIDE dowel has wrong depth (not 12mm)', () => {
    const points = [
      createDowelPoint('dowel-1', 'LEFT_SIDE', 30, [0, 0, 0]), // Wrong: full 30mm
    ];

    const issues = ruleG11_DowelDepth(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DOWEL_DEPTH_SIDE_WRONG');
    expect(issues[0].context?.expected).toBe(12);  // v4.0: 12mm
    expect(issues[0].context?.measured).toBe(30);
  });

  it('should BLOCK when horizontal dowel has wrong depth (not 18mm)', () => {
    const points = [
      createDowelPoint('dowel-1', 'TOP', 12, [0, 0, 0]), // Wrong: should be 18mm (v4.0)
    ];

    const issues = ruleG11_DowelDepth(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG');
  });

  it('should WARN when depth is close but not exact', () => {
    const points = [
      createDowelPoint('dowel-1', 'LEFT_SIDE', 11.8, [0, 0, 0]), // 0.2mm off from 12mm
    ];

    const issues = ruleG11_DowelDepth(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G11_DOWEL_DEPTH_TOLERANCE');
  });
});

// ============================================
// G11.3 DRILL TYPE TESTS (v4.0 Side-covers-Top)
// ============================================

describe('G11.3 Drill Type Enforcement', () => {
  // v4.0: SIDE panels use FACE_BORE (horizontal X drilling into inner face)
  it('should PASS when SIDE panel uses FACE_BORE (v4.0 horizontal face drilling)', () => {
    const points = [
      createDrillPoint({
        id: 'bolt-1',
        purpose: 'BOLT',
        normal: [-1, 0, 0], // Horizontal X = FACE_BORE on SIDE (v4.0)
        connectedPanelRole: 'LEFT_SIDE',
      }),
    ];

    const issues = ruleG11_DrillType(points);

    expect(issues.length).toBe(0);
  });

  it('should PASS when horizontal panel uses FACE_BORE', () => {
    const points = [
      createCamPoint('cam-1', 24, 'TOP_LEFT'),
    ];

    const issues = ruleG11_DrillType(points);

    expect(issues.length).toBe(0);
  });

  it('should BLOCK when SIDE panel uses EDGE_BORE (wrong type for v4.0)', () => {
    const points = [
      createDrillPoint({
        id: 'bolt-1',
        purpose: 'BOLT',
        normal: [0, 1, 0], // Vertical Y = EDGE_BORE (wrong for SIDE in v4.0)
        connectedPanelRole: 'LEFT_SIDE',
      }),
    ];

    const issues = ruleG11_DrillType(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DRILL_TYPE_SIDE_NOT_FACE');
  });

  it('should BLOCK when horizontal panel uses EDGE_BORE (wrong type)', () => {
    const points = [
      createDrillPoint({
        id: 'cam-1',
        purpose: 'CAM_LOCK',
        normal: [1, 0, 0], // Horizontal X = EDGE_BORE (wrong for CAM on TOP)
        connectedPanelRole: 'TOP',
      }),
    ];

    const issues = ruleG11_DrillType(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DRILL_TYPE_HORIZONTAL_NOT_FACE');
  });
});

// ============================================
// G11.4 MATING ALIGNMENT TESTS (v4.0 Side-covers-Top)
// ============================================

describe('G11.4 Mating Alignment', () => {
  // v4.0: SIDE=12mm, HORIZ=18mm
  it('should PASS when mating dowels align within tolerance', () => {
    const basePairId = 'pair-1-dowel';
    const points = [
      createDowelPoint('dowel-side', 'LEFT_SIDE', 12, [100, 200, 37], `${basePairId}-side`),  // v4.0: 12mm
      createDowelPoint('dowel-top', 'TOP', 18, [100, 200, 37], `${basePairId}-horiz`),        // v4.0: 18mm
    ];

    const issues = ruleG11_MatingAlignment(points);

    expect(issues.length).toBe(0);
  });

  it('should BLOCK when mating dowels misalign beyond tolerance', () => {
    const basePairId = 'pair-1-dowel';
    const points = [
      createDowelPoint('dowel-side', 'LEFT_SIDE', 12, [100, 200, 37], `${basePairId}-side`),  // v4.0: 12mm
      createDowelPoint('dowel-top', 'TOP', 18, [100, 200, 38], `${basePairId}-horiz`),        // 1mm off in Z
    ];

    const issues = ruleG11_MatingAlignment(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_MATING_MISALIGNMENT');
    expect(issues[0].context?.measured).toBeCloseTo(1, 1);
  });

  it('should WARN when mating dowels are near tolerance', () => {
    const basePairId = 'pair-1-dowel';
    const points = [
      createDowelPoint('dowel-side', 'LEFT_SIDE', 12, [100, 200, 37], `${basePairId}-side`),       // v4.0: 12mm
      createDowelPoint('dowel-top', 'TOP', 18, [100, 200, 37.09], `${basePairId}-horiz`),          // 0.09mm off
    ];

    const issues = ruleG11_MatingAlignment(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G11_MATING_NEAR_TOLERANCE');
  });

  it('should skip corners in skipMatingCheck list', () => {
    const basePairId = 'pair-1-dowel';
    const points = [
      createDowelPoint('dowel-side', 'LEFT_SIDE', 12, [100, 200, 37], `${basePairId}-side`),  // v4.0: 12mm
      createDowelPoint('dowel-top', 'TOP', 18, [100, 200, 38], `${basePairId}-horiz`),        // Misaligned
    ];

    points[0].cornerType = 'TOP_LEFT';
    points[1].cornerType = 'TOP_LEFT';

    const issues = ruleG11_MatingAlignment(points, { skipMatingCheck: ['TOP_LEFT'] });

    expect(issues.length).toBe(0);
  });
});

// ============================================
// G11.5 BOLT TIP → CAM CENTER ALIGNMENT TESTS
// ============================================

describe('G11.5 Bolt-CAM Alignment', () => {
  it('should PASS when bolt tip aligns with CAM pocket center', () => {
    // For LEFT_SIDE corner:
    // - BOLT entry: [18, 700, 37] on SIDE inner face
    // - BOLT normal: [-1, 0, 0] → tip extends to [42, 700, 37]
    // - CAM at [42, 706.25, 37] with normal [0, -1, 0]
    // - CAM pocket center at [42, 700, 37] (6.25mm into panel)
    const points: G11DrillPoint[] = [
      createCamPoint('cam-1', 24, 'TOP_LEFT', [42, 706.25, 37]),
      createBoltPoint('bolt-1', 'TOP_LEFT', [18, 700, 37], 'cam-1'),
    ];

    const issues = ruleG11_BoltCamAlignment(points);

    expect(issues.length).toBe(0);
  });

  it('should BLOCK when bolt tip does not reach CAM center (X-axis misalignment)', () => {
    // BOLT at wrong X position - tip won't reach CAM
    // Entry at X=10 instead of X=18 → tip at X=34 instead of X=42
    const points: G11DrillPoint[] = [
      createCamPoint('cam-1', 24, 'TOP_LEFT', [42, 706.25, 37]),
      createBoltPoint('bolt-1', 'TOP_LEFT', [10, 700, 37], 'cam-1'), // 8mm off
    ];

    const issues = ruleG11_BoltCamAlignment(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_BOLT_CAM_MISALIGNMENT');
    // X-axis gap should be 8mm (34mm tip vs 42mm cam center)
    expect(issues[0].context?.deltaX).toBeCloseTo(8, 0);
  });

  it('should WARN when bolt tip is near tolerance limit', () => {
    // BOLT slightly off - tip X = 42.09 (within tolerance but near limit)
    // Entry at X=18.09 → tip at X=42.09
    const points: G11DrillPoint[] = [
      createCamPoint('cam-1', 24, 'TOP_LEFT', [42, 706.25, 37]),
      createBoltPoint('bolt-1', 'TOP_LEFT', [18.09, 700, 37], 'cam-1'),
    ];

    const issues = ruleG11_BoltCamAlignment(points);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G11_BOLT_CAM_NEAR_TOLERANCE');
  });

  it('should skip bolt without paired CAM', () => {
    const points: G11DrillPoint[] = [
      createBoltPoint('bolt-1', 'TOP_LEFT', [18, 700, 37]), // No pairedHoleId
    ];

    const issues = ruleG11_BoltCamAlignment(points);

    expect(issues.length).toBe(0); // No validation without paired CAM
  });
});

// ============================================
// INTEGRATED TESTS
// ============================================

describe('runG11Rules (Integrated)', () => {
  it('should PASS for correctly configured minifix assembly (v4.0)', () => {
    // G11.5: Bolt Tip must align with CAM Pocket Center
    //
    // For LEFT_SIDE corner with Side-covers-Top construction:
    // - BOLT entry: [18, 700, 37] on LEFT_SIDE inner face
    // - BOLT normal: [-1, 0, 0] (drilling left into panel)
    // - BOLT tip = entry + 24mm × [+1, 0, 0] = [42, 700, 37]
    //
    // - CAM entry: [42, 706.25, 37] on TOP panel face
    // - CAM normal: [0, -1, 0] (drilling down into panel)
    // - CAM pocket center = entry + 6.25mm × [0, -1, 0] = [42, 700, 37]
    //
    // Both align at [42, 700, 37] ✓

    const points: G11DrillPoint[] = [
      // CAM at correct Distance B with aligned position
      // Y = 700 + 6.25 = 706.25 so pocket center Y = 700
      createCamPoint('cam-1', 24, 'TOP_LEFT', [42, 706.25, 37]),
      // BOLT on side panel (v4.0 face drilling) with aligned position
      createBoltPoint('bolt-1', 'TOP_LEFT', [18, 700, 37], 'cam-1'),
      // Dowels with v4.0 correct depths: SIDE=12mm, HORIZ=18mm
      createDowelPoint('dowel-side', 'LEFT_SIDE', 12, [24, 680, 69]),
      createDowelPoint('dowel-top', 'TOP', 18, [24, 680, 69]),
    ];

    // Link CAM to BOLT
    points[0].pairedHoleId = 'bolt-1';

    // Set up pairId for mating check
    points[2].pairId = 'pair-1-dowel-side';
    points[3].pairId = 'pair-1-dowel-horiz';

    const result = runG11Rules(points);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });

  it('should FAIL and report multiple issues for misconfigured assembly', () => {
    const points: G11DrillPoint[] = [
      // CAM with wrong Distance B (measured from front)
      createCamPoint('cam-1', 37, 'TOP_LEFT'),
      // Dowel with wrong depth (full 30mm on SIDE, should be 12mm in v4.0)
      createDowelPoint('dowel-side', 'LEFT_SIDE', 30, [24, 680, 69]),
    ];

    const result = runG11Rules(points);

    expect(result.status).toBe('FAIL');
    expect(result.summary.blockers).toBeGreaterThan(0);
    expect(result.issues.some(i => i.code === 'B_G11_DISTANCE_B_WRONG_REFERENCE')).toBe(true);
    expect(result.issues.some(i => i.code === 'B_G11_DOWEL_DEPTH_SIDE_WRONG')).toBe(true);
  });

  it('should respect custom policy tolerances', () => {
    const points: G11DrillPoint[] = [
      createCamPoint('cam-1', 26, 'TOP_LEFT'), // 2mm off standard
    ];

    // With default policy (1mm tolerance), this should warn
    const defaultResult = runG11Rules(points);
    expect(defaultResult.summary.warnings).toBeGreaterThan(0);

    // With relaxed policy (3mm tolerance), this should pass
    const relaxedResult = runG11Rules(points, [], { dimensionBTolerance: 3 });
    expect(relaxedResult.summary.warnings).toBe(0);
  });
});

// ============================================
// CONSTANTS TESTS (v4.0 Side-covers-Top)
// ============================================

describe('G11_CONSTANTS', () => {
  it('should have correct Häfele standard values', () => {
    expect(G11_CONSTANTS.SYSTEM32_PITCH).toBe(32);
    expect(G11_CONSTANTS.SYSTEM32_FIRST_HOLE).toBe(37);
    expect(G11_CONSTANTS.DIMENSION_B_STANDARD).toBe(24);
    // v4.0 depths
    expect(G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE).toBe(12);   // v4.0: SIDE=12mm face bore
    expect(G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE).toBe(18);  // v4.0: HORIZ=18mm edge bore
    // Legacy constants (for backward compatibility)
    expect(G11_CONSTANTS.DOWEL_DEPTH_EDGE).toBe(18);
    expect(G11_CONSTANTS.DOWEL_DEPTH_FACE).toBe(12);
    expect(G11_CONSTANTS.DOWEL_TOTAL_LENGTH).toBe(30);
    expect(G11_CONSTANTS.MATING_TOLERANCE).toBe(0.1);
  });
});

// ============================================
// S16: OVERLAY CONSTRUCTION TESTS
// (generator OVERLAY branch: side dowel = EDGE_BORE ±Y 18mm,
//  horiz dowel = FACE_BORE ±Y 12mm — คนละ convention กับ INSET v4.0
//  เดิม rule hardcode ตาม role → ด่าตู้ OVERLAY ทุกใบ = false blocker)
// ============================================

function createOverlayDowel(
  id: string,
  panelRole: string,
  depth: number,
  position: [number, number, number],
  pairId?: string
): G11DrillPoint {
  return createDrillPoint({
    id,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    diameter: 8,
    depth,
    position,
    // OVERLAY: ทั้งคู่เจาะแนวดิ่ง (Y) — side เข้า edge บน/ล่าง, horiz เข้า face
    normal: [0, 1, 0],
    connectedPanelRole: panelRole,
    pairId,
  });
}

describe('S16 OVERLAY construction (depth follows bore type)', () => {
  it('passes OVERLAY side dowel: EDGE_BORE (±Y) depth 18mm', () => {
    const issues = ruleG11_DowelDepth([
      createOverlayDowel('d-side', 'LEFT_SIDE', 18, [24, 700, 37]),
    ]);
    expect(issues.length).toBe(0);
  });

  it('passes OVERLAY horizontal dowel: FACE_BORE (±Y) depth 12mm', () => {
    const issues = ruleG11_DowelDepth([
      createOverlayDowel('d-horiz', 'TOP', 12, [24, 700, 37]),
    ]);
    expect(issues.length).toBe(0);
  });

  it('still blocks OVERLAY side EDGE bore with wrong depth (12 ≠ 18)', () => {
    const issues = ruleG11_DowelDepth([
      createOverlayDowel('d-side', 'LEFT_SIDE', 12, [24, 700, 37]),
    ]);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].context?.expected).toBe(18);
  });

  it('mating: อนุญาต offset ตามแกน dowel (ความหนาแผ่น) แต่จับ drift ตั้งฉาก', () => {
    const base = 'pair-ov-dowel';
    // ห่างกัน 19.6mm ตามแกน Y (แกน dowel) = geometry ปกติ
    const ok = ruleG11_MatingAlignment([
      createOverlayDowel('d-side', 'LEFT_SIDE', 18, [24, 719.6, 37], `${base}-side`),
      createOverlayDowel('d-horiz', 'TOP', 12, [24, 700, 37], `${base}-horiz`),
    ]);
    expect(ok.length).toBe(0);

    // เพี้ยน 1mm ในแกน Z (ตั้งฉากกับ dowel) = misalignment จริง
    const bad = ruleG11_MatingAlignment([
      createOverlayDowel('d-side2', 'LEFT_SIDE', 18, [24, 719.6, 38], `${base}2-side`),
      createOverlayDowel('d-horiz2', 'TOP', 12, [24, 700, 37], `${base}2-horiz`),
    ]);
    expect(bad.length).toBe(1);
    expect(bad[0].code).toBe('B_G11_MATING_MISALIGNMENT');
    expect(bad[0].context?.measured).toBeCloseTo(1, 1);
  });

  it('drill type: คู่ dowel ที่เป็น FACE ทั้งคู่ = blocker (ประกอบไม่ได้)', () => {
    const base = 'pair-bad-dowel';
    const issues = ruleG11_DrillType([
      // side ใช้ normal ±X (FACE ใน convention side) + horiz ใช้ ±Y (FACE) → FACE+FACE
      createDrillPoint({
        id: 'd-side', purpose: 'DOWEL', componentType: 'DOWEL', diameter: 8, depth: 12,
        position: [24, 700, 37], normal: [1, 0, 0], connectedPanelRole: 'LEFT_SIDE',
        pairId: `${base}-side`,
      }),
      createDrillPoint({
        id: 'd-horiz', purpose: 'DOWEL', componentType: 'DOWEL', diameter: 8, depth: 12,
        position: [24, 700, 37], normal: [0, 1, 0], connectedPanelRole: 'TOP',
        pairId: `${base}-horiz`,
      }),
    ]);
    expect(issues.length).toBe(1);
    expect(issues[0].context?.purpose).toBe('DOWEL');
  });

  it('drill type: คู่ dowel EDGE+FACE ถูกต้อง — ไม่ด่า (ทั้ง OVERLAY และ INSET)', () => {
    const overlay = ruleG11_DrillType([
      createOverlayDowel('d-side', 'LEFT_SIDE', 18, [24, 719.6, 37], 'p1-side'),   // EDGE
      createOverlayDowel('d-horiz', 'TOP', 12, [24, 700, 37], 'p1-horiz'),          // FACE
    ]);
    expect(overlay.length).toBe(0);
  });
});
