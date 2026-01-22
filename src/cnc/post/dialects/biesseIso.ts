/**
 * biesseIso.ts - Biesse ISO Dialect G-code Post Processor
 *
 * Generates Biesse-compatible ISO G-code.
 * Baseline implementation - can be extended for specific Biesse post requirements.
 *
 * @version 1.1.0 - Phase D5-B: Policy-driven cycle selection
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { PostProcessor, PostProcessOptions, PostProcessResult, PostProcessStats, ToolMap } from '../types';
import { GcodeBuilder } from '../emit/gcodeBuilder';
import { formatProgramName, formatTimestamp, sanitizeComment } from '../emit/format';
import { normalizeOperations } from '../normalizeOperations';
import { decideDrillParams, getDefaultDwellTime, getDefaultPeckDepth } from '../decideDrillParams';

// ============================================================================
// Biesse ISO Post Processor
// ============================================================================

/**
 * Biesse ISO dialect post processor.
 * Generates Biesse-compatible ISO G-code with slight variations from FANUC.
 */
export const biesseIsoPostProcessor: PostProcessor = {
  dialect: 'BIESSE_ISO',
  fileExt: '.nc',

  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult {
    try {
      return generateBiesseGcode(opGraph, machine, opts);
    } catch (error) {
      return {
        status: 'FAIL',
        errors: [`Biesse ISO post-processor error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  },
};

// ============================================================================
// Main Generation Function
// ============================================================================

function generateBiesseGcode(
  opGraph: OperationGraph,
  machine: MachineProfile,
  opts: PostProcessOptions
): PostProcessResult {
  const warnings: string[] = [];

  // Validate inputs
  if (!opGraph.operations || opGraph.operations.length === 0) {
    return {
      status: 'OK',
      gcode: generateEmptyProgram(opts),
      warnings: ['No operations to process'],
      stats: { lineCount: 5, toolChanges: 0, operationCount: 0, estimatedTimeSeconds: 0 },
    };
  }

  // Normalize operations for deterministic output
  const normalizedOps = normalizeOperations(opGraph.operations, {
    preserveOrder: opts.preserveOrder ?? false,
    groupByTool: true,
    optimizePath: false,
  });

  // Build tool map from machine profile
  const toolMap = buildToolMap(machine);

  // Create G-code builder (Biesse often doesn't use line numbers)
  const builder = new GcodeBuilder({
    lineNumbers: opts.lineNumbers ?? false,
    includeComments: opts.includeComments ?? true,
    decimalPlaces: 3,
  });

  // Get safe Z from options or machine profile
  const safeZ = opts.safeZ ?? machine.defaultSafeZ ?? 50;
  const rapidZ = opGraph.rapidZ ?? safeZ + 10;

  // Generate Biesse-style header
  generateBiesseHeader(builder, opts, machine, opGraph);

  // Generate setup codes
  generateSetup(builder, machine, safeZ);

  // Track current state
  let currentToolId: string | null = null;
  let operationCount = 0;
  let toolChanges = 0;
  let estimatedTime = 0;

  // Process operations
  for (const op of normalizedOps) {
    // Handle tool change
    if (op.toolId !== currentToolId) {
      if (currentToolId !== null) {
        builder.cancelCycle();
        builder.spindleOff();
        builder.rapid({ z: rapidZ });
      }

      const toolInfo = toolMap[op.toolId];
      if (!toolInfo) {
        warnings.push(`Unknown tool ID: ${op.toolId}, using T1`);
      }

      const toolNumber = toolInfo?.toolNumber ?? 1;
      const toolComment = toolInfo?.description ?? op.toolId;

      builder.addBlank();
      builder.addComment(`Tool: ${toolComment}`);

      // Biesse tool change syntax (may vary by post)
      builder.addLine(`T${toolNumber} M6`);

      // Start spindle
      const rpm = machine.spindle.defaultRpm;
      builder.addLine(`S${rpm} M3`);

      // Short dwell for spindle
      builder.dwell(0.3);

      currentToolId = op.toolId;
      toolChanges++;
    }

    // Generate operation with policy-driven parameters
    const opTime = generateOperation(builder, op, safeZ, machine, opts, warnings);
    estimatedTime += opTime;
    operationCount++;
  }

  // Generate footer
  generateBiesseFooter(builder, safeZ, rapidZ);

  // Build final G-code
  const gcode = builder.build();

  // Calculate stats
  const stats: PostProcessStats = {
    lineCount: builder.getLineCount(),
    toolChanges,
    operationCount,
    estimatedTimeSeconds: Math.round(estimatedTime),
  };

  return {
    status: 'OK',
    gcode,
    warnings,
    stats,
  };
}

// ============================================================================
// Header/Footer Generation (Biesse-specific)
// ============================================================================

function generateBiesseHeader(
  builder: GcodeBuilder,
  opts: PostProcessOptions,
  machine: MachineProfile,
  opGraph: OperationGraph
): void {
  const programName = formatProgramName(opts.programName);

  // Biesse header format (may vary by controller version)
  builder.addComment('BIESSE NC PROGRAM');
  builder.addComment(`Program: ${programName}`);
  builder.addComment(`Machine: ${machine.id}`);
  builder.addComment(`Generated: ${formatTimestamp()}`);
  builder.addComment(`Operations: ${opGraph.operations.length}`);

  if (opGraph.metadata?.jobId) {
    builder.addComment(`Job: ${sanitizeComment(opGraph.metadata.jobId)}`);
  }

  builder.addBlank();
}

function generateSetup(builder: GcodeBuilder, machine: MachineProfile, safeZ: number): void {
  builder.addComment('Setup');
  builder.setMillimeters(); // G21
  builder.setAbsolute(); // G90
  builder.setXYPlane(); // G17
  builder.cancelCycle(); // G80

  // Initial safe position
  builder.rapid({ z: safeZ });

  builder.addBlank();
}

function generateBiesseFooter(builder: GcodeBuilder, safeZ: number, rapidZ: number): void {
  builder.addBlank();
  builder.addComment('End of program');
  builder.cancelCycle();
  builder.spindleOff();
  builder.coolantOff();
  builder.rapid({ z: rapidZ });
  builder.rapid({ x: 0, y: 0 });
  builder.programEnd();
}

function generateEmptyProgram(opts: PostProcessOptions): string {
  const builder = new GcodeBuilder({ includeComments: true });
  const programName = formatProgramName(opts.programName);

  builder.addComment('BIESSE NC PROGRAM');
  builder.addComment(`Program: ${programName}`);
  builder.addComment('Empty program');
  builder.programEnd();

  return builder.build();
}

// ============================================================================
// Operation Generation
// ============================================================================

function generateOperation(
  builder: GcodeBuilder,
  op: Operation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[]
): number {
  switch (op.type) {
    case 'DRILL':
      return generateDrillOperation(builder, op as DrillOperation, safeZ, machine, opts, warnings);
    case 'BORE':
      return generateBoreOperation(builder, op as BoreOperation, safeZ, machine, opts, warnings);
    default:
      warnings.push(`Unsupported operation type: ${op.type}`);
      return 0;
  }
}

/**
 * Generate drill operation with policy-driven cycle selection.
 */
function generateDrillOperation(
  builder: GcodeBuilder,
  op: DrillOperation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[]
): number {
  const { x, y, z } = op.position;
  const depth = op.depth;

  // Get policy-derived parameters
  const decision = decideDrillParams({
    op,
    machine,
    policyOptions: opts.policy,
  });

  warnings.push(...decision.warnings);

  const { params, holeSpec } = decision;
  const feedRate = params.feedRate;
  const targetZ = z - depth;

  if (op.comment) {
    builder.addComment(sanitizeComment(`${op.comment} [${params.cycle}]`));
  }

  // Emit cycle based on policy decision
  switch (params.cycle) {
    case 'G82': {
      const dwellTime = params.dwellTime ?? getDefaultDwellTime();
      builder.dwellDrillCycle({ x, y, z: targetZ, r: safeZ, p: dwellTime, f: feedRate });
      break;
    }
    case 'G83': {
      // Prefer explicit op.peckDepth if set, otherwise use policy-calculated value
      const peckDepth = op.peckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({ x, y, z: targetZ, r: safeZ, q: peckDepth, f: feedRate });
      break;
    }
    case 'G81':
    default: {
      builder.drillCycle({ x, y, z: targetZ, r: safeZ, f: feedRate });
      break;
    }
  }

  return 0.5 + (depth / feedRate) * 60 + (params.cycle === 'G83' ? 0.5 : 0.3);
}

/**
 * Generate bore operation with policy-driven parameters.
 */
function generateBoreOperation(
  builder: GcodeBuilder,
  op: BoreOperation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[]
): number {
  const { x, y, z } = op.position;
  const depth = op.depth;

  // Get policy-derived parameters
  const decision = decideDrillParams({
    op,
    machine,
    policyOptions: opts.policy,
  });

  warnings.push(...decision.warnings);

  const { params, holeSpec } = decision;
  const feedRate = params.feedRate;
  const targetZ = z - depth;

  if (op.comment) {
    builder.addComment(sanitizeComment(`${op.comment} [${params.cycle}]`));
  }

  // Emit cycle based on policy decision
  switch (params.cycle) {
    case 'G82': {
      const dwellTime = params.dwellTime ?? getDefaultDwellTime();
      builder.dwellDrillCycle({ x, y, z: targetZ, r: safeZ, p: dwellTime, f: feedRate });
      break;
    }
    case 'G83': {
      const peckDepth = params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({ x, y, z: targetZ, r: safeZ, q: peckDepth, f: feedRate });
      break;
    }
    case 'G81':
    default: {
      // For bore operations, use G85 (boring cycle) - standard for bores
      builder.boreCycle({ x, y, z: targetZ, r: safeZ, f: feedRate });
      break;
    }
  }

  return 0.5 + (depth / feedRate) * 120;
}

// ============================================================================
// Tool Map Builder
// ============================================================================

function buildToolMap(machine: MachineProfile): ToolMap {
  const toolMap: ToolMap = {};

  for (let i = 0; i < machine.tools.length; i++) {
    const tool = machine.tools[i];
    toolMap[tool.toolId] = {
      toolNumber: i + 1,
      diameter: tool.diameter,
      description: `${tool.type} D${tool.diameter}`,
    };
  }

  return toolMap;
}
