/**
 * CHARACTERISATION TESTS — src/nesting
 *
 * These tests PIN THE BEHAVIOUR THE CODE ACTUALLY HAS. They are not a
 * specification of desired behaviour. Where the pinned behaviour is judged a
 * DEFECT the test says so in its name and comment, so that a future change
 * which flips it is a deliberate, visible edit rather than a silent regression.
 *
 * Scope pinned here:
 *   1. a part that fits normally
 *   2. a part that fits only when rotated
 *   3. a part that fits no sheet in any orientation (the 2440mm worktop slab)
 *   4. a mixed-grainDirection batch
 *   5. geometric validity of the placements that ARE produced
 *
 * Sheet size note: runNesting resolves the sheet from the MATERIAL CATALOG
 * (CORE_MATERIALS_CATALOG), not from DEFAULT_NESTING_CONFIG and not from the
 * machine profile. For 'core-pb-18' that is 1230 x 2450 mm, i.e. 1210 x 2430
 * usable after the 10mm edge clearance. See the report for the four
 * disagreeing sheet-size constants in this repo.
 */

import { describe, it, expect } from 'vitest';
import { ffdhMultiSheet } from '../ffdh';
import { runNesting, resolveSheetConfig } from '../optimizer';
import { DEFAULT_NESTING_CONFIG } from '../types';
import type { NestingPart } from '../types';
import type {
  CutListRow,
  NestingSheet,
} from '../../core/export/monolith/monolithExportContext';

// ============================================
// HELPERS
// ============================================

