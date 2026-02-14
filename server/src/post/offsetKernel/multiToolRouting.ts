/**
 * Multi-Tool Routing Planner
 *
 * Step 10.6.7: Rough/finish tool planning with deterministic sequencing.
 *
 * This module provides:
 * - Multi-tool strategy per material (rough → finish → optional score)
 * - Route plan IR (intermediate representation) for tool sequencing
 * - Priority-based step ordering (drill → groove → score → rough → finish)
 * - Integration with 10.6.2/10.6.4/10.6.5/10.6.6 pipeline
 *
 * Key concepts:
 * - RouteStep: Single machining operation with tool assignment
 * - ToolRoutePlan: Complete plan for a part with ordered steps
 * - MultiToolStrategy: Material-driven tool selection rules
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type { Path, Segment } from '../planTypes.js';
import type { Vec2 } from './mathCore.js';
import type { ToolKind, MaterialKind, MillingMode, CutDirectionDecision } from './directionPolicy.js';
import type { CutIntent, Winding, LoopRole } from './cutSidePlan.js';
import type { TabSpec, OpenSubpathEx } from './directionAwareTabs.js';
import type { DecoratedSubpath } from './entryExitStrategy.js';
import type { PassPlan, OffsetResolved, OffsetPipelineConfig } from './variableOffset.js';
import { resolveOffsetDistance } from './variableOffset.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool reference for routing.
 */
export interface ToolRef {
  /** Unique tool identifier */
  id: string;
  /** Tool diameter in mm */
  diameterMm: number;
  /** Tool geometry type */
  kind: ToolKind;
  /** Flute length in mm (optional) */
  fluteLenMm?: number;
  /** Tool description */
  description?: string;
}

/**
 * Operation kind in routing plan.
 */
export type OperationKind = 'PROFILE' | 'GROOVE' | 'DRILL' | 'POCKET';

/**
 * Pass kind for multi-pass machining.
 */
export type RoutePassKind = 'ROUGH' | 'SEMI_FINISH' | 'FINISH' | 'SCORE';

/**
 * Single step in the route plan.
 */
export interface RouteStep {
  /** Unique step identifier */
  stepId: string;
  /** Operation identifier */
  opId: string;
  /** Operation kind */
  opKind: OperationKind;
  /** Pass kind */
  passKind: RoutePassKind;
  /** Tool for this step */
  tool: ToolRef;
  /** Cut intent (for PROFILE) */
  intent?: CutIntent;
  /** Milling direction (from 10.6.4) */
  milling?: MillingMode;
  /** Offset distance from 10.6.2 */
  offsetDistanceMm?: number;
  /** Offset fingerprint for audit */
  offsetFingerprint?: string;
  /** Source path identifier */
  sourcePathId?: string;
  /** Compiled toolpath identifier */
  toolpathId?: string;
  /** Processing warnings */
  warnings?: string[];
  /** Priority for sequencing (lower = first) */
  priority: number;
  /** Depth for this pass (mm, negative into material) */
  depthMm?: number;
}

/**
 * Report item for route planning.
 */
export interface RouteReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Complete route plan for a part.
 */
export interface ToolRoutePlan {
  /** Sheet identifier */
  sheetId: string;
  /** Part identifier */
  partId: string;
  /** Ordered route steps */
  steps: RouteStep[];
  /** Tool order (appearance order, deduplicated) */
  toolOrder: string[];
  /** Processing report */
  report: RouteReportItem[];
  /** Whether plan is valid */
  valid: boolean;
}

/**
 * Multi-tool strategy for a material.
 */
export interface MultiToolStrategy {
  /** Rough tool identifier */
  roughToolId: string;
  /** Finish tool identifier */
  finishToolId: string;
  /** Stock to leave for rough pass (mm) */
  stockLeaveRadialMm: number;
  /** Allow finish-only if rough tool missing */
  allowFinishOnly: boolean;
  /** Optional scoring tool for HPL */
  scoreToolId?: string;
  /** Score depth (mm) */
  scoreDepthMm?: number;
  /** Strategy description */
  description?: string;
}

/**
 * Profile operation input for planning.
 */
