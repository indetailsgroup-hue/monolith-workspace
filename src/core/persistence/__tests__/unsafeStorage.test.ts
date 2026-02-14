/**
 * unsafeStorage.test.ts - Unit tests for G9 Persistence Boundary
 *
 * Tests the unsafeStorage module which serves as the single choke point
 * for all localStorage access in the application.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  readRaw,
  writeRaw,
  writeJson,
  remove,
  readString,
  readBooleanFlag,
  writeBooleanFlag,
  readTimestamp,
  readValidated,
  readValidatedSafe,
  readWithDefault,
  isPersistenceError,
  isMissingError,
  isSchemaError,
  PersistenceError,
} from '../unsafeStorage';

// Mock localStorage
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mock storage
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);

  // Mock localStorage
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
  });
});

describe('unsafeStorage - G9 Persistence Boundary', () => {
  describe('readRaw / writeRaw', () => {
    it('should read null for non-existent key', () => {
      expect(readRaw('nonexistent')).toBeNull();
    });

    it('should write and read raw string', () => {
      writeRaw('test-key', 'test-value');
      expect(readRaw('test-key')).toBe('test-value');
    });
  });

  describe('writeJson', () => {
    it('should serialize object to JSON', () => {
      writeJson('json-key', { foo: 'bar', num: 42 });
      const raw = readRaw('json-key');
      expect(JSON.parse(raw!)).toEqual({ foo: 'bar', num: 42 });
    });
  });

  describe('remove', () => {
    it('should remove key from storage', () => {
      writeRaw('to-remove', 'value');
      expect(readRaw('to-remove')).toBe('value');
      remove('to-remove');
      expect(readRaw('to-remove')).toBeNull();
    });
  });

  describe('readString / readStringOrDefault', () => {
    it('should read string value', () => {
      writeRaw('str-key', 'hello');
      expect(readString('str-key')).toBe('hello');
    });

    it('should return null for missing key', () => {
      expect(readString('missing')).toBeNull();
    });
  });

  describe('readBooleanFlag / writeBooleanFlag', () => {
    it('should write true as "1"', () => {
      writeBooleanFlag('flag', true);
      expect(readRaw('flag')).toBe('1');
    });

    it('should write false as "0"', () => {
      writeBooleanFlag('flag', false);
      expect(readRaw('flag')).toBe('0');
    });

    it('should read "1" as true', () => {
      writeRaw('flag', '1');
      expect(readBooleanFlag('flag')).toBe(true);
    });

    it('should read "0" as false', () => {
      writeRaw('flag', '0');
      expect(readBooleanFlag('flag')).toBe(false);
    });

    it('should read missing key as false', () => {
      expect(readBooleanFlag('missing')).toBe(false);
    });
  });

  describe('readTimestamp', () => {
    it('should read valid ISO timestamp', () => {
      const ts = '2024-01-15T10:30:00.000Z';
      writeRaw('ts', ts);
      expect(readTimestamp('ts')).toBe(ts);
    });

    it('should return null for invalid timestamp', () => {
      writeRaw('ts', 'not-a-timestamp');
      expect(readTimestamp('ts')).toBeNull();
    });

    it('should return null for missing key', () => {
      expect(readTimestamp('missing')).toBeNull();
    });
  });

  describe('readValidated', () => {
    const TestSchema = z.object({
      name: z.string(),
      count: z.number(),
    });

    it('should validate and return typed data', () => {
      writeJson('valid', { name: 'test', count: 5 });
      const result = readValidated('valid', TestSchema);
      expect(result).toEqual({ name: 'test', count: 5 });
    });

    it('should throw PersistenceError for missing key', () => {
      expect(() => readValidated('missing', TestSchema)).toThrow(PersistenceError);
      try {
        readValidated('missing', TestSchema);
      } catch (e) {
        expect(isPersistenceError(e)).toBe(true);
        expect(isMissingError(e)).toBe(true);
      }
    });

    it('should throw PersistenceError for invalid schema', () => {
      writeJson('invalid', { name: 123, count: 'not-a-number' });
      expect(() => readValidated('invalid', TestSchema)).toThrow(PersistenceError);
      try {
        readValidated('invalid', TestSchema);
      } catch (e) {
        expect(isPersistenceError(e)).toBe(true);
        expect(isSchemaError(e)).toBe(true);
      }
    });
  });

  describe('readValidatedSafe', () => {
    const TestSchema = z.object({
      name: z.string(),
      count: z.number(),
    });

    it('should return ok=true with valid data', () => {
      writeJson('valid', { name: 'test', count: 5 });
      const result = readValidatedSafe('valid', TestSchema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ name: 'test', count: 5 });
      }
    });

    it('should return ok=false for missing key', () => {
      const result = readValidatedSafe('missing', TestSchema);
      expect(result.ok).toBe(false);
    });

    it('should return ok=false with issues for invalid schema', () => {
      writeJson('invalid', { name: 123, count: 'not-a-number' });
      const result = readValidatedSafe('invalid', TestSchema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('readWithDefault', () => {
    const TestSchema = z.object({
      name: z.string(),
    });

    it('should return valid data when present', () => {
      writeJson('valid', { name: 'test' });
      const result = readWithDefault('valid', TestSchema, { name: 'default' });
      expect(result).toEqual({ name: 'test' });
    });

    it('should return default for missing key', () => {
      const result = readWithDefault('missing', TestSchema, { name: 'default' });
      expect(result).toEqual({ name: 'default' });
    });

    it('should return default for invalid schema', () => {
      writeJson('invalid', { name: 123 });
      const result = readWithDefault('invalid', TestSchema, { name: 'default' });
      expect(result).toEqual({ name: 'default' });
    });
  });
});
