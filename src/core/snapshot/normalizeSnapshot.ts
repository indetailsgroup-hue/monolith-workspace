/**
 * normalizeSnapshot.ts - Normalize Job Snapshot for Deterministic Hashing
 *
 * CRITICAL: Ensures same logical state produces same hash.
 *
 * NORMALIZATION:
 * - Floats rounded to fixed precision
 * - Object keys sorted alphabetically
 * - Arrays sorted by ID
 * - Undefined/null handled consistently
 */

import type {
  JobSnapshot,
  CabinetSnapshot,
  Vec3,
  Dims3,
  MaterialSnapshot,
  EdgebandingSnapshot,
} from './snapshotTypes';

// ============================================
// ROUNDING HELPERS
// ============================================

/**
 * Round number to fixed decimal places
 */
function round(n: number, dp: number): number {
  const m = Math.pow(10, dp);
  return Math.round(n * m) / m;
}

/**
 * Normalize Vec3 with specified precision
 *
 * @param v - Vector to normalize
 * @param dp - Decimal places (default: 3 for mm precision)
 */
function normVec3(v: Vec3, dp: number = 3): Vec3 {
  return {
    x: round(v.x, dp),
    y: round(v.y, dp),
    z: round(v.z, dp),
  };
}

/**
 * Normalize Dims3 with specified precision
 */
function normDims3(d: Dims3, dp: number = 3): Dims3 {
  return {
    w: round(d.w, dp),
    h: round(d.h, dp),
    d: round(d.d, dp),
  };
}

// ============================================
// OBJECT KEY SORTING
// ============================================

/**
 * Sort object keys alphabetically
 *
 * CRITICAL: Ensures deterministic JSON output
 */
function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const keys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};

  for (const k of keys) {
    result[k] = obj[k];
  }

  return result as T;
}

/**
 * Normalize params object
 *
 * - Sort keys
 * - Normalize number values
 * - Exclude undefined values
 */
function normParams(
  params: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean | null> {
  const keys = Object.keys(params).sort();
  const out: Record<string, string | number | boolean | null> = {};

  for (const k of keys) {
    const v = params[k];

    // Skip undefined
    if (v === undefined) continue;

    // Normalize numbers to 6 decimal places
    if (typeof v === 'number') {
      out[k] = round(v, 6);
    } else {
      out[k] = v;
    }
  }

  return out;
}

// ============================================
// MATERIAL NORMALIZATION
// ============================================

/**
 * Normalize material snapshot
 *
 * Material has fixed keys (coreId, surfaceAId, surfaceBId),
 * so we construct in canonical order.
 */
function normMaterial(m: MaterialSnapshot | undefined): MaterialSnapshot | undefined {
  if (!m) return undefined;

  // Only include if coreId exists
  if (!m.coreId) return undefined;

  // Build in canonical key order
  const result: MaterialSnapshot = { coreId: m.coreId };
  if (m.surfaceAId) result.surfaceAId = m.surfaceAId;
  if (m.surfaceBId) result.surfaceBId = m.surfaceBId;

  return result;
}

/**
 * Normalize edgebanding snapshot
 *
 * Edgebanding has fixed keys (L, R, T, B),
 * so we construct in canonical order.
 */
function normEdging(e: EdgebandingSnapshot | undefined): EdgebandingSnapshot | undefined {
  if (!e) return undefined;

  // Build in canonical key order (alphabetical: B, L, R, T)
  const result: EdgebandingSnapshot = {};
  if (e.B) result.B = e.B;
  if (e.L) result.L = e.L;
  if (e.R) result.R = e.R;
  if (e.T) result.T = e.T;

  // Return undefined if empty
  if (Object.keys(result).length === 0) return undefined;

  return result;
}

// ============================================
// CABINET NORMALIZATION
// ============================================

/**
 * Normalize cabinet snapshot
 *
 * Precision:
 * - Position: 3 decimal places (0.001mm)
 * - Rotation: 6 decimal places (micro-radians)
 * - Dimensions: 3 decimal places (0.001mm)
 */
export function normalizeCabinet(c: CabinetSnapshot): CabinetSnapshot {
  const result: CabinetSnapshot = {
    id: c.id,
    type: c.type,
    pos: normVec3(c.pos, 3),
    rot: normVec3(c.rot, 6),
    dims: normDims3(c.dims, 3),
    params: normParams(c.params),
  };

  // Only include optional fields if present
  const material = normMaterial(c.material);
  if (material) result.material = material;

  const edging = normEdging(c.edging);
  if (edging) result.edging = edging;

  return result;
}

// ============================================
// JOB SNAPSHOT NORMALIZATION
// ============================================

/**
 * Normalize job snapshot for deterministic hashing
 *
 * GUARANTEES:
 * - Same logical state → same normalized output
 * - Sorted IDs and keys
 * - Consistent float precision
 * - No undefined values
 *
 * @param snapshot - Raw job snapshot
 * @returns Normalized job snapshot
 *
 * @example
 * const normalized = normalizeJobSnapshot(rawSnapshot);
 * const hash = await sha256CanonicalHex(normalized);
 */
export function normalizeJobSnapshot(snapshot: JobSnapshot): JobSnapshot {
  // Sort selection IDs
  const selectionIds = [...snapshot.selectionIds].sort();

  // Normalize and sort cabinets by ID
  const cabinets = [...snapshot.cabinets]
    .map(normalizeCabinet)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    jobId: snapshot.jobId,
    selectionIds,
    cabinets,
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate cabinet snapshot structure
 */
export function validateCabinetSnapshot(
  c: unknown
): { ok: true; cabinet: CabinetSnapshot } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!c || typeof c !== 'object') {
    return { ok: false, errors: ['Cabinet must be an object'] };
  }

  const cab = c as Record<string, unknown>;

  if (typeof cab.id !== 'string' || !cab.id) {
    errors.push('Cabinet id is required');
  }

  if (typeof cab.type !== 'string' || !cab.type) {
    errors.push('Cabinet type is required');
  }

  if (!cab.pos || typeof cab.pos !== 'object') {
    errors.push('Cabinet pos is required');
  }

  if (!cab.rot || typeof cab.rot !== 'object') {
    errors.push('Cabinet rot is required');
  }

  if (!cab.dims || typeof cab.dims !== 'object') {
    errors.push('Cabinet dims is required');
  }

  if (!cab.params || typeof cab.params !== 'object') {
    errors.push('Cabinet params is required');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, cabinet: cab as unknown as CabinetSnapshot };
}

/**
 * Validate job snapshot structure
 */
export function validateJobSnapshot(
  s: unknown
): { ok: true; snapshot: JobSnapshot } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!s || typeof s !== 'object') {
    return { ok: false, errors: ['Snapshot must be an object'] };
  }

  const snap = s as Record<string, unknown>;

  if (typeof snap.jobId !== 'string' || !snap.jobId) {
    errors.push('Snapshot jobId is required');
  }

  if (!Array.isArray(snap.selectionIds)) {
    errors.push('Snapshot selectionIds must be an array');
  }

  if (!Array.isArray(snap.cabinets)) {
    errors.push('Snapshot cabinets must be an array');
  } else {
    for (let i = 0; i < snap.cabinets.length; i++) {
      const cabResult = validateCabinetSnapshot(snap.cabinets[i]);
      if (!cabResult.ok) {
        errors.push(`Cabinet[${i}]: ${cabResult.errors.join(', ')}`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, snapshot: snap as unknown as JobSnapshot };
}
