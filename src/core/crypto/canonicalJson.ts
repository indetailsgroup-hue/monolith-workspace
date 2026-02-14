/**
 * canonicalJson.ts - Deterministic JSON Serialization
 *
 * CRITICAL FOR CRYPTOGRAPHIC HASHING:
 * - Standard JSON.stringify() does NOT guarantee key order
 * - Different platforms may serialize the same object differently
 * - Canonical JSON ensures deterministic output across all systems
 *
 * ALGORITHM:
 * - Object keys are sorted alphabetically
 * - Arrays preserve order
 * - Primitives use standard JSON encoding
 * - Recursive for nested structures
 */

// ============================================
// CANONICAL JSON STRINGIFY
// ============================================

/**
 * Serialize value to canonical JSON string
 *
 * Properties:
 * - Keys are sorted alphabetically
 * - No whitespace (compact)
 * - Deterministic across all platforms
 *
 * @param value - Any JSON-serializable value
 * @returns Canonical JSON string
 *
 * @example
 * canonicalJson({ b: 2, a: 1 })
 * // Returns: '{"a":1,"b":2}'
 *
 * canonicalJson({ z: { b: 2, a: 1 }, y: [3, 2, 1] })
 * // Returns: '{"y":[3,2,1],"z":{"a":1,"b":2}}'
 */
export function canonicalJson(value: unknown): string {
  // Null
  if (value === null) {
    return 'null';
  }

  // Undefined (serialize as null for compatibility)
  if (value === undefined) {
    return 'null';
  }

  // Primitives
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  // Array (preserve order, canonicalize elements)
  if (Array.isArray(value)) {
    const elements = value.map(v => canonicalJson(v));
    return '[' + elements.join(',') + ']';
  }

  // Object (sort keys, canonicalize values)
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  const entries = keys
    .filter(k => obj[k] !== undefined) // Skip undefined values
    .map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]));

  return '{' + entries.join(',') + '}';
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if two values produce the same canonical JSON
 */
export function canonicalEquals(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * Parse canonical JSON (same as JSON.parse)
 */
export function parseCanonical<T>(json: string): T {
  return JSON.parse(json) as T;
}

/**
 * Pretty-print canonical JSON (for debugging)
 * Note: This is NOT canonical, just for human readability
 */
export function canonicalPretty(value: unknown): string {
  const canonical = canonicalJson(value);
  return JSON.stringify(JSON.parse(canonical), null, 2);
}
