/**
 * mpr.test.ts - Homag/WoodWOP MPR Post Processor Tests
 *
 * Tests MPR section-based format generation for Homag CNC machines.
 * Validates header, panel, operation sections, tool mapping, and edge cases.
 *
 * @version 1.0.0 - Phase T028-P2
 */

import { describe, it, expect } from 'vitest';
import { mprPostProcessor, formatMprNumber, sanitizeMprString } from '../mpr';
import type { MachineProfile } from '../../../machine/machineProfile';
import type {
  OperationGraph,
  DrillOperation,
  BoreOperation,
  PocketOperation,
} from '../../../operation/operationTypes';
import type { PostProcessOptions } from '../../types';

// ============================================================================
// Test Machine Profile
// ============================================================================

const TEST_MACHINE: MachineProfile = {
  id: 'HOMAG',
  name: 'Homag CENTATEQ P-110',
  manufacturer: 'Homag Group',
  units: 'mm',
  coordinateSystem: 'Y_UP',
  dialect: 'MPR',
  supportsToolChange: true,
  toolMagazineSize: 16,
  axis: {
    x: { min: 0, max: 3000 },
    y: { min: 0, max: 1500 },
    z: { min: -60, max: 120 },
  },
  spindle: {
    minRpm: 1000,
    maxRpm: 24000,
    defaultRpm: 15000,
  },
  defaultSafeZ: 20,
  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 35,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2200,
      defaultPlungeRate: 1100,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 50,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 2000,
      defaultPlungeRate: 1000,
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
      defaultFeedRate: 1000,
      defaultPlungeRate: 400,
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
    machineId: 'HOMAG',
    safeZ: 20,
    rapidZ: 30,
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
 * Parse MPR output into sections.
 * Returns array of { header: string, params: Record<string, string> }.
 */
function parseMprSections(output: string): Array<{
  header: string;
  params: Record<string, string>;
  raw: string;
}> {
  const sections: Array<{ header: string; params: Record<string, string>; raw: string }> = [];

  // Match [sectionHeader ... ]
  const sectionRegex = /\[([^\n]+)\n([\s\S]*?)\]/g;
  let match;

  while ((match = sectionRegex.exec(output)) !== null) {
    const header = match[1].trim();
    const body = match[2].trim();
    const params: Record<string, string> = {};

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(';')) continue; // Skip comments
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const value = trimmed.substring(eqIdx + 1);
        params[key] = value;
      }
    }

    sections.push({ header, params, raw: match[0] });
  }

  return sections;
}

// ============================================================================
// Tests
// ============================================================================

