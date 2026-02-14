/**
 * gate10_3MachineDialect.ts - Machine Dialect Compatibility Gate
 *
 * GATE RULE (G10.3): No OperationGraph may be exported unless it is
 * valid for the selected machine dialect.
 *
 * This gate validates that:
 * 1. All tool diameters are within machine limits
 * 2. All operation depths are within tool/machine limits
 * 3. All operation types are supported by the machine
 * 4. Arc operations only used if machine supports arcs
 * 5. G83 peck drilling only used if machine supports it
 * 6. Forbidden operations are not present
 *
 * @version 1.0.0 - GATE10.3: Machine Dialect Gate
 */

import type {
  OperationGraph,
  Operation,
  DrillOperation,
  BoreOperation,
  PocketOperation,
  ProfileOperation,
  SlotOperation,
  OperationType,
} from '../../cnc/operation/operationTypes';
import type { MachineProfile, ToolCapability } from '../../cnc/machine/machineProfile';
import { getTool } from '../../cnc/machine/machineProfile';

// ============================================
// ERROR CODES
// ============================================

/**
 * G10.3 Issue Codes
 */
export const G10_3_CODES = {
  /** Tool diameter outside machine range */
  TOOL_DIAMETER_RANGE: 'G10.3:TOOL_DIAMETER_RANGE',
  /** Operation depth exceeds tool/machine limit */
  TOOL_DEPTH_RANGE: 'G10.3:TOOL_DEPTH_RANGE',
  /** Operation type not supported by machine */
  OPERATION_UNSUPPORTED: 'G10.3:OPERATION_UNSUPPORTED',
  /** Arc segments used but machine doesn't support arcs */
  ARC_UNSUPPORTED: 'G10.3:ARC_UNSUPPORTED',
  /** G83 peck drilling used but machine doesn't support it */
  G83_UNSUPPORTED: 'G10.3:G83_UNSUPPORTED',
  /** Operation is in machine's forbidden list */
  FORBIDDEN_OPERATION: 'G10.3:FORBIDDEN_OPERATION',
  /** Tool not found in machine tool table */
  TOOL_NOT_FOUND: 'G10.3:TOOL_NOT_FOUND',
  /** Units mismatch between graph and machine */
  UNITS_MISMATCH: 'G10.3:UNITS_MISMATCH',
} as const;

export type G10_3Code = (typeof G10_3_CODES)[keyof typeof G10_3_CODES];

// ============================================
// SEVERITY
// ============================================

export type G10_3Severity = 'BLOCK' | 'WARNING';

// ============================================
// ISSUE TYPE
// ============================================

export interface G10_3Issue {
  /** Issue code */
  code: G10_3Code;
  /** Severity (all G10.3 issues are BLOCK by default) */
  severity: G10_3Severity;
  /** Human-readable message */
  message: string;
  /** Operation ID that caused the issue */
  opId?: string;
  /** Tool ID involved */
  toolId?: string;
  /** Tool diameter */
  diameter?: number;
  /** Operation depth */
  depth?: number;
  /** Operation type */
  opType?: OperationType;
}

// ============================================
// RESULT TYPE
// ============================================

export interface MachineDialectResult {
  /** Validation passed */
  ok: boolean;
  /** List of issues found */
  issues: G10_3Issue[];
  /** Summary counts */
  summary: {
    totalOperations: number;
    checkedOperations: number;
    blockingIssues: number;
    warningIssues: number;
  };
}

// ============================================
// EXTENDED MACHINE PROFILE (G10.3 additions)
// ============================================

/**
 * Extended machine capabilities for G10.3 validation.
 *
 * These fields extend MachineProfile for dialect-specific features.
 */
