// src/core/manufacturing/post/profile/homagProfile.ts
/**
 * Homag Standard Machine Profile.
 *
 * ISO G-code profile for Homag CNC routers.
 * Uses parentheses comments and line numbers (N1, N2...).
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { MachineProfile, MaterialProfile, ToolProfile } from "./postProfile.v1";
import { HomagIsoDialect } from "../../gcode/dialects/homagIsoDialect";

// =============================================================================
// MATERIALS (Homag-tuned)
// =============================================================================

const HOMAG_HPL: MaterialProfile = {
  id: "HPL_MELAMINE",
  name: "HPL / Melamine",
  tags: ["HPL", "MELAMINE", "VENEER"],
  roughMillMode: "CONVENTIONAL",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_ARC",
    leadLenMm: 10,
    leadArcRadMm: 8,
    rampAngleDeg: 2.0,
    rampMaxLenMm: 28,
  },
};

const HOMAG_PLYWOOD: MaterialProfile = {
  id: "PLYWOOD",
  name: "Plywood",
  tags: ["PLYWOOD"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 16,
    leadArcRadMm: 10,
    rampAngleDeg: 3.0,
    rampMaxLenMm: 42,
  },
};

const HOMAG_MDF: MaterialProfile = {
  id: "HMR_MDF",
  name: "MDF / HMR",
  tags: ["HMR", "MDF"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 16,
    leadArcRadMm: 10,
    rampAngleDeg: 3.0,
    rampMaxLenMm: 42,
  },
};

const HOMAG_SOLID: MaterialProfile = {
  id: "SOLID_WOOD",
  name: "Solid Wood",
  tags: ["SOLID_WOOD"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 12,
    leadArcRadMm: 8,
    rampAngleDeg: 4.0,
    rampMaxLenMm: 35,
  },
};

// =============================================================================
// TOOLS (Homag-tuned - premium tooling)
// =============================================================================

const HOMAG_COMP_6: ToolProfile = {
  toolId: "T_COMP_6",
  toolNumber: 1,
  name: "6mm Compression Premium",
  class: "COMPRESSION",
  diameterMm: 6,
  maxStepdownMm: 7,
  maxStepoverMm: 3.5,
  rpm: { rough: 21000, finish: 21000 },
  feed: { rough: 7000, finish: 6000, plunge: 1100 },
  laminateSafe: true,
};

const HOMAG_UP_10: ToolProfile = {
  toolId: "T_UP_10",
  toolNumber: 2,
  name: "10mm Upcut",
  class: "UPCUT",
  diameterMm: 10,
  maxStepdownMm: 12,
  maxStepoverMm: 5,
  rpm: { rough: 18000, finish: 18000 },
  feed: { rough: 8500, finish: 7500, plunge: 1500 },
  laminateSafe: false,
};

const HOMAG_DOWN_6: ToolProfile = {
  toolId: "T_DOWN_6",
  toolNumber: 3,
  name: "6mm Downcut Premium",
  class: "DOWNCUT",
  diameterMm: 6,
  maxStepdownMm: 6,
  maxStepoverMm: 3,
  rpm: { rough: 21000, finish: 21000 },
  feed: { rough: 6500, finish: 5500, plunge: 1000 },
  laminateSafe: true,
};

const HOMAG_COMP_3: ToolProfile = {
  toolId: "T_COMP_3",
  toolNumber: 4,
  name: "3mm Compression Detail",
  class: "COMPRESSION",
  diameterMm: 3,
  maxStepdownMm: 3,
  maxStepoverMm: 1.5,
  rpm: { rough: 22000, finish: 22000 },
  feed: { rough: 3500, finish: 3000, plunge: 600 },
  laminateSafe: true,
};

// =============================================================================
// HOMAG PROFILE
// =============================================================================

/**
 * Homag Standard Machine Profile.
 */
export const HomagProfile: MachineProfile = {
  version: "1.0",
  machineId: "HOMAG_STD",
  name: "Homag Standard",
  dialect: HomagIsoDialect,

  kinematics: {
    safeZ: 25,
    home: { x: 0, y: 0 },
    workOffset: "G54",
    units: "MM",
    spindleCW: true,
    maxX: 3700,
    maxY: 1600,
    maxZ: 150,
    maxFeedRate: 25000,
    maxSpindleRpm: 24000,
  },

  header: ({ jobId, sheetId, timestamp }) => [
    "(MONOLITH Homag STD)",
    `(JOB ${jobId} SHEET ${sheetId})`,
    timestamp ? `(GENERATED ${timestamp})` : "",
    "G21",
    "G90",
    "G17",
    "G54",
    "G94",
    "G40",
    "G80",
  ].filter(Boolean),

  footer: ({ jobId }) => [
    `(END JOB ${jobId})`,
    "M5",
    "G0 Z25",
    "M30",
  ],

  materials: [HOMAG_HPL, HOMAG_PLYWOOD, HOMAG_MDF, HOMAG_SOLID],

  tools: [HOMAG_COMP_6, HOMAG_UP_10, HOMAG_DOWN_6, HOMAG_COMP_3],

  policies: {
    requireSafeZBeforeRapidXY: true,
    requireSpindleOffBeforeToolChange: true,
    preferCompressionForLaminateFinish: true,
    maxToolChanges: 15,
  },

  notes: "Homag standard profile. Premium tooling with higher speeds.",
};

/**
 * Create Homag profile with custom tools/materials.
 */
export function createHomagProfile(
  overrides?: {
    tools?: ToolProfile[];
    materials?: MaterialProfile[];
  }
): MachineProfile {
  return {
    ...HomagProfile,
    tools: overrides?.tools ?? HomagProfile.tools,
    materials: overrides?.materials ?? HomagProfile.materials,
  };
}
