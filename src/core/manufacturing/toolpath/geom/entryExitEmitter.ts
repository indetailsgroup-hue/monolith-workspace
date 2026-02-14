// src/core/manufacturing/toolpath/geom/entryExitEmitter.ts
/**
 * Entry/Exit Move Emitter.
 *
 * Generates G-code operations for entry and exit strategies.
 *
 * Supported entry modes:
 * - RAMP_LINE: Linear ramp along tangent
 * - RAMP_ARC: Arc lead-in with Z ramp
 * - PLUNGE_SOFT: Slow linear plunge
 * - PLUNGE_PECK: Peck drilling (future)
 *
 * Supported exit modes:
 * - LEAD_OUT: Linear or arc lead-out
 * - NONE: Direct retract with optional lift
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

import {
  EntryExitDecision,
  EntryConfig,
  ExitConfig,
  EntryMode,
  ExitMode,
} from "../../policy/entryExitPolicy.v1";
import {
  Vec2,
  Point2,
  vecScale,
  vecAdd,
  vecNeg,
  normalLeft,
  calculateLeadInPoint,
  calculateLeadOutPoint,
  calculateArcLeadIn,
} from "./tangentUtils";
import { GCodeOp } from "../../gcode/planOps";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry move context.
 */
export interface EntryMoveContext {
  /** Path/span start point */
  startPoint: Point2;

  /** Unit tangent at start */
  startTangent: Vec2;

  /** Cut depth (negative Z, mm) */
  cutZ: number;

  /** Safe Z height (mm) */
  safeZ: number;

  /** Entry configuration from policy */
  entry: EntryConfig;
}

/**
 * Exit move context.
 */
export interface ExitMoveContext {
  /** Path/span end point */
  endPoint: Point2;

  /** Unit tangent at end */
  endTangent: Vec2;

  /** Current Z (cut depth) */
  cutZ: number;

  /** Safe Z for retract */
  safeZ: number;

  /** Exit configuration from policy */
  exit: ExitConfig;
}

/**
 * Generated entry operations.
 */
export interface EntryOps {
  /** G-code operations for entry */
  ops: GCodeOp[];

  /** Lead-in start point (for visualization) */
  leadInStart?: Point2;

  /** Arc center (for RAMP_ARC) */
  arcCenter?: Point2;

  /** Total entry move length */
  totalLength: number;

  /** Estimated time (seconds) */
  estimatedTime: number;
}

/**
 * Generated exit operations.
 */
export interface ExitOps {
  /** G-code operations for exit */
  ops: GCodeOp[];

  /** Lead-out end point (for visualization) */
  leadOutEnd?: Point2;

  /** Total exit move length */
  totalLength: number;

  /** Estimated time (seconds) */
  estimatedTime: number;
}

// =============================================================================
// ENTRY EMITTERS
// =============================================================================

/**
 * Emit entry operations based on mode.
 *
 * @param ctx Entry move context
 * @returns Generated entry operations
 */
export function emitEntry(ctx: EntryMoveContext): EntryOps {
  switch (ctx.entry.mode) {
    case "RAMP_LINE":
      return emitRampLineEntry(ctx);
    case "RAMP_ARC":
      return emitRampArcEntry(ctx);
    case "PLUNGE_SOFT":
      return emitPlungeSoftEntry(ctx);
    case "PLUNGE_PECK":
      return emitPlungePeckEntry(ctx);
    default:
      return emitPlungeSoftEntry(ctx); // Fallback
  }
}

/**
 * Emit RAMP_LINE entry: linear ramp along tangent.
 *
 * Steps:
 * 1. Rapid to safe Z
 * 2. Rapid to lead-in start point (behind path start)
 * 3. Linear ramp down to cut Z while moving to path start
 */
function emitRampLineEntry(ctx: EntryMoveContext): EntryOps {
  const t = ctx.entry.tuning;
  const ops: GCodeOp[] = [];

  // Calculate lead-in start point
  const leadInStart = calculateLeadInPoint(
    ctx.startPoint,
    ctx.startTangent,
    t.leadLenMm
  );

  // Calculate ramp Z (how high to start the ramp)
  // Ramp angle determines the Z drop over lead length
  const rampZDrop = Math.min(
    Math.tan(t.rampAngleDeg * Math.PI / 180) * t.leadLenMm,
    Math.abs(ctx.cutZ - ctx.safeZ) // Don't drop more than total depth
  );
  const rampStartZ = Math.min(ctx.safeZ, ctx.cutZ + rampZDrop);

  // 1. Rapid to safe Z
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Entry: safe height",
  });

  // 2. Rapid to lead-in start
  ops.push({
    type: "RAPID_XY",
    x: leadInStart.x,
    y: leadInStart.y,
    comment: "Entry: lead-in start",
  });

  // 3. Rapid down to ramp start Z (if not at safe Z)
  if (rampStartZ < ctx.safeZ - 0.1) {
    ops.push({
      type: "RAPID_Z",
      z: rampStartZ,
      comment: "Entry: ramp start height",
    });
  }

  // 4. Linear ramp to path start at cut Z
  ops.push({
    type: "LINEAR_XY",
    x: ctx.startPoint.x,
    y: ctx.startPoint.y,
    z: ctx.cutZ,
    f: t.plungeFeed,
    comment: "Entry: ramp down",
  });

  // Calculate total length
  const rampLen = Math.hypot(
    ctx.startPoint.x - leadInStart.x,
    ctx.startPoint.y - leadInStart.y
  );
  const zDrop = Math.abs(rampStartZ - ctx.cutZ);
  const totalLength = Math.hypot(rampLen, zDrop);

  // Estimate time
  const estimatedTime = (totalLength / t.plungeFeed) * 60;

  return {
    ops,
    leadInStart,
    totalLength,
    estimatedTime,
  };
}

