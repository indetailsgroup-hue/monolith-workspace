/**
 * validateOperationGraph.test.ts - Unit tests for Operation Graph Validation
 *
 * Tests validation of operation graphs against machine constraints.
 *
 * @version 1.0.0 - Phase D1
 */

import { describe, it, expect } from 'vitest';
import {
  validateOperationGraph,
  isValidGraph,
  getValidationErrors,
  getValidationWarnings,
  formatValidationResult,
  ValidationCodes,
} from '../mapping/validateOperationGraph';
import { KDT_MACHINE } from '../machine/presets/kdt';
import type { OperationGraph, DrillOperation, BoreOperation } from '../operation/operationTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillOp = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  type: 'DRILL',
  id: 'drill-001',
  sourceId: 'point-001',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  throughHole: false,
  ...overrides,
});

const createBoreOp = (overrides?: Partial<BoreOperation>): BoreOperation => ({
  type: 'BORE',
  id: 'bore-001',
  sourceId: 'point-002',
  toolId: 'BORE_15',
  position: { x: 200, y: 200, z: 0 },
  diameter: 15,
  depth: 12,
  flatBottom: true,
  ...overrides,
});

const createGraph = (overrides?: Partial<OperationGraph>): OperationGraph => ({
  machineId: 'KDT',
  safeZ: 50,
  rapidZ: 60,
  operations: [createDrillOp(), createBoreOp()],
  metadata: {
    jobId: 'job-001',
    sourceContentHash: 'abc123',
    builtAt: '2024-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
  toolsUsed: ['DRILL_5', 'BORE_15'],
  ...overrides,
});

// ============================================================================
// Basic Validation Tests
// ============================================================================

describe('validateOperationGraph - Basic Validation', () => {
  it('should pass validation for valid graph', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('should include validation timestamp', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.validatedAt).toBeDefined();
    expect(new Date(result.validatedAt).getTime()).toBeGreaterThan(0);
  });

  it('should count errors and warnings', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ depth: 0 }), // Error: invalid depth
        createDrillOp({ id: 'drill-002', peckDepth: 0 }), // Warning: invalid peck
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.warningCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// Machine ID Validation Tests
// ============================================================================

describe('validateOperationGraph - Machine ID', () => {
  it('should error when machine ID mismatch', () => {
    const graph = createGraph({ machineId: 'BIESSE' });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.MACHINE_MISMATCH)).toBe(true);
  });

  it('should pass when machine ID matches', () => {
    const graph = createGraph({ machineId: 'KDT' });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.MACHINE_MISMATCH)).toBe(false);
  });
});

// ============================================================================
// Empty Graph Validation Tests
// ============================================================================

