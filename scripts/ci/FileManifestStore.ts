/**
 * FileManifestStore.ts - File-based Manifest Store for Node.js
 *
 * Reads manifests from filesystem for CI verification.
 * Does NOT support writes (read-only store).
 */

import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import type { ManifestStore } from '../../src/core/manifest/manifestStoreTypes';
import type { SignedJobManifest } from '../../src/core/trust/manifestChainTypes';

/**
 * File-based manifest store (read-only)
 *
 * Directory structure:
 * ```
 * manifestDir/
 *   heads/
 *     {jobId}.json      → { headHashHex: string }
 *   manifests/
 *     {hashHex}.json    → SignedJobManifest
 * ```
 */
export class FileManifestStore implements ManifestStore {
  private manifestDir: string;

  constructor(manifestDir: string) {
    this.manifestDir = manifestDir;
  }

  /**
   * Not supported (read-only store)
   */
  async put(): Promise<void> {
    throw new Error('FileManifestStore is read-only');
  }

  /**
   * Load manifest by hash
   */
  async loadByHash(hashHex: string): Promise<SignedJobManifest | null> {
    const filePath = join(this.manifestDir, 'manifests', `${hashHex}.json`);
    try {
      const content = await readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Not supported (read-only store)
   */
  async setHead(): Promise<void> {
    throw new Error('FileManifestStore is read-only');
  }

  /**
   * Get HEAD hash for job
   */
  async getHead(jobId: string): Promise<string | null> {
    const filePath = join(this.manifestDir, 'heads', `${jobId}.json`);
    try {
      const content = await readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      return data.headHashHex ?? null;
    } catch {
      return null;
    }
  }

  /**
   * List recent manifests
   */
  async listRecent(jobId: string, limit: number = 10): Promise<SignedJobManifest[]> {
    const manifestsDir = join(this.manifestDir, 'manifests');
    try {
      const files = await readdir(manifestsDir);
      const manifests: SignedJobManifest[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(manifestsDir, file);
        try {
          const content = await readFile(filePath, 'utf8');
          const manifest: SignedJobManifest = JSON.parse(content);
          if (manifest.jobId === jobId) {
            manifests.push(manifest);
          }
        } catch {
          // Skip invalid files
        }
        if (manifests.length >= limit) break;
      }

      return manifests;
    } catch {
      return [];
    }
  }
}

/**
 * In-memory manifest store for bundle verification
 */
export class MemoryManifestStore implements ManifestStore {
  private manifests = new Map<string, SignedJobManifest>();
  private heads = new Map<string, string>();

  async put(manifest: SignedJobManifest): Promise<void> {
    this.manifests.set(manifest.manifestHashHex, manifest);
  }

  async loadByHash(hashHex: string): Promise<SignedJobManifest | null> {
    return this.manifests.get(hashHex) ?? null;
  }

  async setHead(jobId: string, headHashHex: string): Promise<void> {
    this.heads.set(jobId, headHashHex);
  }

  async getHead(jobId: string): Promise<string | null> {
    return this.heads.get(jobId) ?? null;
  }

  async listRecent(): Promise<SignedJobManifest[]> {
    return Array.from(this.manifests.values());
  }
}
