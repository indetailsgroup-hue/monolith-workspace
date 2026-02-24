/**
 * boltBoreDepth.test.ts
 *
 * Regression tests for the sleeveLength vs boltBoreDepth disambiguation.
 *
 * Background:
 * - sleeveLength = 14.25mm (physical sleeve cylinder length for assembly/3D preview)
 *   B = ballHead/2 (3.25) + neck (6.5) + sleeve (14.25) = 24mm
 * - boltBoreDepth = 17.5mm (bolt hole drilling depth per Häfele S200)
 *
 * The bug: generateDrillMap.ts used `config.sleeveLength` for BOLT point depth.
 * When assembly config (sleeveLength=14.25) was passed, bolt holes were 2.75mm too shallow.
 * Fix: Use `config.boltBoreDepth ?? 17.5` — always falls back to Häfele constant.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MINIFIX_S200_CONFIG } from '../minifixDefaults';
import {
  getMinifixDefaultConfig,
  getMinifixFullConfigForThickness,
} from '../../hardware/minifixDefaults';

// ============================================
// CONSTANTS
// ============================================

/** Häfele S200 bolt drilling depth (manufacturing domain) */
const HAFELE_BOLT_BORE_DEPTH = 17.5;

/** Physical sleeve cylinder length (assembly domain) */
const ASSEMBLY_SLEEVE_LENGTH = 14.25;

// ============================================
// DrillMap defaults (manufacturing domain)
// ============================================