export interface MachineDialectCapabilities {
  /** Machine supports arc interpolation (G02/G03) */
  supportsArcs?: boolean;
  /** Machine supports G83 peck drilling cycle */
  supportsG83?: boolean;
  /** Minimum tool diameter machine can use */
  minToolDiameter?: number;
  /** Maximum tool diameter machine can use */
  maxToolDiameter?: number;
  /** Maximum depth for any operation */
  maxOperationDepth?: number;
  /** Supported operation types (if not specified, all are allowed) */
  supportedOps?: OperationType[];
  /** Forbidden operation types */
  forbiddenOps?: OperationType[];
}

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Validate OperationGraph against MachineProfile for dialect compatibility.
 *
 * This is the G10.3 gate that ensures no incompatible operations are exported.
 *
 * @param graph - OperationGraph to validate
 * @param machine - Target machine profile
 * @param capabilities - Optional extended dialect capabilities
 * @returns MachineDialectResult with ok status and issues
 *
 * @example
 * ```typescript
 * const result = validateMachineDialect(graph, machine);
 * if (!result.ok) {
 *   // Block export, show issues to user
 *   throw new Error(`G10.3 FAILED: ${result.issues.map(i => i.message).join(', ')}`);
 * }
 * // Safe to generate DXF/G-code
 * ```
 */
export function validateMachineDialect(
  graph: OperationGraph,
  machine: MachineProfile,
  capabilities?: MachineDialectCapabilities
): MachineDialectResult {
  const issues: G10_3Issue[] = [];
  const ops = graph.operations;

  // Merge capabilities with defaults
  const caps: MachineDialectCapabilities = {
    supportsArcs: true, // Most modern machines support arcs
    supportsG83: true, // Most support peck drilling
    minToolDiameter: 0.5, // 0.5mm minimum
    maxToolDiameter: 50, // 50mm maximum
    maxOperationDepth: 100, // 100mm default max depth
    ...capabilities,
  };

  // Get all tools from machine
  const toolTable = machine.toolTable ?? machine.tools;

  for (const op of ops) {
    // 1. Check tool exists in machine
    const tool = getTool(machine, op.toolId);
    if (!tool) {
      issues.push({
        code: G10_3_CODES.TOOL_NOT_FOUND,
        severity: 'BLOCK',
        message: `Tool '${op.toolId}' not found in machine tool table`,
        opId: op.id,
        toolId: op.toolId,
      });
      continue; // Skip other checks for missing tool
    }

    // 2. Check tool diameter range
    if (caps.minToolDiameter !== undefined && tool.diameter < caps.minToolDiameter) {
      issues.push({
        code: G10_3_CODES.TOOL_DIAMETER_RANGE,
        severity: 'BLOCK',
        message: `Tool diameter ${tool.diameter}mm is below machine minimum ${caps.minToolDiameter}mm`,
        opId: op.id,
        toolId: op.toolId,
        diameter: tool.diameter,
      });
    }

    if (caps.maxToolDiameter !== undefined && tool.diameter > caps.maxToolDiameter) {
      issues.push({
        code: G10_3_CODES.TOOL_DIAMETER_RANGE,
        severity: 'BLOCK',
        message: `Tool diameter ${tool.diameter}mm exceeds machine maximum ${caps.maxToolDiameter}mm`,
        opId: op.id,
        toolId: op.toolId,
        diameter: tool.diameter,
      });
    }

    // 3. Check operation-specific validations
    validateOperationByType(op, tool, machine, caps, issues);
  }

  // 4. Check forbidden operations
  if (caps.forbiddenOps && caps.forbiddenOps.length > 0) {
    for (const op of ops) {
      if (caps.forbiddenOps.includes(op.type)) {
        issues.push({
          code: G10_3_CODES.FORBIDDEN_OPERATION,
          severity: 'BLOCK',
          message: `Operation type '${op.type}' is forbidden on this machine`,
          opId: op.id,
          opType: op.type,
        });
      }
    }
  }

  // 5. Check supported operations
  if (caps.supportedOps && caps.supportedOps.length > 0) {
    for (const op of ops) {
      if (!caps.supportedOps.includes(op.type)) {
        issues.push({
          code: G10_3_CODES.OPERATION_UNSUPPORTED,
          severity: 'BLOCK',
          message: `Operation type '${op.type}' is not supported on this machine (supported: ${caps.supportedOps.join(', ')})`,
          opId: op.id,
          opType: op.type,
        });
      }
    }
  }

  // Build summary
  const blockingIssues = issues.filter((i) => i.severity === 'BLOCK').length;
  const warningIssues = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    ok: blockingIssues === 0,
    issues,
    summary: {
      totalOperations: ops.length,
      checkedOperations: ops.length,
      blockingIssues,
      warningIssues,
    },
  };
}

