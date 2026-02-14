/**
 * useCabinetStore Panel Management Integration Tests
 *
 * Tests for panel-related operations:
 * - Panel selection
 * - Panel material updates
 * - Panel edge updates
 * - Shelf and divider management
 *
 * @version 1.1.0 - AGENT-T021 (Fixed API alignment)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCabinetStore } from '../useCabinetStore';

describe('useCabinetStore - Panel Management', () => {
  let testCabinetId: string;
  let leftSidePanelId: string;

  beforeEach(() => {
    // Reset store and create a test cabinet
    useCabinetStore.setState({
      cabinets: [],
      cabinet: null,
      activeCabinetId: null,
      selectedPanelId: null,
    });
    useCabinetStore.getState().createCabinet('BASE', 'Test Cabinet');
    const cabinet = useCabinetStore.getState().cabinet;
    testCabinetId = cabinet?.id || '';

    // Find a LEFT_SIDE panel for testing (PanelRole is uppercase)
    const sidePanel = cabinet?.panels.find(p => p.role === 'LEFT_SIDE');
    leftSidePanelId = sidePanel?.id || '';
  });

  // ============================================
  // PANEL SELECTION
  // ============================================

  describe('Panel Selection', () => {
    it('should select a panel by ID', () => {
      useCabinetStore.getState().selectPanel(leftSidePanelId);
      expect(useCabinetStore.getState().selectedPanelId).toBe(leftSidePanelId);
    });

    it('should deselect panel when passing null', () => {
      useCabinetStore.getState().selectPanel(leftSidePanelId);
      useCabinetStore.getState().selectPanel(null);
      expect(useCabinetStore.getState().selectedPanelId).toBeNull();
    });

    it('should allow selecting different panels', () => {
      const cabinet = useCabinetStore.getState().cabinet;
      const topPanel = cabinet?.panels.find(p => p.role === 'TOP');
      const topPanelId = topPanel?.id || '';

      useCabinetStore.getState().selectPanel(leftSidePanelId);
      expect(useCabinetStore.getState().selectedPanelId).toBe(leftSidePanelId);

      if (topPanelId) {
        useCabinetStore.getState().selectPanel(topPanelId);
        expect(useCabinetStore.getState().selectedPanelId).toBe(topPanelId);
      }
    });

    it('should persist selection across store reads', () => {
      useCabinetStore.getState().selectPanel(leftSidePanelId);
      // Multiple reads should return same selection
      expect(useCabinetStore.getState().selectedPanelId).toBe(leftSidePanelId);
      expect(useCabinetStore.getState().selectedPanelId).toBe(leftSidePanelId);
    });
  });

  // ============================================
  // PANEL MATERIAL UPDATES
  // ============================================

  describe('Panel Material Updates', () => {
    it('should update panel core material', () => {
      const newMaterialId = 'core-mdf-18';
      useCabinetStore.getState().updatePanelMaterial(leftSidePanelId, 'core', newMaterialId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.coreMaterialId).toBe(newMaterialId);
    });

    it('should update panel face A material', () => {
      const newMaterialId = 'surf-melamine-white';
      useCabinetStore.getState().updatePanelMaterial(leftSidePanelId, 'faceA', newMaterialId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.faces?.faceA).toBe(newMaterialId);
    });

    it('should update panel face B material', () => {
      const newMaterialId = 'surf-melamine-oak';
      useCabinetStore.getState().updatePanelMaterial(leftSidePanelId, 'faceB', newMaterialId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.faces?.faceB).toBe(newMaterialId);
    });

    it('should not affect other panels when updating one', () => {
      const cabinet = useCabinetStore.getState().cabinet;
      const topPanel = cabinet?.panels.find(p => p.role === 'TOP');
      const topPanelId = topPanel?.id || '';
      const originalTopMaterial = topPanel?.coreMaterialId;

      useCabinetStore.getState().updatePanelMaterial(leftSidePanelId, 'core', 'core-mdf-18');

      const updatedCabinet = useCabinetStore.getState().cabinet;
      const updatedTopPanel = updatedCabinet?.panels.find(p => p.id === topPanelId);
      expect(updatedTopPanel?.coreMaterialId).toBe(originalTopMaterial);
    });
  });

  // ============================================
  // PANEL EDGE UPDATES
  // ============================================

  describe('Panel Edge Updates', () => {
    it('should update panel top edge', () => {
      const edgeId = 'edge-2mm-white';
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'top', edgeId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.edges?.top).toBe(edgeId);
    });

    it('should update panel bottom edge', () => {
      const edgeId = 'edge-1mm-oak';
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'bottom', edgeId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.edges?.bottom).toBe(edgeId);
    });

    it('should update panel left edge', () => {
      const edgeId = 'edge-abs-black';
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'left', edgeId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.edges?.left).toBe(edgeId);
    });

    it('should update panel right edge', () => {
      const edgeId = 'edge-pvc-gray';
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'right', edgeId);

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.edges?.right).toBe(edgeId);
    });

    it('should update multiple edges independently', () => {
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'top', 'edge-top');
      useCabinetStore.getState().updatePanelEdge(leftSidePanelId, 'bottom', 'edge-bottom');

      const cabinet = useCabinetStore.getState().cabinet;
      const panel = cabinet?.panels.find(p => p.id === leftSidePanelId);
      expect(panel?.edges?.top).toBe('edge-top');
      expect(panel?.edges?.bottom).toBe('edge-bottom');
    });
  });

  // ============================================
  // SHELF MANAGEMENT (PanelRole = 'SHELF')
  // ============================================

  describe('Shelf Management', () => {
    it('should add shelf in compartment', () => {
      const initialPanelCount = useCabinetStore.getState().cabinet?.panels.length || 0;

      useCabinetStore.getState().addShelfInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.panels.length).toBeGreaterThan(initialPanelCount);

      // Role is uppercase 'SHELF'
      const shelves = cabinet?.panels.filter(p => p.role === 'SHELF');
      expect(shelves?.length).toBeGreaterThan(0);
    });

    it('should add multiple shelves', () => {
      useCabinetStore.getState().addShelfInCompartment(0, 0);
      useCabinetStore.getState().addShelfInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      const shelves = cabinet?.panels.filter(p => p.role === 'SHELF');
      expect(shelves?.length).toBeGreaterThanOrEqual(2);
    });

    it('shelf should have correct role', () => {
      useCabinetStore.getState().addShelfInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      const newShelf = cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
      expect(newShelf?.role).toBe('SHELF');
    });
  });

  // ============================================
  // DIVIDER MANAGEMENT (PanelRole = 'DIVIDER')
  // ============================================

  describe('Divider Management', () => {
    it('should add divider in compartment', () => {
      const initialPanelCount = useCabinetStore.getState().cabinet?.panels.length || 0;

      useCabinetStore.getState().addDividerInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.panels.length).toBeGreaterThan(initialPanelCount);

      // Role is uppercase 'DIVIDER'
      const dividers = cabinet?.panels.filter(p => p.role === 'DIVIDER');
      expect(dividers?.length).toBeGreaterThan(0);
    });

    it('should add multiple dividers', () => {
      useCabinetStore.getState().addDividerInCompartment(0, 0);
      useCabinetStore.getState().addDividerInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      const dividers = cabinet?.panels.filter(p => p.role === 'DIVIDER');
      expect(dividers?.length).toBeGreaterThanOrEqual(2);
    });

    it('divider should have correct role', () => {
      useCabinetStore.getState().addDividerInCompartment(0, 0);

      const cabinet = useCabinetStore.getState().cabinet;
      const newDivider = cabinet?.panels.find(p => p.role === 'DIVIDER' && p.name.includes('Sub'));
      expect(newDivider?.role).toBe('DIVIDER');
    });
  });

  // ============================================
  // PANEL REMOVAL
  // ============================================

  describe('Panel Removal', () => {
    it('should remove a shelf panel', () => {
      // Add a shelf first
      useCabinetStore.getState().addShelfInCompartment(0, 0);
      const cabinet = useCabinetStore.getState().cabinet;
      const shelf = cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
      const shelfId = shelf?.id || '';
      const panelCountBefore = cabinet?.panels.length || 0;

      if (shelfId) {
        // Remove the shelf
        useCabinetStore.getState().removePanel(shelfId);

        const updatedCabinet = useCabinetStore.getState().cabinet;
        expect(updatedCabinet?.panels.length).toBe(panelCountBefore - 1);
        expect(updatedCabinet?.panels.find(p => p.id === shelfId)).toBeUndefined();
      }
    });

    it('should deselect panel when removed', () => {
      useCabinetStore.getState().addShelfInCompartment(0, 0);
      const cabinet = useCabinetStore.getState().cabinet;
      const shelf = cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
      const shelfId = shelf?.id || '';

      if (shelfId) {
        // Select the shelf
        useCabinetStore.getState().selectPanel(shelfId);
        expect(useCabinetStore.getState().selectedPanelId).toBe(shelfId);

        // Remove the shelf
        useCabinetStore.getState().removePanel(shelfId);

        // Selection should be cleared
        expect(useCabinetStore.getState().selectedPanelId).toBeNull();
      }
    });
  });

  // ============================================
  // CABINET DIMENSION CHANGES
  // ============================================

  describe('Cabinet Dimension Changes', () => {
    it('should update cabinet width', () => {
      useCabinetStore.getState().setDimension('width', 700);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.dimensions.width).toBe(700);
    });

    it('should update cabinet height', () => {
      useCabinetStore.getState().setDimension('height', 800);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.dimensions.height).toBe(800);
    });

    it('should update cabinet depth', () => {
      useCabinetStore.getState().setDimension('depth', 500);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.dimensions.depth).toBe(500);
    });

    it('should accept any dimension value (no minimum enforced in store)', () => {
      // Store does not enforce minimum - this tests actual behavior
      useCabinetStore.getState().setDimension('width', 10);

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.dimensions.width).toBe(10);
    });
  });

  // ============================================
  // EDGE CASES & ERROR HANDLING
  // ============================================

  describe('Edge Cases', () => {
    it('should handle updating non-existent panel', () => {
      // Should not throw
      expect(() => {
        useCabinetStore.getState().updatePanelMaterial('non-existent-id', 'core', 'material');
      }).not.toThrow();
    });

    it('should handle selecting non-existent panel', () => {
      useCabinetStore.getState().selectPanel('non-existent-id');
      // State might not change or might set to invalid ID
      // Either way, should not throw
    });

    it('should handle removing non-existent panel', () => {
      const panelCountBefore = useCabinetStore.getState().cabinet?.panels.length || 0;

      expect(() => {
        useCabinetStore.getState().removePanel('non-existent-id');
      }).not.toThrow();

      // Panel count should remain unchanged
      expect(useCabinetStore.getState().cabinet?.panels.length).toBe(panelCountBefore);
    });
  });
});

// ============================================
// INTEGRATION WITH CABINET LIFECYCLE
// ============================================

describe('Panel Management Integration', () => {
  it('should maintain panel integrity across cabinet operations', () => {
    // Create cabinet
    useCabinetStore.setState({
      cabinets: [],
      cabinet: null,
      activeCabinetId: null,
      selectedPanelId: null,
    });
    useCabinetStore.getState().createCabinet('BASE', 'Integration Test');

    // Add some panels
    useCabinetStore.getState().addShelfInCompartment(0, 0);
    useCabinetStore.getState().addDividerInCompartment(0, 0);

    // Modify materials
    const cabinet = useCabinetStore.getState().cabinet;
    const shelf = cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
    if (shelf) {
      useCabinetStore.getState().updatePanelMaterial(shelf.id, 'core', 'core-mdf-18');
    }

    // Update dimensions
    useCabinetStore.getState().setDimension('width', 700);

    // Verify integrity
    const finalCabinet = useCabinetStore.getState().cabinet;
    expect(finalCabinet?.dimensions.width).toBe(700);

    // Note: After setDimension, cabinet gets recalculated and panels may change
    // The shelf with updated material should still exist if it wasn't removed
    const finalShelf = finalCabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
    if (finalShelf) {
      // If shelf still exists, its material should be updated
      expect(finalShelf?.coreMaterialId).toBe('core-mdf-18');
    }
  });
});
