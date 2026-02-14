/**
 * Machine Profiles (Post-Processor Parameter System)
 *
 * Step 10.7.2: Feed/RPM/ramp/peck/clearance per Machine + Material + Tool.
 *
 * This module provides:
 * - MachineProfile schema (machine-centric configuration)
 * - MaterialProfile with speed/feed/stepdown/entry/drilling parameters
 * - ToolProfile with per-tool overrides
 * - Deterministic resolver: Profile + Material + Tool → Parameters
 * - Bridge to PostContext (10.7.1) and ZProfile (10.6.8)
 * - Example KDT profile ready for production
 * - Gate-grade audit with profile pinning and fingerprints
 *
 * Key concepts:
 * - MachineProfile: Complete configuration for a machine family
 * - MaterialProfile: Cutting parameters per material type
 * - ToolProfile: Per-tool overrides (speed, feed, stepdown)
 * - ResolvedMachiningParams: Final parameters after resolution
 *
 * All resolution is deterministic with stable fingerprints for Gate audit.
 */

import type { MaterialKind, ToolKind } from './offsetKernel/directionPolicy.js';
import type { ZProfile } from './offsetKernel/zAwarePlanning.js';
import type { DialectId, PostContext, PostHooks } from './gcodeDialects.js';

// ============================================================================
// Types: Parameter Sets
// ============================================================================

/**
 * Machine family identifier.
 */
export type MachineFamily = 'KDT' | 'BIESSE' | 'HOMAG' | 'GENERIC';

/**
 * Machine profile identifier.
 */
export type MachineProfileId = string;

/**
 * Feed rate parameters.
 */
export interface FeedSet {
  /** Cutting feed rate (mm/min) */
  cutFeed: number;
  /** Plunge feed rate (mm/min) */
  plungeFeed: number;
  /** Ramp feed scale factor (0-1) */
  rampFeedScale: number;
}

/**
 * Spindle speed parameters.
 */
export interface SpeedSet {
  /** Spindle RPM */
  rpm: number;
}

/**
 * Clearance height parameters.
 */
export interface ClearanceSet {
  /** Safe clearance Z (mm) */
  safeZ: number;
  /** Rapid travel Z (mm) */
  rapidZ: number;
  /** Pierce height Z (mm) */
  pierceZ: number;
}

/**
 * Stepdown parameters.
 */
export interface StepdownSet {
  /** Roughing stepdown (mm) */
  stepdown: number;
  /** Finishing stepdown (mm) */
  finishingStepdown: number;
  /** Onion skin thickness (mm) */
  onionSkin: number;
}

/**
 * Peck drilling parameters.
 */
export interface PeckSet {
  /** Peck depth (mm) */
  peck: number;
  /** Retract height between pecks (mm) */
  retract: number;
  /** Dwell time at bottom (ms) */
  dwellMs?: number;
}

/**
 * Entry/exit move parameters.
 */
export interface EntryExitParams {
  /** Micro-line entry length (mm) */
  microLenMM: number;
  /** Micro-arc entry radius (mm) */
  microArcRMM: number;
  /** Ramp entry length (mm) */
  rampLenMM: number;
  /** Ramp entry angle (degrees) */
  rampAngleDeg: number;
  /** Pre-score depth for HPL (mm) */
  prescoreDepthMM?: number;
  /** Pre-score feed scale */
  prescoreFeedScale?: number;
}

/**
 * Safety limits.
 */
export interface LimitsSet {
  /** Maximum cut feed (mm/min) */
  maxCutFeed: number;
  /** Maximum spindle RPM */
  maxRpm: number;
  /** Maximum stepdown (mm) */
  maxStepdown: number;
  /** Maximum cut depth (mm) */
  maxDepth: number;
}

// ============================================================================
// Types: Profiles
// ============================================================================

/**
 * Tool-specific profile with optional overrides.
 */
export interface ToolProfile {
  /** Tool identifier */
  toolId: string;
  /** Tool geometry type */
  toolKind: ToolKind;
  /** Tool diameter (mm) */
  diameterMM: number;
  /** Flute length (mm, optional) */
  fluteLenMM?: number;
  /** Description */
  description?: string;

