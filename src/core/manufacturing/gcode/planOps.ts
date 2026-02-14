// src/core/manufacturing/gcode/planOps.ts
/**
 * G-code Operation Planning.
 *
 * Plans the machine operations between cut spans, including:
 * - Retract moves (Z up)
 * - Rapid positioning (G0 XY)
 * - Re-entry moves (plunge or ramp to cut depth)
 * - Material-aware entry/exit strategies (v0.10.6.6)
 *
 * This module bridges the gap between the abstract cut spans
 * from tab planning and the concrete G-code operations.
 *
 * v0.10.6.5 - Direction-aware Tabs
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

import {
  CutSpan,
  TabCutPlanResult,
  SpanTransition,
  DEFAULT_SPAN_TRANSITION,
  PathSegment,
} from "../toolpath/tabs/tabTypes";
import {
  EntryExitPolicy,
  EntryExitContext,
  MaterialSpec,
  MachineSpec,
  ToolClass,
  PassKind,
  createMaterialSpec,
} from "../policy/entryExitPolicy.v1";
import { defaultEntryExitPolicy } from "../policy/entryExitPolicy.default";
import {
  emitEntry,
  emitExit,
  EntryMoveContext,
  ExitMoveContext,
} from "../toolpath/geom/entryExitEmitter";
import { extractSpanTangents } from "../toolpath/geom/tangentUtils";

// =============================================================================
// TYPES
// =============================================================================

/**
 * G-code operation types.
 */
export type GCodeOpType =
  | "RAPID_XY"      // G0 X Y
  | "RAPID_Z"       // G0 Z
  | "LINEAR_XY"     // G1 X Y F
  | "LINEAR_Z"      // G1 Z F
  | "ARC_CW"        // G2 X Y I J F
  | "ARC_CCW"       // G3 X Y I J F
  | "DWELL"         // G4 P
  | "COMMENT";      // ( comment )

/**
 * A single G-code operation.
 */
export interface GCodeOp {
  type: GCodeOpType;
  x?: number;
  y?: number;
  z?: number;
  i?: number;       // Arc center offset X (for G2/G3)
  j?: number;       // Arc center offset Y (for G2/G3)
  f?: number;       // Feed rate
  p?: number;       // Dwell time (ms)
  comment?: string;
}

/**
 * Planned operations for a span transition.
 */
export interface TransitionOps {
  /** Retract operation */
  retract: GCodeOp;

  /** Rapid move to next span start */
  rapid: GCodeOp;

  /** Re-entry operation(s) */
  reentry: GCodeOp[];

  /** Total transition time estimate (seconds) */
  estimatedTime: number;
}

/**
 * Full operation plan for a tab cut plan.
 */
export interface OperationPlan {
  /** All operations in sequence */
  ops: GCodeOp[];

  /** Span-by-span breakdown */
  spanOps: SpanOpPlan[];

  /** Transitions between spans */
  transitions: TransitionOps[];

  /** Statistics */
  stats: PlanStats;
}

/**
 * Operations for a single span.
 */
export interface SpanOpPlan {
  spanId: string;
  ops: GCodeOp[];
  cutLength: number;
  estimatedTime: number;
}

/**
 * Plan statistics.
 */
export interface PlanStats {
  totalOps: number;
  cutOps: number;
  rapidOps: number;
  totalCutLength: number;
  totalRapidLength: number;
  estimatedCutTime: number;
  estimatedRapidTime: number;
  estimatedTotalTime: number;
}

/**
 * Planning parameters.
 */
export interface PlanParams {
  /** Cutting feed rate (mm/min) */
  cutFeed: number;

  /** Rapid feed rate (mm/min) - for time estimation */
  rapidFeed: number;

  /** Plunge feed rate (mm/min) */
  plungeFeed: number;

  /** Cut depth Z (negative, mm) */
  cutZ: number;

  /** Safe Z height for rapid moves (mm) */
  safeZ: number;

  /** Clearance Z for transitions (mm) */
  clearanceZ: number;

  /** Span transition settings */
  transition: SpanTransition;
}

/**
 * Default planning parameters.
 */
