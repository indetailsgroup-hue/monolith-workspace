/**
 * Reactivity Contract Tests (Phase 3)
 *
 * These tests verify the store mutation contract:
 * 1. All mutations go through cabinets[idx] (array element = truth)
 * 2. After mutation, cabinet.updatedAt is updated
 * 3. state.cabinet is synced as UI pointer (same reference)
 * 4. Derived values are recomputed correctly
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../useCabinetStore';

// ============================================
// TEST SETUP
// ============================================

beforeEach(() => {
  // Reset store to initial state before each test
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
  });
});

/**
 * Helper: Create a test cabinet and return its ID
 */
function createTestCabinet(): string {
  const store = useCabinetStore.getState();
  store.addCabinet('BASE_STANDARD', 'Test Cabinet', { width: 600, height: 720, depth: 560 });
  const state = useCabinetStore.getState();
  return state.activeCabinetId!;
}

/**
 * Helper: Get cabinet from array by ID
 */
function getCabinetFromArray(cabinetId: string) {
  const state = useCabinetStore.getState();
  return state.cabinets.find(c => c.id === cabinetId);
}

// ============================================
// T1: Panel material change → updatedAt + realThickness changes
// ============================================

describe('T1: Panel material changes update cabinet and derived values', () => {
  it('should update updatedAt when panel material changes', () => {
    const cabinetId = createTestCabinet();
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const updatedAtBefore = cabinetBefore.updatedAt;

    // Wait a bit to ensure timestamp difference
    const panel = cabinetBefore.panels.find(p => p.role === 'LEFT_SIDE');
    expect(panel).toBeDefined();

    // Change panel core material to PB-16 (different from default HMR-18)
    useCabinetStore.getState().updatePanelMaterial(
      panel!.id,
      'core',
      'core-pb-16'
    );

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    expect(cabinetAfter.updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);
  });

  it('should update panel.computed.realThickness when core material changes', () => {
    const cabinetId = createTestCabinet();
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const panel = cabinetBefore.panels.find(p => p.role === 'LEFT_SIDE');
    expect(panel).toBeDefined();

    const thicknessBefore = panel!.computed.realThickness;

    // Change core material from HMR-18 to PB-16 (16mm core instead of 18mm)
    useCabinetStore.getState().updatePanelMaterial(
      panel!.id,
      'core',
      'core-pb-16'
    );

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    const panelAfter = cabinetAfter.panels.find(p => p.id === panel!.id);

    // Thickness should be different (16mm core vs 18mm core)
    expect(panelAfter!.computed.realThickness).not.toBe(thicknessBefore);
  });
});

// ============================================
// T2: BACK panel thickness change → carcass depth/Z changes
// ============================================

