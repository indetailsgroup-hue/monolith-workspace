// src/core/manufacturing/post/profile/postProfile.v1.ts
/**
 * Post-Processor Profile Contracts.
 *
 * Single source of truth for factory manufacturing:
 * - Machine kinematics (safeZ, home, work offset)
 * - Tool definitions (feeds, speeds, stepdown)
 * - Material profiles (entry/exit tuning, mill modes)
 * - Safety policies
 *
 * Key concepts:
 * - MachineProfile: Complete machine configuration
 * - MaterialProfile: Material-specific tuning
 * - ToolProfile: Tool parameters and feeds
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { Dialect } from "../../gcode/dialects/dialect.v1";

// =============================================================================
// MACHINE ID
// =============================================================================

/**
 * Supported machine identifiers.
 */
export type MachineId =
  | "KDT_MVP"
  | "BIESSE_STD"
  | "HOMAG_STD"
  | "GENERIC";

// =============================================================================
// MATERIAL PROFILE
// =============================================================================

/**
 * Material tags for classification.
 */
export type MaterialTag =
  | "HPL"
  | "MELAMINE"
  | "VENEER"
  | "MDF"
  | "HMR"
  | "PLYWOOD"
  | "SOLID_WOOD"
  | "PARTICLE_BOARD"
  | "ACRYLIC"
  | "ALUMINUM";

/**
 * Mill mode (direction policy).
 */
export type MillMode = "CLIMB" | "CONVENTIONAL";

/**
 * Entry mode for lead-in.
 */
export type EntryMode = "RAMP_ARC" | "RAMP_LINE" | "PLUNGE_SOFT" | "PLUNGE_PECK";

/**
 * Material-specific entry tuning.
 */
export interface MaterialEntryTuning {
  /** Laminate finish entry mode */
  laminateFinishMode: EntryMode;

  /** Lead-in length (mm) */
  leadLenMm: number;

  /** Lead-in arc radius (mm) */
  leadArcRadMm: number;

  /** Ramp angle (degrees) */
  rampAngleDeg: number;

  /** Maximum ramp length (mm) */
  rampMaxLenMm: number;
}

/**
 * Material profile.
 *
 * Defines material-specific manufacturing parameters.
 */
export interface MaterialProfile {
  /** Material identifier */
  id: string;

  /** Display name */
  name?: string;

  /** Classification tags */
  tags: MaterialTag[];

  /** Rough milling direction */
  roughMillMode: MillMode;

  /** Finish milling direction */
  finishMillMode: MillMode;

  /** Entry tuning baseline */
  entry: MaterialEntryTuning;

  /** Maximum chipload (mm per tooth, optional) */
  maxChipload?: number;

  /** Surface speed recommendation (m/min, optional) */
  surfaceSpeed?: number;

  /** Notes for operator */
  notes?: string;
}

/**
 * Default material entry tuning.
 */
export const DEFAULT_MATERIAL_ENTRY: MaterialEntryTuning = {
  laminateFinishMode: "RAMP_LINE",
  leadLenMm: 15,
  leadArcRadMm: 10,
  rampAngleDeg: 3.5,
  rampMaxLenMm: 40,
};

// =============================================================================
// TOOL PROFILE
// =============================================================================

/**
 * Tool classification.
 */
export type ToolClass =
  | "COMPRESSION"
  | "DOWNCUT"
  | "UPCUT"
  | "STRAIGHT"
  | "BALLNOSE"
  | "VBIT";

/**
 * Tool feeds for different stages.
 */
export interface ToolFeeds {
  /** Rough cutting feed (mm/min) */
  rough: number;

  /** Finish cutting feed (mm/min) */
  finish: number;

  /** Plunge feed (mm/min) */
  plunge: number;
}

/**
 * Tool RPM for different stages.
 */
export interface ToolRpm {
  /** Rough spindle speed */
  rough: number;

  /** Finish spindle speed */
  finish: number;
}

/**
 * Tool profile.
 *
 * Defines tool parameters for manufacturing.
 */
export interface ToolProfile {
  /** Tool identifier */
  toolId: string;

  /** Tool number (T#) */
  toolNumber: number;

  /** Display name */
  name?: string;

  /** Tool classification */
  class: ToolClass;

  /** Tool diameter (mm) */
  diameterMm: number;

  /** Flute length (mm) */
  fluteLengthMm?: number;

  /** Number of flutes */
  fluteCount?: number;

  /** Maximum stepdown per pass (mm) */
  maxStepdownMm: number;

  /** Maximum stepover for pocketing (mm) */
  maxStepoverMm: number;

  /** Spindle speeds */
  rpm: ToolRpm;

  /** Feed rates */
  feed: ToolFeeds;

  /** Is this tool suitable for laminate finish */
  laminateSafe?: boolean;

  /** Notes for operator */
  notes?: string;
}

// =============================================================================
// MACHINE KINEMATICS
// =============================================================================

/**
 * Work coordinate system.
 */
export type WorkOffset = "G54" | "G55" | "G56" | "G57" | "G58" | "G59";

/**
 * Machine kinematics configuration.
 */
export interface MachineKinematics {
  /** Safe Z height (mm) */
  safeZ: number;

  /** Home position */
  home: { x: number; y: number };

