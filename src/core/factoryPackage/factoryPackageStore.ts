/**
 * factoryPackageStore.ts - OneClick Factory Package Store
 *
 * Zustand store for managing the release & export workflow:
 * 1. Preflight: Load head, check gate/collision, preview checklist
 * 2. Confirm: Type "RELEASE" to proceed
 * 3. Release: Commit RELEASED state (signed)
 * 4. Export: Build and download bundle
 * 5. Verify: Optional post-export verification
 *
 * NORTH STAR: Export requires RELEASED state (enforced by service)
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService } from '../trustChain/trustChainService';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { SpecStatus } from '../spec/specState';
import type { ExportArtifact } from '../export/exportPipeline';
import type { CollisionReport } from '../collision/collisionReport';
import type { CabinetForGate } from '../export/commitApprovedState';
import type { RunGatePerCabinetFn } from '../gate/runGateBundle';
import type { JobSnapshot } from '../snapshot/snapshotTypes';
import {
  type FactoryPackageStep,
  type ChecklistPreview,
  type VerifyResult,
  CONFIRM_TEXT_REQUIRED,
} from './factoryPackageTypes';
import { createReleasedStatus } from '../spec/specState';
import { snapshotHashHex } from '../snapshot/hashSnapshot';

// ============================================
// SNAPSHOT TYPE
// ============================================

/**
 * UI snapshot for commit operations
 *
 * Contains both UI state and deterministic JobSnapshot for hashing.
 */
export interface UISnapshot {
  /** Cabinets for gate validation */
  selectionPreview: CabinetForGate[];
  /** Selected cabinet IDs */
  selectionIds: string[];
  /** Active cabinet ID */
  activeId: string | null;
  /** Collision report */
  collision: CollisionReport | null;
  /** Gate runner function */
  runGatePerCabinet: RunGatePerCabinetFn;
  /** Commit callback */
  commitAll: (cabs: CabinetForGate[]) => void;

  /**
   * Deterministic job snapshot for factory hash lock.
   *
   * This snapshot contains only manufacturing-relevant data
   * and is used to compute the snapshotHashHex that is signed
   * into the TrustReport.
   */
  jobSnapshot?: JobSnapshot;
}

// ============================================
// STORE STATE
// ============================================

export interface FactoryPackageState {
  // ---- Step State ----
  /** Current workflow step */
  step: FactoryPackageStep;

  /** Error message */
  error: string | null;

  // ---- Job Identity ----
  /** Job ID */
  jobId: string;

  // ---- HEAD State ----
  /** HEAD hash */
  headHash: string | null;

  /** HEAD manifest */
  head: SignedJobManifest | null;

  // ---- Preview ----
  /** Checklist preview */
  checklistPreview: ChecklistPreview | null;

  /** Snapshot hash at preflight (for change detection) */
  preflightSnapshotHash: string | null;

  // ---- Confirmation ----
  /** User-typed confirmation text */
  confirmText: string;

  /** Required confirmation text */
  confirmRequired: typeof CONFIRM_TEXT_REQUIRED;

  // ---- Results ----
  /** Downloaded zip blob */
  zipBlob: Blob | null;

  /** Zip filename */
  zipFilename: string | null;

  /** Post-export verification result */
  verifyResult: VerifyResult | null;

  // ---- Actions ----
  /** Set confirmation text */
  setConfirmText: (text: string) => void;

  /** Clear error */
  clearError: () => void;

  /** Reset to IDLE */
  reset: () => void;

  /** Run preflight checks */
  preflight: (getSnapshot: () => UISnapshot) => Promise<void>;

  /** Run full release & export flow */
  run: (args: {
    getSnapshot: () => UISnapshot;
    generateExports: () => Promise<ExportArtifact[]>;
    verifyAfter?: boolean;
  }) => Promise<void>;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateFactoryPackageStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;

  /** Download callback */
  downloadZip?: (blob: Blob, filename: string) => void;
}

/**
 * Create factory package store
 */