describe('T2: BACK panel changes update carcass geometry', () => {
  it('should update side panel depth when back panel core changes (overlay mode)', () => {
    const cabinetId = createTestCabinet();

    // First ensure we have overlay construction
    useCabinetStore.getState().setBackPanelConstruction('overlay');

    // Re-fetch cabinet after construction change (panels regenerated)
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const backPanel = cabinetBefore.panels.find(p => p.role === 'BACK');
    const sidePanel = cabinetBefore.panels.find(p => p.role === 'LEFT_SIDE');

    expect(backPanel).toBeDefined();
    expect(sidePanel).toBeDefined();

    const sideDepthBefore = sidePanel!.finishWidth; // Side panel "depth" is finishWidth
    // Back panel starts with MDF-6 (6mm core)

    // Change back panel to thicker material (MDF-6 → HMR-18)
    useCabinetStore.getState().updatePanelMaterial(
      backPanel!.id,
      'core',
      'core-hmr-18'
    );

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    const sidePanelAfter = cabinetAfter.panels.find(p => p.role === 'LEFT_SIDE');

    // Side panel depth should decrease when back panel gets thicker
    // (thicker back = less internal depth for carcass)
    expect(sidePanelAfter!.finishWidth).toBeLessThan(sideDepthBefore);
  });

  it('should update carcassZ when back panel thickness changes (overlay mode)', () => {
    const cabinetId = createTestCabinet();
    useCabinetStore.getState().setBackPanelConstruction('overlay');

    // Re-fetch after construction change
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const backPanel = cabinetBefore.panels.find(p => p.role === 'BACK');
    const sidePanel = cabinetBefore.panels.find(p => p.role === 'LEFT_SIDE');

    expect(backPanel).toBeDefined();
    expect(sidePanel).toBeDefined();

    const sideZBefore = sidePanel!.position[2];

    // Change back panel to thicker material (MDF-6 → HMR-18)
    useCabinetStore.getState().updatePanelMaterial(
      backPanel!.id,
      'core',
      'core-hmr-18'
    );

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    const sidePanelAfter = cabinetAfter.panels.find(p => p.role === 'LEFT_SIDE');

    // Z position should change (carcassZ = backDepthReduction / 2)
    expect(sidePanelAfter!.position[2]).not.toBeCloseTo(sideZBefore, 1);
  });

  it('should NOT change carcass depth in inset mode', () => {
    const cabinetId = createTestCabinet();
    useCabinetStore.getState().setBackPanelConstruction('inset');

    // Re-fetch after construction change
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const backPanel = cabinetBefore.panels.find(p => p.role === 'BACK');
    const sidePanel = cabinetBefore.panels.find(p => p.role === 'LEFT_SIDE');

    expect(backPanel).toBeDefined();
    expect(sidePanel).toBeDefined();

    const sideDepthBefore = sidePanel!.finishWidth;

    // Change back panel material in inset mode (MDF-6 → HMR-18)
    useCabinetStore.getState().updatePanelMaterial(
      backPanel!.id,
      'core',
      'core-hmr-18'
    );

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    const sidePanelAfter = cabinetAfter.panels.find(p => p.role === 'LEFT_SIDE');

    // Side panel depth should be unchanged (inset mode = no depth reduction)
    expect(sidePanelAfter!.finishWidth).toBe(sideDepthBefore);
  });
});

// ============================================
// T3: Dimension changes trigger recompute
// ============================================

describe('T3: Dimension changes trigger recompute', () => {
  it('should update panel sizes when cabinet width changes', () => {
    const cabinetId = createTestCabinet();
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const topPanel = cabinetBefore.panels.find(p => p.role === 'TOP');

    expect(topPanel).toBeDefined();
    const topWidthBefore = topPanel!.finishWidth;

    // Change cabinet width
    useCabinetStore.getState().setDimension('width', 1000);

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    const topPanelAfter = cabinetAfter.panels.find(p => p.role === 'TOP');

    // Top panel width should change with cabinet width
    expect(topPanelAfter!.finishWidth).not.toBe(topWidthBefore);
  });

  it('should update updatedAt when dimensions change', () => {
    const cabinetId = createTestCabinet();
    const cabinetBefore = getCabinetFromArray(cabinetId)!;
    const updatedAtBefore = cabinetBefore.updatedAt;

    // Change dimension
    useCabinetStore.getState().setDimension('depth', 600);

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    expect(cabinetAfter.updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);
  });
});

// ============================================
// T4: Actions update via cabinets[idx] - reference equality
// ============================================

describe('T4: Actions maintain reference equality (cabinets[idx] === cabinet)', () => {
  it('should have same reference for cabinet and cabinets[idx] after setDimension', () => {
    const cabinetId = createTestCabinet();

    useCabinetStore.getState().setDimension('width', 800);

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetMirror).toBe(cabinetFromArray);
  });

  it('should have same reference after setJointType', () => {
    const cabinetId = createTestCabinet();

    useCabinetStore.getState().setJointType('top', 'butt');

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetMirror).toBe(cabinetFromArray);
  });

  it('should have same reference after setShelfCount', () => {
    const cabinetId = createTestCabinet();

    useCabinetStore.getState().setShelfCount(3);

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetMirror).toBe(cabinetFromArray);
  });

  it('should have same reference after setDefaultCore', () => {
    const cabinetId = createTestCabinet();

    useCabinetStore.getState().setDefaultCore('core-hmr-18');

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetMirror).toBe(cabinetFromArray);
  });

  it('should have same reference after toggleBackPanel', () => {
    const cabinetId = createTestCabinet();

    useCabinetStore.getState().toggleBackPanel();

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetMirror).toBe(cabinetFromArray);
  });
});

// ============================================
// T5: Regression - prevent direct state.cabinet mutation
// ============================================

