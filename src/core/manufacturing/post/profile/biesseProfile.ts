// src/core/manufacturing/post/profile/biesseProfile.ts
/**
 * Biesse Standard Machine Profile.
 *
 * ISO G-code profile for Biesse CNC routers.
 * Uses semicolon comments and line numbers.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { MachineProfile, MaterialProfile, ToolProfile } from "./postProfile.v1";
import { BiesseIsoDialect } from "../../gcode/dialects/biesseIsoDialect";

// =============================================================================
// MATERIALS (Biesse-tuned)
// =============================================================================

const BIESSE_HPL: MaterialProfile = {
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
    rampMaxLenMm: 30,
  },
};

const BIESSE_PLYWOOD: MaterialProfile = {
  id: "PLYWOOD",
  name: "Plywood",
  tags: ["PLYWOOD"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 18,
    leadArcRadMm: 12,
    rampAngleDeg: 3.0,
    rampMaxLenMm: 45,
  },
};

const BIESSE_MDF: MaterialProfile = {
  id: "HMR_MDF",
  name: "MDF / HMR",
  tags: ["HMR", "MDF"],
  roughMillMode: "CLIMB",
  finishMillMode: "CLIMB",
  entry: {
    laminateFinishMode: "RAMP_LINE",
    leadLenMm: 18,
    leadArcRadMm: 12,
    rampAngleDeg: 3.0,
    rampMaxLenMm: 45,
  },
};

// =============================================================================
// TOOLS (Biesse-tuned - higher feeds)
// =============================================================================

const BIESSE_COMP_6: ToolProfile = {
  toolId: "T_COMP_6",
  toolNumber: 1,
  name: "6mm Compression",
  class: "COMPRESSION",
  diameterMm: 6,
  maxStepdownMm: 7,
  maxStepoverMm: 3.5,
  rpm: { rough: 20000, finish: 20000 },
  feed: { rough: 6500, finish: 5500, plunge: 1000 },
  laminateSafe: true,
};

const BIESSE_UP_8: ToolProfile = {
  toolId: "T_UP_8",
  toolNumber: 2,
  name: "8mm Upcut",
  class: "UPCUT",
  diameterMm: 8,
  maxStepdownMm: 10,
  maxStepoverMm: 4.5,
  rpm: { rough: 18000, finish: 18000 },
  feed: { rough: 7500, finish: 6500, plunge: 1300 },
  laminateSafe: false,
};

const BIESSE_DOWN_6: ToolProfile = {
  toolId: "T_DOWN_6",
  toolNumber: 3,
  name: "6mm Downcut",
  class: "DOWNCUT",
  diameterMm: 6,
  maxStepdownMm: 6,
  maxStepoverMm: 3,
  rpm: { rough: 20000, finish: 20000 },
  feed: { rough: 6000, finish: 5000, plunge: 900 },
  laminateSafe: true,
};

// =============================================================================
// BIESSE PROFILE
// =============================================================================

/**
 * Biesse Standard Machine Profile.
 */
export const BiesseProfile: MachineProfile = {
  version: "1.0",
  machineId: "BIESSE_STD",
  name: "Biesse Standard",
  dialect: BiesseIsoDialect,

  kinematics: {
    safeZ: 20,
    home: { x: 0, y: 0 },
    workOffset: "G54",
    units: "MM",
    spindleCW: true,
    maxX: 3100,
    maxY: 1550,
    maxZ: 120,
    maxFeedRate: 20000,
    maxSpindleRpm: 24000,
  },

  header: ({ jobId, sheetId, timestamp }) => [
    ";MONOLITH Biesse STD",
    `;JOB ${jobId} SHEET ${sheetId}`,
    timestamp ? `;GENERATED ${timestamp}` : "",
    "G21",
    "G90",
    "G17",
    "G54",
    "G94",
    "G40",
    "G80",
  ].filter(Boolean),

  footer: ({ jobId }) => [
    `;END JOB ${jobId}`,
    "M5",
    "G0 Z20",
    "M30",
  ],

  materials: [BIESSE_HPL, BIESSE_PLYWOOD, BIESSE_MDF],

  tools: [BIESSE_COMP_6, BIESSE_UP_8, BIESSE_DOWN_6],

  policies: {
    requireSafeZBeforeRapidXY: true,
    requireSpindleOffBeforeToolChange: true,
    preferCompressionForLaminateFinish: true,
    maxToolChanges: 12,
  },

  notes: "Biesse standard profile. Higher feeds than KDT baseline.",
};

/**
 * Create Biesse profile with custom tools/materials.
 */
export function createBiesseProfile(
  overrides?: {
    tools?: ToolProfile[];
    materials?: MaterialProfile[];
  }
): MachineProfile {
  return {
    ...BiesseProfile,
    tools: overrides?.tools ?? BiesseProfile.tools,
    materials: overrides?.materials ?? BiesseProfile.materials,
  };
}