export interface ProfileOpInput {
  /** Operation identifier */
  opId: string;
  /** Cut intent (OUTSIDE/INSIDE) */
  intent: CutIntent;
  /** Nominal path (before offset) */
  nominalPath: Path;
  /** Loop role (PERIMETER/HOLE) */
  loopRole: LoopRole;
  /** Loop area for small part detection */
  loopAreaMm2: number;
}

/**
 * Drill operation input.
 */
export interface DrillOpInput {
  /** Operation identifier */
  opId: string;
  /** Drill position */
  position: Vec2;
  /** Hole diameter */
  diameterMm: number;
  /** Drill depth */
  depthMm: number;
}

/**
 * Groove operation input.
 */
export interface GrooveOpInput {
  /** Operation identifier */
  opId: string;
  /** Groove axis */
  axis: 'X' | 'Y';
  /** Groove width */
  widthMm: number;
  /** Groove depth */
  depthMm: number;
}

/**
 * Input for building route plan.
 */
export interface BuildPlanInput {
  /** Sheet identifier */
  sheetId: string;
  /** Part identifier */
  partId: string;
  /** Material type */
  material: MaterialKind;
  /** Tool library */
  toolLibrary: Record<string, ToolRef>;
  /** Profile operations */
  profileOps: ProfileOpInput[];
  /** Drill operations */
  drillOps: DrillOpInput[];
  /** Groove operations */
  grooveOps: GrooveOpInput[];
  /** Direction policy config (from 10.6.4) */
  directionConfig?: {
    defaultMilling: MillingMode;
    preferClimbForFinish: boolean;
    smallPartAreaMm2: number;
  };
  /** Tab specification (from 10.6.5) */
  tabSpec?: TabSpec;
  /** Custom strategy override */
  strategyOverride?: Partial<MultiToolStrategy>;
}

/**
 * Compiled toolpath output.
 */
export interface CompiledToolpath {
  /** Toolpath identifier */
  toolpathId: string;
  /** Tool identifier */
  toolId: string;
  /** Flattened segments */
  segments: Segment[];
  /** Metadata */
  meta: {
    stepId: string;
    passKind: RoutePassKind;
    intent?: CutIntent;
    milling?: MillingMode;
  };
}

/**
 * Compile context for step compilation.
 */
export interface CompileContext {
  /** Material type */
  material: MaterialKind;
  /** Tool reference */
  tool: ToolRef;
  /** Milling mode */
  milling: MillingMode;
  /** Cut intent */
  intent: CutIntent;
  /** Path winding after normalization */
  pathWinding: Winding;
  /** Tab specification */
  tabSpec?: TabSpec;
}

// ============================================================================
// Constants
// ============================================================================

/** Priority codes for step ordering */
export const PRIORITY = {
  DRILL: 100,
  GROOVE: 200,
  SCORE: 290,
  PROFILE_ROUGH: 300,
  PROFILE_SEMI_FINISH: 350,
  PROFILE_FINISH: 400,
} as const;

/** Default stock leave values per material */
const DEFAULT_STOCK_LEAVE: Record<string, number> = {
  HPL: 0.30,
  MELAMINE: 0.25,
  PLYWOOD: 0.20,
  MDF: 0.20,
  PARTICLE: 0.20,
  SOLID_WOOD: 0.25,
  ACRYLIC: 0.15,
  ALUMINUM: 0.10,
  OTHER: 0.20,
};

/** Default score depth for HPL */
const DEFAULT_SCORE_DEPTH_MM = 0.35;

// ============================================================================
// Tool Selection Helpers
// ============================================================================

/**
 * Pick first existing tool from preference list.
 */
function pickExisting(
  lib: Record<string, ToolRef>,
  preferredIds: string[]
): string | null {
  for (const id of preferredIds) {
    if (lib[id]) return id;
  }
  return null;
}

/**
 * Get first tool sorted by diameter (smallest first).
 */
function getSmallestTool(lib: Record<string, ToolRef>): ToolRef | null {
  const tools = Object.values(lib);
  if (tools.length === 0) return null;

  return tools.sort((a, b) =>
    a.diameterMm - b.diameterMm || (a.id < b.id ? -1 : 1)
  )[0];
}

