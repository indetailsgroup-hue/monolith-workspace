/**
 * hash.ts - SHA-256 primitives and release-authorization hashing
 *
 * Pure hashing helpers for the FactoryPacket V3 protocol (design §6.3, §11).
 * `computeReleaseAuthorizationHash` binds a candidate hash and the sorted set
 * of warning-exception grant hashes into a single domain-separated digest; an
 * empty grant list has exactly one canonical representation, and grant order is
 * irrelevant because the hashes are sorted before hashing.
 *
 * Phase: NOT_FOR_PRODUCTION. Pure functions only; no key material here.
 *
 * @version 0.13.2
 */

import { createHash } from 'crypto';
import { canonicalJson } from './canonicalJson.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Compute the lowercase hex SHA-256 digest of a UTF-8 string or raw bytes. */
export function sha256Hex(value: Uint8Array | string): string {
  const hash = createHash('sha256');
  hash.update(typeof value === 'string' ? Buffer.from(value, 'utf-8') : value);
  return hash.digest('hex');
}

/** Assert that a value is a 64-character lowercase-hex SHA-256 string. */
export function assertSha256(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    throw new Error(
      `INVALID_SHA256_SHAPE: expected 64 lowercase hex characters, received ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Compute the release-authorization hash (design §6.3):
 *   SHA-256(canonical({
 *     domain: "MONOLITH/ReleaseAuthorization/V1",
 *     candidateHash,
 *     sortedGrantHashes,
 *   }))
 * Grant hashes are sorted so the result is independent of caller ordering.
 */
export function computeReleaseAuthorizationHash(
  candidateHash: string,
  grantHashes: readonly string[],
): string {
  assertSha256(candidateHash);
  const sortedGrantHashes = [...grantHashes].sort();
  sortedGrantHashes.forEach(assertSha256);
  return sha256Hex(
    canonicalJson({
      domain: 'MONOLITH/ReleaseAuthorization/V1',
      candidateHash,
      sortedGrantHashes,
    }),
  );
}
