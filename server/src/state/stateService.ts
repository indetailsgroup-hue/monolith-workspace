/**
 * stateService.ts - P10 State Transition Service
 *
 * Performs idempotent state transitions and writes lineage events.
 * All transitions are server-authoritative.
 */

import {
  readJobSnapshot,
  writeJobSnapshot,
  assertTransition,
  safeJobId,
  computeAnchors,
  isSameRevision,
} from './jobStateStorage.js';
import type { JobSnapshotState, Actor } from './jobStateTypes.js';
import { appendLineageEvent } from '../lineage/lineageStorage.js';
import type { ChangeClass } from '../lineage/lineageTypes.js';

// ============================================================================
// Get State
// ============================================================================

/**
 * Get current job state (authoritative).
 */
export async function getState(jobIdRaw: string): Promise<JobSnapshotState> {
  const jobId = safeJobId(jobIdRaw);
  return await readJobSnapshot(jobId);
}

/**
 * Check if a job is in RELEASED state.
 */
export async function isReleased(jobIdRaw: string): Promise<boolean> {
  const snap = await getState(jobIdRaw);
  return snap.specState === 'RELEASED';
}

// ============================================================================
// Freeze Job
// ============================================================================

export interface TransitionResult {
  ok: boolean;
  snapshot?: JobSnapshotState;
  error?: string;
}

/**
 * Freeze a job (DRAFT -> FROZEN).
 * Idempotent: if already FROZEN with same revision, returns ok.
 */
