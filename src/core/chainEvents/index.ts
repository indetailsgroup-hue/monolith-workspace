/**
 * chainEvents/index.ts - Chain Events Module
 *
 * Provides timeline and acceptance status for manifest chain.
 */

// Types
export type { ChainEvent, ChainEventKind } from './chainEventTypes';
export { getEventKindLabel, getEventKindColor, getEventKindIcon } from './chainEventTypes';

// Classification
export { classifyManifest, classifyChain } from './classifyManifest';
export { isStateChangeEvent, isAuditableEvent, getEventPriority } from './classifyManifest';

// Acceptance Status
export type { AcceptanceStatus, AcceptanceInfo } from './acceptanceStatus';
export { deriveAcceptanceStatus } from './acceptanceStatus';
export { canAddReceipt, isFactoryComplete, getStatusSeverity, getStatusBadge } from './acceptanceStatus';

// Timeline
export type {
  ChainDiff,
  TimelineEntry,
  AcceptanceTimeline,
  TimelineSummary,
  TimelineMilestone,
} from './buildTimeline';
export { buildTimeline } from './buildTimeline';
export { filterAuditableEvents, filterByKind, getStateChangeEntries } from './buildTimeline';
