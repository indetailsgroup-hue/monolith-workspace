/**
 * stablejson.ts - Deterministic JSON Serialization
 *
 * Produces stable, sorted-key JSON strings for hashing and caching.
 *
 * @version 1.0.0
 */

/**
 * Serialize a value to a deterministic JSON string with sorted keys.
 * Optional indent parameter controls formatting.
 */
export function stableStringify(value: unknown, indent?: number): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

/** Recursively sort object keys for deterministic output. */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
