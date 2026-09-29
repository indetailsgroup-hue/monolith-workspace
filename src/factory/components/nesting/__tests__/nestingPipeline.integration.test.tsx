/**
 * @vitest-environment jsdom
 */

/**
 * nestingPipeline.integration.test.tsx
 *
 * Integration test verifying the full pipeline:
 *   buildFactoryPacketFromStores → nestingSheets → NestingSheetReport renders real SVGs
 *
 * Mocks the Zustand stores to simulate a real nesting run result,
 * then verifies the NestingSheetReport component renders the SVG sheets.
 */

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { NestingSheet } from '../../../../core/export/monolith/monolithExportContext';

// ─── Test Fixtures (realistic nesting data) ──────────────────────────────────

const NESTING_SHEETS: NestingSheet[] = [
  {
    index1: 1,
    label: 'NEST_01',
    materialId: 'PB_WHITE_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    placements: [
      { partId: 'SIDE_L_01', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 },
      { partId: 'SIDE_R_01', x: 620, y: 10, rotation: 0, cutW: 600, cutH: 800 },
      { partId: 'FRONT_C1', x: 10, y: 820, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 8 },
      { partId: 'FRONT_C2', x: 520, y: 820, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 6 },
    ],
    utilization: 78.3,
  },
  {
    index1: 2,
    label: 'NEST_02',
    materialId: 'MDF_OAK_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    placements: [
      { partId: 'SHELF_01', x: 10, y: 10, rotation: 0, cutW: 800, cutH: 400 },
      { partId: 'SHELF_02', x: 10, y: 420, rotation: 0, cutW: 800, cutH: 400 },
      { partId: 'BACK_PANEL', x: 10, y: 830, rotation: 90, cutW: 1200, cutH: 600 },
    ],
    utilization: 65.1,
  },
  {
    index1: 3,
    label: 'NEST_03',
    materialId: 'PB_WHITE_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    placements: [
      { partId: 'DOOR_C1', x: 10, y: 10, rotation: 0, cutW: 400, cutH: 1200, isCurved: true, kerfCount: 12 },
    ],
    utilization: 32.7,
  },
];

// ─── Mock Stores ─────────────────────────────────────────────────────────────

// Mock cabinet store
vi.mock('../../../../core/store/useCabinetStore', () => ({
  useCabinetStore: {
    getState: () => ({ cabinets: [{ id: 'cab-1', name: 'Test Cabinet', panels: [] }] }),
  },
}));

// Mock drill map store
vi.mock('../../../../core/store/useDrillMapStore', () => ({
  useDrillMapStore: {
    getState: () => ({ drillMap: null }),
  },
}));

// Mock gate store
vi.mock('../../../../gate/ui/gateStore', () => ({
  useGateStore: {
    getState: () => ({ lastResult: null }),
  },
}));

// Mock nesting store — returns our fixtures
vi.mock('../../../../core/store/useNestingStore', () => ({
  useNestingStore: {
    getState: () => ({
      nestingSheets: [
        {
          index1: 1, label: 'NEST_01', materialId: 'PB_WHITE_18',
          sheetW: 1220, sheetH: 2440, sheetThickness: 18,
          placements: [
            { partId: 'SIDE_L_01', x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 },
            { partId: 'SIDE_R_01', x: 620, y: 10, rotation: 0, cutW: 600, cutH: 800 },
            { partId: 'FRONT_C1', x: 10, y: 820, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 8 },
            { partId: 'FRONT_C2', x: 520, y: 820, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 6 },
          ],
          utilization: 78.3,
        },
        {
          index1: 2, label: 'NEST_02', materialId: 'MDF_OAK_18',
          sheetW: 1220, sheetH: 2440, sheetThickness: 18,
          placements: [
            { partId: 'SHELF_01', x: 10, y: 10, rotation: 0, cutW: 800, cutH: 400 },
            { partId: 'SHELF_02', x: 10, y: 420, rotation: 0, cutW: 800, cutH: 400 },
            { partId: 'BACK_PANEL', x: 10, y: 830, rotation: 90, cutW: 1200, cutH: 600 },
          ],
          utilization: 65.1,
        },
        {
          index1: 3, label: 'NEST_03', materialId: 'PB_WHITE_18',
          sheetW: 1220, sheetH: 2440, sheetThickness: 18,
          placements: [
            { partId: 'DOOR_C1', x: 10, y: 10, rotation: 0, cutW: 400, cutH: 1200, isCurved: true, kerfCount: 12 },
          ],
          utilization: 32.7,
        },
      ],
      unplacedParts: [], // complete layout
    }),
  },
}));

