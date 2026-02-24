/**
 * indexedDbCncStore.test.ts - Tests for CNC IndexedDB Store
 *
 * Tests run in jsdom environment with fake-indexeddb.
 *
 * @vitest-environment jsdom
 * @version 1.0.0 - Phase D3.2
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDbCncStore, _resetCncStore } from '../indexedDbCncStore';
import type { CncManifest } from '../../bundle/cncManifest';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestManifest = (overrides?: Partial<CncManifest>): CncManifest => ({
  schema: 'monolith.cnc.manifest@1.0',
  jobId: 'JOB-12345678',
  machineId: 'KDT',
  packetContentHash: 'packet-hash-abc',
  opGraphHash: 'a'.repeat(64),
  gcodeSha256: 'b'.repeat(64),
  post: {
    dialect: 'FANUC',
    postVersion: '1.0.0',
  },
  createdAt: Date.now(),
  files: [],
  stats: {
    opCount: 10,
    toolChanges: 2,
    estimatedTimeSeconds: 120,
  },
  ...overrides,
});

const createTestZipBytes = (size = 1000): Uint8Array => {
  // Create fake ZIP bytes with magic header
  const bytes = new Uint8Array(size);
  bytes[0] = 0x50; // P
  bytes[1] = 0x4b; // K
  bytes[2] = 0x03;
  bytes[3] = 0x04;
  return bytes;
};

// Helper to compare Uint8Arrays
const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

// ============================================================================
// Store Tests
// ============================================================================

describe('IndexedDbCncStore', () => {
  let store: IndexedDbCncStore;

  beforeEach(() => {
    _resetCncStore();
    store = new IndexedDbCncStore();
  });

  afterEach(async () => {
    try {
      await store.clear();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  // ==========================================================================
  // Basic Operations
  // ==========================================================================

  describe('put and get', () => {
    it('should store and retrieve a bundle', async () => {
      const cacheKey = 'c'.repeat(64);
      const zipBytes = createTestZipBytes();
      const manifest = createTestManifest();

      await store.put(cacheKey, zipBytes, manifest, 'test.zip');

      const result = await store.get(cacheKey);

      expect(result).not.toBeNull();
      expect(result!.metadata.cacheKey).toBe(cacheKey);
      expect(result!.metadata.jobId).toBe('JOB-12345678');
      expect(result!.metadata.machineId).toBe('KDT');
      expect(result!.zipBytes.length).toBe(zipBytes.length);
      expect(arraysEqual(result!.zipBytes, zipBytes)).toBe(true);
    });

    it('should return null for non-existent key', async () => {
      const result = await store.get('nonexistent'.padEnd(64, '0'));
      expect(result).toBeNull();
    });

    it('should store metadata correctly', async () => {
      const cacheKey = 'd'.repeat(64);
      const manifest = createTestManifest({
        jobId: 'MY-JOB',
        machineId: 'BIESSE',
        post: { dialect: 'BIESSE_ISO', postVersion: '2.0.0' },
        stats: { opCount: 50 },
      });

      await store.put(cacheKey, createTestZipBytes(500), manifest, 'bundle.zip');

      const result = await store.get(cacheKey);

      expect(result!.metadata.jobId).toBe('MY-JOB');
      expect(result!.metadata.machineId).toBe('BIESSE');
      expect(result!.metadata.post.dialect).toBe('BIESSE_ISO');
      expect(result!.metadata.post.postVersion).toBe('2.0.0');
      expect(result!.metadata.opCount).toBe(50);
      expect(result!.metadata.bundleBytes).toBe(500);
      expect(result!.metadata.filename).toBe('bundle.zip');
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      const cacheKey = 'e'.repeat(64);
      await store.put(cacheKey, createTestZipBytes(), createTestManifest(), 'test.zip');

      const exists = await store.has(cacheKey);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await store.has('nonexistent'.padEnd(64, '0'));
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata without loading bytes', async () => {
      const cacheKey = 'f'.repeat(64);
      await store.put(cacheKey, createTestZipBytes(5000), createTestManifest(), 'big.zip');

      const metadata = await store.getMetadata(cacheKey);

      expect(metadata).not.toBeNull();
      expect(metadata!.bundleBytes).toBe(5000);
    });

    it('should return null for non-existent key', async () => {
      const metadata = await store.getMetadata('nonexistent'.padEnd(64, '0'));
      expect(metadata).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing bundle', async () => {
      const cacheKey = 'g'.repeat(64);
      await store.put(cacheKey, createTestZipBytes(), createTestManifest(), 'test.zip');

      const deleted = await store.delete(cacheKey);

      expect(deleted).toBe(true);
      expect(await store.has(cacheKey)).toBe(false);
    });

    it('should return false for non-existent key', async () => {
      const deleted = await store.delete('nonexistent'.padEnd(64, '0'));
      expect(deleted).toBe(false);
    });
  });

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  describe('listByJob', () => {
    it('should list bundles for a job', async () => {
      // Add bundles for different jobs
      await store.put('1'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-A' }), 'a1.zip');
      await store.put('2'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-A' }), 'a2.zip');
      await store.put('3'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-B' }), 'b1.zip');

      const results = await store.listByJob('JOB-A');

      expect(results.length).toBe(2);
      expect(results.every(r => r.jobId === 'JOB-A')).toBe(true);
    });

    it('should return empty array for unknown job', async () => {
      const results = await store.listByJob('UNKNOWN-JOB');
      expect(results).toEqual([]);
    });
  });

  describe('listAll', () => {
    it('should list all bundles', async () => {
      await store.put('1'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'A' }), 'a.zip');
      await store.put('2'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'B' }), 'b.zip');
      await store.put('3'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'C' }), 'c.zip');

      const results = await store.listAll();

      expect(results.length).toBe(3);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await store.put(
          String(i).repeat(64),
          createTestZipBytes(),
          createTestManifest({ jobId: `JOB-${i}` }),
          `file-${i}.zip`
        );
      }

      const results = await store.listAll(3);

      expect(results.length).toBe(3);
    });
  });

  describe('listKeys', () => {
    it('should return all cache keys', async () => {
      await store.put('a'.repeat(64), createTestZipBytes(), createTestManifest(), 'a.zip');
      await store.put('b'.repeat(64), createTestZipBytes(), createTestManifest(), 'b.zip');

      const keys = await store.listKeys();

      expect(keys.length).toBe(2);
      expect(keys).toContain('a'.repeat(64));
      expect(keys).toContain('b'.repeat(64));
    });
  });

  // ==========================================================================
  // Management Operations
  // ==========================================================================

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await store.put('1'.repeat(64), createTestZipBytes(1000), createTestManifest({ jobId: 'A' }), 'a.zip');
      await store.put('2'.repeat(64), createTestZipBytes(2000), createTestManifest({ jobId: 'A' }), 'b.zip');
      await store.put('3'.repeat(64), createTestZipBytes(3000), createTestManifest({ jobId: 'B' }), 'c.zip');

      const stats = await store.getStats();

      expect(stats.bundleCount).toBe(3);
      expect(stats.totalBytes).toBe(6000);
      expect(stats.jobIds).toContain('A');
      expect(stats.jobIds).toContain('B');
      expect(stats.jobIds.length).toBe(2);
    });

    it('should return zeros for empty store', async () => {
      const stats = await store.getStats();

      expect(stats.bundleCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.jobIds).toEqual([]);
    });
  });

  describe('clearJob', () => {
    it('should clear all bundles for a job', async () => {
      await store.put('1'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-A' }), 'a1.zip');
      await store.put('2'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-A' }), 'a2.zip');
      await store.put('3'.repeat(64), createTestZipBytes(), createTestManifest({ jobId: 'JOB-B' }), 'b1.zip');

      const deleted = await store.clearJob('JOB-A');

      expect(deleted).toBe(2);
      expect((await store.listByJob('JOB-A')).length).toBe(0);
      expect((await store.listByJob('JOB-B')).length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all bundles', async () => {
      await store.put('1'.repeat(64), createTestZipBytes(), createTestManifest(), 'a.zip');
      await store.put('2'.repeat(64), createTestZipBytes(), createTestManifest(), 'b.zip');

      await store.clear();

      const stats = await store.getStats();
      expect(stats.bundleCount).toBe(0);
    });
  });

  describe('evictToSize', () => {
    it('should evict entries to meet size limit', async () => {
      // Add bundles
      await store.put('1'.repeat(64), createTestZipBytes(1000), createTestManifest({ jobId: 'A' }), 'a.zip');
      await store.put('2'.repeat(64), createTestZipBytes(1000), createTestManifest({ jobId: 'B' }), 'b.zip');
      await store.put('3'.repeat(64), createTestZipBytes(1000), createTestManifest({ jobId: 'C' }), 'c.zip');

      // Evict to 2000 bytes (should remove at least 1)
      const evicted = await store.evictToSize(2000);

      expect(evicted).toBeGreaterThanOrEqual(1);

      const stats = await store.getStats();
      expect(stats.totalBytes).toBeLessThanOrEqual(2000);
    });

    it('should not evict if under limit', async () => {
      await store.put('1'.repeat(64), createTestZipBytes(500), createTestManifest(), 'a.zip');

      const evicted = await store.evictToSize(1000);

      expect(evicted).toBe(0);
      expect((await store.getStats()).bundleCount).toBe(1);
    });
  });
});
