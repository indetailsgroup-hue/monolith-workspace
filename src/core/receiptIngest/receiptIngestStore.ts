/**
 * receiptIngestStore.ts - Receipt Ingest State
 *
 * State management for uploading, verifying, and
 * appending factory receipts.
 *
 * @version 1.0.0
 */

// ============================================================================
// State Interface
// ============================================================================

export type IngestStep = 'IDLE' | 'UPLOADING' | 'VERIFYING' | 'APPENDING' | 'DONE' | 'ERROR';

export interface ReceiptIngestState {
  /** Current step in the ingest flow */
  step: IngestStep;
  /** Progress percentage (0-100) */
  progress: number;
  /** Error message */
  error: string | null;
  /** Result of last ingest */
  lastResult: IngestResult | null;

  /** Upload and ingest a receipt file */
  ingestReceipt: (file: File) => Promise<void>;
  /** Reset to idle state */
  reset: () => void;
}

export interface IngestResult {
  /** Whether ingest succeeded */
  ok: boolean;
  /** New manifest hash after append */
  newHeadHash?: string;
  /** Verdict from the receipt */
  verdict?: 'ACCEPTED' | 'REJECTED';
  /** Error reason if failed */
  reason?: string;
}
