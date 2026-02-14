/**
 * useProofStore - P12 Proof Bundle Store
 *
 * Zustand store for proof bundle state management:
 * - Caches proof bundle per job
 * - Auto-refresh on state transitions
 * - Polling support for real-time updates
 *
 * @version 0.12.12
 */

import { create } from 'zustand';
import { getProofBundle, type ProofBundle } from '../api/stateApi';
import { useProjectStore } from './useProjectStore';

// ============================================
// Types
// ============================================

interface ProofStoreState {
  // Current proof bundle
  proof: ProofBundle | null;

  // Loading state
  loading: boolean;

  // Last error
  error: string | null;

  // Last fetch timestamp
  lastFetchedAt: string | null;
}

interface ProofStoreActions {
  // Fetch proof bundle for current project
  fetchProof: () => Promise<void>;

  // Clear proof (on project change)
  clearProof: () => void;

  // Refresh if stale (older than threshold)
  refreshIfStale: (thresholdMs?: number) => Promise<void>;
}

type ProofStore = ProofStoreState & ProofStoreActions;

// ============================================
// Store
// ============================================

export const useProofStore = create<ProofStore>()((set, get) => ({
  // Initial state
  proof: null,
  loading: false,
  error: null,
  lastFetchedAt: null,

  // Fetch proof
  fetchProof: async () => {
    const projectId = useProjectStore.getState().metadata?.id;

    if (!projectId) {
      set({ error: 'No project loaded', loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      const proof = await getProofBundle(projectId);

      if (proof.ok) {
        set({
          proof,
          loading: false,
          error: null,
          lastFetchedAt: new Date().toISOString(),
        });
      } else {
        set({
          proof,
          loading: false,
          error: proof.error || 'Unknown error',
          lastFetchedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Network error',
        lastFetchedAt: new Date().toISOString(),
      });
    }
  },

  // Clear proof
  clearProof: () => {
    set({
      proof: null,
      loading: false,
      error: null,
      lastFetchedAt: null,
    });
  },

  // Refresh if stale
  refreshIfStale: async (thresholdMs = 30000) => {
    const { lastFetchedAt, loading } = get();

    // Don't refresh if already loading
    if (loading) return;

    // No previous fetch, do it now
    if (!lastFetchedAt) {
      return get().fetchProof();
    }

    // Check if stale
    const lastFetchTime = new Date(lastFetchedAt).getTime();
    const now = Date.now();

    if (now - lastFetchTime > thresholdMs) {
      return get().fetchProof();
    }
  },
}));

// ============================================
// Selector Hooks
// ============================================

/** Get current proof bundle */
export const useProof = () => useProofStore((s) => s.proof);

/** Get proof loading state */
export const useProofLoading = () => useProofStore((s) => s.loading);

/** Get proof error */
export const useProofError = () => useProofStore((s) => s.error);

/** Get proof actions */
export const useProofActions = () => {
  const fetchProof = useProofStore((s) => s.fetchProof);
  const clearProof = useProofStore((s) => s.clearProof);
  const refreshIfStale = useProofStore((s) => s.refreshIfStale);

  return { fetchProof, clearProof, refreshIfStale };
};

/** Get proof state for quick checks */
export const useProofState = () => useProofStore((s) => s.proof?.state.specState);

/** Check if can export from proof */
export const useProofCanExport = () => useProofStore((s) => s.proof?.canExport ?? false);
