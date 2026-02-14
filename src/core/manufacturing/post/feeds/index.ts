// src/core/manufacturing/post/feeds/index.ts
/**
 * Feeds Module.
 *
 * Feed rate and entry/exit resolution.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

// Feed resolver
export {
  // Types
  type Stage,
  type ResolvedFeeds,
  type FeedResolutionContext,

  // Functions
  resolveTool,
  resolveFeeds,
  resolveFeedsWithContext,
  resolvePlungeFeed,
  resolveRpm,
  getToolFeedParams,
  validateFeedRate,
  validateRpm,
} from "./feedResolver";

// Entry/exit resolver
export {
  // Types
  type EntryMode,
  type ExitMode,
  type EntryTuning,
  type ResolvedEntryExit,
  type EntryExitContext,

  // Constants
  DEFAULT_ENTRY_TUNING,

  // Functions
  resolveEntryExit,
  getLaminateEntryMode,
  requiresSpecialEntry,
  calculateRampLength,
  calculateRampStartOffset,
  calculateArcLeadInCenter,
} from "./entryExitResolver";
