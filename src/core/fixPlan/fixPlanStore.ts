/**
 * fixPlanStore.ts - Fix Plan State
 *
 * State management for issue resolution workflow.
 * Tracks blocking issues and their resolution status.
 *
 * @version 1.0.0
 */

import type { IssueItem } from '../issues/issueTypes';

// ============================================================================
// State Interface
// ============================================================================

export interface FixPlanState {
  /** Blocking issues that need resolution */
  blockingIssues: IssueItem[];
  /** Currently selected issue for editing */
  selectedIssueId: string | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;

  /** Load blocking issues for a job */
  loadIssues: (jobId: string) => Promise<void>;
  /** Select an issue for editing */
  selectIssue: (issueId: string | null) => void;
  /** Resolve an issue */
  resolveIssue: (issueId: string, note: string) => Promise<void>;
  /** Waive an issue */
  waiveIssue: (issueId: string, reason: string) => Promise<void>;
  /** Clear state */
  clear: () => void;
}
