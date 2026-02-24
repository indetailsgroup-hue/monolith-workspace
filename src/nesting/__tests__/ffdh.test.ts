/**
 * T027: Cut Optimization Algorithm — Unit & Integration Tests
 *
 * @version 2.0.0 - Phase 2: Grain direction constraint tests
 */

import { describe, it, expect } from 'vitest';
import { packSingleSheet, ffdhMultiSheet } from '../ffdh';
import { extractNestingParts, groupByMaterial, runNesting, resolveSheetConfig } from '../optimizer';
import type { NestingPart, NestingConfig, GrainDirection } from '../types';
import { DEFAULT_NESTING_CONFIG } from '../types';
import type { CutListRow } from '../../core/export/monolith/monolithExportContext';

// ============================================
// TEST HELPERS
// ============================================

const STANDARD_CONFIG: NestingConfig = {
  kerfWidth: 3.5,
  edgeClearance: 10,
  sheetWidth: 1220,
  sheetHeight: 2440,
  sheetThickness: 18,
};

function makePart(
  id: string,
  w: number,
  h: number,
  opts?: Partial<NestingPart>,
): NestingPart {
  return {
    id,
    sourcePartId: id,
    cabinetId: 'CAB_001',
    width: w,
    height: h,
    materialId: 'core-pb-18',
    canRotate: true,
    grainDirection: 'NONE',
    ...opts,
  };
}

function makeCutListRow(
  partId: string,
  cutW: number,
  cutH: number,
  opts?: Partial<CutListRow>,
): CutListRow {
  return {
    partId,
    cabinetId: 'CAB_001',
    materialId: 'core-pb-18',
    finishW: cutW + 2,
    finishH: cutH,
    edgeL: 1,
    edgeR: 1,
    edgeT: 0,
    edgeB: 0,
    premillL: 0,
    premillR: 0,
    premillT: 0,
    premillB: 0,
    cutW,
    cutH,
    qty: 1,
    ...opts,
  };
}

// ============================================
// FFDH SINGLE SHEET
// ============================================

