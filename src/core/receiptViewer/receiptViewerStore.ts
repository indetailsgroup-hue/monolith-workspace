/**
 * receiptViewerStore.ts - Receipt Viewer State
 *
 * State management for viewing factory receipts
 * and acceptance timeline.
 *
 * @version 1.0.0
 */

import type { AcceptanceTimeline, TimelineEvent } from '../chainEvents/buildTimeline';

// ============================================================================
// State Interface
// ============================================================================

/**
 * Acceptance display info derived from timeline
 */
export interface AcceptanceDisplayInfo {
  /** Status text */
  status: string;
  /** Spec state */
  specState?: string;
  /** Display color class */
  color: string;
  /** Icon character */
  icon: string;
  /** Receipt counts */
  receiptCounts?: {
    total: number;
    accepted: number;
    rejected: number;
  };
  /** Rejection reasons */
  rejectReasons?: string[];
}

export interface ReceiptViewerState {
  /** Current timeline data */
  timeline: (AcceptanceTimeline & { summary: TimelineSummary }) | null;
  /** Acceptance display info */
  acceptance: AcceptanceDisplayInfo | null;
  /** Selected timeline event for detail view */
  selectedEvent: TimelineEvent | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;

  /** Load timeline for current job (no args) or for a specific job */
  loadTimeline: (jobId?: string) => Promise<void>;
  /** Select an event for detail view */
  selectEvent: (event: TimelineEvent | null) => void;
  /** Clear state */
  clear: () => void;
}

/**
 * Timeline summary statistics
 */
export interface TimelineSummary {
  totalManifests: number;
  totalReceipts: number;
  totalExports: number;
}
