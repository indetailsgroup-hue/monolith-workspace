/**
 * buildCutList — curve fields tests (Task 12)
 *
 * Verifies that buildCutListData() correctly populates
 * `developedLength` and `kerfCount` for curved panels, and
 * leaves those fields `undefined` for flat RECT panels.
 *
 * @group unit
 */

import { describe, it, expect } from 'vitest';
import { buildCutListData, type BuildCutListOptions } from '../builders/buildCutList';
import type { Cabinet, CabinetPanel, PanelProfile } from '../../../core/types/Cabinet';

// ============================================
// HELPERS
// ============================================

/** Minimal panel skeleton — override individual fields as needed. */
function makePanel(overrides: Partial<CabinetPanel> & { id: string }): CabinetPanel {
  return {
    name: 'Test Panel',
    role: 'LEFT_SIDE',
    visible: true,
    finishWidth: 600,
    finishHeight: 400,
    computed: { realThickness: 18 },
    coreMaterialId: 'mat-mdf-18',
    grainDirection: 'NONE',
    edges: { left: null, right: null, top: null, bottom: null },
    ...overrides,
  } as unknown as CabinetPanel;
}

/** Cabinet wrapping a single panel. */
function makeCabinet(panel: CabinetPanel): Cabinet {
  return {
    id: 'cab-test',
    name: 'Test Cabinet',
    dimensions: { width: 600, height: 720, depth: 560 },
    type: 'BASE',
    panels: [panel],
    compartments: [],
    materials: { coreId: 'mat-mdf-18', surfaceId: null, edgingId: null },
  } as unknown as Cabinet;
}

// ============================================
// ARC PROFILE FIXTURE
// ============================================

// radius must satisfy: radius <= edgeDepth('TOP', 600, 400) / 2 = 200
// Use 150 (safely within limit) so computeCurveProfile passes validation.
const ARC_PROFILE: PanelProfile = {
  kind: 'ARC',
  edge: 'TOP',
  radius: 150,
  sweepDeg: 45,
};

// Expected developedLength for ARC, R=150, sweep=45°:
// L_outer = R × sweepRad = 150 × (45 × π/180) ≈ 117.810
const EXPECTED_DEV_LENGTH = 150 * (45 * Math.PI / 180); // ≈ 117.810

// ============================================
// TESTS
// ============================================