export const DEFAULT_PLAN_PARAMS: PlanParams = {
  cutFeed: 3000,
  rapidFeed: 10000,
  plungeFeed: 1000,
  cutZ: -18,
  safeZ: 5,
  clearanceZ: 2,
  transition: DEFAULT_SPAN_TRANSITION,
};

// =============================================================================
// SEGMENT TO GCODE
// =============================================================================

/**
 * Convert a path segment to G-code operation(s).
 */
function segmentToOps(seg: PathSegment, feed: number): GCodeOp[] {
  if (seg.kind === "LINE") {
    return [
      {
        type: "LINEAR_XY",
        x: seg.x2,
        y: seg.y2,
        f: feed,
      },
    ];
  }

  // ARC: G2 (CW) or G3 (CCW)
  const endAngle = seg.endDeg * (Math.PI / 180);
  const endX = seg.cx + seg.r * Math.cos(endAngle);
  const endY = seg.cy + seg.r * Math.sin(endAngle);

  // Calculate I, J (center offset from start point)
  const startAngle = seg.startDeg * (Math.PI / 180);
  const startX = seg.cx + seg.r * Math.cos(startAngle);
  const startY = seg.cy + seg.r * Math.sin(startAngle);

  const i = seg.cx - startX;
  const j = seg.cy - startY;

  return [
    {
      type: seg.cw ? "ARC_CW" : "ARC_CCW",
      x: endX,
      y: endY,
      i,
      j,
      f: feed,
    },
  ];
}

// =============================================================================
// SPAN PLANNING
// =============================================================================

/**
 * Plan operations for a single cut span.
 */
function planSpanOps(
  span: CutSpan,
  params: PlanParams
): SpanOpPlan {
  const ops: GCodeOp[] = [];

  // Comment: span start
  ops.push({
    type: "COMMENT",
    comment: `Span ${span.spanId} - Length: ${span.length.toFixed(2)}mm`,
  });

  // Convert each segment to G-code
  for (const seg of span.segs) {
    ops.push(...segmentToOps(seg, params.cutFeed));
  }

  // Estimate time
  const estimatedTime = span.length / params.cutFeed * 60; // seconds

  return {
    spanId: span.spanId,
    ops,
    cutLength: span.length,
    estimatedTime,
  };
}

/**
 * Plan transition between two spans.
 */
function planTransition(
  fromSpan: CutSpan,
  toSpan: CutSpan,
  params: PlanParams
): TransitionOps {
  const reentry: GCodeOp[] = [];

  // Retract Z
  const retract: GCodeOp = {
    type: "RAPID_Z",
    z: params.transition.retractZ,
  };

  // Rapid to next span start
  const rapid: GCodeOp = params.transition.rapidXY
    ? {
        type: "RAPID_XY",
        x: toSpan.startPoint.x,
        y: toSpan.startPoint.y,
      }
    : {
        type: "LINEAR_XY",
        x: toSpan.startPoint.x,
        y: toSpan.startPoint.y,
        f: params.rapidFeed,
      };

  // Re-entry based on strategy
  if (params.transition.plungeStrategy === "PLUNGE") {
    // Simple plunge
    reentry.push({
      type: "LINEAR_Z",
      z: params.cutZ,
      f: params.plungeFeed,
    });
  } else if (params.transition.plungeStrategy === "RAMP") {
    // Ramped entry (10.6.6 will make this material-aware)
    const rampLen = params.transition.rampLengthMm ?? 10;
    const rampAngle = params.transition.rampAngleDeg ?? 15;

    // Move to ramp start (slightly before span start)
    const rampStartX = toSpan.startPoint.x - rampLen;
    reentry.push({
      type: "RAPID_XY",
      x: rampStartX,
      y: toSpan.startPoint.y,
    });

    // Ramp down to cut depth
    reentry.push({
      type: "LINEAR_XY",
      x: toSpan.startPoint.x,
      y: toSpan.startPoint.y,
      z: params.cutZ,
      f: params.plungeFeed,
    });
  } else {
    // HELIX (simplified for now)
    reentry.push({
      type: "LINEAR_Z",
      z: params.cutZ,
      f: params.plungeFeed,
    });
  }

  // Estimate transition time
  const retractDist = Math.abs(params.cutZ - params.transition.retractZ);
  const rapidDist = Math.hypot(
    toSpan.startPoint.x - fromSpan.endPoint.x,
    toSpan.startPoint.y - fromSpan.endPoint.y
  );
  const plungeDist = Math.abs(params.transition.retractZ - params.cutZ);

  const estimatedTime =
    retractDist / params.rapidFeed * 60 +
    rapidDist / params.rapidFeed * 60 +
    plungeDist / params.plungeFeed * 60;

  return {
    retract,
    rapid,
    reentry,
    estimatedTime,
  };
}

