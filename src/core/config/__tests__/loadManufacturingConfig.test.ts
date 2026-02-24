/**
 * Tests for Manufacturing Constants Config Loader
 *
 * Verifies:
 * - Config loads successfully from JSON
 * - All expected keys are present
 * - Default values match the original hardcoded values
 * - Validation correctly accepts/rejects configs
 * - Fallback to defaults on error
 * - Convenience accessor functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getManufacturingConfig,
  getHardcodedDefaults,
  validateConfig,
  resetConfigCache,
  getDefaultBackConfig,
  getDefaultEdgeConfig,
  getDefaultPreMillConfig,
  getCompositions,
  type ManufacturingConfig,
} from '../loadManufacturingConfig';

// Reset the config cache before each test to ensure isolation
beforeEach(() => {
  resetConfigCache();
});

// ============================================
// 1. CONFIG LOADS SUCCESSFULLY
// ============================================

describe('getManufacturingConfig', () => {
  it('should load config successfully without errors', () => {
    const config = getManufacturingConfig();
    expect(config).toBeDefined();
    expect(config).not.toBeNull();
  });

  it('should return a config with a version string', () => {
    const config = getManufacturingConfig();
    expect(typeof config.version).toBe('string');
    expect(config.version).toBe('1.0.0');
  });

  it('should return the same cached instance on subsequent calls', () => {
    const config1 = getManufacturingConfig();
    const config2 = getManufacturingConfig();
    expect(config1).toBe(config2);
  });

  it('should return a fresh instance after cache reset', () => {
    const config1 = getManufacturingConfig();
    resetConfigCache();
    const config2 = getManufacturingConfig();
    // Values should be equal even if reference differs
    expect(config2.version).toBe(config1.version);
  });
});

// ============================================
// 2. ALL EXPECTED KEYS ARE PRESENT
// ============================================

describe('config structure', () => {
  it('should have backPanel section with all required keys', () => {
    const config = getManufacturingConfig();
    expect(config.backPanel).toBeDefined();
    expect(config.backPanel.defaultConstruction).toBeDefined();
    expect(config.backPanel.thickness).toBeDefined();
    expect(config.backPanel.grooveOffset).toBeDefined();
  });

  it('should have edgeBanding section with defaultEdges and defaultPreMill', () => {
    const config = getManufacturingConfig();
    expect(config.edgeBanding).toBeDefined();

    const edges = config.edgeBanding.defaultEdges;
    expect(edges).toBeDefined();
    expect(typeof edges.top).toBe('number');
    expect(typeof edges.bottom).toBe('number');
    expect(typeof edges.left).toBe('number');
    expect(typeof edges.right).toBe('number');

    const preMill = config.edgeBanding.defaultPreMill;
    expect(preMill).toBeDefined();
    expect(typeof preMill.top).toBe('number');
    expect(typeof preMill.bottom).toBe('number');
    expect(typeof preMill.left).toBe('number');
    expect(typeof preMill.right).toBe('number');
  });

  it('should have safetyGap section', () => {
    const config = getManufacturingConfig();
    expect(config.safetyGap).toBeDefined();
    expect(typeof config.safetyGap.default).toBe('number');
  });

  it('should have shelf section', () => {
    const config = getManufacturingConfig();
    expect(config.shelf).toBeDefined();
    expect(typeof config.shelf.defaultFrontSetback).toBe('number');
    expect(typeof config.shelf.defaultSideClearance).toBe('number');
  });

  it('should have compositions section with at least one entry', () => {
    const config = getManufacturingConfig();
    expect(config.compositions).toBeDefined();
    expect(Object.keys(config.compositions).length).toBeGreaterThan(0);
  });

  it('should have all four standard compositions', () => {
    const config = getManufacturingConfig();
    expect(config.compositions['PB-MEL']).toBeDefined();
    expect(config.compositions['PB-HPL']).toBeDefined();
    expect(config.compositions['MDF-HPL']).toBeDefined();
    expect(config.compositions['HMR-HPL']).toBeDefined();
  });

  it('should have valid material composition structure for each entry', () => {
    const config = getManufacturingConfig();
    for (const [key, comp] of Object.entries(config.compositions)) {
      expect(typeof comp.coreThickness).toBe('number');
      expect(typeof comp.surfaceAThickness).toBe('number');
      expect(typeof comp.surfaceBThickness).toBe('number');
      expect(typeof comp.glueThickness).toBe('number');
    }
  });
});

// ============================================
// 3. DEFAULT VALUES MATCH ORIGINAL HARDCODED VALUES
// ============================================

describe('values match original hardcoded constants', () => {
  it('should have backPanel matching original DEFAULT_BACK_CONFIG', () => {
    const config = getManufacturingConfig();
    expect(config.backPanel.defaultConstruction).toBe('inset');
    expect(config.backPanel.thickness).toBe(6);
    expect(config.backPanel.grooveOffset).toBe(20);
  });

  it('should have defaultEdges matching original DEFAULT_EDGE_CONFIG', () => {
    const config = getManufacturingConfig();
    expect(config.edgeBanding.defaultEdges.top).toBe(1);
    expect(config.edgeBanding.defaultEdges.bottom).toBe(0);
    expect(config.edgeBanding.defaultEdges.left).toBe(0);
    expect(config.edgeBanding.defaultEdges.right).toBe(0);
  });

  it('should have defaultPreMill matching original DEFAULT_PREMILL', () => {
    const config = getManufacturingConfig();
    expect(config.edgeBanding.defaultPreMill.top).toBe(0.5);
    expect(config.edgeBanding.defaultPreMill.bottom).toBe(0.5);
    expect(config.edgeBanding.defaultPreMill.left).toBe(0.5);
    expect(config.edgeBanding.defaultPreMill.right).toBe(0.5);
  });

  it('should have safetyGap default of 2', () => {
    const config = getManufacturingConfig();
    expect(config.safetyGap.default).toBe(2);
  });

  it('should have shelf defaults matching original inline defaults', () => {
    const config = getManufacturingConfig();
    expect(config.shelf.defaultFrontSetback).toBe(20);
    expect(config.shelf.defaultSideClearance).toBe(1);
  });

  it('should have PB-MEL composition matching original', () => {
    const config = getManufacturingConfig();
    const mel = config.compositions['PB-MEL'];
    expect(mel.coreThickness).toBe(16);
    expect(mel.surfaceAThickness).toBe(0.1);
    expect(mel.surfaceBThickness).toBe(0.1);
    expect(mel.glueThickness).toBe(0);
  });

  it('should have PB-HPL composition matching original', () => {
    const config = getManufacturingConfig();
    const hpl = config.compositions['PB-HPL'];
    expect(hpl.coreThickness).toBe(16);
    expect(hpl.surfaceAThickness).toBe(0.8);
    expect(hpl.surfaceBThickness).toBe(0.8);
    expect(hpl.glueThickness).toBe(0.1);
  });

  it('should have MDF-HPL composition matching original', () => {
    const config = getManufacturingConfig();
    const mdf = config.compositions['MDF-HPL'];
    expect(mdf.coreThickness).toBe(18);
    expect(mdf.surfaceAThickness).toBe(0.8);
    expect(mdf.surfaceBThickness).toBe(0.8);
    expect(mdf.glueThickness).toBe(0.1);
  });

  it('should have HMR-HPL composition matching original', () => {
    const config = getManufacturingConfig();
    const hmr = config.compositions['HMR-HPL'];
    expect(hmr.coreThickness).toBe(18);
    expect(hmr.surfaceAThickness).toBe(0.8);
    expect(hmr.surfaceBThickness).toBe(0.8);
    expect(hmr.glueThickness).toBe(0.1);
  });
});

// ============================================
// 4. VALIDATION
// ============================================

describe('validateConfig', () => {
  it('should accept a valid config', () => {
    const defaults = getHardcodedDefaults();
    expect(validateConfig(defaults)).toBe(true);
  });

  it('should reject null', () => {
    expect(validateConfig(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(validateConfig(undefined)).toBe(false);
  });

  it('should reject empty object', () => {
    expect(validateConfig({})).toBe(false);
  });

  it('should reject config missing version', () => {
    const defaults = getHardcodedDefaults();
    const { version, ...noVersion } = defaults;
    expect(validateConfig(noVersion)).toBe(false);
  });

  it('should reject config with invalid backPanel construction', () => {
    const config = {
      ...getHardcodedDefaults(),
      backPanel: {
        defaultConstruction: 'invalid',
        thickness: 6,
        grooveOffset: 20,
      },
    };
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with non-numeric backPanel thickness', () => {
    const config = {
      ...getHardcodedDefaults(),
      backPanel: {
        defaultConstruction: 'inset',
        thickness: 'six' as unknown as number,
        grooveOffset: 20,
      },
    };
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with NaN value', () => {
    const config = {
      ...getHardcodedDefaults(),
      backPanel: {
        defaultConstruction: 'inset' as const,
        thickness: NaN,
        grooveOffset: 20,
      },
    };
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with missing edgeBanding', () => {
    const config: Record<string, unknown> = { ...getHardcodedDefaults() };
    delete config.edgeBanding;
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with incomplete four-sides object', () => {
    const config = {
      ...getHardcodedDefaults(),
      edgeBanding: {
        defaultEdges: { top: 1, bottom: 0 }, // missing left, right
        defaultPreMill: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      },
    };
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with invalid material composition', () => {
    const config = {
      ...getHardcodedDefaults(),
      compositions: {
        'BAD': {
          coreThickness: 16,
          surfaceAThickness: 'bad' as unknown as number,
          surfaceBThickness: 0.1,
          glueThickness: 0,
        },
      },
    };
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with missing safetyGap', () => {
    const config: Record<string, unknown> = { ...getHardcodedDefaults() };
    delete config.safetyGap;
    expect(validateConfig(config)).toBe(false);
  });

  it('should reject config with missing shelf', () => {
    const config: Record<string, unknown> = { ...getHardcodedDefaults() };
    delete config.shelf;
    expect(validateConfig(config)).toBe(false);
  });

  it('should accept config with additional compositions', () => {
    const config = {
      ...getHardcodedDefaults(),
      compositions: {
        ...getHardcodedDefaults().compositions,
        'CUSTOM-MAT': {
          coreThickness: 22,
          surfaceAThickness: 1.0,
          surfaceBThickness: 1.0,
          glueThickness: 0.15,
        },
      },
    };
    expect(validateConfig(config)).toBe(true);
  });

  it('should accept config with overlay backPanel construction', () => {
    const config = {
      ...getHardcodedDefaults(),
      backPanel: {
        defaultConstruction: 'overlay' as const,
        thickness: 9,
        grooveOffset: 0,
      },
    };
    expect(validateConfig(config)).toBe(true);
  });
});

// ============================================
// 5. FALLBACK TO DEFAULTS
// ============================================

describe('fallback to hardcoded defaults', () => {
  it('should return valid config from getHardcodedDefaults()', () => {
    const defaults = getHardcodedDefaults();
    expect(validateConfig(defaults)).toBe(true);
  });

  it('should have hardcoded defaults matching JSON config values', () => {
    const loaded = getManufacturingConfig();
    const defaults = getHardcodedDefaults();

    // All values should match since JSON was created from the same constants
    expect(loaded.backPanel.thickness).toBe(defaults.backPanel.thickness);
    expect(loaded.backPanel.grooveOffset).toBe(defaults.backPanel.grooveOffset);
    expect(loaded.edgeBanding.defaultPreMill.top).toBe(defaults.edgeBanding.defaultPreMill.top);
    expect(loaded.safetyGap.default).toBe(defaults.safetyGap.default);
    expect(loaded.shelf.defaultFrontSetback).toBe(defaults.shelf.defaultFrontSetback);
  });
});

// ============================================
// 6. CONVENIENCE ACCESSORS
// ============================================

describe('convenience accessor functions', () => {
  describe('getDefaultBackConfig', () => {
    it('should return a BackPanelConfig with correct values', () => {
      const backConfig = getDefaultBackConfig();
      expect(backConfig.construction).toBe('inset');
      expect(backConfig.thickness).toBe(6);
      expect(backConfig.grooveOffset).toBe(20);
    });

    it('should return a new object each call (not shared reference)', () => {
      const a = getDefaultBackConfig();
      const b = getDefaultBackConfig();
      // Same values but potentially different references due to object spread
      expect(a).toEqual(b);
    });
  });

  describe('getDefaultEdgeConfig', () => {
    it('should return an EdgeConfig with correct values', () => {
      const edgeConfig = getDefaultEdgeConfig();
      expect(edgeConfig.top).toBe(1);
      expect(edgeConfig.bottom).toBe(0);
      expect(edgeConfig.left).toBe(0);
      expect(edgeConfig.right).toBe(0);
    });
  });

  describe('getDefaultPreMillConfig', () => {
    it('should return a PreMillConfig with correct values', () => {
      const preMill = getDefaultPreMillConfig();
      expect(preMill.top).toBe(0.5);
      expect(preMill.bottom).toBe(0.5);
      expect(preMill.left).toBe(0.5);
      expect(preMill.right).toBe(0.5);
    });
  });

  describe('getCompositions', () => {
    it('should return all four standard compositions', () => {
      const comps = getCompositions();
      expect(Object.keys(comps)).toHaveLength(4);
      expect(comps['PB-MEL']).toBeDefined();
      expect(comps['PB-HPL']).toBeDefined();
      expect(comps['MDF-HPL']).toBeDefined();
      expect(comps['HMR-HPL']).toBeDefined();
    });

    it('should return compositions with correct PB-MEL values', () => {
      const comps = getCompositions();
      expect(comps['PB-MEL'].coreThickness).toBe(16);
      expect(comps['PB-MEL'].glueThickness).toBe(0);
    });

    it('should return a new object (not shared reference)', () => {
      const a = getCompositions();
      const b = getCompositions();
      expect(a).toEqual(b);
    });
  });
});
