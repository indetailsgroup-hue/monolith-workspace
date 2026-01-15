/**
 * Content-Addressed Store (CAS)
 *
 * Step 10: File-based immutable storage with SHA-256 addressing
 *
 * Features:
 * - Content deduplication (same hash = same content)
 * - Immutability (once stored, never changed)
 * - File-based storage with sharding (sha256/xx/hash)
 * - In-memory fallback for testing
 * - JSON and bytes read/write helpers
 */

import { createHash } from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ============================================================================
// SHA-256 Helper
// ============================================================================

/**
 * Compute SHA-256 hash of content.
 */
export function sha256Hex(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return createHash('sha256').update(buffer).digest('hex');
}

// ============================================================================
// CAS Class (File-based or In-Memory)
// ============================================================================

export class CAS {
  private dataDir: string;
  private useFileSystem: boolean;
  private memoryStore: Map<string, Buffer>;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.useFileSystem = dataDir !== ':memory:';
    this.memoryStore = new Map();
  }

  /**
   * Initialize the CAS (create directories if needed).
   */
  async init(): Promise<void> {
    if (!this.useFileSystem) return;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'sha256'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'bundles'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'exports'), { recursive: true });
      console.log(`[CAS] Initialized at ${this.dataDir}`);
    } catch (err) {
      console.error('[CAS] Failed to initialize:', err);
      throw err;
    }
  }

  /**
   * Get the file path for a content hash (sharded by first 2 chars).
   */
  private getHashPath(hash: string): string {
    const prefix = hash.slice(0, 2);
    return path.join(this.dataDir, 'sha256', prefix, hash);
  }

  /**
   * Get the file path for a general path.
   */
  private getPath(relativePath: string): string {
    return path.join(this.dataDir, relativePath);
  }

  // ==========================================================================
  // Content-Addressed Storage (by hash)
  // ==========================================================================

  /**
   * Store content by its SHA-256 hash.
   * Returns the hash.
   */
  async putBytes(content: Buffer | string): Promise<string> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const hash = sha256Hex(buffer);

    if (this.useFileSystem) {
      const filePath = this.getHashPath(hash);
      const dir = path.dirname(filePath);

      try {
        await fs.mkdir(dir, { recursive: true });
        // Check if already exists (immutable)
        try {
          await fs.access(filePath);
          return hash; // Already exists
        } catch {
          // Doesn't exist, write it
        }
        await fs.writeFile(filePath, buffer);
      } catch (err) {
        console.error(`[CAS] Failed to write ${hash}:`, err);
        throw err;
      }
    } else {
      this.memoryStore.set(hash, buffer);
    }

    return hash;
  }

  /**
   * Get content by its SHA-256 hash.
   */
  async getBytes(hash: string): Promise<Buffer | null> {
    if (this.useFileSystem) {
      try {
        const filePath = this.getHashPath(hash);
        return await fs.readFile(filePath);
      } catch {
        return null;
      }
    } else {
      return this.memoryStore.get(hash) ?? null;
    }
  }

  /**
   * Check if content exists by hash.
   */
  async hasHash(hash: string): Promise<boolean> {
    if (this.useFileSystem) {
      try {
        await fs.access(this.getHashPath(hash));
        return true;
      } catch {
        return false;
      }
    } else {
      return this.memoryStore.has(hash);
    }
  }

  // ==========================================================================
  // Path-Based Storage (for indexes, bundles, exports)
  // ==========================================================================

  /**
   * Write bytes to a path.
   */
  async writeBytes(relativePath: string, content: Buffer | string): Promise<void> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

    if (this.useFileSystem) {
      const filePath = this.getPath(relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
    } else {
      this.memoryStore.set(relativePath, buffer);
    }
  }

  /**
   * Read bytes from a path.
   */
  async readBytes(relativePath: string): Promise<Buffer> {
    if (this.useFileSystem) {
      return fs.readFile(this.getPath(relativePath));
    } else {
      const buffer = this.memoryStore.get(relativePath);
      if (!buffer) throw new Error(`Not found: ${relativePath}`);
      return buffer;
    }
  }

  /**
   * Write JSON to a path.
   */
  async putJson(relativePath: string, data: unknown): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await this.writeBytes(relativePath, json);
  }

  /**
   * Read JSON from a path.
   */
  async readJson<T = unknown>(relativePath: string): Promise<T> {
    const buffer = await this.readBytes(relativePath);
    return JSON.parse(buffer.toString('utf-8'));
  }

  /**
   * Check if a path exists.
   */
  async exists(relativePath: string): Promise<boolean> {
    if (this.useFileSystem) {
      try {
        await fs.access(this.getPath(relativePath));
        return true;
      } catch {
        return false;
      }
    } else {
      return this.memoryStore.has(relativePath);
    }
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  async stats(): Promise<{ hashCount: number; totalBytes: number }> {
    if (this.useFileSystem) {
      // Count files in sha256 directory
      let hashCount = 0;
      let totalBytes = 0;

      try {
        const sha256Dir = path.join(this.dataDir, 'sha256');
        const prefixes = await fs.readdir(sha256Dir).catch(() => []);

        for (const prefix of prefixes) {
          const prefixPath = path.join(sha256Dir, prefix);
          const files = await fs.readdir(prefixPath).catch(() => []);
          hashCount += files.length;

          for (const file of files) {
            const stat = await fs.stat(path.join(prefixPath, file)).catch(() => null);
            if (stat) totalBytes += stat.size;
          }
        }
      } catch {
        // Ignore errors
      }

      return { hashCount, totalBytes };
    } else {
      let totalBytes = 0;
      for (const buffer of this.memoryStore.values()) {
        totalBytes += buffer.length;
      }
      return { hashCount: this.memoryStore.size, totalBytes };
    }
  }
}