  /** Work offset (optional) */
  workOffset?: WorkOffset;

  /** Units (always MM for wood routing) */
  units: "MM";

  /** Spindle direction (CW for standard tools) */
  spindleCW: boolean;

  /** Maximum X travel (mm, optional) */
  maxX?: number;

  /** Maximum Y travel (mm, optional) */
  maxY?: number;

  /** Maximum Z travel (mm, optional) */
  maxZ?: number;

  /** Maximum feed rate (mm/min, optional) */
  maxFeedRate?: number;

  /** Maximum spindle RPM (optional) */
  maxSpindleRpm?: number;
}

/**
 * Default machine kinematics.
 */
export const DEFAULT_KINEMATICS: MachineKinematics = {
  safeZ: 15,
  home: { x: 0, y: 0 },
  workOffset: "G54",
  units: "MM",
  spindleCW: true,
};

// =============================================================================
// SAFETY POLICIES
// =============================================================================

/**
 * Machine safety policies.
 */
export interface MachinePolicies {
  /** Require safeZ before XY rapid moves */
  requireSafeZBeforeRapidXY: boolean;

  /** Require spindle off before tool change */
  requireSpindleOffBeforeToolChange: boolean;

  /** Prefer compression bits for laminate finish */
  preferCompressionForLaminateFinish: boolean;

  /** Require coolant for certain materials */
  requireCoolant?: boolean;

  /** Maximum tool changes per job (optional limit) */
  maxToolChanges?: number;
}

/**
 * Default safety policies.
 */
export const DEFAULT_POLICIES: MachinePolicies = {
  requireSafeZBeforeRapidXY: true,
  requireSpindleOffBeforeToolChange: true,
  preferCompressionForLaminateFinish: true,
};

// =============================================================================
// MACHINE PROFILE
// =============================================================================

/**
 * Header/footer context.
 */
export interface HeaderFooterContext {
  jobId: string;
  sheetId: string;
  timestamp?: string;
}

/**
 * Machine profile.
 *
 * Complete machine configuration for post-processing.
 */
export interface MachineProfile {
  /** Profile version */
  version: "1.0";

  /** Machine identifier */
  machineId: MachineId;

  /** Display name */
  name?: string;

  /** G-code dialect */
  dialect: Dialect;

  /** Machine kinematics */
  kinematics: MachineKinematics;

  /** Header generator */
  header: (ctx: HeaderFooterContext) => string[];

  /** Footer generator */
  footer: (ctx: HeaderFooterContext) => string[];

  /** Material profiles */
  materials: MaterialProfile[];

  /** Tool profiles */
  tools: ToolProfile[];

  /** Safety policies */
  policies: MachinePolicies;

  /** Profile notes */
  notes?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find tool profile by ID.
 */
export function findTool(
  profile: MachineProfile,
  toolId: string
): ToolProfile | undefined {
  return profile.tools.find((t) => t.toolId === toolId);
}

/**
 * Find tool profile by ID (throws if not found).
 */
export function requireTool(
  profile: MachineProfile,
  toolId: string
): ToolProfile {
  const tool = findTool(profile, toolId);
  if (!tool) {
    throw new Error(`Tool not found: ${toolId} in profile ${profile.machineId}`);
  }
  return tool;
}

/**
 * Find material profile by tag.
 */
export function findMaterialByTag(
  profile: MachineProfile,
  tag: MaterialTag
): MaterialProfile | undefined {
  return profile.materials.find((m) => m.tags.includes(tag));
}

/**
 * Find material profile that matches any of the given tags.
 */
export function matchMaterial(
  profile: MachineProfile,
  tags: MaterialTag[]
): MaterialProfile | undefined {
  for (const mat of profile.materials) {
    if (mat.tags.some((t) => tags.includes(t))) {
      return mat;
    }
  }
  return undefined;
}

/**
 * Check if material is laminate (HPL/Melamine/Veneer).
 */
export function isLaminate(tags: MaterialTag[]): boolean {
  return tags.some((t) => t === "HPL" || t === "MELAMINE" || t === "VENEER");
}

/**
 * Get tool number for tool ID.
 */
export function getToolNumber(
  profile: MachineProfile,
  toolId: string
): number {
  const tool = requireTool(profile, toolId);
  return tool.toolNumber;
}

/**
 * Validate machine profile.
 */
export function validateMachineProfile(
  profile: MachineProfile
): string[] {
  const issues: string[] = [];

  // Check for duplicate tool IDs
  const toolIds = new Set<string>();
  for (const tool of profile.tools) {
    if (toolIds.has(tool.toolId)) {
      issues.push(`Duplicate tool ID: ${tool.toolId}`);
    }
    toolIds.add(tool.toolId);
  }

  // Check for duplicate tool numbers
  const toolNumbers = new Set<number>();
  for (const tool of profile.tools) {
    if (toolNumbers.has(tool.toolNumber)) {
      issues.push(`Duplicate tool number: T${tool.toolNumber}`);
    }
    toolNumbers.add(tool.toolNumber);
  }

  // Check for at least one material
  if (profile.materials.length === 0) {
    issues.push("Profile has no material definitions");
  }

  // Check for at least one tool
  if (profile.tools.length === 0) {
    issues.push("Profile has no tool definitions");
  }

  return issues;
}
