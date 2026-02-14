/**
 * issueTypes.ts - Issue Pack Types
 *
 * Defines the issue tracking types for factory rejection workflows.
 * Issues are grouped into IssuePacks, attached to manifest chain entries.
 *
 * @version 1.0.0
 */

/** Issue lifecycle status */
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';

/** Issue severity level */
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Single issue item within an issue pack
 */
export interface IssueItem {
  /** Unique issue ID */
  id: string;
  /** Severity level */
  severity: IssueSeverity;
  /** Current status */
  status: IssueStatus;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Assigned owner */
  owner?: string;
  /** Additional note */
  note?: string;

  // ---- Timestamps ----
  /** When issue was created */
  createdIso: string;
  /** When issue was resolved */
  resolvedIso?: string;

  // ---- Waive audit trail ----
  /** When issue was waived */
  waivedAtIso?: string;
  /** Who waived the issue */
  waivedBy?: string;
  /** Reason for waiving */
  waivedReason?: string;

  // ---- Unwaive audit trail ----
  /** When issue was unwaived */
  unwaivedAtIso?: string;
  /** Who unwaived the issue */
  unwaivedBy?: string;
  /** Reason for unwaiving */
  unwaivedReason?: string;
}

/**
 * Issue pack - a group of related issues
 *
 * Attached to a manifest chain entry, typically created from
 * a factory rejection receipt.
 */
export interface IssuePack {
  /** Unique pack ID */
  id: string;
  /** Revision identifier */
  revision: string;
  /** Issues in this pack */
  items: IssueItem[];
  /** When pack was created */
  createdIso: string;
}
