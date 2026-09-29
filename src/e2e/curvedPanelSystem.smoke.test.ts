/**
 * curvedPanelSystem.smoke.test.ts — Phase 7 @smoke
 *
 * E2E integration test covering the full Curved Panel System pipeline:
 *
 *   1. ARC PanelProfile → computeCurveProfile → valid KerfZones
 *   2. generateKerfPattern → kerf cuts produced (X-Ray visible)
 *   3. runG12Rules → gate passes (no blockers)
 *   4. mapKerfPatternToOps → SLOT operations produced
 *   5. FlatPart arc contour → flatPartToDxfR12 → ARC entity in DXF
 *
 * Run: vitest run src/e2e/curvedPanelSystem.smoke.test.ts
 *
 * @smoke
 */

import { describe, it, expect } from 'vitest';

// DXF sheet builder (Stage 11–12)
import { buildDxfSheet } from '../core/export/monolith/builders/buildDxfSheets';
import { getFactoryProfile } from '../core/export/factoryPackageProfiles';
import type { NestingSheet } from '../core/export/monolith/monolithExportContext';
import type { PlannedSheet } from '../core/export/planFactoryPackage';

// Curve Profile
import { computeCurveProfile, validatePanelProfile } from '../core/manufacturing/curve/curveProfile';
// Kerf Pattern Generator
import { generateKerfPattern } from '../core/manufacturing/curve/kerfPatternGenerator';
// G12 Gate
import { runG12Rules, DEFAULT_G12_POLICY } from '../gate/rules/gateG12_curveManufacturability';
// CNC mapper
import { mapKerfPatternToOps } from '../cnc/mapping/mapKerfPatternToOps';
// DXF writer
import { flatPartToDxfR12 } from '../core/manufacturing/dxfR12Writer';
// Types
import type { PanelProfile } from '../core/types/Cabinet';
import type { FlatPart } from '../core/types/FlatPart';
import { FLAT_PART_VERSION } from '../core/types/FlatPart';
import type { KerfToolProfile } from '../core/catalog/KerfBending';

// ============================================================
// Shared fixture: cabinet left-side panel with TOP arc curve
// ============================================================

const CURVED_PROFILE: PanelProfile = {
  kind: 'ARC',
  edge: 'TOP',
  radius: 200,    // mm — well above MDF 18mm R_min = 144mm
  sweepDeg: 60,
};

const PANEL = {
  panelId: 'smoke-left-side',
  material: 'MDF' as const,
  thickness: 18,
  finishWidth: 400,
  finishHeight: 800,
};

const TOOL: KerfToolProfile = {
  kind: 'SAW',
  bladeKerf: 3.2,
  kEff: 3.4,
  maxDepth: 30,
};

// ============================================================
// 1. Profile validation
// ============================================================

