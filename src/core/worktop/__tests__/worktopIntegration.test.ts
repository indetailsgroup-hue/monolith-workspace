/** @vitest-environment jsdom */
/**
 * End-to-end: real store, real cabinets, real cut list, real totals.
 *
 * The unit tests prove the geometry. This proves the hosting decision actually
 * pays off — that a WORKTOP panel merged into cabinet.panels really does reach
 * the cut list and the project totals with no downstream edits.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../store/useCabinetStore';
import { applyWorktops, clearWorktops, isDerivedWorktopPanel } from '../applyWorktops';
import { geometrySignature, mountWorktopReconciler } from '../worktopReconciler';
import { generateCutListSkill } from '../../skills/generate/cutList';
import type { Cabinet } from '../../types/Cabinet';

/** Build a straight run of three 600mm base cabinets in the real store. */
function buildStraightRun() {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
    hiddenCabinetIds: [],
  });

  // createCabinet RESETS cabinets to a single element (useCabinetStore.ts:2345),
  // so only the first one goes through it; the rest use addCabinet.
  const store = useCabinetStore.getState();
  store.createCabinet('BASE', 'Run 0');
  store.addCabinet('BASE', 'Run 1', { width: 600, height: 720, depth: 560, toeKickHeight: 100 }, [600, 0, 0]);
  store.addCabinet('BASE', 'Run 2', { width: 600, height: 720, depth: 560, toeKickHeight: 100 }, [1200, 0, 0]);

  // Place them 600mm apart along X. scenePosition is the footprint CENTRE.
  useCabinetStore.setState((state: { cabinets: Cabinet[] }) => {
    state.cabinets.forEach((c, i) => {
      (c as unknown as { scenePosition: number[] }).scenePosition = [i * 600, 0, 0];
      (c as unknown as { sceneRotation: number[] }).sceneRotation = [0, 0, 0];
      c.dimensions = { width: 600, height: 720, depth: 560, toeKickHeight: 100 };
    });
  });

  return useCabinetStore.getState().cabinets;
}

function worktopPanels() {
  return useCabinetStore
    .getState()
    .cabinets.flatMap(c => c.panels.filter(isDerivedWorktopPanel));
}

function projectTotals() {
  return useCabinetStore.getState().cabinets.reduce(
    (acc, c) => ({
      cost: acc.cost + c.computed.totalCost,
      co2: acc.co2 + c.computed.totalCO2,
    }),
    { cost: 0, co2: 0 }
  );
}

describe('applyWorktops — merge into the real store', () => {
  beforeEach(() => {
    buildStraightRun();
  });

  it('hosts one slab on the first cabinet of the run', () => {
    const result = applyWorktops();
    expect(result.changed).toBe(true);
    expect(result.panelCount).toBe(1);

    const slabs = worktopPanels();
    expect(slabs).toHaveLength(1);
    expect(slabs[0].role).toBe('WORKTOP');
    expect(slabs[0].finishWidth).toBeCloseTo(1800, 6);
  });

  it('adds exactly the slab cost and CO2 to the project totals', () => {
    const before = projectTotals();
    applyWorktops();
    const after = projectTotals();

    const slabs = worktopPanels();
    const slabCost = slabs.reduce((s, p) => s + p.computed.cost, 0);
    const slabCO2 = slabs.reduce((s, p) => s + p.computed.co2, 0);

    expect(slabCost).toBeGreaterThan(0);
    expect(after.cost - before.cost).toBeCloseTo(slabCost, 6);
    expect(after.co2 - before.co2).toBeCloseTo(slabCO2, 6);
  });

  it('is idempotent: a second call writes nothing and changes no id', () => {
    applyWorktops();
    const first = worktopPanels().map(p => ({ ...p }));
    const totalsAfterFirst = projectTotals();

    const second = applyWorktops();
    expect(second.changed).toBe(false);

    const again = worktopPanels();
    expect(again.map(p => p.id)).toEqual(first.map(p => p.id));
    expect(again.map(p => p.position)).toEqual(first.map(p => p.position));
    expect(projectTotals().cost).toBeCloseTo(totalsAfterFirst.cost, 9);
  });

  it('never double-counts: applying three times leaves one slab', () => {
    applyWorktops();
    applyWorktops();
    applyWorktops();
    expect(worktopPanels()).toHaveLength(1);
  });

  it('clearWorktops restores the original totals exactly', () => {
    const before = projectTotals();
    applyWorktops();
    clearWorktops();
    const after = projectTotals();
    expect(after.cost).toBeCloseTo(before.cost, 6);
    expect(after.co2).toBeCloseTo(before.co2, 6);
    expect(worktopPanels()).toHaveLength(0);
  });
});

