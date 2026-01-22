/**
 * cncCacheKey.ts - Deterministic CNC Cache Key Generation
 *
 * Generates stable cache keys for CNC bundles based on:
 * - Packet content hash (source data identity)
 * - Machine ID (target machine)
 * - Post processor identity (dialect + version)
 *
 * Cache hit = identical opGraph + identical G-code (byte-for-byte)
 *
 * @version 1.0.0 - Phase D3.2
 */

import { sha256Hex } from '../../crypto/sha256';
import { stableStringify } from '../../core/kernelClient/stablejson';
import type { CncPostIdentity, CncDialect } from '../bundle/cncManifest';
import { CNC_POST_VERSION } from '../bundle/cncManifest';

// ============================================================================
// Types
// ============================================================================

/**
 * Input components for generating a cache key.
 */
export interface CncCacheKeyInput {
  /** Content hash of source packet (from manifest.contentHash) */
  packetContentHash: string;

  /** Target machine ID (e.g., 'KDT', 'BIESSE') */
  machineId: string;

  /** G-code dialect */
  dialect: CncDialect;

  /** Post processor version (defaults to CNC_POST_VERSION) */
  postVersion?: string;
}

/**
 * Structured cache key for lookups.
 */
export interface CncCacheKey {
  /** Deterministic key string (SHA-256 hex, 64 chars) */
  key: string;

  /** Input components (for debugging/display) */
  components: {
    packetContentHash: string;
    machineId: string;
    post: CncPostIdentity;
  };
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a deterministic CNC cache key.
 *
 * The key is derived from a stable JSON representation of:
 * - packetContentHash (source data)
 * - machineId (target machine)
 * - dialect + postVersion (post processor identity)
 *
 * Cache semantics:
 * - Same key = identical opGraph + identical G-code output
 * - Changing post version invalidates cache automatically
 *
 * @param input - Cache key input components
 * @returns Promise resolving to structured cache key
 */
export async function generateCncCacheKey(
  input: CncCacheKeyInput
): Promise<CncCacheKey> {
  const {
    packetContentHash,
    machineId,
    dialect,
    postVersion = CNC_POST_VERSION,
  } = input;

  // Build stable key components
  const keyComponents = {
    packetContentHash,
    machineId,
    post: {
      dialect,
      postVersion,
    },
  };

  // Serialize to stable JSON (sorted keys, deterministic)
  const keyJson = stableStringify(keyComponents);

  // Hash to produce the cache key
  const keyBytes = new TextEncoder().encode(keyJson);
  const key = await sha256Hex(keyBytes);

  return {
    key,
    components: keyComponents,
  };
}

/**
 * Generate cache key synchronously from pre-computed values.
 *
 * Use this when you already have the post identity object.
 *
 * @param packetContentHash - Source packet content hash
 * @param machineId - Target machine ID
 * @param post - Post processor identity
 * @returns Promise resolving to cache key string
 */
export async function generateCncCacheKeyFromPost(
  packetContentHash: string,
  machineId: string,
  post: CncPostIdentity
): Promise<string> {
  const result = await generateCncCacheKey({
    packetContentHash,
    machineId,
    dialect: post.dialect,
    postVersion: post.postVersion,
  });
  return result.key;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a string is a valid CNC cache key (SHA-256 hex).
 */
export function isValidCncCacheKey(key: unknown): key is string {
  return typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
}

/**
 * Get a short display version of a cache key (first 8 chars).
 */
export function getShortCacheKey(key: string): string {
  return key.slice(0, 8);
}
