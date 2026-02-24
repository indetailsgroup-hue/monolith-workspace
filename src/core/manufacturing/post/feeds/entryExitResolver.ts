// src/core/manufacturing/post/feeds/entryExitResolver.ts
/**
 * Entry/Exit Resolver.
 *
 * Resolves entry/exit strategies from machine profile.
 * Integrates with 10.6.6 entry/exit policy using profile tuning.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import {
  MachineProfile,
  MaterialProfile,
  MaterialTag,
  matchMaterial,
  isLaminate,
  requireTool,
} from "../profile/postProfile.v1";
import { Stage } from "./feedResolver";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry mode (from 10.6.6).
 */
export type EntryMode = "RAMP_LINE" | "RAMP_ARC" | "PLUNGE_SOFT" | "PLUNGE_PECK";

/**
 * Exit mode (from 10.6.6).
 */
export type ExitMode = "LEAD_OUT" | "NONE";

/**
 * Entry tuning parameters.
 */
export interface EntryTuning {
  /** Lead-in length (mm) */
  leadLenMm: number;

  /** Lead-in arc radius (mm) */
  leadArcRadMm: number;

  /** Ramp angle (degrees) */
  rampAngleDeg: number;

  /** Maximum ramp length (mm) */
  rampMaxLenMm: number;

  /** Plunge feed multiplier (0-1) */
  plungeFeedMultiplier?: number;

  /** Peck depth for PLUNGE_PECK (mm) */
  peckDepthMm?: number;

  /** Dwell time after plunge (ms) */
  dwellMs?: number;
}

/**
 * Resolved entry/exit decision.
 */
export interface ResolvedEntryExit {
  /** Entry mode */
  entryMode: EntryMode;

  /** Entry tuning */
  entryTuning: EntryTuning;

  /** Exit mode */
  exitMode: ExitMode;

  /** Exit lead length (mm) */
  exitLeadLenMm: number;

  /** Material profile used */
  material?: MaterialProfile;

  /** Stage */
  stage: Stage;

  /** Tool class */
  toolClass: string;

  /** Is laminate material */
  isLaminate: boolean;
}

/**
 * Entry/exit resolution context.
 */
export interface EntryExitContext {
  /** Machine profile */
  profile: MachineProfile;

  /** Tool ID */
  toolId: string;

  /** Manufacturing stage */
  stage: Stage;

  /** Material tags */
  materialTags: MaterialTag[];

  /** Is open span (tabs/gaps) */
  isOpenSpan?: boolean;

