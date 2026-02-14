/**
 * Thickness Propagation Integration Tests
 *
 * CRITICAL SCENARIOS:
 * 1. Back panel material change → carcass depth must update
 * 2. Back panel surface change → carcass depth must update
 *
 * These tests verify the "UI changed → 3D/manufacturing changed" invariant
 * that was broken before the Truth Module implementation.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computePanelTotalThickness,
  computeBackDepthReduction,
  initMaterialRegistries
} from '../../materials/materialThickness';

// ============================================
// TEST MATERIAL CATALOGS (match production)
// ============================================

const TEST_CORE_MATERIALS = {
  'core-mdf-6': { id: 'core-mdf-6', thickness: 6, costPerSqm: 15, co2PerSqm: 2 },
  'core-pb-16': { id: 'core-pb-16', thickness: 16, costPerSqm: 20, co2PerSqm: 3 },
  'core-hmr-18': { id: 'core-hmr-18', thickness: 18, costPerSqm: 35, co2PerSqm: 4 },
};

const TEST_SURFACE_MATERIALS = {
  'surf-mel-white': { id: 'surf-mel-white', thickness: 0.3, costPerSqm: 5, co2PerSqm: 0.5 },
  'surf-hpl-grey': { id: 'surf-hpl-grey', thickness: 0.8, costPerSqm: 12, co2PerSqm: 1 },
};

// ============================================
// SETUP
// ============================================

beforeEach(() => {
  initMaterialRegistries(TEST_CORE_MATERIALS, TEST_SURFACE_MATERIALS);
});

// ============================================
// HELPER: Create panel-like object for testing
// ============================================

function createBackPanel(coreId: string, surfaceId: string) {
  return {
    coreMaterialId: coreId,
    faces: { faceA: surfaceId, faceB: surfaceId }, // 2-side finish
  };
}

// ============================================
// CASE A: Back panel CORE material change → carcass depth update
// ============================================

describe('Back Panel Core Material Change → Carcass Depth Update', () => {
  const D = 560; // Cabinet depth
  const defaultSurfaceId = 'surf-mel-white';

  it('should change carcass depth when back core changes from MDF6 to HMR18', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };

    // BEFORE: MDF 6mm + Melamine 0.3mm × 2 = 6.6mm
    const oldBackPanel = createBackPanel('core-mdf-6', defaultSurfaceId);
    const oldBackTotalT = computePanelTotalThickness(oldBackPanel, defaultSurfaceId);
    const oldBackDepthReduction = computeBackDepthReduction(structure, oldBackPanel, defaultSurfaceId);
    const oldCarcassDepth = D - oldBackDepthReduction;

    expect(oldBackTotalT).toBeCloseTo(6.6, 6);
    expect(oldCarcassDepth).toBeCloseTo(553.4, 6);

    // AFTER: HMR 18mm + Melamine 0.3mm × 2 = 18.6mm
    const newBackPanel = createBackPanel('core-hmr-18', defaultSurfaceId);
    const newBackTotalT = computePanelTotalThickness(newBackPanel, defaultSurfaceId);
    const newBackDepthReduction = computeBackDepthReduction(structure, newBackPanel, defaultSurfaceId);
    const newCarcassDepth = D - newBackDepthReduction;

    expect(newBackTotalT).toBeCloseTo(18.6, 6);
    expect(newCarcassDepth).toBeCloseTo(541.4, 6);

    // Depth MUST have changed
    expect(newCarcassDepth).not.toBe(oldCarcassDepth);
    expect(newCarcassDepth).toBeLessThan(oldCarcassDepth);
  });

  it('should have identical depths if back panel material unchanged', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };
    const backPanel = createBackPanel('core-mdf-6', defaultSurfaceId);

    const depth1 = D - computeBackDepthReduction(structure, backPanel, defaultSurfaceId);
    const depth2 = D - computeBackDepthReduction(structure, backPanel, defaultSurfaceId);

    expect(depth1).toBe(depth2);
  });
});

// ============================================
// CASE B: Back panel SURFACE change → carcass depth update
// ============================================

describe('Back Panel Surface Change → Carcass Depth Update', () => {
  const D = 560;

  it('should change carcass depth when surface changes from Melamine to HPL', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };
    const coreId = 'core-hmr-18'; // 18mm HMR

    // BEFORE: HMR 18mm + Melamine 0.3mm × 2 = 18.6mm
    const oldBackPanel = createBackPanel(coreId, 'surf-mel-white');
    const oldBackTotalT = computePanelTotalThickness(oldBackPanel, 'surf-mel-white');
    const oldBackDepthReduction = computeBackDepthReduction(structure, oldBackPanel, 'surf-mel-white');
    const oldCarcassDepth = D - oldBackDepthReduction;

    expect(oldBackTotalT).toBeCloseTo(18.6, 6);
    expect(oldCarcassDepth).toBeCloseTo(541.4, 6);

    // AFTER: HMR 18mm + HPL 0.8mm × 2 = 19.6mm
    const newBackPanel = createBackPanel(coreId, 'surf-hpl-grey');
    const newBackTotalT = computePanelTotalThickness(newBackPanel, 'surf-hpl-grey');
    const newBackDepthReduction = computeBackDepthReduction(structure, newBackPanel, 'surf-hpl-grey');
    const newCarcassDepth = D - newBackDepthReduction;

    expect(newBackTotalT).toBeCloseTo(19.6, 6);
    expect(newCarcassDepth).toBeCloseTo(540.4, 6);

    // CRITICAL: Even small surface change (0.5mm per side) MUST affect depth
    expect(newCarcassDepth).not.toBe(oldCarcassDepth);
    const expectedDifference = (0.8 - 0.3) * 2; // 1.0mm difference
    expect(oldCarcassDepth - newCarcassDepth).toBeCloseTo(expectedDifference, 6);
  });
});

// ============================================
// CASE C: Z position invariants
// ============================================

describe('Z Position Invariants', () => {
  const D = 560;
  const defaultSurfaceId = 'surf-hpl-grey';

  it('carcassZ should equal backDepthReduction/2 for overlay mode', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };
    const backPanel = createBackPanel('core-hmr-18', defaultSurfaceId);

    const backTotalT = computePanelTotalThickness(backPanel, defaultSurfaceId);
    const backDepthReduction = computeBackDepthReduction(structure, backPanel, defaultSurfaceId);
    const carcassZ = backDepthReduction / 2;

    // backTotalT = 18 + 0.8 × 2 = 19.6mm
    expect(backTotalT).toBeCloseTo(19.6, 6);
    // carcassZ = 19.6 / 2 = 9.8mm
    expect(carcassZ).toBeCloseTo(9.8, 6);
  });

  it('backZ should equal -D/2 + backTotalT/2 for overlay mode', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };
    const backPanel = createBackPanel('core-hmr-18', defaultSurfaceId);

    const backTotalT = computePanelTotalThickness(backPanel, defaultSurfaceId);
    const backZ = -D / 2 + backTotalT / 2;

    // backZ = -280 + 9.8 = -270.2mm
    expect(backZ).toBeCloseTo(-270.2, 6);
  });

  it('carcassZ should be 0 for inset mode', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'inset' as const };
    const backPanel = createBackPanel('core-hmr-18', defaultSurfaceId);

    const backDepthReduction = computeBackDepthReduction(structure, backPanel, defaultSurfaceId);
    const carcassZ = backDepthReduction / 2;

    // Inset mode = no depth reduction = carcassZ = 0
    expect(backDepthReduction).toBe(0);
    expect(carcassZ).toBe(0);
  });
});

// ============================================
// CASE D: No back panel scenarios
// ============================================

describe('No Back Panel Scenarios', () => {
  const D = 560;

  it('should have no depth reduction when hasBackPanel is false', () => {
    const structure = { hasBackPanel: false, backPanelConstruction: 'overlay' as const };

    const backDepthReduction = computeBackDepthReduction(structure, null, 'surf-mel-white');
    const carcassDepth = D - backDepthReduction;

    expect(backDepthReduction).toBe(0);
    expect(carcassDepth).toBe(D);
  });

  it('should have no depth reduction for inset construction', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'inset' as const };
    const backPanel = createBackPanel('core-hmr-18', 'surf-hpl-grey');

    const backDepthReduction = computeBackDepthReduction(structure, backPanel, 'surf-hpl-grey');
    const carcassDepth = D - backDepthReduction;

    expect(backDepthReduction).toBe(0);
    expect(carcassDepth).toBe(D);
  });
});

// ============================================
// REGRESSION: The original bug scenario
// ============================================

describe('REGRESSION: Original Bug Scenario', () => {
  const D = 560;

  it('FIXED: changing back panel from MDF6+Mel to HMR18+HPL MUST change carcass depth', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };

    // Original state: MDF 6mm + Melamine 0.3mm × 2 = 6.6mm
    const originalBackPanel = createBackPanel('core-mdf-6', 'surf-mel-white');
    const originalBackTotalT = computePanelTotalThickness(originalBackPanel, 'surf-mel-white');
    const originalCarcassDepth = D - computeBackDepthReduction(structure, originalBackPanel, 'surf-mel-white');

    // User action: Changed back panel to HMR 18mm + HPL 0.8mm × 2 = 19.6mm
    const newBackPanel = createBackPanel('core-hmr-18', 'surf-hpl-grey');
    const newBackTotalT = computePanelTotalThickness(newBackPanel, 'surf-hpl-grey');
    const newCarcassDepth = D - computeBackDepthReduction(structure, newBackPanel, 'surf-hpl-grey');

    // CRITICAL ASSERTIONS (these would have FAILED before the fix)
    expect(originalBackTotalT).toBeCloseTo(6.6, 6);
    expect(newBackTotalT).toBeCloseTo(19.6, 6);

    // The bug was: carcass depth stayed at 553.4mm even after material change
    // Fixed: carcass depth now changes from 553.4mm to 540.4mm
    expect(originalCarcassDepth).toBeCloseTo(553.4, 6);
    expect(newCarcassDepth).toBeCloseTo(540.4, 6);

    // Delta check: 19.6 - 6.6 = 13.0mm thickness increase → 13.0mm depth decrease
    const thicknessDelta = newBackTotalT - originalBackTotalT;
    const depthDelta = originalCarcassDepth - newCarcassDepth;
    expect(thicknessDelta).toBeCloseTo(depthDelta, 6);
  });
});