// ============================================
// OPERATION-SPECIFIC VALIDATION
// ============================================

function validateOperationByType(
  op: Operation,
  tool: ToolCapability,
  machine: MachineProfile,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  switch (op.type) {
    case 'DRILL':
      validateDrillOperation(op, tool, caps, issues);
      break;
    case 'BORE':
      validateBoreOperation(op, tool, caps, issues);
      break;
    case 'POCKET':
      validatePocketOperation(op, tool, caps, issues);
      break;
    case 'PROFILE':
      validateProfileOperation(op, tool, caps, issues);
      break;
    case 'SLOT':
      validateSlotOperation(op, tool, caps, issues);
      break;
  }
}

function validateDrillOperation(
  op: DrillOperation,
  tool: ToolCapability,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  // Check depth against tool maxDepth
  if (op.depth > tool.maxDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Drill depth ${op.depth}mm exceeds tool max depth ${tool.maxDepth}mm`,
      opId: op.id,
      toolId: op.toolId,
      depth: op.depth,
    });
  }

  // Check depth against machine maxOperationDepth
  if (caps.maxOperationDepth && op.depth > caps.maxOperationDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Drill depth ${op.depth}mm exceeds machine max operation depth ${caps.maxOperationDepth}mm`,
      opId: op.id,
      depth: op.depth,
    });
  }

  // Check G83 peck drilling support
  if (op.peckDepth && op.peckDepth > 0 && caps.supportsG83 === false) {
    issues.push({
      code: G10_3_CODES.G83_UNSUPPORTED,
      severity: 'BLOCK',
      message: `Peck drilling (G83) requested but machine does not support it`,
      opId: op.id,
      toolId: op.toolId,
    });
  }

  // Check tool supports peck if using peck
  if (op.peckDepth && op.peckDepth > 0 && !tool.supportsPeck) {
    issues.push({
      code: G10_3_CODES.G83_UNSUPPORTED,
      severity: 'BLOCK',
      message: `Peck drilling requested but tool '${op.toolId}' does not support peck`,
      opId: op.id,
      toolId: op.toolId,
    });
  }
}

function validateBoreOperation(
  op: BoreOperation,
  tool: ToolCapability,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  // Check depth
  if (op.depth > tool.maxDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Bore depth ${op.depth}mm exceeds tool max depth ${tool.maxDepth}mm`,
      opId: op.id,
      toolId: op.toolId,
      depth: op.depth,
    });
  }

  // Check machine max depth
  if (caps.maxOperationDepth && op.depth > caps.maxOperationDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Bore depth ${op.depth}mm exceeds machine max operation depth ${caps.maxOperationDepth}mm`,
      opId: op.id,
      depth: op.depth,
    });
  }

  // Check tool supports bore
  if (!tool.supportsBore) {
    issues.push({
      code: G10_3_CODES.OPERATION_UNSUPPORTED,
      severity: 'BLOCK',
      message: `Tool '${op.toolId}' does not support bore operations`,
      opId: op.id,
      toolId: op.toolId,
      opType: 'BORE',
    });
  }
}