// =============================================================================
// MAIN PLANNING
// =============================================================================

/**
 * Plan all G-code operations for a tab cut plan.
 *
 * @param tabPlan Tab cut plan result from buildOpenCutSpans
 * @param params Planning parameters
 * @returns Complete operation plan
 */
export function planGCodeOps(
  tabPlan: TabCutPlanResult,
  params: PlanParams = DEFAULT_PLAN_PARAMS
): OperationPlan {
  const ops: GCodeOp[] = [];
  const spanOps: SpanOpPlan[] = [];
  const transitions: TransitionOps[] = [];

  let totalCutLength = 0;
  let totalRapidLength = 0;
  let estimatedCutTime = 0;
  let estimatedRapidTime = 0;

  // Header comment
  ops.push({
    type: "COMMENT",
    comment: `Tab Cut Plan: ${tabPlan.pathId}`,
  });
  ops.push({
    type: "COMMENT",
    comment: `Spans: ${tabPlan.spans.length}, Tabs: ${tabPlan.tabs.intervals.length}`,
  });

  // Process each span
  for (let i = 0; i < tabPlan.spans.length; i++) {
    const span = tabPlan.spans[i];

    // Transition from previous span
    if (i > 0) {
      const prevSpan = tabPlan.spans[i - 1];
      const trans = planTransition(prevSpan, span, params);

      ops.push({ type: "COMMENT", comment: "--- Transition ---" });
      ops.push(trans.retract);
      ops.push(trans.rapid);
      ops.push(...trans.reentry);

      transitions.push(trans);

      // Track rapid distance
      totalRapidLength += Math.hypot(
        span.startPoint.x - prevSpan.endPoint.x,
        span.startPoint.y - prevSpan.endPoint.y
      );
      estimatedRapidTime += trans.estimatedTime;
    } else {
      // First span: position and plunge
      ops.push({ type: "COMMENT", comment: "--- Initial Position ---" });
      ops.push({
        type: "RAPID_XY",
        x: span.startPoint.x,
        y: span.startPoint.y,
      });
      ops.push({
        type: "RAPID_Z",
        z: params.clearanceZ,
      });
      ops.push({
        type: "LINEAR_Z",
        z: params.cutZ,
        f: params.plungeFeed,
      });
    }

    // Cut span
    const spanPlan = planSpanOps(span, params);
    ops.push(...spanPlan.ops);
    spanOps.push(spanPlan);

    totalCutLength += spanPlan.cutLength;
    estimatedCutTime += spanPlan.estimatedTime;
  }

  // Final retract
  ops.push({ type: "COMMENT", comment: "--- Final Retract ---" });
  ops.push({
    type: "RAPID_Z",
    z: params.safeZ,
  });

  // Build stats
  const stats: PlanStats = {
    totalOps: ops.length,
    cutOps: ops.filter((o) => o.type === "LINEAR_XY" || o.type === "ARC_CW" || o.type === "ARC_CCW").length,
    rapidOps: ops.filter((o) => o.type === "RAPID_XY" || o.type === "RAPID_Z").length,
    totalCutLength,
    totalRapidLength,
    estimatedCutTime,
    estimatedRapidTime,
    estimatedTotalTime: estimatedCutTime + estimatedRapidTime,
  };

  return {
    ops,
    spanOps,
    transitions,
    stats,
  };
}

// =============================================================================
// MATERIAL-AWARE PLANNING (v0.10.6.6)
// =============================================================================

