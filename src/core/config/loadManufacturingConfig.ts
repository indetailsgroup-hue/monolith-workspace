/**
 * Manufacturing Constants Config Loader
 *
 * Loads manufacturing constants from JSON config with runtime validation.
 * Falls back to hardcoded defaults if loading or validation fails.
 *
 * The JSON config is imported at build time (Vite handles JSON imports).
 */

import type {
  MaterialComposition,
  BackPanelConfig,
  EdgeConfig,
  PreMillConfig,
} from '../engines/ManufacturingCalculator';

import rawConfig from './manufacturing-constants.json';

// ============================================
// CONFIG SHAPE (matches JSON structure)
// ============================================

export interface ManufacturingConfig {
  version: string;
  backPanel: {
    defaultConstruction: 'inset' | 'overlay';
    thickness: number;
    grooveOffset: number;
  };
  edgeBanding: {
    defaultEdges: EdgeConfig;
    defaultPreMill: PreMillConfig;
  };
  safetyGap: {
    default: number;
  };
  shelf: {
    defaultFrontSetback: number;
    defaultSideClearance: number;
  };
  compositions: Record<string, MaterialComposition>;
}

// ============================================
// HARDCODED DEFAULTS (fallback)
// ============================================

const HARDCODED_DEFAULTS: ManufacturingConfig = {
  version: '1.0.0',
  backPanel: {
    defaultConstruction: 'inset',
    thickness: 6,
    grooveOffset: 20,
  },
  edgeBanding: {
    defaultEdges: {
      top: 1,
      bottom: 0,
      left: 0,
      right: 0,
    },
    defaultPreMill: {
      top: 0.5,
      bottom: 0.5,
      left: 0.5,
      right: 0.5,
    },
  },
  safetyGap: {
    default: 2,
  },
  shelf: {
    defaultFrontSetback: 20,
    defaultSideClearance: 1,
  },
  compositions: {
    'PB-MEL': {
      coreThickness: 16,
      surfaceAThickness: 0.1,
      surfaceBThickness: 0.1,
      glueThickness: 0,
    },
    'PB-HPL': {
      coreThickness: 16,
      surfaceAThickness: 0.8,
      surfaceBThickness: 0.8,
      glueThickness: 0.1,
    },
    'MDF-HPL': {
      coreThickness: 18,
      surfaceAThickness: 0.8,
      surfaceBThickness: 0.8,
      glueThickness: 0.1,
    },
    'HMR-HPL': {
      coreThickness: 18,
      surfaceAThickness: 0.8,
      surfaceBThickness: 0.8,
      glueThickness: 0.1,
    },
  },
};

// ============================================
// VALIDATION
// ============================================

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function isFourSides(obj: unknown): obj is { top: number; bottom: number; left: number; right: number } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return isNumber(o.top) && isNumber(o.bottom) && isNumber(o.left) && isNumber(o.right);
}

function isMaterialComposition(obj: unknown): obj is MaterialComposition {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    isNumber(o.coreThickness) &&
    isNumber(o.surfaceAThickness) &&
    isNumber(o.surfaceBThickness) &&
    isNumber(o.glueThickness)
  );
}

/**
 * Validates that a loaded config object has all expected keys and correct types.
 * Returns true if valid, false otherwise.
 */
export function validateConfig(config: unknown): config is ManufacturingConfig {
  if (typeof config !== 'object' || config === null) return false;

  const c = config as Record<string, unknown>;

  // version
  if (typeof c.version !== 'string') return false;

  // backPanel
  if (typeof c.backPanel !== 'object' || c.backPanel === null) return false;
  const bp = c.backPanel as Record<string, unknown>;
  if (bp.defaultConstruction !== 'inset' && bp.defaultConstruction !== 'overlay') return false;
  if (!isNumber(bp.thickness)) return false;
  if (!isNumber(bp.grooveOffset)) return false;

  // edgeBanding
  if (typeof c.edgeBanding !== 'object' || c.edgeBanding === null) return false;
  const eb = c.edgeBanding as Record<string, unknown>;
  if (!isFourSides(eb.defaultEdges)) return false;
  if (!isFourSides(eb.defaultPreMill)) return false;

  // safetyGap
  if (typeof c.safetyGap !== 'object' || c.safetyGap === null) return false;
  const sg = c.safetyGap as Record<string, unknown>;
  if (!isNumber(sg.default)) return false;

  // shelf
  if (typeof c.shelf !== 'object' || c.shelf === null) return false;
  const sh = c.shelf as Record<string, unknown>;
  if (!isNumber(sh.defaultFrontSetback)) return false;
  if (!isNumber(sh.defaultSideClearance)) return false;

  // compositions
  if (typeof c.compositions !== 'object' || c.compositions === null) return false;
  const comps = c.compositions as Record<string, unknown>;
  for (const key of Object.keys(comps)) {
    if (!isMaterialComposition(comps[key])) return false;
  }

  return true;
}

// ============================================
// LOADER
// ============================================

let cachedConfig: ManufacturingConfig | null = null;

/**
 * Load and return the manufacturing config.
 *
 * - Uses static JSON import (resolved at build time by Vite)
 * - Validates the structure at runtime
 * - Falls back to hardcoded defaults if validation fails
 * - Caches the result for subsequent calls
 */
export function getManufacturingConfig(): ManufacturingConfig {
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  try {
    // Strip the $schema key before validation (it's not part of our type)
    const { $schema: _schema, ...configData } = rawConfig;

    if (validateConfig(configData)) {
      cachedConfig = configData;
      return cachedConfig;
    }

    console.warn(
      '[ManufacturingConfig] JSON config failed validation, falling back to hardcoded defaults.'
    );
  } catch (err) {
    console.warn(
      '[ManufacturingConfig] Failed to load JSON config, falling back to hardcoded defaults.',
      err
    );
  }

  cachedConfig = HARDCODED_DEFAULTS;
  return cachedConfig;
}

/**
 * Get the hardcoded default config (useful for tests and comparisons).
 */
export function getHardcodedDefaults(): ManufacturingConfig {
  return HARDCODED_DEFAULTS;
}

/**
 * Reset the cached config (useful for testing).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

// ============================================
// CONVENIENCE ACCESSORS
// ============================================

/**
 * Get the default BackPanelConfig from the loaded config.
 */
export function getDefaultBackConfig(): BackPanelConfig {
  const config = getManufacturingConfig();
  return {
    construction: config.backPanel.defaultConstruction,
    thickness: config.backPanel.thickness,
    grooveOffset: config.backPanel.grooveOffset,
  };
}

/**
 * Get the default EdgeConfig from the loaded config.
 */
export function getDefaultEdgeConfig(): EdgeConfig {
  const config = getManufacturingConfig();
  return { ...config.edgeBanding.defaultEdges };
}

/**
 * Get the default PreMillConfig from the loaded config.
 */
export function getDefaultPreMillConfig(): PreMillConfig {
  const config = getManufacturingConfig();
  return { ...config.edgeBanding.defaultPreMill };
}

/**
 * Get all common material compositions from the loaded config.
 */
export function getCompositions(): Record<string, MaterialComposition> {
  const config = getManufacturingConfig();
  return { ...config.compositions };
}