describe('mprPostProcessor', () => {
  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('dialect properties', () => {
    it('has correct dialect identifier', () => {
      expect(mprPostProcessor.dialect).toBe('MPR');
    });

    it('has .mpr file extension', () => {
      expect(mprPostProcessor.fileExt).toBe('.mpr');
    });
  });

  // ==========================================================================
  // Header Section
  // ==========================================================================

  describe('header section [H]', () => {
    it('generates valid MPR header with VERSION', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const header = sections.find((s) => s.header === 'H');

      expect(header).toBeDefined();
      expect(header!.params.VERSION).toBe('"4.0.8.4"');
    });

    it('includes generation comment when comments enabled', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, {
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
      const result = mprPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: false,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).not.toContain('; Generated by');
    });
  });

  // ==========================================================================
  // Panel Section
  // ==========================================================================

  describe('panel section [001]', () => {
    it('generates panel section with KN, LX, LY, LZ', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const panel = sections.find((s) => s.header === '001');

      expect(panel).toBeDefined();
      expect(panel!.params.LV).toBe('0');
      expect(panel!.params.M).toBe('0');
      expect(panel!.params.KN).toBe('"TEST_PANEL"');
      // LX, LY, LZ should be present
      expect(panel!.params.LX).toBeDefined();
      expect(panel!.params.LY).toBeDefined();
      expect(panel!.params.LZ).toBeDefined();
    });

    it('uses program name as panel name (KN)', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        programName: 'BASE_CABINET_600',
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const panel = sections.find((s) => s.header === '001');
      expect(panel!.params.KN).toBe('"BASE_CABINET_600"');
    });
  });

  // ==========================================================================
  // Drill Operation (BOR)
  // ==========================================================================

  describe('drill operation → BOR section', () => {
    it('generates BOR section with correct parameters', () => {
      const drill = makeDrillOp({
        position: { x: 50, y: 37, z: 0 },
        depth: 12.5,
      });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      expect(borSection).toBeDefined();
      expect(borSection!.params.XA).toBe('50');
      expect(borSection!.params.YA).toBe('37');
      expect(borSection!.params.ZA).toBe('0');
      expect(borSection!.params.DU).toBe('5');
      expect(borSection!.params.TI).toBe('12.5');
    });

    it('assigns correct tool number (TNO)', () => {
      const drill = makeDrillOp({ toolId: 'DRILL_8' });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      // DRILL_8 is index 1 in tools array → TNO=2
      expect(borSection!.params.TNO).toBe('2');
    });

    it('uses DRILL_5 as TNO=1', () => {
      const drill = makeDrillOp({ toolId: 'DRILL_5' });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      // DRILL_5 is index 0 → TNO=1
      expect(borSection!.params.TNO).toBe('1');
    });

    it('defaults TNO=1 for unknown tool', () => {
      const drill = makeDrillOp({ toolId: 'UNKNOWN_TOOL' });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      expect(borSection!.params.TNO).toBe('1');
      expect(result.warnings.some((w) => w.includes('Unknown tool'))).toBe(true);
    });

    it('handles decimal position values', () => {
      const drill = makeDrillOp({
        position: { x: 125.5, y: 67.25, z: 0 },
        depth: 8.75,
      });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      expect(borSection!.params.XA).toBe('125.5');
      expect(borSection!.params.YA).toBe('67.25');
      expect(borSection!.params.TI).toBe('8.75');
    });

    it('includes operation comment', () => {
      const drill = makeDrillOp({ comment: 'System hole for dowel' });
      const graph = makeOpGraph([drill]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        includeComments: true,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.gcode).toContain('; System hole for dowel');
    });
  });

  // ==========================================================================
  // Bore Operation (BOR)
  // ==========================================================================

  describe('bore operation → BOR section', () => {
    it('generates BOR section for bore operation', () => {
      const bore = makeBoreOp({
        position: { x: 300, y: 360, z: 0 },
        diameter: 35,
        depth: 13,
      });
      const graph = makeOpGraph([bore]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      expect(borSection).toBeDefined();
      expect(borSection!.params.XA).toBe('300');
      expect(borSection!.params.YA).toBe('360');
      expect(borSection!.params.DU).toBe('35');
      expect(borSection!.params.TI).toBe('13');
    });

    it('assigns correct TNO for bore tools', () => {
      const bore = makeBoreOp({ toolId: 'BORE_35' });
      const graph = makeOpGraph([bore]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const borSection = sections.find((s) => s.params.ID === '"BOR"');

      // BORE_35 is index 3 → TNO=4
      expect(borSection!.params.TNO).toBe('4');
    });
  });

  // ==========================================================================
  // Multiple Operations
  // ==========================================================================

  describe('multiple operations', () => {
    it('generates sequential section numbers from 100', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1', position: { x: 50, y: 37, z: 0 } }),
        makeDrillOp({ id: 'drill-2', position: { x: 150, y: 37, z: 0 } }),
        makeBoreOp({ id: 'bore-1', position: { x: 300, y: 360, z: 0 } }),
      ];

      const graph = makeOpGraph(ops);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const opSections = sections.filter((s) => s.params.ID === '"BOR"');

      // Should have 3 BOR sections
      expect(opSections.length).toBe(3);

      // Section numbers should start at 100 (may not be sequential due to normalization sorting)
      const sectionNums = opSections.map((s) => parseInt(s.header));
      expect(sectionNums).toEqual([100, 101, 102]);
    });

    it('reports correct operation count in stats', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1' }),
        makeDrillOp({ id: 'drill-2' }),
        makeBoreOp({ id: 'bore-1' }),
      ];

      const graph = makeOpGraph(ops);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

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
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // After normalization, tools are grouped: BORE_35, DRILL_5, DRILL_8
      // Changes: initial (0) → BORE_35 (+0) → DRILL_5 (+1) → DRILL_8 (+1) = 2
      expect(result.stats.toolChanges).toBe(2);
    });
  });

  // ==========================================================================
  // Empty Program
  // ==========================================================================

  describe('empty program', () => {
    it('handles no operations gracefully', () => {
      const graph = makeOpGraph([]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.operationCount).toBe(0);
      expect(result.stats.toolChanges).toBe(0);
      expect(result.warnings).toContain('No operations to process');
    });

    it('still generates header and panel sections for empty program', () => {
      const graph = makeOpGraph([]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      expect(sections.find((s) => s.header === 'H')).toBeDefined();
      expect(sections.find((s) => s.header === '001')).toBeDefined();
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
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.warnings.some((w) => w.includes('Unsupported operation type for MPR: POCKET'))).toBe(true);
      expect(result.stats.operationCount).toBe(0);
    });

    it('processes supported ops and warns about unsupported ones', () => {
      const drill = makeDrillOp({ id: 'drill-1' });
      const pocket: PocketOperation = {
        id: 'pocket-1',
        sourceId: 'pk-1',
        toolId: 'ROUTER_6',
        type: 'POCKET',
        position: { x: 100, y: 100, z: 0 },
        width: 50,
        height: 30,
        depth: 10,
        cornerRadius: 5,
        stepover: 0.5,
      };

      const graph = makeOpGraph([drill, pocket]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // Should process the drill and warn about the pocket
      expect(result.stats.operationCount).toBe(1);
      expect(result.warnings.some((w) => w.includes('POCKET'))).toBe(true);
    });
  });

  // ==========================================================================
  // Output Format Validation
  // ==========================================================================

  describe('output format', () => {
    it('uses CRLF line endings', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // Should contain \r\n sequences
      expect(result.gcode).toContain('\r\n');
    });

    it('produces valid section syntax with [ and ]', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      // Should have matching brackets
      const openCount = (result.gcode.match(/\[/g) || []).length;
      const closeCount = (result.gcode.match(/\]/g) || []).length;
      expect(openCount).toBe(closeCount);
      expect(openCount).toBeGreaterThanOrEqual(3); // H, 001, at least one op
    });

    it('section order is H → 001 → operations', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);

      expect(sections[0].header).toBe('H');
      expect(sections[1].header).toBe('001');
      // Operation sections follow
      expect(parseInt(sections[2].header)).toBeGreaterThanOrEqual(100);
    });
  });

  // ==========================================================================
  // Determinism
  // ==========================================================================

  describe('determinism', () => {
    it('same input produces identical output', () => {
      const ops = [
        makeDrillOp({ id: 'drill-1', position: { x: 50, y: 37, z: 0 } }),
        makeDrillOp({ id: 'drill-2', position: { x: 150, y: 37, z: 0 } }),
        makeBoreOp({ id: 'bore-1', position: { x: 300, y: 360, z: 0 } }),
      ];

      const graph = makeOpGraph(ops);

      // Use fixed timestamp options
      const fixedOpts: PostProcessOptions = {
        ...DEFAULT_OPTS,
        includeComments: false, // Exclude timestamps for determinism
      };

      const result1 = mprPostProcessor.post(graph, TEST_MACHINE, fixedOpts);
      const result2 = mprPostProcessor.post(graph, TEST_MACHINE, fixedOpts);

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
      // Create a graph with operations that will cause normalizeOperations to throw
      // by passing a non-iterable value as operations
      const badGraph = {
        machineId: 'HOMAG',
        safeZ: 20,
        rapidZ: 30,
        operations: 42 as any, // Non-array, non-null → normalizeOperations will throw
        metadata: {
          jobId: 'JOB-BAD',
          sourceContentHash: 'bad',
          builtAt: new Date().toISOString(),
          toolVersion: '1.0.0',
        },
        toolsUsed: [],
      } as OperationGraph;

      const result = mprPostProcessor.post(badGraph, TEST_MACHINE, DEFAULT_OPTS);
      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.errors[0]).toContain('MPR post-processor error');
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
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.estimatedTimeSeconds).toBeGreaterThan(0);
    });

    it('reports lineCount matching output', () => {
      const graph = makeOpGraph([makeDrillOp()]);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, DEFAULT_OPTS);

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      expect(result.stats.lineCount).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // preserveOrder option
  // ==========================================================================

  describe('preserveOrder', () => {
    it('preserves operation order when preserveOrder=true', () => {
      const ops = [
        makeBoreOp({ id: 'bore-first', toolId: 'BORE_35', position: { x: 300, y: 360, z: 0 } }),
        makeDrillOp({ id: 'drill-second', toolId: 'DRILL_5', position: { x: 50, y: 37, z: 0 } }),
      ];

      const graph = makeOpGraph(ops);
      const result = mprPostProcessor.post(graph, TEST_MACHINE, {
        ...DEFAULT_OPTS,
        preserveOrder: true,
      });

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;

      const sections = parseMprSections(result.gcode);
      const opSections = sections.filter((s) => s.params.ID === '"BOR"');

      // First op should be the bore (diameter 35)
      expect(opSections[0].params.DU).toBe('35');
      // Second op should be the drill (diameter 5)
      expect(opSections[1].params.DU).toBe('5');
    });
  });
});

