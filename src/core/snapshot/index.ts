/**
 * Snapshot Module - Deterministic Job Snapshot for Factory Hash Lock
 *
 * EXPORTS:
 * - Types: JobSnapshot, CabinetSnapshot, etc.
 * - Normalize: normalizeJobSnapshot
 * - Hash: snapshotHashHex, hashSnapshot
 * - Verify: verifySnapshotHash, detectSnapshotChange
 */

// Types
export type {
  Vec3,
  Dims3,
  MaterialSnapshot,
  EdgebandingSnapshot,
  CabinetSnapshot,
  JobSnapshot,
  HashedSnapshot,
} from './snapshotTypes';

// Normalization
export { normalizeJobSnapshot, normalizeCabinet } from './normalizeSnapshot';

// Hashing
export {
  snapshotHashHex,
  hashSnapshot,
  verifySnapshotHash,
  snapshotsMatch,
  detectSnapshotChange,
} from './hashSnapshot';

// Validation
export {
  validateCabinetSnapshot,
  validateJobSnapshot,
} from './normalizeSnapshot';
