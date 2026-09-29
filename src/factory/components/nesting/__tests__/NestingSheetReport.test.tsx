/**
 * @vitest-environment jsdom
 */

/**
 * NestingSheetReport.test.tsx
 *
 * Unit tests for the NestingSheetReport component.
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NestingSheetReport } from '../NestingSheetReport';
import type { NestingSheet } from '../../../../core/export/monolith/monolithExportContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FLAT_PLACEMENT = {
  partId:   'SIDE_001',
  x:        10,
  y:        10,
  rotation: 0 as const,
  cutW:     600,
  cutH:     800,
};

const CURVED_PLACEMENT = {
  partId:    'FRONT_CURVED',
  x:         650,
  y:         10,
  rotation:  0 as const,
  cutW:      450,
  cutH:      700,
  isCurved:  true,
  kerfCount: 8,
};

const SHEET_1: NestingSheet = {
  index1:         1,
  label:          'NEST_01',
  materialId:     'MAT_MDF',
  sheetW:         1220,
  sheetH:         2440,
  sheetThickness: 18,
  placements:     [FLAT_PLACEMENT],
  utilization:    62.5,
};

const SHEET_2: NestingSheet = {
  index1:         2,
  label:          'NEST_02',
  materialId:     'MAT_FLEX',
  sheetW:         1220,
  sheetH:         2440,
  sheetThickness: 12,
  placements:     [FLAT_PLACEMENT, CURVED_PLACEMENT],
  utilization:    75.3,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NestingSheetReport', () => {
  afterEach(() => cleanup());

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when sheets=[]', () => {
    render(<NestingSheetReport sheets={[]} />);
    expect(screen.getByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText('ยังไม่มีข้อมูล Nesting Sheets')).toBeTruthy();
  });

  it('shows jobId in empty state when provided', () => {
    render(<NestingSheetReport sheets={[]} jobId="JOB-001" />);
    expect(screen.getByText(/JOB-001/)).toBeTruthy();
  });

  // ── Sheet headers ──────────────────────────────────────────────────────────

  it('renders NEST_01 sheet header label', () => {
    render(<NestingSheetReport sheets={[SHEET_1, SHEET_2]} />);
    expect(screen.getByTestId('sheet-label-1')).toHaveTextContent('NEST_01');
  });

  it('renders NEST_02 sheet header label', () => {
    render(<NestingSheetReport sheets={[SHEET_1, SHEET_2]} />);
    expect(screen.getByTestId('sheet-label-2')).toHaveTextContent('NEST_02');
  });

  // ── CURVED badge ───────────────────────────────────────────────────────────

  it('SHEET_1 has no CURVED badge (no curved placements)', () => {
    render(<NestingSheetReport sheets={[SHEET_1, SHEET_2]} />);
    expect(screen.queryByTestId('curved-badge-1')).toBeNull();
  });

  it('SHEET_2 has exactly 1 CURVED badge', () => {
    render(<NestingSheetReport sheets={[SHEET_1, SHEET_2]} />);
    const badges = screen.getAllByTestId(/^curved-badge-/);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('CURVED');
  });

  // ── Print button ───────────────────────────────────────────────────────────

  it('renders Print button', () => {
    render(<NestingSheetReport sheets={[SHEET_1]} />);
    expect(screen.getByTestId('print-button')).toBeTruthy();
  });

  it('calls window.print on Print button click', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<NestingSheetReport sheets={[SHEET_1]} />);
    fireEvent.click(screen.getByTestId('print-button'));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  // ── SVG sheets ─────────────────────────────────────────────────────────────

  it('renders SVG for each sheet', () => {
    render(<NestingSheetReport sheets={[SHEET_1, SHEET_2]} />);
    expect(screen.getByTestId('sheet-svg-1')).toBeTruthy();
    expect(screen.getByTestId('sheet-svg-2')).toBeTruthy();
  });

  it('renders placement element for FRONT_CURVED', () => {
    render(<NestingSheetReport sheets={[SHEET_2]} />);
    expect(screen.getByTestId('placement-FRONT_CURVED')).toBeTruthy();
  });

  // ── Auto-label when label is missing ──────────────────────────────────────

  it('auto-generates label NEST_03 when sheet.label is undefined', () => {
    const sheet3: NestingSheet = {
      index1: 3, materialId: 'MAT_MDF',
      sheetW: 1220, sheetH: 2440, sheetThickness: 18,
      placements: [], utilization: 0,
    };
    render(<NestingSheetReport sheets={[sheet3]} />);
    expect(screen.getByTestId('sheet-label-3')).toHaveTextContent('NEST_03');
  });
});

// ─── Multi-Material Grouping Tests ────────────────────────────────────────────

describe('NestingSheetReport — Multi-Material Grouping', () => {
  afterEach(() => cleanup());

  const SHEET_A1: NestingSheet = {
    index1: 1, label: 'NEST_01', materialId: 'PB_WHITE_18',
    sheetW: 1220, sheetH: 2440, sheetThickness: 18,
    placements: [{ partId: 'A1', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 }],
    utilization: 50,
  };
  const SHEET_A2: NestingSheet = {
    index1: 2, label: 'NEST_02', materialId: 'PB_WHITE_18',
    sheetW: 1220, sheetH: 2440, sheetThickness: 18,
    placements: [{ partId: 'A2', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 }],
    utilization: 55,
  };
  const SHEET_B1: NestingSheet = {
    index1: 3, label: 'NEST_03', materialId: 'MDF_OAK_18',
    sheetW: 1220, sheetH: 2440, sheetThickness: 18,
    placements: [{ partId: 'B1', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 }],
    utilization: 60,
  };
  const SHEET_C1: NestingSheet = {
    index1: 4, label: 'NEST_04', materialId: 'PLYWOOD_12',
    sheetW: 1220, sheetH: 2440, sheetThickness: 12,
    placements: [{ partId: 'C1', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800, isCurved: true, kerfCount: 6 }],
    utilization: 40,
  };

  it('renders material tabs when multiple materials exist', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_B1, SHEET_C1]} />);

    expect(screen.getByTestId('material-tabs')).toBeTruthy();
    expect(screen.getByTestId('material-tab-PB_WHITE_18')).toBeTruthy();
    expect(screen.getByTestId('material-tab-MDF_OAK_18')).toBeTruthy();
    expect(screen.getByTestId('material-tab-PLYWOOD_12')).toBeTruthy();
  });

  it('does not render material tabs for single material', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_A2]} />);
    expect(screen.queryByTestId('material-tabs')).toBeNull();
  });

  it('renders material section for each material', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_B1, SHEET_C1]} />);

    expect(screen.getByTestId('material-section-PB_WHITE_18')).toBeTruthy();
    expect(screen.getByTestId('material-section-MDF_OAK_18')).toBeTruthy();
    expect(screen.getByTestId('material-section-PLYWOOD_12')).toBeTruthy();
  });

  it('renders material header with materialId text', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_B1]} />);

    const header = screen.getByTestId('material-header-PB_WHITE_18');
    expect(header.textContent).toContain('PB_WHITE_18');

    const header2 = screen.getByTestId('material-header-MDF_OAK_18');
    expect(header2.textContent).toContain('MDF_OAK_18');
  });

  it('groups sheets correctly under their material section', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_A2, SHEET_B1]} />);

    // PB_WHITE_18 section should contain both sheets (index1=1,2)
    const sectionA = screen.getByTestId('material-section-PB_WHITE_18');
    expect(sectionA.querySelector('[data-testid="sheet-svg-1"]')).toBeTruthy();
    expect(sectionA.querySelector('[data-testid="sheet-svg-2"]')).toBeTruthy();

    // MDF_OAK_18 section should contain only sheet 3
    const sectionB = screen.getByTestId('material-section-MDF_OAK_18');
    expect(sectionB.querySelector('[data-testid="sheet-svg-3"]')).toBeTruthy();
    expect(sectionB.querySelector('[data-testid="sheet-svg-1"]')).toBeNull();
  });

  it('tab text contains material count', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_A2, SHEET_B1]} />);

    // PB_WHITE_18 has 2 sheets
    expect(screen.getByTestId('material-tab-PB_WHITE_18').textContent).toContain('(2)');
    // MDF_OAK_18 has 1 sheet
    expect(screen.getByTestId('material-tab-MDF_OAK_18').textContent).toContain('(1)');
  });

  it('shows material count in toolbar text for multi-material', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_B1, SHEET_C1]} />);
    // Should show "3 วัสดุ"
    expect(screen.getByText(/3 วัสดุ/)).toBeTruthy();
  });

  it('does not show material count text for single material', () => {
    render(<NestingSheetReport sheets={[SHEET_A1, SHEET_A2]} />);
    expect(screen.queryByText(/วัสดุ/)).toBeNull();
  });
});

// ─── Heatmap Overlay Tests ────────────────────────────────────────────────────

describe('NestingSheetReport — Heatmap Overlay', () => {
  afterEach(() => cleanup());

  const SHEET_HIGH_UTIL: NestingSheet = {
    index1: 1, label: 'NEST_01', materialId: 'PB_WHITE_18',
    sheetW: 1220, sheetH: 2440, sheetThickness: 18,
    placements: [{ partId: 'A1', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 }],
    utilization: 92,
  };
  const SHEET_LOW_UTIL: NestingSheet = {
    index1: 2, label: 'NEST_02', materialId: 'PB_WHITE_18',
    sheetW: 1220, sheetH: 2440, sheetThickness: 18,
    placements: [{ partId: 'B1', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 }],
    utilization: 25,
  };

  it('renders heatmap toggle button', () => {
    render(<NestingSheetReport sheets={[SHEET_HIGH_UTIL]} />);
    expect(screen.getByTestId('heatmap-toggle')).toBeTruthy();
  });

  it('no heatmap overlay visible by default', () => {
    render(<NestingSheetReport sheets={[SHEET_HIGH_UTIL]} />);
    expect(screen.queryByTestId('heatmap-overlay-1')).toBeNull();
  });

  it('clicking heatmap toggle shows overlay on all sheets', () => {
    render(<NestingSheetReport sheets={[SHEET_HIGH_UTIL, SHEET_LOW_UTIL]} />);

    fireEvent.click(screen.getByTestId('heatmap-toggle'));

    expect(screen.getByTestId('heatmap-overlay-1')).toBeTruthy();
    expect(screen.getByTestId('heatmap-overlay-2')).toBeTruthy();
  });

  it('heatmap overlay shows utilization percentage', () => {
    render(<NestingSheetReport sheets={[SHEET_HIGH_UTIL]} />);
    fireEvent.click(screen.getByTestId('heatmap-toggle'));

    expect(screen.getByTestId('heatmap-percent-1').textContent).toContain('92');
  });

  it('toggling heatmap off hides overlay', () => {
    render(<NestingSheetReport sheets={[SHEET_HIGH_UTIL]} />);

    const toggle = screen.getByTestId('heatmap-toggle');
    fireEvent.click(toggle); // on
    expect(screen.getByTestId('heatmap-overlay-1')).toBeTruthy();

    fireEvent.click(toggle); // off
    expect(screen.queryByTestId('heatmap-overlay-1')).toBeNull();
  });
});
