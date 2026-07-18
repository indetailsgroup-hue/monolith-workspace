/**
 * computeWorktopPanel — honest cut size, edge length, cost and CO2.
 *
 * This is a deliberate re-implementation of the computePanel closure inside
 * generatePanels (useCabinetStore.ts:1566-1590). The hand-computed vector below
 * is the anti-drift pin: if either copy of the formula changes, this goes red.
 *
 * The zero-cost regression at the bottom is the governance guard. Doors and
 * drawer fronts currently enter the BOM at zero cost (known open bug, owned by
 * another lane). A worktop must never join them.
 */

import { describe, it, expect } from 'vitest';
import { computeWorktopPanel, resolveWorktopMaterials } from '../computeWorktopPanel';
import { DEFAULT_WORKTOP_CONFIG, ISLAND_WORKTOP_CONFIG } from '../types';

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
});

describe('computeWorktopPanel — hand-computed parity vector', () => {
  // 1800 x 580 slab on core-pb-35 (35mm, THB 520/m2, 15.0 kgCO2/m2),
  // surf-mel-white (0.3mm, THB 120/m2, 0.5) both faces,
  // edge-pvc-white-20 (2.0mm, THB 22/m) on the front edge and both ends,
  // no tape on the back edge (wall).
  //
  //   realThickness = 35 + 0.3 + 0.3            = 35.6 mm
  //   cutWidth      = 1800 - (2 + 2)            = 1796 mm
  //   cutHeight     = 580  - (2 + 0)            = 578 mm
  //   area          = 1800 * 580 / 1e6          = 1.044 m2
  //   edgeLength    = (1800 + 580 + 580) / 1000 = 2.96 m
  //   cost          = 1.044*520 + 1.044*2*120 + 2.96*22
  //                 = 542.88 + 250.56 + 65.12  = 858.56 THB
  //   co2           = 1.044*15.0 + 1.044*2*0.5 = 16.704 kg
  const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);
  const computed = computeWorktopPanel(1800, 580, {
    front: true,
    back: false,
    lowEnd: true,
    highEnd: true,
  }, m);

  it('realThickness derives from the real catalog core', () => {
    expect(computed.realThickness).toBeCloseTo(35.6, 9);
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
    expect(computed.cost).toBeCloseTo(858.56, 6);
  });

  it('co2 matches the hand-computed vector', () => {
    expect(computed.co2).toBeCloseTo(16.704, 6);
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
