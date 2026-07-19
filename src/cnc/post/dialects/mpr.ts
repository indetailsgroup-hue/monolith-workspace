/**
 * mpr.ts - Homag/WoodWOP MPR Format Post Processor
 *
 * Generates WoodWOP-compatible MPR files for Homag CNC machining centers.
 * MPR is a proprietary section-based text format (NOT G-code) used by
 * WoodWOP software to drive Homag/Weeke machines.
 *
 * ## MPR Format Overview
 *
 * ```
 * [H                     ← Header section
 * VERSION="4.0.8.4"
 * ]
 * [001                   ← Panel definition section
 * KN="PanelName"
 * LX=width LY=height LZ=thickness
 * ]
 * [102                   ← Operation sections (100 + index)
 * ID="BOR"
 * XA=x YA=y ZA=z
 * DU=diameter TI=depth TNO=toolNum
 * ]
 * ```
 *
 * ## Supported Operations
 * - BOR: Vertical/horizontal drilling (DRILL + BORE types)
 * - Unsupported types emit warnings (POCKET, PROFILE, SLOT reserved for future)
 *
 * @see https://www.homag.com/en/product-detail/cnc-programming-software-woodwop
 * @version 1.0.0 - Phase T028-P2: MPR post-processor
 */

import type { MachineProfile } from '../../machine/machineProfile';
import type {
  OperationGraph,
  Operation,
  DrillOperation,
  BoreOperation,
} from '../../operation/operationTypes';
import type {
  PostProcessor,
  PostProcessOptions,
  PostProcessResult,
  PostProcessStats,
  ToolMap,
} from '../types';
import { normalizeOperations } from '../normalizeOperations';
import { formatTimestamp } from '../emit/format';
import { getNfpHeaderLines } from '../nfpHeader';

// ============================================================================
// Constants
// ============================================================================

/** WoodWOP format version (4.0.8.4 is widely compatible) */
const MPR_VERSION = '4.0.8.4';

/** Panel section number (always 001) */
const PANEL_SECTION = '001';

/** First operation section number (increments from here) */
const OP_SECTION_BASE = 100;

/** Default panel thickness when not specified (mm) */
const DEFAULT_THICKNESS = 18;

/** Line ending for MPR files */
const CRLF = '\r\n';

// ============================================================================
// MPR Post Processor
// ============================================================================

/**
 * MPR dialect post processor.
 * Generates Homag/WoodWOP-compatible MPR files.
 */