/**
 * Get tool by kind preference.
 */
function getToolByKindPreference(
  lib: Record<string, ToolRef>,
  kindPreference: ToolKind[]
): ToolRef | null {
  const tools = Object.values(lib);

  for (const kind of kindPreference) {
    const matches = tools
      .filter((t) => t.kind === kind)
      .sort((a, b) => a.diameterMm - b.diameterMm || (a.id < b.id ? -1 : 1));

    if (matches.length > 0) return matches[0];
  }

  return getSmallestTool(lib);
}

/**
 * Pick drill tool (smallest diameter).
 */
export function pickDrillTool(lib: Record<string, ToolRef>): ToolRef | null {
  return getSmallestTool(lib);
}

/**
 * Pick groove tool based on material.
 */
export function pickGrooveTool(
  lib: Record<string, ToolRef>,
  material: MaterialKind
): ToolRef | null {
  const kindPreference: ToolKind[] =
    material === 'HPL' || material === 'MELAMINE'
      ? ['COMPRESSION', 'DOWNCUT', 'UPCUT', 'STRAIGHT', 'O_FLUTE']
      : ['UPCUT', 'COMPRESSION', 'DOWNCUT', 'STRAIGHT', 'O_FLUTE'];

  return getToolByKindPreference(lib, kindPreference);
}

// ============================================================================
// Strategy Building
// ============================================================================

/**
 * Get default multi-tool strategy for material.
 *
 * Material-driven defaults:
 * - HPL/Melamine: Compression bits, optional scoring
 * - Plywood/MDF: Upcut rough, downcut finish
 * - General: Compression preferred
 */
export function defaultStrategyForMaterial(
  material: MaterialKind,
  toolLibrary: Record<string, ToolRef>
): MultiToolStrategy {
  const stockLeave = DEFAULT_STOCK_LEAVE[material] ?? 0.20;

  // HPL: compression preferred, optional scoring
  if (material === 'HPL') {
    const roughId = pickExisting(toolLibrary, ['T_COMP_6', 'T_COMP_8', 'T_DOWN_6']);
    const finishId = pickExisting(toolLibrary, ['T_COMP_6', 'T_DOWN_6', 'T_COMP_4']);
    const scoreId = pickExisting(toolLibrary, ['T_OFLUTE_2', 'T_OFLUTE_3']);

    return {
      roughToolId: roughId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      finishToolId: finishId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      stockLeaveRadialMm: stockLeave,
      allowFinishOnly: true,
      scoreToolId: scoreId ?? undefined,
      scoreDepthMm: scoreId ? DEFAULT_SCORE_DEPTH_MM : undefined,
      description: 'HPL: compression + optional score',
    };
  }

  // Melamine: compression preferred
  if (material === 'MELAMINE') {
    const roughId = pickExisting(toolLibrary, ['T_COMP_6', 'T_COMP_8']);
    const finishId = pickExisting(toolLibrary, ['T_COMP_6', 'T_DOWN_6']);

    return {
      roughToolId: roughId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      finishToolId: finishId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      stockLeaveRadialMm: stockLeave,
      allowFinishOnly: true,
      description: 'Melamine: compression for chip control',
    };
  }

  // Plywood/MDF/Particle: upcut rough, downcut finish
  if (material === 'PLYWOOD' || material === 'MDF' || material === 'PARTICLE') {
    const roughId = pickExisting(toolLibrary, ['T_UP_6', 'T_COMP_6', 'T_UP_8']);
    const finishId = pickExisting(toolLibrary, ['T_DOWN_6', 'T_COMP_6', 'T_DOWN_4']);

    return {
      roughToolId: roughId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      finishToolId: finishId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      stockLeaveRadialMm: stockLeave,
      allowFinishOnly: true,
      description: `${material}: upcut rough, downcut finish`,
    };
  }

  // Acrylic: O-flute or compression
  if (material === 'ACRYLIC') {
    const roughId = pickExisting(toolLibrary, ['T_OFLUTE_6', 'T_COMP_6']);
    const finishId = pickExisting(toolLibrary, ['T_OFLUTE_6', 'T_OFLUTE_4', 'T_COMP_4']);

    return {
      roughToolId: roughId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      finishToolId: finishId ?? Object.keys(toolLibrary).sort()[0] ?? '',
      stockLeaveRadialMm: stockLeave,
      allowFinishOnly: true,
      description: 'Acrylic: O-flute for heat control',
    };
  }

  // Default: compression or first available
  const fallbackId = Object.keys(toolLibrary).sort()[0] ?? '';
  return {
    roughToolId: fallbackId,
    finishToolId: fallbackId,
    stockLeaveRadialMm: stockLeave,
    allowFinishOnly: true,
    description: 'Default strategy',
  };
}