// ============================================================================
// Formatting Utilities Tests
// ============================================================================

describe('formatMprNumber', () => {
  it('formats integers without decimal point', () => {
    expect(formatMprNumber(50)).toBe('50');
    expect(formatMprNumber(0)).toBe('0');
    expect(formatMprNumber(1000)).toBe('1000');
  });

  it('formats decimals with trailing zero removal', () => {
    expect(formatMprNumber(12.5)).toBe('12.5');
    expect(formatMprNumber(12.50)).toBe('12.5');
    expect(formatMprNumber(12.500)).toBe('12.5');
  });

  it('preserves significant decimals', () => {
    expect(formatMprNumber(67.25)).toBe('67.25');
    expect(formatMprNumber(8.125)).toBe('8.125');
  });

  it('rounds floating point artifacts', () => {
    expect(formatMprNumber(0.1 + 0.2)).toBe('0.3');
  });

  it('handles negative numbers', () => {
    expect(formatMprNumber(-5)).toBe('-5');
    expect(formatMprNumber(-12.5)).toBe('-12.5');
  });
});

describe('sanitizeMprString', () => {
  it('replaces double quotes with single quotes', () => {
    expect(sanitizeMprString('test "value"')).toBe("test 'value'");
  });

  it('removes brackets', () => {
    expect(sanitizeMprString('test [value]')).toBe('test value');
  });

  it('removes non-ASCII characters', () => {
    expect(sanitizeMprString('test\u00E9value')).toBe('testvalue');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeMprString(long)).toHaveLength(80);
  });

  it('trims whitespace', () => {
    expect(sanitizeMprString('  test  ')).toBe('test');
  });
});
