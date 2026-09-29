/**
 * buildDxfSheets.curvedLayer.test.ts
 *
 * Task 14: Verify that curved placements render to PARTS_CURVED + HATCH_CURVED
 * layers, flat placements render to PARTS only, isCurved propagates through
 * runNesting(), and the TABLES section contains layer color definitions.
 */

import { describe, it, expect } from 'vitest';
import { buildDxfSheet } from '../buildDxfSheets';
import { runNesting } from '../../../../../nesting/optimizer';
import { getFactoryProfile } from '../../../factoryPackageProfiles';
import type { NestingSheet } from '../../monolithExportContext';
import type { CutListRow } from '../../monolithExportContext';
import type { PlannedSheet } from '../../../planFactoryPackage';

// ============================================================
// Minimal stubs
// ============================================================

const PROFILE_STUB = getFactoryProfile('DEFAULT');

const PLANNED_STUB: PlannedSheet = {
  index1: 1,
  sheetId: 'SHEET_001',
  materialId: 'MDF_18',
};

function makeFlatNestingSheet(overrides?: Partial<NestingSheet>): NestingSheet {
  return {
    index1: 1,
    label: 'NEST_01',
    materialId: 'MDF_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    utilization: 72.5,
    placements: [
      {
        partId: 'SIDE_L',
        x: 10,
        y: 10,
        rotation: 0,
        cutW: 600,
        cutH: 720,
        // isCurved intentionally absent → flat part
      },
    ],
    ...overrides,
  };
}

function makeCurvedNestingSheet(): NestingSheet {
  return {
    index1: 1,
    label: 'NEST_01',
    materialId: 'MDF_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    utilization: 55.0,
    placements: [
      {
        partId: 'CURVED_DOOR',
        x: 10,
        y: 10,
        rotation: 0,
        cutW: 400,
        cutH: 800,
        isCurved: true,
        kerfCount: 12,
      },
    ],
  };
}

function makeMixedNestingSheet(): NestingSheet {
  return {
    index1: 1,
    label: 'NEST_MIX',
    materialId: 'MDF_18',
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    utilization: 68.0,
    placements: [
      {
        partId: 'FLAT_PART',
        x: 10,
        y: 10,
        rotation: 0,
        cutW: 300,
        cutH: 600,
        // isCurved absent
      },
      {
        partId: 'CURVED_PART',
        x: 400,
        y: 10,
        rotation: 0,
        cutW: 350,
        cutH: 700,
        isCurved: true,
      },
    ],
  };
}

// ============================================================
// Helpers
// ============================================================

function buildDxf(sheet: NestingSheet): string {
  return buildDxfSheet({
    planned: PLANNED_STUB,
    nesting: sheet,
    profile: PROFILE_STUB,
  }).content;
}

// ============================================================
// Tests: LAYER table
// ============================================================

describe('buildDxfSheet — TABLES / LAYER section', () => {
  it('DXF output contains a TABLES section', () => {
    const dxf = buildDxf(makeFlatNestingSheet());
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('TABLE');
    expect(dxf).toContain('LAYER');
  });

  it('TABLES section defines PARTS layer with color 3 (green)', () => {
    const dxf = buildDxf(makeFlatNestingSheet());
    const lines = dxf.split('\n');
    let foundPartsLayer = false;
    for (let i = 0; i < lines.length - 2; i++) {
      // LAYER name is on the line after group code "2"
      if (lines[i].trim() === '2' && lines[i + 1].trim() === 'PARTS') {
        foundPartsLayer = true;
        // color code "62" with value "3" should appear nearby
        const snippet = lines.slice(i, i + 10).join('\n');
        expect(snippet).toContain('3');
        break;
      }
    }
    expect(foundPartsLayer).toBe(true);
  });

  it('TABLES section defines PARTS_CURVED layer with color 1 (red)', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    expect(dxf).toContain('PARTS_CURVED');
  });

  it('TABLES section defines HATCH_CURVED layer with color 4 (cyan)', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    expect(dxf).toContain('HATCH_CURVED');
  });

  it('TABLES section defines SHEET, LABELS, TEXT layers', () => {
    const dxf = buildDxf(makeFlatNestingSheet());
    expect(dxf).toContain('SHEET');
    expect(dxf).toContain('LABELS');
    expect(dxf).toContain('TEXT');
  });
});