/**
 * Merge custom strategy override with defaults.
 */
export function mergeStrategy(
  base: MultiToolStrategy,
  override?: Partial<MultiToolStrategy>
): MultiToolStrategy {
  if (!override) return base;

  return {
    ...base,
    ...override,
    // Ensure required fields
    roughToolId: override.roughToolId ?? base.roughToolId,
    finishToolId: override.finishToolId ?? base.finishToolId,
    stockLeaveRadialMm: override.stockLeaveRadialMm ?? base.stockLeaveRadialMm,
    allowFinishOnly: override.allowFinishOnly ?? base.allowFinishOnly,
  };
}

// ============================================================================
// Direction Decision (Simplified)
// ============================================================================

/**
 * Simplified direction decision for route planning.
 * Full decision is in 10.6.4 (directionPolicy.ts).
 */
function decideMillingDirection(
  material: MaterialKind,
  intent: CutIntent,
  loopAreaMm2: number,
  config?: BuildPlanInput['directionConfig']
): { milling: MillingMode; reasonCode: string } {
  const smallPartThreshold = config?.smallPartAreaMm2 ?? 100;

  // Small parts: conventional for stability
  if (loopAreaMm2 > 0 && loopAreaMm2 < smallPartThreshold) {
    return { milling: 'CONVENTIONAL', reasonCode: 'SMALL_PART_STABILITY' };
  }

  // HPL/Melamine: climb for edge quality
  if (material === 'HPL' || material === 'MELAMINE') {
    return { milling: 'CLIMB', reasonCode: 'HPL_EDGE_QUALITY' };
  }

  // Acrylic: conventional for heat control
  if (material === 'ACRYLIC') {
    return { milling: 'CONVENTIONAL', reasonCode: 'ACRYLIC_HEAT' };
  }

  // Default: climb (or config default)
  return {
    milling: config?.defaultMilling ?? 'CLIMB',
    reasonCode: 'DEFAULT',
  };
}

// ============================================================================
// Plan Building
// ============================================================================

/**
 * Build multi-tool route plan for a part.
 *
 * Process:
 * 1. Select strategy for material
 * 2. Generate DRILL steps (priority 100)
 * 3. Generate GROOVE steps (priority 200)
 * 4. Generate PROFILE steps per loop:
 *    - Optional SCORE (HPL, priority 290)
 *    - ROUGH (priority 300)
 *    - FINISH (priority 400)
 * 5. Sort steps by priority + tool + id
 * 6. Extract tool order
 *
 * @param input - Plan input
 * @returns Complete route plan
 */
