/**
 * Packet Hash Utility
 * P2.1 Packet Viewer
 *
 * Computes SHA-256 hash of packet file for integrity verification.
 *
 * @version 0.12.0
 */

import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of raw bytes.
 * Returns lowercase hex string (64 characters).
 */
export function computePacketHash(data: Buffer | string): string {
  const hash = createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

/**
 * Compute SHA-256 hash of a file.
 * Returns lowercase hex string (64 characters).
 */
export async function computePacketHashFromFile(
  filePath: string
): Promise<string> {
  const { readFile } = await import("fs/promises");
  const data = await readFile(filePath);
  return computePacketHash(data);
}

/**
 * Verify that a computed hash matches an expected hash.
 * Case-insensitive comparison.
 */
export function verifyPacketHash(
  computed: string,
  expected: string
): boolean {
  return computed.toLowerCase() === expected.toLowerCase();
}

/**
 * Truncate hash for display (first 8 + last 8 characters).
 */
export function truncateHash(hash: string): string {
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}