  /** Speed overrides */
  speed?: Partial<SpeedSet>;
  /** Feed overrides */
  feed?: Partial<FeedSet>;
  /** Stepdown overrides */
  stepdown?: Partial<StepdownSet>;
  /** Peck overrides */
  peck?: Partial<PeckSet>;
}

/**
 * Material-specific cutting parameters.
 */
export interface MaterialProfile {
  /** Material type */
  material: MaterialKind;

  /** Spindle speed */
  speed: SpeedSet;
  /** Feed rates */
  feed: FeedSet;
  /** Stepdown values */
  stepdown: StepdownSet;
  /** Entry/exit parameters */
  entry: EntryExitParams;
  /** Drilling parameters */
  drilling: PeckSet;
  /** Safety limits */
  limits: LimitsSet;
}

/**
 * Policy knobs for machining decisions.
 */
export interface MachiningPolicy {
  /** Default milling direction */
  defaultMilling: 'CLIMB' | 'CONVENTIONAL';
  /** Prefer climb for finish passes */
  preferClimbForFinish: boolean;
  /** Area threshold for small parts (mm²) */
  smallPartAreaMM2: number;
}

/**
 * Complete machine profile.
 */
export interface MachineProfile {
  /** Profile identifier */
  id: MachineProfileId;
  /** Profile version (semver) */
  version: string;
  /** Machine family */
  family: MachineFamily;
  /** Target G-code dialect */
  dialect: DialectId;
  /** Custom post hooks */
  hooks?: PostHooks;

  /** Clearance heights */
  clearance: ClearanceSet;
  /** Machining policy */
  policy: MachiningPolicy;

  /** Material profiles */
  materials: Partial<Record<MaterialKind, MaterialProfile>>;
  /** Tool profiles (by toolId) */
  tools: Record<string, ToolProfile>;
  /** Tool number mapping (toolId → T number) */
  toolNumberMap: Record<string, number>;
}

// ============================================================================
// Types: Resolved Parameters
// ============================================================================

/**
 * Fingerprints for audit trail.
 */
export interface ResolutionFingerprints {
  /** Profile fingerprint */
  profileFp: string;
  /** Tool fingerprint */
  toolFp: string;
  /** Material fingerprint */
  materialFp: string;
  /** Combined fingerprint */
  combinedFp: string;
}

/**
 * Fully resolved machining parameters.
 */
export interface ResolvedMachiningParams {
  /** Profile ID */
  profileId: string;
  /** Profile version */
  profileVersion: string;
  /** Material type */
  material: MaterialKind;
  /** Tool ID */
  toolId: string;

  /** Resolved speed */
  speed: SpeedSet;
  /** Resolved feed */
  feed: FeedSet;
  /** Resolved stepdown */
  stepdown: StepdownSet;
  /** Resolved clearance */
  clearance: ClearanceSet;
  /** Resolved drilling */
  drilling: PeckSet;
  /** Resolved entry/exit */
  entry: EntryExitParams;
  /** Safety limits */
  limits: LimitsSet;

  /** Audit fingerprints */
  fingerprints: ResolutionFingerprints;
}

/**
 * Profile pin for Gate audit.
 */
export interface ProfilePin {
  /** Machine profile ID */
  machineProfileId: string;
  /** Machine profile version */
  machineProfileVersion: string;
  /** Profile fingerprint */
  profileFp: string;
}

/**
 * Step pin for Gate audit.
 */
export interface StepPin {
  /** Step ID */
  stepId: string;
  /** Tool ID */
  toolId: string;
  /** Material */
  material: MaterialKind;
  /** Combined fingerprint */
  combinedFp: string;
}

// ============================================================================
// Fingerprint Helpers
// ============================================================================

/**
 * Create stable JSON fingerprint of an object.
 * Keys are sorted deterministically.
 */
