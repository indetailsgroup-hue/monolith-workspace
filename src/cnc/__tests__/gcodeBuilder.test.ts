/**
 * gcodeBuilder.test.ts - Unit tests for G-code Builder Utility
 *
 * Tests the GcodeBuilder class and formatting utilities.
 *
 * @version 1.0.0 - Phase D2
 */

import { describe, it, expect } from 'vitest';
import {
  GcodeBuilder,
  formatCoord,
  calculateMoveTime,
  distance3D,
} from '../post/emit/gcodeBuilder';
import {
  formatNumber,
  formatFeedRate,
  formatRpm,
  sanitizeComment,
  formatProgramName,
  buildMoveCommand,
  buildDrillCycle,
} from '../post/emit/format';

// ============================================================================
// GcodeBuilder Core Tests
// ============================================================================

describe('GcodeBuilder - Core Methods', () => {
  it('should create empty builder', () => {
    const builder = new GcodeBuilder();
    expect(builder.build()).toBe('');
    expect(builder.getLineCount()).toBe(0);
  });

  it('should add raw lines', () => {
    const builder = new GcodeBuilder();
    builder.addRaw('%');
    builder.addRaw('O1234');

    const result = builder.build();
    expect(result).toBe('%\nO1234');
  });

  it('should add lines without line numbers by default', () => {
    const builder = new GcodeBuilder({ lineNumbers: false });
    builder.addLine('G21');
    builder.addLine('G90');

    const result = builder.build();
    expect(result).toBe('G21\nG90');
    expect(result).not.toContain('N');
  });

  it('should add line numbers when enabled', () => {
    const builder = new GcodeBuilder({ lineNumbers: true, lineNumberIncrement: 10 });
    builder.addLine('G21');
    builder.addLine('G90');

    const result = builder.build();
    expect(result).toContain('N10 G21');
    expect(result).toContain('N20 G90');
  });

  it('should add comments', () => {
    const builder = new GcodeBuilder({ includeComments: true });
    builder.addComment('Test comment');

    const result = builder.build();
    expect(result).toBe('(Test comment)');
  });

  it('should skip comments when disabled', () => {
    const builder = new GcodeBuilder({ includeComments: false });
    builder.addComment('Test comment');

    expect(builder.build()).toBe('');
  });

  it('should add blank lines', () => {
    const builder = new GcodeBuilder();
    builder.addLine('G21');
    builder.addBlank();
    builder.addLine('G90');

    const lines = builder.build().split('\n');
    expect(lines[1]).toBe('');
  });
});

// ============================================================================
// GcodeBuilder Motion Tests
// ============================================================================

describe('GcodeBuilder - Motion Commands', () => {
  it('should generate G0 rapid move', () => {
    const builder = new GcodeBuilder();
    builder.rapid({ x: 100, y: 200, z: 50 });

    expect(builder.build()).toBe('G0 X100 Y200 Z50');
  });

  it('should generate G0 with partial coordinates', () => {
    const builder = new GcodeBuilder();
    builder.rapid({ z: 50 });

    expect(builder.build()).toBe('G0 Z50');
  });

  it('should generate G1 feed move', () => {
    const builder = new GcodeBuilder();
    builder.feed({ x: 100, y: 200, z: -10, f: 500 });

    expect(builder.build()).toBe('G1 X100 Y200 Z-10 F500');
  });

  it('should format decimal coordinates', () => {
    const builder = new GcodeBuilder({ decimalPlaces: 3 });
    builder.rapid({ x: 100.123, y: 200.456 });

    expect(builder.build()).toBe('G0 X100.123 Y200.456');
  });

  it('should trim trailing zeros', () => {
    const builder = new GcodeBuilder({ decimalPlaces: 3 });
    builder.rapid({ x: 100.100, y: 200.000 });

    // Should trim trailing zeros
    const result = builder.build();
    expect(result).toContain('X100.1');
    expect(result).toContain('Y200');
  });
});

// ============================================================================
// GcodeBuilder Tool/Spindle Tests
// ============================================================================

describe('GcodeBuilder - Tool and Spindle', () => {
  it('should generate tool change', () => {
    const builder = new GcodeBuilder();
    builder.toolChange(1);

    expect(builder.build()).toBe('T1 M6');
  });

  it('should generate tool change with comment', () => {
    const builder = new GcodeBuilder({ includeComments: true });
    builder.toolChange(1, 'DRILL 5mm');

    expect(builder.build()).toBe('T1 M6 (DRILL 5mm)');
  });

  it('should generate spindle on CW', () => {
    const builder = new GcodeBuilder();
    builder.spindleOn(18000, 'CW');

    expect(builder.build()).toBe('M3 S18000');
  });

  it('should generate spindle on CCW', () => {
    const builder = new GcodeBuilder();
    builder.spindleOn(18000, 'CCW');

    expect(builder.build()).toBe('M4 S18000');
  });

  it('should generate spindle off', () => {
    const builder = new GcodeBuilder();
    builder.spindleOff();

    expect(builder.build()).toBe('M5');
  });
});

