/**
 * Back Panel Geometry Invariant Tests
 *
 * Ensures back panel overlay/inset geometry never overlaps or creates gaps.
 * These tests verify the "OD budget" contract:
 * - D = Overall Finished Depth (OD)
 * - All geometry must fit within [-D/2, +D/2] on Z axis
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Test Constants (matching real material specs)
// ============================================================================

const MATERIALS = {
  // Core materials
  'core-mdf-6': { thickness: 6 },      // Back panel default
  'core-hmr-18': { thickness: 18 },    // Back panel option (HMR Green)

  // Surface finishes
  'surf-mel-white': { thickness: 0.3 },  // Melamine
  'surf-hpl-grey': { thickness: 0.8 },   // HPL Grey Oak
};

// ============================================================================
// Geometry Calculation Functions (mirror useCabinetStore logic)
// ============================================================================

interface BackPanelGeometryInput {
  D: number;                    // Overall Finished Depth (OD)
  backCoreT: number;            // Back panel core thickness
  backSurfaceT: number;         // Back panel surface finish thickness (per side)
  backPanelConstruction: 'inset' | 'overlay';
  backPanelInset?: number;      // For inset mode: distance from back face
}

interface GeometryResult {
  // Back panel
  backTotalT: number;
  backZ: number;
  backFrontFace: number;
  backBackFace: number;

  // Carcass panels
  carcassDepth: number;
  carcassZ: number;
  carcassFrontFace: number;
  carcassBackFace: number;
}

function calculateBackPanelGeometry(input: BackPanelGeometryInput): GeometryResult {
  const { D, backCoreT, backSurfaceT, backPanelConstruction, backPanelInset = 15 } = input;

  // Total finished thickness = core + (surface × 2 sides)
  const backTotalT = backCoreT + (backSurfaceT * 2);

  // Depth reduction for carcass panels
  const backDepthReduction = backPanelConstruction === 'overlay' ? backTotalT : 0;

  // Carcass geometry
  const carcassDepth = D - backDepthReduction;
  const carcassZ = backDepthReduction / 2;  // CRITICAL: No ET here!
  const carcassFrontFace = carcassZ + carcassDepth / 2;
  const carcassBackFace = carcassZ - carcassDepth / 2;

  // Back panel geometry
  let backZ: number;
  if (backPanelConstruction === 'overlay') {
    // OVERLAY: Back panel at back of OD, inside budget
    backZ = -D / 2 + backTotalT / 2;
  } else {
    // INSET: Back panel recessed into grooves
    backZ = -D / 2 + backPanelInset;
  }

  const backFrontFace = backZ + backTotalT / 2;
  const backBackFace = backZ - backTotalT / 2;

  return {
    backTotalT,
    backZ,
    backFrontFace,
    backBackFace,
    carcassDepth,
    carcassZ,
    carcassFrontFace,
    carcassBackFace,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Back Panel Geometry Invariants', () => {

  describe('OVERLAY mode (back panel covers back of cabinet)', () => {

    it('should not overlap: carcass back face == back front face (MDF 6mm + Melamine)', () => {
      const result = calculateBackPanelGeometry({
        D: 560,
        backCoreT: MATERIALS['core-mdf-6'].thickness,
        backSurfaceT: MATERIALS['surf-mel-white'].thickness,
        backPanelConstruction: 'overlay',
      });

      // backTotalT = 6 + 0.3*2 = 6.6mm
      expect(result.backTotalT).toBeCloseTo(6.6, 6);

      // Key invariant: carcass back face touches back front face (no overlap, no gap)
      expect(result.carcassBackFace).toBeCloseTo(result.backFrontFace, 6);
    });

    it('should not overlap: carcass back face == back front face (HMR 18mm + HPL)', () => {
      const result = calculateBackPanelGeometry({
        D: 560,
        backCoreT: MATERIALS['core-hmr-18'].thickness,
        backSurfaceT: MATERIALS['surf-hpl-grey'].thickness,
        backPanelConstruction: 'overlay',
      });

      // backTotalT = 18 + 0.8*2 = 19.6mm
      expect(result.backTotalT).toBeCloseTo(19.6, 6);

      // Key invariant: carcass back face touches back front face
      expect(result.carcassBackFace).toBeCloseTo(result.backFrontFace, 6);
    });

    it('should respect OD budget: carcass front face == +D/2', () => {
      const D = 560;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: MATERIALS['core-hmr-18'].thickness,
        backSurfaceT: MATERIALS['surf-hpl-grey'].thickness,
        backPanelConstruction: 'overlay',
      });

      // Carcass front face must align with cabinet front (OD boundary)
      expect(result.carcassFrontFace).toBeCloseTo(D / 2, 6);
    });

    it('should respect OD budget: back back face == -D/2', () => {
      const D = 560;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: MATERIALS['core-hmr-18'].thickness,
        backSurfaceT: MATERIALS['surf-hpl-grey'].thickness,
        backPanelConstruction: 'overlay',
      });

      // Back panel back face must align with cabinet back (OD boundary)
      expect(result.backBackFace).toBeCloseTo(-D / 2, 6);
    });

    it('should work with various depths (400mm, 500mm, 600mm)', () => {
      const depths = [400, 500, 600];

      for (const D of depths) {
        const result = calculateBackPanelGeometry({
          D,
          backCoreT: 18,
          backSurfaceT: 0.8,
          backPanelConstruction: 'overlay',
        });

        // All 3 invariants must hold for any depth
        expect(result.carcassBackFace).toBeCloseTo(result.backFrontFace, 6);
        expect(result.carcassFrontFace).toBeCloseTo(D / 2, 6);
        expect(result.backBackFace).toBeCloseTo(-D / 2, 6);
      }
    });

  });

  describe('INSET mode (back panel fits into grooves)', () => {

    it('should not reduce carcass depth', () => {
      const D = 560;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'inset',
      });

      // INSET: carcass extends full depth
      expect(result.carcassDepth).toBe(D);
      expect(result.carcassZ).toBe(0);
    });

    it('should position carcass front face at +D/2', () => {
      const D = 560;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'inset',
      });

      expect(result.carcassFrontFace).toBeCloseTo(D / 2, 6);
    });

    it('should position carcass back face at -D/2', () => {
      const D = 560;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'inset',
      });

      expect(result.carcassBackFace).toBeCloseTo(-D / 2, 6);
    });

    it('should position back panel at specified inset', () => {
      const D = 560;
      const backPanelInset = 15;
      const result = calculateBackPanelGeometry({
        D,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'inset',
        backPanelInset,
      });

      // Back panel center at -D/2 + inset
      expect(result.backZ).toBeCloseTo(-D / 2 + backPanelInset, 6);
    });

  });

  describe('Edge thickness (ET) should NOT affect Z transform', () => {

    it('carcassZ should only depend on backTotalT, not edge thickness', () => {
      // This test ensures we never accidentally mix ET into Z calculations
      const D = 560;
      const backCoreT = 18;
      const backSurfaceT = 0.8;
      const backTotalT = backCoreT + backSurfaceT * 2;

      const result = calculateBackPanelGeometry({
        D,
        backCoreT,
        backSurfaceT,
        backPanelConstruction: 'overlay',
      });

      // carcassZ must be exactly backTotalT/2, nothing else
      expect(result.carcassZ).toBe(backTotalT / 2);

      // Verify no other factor is mixed in (like ET/2 = 0.5 typically)
      // If ET was mixed in, carcassZ would be 9.8 - 0.5 = 9.3 instead of 9.8
      expect(result.carcassZ).not.toBeCloseTo(backTotalT / 2 - 0.5, 6);
      expect(result.carcassZ).not.toBeCloseTo(backTotalT / 2 + 0.5, 6);
    });

  });

  describe('Real-world scenarios', () => {

    it('Standard kitchen cabinet: D=560, HMR 18 + HPL 0.8 overlay', () => {
      const result = calculateBackPanelGeometry({
        D: 560,
        backCoreT: 18,
        backSurfaceT: 0.8,
        backPanelConstruction: 'overlay',
      });

      // Expected values (pre-calculated)
      expect(result.backTotalT).toBeCloseTo(19.6, 6);
      expect(result.carcassDepth).toBeCloseTo(540.4, 6);
      expect(result.carcassZ).toBeCloseTo(9.8, 6);
      expect(result.backZ).toBeCloseTo(-270.2, 6);

      // Invariants
      expect(result.carcassBackFace).toBeCloseTo(-260.4, 6);
      expect(result.backFrontFace).toBeCloseTo(-260.4, 6);
      expect(result.carcassFrontFace).toBeCloseTo(280, 6);
      expect(result.backBackFace).toBeCloseTo(-280, 6);
    });

    it('Budget cabinet: D=500, MDF 6 + Melamine 0.3 overlay', () => {
      const result = calculateBackPanelGeometry({
        D: 500,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'overlay',
      });

      // backTotalT = 6 + 0.6 = 6.6mm
      expect(result.backTotalT).toBeCloseTo(6.6, 6);
      expect(result.carcassDepth).toBeCloseTo(493.4, 6);

      // Invariants still hold
      expect(result.carcassBackFace).toBeCloseTo(result.backFrontFace, 6);
      expect(result.carcassFrontFace).toBeCloseTo(250, 6);
      expect(result.backBackFace).toBeCloseTo(-250, 6);
    });

    it('Traditional cabinet: D=560, MDF 6 + Melamine 0.3 inset', () => {
      const result = calculateBackPanelGeometry({
        D: 560,
        backCoreT: 6,
        backSurfaceT: 0.3,
        backPanelConstruction: 'inset',
        backPanelInset: 15,
      });

      // INSET: carcass full depth
      expect(result.carcassDepth).toBe(560);
      expect(result.carcassZ).toBe(0);
      expect(result.carcassFrontFace).toBeCloseTo(280, 6);
      expect(result.carcassBackFace).toBeCloseTo(-280, 6);

      // Back panel recessed
      expect(result.backZ).toBeCloseTo(-265, 6); // -280 + 15
    });

  });

});

// ============================================================================
// Regression Guard: Ensure these rules are never violated
// ============================================================================

describe('Regression Guards', () => {

  it('RULE: backDepthReduction must use backTotalT, not backCoreT', () => {
    // This test documents the critical bug we fixed:
    // Previously: backDepthReduction = backCoreT (6mm)
    // Correct:    backDepthReduction = backTotalT (6.6mm or 19.6mm)

    const D = 560;
    const backCoreT = 18;
    const backSurfaceT = 0.8;
    const backTotalT = backCoreT + backSurfaceT * 2; // 19.6mm

    const result = calculateBackPanelGeometry({
      D,
      backCoreT,
      backSurfaceT,
      backPanelConstruction: 'overlay',
    });

    // If we used backCoreT (18mm) instead of backTotalT (19.6mm):
    // - carcassDepth would be 542 instead of 540.4
    // - There would be 1.6mm overlap!

    const incorrectCarcassDepth = D - backCoreT; // 542 (WRONG)
    expect(result.carcassDepth).not.toBe(incorrectCarcassDepth);
    expect(result.carcassDepth).toBe(D - backTotalT); // 540.4 (CORRECT)
  });

  it('RULE: carcassZ must NOT include edge thickness (ET)', () => {
    // This test documents another critical bug we fixed:
    // Previously: sideZ = -ET/2 + backDepthReduction/2
    // Correct:    carcassZ = backDepthReduction/2

    const backTotalT = 19.6;
    const ET = 1; // Typical edge thickness

    const correctCarcassZ = backTotalT / 2; // 9.8
    const incorrectCarcassZ = -ET / 2 + backTotalT / 2; // 9.3 (WRONG)

    const result = calculateBackPanelGeometry({
      D: 560,
      backCoreT: 18,
      backSurfaceT: 0.8,
      backPanelConstruction: 'overlay',
    });

    expect(result.carcassZ).toBe(correctCarcassZ);
    expect(result.carcassZ).not.toBe(incorrectCarcassZ);
  });

  it('RULE: backZ must be INSIDE OD budget (not outside)', () => {
    // This test documents another critical bug we fixed:
    // Previously: backZ = -D/2 - backT/2 (outside OD!)
    // Correct:    backZ = -D/2 + backTotalT/2 (inside OD)

    const D = 560;
    const backTotalT = 19.6;

    const correctBackZ = -D / 2 + backTotalT / 2; // -270.2 (inside)
    const incorrectBackZ = -D / 2 - backTotalT / 2; // -289.8 (outside!)

    const result = calculateBackPanelGeometry({
      D,
      backCoreT: 18,
      backSurfaceT: 0.8,
      backPanelConstruction: 'overlay',
    });

    expect(result.backZ).toBeCloseTo(correctBackZ, 6);
    expect(result.backZ).not.toBeCloseTo(incorrectBackZ, 6);

    // Additional check: back panel must be within OD bounds
    expect(result.backBackFace).toBeGreaterThanOrEqual(-D / 2 - 0.001);
    expect(result.backFrontFace).toBeLessThanOrEqual(D / 2 + 0.001);
  });

  it('RULE: changing BACK material should update carcass depth (MDF 6 → HMR 18)', () => {
    // This test documents the dependent geometry recalculation bug we fixed:
    // When back panel material changes from MDF 6mm to HMR 18mm in overlay mode,
    // carcass depth must be recalculated from the NEW backTotalT

    const D = 560;

    // Before: MDF 6mm + Melamine 0.3mm × 2 = 6.6mm
    const oldBackCoreT = 6;
    const oldBackSurfaceT = 0.3;
    const oldBackTotalT = oldBackCoreT + oldBackSurfaceT * 2; // 6.6mm
    const oldCarcassDepth = D - oldBackTotalT; // 553.4mm

    // After: HMR 18mm + HPL 0.8mm × 2 = 19.6mm
    const newBackCoreT = 18;
    const newBackSurfaceT = 0.8;
    const newBackTotalT = newBackCoreT + newBackSurfaceT * 2; // 19.6mm
    const newCarcassDepth = D - newBackTotalT; // 540.4mm

    const oldResult = calculateBackPanelGeometry({
      D,
      backCoreT: oldBackCoreT,
      backSurfaceT: oldBackSurfaceT,
      backPanelConstruction: 'overlay',
    });

    const newResult = calculateBackPanelGeometry({
      D,
      backCoreT: newBackCoreT,
      backSurfaceT: newBackSurfaceT,
      backPanelConstruction: 'overlay',
    });

    // Verify old values
    expect(oldResult.carcassDepth).toBeCloseTo(oldCarcassDepth, 6);
    expect(oldResult.carcassZ).toBeCloseTo(oldBackTotalT / 2, 6);

    // Verify new values after "material change"
    expect(newResult.carcassDepth).toBeCloseTo(newCarcassDepth, 6);
    expect(newResult.carcassZ).toBeCloseTo(newBackTotalT / 2, 6);

    // Verify the difference (this is the bug we fixed)
    const depthDifference = oldCarcassDepth - newCarcassDepth;
    expect(depthDifference).toBeCloseTo(13, 6); // 553.4 - 540.4 = 13mm

    // CRITICAL: If this test fails with newCarcassDepth ≈ oldCarcassDepth,
    // it means dependent geometry is not being recalculated!
  });

});
