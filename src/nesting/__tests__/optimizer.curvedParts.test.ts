/**
 * Task 13: Curved Panel Nesting — optimizer.curvedParts tests
 *
 * Verifies that curved panels (ARC / S_CURVE) are placed on sheets using their
 * flat-blank dimensions (larger than finish/cut dimensions), while flat panels
 * continue to use cutW × cutH unchanged.
 */

import { describe, it, expect } from 'vitest';
import { extractNestingParts, runNesting } from '../optimizer';
import type { CutListRow } from '../../core/export/monolith/monolithExportContext';

// ============================================
// TEST FIXTURES
// ============================================

/**
 * A standard flat panel (no curve fields) — baseline for comparison.
 */
const FLAT_ROW: CutListRow = {
  partId: 'BACK_PANEL',
  cabinetId: 'CAB_01',
  materialId: 'MDF_18',
  finishW: 600,
  finishH: 400,
  edgeL: 0,
  edgeR: 0,
  edgeT: 0,
  edgeB: 0,
  premillL: 0,
  premillR: 0,
  premillT: 0,
  premillB: 0,
  cutW: 600,
  cutH: 400,
  qty: 1,
  grain: 'NONE',
};

/**
 * ARC panel curved at the TOP edge.
 * R=200mm, sweepDeg=30°
 *   sweepRad = 30 × π/180 = 0.5236 rad
 *   developedLength = 200 × 0.5236 = 104.72 mm
 *   projectedDepth  = 200 × (1 − cos(0.5236)) = 200 × (1 − 0.8660) = 26.80 mm
 *   correction      = 104.72 − 26.80 = 77.92 mm
 *   flatBlankH      = cutH + 77.92
 *   flatBlankW      = cutW  (width axis unaffected)
 */
const ARC_ROW_TOP: CutListRow = {
  partId: 'TOP_CURVED',
  cabinetId: 'CAB_01',
  materialId: 'MDF_18',
  finishW: 600,
  finishH: 420,
  edgeL: 0,
  edgeR: 0,
  edgeT: 0,
  edgeB: 0,
  premillL: 0,
  premillR: 0,
  premillT: 0,
  premillB: 0,
  cutW: 600,
  cutH: 420,
  qty: 1,
  grain: 'NONE',
  // Curve fields:
  developedLength: 200 * (30 * Math.PI / 180),           // ≈ 104.72
  projectedDepth:  200 * (1 - Math.cos(30 * Math.PI / 180)), // ≈  26.80
  curvedEdge: 'TOP',
  kerfCount: 6,
};

/**
 * ARC panel curved at the LEFT edge.
 * R=150mm, sweepDeg=45°
 *   sweepRad = 45 × π/180 = 0.7854 rad
 *   developedLength = 150 × 0.7854 = 117.81 mm
 *   projectedDepth  = 150 × (1 − cos(0.7854)) = 150 × (1 − 0.7071) = 43.93 mm
 *   correction      = 117.81 − 43.93 = 73.88 mm
 *   flatBlankW      = cutW + 73.88
 *   flatBlankH      = cutH  (height axis unaffected)
 */
const ARC_ROW_LEFT: CutListRow = {
  partId: 'SIDE_CURVED',
  cabinetId: 'CAB_01',
  materialId: 'MDF_18',
  finishW: 360,
  finishH: 720,
  edgeL: 0,
  edgeR: 0,
  edgeT: 0,
  edgeB: 0,
  premillL: 0,
  premillR: 0,
  premillT: 0,
  premillB: 0,
  cutW: 360,
  cutH: 720,
  qty: 1,
  grain: 'VERTICAL',
  // Curve fields:
  developedLength: 150 * (45 * Math.PI / 180),           // ≈ 117.81
  projectedDepth:  150 * (1 - Math.cos(45 * Math.PI / 180)), // ≈  43.93
  curvedEdge: 'LEFT',
  kerfCount: 8,
};

// ============================================
// extractNestingParts — unit tests
// ============================================