// ============================================================================
// GcodeBuilder Drilling Cycle Tests
// ============================================================================

describe('GcodeBuilder - Drilling Cycles', () => {
  it('should generate G81 drill cycle', () => {
    const builder = new GcodeBuilder();
    builder.drillCycle({ x: 100, y: 200, z: -13, r: 50, f: 500 });

    expect(builder.build()).toBe('G81 X100 Y200 Z-13 R50 F500');
  });

  it('should generate G83 peck drill cycle', () => {
    const builder = new GcodeBuilder();
    builder.peckDrillCycle({ x: 100, y: 200, z: -30, r: 50, q: 5, f: 500 });

    expect(builder.build()).toBe('G83 X100 Y200 Z-30 R50 Q5 F500');
  });

  it('should generate G85 bore cycle', () => {
    const builder = new GcodeBuilder();
    builder.boreCycle({ x: 100, y: 200, z: -12, r: 50, f: 300 });

    expect(builder.build()).toBe('G85 X100 Y200 Z-12 R50 F300');
  });
});

// ============================================================================
// GcodeBuilder Setup/End Tests
// ============================================================================

describe('GcodeBuilder - Setup and End', () => {
  it('should generate G21 (mm)', () => {
    const builder = new GcodeBuilder();
    builder.setMillimeters();

    expect(builder.build()).toBe('G21');
  });

  it('should generate G90 (absolute)', () => {
    const builder = new GcodeBuilder();
    builder.setAbsolute();

    expect(builder.build()).toBe('G90');
  });

  it('should generate G17 (XY plane)', () => {
    const builder = new GcodeBuilder();
    builder.setXYPlane();

    expect(builder.build()).toBe('G17');
  });

  it('should generate G80 (cancel cycle)', () => {
    const builder = new GcodeBuilder();
    builder.cancelCycle();

    expect(builder.build()).toBe('G80');
  });

  it('should generate M30 (program end)', () => {
    const builder = new GcodeBuilder();
    builder.programEnd();

    expect(builder.build()).toBe('M30');
  });

  it('should generate dwell', () => {
    const builder = new GcodeBuilder();
    builder.dwell(0.5);

    expect(builder.build()).toBe('G4 P0.5');
  });
});

// ============================================================================
// Format Utility Tests
// ============================================================================

describe('Format Utilities', () => {
  it('should format coordinates without trailing zeros', () => {
    expect(formatCoord(100.000)).toBe('100');
    expect(formatCoord(100.100)).toBe('100.1');
    expect(formatCoord(100.123)).toBe('100.123');
  });

  it('should format numbers with rounding', () => {
    expect(formatNumber(100.1234, 3)).toBe('100.123');
    expect(formatNumber(100.1235, 3)).toBe('100.124');
  });

  it('should format feed rate as integer', () => {
    expect(formatFeedRate(500.5)).toBe('501');
    expect(formatFeedRate(1000)).toBe('1000');
  });

  it('should format RPM as integer', () => {
    expect(formatRpm(18000.5)).toBe('18001');
  });

  it('should sanitize comments', () => {
    expect(sanitizeComment('Test (comment)')).toBe('Test comment');
    expect(sanitizeComment('Long' + 'x'.repeat(100))).toHaveLength(80);
  });

  it('should format program name', () => {
    expect(formatProgramName('my-job-123')).toBe('MY-JOB-123');
    expect(formatProgramName('invalid chars!@#')).toBe('INVALIDCHARS');
    expect(formatProgramName('')).toBe('PROGRAM');
  });
});

// ============================================================================
// Move Command Builder Tests
// ============================================================================

describe('Move Command Builders', () => {
  it('should build G0 command', () => {
    expect(buildMoveCommand('G0', { x: 100, y: 200 })).toBe('G0 X100 Y200');
  });

  it('should build G1 command with feed', () => {
    expect(buildMoveCommand('G1', { x: 100, z: -10, f: 500 })).toBe('G1 X100 Z-10 F500');
  });

  it('should build drill cycle', () => {
    expect(buildDrillCycle({ x: 100, y: 200, z: -13, r: 50, f: 500 })).toBe(
      'G81 X100 Y200 Z-13 R50 F500'
    );
  });
});

// ============================================================================
// Calculation Tests
// ============================================================================

describe('Calculation Utilities', () => {
  it('should calculate move time', () => {
    // 100mm at 1000mm/min = 6 seconds
    expect(calculateMoveTime(100, 1000)).toBeCloseTo(6, 1);
  });

  it('should handle zero feed rate', () => {
    expect(calculateMoveTime(100, 0)).toBe(0);
  });

  it('should calculate 3D distance', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBe(5);
  });

  it('should calculate 3D distance with Z', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 0, y: 0, z: 10 };
    expect(distance3D(p1, p2)).toBe(10);
  });
});