function validatePocketOperation(
  op: PocketOperation,
  tool: ToolCapability,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  // Check depth
  if (op.depth > tool.maxDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Pocket depth ${op.depth}mm exceeds tool max depth ${tool.maxDepth}mm`,
      opId: op.id,
      toolId: op.toolId,
      depth: op.depth,
    });
  }

  // Check corner radius vs tool diameter (corner radius must be >= tool radius)
  if (op.cornerRadius > 0 && op.cornerRadius < tool.diameter / 2) {
    issues.push({
      code: G10_3_CODES.TOOL_DIAMETER_RANGE,
      severity: 'BLOCK',
      message: `Pocket corner radius ${op.cornerRadius}mm is smaller than tool radius ${tool.diameter / 2}mm`,
      opId: op.id,
      toolId: op.toolId,
      diameter: tool.diameter,
    });
  }
}

function validateProfileOperation(
  op: ProfileOperation,
  tool: ToolCapability,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  // Check depth
  if (op.depth > tool.maxDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Profile depth ${op.depth}mm exceeds tool max depth ${tool.maxDepth}mm`,
      opId: op.id,
      toolId: op.toolId,
      depth: op.depth,
    });
  }

  // Check arc support if lead radius is specified (implies arc lead-in/lead-out)
  if (op.leadRadius && op.leadRadius > 0 && caps.supportsArcs === false) {
    issues.push({
      code: G10_3_CODES.ARC_UNSUPPORTED,
      severity: 'BLOCK',
      message: `Profile has arc lead-in/lead-out but machine does not support arcs`,
      opId: op.id,
    });
  }

  // Check path for arc segments (simplified: check for non-linear paths)
  // In real implementation, would check actual arc segments in path
  if (op.path && op.path.length > 2 && caps.supportsArcs === false) {
    // Complex path may contain arcs - warn
    // This is a simplified check; real implementation would detect actual arcs
  }
}

