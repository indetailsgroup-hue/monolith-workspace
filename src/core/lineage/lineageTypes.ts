/**
 * lineageTypes.ts - P9 Spec Lineage Anchor Types
 *
 * NORTH STAR: Cryptographic chain-of-custody for job artifacts
 *
 * DESIGN PRINCIPLES:
 * - Revision identity based on content hash (SHA-256)
 * - Append-only audit trail (JSONL format)
 * - Parent-child linkage for revision chain
 * - Export linkage to bind exports to revisions
 */

// ============================================
// EVENT TYPES
// ============================================

/**
 * Types of lineage events
 */
export type SpecLineageEventType =
  | 'SPEC_FROZEN'        // DRAFT → FROZEN transition
  | 'SPEC_RELEASED'      // FROZEN → RELEASED transition
  | 'SPEC_REVOKED'       // Revocation event
  | 'EXPORT_SUCCESS_LINK'; // Export linked to revision

/**
 * Classification of changes between revisions
 */
export type ChangeClass =
  | 'GEOMETRY'    // Dimensions, panel sizes
  | 'MATERIAL'    // Material assignments
  | 'HARDWARE'    // Hinges, slides, handles
  | 'TOOLPATHS'   // CNC operations
  | 'NESTING'     // Sheet nesting changes
  | 'METADATA';   // Non-manufacturing metadata

// ============================================
// ACTOR
// ============================================

/**
 * Actor who triggered the event
 */
export interface LineageActor {
  /** Actor role (e.g., 'designer', 'factory_operator', 'admin') */
  role?: string;
  /** Human-readable name */
  name?: string;
  /** Key ID if signed */
  keyId?: string;
}

// ============================================
// REVISION
// ============================================

/**
 * Revision identity and linkage
 */
export interface LineageRevision {
  /** Content hash (packetSha256 or manifestSha256) */
  revisionId: string;
  /** Parent revision for chain linkage */
  parentRevisionId?: string;
  /** SHA-256 of snapshot packet (if applicable) */
  packetSha256?: string;
  /** SHA-256 of signed manifest (if applicable) */
  manifestSha256?: string;
}

// ============================================
// EXPORT LINKAGE
// ============================================

/**
 * Export artifact linkage
 */
export interface LineageExport {
  /** Unique export ID */
  exportId?: string;
  /** SHA-256 of exported artifact */
  artifactSha256?: string;
  /** Export format (e.g., 'DXF_R12', 'G_CODE', 'CSV') */
  dialect?: string;
  /** Machine profile ID */
  profileId?: string;
  /** Export mode (e.g., 'PREVIEW', 'PRODUCTION') */
  mode?: string;
}

// ============================================
// MAIN EVENT TYPE
// ============================================

/**
 * Spec Lineage Event - Append-only audit record
 *
 * Each event records a state transition or export action
 * with full cryptographic linkage to the revision chain.
 *
 * Storage: JOB_STORAGE_ROOT/<jobId>/audit/lineage.jsonl
 */
export interface SpecLineageEvent {
  /** Event ID - SHA-256 of canonical payload */
  id: string;
  /** Timestamp (ISO 8601) */
  at: string;
  /** Job identifier */
  jobId: string;
  /** Spec document identifier */
  specId: string;
  /** Event type */
  type: SpecLineageEventType;
  /** Actor who triggered event */
  actor?: LineageActor;
  /** Revision identity and linkage */
  revision: LineageRevision;
  /** Human-readable note */
  note?: string;
  /** Classification of changes (for SPEC_FROZEN) */
  changeClass?: ChangeClass;
  /** Export linkage (for EXPORT_SUCCESS_LINK) */
  export?: LineageExport;
}

// ============================================
// LINEAGE CHAIN
// ============================================

/**
 * Complete lineage chain for a job
 */
export interface LineageChain {
  /** Job identifier */
  jobId: string;
  /** All events in chronological order */
  events: SpecLineageEvent[];
  /** Current HEAD revision ID */
  headRevisionId?: string;
  /** Total event count */
  eventCount: number;
}

// ============================================
// QUERY TYPES
// ============================================

/**
 * Query options for lineage retrieval
 */
export interface LineageQueryOptions {
  /** Filter by event type */
  type?: SpecLineageEventType | SpecLineageEventType[];
  /** Filter by revision ID */
  revisionId?: string;
  /** Filter events after this timestamp */
  after?: string;
  /** Filter events before this timestamp */
  before?: string;
  /** Maximum events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Lineage graph node for visualization
 */
export interface LineageGraphNode {
  /** Revision ID */
  revisionId: string;
  /** Parent revision ID */
  parentRevisionId?: string;
  /** Events for this revision */
  events: SpecLineageEvent[];
  /** Children revisions (for branching) */
  children: string[];
  /** Depth in the chain (0 = root) */
  depth: number;
}

/**
 * Lineage graph for visualization
 */
export interface LineageGraph {
  /** All nodes indexed by revision ID */
  nodes: Map<string, LineageGraphNode>;
  /** Root revision IDs (genesis) */
  roots: string[];
  /** Current HEAD revision IDs */
  heads: string[];
}

// ============================================
// WRITE RESULT
// ============================================

/**
 * Result of appending a lineage event
 */
export type LineageWriteResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: string };

/**
 * Result of reading lineage
 */
export type LineageReadResult =
  | { ok: true; chain: LineageChain }
  | { ok: false; reason: string };
