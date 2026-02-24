// src/core/manufacturing/post/ir/irSafety.ts
/**
 * IR Safety Verification.
 *
 * Validates IR programs for factory safety:
 * - No XY rapids below safeZ
 * - Spindle off before tool change
 * - Arc support validation
 * - Feed rate limits
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { IRProgram, IRMove } from "../../gcode/ir/gcodeIr.v1";
import { MachineProfile, MachinePolicies } from "../profile/postProfile.v1";
import { Dialect } from "../../gcode/dialects/dialect.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Safety issue code.
 */
export type SafetyIssueCode =
  | "RAPID_XY_BELOW_SAFE_Z"
  | "TOOL_CHANGE_WITH_SPINDLE_ON"
  | "ARC_NOT_SUPPORTED"
  | "FEED_EXCEEDS_MAX"
  | "RPM_EXCEEDS_MAX"
  | "Z_EXCEEDS_MAX"
  | "XY_EXCEEDS_BOUNDS"
  | "MISSING_SPINDLE_ON"
  | "MISSING_RETRACT_BEFORE_END"
  | "PLUNGE_FEED_TOO_HIGH";

/**
 * Safety issue.
 */
export interface SafetyIssue {
  code: SafetyIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  moveIndex?: number;
  data?: Record<string, unknown>;
}

/**
 * Safety verification result.
 */
export interface SafetyVerificationResult {
  /** All issues passed */
  valid: boolean;

  /** All issues found */
  issues: SafetyIssue[];

  /** Blocking issues */
  blocks: SafetyIssue[];

  /** Warnings */
  warnings: SafetyIssue[];
}

/**
 * Safety verification context.
 */
export interface SafetyContext {
  /** Safe Z height */
  safeZ: number;

  /** Machine policies */
  policies: MachinePolicies;

  /** Dialect for capability check */
  dialect: Dialect;

