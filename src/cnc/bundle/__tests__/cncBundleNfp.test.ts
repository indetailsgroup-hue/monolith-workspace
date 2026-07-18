/**
 * cncBundleNfp.test.ts — S18 l5-cnc-safety Slice 3 (CNC bundle zip)
 *
 * ADR-065 Q3: while SHADOW_MODE is on, the CNC bundle zip (the artifact that
 * travels closest to the machine) must be visibly labeled:
 *  - NOT_FOR_PRODUCTION.txt inside the zip, entered in manifest + checksums
 *  - filename prefixed NFP- so the label is visible before opening
 */

import { describe, it, expect } from 'vitest';
import { buildCncBundleZip, type BuildCncBundleInput } from '../buildCncBundleZip';
import { unzipCncBundle } from '../zipCncBundle';
import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_FILE,
} from '../../../core/config/shadowMode';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';

// ============================================================================
// Fixtures (same shape as buildCncBundleZip.test.ts)
// ============================================================================

const drillOp: DrillOperation = {
  id: 'drill-nfp-001',
  type: 'DRILL',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  feedRate: 500,
  throughHole: false,
  sourceId: 'point-nfp-001',
};

const opGraph: OperationGraph = {
  machineId: 'KDT',
  operations: [drillOp],
  toolsUsed: ['DRILL_5'],
  safeZ: 50,
  rapidZ: 60,
  metadata: {
    jobId: 'job-nfp-bundle',
    sourceContentHash: 'hash-nfp',
    builtAt: '2026-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
};

const createInput = (): BuildCncBundleInput => ({
  jobId: 'JOB-NFP-001',
  machineId: 'KDT',
  packetContentHash: 'abc123def456',
  opGraph,
  gcode: {
    path: 'nc/NFP001.nc',
    bytes: new TextEncoder().encode('G21\nG90\nM30\n'),
  },
  dialect: 'FANUC',
  createdAt: 1767225600000,
});

// ============================================================================
// Tests
// ============================================================================

describe('CNC bundle zip — NOT-FOR-PRODUCTION labels (ADR-065 Q3)', () => {
  it('shadow mode is on during dogfood', () => {
    expect(SHADOW_MODE_NOT_FOR_PRODUCTION).toBe(true);
  });

  it('bundle filename starts with NFP- while shadow mode is on', async () => {
    const result = await buildCncBundleZip(createInput());

    expect(result.filename).toMatch(/^NFP-cnc-/);
  });

  it('zip contains NOT_FOR_PRODUCTION.txt with the bilingual notice', async () => {
    const result = await buildCncBundleZip(createInput());
    const files = await unzipCncBundle(result.zipBytes);

    expect(files.has(NOT_FOR_PRODUCTION_FILE)).toBe(true);
    const text = new TextDecoder().decode(files.get(NOT_FOR_PRODUCTION_FILE)!);
    expect(text).toContain('ห้ามใช้ตัดชิ้นงานจริง');
    expect(text).toContain('Do NOT cut real workpieces');
  });

  it('NFP file is entered in the manifest with a real sha256 (verifier-friendly)', async () => {
    const result = await buildCncBundleZip(createInput());

    const entry = result.manifest.files.find((f) => f.path === NOT_FOR_PRODUCTION_FILE);
    expect(entry).toBeDefined();
    expect(entry!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry!.bytes).toBeGreaterThan(0);
  });

  it('NFP file is covered by checksums.sha256', async () => {
    const result = await buildCncBundleZip(createInput());
    const files = await unzipCncBundle(result.zipBytes);

    const checksums = new TextDecoder().decode(files.get('checksums.sha256')!);
    expect(checksums).toContain(NOT_FOR_PRODUCTION_FILE);
  });
});