/**
 * Emit RAMP_ARC entry: arc lead-in with Z ramp.
 *
 * Steps:
 * 1. Rapid to safe Z
 * 2. Rapid to arc start point
 * 3. Arc move to path start (at safe Z for MVP)
 * 4. Linear ramp down to cut Z
 *
 * Note: True helical arc with simultaneous Z will be added
 * in dialect-specific implementations (10.7.2).
 */
function emitRampArcEntry(ctx: EntryMoveContext): EntryOps {
  const t = ctx.entry.tuning;
  const ops: GCodeOp[] = [];

  // Calculate arc lead-in (left side by default - stays outside for outside cuts)
  const arcRadius = t.leadArcRadMm ?? 6;
  const arcLead = calculateArcLeadIn(
    ctx.startPoint,
    ctx.startTangent,
    arcRadius,
    "LEFT"
  );

  // 1. Rapid to safe Z
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Entry: safe height",
  });

  // 2. Rapid to arc start
  ops.push({
    type: "RAPID_XY",
    x: arcLead.arcStart.x,
    y: arcLead.arcStart.y,
    comment: "Entry: arc start",
  });

  // 3. Arc to path start (still at safe Z for MVP)
  // Calculate I, J (center offset from arc start)
  const i = arcLead.center.x - arcLead.arcStart.x;
  const j = arcLead.center.y - arcLead.arcStart.y;

  ops.push({
    type: arcLead.cw ? "ARC_CW" : "ARC_CCW",
    x: ctx.startPoint.x,
    y: ctx.startPoint.y,
    i,
    j,
    f: t.plungeFeed,
    comment: "Entry: arc lead-in",
  });

  // 4. Linear plunge to cut Z
  ops.push({
    type: "LINEAR_Z",
    z: ctx.cutZ,
    f: t.plungeFeed,
    comment: "Entry: plunge to depth",
  });

  // Calculate total length (arc + plunge)
  const arcLen = Math.PI * arcRadius / 2; // Quarter circle
  const plungeLen = Math.abs(ctx.safeZ - ctx.cutZ);
  const totalLength = arcLen + plungeLen;

  // Estimate time
  const estimatedTime = (totalLength / t.plungeFeed) * 60;

  return {
    ops,
    leadInStart: arcLead.arcStart,
    arcCenter: arcLead.center,
    totalLength,
    estimatedTime,
  };
}

/**
 * Emit PLUNGE_SOFT entry: slow linear plunge.
 *
 * Simple vertical plunge at reduced feed.
 */
function emitPlungeSoftEntry(ctx: EntryMoveContext): EntryOps {
  const t = ctx.entry.tuning;
  const ops: GCodeOp[] = [];

  // 1. Rapid to safe Z
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Entry: safe height",
  });

  // 2. Rapid to start point
  ops.push({
    type: "RAPID_XY",
    x: ctx.startPoint.x,
    y: ctx.startPoint.y,
    comment: "Entry: position",
  });

  // 3. Slow plunge to cut Z
  ops.push({
    type: "LINEAR_Z",
    z: ctx.cutZ,
    f: t.plungeFeed,
    comment: "Entry: soft plunge",
  });

  // Calculate length
  const totalLength = Math.abs(ctx.safeZ - ctx.cutZ);
  const estimatedTime = (totalLength / t.plungeFeed) * 60;

  return {
    ops,
    totalLength,
    estimatedTime,
  };
}

/**
 * Emit PLUNGE_PECK entry: peck drilling style.
 *
 * Multiple shallow plunges with retracts (for drilling).
 * Not commonly used in routing.
 */
