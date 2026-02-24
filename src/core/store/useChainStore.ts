/**
 * useChainStore.ts - Zustand Store for Chain Viewer
 *
 * Manages chain loading and selection state for the
 * Chain Viewer UI component.
 */

import { create } from 'zustand';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { ManifestStore } from '../manifest/manifestStoreTypes';
import {
  loadManifestChain,
  getChainStats,
  type LoadChainOutcome,
} from '../manifest/loadManifestChain';
import { diffManifests, type ManifestDiff } from '../manifest/manifestDiff';

// ============================================
// TYPES
// ============================================

export interface ChainState {
  /** Loading state */
  loading: boolean;

  /** Error message if load failed */
  error: string | null;

  /** Loaded job ID */
  jobId: string | null;

  /** HEAD hash */
  headHash: string | null;

  /** Full chain (HEAD first) */
  chain: SignedJobManifest[];

  /** Whether chain reached genesis */
  reachedGenesis: boolean;

  /** Currently selected manifest hash */
  selectedHash: string | null;

  /** Chain statistics */
  stats: ReturnType<typeof getChainStats> | null;

  // Actions
  load: (jobId: string) => Promise<void>;
  select: (hash: string) => void;
  selectPrevious: () => void;
  selectNext: () => void;
  refresh: () => Promise<void>;
  clear: () => void;
}

export interface ChainStoreConfig {
  store: ManifestStore;
  maxDepth?: number;
}

// ============================================
// STORE FACTORY
// ============================================

/**
 * Create chain store with injected manifest store
 */
export function createChainStore(config: ChainStoreConfig) {
  const { store, maxDepth = 50 } = config;

  return create<ChainState>((set, get) => ({
    loading: false,
    error: null,
    jobId: null,
    headHash: null,
    chain: [],
    reachedGenesis: false,
    selectedHash: null,
    stats: null,

    load: async (jobId: string) => {
      set({ loading: true, error: null, jobId });

      try {
        const result = await loadManifestChain({ jobId, store, maxDepth });

        if (!result.ok) {
          set({
            error: result.reason,
            loading: false,
            chain: [],
            headHash: null,
            selectedHash: null,
            stats: null,
          });
          return;
        }

        const stats = getChainStats(result.chain);

        set({
          headHash: result.headHash,
          chain: result.chain,
          reachedGenesis: result.reachedGenesis,
          selectedHash: result.chain[0]?.manifestHashHex ?? null,
          stats,
          loading: false,
          error: null,
        });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : 'Failed to load chain',
          loading: false,
        });
      }
    },

    select: (hash: string) => {
      const { chain } = get();
      const exists = chain.some((m) => m.manifestHashHex === hash);
      if (exists) {
        set({ selectedHash: hash });
      }
    },

    selectPrevious: () => {
      const { chain, selectedHash } = get();
      const currentIdx = chain.findIndex(
        (m) => m.manifestHashHex === selectedHash
      );
      if (currentIdx >= 0 && currentIdx < chain.length - 1) {
        set({ selectedHash: chain[currentIdx + 1].manifestHashHex });
      }
    },

    selectNext: () => {
      const { chain, selectedHash } = get();
      const currentIdx = chain.findIndex(
        (m) => m.manifestHashHex === selectedHash
      );
      if (currentIdx > 0) {
        set({ selectedHash: chain[currentIdx - 1].manifestHashHex });
      }
    },

    refresh: async () => {
      const { jobId } = get();
      if (jobId) {
        await get().load(jobId);
      }
    },

    clear: () => {
      set({
        loading: false,
        error: null,
        jobId: null,
        headHash: null,
        chain: [],
        reachedGenesis: false,
        selectedHash: null,
        stats: null,
      });
    },
  }));
}

// ============================================
// SELECTORS
// ============================================

/**
 * Get selected manifest
 */
export function selectManifest(state: ChainState): SignedJobManifest | null {
  const { chain, selectedHash } = state;
  return chain.find((m) => m.manifestHashHex === selectedHash) ?? null;
}

/**
 * Get previous manifest (for diff)
 */
export function selectPreviousManifest(
  state: ChainState
): SignedJobManifest | null {
  const { chain, selectedHash } = state;
  const idx = chain.findIndex((m) => m.manifestHashHex === selectedHash);
  if (idx >= 0 && idx < chain.length - 1) {
    return chain[idx + 1];
  }
  return null;
}

/**
 * Get diff for selected manifest
 */
export function selectDiff(state: ChainState): ManifestDiff | null {
  const current = selectManifest(state);
  if (!current) return null;

  const prev = selectPreviousManifest(state);
  return diffManifests(prev, current);
}

/**
 * Get selected index (0 = HEAD)
 */
export function selectIndex(state: ChainState): number {
  const { chain, selectedHash } = state;
  return chain.findIndex((m) => m.manifestHashHex === selectedHash);
}

/**
 * Check if at HEAD
 */
export function selectIsAtHead(state: ChainState): boolean {
  return selectIndex(state) === 0;
}

/**
 * Check if at genesis
 */
export function selectIsAtGenesis(state: ChainState): boolean {
  const { chain, reachedGenesis } = state;
  return reachedGenesis && selectIndex(state) === chain.length - 1;
}
