/**
 * cncCacheHelpers.ts - High-Level CNC Cache Operations
 *
 * Provides convenient functions for cache lookups, storage, and invalidation.
 * Wires together cache key generation and IndexedDB storage.
 *
 * D3.3: Added verified cache lookup with re-verification support.
 *
 * @version 1.1.0 - Phase D3.3
 */

import { generateCncCacheKey, type CncCacheKeyInput } from './cncCacheKey';
import {
  getCncStore,
  type StoredCncBundle,
  type StoredCncMetadata,
  type CncCacheStats,
} from './indexedDbCncStore';
import type { CncManifest, CncDialect } from '../bundle/cncManifest';
import { CNC_POST_VERSION } from '../bundle/cncManifest';

// ============================================================================
// Types
// ============================================================================

/**
 * Cache lookup input - minimal info needed to check cache.
 */
export interface CacheLookupInput {
  /** Packet content hash */
  packetContentHash: string | undefined;
  /** Target machine ID */
  machineId: string;
  /** G-code dialect */
  dialect: CncDialect;
  /** Post version (optional, defaults to current) */
  postVersion?: string;
}

/**
 * Cache store input - info needed to cache a bundle.
 */
export interface CacheStoreInput {
  /** Packet content hash (for key generation) */
  packetContentHash: string | undefined;
  /** Machine ID (for key generation) */
  machineId: string;
  /** G-code dialect (for key generation) */
  dialect: CncDialect;
  /** Post version (optional) */
  postVersion?: string;
  /** Bundle ZIP bytes */
  zipBytes: Uint8Array;
  /** CNC manifest */
  manifest: CncManifest;
  /** Bundle filename */
  filename: string;
}

/**
 * Result from cache lookup.
 */
