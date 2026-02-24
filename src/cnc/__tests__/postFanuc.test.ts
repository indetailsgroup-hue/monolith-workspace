/**
 * postFanuc.test.ts - Unit tests for FANUC Post Processor
 *
 * Tests G-code generation, determinism, safety invariants, and tool changes.
 *
 * @version 1.0.0 - Phase D2
 */

import { describe, it, expect } from 'vitest';
import { fanucPostProcessor } from '../post/dialects/fanuc';
import { KDT_MACHINE } from '../machine/presets/kdt';
import type { OperationGraph, DrillOperation, BoreOperation } from '../operation/operationTypes';
import type { PostProcessOptions } from '../post/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillOp = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  id: 'drill-001',
  type: 'DRILL',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  feedRate: 500,
  throughHole: false,
  comment: 'Test drill',
  sourceId: 'point-001',
  ...overrides,
});

const createBoreOp = (overrides?: Partial<BoreOperation>): BoreOperation => ({
  id: 'bore-001',
  type: 'BORE',
  toolId: 'BORE_15',
  position: { x: 200, y: 200, z: 0 },
  depth: 12,
  diameter: 15,
  feedRate: 300,
  flatBottom: true,
  comment: 'Test bore',
  sourceId: 'cam-001',
  ...overrides,
});

const createGraph = (overrides?: Partial<OperationGraph>): OperationGraph => ({
  machineId: 'KDT',
  operations: [createDrillOp()],
  toolsUsed: ['DRILL_5'],
  safeZ: 50,
  rapidZ: 60,
  metadata: {
    jobId: 'job-001',
    sourceContentHash: 'hash-001',
    builtAt: '2024-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
  ...overrides,
});

const defaultOpts: PostProcessOptions = {
  programName: 'TEST001',
  includeComments: true,
  lineNumbers: false,
};

// ============================================================================
// Basic Generation Tests
// ============================================================================

describe('FANUC Post - Basic Generation', () => {
  it('should generate valid G-code for single drill operation', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G21'); // mm units
      expect(result.gcode).toContain('G90'); // absolute mode
      expect(result.gcode).toContain('G81'); // drill cycle
      expect(result.gcode).toContain('M30'); // program end
    }
  });

  it('should generate valid G-code for bore operation', () => {
    const graph = createGraph({
      operations: [createBoreOp()],
      toolsUsed: ['BORE_15'],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G85'); // bore cycle
    }
  });

  it('should include program name in header', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, {
      ...defaultOpts,
      programName: 'MYJOB123',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('OMYJOB123');
    }
  });

  it('should handle empty operation graph', () => {
    const graph = createGraph({ operations: [] });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.warnings).toContain('No operations to process');
    }
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe('FANUC Post - Determinism', () => {
  it('should produce identical output for same input', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001', position: { x: 100, y: 100, z: 0 } }),
        createDrillOp({ id: 'drill-002', position: { x: 200, y: 100, z: 0 } }),
        createBoreOp({ id: 'bore-001', position: { x: 300, y: 100, z: 0 } }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15'],
    });

    const result1 = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);
    const result2 = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result1.status).toBe('OK');
    expect(result2.status).toBe('OK');

    if (result1.status === 'OK' && result2.status === 'OK') {
      // Remove timestamp lines for comparison
      const clean1 = result1.gcode.replace(/Generated:.*$/m, 'Generated: TIMESTAMP');
      const clean2 = result2.gcode.replace(/Generated:.*$/m, 'Generated: TIMESTAMP');
      expect(clean1).toBe(clean2);
    }
  });

  it('should normalize operation order for determinism', () => {
    // Create graph with operations in random order
    const graph1 = createGraph({
      operations: [
        createBoreOp({ id: 'bore-001' }),
        createDrillOp({ id: 'drill-001' }),
        createDrillOp({ id: 'drill-002', position: { x: 200, y: 100, z: 0 } }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15'],
    });

    // Same operations in different order
    const graph2 = createGraph({
      operations: [
        createDrillOp({ id: 'drill-002', position: { x: 200, y: 100, z: 0 } }),
        createDrillOp({ id: 'drill-001' }),
        createBoreOp({ id: 'bore-001' }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15'],
    });

    const result1 = fanucPostProcessor.post(graph1, KDT_MACHINE, defaultOpts);
    const result2 = fanucPostProcessor.post(graph2, KDT_MACHINE, defaultOpts);

    expect(result1.status).toBe('OK');
    expect(result2.status).toBe('OK');

    // Both should produce same normalized output
    if (result1.status === 'OK' && result2.status === 'OK') {
      const clean1 = result1.gcode.replace(/Generated:.*$/m, 'Generated: TIMESTAMP');
      const clean2 = result2.gcode.replace(/Generated:.*$/m, 'Generated: TIMESTAMP');
      expect(clean1).toBe(clean2);
    }
  });
});

// ============================================================================
// Safety Invariants Tests
// ============================================================================

describe('FANUC Post - Safety Invariants', () => {
  it('should start with safe Z move', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const lines = result.gcode.split('\n');
      // Find first G0 Z move after setup
      const setupIndex = lines.findIndex((l) => l.includes('G80'));
      const firstRapidZ = lines.slice(setupIndex + 1).find((l) => l.includes('G0') && l.includes('Z'));
      expect(firstRapidZ).toBeDefined();
    }
  });

  it('should end with spindle off (M5)', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('M5');
    }
  });

  it('should end with coolant off (M9)', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('M9');
    }
  });

  it('should end with program end (M30)', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const lines = result.gcode.split('\n');
      const lastLines = lines.slice(-5).join('\n');
      expect(lastLines).toContain('M30');
    }
  });

  it('should include % delimiters', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode.startsWith('%')).toBe(true);
      expect(result.gcode.endsWith('%')).toBe(true);
    }
  });

  it('should cancel cycle (G80) before tool change', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001' }),
        createBoreOp({ id: 'bore-001' }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15'],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // Should have G80 before tool change
      const g80Count = (result.gcode.match(/G80/g) || []).length;
      expect(g80Count).toBeGreaterThanOrEqual(2); // At least: setup + before tool change
    }
  });
});

