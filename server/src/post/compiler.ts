/**
 * Toolpath Plan to G-Code Compiler
 *
 * Step 10.5: Compiles toolpath_plan.json to machine-specific G-code
 * Step 10.5.1: Lead-in/out + Peck drilling
 * Step 10.5.2: Ramp entry + Finishing pass
 * Step 10.5.3: Corner smoothing + Onion skin + Compression tools
 * Step 10.5.4: General polyline boundary toolpath (LINE + ARC)
 * Step 10.5.5: Arc-preserving tabs + Arc-aware offset for finishing
 * Step 10.5.6: Analytic joins + open-path offset caps (CAM-kernel grade)
 *
 * Pipeline:
 * 1. Read toolpath plan JSON
 * 2. Group operations by tool (minimize tool changes)
 * 3. Transform part-local coords to sheet-global
 * 4. Generate G-code using GCode writer
 * 5. Output one .nc file per sheet
 *
 * Supported operations:
 * - PROFILE (outline cut with tabs, ramp entry, finishing pass, corner smoothing)
 * - DRILL (simple/peck drill cycle)
 * - GROOVE (slot/dado cut with ramp entry)
 */

import type { MachineProfile, Tool, LaminateTag } from './machineProfile.js';
import { DEFAULT_TOOL_TABLE, getToolByNumber, findToolByDiameter } from './machineProfile.js';
import { createGCode, type GCode } from './gcodeWriter.js';
import {
  createTransformContext,
  partLocalToSheet,
  transformDrill,
  calculateZLevels,
  optimizeDrillOrder,
  type Point2D,
  type Rotation,
} from './transform.js';
import {
  pathAngle,
  calculateLeadIn,
  calculateLeadOut,
  type LeadConfig,
  leadInLine,
  leadOutLine,
} from './lead.js';
import { calculatePassRamp, rampLengthForDepth } from './ramp.js';
import { offsetRectPoints } from './offset.js';
import {
  generateProfilePath,
  type SmoothedPath,
} from './cornerArcsRect.js';
import type { ToolpathPlan, SheetToolpath, DrillOp, GrooveOp } from '../export/exporters/dxfR12/toolpathPlan.js';

// Step 10.5.4: General polyline imports
import type { Path, Pt, ToolpathPart, TabConfig } from './planTypes.js';
import { pathStart, isLineOnlyPath } from './planTypes.js';
import { transformPathPartToSheet } from './pathTransform.js';
import { emitPathAtCurrentZ, pathStartTangent, type PositionState } from './pathEmit.js';
import { getPathsForCutting, needsTabSplitting } from './tabsGeneral.js';
import { offsetClosedLinePath, canOffsetPath } from './offsetLinePath.js';

// Step 10.5.5: Arc-preserving imports
import { splitPathByTabsKeepArcs, hasArcSegments } from './tabsSplitKeepArcs.js';
import { offsetClosedPathArcAware, canOffsetPathArcAware } from './offsetArcAware.js';

// Step 10.5.6: Analytic offset kernel
import {
  offsetClosedPath as offsetClosedPathAnalytic,
  offsetOpenPaths as offsetOpenPathsAnalytic,
  canOffsetWithKernel,
  validateOffsetResult,
} from './offsetKernel/index.js';

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

/**
 * Check if material is a laminate that benefits from compression tooling.
 */
function isLaminateMaterial(
  materialTag: string | undefined,
  laminateTags: LaminateTag[]
): boolean {
  if (!materialTag) return false;
  return laminateTags.includes(materialTag.toUpperCase() as LaminateTag);
}

/**
 * Find compression spiral tool for laminate cutting.
 * Compression spirals have specific geometry (up-cut bottom, down-cut top).
 */
function findCompressionTool(
  diameter: number,
  toolTable: Tool[]
): Tool | undefined {
  // Look for tools with 'COMPRESSION' in description
  const compressionTools = toolTable.filter(t =>
    t.type === 'ENDMILL' &&
    t.description.toUpperCase().includes('COMPRESSION') &&
    t.diaMm >= diameter
  );

  if (compressionTools.length > 0) {
    // Return smallest that fits
    return compressionTools.sort((a, b) => a.diaMm - b.diaMm)[0];
  }

  return undefined;
}

/**
 * Get bounding box of a set of points.
 */
