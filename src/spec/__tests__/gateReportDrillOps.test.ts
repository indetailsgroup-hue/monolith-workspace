/**
 * @vitest-environment jsdom
 *
 * The persisted gate report must see the same holes the UI gate sees, must
 * actually EVALUATE them, and must NEVER be silently empty.
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
 * Wiring the holes in exposed a SECOND, worse bug: the captured ops are keyed by
 * the drill-map panelId ('panel-left'), the breakdown parts by the cut-list
 * scheme ('PANEL_SIDE_L'), and nothing bridges the two. Every op missed its
 * part in the material rules (`if (!p) continue`) and a genuine through-drill
 * was dropped from the report — a non-empty drillOps array that checked NOTHING,
 * which the old length===0 guard read as a clean pass.
 *
 * Guarantees pinned here:
 *   (a) `freeze()` captures the real holes AND the parts they reference from the
 *       same drill map, so the persisted report examines the same holes.
 *   (b) a genuine FACE through-drill frozen from a REAL drill map produces
 *       B_SAFETY_DRILL_DEPTH in the PERSISTED report (not just the UI) — this is
 *       the join actually working, end to end.
 *   (c) a correct EDGE bore on the same real geometry PASSES — the depth blocker
 *       above is a real check, not the rule being off.
 *   (d) if a snapshot reaches the gate with ops that resolve to no part (empty,
 *       or an id-scheme mismatch), the stored report carries
 *       W_DRILLOPS_NOT_SUPPLIED — it states on its face that it checked no
 *       holes, instead of reading as a clean pass.
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

/**
 * The same LEFT_SIDE panel carrying a correct EDGE dowel PLUS a FACE bore driven
 * 30mm into the 18mm thickness — a genuine drill-through. The FACE bore's normal
 * runs along the panel's thickness axis (X for a side panel), so the gate sees
 * only ~18mm of material ahead of the 30mm bit.
 */
function sideDrillMapWithThroughBore(): DrillMap {
  const edgeDowel: DrillMapPoint = {
    id: 'edge-dowel',
    panelId: 'panel-left',
    position: [9, 200, 300] as Vec3Tuple,
    normal: [0, 0, -1] as Vec3Tuple,
    diameter: 8,
    depth: 12,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    status: 'VALID',
  };
  const faceThrough: DrillMapPoint = {
    id: 'face-through',
    panelId: 'panel-left',
    position: [9, 360, 280] as Vec3Tuple,
    normal: [-1, 0, 0] as Vec3Tuple,
    diameter: 10,
    depth: 30,
    purpose: 'BOLT',
    componentType: 'BOLT',
    status: 'VALID',
  };
  const panel: DrillMapPanel = {
    panelId: 'panel-left',
    role: 'LEFT_SIDE',
    dimensions: { width: 560, height: 720, thickness: 18 },
    worldPosition: [9, 360, 280],
    worldRotation: [0, 0, 0],
    points: [edgeDowel, faceThrough],
  };
  return { version: '1.0.0', panels: [panel] } as DrillMap;
}

afterEach(() => {
  // Do not leak a drill map into unrelated tests sharing this global store.
  useDrillMapStore.setState({ drillMap: null });
});

