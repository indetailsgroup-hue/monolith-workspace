/**
 * snapshotTypes.ts - Canonical Snapshot Model for Factory Hash Lock
 *
 * ARCHITECTURE:
 * - CabinetSnapshot: manufacturing-relevant cabinet data
 * - JobSnapshot: deterministic job state for hashing
 * - Only includes data that affects factory output
 * - Excludes UI-only state (selection highlight, etc.)
 *
 * DETERMINISM:
 * - All fields must be serializable to JSON
 * - Floats are rounded to fixed precision
 * - Arrays are sorted by ID for consistency
 */

// ============================================
// PRIMITIVES
// ============================================

/**
 * 3D vector (mm or degrees depending on context)
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Dimensions (mm)
 */
export interface Dims3 {
  w: number; // width
  h: number; // height
  d: number; // depth
}

// ============================================
// MATERIAL SNAPSHOT
// ============================================

/**
 * Material assignment snapshot
 */
export interface MaterialSnapshot {
  /** Core material ID */
  coreId: string;
  /** Surface A material ID (face) */
  surfaceAId?: string;
  /** Surface B material ID (back) */
  surfaceBId?: string;
}

/**
 * Edgebanding assignment snapshot
 */
export interface EdgebandingSnapshot {
  /** Left edge material ID */
  L?: string;
  /** Right edge material ID */
  R?: string;
  /** Top edge material ID */
  T?: string;
  /** Bottom edge material ID */
  B?: string;
}

// ============================================
// CABINET SNAPSHOT
// ============================================

/**
 * Cabinet snapshot for deterministic hashing
 *
 * Contains only manufacturing-relevant data:
 * - Position and rotation in world space
 * - Final dimensions (after all calculations)
 * - Parameters that affect cut lists/exports
 * - Material and edging assignments
 */
export interface CabinetSnapshot {
  /** Cabinet ID (uuid) */
  id: string;

  /** Cabinet type/archetype key */
  type: string;

  /** World position (mm) */
  pos: Vec3;

  /** Rotation (radians or degrees, must be consistent) */
  rot: Vec3;

  /** Final dimensions (mm) */
  dims: Dims3;

  /**
   * Manufacturing-relevant parameters
   *
   * Must be stable keys with deterministic values.
   * Examples: shelfCount, doorStyle, drawerCount, etc.
   */
  params: Record<string, string | number | boolean | null>;

  /** Material assignment */
  material?: MaterialSnapshot;

  /** Edgebanding assignment */
  edging?: EdgebandingSnapshot;
}

// ============================================
// JOB SNAPSHOT
// ============================================

/**
 * Job snapshot for deterministic hashing
 *
 * This is the "source of truth" for what goes to the factory.
 * Any change to this snapshot invalidates the preflight hash lock.
 */
export interface JobSnapshot {
  /** Job ID */
  jobId: string;

  /** Selected cabinet IDs (sorted deterministically) */
  selectionIds: string[];

  /** Cabinet snapshots (sorted by ID) */
  cabinets: CabinetSnapshot[];
}

// ============================================
// SNAPSHOT RESULT
// ============================================

/**
 * Snapshot with computed hash
 */
export interface HashedSnapshot {
  /** The snapshot data */
  snapshot: JobSnapshot;

  /** SHA-256 hash of canonical JSON (hex) */
  hashHex: string;
}