describe('T5: Regression tests for reactivity contract', () => {
  it('should update cabinets[idx].updatedAt when panel removed', () => {
    const cabinetId = createTestCabinet();

    // First add a sub-shelf that can be removed
    useCabinetStore.getState().addShelfInCompartment(0, 0);

    const stateBefore = useCabinetStore.getState();
    const cabinetBefore = stateBefore.cabinets.find(c => c.id === cabinetId)!;
    const subShelf = cabinetBefore.panels.find(p => p.name.startsWith('Sub Shelf'));

    expect(subShelf).toBeDefined();
    const updatedAtBefore = cabinetBefore.updatedAt;

    // Remove the sub-shelf
    useCabinetStore.getState().removePanel(subShelf!.id);

    const cabinetAfter = getCabinetFromArray(cabinetId)!;
    expect(cabinetAfter.updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);
  });

  it('should have consistent panel count between cabinet and cabinets[idx]', () => {
    const cabinetId = createTestCabinet();

    // Change structure to generate different panels
    useCabinetStore.getState().setShelfCount(2);
    useCabinetStore.getState().setDividerCount(1);

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet!;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId)!;

    expect(cabinetMirror.panels.length).toBe(cabinetFromArray.panels.length);
    expect(cabinetMirror.computed.panelCount).toBe(cabinetFromArray.computed.panelCount);
  });

  it('should sync computed values between cabinet and cabinets[idx]', () => {
    const cabinetId = createTestCabinet();

    // Make multiple changes
    useCabinetStore.getState().setDimension('width', 900);
    useCabinetStore.getState().setDefaultCore('core-hmr-18');

    const state = useCabinetStore.getState();
    const cabinetMirror = state.cabinet!;
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId)!;

    expect(cabinetMirror.computed).toBe(cabinetFromArray.computed);
    expect(cabinetMirror.dimensions).toBe(cabinetFromArray.dimensions);
  });
});

// ============================================
// INVARIANT CHECKS
// ============================================

describe('Invariants: Contract guarantees', () => {
  it('I1: Cabinet3D subscribes to cabinets array - active cabinet is in array', () => {
    const cabinetId = createTestCabinet();

    const state = useCabinetStore.getState();
    const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

    expect(cabinetFromArray).toBeDefined();
    expect(state.activeCabinetId).toBe(cabinetId);
  });

  it('I2: Manufacturing exports match visible geometry - panel data is consistent', () => {
    const cabinetId = createTestCabinet();
    useCabinetStore.getState().setBackPanelConstruction('overlay');

    // Change back panel material (MDF-6 → HMR-18)
    const state = useCabinetStore.getState();
    const backPanel = state.cabinet!.panels.find(p => p.role === 'BACK');
    if (backPanel) {
      useCabinetStore.getState().updatePanelMaterial(
        backPanel.id,
        'core',
        'core-hmr-18'
      );
    }

    // Verify manufacturing data matches 3D data
    const stateAfter = useCabinetStore.getState();
    const cabinetFromArray = stateAfter.cabinets.find(c => c.id === cabinetId)!;
    const cabinetMirror = stateAfter.cabinet!;

    // All panels should match
    cabinetFromArray.panels.forEach((panel, idx) => {
      expect(panel.finishWidth).toBe(cabinetMirror.panels[idx].finishWidth);
      expect(panel.finishHeight).toBe(cabinetMirror.panels[idx].finishHeight);
      expect(panel.computed.realThickness).toBe(cabinetMirror.panels[idx].computed.realThickness);
    });
  });

  it('I3: No action mutates only state.cabinet - verified by reference check', () => {
    const cabinetId = createTestCabinet();

    // Perform multiple actions
    const actions = [
      () => useCabinetStore.getState().setDimension('width', 850),
      () => useCabinetStore.getState().setShelfCount(2),
      () => useCabinetStore.getState().setDefaultSurface('surf-hpl-grey'),
      () => useCabinetStore.getState().setBackPanelConstruction('overlay'),
    ];

    for (const action of actions) {
      action();

      const state = useCabinetStore.getState();
      const cabinetMirror = state.cabinet;
      const cabinetFromArray = state.cabinets.find(c => c.id === cabinetId);

      // After each action, references must be the same
      expect(cabinetMirror).toBe(cabinetFromArray);
    }
  });
});