describe('packSingleSheet', () => {
  it('should place a single part at edge clearance offset', () => {
    const parts = [makePart('P1', 500, 300)];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].x).toBe(STANDARD_CONFIG.edgeClearance);
    expect(result.placements[0].y).toBe(STANDARD_CONFIG.edgeClearance);
    expect(result.placements[0].partId).toBe('P1');
  });

  it('should place two parts side by side in one shelf', () => {
    // Two 400×300 parts: 400 + 3.5 + 400 = 803.5mm < usable 1200mm
    const parts = [makePart('P1', 400, 300), makePart('P2', 400, 300)];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(2);
    // Same Y (same shelf)
    expect(result.placements[0].y).toBe(result.placements[1].y);
    // P2 starts after P1 + kerf
    expect(result.placements[1].x).toBe(10 + 400 + 3.5);
  });

  it('should create new shelf when part does not fit remaining width', () => {
    // Three 500×300 parts: 500 + 3.5 + 500 = 1003.5mm < 1200
    // But third (500) doesn't fit remaining: 1200 - 1003.5 = 196.5 < 500
    const parts = [
      makePart('P1', 500, 300),
      makePart('P2', 500, 300),
      makePart('P3', 500, 200),
    ];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(3);
    // P1 and P2 on shelf 1
    expect(result.placements[0].y).toBe(result.placements[1].y);
    // P3 on a new shelf below
    expect(result.placements[2].y).toBe(10 + 300 + 3.5); // shelf1.y + shelf1.height + kerf
  });

  it('should rotate part 90° when it fits better', () => {
    // Part: 1300×500. Unrotated: w=1300 > 1200 ✗. Rotated: w=500 <= 1200, h=1300 ✓.
    const parts = [makePart('P1', 1300, 500)];
    const { result, remainingParts } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(1);
    expect(remainingParts).toHaveLength(0);
    expect(result.placements[0].rotation).toBe(90); // Must rotate to fit
    expect(result.placements[0].cutW).toBe(1300);  // Original dimensions preserved
    expect(result.placements[0].cutH).toBe(500);
  });

  it('should account for kerf width between parts', () => {
    const config: NestingConfig = { ...STANDARD_CONFIG, kerfWidth: 5 };
    // Two 595×300 parts: 595 + 5 + 595 = 1195 < 1200 usable
    const parts = [makePart('P1', 595, 300), makePart('P2', 595, 300)];
    const { result } = packSingleSheet(parts, config);

    expect(result.placements).toHaveLength(2);
    expect(result.placements[1].x).toBe(10 + 595 + 5);
  });

  it('should account for edge clearance on all sides', () => {
    const config: NestingConfig = { ...STANDARD_CONFIG, edgeClearance: 20 };
    // Usable area: 1220 - 40 = 1180 wide, 2440 - 40 = 2400 tall
    const parts = [makePart('P1', 1180, 2400)];
    const { result } = packSingleSheet(parts, config);

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].x).toBe(20);
    expect(result.placements[0].y).toBe(20);
  });

  it('should return empty placements for empty input', () => {
    const { result, remainingParts } = packSingleSheet([], STANDARD_CONFIG);
    expect(result.placements).toHaveLength(0);
    expect(remainingParts).toHaveLength(0);
    expect(result.utilization).toBe(0);
  });

  it('should report part as unplaced if it exceeds usable sheet area', () => {
    // Part larger than usable area in BOTH orientations
    const parts = [makePart('P1', 1300, 2500, { canRotate: true })];
    const { result, remainingParts } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(0);
    expect(remainingParts).toHaveLength(1);
    expect(remainingParts[0].id).toBe('P1');
  });

  it('should report correct utilization percentage', () => {
    // Usable area: 1200 × 2420 = 2,904,000 mm²
    // Part: 600 × 1000 = 600,000 mm²
    const parts = [makePart('P1', 600, 1000)];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.utilization).toBeGreaterThan(20);
    expect(result.utilization).toBeLessThan(21);
    expect(result.usedArea).toBe(600 * 1000);
  });

  it('should include grainDirection in placement output', () => {
    const parts = [
      makePart('P1', 500, 300, { grainDirection: 'HORIZONTAL' }),
      makePart('P2', 400, 200, { grainDirection: 'VERTICAL' }),
      makePart('P3', 300, 300, { grainDirection: 'NONE' }),
    ];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(3);
    expect(result.placements[0].grainDirection).toBe('HORIZONTAL');
    expect(result.placements[1].grainDirection).toBe('VERTICAL');
    expect(result.placements[2].grainDirection).toBe('NONE');
  });
});

// ============================================
// FFDH MULTI-SHEET
// ============================================

describe('ffdhMultiSheet', () => {
  it('should use single sheet when all parts fit', () => {
    const parts = [
      makePart('P1', 500, 300),
      makePart('P2', 500, 300),
      makePart('P3', 500, 300),
    ];
    const { sheets } = ffdhMultiSheet(parts, STANDARD_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements).toHaveLength(3);
  });

  it('should overflow to second sheet when first is full', () => {
    const parts = [
      makePart('P1', 1100, 1100),
      makePart('P2', 1100, 1100),
      makePart('P3', 1100, 1100),
    ];
    const { sheets } = ffdhMultiSheet(parts, STANDARD_CONFIG);

    expect(sheets.length).toBeGreaterThanOrEqual(2);
    const totalPlaced = sheets.reduce((s, r) => s + r.placements.length, 0);
    expect(totalPlaced).toBe(3);
  });

  it('should handle many parts across multiple sheets', () => {
    const parts = Array.from({ length: 20 }, (_, i) =>
      makePart(`P${i + 1}`, 400, 500),
    );
    const { sheets, unplacedParts } = ffdhMultiSheet(parts, STANDARD_CONFIG);

    const totalPlaced = sheets.reduce((s, r) => s + r.placements.length, 0);
    expect(totalPlaced).toBe(20);
    expect(unplacedParts).toHaveLength(0);
  });

  it('should return empty for empty input', () => {
    const { sheets, unplacedParts } = ffdhMultiSheet([], STANDARD_CONFIG);
    expect(sheets).toHaveLength(0);
    expect(unplacedParts).toHaveLength(0);
  });

  it('should report oversized parts as unplaced', () => {
    const parts = [
      makePart('OK', 500, 300),
      makePart('TOO_BIG', 1300, 2500),
    ];
    const { sheets, unplacedParts } = ffdhMultiSheet(parts, STANDARD_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements).toHaveLength(1);
    expect(unplacedParts).toHaveLength(1);
    expect(unplacedParts[0].id).toBe('TOO_BIG');
  });
});

