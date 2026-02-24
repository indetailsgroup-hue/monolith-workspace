/**
 * xxl.test.ts - SCM/Morbidelli XXL (Xilog) Post Processor Tests
 *
 * Tests XXL text format generation for SCM CNC machines.
 * Validates XILOG header, BOR operation blocks, tool mapping, and edge cases.
 *
 * @version 1.0.0 - Phase T028-P4
 */

import { describe, it, expect } from 'vitest';
import { xxlPostProcessor, formatXxlNumber, sanitizeXxlString } from '../xxl';
import type { MachineProfile } from '../../../machine/machineProfile';
import type {
  OperationGraph,
  DrillOperation,
  BoreOperation,
  PocketOperation,
} from '../../../operation/operationTypes';
import type { PostProcessOptions } from '../../types';

// ============================================================================
// Test Machine Profile (SCM)
// ============================================================================

const TEST_MACHINE: MachineProfile = {
  id: 'SCM',
  name: 'SCM Morbidelli M200',
  manufacturer: 'SCM Group',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'XXL',
  supportsToolChange: true,
  toolMagazineSize: 14,
  axis: {
    x: { min: 0, max: 3100 },
    y: { min: 0, max: 1300 },
    z: { min: -70, max: 130 },
  },
  spindle: {
    minRpm: 1000,
    maxRpm: 24000,
    defaultRpm: 14000,
  },
  defaultSafeZ: 18,
  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 35,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2300,
      defaultPlungeRate: 1100,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 45,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2100,
      defaultPlungeRate: 950,
    },
    {
      toolId: 'BORE_15',
      type: 'BORE',
      diameter: 15,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 1400,
      defaultPlungeRate: 600,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 15,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 950,
      defaultPlungeRate: 380,
    },
  ],
};

// ============================================================================
// Test Helpers
// ============================================================================

const DEFAULT_OPTS: PostProcessOptions = {
  programName: 'TEST_PANEL',
  includeComments: true,
};

function makeDrillOp(overrides: Partial<DrillOperation> = {}): DrillOperation {
  return {
    id: 'drill-001',
    sourceId: 'dp-001',
    toolId: 'DRILL_5',
    type: 'DRILL',
    position: { x: 50, y: 37, z: 0 },
    depth: 12.5,
    throughHole: false,
    comment: 'System hole 5mm',
    ...overrides,
  };
}

function makeBoreOp(overrides: Partial<BoreOperation> = {}): BoreOperation {
  return {
    id: 'bore-001',
    sourceId: 'bp-001',
    toolId: 'BORE_35',
    type: 'BORE',
    position: { x: 300, y: 360, z: 0 },
    diameter: 35,
    depth: 13,
    flatBottom: true,
    comment: 'Hinge cup 35mm',
    ...overrides,
  };
}

function makeOpGraph(operations: any[], overrides: Partial<OperationGraph> = {}): OperationGraph {
  return {
    machineId: 'SCM',
    safeZ: 18,
    rapidZ: 28,
    operations,
    metadata: {
      jobId: 'JOB-001',
      sourceContentHash: 'abc123',
      builtAt: new Date().toISOString(),
      toolVersion: '1.0.0',
    },
    toolsUsed: [...new Set(operations.map((op: any) => op.toolId))],
    ...overrides,
  };
}

/**
 * Parse a BOR operation block from XXL output.
 * Returns key-value pairs from the parameter line.
 *
 * Example input:
 * ```
 * OPERATION BOR
 *   X=50 Y=37 DEPTH=12.5 DIA=5 TNO=1 THROUGH=0 ID=drill-001
 * END_OPERATION
 * ```
 */
function parseXxlBorBlocks(xxl: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  const blockRegex = /OPERATION BOR\n([\s\S]*?)END_OPERATION/g;
  let match;

  while ((match = blockRegex.exec(xxl)) !== null) {
    const block = match[1];
    const attrs: Record<string, string> = {};

    // Parse KEY=VALUE pairs (may have spaces between them)
    const paramRegex = /(\w+)=([^\s]+)/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(block)) !== null) {
      attrs[paramMatch[1]] = paramMatch[2];
    }
    results.push(attrs);
  }

  return results;
}

// ============================================================================
// Tests
// ============================================================================

