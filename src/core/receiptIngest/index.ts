/**
 * receiptIngest/index.ts - Receipt Ingest Module
 *
 * Provides state management for uploading and appending factory receipts.
 */

export {
  createReceiptIngestStore,
  type ReceiptIngestState,
  type CreateReceiptIngestStoreArgs,
} from './receiptIngestStore';

export {
  selectCanVerify,
  selectCanAppend,
  selectIsComplete,
  selectCanFork,
  selectForkComplete,
} from './receiptIngestStore';
