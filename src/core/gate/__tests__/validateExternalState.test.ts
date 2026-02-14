/**
 * validateExternalState.test.ts - Tests for Persistence Gate (G9)
 *
 * Tests validate:
 * - Schema validation pass/fail
 * - Structured error messages
 * - JSON parse errors
 * - Safe vs throwing variants
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateExternalState,
  validateExternalStateSafe,
  parseAndValidate,
  parseAndValidateSafe,
  ExternalStateValidationError,
  isValidationError,
} from '../validateExternalState';

// ============================================
// TEST SCHEMAS
// ============================================

const SimpleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  value: z.number().positive(),
});

const NestedSchema = z.object({
  metadata: z.object({
    version: z.string(),
    timestamp: z.number(),
  }),
  items: z.array(z.object({
    id: z.string(),
    count: z.number().int().nonnegative(),
  })),
});

// ============================================
// validateExternalState TESTS
// ============================================

describe('validateExternalState', () => {
  describe('valid data', () => {
    it('should return validated data for valid input', () => {
      const input = { id: 'test-1', name: 'Test', value: 42 };
      const result = validateExternalState(SimpleSchema, input);

      expect(result).toEqual(input);
    });

    it('should handle nested schemas', () => {
      const input = {
        metadata: { version: '1.0', timestamp: Date.now() },
        items: [{ id: 'item-1', count: 5 }],
      };
      const result = validateExternalState(NestedSchema, input);

      expect(result).toEqual(input);
    });

    it('should coerce types when possible', () => {
      const CoercibleSchema = z.object({
        value: z.coerce.number(),
      });
      const input = { value: '123' };
      const result = validateExternalState(CoercibleSchema, input);

      expect(result.value).toBe(123);
    });
  });

  describe('invalid data', () => {
    it('should throw ExternalStateValidationError for invalid input', () => {
      const input = { id: '', name: 'Test', value: -5 };

      expect(() => validateExternalState(SimpleSchema, input)).toThrow(
        ExternalStateValidationError
      );
    });

    it('should include path in error issues', () => {
      const input = { id: 'test', name: 'Test', value: 'not-a-number' };

      try {
        validateExternalState(SimpleSchema, input);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(isValidationError(e)).toBe(true);
        const err = e as ExternalStateValidationError;
        expect(err.issues.some(i => i.path === 'value')).toBe(true);
      }
    });

    it('should include source context in error', () => {
      const input = { id: 'test', value: -1 };

      try {
        validateExternalState(SimpleSchema, input, 'localStorage');
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ExternalStateValidationError;
        expect(err.source).toBe('localStorage');
      }
    });

    it('should handle missing required fields', () => {
      const input = { name: 'Test' };

      try {
        validateExternalState(SimpleSchema, input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ExternalStateValidationError;
        expect(err.issues.some(i => i.path === 'id')).toBe(true);
        expect(err.issues.some(i => i.path === 'value')).toBe(true);
      }
    });

    it('should handle nested validation errors', () => {
      const input = {
        metadata: { version: 123, timestamp: 'invalid' },
        items: [],
      };

      try {
        validateExternalState(NestedSchema, input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ExternalStateValidationError;
        expect(err.issues.some(i => i.path.startsWith('metadata'))).toBe(true);
      }
    });
  });
});

// ============================================
// validateExternalStateSafe TESTS
// ============================================

describe('validateExternalStateSafe', () => {
  it('should return ok: true for valid data', () => {
    const input = { id: 'test-1', name: 'Test', value: 42 };
    const result = validateExternalStateSafe(SimpleSchema, input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(input);
    }
  });

  it('should return ok: false with issues for invalid data', () => {
    const input = { id: '', value: -1 };
    const result = validateExternalStateSafe(SimpleSchema, input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.error).toBeInstanceOf(ExternalStateValidationError);
    }
  });

  it('should not throw', () => {
    const input = { totally: 'wrong', structure: true };

    expect(() => {
      validateExternalStateSafe(SimpleSchema, input);
    }).not.toThrow();
  });
});

// ============================================
// parseAndValidate TESTS
// ============================================

describe('parseAndValidate', () => {
  it('should parse and validate valid JSON', () => {
    const json = JSON.stringify({ id: 'test', name: 'Test', value: 100 });
    const result = parseAndValidate(json, SimpleSchema);

    expect(result.id).toBe('test');
    expect(result.value).toBe(100);
  });

  it('should throw for null input', () => {
    expect(() => parseAndValidate(null, SimpleSchema)).toThrow(
      ExternalStateValidationError
    );
  });

  it('should throw for undefined input', () => {
    expect(() => parseAndValidate(undefined, SimpleSchema)).toThrow(
      ExternalStateValidationError
    );
  });

  it('should throw for invalid JSON', () => {
    const invalidJson = '{ invalid json }';

    expect(() => parseAndValidate(invalidJson, SimpleSchema)).toThrow(
      ExternalStateValidationError
    );
  });

  it('should throw for valid JSON but invalid schema', () => {
    const json = JSON.stringify({ wrong: 'structure' });

    expect(() => parseAndValidate(json, SimpleSchema)).toThrow(
      ExternalStateValidationError
    );
  });

  it('should include source in JSON parse errors', () => {
    try {
      parseAndValidate('not json', SimpleSchema, 'file-import');
      expect.fail('Should have thrown');
    } catch (e) {
      const err = e as ExternalStateValidationError;
      expect(err.source).toBe('file-import');
      expect(err.issues[0].message).toContain('Invalid JSON');
    }
  });
});

// ============================================
// parseAndValidateSafe TESTS
// ============================================

describe('parseAndValidateSafe', () => {
  it('should return ok: true for valid JSON and schema', () => {
    const json = JSON.stringify({ id: 'test', name: 'Test', value: 50 });
    const result = parseAndValidateSafe(json, SimpleSchema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toBe(50);
    }
  });

  it('should return ok: false for null', () => {
    const result = parseAndValidateSafe(null, SimpleSchema);

    expect(result.ok).toBe(false);
  });

  it('should return ok: false for invalid JSON', () => {
    const result = parseAndValidateSafe('{ bad }', SimpleSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].message).toContain('Invalid JSON');
    }
  });

  it('should return ok: false for schema mismatch', () => {
    const json = JSON.stringify({ different: 'structure' });
    const result = parseAndValidateSafe(json, SimpleSchema);

    expect(result.ok).toBe(false);
  });

  it('should never throw', () => {
    expect(() => parseAndValidateSafe(null, SimpleSchema)).not.toThrow();
    expect(() => parseAndValidateSafe('bad json', SimpleSchema)).not.toThrow();
    expect(() => parseAndValidateSafe('{}', SimpleSchema)).not.toThrow();
  });
});

// ============================================
// isValidationError TESTS
// ============================================

describe('isValidationError', () => {
  it('should return true for ExternalStateValidationError', () => {
    const error = new ExternalStateValidationError([
      { path: 'test', message: 'test error' },
    ]);

    expect(isValidationError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('regular error');

    expect(isValidationError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isValidationError(null)).toBe(false);
    expect(isValidationError(undefined)).toBe(false);
    expect(isValidationError('string')).toBe(false);
    expect(isValidationError({ issues: [] })).toBe(false);
  });
});

// ============================================
// ExternalStateValidationError TESTS
// ============================================

describe('ExternalStateValidationError', () => {
  it('should have proper name', () => {
    const error = new ExternalStateValidationError([]);
    expect(error.name).toBe('ExternalStateValidationError');
  });

  it('should include issues in message', () => {
    const error = new ExternalStateValidationError([
      { path: 'foo.bar', message: 'required' },
      { path: 'baz', message: 'invalid' },
    ]);

    expect(error.message).toContain('2 issue');
    expect(error.message).toContain('foo.bar');
  });

  it('should preserve zodError if provided', () => {
    const zodError = new z.ZodError([]);
    const error = new ExternalStateValidationError([], { zodError });

    expect(error.zodError).toBe(zodError);
  });

  it('should be instanceof Error', () => {
    const error = new ExternalStateValidationError([]);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExternalStateValidationError);
  });
});

// ============================================
// INTEGRATION: Simulated Real-World Scenarios
// ============================================

describe('Real-world scenarios', () => {
  const ProjectSchema = z.object({
    metadata: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      version: z.string(),
    }),
    cabinet: z.object({
      id: z.string(),
      dimensions: z.object({
        width: z.number().positive(),
        height: z.number().positive(),
        depth: z.number().positive(),
      }),
    }).optional(),
  });

  it('G9.1: Import corrupted JSON → structured errors (no crash)', () => {
    const corruptedProject = {
      metadata: {
        id: '', // Empty - invalid
        name: 123, // Wrong type
        // version missing
      },
      cabinet: {
        id: 'cab-1',
        dimensions: {
          width: -100, // Negative - invalid
          height: 720,
          depth: 'deep', // Wrong type
        },
      },
    };

    const result = validateExternalStateSafe(ProjectSchema, corruptedProject);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should have multiple structured errors
      expect(result.issues.length).toBeGreaterThan(2);
      // Errors should have paths
      expect(result.issues.every(i => i.path.length > 0)).toBe(true);
      // Should not crash - we got here
    }
  });

  it('G9.2: localStorage corrupted → recoverable with errors', () => {
    // Simulate corrupted localStorage data
    const corruptedJson = '{"metadata":{"id":"test"},"cabinet":null}';

    // Safe parse should not throw
    const result = parseAndValidateSafe(corruptedJson, ProjectSchema, 'localStorage');

    if (!result.ok) {
      // Can show errors to user
      expect(result.issues.length).toBeGreaterThan(0);
      // Can provide recovery path
      expect(result.error.source).toBe('localStorage');
    }
  });

  it('G9.3: buildManufacturingPacket receives invalid → throws', () => {
    const invalidProject = {
      metadata: { id: 'proj-1' }, // Missing name, version
    };

    // Export path should throw
    expect(() => {
      validateExternalState(ProjectSchema, invalidProject, 'export');
    }).toThrow(ExternalStateValidationError);
  });

  it('Valid project passes validation', () => {
    const validProject = {
      metadata: {
        id: 'proj-123',
        name: 'Kitchen Cabinet',
        version: '1.0.0',
      },
      cabinet: {
        id: 'cab-1',
        dimensions: {
          width: 600,
          height: 720,
          depth: 560,
        },
      },
    };

    const result = validateExternalState(ProjectSchema, validProject);

    expect(result.metadata.id).toBe('proj-123');
    expect(result.cabinet?.dimensions.width).toBe(600);
  });
});
