/**
 * @vitest-environment jsdom
 *
 * The persisted gate report must see the same holes the UI gate sees, and must
 * NEVER be silently empty.
 *
 * @module spec/__tests__/gateReportDrillOps.test
 *
 * ## The divergence this pins shut
 *
 * `runGateV01` in the persisted path (services.runGate) reads
 * `snapshot.payload.drillOps`. That array used to be fed from
 * `draftManufacturing.drillOps`, which is filled by `setDrillOps` — a method
 * with NO production caller (only a unit test ever called it). So the stored,
 * audited GateReport examined zero holes while the UI gate (which reads
 * `useDrillMapStore`) saw hundreds. A record that disagrees with the screen is
 * worse than both being empty.
 *
 * Two guarantees:
 *   (a) `freeze()` captures the real holes from `useDrillMapStore` into the
 *       snapshot payload, so the persisted report examines the same holes.
 *   (b) if a snapshot is frozen with no drill ops anyway, the stored report
 *       carries `W_DRILLOPS_NOT_SUPPLIED` — it states on its face that it
 *       checked no holes, instead of reading as a clean pass.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createSpecStore } from '../store';
import {
  createMockSpecServices,
  createInitialDraftDoc,
  makeMockBreakdownRows,
  type MockDb,
  type UserCtx,
} from '../services';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import type {
  DrillMap,
  DrillMapPanel,
  DrillMapPoint,
  Vec3Tuple,
} from '../../core/manufacturing/drillMap/types';

const USER: UserCtx = { userId: 'user_test' };

function emptyDb(): MockDb {
  return {
    draftsByProject: new Map(),
    snapshotsById: new Map(),
    gateReportsById: new Map(),
    releaseById: new Map(),
    latestGateBySnapshotId: new Map(),
  };
}

/** One dowel bored into the back edge of a LEFT_SIDE panel (a real EDGE bore). */
function sideDrillMap(): DrillMap {
  const point: DrillMapPoint = {
    id: 'p1',
    panelId: 'panel-left',
    position: [9, 200, 300] as Vec3Tuple,
    normal: [0, 0, -1] as Vec3Tuple,
    diameter: 8,
    depth: 12,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    status: 'VALID',
  };
  const panel: DrillMapPanel = {
    panelId: 'panel-left',
    role: 'LEFT_SIDE',
    dimensions: { width: 560, height: 720, thickness: 18 },
    worldPosition: [9, 360, 280],
    worldRotation: [0, 0, 0],
    points: [point],
  };
  return { version: '1.0.0', panels: [panel] } as DrillMap;
}

afterEach(() => {
  // Do not leak a drill map into unrelated tests sharing this global store.
  useDrillMapStore.setState({ drillMap: null });
});

describe('persisted gate report — drillOps provenance', () => {
  // ─────────────────────────────────────────────────────────────────────
  // (a) freeze() captures the real holes into the persisted snapshot
  // ─────────────────────────────────────────────────────────────────────
  it('captures the generated drill map holes into the frozen snapshot payload', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_wire', USER);
    db.draftsByProject.set('proj_wire', draft);

    const { services } = createMockSpecServices({ db, user: USER });
    const store = createSpecStore(services, draft);

    // The generator's output lives here — the same store the UI gate reads.
    useDrillMapStore.setState({ drillMap: sideDrillMap() });

    await store.getState().freeze('capture holes');

    const snaps = [...db.snapshotsById.values()];
    const snap = snaps[snaps.length - 1];
    if (!snap?.payload) throw new Error('expected a frozen snapshot with a payload');
    const drillOps = snap.payload.drillOps ?? [];
    // Before the wiring this was [] — the persisted report saw no holes at all.
    expect(drillOps.length).toBeGreaterThan(0);
    expect(drillOps[0].partId).toBe('panel-left');
  });

  it('freezes an empty drillOps payload when no drill map has been generated', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_empty', USER);
    db.draftsByProject.set('proj_empty', draft);

    const { services } = createMockSpecServices({ db, user: USER });
    const store = createSpecStore(services, draft);

    // No drill map generated yet.
    useDrillMapStore.setState({ drillMap: null });

    await store.getState().freeze('no holes yet');

    const snaps = [...db.snapshotsById.values()];
    const snap = snaps[snaps.length - 1];
    if (!snap?.payload) throw new Error('expected a frozen snapshot with a payload');
    expect(snap.payload.drillOps ?? []).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // (b) the stored report can never be empty AND silent
  // ─────────────────────────────────────────────────────────────────────
  it('flags a snapshot frozen without drill ops so the record is not a silent pass', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_flag', USER);
    db.draftsByProject.set('proj_flag', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });

    const snap = await services.freezeToSnapshot({
      projectId: 'proj_flag',
      revisionId: draft.revisionId,
      payload: {
        breakdownRows: makeMockBreakdownRows(),
        drillOps: [], // real scene, but the payload carried no holes
      },
    });

    const report = await services.runGate({
      snapshotId: snap.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    const codes = report.warnings.map((w) => w.code);
    expect(codes).toContain('W_DRILLOPS_NOT_SUPPLIED');
  });

  it('does NOT flag a snapshot that carried real drill ops', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_ok', USER);
    db.draftsByProject.set('proj_ok', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });

    const snap = await services.freezeToSnapshot({
      projectId: 'proj_ok',
      revisionId: draft.revisionId,
      payload: {
        breakdownRows: makeMockBreakdownRows(),
        drillOps: [
          { opId: 'op1', partId: 'PANEL_SIDE_L', depthMm: 12, diaMm: 8 },
        ],
      },
    });

    const report = await services.runGate({
      snapshotId: snap.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    const codes = report.warnings.map((w) => w.code);
    expect(codes).not.toContain('W_DRILLOPS_NOT_SUPPLIED');
  });
});
