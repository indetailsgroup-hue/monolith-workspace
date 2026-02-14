// src/core/manufacturing/post/profile/index.ts
/**
 * Profile Module.
 *
 * Machine, material, and tool profiles for post-processing.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

// Core contracts
export {
  // Types
  type MachineId,
  type MaterialTag,
  type ToolClass,
  type MillMode,
  type EntryMode,
  type MaterialEntryTuning,
  type MachineKinematics,
  type MachinePolicies,
  type MaterialProfile,
  type ToolProfile,
  type ToolFeeds,
  type ToolRpm,
  type WorkOffset,
  type HeaderFooterContext,
  type MachineProfile,

  // Constants
  DEFAULT_MATERIAL_ENTRY,
  DEFAULT_KINEMATICS,
  DEFAULT_POLICIES,

  // Utility functions
  findTool,
  requireTool,
  findMaterialByTag,
  matchMaterial,
  isLaminate,
  getToolNumber,
  validateMachineProfile,
} from "./postProfile.v1";

// Machine profiles
export { KdtMvpProfile, createKdtMvpProfile } from "./kdtMvpProfile";
export { BiesseProfile, createBiesseProfile } from "./biesseProfile";
export { HomagProfile, createHomagProfile } from "./homagProfile";
