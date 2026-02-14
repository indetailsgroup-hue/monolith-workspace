/**
 * issueTypes.ts - Issue Pack Domain Types
 *
 * ARCHITECTURE:
 * - IssuePack: Collection of issues from a rejection
 * - IssueItem: Individual issue with status tracking
 * - IssueRef: Canonical reference for programmatic logic
 *
 * FLOW:
 * 1. Factory REJECTS receipt with rejectReasons[]
 * 2. Fork revision creates IssuePack from reasons
 * 3. IssuePack embedded in genesis manifest
 * 4. Designer resolves/waives issues via Fix Plan
 * 5. Release blocked until all ERROR issues resolved/waived
 */

// ============================================
// SEVERITY & STATUS
// ============================================

/**
 * Issue severity levels
 * - ERROR: Blocks release, must be resolved or waived
 * - WARNING: Should be addressed, doesn't block
 * - INFO: Informational only
 */
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Issue status workflow
 * - OPEN: Newly created, needs attention
 * - IN_PROGRESS: Being worked on
 * - RESOLVED: Fixed by design changes
 * - WAIVED: Accepted risk (requires strict audit)
 */
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';

// ============================================
// ISSUE REFERENCE
// ============================================

/**
 * Issue domain categories
 */
export type IssueDomain =
  | 'FACTORY_QC'   // Factory quality control
  | 'GATE'         // Manufacturing gate checks
  | 'COLLISION'    // Collision/clearance issues
  | 'EXPORT'       // Export artifact issues
  | 'OTHER';       // Uncategorized

/**
 * Canonical issue reference
 * Maps free-text reject reasons to structured codes
 */
export interface IssueRef {
  /** Issue domain category */
  domain: IssueDomain;

  /** Canonical code for programmatic logic */
  code: string;

  /** Human-readable message (original or derived) */
  message: string;
}

// ============================================
// ISSUE ITEM
// ============================================

/**
 * Evidence linking issue to source
 */
export interface IssueEvidence {
  /** Receipt hash that created this issue */
  receiptHashHex?: string;

  /** Factory station that rejected */
  stationId?: string;

  /** Inspector who rejected */
  inspector?: string;

  /** Manifest hash at rejection time */
  headManifestHashHex?: string;
}

/**
 * Individual issue item with full tracking
 */
export interface IssueItem {
  /** Deterministic issue ID */
  id: string;

  /** Severity level */
  severity: IssueSeverity;

  /** Current status */
  status: IssueStatus;

  /** Creation timestamp (ISO) */
  createdAtIso: string;

  /** Last update timestamp (ISO) */
  updatedAtIso: string;

  /** Canonical issue reference */
  source: IssueRef;

  /** Evidence linking to source */
  evidence?: IssueEvidence;

  // ---- User workflow fields ----

  /** Assigned owner (e.g., "Designer-A") */
  owner?: string;

  /** General note */
  note?: string;

  // ---- WAIVE audit fields (only when status === 'WAIVED') ----

  /** When waived (ISO) */
  waivedAtIso?: string;

  /** Who waived (e.g., "QC-Lead", "PM-A") */
  waivedBy?: string;

  /** REQUIRED reason for waiving */
  waivedReason?: string;

  // ---- UNWAIVE audit fields (if issue was waived and later reopened) ----

  /** When unwaived (ISO) */
  unwaivedAtIso?: string;

  /** Who unwaived (e.g., "QC-Lead", "PM-A") */
  unwaivedBy?: string;

  /** REQUIRED reason for unwaiving */
  unwaivedReason?: string;
}

// ============================================
// ISSUE PACK
// ============================================

/**
 * Issue pack version
 */
export type IssuePackVersion = '1.0';

/**
 * How the issue pack was created
 */
export interface IssuePackCreatedFrom {
  /** Creation source kind */
  kind: 'FACTORY_RECEIPT_REJECTION';

  /** Receipt hash that triggered creation */
  receiptHashHex: string;

  /** Factory station (optional) */
  stationId?: string;

  /** Inspector (optional) */
  inspector?: string;
}

/**
 * Issue Pack - collection of issues from a rejection
 *
 * Created when forking a revision from a REJECTED receipt.
 * Embedded in the genesis manifest of the new revision.
 * Issues must be resolved/waived before release.
 */
export interface IssuePack {
  /** Pack version */
  version: IssuePackVersion;

  /** Deterministic pack ID */
  packId: string;

  /** Job ID this pack belongs to (revision job) */
  jobId: string;

  /** Hash of the release that was rejected */
  parentReleaseHashHex: string;

  /** When pack was created (ISO) */
  createdAtIso: string;

  /** How pack was created */
  createdFrom: IssuePackCreatedFrom;

  /** Issues in this pack */
  items: IssueItem[];
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if status is blocking (prevents release)
 */
export function isBlockingStatus(status: IssueStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

/**
 * Check if issue is blocking
 */
export function isBlockingIssue(issue: IssueItem): boolean {
  return issue.severity === 'ERROR' && isBlockingStatus(issue.status);
}