describe('cut list integration — the role-agnostic path really carries WORKTOP', () => {
  beforeEach(() => {
    buildStraightRun();
    applyWorktops();
  });

  it('emits a WORKTOP row with honest cut sizes and edge banding', async () => {
    const cabinets = useCabinetStore.getState().cabinets;
    const result = await generateCutListSkill.execute({ cabinets } as never);

    const rows = JSON.stringify(result);
    expect(rows).toContain('WORKTOP');

    const host = cabinets.find(c => c.panels.some(isDerivedWorktopPanel))!;
    const slab = host.panels.find(isDerivedWorktopPanel)!;
    // 1800 long minus two 2.0mm end tapes = 1796.
    // 603 deep (560 carcass + 18 door + 25 overhang, FRONT datum) minus the
    // 2.0mm front tape and the 2.0mm back tape = 599. Was 594 at the previous
    // 20mm overhang; the DATUM is unchanged, only the projection.
    expect(slab.computed.cutWidth).toBeCloseTo(1796, 6);
    expect(slab.computed.cutHeight).toBeCloseTo(599, 6);
    expect(slab.computed.edgeLength).toBeGreaterThan(0);
  });
});

describe('worktopReconciler', () => {
  beforeEach(() => {
    buildStraightRun();
  });

  it('excludes worktop panels from the signature, so it cannot re-trigger itself', () => {
    const before = geometrySignature(useCabinetStore.getState().cabinets);
    applyWorktops();
    const after = geometrySignature(useCabinetStore.getState().cabinets);
    expect(after).toBe(before);
  });

  it('reacts to the signature when a cabinet moves', () => {
    const before = geometrySignature(useCabinetStore.getState().cabinets);
    useCabinetStore.setState((state: { cabinets: Cabinet[] }) => {
      (state.cabinets[2] as unknown as { scenePosition: number[] }).scenePosition = [5000, 0, 0];
    });
    expect(geometrySignature(useCabinetStore.getState().cabinets)).not.toBe(before);
  });

  it('derives worktops on mount and re-derives when the scene moves', () => {
    const unsubscribe = mountWorktopReconciler();
    try {
      expect(worktopPanels()).toHaveLength(1);
      expect(worktopPanels()[0].finishWidth).toBeCloseTo(1800, 6);

      // Pull the third cabinet far away: the run breaks into two.
      useCabinetStore.setState((state: { cabinets: Cabinet[] }) => {
        (state.cabinets[2] as unknown as { scenePosition: number[] }).scenePosition = [5000, 0, 0];
      });

      const slabs = worktopPanels();
      expect(slabs).toHaveLength(2);
      const widths = slabs.map(p => p.finishWidth).sort((a, b) => a - b);
      expect(widths[0]).toBeCloseTo(600, 6);   // the lone cabinet
      expect(widths[1]).toBeCloseTo(1200, 6);  // the remaining pair
    } finally {
      unsubscribe();
    }
  });

  it('stops reacting once unsubscribed', () => {
    const unsubscribe = mountWorktopReconciler();
    expect(worktopPanels()).toHaveLength(1);
    unsubscribe();

    useCabinetStore.setState((state: { cabinets: Cabinet[] }) => {
      (state.cabinets[2] as unknown as { scenePosition: number[] }).scenePosition = [5000, 0, 0];
    });
    // Still the single stale slab: nothing re-derived.
    expect(worktopPanels()).toHaveLength(1);
  });
});

describe('save/load survival — the core justification for deriving, not persisting', () => {
  it('re-derives identical run decomposition and identical panel ids', () => {
    buildStraightRun();
    applyWorktops();
    const before = worktopPanels().map(p => ({ id: p.id, w: p.finishWidth, pos: [...p.position] }));

    // Simulate what saveProject/loadProject does: keep only the six persisted
    // fields per cabinet, drop panels entirely, then regenerate the carcass.
    const persisted = useCabinetStore.getState().cabinets.map(c => ({
      id: c.id,
      name: c.name,
      dimensions: { ...c.dimensions },
      scenePosition: [...((c as unknown as { scenePosition: number[] }).scenePosition)],
      sceneRotation: [...((c as unknown as { sceneRotation: number[] }).sceneRotation)],
    }));

    buildStraightRun();
    useCabinetStore.setState((state: { cabinets: Cabinet[] }) => {
      state.cabinets.forEach((c, i) => {
        c.id = persisted[i].id;
        c.dimensions = persisted[i].dimensions;
        (c as unknown as { scenePosition: number[] }).scenePosition = persisted[i].scenePosition;
        (c as unknown as { sceneRotation: number[] }).sceneRotation = persisted[i].sceneRotation;
      });
    });

    applyWorktops();
    const after = worktopPanels().map(p => ({ id: p.id, w: p.finishWidth, pos: [...p.position] }));

    expect(after).toEqual(before);
  });
});