export function createFactoryPackageStore(
  args: CreateFactoryPackageStoreArgs
): UseBoundStore<StoreApi<FactoryPackageState>> {
  const { jobId, svc, downloadZip = defaultDownloadZip } = args;

  return create<FactoryPackageState>((set, get) => ({
    // Initial state
    step: 'IDLE',
    error: null,
    jobId,
    headHash: null,
    head: null,
    checklistPreview: null,
    preflightSnapshotHash: null,
    confirmText: '',
    confirmRequired: CONFIRM_TEXT_REQUIRED,
    zipBlob: null,
    zipFilename: null,
    verifyResult: null,

    // Actions
    setConfirmText: (text) => set({ confirmText: text }),

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        step: 'IDLE',
        error: null,
        headHash: null,
        head: null,
        checklistPreview: null,
        preflightSnapshotHash: null,
        confirmText: '',
        zipBlob: null,
        zipFilename: null,
        verifyResult: null,
      }),

    preflight: async (getSnapshot) => {
      set({
        step: 'PREFLIGHT',
        error: null,
        checklistPreview: null,
        zipBlob: null,
        zipFilename: null,
        verifyResult: null,
      });

      try {
        // 1. Load HEAD
        const headR = await svc.getHead(jobId);
        if (!headR.ok) {
          set({ step: 'ERROR', error: headR.reason });
          return;
        }

        const { head, headHash } = headR;
        const trust = head.signedTrust?.trust;

        // 2. Check current spec state
        const specState = trust?.spec?.state ?? 'DRAFT';

        // If already RELEASED, we can skip to export directly
        // But we still show preview for confirmation

        // 3. Check gate and collision from HEAD trust
        const gateOk = !!trust?.gate?.ok;
        const collisionBlocked = !!trust?.collision?.blocked;

        // 4. Get snapshot and check live collision
        const snapshot = getSnapshot();
        if (snapshot.collision?.blocked) {
          set({
            step: 'ERROR',
            error: 'Preflight failed: Live collision is blocked. Fix collisions first.',
          });
          return;
        }

        // 5. Build checklist preview
        const perCabinetErrors: Array<{ id: string; codes: string[] }> = [];
        let warningCount = 0;

        if (trust?.gate?.perCabinet) {
          for (const pc of trust.gate.perCabinet) {
            if (!pc.ok) {
              const errorCodes = pc.issues
                .filter((i) => i.severity === 'ERROR')
                .map((i) => i.code);
              if (errorCodes.length > 0) {
                perCabinetErrors.push({ id: pc.id, codes: errorCodes });
              }
            }
            warningCount += pc.issues.filter((i) => i.severity === 'WARNING').length;
          }
        }

        const checklistPreview: ChecklistPreview = {
          jobId,
          headHash,
          gate: {
            ok: gateOk,
            errorCount: trust?.gate?.errorCount ?? 0,
            warningCount,
            perCabinetErrors,
          },
          collision: {
            blocked: collisionBlocked,
            pairCount: trust?.collision?.pairCount ?? 0,
            worstPenetrationMm: trust?.collision?.worstPenetrationMm,
            worstGapMm: trust?.collision?.worstGapMm,
          },
          verification: {
            chainOk: true, // We'll verify during export
            keyIdApproval: head.signedTrust?.keyId,
            keyIdManifest: head.manifestKeyId,
          },
          exports: (head.exports ?? []).map((e) => ({
            kind: e.kind,
            filename: e.filename,
            hash: e.contentHashHex,
          })),
        };

        // 6. Compute deterministic snapshot hash for change detection
        const snapshotHash = await computeSnapshotHashAsync(snapshot);

        set({
          step: 'PREVIEW_READY',
          headHash,
          head,
          checklistPreview,
          preflightSnapshotHash: snapshotHash,
        });
      } catch (e) {
        set({
          step: 'ERROR',
          error: e instanceof Error ? e.message : 'Preflight failed',
        });
      }
    },

    run: async ({ getSnapshot, generateExports, verifyAfter = true }) => {
      const state = get();

      // 1. Ensure preflight was done
      if (state.step !== 'PREVIEW_READY') {
        await get().preflight(getSnapshot);
        if (get().step !== 'PREVIEW_READY') return;
      }

      // 2. Validate confirmation text
      set({ step: 'CONFIRMING', error: null });

      const confirmText = get().confirmText.trim().toUpperCase();
      if (confirmText !== CONFIRM_TEXT_REQUIRED) {
        set({
          step: 'ERROR',
          error: `Confirmation required: Type "${CONFIRM_TEXT_REQUIRED}" exactly`,
        });
        return;
      }

      // 3. Check for snapshot changes since preflight
      const snapshot = getSnapshot();
      const currentSnapshotHash = await computeSnapshotHashAsync(snapshot);

      if (
        get().preflightSnapshotHash &&
        currentSnapshotHash !== get().preflightSnapshotHash
      ) {
        set({
          step: 'ERROR',
          error: 'Snapshot changed since preflight. Please refresh preflight.',
        });
        return;
      }

      // 4. Check gate/collision from checklist
      const chk = get().checklistPreview;
      if (!chk) {
        set({ step: 'ERROR', error: 'No checklist preview. Run preflight first.' });
        return;
      }

      if (!chk.gate.ok) {
        set({ step: 'ERROR', error: 'Gate not OK. Fix errors before release.' });
        return;
      }

      if (chk.collision.blocked) {
        set({ step: 'ERROR', error: 'Collision blocked. Fix collisions before release.' });
        return;
      }

      try {
        // 5. Get current spec state
        const head = get().head;
        const currentSpec = head?.signedTrust?.trust?.spec ?? { state: 'DRAFT' as const };

        // 6. If not already RELEASED, commit RELEASED state
        if (currentSpec.state !== 'RELEASED') {
          set({ step: 'RELEASING', error: null });

          const releasedSpec = createReleasedStatus(currentSpec);

          const releaseResult = await svc.setSpecState({
            jobId,
            nextSpec: releasedSpec,
            selectionPreview: snapshot.selectionPreview,
            selectionIds: snapshot.selectionIds,
            activeId: snapshot.activeId,
            collision: snapshot.collision,
            runGatePerCabinet: snapshot.runGatePerCabinet,
            commitAll: snapshot.commitAll,
          });

          if (!releaseResult.ok) {
            set({
              step: 'ERROR',
              error: releaseResult.reason ?? 'Release failed',
            });
            return;
          }
        }

        // 7. Export bundle
        set({ step: 'EXPORTING', error: null });

        const exportResult = await svc.exportBundle({
          jobId,
          generateExports,
        });

        if (!exportResult.ok) {
          set({
            step: 'ERROR',
            error: exportResult.reason ?? 'Export failed',
          });
          return;
        }

        // 8. Download zip
        const { zipBlob, filename } = exportResult;
        downloadZip(zipBlob, filename);

        set({
          zipBlob,
          zipFilename: filename,
        });

        // 9. Optional verification
        if (verifyAfter) {
          set({ step: 'VERIFYING', error: null });

          const verifyResult = await svc.verifyBundle(zipBlob);

          set({
            verifyResult: {
              ok: verifyResult.ok,
              reason: verifyResult.ok ? undefined : verifyResult.reason,
              fileCount: verifyResult.fileResults?.length,
            },
          });
        }

        // 10. Done!
        set({ step: 'DONE' });
      } catch (e) {
        set({
          step: 'ERROR',
          error: e instanceof Error ? e.message : 'Operation failed',
        });
      }
    },
  }));
}

