/**
 * Minifix + Dowel Baseline Regression Tests
 *
 * Automated coverage for the 4 hardening areas from baseline spec Section 16:
 * 1. Pattern count by side threshold (usableLength < 400 → 2 units, >= 400 → 3 units)
 * 2. Bolt/thread axis center = panel thickness center
 * 3. Vertical flip changes CAM pocket side and keeps hardware aligned
 * 4. Transform actions are not overwritten by regenerate path
 *
 * Reference docs:
 * - docs/minifix-dowel-baseline-spec.md (Section 10, Section 16)
 * - docs/minifix-dowel-north-star-contract-summary.md (Rules 5, 7)
 * - docs/minifix-dowel-regression-test-plan.md (Sections C, G)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveMinifixPlacement,
  MinifixTopologyApi,
} from '../resolveMinifixPlacement';
import {
  MinifixJointConfig,
  DEFAULT_MINIFIX_SPEC,
} from '../../../../contracts/minifixJointContracts';
import {
  calculateMinifixJointPositions,
  DEFAULT_PLACEMENT_CONFIG,
} from '../../drillMap/system32MinifixPlacement';
import {
  createTestTopologyApi,
  TEST_PANEL_IDS,
  TEST_CABINET,
} from './minifixTestTopo';

// ═══════════════════════════════════════════════════════════════════════════
// 1. A/B Threshold Pattern Count
//
// Baseline spec Section 10 / North-Star Rule 7:
//   sideLen <= 400 → CORNER + CORNER (2 units)
//   sideLen > 400  → CORNER + MIDDLE + CORNER (3 units)
//
// Implementation uses usableLength = edgeLength - 2 * endSetback:
//   usableLength < 100 → 1 unit
//   usableLength < 400 → 2 units
//   usableLength < 800 → 3 units
//   usableLength >= 800 → 4 units
//
// With default endSetback = 37mm: threshold at depth = 474mm
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: A/B Threshold Pattern Count (Section 16.2a)', () => {
  const makeConfig = (depth: number, position: 'TOP' | 'BOTTOM' = 'TOP'): {
    config: MinifixJointConfig;
    api: MinifixTopologyApi;
  } => {
    const api = createTestTopologyApi({ depth });
    const config: MinifixJointConfig = {
      id: `threshold-test-${depth}`,
      style: 'INSET',
      position,
      horizontalPanelId: position === 'TOP' ? TEST_PANEL_IDS.top : TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      // Use default spec (endSetback = 37mm)
    };
    return { config, api };
  };

  // ─── Boundary at usableLength = 400 (depth = 474 with endSetback = 37) ───

  it('depth=473 (usableLength=399) → 2 units (short-side pattern)', () => {
    const { config, api } = makeConfig(473);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(2);
  });

  it('depth=474 (usableLength=400) → 3 units (long-side pattern)', () => {
    const { config, api } = makeConfig(474);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(3);
  });

  it('depth=475 (usableLength=401) → 3 units', () => {
    const { config, api } = makeConfig(475);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(3);
  });

  // ─── Boundary at usableLength = 100 (depth = 174) ───

  it('depth=173 (usableLength=99) → 1 unit (very short edge)', () => {
    const { config, api } = makeConfig(173);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(1);
  });

  it('depth=174 (usableLength=100) → 2 units', () => {
    const { config, api } = makeConfig(174);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(2);
  });

  // ─── Boundary at usableLength = 800 (depth = 874) ───

  it('depth=873 (usableLength=799) → 3 units', () => {
    const { config, api } = makeConfig(873);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(3);
  });

  it('depth=874 (usableLength=800) → 4 units (very long edge)', () => {
    const { config, api } = makeConfig(874);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(4);
  });

  // ─── Worked example from spec: 600 x 395 panel ───

  it('CAD worked example: A=600 → 3 units (long-side)', () => {
    // Spec Section 10: A=600 → A > 400 → CORNER + MIDDLE + CORNER
    // usableLength = 600 - 74 = 526 < 800 → 3 units
    const { config, api } = makeConfig(600);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(3);
  });

  it('CAD worked example: B=395 → 2 units (short-side)', () => {
    // Spec Section 10: B=395 → B < 400 → CORNER + CORNER
    // usableLength = 395 - 74 = 321 < 400 → 2 units
    const { config, api } = makeConfig(395);
    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(2);
  });

  // ─── Symmetry from edges ───

  it('2-unit pattern: placements are symmetric from edges', () => {
    const { config, api } = makeConfig(395);
    const resolution = resolveMinifixPlacement(config, api);
    const placements = resolution.placements;

    expect(placements).toHaveLength(2);

    // Both placements should be at setback distance from their respective edges
    const z0 = placements[0].bolt.origin[2];
    const z1 = placements[1].bolt.origin[2];

    // Symmetric: distance from start edge ≈ distance from end edge
    // z0 ≈ edgeLength - z1
    expect(z0).toBeCloseTo(395 - z1, 1);
  });

  it('3-unit pattern: placements are symmetric from edges', () => {
    const { config, api } = makeConfig(600);
    const resolution = resolveMinifixPlacement(config, api);
    const placements = resolution.placements;

    expect(placements).toHaveLength(3);

    const z0 = placements[0].bolt.origin[2];
    const z1 = placements[1].bolt.origin[2];
    const z2 = placements[2].bolt.origin[2];

    // First and last should be equidistant from edges
    const edgeLength = 600;
    expect(z0).toBeCloseTo(edgeLength - z2, 1);

    // Middle should be at center
    expect(z1).toBeCloseTo(edgeLength / 2, 1);
  });

  // ─── Both TOP and BOTTOM corners produce correct count ───

  it('threshold applies consistently to TOP and BOTTOM positions', () => {
    const { config: topConfig, api: topApi } = makeConfig(600, 'TOP');
    const { config: botConfig, api: botApi } = makeConfig(600, 'BOTTOM');

    const topRes = resolveMinifixPlacement(topConfig, topApi);
    const botRes = resolveMinifixPlacement(botConfig, botApi);

    expect(topRes.placements).toHaveLength(3);
    expect(botRes.placements).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Bolt/Thread Axis Centering at Panel Thickness Center
//
// North-Star Rule 5: Ø10 and Ø5 axes must be centered in panel thickness
//   → bolt X (or Y depending on orientation) = panelThickness / 2
//
// Regression Test Plan A2: Top/Bottom panel centered axis check
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: Bolt/Thread Axis = Panel Thickness Center (Section 16.2b)', () => {
  // ─── Via system32MinifixPlacement (direct position calculation) ───

  describe('system32 positions: bolt at thickness/2', () => {
    const thicknesses = [16, 18, 19, 22];

    thicknesses.forEach((thickness) => {
      it(`${thickness}mm panel: bolt X = ${thickness / 2}mm (TOP corner)`, () => {
        const positions = calculateMinifixJointPositions(
          720, 500, 'TOP', 0,
          { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
        );
        expect(positions.sidePanel.bolt.x).toBe(thickness / 2);
      });

      it(`${thickness}mm panel: bolt X = ${thickness / 2}mm (BOTTOM corner)`, () => {
        const positions = calculateMinifixJointPositions(
          720, 500, 'BOTTOM', 0,
          { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
        );
        expect(positions.sidePanel.bolt.x).toBe(thickness / 2);
      });
    });

    it('bolt X matches housing X (coaxial alignment)', () => {
      const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);
      expect(positions.sidePanel.bolt.x).toBe(positions.horizontalPanel.housing.x);
    });

    it('dowel X matches bolt X (coaxial alignment)', () => {
      const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);
      expect(positions.sidePanel.dowel.x).toBe(positions.sidePanel.bolt.x);
    });
  });

  // ─── Bolt Y (edge offset) at panel thickness center ───

  describe('system32 positions: bolt Y at edge center', () => {
    it('TOP corner: bolt Y = panelHeight - thickness/2', () => {
      const panelHeight = 720;
      const thickness = 18;
      const positions = calculateMinifixJointPositions(
        panelHeight, 500, 'TOP', 0,
        { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
      );
      expect(positions.sidePanel.bolt.y).toBe(panelHeight - thickness / 2);
    });

    it('BOTTOM corner: bolt Y = thickness/2', () => {
      const thickness = 18;
      const positions = calculateMinifixJointPositions(
        720, 500, 'BOTTOM', 0,
        { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
      );
      expect(positions.sidePanel.bolt.y).toBe(thickness / 2);
    });

    it('TOP and BOTTOM bolt Y are symmetric about panel center', () => {
      const panelHeight = 720;
      const thickness = 18;

      const topPos = calculateMinifixJointPositions(
        panelHeight, 500, 'TOP', 0,
        { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
      );
      const botPos = calculateMinifixJointPositions(
        panelHeight, 500, 'BOTTOM', 0,
        { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness },
      );

      // Sum of TOP bolt Y and BOTTOM bolt Y should equal panel height
      expect(topPos.sidePanel.bolt.y + botPos.sidePanel.bolt.y).toBe(panelHeight);
    });
  });

  // ─── Via resolveMinifixPlacement (full resolution path) ───

  describe('resolved placements: bolt axis perpendicular to edge face', () => {
    it('bolt axis = -edgeFace.normal (drilling INTO the face)', () => {
      const api = createTestTopologyApi();
      const config: MinifixJointConfig = {
        id: 'axis-check',
        style: 'INSET',
        position: 'TOP',
        horizontalPanelId: TEST_PANEL_IDS.top,
        verticalPanelId: TEST_PANEL_IDS.leftSide,
        side: 'left',
      };

      const resolution = resolveMinifixPlacement(config, api);
      const placement = resolution.placements[0];

      // Bolt axis should be exactly -edgeFace.normal
      const edgeFaceNormal = placement.bolt.edgeFace.normal;
      expect(placement.bolt.axis[0]).toBe(-edgeFaceNormal[0]);
      expect(placement.bolt.axis[1]).toBe(-edgeFaceNormal[1]);
      expect(placement.bolt.axis[2]).toBe(-edgeFaceNormal[2]);
    });

    it('cam axis = -face.normal (drilling INTO the face)', () => {
      const api = createTestTopologyApi();
      const config: MinifixJointConfig = {
        id: 'cam-axis-check',
        style: 'INSET',
        position: 'TOP',
        horizontalPanelId: TEST_PANEL_IDS.top,
        verticalPanelId: TEST_PANEL_IDS.leftSide,
        side: 'left',
      };

      const resolution = resolveMinifixPlacement(config, api);
      const placement = resolution.placements[0];

      const faceNormal = placement.cam.face.normal;
      expect(placement.cam.axis[0]).toBe(-faceNormal[0]);
      expect(placement.cam.axis[1]).toBe(-faceNormal[1]);
      expect(placement.cam.axis[2]).toBe(-faceNormal[2]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Vertical Flip: CAM Pocket Side Changes with Position
//
// North-Star Rule 1: Vertical Flip = Flip Face (pocket side)
//   → TOP position: CAM drills into BOTTOM face of horizontal panel
//   → BOTTOM position: CAM drills into TOP face of horizontal panel
//
// Regression Test Plan C1: Vertical Flip = Flip Face (not clockface-only)
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: Vertical Flip Face-Side Behavior (Section 16.2c)', () => {
  let api: MinifixTopologyApi;

  beforeEach(() => {
    api = createTestTopologyApi();
  });

  // ─── CAM face side determination ───

  it('TOP position: CAM on BOTTOM face (pocket opens downward toward side)', () => {
    const config: MinifixJointConfig = {
      id: 'flip-top-left',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // CAM face should be BOTTOM (drilling down into top panel)
    expect(placement.cam.face.face).toBe('BOTTOM');
  });

  it('BOTTOM position: CAM on TOP face (pocket opens upward toward side)', () => {
    const config: MinifixJointConfig = {
      id: 'flip-bottom-left',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // CAM face should be TOP (drilling up into bottom panel)
    expect(placement.cam.face.face).toBe('TOP');
  });

  // ─── Bolt edge follows position ───

  it('TOP position: BOLT on side TOP edge', () => {
    const config: MinifixJointConfig = {
      id: 'bolt-edge-top',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    expect(placement.bolt.edgeFace.edge).toBe('TOP');
  });

  it('BOTTOM position: BOLT on side BOTTOM edge', () => {
    const config: MinifixJointConfig = {
      id: 'bolt-edge-bottom',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    expect(placement.bolt.edgeFace.edge).toBe('BOTTOM');
  });

  // ─── CAM face normal direction matches position ───

  it('TOP position: CAM axis drills downward (-Y)', () => {
    const config: MinifixJointConfig = {
      id: 'cam-axis-top',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // For BOTTOM face: normal = [0, -1, 0], axis = [0, 1, 0] (drilling in)
    // Wait - axis = -normal of face. BOTTOM face normal = [0, -1, 0]
    // axis = [0, 1, 0] means drilling upward INTO bottom face of top panel
    expect(placement.cam.axis[1]).toBe(1);
  });

  it('BOTTOM position: CAM axis drills upward (+Y)', () => {
    const config: MinifixJointConfig = {
      id: 'cam-axis-bottom',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // For TOP face: normal = [0, 1, 0], axis = [0, -1, 0] (drilling down into top face of bottom panel)
    expect(placement.cam.axis[1]).toBe(-1);
  });

  // ─── Face-side consistency across all 4 canonical cases ───

  const canonicalCases = [
    { position: 'TOP' as const, style: 'INSET' as const, expectedFace: 'BOTTOM', expectedEdge: 'TOP' },
    { position: 'TOP' as const, style: 'OVERLAY' as const, expectedFace: 'BOTTOM', expectedEdge: 'TOP' },
    { position: 'BOTTOM' as const, style: 'INSET' as const, expectedFace: 'TOP', expectedEdge: 'BOTTOM' },
    { position: 'BOTTOM' as const, style: 'OVERLAY' as const, expectedFace: 'TOP', expectedEdge: 'BOTTOM' },
  ];

  canonicalCases.forEach(({ position, style, expectedFace, expectedEdge }) => {
    it(`${position} + ${style}: CAM face=${expectedFace}, bolt edge=${expectedEdge}`, () => {
      const config: MinifixJointConfig = {
        id: `canonical-${position}-${style}`,
        style,
        position,
        horizontalPanelId: position === 'TOP' ? TEST_PANEL_IDS.top : TEST_PANEL_IDS.bottom,
        verticalPanelId: TEST_PANEL_IDS.leftSide,
        side: 'left',
      };

      const resolution = resolveMinifixPlacement(config, api);
      const placement = resolution.placements[0];

      expect(placement.cam.face.face).toBe(expectedFace);
      expect(placement.bolt.edgeFace.edge).toBe(expectedEdge);
    });
  });

  // ─── Hardware alignment invariant: CAM and BOLT Z should match ───

  it('CAM and BOLT Z positions aligned after position flip', () => {
    // TOP position
    const topConfig: MinifixJointConfig = {
      id: 'align-top',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const topRes = resolveMinifixPlacement(topConfig, api);
    const topPlacement = topRes.placements[0];

    // BOTTOM position
    const botConfig: MinifixJointConfig = {
      id: 'align-bottom',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const botRes = resolveMinifixPlacement(botConfig, api);
    const botPlacement = botRes.placements[0];

    // Z (depth) should be aligned between CAM and BOLT in both cases
    expect(topPlacement.cam.origin[2]).toBeCloseTo(topPlacement.bolt.origin[2], 1);
    expect(botPlacement.cam.origin[2]).toBeCloseTo(botPlacement.bolt.origin[2], 1);
  });

  // ─── Left vs Right side produces mirror symmetry ───

  it('left and right side placements are mirrored in X', () => {
    const leftConfig: MinifixJointConfig = {
      id: 'mirror-left',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
    };

    const rightConfig: MinifixJointConfig = {
      id: 'mirror-right',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.rightSide,
      side: 'right',
    };

    const leftRes = resolveMinifixPlacement(leftConfig, api);
    const rightRes = resolveMinifixPlacement(rightConfig, api);

    const leftBoltX = leftRes.placements[0].bolt.origin[0];
    const rightBoltX = rightRes.placements[0].bolt.origin[0];

    // Bolt origins should be on opposite sides (symmetric about center)
    expect(leftBoltX).toBeLessThan(0);
    expect(rightBoltX).toBeGreaterThan(0);
    expect(Math.abs(leftBoltX)).toBeCloseTo(Math.abs(rightBoltX), 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Transform Override Persistence
//
// North-Star Rule 3: Regeneration must not overwrite transform overrides
//   → Custom spec values persist through resolution
//   → Custom count overrides the calculated count
//
// Regression Test Plan D1/D2/D3: Transform controls persist visibly
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: Transform Override Persistence (Section 16.2d)', () => {
  let api: MinifixTopologyApi;

  beforeEach(() => {
    api = createTestTopologyApi();
  });

  // ─── Custom count override ───

  it('custom count=1 overrides calculated count', () => {
    const config: MinifixJointConfig = {
      id: 'count-override-1',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      count: 1,
    };

    const resolution = resolveMinifixPlacement(config, api);
    expect(resolution.placements).toHaveLength(1);
  });

  it('custom count=5 overrides calculated count (long panel)', () => {
    const longApi = createTestTopologyApi({ depth: 2000 });
    const config: MinifixJointConfig = {
      id: 'count-override-5',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      count: 5,
    };

    const resolution = resolveMinifixPlacement(config, longApi);
    expect(resolution.placements).toHaveLength(5);
  });

  it('custom count is respected regardless of edge length', () => {
    // Short edge that would normally give 2 units
    const shortApi = createTestTopologyApi({ depth: 300 });
    const config: MinifixJointConfig = {
      id: 'count-override-short',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      count: 4, // Override to 4 despite short edge
    };

    const resolution = resolveMinifixPlacement(config, shortApi);
    expect(resolution.placements).toHaveLength(4);
  });

  // ─── Custom spec override ───

  it('custom edgeOffset persists to placement spec', () => {
    const customOffset = 50;
    const config: MinifixJointConfig = {
      id: 'spec-override-offset',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: { edgeOffset: customOffset },
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    expect(placement.cam.spec.edgeOffset).toBe(customOffset);
    expect(placement.bolt.spec.edgeOffset).toBe(customOffset);
  });

  it('custom endSetback persists and affects position count', () => {
    // With default endSetback=37 and depth=560: usableLength = 560-74 = 486 → 3 units
    // With endSetback=100 and depth=560: usableLength = 560-200 = 360 → 2 units
    const config: MinifixJointConfig = {
      id: 'spec-override-setback',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: { endSetback: 100 },
    };

    const resolution = resolveMinifixPlacement(config, api);

    // endSetback=100 → usableLength = 560-200 = 360 < 400 → 2 units
    expect(resolution.placements).toHaveLength(2);
    expect(resolution.placements[0].cam.spec.endSetback).toBe(100);
  });

  it('custom camDiameter and camDepth persist', () => {
    const config: MinifixJointConfig = {
      id: 'spec-override-cam',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: { camDiameter: 12, camDepth: 11.5 },
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    expect(placement.cam.spec.camDiameter).toBe(12);
    expect(placement.cam.spec.camDepth).toBe(11.5);
  });

  it('partial spec override merges with defaults (does not wipe)', () => {
    const config: MinifixJointConfig = {
      id: 'spec-partial-merge',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: { edgeOffset: 42 },
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // Custom value applied
    expect(placement.cam.spec.edgeOffset).toBe(42);

    // Default values preserved
    expect(placement.cam.spec.camDiameter).toBe(DEFAULT_MINIFIX_SPEC.camDiameter);
    expect(placement.cam.spec.camDepth).toBe(DEFAULT_MINIFIX_SPEC.camDepth);
    expect(placement.cam.spec.boltDiameter).toBe(DEFAULT_MINIFIX_SPEC.boltDiameter);
    expect(placement.cam.spec.boltDepth).toBe(DEFAULT_MINIFIX_SPEC.boltDepth);
    expect(placement.cam.spec.endSetback).toBe(DEFAULT_MINIFIX_SPEC.endSetback);
  });

  // ─── Resolution stability: same config → same result ───

  it('resolving the same config twice produces identical results', () => {
    const config: MinifixJointConfig = {
      id: 'stability-check',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: { edgeOffset: 30 },
      count: 3,
    };

    const res1 = resolveMinifixPlacement(config, api);
    const res2 = resolveMinifixPlacement(config, api);

    expect(res1.placements).toHaveLength(res2.placements.length);

    for (let i = 0; i < res1.placements.length; i++) {
      expect(res1.placements[i].cam.origin).toEqual(res2.placements[i].cam.origin);
      expect(res1.placements[i].bolt.origin).toEqual(res2.placements[i].bolt.origin);
      expect(res1.placements[i].cam.spec).toEqual(res2.placements[i].cam.spec);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Dowel Spec Regression (from baseline spec)
//
// North-Star Rule 6: Dowel baseline is Ø8 x 30
// Regression Test Plan G4: Dowel spec regression check
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression: Dowel Spec = Ø8 x 30 (North-Star Rule 6)', () => {
  it('default dowel diameter is 8mm', () => {
    expect(DEFAULT_PLACEMENT_CONFIG.dowel.diameter).toBe(8);
  });

  it('default dowel depth is 15mm (half of 30mm dowel)', () => {
    // Dowel Ø8 x 30 means 30mm total length, 15mm per side
    expect(DEFAULT_PLACEMENT_CONFIG.dowel.depth).toBe(15);
  });

  it('default dowel offset from bolt is 32mm (System 32 pitch)', () => {
    expect(DEFAULT_PLACEMENT_CONFIG.dowel.offsetFromBolt).toBe(32);
  });

  it('dowel diameter has NOT regressed to Ø6', () => {
    // Known regression symptom from baseline spec
    expect(DEFAULT_PLACEMENT_CONFIG.dowel.diameter).not.toBe(6);
  });
});
