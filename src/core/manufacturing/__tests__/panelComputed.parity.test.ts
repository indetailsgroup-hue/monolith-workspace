/**
 * THE anti-drift pin for the money formula.
 *
 * Two modules produce PanelComputed: the `computePanel` closure inside
 * generatePanels (useCabinetStore.ts) and computeWorktopPanel. They used to be
 * hand-copied twins pinned by nothing — both of their "if these drift this goes
 * red" comments were false, because the test only ever called the copy.
 *
 * They now both delegate to computePanelComputed. This file proves it by
 * driving the REAL store and comparing a real carcass panel's computed vector
 * against the shared function, rather than re-deriving the arithmetic. Change
 * the rule inside panelComputed.ts and every consumer moves together; reinstate
 * a private copy in either call site and this goes red.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../store/useCabinetStore';
import { computePanelComputed, panelRealThickness } from '../panelComputed';
import { computeWorktopPanel, resolveWorktopMaterials } from '../../worktop/computeWorktopPanel';
import { DEFAULT_WORKTOP_CONFIG } from '../../worktop/types';
import {
  CORE_MATERIALS_CATALOG,
  EDGE_MATERIALS_CATALOG,
  SURFACE_MATERIALS_CATALOG,
} from '../../materials/PanelMaterialSystem';

describe('panelComputed is the single money formula', () => {
  beforeEach(() => {
    useCabinetStore.setState({ cabinets: [], cabinet: null, activeCabinetId: null });
  });

  it('a real carcass panel from the store matches computePanelComputed exactly', () => {
    useCabinetStore.getState().createCabinet('BASE', 'Parity');

    // Pin the surface to an id that exists in BOTH catalogs.
    //
    // The store keeps its own SURFACE_MATERIALS_CATALOG (useCabinetStore.ts:177)
    // separate from PanelMaterialSystem's (PanelMaterialSystem.ts:549), and the
    // store's default 'surf-hpl-grey-oak' is not in the shared one at all — so
    // this test could not resolve it. That divergence is real and is recorded
    // as a known limitation; it is not introduced or fixed here. 'surf-mel-white'
    // is present in both and identical in both (120 THB/m2, 0.5 kg/m2).
    useCabinetStore.getState().setDefaultSurface('surf-mel-white');

    const cabinet = useCabinetStore.getState().cabinet!;

    // BOTTOM is unconditional and fully banded on all four sides by makeEdges,
    // so every term in the formula is exercised.
    const panel = cabinet.panels.find(p => p.role === 'BOTTOM')!;
    expect(panel).toBeDefined();

    const materials = {
      core: CORE_MATERIALS_CATALOG[cabinet.materials.defaultCore],
      surface: SURFACE_MATERIALS_CATALOG[cabinet.materials.defaultSurface],
      edge: EDGE_MATERIALS_CATALOG[cabinet.materials.defaultEdge],
    };
    // Read the banding off the panel rather than assuming it, so this compares
    // the FORMULA and not our guess about which slots the store bands.
    const tape = (slot: string | null) =>
      slot ? EDGE_MATERIALS_CATALOG[slot]?.thickness ?? 0 : 0;

    const expected = computePanelComputed(
      panel.finishWidth,
      panel.finishHeight,
      {
        top: tape(panel.edges.top),
        bottom: tape(panel.edges.bottom),
        left: tape(panel.edges.left),
        right: tape(panel.edges.right),
      },
      materials,
      useCabinetStore.getState().manufacturingParams.preMilling
    );

    expect(panel.computed.cost).toBeCloseTo(expected.cost, 9);
    expect(panel.computed.co2).toBeCloseTo(expected.co2, 9);
    expect(panel.computed.cutWidth).toBeCloseTo(expected.cutWidth, 9);
    expect(panel.computed.cutHeight).toBeCloseTo(expected.cutHeight, 9);
    expect(panel.computed.edgeLength).toBeCloseTo(expected.edgeLength, 9);
    expect(panel.computed.surfaceArea).toBeCloseTo(expected.surfaceArea, 9);
    expect(panel.computed.realThickness).toBeCloseTo(expected.realThickness, 9);
  });

  it('computeWorktopPanel returns exactly what computePanelComputed returns', () => {
    const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);
    const ET = m.edge.thickness;

    const viaWorktop = computeWorktopPanel(
      1800,
      598,
      { front: true, back: false, lowEnd: true, highEnd: true },
      m
    );
    const viaShared = computePanelComputed(
      1800,
      598,
      { top: ET, bottom: 0, left: ET, right: ET },
      m,
      0.5
    );

    expect(viaWorktop).toEqual(viaShared);
  });

  it('realThickness excludes glue, the same way for both call sites', () => {
    const m = resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG);
    // 18 + 0.3 + 0.3, no glue term — matches useCabinetStore's T_real.
    expect(panelRealThickness(m)).toBeCloseTo(18.6, 9);
  });
});
