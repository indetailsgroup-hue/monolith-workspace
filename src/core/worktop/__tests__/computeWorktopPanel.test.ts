/**
 * computeWorktopPanel — honest cut size, edge length, cost and CO2.
 *
 * The formula is NO LONGER duplicated. computeWorktopPanel and the computePanel
 * closure inside generatePanels both delegate to computePanelComputed
 * (src/core/manufacturing/panelComputed.ts), so the hand-computed vector below
 * pins ONE implementation rather than pretending to pin two. The genuine
 * cross-check that both call sites really share it lives in
 * src/core/manufacturing/__tests__/panelComputed.parity.test.ts.
 *
 * The zero-cost regression at the bottom is the governance guard. Doors and
 * drawer fronts currently enter the BOM at zero cost (known open bug, owned by
 * another lane). A worktop must never join them.
 */

import { describe, it, expect } from 'vitest';
import {
  computeWorktopPanel,
  resolveWorktopMaterials,
  worktopRealThickness,
} from '../computeWorktopPanel';
import { DEFAULT_WORKTOP_CONFIG, ISLAND_WORKTOP_CONFIG } from '../types';
import { EDGE_MATERIALS_CATALOG } from '../../materials/PanelMaterialSystem';

describe('resolveWorktopMaterials', () => {
  it('resolves every id in the default configs against the real catalogs', () => {
    for (const cfg of [DEFAULT_WORKTOP_CONFIG, ISLAND_WORKTOP_CONFIG]) {
      const m = resolveWorktopMaterials(cfg);
      expect(m.core.costPerSqm).toBeGreaterThan(0);
      expect(m.core.co2PerSqm).toBeGreaterThan(0);
      expect(m.surface.costPerSqm).toBeGreaterThan(0);
      expect(m.edge.costPerMeter).toBeGreaterThan(0);
      expect(m.edge.thickness).toBeGreaterThan(0);
    }
  });

  it('throws rather than silently falling back to a zero-cost material', () => {
    expect(() =>
      resolveWorktopMaterials({ ...DEFAULT_WORKTOP_CONFIG, coreMaterialId: 'core-does-not-exist' })
    ).toThrow(/core-does-not-exist/);
  });

  // ── the two buildability guards ──────────────────────────────────────────
  // Both exist because a precise price on an unbuildable spec is worse than a
  // missing price: it looks like a quote.

  it('refuses a non-moisture-resistant core — it fails at the sink', () => {
    // core-pb-35 was the previous default. It is a REAL board with a REAL price
    // (THB 520/m2) and moistureResistant: false, so it must never be quoted as
    // a worktop however correct the arithmetic is.
    expect(() =>
      resolveWorktopMaterials({ ...DEFAULT_WORKTOP_CONFIG, coreMaterialId: 'core-pb-35' })
    ).toThrow(/moisture-resistant/i);
  });

  it('refuses tape shorter than the slab is thick', () => {
    // Every tape in the catalog is 23mm tall, so any core over ~22.4mm is
    // unbandable. core-hmr-28 -> 28.6mm slab, 23mm tape: 5.6mm of raw board.
    expect(() =>
      resolveWorktopMaterials({ ...DEFAULT_WORKTOP_CONFIG, coreMaterialId: 'core-hmr-28' })
    ).toThrow(/cannot cover the edge/i);
  });

  it('the shipped default actually satisfies both guards', () => {
    const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);
    expect(m.core.moistureResistant).toBe(true);
    expect(m.edge.height).toBeGreaterThanOrEqual(worktopRealThickness(m));
  });

  it('documents WHY the default slab is thin: no tape in the catalog is taller than 23mm', () => {
    // This is the constraint that caps the worktop at an 18mm core. If a wider
    // tape SKU ever lands, this test goes red and the config should be revisited.
    const heights = Object.values(EDGE_MATERIALS_CATALOG).map(e => e.height);
    expect(Math.max(...heights)).toBe(23);
  });
});

describe('computeWorktopPanel — hand-computed parity vector', () => {
  // 1800 x 580 slab on core-hmr-18 (18mm, THB 450/m2, 10.2 kgCO2/m2),
  // surf-mel-white (0.3mm, THB 120/m2, 0.5) both faces,
  // edge-pvc-white-20 (2.0mm, THB 22/m) on the front edge and both ends,
  // no tape on the back edge (wall).
  //
  //   realThickness = 18 + 0.3 + 0.3            = 18.6 mm
  //   cutWidth      = 1800 - (2 + 2)            = 1796 mm
  //   cutHeight     = 580  - (2 + 0)            = 578 mm
  //   area          = 1800 * 580 / 1e6          = 1.044 m2
  //   edgeLength    = (1800 + 580 + 580) / 1000 = 2.96 m
  //   cost          = 1.044*450 + 1.044*2*120 + 2.96*22
  //                 = 469.80 + 250.56 + 65.12  = 785.48 THB
  //   co2           = 1.044*10.2 + 1.044*2*0.5 = 10.6488 + 1.044 = 11.6928 kg
  const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);
  const computed = computeWorktopPanel(1800, 580, {
    front: true,
    back: false,
    lowEnd: true,
    highEnd: true,
  }, m);

  it('realThickness derives from the real catalog core', () => {
    expect(computed.realThickness).toBeCloseTo(18.6, 9);
  });

  it('cut sizes deduct only the banded edges', () => {
    expect(computed.cutWidth).toBeCloseTo(1796, 9);
    expect(computed.cutHeight).toBeCloseTo(578, 9);
  });

  it('surface area counts both faces', () => {
    expect(computed.surfaceArea).toBeCloseTo(2.088, 9);
  });

  it('edge length counts the front edge and both ends, not the back', () => {
    expect(computed.edgeLength).toBeCloseTo(2.96, 9);
  });

  it('cost matches the hand-computed vector', () => {
    expect(computed.cost).toBeCloseTo(785.48, 6);
  });

  it('co2 matches the hand-computed vector', () => {
    expect(computed.co2).toBeCloseTo(11.6928, 6);
  });
});

describe('computeWorktopPanel — governance guards', () => {
  const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);

  it('a 1800x580 slab NEVER enters the BOM at zero cost or zero CO2', () => {
    const c = computeWorktopPanel(1800, 580, { front: true, back: false, lowEnd: true, highEnd: true }, m);
    expect(c.cost).toBeGreaterThan(0);
    expect(c.co2).toBeGreaterThan(0);
    expect(c.surfaceArea).toBeGreaterThan(0);
  });

  it('an entirely unbanded slab still costs material and CO2', () => {
    const c = computeWorktopPanel(1800, 580, { front: false, back: false, lowEnd: false, highEnd: false }, m);
    expect(c.edgeLength).toBe(0);
    expect(c.cost).toBeGreaterThan(0);
    expect(c.co2).toBeGreaterThan(0);
    // No tape, so no edge deduction: cut size equals finish size.
    expect(c.cutWidth).toBeCloseTo(1800, 9);
    expect(c.cutHeight).toBeCloseTo(580, 9);
  });

  it('the island config bands the back edge too, costing more tape', () => {
    const wall = computeWorktopPanel(1800, 580, { front: true, back: false, lowEnd: true, highEnd: true }, m);
    const island = computeWorktopPanel(1800, 580, { front: true, back: true, lowEnd: true, highEnd: true }, m);
    expect(island.edgeLength).toBeCloseTo(wall.edgeLength + 1.8, 9);
    expect(island.cost).toBeGreaterThan(wall.cost);
  });
});