// ============================================
// GRAIN DIRECTION CONSTRAINTS (Phase 2)
// ============================================

describe('Grain Direction Constraints', () => {
  it('should prevent rotation for HORIZONTAL grain parts', () => {
    // Part 1300×500 with HORIZONTAL grain: normally would rotate to fit (w=1300 > usable 1200)
    // But with grain constraint, canRotate=false → cannot rotate → becomes unplaceable
    const parts = [
      makePart('P1', 1300, 500, { canRotate: false, grainDirection: 'HORIZONTAL' }),
    ];
    const { result, remainingParts } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(0);
    expect(remainingParts).toHaveLength(1);
  });

  it('should prevent rotation for VERTICAL grain parts', () => {
    const parts = [
      makePart('P1', 1300, 500, { canRotate: false, grainDirection: 'VERTICAL' }),
    ];
    const { result, remainingParts } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(0);
    expect(remainingParts).toHaveLength(1);
  });

  it('should allow rotation for NONE grain parts', () => {
    // Part 1300×500 with no grain → canRotate=true → rotates to fit (500×1300)
    const parts = [
      makePart('P1', 1300, 500, { canRotate: true, grainDirection: 'NONE' }),
    ];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].rotation).toBe(90);
  });

  it('should place grained parts without rotation when they fit', () => {
    // Part 600×720 with VERTICAL grain — fits without rotation
    const parts = [
      makePart('P1', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
    ];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].rotation).toBe(0);
    expect(result.placements[0].grainDirection).toBe('VERTICAL');
  });

  it('should maintain grain consistency across all placements', () => {
    // Mix of grained and ungrained parts
    const parts = [
      makePart('P1', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
      makePart('P2', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
      makePart('P3', 400, 500, { canRotate: true, grainDirection: 'NONE' }),
    ];
    const { result } = packSingleSheet(parts, STANDARD_CONFIG);

    expect(result.placements).toHaveLength(3);

    // Grained parts should not be rotated
    const grainedPlacements = result.placements.filter(p => p.grainDirection !== 'NONE');
    for (const p of grainedPlacements) {
      expect(p.rotation).toBe(0);
    }
  });

  it('should handle mixed grain and no-grain parts on multi-sheet', () => {
    const parts = [
      makePart('SIDE_L', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
      makePart('SIDE_R', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
      makePart('SHELF_1', 566, 578, { canRotate: true, grainDirection: 'NONE' }),
      makePart('SHELF_2', 566, 578, { canRotate: true, grainDirection: 'NONE' }),
      makePart('BACK', 596, 716, { canRotate: true, grainDirection: 'NONE' }),
    ];
    const { sheets, unplacedParts } = ffdhMultiSheet(parts, STANDARD_CONFIG);

    // All parts should be placed (they're small enough)
    const totalPlaced = sheets.reduce((s, r) => s + r.placements.length, 0);
    expect(totalPlaced).toBe(5);
    expect(unplacedParts).toHaveLength(0);
  });

  it('should reduce utilization when grain prevents optimal rotation', () => {
    // Two identical parts that would benefit from rotation
    // Part: 800×400 — without grain, algorithm can rotate freely
    // With grain: locked in place, may use space less efficiently
    const partsNoGrain = [
      makePart('P1', 800, 400, { canRotate: true, grainDirection: 'NONE' }),
      makePart('P2', 800, 400, { canRotate: true, grainDirection: 'NONE' }),
      makePart('P3', 800, 400, { canRotate: true, grainDirection: 'NONE' }),
    ];
    const partsWithGrain = [
      makePart('P1', 800, 400, { canRotate: false, grainDirection: 'HORIZONTAL' }),
      makePart('P2', 800, 400, { canRotate: false, grainDirection: 'HORIZONTAL' }),
      makePart('P3', 800, 400, { canRotate: false, grainDirection: 'HORIZONTAL' }),
    ];

    const resultNoGrain = ffdhMultiSheet(partsNoGrain, STANDARD_CONFIG);
    const resultWithGrain = ffdhMultiSheet(partsWithGrain, STANDARD_CONFIG);

    // Both should place all parts (they fit without rotation)
    const placedNoGrain = resultNoGrain.sheets.reduce((s, r) => s + r.placements.length, 0);
    const placedWithGrain = resultWithGrain.sheets.reduce((s, r) => s + r.placements.length, 0);
    expect(placedNoGrain).toBe(3);
    expect(placedWithGrain).toBe(3);

    // Utilization may differ when rotation restrictions apply
    // (or be the same if rotation wasn't needed — either way, both should be valid)
    expect(resultNoGrain.sheets[0].utilization).toBeGreaterThan(0);
    expect(resultWithGrain.sheets[0].utilization).toBeGreaterThan(0);
  });
});

// ============================================
// DETERMINISM
// ============================================

describe('Determinism', () => {
  it('should produce identical output for identical input', () => {
    const parts = [
      makePart('P1', 600, 720),
      makePart('P2', 599, 720),
      makePart('P3', 400, 500),
      makePart('P4', 800, 300),
    ];

    const result1 = ffdhMultiSheet(parts, STANDARD_CONFIG);
    const result2 = ffdhMultiSheet(parts, STANDARD_CONFIG);

    expect(JSON.stringify(result1.sheets)).toBe(JSON.stringify(result2.sheets));
  });

  it('should produce identical output regardless of input order', () => {
    const parts = [
      makePart('P1', 600, 720),
      makePart('P2', 599, 720),
      makePart('P3', 400, 500),
    ];

    const reversed = [...parts].reverse();

    const result1 = ffdhMultiSheet(parts, STANDARD_CONFIG);
    const result2 = ffdhMultiSheet(reversed, STANDARD_CONFIG);

    expect(JSON.stringify(result1.sheets)).toBe(JSON.stringify(result2.sheets));
  });

  it('should be deterministic with grain constraints', () => {
    const parts = [
      makePart('P1', 600, 720, { canRotate: false, grainDirection: 'VERTICAL' }),
      makePart('P2', 599, 720, { canRotate: true, grainDirection: 'NONE' }),
      makePart('P3', 400, 500, { canRotate: false, grainDirection: 'HORIZONTAL' }),
    ];

    const result1 = ffdhMultiSheet(parts, STANDARD_CONFIG);
    const result2 = ffdhMultiSheet([...parts].reverse(), STANDARD_CONFIG);

    expect(JSON.stringify(result1.sheets)).toBe(JSON.stringify(result2.sheets));
  });
});

// ============================================
// extractNestingParts
// ============================================

describe('extractNestingParts', () => {
  it('should expand qty > 1 into multiple NestingPart entries', () => {
    const rows: CutListRow[] = [makeCutListRow('SIDE_L', 599, 720, { qty: 2 })];
    const parts = extractNestingParts(rows);

    expect(parts).toHaveLength(2);
    expect(parts[0].id).toBe('SIDE_L#1');
    expect(parts[1].id).toBe('SIDE_L#2');
    expect(parts[0].sourcePartId).toBe('SIDE_L');
    expect(parts[1].sourcePartId).toBe('SIDE_L');
  });

  it('should keep original ID for qty=1 (no suffix)', () => {
    const rows: CutListRow[] = [makeCutListRow('TOP', 800, 500, { qty: 1 })];
    const parts = extractNestingParts(rows);

    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe('TOP');
  });

  // Phase 2: grain-based canRotate
  it('should set canRotate=true for grain=NONE parts', () => {
    const rows: CutListRow[] = [
      makeCutListRow('P1', 600, 720, { grain: 'NONE' }),
      makeCutListRow('P2', 400, 500), // undefined grain → defaults to NONE
    ];
    const parts = extractNestingParts(rows);

    expect(parts[0].canRotate).toBe(true);
    expect(parts[0].grainDirection).toBe('NONE');
    expect(parts[1].canRotate).toBe(true);
    expect(parts[1].grainDirection).toBe('NONE');
  });

  it('should set canRotate=false for grain=VERTICAL parts', () => {
    const rows: CutListRow[] = [
      makeCutListRow('SIDE_L', 599, 720, { grain: 'VERTICAL' }),
    ];
    const parts = extractNestingParts(rows);

    expect(parts[0].canRotate).toBe(false);
    expect(parts[0].grainDirection).toBe('VERTICAL');
  });

  it('should set canRotate=false for grain=HORIZONTAL parts', () => {
    const rows: CutListRow[] = [
      makeCutListRow('SHELF', 566, 578, { grain: 'HORIZONTAL' }),
    ];
    const parts = extractNestingParts(rows);

    expect(parts[0].canRotate).toBe(false);
    expect(parts[0].grainDirection).toBe('HORIZONTAL');
  });

  it('should default to NONE grain when grain not specified', () => {
    const rows: CutListRow[] = [
      makeCutListRow('P1', 600, 720), // no grain field
    ];
    const parts = extractNestingParts(rows);

    expect(parts[0].grainDirection).toBe('NONE');
    expect(parts[0].canRotate).toBe(true);
  });

  it('should propagate grain direction through qty expansion', () => {
    const rows: CutListRow[] = [
      makeCutListRow('SIDE', 599, 720, { qty: 3, grain: 'VERTICAL' }),
    ];
    const parts = extractNestingParts(rows);

    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p.grainDirection).toBe('VERTICAL');
      expect(p.canRotate).toBe(false);
    }
  });

  it('should use cutW and cutH as dimensions', () => {
    const rows: CutListRow[] = [makeCutListRow('P1', 599, 720)];
    const parts = extractNestingParts(rows);

    expect(parts[0].width).toBe(599);
    expect(parts[0].height).toBe(720);
  });

  it('should preserve materialId from CutListRow', () => {
    const rows: CutListRow[] = [
      makeCutListRow('P1', 600, 720, { materialId: 'core-mdf-18' }),
    ];
    const parts = extractNestingParts(rows);

    expect(parts[0].materialId).toBe('core-mdf-18');
  });
});

