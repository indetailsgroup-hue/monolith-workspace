/**
 * buildCncBundleZip.test.ts - Tests for CNC Bundle ZIP Builder
 *
 * @version 1.0.0 - Phase D3.1
 */

import { describe, it, expect } from 'vitest';
import {
  buildCncBundleZip,
  type BuildCncBundleInput,
} from '../buildCncBundleZip';
import {
  CNC_MANIFEST_SCHEMA,
  CNC_POST_VERSION,
  CNC_BUNDLE_FILES,
  isValidCncManifest,
  generateChecksumsFile,
  getCncBundleFilename,
} from '../cncManifest';
import { unzipCncBundle } from '../zipCncBundle';
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

const createTestInput = (overrides?: Partial<BuildCncBundleInput>): BuildCncBundleInput => ({
  jobId: 'JOB-12345678',
  machineId: 'KDT',
  packetContentHash: 'abc123def456',
  opGraph: createTestOpGraph(),
  gcode: {
    path: 'nc/TEST001.nc',
    bytes: new TextEncoder().encode('G21\nG90\nM30\n'),
  },
  dialect: 'FANUC',
  createdAt: 1704067200000, // 2024-01-01T00:00:00Z
  ...overrides,
});

// ============================================================================
// Basic Bundle Generation Tests
// ============================================================================