function row(
  partId: string,
  cutW: number,
  cutH: number,
  opts?: Partial<CutListRow>,
): CutListRow {
  return {
    partId,
    cabinetId: 'CAB_001',
    materialId: 'core-pb-18',
    finishW: cutW,
    finishH: cutH,
    edgeL: 0,
    edgeR: 0,
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

function part(
  id: string,
  width: number,
  height: number,
  opts?: Partial<NestingPart>,
): NestingPart {
  return {
    id,
    sourcePartId: id,
    cabinetId: 'CAB_001',
    width,
    height,
    materialId: 'core-pb-18',
    canRotate: true,
    grainDirection: 'NONE',
    ...opts,
  };
}

/** Part ids that appear in the export-facing NestingSheet[] artifact. */
function placedIds(sheets: NestingSheet[]): string[] {
  return sheets.flatMap((s) => s.placements.map((p) => p.partId)).sort();
}

interface Rect {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectsOf(sheet: NestingSheet): Rect[] {
  return sheet.placements.map((p) => {
    const w = p.rotation === 90 || p.rotation === 270 ? p.cutH : p.cutW;
    const h = p.rotation === 90 || p.rotation === 270 ? p.cutW : p.cutH;
    return { id: p.partId, x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h };
  });
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Geometric validity: every placement stays inside the sheet's usable area and
 * no two placements overlap. Nothing in the pre-existing suite asserted this.
 */
function assertGeometricallyValid(sheet: NestingSheet, edgeClearance = 10): void {
  const rects = rectsOf(sheet);

  for (const r of rects) {
    expect(r.x0, `${r.id} left edge`).toBeGreaterThanOrEqual(edgeClearance);
    expect(r.y0, `${r.id} bottom edge`).toBeGreaterThanOrEqual(edgeClearance);
    expect(r.x1, `${r.id} right edge`).toBeLessThanOrEqual(
      sheet.sheetW - edgeClearance,
    );
    expect(r.y1, `${r.id} top edge`).toBeLessThanOrEqual(
      sheet.sheetH - edgeClearance,
    );
  }

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(
        overlaps(rects[i], rects[j]),
        `${rects[i].id} overlaps ${rects[j].id}`,
      ).toBe(false);
    }
  }
}

// ============================================
// 0. SHEET SIZE AUTHORITY
// ============================================

describe('CHARACTERISATION: which sheet size actually gets used', () => {
  it('pins that runNesting takes the sheet from the material catalog (1230x2450), NOT DEFAULT_NESTING_CONFIG (1220x2440)', () => {
    const cfg = resolveSheetConfig('core-pb-18');
    expect(cfg.sheetWidth).toBe(1230);
    expect(cfg.sheetHeight).toBe(2450);
    expect(cfg.sheetThickness).toBe(18);

    // The default the module advertises is a DIFFERENT board. Both constants
    // ship; only the catalog one is reachable from runNesting.
    expect(DEFAULT_NESTING_CONFIG.sheetWidth).toBe(1220);
    expect(DEFAULT_NESTING_CONFIG.sheetHeight).toBe(2440);

    // Unknown material falls back to the (unused-in-practice) default.
    const unknown = resolveSheetConfig('no-such-material');
    expect(unknown.sheetWidth).toBe(1220);
    expect(unknown.sheetHeight).toBe(2440);
  });

  it('pins that the resolved sheet size is carried onto every NestingSheet', () => {
    const { sheets } = runNesting([row('P1', 400, 500, { grain: 'NONE' })]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetW).toBe(1230);
    expect(sheets[0].sheetH).toBe(2450);
  });
});

// ============================================
// 1. A PART THAT FITS NORMALLY
// ============================================

describe('CHARACTERISATION: a part that fits without rotation', () => {
  it('is placed at the edge clearance origin, unrotated, and reported as placed', () => {
    const { sheets, results } = runNesting([
      row('SIDE_L', 600, 720, { grain: 'VERTICAL' }),
    ]);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements).toHaveLength(1);
    expect(sheets[0].placements[0]).toMatchObject({
      partId: 'SIDE_L',
      x: 10,
      y: 10,
      rotation: 0,
      cutW: 600,
      cutH: 720,
    });

    const res = results.get('core-pb-18')!;
    expect(res.unplacedParts).toEqual([]);
    expect(res.sheetsUsed).toBe(1);
    assertGeometricallyValid(sheets[0]);
  });

  it('expands qty into individually-placed parts with #n ids', () => {
    const { sheets } = runNesting([
      row('SIDE', 600, 720, { qty: 2, grain: 'VERTICAL' }),
    ]);
    expect(placedIds(sheets)).toEqual(['SIDE#1', 'SIDE#2']);
    sheets.forEach((s) => assertGeometricallyValid(s));
  });
});

// ============================================
// 2. A PART THAT FITS ONLY WHEN ROTATED
// ============================================

describe('CHARACTERISATION: a part that fits only when rotated', () => {
  // 1400mm exceeds the 1210mm usable width, so it can only be placed by
  // turning it 90 degrees. That is permitted ONLY because grain is NONE.
  it('is rotated 90 degrees when grain is NONE', () => {
    const { sheets, results } = runNesting([
      row('PANEL_WIDE', 1400, 500, { grain: 'NONE' }),
    ]);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements[0].rotation).toBe(90);
    // cutW/cutH stay the UNROTATED cut dimensions; only `rotation` records the turn.
    expect(sheets[0].placements[0].cutW).toBe(1400);
    expect(sheets[0].placements[0].cutH).toBe(500);
    expect(results.get('core-pb-18')!.unplacedParts).toEqual([]);
    assertGeometricallyValid(sheets[0]);
  });

  it('is NOT rotated when the same part carries a grain direction — it becomes unplaceable instead', () => {
    const { sheets, results } = runNesting([
      row('DOOR_WIDE', 1400, 500, { grain: 'VERTICAL' }),
    ]);

    // No sheet at all: the only part could not be placed.
    expect(sheets).toEqual([]);
    expect(results.get('core-pb-18')!.unplacedParts.map((p) => p.id)).toEqual([
      'DOOR_WIDE',
    ]);
  });
});

// ============================================
// 3. A PART THAT FITS NO SHEET IN ANY ORIENTATION
// ============================================

