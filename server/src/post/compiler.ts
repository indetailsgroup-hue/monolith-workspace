/**
 * Toolpath Plan to G-Code Compiler
 *
 * Step 10.5: Compiles toolpath_plan.json to machine-specific G-code
 *
 * Pipeline:
 * 1. Read toolpath plan JSON
 * 2. Group operations by tool (minimize tool changes)
 * 3. Transform part-local coords to sheet-global
 * 4. Generate G-code using GCode writer
 * 5. Output one .nc file per sheet
 *
 * Supported operations:
 * - PROFILE (outline cut with tabs)
 * - DRILL (simple drill cycle)
 * - GROOVE (slot/dado cut)
 */

import type { MachineProfile, Tool } from './machineProfile.js';
import { DEFAULT_TOOL_TABLE, getToolByNumber, findToolByDiameter } from './machineProfile.js';
import { createGCode } from './gcodeWriter.js';
import {
  createTransformContext,
  partLocalToSheet,
  transformDrill,
  calculateZLevels,
  optimizeDrillOrder,
  type Point2D,
  type Rotation,
} from './transform.js';
import type { ToolpathPlan, SheetToolpath, DrillOp, GrooveOp } from '../export/exporters/dxfR12/toolpathPlan.js';

// ============================================================================
// Types
// ============================================================================

export interface CompileOptions {
  profile: MachineProfile;
  toolTable?: Tool[];
  /** Safe Z height override (mm) */
  safeZ?: number;
  /** Spoilboard protection (mm below material) */
  spoilboardClearance?: number;
}

export interface CompileResult {
  ok: boolean;
  sheets: SheetGCode[];
  error?: string;
}

export interface SheetGCode {
  sheetIndex: number;
  filename: string;
  content: string;
  stats: {
    toolChanges: number;
    totalDrills: number;
    totalProfiles: number;
    totalGrooves: number;
    estimatedTimeMin: number;
  };
}

// ============================================================================
// Operation Grouping
// ============================================================================

interface GroupedOps {
  toolNo: number;
  tool: Tool;
  drills: Array<{ x: number; y: number; z: number; depth: number; partId: string }>;
  profiles: Array<{ partId: string; points: Point2D[]; depth: number; tabs: Point2D[] }>;
  grooves: Array<{ partId: string; points: Point2D[]; depth: number; width: number }>;
}

/**
 * Group operations by tool to minimize tool changes.
 */
function groupByTool(
  sheet: SheetToolpath,
  defaults: ToolpathPlan['defaults'],
  toolTable: Tool[]
): GroupedOps[] {
  const groups = new Map<number, GroupedOps>();

  const getOrCreateGroup = (toolNo: number): GroupedOps => {
    if (!groups.has(toolNo)) {
      const tool = getToolByNumber(toolNo, toolTable);
      if (!tool) {
        throw new Error(`Tool T${toolNo} not found in tool table`);
      }
      groups.set(toolNo, {
        toolNo,
        tool,
        drills: [],
        profiles: [],
        grooves: [],
      });
    }
    return groups.get(toolNo)!;
  };

  // Process each part
  for (const part of sheet.parts) {
    const ctx = createTransformContext(
      part.x,
      part.y,
      part.widthMm,
      part.heightMm,
      part.rot as Rotation,
      part.thicknessMm
    );

    // Process operations from the ops array
    for (const op of part.ops) {
      if (op.kind === 'DRILL') {
        const drill = op as DrillOp;
        const toolNo = findDrillTool(drill.diaMm, toolTable);
        const group = getOrCreateGroup(toolNo);

        const transformed = transformDrill(
          { x: drill.xMm, y: drill.yMm },
          drill.depthMm,
          ctx
        );

        group.drills.push({
          x: transformed.x,
          y: transformed.y,
          z: transformed.zBottom,
          depth: drill.depthMm,
          partId: part.partId,
        });
      } else if (op.kind === 'GROOVE') {
        const groove = op as GrooveOp;
        const toolNo = findGrooveTool(groove.widthMm, toolTable);
        const group = getOrCreateGroup(toolNo);

        // Build groove path from axis + offset + length
        const points: Point2D[] = [];
        if (groove.axis === 'X') {
          // Horizontal groove
          const y = groove.offsetMm;
          points.push(partLocalToSheet({ x: 0, y }, ctx));
          points.push(partLocalToSheet({ x: groove.lengthMm, y }, ctx));
        } else {
          // Vertical groove
          const x = groove.offsetMm;
          points.push(partLocalToSheet({ x, y: 0 }, ctx));
          points.push(partLocalToSheet({ x, y: groove.lengthMm }, ctx));
        }

        group.grooves.push({
          partId: part.partId,
          points,
          depth: groove.depthMm,
          width: groove.widthMm,
        });
      } else if (op.kind === 'PROFILE') {
        const profile = op;
        const profileToolMm = profile.toolMm ?? defaults?.profileToolMm ?? 6;
        const tool = findToolByDiameter(profileToolMm, 'ENDMILL', toolTable);
        const toolNo = tool?.toolNo ?? 1;
        const group = getOrCreateGroup(toolNo);

        // Transform tab positions
        const tabs: Point2D[] = (profile.tabPositions ?? []).map(t =>
          partLocalToSheet({ x: t.x, y: t.y }, ctx)
        );

        // Build profile rectangle points
        const w = part.widthMm;
        const h = part.heightMm;
        const profilePoints: Point2D[] = [
          partLocalToSheet({ x: 0, y: 0 }, ctx),
          partLocalToSheet({ x: w, y: 0 }, ctx),
          partLocalToSheet({ x: w, y: h }, ctx),
          partLocalToSheet({ x: 0, y: h }, ctx),
          partLocalToSheet({ x: 0, y: 0 }, ctx),  // Close
        ];

        const profileDepth = profile.depthMm ?? defaults?.profileDepthMm ?? (part.thicknessMm + 1);

        group.profiles.push({
          partId: part.partId,
          points: profilePoints,
          depth: profileDepth,
          tabs,
        });
      }
    }
  }

  // Sort groups by tool number
  return Array.from(groups.values()).sort((a, b) => a.toolNo - b.toolNo);
}