export interface CacheLookupResult {
  /** Whether cache hit occurred */
  hit: boolean;
  /** Cache key used for lookup */
  cacheKey: string;
  /** Bundle data if hit */
  bundle?: StoredCncBundle;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Look up a cached CNC bundle.
 *
 * @param input - Cache lookup parameters
 * @returns Cache lookup result with hit status and bundle data
 */
export async function getCachedBundle(
  input: CacheLookupInput
): Promise<CacheLookupResult> {
  const keyInput: CncCacheKeyInput = {
    packetContentHash: input.packetContentHash,
    machineId: input.machineId,
    dialect: input.dialect,
    postVersion: input.postVersion ?? CNC_POST_VERSION,
  };

  const { key: cacheKey } = await generateCncCacheKey(keyInput);
  const store = getCncStore();
  const bundle = await store.get(cacheKey);

  if (bundle) {
    return {
      hit: true,
      cacheKey,
      bundle,
    };
  }

  return {
    hit: false,
    cacheKey,
  };
}

/**
 * Store a CNC bundle in the cache.
 *
 * @param input - Bundle and metadata to cache
 * @returns Cache key used for storage
 */
export async function cacheBundle(input: CacheStoreInput): Promise<string> {
  const keyInput: CncCacheKeyInput = {
    packetContentHash: input.packetContentHash,
    machineId: input.machineId,
    dialect: input.dialect,
    postVersion: input.postVersion ?? CNC_POST_VERSION,
  };

  const { key: cacheKey } = await generateCncCacheKey(keyInput);
  const store = getCncStore();

  await store.put(cacheKey, input.zipBytes, input.manifest, input.filename);

  return cacheKey;
}

/**
 * Check if a cached bundle exists (without loading bytes).
 *
 * @param input - Cache lookup parameters
 * @returns true if bundle is cached
 */
export async function hasCachedBundle(input: CacheLookupInput): Promise<boolean> {
  const keyInput: CncCacheKeyInput = {
    packetContentHash: input.packetContentHash,
    machineId: input.machineId,
    dialect: input.dialect,
    postVersion: input.postVersion ?? CNC_POST_VERSION,
  };

  const { key: cacheKey } = await generateCncCacheKey(keyInput);
  const store = getCncStore();

  return store.has(cacheKey);
}

/**
 * Invalidate (delete) all cached bundles for a job.
 *
 * Call this when:
 * - Job packet is re-ingested
 * - Job is deleted
 * - Manual cache clear requested
 *
 * @param jobId - Job ID to invalidate
 * @returns Number of bundles invalidated
 */
export async function invalidateJobCache(jobId: string): Promise<number> {
  const store = getCncStore();
  return store.clearJob(jobId);
}

/**
 * Get cache statistics for a specific job.
 *
 * @param jobId - Job ID to get stats for
 * @returns Cache stats for the job
 */
export async function getCacheStatsForJob(jobId: string): Promise<{
  bundleCount: number;
  totalBytes: number;
  entries: StoredCncMetadata[];
}> {
  const store = getCncStore();
  const entries = await store.listByJob(jobId);

  const totalBytes = entries.reduce((sum, e) => sum + e.bundleBytes, 0);

  return {
    bundleCount: entries.length,
    totalBytes,
    entries,
  };
}

// ============================================================================
// Global Cache Operations
// ============================================================================

/**
 * Get global cache statistics.
 */
export async function getCacheStats(): Promise<CncCacheStats> {
  const store = getCncStore();
  return store.getStats();
}

/**
 * Clear all cached bundles.
 */
export async function clearAllCache(): Promise<void> {
  const store = getCncStore();
  return store.clear();
}

/**
 * Evict oldest entries to meet size limit.
 *
 * @param maxBytes - Maximum cache size in bytes
 * @returns Number of entries evicted
 */
export async function evictCacheToSize(maxBytes: number): Promise<number> {
  const store = getCncStore();
  return store.evictToSize(maxBytes);
}

/**
 * List all cached bundles (metadata only).
 *
 * @param limit - Maximum entries to return
 * @returns List of metadata entries (most recent first)
 */
export async function listCachedBundles(
  limit = 100
): Promise<StoredCncMetadata[]> {
  const store = getCncStore();
  return store.listAll(limit);
}

// ============================================================================
// Verified Cache Operations (D3.3)
// ============================================================================

/**
 * Result from verified cache lookup.
 */
export interface VerifiedCacheLookupResult extends CacheLookupResult {
  /** Whether verification passed (only set if hit is true) */
  verified?: boolean;
  /** Verification error message (only set if verified is false) */
  verifyError?: string;
  /** Whether cache entry was stale (post version mismatch, etc.) */
  stale?: boolean;
}

/**
 * Options for verified cache lookup.
 */
export interface VerifiedCacheLookupOptions {
  /** Expected packet content hash (for linkage verification) */
  expectedPacketHash?: string;
  /** Auto-invalidate cache if verification fails */
  autoInvalidateOnFail?: boolean;
  /** Current post processor version to verify against (independent of cache key) */
  currentPostVersion?: string;
}

/**
 * Look up a cached CNC bundle with re-verification.
 *
 * STRICT POLICY: Cache hit is only returned if verification passes.
 *
 * @param input - Cache lookup parameters
 * @param options - Verification options
 * @returns Cache lookup result with verification status
 */
export async function getVerifiedCachedBundle(
  input: CacheLookupInput,
  options: VerifiedCacheLookupOptions = {}
): Promise<VerifiedCacheLookupResult> {
  // Import dynamically to avoid circular dependency
  const { reverifyCncBundleFromIndexedDb } = await import(
    '../../factory/verify/reverifyOnLoad'
  );

  const { autoInvalidateOnFail = true, expectedPacketHash, currentPostVersion } = options;

  // First, do a basic cache lookup
  const basicResult = await getCachedBundle(input);

  if (!basicResult.hit) {
    return {
      ...basicResult,
      verified: undefined,
    };
  }

  // Cache hit - now verify
  // currentPostVersion from options takes precedence, otherwise use input.postVersion
  const verifyResult = await reverifyCncBundleFromIndexedDb(basicResult.cacheKey, {
    expectedPacketHash: expectedPacketHash ?? input.packetContentHash,
    currentPostVersion: currentPostVersion ?? input.postVersion ?? CNC_POST_VERSION,
  });

  if (verifyResult.status === 'PASS') {
    return {
      ...basicResult,
      verified: true,
    };
  }

  // Verification failed or stale
  const isStale = verifyResult.status === 'STALE';

  // Auto-invalidate if configured
  if (autoInvalidateOnFail && !isStale) {
    const store = getCncStore();
    await store.delete(basicResult.cacheKey);
  }

  // Return as cache miss (strict policy)
  return {
    hit: false,
    cacheKey: basicResult.cacheKey,
    verified: false,
    verifyError: verifyResult.message,
    stale: isStale,
  };
}
