/**
 * manifestStoreTypes.ts - Manifest Store Contract
 *
 * APPEND-ONLY STORAGE for signed manifests.
 * Each manifest is immutable once stored.
 * HEAD pointer tracks the current verified state.
 *
 * SERVER-FIRST: This interface works for both IndexedDB and REST API.
 * Swap implementations without changing verifier logic.
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';

// ============================================
// MANIFEST STORE INTERFACE
// ============================================

/**
 * Append-only manifest store contract
 *
 * INVARIANTS:
 * - put() never overwrites (append-only)
 * - loadByHash() returns exact match or null
 * - setHead() only after manifest is stored
 * - HEAD always points to a valid manifest
 */
export interface ManifestStore {
  /**
   * Store a manifest (append-only)
   * If manifest with same hash exists, this is a no-op
   */
  put(manifest: SignedJobManifest): Promise<void>;

  /**
   * Load manifest by its hash
   * @param hashHex - Manifest hash (64 char hex)
   * @returns Manifest or null if not found
   */
  loadByHash(hashHex: string): Promise<SignedJobManifest | null>;

  /**
   * Set HEAD pointer for a job
   * @param jobId - Job identifier
   * @param headHashHex - Hash of manifest to set as HEAD
   */
  setHead(jobId: string, headHashHex: string): Promise<void>;

  /**
   * Get current HEAD hash for a job
   * @param jobId - Job identifier
   * @returns HEAD hash or null if no manifests for job
   */
  getHead(jobId: string): Promise<string | null>;

  /**
   * List recent manifests for a job (newest first)
   * @param jobId - Job identifier
   * @param limit - Maximum number to return
   */
  listRecent(jobId: string, limit: number): Promise<SignedJobManifest[]>;
}

// ============================================
// STORE RESULT TYPES
// ============================================

export interface StoreResult<T> {
  ok: true;
  data: T;
}

export interface StoreError {
  ok: false;
  reason: string;
  code?: string;
}

export type StoreOutcome<T> = StoreResult<T> | StoreError;

// ============================================
// STORE EVENTS (for sync/notification)
// ============================================

export type ManifestStoreEvent =
  | { type: 'manifest-added'; hashHex: string; jobId: string }
  | { type: 'head-changed'; jobId: string; oldHeadHex: string | null; newHeadHex: string };

export interface ObservableManifestStore extends ManifestStore {
  subscribe(listener: (event: ManifestStoreEvent) => void): () => void;
}
