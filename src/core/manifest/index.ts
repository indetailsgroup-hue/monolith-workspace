/**
 * Manifest Module Index
 *
 * Append-only manifest storage system
 */

// Types
export type {
  ManifestStore,
  StoreResult,
  StoreError,
  StoreOutcome,
  ManifestStoreEvent,
  ObservableManifestStore,
} from './manifestStoreTypes';

// IndexedDB Implementation
export {
  IndexedDbManifestStore,
  getManifestStore,
} from '../infra/idb/indexedDbManifestStore';

// Chain Loading
export type {
  LoadChainResult,
  LoadChainError,
  LoadChainOutcome,
} from './loadManifestChain';

export {
  loadManifestChain,
  loadChainProof,
  getChainStats,
} from './loadManifestChain';

// Manifest Diff
export type { ManifestDiff } from './manifestDiff';

export {
  diffManifests,
  hasDiffChanges,
  formatDiffSummary,
} from './manifestDiff';
