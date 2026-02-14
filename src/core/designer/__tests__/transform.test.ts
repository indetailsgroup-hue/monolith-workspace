/**
 * Designer Transform Tests
 */

import { describe, it, expect } from 'vitest';
import { createDefaultIntent } from '../policy';
import { intentToHardware } from '../transform/intentToHardware';
import { intentToAssembly } from '../transform/intentToAssembly';
import { intentToDrilling, getDrillMapSummary } from '../transform/intentToDrilling';
import type { DesignerIntent } from '../types';

describe('Designer Transform', () => {
  describe('intentToHardware', () => {
    it('should select connectors for base cabinet', () => {
      const intent = createDefaultIntent();
      const hardware = intentToHardware(intent);

      // Should have minifix connectors (default)
      const connectors = hardware.filter((h) => h.type === 'minifix');
      expect(connectors.length).toBeGreaterThan(0);
      expect(connectors[0].quantity).toBeGreaterThan(0);
    });

    it('should select hinges when doors enabled', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const hardware = intentToHardware(intent);
      const hinges = hardware.filter((h) => h.type === 'hinge');

      expect(hinges.length).toBe(1);
      expect(hinges[0].quantity).toBeGreaterThanOrEqual(4); // 2 doors × 2 hinges each minimum
    });

    it('should select shelf pins for adjustable shelves', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        { id: 'shelf-1', type: 'adjustable', thickness: 18, positionY: 400 },
      ];

      const hardware = intentToHardware(intent);
      const shelfPins = hardware.filter((h) => h.type === 'shelf_pin');

      expect(shelfPins.length).toBe(1);
      expect(shelfPins[0].quantity).toBe(4); // 4 pins per shelf
    });

    it('should select slides when drawers enabled', () => {
      const intent = createDefaultIntent();
      intent.drawers = {
        enabled: true,
        rows: [{ frontHeight: 140, gapAbove: 3 }],
        slideType: 'undermount',
      };

      const hardware = intentToHardware(intent);
      const slides = hardware.filter((h) => h.type === 'slide');

      expect(slides.length).toBe(1);
      expect(slides[0].quantity).toBe(2); // 2 slides per drawer
    });

    it('should not select door hardware when doors disabled', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: false,
        count: 1,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const hardware = intentToHardware(intent);
      const hinges = hardware.filter((h) => h.type === 'hinge');

      expect(hinges).toHaveLength(0);
    });
  });

  describe('intentToAssembly', () => {
    it('should generate assembly steps for base cabinet', () => {
      const intent = createDefaultIntent();
      const assembly = intentToAssembly(intent);

      expect(assembly.steps.length).toBeGreaterThan(0);
      expect(assembly.totalTimeMinutes).toBeGreaterThan(0);
    });

    it('should start with left side panel (Left-to-Right standard)', () => {
      const intent = createDefaultIntent();
      const assembly = intentToAssembly(intent);

      expect(assembly.steps[0].panelId).toBe('left-side');
      expect(assembly.steps[0].action).toBe('place');
    });

    it('should include door steps when doors enabled', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const assembly = intentToAssembly(intent);
      const doorSteps = assembly.steps.filter(
        (s) => s.panelId.includes('door') && s.action === 'attach'
      );

      expect(doorSteps.length).toBe(2); // 2 doors
    });

    it('should include drawer steps when drawers enabled', () => {
      const intent = createDefaultIntent();
      intent.drawers = {
        enabled: true,
        rows: [
          { frontHeight: 140, gapAbove: 3 },
          { frontHeight: 200, gapAbove: 3 },
        ],
        slideType: 'undermount',
      };

      const assembly = intentToAssembly(intent);
      const slideStep = assembly.steps.find((s) => s.panelId === 'drawer-slides');
      const drawerSteps = assembly.steps.filter((s) => s.panelId.startsWith('drawer-') && s.panelId !== 'drawer-slides');

      expect(slideStep).toBeDefined();
      expect(drawerSteps.length).toBe(2); // 2 drawer boxes
    });

    it('should include back panel step when enabled', () => {
      const intent = createDefaultIntent();
      intent.backPanel.enabled = true;

      const assembly = intentToAssembly(intent);
      const backStep = assembly.steps.find((s) => s.panelId === 'back');

      expect(backStep).toBeDefined();
      expect(backStep!.action).toBe('insert');
    });

    it('should include fixed shelf steps', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        { id: 'shelf-1', type: 'fixed', thickness: 18, positionY: 360 },
      ];

      const assembly = intentToAssembly(intent);
      const shelfStep = assembly.steps.find((s) => s.panelId === 'shelf-shelf-1');

      expect(shelfStep).toBeDefined();
      expect(shelfStep!.action).toBe('attach');
    });

    it('should include flip step for completing joints', () => {
      const intent = createDefaultIntent();
      const assembly = intentToAssembly(intent);
      const flipStep = assembly.steps.find((s) => s.action === 'flip');

      expect(flipStep).toBeDefined();
    });
  });

  describe('intentToDrilling', () => {
    it('should generate drill map for hardware', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        { id: 'shelf-1', type: 'adjustable', thickness: 18, positionY: 400 },
      ];

      const hardware = intentToHardware(intent);
      const drillMap = intentToDrilling(intent, hardware);

      expect(drillMap.totalCount).toBeGreaterThan(0);
      expect(drillMap.panels.size).toBeGreaterThan(0);
    });

    it('should generate System 32 holes for shelf pins', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        { id: 'shelf-1', type: 'adjustable', thickness: 18, positionY: 400 },
      ];

      const hardware = intentToHardware(intent);
      const drillMap = intentToDrilling(intent, hardware);
      const summary = getDrillMapSummary(drillMap);

      expect(summary.byType['shelf_pin']).toBeGreaterThan(0);
    });

    it('should generate cam and bolt holes for minifix', () => {
      const intent = createDefaultIntent();
      const hardware = intentToHardware(intent);
      const drillMap = intentToDrilling(intent, hardware);
      const summary = getDrillMapSummary(drillMap);

      expect(summary.byType['cam']).toBeGreaterThan(0);
      expect(summary.byType['bolt']).toBeGreaterThan(0);
    });

    it('should group drills by panel', () => {
      const intent = createDefaultIntent();
      const hardware = intentToHardware(intent);
      const drillMap = intentToDrilling(intent, hardware);

      // Should have drills on left-side and right-side panels
      expect(drillMap.panels.has('left-side')).toBe(true);
      expect(drillMap.panels.has('right-side')).toBe(true);
    });
  });
});