function getBoundingBox(points: Point2D[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate Z levels with onion skin support.
 * Leaves thin material at bottom until final pass.
 */
function calculateZLevelsWithOnionSkin(
  depth: number,
  stepdown: number,
  thickness: number,
  onionSkinMm: number,
  finalPassMm: number
): { roughLevels: number[]; finalLevel: number } {
  // Calculate rough passes (stop before onion skin threshold)
  const roughDepth = depth - onionSkinMm;
  const roughLevels: number[] = [];

  let currentDepth = 0;
  while (currentDepth < roughDepth) {
    currentDepth = Math.min(currentDepth + stepdown, roughDepth);
    // Z = material surface (0) minus depth
    roughLevels.push(-currentDepth);
  }

  // Final pass goes through onion skin
  const finalLevel = -depth;

  return { roughLevels, finalLevel };
}

/**
 * Emit a smoothed path to G-code.
 * Handles LINE and ARC_CCW segments with proper I/J calculation.
 */
function emitSmoothedPath(
  gcode: ReturnType<typeof createGCode>,
  path: SmoothedPath,
  feed: number,
  startX: number,
  startY: number
): void {
  let currentX = startX;
  let currentY = startY;

  for (const seg of path.segments) {
    if (seg.type === 'LINE') {
      gcode.linear(seg.end.x, seg.end.y, undefined, feed);
    } else if (seg.type === 'ARC_CCW' && seg.center) {
      // Calculate I/J relative offsets from current position to center
      const i = seg.center.x - currentX;
      const j = seg.center.y - currentY;
      gcode.arcCCW(seg.end.x, seg.end.y, i, j, feed);
    } else if (seg.type === 'ARC_CW' && seg.center) {
      const i = seg.center.x - currentX;
      const j = seg.center.y - currentY;
      gcode.arcCW(seg.end.x, seg.end.y, i, j, feed);
    }
    currentX = seg.end.x;
    currentY = seg.end.y;
  }
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

      const drillFeed = group.tool.defaultFeedMm * 0.5;  // Slower feed for drilling
      const tuning = profile.tuning;

      for (const d of optimized) {
        // Check if peck drilling is enabled
        if (tuning?.drilling?.peckEnabled && d.depth > tuning.drilling.peckStepMm) {
          // Manual peck drilling for deep holes
          gcode.comment(`Peck drill: depth=${d.depth.toFixed(1)}mm`);
          gcode.rapid(d.x, d.y);
          gcode.rapid(undefined, undefined, safeZ);

          const peckStep = tuning.drilling.peckStepMm;
          const retract = tuning.drilling.retractMm;
          const dwellMs = tuning.drilling.dwellMs;
          let currentDepth = 0;

          while (currentDepth < d.depth) {
            currentDepth = Math.min(currentDepth + peckStep, d.depth);
            const targetZ = d.z + (d.depth - currentDepth);  // d.z is bottom, go down incrementally

            // Plunge to current peck depth
            gcode.linear(undefined, undefined, targetZ, drillFeed);

            // Dwell at bottom if configured
            if (dwellMs > 0) {
              gcode.dwellMs(dwellMs);
            }

            // Retract for chip clearing (unless this is the final depth)
            if (currentDepth < d.depth) {
              gcode.rapid(undefined, undefined, targetZ + retract);
            }
          }

          // Full retract after hole complete
          gcode.safeZ();
        } else {
          // Use canned drill cycle for shallow holes
          gcode.drill(
            d.x,
            d.y,
            d.z,
            safeZ,
            drillFeed
          );
        }
        stats.totalDrills++;
      }

      gcode.cancelCycle();
      gcode.safeZ();
    }

    // 2. Grooves
    if (group.grooves.length > 0) {
      gcode.blank();
      gcode.comment(`Grooves: ${group.grooves.length}`);

      // Get groove lead config
      const grooveLeadConfig: LeadConfig | undefined = profile.tuning?.grooveLead
        ? {
            mode: profile.tuning.grooveLead.mode,
            lengthMm: profile.tuning.grooveLead.lengthMm,
            angleDeg: profile.tuning.grooveLead.angleDeg,
          }
        : undefined;

      // Get ramp config
      const rampConfig = profile.tuning?.ramp;

      for (const g of group.grooves) {
        gcode.comment(`Groove for ${g.partId}`);

        // Calculate Z levels for multi-pass
        const thickness = 18;  // Default thickness
        const zLevels = calculateZLevels(g.depth, group.tool.maxDocMm, thickness);

        // Calculate lead-in/out points if configured
        const startPt = g.points[0];
        const endPt = g.points[g.points.length - 1];
        const nextPt = g.points[1] ?? endPt;
        const grooveAngle = pathAngle(startPt, nextPt);

        let leadInPt: Point2D | undefined;
        let leadOutPt: Point2D | undefined;

        if (grooveLeadConfig && grooveLeadConfig.mode !== 'NONE') {
          const leadIn = calculateLeadIn(startPt, grooveAngle, grooveLeadConfig);
          const leadOut = calculateLeadOut(endPt, grooveAngle, grooveLeadConfig);
          leadInPt = leadIn.point;
          leadOutPt = leadOut.point;
        }

        gcode.safeZ();

        // Rapid to lead-in point (or start point)
        const rapidTarget = leadInPt ?? startPt;
        gcode.rapid(rapidTarget.x, rapidTarget.y);

        let prevZ = safeZ;
        for (const z of zLevels) {
          // Try ramp entry instead of vertical plunge
          const rampResult = rampConfig
            ? calculatePassRamp(startPt, nextPt, prevZ, z, rampConfig)
            : { canRamp: false };

          if (rampResult.canRamp && rampResult.ramp) {
            // Ramp entry: move XY+Z simultaneously
            gcode.comment(`Ramp entry: ${rampResult.ramp.horizontalLength.toFixed(1)}mm`);
            gcode.rapid(undefined, undefined, prevZ);  // Ensure at previous Z
            gcode.linear(
              rampResult.ramp.end.x,
              rampResult.ramp.end.y,
              z,
              group.tool.defaultFeedMm * 0.5  // Slower for ramp
            );
          } else {
            // Fallback to vertical plunge
            gcode.plunge(z, group.tool.defaultFeedMm * 0.3);
          }

          // Lead-in move to start point (if using lead and didn't ramp)
          if (leadInPt && !rampResult.canRamp) {
            gcode.linear(startPt.x, startPt.y, undefined, group.tool.defaultFeedMm);
          }

          // Cut along groove path
          for (let i = 1; i < g.points.length; i++) {
            gcode.linear(g.points[i].x, g.points[i].y, undefined, group.tool.defaultFeedMm);
          }

          // Lead-out move (if using lead)
          if (leadOutPt) {
            gcode.linear(leadOutPt.x, leadOutPt.y, undefined, group.tool.defaultFeedMm);
          }

          prevZ = z;
        }

        gcode.safeZ();
        stats.totalGrooves++;
      }
    }

    // 3. Profiles last (parts fall away)
    if (group.profiles.length > 0) {
      gcode.blank();
      gcode.comment(`Profiles: ${group.profiles.length}`);

      // Get profile lead config
      const profileLeadConfig: LeadConfig | undefined = profile.tuning?.profileLead
        ? {
            mode: profile.tuning.profileLead.mode,
            lengthMm: profile.tuning.profileLead.lengthMm,
            angleDeg: profile.tuning.profileLead.angleDeg,
            arcRadiusMm: profile.tuning.profileLead.arcRadiusMm,
          }
        : undefined;

      // Get ramp, finishing, smoothing, and holdDown configs
      const rampConfig = profile.tuning?.ramp;
      const finishingConfig = profile.tuning?.finishing;
      const smoothingConfig = profile.tuning?.smoothing;
      const holdDownConfig = profile.tuning?.holdDown;

      for (const p of group.profiles) {
        gcode.blank();
        gcode.comment(`Profile cut: ${p.partId}`);

        // Calculate Z levels for roughing
        const thickness = 18;  // Default
        const roughStepdown = group.tool.maxDocMm;

        // Check if onion skin is enabled
        const useOnionSkin = holdDownConfig?.onionSkinEnabled && holdDownConfig.onionSkinMm > 0;

        let roughZLevels: number[];
        let onionSkinFinalZ: number | undefined;

        if (useOnionSkin) {
          // Calculate levels with onion skin (stop before full depth)
          const onionResult = calculateZLevelsWithOnionSkin(
            p.depth,
            roughStepdown,
            thickness,
            holdDownConfig!.onionSkinMm,
            holdDownConfig!.finalPassMm
          );
          roughZLevels = onionResult.roughLevels;
          onionSkinFinalZ = onionResult.finalLevel;
          gcode.comment(`Onion skin: ${holdDownConfig!.onionSkinMm}mm`);
        } else {
          roughZLevels = calculateZLevels(p.depth, roughStepdown, thickness);
        }

        // Determine if we need finishing pass
        const needsFinishing = finishingConfig?.enabled && finishingConfig.radialMm > 0;

        // Calculate finishing Z levels (smaller stepdown for better finish)
        const finishZLevels = needsFinishing
          ? calculateZLevels(p.depth, finishingConfig!.stepdownMm, thickness)
          : [];

        // Get bounding box dimensions for smoothing
        const bbox = getBoundingBox(p.points);
        const profileW = bbox.maxX - bbox.minX;
        const profileH = bbox.maxY - bbox.minY;

        // Generate smoothed profile path if enabled
        const useSmoothing = smoothingConfig?.enabled && smoothingConfig.cornerRadiusMm > 0;
        const smoothedPath: SmoothedPath | undefined = useSmoothing
          ? generateProfilePath(profileW, profileH, smoothingConfig!, bbox.minX, bbox.minY)
          : undefined;

        if (smoothedPath?.smoothed) {
          gcode.comment(`Corner smoothing: R${smoothingConfig!.cornerRadiusMm}mm`);
        }

        // Calculate offset profile points for roughing (leave material for finish)
        const roughingPoints = needsFinishing
          ? offsetRectPoints(p.points, finishingConfig!.radialMm)
          : p.points;

        // Calculate lead-in/out for profile (closed loop)
        const startPt = roughingPoints[0];
        const secondPt = roughingPoints[1];
        const lastPt = roughingPoints[roughingPoints.length - 2];
        const profileAngle = pathAngle(startPt, secondPt);

        let leadInPt: Point2D | undefined;
        let leadInArcCenter: Point2D | undefined;
        let leadInArcCW: boolean | undefined;

        if (profileLeadConfig && profileLeadConfig.mode !== 'NONE') {
          const leadIn = calculateLeadIn(startPt, profileAngle, profileLeadConfig);
          leadInPt = leadIn.point;
          leadInArcCenter = leadIn.arcCenter;
          leadInArcCW = leadIn.arcCW;
        }

        // === ROUGHING PASSES ===
        if (needsFinishing) {
          gcode.comment(`ROUGHING (offset ${finishingConfig!.radialMm}mm)`);
        }

        gcode.safeZ();
        const rapidTarget = leadInPt ?? startPt;
        gcode.rapid(rapidTarget.x, rapidTarget.y);

        let prevZ = safeZ;
        for (const z of roughZLevels) {
          // Try ramp entry
          const rampResult = rampConfig
            ? calculatePassRamp(startPt, secondPt, prevZ, z, rampConfig)
            : { canRamp: false };

          if (rampResult.canRamp && rampResult.ramp) {
            // Ramp entry
            gcode.comment(`Ramp entry: ${rampResult.ramp.horizontalLength.toFixed(1)}mm`);
            gcode.rapid(undefined, undefined, prevZ);
            gcode.linear(
              rampResult.ramp.end.x,
              rampResult.ramp.end.y,
              z,
              group.tool.defaultFeedMm * 0.5
            );
          } else {
            // Vertical plunge with lead-in
            gcode.plunge(z, group.tool.defaultFeedMm * 0.3);

            // Lead-in move to start point
            if (leadInPt) {
              if (leadInArcCenter && profileLeadConfig?.mode === 'ARC') {
                const i = leadInArcCenter.x - leadInPt.x;
                const j = leadInArcCenter.y - leadInPt.y;
                if (leadInArcCW) {
                  gcode.arcCW(startPt.x, startPt.y, i, j, group.tool.defaultFeedMm);
                } else {
                  gcode.arcCCW(startPt.x, startPt.y, i, j, group.tool.defaultFeedMm);
                }
              } else {
                gcode.linear(startPt.x, startPt.y, undefined, group.tool.defaultFeedMm);
              }
            }
          }

          // Cut profile (use smoothed path if available for roughing without finishing)
          if (smoothedPath?.smoothed && !needsFinishing) {
            // Use smoothed path with corner arcs
            emitSmoothedPath(gcode, smoothedPath, group.tool.defaultFeedMm, startPt.x, startPt.y);
          } else {
            // Standard linear profile
            for (let i = 1; i < roughingPoints.length - 1; i++) {
              gcode.linear(roughingPoints[i].x, roughingPoints[i].y, undefined, group.tool.defaultFeedMm);
            }
            // Close profile
            gcode.linear(startPt.x, startPt.y, undefined, group.tool.defaultFeedMm);
          }

          // Lead-out
          if (leadInPt && !rampResult.canRamp) {
            if (leadInArcCenter && profileLeadConfig?.mode === 'ARC') {
              const exitAngle = pathAngle(lastPt, startPt);
              const leadOut = calculateLeadOut(startPt, exitAngle, profileLeadConfig!);
              const i = leadOut.arcCenter ? leadOut.arcCenter.x - startPt.x : 0;
              const j = leadOut.arcCenter ? leadOut.arcCenter.y - startPt.y : 0;
              if (leadOut.arcCW) {
                gcode.arcCW(leadOut.point.x, leadOut.point.y, i, j, group.tool.defaultFeedMm);
              } else {
                gcode.arcCCW(leadOut.point.x, leadOut.point.y, i, j, group.tool.defaultFeedMm);
              }
            } else {
              gcode.linear(leadInPt.x, leadInPt.y, undefined, group.tool.defaultFeedMm);
            }
          }

          prevZ = z;
        }

        // === ONION SKIN FINAL PASS ===
        // Cut through the remaining thin material to release the part
        if (useOnionSkin && onionSkinFinalZ !== undefined) {
          gcode.blank();
          gcode.comment(`ONION SKIN FINAL (through ${holdDownConfig!.onionSkinMm}mm)`);

          // Position at start point
          gcode.rapid(startPt.x, startPt.y);

          // Plunge through onion skin (slower for clean break)
          const finalFeed = group.tool.defaultFeedMm * 0.6;
          gcode.plunge(onionSkinFinalZ, finalFeed * 0.5);

          // Cut profile one final time at full depth
          if (smoothedPath?.smoothed) {
            emitSmoothedPath(gcode, smoothedPath, finalFeed, startPt.x, startPt.y);
          } else {
            for (let i = 1; i < roughingPoints.length - 1; i++) {
              gcode.linear(roughingPoints[i].x, roughingPoints[i].y, undefined, finalFeed);
            }
            gcode.linear(startPt.x, startPt.y, undefined, finalFeed);
          }
        }

        // === FINISHING PASSES ===
        if (needsFinishing && finishZLevels.length > 0) {
          gcode.blank();
          gcode.comment(`FINISHING PASS (radial=${finishingConfig!.radialMm}mm)`);

          // Use original profile points for finishing (no offset)
          const finishStartPt = p.points[0];
          const finishSecondPt = p.points[1];
          const finishAngle = pathAngle(finishStartPt, finishSecondPt);

          // Calculate lead-in for finish pass
          let finishLeadInPt: Point2D | undefined;
          if (profileLeadConfig && profileLeadConfig.mode !== 'NONE') {
            const finishLeadIn = calculateLeadIn(finishStartPt, finishAngle, profileLeadConfig);
            finishLeadInPt = finishLeadIn.point;
          }

          gcode.safeZ();
          const finishRapidTarget = finishLeadInPt ?? finishStartPt;
          gcode.rapid(finishRapidTarget.x, finishRapidTarget.y);

          prevZ = safeZ;
          for (const z of finishZLevels) {
            // Ramp entry for finish pass
            const rampResult = rampConfig
              ? calculatePassRamp(finishStartPt, finishSecondPt, prevZ, z, rampConfig)
              : { canRamp: false };

            if (rampResult.canRamp && rampResult.ramp) {
              gcode.rapid(undefined, undefined, prevZ);
              gcode.linear(
                rampResult.ramp.end.x,
                rampResult.ramp.end.y,
                z,
                group.tool.defaultFeedMm * 0.7  // Slightly slower for finish
              );
            } else {
              gcode.plunge(z, group.tool.defaultFeedMm * 0.3);
              if (finishLeadInPt) {
                gcode.linear(finishStartPt.x, finishStartPt.y, undefined, group.tool.defaultFeedMm);
              }
            }

            // Cut finish profile (slower feed for better surface)
            const finishFeed = group.tool.defaultFeedMm * 0.8;

            // Use smoothed path for finishing if available
            if (smoothedPath?.smoothed) {
              emitSmoothedPath(gcode, smoothedPath, finishFeed, finishStartPt.x, finishStartPt.y);
            } else {
              for (let i = 1; i < p.points.length - 1; i++) {
                gcode.linear(p.points[i].x, p.points[i].y, undefined, finishFeed);
              }
              // Close profile
              gcode.linear(finishStartPt.x, finishStartPt.y, undefined, finishFeed);
            }

            // Lead-out for finish
            if (finishLeadInPt) {
              gcode.linear(finishLeadInPt.x, finishLeadInPt.y, undefined, finishFeed);
            }

            prevZ = z;
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

// ============================================================================
// Step 10.5.4: General Polyline Profile Compiler
// ============================================================================

/**
 * Depth pass calculation helper.
 */
function depthPasses(totalDepth: number, stepdown: number): number[] {
  const passes: number[] = [];
  let current = 0;

  while (current < totalDepth) {
    current = Math.min(current + stepdown, totalDepth);
    passes.push(-current); // Negative Z values
  }

  return passes;
}

/**
 * Get first tangent direction from path for ramp entry.
 */
function getPathFirstTangent(path: Path): Pt {
  return pathStartTangent(path);
}

/**
 * Perform ramp entry or vertical plunge.
 */
function doRampOrPlunge(
  gcode: ReturnType<typeof createGCode>,
  profile: MachineProfile,
  tool: Tool,
  targetZ: number,
  startPt: Pt,
  tangent: Pt
): void {
  const ramp = profile.tuning?.ramp;
  const plungeFeed = tool.defaultFeedMm * 0.3;

  if (!ramp?.enabled) {
    gcode.safeZ();
    gcode.linear(undefined, undefined, targetZ, plungeFeed);
    return;
  }

  const depth = Math.abs(targetZ);
  const rampLen = rampLengthForDepth(depth, ramp.angleDeg);

  if (rampLen < ramp.minLengthMm) {
    // Ramp too short, use vertical plunge
    gcode.safeZ();
    gcode.linear(undefined, undefined, targetZ, plungeFeed);
    return;
  }

  // Calculate ramp end point
  const endPt: Pt = {
    x: startPt.x + tangent.x * rampLen,
    y: startPt.y + tangent.y * rampLen,
  };

  gcode.safeZ();
  gcode.rapid(startPt.x, startPt.y);

  // Ramp entry: simultaneous XY and Z movement
  gcode.comment(`Ramp entry: ${rampLen.toFixed(1)}mm`);
  gcode.linear(endPt.x, endPt.y, targetZ, tool.defaultFeedMm * 0.5);
}

/**
 * Cut a single path at a specific depth.
 */
function cutPathAtDepth(
  gcode: ReturnType<typeof createGCode>,
  profile: MachineProfile,
  tool: Tool,
  path: Path,
  z: number,
  useLeadIn: boolean = true
): void {
  const feed = tool.defaultFeedMm;
  const start = pathStart(path);
  const tangent = getPathFirstTangent(path);

  // Calculate lead-in point
  let entryPt = start;
  const lead = profile.tuning?.profileLead;

  if (useLeadIn && lead?.mode === 'LINE' && lead.lengthMm > 0) {
    // Lead-in: calculate path angle from tangent vector
    const pathAngleRad = Math.atan2(tangent.y, tangent.x);
    entryPt = leadInLine(start, pathAngleRad, lead.lengthMm, lead.angleDeg);
  }

  // Position and plunge
  gcode.rapid(entryPt.x, entryPt.y);
  doRampOrPlunge(gcode, profile, tool, z, entryPt, tangent);

  // Move to path start if using lead-in
  const state: PositionState = { x: entryPt.x, y: entryPt.y };
  if (entryPt.x !== start.x || entryPt.y !== start.y) {
    gcode.linear(start.x, start.y, undefined, feed);
    state.x = start.x;
    state.y = start.y;
  }

  // Cut the path
  emitPathAtCurrentZ(gcode, path, feed, state);

  // Lead-out for open paths
  if (!path.closed && lead?.mode === 'LINE' && lead.lengthMm > 0) {
    const lastSeg = path.segs[path.segs.length - 1];
    const lastStart = lastSeg.kind === 'LINE' ? lastSeg.a : (lastSeg as any).start;
    const lastEnd = lastSeg.kind === 'LINE' ? lastSeg.b : (lastSeg as any).end;

    // Calculate exit angle from last segment direction
    const exitAngleRad = Math.atan2(lastEnd.y - lastStart.y, lastEnd.x - lastStart.x);
    const leadOutPt = leadOutLine(lastEnd, exitAngleRad, lead.lengthMm, lead.angleDeg);
    gcode.linear(leadOutPt.x, leadOutPt.y, undefined, feed);
  }

  gcode.safeZ();
}

export interface GeneralProfileOptions {
  /** Machine profile */
  profile: MachineProfile;
  /** Tool to use */
  tool: Tool;
  /** Part definition with geometry */
  part: ToolpathPart;
  /** Profile operation config */
  depthMm: number;
  /** Tab configuration */
  tabs?: TabConfig;
}

/**
 * Compile a profile operation using general polyline geometry.
 *
 * This is the Step 10.5.4 implementation that supports:
 * - Arbitrary polyline + arc geometry (not just rectangles)
 * - Tabs on general paths
 * - Lead-in/out
 * - Ramp entry
 * - Onion skin hold-down
 * - Finishing passes (for line-only closed paths)
 *
 * @param gcode - G-code writer instance
 * @param options - Profile compilation options
 */
export function compileProfileGeneral(
  gcode: ReturnType<typeof createGCode>,
  options: GeneralProfileOptions
): void {
  const { profile, tool, part, depthMm, tabs } = options;

  // Get outer path from part geometry
  const outerLocal = part.geometry?.outer;
  if (!outerLocal) {
    gcode.comment(`WARNING: No geometry for part ${part.partId}, skipping`);
    return;
  }

  // Transform path from part-local to sheet-global
  const outer = transformPathPartToSheet({
    path: outerLocal,
    partW: part.w,
    partH: part.h,
    rot: part.rot,
    placeX: part.x,
    placeY: part.y,
  });

  gcode.comment(`Profile cut: ${part.partId} (general geometry)`);

  // Get tuning configs
  const holdDown = profile.tuning?.holdDown;
  const finishing = profile.tuning?.finishing;

  // Calculate depth scheduling with onion skin
  const totalDepth = depthMm;
  const stepdown = tool.maxDocMm;

  const useOnionSkin = holdDown?.onionSkinEnabled &&
    holdDown.onionSkinMm > 0 &&
    totalDepth > holdDown.onionSkinMm + 0.2;

  const roughTarget = useOnionSkin
    ? totalDepth - holdDown!.onionSkinMm
    : totalDepth;

  const roughDepths = depthPasses(roughTarget, stepdown);

  // Step 10.5.5/10.5.6: Check if path has arcs (use arc-aware/analytic functions)
  const pathHasArcs = hasArcSegments(outer);

  // Step 10.5.6: Check if analytic kernel can be used
  const useAnalyticKernel = canOffsetWithKernel(outer);

  // Determine if finishing is possible
  // Analytic kernel works for any closed path with LINE/ARC segments
  // Arc-aware offset works for any closed path; line-only offset requires no arcs
  const canFinish = finishing?.enabled &&
    finishing.radialMm > 0 &&
    outer.closed &&
    (useAnalyticKernel || pathHasArcs ? canOffsetPathArcAware(outer) : canOffsetPath(outer));

  // For tabs + finishing: we can now offset open subpaths with 10.5.6 kernel
  const canFinishWithTabs = finishing?.enabled &&
    finishing.radialMm > 0 &&
    needsTabSplitting(tabs) &&
    useAnalyticKernel;

  // Calculate finishing depths
  const finishDepths = (canFinish || canFinishWithTabs)
    ? depthPasses(roughTarget, finishing!.stepdownMm)
    : [];

  // Get paths to cut (split by tabs if enabled)
  // Step 10.5.5: Use arc-preserving split if path has arcs
  const pathsToCut = needsTabSplitting(tabs)
    ? (pathHasArcs
        ? splitPathByTabsKeepArcs(outer, tabs!)
        : getPathsForCutting(outer, tabs))
    : [outer];

  // Calculate offset path for roughing (if finishing enabled)
  let roughingPaths: Path[] = pathsToCut;
  let finishingPaths: Path[] = [];

  if (canFinish && !needsTabSplitting(tabs)) {
    // No tabs: offset the closed path
    // Step 10.5.6: Try analytic kernel first for best quality joins
    if (useAnalyticKernel) {
      const offsetResult = offsetClosedPathAnalytic(outer, finishing!.radialMm, 'OUTSET');
      if (offsetResult.success && offsetResult.path) {
        roughingPaths = [offsetResult.path];
        finishingPaths = [outer];
        gcode.comment(`Roughing offset (analytic): ${finishing!.radialMm}mm`);

        // Validate and report quality
        const validation = validateOffsetResult(offsetResult);
        if (!validation.valid) {
          for (const issue of validation.issues) {
            gcode.comment(`OFFSET-ISSUE: ${issue}`);
          }
        }
        if (offsetResult.warnings.length > 0) {
          gcode.comment(`OFFSET-WARNINGS: ${offsetResult.warnings.length}`);
        }
      } else {
        // Fallback to arc-aware offset
        const fallbackResult = offsetClosedPathArcAware(outer, finishing!.radialMm, 'OUTSET');
        if (fallbackResult.success && fallbackResult.path) {
          roughingPaths = [fallbackResult.path];
          finishingPaths = [outer];
          gcode.comment(`Roughing offset (arc-aware fallback): ${finishing!.radialMm}mm`);
        }
      }
    } else if (pathHasArcs) {
      // Step 10.5.5: Use arc-aware offset for paths with arcs
      const offsetResult = offsetClosedPathArcAware(outer, finishing!.radialMm, 'OUTSET');
      if (offsetResult.success && offsetResult.path) {
        roughingPaths = [offsetResult.path];
        finishingPaths = [outer];
        gcode.comment(`Roughing offset (arc-aware): ${finishing!.radialMm}mm`);
        if (offsetResult.warnings?.length) {
          for (const w of offsetResult.warnings) {
            gcode.comment(`WARNING: ${w}`);
          }
        }
      }
    } else {
      // Line-only path: use original miter-join offset
      const offsetResult = offsetClosedLinePath(outer, finishing!.radialMm);
      if (offsetResult.success && offsetResult.path) {
        roughingPaths = [offsetResult.path];
        finishingPaths = [outer];
        gcode.comment(`Roughing offset: ${finishing!.radialMm}mm`);
      }
    }
  } else if (canFinishWithTabs) {
    // Step 10.5.6: Tabs + finishing - offset open subpaths
    gcode.comment(`Tabs + finishing: offsetting ${pathsToCut.length} subpaths`);

    const offsetResult = offsetOpenPathsAnalytic(
      pathsToCut,
      finishing!.radialMm,
      'OUTSET',
      'BUTT'
    );

    roughingPaths = offsetResult.paths;
    finishingPaths = pathsToCut; // Original subpaths for finishing

    if (offsetResult.warnings.length > 0) {
      gcode.comment(`OPEN-OFFSET-WARNINGS: ${offsetResult.warnings.length}`);
    }
  }

  // Legacy compatibility: convert finishingPaths to single path if needed
  const finishingPath: Path | undefined = finishingPaths.length === 1
    ? finishingPaths[0]
    : undefined;

  // Onion skin info
  if (useOnionSkin) {
    gcode.comment(`Onion skin: ${holdDown!.onionSkinMm}mm`);
  }

  // Tab info
  if (needsTabSplitting(tabs)) {
    gcode.comment(`Tabs: ${tabs!.count} x ${tabs!.lengthMm}mm`);
  }

  // === ROUGHING PASSES ===
  gcode.blank();
  gcode.comment('ROUGHING');

  for (const z of roughDepths) {
    for (const cutPath of roughingPaths) {
      cutPathAtDepth(gcode, profile, tool, cutPath, z);
    }
  }

  // === FINISHING PASSES ===
  // Step 10.5.6: Support both single path and multiple paths (tabs + finishing)
  if (finishDepths.length > 0 && (finishingPath || finishingPaths.length > 0)) {
    gcode.blank();
    gcode.comment(`FINISHING (radial=${finishing!.radialMm}mm)`);

    const finishFeedFactor = 0.8;
    const originalFeed = tool.defaultFeedMm;
    tool.defaultFeedMm = originalFeed * finishFeedFactor;

    // Use finishingPaths if available (tabs case), otherwise use single finishingPath
    const pathsToFinish = finishingPaths.length > 0 ? finishingPaths : [finishingPath!];

    for (const z of finishDepths) {
      for (const fPath of pathsToFinish) {
        cutPathAtDepth(gcode, profile, tool, fPath, z);
      }
    }

    tool.defaultFeedMm = originalFeed;
  }

  // === ONION SKIN FINAL PASS ===
  if (useOnionSkin) {
    gcode.blank();
    gcode.comment(`FINAL THROUGH (onion=${holdDown!.onionSkinMm}mm)`);

    const finalDepths = depthPasses(totalDepth, holdDown!.finalPassMm)
      .filter(z => z < -roughTarget + 0.001);

    const finalFeedFactor = 0.6;
    const originalFeed = tool.defaultFeedMm;
    tool.defaultFeedMm = originalFeed * finalFeedFactor;

    for (const z of finalDepths) {
      for (const cutPath of pathsToCut) {
        cutPathAtDepth(gcode, profile, tool, cutPath, z, false);
      }
    }

    tool.defaultFeedMm = originalFeed;
  }

  gcode.safeZ();
}
