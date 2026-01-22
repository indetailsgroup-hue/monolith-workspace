/**
 * reverifyOnLoad.test.ts - Tests for Re-verification on Load
 *
 * D3.3: Tests tamper scenarios for both packets and CNC bundles.
 *
 * @version 1.0.0 - Phase D3.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import {
  reverifyCncBundleFromIndexedDb,
  isCncBundleValid,
  invalidateIfVerifyFailed,
} from '../reverifyOnLoad';
import { getCncStore, _resetCncStore } from '../../../cnc/cache/indexedDbCncStore';
import { buildCncBundleZip, type BuildCncBundleInput } from '../../../cnc/bundle/buildCncBundleZip';
import { CNC_POST_VERSION, CNC_ZIP_FIXED_DATE } from '../../../cnc/bundle/cncManifest';
import type { OperationGraph, DrillOperation } from '../../../cnc/operation/operationTypes';

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

// Helper to tamper with ZIP bytes (flip a byte in the middle)
const tamperZipBytes = (zipBytes: Uint8Array, offset = 100): Uint8Array => {
  const tampered = new Uint8Array(zipBytes);
  if (tampered.length > offset) {
    tampered[offset] = tampered[offset] ^ 0xff; // Flip all bits
  }
  return tampered;
};

// ============================================================================
// CNC Bundle Re-verification Tests
// ============================================================================

describe('reverifyCncBundleFromIndexedDb', () => {
  beforeEach(() => {
    _resetCncStore();
  });

  afterEach(async () => {
    try {
      const store = getCncStore();
      await store.clear();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  // ==========================================================================
  // Happy Path: Valid Bundle
  // ==========================================================================

  describe('valid bundle verification', () => {
    it('should PASS for valid untampered bundle', async () => {
      const store = getCncStore();
      const input = createTestBundleInput();
      const bundle = await buildCncBundleZip(input);

      // Store in cache
      const cacheKey = 'a'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        expectedPacketHash: 'packet-hash-abc123',
        currentPostVersion: CNC_POST_VERSION,
      });

      expect(result.status).toBe('PASS');
      if (result.status === 'PASS') {
        expect(result.gcodeSha256).toBe(bundle.manifest.gcodeSha256);
        expect(result.opGraphHash).toBe(bundle.manifest.opGraphHash);
        expect(result.verifiedAt).toBeDefined();
      }
    });

    it('should PASS without expectedPacketHash', async () => {
      const store = getCncStore();
      const input = createTestBundleInput();
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'b'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      const result = await reverifyCncBundleFromIndexedDb(cacheKey);

      expect(result.status).toBe('PASS');
    });
  });

  // ==========================================================================
  // Tamper Scenarios
  // ==========================================================================

  describe('tamper scenarios', () => {
    it('should FAIL for bundle not found', async () => {
      const result = await reverifyCncBundleFromIndexedDb('nonexistent'.padEnd(64, '0'));

      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.code).toBe('E_BUNDLE_NOT_FOUND');
      }
    });

    it('should FAIL for corrupted ZIP (cannot extract)', async () => {
      const store = getCncStore();
      const input = createTestBundleInput();
      const bundle = await buildCncBundleZip(input);

      // Severely corrupt the ZIP so it can't be extracted
      const corrupted = new Uint8Array(50); // Too short, invalid
      corrupted[0] = 0x50; // PK header
      corrupted[1] = 0x4b;
      corrupted[2] = 0x03;
      corrupted[3] = 0x04;

      const cacheKey = 'c'.repeat(64);
      await store.put(cacheKey, corrupted, bundle.manifest, 'test.zip');

      const result = await reverifyCncBundleFromIndexedDb(cacheKey);

      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.code).toBe('E_BUNDLE_CORRUPT');
      }
    });

    it('should FAIL for tampered G-code (hash mismatch)', async () => {
      const store = getCncStore();

      // Build a valid bundle first to get a valid manifest
      const input = createTestBundleInput();
      const validBundle = await buildCncBundleZip(input);

      // Extract the valid bundle to get manifest
      const validZip = await JSZip.loadAsync(validBundle.zipBytes);
      const manifestJson = await validZip.file('cnc-manifest.json')!.async('string');
      const manifest = JSON.parse(manifestJson);

      // Create a tampered ZIP: change the G-code content but keep the manifest unchanged
      const tamperedZip = new JSZip();

      // Copy manifest (with original hash claims)
      tamperedZip.file('cnc-manifest.json', manifestJson, { date: CNC_ZIP_FIXED_DATE });

      // Copy opgraph unchanged
      const opGraphStr = await validZip.file('opgraph.json')!.async('string');
      tamperedZip.file('opgraph.json', opGraphStr, { date: CNC_ZIP_FIXED_DATE });

      // Copy checksums (will be wrong but that's ok for this test)
      const checksumsStr = await validZip.file('checksums.sha256')!.async('string');
      tamperedZip.file('checksums.sha256', checksumsStr, { date: CNC_ZIP_FIXED_DATE });

      // Add TAMPERED G-code content (manifest still claims original hash)
      const tamperedGcode = 'G21\nG90\nTAMPERED_MALICIOUS_CODE\nM30\n';
      tamperedZip.file('nc/TEST001.nc', tamperedGcode, { date: CNC_ZIP_FIXED_DATE });

      const tamperedZipBytes = await tamperedZip.generateAsync({ type: 'uint8array' });

      const cacheKey = 'd'.repeat(64);
      await store.put(cacheKey, tamperedZipBytes, manifest, 'test.zip');

      const result = await reverifyCncBundleFromIndexedDb(cacheKey);

      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.code).toBe('E_BUNDLE_GCODE_HASH_MISMATCH');
      }
    });

    it('should FAIL for tampered OpGraph (hash mismatch)', async () => {
      const store = getCncStore();

      // Build a valid bundle first
      const input = createTestBundleInput();
      const validBundle = await buildCncBundleZip(input);

      // Extract the valid bundle
      const validZip = await JSZip.loadAsync(validBundle.zipBytes);
      const manifestJson = await validZip.file('cnc-manifest.json')!.async('string');
      const manifest = JSON.parse(manifestJson);

      // Create a tampered ZIP: change the OpGraph content but keep the manifest unchanged
      const tamperedZip = new JSZip();

      // Copy manifest unchanged (with original hash claims)
      tamperedZip.file('cnc-manifest.json', manifestJson, { date: CNC_ZIP_FIXED_DATE });

      // Add TAMPERED OpGraph (manifest still claims original hash)
      const tamperedOpGraph = JSON.stringify({
        machineId: 'TAMPERED',
        operations: [{ id: 'malicious-op', type: 'DRILL' }],
        toolsUsed: ['EVIL_TOOL'],
        safeZ: 0,
        rapidZ: 0,
        metadata: { jobId: 'hacked', sourceContentHash: 'fake', builtAt: '', toolVersion: '' },
      });
      tamperedZip.file('opgraph.json', tamperedOpGraph, { date: CNC_ZIP_FIXED_DATE });

      // Copy checksums (will be wrong but that's ok for this test)
      const checksumsStr = await validZip.file('checksums.sha256')!.async('string');
      tamperedZip.file('checksums.sha256', checksumsStr, { date: CNC_ZIP_FIXED_DATE });

      // Copy G-code unchanged
      const gcodeBytes = await validZip.file('nc/TEST001.nc')!.async('uint8array');
      tamperedZip.file('nc/TEST001.nc', gcodeBytes, { date: CNC_ZIP_FIXED_DATE });

      const tamperedZipBytes = await tamperedZip.generateAsync({ type: 'uint8array' });

      const cacheKey = 'e'.repeat(64);
      await store.put(cacheKey, tamperedZipBytes, manifest, 'test.zip');

      const result = await reverifyCncBundleFromIndexedDb(cacheKey);

      expect(result.status).toBe('FAIL');
      if (result.status === 'FAIL') {
        expect(result.code).toBe('E_BUNDLE_OPGRAPH_HASH_MISMATCH');
      }
    });
  });

  // ==========================================================================
  // Linkage Mismatch (D3.3 Core Test)
  // ==========================================================================

  describe('linkage mismatch', () => {
    it('should return STALE when packetContentHash does not match expected', async () => {
      const store = getCncStore();
      const input = createTestBundleInput({
        packetContentHash: 'original-packet-hash',
      });
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'f'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify with different expected hash
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        expectedPacketHash: 'different-packet-hash', // Mismatch!
      });

      expect(result.status).toBe('STALE');
      if (result.status === 'STALE') {
        expect(result.code).toBe('E_BUNDLE_PACKET_HASH_MISMATCH');
        expect(result.reason).toBe('packet_hash_mismatch');
      }
    });

    it('should PASS when packetContentHash matches expected', async () => {
      const store = getCncStore();
      const packetHash = 'matching-packet-hash';
      const input = createTestBundleInput({
        packetContentHash: packetHash,
      });
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'g'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify with matching hash
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        expectedPacketHash: packetHash, // Match!
      });

      expect(result.status).toBe('PASS');
    });
  });

  // ==========================================================================
  // Post Version Mismatch (D3.3 Core Test)
  // ==========================================================================

  describe('postVersion mismatch', () => {
    it('should return STALE when postVersion does not match current', async () => {
      const store = getCncStore();
      const input = createTestBundleInput({
        postVersion: '0.9.0', // Old version
      });
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'h'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify with current version (mismatch)
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        currentPostVersion: '1.0.0', // Different from 0.9.0
      });

      expect(result.status).toBe('STALE');
      if (result.status === 'STALE') {
        expect(result.code).toBe('E_BUNDLE_POST_VERSION_MISMATCH');
        expect(result.reason).toBe('post_version_mismatch');
      }
    });

    it('should PASS when postVersion matches current', async () => {
      const store = getCncStore();
      const input = createTestBundleInput({
        postVersion: '1.0.0',
      });
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'i'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify with matching version
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        currentPostVersion: '1.0.0', // Match!
      });

      expect(result.status).toBe('PASS');
    });

    it('should not fail when treatVersionMismatchAsStale is false', async () => {
      const store = getCncStore();
      const input = createTestBundleInput({
        postVersion: '0.9.0', // Old version
      });
      const bundle = await buildCncBundleZip(input);

      const cacheKey = 'j'.repeat(64);
      await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

      // Re-verify with soft version check
      const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
        currentPostVersion: '1.0.0',
        treatVersionMismatchAsStale: false,
      });

      expect(result.status).toBe('PASS');
    });
  });
});

// ============================================================================
// Quick Helper Tests
// ============================================================================

describe('isCncBundleValid', () => {
  beforeEach(() => {
    _resetCncStore();
  });

  afterEach(async () => {
    try {
      const store = getCncStore();
      await store.clear();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  it('should return true for valid bundle', async () => {
    const store = getCncStore();
    const input = createTestBundleInput();
    const bundle = await buildCncBundleZip(input);

    const cacheKey = 'k'.repeat(64);
    await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

    const isValid = await isCncBundleValid(cacheKey);
    expect(isValid).toBe(true);
  });

  it('should return false for non-existent bundle', async () => {
    const isValid = await isCncBundleValid('nonexistent'.padEnd(64, '0'));
    expect(isValid).toBe(false);
  });

  it('should return false when packet hash mismatches', async () => {
    const store = getCncStore();
    const input = createTestBundleInput({
      packetContentHash: 'original-hash',
    });
    const bundle = await buildCncBundleZip(input);

    const cacheKey = 'l'.repeat(64);
    await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

    const isValid = await isCncBundleValid(cacheKey, 'different-hash');
    expect(isValid).toBe(false);
  });
});

describe('invalidateIfVerifyFailed', () => {
  beforeEach(() => {
    _resetCncStore();
  });

  afterEach(async () => {
    try {
      const store = getCncStore();
      await store.clear();
    } catch {
      // Ignore cleanup errors
    }
    _resetCncStore();
  });

  it('should return false for non-existent cache entry', async () => {
    const deleted = await invalidateIfVerifyFailed('nonexistent'.padEnd(64, '0'));
    expect(deleted).toBe(false);
  });

  it('should not delete valid bundle', async () => {
    const store = getCncStore();
    const input = createTestBundleInput();
    const bundle = await buildCncBundleZip(input);

    const cacheKey = 'm'.repeat(64);
    await store.put(cacheKey, bundle.zipBytes, bundle.manifest, 'test.zip');

    const deleted = await invalidateIfVerifyFailed(cacheKey);

    expect(deleted).toBe(false);
    expect(await store.has(cacheKey)).toBe(true);
  });

  it('should delete corrupted bundle', async () => {
    const store = getCncStore();
    const input = createTestBundleInput();
    const bundle = await buildCncBundleZip(input);

    // Store corrupted zip
    const corrupted = new Uint8Array(50);
    corrupted[0] = 0x50;
    corrupted[1] = 0x4b;
    corrupted[2] = 0x03;
    corrupted[3] = 0x04;

    const cacheKey = 'n'.repeat(64);
    await store.put(cacheKey, corrupted, bundle.manifest, 'test.zip');

    const deleted = await invalidateIfVerifyFailed(cacheKey);

    expect(deleted).toBe(true);
    expect(await store.has(cacheKey)).toBe(false);
  });
});