export const mprPostProcessor: PostProcessor = {
  dialect: 'MPR',
  fileExt: '.mpr',

  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult {
    try {
      return generateMpr(opGraph, machine, opts);
    } catch (error) {
      return {
        status: 'FAIL',
        errors: [
          `MPR post-processor error: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  },
};

// ============================================================================
// Main Generation Function
// ============================================================================

function generateMpr(
  opGraph: OperationGraph,
  machine: MachineProfile,
  opts: PostProcessOptions
): PostProcessResult {
  const warnings: string[] = [];
  const lines: string[] = [];

  // ── Header section ──
  lines.push(...buildHeaderSection(opts));

  // ── Panel section ──
  const panelInfo = extractPanelInfo(opGraph, opts);
  lines.push(...buildPanelSection(panelInfo));

  // Handle empty operations
  if (!opGraph.operations || opGraph.operations.length === 0) {
    warnings.push('No operations to process');
    return {
      status: 'OK',
      gcode: lines.join(CRLF),
      warnings,
      stats: {
        lineCount: lines.length,
        toolChanges: 0,
        operationCount: 0,
        estimatedTimeSeconds: 0,
      },
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

  // ── Operation sections ──
  let opIndex = 0;
  let toolChanges = 0;
  let operationCount = 0;
  let estimatedTime = 0;
  let currentToolId: string | null = null;

  for (const op of normalizedOps) {
    // Track tool changes (for stats)
    if (op.toolId !== currentToolId) {
      if (currentToolId !== null) toolChanges++;
      currentToolId = op.toolId;
    }

    const result = buildOperationSection(op, opIndex, toolMap, opts, warnings);
    if (result) {
      lines.push(...result.lines);
      estimatedTime += result.estimatedTime;
      operationCount++;
      opIndex++;
    }
  }

  // Build final output
  const output = lines.join(CRLF);

  const stats: PostProcessStats = {
    lineCount: lines.length,
    toolChanges,
    operationCount,
    estimatedTimeSeconds: Math.round(estimatedTime),
  };

  return {
    status: 'OK',
    gcode: output,
    warnings,
    stats,
  };
}

// ============================================================================
// Section Builders
// ============================================================================

function buildHeaderSection(opts: PostProcessOptions): string[] {
  const lines: string[] = [];

  lines.push('[H');
  lines.push(`VERSION="${MPR_VERSION}"`);

  // ADR-065 Q3: NFP safety marking — always emitted, even without comments
  for (const nfpLine of getNfpHeaderLines()) {
    lines.push(`; ${nfpLine}`);
  }

  if (opts.includeComments !== false) {
    lines.push(`; Generated by Monolith CNC Export`);
    lines.push(`; Program: ${opts.programName}`);
    lines.push(`; Date: ${formatTimestamp()}`);
  }

  lines.push(']');

  return lines;
}

interface PanelInfo {
  name: string;
  width: number;
  height: number;
  thickness: number;
}

function extractPanelInfo(
  opGraph: OperationGraph,
  opts: PostProcessOptions
): PanelInfo {
  const name = opts.programName || 'PANEL';

  let maxX = 0;
  let maxY = 0;
  let maxDepth = 0;

  for (const op of opGraph.operations ?? []) {
    maxX = Math.max(maxX, op.position.x);
    maxY = Math.max(maxY, op.position.y);

    if (op.type === 'DRILL' || op.type === 'BORE') {
      const depthOp = op as DrillOperation | BoreOperation;
      maxDepth = Math.max(maxDepth, depthOp.depth);
    }
  }

  return {
    name,
    width: maxX > 0 ? Math.ceil(maxX + 50) : 600,
    height: maxY > 0 ? Math.ceil(maxY + 50) : 720,
    thickness: maxDepth > 0 ? Math.ceil(maxDepth + 2) : DEFAULT_THICKNESS,
  };
}

function buildPanelSection(panel: PanelInfo): string[] {
  return [
    `[${PANEL_SECTION}`,
    'LV=0',
    'M=0',
    `KN="${sanitizeMprString(panel.name)}"`,
    `LX=${formatMprNumber(panel.width)}`,
    `LY=${formatMprNumber(panel.height)}`,
    `LZ=${formatMprNumber(panel.thickness)}`,
    ']',
  ];
}

function buildOperationSection(
  op: Operation,
  index: number,
  toolMap: ToolMap,
  opts: PostProcessOptions,
  warnings: string[]
): { lines: string[]; estimatedTime: number } | null {
  const sectionNum = OP_SECTION_BASE + index;

  switch (op.type) {
    case 'DRILL':
      return buildDrillSection(op as DrillOperation, sectionNum, toolMap, opts, warnings);
    case 'BORE':
      return buildBoreSection(op as BoreOperation, sectionNum, toolMap, opts, warnings);
    default:
      warnings.push(
        `Unsupported operation type for MPR: ${op.type} (operation ${op.id})`
      );
      return null;
  }
}

function buildDrillSection(
  op: DrillOperation,
  sectionNum: number,
  toolMap: ToolMap,
  opts: PostProcessOptions,
  warnings: string[]
): { lines: string[]; estimatedTime: number } {
  const toolInfo = toolMap[op.toolId];
  if (!toolInfo) {
    warnings.push(`MPR: Unknown tool '${op.toolId}', defaulting to TNO=1`);
  }
  const toolNumber = toolInfo?.toolNumber ?? 1;
  const diameter = op.diameter ?? toolInfo?.diameter ?? 5;

  const md = op.direction === 'H' ? 0 : 0;

  const lines: string[] = [];

  if (opts.includeComments !== false && op.comment) {
    lines.push(`; ${sanitizeMprString(op.comment)}`);
  }

  lines.push(
    `[${sectionNum}`,
    'ID="BOR"',
    `XA=${formatMprNumber(op.position.x)}`,
    `YA=${formatMprNumber(op.position.y)}`,
    `ZA=${formatMprNumber(op.position.z)}`,
    `DU=${formatMprNumber(diameter)}`,
    `TI=${formatMprNumber(op.depth)}`,
    `TNO=${toolNumber}`,
    `MD=${md}`,
    'AF=0',
    'AN=0',
    ']'
  );

  const feedRate = op.feedRate ?? toolInfo?.diameter
    ? (toolInfo?.diameter ?? 8) < 8 ? 2200 : 2000
    : 2000;
  const estimatedTime = 0.5 + (op.depth / feedRate) * 60 + 0.3;

  return { lines, estimatedTime };
}

function buildBoreSection(
  op: BoreOperation,
  sectionNum: number,
  toolMap: ToolMap,
  opts: PostProcessOptions,
  warnings: string[]
): { lines: string[]; estimatedTime: number } {
  const toolInfo = toolMap[op.toolId];
  if (!toolInfo) {
    warnings.push(`MPR: Unknown tool '${op.toolId}', defaulting to TNO=1`);
  }
  const toolNumber = toolInfo?.toolNumber ?? 1;
  const diameter = op.diameter;

  const md = op.direction === 'H' ? 0 : 0;

  const lines: string[] = [];

  if (opts.includeComments !== false && op.comment) {
    lines.push(`; ${sanitizeMprString(op.comment)}`);
  }

  lines.push(
    `[${sectionNum}`,
    'ID="BOR"',
    `XA=${formatMprNumber(op.position.x)}`,
    `YA=${formatMprNumber(op.position.y)}`,
    `ZA=${formatMprNumber(op.position.z)}`,
    `DU=${formatMprNumber(diameter)}`,
    `TI=${formatMprNumber(op.depth)}`,
    `TNO=${toolNumber}`,
    `MD=${md}`,
    'AF=0',
    'AN=0',
    ']'
  );

  const feedRate = op.feedRate ?? 1200;
  const estimatedTime = 0.5 + (op.depth / feedRate) * 120 + 0.3;

  return { lines, estimatedTime };
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

// ============================================================================
// Formatting Utilities
// ============================================================================

export function formatMprNumber(value: number, decimals = 3): string {
  const multiplier = Math.pow(10, decimals);
  const rounded = Math.round(value * multiplier) / multiplier;

  if (Number.isInteger(rounded)) {
    return rounded.toString();
  }

  const fixed = rounded.toFixed(decimals);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

export function sanitizeMprString(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/[[\]]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .substring(0, 80);
}

// ============================================================================
// Export
// ============================================================================

export default mprPostProcessor;