describe('DrillMap DEFAULT_MINIFIX_S200_CONFIG', () => {
  it('should have boltBoreDepth = 17.5mm', () => {
    expect(DEFAULT_MINIFIX_S200_CONFIG.boltBoreDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
  });

  it('should have sleeveLength = 17.5mm (backward compat, drillMap domain)', () => {
    // In the drillMap defaults, sleeveLength was historically 17.5
    // (the manufacturing value). Kept for backward compat.
    expect(DEFAULT_MINIFIX_S200_CONFIG.sleeveLength).toBe(17.5);
  });

  it('should have camDepth = 13.5mm for default 18mm wood', () => {
    expect(DEFAULT_MINIFIX_S200_CONFIG.camDepth).toBe(13.5);
  });
});

// ============================================
// Hardware defaults (assembly domain)
// ============================================

describe('Hardware getMinifixDefaultConfig', () => {
  it('should include boltBoreDepth = 17.5mm for any wood thickness', () => {
    const config18 = getMinifixDefaultConfig(18);
    expect(config18.boltBoreDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
  });

  it('should have sleeveLength = 14.25mm (assembly sleeve length)', () => {
    const config18 = getMinifixDefaultConfig(18);
    expect(config18.sleeveLength).toBe(ASSEMBLY_SLEEVE_LENGTH);
  });

  it('should return correct camDepth per wood thickness', () => {
    expect(getMinifixDefaultConfig(16).camDepth).toBe(12.5);
    expect(getMinifixDefaultConfig(18).camDepth).toBe(13.5);
    expect(getMinifixDefaultConfig(19).camDepth).toBe(14.0);
  });
});

describe('Hardware getMinifixFullConfigForThickness', () => {
  it('should include boltBoreDepth = 17.5mm', () => {
    const full = getMinifixFullConfigForThickness(18);
    expect(full.boltBoreDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
  });

  it('should have sleeveLength = 14.25mm (assembly)', () => {
    const full = getMinifixFullConfigForThickness(18);
    expect(full.sleeveLength).toBe(ASSEMBLY_SLEEVE_LENGTH);
  });

  it('boltBoreDepth and sleeveLength should be different values', () => {
    const full = getMinifixFullConfigForThickness(18);
    expect(full.boltBoreDepth).not.toBe(full.sleeveLength);
    expect(full.boltBoreDepth).toBe(17.5);
    expect(full.sleeveLength).toBe(14.25);
  });
});

// ============================================
// Config merge simulation (the actual bug path)
// ============================================

describe('Config merge: assembly config should NOT corrupt drill depth', () => {
  /**
   * Simulates what generateDrillMap does at line 768:
   *   const fullConfig = { ...DEFAULT_MINIFIX_CONFIG, ...config };
   * Then at line 463 (FIXED):
   *   depth: config.boltBoreDepth ?? 17.5
   */
  const DEFAULT_MINIFIX_CONFIG_DRILL = {
    sleeveLength: 17.5,
    boltBoreDepth: 17.5,
    camDepth: 13.5,
  };

  it('assembly config with sleeveLength=14.25 should NOT affect bolt bore depth', () => {
    // This is the bug scenario: UI/HardwareLibrary config passed to generateDrillMap
    const assemblyConfig = {
      sleeveLength: 14.25,
      boltBoreDepth: 17.5,  // Now explicitly set in all assembly configs
    };

    const merged = { ...DEFAULT_MINIFIX_CONFIG_DRILL, ...assemblyConfig };

    // The FIXED line: config.boltBoreDepth ?? 17.5
    const boltDepth = merged.boltBoreDepth ?? 17.5;
    expect(boltDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
    // sleeveLength is overwritten (14.25) but NOT used for drilling
    expect(merged.sleeveLength).toBe(14.25);
  });

  it('old config WITHOUT boltBoreDepth should fall back to 17.5mm', () => {
    // Legacy config that only has sleeveLength
    const legacyConfig = {
      sleeveLength: 14.25,
      // NO boltBoreDepth field
    };

    const merged = { ...DEFAULT_MINIFIX_CONFIG_DRILL, ...legacyConfig };

    // Even though sleeveLength is wrong, boltBoreDepth from defaults survives
    // because spread only overrides keys that are present in the source
    const boltDepth = merged.boltBoreDepth ?? 17.5;
    expect(boltDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
  });

  it('explicitly undefined boltBoreDepth should fall back to 17.5mm', () => {
    const configWithUndefined = {
      sleeveLength: 14.25,
      boltBoreDepth: undefined as number | undefined,
    };

    const merged = { ...DEFAULT_MINIFIX_CONFIG_DRILL, ...configWithUndefined };

    // undefined ?? 17.5 = 17.5
    const boltDepth = merged.boltBoreDepth ?? 17.5;
    expect(boltDepth).toBe(HAFELE_BOLT_BORE_DEPTH);
  });

  it('CAM depth should still vary by wood thickness after merge', () => {
    const config16mm = { camDepth: 12.5 };
    const merged16 = { ...DEFAULT_MINIFIX_CONFIG_DRILL, ...config16mm };
    expect(merged16.camDepth).toBe(12.5);

    const config19mm = { camDepth: 14.0 };
    const merged19 = { ...DEFAULT_MINIFIX_CONFIG_DRILL, ...config19mm };
    expect(merged19.camDepth).toBe(14.0);
  });
});

// ============================================
// Gate validation constants
// ============================================

describe('Gate G11 constants should distinguish sleeve vs bore', () => {
  // Import inline to avoid test coupling if gate types change
  it('BOLT_SLEEVE_DEPTH (drilling) should be 17.5mm', async () => {
    const { G11_CONSTANTS } = await import('../../../../gate/rules/gateG11_types');
    expect(G11_CONSTANTS.BOLT_SLEEVE_DEPTH).toBe(17.5);
  });

  it('BOLT_SLEEVE_LENGTH (assembly) should be 14.25mm', async () => {
    const { G11_CONSTANTS } = await import('../../../../gate/rules/gateG11_types');
    expect(G11_CONSTANTS.BOLT_SLEEVE_LENGTH).toBe(14.25);
  });

  it('BOLT_SLEEVE_DEPTH should NOT equal BOLT_SLEEVE_LENGTH', async () => {
    const { G11_CONSTANTS } = await import('../../../../gate/rules/gateG11_types');
    expect(G11_CONSTANTS.BOLT_SLEEVE_DEPTH).not.toBe(G11_CONSTANTS.BOLT_SLEEVE_LENGTH);
  });
});
