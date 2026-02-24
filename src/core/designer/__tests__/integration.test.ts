/**
 * Designer Module Integration Tests
 *
 * Tests the full processDesignerIntent pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  processDesignerIntent,
  validateDesignerIntent,
  estimateMetrics,
  createDefaultIntent,
  initializeRules,
  clearRules,
} from '../index';
import type { DesignerIntent } from '../types';

describe('Designer Module Integration', () => {
  beforeEach(() => {
    clearRules();
    initializeRules();
  });

  describe('processDesignerIntent', () => {
    it('should process valid default intent successfully', () => {
      const intent = createDefaultIntent();
      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(true);
      expect(output.validation.blockers).toHaveLength(0);
      expect(output.hardware.length).toBeGreaterThan(0);
      expect(output.assembly.steps.length).toBeGreaterThan(0);
      expect(output.bom.length).toBeGreaterThan(0);
      expect(output.metrics.panelCount).toBeGreaterThan(0);
    });

    it('should return empty output when validation fails', () => {
      const intent = createDefaultIntent();
      intent.dimensions.width = 50; // Invalid - too small

      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(false);
      expect(output.validation.blockers.length).toBeGreaterThan(0);
      expect(output.hardware).toHaveLength(0);
      expect(output.assembly.steps).toHaveLength(0);
    });

    it('should include correct panel count in metrics', () => {
      const intent = createDefaultIntent();
      intent.backPanel.enabled = true;
      intent.shelves = [
        { id: 'shelf-1', type: 'fixed', thickness: 18, positionY: 360 },
      ];

      const output = processDesignerIntent(intent);

      // Base panels: left, right, top, bottom = 4
      // Back panel = 1
      // Shelf = 1
      // Total = 6
      expect(output.metrics.panelCount).toBe(6);
    });

    it('should include hardware in BOM', () => {
      const intent = createDefaultIntent();
      const output = processDesignerIntent(intent);

      const hardwareBom = output.bom.filter((item) => item.type === 'hardware');
      expect(hardwareBom.length).toBeGreaterThan(0);
    });

    it('should include panels in BOM with dimensions', () => {
      const intent = createDefaultIntent();
      const output = processDesignerIntent(intent);

      const panelBom = output.bom.filter((item) => item.type === 'panel');
      expect(panelBom.length).toBeGreaterThan(0);

      // All panels should have dimensions
      for (const panel of panelBom) {
        expect(panel.dimensions).toBeDefined();
        expect(panel.dimensions!.length).toBeGreaterThan(0);
        expect(panel.dimensions!.width).toBeGreaterThan(0);
        expect(panel.dimensions!.thickness).toBeGreaterThan(0);
      }
    });

    it('should calculate assembly time', () => {
      const intent = createDefaultIntent();
      const output = processDesignerIntent(intent);

      expect(output.assembly.totalTimeMinutes).toBeGreaterThan(0);
      expect(output.metrics.estimatedAssemblyMinutes).toBe(output.assembly.totalTimeMinutes);
    });

    it('should include generatedAt timestamp', () => {
      const intent = createDefaultIntent();
      const output = processDesignerIntent(intent);

      expect(output.generatedAt).toBeDefined();
      expect(new Date(output.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Full Cabinet Configurations', () => {
    it('should process cabinet with doors', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(true);

      // Should have hinge hardware
      const hinges = output.hardware.find((h) => h.type === 'hinge');
      expect(hinges).toBeDefined();

      // Should have door panels in BOM
      const doorPanels = output.bom.filter(
        (item) => item.type === 'panel' && item.name.includes('Door')
      );
      expect(doorPanels.length).toBe(2);

      // Should have door steps in assembly
      const doorSteps = output.assembly.steps.filter((s) =>
        s.panelId.includes('door')
      );
      expect(doorSteps.length).toBeGreaterThan(0);
    });

    it('should process cabinet with drawers', () => {
      const intent = createDefaultIntent();
      intent.drawers = {
        enabled: true,
        rows: [
          { frontHeight: 140, gapAbove: 3 },
          { frontHeight: 200, gapAbove: 3 },
        ],
        slideType: 'undermount',
      };

      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(true);

      // Should have slide hardware
      const slides = output.hardware.find((h) => h.type === 'slide');
      expect(slides).toBeDefined();
      expect(slides!.quantity).toBe(4); // 2 slides × 2 drawers

      // Should have drawer steps in assembly
      const drawerSteps = output.assembly.steps.filter((s) =>
        s.panelId.startsWith('drawer')
      );
      expect(drawerSteps.length).toBeGreaterThan(0);
    });

    it('should process cabinet with shelves', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        { id: 'shelf-1', type: 'fixed', thickness: 18, positionY: 200 },
        { id: 'shelf-2', type: 'adjustable', thickness: 18, positionY: 400 },
      ];

      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(true);

      // Should have shelf pins for adjustable shelf
      const pins = output.hardware.find((h) => h.type === 'shelf_pin');
      expect(pins).toBeDefined();

      // Should have shelf panels in BOM
      const shelfPanels = output.bom.filter(
        (item) => item.type === 'panel' && item.name.includes('Shelf')
      );
      expect(shelfPanels.length).toBe(2);
    });

    it('should process cabinet with dividers', () => {
      const intent = createDefaultIntent();
      intent.dividers = [
        { id: 'div-1', positionX: 300, fullHeight: true, hasBack: false },
      ];

      const output = processDesignerIntent(intent);

      expect(output.validation.ok).toBe(true);

      // Should have divider panel in BOM
      const dividerPanels = output.bom.filter(
        (item) => item.type === 'panel' && item.name.includes('Divider')
      );
      expect(dividerPanels.length).toBe(1);

      // Should have divider step in assembly
      const dividerStep = output.assembly.steps.find(
        (s) => s.panelId === 'divider-div-1'
      );
      expect(dividerStep).toBeDefined();
    });
  });

  describe('validateDesignerIntent', () => {
    it('should validate without full processing', () => {
      const intent = createDefaultIntent();
      const validation = validateDesignerIntent(intent);

      expect(validation.ok).toBe(true);
      expect(validation.blockers).toHaveLength(0);
    });

    it('should return blockers for invalid intent', () => {
      const intent = createDefaultIntent();
      intent.connectors.primaryJoint = 'minifix';
      intent.materials.carcassThickness = 12; // Too thin for minifix

      const validation = validateDesignerIntent(intent);

      expect(validation.ok).toBe(false);
      expect(validation.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('estimateMetrics', () => {
    it('should provide quick estimates', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };
      intent.shelves = [
        { id: 'shelf-1', type: 'adjustable', thickness: 18, positionY: 400 },
      ];

      const estimates = estimateMetrics(intent);

      expect(estimates.panelCount).toBeDefined();
      expect(estimates.hardwareCount).toBeDefined();
      expect(estimates.panelCount).toBeGreaterThan(0);
      expect(estimates.hardwareCount).toBeGreaterThan(0);
    });
  });
});
