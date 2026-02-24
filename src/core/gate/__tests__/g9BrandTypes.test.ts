/**
 * g9BrandTypes.test.ts - Tests for G9 Branded Types
 *
 * Verifies:
 * - Branded type creation via validation
 * - Type guards work correctly
 * - Unsafe escape hatches documented
 * - Runtime checks function properly
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateExternalStateBranded,
  validateExternalStateSafeBranded,
  parseAndValidateBranded,
  parseAndValidateSafeBranded,
  unsafeMarkAsValidated,
  stripValidationBrand,
  isValidated,
  type Validated,
} from '../validateExternalState';
import {
  runG9Check,
  g9ToValidationRules,
  getG9Status,
} from '../g9PersistenceGate';

// Test schema
const TestSchema = z.object({
  id: z.string(),
  value: z.number(),
});

type TestData = z.infer<typeof TestSchema>;

describe('G9 Branded Types', () => {
  describe('validateExternalStateBranded', () => {
    it('should return branded type on valid data', () => {
      const raw = { id: 'test', value: 42 };
      const result = validateExternalStateBranded(TestSchema, raw);

      expect(result.id).toBe('test');
      expect(result.value).toBe(42);
      // Runtime check
      expect(isValidated(result)).toBe(true);
    });

    it('should throw on invalid data', () => {
      const raw = { id: 123, value: 'not-a-number' };

      expect(() => {
        validateExternalStateBranded(TestSchema, raw);
      }).toThrow('External state validation failed');
    });
  });

  describe('validateExternalStateSafeBranded', () => {
    it('should return ok:true with branded data on valid input', () => {
      const raw = { id: 'test', value: 42 };
      const result = validateExternalStateSafeBranded(TestSchema, raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe('test');
        expect(isValidated(result.data)).toBe(true);
      }
    });

    it('should return ok:false with issues on invalid input', () => {
      const raw = { id: 123, value: 'not-a-number' };
      const result = validateExternalStateSafeBranded(TestSchema, raw);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('parseAndValidateBranded', () => {
    it('should parse and validate JSON returning branded type', () => {
      const json = JSON.stringify({ id: 'test', value: 42 });
      const result = parseAndValidateBranded(json, TestSchema);

      expect(result.id).toBe('test');
      expect(isValidated(result)).toBe(true);
    });

    it('should throw on malformed JSON', () => {
      expect(() => {
        parseAndValidateBranded('not-json{', TestSchema);
      }).toThrow('External state validation failed');
    });

    it('should throw on null input', () => {
      expect(() => {
        parseAndValidateBranded(null, TestSchema);
      }).toThrow('External state validation failed');
    });
  });

  describe('parseAndValidateSafeBranded', () => {
    it('should parse and validate returning branded result', () => {
      const json = JSON.stringify({ id: 'test', value: 42 });
      const result = parseAndValidateSafeBranded(json, TestSchema);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe('test');
      }
    });

    it('should return ok:false on malformed JSON', () => {
      const result = parseAndValidateSafeBranded('not-json{', TestSchema);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].message).toContain('Invalid JSON');
      }
    });
  });

  describe('unsafeMarkAsValidated', () => {
    it('should mark data as validated without actual validation', () => {
      const raw: TestData = { id: 'unsafe', value: 999 };
      const branded = unsafeMarkAsValidated(raw);

      expect(branded.id).toBe('unsafe');
      expect(isValidated(branded)).toBe(true);
    });
  });

  describe('stripValidationBrand', () => {
    it('should remove validation brand from data', () => {
      const json = JSON.stringify({ id: 'test', value: 42 });
      const branded = parseAndValidateBranded(json, TestSchema);
      const stripped = stripValidationBrand(branded);

      expect(stripped.id).toBe('test');
      // Still an object, but conceptually "unbranded"
      expect(typeof stripped).toBe('object');
    });
  });

  describe('isValidated', () => {
    it('should return true for objects (heuristic)', () => {
      expect(isValidated({ foo: 'bar' })).toBe(true);
      expect(isValidated([1, 2, 3])).toBe(true);
    });

    it('should return false for primitives', () => {
      expect(isValidated(null)).toBe(false);
      expect(isValidated('string')).toBe(false);
      expect(isValidated(123)).toBe(false);
    });
  });
});

describe('G9 Persistence Gate Runtime Checks', () => {
  describe('runG9Check', () => {
    it('should return a G9Result with status', () => {
      const result = runG9Check();

      expect(result.gate).toBe('G9');
      expect(result.name).toBe('G9: Persistence Gate');
      expect(['PASS', 'WARN', 'FAIL']).toContain(result.status);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should have passCount + warnCount + failCount match issues length', () => {
      const result = runG9Check();

      const total = result.passCount + result.warnCount + result.failCount;
      expect(total).toBe(result.issues.length);
    });

    it('should have PASS status when no failures', () => {
      const result = runG9Check();

      if (result.failCount === 0 && result.warnCount === 0) {
        expect(result.status).toBe('PASS');
      }
    });
  });

  describe('g9ToValidationRules', () => {
    it('should return ValidationRule array compatible with useSpecStore', () => {
      const rules = g9ToValidationRules();

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);

      for (const rule of rules) {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('category');
        expect(rule).toHaveProperty('status');
        expect(rule).toHaveProperty('message');
        expect(rule.category).toBe('SAFETY');
        expect(['PASS', 'WARN', 'FAIL']).toContain(rule.status);
      }
    });
  });

  describe('getG9Status', () => {
    it('should return simplified status object', () => {
      const status = getG9Status();

      expect(typeof status.ok).toBe('boolean');
      expect(['PASS', 'WARN', 'FAIL']).toContain(status.status);
      expect(status.summary).toContain('G9');
      expect(typeof status.passCount).toBe('number');
      expect(typeof status.warnCount).toBe('number');
      expect(typeof status.failCount).toBe('number');
    });

    it('should have ok=true when status is PASS', () => {
      const status = getG9Status();

      if (status.status === 'PASS') {
        expect(status.ok).toBe(true);
      }
    });
  });
});
