/**
 * flatPartBuilder.test.ts - Unit tests for FlatPart Builder
 *
 * Tests cut size calculations, edge deduction, and feature building.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import { flatPartFromPanel, flatPartsFromCabinet } from '../flatPartBuilder';
import type { FlatPartFromPanelInput } from '../../types/FlatPart';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockPanelInput = (overrides?: Partial<FlatPartFromPanelInput>): FlatPartFromPanelInput => ({
  panel: {
    id: 'panel-001',
    name: 'Side Panel',
    role: 'LEFT_SIDE',
    finishWidth: 600,
    finishHeight: 800,
    coreThickness: 18,
    coreMaterialId: 'MDF_18',
    coreMaterialName: 'MDF 18mm',
    grainDirection: 'vertical',
    edges: {
      top: { materialId: 'ABS_1', code: 'ABS-1', thickness: 1, height: 23 },
      bottom: { materialId: 'ABS_1', code: 'ABS-1', thickness: 1, height: 23 },
      left: { materialId: 'ABS_1', code: 'ABS-1', thickness: 1, height: 23 },
      right: { materialId: 'ABS_1', code: 'ABS-1', thickness: 1, height: 23 },
    },
  },
  cabinetId: 'cabinet-001',
  preMill: 0.5,
  ...overrides,
});

// ============================================================================
// Cut Size Calculation Tests
// ============================================================================

describe('Cut Size Calculation', () => {
  it('should calculate cut width with edge deduction', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    // CutWidth = FinishWidth - LeftEdge - RightEdge + (preMill * 2)
    // CutWidth = 600 - 1 - 1 + (0.5 * 2) = 599
    expect(result.cutWidth).toBe(599);
  });

  it('should calculate cut height with edge deduction', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    // CutHeight = FinishHeight - TopEdge - BottomEdge + (preMill * 2)
    // CutHeight = 800 - 1 - 1 + (0.5 * 2) = 799
    expect(result.cutHeight).toBe(799);
  });

  it('should handle no edge banding', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-002',
        name: 'Back Panel',
        role: 'BACK',
        finishWidth: 500,
        finishHeight: 700,
        coreThickness: 8,
        coreMaterialId: 'HMR_8',
        coreMaterialName: 'HMR 8mm',
        grainDirection: 'none',
        edges: {}, // No edges
      },
    });

    const result = flatPartFromPanel(input);

    // CutWidth = FinishWidth + (preMill * 2) = 500 + 1 = 501
    expect(result.cutWidth).toBe(501);
    expect(result.cutHeight).toBe(701);
  });

  it('should handle partial edge banding', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-003',
        name: 'Shelf',
        role: 'SHELF',
        finishWidth: 580,
        finishHeight: 400,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'horizontal',
        edges: {
          // Only front edge banded
          bottom: { materialId: 'ABS_2', code: 'ABS-2', thickness: 2, height: 23 },
        },
      },
    });

    const result = flatPartFromPanel(input);

    // CutWidth = 580 + 1 = 581 (no left/right edge)
    // CutHeight = 400 - 2 + 1 = 399 (bottom edge only)
    expect(result.cutWidth).toBe(581);
    expect(result.cutHeight).toBe(399);
  });

  it('should handle different preMill values', () => {
    const input1 = createMockPanelInput({ preMill: 0 });
    const input2 = createMockPanelInput({ preMill: 1.0 });
    const input3 = createMockPanelInput({ preMill: 2.0 });

    const result1 = flatPartFromPanel(input1);
    const result2 = flatPartFromPanel(input2);
    const result3 = flatPartFromPanel(input3);

    // preMill 0: 600 - 1 - 1 + 0 = 598
    expect(result1.cutWidth).toBe(598);

    // preMill 1.0: 600 - 1 - 1 + 2 = 600
    expect(result2.cutWidth).toBe(600);

    // preMill 2.0: 600 - 1 - 1 + 4 = 602
    expect(result3.cutWidth).toBe(602);
  });

  it('should handle thick edge banding (2mm ABS)', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-004',
        name: 'Front Panel',
        role: 'FRONT',
        finishWidth: 450,
        finishHeight: 720,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'vertical',
        edges: {
          top: { materialId: 'ABS_2', code: 'ABS-2', thickness: 2, height: 23 },
          bottom: { materialId: 'ABS_2', code: 'ABS-2', thickness: 2, height: 23 },
          left: { materialId: 'ABS_2', code: 'ABS-2', thickness: 2, height: 23 },
          right: { materialId: 'ABS_2', code: 'ABS-2', thickness: 2, height: 23 },
        },
      },
      preMill: 1.0,
    });

    const result = flatPartFromPanel(input);

    // CutWidth = 450 - 2 - 2 + 2 = 448
    expect(result.cutWidth).toBe(448);
    // CutHeight = 720 - 2 - 2 + 2 = 718
    expect(result.cutHeight).toBe(718);
  });
});

// ============================================================================
// Edge Band Building Tests
// ============================================================================

describe('Edge Band Building', () => {
  it('should build all four edge bands', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    expect(result.edges).toHaveLength(4);
    expect(result.edges.map(e => e.side).sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('should correctly map edge properties', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    const topEdge = result.edges.find(e => e.side === 'top');
    expect(topEdge).toBeDefined();
    expect(topEdge?.materialId).toBe('ABS_1');
    expect(topEdge?.thickness).toBe(1);
    expect(topEdge?.height).toBe(23);
  });

  it('should handle no edges', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-005',
        name: 'Back',
        role: 'BACK',
        finishWidth: 500,
        finishHeight: 600,
        coreThickness: 8,
        coreMaterialId: 'HMR_8',
        coreMaterialName: 'HMR 8mm',
        grainDirection: 'none',
        edges: {},
      },
    });

    const result = flatPartFromPanel(input);
    expect(result.edges).toHaveLength(0);
  });
});

// ============================================================================
// Composite Stack Tests
// ============================================================================

describe('Composite Stack Building', () => {
  it('should build core-only stack', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    expect(result.composite.core.materialId).toBe('MDF_18');
    expect(result.composite.core.thickness).toBe(18);
    expect(result.composite.totalThickness).toBe(18);
  });

  it('should build stack with surface layers', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-006',
        name: 'Laminated Panel',
        role: 'TOP',
        finishWidth: 600,
        finishHeight: 800,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'vertical',
        edges: {},
        surfaceA: {
          materialId: 'HPL_WHITE',
          name: 'HPL White',
          thickness: 0.8,
        },
        surfaceB: {
          materialId: 'HPL_BROWN',
          name: 'HPL Brown',
          thickness: 0.8,
        },
      },
    });

    const result = flatPartFromPanel(input);

    expect(result.composite.surfaceA?.materialId).toBe('HPL_WHITE');
    expect(result.composite.surfaceA?.thickness).toBe(0.8);
    expect(result.composite.surfaceB?.materialId).toBe('HPL_BROWN');
    expect(result.composite.totalThickness).toBe(19.6); // 18 + 0.8 + 0.8
  });
});

// ============================================================================
// Feature Building Tests
// ============================================================================

describe('Feature Building', () => {
  it('should build drill features from operations', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'drill_vertical', x: 50, y: 100, diameter: 5, depth: 13, isThrough: false, face: 'A' },
        { type: 'drill_vertical', x: 50, y: 132, diameter: 5, depth: 13, isThrough: false, face: 'A' },
        { type: 'drill_vertical', x: 50, y: 164, diameter: 5, depth: 13, isThrough: false, face: 'A' },
      ],
    });

    const result = flatPartFromPanel(input);

    expect(result.drills).toHaveLength(3);
    expect(result.drills[0].diameter).toBe(5);
    expect(result.drills[0].depth).toBe(13);
    expect(result.computed.drillCount).toBe(3);
  });

  it('should build hinge cup features', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'hinge_cup', x: 23, y: 100, diameter: 35, depth: 13, face: 'B' },
        { type: 'hinge_cup', x: 23, y: 700, diameter: 35, depth: 13, face: 'B' },
      ],
    });

    const result = flatPartFromPanel(input);

    expect(result.drills).toHaveLength(2);
    expect(result.drills[0].purpose).toBe('hinge_cup');
    expect(result.drills[0].diameter).toBe(35);
    expect(result.drills[0].face).toBe('B');
  });

  it('should build groove features', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'groove', axis: 'y', position: 580, start: 0, length: 800, width: 6, depth: 8, face: 'A' },
      ],
    });

    const result = flatPartFromPanel(input);

    expect(result.grooves).toHaveLength(1);
    expect(result.grooves[0].axis).toBe('y');
    expect(result.grooves[0].width).toBe(6);
    expect(result.grooves[0].depth).toBe(8);
  });

  it('should build pocket features', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'pocket', x: 100, y: 200, width: 50, height: 30, depth: 5, cornerRadius: 3, face: 'A' },
      ],
    });

    const result = flatPartFromPanel(input);

    expect(result.pockets).toHaveLength(1);
    expect(result.pockets[0].width).toBe(50);
    expect(result.pockets[0].height).toBe(30);
    expect(result.pockets[0].cornerRadius).toBe(3);
  });

  it('should handle mixed operations', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'drill_vertical', x: 50, y: 100, diameter: 5, depth: 13, face: 'A' },
        { type: 'groove', axis: 'y', position: 580, start: 0, length: 800, width: 6, depth: 8, face: 'A' },
        { type: 'hinge_cup', x: 23, y: 100, diameter: 35, depth: 13, face: 'B' },
      ],
    });

    const result = flatPartFromPanel(input);

    expect(result.drills).toHaveLength(2); // drill + hinge_cup
    expect(result.grooves).toHaveLength(1);
    expect(result.pockets).toHaveLength(0);
  });
});

// ============================================================================
// Computed Values Tests
// ============================================================================

describe('Computed Values', () => {
  it('should calculate surface area correctly', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    // Surface area = cutWidth * cutHeight / 1_000_000 (m²)
    const expectedArea = (599 * 799) / 1_000_000;
    expect(result.computed.surfaceArea).toBeCloseTo(expectedArea, 5);
  });

  it('should calculate banded edge length correctly', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    // Banded edge length = (2 * cutWidth + 2 * cutHeight) / 1000 (m)
    const expectedLength = (599 + 599 + 799 + 799) / 1000;
    expect(result.computed.bandedEdgeLength).toBeCloseTo(expectedLength, 3);
  });

  it('should count drill features correctly', () => {
    const input = createMockPanelInput({
      operations: [
        { type: 'drill_vertical', x: 50, y: 100, diameter: 5, depth: 13, face: 'A' },
        { type: 'drill_vertical', x: 50, y: 132, diameter: 5, depth: 13, face: 'A' },
      ],
    });

    const result = flatPartFromPanel(input);
    expect(result.computed.drillCount).toBe(2);
  });
});

// ============================================================================
// Part Number Generation Tests
// ============================================================================

describe('Part Number Generation', () => {
  it('should generate part number from cabinet ID and role', () => {
    const input = createMockPanelInput();
    const result = flatPartFromPanel(input);

    // Part number format: [last 6 chars of cabinetId]-[role initials]
    // cabinet-001 -> ET-001, LEFT_SIDE -> LS
    expect(result.partNumber).toMatch(/^[A-Z0-9-]+-[A-Z]+$/);
    expect(result.partNumber).toContain('LS'); // LEFT_SIDE
  });

  it('should generate different part numbers for different roles', () => {
    const sideInput = createMockPanelInput({ panel: { ...createMockPanelInput().panel, role: 'LEFT_SIDE' } });
    const topInput = createMockPanelInput({ panel: { ...createMockPanelInput().panel, role: 'TOP' } });
    const shelfInput = createMockPanelInput({ panel: { ...createMockPanelInput().panel, role: 'SHELF' } });

    const sideResult = flatPartFromPanel(sideInput);
    const topResult = flatPartFromPanel(topInput);
    const shelfResult = flatPartFromPanel(shelfInput);

    expect(sideResult.partNumber).toContain('LS'); // LEFT_SIDE
    expect(topResult.partNumber).toContain('T');   // TOP
    expect(shelfResult.partNumber).toContain('S'); // SHELF
  });
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

describe('Batch Processing', () => {
  it('should build flat parts for multiple panels', () => {
    const panels = [
      {
        id: 'panel-001',
        name: 'Left Side',
        role: 'LEFT_SIDE',
        finishWidth: 600,
        finishHeight: 800,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'vertical' as const,
        edges: {},
      },
      {
        id: 'panel-002',
        name: 'Right Side',
        role: 'RIGHT_SIDE',
        finishWidth: 600,
        finishHeight: 800,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'vertical' as const,
        edges: {},
      },
      {
        id: 'panel-003',
        name: 'Top',
        role: 'TOP',
        finishWidth: 564,
        finishHeight: 600,
        coreThickness: 18,
        coreMaterialId: 'MDF_18',
        coreMaterialName: 'MDF 18mm',
        grainDirection: 'horizontal' as const,
        edges: {},
      },
    ];

    const results = flatPartsFromCabinet('cabinet-001', panels, 0.5);

    expect(results).toHaveLength(3);
    expect(results[0].sourcePanelRole).toBe('LEFT_SIDE');
    expect(results[1].sourcePanelRole).toBe('RIGHT_SIDE');
    expect(results[2].sourcePanelRole).toBe('TOP');
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  it('should handle very thin panels', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-thin',
        name: 'Thin Panel',
        role: 'BACK',
        finishWidth: 500,
        finishHeight: 600,
        coreThickness: 3,
        coreMaterialId: 'HMR_3',
        coreMaterialName: 'HMR 3mm',
        grainDirection: 'none',
        edges: {},
      },
    });

    const result = flatPartFromPanel(input);
    expect(result.composite.core.thickness).toBe(3);
  });

  it('should handle large panels', () => {
    const input = createMockPanelInput({
      panel: {
        id: 'panel-large',
        name: 'Large Panel',
        role: 'TOP',
        finishWidth: 2800,
        finishHeight: 1200,
        coreThickness: 25,
        coreMaterialId: 'MDF_25',
        coreMaterialName: 'MDF 25mm',
        grainDirection: 'horizontal',
        edges: {},
      },
    });

    const result = flatPartFromPanel(input);
    expect(result.finishWidth).toBe(2800);
    expect(result.finishHeight).toBe(1200);
  });

  it('should handle zero preMill', () => {
    const input = createMockPanelInput({ preMill: 0 });
    const result = flatPartFromPanel(input);

    // CutWidth = 600 - 1 - 1 + 0 = 598
    expect(result.cutWidth).toBe(598);
    expect(result.manufacturing.preMill).toBe(0);
  });

  it('should include quantity and notes in manufacturing meta', () => {
    const input = createMockPanelInput({
      quantity: 2,
      notes: 'Handle with care',
    });

    const result = flatPartFromPanel(input);
    expect(result.manufacturing.quantity).toBe(2);
    expect(result.manufacturing.notes).toBe('Handle with care');
  });
});
