/**
 * Designer Types Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  DesignerIntent,
  DesignerOutput,
  DesignerIssue,
  ShelfIntent,
  DoorIntent,
  DrawerIntent,
} from '../types';
import { createDefaultIntent } from '../policy';

describe('Designer Types', () => {
  describe('DesignerIntent', () => {
    it('should create a valid default intent', () => {
      const intent = createDefaultIntent();

      expect(intent.intentVersion).toBe('1.0');
      expect(intent.cabinetType).toBe('BASE');
      expect(intent.jointType).toBe('INSET');
      expect(intent.dimensions.width).toBe(600);
      expect(intent.dimensions.height).toBe(720);
      expect(intent.dimensions.depth).toBe(560);
    });

    it('should have valid dimension ranges', () => {
      const intent = createDefaultIntent();

      expect(intent.dimensions.width).toBeGreaterThanOrEqual(200);
      expect(intent.dimensions.width).toBeLessThanOrEqual(2400);
      expect(intent.dimensions.height).toBeGreaterThanOrEqual(200);
      expect(intent.dimensions.height).toBeLessThanOrEqual(2400);
      expect(intent.dimensions.depth).toBeGreaterThanOrEqual(200);
      expect(intent.dimensions.depth).toBeLessThanOrEqual(800);
    });

    it('should have valid material defaults', () => {
      const intent = createDefaultIntent();

      expect(intent.materials.carcassThickness).toBe(18);
      expect(intent.backPanel.thickness).toBe(6);
      expect(intent.materials.edgeBanding).toBe('pvc');
    });

    it('should have valid connector defaults', () => {
      const intent = createDefaultIntent();

      expect(intent.connectors.primaryJoint).toBe('minifix');
      expect(intent.connectors.backPanelAttachment).toBe('groove');
    });
  });

  describe('ShelfIntent', () => {
    it('should support fixed and adjustable shelves', () => {
      const fixedShelf: ShelfIntent = {
        id: 'shelf-1',
        type: 'fixed',
        thickness: 18,
        positionY: 360,
      };

      const adjustableShelf: ShelfIntent = {
        id: 'shelf-2',
        type: 'adjustable',
        thickness: 18,
        positionY: 400,
        loadCapacity: 'medium',
      };

      expect(fixedShelf.type).toBe('fixed');
      expect(adjustableShelf.type).toBe('adjustable');
      expect(adjustableShelf.loadCapacity).toBe('medium');
    });
  });

  describe('DoorIntent', () => {
    it('should support door configuration', () => {
      const doors: DoorIntent = {
        enabled: true,
        count: 2,
        openingType: 'swing',
        hingeType: 'cup',
        overlayType: 'full',
      };

      expect(doors.enabled).toBe(true);
      expect(doors.count).toBe(2);
      expect(doors.hingeType).toBe('cup');
    });
  });

  describe('DrawerIntent', () => {
    it('should support drawer configuration', () => {
      const drawers: DrawerIntent = {
        enabled: true,
        rows: [
          { frontHeight: 140, gapAbove: 3 },
          { frontHeight: 200, gapAbove: 3 },
        ],
        slideType: 'undermount',
      };

      expect(drawers.enabled).toBe(true);
      expect(drawers.rows.length).toBe(2);
      expect(drawers.slideType).toBe('undermount');
    });
  });

  describe('DesignerIssue', () => {
    it('should have valid severity levels', () => {
      const blocker: DesignerIssue = {
        code: 'TEST_ERROR',
        severity: 'blocker',
        message: 'Test error message',
      };

      const warning: DesignerIssue = {
        code: 'TEST_WARNING',
        severity: 'warning',
        message: 'Test warning message',
      };

      const info: DesignerIssue = {
        code: 'TEST_INFO',
        severity: 'info',
        message: 'Test info message',
      };

      expect(blocker.severity).toBe('blocker');
      expect(warning.severity).toBe('warning');
      expect(info.severity).toBe('info');
    });

    it('should support optional fields', () => {
      const issue: DesignerIssue = {
        code: 'FULL_ISSUE',
        severity: 'warning',
        message: 'Full issue with all fields',
        field: 'dimensions.width',
        suggestion: 'Increase width to 200mm',
      };

      expect(issue.field).toBe('dimensions.width');
      expect(issue.suggestion).toBe('Increase width to 200mm');
    });
  });
});