export async function freezeJob(
  jobIdRaw: string,
  actor?: Actor,
  note?: string,
  changeClass?: ChangeClass
): Promise<TransitionResult> {
  try {
    const jobId = safeJobId(jobIdRaw);
    const snap = await readJobSnapshot(jobId);

    // Compute anchors
    let anchors: Awaited<ReturnType<typeof computeAnchors>>;
    try {
      anchors = await computeAnchors(jobId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to compute revision anchors',
      };
    }

    // Idempotent: already FROZEN with same revision
    if (
      snap.specState === 'FROZEN' &&
      isSameRevision(snap.revision?.revisionId, anchors.revisionId)
    ) {
      console.log(`[State] Job ${jobId} already FROZEN with same revision`);
      return { ok: true, snapshot: snap };
    }

    // Validate transition
    try {
      assertTransition(snap.specState, 'FROZEN');
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Invalid transition',
      };
    }

    const now = new Date().toISOString();
    const next: JobSnapshotState = {
      ...snap,
      specState: 'FROZEN',
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
      },
      frozenAt: snap.frozenAt ?? now,
      updatedAt: now,
      updatedBy: actor,
      notes: { ...(snap.notes || {}), freezeNote: note || snap.notes?.freezeNote },
    };

    await writeJobSnapshot(jobId, next);

    // Append lineage event
    await appendLineageEvent(jobId, {
      type: 'SPEC_FROZEN',
      actor,
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
        parentRevisionId: snap.revision?.revisionId,
      },
      changeClass,
      note,
    });

    console.log(`[State] Frozen job ${jobId}: ${anchors.revisionId.slice(0, 16)}...`);
    return { ok: true, snapshot: next };
  } catch (e) {
    console.error('[State] Freeze failed:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Release Job
// ============================================================================

/**
 * Release a job (FROZEN -> RELEASED).
 * Idempotent: if already RELEASED with same revision, returns ok.
 */
export async function releaseJob(
  jobIdRaw: string,
  actor?: Actor,
  note?: string,
  changeClass?: ChangeClass
): Promise<TransitionResult> {
  try {
    const jobId = safeJobId(jobIdRaw);
    const snap = await readJobSnapshot(jobId);

    // Compute anchors
    let anchors: Awaited<ReturnType<typeof computeAnchors>>;
    try {
      anchors = await computeAnchors(jobId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to compute revision anchors',
      };
    }

    // Idempotent: already RELEASED with same revision
    if (
      snap.specState === 'RELEASED' &&
      isSameRevision(snap.revision?.revisionId, anchors.revisionId)
    ) {
      console.log(`[State] Job ${jobId} already RELEASED with same revision`);
      return { ok: true, snapshot: snap };
    }

    // Validate transition
    try {
      assertTransition(snap.specState, 'RELEASED');
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Invalid transition',
      };
    }

    const now = new Date().toISOString();
    const next: JobSnapshotState = {
      ...snap,
      specState: 'RELEASED',
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
      },
      releasedAt: snap.releasedAt ?? now,
      updatedAt: now,
      updatedBy: actor,
      notes: { ...(snap.notes || {}), releaseNote: note || snap.notes?.releaseNote },
    };

    await writeJobSnapshot(jobId, next);

    // Append lineage event
    await appendLineageEvent(jobId, {
      type: 'SPEC_RELEASED',
      actor,
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
        parentRevisionId: snap.revision?.revisionId,
      },
      changeClass,
      note,
    });

    console.log(`[State] Released job ${jobId}: ${anchors.revisionId.slice(0, 16)}...`);
    return { ok: true, snapshot: next };
  } catch (e) {
    console.error('[State] Release failed:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Revoke Job
// ============================================================================

/**
 * Revoke a job (RELEASED -> FROZEN).
 * Invalidates the release, export gate will block.
 */
export async function revokeJob(
  jobIdRaw: string,
  actor?: Actor,
  note?: string,
  changeClass?: ChangeClass
): Promise<TransitionResult> {
  try {
    const jobId = safeJobId(jobIdRaw);
    const snap = await readJobSnapshot(jobId);

    // Only revoke if RELEASED
    if (snap.specState !== 'RELEASED') {
      console.log(`[State] Job ${jobId} is not RELEASED, cannot revoke`);
      return { ok: true, snapshot: snap }; // Idempotent-ish
    }

    // Compute anchors
    let anchors: Awaited<ReturnType<typeof computeAnchors>>;
    try {
      anchors = await computeAnchors(jobId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to compute revision anchors',
      };
    }

    const now = new Date().toISOString();
    const next: JobSnapshotState = {
      ...snap,
      specState: 'FROZEN',
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
      },
      revokedAt: now,
      updatedAt: now,
      updatedBy: actor,
      notes: { ...(snap.notes || {}), revokeNote: note || snap.notes?.revokeNote },
    };

    await writeJobSnapshot(jobId, next);

    // Append lineage event
    await appendLineageEvent(jobId, {
      type: 'SPEC_REVOKED',
      actor,
      revision: {
        revisionId: anchors.revisionId,
        packetSha256: anchors.packetSha256,
        manifestSha256: anchors.manifestSha256,
        parentRevisionId: snap.revision?.revisionId,
      },
      changeClass,
      note,
    });

    console.log(`[State] Revoked job ${jobId}: ${anchors.revisionId.slice(0, 16)}...`);
    return { ok: true, snapshot: next };
  } catch (e) {
    console.error('[State] Revoke failed:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Export Gate Check
// ============================================================================

/**
 * Check if a job can be exported (must be RELEASED).
 * This is the authoritative check for export gate.
 */
export async function canExport(jobIdRaw: string): Promise<{
  canExport: boolean;
  specState: string;
  revisionId?: string;
  reason?: string;
}> {
  try {
    const snap = await getState(jobIdRaw);

    if (snap.specState !== 'RELEASED') {
      return {
        canExport: false,
        specState: snap.specState,
        revisionId: snap.revision?.revisionId,
        reason: `Job is ${snap.specState}, must be RELEASED for export`,
      };
    }

    return {
      canExport: true,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
    };
  } catch (e) {
    return {
      canExport: false,
      specState: 'UNKNOWN',
      reason: e instanceof Error ? e.message : 'Failed to read job state',
    };
  }
}