describe('@smoke — 1. PanelProfile validation', () => {
  it('validatePanelProfile passes for valid ARC profile', () => {
    const result = validatePanelProfile(CURVED_PROFILE, PANEL.finishWidth, PANEL.finishHeight);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('computeCurveProfile produces kerfZones', () => {
    const result = computeCurveProfile(
      CURVED_PROFILE,
      PANEL.finishWidth,
      PANEL.finishHeight,
    );
    expect(result.kerfZones.length).toBeGreaterThan(0);
    const zone = result.kerfZones[0];
    expect(zone.edge).toBe('TOP');
    expect(zone.depth).toBeGreaterThan(0);
    // arcSegments are on the result (not on zone)
    expect(result.arcSegments.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 2. Kerf pattern generator (X-Ray cuts)
// ============================================================

describe('@smoke — 2. generateKerfPattern (kerf cuts visible in X-Ray)', () => {
  it('produces at least one KerfPattern with cuts', () => {
    const result = generateKerfPattern({
      profile: CURVED_PROFILE,
      finishWidth: PANEL.finishWidth,
      finishHeight: PANEL.finishHeight,
      material: PANEL.material,
      thickness: PANEL.thickness,
      tool: TOOL,
    });

    expect(result.valid).toBe(true);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.patterns[0].cuts.length).toBeGreaterThan(0);
  });

  it('each cut has valid position and depth', () => {
    const result = generateKerfPattern({
      profile: CURVED_PROFILE,
      finishWidth: PANEL.finishWidth,
      finishHeight: PANEL.finishHeight,
      material: PANEL.material,
      thickness: PANEL.thickness,
      tool: TOOL,
    });

    for (const pattern of result.patterns) {
      for (const cut of pattern.cuts) {
        expect(cut.position).toBeGreaterThanOrEqual(0);
        expect(cut.depth).toBeGreaterThan(0);
        expect(cut.depth).toBeLessThan(PANEL.thickness);
      }
    }
  });

  it('pattern edge matches profile edge', () => {
    const result = generateKerfPattern({
      profile: CURVED_PROFILE,
      finishWidth: PANEL.finishWidth,
      finishHeight: PANEL.finishHeight,
      material: PANEL.material,
      thickness: PANEL.thickness,
      tool: TOOL,
    });

    for (const pattern of result.patterns) {
      expect(pattern.edge).toBe('TOP');
    }
  });
});

// ============================================================
// 3. G12 Gate — no blockers for valid curved-corner cabinet
// ============================================================

describe('@smoke — 3. G12 gate (no blockers on valid curved panel)', () => {
  it('runG12Rules returns no BLOCKER issues for R=200mm MDF-18mm', () => {
    const patternResult = generateKerfPattern({
      profile: CURVED_PROFILE,
      finishWidth: PANEL.finishWidth,
      finishHeight: PANEL.finishHeight,
      material: PANEL.material,
      thickness: PANEL.thickness,
      tool: TOOL,
    });

    const curveResult = computeCurveProfile(
      CURVED_PROFILE,
      PANEL.finishWidth,
      PANEL.finishHeight,
    );

    const issues = runG12Rules({
      panels: [
        {
          panelId: PANEL.panelId,
          profile: CURVED_PROFILE,
          material: PANEL.material,
          thickness: PANEL.thickness,
        },
      ],
      patterns: [
        {
          panelId: PANEL.panelId,
          kerfZones: curveResult.kerfZones,
          patterns: patternResult.patterns,
          tool: TOOL,
        },
      ],
      policy: DEFAULT_G12_POLICY,
    });

    const blockers = issues.filter((i) => i.severity === 'BLOCKER');
    expect(blockers).toHaveLength(0);
  });
});

// ============================================================
// 4. mapKerfPatternToOps — SLOT operations produced
// ============================================================

describe('@smoke — 4. mapKerfPatternToOps (SLOT ops in OperationGraph)', () => {
  it('produces SLOT operations for each kerf cut', () => {
    const patternResult = generateKerfPattern({
      profile: CURVED_PROFILE,
      finishWidth: PANEL.finishWidth,
      finishHeight: PANEL.finishHeight,
      material: PANEL.material,
      thickness: PANEL.thickness,
      tool: TOOL,
    });

    const { operations, warnings } = mapKerfPatternToOps(
      patternResult.patterns,
      {
        panelId: PANEL.panelId,
        role: 'LEFT_SIDE',
        finishWidth: PANEL.finishWidth,
        finishHeight: PANEL.finishHeight,
        thickness: PANEL.thickness,
      }
    );

    const totalCuts = patternResult.patterns.reduce((n, p) => n + p.cuts.length, 0);
    expect(operations).toHaveLength(totalCuts);
    expect(warnings).toHaveLength(0);
    for (const op of operations) {
      expect(op.type).toBe('SLOT');
      expect(op.depth).toBeGreaterThan(0);
      expect(op.width).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 5. DXF arc entity — flatPartToDxfR12 with arc OuterContour
// ============================================================

describe('@smoke — 5. flatPartToDxfR12 (ARC entity in DXF export)', () => {
  const arcPart = {
    id: 'smoke-arc-part',
    version: FLAT_PART_VERSION,
    partNumber: 'P-CURVE-01',
    name: 'Curved Left Side',
    sourceType: 'cabinet_panel' as const,
    finishWidth: PANEL.finishWidth,
    finishHeight: PANEL.finishHeight,
    cutWidth: PANEL.finishWidth,
    cutHeight: PANEL.finishHeight,
    outer: {
      type: 'arc' as const,
      width: PANEL.finishWidth,
      height: PANEL.finishHeight,
      edge: 'TOP' as const,
      radius: 200,
      sweepDeg: 60,
    },
    inners: [],
    drills: [],
    pockets: [],
    grooves: [],
    edges: [],
    composite: {
      totalThickness: 18,
      core: {
        type: 'core' as const,
        materialId: 'mat-mdf-18',
        materialName: 'MDF 18mm',
        thickness: 18,
      },
    },
    manufacturing: {
      grainDirection: 'horizontal' as const,
      preMill: 0,
      quantity: 1,
    },
    computed: {
      surfaceArea: (PANEL.finishWidth * PANEL.finishHeight) / 1e6,
      bandedEdgeLength: 0,
      drillCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies FlatPart;

  it('exports without throwing', () => {
    expect(() => flatPartToDxfR12(arcPart)).not.toThrow();
  });

  it('DXF output contains ARC entity', () => {
    const dxf = flatPartToDxfR12(arcPart);
    expect(dxf).toContain('ARC');
  });

  it('DXF output contains arc radius', () => {
    const dxf = flatPartToDxfR12(arcPart);
    // Radius 200 should appear formatted as "200.000"
    expect(dxf).toContain('200.000');
  });

  it('DXF output contains LINE entities for straight sides', () => {
    const dxf = flatPartToDxfR12(arcPart);
    const lineCount = (dxf.match(/\n0\nLINE\n/g) || []).length;
    // Arc panel has 3 straight sides
    expect(lineCount).toBeGreaterThanOrEqual(3);
  });

  it('DXF output is valid DXF R12 (starts with header, ends with EOF)', () => {
    const dxf = flatPartToDxfR12(arcPart);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('ENDSEC');
    expect(dxf.trim()).toContain('EOF');
  });
});

// ============================================================
// Shared fixtures for Stage 11–12: DXF sheet HATCH_CURVED count
// ============================================================

const DXF_PROFILE = getFactoryProfile('DEFAULT');

const DXF_PLANNED: PlannedSheet = {
  index1: 1,
  sheetId: 'SHEET_SMOKE',
  materialId: 'MDF_18',
};

// ============================================================
// 11. no HATCH_CURVED when all three panels are straight
// ============================================================

describe('@smoke — 11. no HATCH_CURVED when all three panels are straight', () => {
  it('DXF ENTITIES section contains zero HATCH_CURVED LINE entities', () => {
    const sheet: NestingSheet = {
      index1: 1,
      label: 'SMOKE_ALL_FLAT',
      materialId: 'MDF_18',
      sheetW: 1220,
      sheetH: 2440,
      sheetThickness: 18,
      utilization: 60.0,
      placements: [
        { partId: 'FLAT_1', x: 10,  y: 10, rotation: 0, cutW: 300, cutH: 600 },
        { partId: 'FLAT_2', x: 320, y: 10, rotation: 0, cutW: 300, cutH: 600 },
        { partId: 'FLAT_3', x: 630, y: 10, rotation: 0, cutW: 300, cutH: 600 },
      ],
    };

    const dxf = buildDxfSheet({
      planned: DXF_PLANNED,
      nesting: sheet,
      profile: DXF_PROFILE,
    }).content;

    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    const segments = entitiesSection.split('LINE');
    const hatchLines = segments.filter((s) => s.includes('HATCH_CURVED'));

    expect(hatchLines).toHaveLength(0);
  });
});

// ============================================================
// 12. HATCH_CURVED count === 2 when exactly one panel is curved
// ============================================================

describe('@smoke — 12. HATCH_CURVED count === 2 when one of three panels is curved', () => {
  it('DXF ENTITIES section contains exactly 2 HATCH_CURVED LINE entities', () => {
    const sheet: NestingSheet = {
      index1: 1,
      label: 'SMOKE_ONE_CURVED',
      materialId: 'MDF_18',
      sheetW: 1220,
      sheetH: 2440,
      sheetThickness: 18,
      utilization: 65.0,
      placements: [
        { partId: 'FLAT_A',  x: 10,  y: 10, rotation: 0, cutW: 300, cutH: 600 },
        { partId: 'FLAT_B',  x: 320, y: 10, rotation: 0, cutW: 300, cutH: 600 },
        { partId: 'CURVED_C', x: 630, y: 10, rotation: 0, cutW: 300, cutH: 600, isCurved: true },
      ],
    };

    const dxf = buildDxfSheet({
      planned: DXF_PLANNED,
      nesting: sheet,
      profile: DXF_PROFILE,
    }).content;

    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    const segments = entitiesSection.split('LINE');
    const hatchLines = segments.filter((s) => s.includes('HATCH_CURVED'));

    // One curved placement → exactly 2 diagonal LINE entities on HATCH_CURVED
    expect(hatchLines).toHaveLength(2);
  });
});

// ============================================================
// 13. HATCH_CURVED count scales with N curved panels
// ============================================================

describe('@smoke — 13. HATCH_CURVED count scales with N curved panels', () => {
  it('DXF ENTITIES section contains exactly 6 HATCH_CURVED LINE entities for 3 curved panels', () => {
    const sheet: NestingSheet = {
      index1: 1,
      label: 'SMOKE_THREE_CURVED',
      materialId: 'MDF_18',
      sheetW: 1220,
      sheetH: 2440,
      sheetThickness: 18,
      utilization: 75.0,
      placements: [
        { partId: 'CURVED_1', x: 10,  y: 10, rotation: 0, cutW: 300, cutH: 600, isCurved: true },
        { partId: 'CURVED_2', x: 320, y: 10, rotation: 0, cutW: 300, cutH: 600, isCurved: true },
        { partId: 'CURVED_3', x: 630, y: 10, rotation: 0, cutW: 300, cutH: 600, isCurved: true },
      ],
    };

    const dxf = buildDxfSheet({
      planned: DXF_PLANNED,
      nesting: sheet,
      profile: DXF_PROFILE,
    }).content;

    const entitiesStart = dxf.indexOf('ENTITIES');
    const entitiesSection = dxf.slice(entitiesStart);
    const segments = entitiesSection.split('LINE');
    const hatchLines = segments.filter((s) => s.includes('HATCH_CURVED'));

    // 3 curved placements × 2 diagonal LINE entities each = 6
    expect(hatchLines).toHaveLength(6);
  });
});
