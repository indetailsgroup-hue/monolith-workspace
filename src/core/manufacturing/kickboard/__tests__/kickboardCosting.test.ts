/**
 * kickboardCosting.test.ts - Integration tests: the KICKBOARD must be a HONEST part.
 *
 * The kickboard is generated INSIDE generatePanels so the `computePanel` closure
 * gives it real cutWidth/cutHeight, edgeLength, surfaceArea, cost and CO2 —
 * exactly like the seven carcass roles.
 *
 * THE GUARD: doors and drawer fronts are generated OUTSIDE generatePanels and
 * currently enter the BOM at ZERO cost (known open bug, owned by another lane).
 * These tests exist so the kickboard can never regress into that pattern.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../../store/useCabinetStore';
import { getPanelHalfExtents } from '../../../geometry/cabinetAabb';
import { runPhase1Gate } from '../../../phase1/gate';
import type { CabinetPanel, KickboardConfig } from '../../../types/Cabinet';
import { DEFAULT_KICK_SETBACK } from '../kickboardGeometry';
import { DEFAULT_ASSUMED_FRONT_PROUD_MM } from '../../../geometry/appliedPartDatum';

const W = 600;
const H = 720;
const D = 560;
const LEG = 100;

// Store defaults: edge-pvc-grey-10 -> 1.0mm
const ET = 1.0;

const resetStore = () => {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
  });
};

const kickboardOf = (panels: CabinetPanel[]) =>
  panels.filter((p) => p.role === 'KICKBOARD');

/**
 * Write a kickboardConfig onto the active cabinet and regenerate its panels.
 *
 * There is no dedicated store action for this yet, so the config is written
 * through the immer draft and `recalculate()` drives the real generatePanels
 * path — the same one the app uses.
 */
const setKickboardConfig = (config: KickboardConfig) => {
  useCabinetStore.setState((state) => {
    for (const cab of [state.cabinet, ...state.cabinets]) {
      if (cab) cab.structure.kickboardConfig = config;
    }
  });
  useCabinetStore.getState().recalculate();
};

