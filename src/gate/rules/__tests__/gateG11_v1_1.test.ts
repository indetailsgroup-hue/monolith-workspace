/**
 * Gate G11 v1.1 — New Rules Unit Tests
 *
 * Tests for G11.6 (N-Center Policy Mode), G11.7 (Double PVC Compensation),
 * and G11.8 (Edge Band Join Forbidden).
 *
 * @see Master Specification v1.1 §7
 */

import { describe, it, expect } from 'vitest';
import {
  ruleG11_NCenterPolicyMode,
  ruleG11_DoublePvcCompensation,
  ruleG11_EdgeBandJoinForbidden,
} from '../gateG11_minifixSystem32';
import type {
  G11DrillPointV11,
  G11PanelWithEdgeBanding,
} from '../gateG11_minifixSystem32';

// ============================================
// HELPERS
// ============================================

function makeDrillPoint(overrides: Partial<G11DrillPointV11> = {}): G11DrillPointV11 {
  return {
    id: 'dp-1',
    panelId: 'panel-1',
    position: [0, 0, 0],
    normal: [0, -1, 0],
    diameter: 15,
    depth: 13.5,
    purpose: 'CAM_LOCK',
    ...overrides,
  };
}

function makePanel(overrides: Partial<G11PanelWithEdgeBanding> = {}): G11PanelWithEdgeBanding {
  return {
    id: 'panel-1',
    role: 'TOP',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    finishWidth: 600,
    finishHeight: 400,
    ...overrides,
  };
}

// ============================================
// G11.6: N-CENTER POLICY MODE CONSISTENCY
// ============================================

describe('G11.6: ruleG11_NCenterPolicyMode', () => {
  it('FINISHED_CENTER + DRILL_ON_FINISHED → no issues', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({
        id: 'dp-fc',
        nCenterPolicy: { base: 'FINISHED_CENTER', offsetMm: -0.8 },
      }),
    ];

    const issues = ruleG11_NCenterPolicyMode(points, 'DRILL_ON_FINISHED');

    expect(issues).toHaveLength(0);
  });

  it('CORE_CENTER + DRILL_ON_CORE → no issues', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({
        id: 'dp-cc',
        nCenterPolicy: { base: 'CORE_CENTER', offsetMm: 0 },
      }),
    ];

    const issues = ruleG11_NCenterPolicyMode(points, 'DRILL_ON_CORE');

    expect(issues).toHaveLength(0);
  });

  it('FINISHED_CENTER + DRILL_ON_CORE → BLOCKER', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({
        id: 'dp-mismatch',
        nCenterPolicy: { base: 'FINISHED_CENTER', offsetMm: -0.8 },
      }),
    ];

    const issues = ruleG11_NCenterPolicyMode(points, 'DRILL_ON_CORE');

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_N_POLICY_MODE_MISMATCH');
  });

  it('CORE_CENTER + DRILL_ON_FINISHED → BLOCKER', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({
        id: 'dp-mismatch2',
        nCenterPolicy: { base: 'CORE_CENTER', offsetMm: 0 },
      }),
    ];

    const issues = ruleG11_NCenterPolicyMode(points, 'DRILL_ON_FINISHED');

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_N_POLICY_MODE_MISMATCH');
  });

  it('no nCenterPolicy → skipped (no issues)', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({ id: 'dp-legacy' }),
    ];

    const issues = ruleG11_NCenterPolicyMode(points, 'DRILL_ON_FINISHED');

    expect(issues).toHaveLength(0);
  });
});

// ============================================
// G11.7: DOUBLE PVC COMPENSATION PREVENTION
// ============================================

describe('G11.7: ruleG11_DoublePvcCompensation', () => {
  it('V=37.0 in FINISHED mode → no issues (correct)', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({ id: 'dp-ok', vCoordinate: 37.0 }),
    ];

    const issues = ruleG11_DoublePvcCompensation(points, 'DRILL_ON_FINISHED', 37, 1.0);

    expect(issues).toHaveLength(0);
  });

  it('V=36.0 in FINISHED mode → BLOCKER (double compensation detected)', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({ id: 'dp-double', vCoordinate: 36.0 }),
    ];

    const issues = ruleG11_DoublePvcCompensation(points, 'DRILL_ON_FINISHED', 37, 1.0);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DOUBLE_PVC_COMPENSATION');
    expect(issues[0].message).toContain('V=36');
  });

  it('V=36.0 in CORE mode → no issues (compensation is correct)', () => {
    const points: G11DrillPointV11[] = [
      makeDrillPoint({ id: 'dp-core', vCoordinate: 36.0 }),
    ];

    const issues = ruleG11_DoublePvcCompensation(points, 'DRILL_ON_CORE', 37, 1.0);

    // Rule only checks FINISHED mode
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// G11.8: EDGE BANDING ON JOIN EDGE FORBIDDEN
// ============================================

describe('G11.8: ruleG11_EdgeBandJoinForbidden', () => {
  it('horizontal panel with LEFT banding → BLOCKER', () => {
    const panels: G11PanelWithEdgeBanding[] = [
      makePanel({
        id: 'top-1',
        role: 'TOP',
        edgeBanding: {
          banded: { TOP: false, BOTTOM: false, LEFT: true, RIGHT: false },
          bandThkMm: 1.0,
        },
      }),
    ];

    const issues = ruleG11_EdgeBandJoinForbidden(panels);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_EDGE_BAND_JOIN_FORBIDDEN');
    expect(issues[0].message).toContain('LEFT');
  });

  it('horizontal panel with LEFT + RIGHT banding → BLOCKER (both violations)', () => {
    const panels: G11PanelWithEdgeBanding[] = [
      makePanel({
        id: 'bottom-1',
        role: 'BOTTOM',
        edgeBanding: {
          banded: { TOP: false, BOTTOM: false, LEFT: true, RIGHT: true },
          bandThkMm: 1.0,
        },
      }),
    ];

    const issues = ruleG11_EdgeBandJoinForbidden(panels);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('LEFT');
    expect(issues[0].message).toContain('RIGHT');
  });

  it('side panel with TOP banding → BLOCKER', () => {
    const panels: G11PanelWithEdgeBanding[] = [
      makePanel({
        id: 'side-1',
        role: 'LEFT_SIDE',
        edgeBanding: {
          banded: { TOP: true, BOTTOM: false, LEFT: false, RIGHT: false },
          bandThkMm: 1.0,
        },
      }),
    ];

    const issues = ruleG11_EdgeBandJoinForbidden(panels);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G11_EDGE_BAND_JOIN_FORBIDDEN');
    expect(issues[0].message).toContain('TOP');
  });

  it('horizontal panel with FRONT/BACK banding only → no issues', () => {
    const panels: G11PanelWithEdgeBanding[] = [
      makePanel({
        id: 'top-2',
        role: 'TOP',
        edgeBanding: {
          banded: { TOP: true, BOTTOM: true, LEFT: false, RIGHT: false },
          bandThkMm: 1.0,
        },
      }),
    ];

    const issues = ruleG11_EdgeBandJoinForbidden(panels);

    // TOP/BOTTOM banding on a horizontal panel is fine (those are the face edges)
    expect(issues).toHaveLength(0);
  });

  it('panel without edge banding → no issues', () => {
    const panels: G11PanelWithEdgeBanding[] = [
      makePanel({ id: 'top-3', role: 'TOP' }),
    ];

    const issues = ruleG11_EdgeBandJoinForbidden(panels);

    expect(issues).toHaveLength(0);
  });
});
