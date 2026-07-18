/**
 * weeke.ts - WEEKE (Homag Group) Dialect Post Processor
 *
 * Generates WEEKE-compatible G-code using ISO variant with Homag conventions.
 * WEEKE machines (part of Homag Group) use modified ISO G-code with specific
 * formatting and syntax requirements.
 *
 * @version 1.0.0 - Initial implementation
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { PostProcessor, PostProcessOptions, PostProcessResult, PostProcessStats, ToolMap } from '../types';
import { GcodeBuilder } from '../emit/gcodeBuilder';
import { formatProgramName, formatTimestamp, sanitizeComment } from '../emit/format';
import { normalizeOperations } from '../normalizeOperations';
import { decideDrillParams, getDefaultDwellTime, getDefaultPeckDepth, shouldApplyThroughHoleDwell } from '../decideDrillParams';
import { getNfpHeaderLines } from '../nfpHeader';

// ============================================================================
// WEEKE Post Processor
// ============================================================================

/**
 * WEEKE dialect post processor.
 * Generates WEEKE/Homag-compatible ISO G-code.
 */
export const weekePostProcessor: PostProcessor = {
  dialect: 'WEEKE',
  fileExt: '.nc',

  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult {
    try {
      return generateWeekeGcode(opGraph, machine, opts);
    } catch (error) {
      return {
        status: 'FAIL',
        errors: [`WEEKE post-processor error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  },
};

// ============================================================================
// Main Generation Function
// ============================================================================

function generateWeekeGcode(
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

  // Create G-code builder (WEEKE uses line numbers)
  const builder = new GcodeBuilder({
    lineNumbers: opts.lineNumbers ?? true,
    lineNumberIncrement: opts.lineNumberIncrement ?? 10,
    includeComments: opts.includeComments ?? true,
    decimalPlaces: 3,
  });

  // Get safe Z from options or machine profile
  const safeZ = opts.safeZ ?? machine.defaultSafeZ ?? 50;
  const rapidZ = opGraph.rapidZ ?? safeZ + 10;

  // Generate WEEKE-style header
  generateWeekeHeader(builder, opts, machine, opGraph);

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

      // WEEKE tool change syntax - uses T and M6 separately
      builder.addLine(`T${toolNumber}`);
      builder.addLine('M6');

      // Start spindle with WEEKE syntax
      const rpm = machine.spindle.defaultRpm;
      builder.addLine(`S${rpm} M3`);

      // Short dwell for spindle ramp-up
      builder.dwell(0.5);

      currentToolId = op.toolId;
      toolChanges++;
    }

    // Generate operation with policy-driven parameters
    const opTime = generateOperation(builder, op, safeZ, machine, opts, warnings);
    estimatedTime += opTime;
    operationCount++;
  }

  // Generate footer
  generateWeekeFooter(builder, safeZ, rapidZ);

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
// Header/Footer Generation (WEEKE-specific)
// ============================================================================

function generateWeekeHeader(
  builder: GcodeBuilder,
  opts: PostProcessOptions,
  machine: MachineProfile,
  opGraph: OperationGraph
): void {
  const programName = formatProgramName(opts.programName);

  // WEEKE header format with % start marker
  builder.addRaw('%');
  builder.addRaw(`O${programName}`);
  // ADR-065 Q3: NFP safety marking — addRaw so it survives includeComments=false
  for (const line of getNfpHeaderLines()) {
    builder.addRaw(`(${line})`);
  }
  builder.addComment('WEEKE/HOMAG NC PROGRAM');
  builder.addComment(`Program: ${programName}`);
  builder.addComment(`Machine: ${machine.id} (${machine.manufacturer})`);
  builder.addComment(`Generated: ${formatTimestamp()}`);
  builder.addComment(`Operations: ${opGraph.operations.length}`);

  if (opGraph.metadata?.jobId) {
    builder.addComment(`Job: ${sanitizeComment(opGraph.metadata.jobId)}`);
  }

  builder.addBlank();
}

function generateSetup(builder: GcodeBuilder, machine: MachineProfile, safeZ: number): void {
  builder.addComment('Setup');
  // WEEKE-specific setup sequence
  builder.setMillimeters(); // G21
  builder.setAbsolute(); // G90
  builder.setXYPlane(); // G17
  builder.cancelCycle(); // G80

  // WEEKE often uses G40 for cutter compensation cancel
  builder.addLine('G40');

  // Initial safe position
  builder.rapid({ z: safeZ });

  builder.addBlank();
}

function generateWeekeFooter(builder: GcodeBuilder, safeZ: number, rapidZ: number): void {
  builder.addBlank();
  builder.addComment('End of program');
  builder.cancelCycle();
  builder.spindleOff();
  builder.coolantOff();
  builder.rapid({ z: rapidZ });
  builder.rapid({ x: 0, y: 0 });
  // WEEKE uses M30 and % end marker
  builder.programEnd();
  builder.addRaw('%');
}

function generateEmptyProgram(opts: PostProcessOptions): string {
  const builder = new GcodeBuilder({ includeComments: true });
  const programName = formatProgramName(opts.programName);

  builder.addRaw('%');
  builder.addRaw(`O${programName}`);
  // ADR-065 Q3: NFP safety marking — addRaw so it survives includeComments=false
  for (const line of getNfpHeaderLines()) {
    builder.addRaw(`(${line})`);
  }
  builder.addComment('WEEKE/HOMAG NC PROGRAM');
  builder.addComment('Empty program');
  builder.programEnd();
  builder.addRaw('%');

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
 * Generate WEEKE drill operation using standard ISO canned cycles.
 * WEEKE uses G81/G82/G83 with R-level specification.
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

  const { params, holeSpec, throughHole } = decision;
  const feedRate = params.feedRate;
  const targetZ = z - depth;

  // Check if through-hole dwell should be applied
  const applyThroughHoleDwell = shouldApplyThroughHoleDwell(throughHole);

  // Add comment with cycle info
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell ? `${params.cycle}+TH` : params.cycle;
    builder.addComment(sanitizeComment(`${op.comment} [${cycleInfo}]`));
  }

  // Emit cycle based on policy decision
  switch (params.cycle) {
    case 'G82': {
      // Dwell drill cycle
      const baseDwell = params.dwellTime ?? getDefaultDwellTime();
      const totalDwell = applyThroughHoleDwell ? baseDwell + throughHole.exitDwellSec : baseDwell;
      builder.dwellDrillCycle({ x, y, z: targetZ, r: safeZ, p: totalDwell, f: feedRate });
      break;
    }
    case 'G83': {
      // Peck drill cycle
      const peckDepth = op.peckDepth ?? decision.effectivePeckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({ x, y, z: targetZ, r: safeZ, q: peckDepth, f: feedRate });

      // Add through-hole dwell after G83 completes
      if (applyThroughHoleDwell) {
        builder.cancelCycle();
        builder.dwell(throughHole.exitDwellSec);
      }
      break;
    }
    case 'G81':
    default: {
      // Promote G81 to G82 for through-hole dwell
      if (applyThroughHoleDwell) {
        builder.dwellDrillCycle({
          x,
          y,
          z: targetZ,
          r: safeZ,
          p: throughHole.exitDwellSec,
          f: feedRate,
        });
      } else {
        builder.drillCycle({ x, y, z: targetZ, r: safeZ, f: feedRate });
      }
      break;
    }
  }

  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;
  return 0.5 + (depth / feedRate) * 60 + (params.cycle === 'G83' ? 0.5 : 0.3) + dwellTime;
}

/**
 * Generate WEEKE bore operation using ISO boring cycle.
 * WEEKE uses G85 for boring with controlled retract.
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

  const { params, holeSpec, throughHole } = decision;
  const feedRate = params.feedRate;
  const targetZ = z - depth;

  // Check if through-hole dwell should be applied
  const applyThroughHoleDwell = shouldApplyThroughHoleDwell(throughHole);

  // Add comment with cycle info
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell ? `${params.cycle}+TH` : params.cycle;
    builder.addComment(sanitizeComment(`${op.comment} [${cycleInfo}]`));
  }

  // Emit cycle based on policy decision
  switch (params.cycle) {
    case 'G82': {
      // Dwell cycle for boring
      const baseDwell = params.dwellTime ?? getDefaultDwellTime();
      const totalDwell = applyThroughHoleDwell ? baseDwell + throughHole.exitDwellSec : baseDwell;
      builder.dwellDrillCycle({ x, y, z: targetZ, r: safeZ, p: totalDwell, f: feedRate });
      break;
    }
    case 'G83': {
      // Peck cycle for deep bores
      const peckDepth = decision.effectivePeckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({ x, y, z: targetZ, r: safeZ, q: peckDepth, f: feedRate });

      if (applyThroughHoleDwell) {
        builder.cancelCycle();
        builder.dwell(throughHole.exitDwellSec);
      }
      break;
    }
    case 'G81':
    default: {
      // Standard boring cycle G85 for controlled retract
      builder.boreCycle({ x, y, z: targetZ, r: safeZ, f: feedRate });

      if (applyThroughHoleDwell) {
        builder.dwell(throughHole.exitDwellSec);
      }
      break;
    }
  }

  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;
  return 0.5 + (depth / feedRate) * 120 + dwellTime;
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
