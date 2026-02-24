/**
 * Lineage Module - P9.1 Server-Anchored Lineage
 *
 * Cryptographic chain-of-custody for job artifacts.
 * Server-derived hashes only.
 */

// Types
export type {
  ChangeClass,
  LineageEventType,
  ActorRole,
  LineageActor,
  LineageRevision,
  LineageExport,
  LineageEvent,
  LineageResponse,
  LineageAppendResult,
} from './lineageTypes.js';

// Storage
export {
  safeJobId,
  appendLineageEvent,
  readLineageEvents,
  getLatestRevisionId,
  recordExportSuccess,
} from './lineageStorage.js';
export type {
  AppendLineageEventParams,
  ReadLineageOptions,
  RecordExportParams,
} from './lineageStorage.js';

// Route
export { lineageRouter } from './lineageRoute.js';