/**
 * Extended planning parameters with material context.
 */
export interface PlanParamsWithMaterial extends PlanParams {
  /** Material specification for entry/exit decisions */
  material: MaterialSpec;

  /** Machine capabilities */
  machine: MachineSpec;

  /** Tool classification */
  toolClass: ToolClass;

  /** Pass type (rough vs finish) */
  pass: PassKind;

  /** Entry/exit policy (default: defaultEntryExitPolicy) */
  policy?: EntryExitPolicy;
}

/**
 * Plan G-code operations with material-aware entry/exit strategies.
 *
 * This function uses the entry/exit policy to generate appropriate
 * ramp/plunge moves based on material, tool, and geometry.
 *
 * @param tabPlan Tab cut plan result from buildOpenCutSpans
 * @param params Extended planning parameters with material context
 * @returns Complete operation plan with material-aware entry/exit
 */
export function planGCodeOpsWithEntryExit(
  tabPlan: TabCutPlanResult,
  params: PlanParamsWithMaterial
): OperationPlan {
  const ops: GCodeOp[] = [];
  const spanOps: SpanOpPlan[] = [];
  const transitions: TransitionOps[] = [];

  const policy = params.policy ?? defaultEntryExitPolicy;

  let totalCutLength = 0;
  let totalRapidLength = 0;
  let estimatedCutTime = 0;
  let estimatedRapidTime = 0;

  // Header comment
  ops.push({
    type: "COMMENT",
    comment: `Tab Cut Plan: ${tabPlan.pathId}`,
  });
  ops.push({
    type: "COMMENT",
    comment: `Spans: ${tabPlan.spans.length}, Tabs: ${tabPlan.tabs.intervals.length}`,
  });
  ops.push({
    type: "COMMENT",
    comment: `Material: ${params.material.core}, Pass: ${params.pass}, Tool: ${params.toolClass}`,
  });

  // Process each span
  for (let i = 0; i < tabPlan.spans.length; i++) {
    const span = tabPlan.spans[i];
    const isFirstSpan = i === 0;
    const isOpenSpan = !isFirstSpan; // After first span, all are "open" re-entries

    // Extract tangents for entry/exit calculation
    const tangents = extractSpanTangents(span.segs);

    // Build entry/exit context
    const entryExitCtx: EntryExitContext = {
      opKind: "PROFILE",
      pass: params.pass,
      toolClass: params.toolClass,
      material: params.material,
      geometry: {
        isOpenSpan,
        startTangent: tangents.startTangent,
        endTangent: tangents.endTangent,
        kerfRisk: params.material.hasLaminate ? "HIGH" : "NORMAL",
        startPoint: span.startPoint,
        endPoint: span.endPoint,
      },
      machine: params.machine,
      cutZ: params.cutZ,
      spanIndex: i,
      totalSpans: tabPlan.spans.length,
    };

    // Get entry/exit decision from policy
    const decision = policy.decide(entryExitCtx);

    if (isFirstSpan) {
      // First span: full entry sequence
      ops.push({ type: "COMMENT", comment: "--- Initial Entry ---" });
      ops.push({
        type: "COMMENT",
        comment: `Entry: ${decision.entry.mode} [${decision.reasonCodes.join(", ")}]`,
      });

      const entryCtx: EntryMoveContext = {
        startPoint: span.startPoint,
        startTangent: tangents.startTangent,
        cutZ: params.cutZ,
        safeZ: params.safeZ,
        entry: decision.entry,
      };

      const entryOps = emitEntry(entryCtx);
      ops.push(...entryOps.ops);

      estimatedRapidTime += entryOps.estimatedTime;
    } else {
      // Subsequent spans: transition from previous span
      const prevSpan = tabPlan.spans[i - 1];
      const prevTangents = extractSpanTangents(prevSpan.segs);

      ops.push({ type: "COMMENT", comment: "--- Span Transition ---" });

      // Exit from previous span
      const exitCtx: ExitMoveContext = {
        endPoint: prevSpan.endPoint,
        endTangent: prevTangents.endTangent,
        cutZ: params.cutZ,
        safeZ: params.transition.retractZ,
        exit: decision.exit,
      };

      const exitOps = emitExit(exitCtx);
      ops.push(...exitOps.ops);

      // Rapid to next span
      ops.push({
        type: "RAPID_XY",
        x: span.startPoint.x,
        y: span.startPoint.y,
        comment: "Rapid to next span",
      });

      // Re-entry to next span
      ops.push({
        type: "COMMENT",
        comment: `Re-entry: ${decision.entry.mode} [${decision.reasonCodes.join(", ")}]`,
      });

      const entryCtx: EntryMoveContext = {
        startPoint: span.startPoint,
        startTangent: tangents.startTangent,
        cutZ: params.cutZ,
        safeZ: params.transition.retractZ,
        entry: decision.entry,
      };

      const entryOps = emitEntry(entryCtx);
      ops.push(...entryOps.ops);

      // Track transition
      const rapidDist = Math.hypot(
        span.startPoint.x - prevSpan.endPoint.x,
        span.startPoint.y - prevSpan.endPoint.y
      );

      transitions.push({
        retract: exitOps.ops[0] || { type: "RAPID_Z", z: params.transition.retractZ },
        rapid: { type: "RAPID_XY", x: span.startPoint.x, y: span.startPoint.y },
        reentry: entryOps.ops,
        estimatedTime: exitOps.estimatedTime + entryOps.estimatedTime + rapidDist / params.rapidFeed * 60,
      });

      totalRapidLength += rapidDist;
      estimatedRapidTime += exitOps.estimatedTime + entryOps.estimatedTime;
    }

    // Cut span
    const spanPlan = planSpanOps(span, params);
    ops.push(...spanPlan.ops);
    spanOps.push(spanPlan);

    totalCutLength += spanPlan.cutLength;
    estimatedCutTime += spanPlan.estimatedTime;
  }

  // Final exit
  if (tabPlan.spans.length > 0) {
    const lastSpan = tabPlan.spans[tabPlan.spans.length - 1];
    const lastTangents = extractSpanTangents(lastSpan.segs);

    // Get decision for final exit
    const finalCtx: EntryExitContext = {
      opKind: "PROFILE",
      pass: params.pass,
      toolClass: params.toolClass,
      material: params.material,
      geometry: {
        isOpenSpan: false,
        startTangent: lastTangents.startTangent,
        endTangent: lastTangents.endTangent,
        kerfRisk: params.material.hasLaminate ? "HIGH" : "NORMAL",
        endPoint: lastSpan.endPoint,
      },
      machine: params.machine,
      cutZ: params.cutZ,
    };

    const finalDecision = policy.decide(finalCtx);

    ops.push({ type: "COMMENT", comment: "--- Final Exit ---" });

    const exitCtx: ExitMoveContext = {
      endPoint: lastSpan.endPoint,
      endTangent: lastTangents.endTangent,
      cutZ: params.cutZ,
      safeZ: params.safeZ,
      exit: finalDecision.exit,
    };

    const exitOps = emitExit(exitCtx);
    ops.push(...exitOps.ops);
  }

  // Build stats
  const stats: PlanStats = {
    totalOps: ops.length,
    cutOps: ops.filter((o) => o.type === "LINEAR_XY" || o.type === "ARC_CW" || o.type === "ARC_CCW").length,
    rapidOps: ops.filter((o) => o.type === "RAPID_XY" || o.type === "RAPID_Z").length,
    totalCutLength,
    totalRapidLength,
    estimatedCutTime,
    estimatedRapidTime,
    estimatedTotalTime: estimatedCutTime + estimatedRapidTime,
  };

  return {
    ops,
    spanOps,
    transitions,
    stats,
  };
}

