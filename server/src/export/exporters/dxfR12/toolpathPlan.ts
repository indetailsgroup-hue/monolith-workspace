/**
 * Toolpath Plan JSON Sidecar
 *
 * Step 10.4C: Machine-readable toolpath metadata for automation
 *
 * The JSON sidecar contains the "truth" for post-processors and automation:
 * - No need to parse DXF or guess from layer names
 * - Deterministic manufacturing data
 * - Audit trail for each operation
 *
 * Use cases:
 * - G-code generation for specific machines (KDT, Homag, etc.)
 * - Quality control verification
 * - Production planning and scheduling
 * - Cost estimation
 */

import type { TabSpec } from './tabs.js';
import type { KeepoutRect } from './keepout.js';
import type { Rotation } from './transform.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Profile cut operation.
 */
export interface ProfileOp {
  kind: 'PROFILE';
  layer: string;
  depthMm: number;
  toolMm: number;
  tabs?: TabSpec;
  tabPositions?: Array<{ x: number; y: number; edgeIndex: number }>;
}

/**
 * Groove/dado operation.
 */
export interface GrooveOp {
  kind: 'GROOVE';
  layer: string;
  depthMm: number;
  toolMm: number;
  axis: 'X' | 'Y';
  offsetMm: number;
  widthMm: number;
  lengthMm: number;
}

/**
 * Drilling operation.
 */
export interface DrillOp {
  kind: 'DRILL';
  layer: string;
  depthMm: number;
  diaMm: number;
  xMm: number;
  yMm: number;
  ref?: string;
}

/**
 * Kerf bending operation.
 */
export interface KerfOp {
  kind: 'KERF';
  layer: string;
  depthMm: number;
  toolMm: number;
  kerfCount: number;
  kerfSpacing: number;
  direction: 'horizontal' | 'vertical';
}

/**
 * Pocket clearing operation.
 */
export interface PocketOp {
  kind: 'POCKET';
  layer: string;
  depthMm: number;
  toolMm: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Union of all operation types.
 */
export type ToolpathOp = ProfileOp | GrooveOp | DrillOp | KerfOp | PocketOp;

/**
 * Part placement with operations.
 */
export interface PartToolpath {
  partId: string;
  label: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  x: number;
  y: number;
  rot: Rotation;
  ops: ToolpathOp[];
}

/**
 * Sheet with all parts and their toolpaths.
 */
export interface SheetToolpath {
  sheetIndex: number;
  sheetW: number;
  sheetH: number;
  keepouts: KeepoutRect[];
  parts: PartToolpath[];
  stats: {
    partCount: number;
    rotatedCount: number;
    totalDrillCount: number;
    totalGrooveCount: number;
    utilizationPercent: number;
  };
}

/**
 * Complete toolpath plan for a job.
 */
export interface ToolpathPlan {
  version: 'toolpath-plan.v1';
  createdAt: string;
  jobName: string;
  bundleId?: string;
  format: string;
  sheets: SheetToolpath[];
  summary: {
    totalSheets: number;
    totalParts: number;
    totalDrills: number;
    totalGrooves: number;
    averageUtilization: number;
  };
  defaults: {
    profileDepthMm: number;
    profileToolMm: number;
    grooveToolMm: number;
    drillDepthMm: number;
    tabSpec: TabSpec;
  };
}

// ============================================================================
// Builder
// ============================================================================

export interface ToolpathPlanBuilderOptions {
  jobName: string;
  bundleId?: string;
  format?: string;
  defaults?: {
    profileDepthMm?: number;
    profileToolMm?: number;
    grooveToolMm?: number;
    drillDepthMm?: number;
    tabSpec?: Partial<TabSpec>;
  };
}

/**
 * Builder for constructing toolpath plans.
 */
export class ToolpathPlanBuilder {
  private jobName: string;
  private bundleId?: string;
  private format: string;
  private sheets: SheetToolpath[] = [];
  private defaults: ToolpathPlan['defaults'];

  constructor(options: ToolpathPlanBuilderOptions) {
    this.jobName = options.jobName;
    this.bundleId = options.bundleId;
    this.format = options.format ?? 'DXF_SHEET_V2';
    this.defaults = {
      profileDepthMm: options.defaults?.profileDepthMm ?? 19,
      profileToolMm: options.defaults?.profileToolMm ?? 6,
      grooveToolMm: options.defaults?.grooveToolMm ?? 6,
      drillDepthMm: options.defaults?.drillDepthMm ?? 10,
      tabSpec: {
        enabled: options.defaults?.tabSpec?.enabled ?? true,
        count: options.defaults?.tabSpec?.count ?? 4,
        lengthMm: options.defaults?.tabSpec?.lengthMm ?? 12,
        insetMm: options.defaults?.tabSpec?.insetMm ?? 25,
        strategy: options.defaults?.tabSpec?.strategy ?? 'MID_EDGES',
      },
    };
  }

  /**
   * Add a sheet to the plan.
   */
  addSheet(sheet: Omit<SheetToolpath, 'stats'>): void {
    // Calculate stats
    const parts = sheet.parts;
    const stats = {
      partCount: parts.length,
      rotatedCount: parts.filter(p => p.rot === 90).length,
      totalDrillCount: parts.reduce((sum, p) =>
        sum + p.ops.filter(op => op.kind === 'DRILL').length, 0),
      totalGrooveCount: parts.reduce((sum, p) =>
        sum + p.ops.filter(op => op.kind === 'GROOVE').length, 0),
      utilizationPercent: this.calculateUtilization(sheet.sheetW, sheet.sheetH, parts),
    };

    this.sheets.push({ ...sheet, stats });
  }