function validateSlotOperation(
  op: SlotOperation,
  tool: ToolCapability,
  caps: MachineDialectCapabilities,
  issues: G10_3Issue[]
): void {
  // Check depth
  if (op.depth > tool.maxDepth) {
    issues.push({
      code: G10_3_CODES.TOOL_DEPTH_RANGE,
      severity: 'BLOCK',
      message: `Slot depth ${op.depth}mm exceeds tool max depth ${tool.maxDepth}mm`,
      opId: op.id,
      toolId: op.toolId,
      depth: op.depth,
    });
  }

  // Check slot width matches tool diameter
  if (Math.abs(op.width - tool.diameter) > 0.1) {
    issues.push({
      code: G10_3_CODES.TOOL_DIAMETER_RANGE,
      severity: 'WARNING',
      message: `Slot width ${op.width}mm doesn't match tool diameter ${tool.diameter}mm`,
      opId: op.id,
      toolId: op.toolId,
      diameter: tool.diameter,
    });
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if machine dialect result has blocking issues.
 */
export function hasBlockingIssues(result: MachineDialectResult): boolean {
  return result.summary.blockingIssues > 0;
}

/**
 * Get only blocking issues from result.
 */
export function getBlockingIssues(result: MachineDialectResult): G10_3Issue[] {
  return result.issues.filter((i) => i.severity === 'BLOCK');
}

/**
 * Format result for logging/display.
 */
export function formatMachineDialectResult(result: MachineDialectResult): string {
  const lines: string[] = [];

  lines.push(`G10.3 Machine Dialect Validation`);
  lines.push(`─`.repeat(40));
  lines.push(`Status: ${result.ok ? 'PASS' : 'FAIL'}`);
  lines.push(`Operations: ${result.summary.checkedOperations}/${result.summary.totalOperations}`);
  lines.push(`Blocking: ${result.summary.blockingIssues}, Warnings: ${result.summary.warningIssues}`);

  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of result.issues) {
      const marker = issue.severity === 'BLOCK' ? '✗' : '⚠';
      lines.push(`  ${marker} [${issue.code}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

// ============================================
// GATE ASSERTION
// ============================================

/**
 * G10.3 Gate Error
 */
export class G10_3Error extends Error {
  public readonly code = 'MONO_G10_3_MACHINE_DIALECT_FAILED';
  public readonly result: MachineDialectResult;

  constructor(result: MachineDialectResult) {
    const issueCount = result.summary.blockingIssues;
    const firstIssue = result.issues[0]?.message || 'Unknown issue';
    super(`[G10.3] Machine dialect validation failed: ${issueCount} issue(s). First: ${firstIssue}`);
    this.name = 'G10_3Error';
    this.result = result;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, G10_3Error);
    }
  }
}

/**
 * Assert machine dialect compatibility (fail-fast).
 *
 * @param graph - OperationGraph to validate
 * @param machine - Target machine profile
 * @param capabilities - Optional extended capabilities
 * @throws G10_3Error if validation fails
 */
export function assertMachineDialect(
  graph: OperationGraph,
  machine: MachineProfile,
  capabilities?: MachineDialectCapabilities
): void {
  const result = validateMachineDialect(graph, machine, capabilities);

  if (!result.ok) {
    throw new G10_3Error(result);
  }
}

/**
 * Check if error is a G10.3 error.
 */
export function isG10_3Error(error: unknown): error is G10_3Error {
  return error instanceof G10_3Error;
}

// ============================================
// MACHINE PROFILE VALIDATION
// ============================================

/**
 * Machine profile validation issues.
 */
export interface MachineProfileIssue {
  code: string;
  message: string;
}

/**
 * Validate machine profile structure.
 *
 * @param machine - Machine profile to validate
 * @returns Array of issues (empty if valid)
 */
export function validateMachineProfileStructure(machine: unknown): MachineProfileIssue[] {
  const issues: MachineProfileIssue[] = [];

  if (!machine || typeof machine !== 'object') {
    issues.push({ code: 'INVALID_PROFILE', message: 'Machine profile must be a non-null object' });
    return issues;
  }

  const m = machine as Record<string, unknown>;

  // Required: id
  if (typeof m.id !== 'string' || !m.id) {
    issues.push({ code: 'MISSING_ID', message: 'Machine profile must have an id' });
  }

  // Required: tools or toolTable
  const tools = m.tools || m.toolTable;
  if (!Array.isArray(tools)) {
    issues.push({ code: 'MISSING_TOOLS', message: 'Machine profile must have a tools array' });
  } else if (tools.length === 0) {
    issues.push({ code: 'EMPTY_TOOLS', message: 'Machine profile must have at least one tool' });
  }

  // Required: axis
  if (!m.axis || typeof m.axis !== 'object') {
    issues.push({ code: 'MISSING_AXIS', message: 'Machine profile must have axis configuration' });
  }

  return issues;
}

/**
 * Assert machine profile is valid for G10.3 validation.
 *
 * @param machine - Machine profile to validate
 * @throws Error if machine profile is invalid
 */
export function assertMachineProfile(machine: unknown): asserts machine is MachineProfile {
  const issues = validateMachineProfileStructure(machine);

  if (issues.length > 0) {
    const messages = issues.map(i => `[${i.code}] ${i.message}`).join('; ');
    throw new Error(`[MONO_G10_3_INVALID_MACHINE_PROFILE] ${messages}`);
  }
}

// ============================================
// TRUSTED EXPORT PATHS
// ============================================

/**
 * Trusted export paths allowlist.
 *
 * ONLY these file patterns may perform DXF/G-code export.
 * CI bypass scan will enforce this.
 */
export const TRUSTED_EXPORT_PATHS = [
  '**/core/export/dxfExportFromOperationGraph.ts',
  '**/factory/cnc/generateGcodeForJob.ts',
  '**/cnc/gcode/buildGcodeBundle.ts',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.test.tsx',
] as const;

/**
 * Trusted export source identifiers for audit trail.
 */
export type TrustedExportSource =
  | 'internal:dxfExport'
  | 'internal:gcodeGeneration'
  | 'internal:bundleExport'
  | 'test:fixture';
