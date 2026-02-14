/**
 * lineageTypes.ts - P9.1 Server Lineage Types
 *
 * NORTH STAR: Server-anchored cryptographic chain-of-custody
 *
 * Server-derived hashes only (never trust client-provided)
 */

// ============================================================================
// Change Classification
// ============================================================================

export type ChangeClass =
  | 'GEOMETRY'
  | 'MATERIAL'
  | 'HARDWARE'
  | 'TOOLPATHS'
  | 'NESTING'
  | 'METADATA';

// ============================================================================
// Event Types
// ============================================================================

export type LineageEventType =
  | 'SPEC_FROZEN'
  | 'SPEC_RELEASED'
  | 'SPEC_REVOKED'
  | 'EXPORT_SUCCESS_LINK';

// ============================================================================
// Actor
// ============================================================================

export type ActorRole = 'FACTORY' | 'ADMIN' | 'DESIGNER' | 'SYSTEM' | 'API';

export interface LineageActor {
  role?: ActorRole;
  name?: string;
  keyId?: string;
}

// ============================================================================
// Revision Identity
// ============================================================================

export interface LineageRevision {
  /** Server-derived anchor (packetSha256 or manifestSha256) */
  revisionId: string;
  /** Parent revision for chain linkage */
  parentRevisionId?: string;
  /** SHA-256 of packet (if applicable) */
  packetSha256?: string;
  /** SHA-256 of manifest (if applicable) */
  manifestSha256?: string;
}

// ============================================================================
// Export Linkage
// ============================================================================

export interface LineageExport {
  /** Export ID (recommend = artifactSha256) */
  exportId?: string;
  /** SHA-256 of ZIP artifact */
  artifactSha256?: string;
  /** Artifact filename */
  artifactName?: string;
  /** Artifact size in bytes */
  sizeBytes?: number;
  /** Export format dialect */
  dialect?: string;
  /** Machine profile ID */
  profileId?: string;
  /** Export mode (PREVIEW, PRODUCTION) */
  mode?: string;
  /** Target machine */
  target?: string;
}

// ============================================================================
// Main Event Type
// ============================================================================

/**
 * Server-Anchored Lineage Event
 *
 * All events are written server-side with server-derived hashes.
 * Storage: LINEAGE_DIR/<jobId>/lineage.jsonl
 */
export interface LineageEvent {
  /** Event ID - SHA-256 of canonical payload */
  id: string;
  /** Timestamp (ISO 8601, server time) */
  at: string;
  /** Job identifier */
  jobId: string;
  /** Spec identifier (currently == jobId) */
  specId: string;
  /** Event type */
  type: LineageEventType;
  /** Actor who triggered event */
  actor?: LineageActor;
  /** Revision identity (server-derived) */
  revision: LineageRevision;
  /** Classification of changes */
  changeClass?: ChangeClass;
  /** Human-readable note */
  note?: string;
  /** Export linkage (for EXPORT_SUCCESS_LINK) */
  export?: LineageExport;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface LineageResponse {
  ok: boolean;
  jobId: string;
  items: LineageEvent[];
  error?: string;
}

export interface LineageAppendResult {
  ok: boolean;
  event?: LineageEvent;
  error?: string;
}
