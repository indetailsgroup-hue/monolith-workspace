/**
 * Material Thickness Calculator Unit Tests
 *
 * Tests the single-source-of-truth thickness calculation.
 * All tests use controlled mock data to ensure deterministic results.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  computePanelTotalThickness,
  computeBackPanelTotalThickness,
  computeBackDepthReduction,
  getThicknessBreakdown,
  initMaterialRegistries,
  GLUE_THICKNESS_MM,
} from '../materialThickness';

// ============================================
// MOCK MATERIAL DATA
// ============================================

const MOCK_CORE_MATERIALS = {
  'core-mdf-6': { id: 'core-mdf-6', thickness: 6 },
  'core-pb-16': { id: 'core-pb-16', thickness: 16 },
  'core-pb-18': { id: 'core-pb-18', thickness: 18 },
  'core-hmr-18': { id: 'core-hmr-18', thickness: 18 },
};

const MOCK_SURFACE_MATERIALS = {
  'surf-mel-white': { id: 'surf-mel-white', thickness: 0.3 },
  'surf-mel-grey': { id: 'surf-mel-grey', thickness: 0.3 },
  'surf-hpl-grey': { id: 'surf-hpl-grey', thickness: 0.8 },
  'surf-veneer-oak': { id: 'surf-veneer-oak', thickness: 0.6 },
};

// ============================================
// TEST SETUP
// ============================================

beforeAll(() => {
  // Initialize registries with mock data
  initMaterialRegistries(MOCK_CORE_MATERIALS, MOCK_SURFACE_MATERIALS);
});

// ============================================
// TEST SUITES
// ============================================

describe('computePanelTotalThickness', () => {
  it('should calculate thickness for core-only panel (null faces)', () => {
    const panel = {
      coreMaterialId: 'core-pb-18',
      faces: { faceA: null, faceB: null },
    };

    // With default surface (0.3mm × 2) applied when faces are null
    const thickness = computePanelTotalThickness(panel, 'surf-mel-white');

    // 18 + 0.3 + 0.3 = 18.6mm
    expect(thickness).toBeCloseTo(18.6, 6);
  });

  it('should calculate thickness when faceA is specified', () => {
    const panel = {
      coreMaterialId: 'core-pb-18',
      faces: { faceA: 'surf-hpl-grey', faceB: null },
    };

    // faceA: 0.8mm (HPL), faceB: default 0.3mm
    const thickness = computePanelTotalThickness(panel, 'surf-mel-white');

    // 18 + 0.8 + 0.3 = 19.1mm
    expect(thickness).toBeCloseTo(19.1, 6);
  });

  it('should calculate thickness when faceB is specified', () => {
    const panel = {
      coreMaterialId: 'core-pb-18',
      faces: { faceA: null, faceB: 'surf-veneer-oak' },
    };

    // faceA: default 0.3mm, faceB: 0.6mm (veneer)
    const thickness = computePanelTotalThickness(panel, 'surf-mel-white');

    // 18 + 0.3 + 0.6 = 18.9mm
    expect(thickness).toBeCloseTo(18.9, 6);
  });

  it('should calculate thickness for 2-sided finish (back panel example)', () => {
    const backPanel = {
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    // 6 + 0.8 + 0.8 = 7.6mm
    const thickness = computePanelTotalThickness(backPanel, 'surf-mel-white');

    expect(thickness).toBeCloseTo(7.6, 6);
  });

  it('should include glue when option is set', () => {
    const panel = {
      coreMaterialId: 'core-pb-18',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    // Without glue: 18 + 0.3 + 0.3 = 18.6mm
    const thicknessNoGlue = computePanelTotalThickness(panel, 'surf-mel-white', { includeGlue: false });
    expect(thicknessNoGlue).toBeCloseTo(18.6, 6);

    // With glue: 18 + 0.3 + 0.3 + (0.1 × 2) = 18.8mm
    const thicknessWithGlue = computePanelTotalThickness(panel, 'surf-mel-white', { includeGlue: true });
    expect(thicknessWithGlue).toBeCloseTo(18.8, 6);
  });

  it('should be deterministic (same inputs = same output)', () => {
    const panel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const result1 = computePanelTotalThickness(panel, 'surf-mel-white');
    const result2 = computePanelTotalThickness(panel, 'surf-mel-white');
    const result3 = computePanelTotalThickness(panel, 'surf-mel-white');

    // 18 + 0.8 + 0.8 = 19.6mm
    expect(result1).toBeCloseTo(19.6, 6);
    expect(result2).toBeCloseTo(19.6, 6);
    expect(result3).toBeCloseTo(19.6, 6);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

describe('computeBackPanelTotalThickness (alias)', () => {
  it('should behave identically to computePanelTotalThickness', () => {
    const backPanel = {
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    const generic = computePanelTotalThickness(backPanel, 'surf-mel-white');
    const backSpecific = computeBackPanelTotalThickness(backPanel, 'surf-mel-white');

    expect(backSpecific).toBe(generic);
    expect(backSpecific).toBeCloseTo(6.6, 6); // 6 + 0.3 + 0.3
  });
});

describe('computeBackDepthReduction', () => {
  it('should return 0 for INSET mode', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'inset' as const };
    const backPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const reduction = computeBackDepthReduction(structure, backPanel, 'surf-mel-white');

    expect(reduction).toBe(0);
  });

  it('should return backTotalT for OVERLAY mode', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };
    const backPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const reduction = computeBackDepthReduction(structure, backPanel, 'surf-mel-white');

    // 18 + 0.8 + 0.8 = 19.6mm
    expect(reduction).toBeCloseTo(19.6, 6);
  });

  it('should return 0 when hasBackPanel is false', () => {
    const structure = { hasBackPanel: false, backPanelConstruction: 'overlay' as const };
    const backPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const reduction = computeBackDepthReduction(structure, backPanel, 'surf-mel-white');

    expect(reduction).toBe(0);
  });

  it('should return 0 when backPanel is null', () => {
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };

    const reduction = computeBackDepthReduction(structure, null, 'surf-mel-white');

    expect(reduction).toBe(0);
  });
});

describe('getThicknessBreakdown', () => {
  it('should return all thickness components', () => {
    const panel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-mel-white' },
    };

    const breakdown = getThicknessBreakdown(panel, 'surf-mel-white');

    expect(breakdown.core).toBe(18);
    expect(breakdown.faceA).toBeCloseTo(0.8, 6);
    expect(breakdown.faceB).toBeCloseTo(0.3, 6);
    expect(breakdown.glue).toBeCloseTo(GLUE_THICKNESS_MM * 2, 6);
    expect(breakdown.total).toBeCloseTo(19.1, 6); // 18 + 0.8 + 0.3
    expect(breakdown.totalWithGlue).toBeCloseTo(19.3, 6); // 19.1 + 0.2
  });
});

describe('Material Change Scenarios', () => {
  it('should reflect thickness change when back panel core changes (MDF 6 → HMR 18)', () => {
    // Before: MDF 6mm + Melamine 0.3mm × 2
    const oldBackPanel = {
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    // After: HMR 18mm + Melamine 0.3mm × 2
    const newBackPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    const oldThickness = computePanelTotalThickness(oldBackPanel, 'surf-mel-white');
    const newThickness = computePanelTotalThickness(newBackPanel, 'surf-mel-white');

    // Old: 6 + 0.3 + 0.3 = 6.6mm
    expect(oldThickness).toBeCloseTo(6.6, 6);
    // New: 18 + 0.3 + 0.3 = 18.6mm
    expect(newThickness).toBeCloseTo(18.6, 6);
    // Difference: 12mm
    expect(newThickness - oldThickness).toBeCloseTo(12, 6);
  });

  it('should reflect thickness change when surface changes (Melamine → HPL)', () => {
    // Before: HMR 18mm + Melamine 0.3mm × 2
    const oldPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    // After: HMR 18mm + HPL 0.8mm × 2
    const newPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const oldThickness = computePanelTotalThickness(oldPanel, 'surf-mel-white');
    const newThickness = computePanelTotalThickness(newPanel, 'surf-mel-white');

    // Old: 18 + 0.3 + 0.3 = 18.6mm
    expect(oldThickness).toBeCloseTo(18.6, 6);
    // New: 18 + 0.8 + 0.8 = 19.6mm
    expect(newThickness).toBeCloseTo(19.6, 6);
    // Difference: 1mm
    expect(newThickness - oldThickness).toBeCloseTo(1, 6);
  });

  it('should correctly compute depth reduction change for overlay back panel', () => {
    const D = 560; // Cabinet depth
    const structure = { hasBackPanel: true, backPanelConstruction: 'overlay' as const };

    // Before: MDF 6 + Mel 0.3×2 = 6.6mm
    const oldBackPanel = {
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: 'surf-mel-white', faceB: 'surf-mel-white' },
    };

    // After: HMR 18 + HPL 0.8×2 = 19.6mm
    const newBackPanel = {
      coreMaterialId: 'core-hmr-18',
      faces: { faceA: 'surf-hpl-grey', faceB: 'surf-hpl-grey' },
    };

    const oldReduction = computeBackDepthReduction(structure, oldBackPanel, 'surf-mel-white');
    const newReduction = computeBackDepthReduction(structure, newBackPanel, 'surf-mel-white');

    const oldCarcassDepth = D - oldReduction;
    const newCarcassDepth = D - newReduction;

    // Old: 560 - 6.6 = 553.4mm
    expect(oldCarcassDepth).toBeCloseTo(553.4, 6);
    // New: 560 - 19.6 = 540.4mm
    expect(newCarcassDepth).toBeCloseTo(540.4, 6);
    // Carcass depth should decrease by 13mm
    expect(oldCarcassDepth - newCarcassDepth).toBeCloseTo(13, 6);
  });
});