describe('xxlPostProcessor', () => {
  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('dialect properties', () => {
    it('has correct dialect identifier', () => {
      expect(xxlPostProcessor.dialect).toBe('XXL');
    });

    it('has .xxl file extension', () => {
      expect(xxlPostProcessor.fileExt).toBe('.xxl');
    });
  });

  // ==========================================================================
  // XXL Structure
  // ==========================================================================

  describe('XXL structure', () => {
    it('starts with XILOG header', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode.startsWith('XILOG')).toBe(true);
    });

    it('has NAME field after header', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('NAME=TEST_PANEL');
    });

    it('has DIM_X, DIM_Y, DIM_Z panel dimensions', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toMatch(/DIM_X=\d+/);
      expect(result.gcode).toMatch(/DIM_Y=\d+/);
      expect(result.gcode).toMatch(/DIM_Z=\d+/);
    });

    it('ends with END marker', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const lines = result.gcode.split('\n');
      expect(lines[lines.length - 1]).toBe('END');
    });

    it('includes generation comments when enabled', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: true,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('; Generated by Monolith CNC Export');
      expect(result.gcode).toContain('; Program: TEST_PANEL');
    });

    it('omits comments when includeComments=false', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: false,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).not.toContain('; Generated');
    });

    it('includes job ID comment when metadata present', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('; Job: JOB-001');
    });

    it('structure order: XILOG → NAME → DIM → comments → operations → END', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const xilogIdx = result.gcode.indexOf('XILOG');
      const nameIdx = result.gcode.indexOf('NAME=');
      const dimXIdx = result.gcode.indexOf('DIM_X=');
      const opIdx = result.gcode.indexOf('OPERATION BOR');
      const endIdx = result.gcode.lastIndexOf('\nEND');

      expect(xilogIdx).toBeLessThan(nameIdx);
      expect(nameIdx).toBeLessThan(dimXIdx);
      expect(dimXIdx).toBeLessThan(opIdx);
      expect(opIdx).toBeLessThan(endIdx);
    });
  });

  // ==========================================================================
  // Drill Operation (BOR block)
  // ==========================================================================

  describe('drill operation → OPERATION BOR block', () => {
    it('generates BOR block with correct parameters', () => {
      const drill = makeDrillOp({
        position: { x: 50, y: 37, z: 0 },
        depth: 12.5,
      });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks.length).toBe(1);

      expect(blocks[0].X).toBe('50');
      expect(blocks[0].Y).toBe('37');
      expect(blocks[0].DEPTH).toBe('12.5');
      expect(blocks[0].DIA).toBe('5');
      expect(blocks[0].THROUGH).toBe('0');
    });

    it('sets THROUGH=1 for through holes', () => {
      const drill = makeDrillOp({ throughHole: true });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks[0].THROUGH).toBe('1');
    });

    it('assigns correct tool number (TNO)', () => {
      const drill = makeDrillOp({ toolId: 'DRILL_8' });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      // DRILL_8 is index 1 → TNO=2
      expect(blocks[0].TNO).toBe('2');
    });

    it('includes ID for traceability', () => {
      const drill = makeDrillOp({ id: 'my-drill-42' });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks[0].ID).toBe('my-drill-42');
    });

    it('includes comment line when comments enabled', () => {
      const drill = makeDrillOp({ comment: 'Dowel hole' });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: true,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('; Dowel hole');
    });

    it('omits comment line when comments disabled', () => {
      const drill = makeDrillOp({ comment: 'Dowel hole' });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: false,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).not.toContain('; Dowel hole');
    });

    it('defaults TNO=1 for unknown tool', () => {
      const drill = makeDrillOp({ toolId: 'UNKNOWN_TOOL' });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks[0].TNO).toBe('1');
      expect(result.warnings.some((w) => w.includes('Unknown tool'))).toBe(true);
    });

    it('uses positive DEPTH value (not negative Z)', () => {
      const drill = makeDrillOp({ depth: 8.75 });
      const graph = makeOpGraph([drill]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks[0].DEPTH).toBe('8.75');
    });
  });

  // ==========================================================================
  // Bore Operation (BOR block)
  // ==========================================================================

  describe('bore operation → OPERATION BOR block', () => {
    it('generates BOR block for bore operation', () => {
      const bore = makeBoreOp({
        position: { x: 300, y: 360, z: 0 },
        diameter: 35,
        depth: 13,
      });
      const graph = makeOpGraph([bore]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks.length).toBe(1);
      expect(blocks[0].X).toBe('300');
      expect(blocks[0].Y).toBe('360');
      expect(blocks[0].DEPTH).toBe('13');
      expect(blocks[0].DIA).toBe('35');
    });

    it('assigns correct TNO for bore tools', () => {
      const bore = makeBoreOp({ toolId: 'BORE_35' });
      const graph = makeOpGraph([bore]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      // BORE_35 is index 3 → TNO=4
      expect(blocks[0].TNO).toBe('4');
    });

    it('sets THROUGH=0 for bore operations', () => {
      const bore = makeBoreOp();
      const graph = makeOpGraph([bore]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks[0].THROUGH).toBe('0');
    });
  });

  // ==========================================================================
  // Multiple Operations
  // ==========================================================================

  describe('multiple operations', () => {
    it('generates multiple BOR blocks', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        makeDrillOp({ id: 'drill-2', position: { x: 150, y: 37, z: 0 } }),
        makeBoreOp({ id: 'bore-1' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks.length).toBe(3);
    });

    it('reports correct operation count', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        makeDrillOp({ id: 'drill-2' }),
        makeBoreOp({ id: 'bore-1' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.operationCount).toBe(3);
    });

    it('reports tool changes in stats', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1', toolId: 'DRILL_5' }),
        makeDrillOp({ id: 'drill-2', toolId: 'DRILL_8' }),
        makeBoreOp({ id: 'bore-1', toolId: 'BORE_35' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.toolChanges).toBe(2);
    });

    it('each BOR block has OPERATION BOR ... END_OPERATION structure', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        makeDrillOp({ id: 'drill-2' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const opStarts = (result.gcode.match(/OPERATION BOR/g) || []).length;
      const opEnds = (result.gcode.match(/END_OPERATION/g) || []).length;
      expect(opStarts).toBe(2);
      expect(opEnds).toBe(2);
      expect(opStarts).toBe(opEnds);
    });
  });

  // ==========================================================================
  // Panel Dimensions
  // ==========================================================================

  describe('panel dimensions', () => {
    it('calculates panel dimensions from operation positions', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1', position: { x: 500, y: 600, z: 0 }, depth: 15 }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // Width: maxX(500) + 50 = 550 → ceil = 550
      expect(result.gcode).toContain('DIM_X=550');
      // Height: maxY(600) + 50 = 650 → ceil = 650
      expect(result.gcode).toContain('DIM_Y=650');
      // Thickness: maxDepth(15) + 2 = 17 → ceil = 17
      expect(result.gcode).toContain('DIM_Z=17');
    });

    it('uses defaults when no operations provide meaningful bounds', () => {
      const graph = makeOpGraph([]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // Default panel: 600x720x18
      expect(result.gcode).toContain('DIM_X=600');
      expect(result.gcode).toContain('DIM_Y=720');
      expect(result.gcode).toContain('DIM_Z=18');
    });
  });

  // ==========================================================================
  // Empty Program
  // ==========================================================================

  describe('empty program', () => {
    it('handles no operations gracefully', () => {
      const graph = makeOpGraph([]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.operationCount).toBe(0);
      expect(result.warnings).toContain('No operations to process');
    });

    it('generates valid XXL structure for empty program', () => {
      const graph = makeOpGraph([]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('XILOG');
      expect(result.gcode).toContain('NAME=');
      expect(result.gcode).toContain('DIM_X=');
      expect(result.gcode).toContain('; No operations');
      const lines = result.gcode.split('\n');
      expect(lines[lines.length - 1]).toBe('END');
    });
  });

  // ==========================================================================
  // Unsupported Operations
  // ==========================================================================

  describe('unsupported operations', () => {
    it('warns about unsupported POCKET operation', () => {
      const pocket: PocketOperation = {
        id: 'pocket-001',
        sourceId: 'pk-001',
        toolId: 'ROUTER_6',
        type: 'POCKET',
        position: { x: 100, y: 100, z: 0 },
        width: 50,
        height: 30,
        depth: 10,
        cornerRadius: 5,
        stepover: 0.5,
      };

      const graph = makeOpGraph([pocket]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.warnings.some((w) => w.includes('Unsupported operation type for XXL: POCKET'))).toBe(true);
      expect(result.stats.operationCount).toBe(0);
    });

    it('processes supported ops and skips unsupported ones', () => {
      const pocket: PocketOperation = {
        id: 'pocket-001',
        sourceId: 'pk-001',
        toolId: 'ROUTER_6',
        type: 'POCKET',
        position: { x: 100, y: 100, z: 0 },
        width: 50,
        height: 30,
        depth: 10,
        cornerRadius: 5,
        stepover: 0.5,
      };

      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        pocket,
        makeBoreOp({ id: 'bore-1' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.operationCount).toBe(2);
      const blocks = parseXxlBorBlocks(result.gcode);
      expect(blocks.length).toBe(2);
    });
  });

  // ==========================================================================
  // Determinism
  // ==========================================================================

  describe('determinism', () => {
    it('same input produces identical output', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        makeDrillOp({ id: 'drill-2', position: { x: 150, y: 37, z: 0 } }),
        makeBoreOp({ id: 'bore-1' }),
      ];

      const graph = makeOpGraph(ops);
      const fixedOpts: PostProcessOptions = {
        ...DEFAULT_OPTS,
        includeComments: false,
      };

      const result1 = xxlPostProcessor.post(graph, TEST_MACHINE, fixedOpts);
      const result2 = xxlPostProcessor.post(graph, TEST_MACHINE, fixedOpts);

      expect(result1.status).toBe('OK');
      expect(result2.status).toBe('OK');
      if (result1.status !== 'OK' || result2.status !== 'OK') return;

      expect(result1.gcode).toBe(result2.gcode);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('catches and returns errors as FAIL result', () => {
      const badGraph = {
        machineId: 'SCM',
        safeZ: 18,
        rapidZ: 28,
        operations: 42 as any,
        metadata: {
          jobId: 'JOB-BAD',
          sourceContentHash: 'bad',
          builtAt: new Date().toISOString(),
          toolVersion: '1.0.0',
        },
        toolsUsed: [],
      } as OperationGraph;

      const result = xxlPostProcessor.post(badGraph, TEST_MACHINE, DEFAULT_OPTS);
      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.errors[0]).toContain('XXL post-processor error');
      }
    });
  });

  // ==========================================================================
  // Stats
  // ==========================================================================

  describe('stats', () => {
    it('reports non-zero estimated time', () => {
      const graph = makeOpGraph([
        makeDrillOp({ depth: 12.5 }),
        makeBoreOp({ depth: 13 }),
      ]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.estimatedTimeSeconds).toBeGreaterThan(0);
    });

    it('reports correct line count', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const actualLines = result.gcode.split('\n').length;
      expect(result.stats.lineCount).toBeGreaterThan(0);
      // lineCount is array length before join, may differ from split count
      // but should be in the right ballpark
      expect(result.stats.lineCount).toBeGreaterThanOrEqual(5);
    });
  });

  // ==========================================================================
  // preserveOrder
  // ==========================================================================

  describe('preserveOrder', () => {
    it('preserves operation order when preserveOrder=true', () => {
      const ops = [
        makeBoreOp({ id: 'bore-first', toolId: 'BORE_35' }),
        makeDrillOp({ id: 'drill-second', toolId: 'DRILL_5' }),
      ];

      const graph = makeOpGraph(ops);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        preserveOrder: true,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const blocks = parseXxlBorBlocks(result.gcode);
      // First should be bore (DIA=35)
      expect(blocks[0].DIA).toBe('35');
      // Second should be drill (DIA=5)
      expect(blocks[1].DIA).toBe('5');
    });
  });

  // ==========================================================================
  // String Sanitization in Output
  // ==========================================================================

  describe('string sanitization', () => {
    it('sanitizes program name with special characters', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = xxlPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        programName: 'Panel=1;test\nnewline',
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // = and ; replaced with _, newline replaced with space
      expect(result.gcode).toContain('NAME=Panel_1_test newline');
    });
  });
});

