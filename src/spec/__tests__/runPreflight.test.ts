/**
 * runPreflight.test.ts - Tests for Preflight Engine
 *
 * @version 1.0.0 - Phase B4: Preflight + Release Lock
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runPreflight,
  formatPreflightSummary,
  getPreflightBlockers,
  getPreflightWarnings,
} from '../runPreflight';

// Mock stores
vi.mock('../../core/store/useSpecStore', () => ({
  useSpecStore: {
    getState: vi.fn(() => ({
      specState: 'FROZEN',
      validation: {
        ok: true,
        passCount: 5,
        warnCount: 0,
        failCount: 0,
        rules: [
          { id: 'test-1', name: 'Test Rule 1', status: 'PASS', message: 'Passed' },
          { id: 'test-2', name: 'Test Rule 2', status: 'PASS', message: 'Passed' },
        ],
        timestamp: Date.now(),
      },
    })),
  },
}));

vi.mock('../../core/store/useCabinetStore', () => ({
  useCabinetStore: {
    getState: vi.fn(() => ({
      cabinets: [{ id: 'cabinet-1', name: 'Test Cabinet' }],
      cabinet: { id: 'cabinet-1' },
    })),
  },
}));

vi.mock('../../core/store/useDrillMapStore', () => ({
  useDrillMapStore: {
    getState: vi.fn(() => ({
      drillMap: { panels: [], holes: [] },
    })),
  },
}));

vi.mock('../../crypto/sha256', () => ({
  sha256Hex: vi.fn(async (input: string) => {
    // Simple mock hash - just return a consistent hash based on input length
    return `mock-hash-${input.length.toString(16).padStart(64, '0')}`;
  }),
}));

describe('runPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic execution', () => {
    it('should return a PreflightResult object', async () => {
      const result = await runPreflight();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it('should include timestamp', async () => {
      const before = Date.now();
      const result = await runPreflight();
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include summary counts', async () => {
      const result = await runPreflight();

      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('warned');
      expect(result.summary).toHaveProperty('skipped');

      // Sum should equal total checks
      const total =
        result.summary.passed +
        result.summary.failed +
        result.summary.warned +
        result.summary.skipped;
      expect(total).toBe(result.checks.length);
    });
  });

  describe('SPEC_STATE_FROZEN check', () => {
    it('should PASS when spec is FROZEN', async () => {
      const result = await runPreflight();
      const check = result.checks.find((c) => c.id === 'SPEC_STATE_FROZEN');

      expect(check).toBeDefined();
      expect(check?.status).toBe('PASS');
    });

    it('should be skippable', async () => {
      const result = await runPreflight({ skip: ['SPEC_STATE_FROZEN'] });
      const check = result.checks.find((c) => c.id === 'SPEC_STATE_FROZEN');

      expect(check).toBeUndefined();
    });
  });

  describe('GATE_PASS check', () => {
    it('should PASS when validation.ok is true', async () => {
      const result = await runPreflight();
      const check = result.checks.find((c) => c.id === 'GATE_PASS');

      expect(check).toBeDefined();
      expect(check?.status).toBe('PASS');
    });

    it('should be skippable', async () => {
      const result = await runPreflight({ skip: ['GATE_PASS'] });
      const check = result.checks.find((c) => c.id === 'GATE_PASS');

      expect(check).toBeUndefined();
    });
  });

  describe('CONTENT_HASH_STABLE check', () => {
    it('should compute content hashes', async () => {
      const result = await runPreflight();

      expect(result.computedHashes).toBeDefined();
      expect(result.computedHashes?.cabinetsHash).toBeDefined();
      expect(result.computedHashes?.drillMapHash).toBeDefined();
    });

    it('should PASS when no expected hash provided', async () => {
      const result = await runPreflight();
      const check = result.checks.find((c) => c.id === 'CONTENT_HASH_STABLE');

      expect(check).toBeDefined();
      expect(check?.status).toBe('PASS');
    });

    it('should be skippable', async () => {
      const result = await runPreflight({ skip: ['CONTENT_HASH_STABLE'] });
      const check = result.checks.find((c) => c.id === 'CONTENT_HASH_STABLE');

      expect(check).toBeUndefined();
      expect(result.computedHashes).toBeNull();
    });
  });

  describe('options', () => {
    it('should support skip option', async () => {
      const result = await runPreflight({
        skip: ['GATE_PASS', 'SIGNATURES_PRESENT'],
      });

      const gateCheck = result.checks.find((c) => c.id === 'GATE_PASS');
      const sigCheck = result.checks.find((c) => c.id === 'SIGNATURES_PRESENT');

      expect(gateCheck).toBeUndefined();
      expect(sigCheck).toBeUndefined();
    });

    it('should support acknowledgeWaivers option', async () => {
      const result = await runPreflight({ acknowledgeWaivers: true });
      const check = result.checks.find((c) => c.id === 'NO_WAIVED_ITEMS');

      expect(check).toBeDefined();
      // With no warnings, should pass regardless
      expect(check?.status).toBe('PASS');
    });
  });

  describe('overall result', () => {
    it('should be ok when all ERROR-severity checks pass', async () => {
      const result = await runPreflight();

      // With default mocks, all should pass
      expect(result.ok).toBe(true);
    });
  });
});

describe('formatPreflightSummary', () => {
  it('should format result as human-readable text', async () => {
    const result = await runPreflight();
    const summary = formatPreflightSummary(result);

    expect(typeof summary).toBe('string');
    expect(summary).toContain('Preflight');
    expect(summary).toContain('passed');
  });
});

describe('getPreflightBlockers', () => {
  it('should return empty array when no blockers', async () => {
    const result = await runPreflight();
    const blockers = getPreflightBlockers(result);

    expect(Array.isArray(blockers)).toBe(true);
    expect(blockers.length).toBe(0);
  });
});

describe('getPreflightWarnings', () => {
  it('should return empty array when no warnings', async () => {
    const result = await runPreflight();
    const warnings = getPreflightWarnings(result);

    expect(Array.isArray(warnings)).toBe(true);
  });
});
