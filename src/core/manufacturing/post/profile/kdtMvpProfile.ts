// src/core/manufacturing/post/profile/kdtMvpProfile.ts
/**
 * KDT MVP Machine Profile.
 *
 * Baseline ISO G-code profile for KDT CNC routers.
 * Used as the default/reference profile.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { MachineProfile, MaterialProfile, ToolProfile } from "./postProfile.v1";
import { KdtIsoDialect } from "../../gcode/dialects/kdtIsoDialect";

// =============================================================================
// MATERIALS
// =============================================================================

/**
 * HPL/Melamine material profile.
 */
const HPL_MELAMINE: MaterialProfile = {
  id: "HPL_MELAMINE",
  name: "HPL / Melamine Laminate",
  tags: ["HPL", "MELAMINE", "VENEER"],
  roughMillMode: "CONVENTIONAL",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_ARC",
    leadLenMm: 8,
    leadArcRadMm: 6,
    rampAngleDeg: 2.5,
    rampMaxLenMm: 25,
  },
  notes: "Use compression bit for laminate finish. CONVENTIONAL rough protects top surface.",
};

/**
 * Plywood material profile.
 */
const PLYWOOD: MaterialProfile = {
  id: "PLYWOOD",
  name: "Plywood",
  tags: ["PLYWOOD"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 15,
    leadArcRadMm: 10,
    rampAngleDeg: 3.5,
    rampMaxLenMm: 40,
  },
  notes: "Downcut or compression recommended for clean top surface.",
};

/**
 * HMR/MDF material profile.
 */
const HMR_MDF: MaterialProfile = {
  id: "HMR_MDF",
  name: "HMR / MDF",
  tags: ["HMR", "MDF"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 15,
    leadArcRadMm: 10,
    rampAngleDeg: 3.5,
    rampMaxLenMm: 40,
  },
  notes: "Standard routing. Use dust collection.",
};

/**
 * Particle board material profile.
 */
const PARTICLE_BOARD: MaterialProfile = {
  id: "PARTICLE_BOARD",
  name: "Particle Board",
  tags: ["PARTICLE_BOARD"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 12,
    leadArcRadMm: 8,
    rampAngleDeg: 4,
    rampMaxLenMm: 35,
  },
  notes: "Aggressive feeds OK. Watch for chip buildup.",
};

// =============================================================================
// TOOLS
// =============================================================================

/**
 * 6mm Compression spiral.
 */
const T_COMP_6: ToolProfile = {
  toolId: "T_COMP_6",
  toolNumber: 1,
  name: "6mm Compression",
  class: "COMPRESSION",
  diameterMm: 6,
  fluteLengthMm: 22,
  fluteCount: 2,
  maxStepdownMm: 6,
  maxStepoverMm: 3,
  rpm: { rough: 18000, finish: 18000 },
  feed: { rough: 5500, finish: 4500, plunge: 800 },
  laminateSafe: true,
  notes: "Primary tool for laminate work.",
};

/**
 * 8mm Upcut spiral.
 */
const T_UP_8: ToolProfile = {
  toolId: "T_UP_8",
  toolNumber: 2,
  name: "8mm Upcut",
  class: "UPCUT",
  diameterMm: 8,
  fluteLengthMm: 25,
  fluteCount: 2,
  maxStepdownMm: 8,
  maxStepoverMm: 4,
  rpm: { rough: 18000, finish: 17000 },
  feed: { rough: 6500, finish: 5500, plunge: 1100 },
  laminateSafe: false,
  notes: "Good chip evacuation. Not for laminate top surface.",
};

/**
 * 6mm Downcut spiral.
 */
const T_DOWN_6: ToolProfile = {
  toolId: "T_DOWN_6",
  toolNumber: 3,
  name: "6mm Downcut",
  class: "DOWNCUT",
  diameterMm: 6,
  fluteLengthMm: 20,
  fluteCount: 2,
  maxStepdownMm: 5,
  maxStepoverMm: 3,
  rpm: { rough: 18000, finish: 18000 },
  feed: { rough: 5000, finish: 4000, plunge: 700 },
  laminateSafe: true,
  notes: "Clean top surface. Watch for chip packing.",
};

/**
 * 3mm Compression spiral (fine detail).
 */
const T_COMP_3: ToolProfile = {
  toolId: "T_COMP_3",
  toolNumber: 4,
  name: "3mm Compression",
  class: "COMPRESSION",
  diameterMm: 3,
  fluteLengthMm: 12,
  fluteCount: 2,
  maxStepdownMm: 3,
  maxStepoverMm: 1.5,
  rpm: { rough: 20000, finish: 20000 },
  feed: { rough: 3000, finish: 2500, plunge: 500 },
  laminateSafe: true,
  notes: "Fine detail and tight corners.",
};

// =============================================================================
// KDT MVP PROFILE
// =============================================================================

/**
 * KDT MVP Machine Profile.
 *
 * Baseline configuration for KDT CNC routers.
 */
export const KdtMvpProfile: MachineProfile = {
  version: "1.0",
  machineId: "KDT_MVP",
  name: "KDT MVP (Baseline)",
  dialect: KdtIsoDialect,

  kinematics: {
    safeZ: 15,
    home: { x: 0, y: 0 },
    workOffset: "G54",
    units: "MM",
    spindleCW: true,
    maxX: 2500,
    maxY: 1250,
    maxZ: 100,
    maxFeedRate: 15000,
    maxSpindleRpm: 24000,
  },

  header: ({ jobId, sheetId, timestamp }) => [
    "(MONOLITH KDT_MVP)",
    `(JOB ${jobId} SHEET ${sheetId})`,
    timestamp ? `(GENERATED ${timestamp})` : "",
    "G21",        // mm units
    "G90",        // absolute mode
    "G17",        // XY plane
    "G94",        // feed per minute
    "G40",        // cancel cutter comp
    "G49",        // cancel tool length comp
    "G80",        // cancel canned cycles
    "G54",        // work offset
  ].filter(Boolean),

  footer: ({ jobId }) => [
    `(END JOB ${jobId})`,
    "M5",         // spindle off
    "G0 Z15",     // retract to safe
    "M30",        // program end
  ],

  materials: [
    HPL_MELAMINE,
    PLYWOOD,
    HMR_MDF,
    PARTICLE_BOARD,
  ],

  tools: [
    T_COMP_6,
    T_UP_8,
    T_DOWN_6,
    T_COMP_3,
  ],

  policies: {
    requireSafeZBeforeRapidXY: true,
    requireSpindleOffBeforeToolChange: true,
    preferCompressionForLaminateFinish: true,
    maxToolChanges: 10,
  },

  notes: "KDT MVP baseline profile. Adjust feeds for specific machine tuning.",
};

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create KDT MVP profile with custom tools/materials.
 */
export function createKdtMvpProfile(
  overrides?: {
    tools?: ToolProfile[];
    materials?: MaterialProfile[];
  }
): MachineProfile {
  return {
    ...KdtMvpProfile,
    tools: overrides?.tools ?? KdtMvpProfile.tools,
    materials: overrides?.materials ?? KdtMvpProfile.materials,
  };
}