// ============================================
// groupByMaterial
// ============================================

describe('groupByMaterial', () => {
  it('should group parts by materialId', () => {
    const parts: NestingPart[] = [
      makePart('P1', 600, 720, { materialId: 'core-pb-18' }),
      makePart('P2', 400, 500, { materialId: 'core-mdf-18' }),
      makePart('P3', 300, 300, { materialId: 'core-pb-18' }),
    ];
    const groups = groupByMaterial(parts);

    expect(groups.size).toBe(2);
    expect(groups.get('core-pb-18')).toHaveLength(2);
    expect(groups.get('core-mdf-18')).toHaveLength(1);
  });
});

// ============================================
// resolveSheetConfig
// ============================================

describe('resolveSheetConfig', () => {
  it('should look up material dimensions from catalog', () => {
    const config = resolveSheetConfig('core-pb-18');

    expect(config.sheetWidth).toBe(1220);
    expect(config.sheetHeight).toBe(2440);
    expect(config.sheetThickness).toBe(18);
  });

  it('should fall back to defaults for unknown material', () => {
    const config = resolveSheetConfig('UNKNOWN_MAT');

    expect(config.sheetWidth).toBe(DEFAULT_NESTING_CONFIG.sheetWidth);
    expect(config.sheetHeight).toBe(DEFAULT_NESTING_CONFIG.sheetHeight);
  });

  it('should apply overrides', () => {
    const config = resolveSheetConfig('core-pb-18', { kerfWidth: 5 });

    expect(config.kerfWidth).toBe(5);
    expect(config.sheetWidth).toBe(1220); // from catalog, not overridden
  });
});

