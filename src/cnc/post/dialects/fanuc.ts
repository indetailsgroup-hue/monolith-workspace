/**
 * fanuc.ts - FANUC Dialect G-code Post Processor
 *
 * Generates FANUC-compatible G-code for KDT and similar CNC machines.
 *
 * @version 1.3.0 - Phase D5-C.1A: Added through-hole dwell support
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { PostProcessor, PostProcessOptions, PostProcessResult, PostProcessStats, ToolMap } from '../types';
import { GcodeBuilder } from '../emit/gcodeBuilder';
import { formatProgramName, formatTimestamp, sanitizeComment } from '../emit/format';
import { normalizeOperations, countToolChanges } from '../normalizeOperations';
import { decideDrillParams, isHoleOperation, getDefaultDwellTime, getDefaultPeckDepth, shouldApplyThroughHoleDwell } from '../decideDrillParams';

// ============================================================================
// FANUC Post Processor
// ============================================================================

/**
 * FANUC dialect post processor.
 * Generates standard FANUC-compatible G-code.
 */
export const fanucPostProcessor: PostProcessor = {
  dialect: 'FANUC',
  fileExt: '.nc',

  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult {
    try {
      return generateFanucGcode(opGraph, machine, opts);
    } catch (error) {
      return {
        status: 'FAIL',
        errors: [`FANUC post-processor error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  },
};

// ============================================================================
// Main Generation Function
// ============================================================================

function generateFanucGcode(
  opGraph: OperationGraph,
  machine: MachineProfile,
  opts: PostProcessOptions
): PostProcessResult {
  const warnings: string[] = [];
  const startTime = Date.now();

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

  // Create G-code builder
  const builder = new GcodeBuilder({
    lineNumbers: opts.lineNumbers ?? false,
    lineNumberIncrement: opts.lineNumberIncrement ?? 10,
    includeComments: opts.includeComments ?? true,
    decimalPlaces: 3,
  });

  // Get safe Z from options or machine profile
  const safeZ = opts.safeZ ?? machine.defaultSafeZ ?? 50;
  const rapidZ = opGraph.rapidZ ?? safeZ + 10;

  // Generate header
  generateHeader(builder, opts, machine, opGraph);

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
        // Cancel any active cycle before tool change
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
      builder.addComment(`Tool change: ${toolComment}`);
      builder.toolChange(toolNumber, toolComment);

      // Start spindle
      const rpm = machine.spindle.defaultRpm;
      builder.spindleOn(rpm);

      // Dwell for spindle ramp-up
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
  generateFooter(builder, safeZ, rapidZ);

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
// Header/Footer Generation
// ============================================================================

function generateHeader(
  builder: GcodeBuilder,
  opts: PostProcessOptions,
  machine: MachineProfile,
  opGraph: OperationGraph
): void {
  const programName = formatProgramName(opts.programName);

  // Program start
  builder.addRaw('%');
  builder.addRaw(`O${programName}`);
  builder.addComment(`Program: ${programName}`);
  builder.addComment(`Machine: ${machine.id} (${machine.manufacturer})`);
  builder.addComment(`Generated: ${formatTimestamp()}`);
  builder.addComment(`Operations: ${opGraph.operations.length}`);

  if (opGraph.metadata?.jobId) {
    builder.addComment(`Job ID: ${sanitizeComment(opGraph.metadata.jobId)}`);
  }

  builder.addBlank();
}

function generateSetup(builder: GcodeBuilder, machine: MachineProfile, safeZ: number): void {
  builder.addComment('Setup');
  builder.setMillimeters(); // G21
  builder.setAbsolute(); // G90
  builder.setXYPlane(); // G17
  builder.cancelCycle(); // G80

  // Move to safe Z
  builder.rapid({ z: safeZ });

  builder.addBlank();
}

function generateFooter(builder: GcodeBuilder, safeZ: number, rapidZ: number): void {
  builder.addBlank();
  builder.addComment('Program end');
  builder.cancelCycle(); // G80
  builder.spindleOff(); // M5
  builder.coolantOff(); // M9
  builder.rapid({ z: rapidZ }); // Return to safe height
  builder.rapid({ x: 0, y: 0 }); // Return to home XY
  builder.programEnd(); // M30
  builder.addRaw('%');
}

function generateEmptyProgram(opts: PostProcessOptions): string {
  const builder = new GcodeBuilder({ includeComments: true });
  const programName = formatProgramName(opts.programName);

  builder.addRaw('%');
  builder.addRaw(`O${programName}`);
  builder.addComment('Empty program - no operations');
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
  let estimatedTime = 0;

  switch (op.type) {
    case 'DRILL':
      estimatedTime = generateDrillOperation(builder, op as DrillOperation, safeZ, machine, opts, warnings);
      break;
    case 'BORE':
      estimatedTime = generateBoreOperation(builder, op as BoreOperation, safeZ, machine, opts, warnings);
      break;
    default:
      warnings.push(`Unsupported operation type: ${op.type}`);
  }

  return estimatedTime;
}

/**
 * Generate drill operation with policy-driven cycle selection.
 * Uses DrillPolicy to determine G81/G82/G83 and feed/speed.
 * D5-C.1A: Supports through-hole dwell for breakout mitigation.
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

  // Collect any warnings from policy resolution
  warnings.push(...decision.warnings);

  const { params, holeSpec, throughHole } = decision;
  const feedRate = params.feedRate;

  // Check if through-hole dwell should be applied (D5-C.1A)
  const applyThroughHoleDwell = shouldApplyThroughHoleDwell(throughHole);

  // Calculate target Z (negative from surface)
  const startZ = z;
  const targetZ = startZ - depth;

  // Add comment with cycle info (include through-hole indicator)
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell
      ? `${params.cycle}+TH`
      : params.cycle;
    builder.addComment(sanitizeComment(`${op.comment} [${cycleInfo}]`));
  }

  // Emit cycle based on policy decision
  switch (params.cycle) {
    case 'G82': {
      // Dwell drill cycle - used for hinge cups
      // D5-C.1A: Add through-hole dwell if applicable
      const baseDwell = params.dwellTime ?? getDefaultDwellTime();
      const totalDwell = applyThroughHoleDwell
        ? baseDwell + throughHole.exitDwellSec
        : baseDwell;
      builder.dwellDrillCycle({
        x,
        y,
        z: targetZ,
        r: safeZ,
        p: totalDwell,
        f: feedRate,
      });
      break;
    }
    case 'G83': {
      // Peck drill cycle - used for deep holes
      // Priority: explicit op.peckDepth > tuning-adjusted effectivePeckDepth > policy peckDepth > default
      const peckDepth = op.peckDepth ?? decision.effectivePeckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({
        x,
        y,
        z: targetZ,
        r: safeZ,
        q: peckDepth,
        f: feedRate,
      });

      // D5-C.1A: Add through-hole dwell after G83 completes
      if (applyThroughHoleDwell) {
        builder.cancelCycle(); // G80 - exit canned cycle
        builder.dwell(throughHole.exitDwellSec); // G4 P{sec}
      }
      break;
    }
    case 'G81':
    default: {
      // D5-C.1A: Promote G81 to G82 for through-hole dwell
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
        // Simple drill cycle
        builder.drillCycle({
          x,
          y,
          z: targetZ,
          r: safeZ,
          f: feedRate,
        });
      }
      break;
    }
  }

  // Estimate time: rapid to position + drilling + retract + dwell
  const rapidTime = 0.5; // seconds for XY move
  const drillTime = (depth / feedRate) * 60; // depth / mm/min * 60
  const retractTime = params.cycle === 'G83' ? 0.5 : 0.3; // Peck takes longer
  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;

  return rapidTime + drillTime + retractTime + dwellTime;
}

/**
 * Generate bore operation with policy-driven parameters.
 * Bore operations (35mm hinge cups) typically use G82 (dwell) via policy.
 * D5-C.1A: Supports through-hole dwell for breakout mitigation.
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

  // Collect any warnings from policy resolution
  warnings.push(...decision.warnings);

  const { params, holeSpec, throughHole } = decision;
  const feedRate = params.feedRate;

  // Check if through-hole dwell should be applied (D5-C.1A)
  const applyThroughHoleDwell = shouldApplyThroughHoleDwell(throughHole);

  // Calculate target Z
  const startZ = z;
  const targetZ = startZ - depth;

  // Add comment with cycle info (include through-hole indicator)
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell
      ? `${params.cycle}+TH`
      : params.cycle;
    builder.addComment(sanitizeComment(`${op.comment} [${cycleInfo}]`));
  }

  // Emit cycle based on policy decision
  // For bore operations (hinge cups), policy typically returns G82
  switch (params.cycle) {
    case 'G82': {
      // Dwell cycle - standard for hinge cups
      // D5-C.1A: Add through-hole dwell if applicable
      const baseDwell = params.dwellTime ?? getDefaultDwellTime();
      const totalDwell = applyThroughHoleDwell
        ? baseDwell + throughHole.exitDwellSec
        : baseDwell;
      builder.dwellDrillCycle({
        x,
        y,
        z: targetZ,
        r: safeZ,
        p: totalDwell,
        f: feedRate,
      });
      break;
    }
    case 'G83': {
      // Peck cycle - for very deep bores
      // Use tuning-adjusted effectivePeckDepth if available
      const peckDepth = decision.effectivePeckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      builder.peckDrillCycle({
        x,
        y,
        z: targetZ,
        r: safeZ,
        q: peckDepth,
        f: feedRate,
      });

      // D5-C.1A: Add through-hole dwell after G83 completes
      if (applyThroughHoleDwell) {
        builder.cancelCycle(); // G80 - exit canned cycle
        builder.dwell(throughHole.exitDwellSec); // G4 P{sec}
      }
      break;
    }
    case 'G81':
    default: {
      // For bore operations, use G85 (boring cycle) - standard for bores
      // D5-C.1A: Add dwell after bore if through-hole
      builder.boreCycle({
        x,
        y,
        z: targetZ,
        r: safeZ,
        f: feedRate,
      });

      if (applyThroughHoleDwell) {
        builder.dwell(throughHole.exitDwellSec);
      }
      break;
    }
  }

  // Estimate time
  const rapidTime = 0.5;
  const boreTime = (depth / feedRate) * 60;
  const retractTime = params.cycle === 'G82' ? 0.5 : (depth / feedRate) * 60;
  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;

  return rapidTime + boreTime + retractTime + dwellTime;
}

// ============================================================================
// Tool Map Builder
// ============================================================================

function buildToolMap(machine: MachineProfile): ToolMap {
  const toolMap: ToolMap = {};

  for (let i = 0; i < machine.tools.length; i++) {
    const tool = machine.tools[i];
    toolMap[tool.toolId] = {
      toolNumber: i + 1, // T1, T2, etc.
      diameter: tool.diameter,
      description: `${tool.type} D${tool.diameter}`,
    };
  }

  return toolMap;
}