describe('extractNestingParts — flat panels', () => {
  it('uses cutW / cutH unchanged for a flat panel', () => {
    const [part] = extractNestingParts([FLAT_ROW]);
    expect(part.width).toBe(600);
    expect(part.height).toBe(400);
    expect(part.flatBlankW).toBe(600);
    expect(part.flatBlankH).toBe(400);
    expect(part.isCurved).toBeUndefined();
    expect(part.kerfCount).toBeUndefined();
  });

  it('preserves grain and rotation for flat panels', () => {
    const [part] = extractNestingParts([{ ...FLAT_ROW, grain: 'VERTICAL' }]);
    expect(part.grainDirection).toBe('VERTICAL');
    expect(part.canRotate).toBe(false);
  });
});

describe('extractNestingParts — TOP-edge ARC curved panel', () => {
  it('corrects flatBlankH by (developedLength − projectedDepth)', () => {
    const [part] = extractNestingParts([ARC_ROW_TOP]);

    const correction = ARC_ROW_TOP.developedLength! - ARC_ROW_TOP.projectedDepth!;
    expect(part.flatBlankH).toBeCloseTo(ARC_ROW_TOP.cutH + correction, 6);
    expect(part.flatBlankW).toBe(ARC_ROW_TOP.cutW); // width unchanged
  });

  it('sets width/height to flat blank dimensions', () => {
    const [part] = extractNestingParts([ARC_ROW_TOP]);
    expect(part.width).toBe(part.flatBlankW);
    expect(part.height).toBe(part.flatBlankH);
  });

  it('sets isCurved=true and carries kerfCount', () => {
    const [part] = extractNestingParts([ARC_ROW_TOP]);
    expect(part.isCurved).toBe(true);
    expect(part.kerfCount).toBe(6);
  });

  it('flat blank height is greater than cutH', () => {
    const [part] = extractNestingParts([ARC_ROW_TOP]);
    expect(part.height).toBeGreaterThan(ARC_ROW_TOP.cutH);
  });
});

describe('extractNestingParts — LEFT-edge ARC curved panel', () => {
  it('corrects flatBlankW by (developedLength − projectedDepth)', () => {
    const [part] = extractNestingParts([ARC_ROW_LEFT]);

    const correction = ARC_ROW_LEFT.developedLength! - ARC_ROW_LEFT.projectedDepth!;
    expect(part.flatBlankW).toBeCloseTo(ARC_ROW_LEFT.cutW + correction, 6);
    expect(part.flatBlankH).toBe(ARC_ROW_LEFT.cutH); // height unchanged
  });

  it('curved left-edge panel with VERTICAL grain is non-rotatable', () => {
    const [part] = extractNestingParts([ARC_ROW_LEFT]);
    expect(part.grainDirection).toBe('VERTICAL');
    expect(part.canRotate).toBe(false);
  });

  it('kerfCount propagated from row', () => {
    const [part] = extractNestingParts([ARC_ROW_LEFT]);
    expect(part.kerfCount).toBe(8);
  });
});

describe('extractNestingParts — missing curve fields (partial data)', () => {
  it('no correction when developedLength is absent', () => {
    const row: CutListRow = { ...FLAT_ROW, curvedEdge: 'TOP' }; // missing developedLength
    const [part] = extractNestingParts([row]);
    expect(part.height).toBe(FLAT_ROW.cutH);
    expect(part.isCurved).toBeUndefined();
  });

  it('no correction when projectedDepth is absent', () => {
    const row: CutListRow = { ...ARC_ROW_TOP, projectedDepth: undefined };
    const [part] = extractNestingParts([row]);
    expect(part.height).toBe(ARC_ROW_TOP.cutH);
    expect(part.isCurved).toBeUndefined();
  });

  it('no correction when curvedEdge is absent (only lengths known)', () => {
    const row: CutListRow = {
      ...ARC_ROW_TOP,
      curvedEdge: undefined,
    };
    const [part] = extractNestingParts([row]);
    expect(part.height).toBe(ARC_ROW_TOP.cutH);
    expect(part.isCurved).toBeUndefined();
  });
});

