/**
 * conservativePolicy.ts - Conservative Drilling Policy
 *
 * Production-safe baseline policy optimized for reliability over speed.
 * Deterministic cycle selection based on hole kind and material class.
 *
 * @version 1.0.0 - Phase D5-A
 */

import type { MaterialClass, MaterialHint } from './materialTypes';
import type {
  DrillPolicy,
  DrillPolicyConfig,
  DrillParameters,
  CycleSelectionResult,
  HoleSpec,
  CycleType,
} from './drillPolicyTypes';
import { classifyHoleKind, isDeepHole } from './drillPolicyTypes';

// ============================================
// CONSERVATIVE POLICY CONFIGURATION
// ============================================

/**
 * Conservative policy configuration.
 *
 * Feed/Speed Table (MDF baseline):
 * | Diameter | RPM    | Feed (mm/min) |
 * |----------|--------|---------------|
 * | 5mm      | 6000   | 1200          |
 * | 8mm      | 5000   | 1000          |
 * | 15mm     | 3500   | 800           |
 * | 35mm     | 2500   | 500           |
 *
 * Cycle Rules:
 * - G83 peck for depth/diameter > 3
 * - G82 dwell for 35mm hinge cups (chip clearing)
 * - G81 for everything else
 */
const CONSERVATIVE_CONFIG: DrillPolicyConfig = {
  id: 'conservative-v1',
  name: 'Conservative Production Policy',
  version: '1.0.0',

  feedSpeedTable: [
    { diameter: 5, baseRpm: 6000, baseFeed: 1200 },
    { diameter: 8, baseRpm: 5000, baseFeed: 1000 },
    { diameter: 10, baseRpm: 4500, baseFeed: 900 },
    { diameter: 15, baseRpm: 3500, baseFeed: 800 },
    { diameter: 20, baseRpm: 3000, baseFeed: 700 },
    { diameter: 25, baseRpm: 2800, baseFeed: 600 },
    { diameter: 35, baseRpm: 2500, baseFeed: 500 },
  ],

  cycleRules: {
    peckThreshold: 3, // depth/diameter > 3 triggers peck
    dwellDiameters: [35], // 35mm hinge cup gets dwell
    dwellTime: 0.3, // 300ms dwell
    peckDepthRatio: 1.5, // peck depth = 1.5 * diameter
    peckRetract: 2, // 2mm retract between pecks
  },

  materialMultipliers: {
    MDF: { feedMultiplier: 1.0, rpmMultiplier: 1.0 },
    MELAMINE: { feedMultiplier: 0.9, rpmMultiplier: 1.1 },
    PLYWOOD: { feedMultiplier: 0.85, rpmMultiplier: 1.0 },
    HPL: { feedMultiplier: 0.7, rpmMultiplier: 1.2 },
    HMR: { feedMultiplier: 0.95, rpmMultiplier: 1.0 },
    UNKNOWN: { feedMultiplier: 0.7, rpmMultiplier: 0.9 }, // Very conservative
  },
};

// ============================================
// POLICY IMPLEMENTATION
// ============================================

/**
 * Create a conservative drilling policy from config.
 */
