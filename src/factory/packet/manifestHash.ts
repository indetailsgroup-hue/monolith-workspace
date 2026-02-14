/**
 * Manifest Hash Utilities - B2 MVP
 *
 * SHA-256 hashing for factory packet manifest.
 * Uses Web Crypto API for browser compatibility.
 *
 * DETERMINISM RULES:
 * - Same input → same hash (always)
 * - JSON serialization uses sorted keys
 * - Numbers use fixed precision (3 decimal places)
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

// ============================================
// SHA-256 HASH
// ============================================

/**
 * Compute SHA-256 hash of a string
 *
 * @param data - Input string (UTF-8)
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-256 hash of a Uint8Array
 *
 * @param data - Input bytes
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Bytes(data: Uint8Array): Promise<string> {
  // Create a new Uint8Array with its own ArrayBuffer for Web Crypto compatibility
  const copy = new Uint8Array(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', copy);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// DETERMINISTIC JSON SERIALIZATION
// ============================================

/**
 * Round number to fixed precision for determinism
 *
 * @param value - Number to round
 * @param decimals - Decimal places (default: 3)
 * @returns Rounded number
 */
export function roundToPrecision(value: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Serialize value with deterministic ordering and precision
 *
 * @param value - Value to serialize
 * @returns Deterministic JSON string
 */
export function serializeDeterministic(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    // Handle numbers: round to fixed precision
    if (typeof v === 'number') {
      return roundToPrecision(v);
    }
    // Handle objects: sort keys
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(v).sort();
      for (const key of keys) {
        sorted[key] = v[key];
      }
      return sorted;
    }
    return v;
  });
}

/**
 * Serialize value with deterministic ordering, pretty-printed
 *
 * @param value - Value to serialize
 * @param indent - Indentation (default: 2)
 * @returns Deterministic JSON string with indentation
 */
export function serializeDeterministicPretty(
  value: unknown,
  indent: number = 2
): string {
  return JSON.stringify(
    JSON.parse(serializeDeterministic(value)),
    null,
    indent
  );
}

// ============================================
// CONTENT HASH COMPUTATION
// ============================================

/**
 * Compute content hash from file hashes
 *
 * The content hash is SHA-256 of sorted file hashes joined by newlines.
 * This ensures deterministic ordering regardless of file creation order.
 *
 * @param fileHashes - Array of file hashes (hex strings)
 * @returns Combined content hash
 */
export async function computeContentHash(
  fileHashes: string[]
): Promise<string> {
  // Sort hashes alphabetically for determinism
  const sorted = [...fileHashes].sort();
  // Join with newlines
  const combined = sorted.join('\n');
  // Hash the combined string
  return sha256(combined);
}

/**
 * Compute file entry hash
 *
 * @param path - File path
 * @param content - File content
 * @returns File entry with hash and size
 */
export async function computeFileEntry(
  path: string,
  content: string
): Promise<{ path: string; sha256: string; sizeBytes: number }> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const hash = await sha256(content);

  return {
    path,
    sha256: hash,
    sizeBytes: bytes.length,
  };
}

// ============================================
// MANIFEST HASH VERIFICATION
// ============================================

/**
 * Verify file against manifest entry
 *
 * @param content - File content
 * @param expectedHash - Expected SHA-256 hash
 * @returns True if hash matches
 */
export async function verifyFileHash(
  content: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await sha256(content);
  return actualHash === expectedHash;
}

/**
 * Verify all files against manifest
 *
 * @param files - Map of path → content
 * @param manifest - Manifest with file entries
 * @returns Verification result
 */
export async function verifyManifest(
  files: Map<string, string>,
  manifest: { files: Array<{ path: string; sha256: string }> }
): Promise<{
  valid: boolean;
  mismatches: string[];
  missing: string[];
}> {
  const mismatches: string[] = [];
  const missing: string[] = [];

  for (const entry of manifest.files) {
    const content = files.get(entry.path);
    if (content === undefined) {
      missing.push(entry.path);
      continue;
    }

    const matches = await verifyFileHash(content, entry.sha256);
    if (!matches) {
      mismatches.push(entry.path);
    }
  }

  return {
    valid: mismatches.length === 0 && missing.length === 0,
    mismatches,
    missing,
  };
}