describe('CHARACTERISATION: a part that fits no sheet in any orientation', () => {
  // Usable height is 2450 - 2*10 = 2430mm. A 2440mm worktop slab therefore
  // fails in BOTH orientations, grain or no grain. This is a real part: a
  // full-length worktop run.
  it('a 2440mm worktop slab is unplaceable even with grain NONE and canRotate true', () => {
    const { sheets, results } = runNesting([
      row('WORKTOP_SLAB', 2440, 640, { grain: 'NONE' }),
    ]);

    expect(sheets).toEqual([]);
    const res = results.get('core-pb-18')!;
    expect(res.sheetsUsed).toBe(0);
    expect(res.unplacedParts.map((p) => p.id)).toEqual(['WORKTOP_SLAB']);
  });

  it('DEFECT PINNED: an unplaceable part is absent from the export-facing NestingSheet[] while the placeable ones look fine', () => {
    const { sheets, results } = runNesting([
      row('WORKTOP_SLAB', 2440, 640, { grain: 'NONE' }),
      row('DOOR_OK', 400, 700, { grain: 'NONE' }),
    ]);

    // The layout looks healthy...
    expect(sheets).toHaveLength(1);
    expect(placedIds(sheets)).toEqual(['DOOR_OK']);

    // ...but the most expensive part in the batch is simply not in it.
    expect(placedIds(sheets)).not.toContain('WORKTOP_SLAB');

    // The only place it survives is the detailed results map, which the
    // export-facing artifact does not carry.
    expect(results.get('core-pb-18')!.unplacedParts.map((p) => p.id)).toEqual([
      'WORKTOP_SLAB',
    ]);
  });

  it('a batch where NOTHING fits returns an empty sheet array rather than an error', () => {
    const { sheets, results } = runNesting([
      row('SLAB_A', 2440, 640, { grain: 'NONE' }),
      row('SLAB_B', 3000, 900, { grain: 'NONE' }),
    ]);

    expect(sheets).toEqual([]);
    expect(
      results.get('core-pb-18')!.unplacedParts.map((p) => p.id).sort(),
    ).toEqual(['SLAB_A', 'SLAB_B']);
  });

  it('a 3000x1500 panel — legal per the machine bed profile — is unplaceable on the 1230x2450 board', () => {
    // Two independent size authorities: useSpecStore's CENTATEQ P-110 profile
    // says maxWidth 3000 / maxHeight 1500; the board is 1230 x 2450. Nothing
    // in the codebase reconciles them.
    const { sheets, results } = runNesting([
      row('MACHINE_MAX', 3000, 1500, { grain: 'NONE' }),
    ]);
    expect(sheets).toEqual([]);
    expect(results.get('core-pb-18')!.unplacedParts.map((p) => p.id)).toEqual([
      'MACHINE_MAX',
    ]);
  });
});

// ============================================
// 4. MIXED GRAIN DIRECTIONS
// ============================================

describe('CHARACTERISATION: a batch with mixed grainDirection', () => {
  it('rotates only the NONE-grain parts; HORIZONTAL and VERTICAL parts keep rotation 0', () => {
    // Each part is 1400 wide — wider than the 1210mm usable width — so any
    // part that appears at all must have been rotated.
    const { sheets, results } = runNesting([
      row('FREE', 1400, 500, { grain: 'NONE' }),
      row('VERT', 1400, 500, { grain: 'VERTICAL' }),
      row('HORZ', 1400, 500, { grain: 'HORIZONTAL' }),
    ]);

    expect(placedIds(sheets)).toEqual(['FREE']);
    for (const s of sheets) {
      for (const p of s.placements) {
        expect(p.rotation).toBe(90);
      }
      assertGeometricallyValid(s);
    }

    expect(
      results.get('core-pb-18')!.unplacedParts.map((p) => p.id).sort(),
    ).toEqual(['HORZ', 'VERT']);
  });

  it('a realistic mixed-grain cabinet batch nests onto one sheet with everything placed and no overlaps', () => {
    const { sheets, results } = runNesting([
      row('SIDE_L', 600, 720, { grain: 'VERTICAL' }),
      row('SIDE_R', 600, 720, { grain: 'VERTICAL' }),
      row('TOP', 566, 580, { grain: 'HORIZONTAL' }),
      row('BOTTOM', 566, 580, { grain: 'HORIZONTAL' }),
      row('SHELF', 566, 560, { qty: 2, grain: 'NONE' }),
      row('BACK', 596, 716, { grain: 'NONE' }),
    ]);

    expect(results.get('core-pb-18')!.unplacedParts).toEqual([]);
    expect(placedIds(sheets)).toEqual([
      'BACK',
      'BOTTOM',
      'SHELF#1',
      'SHELF#2',
      'SIDE_L',
      'SIDE_R',
      'TOP',
    ]);
    for (const s of sheets) assertGeometricallyValid(s);
  });

  it('pins that grain is preserved verbatim on the placement, unmodified by rotation', () => {
    const { results } = runNesting([row('FREE', 1400, 500, { grain: 'NONE' })]);
    const placement = results.get('core-pb-18')!.sheets[0].placements[0];
    expect(placement.rotation).toBe(90);
    // The stored grain is the part's ORIGINAL grain. Rotating the grain for
    // display is done in NestingPanel, not here.
    expect(placement.grainDirection).toBe('NONE');
  });

  it('pins that a CutListRow with no grain field is treated as NONE (freely rotatable)', () => {
    const { sheets } = runNesting([row('NO_GRAIN_FIELD', 1400, 500)]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements[0].rotation).toBe(90);
  });
});

