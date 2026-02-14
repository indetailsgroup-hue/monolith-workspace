/**
 * jobStateTypes.ts - P10 Server State Types
 *
 * Authoritative spec state owned by server.
 * Storage: JOB_STORAGE_ROOT/<jobId>/state/job.snapshot.json
 */

// ============================================================================
// Spec State
// ============================================================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

// ============================================================================
// Actor
// ============================================================================

export type ActorRole = 'FACTORY' | 'ADMIN' | 'DESIGNER' | 'SYSTEM' | 'API';

export interface Actor {
  role?: ActorRole;
  name?: string;
  keyId?: string;
}

// ============================================================================
// Revision Anchor
// ============================================================================

export interface JobRevisionAnchor {
  /** Server-derived anchor: manifestSha256 ?? packetSha256 */
  revisionId: string;
  /** SHA-256 of packet.json bytes */
  packetSha256?: string;
  /** SHA-256 of manifest.json bytes */
  manifestSha256?: string;
}

// ============================================================================
// Job Snapshot State (Source of Truth)
// ============================================================================

export interface JobSnapshotState {
  /** Job identifier */
  jobId: string;
  /** Current spec state (authoritative) */
  specState: SpecState;

  /** Revision anchor (server-derived hashes) */
  revision?: JobRevisionAnchor;

  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Actor who triggered last update */
  updatedBy?: Actor;

  /** Timestamp when first frozen */
  frozenAt?: string;
  /** Timestamp when first released */
  releasedAt?: string;
  /** Timestamp when revoked */
  revokedAt?: string;

  /** Human-readable notes */
  notes?: {
    freezeNote?: string;
    releaseNote?: string;
    revokeNote?: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface StateResponse {
  ok: boolean;
  jobId: string;
  specState: SpecState;
  revisionId?: string;
  packetSha256?: string;
  manifestSha256?: string;
  updatedAt?: string;
  frozenAt?: string;
  releasedAt?: string;
  revokedAt?: string;
  error?: string;
}

export interface TransitionRequest {
  note?: string;
  changeClass?: string;
}
