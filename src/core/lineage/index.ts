/**
 * Lineage Module - P9 Spec Lineage Anchor
 *
 * Cryptographic chain-of-custody for job artifacts
 */

// Types
export type {
  SpecLineageEventType,
  ChangeClass,
  LineageActor,
  LineageRevision,
  LineageExport,
  SpecLineageEvent,
  LineageChain,
  LineageQueryOptions,
  LineageGraphNode,
  LineageGraph,
  LineageWriteResult,
  LineageReadResult,
} from './lineageTypes';

// Writer
export {
  buildLineageEvent,
  appendLineageEvent,
  recordSpecFrozen,
  recordSpecReleased,
  recordSpecRevoked,
  recordExportLink,
  __clearLineage_TESTING_ONLY,
} from './lineageWriter';
export type { BuildLineageEventParams } from './lineageWriter';

// Reader
export {
  loadLineage,
  queryLineage,
  buildLineageGraph,
  getAncestors,
  getDescendants,
  getRevisionEvents,
  getLatestEvent,
  getHeadRevisionId,
  getLineageStats,
  exportLineageJsonl,
  importLineageJsonl,
} from './lineageReader';