  /** Machine limits (optional) */
  limits?: {
    maxFeedRate?: number;
    maxSpindleRpm?: number;
    maxX?: number;
    maxY?: number;
    maxZ?: number;
  };
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify IR program safety.
 *
 * @param program IR program
 * @param ctx Safety context
 * @returns Verification result
 */
export function verifyIrSafety(
  program: IRProgram,
  ctx: SafetyContext
): SafetyVerificationResult {
  const issues: SafetyIssue[] = [];

  // Track state
  let z = ctx.safeZ;
  let spindleOn = false;
  let lastX = 0;
  let lastY = 0;
  let currentFeed = 1000;
  let hasCutting = false;

  for (let i = 0; i < program.moves.length; i++) {
    const move = program.moves[i];

    // Track spindle state
    if (move.kind === "SPINDLE_ON") {
      spindleOn = true;
    } else if (move.kind === "SPINDLE_OFF") {
      spindleOn = false;
    }

    // Track Z position
    if (move.kind === "RAPID" && move.z !== undefined) {
      z = move.z;
    } else if (move.kind === "LINEAR" && move.z !== undefined) {
      z = move.z;
      hasCutting = true;
    }

    // Track XY position
    if (move.kind === "RAPID") {
      if (move.x !== undefined) lastX = move.x;
      if (move.y !== undefined) lastY = move.y;
    } else if (move.kind === "LINEAR") {
      if (move.x !== undefined) lastX = move.x;
      if (move.y !== undefined) lastY = move.y;
    } else if (move.kind === "ARC_CW" || move.kind === "ARC_CCW") {
      lastX = move.x;
      lastY = move.y;
      hasCutting = true;
    }

    // Track feed
    if (move.kind === "SET_FEED") {
      currentFeed = move.feed;
    } else if (move.kind === "LINEAR" && move.feed !== undefined) {
      currentFeed = move.feed;
    }

    // Check: Rapid XY below safeZ
    if (
      ctx.policies.requireSafeZBeforeRapidXY &&
      move.kind === "RAPID" &&
      (move.x !== undefined || move.y !== undefined) &&
      z < ctx.safeZ - 0.001
    ) {
      issues.push({
        code: "RAPID_XY_BELOW_SAFE_Z",
        severity: "BLOCK",
        message: `Rapid XY move at Z=${z.toFixed(3)} (below safeZ=${ctx.safeZ})`,
        moveIndex: i,
        data: { z, safeZ: ctx.safeZ },
      });
    }

    // Check: Tool change with spindle on
    if (
      ctx.policies.requireSpindleOffBeforeToolChange &&
      move.kind === "TOOL_CHANGE" &&
      spindleOn
    ) {
      issues.push({
        code: "TOOL_CHANGE_WITH_SPINDLE_ON",
        severity: "BLOCK",
        message: `Tool change while spindle is on`,
        moveIndex: i,
        data: { toolNumber: move.toolNumber },
      });
    }

    // Check: Arc support
    if (
      (move.kind === "ARC_CW" || move.kind === "ARC_CCW") &&
      !ctx.dialect.caps.supportsG2G3
    ) {
      issues.push({
        code: "ARC_NOT_SUPPORTED",
        severity: "BLOCK",
        message: `Arc move not supported by dialect ${ctx.dialect.id}`,
        moveIndex: i,
      });
    }

    // Check: Feed rate limits
    if (ctx.limits?.maxFeedRate) {
      if (
        move.kind === "SET_FEED" &&
        move.feed > ctx.limits.maxFeedRate
      ) {
        issues.push({
          code: "FEED_EXCEEDS_MAX",
          severity: "WARN",
          message: `Feed ${move.feed} exceeds max ${ctx.limits.maxFeedRate}`,
          moveIndex: i,
        });
      }
    }

    // Check: RPM limits
    if (ctx.limits?.maxSpindleRpm) {
      if (
        move.kind === "SPINDLE_ON" &&
        move.rpm > ctx.limits.maxSpindleRpm
      ) {
        issues.push({
          code: "RPM_EXCEEDS_MAX",
          severity: "WARN",
          message: `RPM ${move.rpm} exceeds max ${ctx.limits.maxSpindleRpm}`,
          moveIndex: i,
        });
      }
    }

    // Check: XY bounds
    if (ctx.limits?.maxX || ctx.limits?.maxY) {
      const xExceeds = ctx.limits.maxX && lastX > ctx.limits.maxX;
      const yExceeds = ctx.limits.maxY && lastY > ctx.limits.maxY;

      if (xExceeds || yExceeds) {
        issues.push({
          code: "XY_EXCEEDS_BOUNDS",
          severity: "WARN",
          message: `Position (${lastX}, ${lastY}) exceeds bounds`,
          moveIndex: i,
          data: { x: lastX, y: lastY, maxX: ctx.limits.maxX, maxY: ctx.limits.maxY },
        });
      }
    }
  }

  // Check: Cutting without spindle on
  if (hasCutting && !program.moves.some((m) => m.kind === "SPINDLE_ON")) {
    issues.push({
      code: "MISSING_SPINDLE_ON",
      severity: "BLOCK",
      message: "Program has cutting moves but no spindle on command",
    });
  }

  // Categorize issues
  const blocks = issues.filter((i) => i.severity === "BLOCK");
  const warnings = issues.filter((i) => i.severity === "WARN");

  return {
    valid: blocks.length === 0,
    issues,
    blocks,
    warnings,
  };
}

/**
 * Quick safety check (blocking issues only).
 */
export function quickVerifyIrSafety(
  program: IRProgram,
  safeZ: number,
  policies: MachinePolicies,
  dialect: Dialect
): boolean {
  const result = verifyIrSafety(program, {
    safeZ,
    policies,
    dialect,
  });
  return result.valid;
}

/**
 * Create safety context from machine profile.
 */
export function createSafetyContext(profile: MachineProfile): SafetyContext {
  return {
    safeZ: profile.kinematics.safeZ,
    policies: profile.policies,
    dialect: profile.dialect,
    limits: {
      maxFeedRate: profile.kinematics.maxFeedRate,
      maxSpindleRpm: profile.kinematics.maxSpindleRpm,
      maxX: profile.kinematics.maxX,
      maxY: profile.kinematics.maxY,
      maxZ: profile.kinematics.maxZ,
    },
  };
}

// =============================================================================
// ISSUE FORMATTING
// =============================================================================

/**
 * Format safety issues for display.
 */
export function formatSafetyIssues(result: SafetyVerificationResult): string[] {
  return result.issues.map((i) => {
    const prefix = i.severity === "BLOCK" ? "ERROR" : i.severity;
    const loc = i.moveIndex !== undefined ? ` [move ${i.moveIndex}]` : "";
    return `[${prefix}]${loc} ${i.message}`;
  });
}

/**
 * Generate safety audit report.
 */
export function generateSafetyAuditReport(
  result: SafetyVerificationResult
): Record<string, unknown> {
  return {
    valid: result.valid,
    summary: {
      total: result.issues.length,
      blocks: result.blocks.length,
      warnings: result.warnings.length,
    },
    blockingIssues: result.blocks.map((i) => ({
      code: i.code,
      message: i.message,
      moveIndex: i.moveIndex,
    })),
    warnings: result.warnings.map((i) => ({
      code: i.code,
      message: i.message,
    })),
  };
}