function emitPlungePeckEntry(ctx: EntryMoveContext): EntryOps {
  const t = ctx.entry.tuning;
  const ops: GCodeOp[] = [];

  // Peck depth (default 3mm per peck)
  const peckDepth = 3;
  const retractHeight = 0.5; // mm above current depth

  // 1. Rapid to safe Z
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Entry: safe height",
  });

  // 2. Rapid to start point
  ops.push({
    type: "RAPID_XY",
    x: ctx.startPoint.x,
    y: ctx.startPoint.y,
    comment: "Entry: position",
  });

  // 3. Peck cycle
  let currentZ = ctx.safeZ;
  while (currentZ > ctx.cutZ) {
    const nextZ = Math.max(currentZ - peckDepth, ctx.cutZ);

    // Plunge
    ops.push({
      type: "LINEAR_Z",
      z: nextZ,
      f: t.plungeFeed * 0.8, // Slower for peck
      comment: `Entry: peck to ${nextZ.toFixed(2)}`,
    });

    // Retract (unless at final depth)
    if (nextZ > ctx.cutZ) {
      ops.push({
        type: "RAPID_Z",
        z: nextZ + retractHeight,
        comment: "Entry: peck retract",
      });
    }

    currentZ = nextZ;
  }

  // Calculate length (sum of all plunges)
  const totalLength = Math.abs(ctx.safeZ - ctx.cutZ) * 1.5; // Approximate
  const estimatedTime = (totalLength / (t.plungeFeed * 0.8)) * 60;

  return {
    ops,
    totalLength,
    estimatedTime,
  };
}

// =============================================================================
// EXIT EMITTERS
// =============================================================================

/**
 * Emit exit operations based on mode.
 *
 * @param ctx Exit move context
 * @returns Generated exit operations
 */
export function emitExit(ctx: ExitMoveContext): ExitOps {
  switch (ctx.exit.mode) {
    case "LEAD_OUT":
      return emitLeadOutExit(ctx);
    case "NONE":
      return emitDirectExit(ctx);
    default:
      return emitDirectExit(ctx);
  }
}

/**
 * Emit LEAD_OUT exit: linear lead-out before retract.
 *
 * Steps:
 * 1. Linear move along tangent (lead-out)
 * 2. Small lift (exit lift)
 * 3. Rapid retract to safe Z
 */
function emitLeadOutExit(ctx: ExitMoveContext): ExitOps {
  const t = ctx.exit.tuning;
  const ops: GCodeOp[] = [];

  // Calculate lead-out end point
  const leadOutEnd = calculateLeadOutPoint(
    ctx.endPoint,
    ctx.endTangent,
    t.leadLenMm
  );

  // 1. Linear lead-out (optional small Z lift during)
  const exitZ = ctx.cutZ + t.exitLiftMm;
  ops.push({
    type: "LINEAR_XY",
    x: leadOutEnd.x,
    y: leadOutEnd.y,
    z: exitZ,
    f: 2000, // Lead-out at moderate speed
    comment: "Exit: lead-out",
  });

  // 2. Rapid retract to safe Z
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Exit: retract",
  });

  // Calculate length
  const leadLen = Math.hypot(
    leadOutEnd.x - ctx.endPoint.x,
    leadOutEnd.y - ctx.endPoint.y
  );
  const totalLength = leadLen + Math.abs(ctx.safeZ - exitZ);
  const estimatedTime = (leadLen / 2000) * 60 + 0.1; // Lead + rapid

  return {
    ops,
    leadOutEnd,
    totalLength,
    estimatedTime,
  };
}

/**
 * Emit direct exit: just lift and retract.
 *
 * Steps:
 * 1. Small lift (exit lift) - reduces drag marks
 * 2. Rapid retract to safe Z
 */
function emitDirectExit(ctx: ExitMoveContext): ExitOps {
  const t = ctx.exit.tuning;
  const ops: GCodeOp[] = [];

  // 1. Small lift
  if (t.exitLiftMm > 0) {
    const exitZ = ctx.cutZ + t.exitLiftMm;
    ops.push({
      type: "RAPID_Z",
      z: exitZ,
      comment: "Exit: lift",
    });
  }

  // 2. Rapid retract
  ops.push({
    type: "RAPID_Z",
    z: ctx.safeZ,
    comment: "Exit: retract",
  });

  // Calculate length
  const totalLength = Math.abs(ctx.safeZ - ctx.cutZ);
  const estimatedTime = 0.2; // Rapid is fast

  return {
    ops,
    totalLength,
    estimatedTime,
  };
}

// =============================================================================
// COMBINED EMITTER
// =============================================================================

/**
 * Emit both entry and exit operations for a span.
 */
export function emitEntryExit(
  decision: EntryExitDecision,
  startPoint: Point2,
  endPoint: Point2,
  startTangent: Vec2,
  endTangent: Vec2,
  cutZ: number,
  safeZ: number
): { entryOps: EntryOps; exitOps: ExitOps } {
  const entryOps = emitEntry({
    startPoint,
    startTangent,
    cutZ,
    safeZ,
    entry: decision.entry,
  });

  const exitOps = emitExit({
    endPoint,
    endTangent,
    cutZ,
    safeZ,
    exit: decision.exit,
  });

  return { entryOps, exitOps };
}
