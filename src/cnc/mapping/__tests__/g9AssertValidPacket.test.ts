/**
 * g9AssertValidPacket.test.ts - G9 Persistence Gate Tests
 *
 * Tests the G9 invariant: No unvalidated external state enters OperationGraph.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  assertValidatedPacket,
  assertValidatedPacketSafe,
  markPacketAsValidated,
  G9ViolationError,
  G9_ERROR_CODE,
  isG9ViolationError,
  hasG9ViolationCode,
  TRUSTED_MODULES_ALLOWLIST,
} from '../g9AssertValidPacket';
import { buildOperationGraph } from '../buildOperationGraph';
import { KDT_MACHINE } from '../../machine/presets/kdt';
import type { FactoryPacket, PacketManifest, PacketDrillMap, PacketConnectors, PacketCutList, PacketGateResult } from '../../../factory/packet/types';

// ============================================
// TEST FIXTURES
// ============================================

function createValidPacket(): FactoryPacket {
  const manifest: PacketManifest = {
    schema: 'monolith.factory.packet@1.0',
    version: '1.0.0',
    jobId: 'test-job-123',
    projectId: 'test-project',
    createdAt: new Date().toISOString(),
    toolVersion: 'test@1.0.0',
    files: [],
    contentHash: 'abc123def456',
  };

  const drillMap: PacketDrillMap = {
    version: 'drillmap.v1',
    panels: [],
    summary: {
      totalDrills: 0,
      totalBores: 0,
      byPurpose: {},
      byDiameter: {},
    },
    tools: [],
  };

  const connectors: PacketConnectors = {
    version: 'connectors.v1',
    minifix: [],
    summary: {
      totalPairs: 0,
      validPairs: 0,
      warningPairs: 0,
      errorPairs: 0,
    },
  };

  const cutList: PacketCutList = {
    version: 'cutlist.v1',
    rows: [],
    summary: {
      totalRows: 0,
      totalParts: 0,
      byMaterial: {},
    },
  };

  const gateResult: PacketGateResult = {
    version: 'gate.v1',
    policyVersion: '1.0.0',
    passed: true,
    runAt: new Date().toISOString(),
    findings: {
      blockers: [],
      warnings: [],
      info: [],
    },
    summary: {
      blockerCount: 0,
      warningCount: 0,
      infoCount: 0,
    },
  };

  return {
    manifest,
    drillMap,
    connectors,
    cutList,
    gateResult,
  };
}

// ============================================
// G9 BOUNDARY TESTS
// ============================================

describe('G9 Persistence Gate - assertValidatedPacket', () => {
  describe('Valid Packets', () => {
    it('should accept a valid factory packet', () => {
      const packet = createValidPacket();
      const validated = assertValidatedPacket(packet);

      // Should return the same packet with branded type
      expect(validated).toBe(packet);
      expect(validated.manifest.jobId).toBe('test-job-123');
    });

    it('should accept packet with populated drill map', () => {
      const packet = createValidPacket();
      packet.drillMap.panels = [{
        panelId: 'panel-1',
        cabinetId: 'cab-1',
        role: 'LEFT',
        dimensions: [600, 720, 18],
        points: [],
      }];

      const validated = assertValidatedPacket(packet);
      expect(validated.drillMap.panels).toHaveLength(1);
    });
  });

  describe('Invalid Packets - G9 Violation', () => {
    it('should throw G9ViolationError for null packet', () => {
      expect(() => assertValidatedPacket(null)).toThrow(G9ViolationError);
    });

    it('should throw G9ViolationError for non-object packet', () => {
      expect(() => assertValidatedPacket('not an object')).toThrow(G9ViolationError);
      expect(() => assertValidatedPacket(42)).toThrow(G9ViolationError);
      expect(() => assertValidatedPacket([])).toThrow(G9ViolationError);
    });

    it('should throw with MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH code', () => {
      try {
        assertValidatedPacket({});
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(G9ViolationError);
        expect((e as G9ViolationError).code).toBe(G9_ERROR_CODE);
        expect(hasG9ViolationCode(e)).toBe(true);
      }
    });

    it('should throw for missing manifest', () => {
      const packet = { drillMap: {}, connectors: {}, cutList: {}, gateResult: {} };
      expect(() => assertValidatedPacket(packet)).toThrow(G9ViolationError);
    });

    it('should throw for invalid manifest.jobId', () => {
      const packet = createValidPacket();
      (packet.manifest as unknown as Record<string, unknown>).jobId = null;

      expect(() => assertValidatedPacket(packet)).toThrow(G9ViolationError);
    });

    it('should throw for missing drillMap', () => {
      const packet = createValidPacket();
      (packet as unknown as Record<string, unknown>).drillMap = null;

      expect(() => assertValidatedPacket(packet)).toThrow(G9ViolationError);
    });

    it('should throw for invalid drillMap.panels', () => {
      const packet = createValidPacket();
      (packet.drillMap as unknown as Record<string, unknown>).panels = 'not an array';

      expect(() => assertValidatedPacket(packet)).toThrow(G9ViolationError);
    });

    it('should include source in error message', () => {
      try {
        assertValidatedPacket({}, 'file:untrusted.json');
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as G9ViolationError).message).toContain('file:untrusted.json');
      }
    });
  });

  describe('Safe Assertion Variant', () => {
    it('should return ok=true for valid packet', () => {
      const packet = createValidPacket();
      const result = assertValidatedPacketSafe(packet);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.packet.manifest.jobId).toBe('test-job-123');
      }
    });

    it('should return ok=false for invalid packet', () => {
      const result = assertValidatedPacketSafe({ broken: true });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.error).toBeInstanceOf(G9ViolationError);
      }
    });
  });
});

// ============================================
// TRUSTED PATH TESTS
// ============================================

describe('G9 Trusted Path - markPacketAsValidated', () => {
  it('should brand packet without validation (trusted path)', () => {
    const packet = createValidPacket();
    const validated = markPacketAsValidated(packet);

    // Should return the same packet with branded type
    expect(validated).toBe(packet);
  });

  it('should be used for internally-built packets', () => {
    // This test documents the intended usage pattern
    const internalPacket = createValidPacket();
    const validated = markPacketAsValidated(internalPacket);

    // The branded type can now be passed to buildOperationGraph
    expect(validated.manifest.contentHash).toBeTruthy();
  });
});

// ============================================
// TYPE GUARD TESTS
// ============================================

describe('G9 Type Guards', () => {
  it('isG9ViolationError should identify G9 errors', () => {
    const error = new G9ViolationError(['test violation']);
    expect(isG9ViolationError(error)).toBe(true);
  });

  it('isG9ViolationError should return false for other errors', () => {
    const error = new Error('regular error');
    expect(isG9ViolationError(error)).toBe(false);
  });

  it('hasG9ViolationCode should check error code', () => {
    const g9Error = new G9ViolationError(['test']);
    const otherError = new Error('other');

    expect(hasG9ViolationCode(g9Error)).toBe(true);
    expect(hasG9ViolationCode(otherError)).toBe(false);
    expect(hasG9ViolationCode(null)).toBe(false);
  });
});

// ============================================
// INVARIANT ENFORCEMENT TESTS
// ============================================

describe('G9 Invariant: No unvalidated state enters OperationGraph', () => {
  it('should block raw external JSON from reaching manufacturing pipeline', () => {
    // Simulating: const raw = JSON.parse(externalFileContent);
    const rawExternal = {
      manifest: { jobId: '', contentHash: '' },
      drillMap: { panels: 'corrupted' }, // Invalid
    };

    // G9 blocks this at the boundary
    const result = assertValidatedPacketSafe(rawExternal);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.violations.some(v => v.includes('drillMap.panels'))).toBe(true);
    }
  });

  it('should allow internally-built packets via trusted path', () => {
    // Simulating: const { packet } = await buildFactoryPacket(input, context);
    const trustedPacket = createValidPacket();

    // Trusted path marks without validation
    const validated = markPacketAsValidated(trustedPacket);

    // Can now be used in manufacturing pipeline
    expect(validated.manifest.contentHash).toBeTruthy();
  });

  it('should require explicit validation for imported packets', () => {
    // Simulating: const imported = JSON.parse(await fetch('/api/packet'));
    const importedPacket = createValidPacket();

    // Must use assertion for external sources
    const validated = assertValidatedPacket(importedPacket, 'api:import');

    expect(validated.manifest.jobId).toBe('test-job-123');
  });
});

// ============================================
// CANARY TESTS: BYPASS ATTEMPT DETECTION
// ============================================

describe('G9 Canary Tests - Bypass Attempt Detection', () => {
  describe('Runtime guard catches invalid packets', () => {
    it('should throw at runtime even with cast bypass attempt', () => {
      // Simulating developer attempting: rawPacket as unknown as ValidatedFactoryPacket
      const invalidPacket = { notAPacket: true } as unknown as ReturnType<typeof createValidPacket>;

      // Even with the cast, runtime guard should catch it
      expect(() => {
        buildOperationGraph(invalidPacket as never, KDT_MACHINE);
      }).toThrow('MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH');
    });

    it('should throw for null packet cast bypass', () => {
      const nullPacket = null as unknown as ReturnType<typeof createValidPacket>;

      expect(() => {
        buildOperationGraph(nullPacket as never, KDT_MACHINE);
      }).toThrow('MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH');
    });

    it('should throw for empty object cast bypass', () => {
      const emptyPacket = {} as unknown as ReturnType<typeof createValidPacket>;

      expect(() => {
        buildOperationGraph(emptyPacket as never, KDT_MACHINE);
      }).toThrow('MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH');
    });
  });

  describe('Properly validated packets pass runtime guard', () => {
    it('should accept assertValidatedPacket result', () => {
      const packet = createValidPacket();
      const validated = assertValidatedPacket(packet, 'test:canary');

      // Should not throw
      const result = buildOperationGraph(validated, KDT_MACHINE);
      expect(result.graph).toBeDefined();
    });

    it('should accept markPacketAsValidated result from trusted path', () => {
      const packet = createValidPacket();
      const validated = markPacketAsValidated(packet, 'test:fixture');

      // Should not throw
      const result = buildOperationGraph(validated, KDT_MACHINE);
      expect(result.graph).toBeDefined();
    });
  });

  describe('Source tracking for audit trail', () => {
    it('markPacketAsValidated should accept source parameter', () => {
      const packet = createValidPacket();

      // Should accept trusted source
      const validated = markPacketAsValidated(packet, 'internal:buildFactoryPacket');
      expect(validated).toBe(packet);
    });

    it('assertValidatedPacket should track source in error', () => {
      const invalidPacket = { broken: true };

      try {
        assertValidatedPacket(invalidPacket, 'external:suspicious-file.json');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(isG9ViolationError(e)).toBe(true);
        expect((e as Error).message).toContain('external:suspicious-file.json');
      }
    });
  });
});

// ============================================
// TRUSTED MODULES ALLOWLIST TESTS
// ============================================

describe('G9 Trusted Modules Allowlist', () => {
  it('should export TRUSTED_MODULES_ALLOWLIST', () => {
    expect(TRUSTED_MODULES_ALLOWLIST).toBeDefined();
    expect(Array.isArray(TRUSTED_MODULES_ALLOWLIST)).toBe(true);
  });

  it('should include factory/packet/buildFactoryPacket.ts', () => {
    expect(TRUSTED_MODULES_ALLOWLIST.some(p => p.includes('buildFactoryPacket'))).toBe(true);
  });

  it('should include factory/cnc/generateGcodeForJob.ts', () => {
    expect(TRUSTED_MODULES_ALLOWLIST.some(p => p.includes('generateGcodeForJob'))).toBe(true);
  });

  it('should include test files', () => {
    expect(TRUSTED_MODULES_ALLOWLIST.some(p => p.includes('__tests__'))).toBe(true);
    expect(TRUSTED_MODULES_ALLOWLIST.some(p => p.includes('.test.ts'))).toBe(true);
  });
});
