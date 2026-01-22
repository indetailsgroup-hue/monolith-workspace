/**
 * validateOperationGraph.ts - Validate Operation Graph Against Machine
 *
 * Ensures all operations in the graph are valid for the target machine.
 * Invalid graphs MUST NOT proceed to G-code generation.
 *
 * @version 1.0.0 - Phase D1
 */

import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import {
  getTool,
  isWithinAxisLimits,
  isWithinToolDepth,
  getAxisViolation,
} from '../machine/machineProfile';
import type {
  Operation,
  OperationGraph,
  DrillOperation,
  BoreOperation,
} from '../operation/operationTypes';

// ============================================
// TYPES
// ============================================

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  /** Severity level */
  severity: ValidationSeverity;
  /** Issue code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Operation ID that caused the issue (if applicable) */
  operationId?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  /** Overall validation passed (no errors) */
  valid: boolean;
  /** All issues found */
  issues: ValidationIssue[];
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
  /** Validation timestamp */
  validatedAt: string;
}

// ============================================
// ISSUE CODES
// ============================================

export const ValidationCodes = {
  // Tool issues
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_DEPTH_EXCEEDED: 'TOOL_DEPTH_EXCEEDED',
  TOOL_TYPE_MISMATCH: 'TOOL_TYPE_MISMATCH',

  // Axis issues
  AXIS_X_OUT_OF_RANGE: 'AXIS_X_OUT_OF_RANGE',
  AXIS_Y_OUT_OF_RANGE: 'AXIS_Y_OUT_OF_RANGE',
  AXIS_Z_OUT_OF_RANGE: 'AXIS_Z_OUT_OF_RANGE',
  POSITION_OUT_OF_RANGE: 'POSITION_OUT_OF_RANGE',

  // Operation issues
  INVALID_DEPTH: 'INVALID_DEPTH',
  INVALID_DIAMETER: 'INVALID_DIAMETER',
  EMPTY_GRAPH: 'EMPTY_GRAPH',

  // Machine issues
  MACHINE_MISMATCH: 'MACHINE_MISMATCH',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
} as const;

// ============================================
// VALIDATOR
// ============================================

/**
 * Validate an operation graph against a machine profile
 *
 * @param graph - Operation graph to validate
 * @param machine - Target machine profile
 * @returns Validation result
 */
export function validateOperationGraph(
  graph: OperationGraph,
  machine: MachineProfile
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check machine ID matches
  if (graph.machineId !== machine.id) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.MACHINE_MISMATCH,
      message: `Graph built for ${graph.machineId} but validating against ${machine.id}`,
    });
  }

  // Check if graph is empty
  if (graph.operations.length === 0) {
    issues.push({
      severity: 'WARNING',
      code: ValidationCodes.EMPTY_GRAPH,
      message: 'Operation graph has no operations',
    });
  }

  // Validate each operation
  for (const op of graph.operations) {
    validateOperation(op, machine, issues);
  }

  // Check all tools exist
  for (const toolId of graph.toolsUsed) {
    if (!getTool(machine, toolId)) {
      issues.push({
        severity: 'ERROR',
        code: ValidationCodes.TOOL_NOT_FOUND,
        message: `Tool ${toolId} not found in machine profile`,
        details: { toolId },
      });
    }
  }

  // Calculate counts
  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate a single operation
 */
function validateOperation(
  op: Operation,
  machine: MachineProfile,
  issues: ValidationIssue[]
): void {
  // Check tool exists
  const tool = getTool(machine, op.toolId);
  if (!tool) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.TOOL_NOT_FOUND,
      message: `Operation ${op.id}: Tool ${op.toolId} not found`,
      operationId: op.id,
      details: { toolId: op.toolId },
    });
    return; // Can't validate further without tool
  }

  // Check position within axis limits
  const axisViolation = getAxisViolation(machine, op.position);
  if (axisViolation) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.POSITION_OUT_OF_RANGE,
      message: `Operation ${op.id}: ${axisViolation}`,
      operationId: op.id,
      details: { position: op.position },
    });
  }

  // Type-specific validation
  switch (op.type) {
    case 'DRILL':
      validateDrillOperation(op, tool, issues);
      break;
    case 'BORE':
      validateBoreOperation(op, tool, issues);
      break;
    // Add other operation types as needed
  }
}