export function buildMultiToolRoutePlan(input: BuildPlanInput): ToolRoutePlan {
  const report: RouteReportItem[] = [];
  const steps: RouteStep[] = [];
  let valid = true;

  // Get strategy
  const baseStrategy = defaultStrategyForMaterial(input.material, input.toolLibrary);
  const strategy = mergeStrategy(baseStrategy, input.strategyOverride);

  const roughTool = input.toolLibrary[strategy.roughToolId];
  const finishTool = input.toolLibrary[strategy.finishToolId];
  const scoreTool = strategy.scoreToolId
    ? input.toolLibrary[strategy.scoreToolId]
    : undefined;

  // Validate tools
  if (!finishTool) {
    report.push({
      code: 'NO_FINISH_TOOL',
      detail: `Finish tool ${strategy.finishToolId} not found in library`,
      fingerprint: `10.6.7:NO_TOOL:${strategy.finishToolId}`,
      severity: 'BLOCK',
    });
    valid = false;
  }

  if (!roughTool && !strategy.allowFinishOnly) {
    report.push({
      code: 'NO_ROUGH_TOOL',
      detail: `Rough tool ${strategy.roughToolId} not found and finish-only not allowed`,
      fingerprint: `10.6.7:NO_TOOL:${strategy.roughToolId}`,
      severity: 'BLOCK',
    });
    valid = false;
  }

  if (!valid) {
    return {
      sheetId: input.sheetId,
      partId: input.partId,
      steps: [],
      toolOrder: [],
      report,
      valid: false,
    };
  }

  report.push({
    code: 'STRATEGY_SELECTED',
    detail: `Strategy: rough=${strategy.roughToolId} finish=${strategy.finishToolId} stock=${strategy.stockLeaveRadialMm}mm`,
    fingerprint: `10.6.7:STRAT:${input.material}:${strategy.roughToolId}:${strategy.finishToolId}`,
    severity: 'INFO',
  });

  // 1) DRILL operations
  for (const d of input.drillOps) {
    const drillTool = pickDrillTool(input.toolLibrary);
    if (drillTool) {
      steps.push({
        stepId: `S_${d.opId}_DRILL`,
        opId: d.opId,
        opKind: 'DRILL',
        passKind: 'FINISH',
        tool: drillTool,
        priority: PRIORITY.DRILL,
        depthMm: d.depthMm,
      });
    }
  }

  // 2) GROOVE operations
  for (const g of input.grooveOps) {
    const grooveTool = pickGrooveTool(input.toolLibrary, input.material);
    if (grooveTool) {
      steps.push({
        stepId: `S_${g.opId}_GROOVE`,
        opId: g.opId,
        opKind: 'GROOVE',
        passKind: 'FINISH',
        tool: grooveTool,
        priority: PRIORITY.GROOVE,
        depthMm: g.depthMm,
      });
    }
  }

  // 3) PROFILE operations
  for (const p of input.profileOps) {
    // Direction decision
    const dir = decideMillingDirection(
      input.material,
      p.intent,
      p.loopAreaMm2,
      input.directionConfig
    );

    // Optional SCORE step for HPL
    if (
      input.material === 'HPL' &&
      scoreTool &&
      strategy.scoreDepthMm !== undefined
    ) {
      steps.push({
        stepId: `S_${p.opId}_SCORE`,
        opId: p.opId,
        opKind: 'PROFILE',
        passKind: 'SCORE',
        tool: scoreTool,
        intent: p.intent,
        milling: dir.milling,
        priority: PRIORITY.SCORE,
        depthMm: -strategy.scoreDepthMm,
        sourcePathId: `P_${p.opId}_NOMINAL`,
        warnings: ['HPL_SCORE_PASS'],
      });
    }

    // ROUGH step
    if (roughTool) {
      const offR = resolveOffsetDistance({
        opId: p.opId,
        intent: p.intent,
        mode: 'TOOL_CENTERLINE',
        tool: {
          id: roughTool.id,
          diameterMm: roughTool.diameterMm,
          kind: roughTool.kind,
        },
        allowance: { radialMm: strategy.stockLeaveRadialMm, axialMm: 0 },
      });

      steps.push({
        stepId: `S_${p.opId}_PROFILE_ROUGH`,
        opId: p.opId,
        opKind: 'PROFILE',
        passKind: 'ROUGH',
        tool: roughTool,
        intent: p.intent,
        milling: dir.milling,
        offsetDistanceMm: offR.distanceMm,
        offsetFingerprint: offR.fingerprint,
        sourcePathId: `P_${p.opId}_NOMINAL`,
        priority: PRIORITY.PROFILE_ROUGH,
      });
    }

    // FINISH step
    if (finishTool) {
      const offF = resolveOffsetDistance({
        opId: p.opId,
        intent: p.intent,
        mode: 'TOOL_CENTERLINE',
        tool: {
          id: finishTool.id,
          diameterMm: finishTool.diameterMm,
          kind: finishTool.kind,
        },
        allowance: { radialMm: 0, axialMm: 0 },
      });

      steps.push({
        stepId: `S_${p.opId}_PROFILE_FINISH`,
        opId: p.opId,
        opKind: 'PROFILE',
        passKind: 'FINISH',
        tool: finishTool,
        intent: p.intent,
        milling: dir.milling,
        offsetDistanceMm: offF.distanceMm,
        offsetFingerprint: offF.fingerprint,
        sourcePathId: `P_${p.opId}_NOMINAL`,
        priority: PRIORITY.PROFILE_FINISH,
      });
    }

    report.push({
      code: 'PROFILE_PLANNED',
      detail: `op=${p.opId} intent=${p.intent} milling=${dir.milling} tools=${roughTool?.id ?? 'NONE'}->${finishTool?.id ?? 'NONE'}`,
      fingerprint: `10.6.7:PROFILE:${p.opId}:${dir.reasonCode}`,
      severity: 'INFO',
    });
  }

  // Sort steps deterministically
  steps.sort((a, b) => {
    // By priority first
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Then by tool id
    if (a.tool.id !== b.tool.id) return a.tool.id < b.tool.id ? -1 : 1;
    // Then by step id
    return a.stepId < b.stepId ? -1 : 1;
  });

  // Extract tool order (deduplicated, appearance order)
  const toolOrder: string[] = [];
  const seenTools = new Set<string>();
  for (const step of steps) {
    if (!seenTools.has(step.tool.id)) {
      seenTools.add(step.tool.id);
      toolOrder.push(step.tool.id);
    }
  }

  report.push({
    code: 'PLAN_COMPLETE',
    detail: `Plan: ${steps.length} step(s), ${toolOrder.length} tool(s): ${toolOrder.join(' -> ')}`,
    fingerprint: `10.6.7:COMPLETE:${steps.length}:${toolOrder.length}`,
    severity: 'INFO',
  });

  return {
    sheetId: input.sheetId,
    partId: input.partId,
    steps,
    toolOrder,
    report,
    valid: true,
  };
}