// ============================================
// HELPERS
// ============================================

/**
 * Default download function
 */
function defaultDownloadZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Compute deterministic snapshot hash for change detection
 *
 * FACTORY HASH LOCK:
 * - Uses SHA-256 of canonical JSON (deterministic)
 * - If jobSnapshot provided, uses proper deterministic hash
 * - Falls back to simple hash for backwards compatibility
 */
async function computeSnapshotHashAsync(snapshot: UISnapshot): Promise<string> {
  // Prefer deterministic JobSnapshot hash if available
  if (snapshot.jobSnapshot) {
    return snapshotHashHex(snapshot.jobSnapshot);
  }

  // Fallback: simple hash based on selection and positions
  return computeSnapshotHashSimple(snapshot);
}

/**
 * Simple synchronous snapshot hash (fallback)
 */
function computeSnapshotHashSimple(snapshot: UISnapshot): string {
  const parts: string[] = [];

  parts.push(`sel:${snapshot.selectionIds.sort().join(',')}`);
  parts.push(`active:${snapshot.activeId ?? 'null'}`);

  if (snapshot.collision) {
    parts.push(`collision:${snapshot.collision.blocked}:${snapshot.collision.pairs.length}`);
  }

  // Include cabinet positions for change detection
  for (const cab of snapshot.selectionPreview.slice(0, 10)) {
    const pos = (cab as any).position;
    if (pos) {
      parts.push(`pos:${cab.id}:${pos.x?.toFixed(0)}:${pos.y?.toFixed(0)}:${pos.z?.toFixed(0)}`);
    }
  }

  return parts.join('|');
}