/**
 * Validate a drill operation
 */
function validateDrillOperation(
  op: DrillOperation,
  tool: ToolCapability,
  issues: ValidationIssue[]
): void {
  // Check tool type
  if (tool.type !== 'DRILL') {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.TOOL_TYPE_MISMATCH,
      message: `Operation ${op.id}: Tool ${op.toolId} is ${tool.type}, expected DRILL`,
      operationId: op.id,
    });
  }

  // Check depth
  if (op.depth <= 0) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.INVALID_DEPTH,
      message: `Operation ${op.id}: Invalid depth ${op.depth}mm (must be > 0)`,
      operationId: op.id,
    });
  } else if (!isWithinToolDepth(tool, op.depth)) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.TOOL_DEPTH_EXCEEDED,
      message: `Operation ${op.id}: Depth ${op.depth}mm exceeds tool max ${tool.maxDepth}mm`,
      operationId: op.id,
      details: { depth: op.depth, maxDepth: tool.maxDepth },
    });
  }

  // Check peck depth
  if (op.peckDepth !== undefined && op.peckDepth <= 0) {
    issues.push({
      severity: 'WARNING',
      code: ValidationCodes.INVALID_DEPTH,
      message: `Operation ${op.id}: Invalid peck depth ${op.peckDepth}mm`,
      operationId: op.id,
    });
  }
}

/**
 * Validate a bore operation
 */
function validateBoreOperation(
  op: BoreOperation,
  tool: ToolCapability,
  issues: ValidationIssue[]
): void {
  // Check tool type
  if (tool.type !== 'BORE') {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.TOOL_TYPE_MISMATCH,
      message: `Operation ${op.id}: Tool ${op.toolId} is ${tool.type}, expected BORE`,
      operationId: op.id,
    });
  }

  // Check diameter matches tool
  if (op.diameter !== tool.diameter) {
    issues.push({
      severity: 'WARNING',
      code: ValidationCodes.INVALID_DIAMETER,
      message: `Operation ${op.id}: Diameter ${op.diameter}mm doesn't match tool ${tool.diameter}mm`,
      operationId: op.id,
      details: { operationDiameter: op.diameter, toolDiameter: tool.diameter },
    });
  }

  // Check depth
  if (op.depth <= 0) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.INVALID_DEPTH,
      message: `Operation ${op.id}: Invalid depth ${op.depth}mm (must be > 0)`,
      operationId: op.id,
    });
  } else if (!isWithinToolDepth(tool, op.depth)) {
    issues.push({
      severity: 'ERROR',
      code: ValidationCodes.TOOL_DEPTH_EXCEEDED,
      message: `Operation ${op.id}: Depth ${op.depth}mm exceeds tool max ${tool.maxDepth}mm`,
      operationId: op.id,
      details: { depth: op.depth, maxDepth: tool.maxDepth },
    });
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if validation passed
 */
export function isValidGraph(result: ValidationResult): boolean {
  return result.valid;
}

/**
 * Get all errors from validation
 */
export function getValidationErrors(result: ValidationResult): ValidationIssue[] {
  return result.issues.filter((i) => i.severity === 'ERROR');
}

/**
 * Get all warnings from validation
 */
export function getValidationWarnings(result: ValidationResult): ValidationIssue[] {
  return result.issues.filter((i) => i.severity === 'WARNING');
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`Validation ${result.valid ? 'PASSED' : 'FAILED'}`);
  lines.push(`─`.repeat(40));
  lines.push(`Errors: ${result.errorCount}`);
  lines.push(`Warnings: ${result.warningCount}`);

  if (result.issues.length > 0) {
    lines.push(`\nIssues:`);
    for (const issue of result.issues) {
      const icon = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
      lines.push(`  ${icon} [${issue.code}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}
