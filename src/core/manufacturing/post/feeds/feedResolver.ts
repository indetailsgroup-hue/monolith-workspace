// src/core/manufacturing/post/feeds/feedResolver.ts
/**
 * Feed Rate Resolver.
 *
 * Resolves feed rates and RPM from machine profile.
 * Deterministic lookup based on (tool, stage, material).
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import {
  MachineProfile,
  ToolProfile,
  MaterialProfile,
  MaterialTag,
  requireTool,
  matchMaterial,
  isLaminate,
} from "../profile/postProfile.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Manufacturing stage.
 */
export type Stage = "ROUGH" | "FINISH" | "THROUGH";

/**
 * Resolved feed/speed parameters.
 */
export interface ResolvedFeeds {
  /** Cutting feed (mm/min) */
  cutFeed: number;

  /** Plunge feed (mm/min) */
  plungeFeed: number;

  /** Spindle RPM */
  rpm: number;

  /** Maximum stepdown (mm) */
  maxStepdown: number;

  /** Maximum stepover (mm) */
  maxStepover: number;

  /** Tool profile reference */
  tool: ToolProfile;

  /** Material profile reference (if matched) */
  material?: MaterialProfile;

  /** Stage used for resolution */
  stage: Stage;
}

/**
 * Feed resolution context.
 */
export interface FeedResolutionContext {
  /** Machine profile */
  profile: MachineProfile;

  /** Tool ID */
  toolId: string;

  /** Manufacturing stage */
  stage: Stage;

  /** Material tags (for material-specific tuning) */
  materialTags?: MaterialTag[];

  /** Override multiplier for cut feed (0-1) */
  feedMultiplier?: number;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve tool from profile (throws if not found).
 */
export function resolveTool(
  profile: MachineProfile,
  toolId: string
): ToolProfile {
  return requireTool(profile, toolId);
}

/**
 * Resolve feeds for a tool and stage.
 *
 * @param profile Machine profile
 * @param toolId Tool ID
 * @param stage Manufacturing stage
 * @returns Resolved feed parameters
 */
export function resolveFeeds(
  profile: MachineProfile,
  toolId: string,
  stage: Stage
): ResolvedFeeds {
  const tool = requireTool(profile, toolId);

  // Select feeds based on stage
  const isRough = stage === "ROUGH";
  const cutFeed = isRough ? tool.feed.rough : tool.feed.finish;
  const rpm = isRough ? tool.rpm.rough : tool.rpm.finish;

  return {
    cutFeed,
    plungeFeed: tool.feed.plunge,
    rpm,
    maxStepdown: tool.maxStepdownMm,
    maxStepover: tool.maxStepoverMm,
    tool,
    stage,
  };
}

/**
 * Resolve feeds with full context (material-aware).
 *
 * @param ctx Resolution context
 * @returns Resolved feed parameters
 */
export function resolveFeedsWithContext(
  ctx: FeedResolutionContext
): ResolvedFeeds {
  const { profile, toolId, stage, materialTags, feedMultiplier } = ctx;
  const tool = requireTool(profile, toolId);

  // Match material profile
  const material = materialTags
    ? matchMaterial(profile, materialTags)
    : undefined;

  // Select feeds based on stage
  const isRough = stage === "ROUGH";
  let cutFeed = isRough ? tool.feed.rough : tool.feed.finish;
  const rpm = isRough ? tool.rpm.rough : tool.rpm.finish;

  // Apply material-specific adjustments
  if (material && isLaminate(material.tags)) {
    // Slightly reduce feed for laminate finish
    if (stage === "FINISH") {
      cutFeed = cutFeed * 0.9;
    }
  }

  // Apply multiplier
  if (feedMultiplier !== undefined) {
    cutFeed = cutFeed * feedMultiplier;
  }

  // Clamp to machine limits
  if (profile.kinematics.maxFeedRate) {
    cutFeed = Math.min(cutFeed, profile.kinematics.maxFeedRate);
  }

  return {
    cutFeed: Math.round(cutFeed),
    plungeFeed: tool.feed.plunge,
    rpm: Math.round(rpm),
    maxStepdown: tool.maxStepdownMm,
    maxStepover: tool.maxStepoverMm,
    tool,
    material,
    stage,
  };
}

/**
 * Resolve plunge feed for a tool.
 */
export function resolvePlungeFeed(
  profile: MachineProfile,
  toolId: string
): number {
  const tool = requireTool(profile, toolId);
  return tool.feed.plunge;
}

/**
 * Resolve RPM for a tool and stage.
 */
export function resolveRpm(
  profile: MachineProfile,
  toolId: string,
  stage: Stage
): number {
  const tool = requireTool(profile, toolId);
  return stage === "ROUGH" ? tool.rpm.rough : tool.rpm.finish;
}

/**
 * Get all feed parameters for a tool.
 */
export function getToolFeedParams(
  profile: MachineProfile,
  toolId: string
): { rough: ResolvedFeeds; finish: ResolvedFeeds } {
  return {
    rough: resolveFeeds(profile, toolId, "ROUGH"),
    finish: resolveFeeds(profile, toolId, "FINISH"),
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate feed rate against machine limits.
 */
export function validateFeedRate(
  feed: number,
  profile: MachineProfile
): { valid: boolean; clamped: number; message?: string } {
  const max = profile.kinematics.maxFeedRate;

  if (!max) {
    return { valid: true, clamped: feed };
  }

  if (feed > max) {
    return {
      valid: false,
      clamped: max,
      message: `Feed ${feed} exceeds machine max ${max}`,
    };
  }

  return { valid: true, clamped: feed };
}

/**
 * Validate RPM against machine limits.
 */
export function validateRpm(
  rpm: number,
  profile: MachineProfile
): { valid: boolean; clamped: number; message?: string } {
  const max = profile.kinematics.maxSpindleRpm;

  if (!max) {
    return { valid: true, clamped: rpm };
  }

  if (rpm > max) {
    return {
      valid: false,
      clamped: max,
      message: `RPM ${rpm} exceeds machine max ${max}`,
    };
  }

  return { valid: true, clamped: rpm };
}
