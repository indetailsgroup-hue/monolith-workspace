/**
 * hashSnapshot.ts - Compute Deterministic Hash of Job Snapshot
 *
 * PROCESS:
 * 1. Normalize snapshot (sort keys, round floats)
 * 2. Serialize to canonical JSON
 * 3. Compute SHA-256 hash
 *
 * DETERMINISM:
 * - Same logical state always produces same hash
 * - Used for preflight lock verification
 */

import type { JobSnapshot, HashedSnapshot } from './snapshotTypes';
import { normalizeJobSnapshot } from './normalizeSnapshot';
import { sha256CanonicalHex } from '../crypto/sha256';

// ============================================
// HASH COMPUTATION
// ============================================

/**
 * Compute SHA-256 hash of job snapshot
 *
 * The snapshot is first normalized to ensure deterministic output:
 * - Floats rounded to fixed precision
 * - Keys sorted alphabetically
 * - Arrays sorted by ID
 *
 * @param snapshot - Job snapshot to hash
 * @returns SHA-256 hash as hex string (64 chars)
 *
 * @example
 * const hash = await snapshotHashHex(snapshot);
 * // Returns: "a1b2c3d4e5f6..."
 */
export async function snapshotHashHex(snapshot: JobSnapshot): Promise<string> {
  // 1. Normalize snapshot
  const normalized = normalizeJobSnapshot(snapshot);

  // 2. Compute SHA-256 of canonical JSON
  return sha256CanonicalHex(normalized);
}

/**
 * Create snapshot with hash
 *
 * @param snapshot - Job snapshot
 * @returns Snapshot with computed hash
 */
export async function hashSnapshot(snapshot: JobSnapshot): Promise<HashedSnapshot> {
  const hashHex = await snapshotHashHex(snapshot);

  return {
    snapshot: normalizeJobSnapshot(snapshot),
    hashHex,
  };
}

// ============================================
// VERIFICATION
// ============================================

/**
 * Verify snapshot matches expected hash
 *
 * @param snapshot - Snapshot to verify
 * @param expectedHashHex - Expected hash
 * @returns true if hash matches
 */
export async function verifySnapshotHash(
  snapshot: JobSnapshot,
  expectedHashHex: string
): Promise<boolean> {
  const actualHash = await snapshotHashHex(snapshot);
  return actualHash === expectedHashHex;
}

/**
 * Check if two snapshots have the same hash
 *
 * @param a - First snapshot
 * @param b - Second snapshot
 * @returns true if hashes match
 */
export async function snapshotsMatch(a: JobSnapshot, b: JobSnapshot): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([snapshotHashHex(a), snapshotHashHex(b)]);

  return hashA === hashB;
}

// ============================================
// CHANGE DETECTION
// ============================================

/**
 * Check if snapshot has changed from reference hash
 *
 * @param currentSnapshot - Current snapshot
 * @param referenceHashHex - Reference hash to compare against
 * @returns Change detection result
 */
export async function detectSnapshotChange(
  currentSnapshot: JobSnapshot,
  referenceHashHex: string
): Promise<{
  changed: boolean;
  currentHashHex: string;
  referenceHashHex: string;
}> {
  const currentHashHex = await snapshotHashHex(currentSnapshot);

  return {
    changed: currentHashHex !== referenceHashHex,
    currentHashHex,
    referenceHashHex,
  };
}
