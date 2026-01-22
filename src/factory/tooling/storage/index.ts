/**
 * index.ts - Tool Usage Storage Module
 *
 * IndexedDB persistence for tool usage tracking.
 *
 * @version 1.1.0 - Phase D6.1 (added resetToolWear, listToolWearThresholds)
 */

export * from './indexedDbToolingStore';
export * from './toolingStoreHelpers';

// Re-export D6.1 types for convenience
export type {
  ResetReason,
  ResetToolWearOptions,
  MaintenanceLogEntry,
} from './indexedDbToolingStore';
