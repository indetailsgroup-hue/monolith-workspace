/**
 * The Phase-1 gate and the WORKTOP role must agree about what the edge slots
 * MEAN.
 *
 * They did not. deriveWorktopPanels stores the FRONT edge in the `top` slot and
 * the two run ends in `left`/`right`, but WORKTOP had no case in getExposedEdges
 * and fell through to `default: exposed.push('LEFT')`. In the carcass convention
 * 'LEFT' means the front edge; for a worktop it holds an END. Two wrong
 * behaviours came out of that one line:
 *
 *   (a) a FALSE FAIL on every slab whose low-u end is an internal split joint —
 *       i.e. on essentially every real kitchen run, since anything over 2440mm
 *       gets split and a split face correctly carries no tape;
 *   (b) a BLIND SPOT: the real front edge lives in `top` and was never checked,
 *       so a genuinely unbanded worktop front passed the gate silently.
 *
 * Both directions are pinned below. The (b) test is the non-vacuity proof: strip
 * the front band and the gate must object, or the (a) test proves nothing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../store/useCabinetStore';
import { runPhase1Gate } from '../../phase1/gate';
import { applyWorktops, isDerivedWorktopPanel } from '../applyWorktops';
import { DEFAULT_WORKTOP_CONFIG } from '../types';
import type { Cabinet } from '../../types/Cabinet';

const resetStore = () => {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
  });
};

/**
 * Six 600mm cabinets in a row: 3600mm of run, which exceeds the 2440mm blank
 * and is therefore SPLIT. Slab 2's low-u end is an internal joint face — the
 * exact case that used to raise a false blocker.
 */
function buildSplitRun(): void {
  resetStore();
  for (let i = 0; i < 6; i++) {
    useCabinetStore.getState().addCabinet(
      'BASE',
      `Run ${i}`,
      { width: 600, height: 720, depth: 560, toeKickHeight: 100 },
      [i * 600, 0, 0]
    );
  }
  applyWorktops(DEFAULT_WORKTOP_CONFIG);
}

/** Run the gate over one cabinet and return only its edge-policy issues. */
function edgeIssuesFor(cabinet: Cabinet) {
  useCabinetStore.setState({ cabinet, activeCabinetId: cabinet.id });
  return runPhase1Gate(cabinet.id).issues.filter(
    (i) => i.code === 'MONO_EDGE_MISSING_POLICY'
  );
}

describe('WORKTOP edge semantics vs the gate', () => {
  beforeEach(buildSplitRun);

  it('really does split the run — otherwise the rest of this file is vacuous', () => {
    const host = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!;
    const slabs = host.panels.filter(isDerivedWorktopPanel);
    expect(slabs.length).toBeGreaterThan(1);
    // The second slab's low-u end is an internal joint: correctly untaped.
    expect(slabs[1].edges.left).toBeNull();
  });

  it('raises ZERO edge issues on a correctly-banded split slab', () => {
    const host = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!;
    const worktopIssues = edgeIssuesFor(host).filter((i) =>
      i.entityId.startsWith('worktop:')
    );
    expect(worktopIssues).toEqual([]);
  });

  it('DOES flag a worktop whose front edge is unbanded (non-vacuity proof)', () => {
    const hostId = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!.id;

    let slabId = '';
    useCabinetStore.setState((state) => {
      for (const cab of state.cabinets) {
        if (cab.id !== hostId) continue;
        const slab = cab.panels.find(isDerivedWorktopPanel);
        if (slab) {
          slabId = slab.id;
          slab.edges.top = null; // strip the FRONT band
        }
      }
    });

    const host = useCabinetStore.getState().cabinets.find((c) => c.id === hostId)!;
    const issues = edgeIssuesFor(host).filter((i) => i.entityId === `${slabId}:TOP`);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('FAIL');
  });

  it('does not treat a run END as if it were the front edge', () => {
    // Stripping an END band must NOT raise a front-edge failure. Ends are
    // resolved per-slab by the deriver, not by role.
    const hostId = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!.id;

    useCabinetStore.setState((state) => {
      for (const cab of state.cabinets) {
        if (cab.id !== hostId) continue;
        for (const slab of cab.panels.filter(isDerivedWorktopPanel)) {
          slab.edges.left = null;
          slab.edges.right = null;
        }
      }
    });

    const host = useCabinetStore.getState().cabinets.find((c) => c.id === hostId)!;
    const worktopIssues = edgeIssuesFor(host).filter((i) =>
      i.entityId.startsWith('worktop:')
    );
    expect(worktopIssues).toEqual([]);
  });
});

describe('the tape-height rule', () => {
  beforeEach(buildSplitRun);

  it('passes the shipped worktop spec: 23mm tape over an 18.6mm slab', () => {
    const host = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!;
    const slab = host.panels.find(isDerivedWorktopPanel)!;
    expect(slab.computed.realThickness).toBeCloseTo(18.6, 6);

    const issues = runPhase1Gate(
      (useCabinetStore.setState({ cabinet: host, activeCabinetId: host.id }), host.id)
    ).issues.filter((i) => i.code === 'MONO_EDGE_TAPE_TOO_NARROW');
    expect(issues).toEqual([]);
  });

  it('FAILS a panel whose tape is shorter than the panel is thick', () => {
    // Non-vacuity: force a thick slab and confirm the rule bites. Every tape in
    // the catalog is 23mm, so 40mm of panel cannot be covered by any of them.
    const hostId = useCabinetStore
      .getState()
      .cabinets.find((c) => c.panels.some(isDerivedWorktopPanel))!.id;

    useCabinetStore.setState((state) => {
      for (const cab of state.cabinets) {
        if (cab.id !== hostId) continue;
        for (const slab of cab.panels.filter(isDerivedWorktopPanel)) {
          slab.computed.realThickness = 40;
        }
      }
    });

    const host = useCabinetStore.getState().cabinets.find((c) => c.id === hostId)!;
    useCabinetStore.setState({ cabinet: host, activeCabinetId: host.id });
    const issues = runPhase1Gate(host.id).issues.filter(
      (i) => i.code === 'MONO_EDGE_TAPE_TOO_NARROW'
    );

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('FAIL');
  });
});