describe('persisted gate report — drillOps provenance', () => {
  // ─────────────────────────────────────────────────────────────────────
  // (a) freeze() captures the real holes AND their parts into the snapshot
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

    // The parts the ops reference must be captured from the SAME drill map, or
    // the ops resolve to nothing at gate time. Keyed by the drill-map panelId,
    // matching the ops — NOT the breakdown 'PANEL_SIDE_L' scheme.
    const drillParts = snap.payload.drillParts ?? [];
    expect(drillParts.some((p) => p.partId === 'panel-left')).toBe(true);
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
  // (b) a REAL through-drill, frozen from a REAL drill map, is caught in the
  //     PERSISTED report — the join working end to end, not a hand-matched id.
  // ─────────────────────────────────────────────────────────────────────
  it('emits B_SAFETY_DRILL_DEPTH in the persisted report for a real through-drill', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_through', USER);
    db.draftsByProject.set('proj_through', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });
    const store = createSpecStore(services, draft);

    // A real generated drill map — the ops it produces are keyed 'panel-left',
    // NOT the breakdown 'PANEL_SIDE_L'. The persisted gate must still evaluate
    // them.
    useDrillMapStore.setState({ drillMap: sideDrillMapWithThroughBore() });

    await store.getState().freeze('through-drill');

    const frozen = store.getState().doc;
    if (frozen.state !== 'FROZEN') {
      throw new Error(`expected FROZEN, got ${frozen.state}`);
    }
    // The captured ops are keyed by the drill-map scheme, proving the join is
    // exercised (not hand-matched to a breakdown row).
    expect((frozen.snapshot.payload?.drillOps ?? []).every((o) => o.partId === 'panel-left')).toBe(true);

    const report = await services.runGate({
      snapshotId: frozen.snapshot.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    const blockerCodes = report.blockers.map((b) => b.code);
    expect(blockerCodes).toContain('B_SAFETY_DRILL_DEPTH');
    // A report that actually evaluated the holes is NOT an evidence-free run.
    const warnCodes = report.warnings.map((w) => w.code);
    expect(warnCodes).not.toContain('W_DRILLOPS_NOT_SUPPLIED');
    expect(warnCodes).not.toContain('W_DRILLOPS_UNRESOLVED');
  });

  // ─────────────────────────────────────────────────────────────────────
  // (c) a correct EDGE bore on the same real geometry PASSES — the blocker
  //     above is a real safety check, not the depth rule misfiring.
  // ─────────────────────────────────────────────────────────────────────
  it('passes a correct edge bore in the persisted report (no depth blocker)', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_edge', USER);
    db.draftsByProject.set('proj_edge', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });
    const store = createSpecStore(services, draft);

    // Only the correct Ø8 dowel into the 560mm back edge — an EDGE bore.
    useDrillMapStore.setState({ drillMap: sideDrillMap() });

    await store.getState().freeze('correct edge bore');

    const frozen = store.getState().doc;
    if (frozen.state !== 'FROZEN') {
      throw new Error(`expected FROZEN, got ${frozen.state}`);
    }
    const report = await services.runGate({
      snapshotId: frozen.snapshot.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    const blockerCodes = report.blockers.map((b) => b.code);
    // The bore is evaluated (ops resolved) and it is safe: no depth blocker, no
    // off-centre blocker, and no "not checked" escape hatch.
    expect(blockerCodes).not.toContain('B_SAFETY_DRILL_DEPTH');
    expect(blockerCodes).not.toContain('B_SAFETY_EDGE_BORE_OFF_CENTRE');
    const warnCodes = report.warnings.map((w) => w.code);
    expect(warnCodes).not.toContain('W_DRILLOPS_NOT_SUPPLIED');
    expect(warnCodes).not.toContain('W_DRILLOPS_UNRESOLVED');
  });

  // ─────────────────────────────────────────────────────────────────────
  // (d) the stored report can never be empty AND silent
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

  it('flags a snapshot whose ops resolve to NO part (id-scheme mismatch), not only an empty array', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_mismatch', USER);
    db.draftsByProject.set('proj_mismatch', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });

    // A non-empty ops array whose partId matches NO breakdown row and carries no
    // bridging drillPart — the exact shape the old length===0 guard let pass as
    // clean. A 50mm bore that, had it been evaluated, is a gross through-drill.
    const snap = await services.freezeToSnapshot({
      projectId: 'proj_mismatch',
      revisionId: draft.revisionId,
      payload: {
        breakdownRows: makeMockBreakdownRows(),
        drillOps: [{ opId: 'op1', partId: 'panel-left', depthMm: 50, diaMm: 10 }],
        // no drillParts → the op resolves to nothing
      },
    });

    const report = await services.runGate({
      snapshotId: snap.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    // It must NOT read as a clean pass: the report states no holes were checked.
    const warnCodes = report.warnings.map((w) => w.code);
    expect(warnCodes).toContain('W_DRILLOPS_NOT_SUPPLIED');
    expect(warnCodes).toContain('W_DRILLOPS_UNRESOLVED');
  });

  it('does NOT flag a snapshot whose real drill-map holes resolve via captured drillParts', async () => {
    const db = emptyDb();
    const draft = createInitialDraftDoc('proj_ok', USER);
    db.draftsByProject.set('proj_ok', draft);

    const { services } = createMockSpecServices({ db, user: USER, useRealGate: true });
    const store = createSpecStore(services, draft);

    // Freeze from a real drill map: ops keyed 'panel-left' resolve against the
    // drillParts captured from the same map — exercising the true panelId scheme
    // rather than a hand-picked breakdown id.
    useDrillMapStore.setState({ drillMap: sideDrillMap() });
    await store.getState().freeze('resolvable holes');

    const frozen = store.getState().doc;
    if (frozen.state !== 'FROZEN') {
      throw new Error(`expected FROZEN, got ${frozen.state}`);
    }
    const report = await services.runGate({
      snapshotId: frozen.snapshot.snapshotId,
      policyVersion: 'policy-1.0.0',
    });

    const codes = report.warnings.map((w) => w.code);
    expect(codes).not.toContain('W_DRILLOPS_NOT_SUPPLIED');
    expect(codes).not.toContain('W_DRILLOPS_UNRESOLVED');
  });
});