/**
 * Find appropriate drill tool for hole diameter.
 */
function findDrillTool(diameter: number, toolTable: Tool[]): number {
  const tool = findToolByDiameter(diameter, 'DRILL', toolTable);
  return tool?.toolNo ?? 3;  // Default to T3
}

/**
 * Find appropriate end mill for groove width.
 */
function findGrooveTool(width: number, toolTable: Tool[]): number {
  const tool = findToolByDiameter(width, 'ENDMILL', toolTable);
  return tool?.toolNo ?? 2;  // Default to T2
}

// ============================================================================
// G-Code Generation
// ============================================================================

/**
 * Compile a single sheet to G-code.
 */
export function compileSheetToGcode(
  sheet: SheetToolpath,
  plan: ToolpathPlan,
  options: CompileOptions
): SheetGCode {
  const { profile, toolTable = DEFAULT_TOOL_TABLE } = options;
  const safeZ = options.safeZ ?? profile.safeZMm;

  const gcode = createGCode({
    profile,
    jobName: plan.jobName,
    sheetIndex: sheet.sheetIndex,
  });

  // Header
  gcode.header();
  gcode.blank();
  gcode.comment(`Sheet ${sheet.sheetIndex + 1} of ${plan.summary.totalSheets}`);
  gcode.comment(`Parts: ${sheet.parts.length}`);
  gcode.blank();

  // Group operations by tool
  const groups = groupByTool(sheet, plan.defaults, toolTable);

  let stats = {
    toolChanges: 0,
    totalDrills: 0,
    totalProfiles: 0,
    totalGrooves: 0,
    estimatedTimeMin: 0,
  };

  // Generate code for each tool group
  for (const group of groups) {
    gcode.blank();
    gcode.comment(`=== Tool ${group.toolNo}: ${group.tool.description} ===`);

    // Tool change
    gcode.toolChange(group.toolNo);
    gcode.spindleOn(group.tool.defaultRpm);
    gcode.dwell(2);  // Spindle warmup
    stats.toolChanges++;

    // 1. Drills first (fastest operations)
    if (group.drills.length > 0) {
      gcode.blank();
      gcode.comment(`Drilling: ${group.drills.length} holes`);

      // Optimize drill order using nearest-neighbor
      const drillPoints = group.drills.map(d => ({ x: d.x, y: d.y }));
      const optimizedPoints = optimizeDrillOrder(drillPoints);

      // Re-order drills to match optimized points
      const optimized = optimizedPoints.map(pt =>
        group.drills.find(d => d.x === pt.x && d.y === pt.y)!
      );

      gcode.safeZ();

      for (const d of optimized) {
        // Use canned drill cycle
        gcode.drill(
          d.x,
          d.y,
          d.z,
          safeZ,
          group.tool.defaultFeedMm * 0.5  // Slower feed for drilling
        );
        stats.totalDrills++;
      }

      gcode.cancelCycle();
      gcode.safeZ();
    }

    // 2. Grooves
    if (group.grooves.length > 0) {
      gcode.blank();
      gcode.comment(`Grooves: ${group.grooves.length}`);

      for (const g of group.grooves) {
        gcode.comment(`Groove for ${g.partId}`);

        // Calculate Z levels for multi-pass
        const thickness = 18;  // Default thickness
        const zLevels = calculateZLevels(g.depth, group.tool.maxDocMm, thickness);

        gcode.safeZ();
        gcode.rapid(g.points[0].x, g.points[0].y);

        for (const z of zLevels) {
          // Plunge at start
          gcode.plunge(z, group.tool.defaultFeedMm * 0.3);

          // Cut along path
          for (let i = 1; i < g.points.length; i++) {
            gcode.linear(g.points[i].x, g.points[i].y, undefined, group.tool.defaultFeedMm);
          }
        }

        gcode.safeZ();
        stats.totalGrooves++;
      }
    }

    // 3. Profiles last (parts fall away)
    if (group.profiles.length > 0) {
      gcode.blank();
      gcode.comment(`Profiles: ${group.profiles.length}`);

      for (const p of group.profiles) {
        gcode.blank();
        gcode.comment(`Profile cut: ${p.partId}`);

        // Calculate Z levels for multi-pass
        const thickness = 18;  // Default
        const zLevels = calculateZLevels(p.depth, group.tool.maxDocMm, thickness);

        // Generate profile toolpath (skip tab positions)
        gcode.safeZ();
        gcode.rapid(p.points[0].x, p.points[0].y);

        for (const z of zLevels) {
          gcode.plunge(z, group.tool.defaultFeedMm * 0.3);

          // Cut profile
          for (let i = 1; i < p.points.length; i++) {
            const pt = p.points[i];

            // Check if this segment crosses a tab
            // For now, cut with reduced depth at tab locations
            // TODO: Implement proper tab skipping

            gcode.linear(pt.x, pt.y, undefined, group.tool.defaultFeedMm);
          }
        }

        gcode.safeZ();
        stats.totalProfiles++;
      }
    }

    // Spindle off after tool group
    gcode.spindleOff();
  }

  // Footer
  gcode.blank();
  gcode.comment('=== End of sheet ===');
  gcode.footer();

  // Estimate time (rough calculation)
  stats.estimatedTimeMin = Math.ceil(
    (stats.totalDrills * 0.1) +
    (stats.totalGrooves * 0.5) +
    (stats.totalProfiles * 1.0) +
    (stats.toolChanges * 0.5)
  );

  return {
    sheetIndex: sheet.sheetIndex,
    filename: `${plan.jobName}_sheet${sheet.sheetIndex + 1}.nc`,
    content: gcode.build(),
    stats,
  };
}

