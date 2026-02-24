/**
 * cncCacheKey.test.ts - Tests for CNC Cache Key Generation
 *
 * @version 1.0.0 - Phase D3.2
 */

import { describe, it, expect } from 'vitest';
import {
  generateCncCacheKey,
  generateCncCacheKeyFromPost,
  isValidCncCacheKey,
  getShortCacheKey,
  type CncCacheKeyInput,
} from '../cncCacheKey';
import { CNC_POST_VERSION } from '../../bundle/cncManifest';

// ============================================================================
// Cache Key Generation Tests
// ============================================================================

describe('generateCncCacheKey', () => {
  it('should generate a valid SHA-256 hex key', async () => {
    const input: CncCacheKeyInput = {
      packetContentHash: 'abc123def456',
      machineId: 'KDT',
      dialect: 'FANUC',
    };

    const result = await generateCncCacheKey(input);

    expect(result.key).toMatch(/^[a-f0-9]{64}$/);
    expect(result.components.packetContentHash).toBe('abc123def456');
    expect(result.components.machineId).toBe('KDT');
    expect(result.components.post.dialect).toBe('FANUC');
    expect(result.components.post.postVersion).toBe(CNC_POST_VERSION);
  });

  it('should use default post version when not specified', async () => {
    const input: CncCacheKeyInput = {
      packetContentHash: 'hash1',
      machineId: 'KDT',
      dialect: 'FANUC',
    };

    const result = await generateCncCacheKey(input);

    expect(result.components.post.postVersion).toBe(CNC_POST_VERSION);
  });

  it('should use custom post version when specified', async () => {
    const input: CncCacheKeyInput = {
      packetContentHash: 'hash1',
      machineId: 'KDT',
      dialect: 'FANUC',
      postVersion: '2.0.0',
    };

    const result = await generateCncCacheKey(input);

    expect(result.components.post.postVersion).toBe('2.0.0');
  });

  it('should generate same key for same input (deterministic)', async () => {
    const input: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'FANUC',
      postVersion: '1.0.0',
    };

    const result1 = await generateCncCacheKey(input);
    const result2 = await generateCncCacheKey(input);

    expect(result1.key).toBe(result2.key);
    expect(result1.components).toEqual(result2.components);
  });

  it('should generate different keys for different packet hashes', async () => {
    const input1: CncCacheKeyInput = {
      packetContentHash: 'hash-A',
      machineId: 'KDT',
      dialect: 'FANUC',
    };
    const input2: CncCacheKeyInput = {
      packetContentHash: 'hash-B',
      machineId: 'KDT',
      dialect: 'FANUC',
    };

    const result1 = await generateCncCacheKey(input1);
    const result2 = await generateCncCacheKey(input2);

    expect(result1.key).not.toBe(result2.key);
  });

  it('should generate different keys for different machines', async () => {
    const input1: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'FANUC',
    };
    const input2: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'BIESSE',
      dialect: 'BIESSE_ISO',
    };

    const result1 = await generateCncCacheKey(input1);
    const result2 = await generateCncCacheKey(input2);

    expect(result1.key).not.toBe(result2.key);
  });

  it('should generate different keys for different dialects', async () => {
    const input1: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'FANUC',
    };
    const input2: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'BIESSE_ISO',
    };

    const result1 = await generateCncCacheKey(input1);
    const result2 = await generateCncCacheKey(input2);

    expect(result1.key).not.toBe(result2.key);
  });

  it('should generate different keys for different post versions', async () => {
    const input1: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'FANUC',
      postVersion: '1.0.0',
    };
    const input2: CncCacheKeyInput = {
      packetContentHash: 'same-hash',
      machineId: 'KDT',
      dialect: 'FANUC',
      postVersion: '2.0.0',
    };

    const result1 = await generateCncCacheKey(input1);
    const result2 = await generateCncCacheKey(input2);

    expect(result1.key).not.toBe(result2.key);
  });
});

describe('generateCncCacheKeyFromPost', () => {
  it('should generate key from post identity object', async () => {
    const key = await generateCncCacheKeyFromPost(
      'packet-hash',
      'KDT',
      { dialect: 'FANUC', postVersion: '1.0.0' }
    );

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should match generateCncCacheKey output', async () => {
    const packetContentHash = 'test-hash';
    const machineId = 'KDT';
    const post = { dialect: 'FANUC' as const, postVersion: '1.0.0' };

    const key1 = await generateCncCacheKeyFromPost(packetContentHash, machineId, post);
    const result2 = await generateCncCacheKey({
      packetContentHash,
      machineId,
      dialect: post.dialect,
      postVersion: post.postVersion,
    });

    expect(key1).toBe(result2.key);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('isValidCncCacheKey', () => {
  it('should validate correct SHA-256 hex strings', () => {
    const validKey = 'a'.repeat(64);
    expect(isValidCncCacheKey(validKey)).toBe(true);
  });

  it('should accept mixed case hex chars', () => {
    const mixedKey = 'abcdef0123456789'.repeat(4);
    expect(isValidCncCacheKey(mixedKey)).toBe(true);
  });

  it('should reject too short strings', () => {
    expect(isValidCncCacheKey('abc')).toBe(false);
    expect(isValidCncCacheKey('a'.repeat(63))).toBe(false);
  });

  it('should reject too long strings', () => {
    expect(isValidCncCacheKey('a'.repeat(65))).toBe(false);
  });

  it('should reject non-hex characters', () => {
    const invalidKey = 'g'.repeat(64);
    expect(isValidCncCacheKey(invalidKey)).toBe(false);
  });

  it('should reject uppercase hex (we use lowercase)', () => {
    const uppercaseKey = 'A'.repeat(64);
    expect(isValidCncCacheKey(uppercaseKey)).toBe(false);
  });

  it('should reject non-string inputs', () => {
    expect(isValidCncCacheKey(null)).toBe(false);
    expect(isValidCncCacheKey(undefined)).toBe(false);
    expect(isValidCncCacheKey(123)).toBe(false);
    expect(isValidCncCacheKey({})).toBe(false);
    expect(isValidCncCacheKey([])).toBe(false);
  });
});

describe('getShortCacheKey', () => {
  it('should return first 8 characters', () => {
    const key = 'abcd1234' + '0'.repeat(56);
    expect(getShortCacheKey(key)).toBe('abcd1234');
  });

  it('should handle keys shorter than 8 chars', () => {
    expect(getShortCacheKey('abc')).toBe('abc');
  });
});
