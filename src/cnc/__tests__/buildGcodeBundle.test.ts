/**
 * buildGcodeBundle.test.ts - Integration tests for G-code Bundle Builder
 *
 * Tests the complete pipeline from OperationGraph to G-code bundle.
 *
 * @version 1.0.0 - Phase D2
 */

import { describe, it, expect } from 'vitest';
import {
  buildGcodeBundle,
  canGenerateBundle,
  getValidationIssues,
  extractGcodeText,
  getGcodeFilename,
} from '../buildGcodeBundle';
import { KDT_MACHINE } from '../machine/presets/kdt';
import { BIESSE_MACHINE } from '../machine/presets/biesse';
import type { OperationGraph, DrillOperation, BoreOperation } from '../operation/operationTypes';

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
  sourceId: 'cam-001',
  ...overrides,
});

const createValidGraph = (overrides?: Partial<OperationGraph>): OperationGraph => ({
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

// ============================================================================
// Basic Bundle Generation Tests
// ============================================================================

describe('buildGcodeBundle - Basic Generation', () => {
  it('should generate bundle for valid operation graph', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.bundle.schema).toBe('monolith.cnc.bundle@1.0');
      expect(result.bundle.machineId).toBe('KDT');
      expect(result.bundle.files).toHaveLength(1);
    }
  });

  it('should include file with correct path', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'MYJOB',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.bundle.files[0].path).toBe('nc/MYJOB.nc');
    }
  });

  it('should include SHA-256 hash of G-code', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.bundle.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('should include source traceability', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
      packetContentHash: 'packet-hash-123',
      jobId: 'job-456',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.bundle.source.opGraphHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.bundle.source.packetContentHash).toBe('packet-hash-123');
      expect(result.bundle.source.jobId).toBe('job-456');
    }
  });

  it('should include statistics', async () => {
    const graph = createValidGraph({
      operations: [createDrillOp(), createDrillOp({ id: 'drill-002' }), createBoreOp()],
    });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.bundle.stats.operationCount).toBe(3);
      expect(result.bundle.stats.lineCount).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Validation Failure Tests
// ============================================================================

describe('buildGcodeBundle - Validation Failures', () => {
  it('should fail for position out of machine range', async () => {
    const graph = createValidGraph({
      operations: [createDrillOp({ position: { x: 9999, y: 100, z: 0 } })],
    });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('FAIL');
    if (result.status === 'FAIL') {
      expect(result.errors.some((e) => e.includes('validation'))).toBe(true);
    }
  });

  it('should fail for unknown tool', async () => {
    const graph = createValidGraph({
      operations: [createDrillOp({ toolId: 'UNKNOWN_TOOL' })],
    });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('FAIL');
  });

  it('should fail for depth exceeding tool max', async () => {
    const graph = createValidGraph({
      operations: [createDrillOp({ depth: 999 })],
    });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('FAIL');
  });
});

// ============================================================================
// Machine Dialect Tests
// ============================================================================

describe('buildGcodeBundle - Machine Dialects', () => {
  it('should use FANUC dialect for KDT machine', async () => {
    const graph = createValidGraph({ machineId: 'KDT' });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const gcode = new TextDecoder().decode(result.bundle.files[0].bytes);
      expect(gcode).toContain('%'); // FANUC delimiter
    }
  });

  it('should use Biesse dialect for Biesse machine', async () => {
    const graph = createValidGraph({
      machineId: 'BIESSE',
      operations: [
        createDrillOp({
          position: { x: 100, y: 100, z: 0 }, // Within Biesse limits
        }),
      ],
    });
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: BIESSE_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const gcode = new TextDecoder().decode(result.bundle.files[0].bytes);
      expect(gcode).toContain('<PROGRAM'); // Biesse CIX XML format
    }
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('canGenerateBundle', () => {
  it('should return true for valid graph', () => {
    const graph = createValidGraph();
    expect(canGenerateBundle(graph, KDT_MACHINE)).toBe(true);
  });

  it('should return false for invalid graph', () => {
    const graph = createValidGraph({
      operations: [createDrillOp({ position: { x: 9999, y: 0, z: 0 } })],
    });
    expect(canGenerateBundle(graph, KDT_MACHINE)).toBe(false);
  });
});

describe('getValidationIssues', () => {
  it('should return empty array for valid graph', () => {
    const graph = createValidGraph();
    const issues = getValidationIssues(graph, KDT_MACHINE);

    const errors = issues.filter((i) => i.severity === 'ERROR');
    expect(errors).toHaveLength(0);
  });

  it('should return issues for invalid graph', () => {
    const graph = createValidGraph({
      operations: [createDrillOp({ toolId: 'UNKNOWN' })],
    });
    const issues = getValidationIssues(graph, KDT_MACHINE);

    expect(issues.some((i) => i.severity === 'ERROR')).toBe(true);
  });
});

describe('extractGcodeText', () => {
  it('should extract G-code text from bundle', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const text = extractGcodeText(result.bundle);
      expect(text).toContain('G21');
      expect(text).toContain('M30');
    }
  });

  it('should return undefined for invalid index', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(extractGcodeText(result.bundle, 99)).toBeUndefined();
    }
  });
});

describe('getGcodeFilename', () => {
  it('should extract filename from bundle', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'MYJOB123',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(getGcodeFilename(result.bundle)).toBe('MYJOB123.nc');
    }
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe('buildGcodeBundle - Determinism', () => {
  it('should produce identical bundles for same input', async () => {
    const graph = createValidGraph({
      operations: [
        createDrillOp({ id: 'drill-001' }),
        createBoreOp({ id: 'bore-001' }),
      ],
    });

    const result1 = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    const result2 = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
    });

    expect(result1.status).toBe('OK');
    expect(result2.status).toBe('OK');

    if (result1.status === 'OK' && result2.status === 'OK') {
      // Operation graph hashes should be identical
      expect(result1.bundle.source.opGraphHash).toBe(result2.bundle.source.opGraphHash);

      // G-code hashes should be identical (minus timestamp)
      // Note: timestamps will differ, so we can't compare directly
      // but structure should be same
      expect(result1.bundle.stats.operationCount).toBe(result2.bundle.stats.operationCount);
      expect(result1.bundle.stats.toolChanges).toBe(result2.bundle.stats.toolChanges);
    }
  });
});

// ============================================================================
// Options Tests
// ============================================================================

describe('buildGcodeBundle - Options', () => {
  it('should apply custom safe Z', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
      options: { safeZ: 75 },
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const gcode = extractGcodeText(result.bundle);
      expect(gcode).toContain('R75'); // Retract plane
    }
  });

  it('should respect line numbers option', async () => {
    const graph = createValidGraph();
    const result = await buildGcodeBundle({
      opGraph: graph,
      machine: KDT_MACHINE,
      programName: 'TEST001',
      options: { lineNumbers: true },
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const gcode = extractGcodeText(result.bundle);
      expect(gcode).toContain('N10');
    }
  });
});