// ─── Import components AFTER vi.mock declarations (hoisted by Vitest) ────────
import { NestingSheetReport } from '../NestingSheetReport';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Nesting Pipeline Integration', () => {
  afterEach(() => cleanup());

  it('buildFactoryPacketFromStores attaches nestingSheets to the packet', async () => {
    const { buildFactoryPacketFromStores } = await import('../../../../factory/packet/buildFactoryPacket');

    const result = await buildFactoryPacketFromStores({
      jobId: 'INT-TEST-001',
      projectId: 'proj-1',
      toolVersion: '13.2.0',
    });

    // Verify nestingSheets are attached
    expect(result.packet.nestingSheets).toBeDefined();
    expect(result.packet.nestingSheets!.length).toBe(3);
    expect(result.packet.nestingSheets![0].materialId).toBe('PB_WHITE_18');
    expect(result.packet.nestingSheets![1].materialId).toBe('MDF_OAK_18');
    expect(result.packet.nestingSheets![2].placements[0].isCurved).toBe(true);
  });

  it('NestingSheetReport renders SVG for each real nesting sheet', () => {
    render(<NestingSheetReport sheets={NESTING_SHEETS} jobId="INT-TEST-001" />);

    // Should render 3 sheet SVGs
    expect(screen.getByTestId('sheet-svg-1')).toBeTruthy();
    expect(screen.getByTestId('sheet-svg-2')).toBeTruthy();
    expect(screen.getByTestId('sheet-svg-3')).toBeTruthy();

    // Sheet labels
    expect(screen.getByTestId('sheet-label-1')?.textContent).toBe('NEST_01');
    expect(screen.getByTestId('sheet-label-2')?.textContent).toBe('NEST_02');
    expect(screen.getByTestId('sheet-label-3')?.textContent).toBe('NEST_03');
  });

  it('renders CURVED badges only for sheets with curved placements', () => {
    render(<NestingSheetReport sheets={NESTING_SHEETS} jobId="INT-TEST-001" />);

    // Sheet 1 has curved → badge
    expect(screen.getByTestId('curved-badge-1')).toBeTruthy();
    // Sheet 2 has NO curved → no badge
    expect(screen.queryByTestId('curved-badge-2')).toBeNull();
    // Sheet 3 has curved → badge
    expect(screen.getByTestId('curved-badge-3')).toBeTruthy();
  });

  it('renders kerf labels for curved placements', () => {
    render(<NestingSheetReport sheets={NESTING_SHEETS} jobId="INT-TEST-001" />);

    // FRONT_C1 has kerfCount=8
    expect(screen.getByTestId('kerf-label-FRONT_C1')?.textContent).toBe('8K');
    // FRONT_C2 has kerfCount=6
    expect(screen.getByTestId('kerf-label-FRONT_C2')?.textContent).toBe('6K');
    // DOOR_C1 has kerfCount=12
    expect(screen.getByTestId('kerf-label-DOOR_C1')?.textContent).toBe('12K');
  });

  it('renders correct placement count per sheet', () => {
    render(<NestingSheetReport sheets={NESTING_SHEETS} jobId="INT-TEST-001" />);

    // Sheet 1: 4 placements
    const sheet1Svg = screen.getByTestId('sheet-svg-1');
    const sheet1Placements = sheet1Svg.querySelectorAll('[data-testid^="placement-"]');
    expect(sheet1Placements.length).toBe(4);

    // Sheet 2: 3 placements
    const sheet2Svg = screen.getByTestId('sheet-svg-2');
    const sheet2Placements = sheet2Svg.querySelectorAll('[data-testid^="placement-"]');
    expect(sheet2Placements.length).toBe(3);

    // Sheet 3: 1 placement
    const sheet3Svg = screen.getByTestId('sheet-svg-3');
    const sheet3Placements = sheet3Svg.querySelectorAll('[data-testid^="placement-"]');
    expect(sheet3Placements.length).toBe(1);
  });

  it('does not attach nestingSheets when unplaced parts exist', async () => {
    // Override the nesting store mock for this test
    vi.doMock('../../../../core/store/useNestingStore', () => ({
      useNestingStore: {
        getState: () => ({
          nestingSheets: NESTING_SHEETS,
          unplacedParts: [{ partId: 'ORPHAN', cutW: 100, cutH: 100 }], // incomplete!
        }),
      },
    }));

    // Re-import to pick up the new mock
    vi.resetModules();
    const { buildFactoryPacketFromStores } = await import('../../../../factory/packet/buildFactoryPacket');

    const result = await buildFactoryPacketFromStores({
      jobId: 'INT-TEST-002',
      projectId: 'proj-1',
      toolVersion: '13.2.0',
    });

    // Should NOT attach because layout is incomplete
    expect(result.packet.nestingSheets).toBeUndefined();
  });
});
