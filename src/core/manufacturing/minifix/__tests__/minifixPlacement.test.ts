/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Unit Tests - 4 Canonical Cases + Negative Cases
 *
 * Tests the placement resolver and validation guards
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveMinifixPlacement,
  MinifixTopologyApi,
} from '../resolveMinifixPlacement';
import {
  validatePlacement,
  validateCamAxis,
  validateBoltAxis,
  validatePanelRoles,
  isPerpendicular,
  isParallel,
} from '../../../../contracts/minifixJointGuards';
import {
  MinifixJointConfig,
  MinifixPlacement,
} from '../../../../contracts/minifixJointContracts';
import {
  createTestTopologyApi,
  TEST_PANEL_IDS,
  TEST_SPEC_MINIFIX_15,
} from './minifixTestTopo';

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('Minifix Placement - 4 Canonical Cases', () => {
  let api: MinifixTopologyApi;

  beforeEach(() => {
    api = createTestTopologyApi();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 1: TOP + INSET
  // ─────────────────────────────────────────────────────────────────────────

  it('TOP + INSET: CAM on TOP panel bottom face, BOLT on side TOP edge', () => {
    const config: MinifixJointConfig = {
      id: 'test-top-inset-left',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBeGreaterThan(0);
    expect(resolution.validation.valid).toBe(true);

    const placement = resolution.placements[0];

    // CAM should be on TOP panel
    expect(placement.cam.panelRole).toBe('TOP');
    expect(placement.cam.face.panelId).toBe(TEST_PANEL_IDS.top);

    // BOLT should be on LEFT_SIDE panel's TOP edge
    expect(placement.bolt.panelRole).toBe('LEFT_SIDE');
    expect(placement.bolt.edge!.panelId).toBe(TEST_PANEL_IDS.leftSide);
    expect(placement.bolt.edge!.edge).toBe('TOP');

    // Validate placement
    const validation = validatePlacement(placement);
    expect(validation.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 2: TOP + OVERLAY
  // ─────────────────────────────────────────────────────────────────────────

  it('TOP + OVERLAY: CAM on TOP panel bottom face, BOLT on side TOP edge', () => {
    const config: MinifixJointConfig = {
      id: 'test-top-overlay-right',
      style: 'OVERLAY',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.rightSide,
      side: 'right',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBeGreaterThan(0);
    expect(resolution.validation.valid).toBe(true);

    const placement = resolution.placements[0];

    // CAM on TOP panel
    expect(placement.cam.panelRole).toBe('TOP');

    // BOLT on RIGHT_SIDE TOP edge
    expect(placement.bolt.panelRole).toBe('RIGHT_SIDE');
    expect(placement.bolt.edge!.edge).toBe('TOP');

    // Validate
    const validation = validatePlacement(placement);
    expect(validation.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 3: BOTTOM + INSET
  // ─────────────────────────────────────────────────────────────────────────

  it('BOTTOM + INSET: CAM on BOTTOM panel top face, BOLT on side BOTTOM edge', () => {
    const config: MinifixJointConfig = {
      id: 'test-bottom-inset-left',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBeGreaterThan(0);
    expect(resolution.validation.valid).toBe(true);

    const placement = resolution.placements[0];

    // CAM on BOTTOM panel
    expect(placement.cam.panelRole).toBe('BOTTOM');
    expect(placement.cam.face.panelId).toBe(TEST_PANEL_IDS.bottom);

    // BOLT on LEFT_SIDE BOTTOM edge
    expect(placement.bolt.panelRole).toBe('LEFT_SIDE');
    expect(placement.bolt.edge!.edge).toBe('BOTTOM');

    // Validate
    const validation = validatePlacement(placement);
    expect(validation.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 4: BOTTOM + OVERLAY
  // ─────────────────────────────────────────────────────────────────────────

  it('BOTTOM + OVERLAY: CAM on BOTTOM panel top face, BOLT on side BOTTOM edge', () => {
    const config: MinifixJointConfig = {
      id: 'test-bottom-overlay-right',
      style: 'OVERLAY',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.rightSide,
      side: 'right',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBeGreaterThan(0);
    expect(resolution.validation.valid).toBe(true);

    const placement = resolution.placements[0];

    // CAM on BOTTOM panel
    expect(placement.cam.panelRole).toBe('BOTTOM');

    // BOLT on RIGHT_SIDE BOTTOM edge
    expect(placement.bolt.panelRole).toBe('RIGHT_SIDE');
    expect(placement.bolt.edge!.edge).toBe('BOTTOM');

    // Validate
    const validation = validatePlacement(placement);
    expect(validation.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Negative Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Minifix Placement - Negative Cases', () => {
  let api: MinifixTopologyApi;

  beforeEach(() => {
    api = createTestTopologyApi();
  });

  it('fails if CAM axis is not opposite to face normal', () => {
    const config: MinifixJointConfig = {
      id: 'test-invalid-axis',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // Inject bug: CAM axis points same direction as face normal (wrong!)
    const invalidPlacement: MinifixPlacement = {
      ...placement,
      cam: {
        ...placement.cam,
        axis: placement.cam.face.normal, // Should be OPPOSITE
      },
    };

    const validation = validatePlacement(invalidPlacement);
    expect(validation.valid).toBe(false);

    const issue = validation.issues.find((i) => i.code === 'CAM_AXIS_INVALID');
    expect(issue).toBeDefined();
  });

  it('fails if BOLT axis is not perpendicular to edge direction', () => {
    const config: MinifixJointConfig = {
      id: 'test-invalid-bolt',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // Inject bug: BOLT axis parallel to edge direction (should be perpendicular)
    const invalidPlacement: MinifixPlacement = {
      ...placement,
      bolt: {
        ...placement.bolt,
        axis: placement.bolt.edge!.direction, // Should be perpendicular!
      },
    };

    const validation = validatePlacement(invalidPlacement);
    expect(validation.valid).toBe(false);

    const issue = validation.issues.find((i) => i.code === 'BOLT_AXIS_INVALID');
    expect(issue).toBeDefined();
  });

  it('fails if panel role does not match joint position', () => {
    const config: MinifixJointConfig = {
      id: 'test-invalid-role',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // Inject bug: CAM panel role is BOTTOM but position is TOP
    const invalidPlacement: MinifixPlacement = {
      ...placement,
      cam: {
        ...placement.cam,
        panelRole: 'BOTTOM', // Should be TOP!
      },
    };

    const validation = validatePanelRoles(invalidPlacement);
    expect(validation).not.toBeNull();
    expect(validation?.code).toBe('CAM_PANEL_ROLE_MISMATCH');
  });

  it('fails if CAM and BOLT are too far apart', () => {
    const config: MinifixJointConfig = {
      id: 'test-too-far',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: TEST_PANEL_IDS.top,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);
    const placement = resolution.placements[0];

    // Inject bug: Move bolt origin very far away
    const invalidPlacement: MinifixPlacement = {
      ...placement,
      bolt: {
        ...placement.bolt,
        origin: [9999, 9999, 9999], // Very far!
      },
    };

    const validation = validatePlacement(invalidPlacement);
    expect(validation.valid).toBe(false);

    const issue = validation.issues.find((i) => i.code === 'ALIGNMENT_TOO_FAR');
    expect(issue).toBeDefined();
  });

  it('fails if panel not found in topology', () => {
    const config: MinifixJointConfig = {
      id: 'test-missing-panel',
      style: 'INSET',
      position: 'TOP',
      horizontalPanelId: 'non-existent-panel',
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBe(0);
    expect(resolution.validation.valid).toBe(false);

    const issue = resolution.validation.issues.find(
      (i) => i.code === 'PANEL_NOT_FOUND' || i.code === 'FACE_OR_EDGE_NOT_FOUND'
    );
    expect(issue).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard Function Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Minifix Guard Functions', () => {
  it('isPerpendicular returns true for orthogonal vectors', () => {
    expect(isPerpendicular([1, 0, 0], [0, 1, 0])).toBe(true);
    expect(isPerpendicular([0, 1, 0], [0, 0, 1])).toBe(true);
    expect(isPerpendicular([1, 0, 0], [0, 0, 1])).toBe(true);
  });

  it('isPerpendicular returns false for parallel vectors', () => {
    expect(isPerpendicular([1, 0, 0], [1, 0, 0])).toBe(false);
    expect(isPerpendicular([1, 0, 0], [-1, 0, 0])).toBe(false);
    expect(isPerpendicular([0, 1, 0], [0, 2, 0])).toBe(false);
  });

  it('isParallel returns true for same direction vectors', () => {
    expect(isParallel([1, 0, 0], [1, 0, 0])).toBe(true);
    expect(isParallel([1, 0, 0], [2, 0, 0])).toBe(true);
  });

  it('isParallel returns true for opposite direction vectors', () => {
    expect(isParallel([1, 0, 0], [-1, 0, 0])).toBe(true);
    expect(isParallel([0, 1, 0], [0, -2, 0])).toBe(true);
  });

  it('isParallel returns false for perpendicular vectors', () => {
    expect(isParallel([1, 0, 0], [0, 1, 0])).toBe(false);
    expect(isParallel([1, 0, 0], [0, 0, 1])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Minifix Placement - Edge Cases', () => {
  let api: MinifixTopologyApi;

  beforeEach(() => {
    api = createTestTopologyApi();
  });

  it('generates multiple placements for long edges', () => {
    const config: MinifixJointConfig = {
      id: 'test-multi-placement',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, api);

    // With 560mm depth and 50mm setback, should have 2+ placements
    expect(resolution.placements.length).toBeGreaterThanOrEqual(2);
  });

  it('respects custom count when specified', () => {
    const config: MinifixJointConfig = {
      id: 'test-custom-count',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
      count: 3,
    };

    const resolution = resolveMinifixPlacement(config, api);

    expect(resolution.placements.length).toBe(3);
  });

  it('handles very short edges gracefully', () => {
    // Create API with very short depth
    const shortApi = createTestTopologyApi({ depth: 100 });

    const config: MinifixJointConfig = {
      id: 'test-short-edge',
      style: 'INSET',
      position: 'BOTTOM',
      horizontalPanelId: TEST_PANEL_IDS.bottom,
      verticalPanelId: TEST_PANEL_IDS.leftSide,
      side: 'left',
      spec: TEST_SPEC_MINIFIX_15,
    };

    const resolution = resolveMinifixPlacement(config, shortApi);

    // Should still produce at least 1 placement
    expect(resolution.placements.length).toBeGreaterThanOrEqual(1);
  });
});