/**
 * Create default material-aware plan parameters.
 *
 * Convenience function to create PlanParamsWithMaterial from basic inputs.
 */
export function createPlanParamsWithMaterial(
  core: MaterialSpec["core"],
  surfaceA?: MaterialSpec["surfaceA"],
  surfaceB?: MaterialSpec["surfaceB"],
  options?: {
    toolClass?: ToolClass;
    pass?: PassKind;
    supportsArc?: boolean;
    cutZ?: number;
    safeZ?: number;
  }
): PlanParamsWithMaterial {
  const material = createMaterialSpec(core, surfaceA, surfaceB);

  const machine: MachineSpec = {
    supportsArc: options?.supportsArc ?? true,
    safeZ: options?.safeZ ?? 5,
    clearanceZ: 2,
  };

  return {
    ...DEFAULT_PLAN_PARAMS,
    cutZ: options?.cutZ ?? -18,
    safeZ: options?.safeZ ?? 5,
    material,
    machine,
    toolClass: options?.toolClass ?? "COMPRESSION",
    pass: options?.pass ?? "FINISH",
  };
}

// =============================================================================
// G-CODE GENERATION
// =============================================================================

/**
 * Format a single G-code operation as a line.
 */
export function formatGCodeOp(op: GCodeOp): string {
  switch (op.type) {
    case "COMMENT":
      return `( ${op.comment} )`;

    case "RAPID_XY":
      return `G0 X${formatNum(op.x!)} Y${formatNum(op.y!)}`;

    case "RAPID_Z":
      return `G0 Z${formatNum(op.z!)}`;

    case "LINEAR_XY":
      if (op.z !== undefined) {
        return `G1 X${formatNum(op.x!)} Y${formatNum(op.y!)} Z${formatNum(op.z)} F${op.f}`;
      }
      return `G1 X${formatNum(op.x!)} Y${formatNum(op.y!)} F${op.f}`;

    case "LINEAR_Z":
      return `G1 Z${formatNum(op.z!)} F${op.f}`;

    case "ARC_CW":
      return `G2 X${formatNum(op.x!)} Y${formatNum(op.y!)} I${formatNum(op.i!)} J${formatNum(op.j!)} F${op.f}`;

    case "ARC_CCW":
      return `G3 X${formatNum(op.x!)} Y${formatNum(op.y!)} I${formatNum(op.i!)} J${formatNum(op.j!)} F${op.f}`;

    case "DWELL":
      return `G4 P${op.p}`;

    default:
      return `( Unknown op: ${op.type} )`;
  }
}