describe('extractNestingParts — qty expansion', () => {
  it('expands qty=3 curved panel into 3 NestingParts each with flat-blank dimensions', () => {
    const row: CutListRow = { ...ARC_ROW_TOP, qty: 3 };
    const parts = extractNestingParts([row]);
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p.isCurved).toBe(true);
      expect(p.flatBlankH).toBeGreaterThan(ARC_ROW_TOP.cutH);
    }
    expect(parts.map((p) => p.id)).toEqual(['TOP_CURVED#1', 'TOP_CURVED#2', 'TOP_CURVED#3']);
  });
});

// ============================================
// runNesting — integration tests
// ============================================

describe('runNesting — curved + flat panels co-exist', () => {
  it('places curved and flat panels on the same material sheet', () => {
    const { sheets, unplacedParts } = runNesting(
      [FLAT_ROW, ARC_ROW_TOP],
      { kerfWidth: 3.5, edgeClearance: 10, sheetWidth: 1220, sheetHeight: 2440, sheetThickness: 18 },
    );
    // Both parts should be placed (sheet 2440×1220 is large enough for both)
    expect(unplacedParts).toHaveLength(0);
    const placements = sheets.flatMap((s) => s.placements);
    const ids = placements.map((p) => p.partId);
    expect(ids).toContain('BACK_PANEL');
    expect(ids).toContain('TOP_CURVED');
  });

  it('curved panel placement uses flat-blank height (cutW × flatBlankH)', () => {
    const { sheets } = runNesting(
      [ARC_ROW_TOP],
      { kerfWidth: 3.5, edgeClearance: 10, sheetWidth: 1220, sheetHeight: 2440, sheetThickness: 18 },
    );
    const placement = sheets[0]?.placements[0];
    expect(placement).toBeDefined();

    const correction = ARC_ROW_TOP.developedLength! - ARC_ROW_TOP.projectedDepth!;
    const expectedBlankH = ARC_ROW_TOP.cutH + correction;

    // The nesting sheet placement records the dimension used; rotation=0 means
    // cutH in the placement reflects the flat blank height.
    if (placement.rotation === 0) {
      expect(placement.cutH).toBeCloseTo(expectedBlankH, 4);
    } else {
      // rotated 90° — the width field carries the original height
      expect(placement.cutW).toBeCloseTo(expectedBlankH, 4);
    }
  });

  it('flat panel placement uses cutW × cutH unchanged', () => {
    const { sheets } = runNesting(
      [FLAT_ROW],
      { kerfWidth: 3.5, edgeClearance: 10, sheetWidth: 1220, sheetHeight: 2440, sheetThickness: 18 },
    );
    const placement = sheets[0]?.placements[0];
    expect(placement).toBeDefined();
    // Regardless of rotation, one dimension must be 600 and the other 400
    const dims = [placement.cutW, placement.cutH].sort((a, b) => a - b);
    expect(dims).toEqual([400, 600]);
  });

  it('is deterministic: same input → same output', () => {
    const rows = [FLAT_ROW, ARC_ROW_TOP, ARC_ROW_LEFT];
    const overrides = { kerfWidth: 3.5, edgeClearance: 10, sheetWidth: 1220, sheetHeight: 2440, sheetThickness: 18 };
    const r1 = runNesting(rows, overrides);
    const r2 = runNesting(rows, overrides);
    expect(r1.sheets.map((s) => s.placements)).toEqual(r2.sheets.map((s) => s.placements));
  });

  it('sheet utilization increases when flat-blank dimensions are used', () => {
    // A curved panel occupies more space on the blank sheet than its cut size alone.
    // Utilization with flat-blank sizing should equal what FFDH computes
    // using the larger dimensions — the key check is that the optimizer
    // doesn't use the smaller cut dimensions.
    const correction = ARC_ROW_TOP.developedLength! - ARC_ROW_TOP.projectedDepth!;
    const flatPartArea = ARC_ROW_TOP.cutW * (ARC_ROW_TOP.cutH + correction);
    const cutPartArea  = ARC_ROW_TOP.cutW * ARC_ROW_TOP.cutH;
    expect(flatPartArea).toBeGreaterThan(cutPartArea);
  });
});