// ============================================================================
// Legacy Functions (for backwards compatibility)
// ============================================================================

// In-memory store for legacy functions
const legacyStore = new Map<string, Buffer>();

export function casStore(content: Buffer | string): string {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const hash = sha256Hex(buffer);
  if (!legacyStore.has(hash)) {
    legacyStore.set(hash, buffer);
  }
  return hash;
}

export function casGet(hash: string): Buffer | null {
  return legacyStore.get(hash) ?? null;
}

export function casHas(hash: string): boolean {
  return legacyStore.has(hash);
}

export function casListKeys(): string[] {
  return Array.from(legacyStore.keys());
}

export function casStats(): { count: number; totalBytes: number } {
  let totalBytes = 0;
  for (const buffer of legacyStore.values()) {
    totalBytes += buffer.length;
  }
  return { count: legacyStore.size, totalBytes };
}

export function casClear(): void {
  legacyStore.clear();
}

// ============================================================================
// Bundle Storage Helpers
// ============================================================================

export interface StoredBundle {
  bundleHash: string;
  manifestHash: string;
  signatureHash: string;
  createdAtIso: string;
}

// Index of bundles by their manifest hash
const bundleIndex = new Map<string, StoredBundle>();

/**
 * Store a complete bundle (manifest + signature + files).
 * Returns the bundle ID (manifest hash).
 */
export function storeBundleFiles(
  manifestJson: string,
  signatureJson: string,
  files: Array<{ name: string; content: Buffer | string }>
): StoredBundle {
  // Store manifest and signature
  const manifestHash = casStore(manifestJson);
  const signatureHash = casStore(signatureJson);

  // Store all files
  for (const file of files) {
    casStore(file.content);
  }

  // Compute bundle hash as hash of manifest+signature
  const bundleHash = sha256Hex(manifestJson + signatureJson);

  const storedBundle: StoredBundle = {
    bundleHash,
    manifestHash,
    signatureHash,
    createdAtIso: new Date().toISOString(),
  };

  // Index by manifest hash (bundle ID)
  bundleIndex.set(manifestHash, storedBundle);

  return storedBundle;
}

/**
 * Retrieve a stored bundle by its ID (manifest hash).
 */
export function getStoredBundle(bundleId: string): StoredBundle | null {
  return bundleIndex.get(bundleId) ?? null;
}

/**
 * List all stored bundle IDs.
 */
export function listBundleIds(): string[] {
  return Array.from(bundleIndex.keys());
}
