// src/core/manufacturing/audit/crossLangHash.ts
/**
 * Cross-Language Deterministic Hashing.
 *
 * This module provides stableStringify and SHA-256 implementations
 * that are guaranteed to produce identical output across:
 * - TypeScript (this file)
 * - Python (services/signer/src/audit/stable_json.py)
 *
 * CRITICAL: Any change to this file MUST be mirrored in Python
 * and verified against contracts/audit/stable-hash-vectors.v1.json
 *
 * Rules (HARD - DO NOT CHANGE):
 * 1. Object keys: sort lexicographically (Unicode codepoint order)
 * 2. Arrays: preserve order (caller must ensure determinism)
 * 3. Omit: undefined (TS only) - Python has no undefined
 * 4. Keep: null (both TS/Py)
 * 5. Numbers: JSON standard - THROW on NaN/Infinity
 * 6. Arrays: THROW if undefined in array (ambiguous in JSON)
 * 7. Strings: UTF-8 encoding
 * 8. JSON: no spaces (compact)
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// =============================================================================
// STABLE STRINGIFY (Cross-Language Compatible)
// =============================================================================

/**
 * Recursively normalize value for stable JSON.
 *
 * THROWS on:
 * - NaN / Infinity (non-finite numbers)
 * - undefined in arrays (ambiguous - becomes null in JSON)
 * - unsupported types (function, symbol, bigint)
 *
 * @param value Value to process
 * @param path Current path (for error messages)
 * @returns Normalized value
 */
function normalizeRecursive(value: unknown, path: string = "$"): unknown {
  // null - keep as-is
  if (value === null) {
    return null;
  }

  // undefined - will be omitted in objects, but throw in arrays
  if (value === undefined) {
    // This should only be reached from arrays (objects skip undefined)
    throw new Error(`stableStringify: undefined at ${path} (not allowed in arrays)`);
  }

  const t = typeof value;

  // Numbers - THROW on NaN/Infinity
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`stableStringify: non-finite number at ${path}: ${value}`);
    }
    return value;
  }

  // Strings and booleans - keep as-is
  if (t === "string" || t === "boolean") {
    return value;
  }

  // Arrays - preserve order, THROW if undefined
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === undefined) {
        throw new Error(`stableStringify: undefined in array at ${path}[${i}]`);
      }
      result.push(normalizeRecursive(item, `${path}[${i}]`));
    }
    return result;
  }

  // Objects - sort keys, skip undefined values
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const v = obj[key];
      // Skip undefined values (TS-specific, Python has no undefined)
      if (v === undefined) {
        continue;
      }
      result[key] = normalizeRecursive(v, `${path}.${key}`);
    }

    return result;
  }

  // Unsupported types (function, symbol, bigint)
  throw new Error(`stableStringify: unsupported type at ${path}: ${t}`);
}

/**
 * Stable JSON stringify.
 *
 * Produces deterministic JSON that is identical across languages.
 * MUST match Python implementation exactly.
 *
 * @param value Value to stringify
 * @returns Deterministic JSON string
 */
export function stableStringifyCrossLang(value: unknown): string {
  const normalized = normalizeRecursive(value);
  // JSON.stringify with no replacer and no space = compact
  return JSON.stringify(normalized);
}

// =============================================================================
// SHA-256 (Cross-Language Compatible)
// =============================================================================

/**
 * Compute SHA-256 hash of string (UTF-8 encoded).
 *
 * @param data String to hash
 * @returns Lowercase hex hash (64 chars)
 */
