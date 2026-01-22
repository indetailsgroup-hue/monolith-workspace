/**
 * machineProfile.test.ts - Unit tests for Machine Profile
 *
 * Tests machine profile types, helpers, and presets.
 *
 * @version 1.0.0 - Phase D1
 */

import { describe, it, expect } from 'vitest';
import {
  hasTool,
  getTool,
  getToolByDiameter,
  isWithinAxisLimits,
  isWithinToolDepth,
  getAxisViolation,
} from '../machine/machineProfile';
import { KDT_MACHINE } from '../machine/presets/kdt';
import { BIESSE_MACHINE } from '../machine/presets/biesse';

// ============================================================================
// Machine Profile Structure Tests
// ============================================================================

describe('Machine Profile Structure', () => {
  it('should have valid KDT machine profile', () => {
    expect(KDT_MACHINE.id).toBe('KDT');
    expect(KDT_MACHINE.manufacturer).toBe('KDT Machinery');
    expect(KDT_MACHINE.units).toBe('mm');
    expect(KDT_MACHINE.dialect).toBe('FANUC');
  });

  it('should have valid Biesse machine profile', () => {
    expect(BIESSE_MACHINE.id).toBe('BIESSE');
    expect(BIESSE_MACHINE.manufacturer).toBe('Biesse Group');
    expect(BIESSE_MACHINE.units).toBe('mm');
    expect(BIESSE_MACHINE.dialect).toBe('BIESSE');
  });

  it('should have proper axis limits', () => {
    expect(KDT_MACHINE.axis.x.min).toBe(0);
    expect(KDT_MACHINE.axis.x.max).toBe(3200);
    expect(KDT_MACHINE.axis.y.min).toBe(0);
    expect(KDT_MACHINE.axis.y.max).toBe(1300);
    expect(KDT_MACHINE.axis.z.min).toBe(-50);
    expect(KDT_MACHINE.axis.z.max).toBe(100);
  });

  it('should have spindle configuration', () => {
    expect(KDT_MACHINE.spindle.maxRpm).toBeGreaterThan(0);
    expect(KDT_MACHINE.spindle.minRpm).toBeGreaterThan(0);
    expect(KDT_MACHINE.spindle.defaultRpm).toBeGreaterThan(0);
    expect(KDT_MACHINE.spindle.minRpm).toBeLessThan(KDT_MACHINE.spindle.maxRpm);
  });

  it('should have tools array', () => {
    expect(Array.isArray(KDT_MACHINE.tools)).toBe(true);
    expect(KDT_MACHINE.tools.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tool Helper Tests
// ============================================================================

describe('hasTool', () => {
  it('should return true for existing tool', () => {
    expect(hasTool(KDT_MACHINE, 'DRILL_5')).toBe(true);
    expect(hasTool(KDT_MACHINE, 'BORE_15')).toBe(true);
  });

  it('should return false for non-existing tool', () => {
    expect(hasTool(KDT_MACHINE, 'NONEXISTENT')).toBe(false);
    expect(hasTool(KDT_MACHINE, '')).toBe(false);
  });
});

describe('getTool', () => {
  it('should return tool for existing ID', () => {
    const tool = getTool(KDT_MACHINE, 'DRILL_5');
    expect(tool).toBeDefined();
    expect(tool?.toolId).toBe('DRILL_5');
    expect(tool?.diameter).toBe(5);
    expect(tool?.type).toBe('DRILL');
  });

  it('should return undefined for non-existing ID', () => {
    const tool = getTool(KDT_MACHINE, 'NONEXISTENT');
    expect(tool).toBeUndefined();
  });
});

describe('getToolByDiameter', () => {
  it('should find tool by exact diameter', () => {
    const tool = getToolByDiameter(KDT_MACHINE, 5, 'DRILL');
    expect(tool).toBeDefined();
    expect(tool?.diameter).toBe(5);
    expect(tool?.type).toBe('DRILL');
  });

  it('should find bore tool by diameter', () => {
    const tool = getToolByDiameter(KDT_MACHINE, 15, 'BORE');
    expect(tool).toBeDefined();
    expect(tool?.diameter).toBe(15);
    expect(tool?.type).toBe('BORE');
  });

  it('should return undefined for non-existing diameter', () => {
    const tool = getToolByDiameter(KDT_MACHINE, 99, 'DRILL');
    expect(tool).toBeUndefined();
  });

  it('should find tool without type filter', () => {
    const tool = getToolByDiameter(KDT_MACHINE, 5);
    expect(tool).toBeDefined();
    expect(tool?.diameter).toBe(5);
  });
});

// ============================================================================
// Axis Limits Tests
// ============================================================================

describe('isWithinAxisLimits', () => {
  it('should return true for valid position', () => {
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 100, y: 100, z: 0 })).toBe(true);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 3200, y: 1300, z: -50 })).toBe(true);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 1600, y: 650, z: 100 })).toBe(true);
  });

  it('should return false for X out of range', () => {
    expect(isWithinAxisLimits(KDT_MACHINE, { x: -1, y: 100, z: 0 })).toBe(false);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 3201, y: 100, z: 0 })).toBe(false);
  });

  it('should return false for Y out of range', () => {
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 100, y: -1, z: 0 })).toBe(false);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 100, y: 1301, z: 0 })).toBe(false);
  });

  it('should return false for Z out of range', () => {
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 100, y: 100, z: 101 })).toBe(false);
    expect(isWithinAxisLimits(KDT_MACHINE, { x: 100, y: 100, z: -51 })).toBe(false);
  });
});