describe('KICKBOARD costing integration', () => {
  beforeEach(resetStore);

  describe('a BASE cabinet with a toe kick', () => {
    let kick: CabinetPanel;
    let panels: CabinetPanel[];

    beforeEach(() => {
      useCabinetStore.getState().addCabinet('BASE', 'Kick Test', {
        width: W,
        height: H,
        depth: D,
        toeKickHeight: LEG,
      });
      panels = useCabinetStore.getState().cabinet!.panels;
      const found = kickboardOf(panels);
      expect(found).toHaveLength(1); // exactly one, not zero and not per-side
      kick = found[0];
    });

    it('has the full cabinet width and the toe kick height', () => {
      expect(kick.finishWidth).toBe(W);
      expect(kick.finishHeight).toBe(LEG);
    });

    it('sits recessed behind the DOOR face by the declared setback, spanning Y 0..Leg', () => {
      const [x, y, z] = kick.position;
      const t = kick.computed.realThickness;
      expect(x).toBe(0);
      expect(y).toBeCloseTo(LEG / 2, 6); // centre => spans 0..Leg

      // CHANGED, and the change is the point of this lane. This used to read
      //     D / 2 - 50 - t / 2
      // i.e. 50mm behind the CARCASS face — while the worktop above the same
      // cabinet measured its overhang from the DOOR face, 18mm further out.
      // Two applied parts bracketing one front, referenced to two planes, with
      // nothing anywhere declaring it.
      //
      // Both are now on the FRONT datum. The setback is expressed here through
      // the shared constants rather than a literal, so this assertion cannot go
      // on passing if someone changes the datum without changing the geometry.
      const doorFaceZ = D / 2 + DEFAULT_ASSUMED_FRONT_PROUD_MM;
      expect(z).toBeCloseTo(doorFaceZ - DEFAULT_KICK_SETBACK - t / 2, 6);

      // And the net effect on where the part actually sits is 3mm, not 18:
      // 65 from the door face is 47 from the carcass, against the old 50.
      expect(D / 2 - (z + t / 2)).toBeCloseTo(47, 6);

      expect(kick.rotation).toEqual([0, 0, 0]);
    });

    // ---- THE ZERO-COST GUARD ----
    it('carries a strictly positive cost', () => {
      // Guarding against the door / drawer-front defect where a part generated
      // outside generatePanels enters the BOM with computed.cost === 0.
      expect(kick.computed.cost).toBeGreaterThan(0);
      expect(kick.computed.cost).not.toBe(0);
    });

    it('carries a strictly positive CO2', () => {
      expect(kick.computed.co2).toBeGreaterThan(0);
      expect(kick.computed.co2).not.toBe(0);
    });

    it('applies the edge-thickness deduction to its cut sizes', () => {
      // Banding: top + both ends. Bottom sits on the floor, unbanded.
      expect(kick.computed.cutWidth).toBe(W - 2 * ET);   // 598
      expect(kick.computed.cutHeight).toBe(LEG - ET);    // 99
      expect(kick.computed.cutWidth).toBeLessThan(kick.finishWidth);
      expect(kick.computed.cutHeight).toBeLessThan(kick.finishHeight);
    });

    it('reports the real banded edge length', () => {
      // (top 600 + left 100 + right 100) / 1000 = 0.8 m
      expect(kick.computed.edgeLength).toBeCloseTo(0.8, 9);
    });

    it('reports both faces in surfaceArea', () => {
      expect(kick.computed.surfaceArea).toBeCloseTo((W * LEG) / 1e6 * 2, 9); // 0.12 m^2
    });

    it('bands top / left / right and leaves the floor edge bare', () => {
      // makeEdges(front=top, back=bottom, left, right)
      expect(kick.edges.top).not.toBeNull();
      expect(kick.edges.left).not.toBeNull();
      expect(kick.edges.right).not.toBeNull();
      expect(kick.edges.bottom).toBeNull();
    });

    it('gets the VERTICAL-panel AABB, not the horizontal default', () => {
      // cabinetAabb getPanelHalfExtents default: returns [w/2, t/2, h/2].
      // Without an explicit KICKBOARD case this silently yields [300, 9.3, 50]
      // instead of [300, 50, 9.3] — wrong box, wrong overlap/snap behaviour.
      const t = kick.computed.realThickness;
      // PanelForAabb is a structural type with an index signature; project the
      // real panel onto it rather than casting.
      expect(
        getPanelHalfExtents({
          id: kick.id,
          role: kick.role,
          finishWidth: kick.finishWidth,
          finishHeight: kick.finishHeight,
          position: kick.position,
          rotation: kick.rotation,
          computed: { realThickness: t },
        })
      ).toEqual([W / 2, LEG / 2, t / 2]);
    });

    it('does not overlap the carcass bottom panel', () => {
      const bottom = panels.find((p) => p.role === 'BOTTOM')!;
      const kickTopY = kick.position[1] + kick.finishHeight / 2;
      const bottomUndersideY = bottom.position[1] - bottom.computed.realThickness / 2;
      expect(kickTopY).toBeCloseTo(bottomUndersideY, 6);
    });
  });

  describe('phase 1 gate', () => {
    // checkEdgeRules tags issues as entityId = `${panel.id}:${edge}`
    const kickEdgeIssues = (cabinetId: string, kickId: string) =>
      runPhase1Gate(cabinetId).issues.filter((i) => i.entityId.startsWith(`${kickId}:`));

    const buildGateCabinet = () => {
      useCabinetStore.getState().addCabinet('BASE', 'Gate Test', {
        width: W,
        height: H,
        depth: D,
        toeKickHeight: LEG,
      });
      const cabinet = useCabinetStore.getState().cabinet!;
      return { cabinetId: cabinet.id, kickId: kickboardOf(cabinet.panels)[0].id };
    };

    it('raises no unbanded-exposed-edge issue against the kickboard as generated', () => {
      // makeEdges(true,false,true,true) must agree with the gate's exposure rule
      // for KICKBOARD (TOP/LEFT/RIGHT).
      const { cabinetId, kickId } = buildGateCabinet();
      expect(kickEdgeIssues(cabinetId, kickId)).toEqual([]);
    });

    it('DOES flag the kickboard once its top band is removed (non-vacuity proof)', () => {
      // Without this the test above would pass even if the gate never inspected
      // the kickboard at all.
      const { cabinetId, kickId } = buildGateCabinet();
      // immer draft: mutate only, never return
      useCabinetStore.setState((state) => {
        for (const cab of [state.cabinet, ...state.cabinets]) {
          const kick = cab?.panels.find((p) => p.id === kickId);
          if (kick) kick.edges.top = null;
        }
      });

      const issues = kickEdgeIssues(cabinetId, kickId);
      expect(issues).toHaveLength(1);
      expect(issues[0].entityId).toBe(`${kickId}:TOP`);
      expect(issues[0].severity).toBe('FAIL');
    });
  });

  describe('a cabinet with no toe kick', () => {
    it('gets no kickboard at all', () => {
      useCabinetStore.getState().addCabinet('WALL', 'Wall Test', {
        width: W,
        height: H,
        depth: 350,
        toeKickHeight: 0,
      });
      const panels = useCabinetStore.getState().cabinet!.panels;
      expect(kickboardOf(panels)).toHaveLength(0);
    });
  });

  describe('totals', () => {
    it('the kickboard reaches calculateTotals rather than being generated and dropped', () => {
      const build = (toeKickHeight: number) => {
        resetStore();
        useCabinetStore.getState().addCabinet('BASE', 'Totals', {
          width: W,
          height: H,
          depth: D,
          toeKickHeight,
        });
        const cab = useCabinetStore.getState().cabinet!;
        return { totals: cab.computed, panels: cab.panels };
      };

      const without = build(0);
      const with100 = build(LEG);

      const kick = kickboardOf(with100.panels)[0];
      expect(kick).toBeDefined();

      expect(with100.panels.length).toBe(without.panels.length + 1);
      expect(with100.totals.totalCost).toBeCloseTo(
        without.totals.totalCost + kick.computed.cost,
        6
      );
      expect(with100.totals.totalCO2).toBeCloseTo(
        without.totals.totalCO2 + kick.computed.co2,
        6
      );
      expect(with100.totals.totalEdgeLength).toBeCloseTo(
        without.totals.totalEdgeLength + kick.computed.edgeLength,
        6
      );
    });
  });

  // ==========================================================================
  // WALL CABINETS MUST NOT GET A PLINTH
  //
  // Driven through the REAL store, because the bug lived precisely in the gap
  // between the unit under test and the store: createCabinet ignores `type`
  // when it builds panels and always passes DEFAULT_DIMENSIONS, which carries
  // toeKickHeight 100. So every WALL cabinet in the product was born with a
  // toe kick it does not have, and a height-only gate happily costed a plinth
  // for it — real money in the quote and a real 600x100 part in the cut list
  // and the DXF for a cabinet that hangs on a wall over open floor.
  //
  // The old unit test claimed to cover this by passing a hand-built
  // {toeKickHeight: 0} literal. No WALL cabinet the store can create has that,
  // so it proved nothing while reading as though it proved everything.
  // ==========================================================================
  describe('a WALL cabinet', () => {
    it('gets no KICKBOARD panel at all', () => {
      useCabinetStore.getState().createCabinet('WALL', 'Wall unit');
      const cab = useCabinetStore.getState().cabinet!;

      // The precondition that made the old test vacuous — assert it explicitly
      // so this test cannot silently become vacuous the same way.
      expect(cab.dimensions.toeKickHeight).toBeGreaterThan(0);

      expect(kickboardOf(cab.panels)).toHaveLength(0);
      expect(cab.panels.some((p) => p.role === 'KICKBOARD')).toBe(false);
    });

    it('is not charged for a plinth in its totals', () => {
      useCabinetStore.getState().createCabinet('WALL', 'Wall unit');
      const wall = useCabinetStore.getState().cabinet!;

      resetStore();
      useCabinetStore.getState().createCabinet('BASE', 'Base unit');
      setKickboardConfig({ hasKickboard: false });
      const baseNoKick = useCabinetStore.getState().cabinet!;

      // Same dimensions (createCabinet uses DEFAULT_DIMENSIONS for both), so a
      // WALL unit must cost exactly what a BASE unit with the plinth switched
      // off costs. Any difference is a phantom part.
      expect(wall.computed.totalCost).toBeCloseTo(baseNoKick.computed.totalCost, 6);
      expect(wall.computed.totalCO2).toBeCloseTo(baseNoKick.computed.totalCO2, 6);
      expect(wall.computed.panelCount).toBe(baseNoKick.computed.panelCount);
    });
  });

  describe('a TALL cabinet', () => {
    it('DOES get a plinth — a pantry stands on the floor', () => {
      // Not a copy-paste of the WALL case. CabinetTaxonomy declares TALL_PANTRY
      // and TALL_BROOM with hasToeKick: true, so excluding TALL would delete a
      // real part from a real quote.
      useCabinetStore.getState().createCabinet('TALL', 'Pantry');
      const cab = useCabinetStore.getState().cabinet!;

      expect(cab.dimensions.toeKickHeight).toBeGreaterThan(0);
      expect(kickboardOf(cab.panels)).toHaveLength(1);
      expect(kickboardOf(cab.panels)[0].computed.cost).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // MATERIAL OVERRIDE MUST MOVE THE MONEY
  //
  // KickboardConfig advertises coreMaterialId as "e.g. moisture-resistant".
  // It was recorded on the panel and read by nothing: computePanel resolves its
  // materials once from the cabinet defaults and takes no material argument, so
  // an MR plinth was quoted at standard particleboard cost and stamped with the
  // default core's realThickness — which feeds nesting and the DXF.
  // ==========================================================================
  describe('the kickboard core override', () => {
    it('changes cost, CO2 and realThickness, not just the recorded id', () => {
      useCabinetStore.getState().createCabinet('BASE', 'Base');
      const standard = kickboardOf(useCabinetStore.getState().cabinet!.panels)[0];

      // Store default core is core-hmr-18 (18mm, THB 450/m2, 10.2 kg/m2).
      // Override to a genuinely different board so the delta is unambiguous.
      setKickboardConfig({ hasKickboard: true, coreMaterialId: 'core-pb-mr-16' });
      const overridden = kickboardOf(useCabinetStore.getState().cabinet!.panels)[0];

      expect(overridden.coreMaterialId).toBe('core-pb-mr-16');
      // 16mm core vs the default 18mm: the plinth really is a different board.
      // Surfaces are surf-hpl-grey-oak, 0.8mm a side, so 16 + 0.8 + 0.8 = 17.6.
      expect(overridden.computed.realThickness).not.toBeCloseTo(
        standard.computed.realThickness,
        6
      );
      expect(standard.computed.realThickness).toBeCloseTo(19.6, 6);
      expect(overridden.computed.realThickness).toBeCloseTo(17.6, 6);
      // core-pb-mr-16 is THB 310/m2 against core-hmr-18's 450 — cheaper board,
      // cheaper part. The point is that the number MOVED at all.
      expect(overridden.computed.cost).not.toBeCloseTo(standard.computed.cost, 6);
      expect(overridden.computed.co2).not.toBeCloseTo(standard.computed.co2, 6);
      expect(overridden.computed.cost).toBeGreaterThan(0);
    });
  });
});
