/**
 * manifestStoreTypes.ts - Manifest Store Interface
 *
 * Abstract storage interface for the manifest chain.
 * Implemented by IndexedDB store for browser persistence.
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';

/**
 * Manifest store interface
 *
 * Provides content-addressed storage for signed manifests
 * and HEAD pointer management per job.
 */
export interface ManifestStore {
  /** Store a manifest (keyed by manifestHashHex) */
  put(manifest: SignedJobManifest): Promise<void>;

  /** Load a manifest by its hash */
  loadByHash(hashHex: string): Promise<SignedJobManifest | null>;

  /** Set HEAD pointer for a job */
  setHead(jobId: string, hashHex: string): Promise<void>;

  /** Get HEAD pointer for a job */
  getHead(jobId: string): Promise<string | null>;

  /** List recent manifests for a job */
  listRecent(jobId: string, limit?: number): Promise<SignedJobManifest[]>;

  /** Check if a manifest exists by hash */
  exists(hashHex: string): Promise<boolean>;

  /** Count manifests for a job */
  countForJob(jobId: string): Promise<number>;

  /** Clear all manifests (for testing) */
  clear(): Promise<void>;
}