export async function sha256CrossLang(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 of object using stable stringify.
 *
 * @param obj Object to hash
 * @returns Lowercase hex hash (64 chars)
 */
export async function sha256ObjectCrossLang(obj: unknown): Promise<string> {
  const json = stableStringifyCrossLang(obj);
  return sha256CrossLang(json);
}

// =============================================================================
// SYNC SHA-256 (for environments without crypto.subtle)
// =============================================================================

/**
 * Simple sync hash (djb2 algorithm).
 *
 * NOT cryptographic - use only for non-security fingerprints.
 * Cross-language compatible.
 *
 * @param str String to hash
 * @returns 8-char hex hash
 */
export function simpleHashCrossLang(str: string): string {
  let hash = 5381;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // hash * 33 ^ char
    hash = ((hash << 5) + hash) ^ char;
    // Keep within 32-bit integer range
    hash = hash >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

// =============================================================================
// MANIFEST HASH (specific to MONOLITH signing)
// =============================================================================

/**
 * Content to sign (excludes chain and signature).
 */
export interface ManifestUnsignedContent {
  version: string;
  createdAtIso: string;
  job: unknown;
  manufacturingTruth: unknown;
  toolpath: unknown;
  gate: unknown;
}

/**
 * Extract unsigned content from manifest for hashing.
 *
 * This is the ONLY content that goes into manifestHash.
 *
 * @param manifest Full manifest object
 * @returns Unsigned content for hashing
 */
export function extractUnsignedContent(
  manifest: Record<string, unknown>
): ManifestUnsignedContent {
  return {
    version: manifest.version as string,
    createdAtIso: manifest.createdAtIso as string,
    job: manifest.job,
    manufacturingTruth: manifest.manufacturingTruth,
    toolpath: manifest.toolpath,
    gate: manifest.gate,
  };
}

/**
 * Compute manifest hash (for signing).
 *
 * @param manifest Full manifest or unsigned content
 * @returns SHA-256 hex hash
 */
export async function computeManifestHashForSigning(
  manifest: Record<string, unknown>
): Promise<string> {
  const unsigned = extractUnsignedContent(manifest);
  return sha256ObjectCrossLang(unsigned);
}

// =============================================================================
// TEST VECTOR VERIFICATION
// =============================================================================

/**
 * Test vector from vectors.json.
 */
export interface HashTestVector {
  id: string;
  input: unknown;
  expectedJson: string;
  expectedSha256: string;
  description?: string;
}

/**
 * Verify single test vector.
 *
 * @param vector Test vector
 * @returns Verification result
 */
export async function verifyTestVector(vector: HashTestVector): Promise<{
  id: string;
  jsonMatch: boolean;
  hashMatch: boolean;
  actualJson: string;
  actualHash: string;
}> {
  const actualJson = stableStringifyCrossLang(vector.input);
  const actualHash = await sha256CrossLang(actualJson);

  return {
    id: vector.id,
    jsonMatch: actualJson === vector.expectedJson,
    hashMatch: actualHash === vector.expectedSha256,
    actualJson,
    actualHash,
  };
}

/**
 * Verify all test vectors.
 *
 * @param vectors Array of test vectors
 * @returns All verification results
 */
export async function verifyAllTestVectors(
  vectors: HashTestVector[]
): Promise<{
  passed: number;
  failed: number;
  results: Array<{
    id: string;
    passed: boolean;
    details?: string;
  }>;
}> {
  const results: Array<{ id: string; passed: boolean; details?: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const vector of vectors) {
    const result = await verifyTestVector(vector);
    const vectorPassed = result.jsonMatch && result.hashMatch;

    if (vectorPassed) {
      passed++;
      results.push({ id: vector.id, passed: true });
    } else {
      failed++;
      const details: string[] = [];
      if (!result.jsonMatch) {
        details.push(`JSON mismatch: got "${result.actualJson}", expected "${vector.expectedJson}"`);
      }
      if (!result.hashMatch) {
        details.push(`Hash mismatch: got "${result.actualHash}", expected "${vector.expectedSha256}"`);
      }
      results.push({ id: vector.id, passed: false, details: details.join("; ") });
    }
  }

  return { passed, failed, results };
}

// =============================================================================
// GOLDEN HASH GENERATION (for freezing test vectors)
// =============================================================================

/**
 * Generate golden hashes for test vectors.
 *
 * Use this to update vectors.json with actual hashes.
 *
 * @param vectors Vectors with placeholder hashes
 * @returns Vectors with actual hashes
 */
export async function generateGoldenHashes(
  vectors: Array<{ id: string; input: unknown; description?: string }>
): Promise<HashTestVector[]> {
  const results: HashTestVector[] = [];

  for (const v of vectors) {
    const json = stableStringifyCrossLang(v.input);
    const hash = await sha256CrossLang(json);

    results.push({
      id: v.id,
      input: v.input,
      expectedJson: json,
      expectedSha256: hash,
      description: v.description,
    });
  }

  return results;
}
