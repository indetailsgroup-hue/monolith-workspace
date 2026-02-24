/**
 * heidenhain.ts - HEIDENHAIN Dialect Post Processor
 *
 * Generates HEIDENHAIN-compatible conversational (plain language) CNC programs.
 * HEIDENHAIN uses a unique plain-text programming style rather than ISO G-code.
 *
 * @version 1.0.0 - Initial implementation
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { PostProcessor, PostProcessOptions, PostProcessResult, PostProcessStats, ToolMap } from '../types';
import { formatProgramName, formatTimestamp, sanitizeComment } from '../emit/format';
import { normalizeOperations } from '../normalizeOperations';
import { decideDrillParams, getDefaultDwellTime, getDefaultPeckDepth, shouldApplyThroughHoleDwell } from '../decideDrillParams';

// ============================================================================
// HEIDENHAIN Post Processor
// ============================================================================

/**
 * HEIDENHAIN dialect post processor.
 * Generates HEIDENHAIN conversational-style programs.
 */
export const heidenhainPostProcessor: PostProcessor = {
  dialect: 'HEIDENHAIN',
  fileExt: '.nc',

  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult {
    try {
      return generateHeidenhainCode(opGraph, machine, opts);
    } catch (error) {
      return {
        status: 'FAIL',
        errors: [`HEIDENHAIN post-processor error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  },
};

// ============================================================================
// Main Generation Function
// ============================================================================

function generateHeidenhainCode(
  opGraph: OperationGraph,
  machine: MachineProfile,
  opts: PostProcessOptions
): PostProcessResult {
  const warnings: string[] = [];
  const lines: string[] = [];

  // Validate inputs
  if (!opGraph.operations || opGraph.operations.length === 0) {
    return {
      status: 'OK',
      gcode: generateEmptyProgram(opts),
      warnings: ['No operations to process'],
      stats: { lineCount: 3, toolChanges: 0, operationCount: 0, estimatedTimeSeconds: 0 },
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

  // Get safe Z from options or machine profile
  const safeZ = opts.safeZ ?? machine.defaultSafeZ ?? 50;
  const rapidZ = opGraph.rapidZ ?? safeZ + 10;

  // Program name (HEIDENHAIN uses alphanumeric names)
  const programName = formatProgramName(opts.programName).replace(/[^A-Z0-9]/gi, '').substring(0, 8) || 'PART';

  // Generate HEIDENHAIN header
  lines.push(`BEGIN PGM ${programName} MM`);
  lines.push(`;Program: ${programName}`);
  lines.push(`;Machine: ${machine.id} (${machine.manufacturer})`);
  lines.push(`;Generated: ${formatTimestamp()}`);
  lines.push(`;Operations: ${opGraph.operations.length}`);

  if (opGraph.metadata?.jobId) {
    lines.push(`;Job ID: ${sanitizeComment(opGraph.metadata.jobId)}`);
  }

  lines.push('');

  // Block form definition (workpiece bounds - using default for now)
  lines.push(';Workpiece definition');
  lines.push('BLK FORM 0.1 Z X+0 Y+0 Z-50');
  lines.push('BLK FORM 0.2 X+500 Y+500 Z+0');
  lines.push('');

  // Track current state
  let currentToolId: string | null = null;
  let operationCount = 0;
  let toolChanges = 0;
  let estimatedTime = 0;
  let blockNumber = 0;

  // Helper to get next block number
  const nextBlock = (): number => {
    blockNumber++;
    return blockNumber;
  };

  // Process operations
  for (const op of normalizedOps) {
    // Handle tool change
    if (op.toolId !== currentToolId) {
      if (currentToolId !== null) {
        // Move to safe Z before tool change
        lines.push(`${nextBlock()} L Z+${formatNum(rapidZ)} R0 FMAX M5`);
        lines.push('');
      }

      const toolInfo = toolMap[op.toolId];
      if (!toolInfo) {
        warnings.push(`Unknown tool ID: ${op.toolId}, using T1`);
      }

      const toolNumber = toolInfo?.toolNumber ?? 1;
      const toolComment = toolInfo?.description ?? op.toolId;
      const rpm = machine.spindle.defaultRpm;

      lines.push(`;Tool change: ${toolComment}`);
      lines.push(`${nextBlock()} TOOL CALL ${toolNumber} Z S${rpm}`);
      lines.push(`${nextBlock()} L Z+${formatNum(safeZ)} R0 FMAX M3`);
      lines.push('');

      currentToolId = op.toolId;
      toolChanges++;
    }

    // Generate operation
    const { opLines, time } = generateOperation(op, safeZ, machine, opts, warnings, nextBlock);
    lines.push(...opLines);
    estimatedTime += time;
    operationCount++;
  }

  // Generate footer
  lines.push('');
  lines.push(`;End of program`);
  lines.push(`${nextBlock()} L Z+${formatNum(rapidZ)} R0 FMAX M5`);
  lines.push(`${nextBlock()} L X+0 Y+0 R0 FMAX M9`);
  lines.push(`${nextBlock()} M30`);
  lines.push(`END PGM ${programName} MM`);

  // Calculate stats
  const stats: PostProcessStats = {
    lineCount: lines.length,
    toolChanges,
    operationCount,
    estimatedTimeSeconds: Math.round(estimatedTime),
  };

  return {
    status: 'OK',
    gcode: lines.join('\n'),
    warnings,
    stats,
  };
}

// ============================================================================
// Operation Generation
// ============================================================================

function generateOperation(
  op: Operation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[],
  nextBlock: () => number
): { opLines: string[]; time: number } {
  switch (op.type) {
    case 'DRILL':
      return generateDrillOperation(op as DrillOperation, safeZ, machine, opts, warnings, nextBlock);
    case 'BORE':
      return generateBoreOperation(op as BoreOperation, safeZ, machine, opts, warnings, nextBlock);
    default:
      warnings.push(`Unsupported operation type: ${op.type}`);
      return { opLines: [], time: 0 };
  }
}

/**
 * Generate HEIDENHAIN drill operation using CYCL DEF drilling cycles.
 */
function generateDrillOperation(
  op: DrillOperation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[],
  nextBlock: () => number
): { opLines: string[]; time: number } {
  const opLines: string[] = [];
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

  // Add comment
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell ? `${params.cycle}+TH` : params.cycle;
    opLines.push(`;${sanitizeComment(op.comment)} [${cycleInfo}]`);
  }

  // HEIDENHAIN uses CYCL DEF for canned cycles
  switch (params.cycle) {
    case 'G82': {
      // Dwell drilling - CYCL DEF 1.0 PECKING
      const baseDwell = params.dwellTime ?? getDefaultDwellTime();
      const totalDwell = applyThroughHoleDwell ? baseDwell + throughHole.exitDwellSec : baseDwell;

      opLines.push(`${nextBlock()} CYCL DEF 1.0 PECKING`);
      opLines.push(`${nextBlock()} CYCL DEF 1.1 SET UP ${formatNum(safeZ - z)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.2 DEPTH -${formatNum(depth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.3 PECKG ${formatNum(depth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.4 DWELL ${formatNum(totalDwell)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.5 F${formatNum(feedRate)}`);
      break;
    }
    case 'G83': {
      // Peck drilling - CYCL DEF 1.0 PECKING
      const peckDepth = op.peckDepth ?? decision.effectivePeckDepth ?? params.peckDepth ?? getDefaultPeckDepth(holeSpec.diameter);
      const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;

      opLines.push(`${nextBlock()} CYCL DEF 1.0 PECKING`);
      opLines.push(`${nextBlock()} CYCL DEF 1.1 SET UP ${formatNum(safeZ - z)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.2 DEPTH -${formatNum(depth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.3 PECKG ${formatNum(peckDepth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.4 DWELL ${formatNum(dwellTime)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.5 F${formatNum(feedRate)}`);
      break;
    }
    case 'G81':
    default: {
      // Simple drilling - CYCL DEF 1.0 with full depth peck
      const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;

      opLines.push(`${nextBlock()} CYCL DEF 1.0 PECKING`);
      opLines.push(`${nextBlock()} CYCL DEF 1.1 SET UP ${formatNum(safeZ - z)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.2 DEPTH -${formatNum(depth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.3 PECKG ${formatNum(depth)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.4 DWELL ${formatNum(dwellTime)}`);
      opLines.push(`${nextBlock()} CYCL DEF 1.5 F${formatNum(feedRate)}`);
      break;
    }
  }

  // Move to position and call cycle
  opLines.push(`${nextBlock()} L X${formatCoord(x)} Y${formatCoord(y)} R0 FMAX M99`);
  opLines.push('');

  // Estimate time
  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;
  const time = 0.5 + (depth / feedRate) * 60 + (params.cycle === 'G83' ? 0.5 : 0.3) + dwellTime;

  return { opLines, time };
}

/**
 * Generate HEIDENHAIN bore operation using CYCL DEF boring cycles.
 */
function generateBoreOperation(
  op: BoreOperation,
  safeZ: number,
  machine: MachineProfile,
  opts: PostProcessOptions,
  warnings: string[],
  nextBlock: () => number
): { opLines: string[]; time: number } {
  const opLines: string[] = [];
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

  // Check if through-hole dwell should be applied
  const applyThroughHoleDwell = shouldApplyThroughHoleDwell(throughHole);

  // Add comment
  if (op.comment) {
    const cycleInfo = applyThroughHoleDwell ? `${params.cycle}+TH` : params.cycle;
    opLines.push(`;${sanitizeComment(op.comment)} [${cycleInfo}]`);
  }

  // HEIDENHAIN CYCL DEF 2.0 for boring
  const baseDwell = params.dwellTime ?? getDefaultDwellTime();
  const totalDwell = applyThroughHoleDwell ? baseDwell + throughHole.exitDwellSec : baseDwell;

  opLines.push(`${nextBlock()} CYCL DEF 2.0 BORING`);
  opLines.push(`${nextBlock()} CYCL DEF 2.1 SET UP ${formatNum(safeZ - z)}`);
  opLines.push(`${nextBlock()} CYCL DEF 2.2 DEPTH -${formatNum(depth)}`);
  opLines.push(`${nextBlock()} CYCL DEF 2.3 DWELL ${formatNum(totalDwell)}`);
  opLines.push(`${nextBlock()} CYCL DEF 2.4 F${formatNum(feedRate)}`);

  // Move to position and call cycle
  opLines.push(`${nextBlock()} L X${formatCoord(x)} Y${formatCoord(y)} R0 FMAX M99`);
  opLines.push('');

  // Estimate time
  const dwellTime = applyThroughHoleDwell ? throughHole.exitDwellSec : 0;
  const time = 0.5 + (depth / feedRate) * 120 + dwellTime;

  return { opLines, time };
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateEmptyProgram(opts: PostProcessOptions): string {
  const programName = formatProgramName(opts.programName).replace(/[^A-Z0-9]/gi, '').substring(0, 8) || 'PART';
  const lines: string[] = [];

  lines.push(`BEGIN PGM ${programName} MM`);
  lines.push(`;Empty program - no operations`);
  lines.push('1 M30');
  lines.push(`END PGM ${programName} MM`);

  return lines.join('\n');
}

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

/**
 * Format number for HEIDENHAIN output (3 decimal places).
 */
function formatNum(value: number): string {
  return value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Format coordinate with +/- sign for HEIDENHAIN.
 */
function formatCoord(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return sign + formatNum(value);
}