describe('getAxisViolation', () => {
  it('should return null for valid position', () => {
    expect(getAxisViolation(KDT_MACHINE, { x: 100, y: 100, z: -10 })).toBeNull();
  });

  it('should return X axis error', () => {
    const error = getAxisViolation(KDT_MACHINE, { x: 5000, y: 100, z: -10 });
    expect(error).toContain('X axis');
    expect(error).toContain('5000');
  });

  it('should return Y axis error', () => {
    const error = getAxisViolation(KDT_MACHINE, { x: 100, y: 2000, z: -10 });
    expect(error).toContain('Y axis');
    expect(error).toContain('2000');
  });

  it('should return Z axis error', () => {
    const error = getAxisViolation(KDT_MACHINE, { x: 100, y: 100, z: -200 });
    expect(error).toContain('Z axis');
    expect(error).toContain('-200');
  });
});

// ============================================================================
// Tool Depth Tests
// ============================================================================

describe('isWithinToolDepth', () => {
  it('should return true for depth within limit', () => {
    const tool = getTool(KDT_MACHINE, 'DRILL_5')!;
    expect(isWithinToolDepth(tool, 10)).toBe(true);
    expect(isWithinToolDepth(tool, 0)).toBe(true);
  });

  it('should return true for depth at limit', () => {
    const tool = getTool(KDT_MACHINE, 'DRILL_5')!;
    expect(isWithinToolDepth(tool, tool.maxDepth)).toBe(true);
  });

  it('should return false for depth exceeding limit', () => {
    const tool = getTool(KDT_MACHINE, 'DRILL_5')!;
    expect(isWithinToolDepth(tool, tool.maxDepth + 1)).toBe(false);
    expect(isWithinToolDepth(tool, 999)).toBe(false);
  });
});

// ============================================================================
// Tool Capability Tests
// ============================================================================

describe('Tool Capabilities', () => {
  it('should have drill tools with peck support', () => {
    const drillTool = getTool(KDT_MACHINE, 'DRILL_5');
    expect(drillTool?.supportsPeck).toBe(true);
  });

  it('should have bore tools with bore support', () => {
    const boreTool = getTool(KDT_MACHINE, 'BORE_15');
    expect(boreTool?.supportsBore).toBe(true);
    expect(boreTool?.type).toBe('BORE');
  });

  it('should have valid feed rates', () => {
    for (const tool of KDT_MACHINE.tools) {
      expect(tool.defaultFeedRate).toBeGreaterThan(0);
      expect(tool.defaultPlungeRate).toBeGreaterThan(0);
    }
  });

  it('should have positive max depth for all tools', () => {
    for (const tool of KDT_MACHINE.tools) {
      expect(tool.maxDepth).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Machine Preset Comparison Tests
// ============================================================================

describe('Machine Preset Comparison', () => {
  it('should have different work areas', () => {
    const kdtArea = KDT_MACHINE.axis.x.max * KDT_MACHINE.axis.y.max;
    const biesseArea = BIESSE_MACHINE.axis.x.max * BIESSE_MACHINE.axis.y.max;
    expect(biesseArea).toBeGreaterThan(kdtArea);
  });

  it('should both have standard Minifix tools', () => {
    // Both should have 5mm drill for Minifix bolt
    expect(getToolByDiameter(KDT_MACHINE, 5, 'DRILL')).toBeDefined();
    expect(getToolByDiameter(BIESSE_MACHINE, 5, 'DRILL')).toBeDefined();

    // Both should have 15mm bore for Minifix cam
    expect(getToolByDiameter(KDT_MACHINE, 15, 'BORE')).toBeDefined();
    expect(getToolByDiameter(BIESSE_MACHINE, 15, 'BORE')).toBeDefined();
  });

  it('should have different tool magazines', () => {
    expect(BIESSE_MACHINE.toolMagazineSize).toBeGreaterThan(KDT_MACHINE.toolMagazineSize);
  });
});
