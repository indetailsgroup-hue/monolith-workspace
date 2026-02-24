/**
 * exportViewerStore.ts - Export Viewer State Management
 *
 * Zustand store for viewing and downloading export artifacts:
 * - Load latest/specific export from chain
 * - Download individual files
 * - Download all files sequentially
 * - Verify bundle integrity
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService } from '../../core/trustChain/trustChainService';
import type { ExportRecord } from '../../core/export/exportBundleTypes';
import { downloadBytesAsFile } from './downloadBytesAsFile';

// ============================================
// STORE STATE
// ============================================

export interface ExportViewerState {
  // ---- Identity ----
  /** Job ID */
  jobId: string;

  // ---- Loading State ----
  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Export Data ----
  /** Current HEAD hash */
  headHash: string | null;

  /** Loaded export record */
  exportRec: ExportRecord | null;

  // ---- Verification ----
  /** Verification state */
  verify: {
    running: boolean;
    result: null | { ok: boolean; message: string };
  };

  // ---- Actions ----
  /** Load latest export from chain */
  loadLatest: () => Promise<void>;

  /** Load specific export by ID */
  loadById: (exportId: string) => Promise<void>;

  /** Download single artifact */
  downloadOne: (artifactId: string, fallbackName?: string) => Promise<void>;

  /** Download all artifacts sequentially */
  downloadAllSequential: () => Promise<void>;

  /** Verify bundle integrity */
  verifyBundle: () => Promise<void>;

  /** Clear error */
  clearError: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateExportViewerStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;
}

/**
 * Create export viewer store for a job
 */
export function createExportViewerStore(
  args: CreateExportViewerStoreArgs
): UseBoundStore<StoreApi<ExportViewerState>> {
  const { jobId, svc } = args;

  return create<ExportViewerState>((set, get) => ({
    // Initial state
    jobId,
    loading: false,
    error: null,
    headHash: null,
    exportRec: null,
    verify: { running: false, result: null },

    // Actions
    loadLatest: async () => {
      set({ loading: true, error: null, verify: { running: false, result: null } });

      try {
        const r = await svc.getLatestExport(jobId);
        if (!r.ok) {
          set({ loading: false, error: r.reason, exportRec: null, headHash: null });
          return;
        }

        set({
          loading: false,
          exportRec: r.export,
          headHash: r.headHash,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load export',
          exportRec: null,
          headHash: null,
        });
      }
    },

    loadById: async (exportId: string) => {
      set({ loading: true, error: null, verify: { running: false, result: null } });

      try {
        const r = await svc.getExportById(jobId, exportId);
        if (!r.ok) {
          set({ loading: false, error: r.reason });
          return;
        }

        set({
          loading: false,
          exportRec: r.export,
          headHash: r.headHash,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load export',
        });
      }
    },

    downloadOne: async (artifactId: string, fallbackName?: string) => {
      set({ loading: true, error: null });

      try {
        const r = await svc.downloadArtifact(artifactId);
        if (!r.ok) {
          set({ loading: false, error: r.reason });
          return;
        }

        const filename = r.filename || fallbackName || artifactId;
        downloadBytesAsFile({ bytes: r.bytes, mime: r.mime, filename });
        set({ loading: false });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Download failed',
        });
      }
    },

    downloadAllSequential: async () => {
      const exp = get().exportRec;
      if (!exp) return;

      set({ loading: true, error: null });

      try {
        // Sort artifacts by path for consistent order
        const artifacts = (exp.artifacts ?? [])
          .slice()
          .sort((a, b) => (a.path > b.path ? 1 : -1));

        for (const a of artifacts) {
          const r = await svc.downloadArtifact(a.artifactId);
          if (!r.ok) {
            throw new Error(r.reason);
          }

          const fallbackName = a.path.split('/').pop() || a.artifactId;
          downloadBytesAsFile({
            bytes: r.bytes,
            mime: r.mime,
            filename: r.filename || fallbackName,
          });

          // Small delay between downloads to avoid browser issues
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        set({ loading: false });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Download all failed',
        });
      }
    },

    verifyBundle: async () => {
      const exp = get().exportRec;
      if (!exp) return;

      set({ verify: { running: true, result: null }, error: null });

      try {
        const r = await svc.verifyExportBundle(jobId, exp.exportId);

        if (!r.ok) {
          set({
            verify: {
              running: false,
              result: { ok: false, message: r.reason },
            },
          });
          return;
        }

        if (!r.verified) {
          set({
            verify: {
              running: false,
              result: { ok: false, message: r.reason ?? 'Not verified' },
            },
          });
          return;
        }

        set({
          verify: {
            running: false,
            result: { ok: true, message: 'Verified (hashes match)' },
          },
        });
      } catch (e) {
        set({
          verify: {
            running: false,
            result: {
              ok: false,
              message: e instanceof Error ? e.message : 'Verification failed',
            },
          },
        });
      }
    },

    clearError: () => {
      set({ error: null });
    },
  }));
}
