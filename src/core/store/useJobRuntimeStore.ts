/**
 * useJobRuntimeStore.ts - Job Runtime State Store
 *
 * Zustand store for managing job runtime state:
 * - HEAD manifest and hash
 * - Spec state (DRAFT/FROZEN/RELEASED)
 * - Last bundle verification result
 * - Loading/error state
 *
 * USAGE:
 * ```ts
 * const store = createJobRuntimeStore({ jobId, svc });
 * const { spec, headHash, loading } = store();
 * ```
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { SpecStatus, SpecState } from '../spec/specState';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { TrustChainService } from '../trustChain/trustChainService';
import type { FactoryAcceptanceChecklist } from '../factory/generateFactoryChecklist';
import type { BundleVerificationResult } from '../bundle/bundleTypes';
import type { ExportArtifact } from '../export/exportPipeline';

// ============================================
// STORE STATE
// ============================================

export interface JobRuntimeState {
  // ---- Status ----
  /** Loading state */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Job Identity ----
  /** Job ID */
  jobId: string;

  // ---- Manifest Chain ----
  /** HEAD hash */
  headHash: string | null;

  /** HEAD manifest */
  head: SignedJobManifest | null;

  // ---- Spec State ----
  /** Current spec status */
  spec: SpecStatus;

  // ---- Export/Verify ----
  /** Last generated checklist */
  lastChecklist: FactoryAcceptanceChecklist | null;

  /** Last bundle verification result */
  lastBundleVerify: BundleVerificationResult | null;

  // ---- Actions ----
  /** Refresh HEAD from store */
  refreshHead: () => Promise<void>;

  /** Check if export is allowed */
  canExport: () => boolean;

  /** Check if edits are allowed */
  canEdit: () => boolean;

  /** Clear error */
  clearError: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateJobRuntimeStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;
}

/**
 * Create job runtime store
 */
export function createJobRuntimeStore(
  args: CreateJobRuntimeStoreArgs
): UseBoundStore<StoreApi<JobRuntimeState>> {
  const { jobId, svc } = args;

  return create<JobRuntimeState>((set, get) => ({
    // Initial state
    loading: false,
    error: null,
    jobId,
    headHash: null,
    head: null,
    spec: { state: 'DRAFT' },
    lastChecklist: null,
    lastBundleVerify: null,

    // Actions
    refreshHead: async () => {
      set({ loading: true, error: null });

      try {
        const result = await svc.getHead(jobId);

        if (!result.ok) {
          set({
            loading: false,
            error: result.reason,
            headHash: null,
            head: null,
          });
          return;
        }

        const spec = result.head.signedTrust?.trust?.spec ?? { state: 'DRAFT' };

        set({
          loading: false,
          headHash: result.headHash,
          head: result.head,
          spec,
          error: null,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to refresh HEAD',
        });
      }
    },

    canExport: () => {
      const { spec, head } = get();
      if (!head) return false;
      if (spec.state !== 'RELEASED') return false;
      if (!head.signedTrust?.trust?.gate?.ok) return false;
      return true;
    },

    canEdit: () => {
      const { spec } = get();
      return spec.state === 'DRAFT';
    },

    clearError: () => {
      set({ error: null });
    },
  }));
}

// ============================================
// EXTENDED STORE WITH SERVICE ACTIONS
// ============================================

export interface JobRuntimeExtendedState extends JobRuntimeState {
  /** Freeze spec (DRAFT → FROZEN) */
  freeze: (snapshot: SnapshotArgs) => Promise<boolean>;

  /** Release spec (FROZEN → RELEASED) */
  release: (snapshot: SnapshotArgs) => Promise<boolean>;

  /** Unfreeze spec (FROZEN → DRAFT) */
  unfreeze: (snapshot: SnapshotArgs) => Promise<boolean>;

  /** Export bundle */
  exportBundle: (
    generateExports: () => Promise<ExportArtifact[]>
  ) => Promise<{ blob: Blob; filename: string } | null>;

  /** Verify bundle */
  verifyBundle: (zipBlob: Blob) => Promise<boolean>;

  /** Generate checklist */
  generateChecklist: () => Promise<FactoryAcceptanceChecklist | null>;
}

interface SnapshotArgs {
  selectionPreview: any[];
  selectionIds: string[];
  activeId: string | null;
  collision: any | null;
  runGatePerCabinet: any;
  commitAll: (cabs: any[]) => void;
}

/**
 * Create extended job runtime store with service actions
 */
export function createJobRuntimeExtendedStore(
  args: CreateJobRuntimeStoreArgs
): UseBoundStore<StoreApi<JobRuntimeExtendedState>> {
  const { jobId, svc } = args;

  return create<JobRuntimeExtendedState>((set, get) => ({
    // Initial state
    loading: false,
    error: null,
    jobId,
    headHash: null,
    head: null,
    spec: { state: 'DRAFT' },
    lastChecklist: null,
    lastBundleVerify: null,

    // Base actions
    refreshHead: async () => {
      set({ loading: true, error: null });

      try {
        const result = await svc.getHead(jobId);

        if (!result.ok) {
          set({
            loading: false,
            error: result.reason,
            headHash: null,
            head: null,
          });
          return;
        }

        const spec = result.head.signedTrust?.trust?.spec ?? { state: 'DRAFT' };

        set({
          loading: false,
          headHash: result.headHash,
          head: result.head,
          spec,
          error: null,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to refresh HEAD',
        });
      }
    },

    canExport: () => {
      const { spec, head } = get();
      if (!head) return false;
      if (spec.state !== 'RELEASED') return false;
      if (!head.signedTrust?.trust?.gate?.ok) return false;
      return true;
    },

    canEdit: () => {
      const { spec } = get();
      return spec.state === 'DRAFT';
    },

    clearError: () => {
      set({ error: null });
    },

    // Extended actions
    freeze: async (snapshot) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.freeze({
          jobId,
          ...snapshot,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return false;
        }

        // Refresh to get updated spec
        await get().refreshHead();
        return true;
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Freeze failed',
        });
        return false;
      }
    },

    release: async (snapshot) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.release({
          jobId,
          ...snapshot,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return false;
        }

        await get().refreshHead();
        return true;
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Release failed',
        });
        return false;
      }
    },

    unfreeze: async (snapshot) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.unfreeze({
          jobId,
          ...snapshot,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return false;
        }

        await get().refreshHead();
        return true;
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Unfreeze failed',
        });
        return false;
      }
    },

    exportBundle: async (generateExports) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.exportBundle({
          jobId,
          generateExports,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return null;
        }

        set({
          loading: false,
          lastChecklist: result.checklist,
        });

        await get().refreshHead();

        return {
          blob: result.zipBlob,
          filename: result.filename,
        };
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Export failed',
        });
        return null;
      }
    },

    verifyBundle: async (zipBlob) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.verifyBundle(zipBlob);

        set({
          loading: false,
          lastBundleVerify: result,
        });

        return result.ok;
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Verify failed',
          lastBundleVerify: { ok: false, reason: 'Exception during verification' },
        });
        return false;
      }
    },

    generateChecklist: async () => {
      set({ loading: true, error: null });

      try {
        const result = await svc.generateChecklist(jobId);

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return null;
        }

        set({
          loading: false,
          lastChecklist: result.checklist,
        });

        return result.checklist;
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Checklist generation failed',
        });
        return null;
      }
    },
  }));
}
