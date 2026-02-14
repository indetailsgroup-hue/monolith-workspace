/**
 * hashBytes.ts - SHA-256 Hash Helpers
 *
 * Thin wrappers around sha256Hex for text and byte inputs.
 * Used by exportPipeline.ts for artifact hashing.
 *
 * @version 1.0.0
 */

import { sha256Hex } from '../../crypto/sha256';

/**
 * Compute SHA-256 hash of a UTF-8 text string
 */
export async function sha256TextHex(text: string): Promise<string> {
  return sha256Hex(text);
}

/**
 * Compute SHA-256 hash of a Uint8Array
 */
export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}
