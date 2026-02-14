/**
 * cncCacheHelpers.test.ts - Tests for CNC Cache Helper Functions
 *
 * D3.3: Tests verified cache lookup with re-verification.
 *
 * @version 1.0.0 - Phase D3.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCachedBundle,
  cacheBundle,
  hasCachedBundle,
  invalidateJobCache,
  getCacheStatsForJob,
  getCacheStats,
  clearAllCache,
  getVerifiedCachedBundle,
  type CacheLookupInput,
  type CacheStoreInput,
} from '../cncCacheHelpers';
import { _resetCncStore, getCncStore } from '../indexedDbCncStore';
import { buildCncBundleZip, type BuildCncBundleInput } from '../../bundle/buildCncBundleZip';
import { CNC_POST_VERSION } from '../../bundle/cncManifest';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillOp = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  id: 'drill-001',
  type: 'DRILL',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  feedRate: 500,
  throughHole: false,
  sourceId: 'point-001',
  ...overrides,
});

const createTestOpGraph = (overrides?: Partial<OperationGraph>): OperationGraph => ({
  machineId: 'KDT',
  operations: [createDrillOp()],
  toolsUsed: ['DRILL_5'],
  safeZ: 50,
  rapidZ: 60,
  metadata: {
    jobId: 'job-001',
    sourceContentHash: 'hash-001',
    builtAt: '2024-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
  ...overrides,
});

const createTestBundleInput = (overrides?: Partial<BuildCncBundleInput>): BuildCncBundleInput => ({
  jobId: 'JOB-12345678',
  machineId: 'KDT',
  packetContentHash: 'packet-hash-abc123',
  opGraph: createTestOpGraph(),
  gcode: {
    path: 'nc/TEST001.nc',
    bytes: new TextEncoder().encode('G21\nG90\nG17\nM30\n'),
  },
  dialect: 'FANUC',
  postVersion: CNC_POST_VERSION,
  createdAt: 1704067200000,
  ...overrides,
});

// ============================================================================
// Basic Cache Operations Tests
// ============================================================================

describe('cncCacheHelpers - Basic Operations', () => {
  beforeEach(() => {
    _resetCncStore();
  });

  afterEach(async () => {
    try {
      await clearAllCache();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  describe('cacheBundle and getCachedBundle', () => {
    it('should cache and retrieve a bundle', async () => {
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      const storeInput: CacheStoreInput = {
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        postVersion: bundleInput.postVersion,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      };

      const cacheKey = await cacheBundle(storeInput);
      expect(cacheKey).toMatch(/^[a-f0-9]{64}$/);

      const lookupInput: CacheLookupInput = {
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        postVersion: bundleInput.postVersion,
      };

      const result = await getCachedBundle(lookupInput);

      expect(result.hit).toBe(true);
      expect(result.cacheKey).toBe(cacheKey);
      expect(result.bundle).toBeDefined();
      expect(result.bundle!.zipBytes.length).toBe(bundle.zipBytes.length);
    });

    it('should return cache miss for non-existent bundle', async () => {
      const lookupInput: CacheLookupInput = {
        packetContentHash: 'nonexistent-hash',
        machineId: 'KDT',
        dialect: 'FANUC',
      };

      const result = await getCachedBundle(lookupInput);

      expect(result.hit).toBe(false);
      expect(result.bundle).toBeUndefined();
    });
  });

  describe('hasCachedBundle', () => {
    it('should return true for cached bundle', async () => {
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      const exists = await hasCachedBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
      });

      expect(exists).toBe(true);
    });

    it('should return false for non-existent bundle', async () => {
      const exists = await hasCachedBundle({
        packetContentHash: 'nonexistent',
        machineId: 'KDT',
        dialect: 'FANUC',
      });

      expect(exists).toBe(false);
    });
  });

  describe('invalidateJobCache', () => {
    it('should invalidate all bundles for a job', async () => {
      // Cache two bundles for same job
      const bundleInput1 = createTestBundleInput({ machineId: 'KDT' });
      const bundle1 = await buildCncBundleZip(bundleInput1);
      await cacheBundle({
        packetContentHash: bundleInput1.packetContentHash!,
        machineId: 'KDT',
        dialect: 'FANUC',
        zipBytes: bundle1.zipBytes,
        manifest: bundle1.manifest,
        filename: bundle1.filename,
      });

      const bundleInput2 = createTestBundleInput({ machineId: 'BIESSE', dialect: 'BIESSE_ISO' });
      const bundle2 = await buildCncBundleZip(bundleInput2);
      await cacheBundle({
        packetContentHash: bundleInput2.packetContentHash!,
        machineId: 'BIESSE',
        dialect: 'BIESSE_ISO',
        zipBytes: bundle2.zipBytes,
        manifest: bundle2.manifest,
        filename: bundle2.filename,
      });

      // Invalidate job
      const deleted = await invalidateJobCache('JOB-12345678');

      expect(deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct statistics', async () => {
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      const stats = await getCacheStats();

      expect(stats.bundleCount).toBe(1);
      expect(stats.totalBytes).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Verified Cache Lookup Tests (D3.3)
// ============================================================================

describe('getVerifiedCachedBundle', () => {
  beforeEach(() => {
    _resetCncStore();
  });

  afterEach(async () => {
    try {
      await clearAllCache();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  describe('valid bundle verification', () => {
    it('should return verified hit for valid bundle', async () => {
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        postVersion: bundleInput.postVersion,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      const result = await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
          postVersion: bundleInput.postVersion,
        },
        {
          expectedPacketHash: bundleInput.packetContentHash,
        }
      );

      expect(result.hit).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.bundle).toBeDefined();
    });

    it('should return cache miss (verified: undefined) for non-existent bundle', async () => {
      const result = await getVerifiedCachedBundle({
        packetContentHash: 'nonexistent',
        machineId: 'KDT',
        dialect: 'FANUC',
      });

      expect(result.hit).toBe(false);
      expect(result.verified).toBeUndefined();
    });
  });

  describe('verification failures (strict policy)', () => {
    it('should return cache miss when packet hash mismatches (STALE)', async () => {
      const bundleInput = createTestBundleInput({
        packetContentHash: 'original-hash',
      });
      const bundle = await buildCncBundleZip(bundleInput);

      await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      // Verify with different expected hash
      const result = await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
        },
        {
          expectedPacketHash: 'different-hash', // Mismatch!
        }
      );

      // STRICT POLICY: Returns as cache miss
      expect(result.hit).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.stale).toBe(true);
      expect(result.verifyError).toBeDefined();
    });

    it('should return cache miss when post version mismatches (STALE)', async () => {
      const bundleInput = createTestBundleInput({
        postVersion: '0.9.0', // Old version stored in manifest
      });
      const bundle = await buildCncBundleZip(bundleInput);

      await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        postVersion: '0.9.0', // Cache key includes this version
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      // Look up with SAME version (to find the entry) but verify against DIFFERENT current version
      const result = await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
          postVersion: '0.9.0', // Same as stored, so we find the entry
        },
        {
          currentPostVersion: '1.0.0', // But verify against this newer version - mismatch!
        }
      );

      // STRICT POLICY: Returns as cache miss
      expect(result.hit).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.stale).toBe(true);
    });

    it('should auto-invalidate corrupted bundles', async () => {
      const store = getCncStore();
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      // Store corrupted zip with valid manifest
      const corrupted = new Uint8Array(50);
      corrupted[0] = 0x50;
      corrupted[1] = 0x4b;
      corrupted[2] = 0x03;
      corrupted[3] = 0x04;

      const cacheKey = await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: corrupted, // Corrupted!
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      // Verify - should fail and auto-invalidate
      const result = await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
        },
        {
          autoInvalidateOnFail: true,
        }
      );

      expect(result.hit).toBe(false);
      expect(result.verified).toBe(false);

      // Cache entry should be deleted
      expect(await store.has(cacheKey)).toBe(false);
    });

    it('should not auto-invalidate stale bundles', async () => {
      const store = getCncStore();
      const bundleInput = createTestBundleInput({
        packetContentHash: 'original-hash',
      });
      const bundle = await buildCncBundleZip(bundleInput);

      const cacheKey = await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: bundle.zipBytes,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      // Verify with different hash (stale, not corrupted)
      const result = await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
        },
        {
          expectedPacketHash: 'different-hash',
          autoInvalidateOnFail: true,
        }
      );

      expect(result.stale).toBe(true);

      // Stale entries should NOT be auto-invalidated (might be reusable)
      expect(await store.has(cacheKey)).toBe(true);
    });
  });

  describe('auto-invalidate option', () => {
    it('should not auto-invalidate when option is false', async () => {
      const store = getCncStore();
      const bundleInput = createTestBundleInput();
      const bundle = await buildCncBundleZip(bundleInput);

      // Store corrupted zip
      const corrupted = new Uint8Array(50);
      corrupted[0] = 0x50;
      corrupted[1] = 0x4b;
      corrupted[2] = 0x03;
      corrupted[3] = 0x04;

      const cacheKey = await cacheBundle({
        packetContentHash: bundleInput.packetContentHash!,
        machineId: bundleInput.machineId,
        dialect: bundleInput.dialect,
        zipBytes: corrupted,
        manifest: bundle.manifest,
        filename: bundle.filename,
      });

      // Verify with auto-invalidate disabled
      await getVerifiedCachedBundle(
        {
          packetContentHash: bundleInput.packetContentHash!,
          machineId: bundleInput.machineId,
          dialect: bundleInput.dialect,
        },
        {
          autoInvalidateOnFail: false,
        }
      );

      // Cache entry should still exist
      expect(await store.has(cacheKey)).toBe(true);
    });
  });
});
