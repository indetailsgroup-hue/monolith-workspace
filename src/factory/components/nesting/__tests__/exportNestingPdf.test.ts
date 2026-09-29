/**
 * @vitest-environment jsdom
 */

/**
 * exportNestingPdf.test.ts
 *
 * Unit tests for PDF nesting export.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock jsPDF ──────────────────────────────────────────────────────────────

const mockAddImage = vi.fn();
const mockAddPage = vi.fn();
const mockSave = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockText = vi.fn();

vi.mock('jspdf', () => ({
  jsPDF: class MockJsPDF {
    addImage = mockAddImage;
    addPage = mockAddPage;
    save = mockSave;
    setFontSize = mockSetFontSize;
    setTextColor = mockSetTextColor;
    text = mockText;
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('exportNestingPdf', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Image to immediately fire onload
    originalImage = globalThis.Image;
    (globalThis as any).Image = class MockImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_url: string) {
        // fire onload async
        setTimeout(() => this.onload?.(), 0);
      }
    };

    // Mock canvas
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toDataURL: () => 'data:image/png;base64,MOCK',
        } as any;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    });

    // jsdom doesn't have URL.createObjectURL — define stubs
    if (!URL.createObjectURL) {
      (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:svg-mock');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg-mock');
    }
    if (!URL.revokeObjectURL) {
      (URL as any).revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  it('does nothing if container has no SVGs', async () => {
    const { exportNestingPdf } = await import('../exportNestingPdf');

    const container = document.createElement('div');
    await exportNestingPdf(container, 'JOB-1');

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('generates a PDF with one page per SVG', async () => {
    const { exportNestingPdf } = await import('../exportNestingPdf');

    const container = document.createElement('div');
    // Add 2 SVG elements
    const svg1 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg1);
    container.appendChild(svg2);

    await exportNestingPdf(container, 'JOB-2');

    // Should add one additional page (first page is auto-created)
    expect(mockAddPage).toHaveBeenCalledTimes(1);
    // Should add 2 images
    expect(mockAddImage).toHaveBeenCalledTimes(2);
    // Should save
    expect(mockSave).toHaveBeenCalledWith('nesting_report_JOB-2.pdf');
  });

  it('uses default name when no jobId', async () => {
    const { exportNestingPdf } = await import('../exportNestingPdf');

    const container = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg);

    await exportNestingPdf(container);

    expect(mockSave).toHaveBeenCalledWith('nesting_report_export.pdf');
  });
});