function createConservativePolicy(config: DrillPolicyConfig): DrillPolicy {
  return {
    id: config.id,
    name: config.name,
    version: config.version,

    selectCycle(hole: HoleSpec, material: MaterialHint): CycleSelectionResult {
      const holeKind = classifyHoleKind(hole);

      // Rule 1: 35mm hinge cup always gets G82 (dwell for chip clearing)
      if (config.cycleRules.dwellDiameters.includes(hole.diameter)) {
        return {
          cycle: 'G82',
          reason: `${hole.diameter}mm diameter requires dwell cycle`,
          holeKind,
        };
      }

      // Rule 2: Hinge cup by kind (even if diameter slightly off)
      if (holeKind === 'HINGE_CUP') {
        return {
          cycle: 'G82',
          reason: 'Hinge cup requires dwell for chip clearing',
          holeKind,
        };
      }

      // Rule 3: Deep holes get peck drilling
      if (isDeepHole(hole, config.cycleRules.peckThreshold)) {
        return {
          cycle: 'G83',
          reason: `Deep hole (depth/dia = ${(hole.depth / hole.diameter).toFixed(1)} > ${config.cycleRules.peckThreshold})`,
          holeKind,
        };
      }

      // Rule 4: Through holes in hard materials get peck
      if (holeKind === 'THROUGH' && (material.class === 'HPL' || material.class === 'PLYWOOD')) {
        return {
          cycle: 'G83',
          reason: `Through-hole in ${material.class} requires peck for clean exit`,
          holeKind,
        };
      }

      // Default: Simple drill cycle
      return {
        cycle: 'G81',
        reason: 'Standard hole - simple drill cycle',
        holeKind,
      };
    },

    getParameters(hole: HoleSpec, material: MaterialHint): DrillParameters {
      // Get base feed/speed from table (interpolate if needed)
      const baseParams = interpolateFeedSpeed(hole.diameter, config.feedSpeedTable);

      // Apply material multipliers
      const multipliers = config.materialMultipliers[material.class];
      const rpm = Math.round(baseParams.rpm * multipliers.rpmMultiplier);
      const feedRate = Math.round(baseParams.feed * multipliers.feedMultiplier);

      // Select cycle
      const cycleResult = this.selectCycle(hole, material);
      const cycle = cycleResult.cycle;

      // Build parameters based on cycle
      const params: DrillParameters = {
        cycle,
        rpm,
        feedRate,
      };

      // Add cycle-specific parameters
      if (cycle === 'G82') {
        return {
          ...params,
          dwellTime: config.cycleRules.dwellTime,
        };
      }

      if (cycle === 'G83') {
        return {
          ...params,
          peckDepth: Math.round(hole.diameter * config.cycleRules.peckDepthRatio * 10) / 10,
          retract: config.cycleRules.peckRetract,
        };
      }

      return params;
    },

    validate(hole: HoleSpec): string[] {
      const errors: string[] = [];

      if (hole.diameter <= 0) {
        errors.push('Diameter must be positive');
      }
      if (hole.depth <= 0) {
        errors.push('Depth must be positive');
      }
      if (hole.panelThickness <= 0) {
        errors.push('Panel thickness must be positive');
      }
      if (hole.depth > hole.panelThickness + 1) {
        errors.push(`Depth (${hole.depth}mm) exceeds panel thickness (${hole.panelThickness}mm)`);
      }
      if (hole.diameter > 50) {
        errors.push('Diameter exceeds maximum supported (50mm)');
      }

      return errors;
    },
  };
}

/**
 * Interpolate feed/speed from table based on diameter.
 */
function interpolateFeedSpeed(
  diameter: number,
  table: readonly { diameter: number; baseRpm: number; baseFeed: number }[]
): { rpm: number; feed: number } {
  // Find bracketing entries
  let lower = table[0];
  let upper = table[table.length - 1];

  for (let i = 0; i < table.length - 1; i++) {
    if (table[i].diameter <= diameter && table[i + 1].diameter >= diameter) {
      lower = table[i];
      upper = table[i + 1];
      break;
    }
  }

  // Exact match or out of range
  if (diameter <= lower.diameter) {
    return { rpm: lower.baseRpm, feed: lower.baseFeed };
  }
  if (diameter >= upper.diameter) {
    return { rpm: upper.baseRpm, feed: upper.baseFeed };
  }

  // Linear interpolation
  const t = (diameter - lower.diameter) / (upper.diameter - lower.diameter);
  return {
    rpm: Math.round(lower.baseRpm + t * (upper.baseRpm - lower.baseRpm)),
    feed: Math.round(lower.baseFeed + t * (upper.baseFeed - lower.baseFeed)),
  };
}

// ============================================
// EXPORTS
// ============================================

/**
 * Conservative drilling policy instance.
 * Singleton for consistent behavior across the application.
 */
export const CONSERVATIVE_DRILL_POLICY: DrillPolicy = createConservativePolicy(CONSERVATIVE_CONFIG);

/**
 * Get the conservative policy configuration (for inspection/testing).
 */
export function getConservativePolicyConfig(): DrillPolicyConfig {
  return CONSERVATIVE_CONFIG;
}

/**
 * Create a custom policy based on conservative defaults with overrides.
 */
export function createCustomPolicy(
  overrides: Partial<DrillPolicyConfig>
): DrillPolicy {
  return createConservativePolicy({
    ...CONSERVATIVE_CONFIG,
    ...overrides,
    id: overrides.id || `custom-${Date.now()}`,
    name: overrides.name || 'Custom Policy',
  });
}