describe('validateOperationGraph - Empty Graph', () => {
  it('should warn for empty operations', () => {
    const graph = createGraph({ operations: [], toolsUsed: [] });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.EMPTY_GRAPH)).toBe(true);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it('should still be valid with warning for empty graph', () => {
    const graph = createGraph({ operations: [], toolsUsed: [] });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    // Empty graph is a warning, not an error
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Tool Validation Tests
// ============================================================================

describe('validateOperationGraph - Tool Validation', () => {
  it('should error when tool not found', () => {
    const graph = createGraph({
      operations: [createDrillOp({ toolId: 'NONEXISTENT_TOOL' })],
      toolsUsed: ['NONEXISTENT_TOOL'],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.TOOL_NOT_FOUND)).toBe(true);
  });

  it('should error for each missing tool in toolsUsed', () => {
    const graph = createGraph({
      operations: [createDrillOp()],
      toolsUsed: ['DRILL_5', 'MISSING_1', 'MISSING_2'],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    const toolNotFoundErrors = result.issues.filter(
      (i) => i.code === ValidationCodes.TOOL_NOT_FOUND
    );
    expect(toolNotFoundErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('should error when drill operation uses non-drill tool', () => {
    const graph = createGraph({
      operations: [createDrillOp({ toolId: 'BORE_15' })], // Bore tool for drill op
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.TOOL_TYPE_MISMATCH)).toBe(true);
  });

  it('should error when bore operation uses non-bore tool', () => {
    const graph = createGraph({
      operations: [createBoreOp({ toolId: 'DRILL_5' })], // Drill tool for bore op
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.TOOL_TYPE_MISMATCH)).toBe(true);
  });
});

// ============================================================================
// Depth Validation Tests
// ============================================================================

describe('validateOperationGraph - Depth Validation', () => {
  it('should error for zero depth', () => {
    const graph = createGraph({
      operations: [createDrillOp({ depth: 0 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DEPTH)).toBe(true);
  });

  it('should error for negative depth', () => {
    const graph = createGraph({
      operations: [createDrillOp({ depth: -5 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DEPTH)).toBe(true);
  });

  it('should error when depth exceeds tool max', () => {
    const graph = createGraph({
      operations: [createDrillOp({ depth: 100 })], // Very deep
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.TOOL_DEPTH_EXCEEDED)).toBe(true);
  });

  it('should pass for valid depth', () => {
    const graph = createGraph({
      operations: [createDrillOp({ depth: 10 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DEPTH)).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.TOOL_DEPTH_EXCEEDED)).toBe(false);
  });

  it('should warn for invalid peck depth', () => {
    const graph = createGraph({
      operations: [createDrillOp({ peckDepth: 0 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.severity === 'WARNING')).toBe(true);
  });
});

// ============================================================================
// Position/Axis Validation Tests
// ============================================================================

describe('validateOperationGraph - Position Validation', () => {
  it('should error for X position out of range', () => {
    const graph = createGraph({
      operations: [createDrillOp({ position: { x: 5000, y: 100, z: 0 } })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.POSITION_OUT_OF_RANGE)).toBe(true);
  });

  it('should error for Y position out of range', () => {
    const graph = createGraph({
      operations: [createDrillOp({ position: { x: 100, y: 2000, z: 0 } })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.POSITION_OUT_OF_RANGE)).toBe(true);
  });

  it('should error for Z position out of range', () => {
    const graph = createGraph({
      operations: [createDrillOp({ position: { x: 100, y: 100, z: -200 } })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === ValidationCodes.POSITION_OUT_OF_RANGE)).toBe(true);
  });

  it('should pass for position at axis limits', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ position: { x: 0, y: 0, z: 0 } }),
        createDrillOp({ id: 'drill-002', position: { x: 3200, y: 1300, z: -50 } }),
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.POSITION_OUT_OF_RANGE)).toBe(false);
  });

  it('should include position details in error', () => {
    const graph = createGraph({
      operations: [createDrillOp({ position: { x: 9999, y: 100, z: 0 } })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    const posError = result.issues.find((i) => i.code === ValidationCodes.POSITION_OUT_OF_RANGE);
    expect(posError?.details?.position).toBeDefined();
  });
});

// ============================================================================
// Bore Operation Specific Tests
// ============================================================================

describe('validateOperationGraph - Bore Validation', () => {
  it('should warn when bore diameter does not match tool', () => {
    const graph = createGraph({
      operations: [createBoreOp({ diameter: 16 })], // BORE_15 tool is 15mm
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DIAMETER)).toBe(true);
  });

  it('should not warn when bore diameter matches tool', () => {
    const graph = createGraph({
      operations: [createBoreOp({ diameter: 15, toolId: 'BORE_15' })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DIAMETER)).toBe(false);
  });

  it('should error for invalid bore depth', () => {
    const graph = createGraph({
      operations: [createBoreOp({ depth: 0 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.issues.some((i) => i.code === ValidationCodes.INVALID_DEPTH)).toBe(true);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('isValidGraph', () => {
  it('should return true for valid graph', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(isValidGraph(result)).toBe(true);
  });

  it('should return false for invalid graph', () => {
    const graph = createGraph({
      operations: [createDrillOp({ toolId: 'NONEXISTENT' })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(isValidGraph(result)).toBe(false);
  });
});

describe('getValidationErrors', () => {
  it('should return only errors', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ depth: 0 }), // Error
        createDrillOp({ id: 'drill-002', peckDepth: 0 }), // Warning
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const errors = getValidationErrors(result);

    expect(errors.every((e) => e.severity === 'ERROR')).toBe(true);
  });

  it('should return empty array when no errors', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const errors = getValidationErrors(result);

    expect(errors).toHaveLength(0);
  });
});

describe('getValidationWarnings', () => {
  it('should return only warnings', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ depth: 0 }), // Error
        createDrillOp({ id: 'drill-002', peckDepth: 0 }), // Warning
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const warnings = getValidationWarnings(result);

    expect(warnings.every((w) => w.severity === 'WARNING')).toBe(true);
  });

  it('should return empty array when no warnings', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const warnings = getValidationWarnings(result);

    expect(warnings).toHaveLength(0);
  });
});

describe('formatValidationResult', () => {
  it('should format result as string', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const formatted = formatValidationResult(result);

    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should include PASSED for valid graph', () => {
    const graph = createGraph();
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const formatted = formatValidationResult(result);

    expect(formatted).toContain('PASSED');
  });

  it('should include FAILED for invalid graph', () => {
    const graph = createGraph({
      operations: [createDrillOp({ toolId: 'NONEXISTENT' })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const formatted = formatValidationResult(result);

    expect(formatted).toContain('FAILED');
  });

  it('should include error and warning counts', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ depth: 0 }),
        createDrillOp({ id: 'drill-002', peckDepth: 0 }),
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const formatted = formatValidationResult(result);

    expect(formatted).toContain('Errors:');
    expect(formatted).toContain('Warnings:');
  });

  it('should include issue codes and messages', () => {
    const graph = createGraph({
      operations: [createDrillOp({ depth: 0 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);
    const formatted = formatValidationResult(result);

    expect(formatted).toContain(ValidationCodes.INVALID_DEPTH);
  });
});

// ============================================================================
// Multiple Issues Tests
// ============================================================================

describe('validateOperationGraph - Multiple Issues', () => {
  it('should collect all issues from all operations', () => {
    const graph = createGraph({
      operations: [
        createDrillOp({ id: 'drill-001', depth: 0 }),
        createDrillOp({ id: 'drill-002', depth: -5 }),
        createBoreOp({ id: 'bore-001', depth: 0 }),
      ],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    expect(result.errorCount).toBe(3);
  });

  it('should include operation ID in issues', () => {
    const graph = createGraph({
      operations: [createDrillOp({ id: 'my-drill-abc', depth: 0 })],
    });
    const result = validateOperationGraph(graph, KDT_MACHINE);

    const issue = result.issues.find((i) => i.code === ValidationCodes.INVALID_DEPTH);
    expect(issue?.operationId).toBe('my-drill-abc');
  });
});

// ============================================================================
// ValidationCodes Tests
// ============================================================================

describe('ValidationCodes', () => {
  it('should have unique codes', () => {
    const codes = Object.values(ValidationCodes);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have all expected codes', () => {
    expect(ValidationCodes.TOOL_NOT_FOUND).toBeDefined();
    expect(ValidationCodes.TOOL_DEPTH_EXCEEDED).toBeDefined();
    expect(ValidationCodes.TOOL_TYPE_MISMATCH).toBeDefined();
    expect(ValidationCodes.POSITION_OUT_OF_RANGE).toBeDefined();
    expect(ValidationCodes.INVALID_DEPTH).toBeDefined();
    expect(ValidationCodes.INVALID_DIAMETER).toBeDefined();
    expect(ValidationCodes.EMPTY_GRAPH).toBeDefined();
    expect(ValidationCodes.MACHINE_MISMATCH).toBeDefined();
  });
});