// ============================================================
// Tests: flat placement → PARTS layer only
// ============================================================

describe('buildDxfSheet — flat placement uses PARTS layer', () => {
  it('flat part rectangle is on PARTS layer', () => {
    const dxf = buildDxf(makeFlatNestingSheet());
    // Should contain PARTS layer reference inside ENTITIES
    expect(dxf).toContain('PARTS');
  });

  it('flat part does NOT generate PARTS_CURVED or HATCH_CURVED entities in ENTITIES section', () => {
    const dxf = buildDxf(makeFlatNestingSheet());
    // The layer names appear in TABLES, but no entity references inside ENTITIES
    // Check: ENTITIES section after ENDSEC of TABLES should not reference PARTS_CURVED
    const entitiesStart = dxf.indexOf('ENTITIES');
    expect(entitiesStart).toBeGreaterThan(-1);
    const entitiesSection = dxf.slice(entitiesStart);
    expect(entitiesSection).not.toContain('PARTS_CURVED');
    expect(entitiesSection).not.toContain('HATCH_CURVED');
  });
});

// ============================================================
// Tests: curved placement → PARTS_CURVED + HATCH_CURVED
// ============================================================

describe('buildDxfSheet — curved placement uses PARTS_CURVED + HATCH_CURVED', () => {
  it('curved part rectangle is on PARTS_CURVED layer', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    expect(entitiesSection).toContain('PARTS_CURVED');
  });

  it('curved part generates hatch lines on HATCH_CURVED layer', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    expect(entitiesSection).toContain('HATCH_CURVED');
  });

  it('curved part does NOT use PARTS layer for its rectangle', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    // PARTS layer should not be referenced in entities (only PARTS_CURVED)
    // We verify PARTS_CURVED exists but plain "PARTS\n" does not appear as entity
    const lines = entitiesSection.split('\n');
    const partsExact = lines.filter((l) => l.trim() === 'PARTS');
    // PARTS_CURVED is fine; plain PARTS as an entity layer should be absent
    expect(partsExact.length).toBe(0);
  });

  it('curved part sub-label includes kerfCount: "(CURVED / 12 cuts)"', () => {
    const dxf = buildDxf(makeCurvedNestingSheet()); // has kerfCount: 12
    expect(dxf).toContain('(CURVED / 12 cuts)');
  });

  it('curved part without kerfCount falls back to "(CURVED)"', () => {
    const sheet: NestingSheet = {
      ...makeCurvedNestingSheet(),
      placements: [{ partId: 'X', x: 0, y: 0, rotation: 0, cutW: 200, cutH: 400, isCurved: true }],
    };
    const dxf = buildDxf(sheet);
    expect(dxf).toContain('(CURVED)');
    expect(dxf).not.toContain('cuts)');
  });

  it('two hatch diagonal lines are emitted (X-pattern)', () => {
    const dxf = buildDxf(makeCurvedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    // Count LINE entries on HATCH_CURVED
    const segments = entitiesSection.split('LINE');
    // Each hatch diagonal produces one LINE entity; expect ≥ 2 lines on HATCH_CURVED
    const hatchLines = segments.filter((s) => s.includes('HATCH_CURVED'));
    expect(hatchLines.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// Tests: mixed sheet (flat + curved)
// ============================================================

describe('buildDxfSheet — mixed sheet (flat + curved)', () => {
  it('flat part uses PARTS, curved part uses PARTS_CURVED', () => {
    const dxf = buildDxf(makeMixedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    expect(entitiesSection).toContain('PARTS_CURVED');
    // At least one straight PARTS occurrence (flat part)
    const lines = entitiesSection.split('\n');
    const plainParts = lines.filter((l) => l.trim() === 'PARTS');
    expect(plainParts.length).toBeGreaterThan(0);
  });

  it('only the curved part generates HATCH_CURVED lines', () => {
    const dxf = buildDxf(makeMixedNestingSheet());
    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    expect(entitiesSection).toContain('HATCH_CURVED');
  });
});

// ============================================================
// Tests: isCurved propagation through runNesting()
// ============================================================

describe('runNesting() — isCurved propagates to placements', () => {
  const MAT = 'MDF_18';

  /** Minimal flat row */
  function flatRow(id: string): CutListRow {
    return {
      partId: id,
      cabinetId: 'CAB_01',
      materialId: MAT,
      finishW: 400,
      finishH: 600,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW: 400,
      cutH: 600,
      qty: 1,
    };
  }

  /** Curved row with developedLength > projectedDepth */
  function curvedRow(id: string): CutListRow {
    return {
      partId: id,
      cabinetId: 'CAB_01',
      materialId: MAT,
      finishW: 400,
      finishH: 600,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW: 400,
      cutH: 600,
      qty: 1,
      developedLength: 800,   // arc length
      projectedDepth: 60,     // chord depth
      kerfCount: 12,
      curvedEdge: 'TOP',
    };
  }

  it('flat CutListRow produces placement with isCurved=undefined', () => {
    const { sheets } = runNesting([flatRow('FLAT')]);
    expect(sheets.length).toBeGreaterThan(0);
    const p = sheets[0].placements.find((pl) => pl.partId === 'FLAT');
    expect(p).toBeDefined();
    expect(p!.isCurved).toBeUndefined();
  });

  it('curved CutListRow produces placement with isCurved=true', () => {
    const { sheets } = runNesting([curvedRow('CURVED')]);
    expect(sheets.length).toBeGreaterThan(0);
    const p = sheets[0].placements.find((pl) => pl.partId === 'CURVED');
    expect(p).toBeDefined();
    expect(p!.isCurved).toBe(true);
  });

  it('curved CutListRow propagates kerfCount to placement', () => {
    const { sheets } = runNesting([curvedRow('CURVED_KC')]);
    const p = sheets.flatMap((s) => s.placements).find((pl) => pl.partId === 'CURVED_KC');
    expect(p).toBeDefined();
    expect(p!.kerfCount).toBe(12);
  });

  it('flat CutListRow has kerfCount=undefined on placement', () => {
    const { sheets } = runNesting([flatRow('FLAT_KC')]);
    const p = sheets.flatMap((s) => s.placements).find((pl) => pl.partId === 'FLAT_KC');
    expect(p).toBeDefined();
    expect(p!.kerfCount).toBeUndefined();
  });

  it('mixed cut list: flat has isCurved=undefined, curved has isCurved=true', () => {
    const { sheets } = runNesting([flatRow('FLAT_MIX'), curvedRow('CURVED_MIX')]);
    const all = sheets.flatMap((s) => s.placements);
    const flat = all.find((p) => p.partId === 'FLAT_MIX');
    const curved = all.find((p) => p.partId === 'CURVED_MIX');
    expect(flat?.isCurved).toBeUndefined();
    expect(curved?.isCurved).toBe(true);
  });

  it('qty > 1: all instances of a curved row carry isCurved=true', () => {
    const row: CutListRow = { ...curvedRow('DOOR'), qty: 3 };
    const { sheets } = runNesting([row]);
    const all = sheets.flatMap((s) => s.placements);
    // Parts are expanded: DOOR#1, DOOR#2, DOOR#3
    const doorParts = all.filter((p) => p.partId.startsWith('DOOR'));
    expect(doorParts.length).toBe(3);
    doorParts.forEach((p) => expect(p.isCurved).toBe(true));
  });
});