// ============================================================================
// Tool Change Tests
// ============================================================================

describe('FANUC Post - Tool Changes', () => {
  it('should generate tool change when tool changes', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
        createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15'],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const m6Count = (result.gcode.match(/M6/g) || []).length;
      expect(m6Count).toBe(2); // One for each tool
    }
  });

  it('should not generate tool change for same tool', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
        createDrillOp({ id: 'drill-002', toolId: 'DRILL_5', position: { x: 200, y: 100, z: 0 } }),
      ],
      toolsUsed: ['DRILL_5'],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const m6Count = (result.gcode.match(/M6/g) || []).length;
      expect(m6Count).toBe(1); // Only initial tool load
    }
  });

  it('should report correct tool change count in stats', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
        createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
        createDrillOp({ id: 'drill-002', toolId: 'DRILL_8' }),
      ],
      toolsUsed: ['DRILL_5', 'BORE_15', 'DRILL_8'],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // With normalization, tools are grouped, so changes should be minimal
      expect(result.stats.toolChanges).toBeLessThanOrEqual(3);
    }
  });

  it('should turn on spindle after tool change', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('M3'); // Spindle on CW
      expect(result.gcode).toContain('S'); // Spindle speed
    }
  });
});

// ============================================================================
// Peck Drilling Tests
// ============================================================================

describe('FANUC Post - Peck Drilling', () => {
  it('should use G83 for peck drilling', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({
          depth: 30,
          peckDepth: 5,
        }),
      ],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G83');
      expect(result.gcode).toContain('Q5'); // Peck depth
    }
  });

  it('should use G81 for non-peck drilling', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({
          depth: 13,
          peckDepth: undefined,
        }),
      ],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G81');
      expect(result.gcode).not.toContain('G83');
    }
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('FANUC Post - Statistics', () => {
  it('should report line count', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.stats.lineCount).toBeGreaterThan(0);
      const actualLines = result.gcode.split('\n').length;
      expect(result.stats.lineCount).toBe(actualLines);
    }
  });

  it('should report operation count', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001' }),
        createDrillOp({ id: 'drill-002' }),
        createBoreOp({ id: 'bore-001' }),
      ],
    });
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.stats.operationCount).toBe(3);
    }
  });

  it('should estimate run time', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.stats.estimatedTimeSeconds).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Options Tests
// ============================================================================

describe('FANUC Post - Options', () => {
  it('should include line numbers when enabled', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, {
      ...defaultOpts,
      lineNumbers: true,
      lineNumberIncrement: 10,
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('N10');
      expect(result.gcode).toContain('N20');
    }
  });

  it('should exclude comments when disabled', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, {
      ...defaultOpts,
      includeComments: false,
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // Should have fewer parentheses (comments)
      const commentCount = (result.gcode.match(/\(/g) || []).length;
      expect(commentCount).toBeLessThan(5);
    }
  });

  it('should use custom safe Z', () => {
    const graph = createGraph();
    const result = fanucPostProcessor.post(graph, KDT_MACHINE, {
      ...defaultOpts,
      safeZ: 75,
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('R75'); // Retract plane in drill cycle
    }
  });
});