// ============================================================================
// Strategy Validation
// ============================================================================

/**
 * Validate multi-tool strategy.
 *
 * Checks:
 * - Tools exist
 * - Rough tool >= finish tool diameter (typical)
 * - Stock leave in valid range
 * - Material-specific constraints
 */
export function validateMultiToolStrategy(
  strategy: MultiToolStrategy,
  toolLib: Record<string, ToolRef>,
  material: MaterialKind
): { severity: 'OK' | 'WARN' | 'BLOCK'; issues: string[] } {
  const issues: string[] = [];

  const roughTool = toolLib[strategy.roughToolId];
  const finishTool = toolLib[strategy.finishToolId];

  // Check finish tool exists
  if (!finishTool) {
    return {
      severity: 'BLOCK',
      issues: [`Finish tool ${strategy.finishToolId} not found`],
    };
  }

  // Check rough tool if not finish-only
  if (!roughTool && !strategy.allowFinishOnly) {
    return {
      severity: 'BLOCK',
      issues: [`Rough tool ${strategy.roughToolId} not found and finish-only not allowed`],
    };
  }

  // Warn if rough tool smaller than finish (unusual)
  if (roughTool && roughTool.diameterMm < finishTool.diameterMm) {
    issues.push(
      `Rough tool dia ${roughTool.diameterMm}mm < finish tool dia ${finishTool.diameterMm}mm (unusual)`
    );
  }

  // Validate stock leave range
  if (strategy.stockLeaveRadialMm < 0) {
    return {
      severity: 'BLOCK',
      issues: [`Invalid negative stockLeaveRadialMm: ${strategy.stockLeaveRadialMm}`],
    };
  }

  if (strategy.stockLeaveRadialMm > 2.0) {
    return {
      severity: 'BLOCK',
      issues: [`stockLeaveRadialMm ${strategy.stockLeaveRadialMm}mm exceeds 2.0mm limit`],
    };
  }

  // Material-specific warnings
  if ((material === 'HPL' || material === 'MELAMINE') && strategy.stockLeaveRadialMm > 0.6) {
    issues.push(
      `High stockLeaveRadialMm ${strategy.stockLeaveRadialMm}mm may cause poor finish on ${material}`
    );
  }

  // Score tool validation for HPL
  if (strategy.scoreToolId && !toolLib[strategy.scoreToolId]) {
    issues.push(`Score tool ${strategy.scoreToolId} not found (will skip scoring)`);
  }

  if (strategy.scoreDepthMm !== undefined) {
    if (strategy.scoreDepthMm < 0.1 || strategy.scoreDepthMm > 1.0) {
      issues.push(`Score depth ${strategy.scoreDepthMm}mm outside typical range (0.1-1.0mm)`);
    }
  }

  return {
    severity: issues.length > 0 ? 'WARN' : 'OK',
    issues,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get steps for a specific tool.
 */
export function getStepsForTool(plan: ToolRoutePlan, toolId: string): RouteStep[] {
  return plan.steps.filter((s) => s.tool.id === toolId);
}

/**
 * Get steps for a specific operation.
 */
export function getStepsForOp(plan: ToolRoutePlan, opId: string): RouteStep[] {
  return plan.steps.filter((s) => s.opId === opId);
}

/**
 * Count tool changes in plan.
 */
export function countToolChanges(plan: ToolRoutePlan): number {
  let changes = 0;
  let lastToolId: string | null = null;

  for (const step of plan.steps) {
    if (lastToolId !== null && step.tool.id !== lastToolId) {
      changes++;
    }
    lastToolId = step.tool.id;
  }

  return changes;
}

/**
 * Get all blocking issues from plan.
 */
export function getRouteBlockingIssues(plan: ToolRoutePlan): RouteReportItem[] {
  return plan.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if plan is valid.
 */
export function isRoutePlanValid(plan: ToolRoutePlan): boolean {
  return plan.valid && getRouteBlockingIssues(plan).length === 0;
}

/**
 * Get all fingerprints from plan.
 */
export function getRouteFingerprints(plan: ToolRoutePlan): string[] {
  return plan.report.map((r) => r.fingerprint);
}

/**
 * Summarize plan for logging.
 */
export function summarizeRoutePlan(plan: ToolRoutePlan): string {
  const toolChanges = countToolChanges(plan);
  return `Part ${plan.partId}: ${plan.steps.length} steps, ${plan.toolOrder.length} tools, ${toolChanges} changes`;
}

/**
 * Create a simple tool reference.
 */
export function createToolRef(
  id: string,
  diameterMm: number,
  kind: ToolKind = 'COMPRESSION'
): ToolRef {
  return { id, diameterMm, kind };
}

/**
 * Create a standard tool library for testing.
 */
export function createStandardToolLibrary(): Record<string, ToolRef> {
  return {
    T_COMP_4: { id: 'T_COMP_4', diameterMm: 4, kind: 'COMPRESSION' },
    T_COMP_6: { id: 'T_COMP_6', diameterMm: 6, kind: 'COMPRESSION' },
    T_COMP_8: { id: 'T_COMP_8', diameterMm: 8, kind: 'COMPRESSION' },
    T_DOWN_4: { id: 'T_DOWN_4', diameterMm: 4, kind: 'DOWNCUT' },
    T_DOWN_6: { id: 'T_DOWN_6', diameterMm: 6, kind: 'DOWNCUT' },
    T_UP_6: { id: 'T_UP_6', diameterMm: 6, kind: 'UPCUT' },
    T_UP_8: { id: 'T_UP_8', diameterMm: 8, kind: 'UPCUT' },
    T_OFLUTE_2: { id: 'T_OFLUTE_2', diameterMm: 2, kind: 'O_FLUTE' },
    T_OFLUTE_3: { id: 'T_OFLUTE_3', diameterMm: 3, kind: 'O_FLUTE' },
    T_OFLUTE_6: { id: 'T_OFLUTE_6', diameterMm: 6, kind: 'O_FLUTE' },
    T_STRAIGHT_6: { id: 'T_STRAIGHT_6', diameterMm: 6, kind: 'STRAIGHT' },
  };
}
