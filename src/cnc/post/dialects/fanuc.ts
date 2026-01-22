/**
 * fanuc.ts - FANUC Dialect G-code Post Processor
 *
 * Generates FANUC-compatible G-code for KDT and similar CNC machines.
 *
 * @version 1.0.0 - Phase D2
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { PostProcessor, PostProcessOptions, PostProcessResult, PostProcessStats, ToolMap } from '../types';
import { GcodeBuilder } from '../emit/gcodeBuilder';
import { formatProgramName, formatTimestamp, sanitizeComment } from '../emit/format';
import { normalizeOperations, countToolChanges } from '../normalizeOperations';

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

    // Generate operation
    const opTime = generateOperation(builder, op, safeZ, opts, warnings);
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
  opts: PostProcessOptions,
  warnings: string[]
): number {
  let estimatedTime = 0;

  switch (op.type) {
    case 'DRILL':
      estimatedTime = generateDrillOperation(builder, op as DrillOperation, safeZ, warnings);
      break;
    case 'BORE':
      estimatedTime = generateBoreOperation(builder, op as BoreOperation, safeZ, warnings);
      break;
    default:
      warnings.push(`Unsupported operation type: ${op.type}`);
  }

  return estimatedTime;
}

function generateDrillOperation(
  builder: GcodeBuilder,
  op: DrillOperation,
  safeZ: number,
  warnings: string[]
): number {
  const { x, y, z } = op.position;
  const depth = op.depth;
  const feedRate = op.feedRate ?? 500;

  // Calculate target Z (negative from surface)
  const startZ = z;
  const targetZ = startZ - depth;

  // Add comment
  if (op.comment) {
    builder.addComment(sanitizeComment(op.comment));
  }

  // Check for peck drilling
  if (op.peckDepth && op.peckDepth > 0 && op.peckDepth < depth) {
    // Use peck drilling cycle (G83)
    builder.peckDrillCycle({
      x,
      y,
      z: targetZ,
      r: safeZ,
      q: op.peckDepth,
      f: feedRate,
    });
  } else {
    // Use simple drilling cycle (G81)
    builder.drillCycle({
      x,
      y,
      z: targetZ,
      r: safeZ,
      f: feedRate,
    });
  }

  // Estimate time: rapid to position + drilling + retract
  const rapidTime = 0.5; // seconds for XY move
  const drillTime = (depth / feedRate) * 60; // depth / mm/min * 60
  const retractTime = 0.3;

  return rapidTime + drillTime + retractTime;
}

function generateBoreOperation(
  builder: GcodeBuilder,
  op: BoreOperation,
  safeZ: number,
  warnings: string[]
): number {
  const { x, y, z } = op.position;
  const depth = op.depth;
  const feedRate = op.feedRate ?? 300;

  // Calculate target Z
  const startZ = z;
  const targetZ = startZ - depth;

  // Add comment
  if (op.comment) {
    builder.addComment(sanitizeComment(op.comment));
  }

  // Use boring cycle (G85)
  builder.boreCycle({
    x,
    y,
    z: targetZ,
    r: safeZ,
    f: feedRate,
  });

  // Estimate time
  const rapidTime = 0.5;
  const boreTime = (depth / feedRate) * 60;
  const retractTime = (depth / feedRate) * 60; // G85 feeds out

  return rapidTime + boreTime + retractTime;
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
