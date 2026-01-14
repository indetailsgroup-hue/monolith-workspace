/**
 * preflightStore.ts - Preflight State Management
 *
 * Zustand store for managing release preflight workflow:
 * - Load preflight report from HEAD
 * - Generate re-export package
 * - Request release
 * - Track action results
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService } from '../trustChain/trustChainService';
import type { PreflightReport } from './preflightTypes';

// ============================================
// STORE STATE
// ============================================

export interface PreflightState {
  // ---- Identity ----
  /** Job ID */
  jobId: string;

  // ---- Loading State ----
  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Preflight Data ----
  /** Preflight report */
  report: PreflightReport | null;

  // ---- Last Action Result ----
  /** Result of last action (re-export or release) */
  lastAction: {
    kind: 'REEXPORT' | 'RELEASE';
    ok: boolean;
    message: string;
  } | null;

  // ---- Actions ----
  /** Load preflight report from HEAD */
  load: () => Promise<void>;

  /** Generate re-export package */
  generateReExport: () => Promise<void>;

  /** Request release */
  requestRelease: () => Promise<void>;

  /** Clear error */
  clearError: () => void;

  /** Clear last action */
  clearLastAction: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreatePreflightStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;

  /**
   * Re-export function
   * Called when user clicks "Generate Factory Re-Export Package"
   * Should generate and persist new export bundle
   */
  reExport: (jobId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;

  /**
   * Request release function
   * Called when user clicks "Request Release"
   * Should transition spec state to RELEASED
   */
  requestRelease: (jobId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

/**
 * Create preflight store for a job
 */
export function createPreflightStore(
  args: CreatePreflightStoreArgs
): UseBoundStore<StoreApi<PreflightState>> {
  const { jobId, svc, reExport, requestRelease } = args;

  return create<PreflightState>((set, get) => ({
    // Initial state
    jobId,
    loading: false,
    error: null,
    report: null,
    lastAction: null,

    // Actions
    load: async () => {
      set({ loading: true, error: null });

      try {
        const result = await svc.getPreflightReport(jobId);
        if (!result.ok) {
          set({ loading: false, error: result.reason, report: null });
          return;
        }

        set({
          loading: false,
          report: result.report,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load preflight report',
          report: null,
        });
      }
    },

    generateReExport: async () => {
      set({ loading: true, error: null, lastAction: null });

      try {
        const report = get().report;
        if (!report) {
          throw new Error('No preflight report loaded');
        }

        if (!report.ready.canReExport) {
          throw new Error(
            `Cannot re-export: ${report.ready.reasons.join('; ') || 'preflight blocked'}`
          );
        }

        const result = await reExport(jobId);
        if (!result.ok) {
          throw new Error(result.reason);
        }

        set({
          loading: false,
          lastAction: {
            kind: 'REEXPORT',
            ok: true,
            message: 'Re-export package generated successfully',
          },
        });

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          lastAction: {
            kind: 'REEXPORT',
            ok: false,
            message: e instanceof Error ? e.message : 'Re-export failed',
          },
        });
      }
    },

    requestRelease: async () => {
      set({ loading: true, error: null, lastAction: null });

      try {
        const report = get().report;
        if (!report) {
          throw new Error('No preflight report loaded');
        }

        if (!report.ready.canRequestRelease) {
          throw new Error(
            `Cannot release: ${report.ready.reasons.join('; ') || 'preflight failed'}`
          );
        }

        const result = await requestRelease(jobId);
        if (!result.ok) {
          throw new Error(result.reason);
        }

        set({
          loading: false,
          lastAction: {
            kind: 'RELEASE',
            ok: true,
            message: 'Release requested successfully',
          },
        });

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          lastAction: {
            kind: 'RELEASE',
            ok: false,
            message: e instanceof Error ? e.message : 'Release failed',
          },
        });
      }
    },

    clearError: () => {
      set({ error: null });
    },

    clearLastAction: () => {
      set({ lastAction: null });
    },
  }));
}

// ============================================
// SELECTORS
// ============================================

/**
 * Check if can re-export
 */
export function selectCanReExport(state: PreflightState): boolean {
  return state.report?.ready.canReExport ?? false;
}

/**
 * Check if can request release
 */
export function selectCanRequestRelease(state: PreflightState): boolean {
  return state.report?.ready.canRequestRelease ?? false;
}

/**
 * Get blocking reasons
 */
export function selectBlockingReasons(state: PreflightState): string[] {
  return state.report?.ready.reasons ?? [];
}

/**
 * Get blocking issue count
 */
export function selectBlockingIssueCount(state: PreflightState): number {
  return state.report?.issues.blocking.length ?? 0;
}

/**
 * Get waived issue count
 */
export function selectWaivedIssueCount(state: PreflightState): number {
  return state.report?.issues.waived.length ?? 0;
}

// ============================================
// CONVENIENCE FACTORY
// ============================================

/**
 * Create preflight store wired to TrustChainService export methods
 *
 * This is a convenience function that wires:
 * - reExport → svc.exportFactoryPackageAndAppend()
 * - requestRelease → custom release function
 *
 * @param args.jobId - Job ID
 * @param args.svc - TrustChainService instance (with artifactStore + factoryExporter configured)
 * @param args.onRelease - Custom release function (e.g., call svc.release())
 */
export function createPreflightStoreWithExportPipeline(args: {
  jobId: string;
  svc: TrustChainService;
  onRelease: (jobId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}): UseBoundStore<StoreApi<PreflightState>> {
  const { jobId, svc, onRelease } = args;

  return createPreflightStore({
    jobId,
    svc,
    reExport: async (jid) => {
      const result = await svc.exportFactoryPackageAndAppend({ jobId: jid });
      if (result.ok) {
        return { ok: true };
      }
      return { ok: false, reason: result.reason };
    },
    requestRelease: onRelease,
  });
}