// ============================================
// 5. THE ffdh / optimizer CONTRACT
// ============================================

describe('CHARACTERISATION: the grain rule at the ffdh boundary', () => {
  it('DEFECT PINNED: ffdhMultiSheet rotates a grained part when the caller sets canRotate=true — the grain rule lives only in the optimizer', () => {
    // packSingleSheet and ffdhMultiSheet are public API (src/nesting/index.ts).
    // Today ffdh trusts part.canRotate blindly and never inspects
    // part.grainDirection, so a caller that builds NestingPart itself bypasses
    // the grain rule entirely — and the placement still reports VERTICAL grain.
    const cfg = resolveSheetConfig('core-pb-18');
    const { sheets, unplacedParts } = ffdhMultiSheet(
      [part('GRAINED', 1400, 500, { canRotate: true, grainDirection: 'VERTICAL' })],
      cfg,
    );

    expect(unplacedParts).toEqual([]);
    expect(sheets[0].placements[0].rotation).toBe(90);
    expect(sheets[0].placements[0].grainDirection).toBe('VERTICAL');
  });

  it('ffdhMultiSheet still rotates when grain is NONE and canRotate is true', () => {
    const cfg = resolveSheetConfig('core-pb-18');
    const { sheets, unplacedParts } = ffdhMultiSheet(
      [part('FREE', 1400, 500, { canRotate: true, grainDirection: 'NONE' })],
      cfg,
    );
    expect(unplacedParts).toEqual([]);
    expect(sheets[0].placements[0].rotation).toBe(90);
  });

  it('canRotate=false still blocks rotation regardless of grain', () => {
    const cfg = resolveSheetConfig('core-pb-18');
    const { sheets, unplacedParts } = ffdhMultiSheet(
      [part('LOCKED', 1400, 500, { canRotate: false, grainDirection: 'NONE' })],
      cfg,
    );
    expect(sheets).toEqual([]);
    expect(unplacedParts.map((p) => p.id)).toEqual(['LOCKED']);
  });
});

// ============================================
// 6. GEOMETRIC VALIDITY UNDER LOAD
// ============================================

describe('CHARACTERISATION: geometric validity across multiple sheets', () => {
  it('a 60-part batch spilling onto several sheets keeps every placement in-bounds and non-overlapping', () => {
    const rows: CutListRow[] = [];
    for (let i = 0; i < 20; i++) {
      rows.push(row(`SIDE_${i}`, 600, 720, { grain: 'VERTICAL' }));
      rows.push(row(`DOOR_${i}`, 397, 715, { grain: 'VERTICAL' }));
      rows.push(row(`SHELF_${i}`, 566, 560, { grain: 'NONE' }));
    }

    const { sheets, results } = runNesting(rows);

    expect(sheets.length).toBeGreaterThan(1);
    expect(results.get('core-pb-18')!.unplacedParts).toEqual([]);
    expect(placedIds(sheets)).toHaveLength(60);
    for (const s of sheets) assertGeometricallyValid(s);
  });

  it('is deterministic: identical input order-independent runs produce identical layouts', () => {
    const rows = [
      row('A', 600, 720, { grain: 'VERTICAL' }),
      row('B', 566, 560, { grain: 'NONE' }),
      row('C', 397, 715, { grain: 'HORIZONTAL' }),
    ];
    const first = runNesting(rows);
    const second = runNesting([...rows].reverse());
    expect(JSON.stringify(second.sheets)).toBe(JSON.stringify(first.sheets));
  });
});
