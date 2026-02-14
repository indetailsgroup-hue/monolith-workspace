/**
 * Designer Rules Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultIntent,
} from '../policy';
import {
  clearRules,
  initializeRules,
  validateIntent,
} from '../rules';
import type { DesignerIntent } from '../types';

describe('Designer Rules', () => {
  beforeEach(() => {
    // Reset and initialize rules before each test
    clearRules();
    initializeRules();
  });

  describe('Structural Rules', () => {
    it('should pass validation for valid default intent', () => {
      const intent = createDefaultIntent();
      const result = validateIntent(intent);

      // Default intent should have no blockers
      expect(result.ok).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('should block cabinet with width < 200mm', () => {
      const intent = createDefaultIntent();
      intent.dimensions.width = 100;

      const result = validateIntent(intent);

      expect(result.ok).toBe(false);
      expect(result.blockers.some((b) => b.code === 'WIDTH_TOO_SMALL')).toBe(true);
    });

    it('should block cabinet with height < 200mm', () => {
      const intent = createDefaultIntent();
      intent.dimensions.height = 150;

      const result = validateIntent(intent);

      expect(result.ok).toBe(false);
      expect(result.blockers.some((b) => b.code === 'HEIGHT_TOO_SMALL')).toBe(true);
    });

    it('should block cabinet with depth < 200mm', () => {
      const intent = createDefaultIntent();
      intent.dimensions.depth = 100;

      const result = validateIntent(intent);

      expect(result.ok).toBe(false);
      expect(result.blockers.some((b) => b.code === 'DEPTH_TOO_SMALL')).toBe(true);
    });

    it('should block minifix with panels < 16mm', () => {
      const intent = createDefaultIntent();
      intent.connectors.primaryJoint = 'minifix';
      intent.materials.carcassThickness = 12;

      const result = validateIntent(intent);

      expect(result.ok).toBe(false);
      expect(
        result.blockers.some(
          (b) =>
            b.code === 'MINIFIX_NEEDS_THICKER_PANELS' ||
            b.code === 'CONNECTOR_INCOMPATIBLE'
        )
      ).toBe(true);
    });

    it('should allow dowel joints with 12mm panels', () => {
      const intent = createDefaultIntent();
      intent.connectors.primaryJoint = 'dowel';
      intent.materials.carcassThickness = 12;

      const result = validateIntent(intent);

      // No connector-related blockers
      const connectorBlockers = result.blockers.filter(
        (b) =>
          b.code.includes('CONNECTOR') ||
          b.code.includes('DOWEL') ||
          b.code.includes('MINIFIX')
      );
      expect(connectorBlockers).toHaveLength(0);
    });
  });

  describe('Door Rules', () => {
    it('should warn about wide single doors', () => {
      const intent = createDefaultIntent();
      intent.dimensions.width = 800;
      intent.doors = {
        enabled: true,
        count: 1,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const result = validateIntent(intent);

      // Should have warning about door width
      expect(result.warnings.some((w) => w.code === 'DOOR_TOO_WIDE')).toBe(true);
    });

    it('should block lift doors without cup hinges', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 1,
        openingType: 'lift',
        hingeType: 'butt', // Wrong hinge type for lift
        overlayType: 'full',
      };

      const result = validateIntent(intent);

      expect(result.blockers.some((b) => b.code === 'LIFT_NEEDS_CUP_HINGE')).toBe(true);
    });

    it('should pass with valid door configuration', () => {
      const intent = createDefaultIntent();
      intent.doors = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      const result = validateIntent(intent);

      // No door-related blockers
      const doorBlockers = result.blockers.filter((b) => b.code.includes('DOOR'));
      expect(doorBlockers).toHaveLength(0);
    });
  });

  describe('Shelf Rules', () => {
    it('should block adjustable shelf < 14mm thick', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        {
          id: 'shelf-1',
          type: 'adjustable',
          thickness: 12, // Too thin
          positionY: 400,
        },
      ];

      const result = validateIntent(intent);

      expect(
        result.blockers.some((b) => b.code === 'ADJUSTABLE_SHELF_TOO_THIN')
      ).toBe(true);
    });

    it('should provide info about System 32 misalignment', () => {
      const intent = createDefaultIntent();
      intent.shelves = [
        {
          id: 'shelf-1',
          type: 'adjustable',
          thickness: 18,
          positionY: 350, // Not aligned to System 32
        },
      ];

      const result = validateIntent(intent);

      expect(result.info.some((i) => i.code === 'SHELF_NOT_ON_SYSTEM_32')).toBe(true);
    });

    it('should pass with System 32 aligned shelf', () => {
      const intent = createDefaultIntent();
      // 37 + 32*10 = 357mm is on System 32 grid
      intent.shelves = [
        {
          id: 'shelf-1',
          type: 'adjustable',
          thickness: 18,
          positionY: 357,
        },
      ];

      const result = validateIntent(intent);

      expect(result.info.some((i) => i.code === 'SHELF_NOT_ON_SYSTEM_32')).toBe(false);
    });
  });

  describe('Drawer Rules', () => {
    it('should block drawer front < 80mm', () => {
      const intent = createDefaultIntent();
      intent.drawers = {
        enabled: true,
        rows: [{ frontHeight: 50, gapAbove: 3 }], // Too short
        slideType: 'undermount',
      };

      const result = validateIntent(intent);

      expect(
        result.blockers.some((b) => b.code === 'DRAWER_FRONT_TOO_SHORT')
      ).toBe(true);
    });

    it('should block too many drawer rows', () => {
      const intent = createDefaultIntent();
      intent.dimensions.height = 2400;
      intent.drawers = {
        enabled: true,
        rows: Array(10).fill({ frontHeight: 140, gapAbove: 3 }), // 10 rows > max 8
        slideType: 'undermount',
      };

      const result = validateIntent(intent);

      expect(result.blockers.some((b) => b.code === 'TOO_MANY_DRAWERS')).toBe(true);
    });

    it('should pass with valid drawer configuration', () => {
      const intent = createDefaultIntent();
      intent.drawers = {
        enabled: true,
        rows: [
          { frontHeight: 140, gapAbove: 3 },
          { frontHeight: 200, gapAbove: 3 },
        ],
        slideType: 'undermount',
      };

      const result = validateIntent(intent);

      // No drawer-related blockers
      const drawerBlockers = result.blockers.filter(
        (b) => b.code.includes('DRAWER') && !b.code.includes('EXCEEDS')
      );
      expect(drawerBlockers).toHaveLength(0);
    });
  });
});