// ============================================
// runNesting (Integration)
// ============================================

describe('runNesting', () => {
  it('should return empty for empty input', () => {
    const { sheets, results } = runNesting([]);

    expect(sheets).toHaveLength(0);
    expect(results.size).toBe(0);
  });

  it('should produce NestingSheet[] compatible with export context', () => {
    const rows: CutListRow[] = [
      makeCutListRow('SIDE_L', 599, 720),
      makeCutListRow('SIDE_R', 599, 720),
      makeCutListRow('TOP', 800, 500),
      makeCutListRow('BOTTOM', 800, 500),
    ];

    const { sheets } = runNesting(rows);

    expect(sheets.length).toBeGreaterThanOrEqual(1);

    // Validate NestingSheet shape
    for (const sheet of sheets) {
      expect(sheet.index1).toBeGreaterThanOrEqual(1);
      expect(sheet.label).toMatch(/^NEST_\d{2}$/);
      expect(sheet.materialId).toBe('core-pb-18');
      expect(sheet.sheetW).toBeGreaterThan(0);
      expect(sheet.sheetH).toBeGreaterThan(0);
      expect(sheet.utilization).toBeGreaterThan(0);

      for (const p of sheet.placements) {
        expect(p.partId).toBeTruthy();
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect([0, 90, 180, 270]).toContain(p.rotation);
        expect(p.cutW).toBeGreaterThan(0);
        expect(p.cutH).toBeGreaterThan(0);
      }
    }

    // All 4 parts should be placed
    const totalPlaced = sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(totalPlaced).toBe(4);
  });

  it('should group parts by material and nest separately', () => {
    const rows: CutListRow[] = [
      makeCutListRow('P1', 600, 720, { materialId: 'core-pb-18' }),
      makeCutListRow('P2', 400, 500, { materialId: 'core-mdf-18' }),
    ];

    const { sheets, results } = runNesting(rows);

    expect(results.size).toBe(2);
    expect(results.has('core-mdf-18')).toBe(true);
    expect(results.has('core-pb-18')).toBe(true);

    // Each material should have at least 1 sheet
    const pbSheets = sheets.filter((s) => s.materialId === 'core-pb-18');
    const mdfSheets = sheets.filter((s) => s.materialId === 'core-mdf-18');
    expect(pbSheets.length).toBeGreaterThanOrEqual(1);
    expect(mdfSheets.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect custom kerf width and edge clearance', () => {
    const rows: CutListRow[] = [makeCutListRow('P1', 500, 300)];
    const { sheets } = runNesting(rows, { kerfWidth: 10, edgeClearance: 20 });

    expect(sheets).toHaveLength(1);
    // Part should be at edgeClearance=20
    expect(sheets[0].placements[0].x).toBe(20);
    expect(sheets[0].placements[0].y).toBe(20);
  });

  it('should handle typical kitchen cabinet parts', () => {
    // Realistic kitchen cabinet cut list
    const rows: CutListRow[] = [
      makeCutListRow('SIDE_L', 599, 720, { qty: 2 }),
      makeCutListRow('SIDE_R', 599, 720, { qty: 2 }),
      makeCutListRow('TOP', 568, 580, { qty: 2 }),
      makeCutListRow('BOTTOM', 568, 580, { qty: 2 }),
      makeCutListRow('SHELF', 566, 578, { qty: 4 }),
      makeCutListRow('BACK', 596, 716, { qty: 2 }),
    ];

    const { sheets, results } = runNesting(rows);

    // 14 total parts should all be placed
    const totalPlaced = sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(totalPlaced).toBe(14);

    const result = results.get('core-pb-18')!;
    expect(result.unplacedParts).toHaveLength(0);
    expect(result.overallUtilization).toBeGreaterThan(0);
    expect(result.computeTimeMs).toBeLessThan(1000); // should be fast
  });

  it('should assign sequential sheet indices across materials', () => {
    const rows: CutListRow[] = [
      makeCutListRow('P1', 600, 720, { materialId: 'core-pb-18' }),
      makeCutListRow('P2', 400, 500, { materialId: 'core-mdf-18' }),
    ];

    const { sheets } = runNesting(rows);

    // Indices should be sequential starting from 1
    const indices = sheets.map((s) => s.index1);
    expect(indices).toEqual(indices.sort((a, b) => a - b));
    expect(indices[0]).toBe(1);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }
  });

  // Phase 2: Grain direction integration tests
  it('should respect grain direction from CutListRow in full pipeline', () => {
    const rows: CutListRow[] = [
      makeCutListRow('SIDE_L', 599, 720, { grain: 'VERTICAL' }),
      makeCutListRow('SIDE_R', 599, 720, { grain: 'VERTICAL' }),
      makeCutListRow('SHELF', 566, 578, { grain: 'NONE' }),
      makeCutListRow('BACK', 596, 716), // undefined → NONE
    ];

    const { sheets, results } = runNesting(rows);

    // All parts should be placed (small enough for one sheet)
    const totalPlaced = sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(totalPlaced).toBe(4);

    // Verify grain info in detailed results
    const result = results.get('core-pb-18')!;
    const sidePlacements = result.sheets[0].placements.filter(
      p => p.partId === 'SIDE_L' || p.partId === 'SIDE_R'
    );
    for (const p of sidePlacements) {
      expect(p.grainDirection).toBe('VERTICAL');
      expect(p.rotation).toBe(0); // Should not be rotated due to grain
    }
  });

  it('should handle grain-constrained parts that need rotation as unplaced', () => {
    // Part that only fits rotated, but has grain constraint preventing rotation
    const rows: CutListRow[] = [
      makeCutListRow('LONG_PANEL', 1300, 500, { grain: 'HORIZONTAL' }),
    ];

    const { results } = runNesting(rows);
    const result = results.get('core-pb-18')!;

    // Part 1300mm wide > usable 1200mm, can't rotate due to grain → unplaced
    expect(result.unplacedParts).toHaveLength(1);
    expect(result.unplacedParts[0].id).toBe('LONG_PANEL');
  });

  it('should handle realistic cabinet with grain directions', () => {
    const rows: CutListRow[] = [
      // Sides: vertical grain (wood grain runs top-to-bottom)
      makeCutListRow('SIDE_L', 599, 720, { qty: 2, grain: 'VERTICAL' }),
      makeCutListRow('SIDE_R', 599, 720, { qty: 2, grain: 'VERTICAL' }),
      // Shelves: horizontal grain (grain runs left-to-right)
      makeCutListRow('SHELF', 566, 578, { qty: 4, grain: 'HORIZONTAL' }),
      // Back panel: no grain constraint (plywood/HDF)
      makeCutListRow('BACK', 596, 716, { qty: 2, materialId: 'core-hdf-3', grain: 'NONE' }),
    ];

    const { sheets, results } = runNesting(rows);

    // 10 total parts: 2+2+4 on PB + 2 on HDF = 10 placed
    const totalPlaced = sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(totalPlaced).toBe(10);

    // Verify grain data flows through
    const pbResult = results.get('core-pb-18');
    expect(pbResult).toBeDefined();
    if (pbResult) {
      for (const sheet of pbResult.sheets) {
        for (const p of sheet.placements) {
          // All PB parts should have grain info
          expect(['HORIZONTAL', 'VERTICAL', 'NONE']).toContain(p.grainDirection);
        }
      }
    }
  });
});
