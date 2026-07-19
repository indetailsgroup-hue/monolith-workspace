/**
 * G4.1 OD budget, driven through the REAL cabinet store.
 *
 * WHY THIS FILE EXISTS
 * The OD budget compares a cabinet's panel AABB against its declared
 * dimensions, at 0.1mm tolerance, at severity BLOCKER. Two roles added in this
 * branch sit outside that envelope by construction:
 *
 *   KICKBOARD occupies Y 0..toeKickHeight while the carcass sits at
 *     toeKickHeight..toeKickHeight+height. `dimensions.height` measures the
 *     carcass alone — the toe kick is a separate field precisely because it is
 *     not part of it. A 720mm cabinet with a 100mm plinth spans 820mm.
 *   WORKTOP spans a RUN. An 1800mm slab is hosted on one 600mm cabinet so it
 *     inherits the cut list, BOM, DXF and gate for free.
 *
 * Folded into the budget AABB, both produce BLOCKERs on completely healthy
 * designs — reproducibly: a default BASE cabinet reported
 * "height 820.0mm exceeds declared 720mm", and a worktop host reported width,
 * height AND depth at once.
 *
 * That did not fire in the app, because ruleG4_OdBudget is exported but never
 * called from runGate.ts. It was a loaded gun, not a misfire — and the natural
 * "fix" for whoever wires G4 in later is to loosen odToleranceMm, which would
 * weaken a safety gate for real. So the contract is encoded instead
 * (OD_BUDGET_EXCLUDED_ROLES) and pinned here.
 *
 * The whole 4881-test suite missed this because nothing ran G4 over a cabinet
 * the store actually built. These tests do exactly that.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { ruleG4_OdBudget } from '../rules/gateG4_geometry';
import { computeCarcassOdAabb, getAabbDimensions } from '../../core/geometry/cabinetAabb';
import { applyWorktops, isDerivedWorktopPanel } from '../../core/worktop/applyWorktops';
import { DEFAULT_WORKTOP_CONFIG } from '../../core/worktop/types';
import type { CabinetForAabb } from '../../core/geometry/cabinetAabb';

const resetStore = () => {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
  });
};

const blockersFor = (cabinet: CabinetForAabb) =>
  ruleG4_OdBudget({}, cabinet).filter((i) => i.severity === 'BLOCKER');

describe('G4.1 OD budget over real store cabinets', () => {
  beforeEach(resetStore);

  it('a default BASE cabinet with a kickboard produces ZERO OD blockers', () => {
    useCabinetStore.getState().createCabinet('BASE', 'Base');
    const cabinet = useCabinetStore.getState().cabinet!;

    // Non-vacuity: the plinth really is there and really does sit below the
    // carcass, so the exclusion is doing work rather than the part being absent.
    const kick = cabinet.panels.find((p) => p.role === 'KICKBOARD');
    expect(kick).toBeDefined();
    expect(kick!.position[1]).toBeLessThan(cabinet.dimensions.toeKickHeight);

    expect(blockersFor(cabinet as unknown as CabinetForAabb)).toEqual([]);
  });

  it('the carcass envelope itself still matches the declared dimensions', () => {
    useCabinetStore.getState().createCabinet('BASE', 'Base');
    const cabinet = useCabinetStore.getState().cabinet!;

    const [w, h, d] = getAabbDimensions(
      computeCarcassOdAabb(cabinet as unknown as CabinetForAabb)
    );
    // This is the assertion that keeps the rule meaningful: excluding applied
    // parts must NOT excuse a carcass that genuinely overflows.
    expect(w).toBeCloseTo(cabinet.dimensions.width, 1);
    expect(h).toBeCloseTo(cabinet.dimensions.height, 1);
    expect(d).toBeCloseTo(cabinet.dimensions.depth, 1);
  });

  it('a worktop HOST produces ZERO OD blockers even with a run-spanning slab', () => {
    for (let i = 0; i < 3; i++) {
      useCabinetStore.getState().addCabinet(
        'BASE',
        `Run ${i}`,
        { width: 600, height: 720, depth: 560, toeKickHeight: 100 },
        [i * 600, 0, 0]
      );
    }
    applyWorktops(DEFAULT_WORKTOP_CONFIG);

    const host = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!;
    const slab = host.panels.find(isDerivedWorktopPanel)!;

    // Non-vacuity: the slab really is far wider than its host.
    expect(slab.finishWidth).toBeGreaterThan(host.dimensions.width * 2);

    expect(blockersFor(host as unknown as CabinetForAabb)).toEqual([]);
  });

  it('STILL blocks a carcass panel that genuinely overflows the declared OD', () => {
    // The rule must not have been defanged. Push a real carcass panel out of
    // the envelope and G4.1 must object.
    useCabinetStore.getState().createCabinet('BASE', 'Base');
    useCabinetStore.setState((state) => {
      for (const cab of [state.cabinet, ...state.cabinets]) {
        const shelf = cab?.panels.find((p) => p.role === 'SHELF' || p.role === 'TOP');
        if (shelf) shelf.finishWidth = cab!.dimensions.width + 200;
      }
    });

    const cabinet = useCabinetStore.getState().cabinet!;
    const blockers = blockersFor(cabinet as unknown as CabinetForAabb);

    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((i) => i.code === 'B_G4_OD_WIDTH_EXCEEDED')).toBe(true);
  });
});