describe('buildCutListData — curve fields (Task 12)', () => {

  // ------------------------------------------------------------------
  describe('ARC panel', () => {
    it('populates developedLength > 0 for curved panel', () => {
      const panel = makePanel({ id: 'p-arc', profile: ARC_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      expect(row.developedLength).toBeDefined();
      expect(row.developedLength).toBeGreaterThan(0);
    });

    it('developedLength matches R × sweepRad (rounded to 3 dp)', () => {
      const panel = makePanel({ id: 'p-arc', profile: ARC_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      // roundToPrecision uses 3 dp
      expect(row.developedLength).toBeCloseTo(EXPECTED_DEV_LENGTH, 2);
    });

    it('populates kerfCount > 0 for curved panel', () => {
      const panel = makePanel({ id: 'p-arc', profile: ARC_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      expect(row.kerfCount).toBeDefined();
      expect(row.kerfCount).toBeGreaterThan(0);
    });

    it('kerfCount is an integer', () => {
      const panel = makePanel({ id: 'p-arc', profile: ARC_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      expect(Number.isInteger(row.kerfCount)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  describe('S_CURVE panel', () => {
    const S_PROFILE: PanelProfile = {
      kind: 'S_CURVE',
      edge: 'TOP',
      r1: 200,
      r2: 150,
      sweepDeg1: 30,
      sweepDeg2: 30,
    };

    it('populates developedLength > 0 for S_CURVE panel', () => {
      const panel = makePanel({ id: 'p-scurve', profile: S_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      expect(row.developedLength).toBeDefined();
      expect(row.developedLength).toBeGreaterThan(0);
    });

    it('developedLength = r1 × sweep1Rad + r2 × sweep2Rad', () => {
      const panel = makePanel({ id: 'p-scurve', profile: S_PROFILE });
      const result = buildCutListData(makeCabinet(panel));
      const row = result.rows[0];
      const expected =
        200 * (30 * Math.PI / 180) +
        150 * (30 * Math.PI / 180);
      expect(row.developedLength).toBeCloseTo(expected, 2);
    });
  });

  // ------------------------------------------------------------------
  describe('RECT panel', () => {
    it('leaves developedLength undefined for RECT profile', () => {
      const panel = makePanel({ id: 'p-rect', profile: { kind: 'RECT' } });
      const result = buildCutListData(makeCabinet(panel));
      expect(result.rows[0].developedLength).toBeUndefined();
    });

    it('leaves kerfCount undefined for RECT profile', () => {
      const panel = makePanel({ id: 'p-rect', profile: { kind: 'RECT' } });
      const result = buildCutListData(makeCabinet(panel));
      expect(result.rows[0].kerfCount).toBeUndefined();
    });

    it('leaves developedLength undefined when profile is absent', () => {
      const panel = makePanel({ id: 'p-no-profile' });
      // no profile field at all
      const result = buildCutListData(makeCabinet(panel));
      expect(result.rows[0].developedLength).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  describe('BuildCutListOptions', () => {
    it('materialMap overrides heuristic for curved panel', () => {
      // Use a weird material ID that heuristic would map to 'MDF' by default
      const panel = makePanel({
        id: 'p-arc-ply',
        profile: ARC_PROFILE,
        coreMaterialId: 'exotic-sheet-18',
      });
      const optionsNoMap: BuildCutListOptions = {};
      const optionsWithMap: BuildCutListOptions = {
        materialMap: { 'exotic-sheet-18': 'PLYWOOD' },
      };

      const rowNoMap = buildCutListData(makeCabinet(panel), optionsNoMap).rows[0];
      const rowWithMap = buildCutListData(makeCabinet(panel), optionsWithMap).rows[0];

      // Both should produce curve fields (panel is curved either way)
      expect(rowNoMap.kerfCount).toBeGreaterThan(0);
      expect(rowWithMap.kerfCount).toBeGreaterThan(0);

      // kerfCount may differ between materials; just verify both resolve
      expect(typeof rowWithMap.kerfCount).toBe('number');
    });

    it('custom kerfTool (ROUTER) still produces valid kerfCount', () => {
      const panel = makePanel({ id: 'p-arc-router', profile: ARC_PROFILE });
      const options: BuildCutListOptions = {
        kerfTool: { kind: 'ROUTER', bitDiameter: 6, kEff: 6.5 },
      };
      const result = buildCutListData(makeCabinet(panel), options);
      expect(result.rows[0].kerfCount).toBeGreaterThan(0);
    });

    it('fallbackMaterial is used when heuristic would return MDF', () => {
      // Material ID has no recognisable substring — falls to fallback
      const panel = makePanel({
        id: 'p-arc-fb',
        profile: ARC_PROFILE,
        coreMaterialId: 'unknown-board-18',
      });
      const options: BuildCutListOptions = { fallbackMaterial: 'HMR' };
      const result = buildCutListData(makeCabinet(panel), options);
      // HMR is a valid material — curve fields should still be populated
      expect(result.rows[0].developedLength).toBeGreaterThan(0);
      expect(result.rows[0].kerfCount).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  describe('Determinism', () => {
    it('identical inputs produce identical developedLength (run twice)', () => {
      const panel = makePanel({ id: 'p-det', profile: ARC_PROFILE });
      const cabinet = makeCabinet(panel);

      const r1 = buildCutListData(cabinet).rows[0].developedLength;
      const r2 = buildCutListData(cabinet).rows[0].developedLength;
      expect(r1).toBe(r2);
    });

    it('identical inputs produce identical kerfCount (run twice)', () => {
      const panel = makePanel({ id: 'p-det', profile: ARC_PROFILE });
      const cabinet = makeCabinet(panel);

      const c1 = buildCutListData(cabinet).rows[0].kerfCount;
      const c2 = buildCutListData(cabinet).rows[0].kerfCount;
      expect(c1).toBe(c2);
    });
  });

  // ------------------------------------------------------------------
  describe('Mixed cabinet (curved + flat panels)', () => {
    it('only curved panel row carries curve fields; flat row does not', () => {
      const flatPanel = makePanel({ id: 'p-flat', profile: { kind: 'RECT' } });
      const arcPanel = makePanel({ id: 'p-arc', profile: ARC_PROFILE });
      const cabinet = {
        ...makeCabinet(flatPanel),
        panels: [flatPanel, arcPanel],
      } as unknown as Cabinet;

      const result = buildCutListData(cabinet);
      const flat = result.rows.find(r => r.partId === 'p-flat')!;
      const curved = result.rows.find(r => r.partId === 'p-arc')!;

      expect(flat.developedLength).toBeUndefined();
      expect(flat.kerfCount).toBeUndefined();
      expect(curved.developedLength).toBeGreaterThan(0);
      expect(curved.kerfCount).toBeGreaterThan(0);
    });

    it('standard cut-list fields (finishW, cutW, etc.) are unaffected on curved row', () => {
      const arcPanel = makePanel({ id: 'p-arc2', profile: ARC_PROFILE });
      const result = buildCutListData(makeCabinet(arcPanel));
      const row = result.rows[0];

      expect(row.finishW).toBe(600);
      expect(row.finishH).toBe(400);
      expect(typeof row.cutW).toBe('number');
      expect(typeof row.cutH).toBe('number');
    });
  });
});
