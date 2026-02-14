/**
 * commitSpecStateAdapter.ts - Adapter for UI to Service Spec State Commits
 *
 * Bridges UI callbacks with TrustChainService spec state methods.
 * Simplifies wiring between React components and the service layer.
 */

import type { TrustChainService } from '../trustChain/trustChainService';
import type { SpecStatus } from '../spec/specState';
import type { CollisionReport } from '../collision/collisionReport';
import type { CabinetForGate, CommitResult } from '../export/commitApprovedState';
import type { RunGatePerCabinetFn } from '../gate/runGateBundle';

// ============================================
// TYPES
// ============================================

/**
 * Snapshot from UI
 */
export interface UISnapshot {
  selectionPreview: CabinetForGate[];
  selectionIds: string[];
  activeId: string | null;
  collision: CollisionReport | null;
  runGatePerCabinet: RunGatePerCabinetFn;
  commitAll: (cabs: CabinetForGate[]) => void;
}

/**
 * Commit spec state function type
 */
export type CommitSpecStateFn = (
  nextSpec: SpecStatus,
  snapshot: UISnapshot
) => Promise<CommitResult>;

// ============================================
// ADAPTER FACTORY
// ============================================

/**
 * Create commit spec state adapter
 *
 * Returns a function that can be called from UI to commit spec state changes.
 */
export function makeCommitSpecStateAdapter(args: {
  svc: TrustChainService;
  jobId: string;
}): CommitSpecStateFn {
  const { svc, jobId } = args;

  return async (nextSpec: SpecStatus, snapshot: UISnapshot): Promise<CommitResult> => {
    return svc.setSpecState({
      jobId,
      nextSpec,
      selectionPreview: snapshot.selectionPreview,
      selectionIds: snapshot.selectionIds,
      activeId: snapshot.activeId,
      collision: snapshot.collision,
      runGatePerCabinet: snapshot.runGatePerCabinet,
      commitAll: snapshot.commitAll,
    });
  };
}

// ============================================
// INDIVIDUAL ACTION ADAPTERS
// ============================================

/**
 * Create freeze adapter
 */
export function makeFreezeAdapter(args: {
  svc: TrustChainService;
  jobId: string;
}): (snapshot: UISnapshot) => Promise<CommitResult> {
  const { svc, jobId } = args;

  return async (snapshot: UISnapshot): Promise<CommitResult> => {
    return svc.freeze({
      jobId,
      ...snapshot,
    });
  };
}

/**
 * Create release adapter
 */
export function makeReleaseAdapter(args: {
  svc: TrustChainService;
  jobId: string;
}): (snapshot: UISnapshot) => Promise<CommitResult> {
  const { svc, jobId } = args;

  return async (snapshot: UISnapshot): Promise<CommitResult> => {
    return svc.release({
      jobId,
      ...snapshot,
    });
  };
}

/**
 * Create unfreeze adapter
 */
export function makeUnfreezeAdapter(args: {
  svc: TrustChainService;
  jobId: string;
}): (snapshot: UISnapshot) => Promise<CommitResult> {
  const { svc, jobId } = args;

  return async (snapshot: UISnapshot): Promise<CommitResult> => {
    return svc.unfreeze({
      jobId,
      ...snapshot,
    });
  };
}

// ============================================
// COMBINED ADAPTER
// ============================================

/**
 * All spec action adapters bundled together
 */
export interface SpecActionAdapters {
  commit: CommitSpecStateFn;
  freeze: (snapshot: UISnapshot) => Promise<CommitResult>;
  release: (snapshot: UISnapshot) => Promise<CommitResult>;
  unfreeze: (snapshot: UISnapshot) => Promise<CommitResult>;
}

/**
 * Create all spec action adapters
 */
export function makeSpecActionAdapters(args: {
  svc: TrustChainService;
  jobId: string;
}): SpecActionAdapters {
  return {
    commit: makeCommitSpecStateAdapter(args),
    freeze: makeFreezeAdapter(args),
    release: makeReleaseAdapter(args),
    unfreeze: makeUnfreezeAdapter(args),
  };
}
