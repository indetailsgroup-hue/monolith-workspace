/**
 * useChecklistStore.ts - Zustand Store for Factory Checklist
 *
 * Manages loading and display of factory acceptance checklist.
 * Integrates with manifest store and checklist generator.
 */

import { create } from 'zustand';
import type { FactoryAcceptanceChecklist } from '../factory/generateFactoryChecklist';

// ============================================
// TYPES
// ============================================

export interface ChecklistState {
  /** Loading state */
  loading: boolean;

  /** Error message if load failed */
  error: string | null;

  /** Loaded checklist data */
  data: FactoryAcceptanceChecklist | null;

  /** Last loaded job ID */
  jobId: string | null;

  /** Last refresh timestamp */
  lastRefreshIso: string | null;

  // Actions
  load: (jobId: string) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

export interface ChecklistStoreConfig {
  loadChecklist: (jobId: string) => Promise<FactoryAcceptanceChecklist>;
}

// ============================================
// STORE FACTORY
// ============================================

/**
 * Create checklist store with injected loader
 *
 * @param config - Store configuration with loader function
 * @returns Zustand store hook
 *
 * @example
 * const useChecklistStore = createChecklistStore({
 *   loadChecklist: async (jobId) => {
 *     const result = await generateFactoryChecklist({ jobId, store, keyring });
 *     if (!result.ok) throw new Error(result.reason);
 *     return result.checklist;
 *   },
 * });
 */
export function createChecklistStore(config: ChecklistStoreConfig) {
  return create<ChecklistState>((set, get) => ({
    loading: false,
    error: null,
    data: null,
    jobId: null,
    lastRefreshIso: null,

    load: async (jobId: string) => {
      set({ loading: true, error: null, jobId });

      try {
        const data = await config.loadChecklist(jobId);
        set({
          data,
          loading: false,
          error: null,
          lastRefreshIso: new Date().toISOString(),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to load checklist';
        set({ error: message, loading: false, data: null });
      }
    },

    refresh: async () => {
      const { jobId } = get();
      if (!jobId) {
        set({ error: 'No job ID to refresh' });
        return;
      }

      await get().load(jobId);
    },

    clear: () => {
      set({
        loading: false,
        error: null,
        data: null,
        jobId: null,
        lastRefreshIso: null,
      });
    },
  }));
}

// ============================================
// SELECTORS
// ============================================

/**
 * Select checklist status
 */
export function selectChecklistStatus(state: ChecklistState) {
  if (!state.data) return null;

  if (!state.data.verification.chainOk) return 'INVALID';
  if (!state.data.gate.ok || state.data.collision.blocked) return 'BLOCKED';
  return 'APPROVED';
}

/**
 * Select if export is allowed
 */
export function selectCanExport(state: ChecklistState): boolean {
  return selectChecklistStatus(state) === 'APPROVED';
}

/**
 * Select blocking reasons
 */
export function selectBlockingReasons(state: ChecklistState): string[] {
  if (!state.data) return [];

  const reasons: string[] = [];

  if (!state.data.verification.chainOk) {
    reasons.push(`Chain: ${state.data.verification.reason ?? 'Failed'}`);
  }

  if (!state.data.gate.ok) {
    const errorCount = state.data.gate.perCabinetErrors.reduce(
      (sum, e) => sum + e.codes.length,
      0
    );
    reasons.push(`Gate: ${errorCount} errors`);
  }

  if (state.data.collision.blocked) {
    reasons.push(`Collision: ${state.data.collision.pairCount} pairs`);
  }

  return reasons;
}

/**
 * Select export count
 */
export function selectExportCount(state: ChecklistState): number {
  return state.data?.exports.length ?? 0;
}

// ============================================
// DEFAULT STORE (for simple use cases)
// ============================================

// Placeholder loader - should be replaced by bootstrapTrustChain
const placeholderLoader = async (_jobId: string): Promise<FactoryAcceptanceChecklist> => {
  throw new Error('Checklist store not configured. Call configureChecklistStore first.');
};

/**
 * Default checklist store (needs configuration)
 */
export const useChecklistStore = createChecklistStore({
  loadChecklist: placeholderLoader,
});

/**
 * Configure the default store with actual loader
 */
let _configuredLoader: ChecklistStoreConfig['loadChecklist'] | null = null;

export function configureChecklistStore(config: ChecklistStoreConfig): void {
  _configuredLoader = config.loadChecklist;
}

/**
 * Get configured loader
 */
export function getConfiguredLoader(): ChecklistStoreConfig['loadChecklist'] | null {
  return _configuredLoader;
}