  /** Cut depth (mm) */
  cutDepthMm?: number;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Default entry tuning (fallback).
 */
export const DEFAULT_ENTRY_TUNING: EntryTuning = {
  leadLenMm: 15,
  leadArcRadMm: 10,
  rampAngleDeg: 3.5,
  rampMaxLenMm: 40,
  plungeFeedMultiplier: 0.5,
};

/**
 * Resolve entry/exit for a context.
 *
 * @param ctx Resolution context
 * @returns Resolved entry/exit decision
 */
export function resolveEntryExit(ctx: EntryExitContext): ResolvedEntryExit {
  const { profile, toolId, stage, materialTags, isOpenSpan } = ctx;

  // Match material
  const material = matchMaterial(profile, materialTags);
  const hasLaminate = isLaminate(materialTags);

  // Get tool class
  const tool = requireTool(profile, toolId);
  const toolClass = tool.class;

  // Determine entry mode
  let entryMode: EntryMode;

  if (hasLaminate && stage === "FINISH") {
    // Laminate finish: prefer RAMP_ARC if machine supports arcs
    const supportsArcs = profile.dialect.caps.supportsG2G3;
    const preferredMode = material?.entry.laminateFinishMode ?? "RAMP_ARC";

    if (preferredMode === "RAMP_ARC" && supportsArcs) {
      entryMode = "RAMP_ARC";
    } else {
      entryMode = "RAMP_LINE";
    }
  } else if (isOpenSpan) {
    // Open spans (tabs): always RAMP_LINE for safety
    entryMode = "RAMP_LINE";
  } else if (stage === "ROUGH") {
    // Rough: RAMP_LINE or PLUNGE_SOFT depending on depth
    entryMode = "RAMP_LINE";
  } else {
    // Default: RAMP_LINE
    entryMode = "RAMP_LINE";
  }

  // Get tuning from material profile or defaults
  const matEntry = material?.entry;
  const entryTuning: EntryTuning = {
    leadLenMm: matEntry?.leadLenMm ?? DEFAULT_ENTRY_TUNING.leadLenMm,
    leadArcRadMm: matEntry?.leadArcRadMm ?? DEFAULT_ENTRY_TUNING.leadArcRadMm,
    rampAngleDeg: matEntry?.rampAngleDeg ?? DEFAULT_ENTRY_TUNING.rampAngleDeg,
    rampMaxLenMm: matEntry?.rampMaxLenMm ?? DEFAULT_ENTRY_TUNING.rampMaxLenMm,
    plungeFeedMultiplier: DEFAULT_ENTRY_TUNING.plungeFeedMultiplier,
  };

  // Adjust tuning for finish pass
  if (stage === "FINISH" && hasLaminate) {
    // Tighter entry for laminate finish
    entryTuning.leadLenMm = Math.min(entryTuning.leadLenMm, 10);
    entryTuning.rampAngleDeg = Math.min(entryTuning.rampAngleDeg, 2.5);
  }

  // Determine exit mode
  const exitMode: ExitMode = isOpenSpan ? "NONE" : "LEAD_OUT";
  const exitLeadLenMm = exitMode === "LEAD_OUT" ? entryTuning.leadLenMm * 0.5 : 0;

  return {
    entryMode,
    entryTuning,
    exitMode,
    exitLeadLenMm,
    material,
    stage,
    toolClass,
    isLaminate: hasLaminate,
  };
}

/**
 * Get entry mode for laminate material.
 */
export function getLaminateEntryMode(
  profile: MachineProfile,
  materialTags: MaterialTag[]
): EntryMode {
  const material = matchMaterial(profile, materialTags);
  const supportsArcs = profile.dialect.caps.supportsG2G3;

  if (material?.entry.laminateFinishMode === "RAMP_ARC" && supportsArcs) {
    return "RAMP_ARC";
  }

  return "RAMP_LINE";
}

/**
 * Check if material requires special entry handling.
 */
export function requiresSpecialEntry(materialTags: MaterialTag[]): boolean {
  return isLaminate(materialTags);
}

// =============================================================================
// ENTRY GEOMETRY HELPERS
// =============================================================================

/**
 * Calculate ramp length from angle and depth.
 *
 * @param rampAngleDeg Ramp angle in degrees
 * @param depthMm Cut depth in mm
 * @param maxLenMm Maximum ramp length
 * @returns Ramp length in mm
 */
export function calculateRampLength(
  rampAngleDeg: number,
  depthMm: number,
  maxLenMm: number
): number {
  const angleRad = (rampAngleDeg * Math.PI) / 180;
  const calculatedLen = depthMm / Math.tan(angleRad);
  return Math.min(calculatedLen, maxLenMm);
}

/**
 * Calculate ramp start point offset.
 *
 * @param entryPoint Target entry point (x, y)
 * @param tangentAngle Tangent angle at entry point (radians)
 * @param rampLen Ramp length
 * @returns Offset start point
 */
export function calculateRampStartOffset(
  entryPoint: { x: number; y: number },
  tangentAngle: number,
  rampLen: number
): { x: number; y: number } {
  return {
    x: entryPoint.x - rampLen * Math.cos(tangentAngle),
    y: entryPoint.y - rampLen * Math.sin(tangentAngle),
  };
}

/**
 * Calculate arc lead-in center.
 *
 * @param entryPoint Target entry point
 * @param tangentAngle Tangent angle at entry point
 * @param arcRadius Arc radius
 * @param clockwise Is clockwise arc
 * @returns Arc center point
 */
export function calculateArcLeadInCenter(
  entryPoint: { x: number; y: number },
  tangentAngle: number,
  arcRadius: number,
  clockwise: boolean
): { x: number; y: number } {
  // Normal angle (perpendicular to tangent)
  const normalAngle = tangentAngle + (clockwise ? -Math.PI / 2 : Math.PI / 2);

  return {
    x: entryPoint.x + arcRadius * Math.cos(normalAngle),
    y: entryPoint.y + arcRadius * Math.sin(normalAngle),
  };
}