  /**
   * Calculate sheet utilization percentage.
   */
  private calculateUtilization(
    sheetW: number,
    sheetH: number,
    parts: PartToolpath[]
  ): number {
    const sheetArea = sheetW * sheetH;
    if (sheetArea === 0) return 0;

    const partArea = parts.reduce((sum, p) => {
      const w = p.rot === 90 ? p.heightMm : p.widthMm;
      const h = p.rot === 90 ? p.widthMm : p.heightMm;
      return sum + w * h;
    }, 0);

    return Math.round((partArea / sheetArea) * 1000) / 10;
  }

  /**
   * Build the final toolpath plan.
   */
  build(): ToolpathPlan {
    const totalDrills = this.sheets.reduce((sum, s) => sum + s.stats.totalDrillCount, 0);
    const totalGrooves = this.sheets.reduce((sum, s) => sum + s.stats.totalGrooveCount, 0);
    const totalParts = this.sheets.reduce((sum, s) => sum + s.parts.length, 0);
    const avgUtil = this.sheets.length > 0
      ? this.sheets.reduce((sum, s) => sum + s.stats.utilizationPercent, 0) / this.sheets.length
      : 0;

    return {
      version: 'toolpath-plan.v1',
      createdAt: new Date().toISOString(),
      jobName: this.jobName,
      bundleId: this.bundleId,
      format: this.format,
      sheets: this.sheets,
      summary: {
        totalSheets: this.sheets.length,
        totalParts,
        totalDrills,
        totalGrooves,
        averageUtilization: Math.round(avgUtil * 10) / 10,
      },
      defaults: this.defaults,
    };
  }

  /**
   * Build and return as JSON string.
   */
  toJSON(pretty = true): string {
    const plan = this.build();
    return pretty ? JSON.stringify(plan, null, 2) : JSON.stringify(plan);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a profile operation.
 */
export function profileOp(
  layer: string,
  depthMm: number,
  toolMm: number,
  tabs?: TabSpec,
  tabPositions?: ProfileOp['tabPositions']
): ProfileOp {
  return {
    kind: 'PROFILE',
    layer,
    depthMm,
    toolMm,
    tabs,
    tabPositions,
  };
}

/**
 * Create a groove operation.
 */
export function grooveOp(
  layer: string,
  depthMm: number,
  toolMm: number,
  axis: 'X' | 'Y',
  offsetMm: number,
  widthMm: number,
  lengthMm: number
): GrooveOp {
  return {
    kind: 'GROOVE',
    layer,
    depthMm,
    toolMm,
    axis,
    offsetMm,
    widthMm,
    lengthMm,
  };
}

/**
 * Create a drill operation.
 */
export function drillOp(
  layer: string,
  depthMm: number,
  diaMm: number,
  xMm: number,
  yMm: number,
  ref?: string
): DrillOp {
  return {
    kind: 'DRILL',
    layer,
    depthMm,
    diaMm,
    xMm,
    yMm,
    ref,
  };
}

/**
 * Create a kerf operation.
 */
export function kerfOp(
  layer: string,
  depthMm: number,
  toolMm: number,
  kerfCount: number,
  kerfSpacing: number,
  direction: 'horizontal' | 'vertical'
): KerfOp {
  return {
    kind: 'KERF',
    layer,
    depthMm,
    toolMm,
    kerfCount,
    kerfSpacing,
    direction,
  };
}

/**
 * Validate a toolpath plan.
 * Returns array of error messages (empty if valid).
 */
export function validateToolpathPlan(plan: ToolpathPlan): string[] {
  const errors: string[] = [];

  if (plan.version !== 'toolpath-plan.v1') {
    errors.push(`Unknown version: ${plan.version}`);
  }

  if (!plan.jobName) {
    errors.push('Missing jobName');
  }

  if (plan.sheets.length === 0) {
    errors.push('No sheets in plan');
  }

  for (let si = 0; si < plan.sheets.length; si++) {
    const sheet = plan.sheets[si];

    if (sheet.sheetW <= 0 || sheet.sheetH <= 0) {
      errors.push(`Sheet ${si}: Invalid dimensions ${sheet.sheetW}x${sheet.sheetH}`);
    }

    for (let pi = 0; pi < sheet.parts.length; pi++) {
      const part = sheet.parts[pi];

      if (!part.partId) {
        errors.push(`Sheet ${si}, Part ${pi}: Missing partId`);
      }

      if (part.widthMm <= 0 || part.heightMm <= 0) {
        errors.push(`Sheet ${si}, Part ${part.partId}: Invalid dimensions`);
      }

      for (let oi = 0; oi < part.ops.length; oi++) {
        const op = part.ops[oi];

        if (!op.layer) {
          errors.push(`Sheet ${si}, Part ${part.partId}, Op ${oi}: Missing layer`);
        }

        if (op.kind === 'DRILL' && op.diaMm <= 0) {
          errors.push(`Sheet ${si}, Part ${part.partId}, Op ${oi}: Invalid drill diameter`);
        }
      }
    }
  }

  return errors;
}
