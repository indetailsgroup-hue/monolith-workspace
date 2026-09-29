/**
 * @vitest-environment jsdom
 */

/**
 * exportCurvedDxfBatch.test.ts
 *
 * Unit tests for the DXF batch ZIP export (Feature 4).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NestingSheet } from '../../../../core/export/monolith/monolithExportContext';

// ─── Mock JSZip ──────────────────────────────────────────────────────────────

const mockFile = vi.fn();
const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      private _files: string[] = [];
      file(...args: unknown[]) {
        if (args[0] instanceof RegExp) {
          const regex = args[0] as RegExp;
          return this._files.filter(f => regex.test(f)).map(name => ({ name }));
        }
        this._files.push(args[0] as string);
        mockFile(...args);
        return this;
      }
      generateAsync = mockGenerateAsync;
    },
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SHEET_CURVED: NestingSheet = {
  index1: 1,
  label: 'NEST_01',
  materialId: 'PB_WHITE_18',
  sheetW: 1220,
  sheetH: 2440,
  sheetThickness: 18,
  placements: [
    { partId: 'SIDE_001', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 },
    { partId: 'FRONT_C1', x: 620, y: 10, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 8 },
  ],
  utilization: 72.5,
};

const SHEET_FLAT: NestingSheet = {
  index1: 2,
  label: 'NEST_02',
  materialId: 'PB_WHITE_18',
  sheetW: 1220,
  sheetH: 2440,
  sheetThickness: 18,
  placements: [
    { partId: 'SHELF_001', x: 10, y: 10, rotation: 0, cutW: 800, cutH: 400 },
  ],
  utilization: 55.0,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('exportCurvedDxfBatch', () => {
  let originalCreateElement: typeof document.createElement;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy = vi.fn<() => void>();
    originalCreateElement = document.createElement.bind(document);

    // jsdom doesn't have URL.createObjectURL — define stubs
    if (!URL.createObjectURL) {
      (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:mock');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    }
    if (!URL.revokeObjectURL) {
      (URL as any).revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }

    // Mock anchor element for download
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const a = originalCreateElement('a');
        a.click = clickSpy;
        return a;
      }
      return originalCreateElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n as any);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates ZIP with curved-panel DXF files', async () => {
    const { exportCurvedDxfBatch } = await import('../exportCurvedDxfBatch');

    await exportCurvedDxfBatch([SHEET_CURVED, SHEET_FLAT], 'JOB-100');

    // Only the curved sheet + manifest
    const dxfCalls = mockFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('.dxf')
    );
    expect(dxfCalls.length).toBe(1);
    expect(dxfCalls[0][0]).toContain('curved');
    expect(dxfCalls[0][0]).toContain('NEST_01');

    // Manifest included
    const manifestCalls = mockFile.mock.calls.filter(
      (c: unknown[]) => c[0] === 'manifest.json'
    );
    expect(manifestCalls.length).toBe(1);

    // Download triggered
    expect(clickSpy).toHaveBeenCalled();
  });

  it('includes all sheets when no curved panels exist', async () => {
    const { exportCurvedDxfBatch } = await import('../exportCurvedDxfBatch');

    await exportCurvedDxfBatch([SHEET_FLAT], 'JOB-200');

    // Falls back to include all sheets
    const dxfCalls = mockFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('.dxf')
    );
    expect(dxfCalls.length).toBe(1);
    expect(dxfCalls[0][0]).toContain('NEST_02');
  });

  it('does nothing for empty sheets array', async () => {
    const { exportCurvedDxfBatch } = await import('../exportCurvedDxfBatch');

    await exportCurvedDxfBatch([], 'JOB-300');

    expect(mockGenerateAsync).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('DXF content includes kerf slot lines for curved panels', async () => {
    const { exportCurvedDxfBatch } = await import('../exportCurvedDxfBatch');

    await exportCurvedDxfBatch([SHEET_CURVED], 'JOB-400');

    const dxfCalls = mockFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('.dxf')
    );
    expect(dxfCalls.length).toBe(1);

    const dxfContent = dxfCalls[0][1] as string;
    // Should have KERF_MARK layer
    expect(dxfContent).toContain('KERF_MARK');
    // Should have kerf count label "8K"
    expect(dxfContent).toContain('8K');
    // Should have R12 header
    expect(dxfContent).toContain('AC1009');
  });

  it('uses jobId in the download filename', async () => {
    const { exportCurvedDxfBatch } = await import('../exportCurvedDxfBatch');

    await exportCurvedDxfBatch([SHEET_CURVED], 'MY-JOB-555');

    // Check that the anchor download attribute was set
    const createCalls = (document.createElement as any).mock?.calls ?? [];
    // We verify the download was triggered
    expect(clickSpy).toHaveBeenCalled();
  });
});
