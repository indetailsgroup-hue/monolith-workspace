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
import type { CabinetPanel } from '../../../types/Cabinet';

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

    it('sits recessed behind the carcass front face, spanning Y 0..Leg', () => {
      const [x, y, z] = kick.position;
      const t = kick.computed.realThickness;
      expect(x).toBe(0);
      expect(y).toBeCloseTo(LEG / 2, 6);            // centre => spans 0..Leg
      expect(z).toBeCloseTo(D / 2 - 50 - t / 2, 6); // default 50mm setback
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
});
