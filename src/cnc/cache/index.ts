/**
 * CNC Cache Module - Public API
 *
 * Provides deterministic caching for CNC bundles with IndexedDB persistence.
 * D3.3: Added verified cache lookup with re-verification support.
 *
 * @version 1.1.0 - Phase D3.3
 */

// Cache key generation
export {
  generateCncCacheKey,
  generateCncCacheKeyFromPost,
  isValidCncCacheKey,
  getShortCacheKey,
  type CncCacheKeyInput,
  type CncCacheKey,
} from './cncCacheKey';

// IndexedDB store
export {
  IndexedDbCncStore,
  getCncStore,
  _resetCncStore,
  type StoredCncMetadata,
  type StoredCncBundle,
  type CncCacheStats,
} from './indexedDbCncStore';

// Cache helpers
export {
  getCachedBundle,
  getVerifiedCachedBundle,
  cacheBundle,
  hasCachedBundle,
  invalidateJobCache,
  getCacheStatsForJob,
  getCacheStats,
  clearAllCache,
  evictCacheToSize,
  listCachedBundles,
  type CacheLookupInput,
  type CacheStoreInput,
  type CacheLookupResult,
  type VerifiedCacheLookupResult,
  type VerifiedCacheLookupOptions,
} from './cncCacheHelpers';