describe('buildCncBundleZip - Basic Generation', () => {
  it('should generate bundle with correct schema', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    expect(result.manifest.schema).toBe(CNC_MANIFEST_SCHEMA);
  });

  it('should include jobId and machineId', async () => {
    const input = createTestInput({
      jobId: 'MY-JOB-123',
      machineId: 'BIESSE',
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.jobId).toBe('MY-JOB-123');
    expect(result.manifest.machineId).toBe('BIESSE');
  });

  it('should include trust chain hashes', async () => {
    const input = createTestInput({
      packetContentHash: 'packet-hash-abc',
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.packetContentHash).toBe('packet-hash-abc');
    expect(result.manifest.opGraphHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.gcodeSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should include post identity', async () => {
    const input = createTestInput({
      dialect: 'BIESSE_ISO',
      postVersion: '2.0.0',
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.post.dialect).toBe('BIESSE_ISO');
    expect(result.manifest.post.postVersion).toBe('2.0.0');
  });

  it('should use default postVersion if not specified', async () => {
    const input = createTestInput();
    delete (input as any).postVersion;
    const result = await buildCncBundleZip(input);

    expect(result.manifest.post.postVersion).toBe(CNC_POST_VERSION);
  });

  it('should include creation timestamp', async () => {
    const input = createTestInput({
      createdAt: 1704067200000,
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.createdAt).toBe(1704067200000);
  });

  it('should use current time if createdAt not specified', async () => {
    const input = createTestInput();
    delete (input as any).createdAt;
    const before = Date.now();
    const result = await buildCncBundleZip(input);
    const after = Date.now();

    expect(result.manifest.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.manifest.createdAt).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// File Structure Tests
// ============================================================================

describe('buildCncBundleZip - File Structure', () => {
  it('should include correct files in manifest', async () => {
    const input = createTestInput({
      gcode: {
        path: 'nc/MYJOB.nc',
        bytes: new TextEncoder().encode('G21\nM30\n'),
      },
    });
    const result = await buildCncBundleZip(input);

    const paths = result.manifest.files.map((f) => f.path);
    expect(paths).toContain(CNC_BUNDLE_FILES.OPGRAPH);
    expect(paths).toContain('nc/MYJOB.nc');
  });

  it('should sort files by path', async () => {
    const input = createTestInput({
      gcode: {
        path: 'nc/ZZZZZ.nc',
        bytes: new TextEncoder().encode('G21\n'),
      },
    });
    const result = await buildCncBundleZip(input);

    const paths = result.manifest.files.map((f) => f.path);
    // nc/ZZZZZ.nc should come after opgraph.json alphabetically
    expect(paths).toEqual([...paths].sort());
  });

  it('should include file sizes', async () => {
    const gcodeContent = 'G21\nG90\nG17\nM30\n';
    const input = createTestInput({
      gcode: {
        path: 'nc/TEST.nc',
        bytes: new TextEncoder().encode(gcodeContent),
      },
    });
    const result = await buildCncBundleZip(input);

    const gcodeFile = result.manifest.files.find((f) => f.path === 'nc/TEST.nc');
    expect(gcodeFile?.bytes).toBe(gcodeContent.length);
  });

  it('should include correct SHA-256 hashes', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    for (const file of result.manifest.files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

// ============================================================================
// ZIP Contents Tests
// ============================================================================

describe('buildCncBundleZip - ZIP Contents', () => {
  it('should create valid ZIP bytes', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    expect(result.zipBytes).toBeInstanceOf(Uint8Array);
    expect(result.zipBytes.length).toBeGreaterThan(0);
    // ZIP magic bytes: PK\x03\x04
    expect(result.zipBytes[0]).toBe(0x50); // P
    expect(result.zipBytes[1]).toBe(0x4b); // K
  });

  it('should extract manifest from ZIP', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    const files = await unzipCncBundle(result.zipBytes);
    const manifestBytes = files.get(CNC_BUNDLE_FILES.MANIFEST);
    expect(manifestBytes).toBeDefined();

    const manifestJson = new TextDecoder().decode(manifestBytes!);
    const manifest = JSON.parse(manifestJson);
    expect(manifest.schema).toBe(CNC_MANIFEST_SCHEMA);
    expect(manifest.jobId).toBe(input.jobId);
  });

  it('should extract opgraph from ZIP', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    const files = await unzipCncBundle(result.zipBytes);
    const opGraphBytes = files.get(CNC_BUNDLE_FILES.OPGRAPH);
    expect(opGraphBytes).toBeDefined();

    const opGraphJson = new TextDecoder().decode(opGraphBytes!);
    const opGraph = JSON.parse(opGraphJson);
    expect(opGraph.machineId).toBe('KDT');
    expect(opGraph.operations).toHaveLength(1);
  });

  it('should extract gcode from ZIP', async () => {
    const gcodeContent = 'G21\nG90\nM30\n';
    const input = createTestInput({
      gcode: {
        path: 'nc/PROGRAM.nc',
        bytes: new TextEncoder().encode(gcodeContent),
      },
    });
    const result = await buildCncBundleZip(input);

    const files = await unzipCncBundle(result.zipBytes);
    const gcodeBytes = files.get('nc/PROGRAM.nc');
    expect(gcodeBytes).toBeDefined();

    const gcode = new TextDecoder().decode(gcodeBytes!);
    expect(gcode).toBe(gcodeContent);
  });

  it('should extract checksums from ZIP', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    const files = await unzipCncBundle(result.zipBytes);
    const checksumsBytes = files.get(CNC_BUNDLE_FILES.CHECKSUMS);
    expect(checksumsBytes).toBeDefined();

    const checksums = new TextDecoder().decode(checksumsBytes!);
    expect(checksums).toContain('opgraph.json');
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('buildCncBundleZip - Statistics', () => {
  it('should include operation count', async () => {
    const input = createTestInput({
      opGraph: createTestOpGraph({
        operations: [
          createDrillOp({ id: 'drill-1' }),
          createDrillOp({ id: 'drill-2' }),
          createDrillOp({ id: 'drill-3' }),
        ],
      }),
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.stats?.opCount).toBe(3);
  });

  it('should count tool changes', async () => {
    const input = createTestInput({
      opGraph: createTestOpGraph({
        operations: [
          createDrillOp({ id: 'drill-1', toolId: 'DRILL_5' }),
          createDrillOp({ id: 'drill-2', toolId: 'DRILL_5' }),
          createDrillOp({ id: 'drill-3', toolId: 'DRILL_8' }),
          createDrillOp({ id: 'drill-4', toolId: 'DRILL_10' }),
        ],
      }),
    });
    const result = await buildCncBundleZip(input);

    // Tool changes: DRILL_5 → DRILL_8 (1) → DRILL_10 (2)
    expect(result.manifest.stats?.toolChanges).toBe(2);
  });

  it('should include estimated time if available', async () => {
    const input = createTestInput({
      opGraph: createTestOpGraph({
        estimatedTimeSeconds: 120,
      }),
    });
    const result = await buildCncBundleZip(input);

    expect(result.manifest.stats?.estimatedTimeSeconds).toBe(120);
  });
});

// ============================================================================
// Filename Tests
// ============================================================================

describe('buildCncBundleZip - Filename', () => {
  it('should generate correct filename format', async () => {
    const input = createTestInput({
      jobId: 'JOB-12345678-ABCD',
      machineId: 'KDT',
    });
    const result = await buildCncBundleZip(input);

    // Format: cnc-{jobIdShort}-{machineId}-{hashShort}.zip
    expect(result.filename).toMatch(/^cnc-JOB-1234-KDT-[a-f0-9]{8}\.zip$/);
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe('buildCncBundleZip - Determinism', () => {
  it('should produce identical manifests for same input', async () => {
    const input = createTestInput({
      createdAt: 1704067200000, // Fixed timestamp
    });

    const result1 = await buildCncBundleZip(input);
    const result2 = await buildCncBundleZip(input);

    // Manifests should be identical
    expect(result1.manifest.opGraphHash).toBe(result2.manifest.opGraphHash);
    expect(result1.manifest.gcodeSha256).toBe(result2.manifest.gcodeSha256);
    expect(result1.manifest.files).toEqual(result2.manifest.files);
  });

  it('should produce stable opGraph hash', async () => {
    const input = createTestInput();

    const result1 = await buildCncBundleZip(input);
    const result2 = await buildCncBundleZip(input);

    expect(result1.manifest.opGraphHash).toBe(result2.manifest.opGraphHash);
  });
});

// ============================================================================
// Manifest Validation Tests
// ============================================================================

describe('cncManifest - Utilities', () => {
  it('isValidCncManifest should validate correct manifest', async () => {
    const input = createTestInput();
    const result = await buildCncBundleZip(input);

    expect(isValidCncManifest(result.manifest)).toBe(true);
  });

  it('isValidCncManifest should reject invalid manifest', () => {
    expect(isValidCncManifest(null)).toBe(false);
    expect(isValidCncManifest({})).toBe(false);
    expect(isValidCncManifest({ schema: 'wrong' })).toBe(false);
  });

  it('generateChecksumsFile should produce correct format', () => {
    const files = [
      { path: 'b.txt', bytes: 100, sha256: 'bbbb' + '0'.repeat(60) },
      { path: 'a.txt', bytes: 50, sha256: 'aaaa' + '0'.repeat(60) },
    ];

    const content = generateChecksumsFile(files);

    // Should be sorted by path
    expect(content).toMatch(/^aaaa.*a\.txt/m);
    expect(content.indexOf('a.txt')).toBeLessThan(content.indexOf('b.txt'));
    expect(content.endsWith('\n')).toBe(true);
  });

  it('getCncBundleFilename should use correct format', () => {
    const manifest = {
      schema: CNC_MANIFEST_SCHEMA,
      jobId: 'JOB-ABCDEFGH-1234',
      machineId: 'KDT',
      opGraphHash: '0'.repeat(64),
      gcodeSha256: 'abcd1234' + '0'.repeat(56),
      post: { dialect: 'FANUC' as const, postVersion: '1.0.0' },
      createdAt: Date.now(),
      files: [],
    };

    const filename = getCncBundleFilename(manifest);
    expect(filename).toBe('cnc-JOB-ABCD-KDT-abcd1234.zip');
  });
});
