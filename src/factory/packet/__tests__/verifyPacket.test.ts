/**
 * verifyPacket.test.ts - Tests for Packet Verification
 *
 * @version 1.0.0 - Phase C: Factory Ingest & Verify
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyPacket,
  formatVerifyResult,
  getVerifyErrors,
  getVerifyWarnings,
  type VerifyPacketResult,
} from '../verifyPacket';
import { unzipPacket, type UnzipResult } from '../unzipPacket';
import * as manifestHash from '../manifestHash';
import type { FactoryPacket, PacketManifest, PacketCutList, PacketDrillMap, PacketConnectors, PacketGateResult } from '../types';

// Mock JSZip
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn(),
  },
}));

// Mock the unzipPacket module
vi.mock('../unzipPacket', () => ({
  unzipPacket: vi.fn(),
  isValidZip: vi.fn(() => true),
}));

// Mock manifestHash
vi.mock('../manifestHash', () => ({
  sha256: vi.fn(async (data: string) => `mock-hash-${data.length}`),
  verifyFileHash: vi.fn(async () => true),
  computeContentHash: vi.fn(async () => 'mock-content-hash'),
}));

// Create mock data
const createMockManifest = (): PacketManifest => ({
  schema: 'monolith.factory.packet@1.0',
  version: '1.0.0',
  jobId: 'test-job-123',
  projectId: 'test-project',
  createdAt: '2024-01-01T00:00:00.000Z',
  toolVersion: 'MONOLITH Test 1.0.0',
  files: [
    { path: 'drillmap.json', sha256: 'hash-drillmap', sizeBytes: 100 },
    { path: 'connectors.minifix.json', sha256: 'hash-connectors', sizeBytes: 50 },
    { path: 'cutlist.json', sha256: 'hash-cutlist', sizeBytes: 200 },
    { path: 'gate-result.json', sha256: 'hash-gate', sizeBytes: 80 },
  ],
  contentHash: 'mock-content-hash',
});

const createMockCutList = (): PacketCutList => ({
  version: 'cutlist.v1',
  rows: [
    {
      rowNo: 1,
      partId: 'panel-1',
      cabinetId: 'cab-1',
      materialId: 'MDF-18',
      qty: 1,
      finishW: 600,
      finishH: 720,
      edgeBanding: [1, 1, 0, 0],
      premill: [0, 0, 0, 0],
      cutW: 602,
      cutH: 722,
      grain: 'HORIZONTAL',
    },
  ],
  summary: {
    totalRows: 1,
    totalParts: 1,
    byMaterial: { 'MDF-18': { rows: 1, parts: 1 } },
  },
});

const createMockDrillMap = (): PacketDrillMap => ({
  version: 'drillmap.v1',
  panels: [],
  summary: {
    totalDrills: 0,
    totalBores: 0,
    byPurpose: {},
    byDiameter: {},
  },
  tools: [],
});

const createMockConnectors = (): PacketConnectors => ({
  version: 'connectors.v1',
  minifix: [],
  summary: {
    totalPairs: 0,
    validPairs: 0,
    warningPairs: 0,
    errorPairs: 0,
  },
});

const createMockGateResult = (passed: boolean = true): PacketGateResult => ({
  version: 'gate.v1',
  policyVersion: '1.0.0',
  passed,
  runAt: '2024-01-01T00:00:00.000Z',
  findings: {
    blockers: passed ? [] : [{ key: 'test-blocker', code: 'TEST001', severity: 'BLOCKER', message: 'Test blocker', entityIds: [] }],
    warnings: [],
    info: [],
  },
  summary: {
    blockerCount: passed ? 0 : 1,
    warningCount: 0,
    infoCount: 0,
  },
});

const createMockPacket = (gatePass: boolean = true): FactoryPacket => ({
  manifest: createMockManifest(),
  drillMap: createMockDrillMap(),
  connectors: createMockConnectors(),
  cutList: createMockCutList(),
  gateResult: createMockGateResult(gatePass),
});

const createMockFiles = (): Map<string, string> => {
  const files = new Map<string, string>();
  files.set('manifest.json', JSON.stringify(createMockManifest()));
  files.set('drillmap.json', JSON.stringify(createMockDrillMap()));
  files.set('connectors.minifix.json', JSON.stringify(createMockConnectors()));
  files.set('cutlist.json', JSON.stringify(createMockCutList()));
  files.set('gate-result.json', JSON.stringify(createMockGateResult()));
  return files;
};

describe('verifyPacket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful verification', () => {
    it('should verify a valid packet', async () => {
      // Mock successful extraction
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10));

      expect(result.valid).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.packet).toBeDefined();
    });

    it('should pass all checks for valid packet', async () => {
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10));

      const passedChecks = result.checks.filter(c => c.status === 'PASS');
      const failedChecks = result.checks.filter(c => c.status === 'FAIL');

      expect(passedChecks.length).toBeGreaterThan(0);
      expect(failedChecks.length).toBe(0);
    });

    it('should include summary counts', async () => {
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10));

      expect(result.summary).toBeDefined();
      expect(typeof result.summary.passed).toBe('number');
      expect(typeof result.summary.failed).toBe('number');
      expect(typeof result.summary.warned).toBe('number');
      expect(typeof result.summary.skipped).toBe('number');
    });
  });

  describe('extraction failure', () => {
    it('should fail when extraction fails', async () => {
      const mockUnzipResult: UnzipResult = {
        success: false,
        files: new Map(),
        errors: ['Failed to extract ZIP'],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10));

      expect(result.valid).toBe(false);
      expect(result.checks.find(c => c.id === 'MANIFEST_PRESENT')?.status).toBe('FAIL');
    });
  });

  describe('gate verification', () => {
    it('should fail when gate failed and not allowed', async () => {
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(false),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10), {
        allowFailedGate: false,
      });

      const gateCheck = result.checks.find(c => c.id === 'GATE_PASSED');
      expect(gateCheck?.status).toBe('FAIL');
    });

    it('should warn when gate failed but allowed', async () => {
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(false),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10), {
        allowFailedGate: true,
      });

      const gateCheck = result.checks.find(c => c.id === 'GATE_PASSED');
      expect(gateCheck?.status).toBe('WARN');
    });
  });

  describe('options', () => {
    it('should skip content hash when option set', async () => {
      const mockUnzipResult: UnzipResult = {
        success: true,
        packet: createMockPacket(),
        files: createMockFiles(),
        errors: [],
        warnings: [],
      };

      vi.mocked(unzipPacket).mockResolvedValue(mockUnzipResult);

      const result = await verifyPacket(new ArrayBuffer(10), {
        skipContentHash: true,
      });

      const contentCheck = result.checks.find(c => c.id === 'CONTENT_HASH');
      expect(contentCheck?.status).toBe('SKIP');
    });
  });
});

describe('formatVerifyResult', () => {
  it('should format result as readable text', async () => {
    const result: VerifyPacketResult = {
      valid: true,
      timestamp: Date.now(),
      checks: [
        { id: 'MANIFEST_PRESENT', name: 'Manifest Present', status: 'PASS', message: 'Found' },
        { id: 'SCHEMA_VALID', name: 'Schema Valid', status: 'PASS', message: 'Valid' },
      ],
      summary: { passed: 2, failed: 0, warned: 0, skipped: 0 },
      hashMismatches: [],
      missingFiles: [],
      extraFiles: [],
    };

    const formatted = formatVerifyResult(result);

    expect(formatted).toContain('Verification PASSED');
    expect(formatted).toContain('Manifest Present');
    expect(formatted).toContain('2 passed');
  });

  it('should show FAILED for invalid result', async () => {
    const result: VerifyPacketResult = {
      valid: false,
      timestamp: Date.now(),
      checks: [
        { id: 'MANIFEST_PRESENT', name: 'Manifest Present', status: 'FAIL', message: 'Not found' },
      ],
      summary: { passed: 0, failed: 1, warned: 0, skipped: 0 },
      hashMismatches: [],
      missingFiles: [],
      extraFiles: [],
    };

    const formatted = formatVerifyResult(result);

    expect(formatted).toContain('Verification FAILED');
  });
});

describe('getVerifyErrors', () => {
  it('should return failed check messages', () => {
    const result: VerifyPacketResult = {
      valid: false,
      timestamp: Date.now(),
      checks: [
        { id: 'MANIFEST_PRESENT', name: 'Manifest Present', status: 'PASS', message: 'Found' },
        { id: 'HASHES_MATCH', name: 'Hashes Match', status: 'FAIL', message: 'Mismatch' },
      ],
      summary: { passed: 1, failed: 1, warned: 0, skipped: 0 },
      hashMismatches: [],
      missingFiles: [],
      extraFiles: [],
    };

    const errors = getVerifyErrors(result);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Hashes Match');
  });
});

describe('getVerifyWarnings', () => {
  it('should return warned check messages', () => {
    const result: VerifyPacketResult = {
      valid: true,
      timestamp: Date.now(),
      checks: [
        { id: 'MANIFEST_PRESENT', name: 'Manifest Present', status: 'PASS', message: 'Found' },
        { id: 'GATE_PASSED', name: 'Gate Passed', status: 'WARN', message: 'Failed but allowed' },
      ],
      summary: { passed: 1, failed: 0, warned: 1, skipped: 0 },
      hashMismatches: [],
      missingFiles: [],
      extraFiles: [],
    };

    const warnings = getVerifyWarnings(result);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Gate Passed');
  });
});