// ============================================================================
// Main Compiler Function
// ============================================================================

/**
 * Compile a complete toolpath plan to G-code.
 *
 * @param plan - Toolpath plan from toolpathPlan.json
 * @param options - Compiler options
 * @returns Compile result with G-code for each sheet
 */
export function compileToolpathPlan(
  plan: ToolpathPlan,
  options: CompileOptions
): CompileResult {
  try {
    const sheets: SheetGCode[] = [];

    for (const sheet of plan.sheets) {
      const result = compileSheetToGcode(sheet, plan, options);
      sheets.push(result);
    }

    return {
      ok: true,
      sheets,
    };

  } catch (err) {
    return {
      ok: false,
      sheets: [],
      error: err instanceof Error ? err.message : 'Unknown compile error',
    };
  }
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate compile summary string.
 */
export function formatCompileSummary(result: CompileResult): string {
  if (!result.ok) {
    return `Compile failed: ${result.error}`;
  }

  const lines: string[] = [
    'G-Code Compilation Summary',
    '==========================',
    `Sheets: ${result.sheets.length}`,
    '',
  ];

  let totalDrills = 0;
  let totalProfiles = 0;
  let totalGrooves = 0;
  let totalTime = 0;

  for (const sheet of result.sheets) {
    lines.push(`Sheet ${sheet.sheetIndex + 1}: ${sheet.filename}`);
    lines.push(`  Tool changes: ${sheet.stats.toolChanges}`);
    lines.push(`  Drills: ${sheet.stats.totalDrills}`);
    lines.push(`  Grooves: ${sheet.stats.totalGrooves}`);
    lines.push(`  Profiles: ${sheet.stats.totalProfiles}`);
    lines.push(`  Est. time: ${sheet.stats.estimatedTimeMin} min`);
    lines.push('');

    totalDrills += sheet.stats.totalDrills;
    totalProfiles += sheet.stats.totalProfiles;
    totalGrooves += sheet.stats.totalGrooves;
    totalTime += sheet.stats.estimatedTimeMin;
  }

  lines.push('Totals:');
  lines.push(`  Drills: ${totalDrills}`);
  lines.push(`  Grooves: ${totalGrooves}`);
  lines.push(`  Profiles: ${totalProfiles}`);
  lines.push(`  Est. total time: ${totalTime} min`);

  return lines.join('\n');
}