function fpObj(obj: unknown): string {
  const stable = (x: unknown): unknown => {
    if (x === null || x === undefined) return x;
    if (typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(stable);

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(x as Record<string, unknown>).sort();
    for (const k of keys) {
      sorted[k] = stable((x as Record<string, unknown>)[k]);
    }
    return sorted;
  };

  return JSON.stringify(stable(obj));
}

/**
 * Create short hash-like fingerprint (not cryptographic).
 */
function shortFp(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// Parameter Resolution
// ============================================================================

/**
 * Resolve machining parameters from profile + material + tool.
 *
 * Resolution order:
 * 1. Start with material profile as base
 * 2. Apply tool-specific overrides
 * 3. Clamp values to safety limits
 * 4. Generate fingerprints
 *
 * @param mp - Machine profile
 * @param material - Material type
 * @param toolId - Tool identifier
 * @returns Fully resolved parameters
 */
export function resolveParams(
  mp: MachineProfile,
  material: MaterialKind,
  toolId: string
): ResolvedMachiningParams {
  // Get material profile
  const mat = mp.materials[material];
  if (!mat) {
    throw new Error(`Material '${material}' not found in profile '${mp.id}'`);
  }

  // Get tool profile
  const tool = mp.tools[toolId];
  if (!tool) {
    throw new Error(`Tool '${toolId}' not found in profile '${mp.id}'`);
  }

  // Start with material values
  let speed: SpeedSet = { ...mat.speed };
  let feed: FeedSet = { ...mat.feed };
  let stepdown: StepdownSet = { ...mat.stepdown };
  let drilling: PeckSet = { ...mat.drilling };
  const entry: EntryExitParams = { ...mat.entry };
  const clearance: ClearanceSet = { ...mp.clearance };
  const limits: LimitsSet = { ...mat.limits };

  // Apply tool overrides
  if (tool.speed) {
    speed = { ...speed, ...tool.speed };
  }
  if (tool.feed) {
    feed = { ...feed, ...tool.feed };
  }
  if (tool.stepdown) {
    stepdown = { ...stepdown, ...tool.stepdown };
  }
  if (tool.peck) {
    drilling = { ...drilling, ...tool.peck };
  }

  // Clamp to safety limits (deterministic)
  speed.rpm = Math.min(speed.rpm, limits.maxRpm);
  feed.cutFeed = Math.min(feed.cutFeed, limits.maxCutFeed);
  feed.plungeFeed = Math.min(feed.plungeFeed, limits.maxCutFeed);
  stepdown.stepdown = Math.min(stepdown.stepdown, limits.maxStepdown);
  stepdown.finishingStepdown = Math.min(stepdown.finishingStepdown, limits.maxStepdown);

  // Generate fingerprints
  const profileFp = shortFp(fpObj({
    id: mp.id,
    v: mp.version,
    family: mp.family,
    dialect: mp.dialect,
  }));

  const toolFp = shortFp(fpObj(tool));
  const materialFp = shortFp(fpObj(mat));
  const combinedFp = shortFp(fpObj({ profileFp, toolFp, materialFp }));

  return {
    profileId: mp.id,
    profileVersion: mp.version,
    material,
    toolId,
    speed,
    feed,
    stepdown,
    clearance,
    drilling,
    entry,
    limits,
    fingerprints: {
      profileFp,
      toolFp,
      materialFp,
      combinedFp,
    },
  };
}

/**
 * Resolve parameters with fallback to defaults.
 */
export function resolveParamsSafe(
  mp: MachineProfile,
  material: MaterialKind,
  toolId: string
): ResolvedMachiningParams | null {
  try {
    return resolveParams(mp, material, toolId);
  } catch {
    return null;
  }
}

// ============================================================================
// Bridge: Parameters → PostContext
// ============================================================================

/**
 * Create PostContext from resolved parameters.
 *
 * @param mp - Machine profile (for tool number map)
 * @param res - Resolved parameters
 * @returns PostContext for G-code emission
 */
export function makePostContext(
  mp: MachineProfile,
  res: ResolvedMachiningParams
): PostContext {
  return {
    units: 'MM',
    absMode: true,
    plane: 'XY',
    arcMode: 'IJ',
    feedMode: 'G94',

    safeZ: res.clearance.safeZ,
    rapidZ: res.clearance.rapidZ,

    toolNumberOf: (toolId: string) => mp.toolNumberMap[toolId] ?? 1,
    spindleRpmOf: (toolId: string) => {
      // Use resolved speed for the active tool, or material default for others
      if (toolId === res.toolId) {
        return res.speed.rpm;
      }
      const mat = mp.materials[res.material];
      return mat?.speed.rpm ?? res.speed.rpm;
    },

    decimalsXYZ: 3,
    decimalsIJ: 3,
    decimalsF: 0,
  };
}

/**
 * Create PostContext for a specific tool.
 */
export function makePostContextForTool(
  mp: MachineProfile,
  material: MaterialKind,
  toolId: string
): PostContext {
  const res = resolveParams(mp, material, toolId);
  return makePostContext(mp, res);
}

// ============================================================================
// Bridge: Parameters → ZProfile
// ============================================================================

/**
 * Create ZProfile from resolved parameters.
 *
 * @param res - Resolved parameters
 * @returns ZProfile for motion planning
 */
export function makeZProfile(res: ResolvedMachiningParams): ZProfile {
  return {
    safeZ: res.clearance.safeZ,
    rapidZ: res.clearance.rapidZ,
    pierceZ: res.clearance.pierceZ,

    plungeFeed: res.feed.plungeFeed,
    cutFeed: res.feed.cutFeed,
    rampFeedScale: res.feed.rampFeedScale,

    stepdownMM: res.stepdown.stepdown,
    finishingStepdownMM: res.stepdown.finishingStepdown,
    onionSkinMM: res.stepdown.onionSkin,

    maxDepthMM: res.limits.maxDepth,
    spindleRPM: res.speed.rpm,
  };
}

/**
 * Create ZProfile for a specific material/tool.
 */
export function makeZProfileFor(
  mp: MachineProfile,
  material: MaterialKind,
  toolId: string
): ZProfile {
  const res = resolveParams(mp, material, toolId);
  return makeZProfile(res);
}

// ============================================================================
// Profile Pinning (Gate Audit)
// ============================================================================

/**
 * Create profile pin for Gate audit.
 */
export function createProfilePin(mp: MachineProfile): ProfilePin {
  const profileFp = shortFp(fpObj({
    id: mp.id,
    v: mp.version,
    family: mp.family,
    dialect: mp.dialect,
    clearance: mp.clearance,
    policy: mp.policy,
  }));

  return {
    machineProfileId: mp.id,
    machineProfileVersion: mp.version,
    profileFp,
  };
}

/**
 * Create step pin for Gate audit.
 */
export function createStepPin(
  stepId: string,
  res: ResolvedMachiningParams
): StepPin {
  return {
    stepId,
    toolId: res.toolId,
    material: res.material,
    combinedFp: res.fingerprints.combinedFp,
  };
}

/**
 * Validate profile pin matches current profile.
 */
export function validateProfilePin(
  mp: MachineProfile,
  pin: ProfilePin
): { valid: boolean; reason?: string } {
  if (mp.id !== pin.machineProfileId) {
    return {
      valid: false,
      reason: `Profile ID mismatch: expected '${pin.machineProfileId}', got '${mp.id}'`,
    };
  }

  if (mp.version !== pin.machineProfileVersion) {
    return {
      valid: false,
      reason: `Profile version mismatch: expected '${pin.machineProfileVersion}', got '${mp.version}'`,
    };
  }

  const currentPin = createProfilePin(mp);
  if (currentPin.profileFp !== pin.profileFp) {
    return {
      valid: false,
      reason: `Profile fingerprint mismatch: content has changed`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Profile Validation
// ============================================================================

/**
 * Validate a machine profile for completeness.
 */
export function validateMachineProfile(
  mp: MachineProfile
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check required fields
  if (!mp.id) issues.push('Missing profile ID');
  if (!mp.version) issues.push('Missing profile version');
  if (!mp.family) issues.push('Missing machine family');
  if (!mp.dialect) issues.push('Missing dialect');

  // Check clearance values
  if (mp.clearance.safeZ <= mp.clearance.rapidZ) {
    issues.push('safeZ must be greater than rapidZ');
  }
  if (mp.clearance.rapidZ <= mp.clearance.pierceZ) {
    issues.push('rapidZ must be greater than pierceZ');
  }
  if (mp.clearance.pierceZ < 0) {
    issues.push('pierceZ must be non-negative');
  }

  // Check materials
  const materialKeys = Object.keys(mp.materials) as MaterialKind[];
  if (materialKeys.length === 0) {
    issues.push('At least one material profile required');
  }

  for (const key of materialKeys) {
    const mat = mp.materials[key]!;

    // Check positive values
    if (mat.speed.rpm <= 0) {
      issues.push(`Material ${key}: rpm must be positive`);
    }
    if (mat.feed.cutFeed <= 0) {
      issues.push(`Material ${key}: cutFeed must be positive`);
    }
    if (mat.stepdown.stepdown <= 0) {
      issues.push(`Material ${key}: stepdown must be positive`);
    }

    // Check limits
    if (mat.feed.cutFeed > mat.limits.maxCutFeed) {
      issues.push(`Material ${key}: cutFeed exceeds maxCutFeed`);
    }
    if (mat.speed.rpm > mat.limits.maxRpm) {
      issues.push(`Material ${key}: rpm exceeds maxRpm`);
    }
  }

  // Check tools
  const toolIds = Object.keys(mp.tools);
  if (toolIds.length === 0) {
    issues.push('At least one tool profile required');
  }

  for (const toolId of toolIds) {
    const tool = mp.tools[toolId];
    if (tool.diameterMM <= 0) {
      issues.push(`Tool ${toolId}: diameter must be positive`);
    }
    if (!(toolId in mp.toolNumberMap)) {
      issues.push(`Tool ${toolId}: missing from toolNumberMap`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ============================================================================
// Example Profiles
// ============================================================================

/**
 * Default material profile template.
 */
function createDefaultMaterialProfile(material: MaterialKind): MaterialProfile {
  const isFragile = material === 'HPL' || material === 'MELAMINE';
  const isAcrylic = material === 'ACRYLIC';

  return {
    material,
    speed: {
      rpm: isFragile ? 18000 : isAcrylic ? 16000 : 16000,
    },
    feed: {
      cutFeed: isFragile ? 3000 : isAcrylic ? 2500 : 4500,
      plungeFeed: isFragile ? 600 : isAcrylic ? 500 : 900,
      rampFeedScale: isFragile ? 0.55 : isAcrylic ? 0.5 : 0.65,
    },
    stepdown: {
      stepdown: isFragile ? 3.0 : isAcrylic ? 2.5 : 4.5,
      finishingStepdown: isFragile ? 2.0 : isAcrylic ? 1.5 : 3.0,
      onionSkin: isFragile ? 0.35 : isAcrylic ? 0.4 : 0.25,
    },
    entry: {
      microLenMM: isFragile ? 1.2 : 0.8,
      microArcRMM: isFragile ? 1.0 : 0.8,
      rampLenMM: isFragile ? 50 : 25,
      rampAngleDeg: isFragile ? 2.0 : 3.0,
      prescoreDepthMM: material === 'HPL' ? 0.35 : undefined,
      prescoreFeedScale: isFragile ? 0.45 : undefined,
    },
    drilling: {
      peck: isFragile ? 3.0 : 5.0,
      retract: 1.0,
      dwellMs: 0,
    },
    limits: {
      maxCutFeed: isFragile ? 5000 : 8000,
      maxRpm: 24000,
      maxStepdown: isFragile ? 6 : 12,
      maxDepth: isFragile ? 40 : 60,
    },
  };
}

/**
 * KDT MVP Profile - Ready for production use.
 */
export const KDT_MVP_PROFILE: MachineProfile = {
  id: 'KDT_MVP_TH_01',
  version: '1.0.0',
  family: 'KDT',
  dialect: 'KDT_ISO',
  hooks: {
    postHeader: ['(VACUUM ON)', 'M8'],
    preFooter: ['(VACUUM OFF)', 'M9'],
  },

  clearance: {
    safeZ: 15,
    rapidZ: 5,
    pierceZ: 1,
  },

  policy: {
    defaultMilling: 'CLIMB',
    preferClimbForFinish: true,
    smallPartAreaMM2: 800,
  },

  materials: {
    HPL: {
      material: 'HPL',
      speed: { rpm: 18000 },
      feed: { cutFeed: 2800, plungeFeed: 600, rampFeedScale: 0.55 },
      stepdown: { stepdown: 3.0, finishingStepdown: 2.0, onionSkin: 0.35 },
      entry: {
        microLenMM: 1.2,
        microArcRMM: 1.0,
        rampLenMM: 50,
        rampAngleDeg: 2.0,
        prescoreDepthMM: 0.35,
        prescoreFeedScale: 0.45,
      },
      drilling: { peck: 3.0, retract: 1.0, dwellMs: 0 },
      limits: { maxCutFeed: 4500, maxRpm: 24000, maxStepdown: 6, maxDepth: 40 },
    },

    MELAMINE: {
      material: 'MELAMINE',
      speed: { rpm: 18000 },
      feed: { cutFeed: 3200, plungeFeed: 700, rampFeedScale: 0.60 },
      stepdown: { stepdown: 3.5, finishingStepdown: 2.5, onionSkin: 0.25 },
      entry: {
        microLenMM: 1.0,
        microArcRMM: 0.9,
        rampLenMM: 40,
        rampAngleDeg: 2.5,
        prescoreFeedScale: 0.5,
      },
      drilling: { peck: 4.0, retract: 1.0 },
      limits: { maxCutFeed: 5000, maxRpm: 24000, maxStepdown: 7, maxDepth: 60 },
    },

    PLYWOOD: {
      material: 'PLYWOOD',
      speed: { rpm: 16000 },
      feed: { cutFeed: 4200, plungeFeed: 900, rampFeedScale: 0.65 },
      stepdown: { stepdown: 4.5, finishingStepdown: 3.0, onionSkin: 0.25 },
      entry: {
        microLenMM: 0.8,
        microArcRMM: 0.8,
        rampLenMM: 25,
        rampAngleDeg: 3.0,
      },
      drilling: { peck: 5.0, retract: 1.5 },
      limits: { maxCutFeed: 7000, maxRpm: 24000, maxStepdown: 10, maxDepth: 60 },
    },

    MDF: {
      material: 'MDF',
      speed: { rpm: 16000 },
      feed: { cutFeed: 4800, plungeFeed: 1000, rampFeedScale: 0.70 },
      stepdown: { stepdown: 5.0, finishingStepdown: 3.5, onionSkin: 0.20 },
      entry: {
        microLenMM: 0.7,
        microArcRMM: 0.8,
        rampLenMM: 20,
        rampAngleDeg: 3.5,
      },
      drilling: { peck: 6.0, retract: 1.5 },
      limits: { maxCutFeed: 8000, maxRpm: 24000, maxStepdown: 12, maxDepth: 60 },
    },

    PARTICLE: {
      material: 'PARTICLE',
      speed: { rpm: 16000 },
      feed: { cutFeed: 4200, plungeFeed: 900, rampFeedScale: 0.65 },
      stepdown: { stepdown: 4.5, finishingStepdown: 3.0, onionSkin: 0.25 },
      entry: {
        microLenMM: 0.8,
        microArcRMM: 0.8,
        rampLenMM: 25,
        rampAngleDeg: 3.0,
      },
      drilling: { peck: 5.0, retract: 1.5 },
      limits: { maxCutFeed: 7000, maxRpm: 24000, maxStepdown: 10, maxDepth: 60 },
    },

    SOLID_WOOD: {
      material: 'SOLID_WOOD',
      speed: { rpm: 14000 },
      feed: { cutFeed: 3800, plungeFeed: 800, rampFeedScale: 0.65 },
      stepdown: { stepdown: 4.0, finishingStepdown: 3.0, onionSkin: 0.20 },
      entry: {
        microLenMM: 0.8,
        microArcRMM: 0.9,
        rampLenMM: 25,
        rampAngleDeg: 3.0,
      },
      drilling: { peck: 5.0, retract: 1.5 },
      limits: { maxCutFeed: 6500, maxRpm: 24000, maxStepdown: 10, maxDepth: 60 },
    },

    ACRYLIC: {
      material: 'ACRYLIC',
      speed: { rpm: 16000 },
      feed: { cutFeed: 2500, plungeFeed: 500, rampFeedScale: 0.50 },
      stepdown: { stepdown: 2.5, finishingStepdown: 1.5, onionSkin: 0.40 },
      entry: {
        microLenMM: 1.5,
        microArcRMM: 1.2,
        rampLenMM: 60,
        rampAngleDeg: 1.5,
      },
      drilling: { peck: 2.0, retract: 0.5, dwellMs: 50 },
      limits: { maxCutFeed: 4000, maxRpm: 20000, maxStepdown: 5, maxDepth: 30 },
    },

    ALUMINUM: {
      material: 'ALUMINUM',
      speed: { rpm: 12000 },
      feed: { cutFeed: 1500, plungeFeed: 300, rampFeedScale: 0.40 },
      stepdown: { stepdown: 1.5, finishingStepdown: 0.5, onionSkin: 0.10 },
      entry: {
        microLenMM: 2.0,
        microArcRMM: 1.5,
        rampLenMM: 80,
        rampAngleDeg: 1.0,
      },
      drilling: { peck: 1.0, retract: 0.3, dwellMs: 100 },
      limits: { maxCutFeed: 3000, maxRpm: 18000, maxStepdown: 3, maxDepth: 20 },
    },

    OTHER: createDefaultMaterialProfile('OTHER'),
  },

  tools: {
    T_COMP_6: {
      toolId: 'T_COMP_6',
      toolKind: 'COMPRESSION',
      diameterMM: 6,
      description: '6mm Compression End Mill',
      speed: { rpm: 18000 },
    },
    T_COMP_8: {
      toolId: 'T_COMP_8',
      toolKind: 'COMPRESSION',
      diameterMM: 8,
      description: '8mm Compression End Mill',
      speed: { rpm: 18000 },
      stepdown: { stepdown: 4.0, finishingStepdown: 2.5, onionSkin: 0.25 },
    },
    T_COMP_4: {
      toolId: 'T_COMP_4',
      toolKind: 'COMPRESSION',
      diameterMM: 4,
      description: '4mm Compression End Mill',
      speed: { rpm: 20000 },
    },
    T_DOWN_6: {
      toolId: 'T_DOWN_6',
      toolKind: 'DOWNCUT',
      diameterMM: 6,
      description: '6mm Downcut End Mill',
      speed: { rpm: 17000 },
    },
    T_DOWN_4: {
      toolId: 'T_DOWN_4',
      toolKind: 'DOWNCUT',
      diameterMM: 4,
      description: '4mm Downcut End Mill',
      speed: { rpm: 18000 },
    },
    T_UP_6: {
      toolId: 'T_UP_6',
      toolKind: 'UPCUT',
      diameterMM: 6,
      description: '6mm Upcut End Mill',
      speed: { rpm: 16000 },
    },
    T_UP_8: {
      toolId: 'T_UP_8',
      toolKind: 'UPCUT',
      diameterMM: 8,
      description: '8mm Upcut End Mill',
      speed: { rpm: 15000 },
    },
    T_OFLUTE_2: {
      toolId: 'T_OFLUTE_2',
      toolKind: 'O_FLUTE',
      diameterMM: 2,
      description: '2mm O-Flute (Score)',
      speed: { rpm: 20000 },
    },
    T_OFLUTE_3: {
      toolId: 'T_OFLUTE_3',
      toolKind: 'O_FLUTE',
      diameterMM: 3,
      description: '3mm O-Flute',
      speed: { rpm: 20000 },
    },
    T_OFLUTE_6: {
      toolId: 'T_OFLUTE_6',
      toolKind: 'O_FLUTE',
      diameterMM: 6,
      description: '6mm O-Flute (Acrylic)',
      speed: { rpm: 16000 },
    },
    T_STRAIGHT_6: {
      toolId: 'T_STRAIGHT_6',
      toolKind: 'STRAIGHT',
      diameterMM: 6,
      description: '6mm Straight End Mill',
      speed: { rpm: 16000 },
    },
  },

  toolNumberMap: {
    T_COMP_6: 1,
    T_COMP_8: 2,
    T_COMP_4: 3,
    T_DOWN_6: 4,
    T_DOWN_4: 5,
    T_UP_6: 6,
    T_UP_8: 7,
    T_OFLUTE_2: 8,
    T_OFLUTE_3: 9,
    T_OFLUTE_6: 10,
    T_STRAIGHT_6: 11,
  },
};

/**
 * Generic baseline profile (for testing/development).
 */
export const GENERIC_PROFILE: MachineProfile = {
  id: 'GENERIC_DEV_01',
  version: '1.0.0',
  family: 'GENERIC',
  dialect: 'GENERIC_ISO',

  clearance: {
    safeZ: 15,
    rapidZ: 5,
    pierceZ: 1,
  },

  policy: {
    defaultMilling: 'CLIMB',
    preferClimbForFinish: true,
    smallPartAreaMM2: 500,
  },

  materials: {
    MDF: createDefaultMaterialProfile('MDF'),
    PLYWOOD: createDefaultMaterialProfile('PLYWOOD'),
    HPL: createDefaultMaterialProfile('HPL'),
    MELAMINE: createDefaultMaterialProfile('MELAMINE'),
    PARTICLE: createDefaultMaterialProfile('PARTICLE'),
    OTHER: createDefaultMaterialProfile('OTHER'),
  },

  tools: {
    T1: {
      toolId: 'T1',
      toolKind: 'COMPRESSION',
      diameterMM: 6,
    },
  },

  toolNumberMap: {
    T1: 1,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List materials in a profile.
 */
export function listProfileMaterials(mp: MachineProfile): MaterialKind[] {
  return Object.keys(mp.materials) as MaterialKind[];
}

/**
 * List tools in a profile.
 */
export function listProfileTools(mp: MachineProfile): string[] {
  return Object.keys(mp.tools);
}

/**
 * Get profile summary for logging.
 */
export function summarizeProfile(mp: MachineProfile): string {
  const materials = listProfileMaterials(mp);
  const tools = listProfileTools(mp);
  return `Profile ${mp.id} v${mp.version}: ${mp.family}/${mp.dialect}, ${materials.length} materials, ${tools.length} tools`;
}

/**
 * Clone a profile with modifications.
 */
export function cloneProfile(
  base: MachineProfile,
  overrides: Partial<MachineProfile>
): MachineProfile {
  return {
    ...base,
    ...overrides,
    clearance: { ...base.clearance, ...overrides.clearance },
    policy: { ...base.policy, ...overrides.policy },
    materials: { ...base.materials, ...overrides.materials },
    tools: { ...base.tools, ...overrides.tools },
    toolNumberMap: { ...base.toolNumberMap, ...overrides.toolNumberMap },
  };
}

/**
 * Add a tool to a profile.
 */
export function addToolToProfile(
  mp: MachineProfile,
  tool: ToolProfile,
  toolNumber: number
): MachineProfile {
  return {
    ...mp,
    tools: { ...mp.tools, [tool.toolId]: tool },
    toolNumberMap: { ...mp.toolNumberMap, [tool.toolId]: toolNumber },
  };
}

/**
 * Get tool numbers as array for PostContext.
 */
export function getToolIds(mp: MachineProfile): string[] {
  return Object.keys(mp.toolNumberMap).sort(
    (a, b) => mp.toolNumberMap[a] - mp.toolNumberMap[b]
  );
}