/**
 * Format number for G-code (4 decimal places).
 */
function formatNum(n: number): string {
  return n.toFixed(4);
}

/**
 * Generate complete G-code from operation plan.
 */
export function generateGCode(plan: OperationPlan): string {
  const lines: string[] = [];

  // Header
  lines.push("( Generated by MONOLITH v0.10.6.5 )");
  lines.push(`( Total cut length: ${plan.stats.totalCutLength.toFixed(2)}mm )`);
  lines.push(`( Estimated time: ${(plan.stats.estimatedTotalTime / 60).toFixed(1)}min )`);
  lines.push("");
  lines.push("G21 ( Metric )");
  lines.push("G90 ( Absolute )");
  lines.push("");

  // Operations
  for (const op of plan.ops) {
    lines.push(formatGCodeOp(op));
  }

  // Footer
  lines.push("");
  lines.push("M30 ( End program )");

  return lines.join("\n");
}

// =============================================================================
// AUDIT
// =============================================================================

/**
 * Generate audit report for operation plan.
 */
export function generateOpPlanAudit(plan: OperationPlan): Record<string, unknown> {
  return {
    totalOps: plan.stats.totalOps,
    cutOps: plan.stats.cutOps,
    rapidOps: plan.stats.rapidOps,
    totalCutLength: Math.round(plan.stats.totalCutLength * 100) / 100,
    totalRapidLength: Math.round(plan.stats.totalRapidLength * 100) / 100,
    estimatedCutTime: Math.round(plan.stats.estimatedCutTime),
    estimatedRapidTime: Math.round(plan.stats.estimatedRapidTime),
    estimatedTotalTime: Math.round(plan.stats.estimatedTotalTime),
    spans: plan.spanOps.map((sp) => ({
      id: sp.spanId,
      opCount: sp.ops.length,
      cutLength: Math.round(sp.cutLength * 100) / 100,
    })),
    transitions: plan.transitions.length,
  };
}