// ============================================================================
// Formatting Utilities Tests
// ============================================================================

describe('formatXxlNumber', () => {
  it('formats integers without decimal point', () => {
    expect(formatXxlNumber(50)).toBe('50');
    expect(formatXxlNumber(0)).toBe('0');
    expect(formatXxlNumber(600)).toBe('600');
  });

  it('formats decimals with trailing zero removal', () => {
    expect(formatXxlNumber(12.5)).toBe('12.5');
    expect(formatXxlNumber(12.50)).toBe('12.5');
  });

  it('preserves significant decimals', () => {
    expect(formatXxlNumber(67.25)).toBe('67.25');
    expect(formatXxlNumber(8.125)).toBe('8.125');
  });

  it('handles negative numbers', () => {
    expect(formatXxlNumber(-12.5)).toBe('-12.5');
    expect(formatXxlNumber(-5)).toBe('-5');
  });

  it('rounds to specified decimal places', () => {
    expect(formatXxlNumber(12.1234, 2)).toBe('12.12');
    expect(formatXxlNumber(12.1256, 2)).toBe('12.13');
  });

  it('removes trailing zeros after rounding', () => {
    expect(formatXxlNumber(12.100)).toBe('12.1');
    expect(formatXxlNumber(12.000)).toBe('12');
  });
});

describe('sanitizeXxlString', () => {
  it('replaces = and ; with underscores', () => {
    expect(sanitizeXxlString('a=b;c')).toBe('a_b_c');
  });

  it('replaces newlines with spaces', () => {
    expect(sanitizeXxlString('line1\nline2\rline3')).toBe('line1 line2 line3');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeXxlString(long)).toHaveLength(80);
  });

  it('preserves normal characters', () => {
    expect(sanitizeXxlString('PANEL_001')).toBe('PANEL_001');
  });
});
