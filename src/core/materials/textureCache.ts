/**
 * TextureCache - LRU Cache for Texture Blobs + ObjectURLs
 *
 * T016: Performance optimization for texture loading
 * - LRU eviction with max 50 entries
 * - Revokes objectURLs on eviction to prevent memory leaks
 * - In-flight request deduplication
 *
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  url: string;
  blob: Blob;
  objectUrl: string;
  lastUsed: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

export class TextureLRUCache {
  private readonly maxEntries: number;
  private readonly map = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get entry from cache (updates LRU order)
   */
  get(url: string): CacheEntry | null {
    const entry = this.map.get(url);
    if (!entry) return null;

    // Update last used time
    entry.lastUsed = Date.now();

    // Refresh LRU order: delete and re-add to move to end
    this.map.delete(url);
    this.map.set(url, entry);

    return entry;
  }

  /**
   * Fetch texture from URL (with caching and deduplication)
   */
  async fetch(url: string): Promise<CacheEntry> {
    // Check cache first
    const hit = this.get(url);
    if (hit) return hit;

    // Check if already fetching
    const inFlight = this.inflight.get(url);
    if (inFlight) return inFlight;

    // Start new fetch
    const promise = this.doFetch(url);
    this.inflight.set(url, promise);

    try {
      return await promise;
    } finally {
      this.inflight.delete(url);
    }
  }

  /**
   * Internal fetch implementation
   */
  private async doFetch(url: string): Promise<CacheEntry> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Texture fetch failed: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const entry: CacheEntry = {
      url,
      blob,
      objectUrl,
      lastUsed: Date.now(),
    };

    this.set(url, entry);
    return entry;
  }

  /**
   * Add entry to cache
   */
  private set(url: string, entry: CacheEntry): void {
    this.map.set(url, entry);
    this.evictIfNeeded();
  }

  /**
   * Evict oldest entries if over capacity
   */
  private evictIfNeeded(): void {
    while (this.map.size > this.maxEntries) {
      // Map iteration order is insertion order, so first = oldest
      const oldest = this.map.entries().next();
      if (oldest.done) break;

      const [oldUrl, oldEntry] = oldest.value as [string, CacheEntry];
      this.map.delete(oldUrl);

      // Revoke objectURL to free memory
      URL.revokeObjectURL(oldEntry.objectUrl);
      console.log(`[TextureCache] Evicted: ${oldUrl}`);
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.map.forEach((entry) => {
      URL.revokeObjectURL(entry.objectUrl);
    });
    this.map.clear();
    console.log('[TextureCache] Cleared all entries');
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.map.size;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const textureLRU = new TextureLRUCache(50);
