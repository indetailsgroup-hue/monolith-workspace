/**
 * buildTimeline.ts - Build Acceptance Timeline from Chain
 *
 * ARCHITECTURE:
 * - Load manifest chain
 * - Classify each manifest into ChainEvent
 * - Build timeline with diff information
 * - Calculate acceptance status
 *
 * TIMELINE FEATURES:
 * - Events in chronological order (oldest to newest for display)
 * - Diff between consecutive manifests
 * - Summary statistics
 * - Milestone markers
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { ChainEvent, ChainEventKind } from './chainEventTypes';
import { classifyChain, isAuditableEvent } from './classifyManifest';
import { deriveAcceptanceStatus, type AcceptanceInfo } from './acceptanceStatus';

// ============================================
// TIMELINE TYPES
// ============================================

/**
 * Diff between two chain states
 */
export interface ChainDiff {
  /** Spec state changed */
  specStateChanged: boolean;
  prevSpecState?: string;

  /** Exports count changed */
  exportsChanged: boolean;
  exportsDelta: number;

  /** Receipts count changed */
  receiptsChanged: boolean;
  receiptsDelta: number;

  /** Gate status changed */
  gateChanged: boolean;

  /** Collision status changed */
  collisionChanged: boolean;

  /** Snapshot hash changed (geometry/params) */
  snapshotChanged: boolean;
}

/**
 * Timeline entry with event and diff
 */
export interface TimelineEntry {
  /** Chain event */
  event: ChainEvent;

  /** Index in timeline (0 = oldest) */
  index: number;

  /** Is HEAD (newest) */
  isHead: boolean;

  /** Is genesis (oldest) */
  isGenesis: boolean;

  /** Diff from previous manifest */
  diff: ChainDiff | null;

  /** Formatted timestamp */
  formattedTime: string;

  /** Relative time (e.g., "2 hours ago") */
  relativeTime: string;
}

/**
 * Complete timeline with entries and summary
 */
export interface AcceptanceTimeline {
  /** Job ID */
  jobId: string;

  /** Timeline entries (oldest to newest) */
  entries: TimelineEntry[];

  /** Acceptance status */
  acceptance: AcceptanceInfo;

  /** Summary statistics */
  summary: TimelineSummary;

  /** Milestone events */
  milestones: TimelineMilestone[];
}

/**
 * Timeline summary statistics
 */
export interface TimelineSummary {
  /** Total manifest count */
  totalManifests: number;

  /** Event counts by kind */
  eventCounts: Record<ChainEventKind, number>;

  /** Total exports */
  totalExports: number;

  /** Total receipts */
  totalReceipts: number;

  /** Chain start time */
  startedIso: string | null;

  /** Chain end time (HEAD) */
  latestIso: string | null;

  /** Duration in milliseconds */
  durationMs: number | null;
}

/**
 * Timeline milestone (significant event)
 */
export interface TimelineMilestone {
  /** Milestone type */
  type: 'genesis' | 'first_export' | 'freeze' | 'release' | 'first_receipt' | 'accepted' | 'rejected';

  /** Event reference */
  event: ChainEvent;

  /** Milestone label */
  label: string;

  /** Timestamp */
  timestampIso: string;
}

// ============================================
// BUILD TIMELINE
// ============================================

/**
 * Build acceptance timeline from manifest chain
 *
 * @param chain - Manifest chain (newest first)
 * @param jobId - Job identifier
 * @returns Complete timeline
 */
export function buildTimeline(
  chain: SignedJobManifest[],
  jobId: string
): AcceptanceTimeline {
  // Classify chain into events (newest first)
  const events = classifyChain(chain);

  // Reverse for chronological order (oldest first)
  const chronological = [...events].reverse();

  // Build entries with diffs
  const entries: TimelineEntry[] = chronological.map((event, index) => {
    const prevEvent = index > 0 ? chronological[index - 1] : null;

    return {
      event,
      index,
      isHead: index === chronological.length - 1,
      isGenesis: index === 0,
      diff: prevEvent ? computeDiff(prevEvent, event) : null,
      formattedTime: formatTimestamp(event.timestampIso),
      relativeTime: getRelativeTime(event.timestampIso),
    };
  });

  // Derive acceptance status
  const acceptance = deriveAcceptanceStatus(events);

  // Build summary
  const summary = buildSummary(events);

  // Extract milestones
  const milestones = extractMilestones(events);

  return {
    jobId,
    entries,
    acceptance,
    summary,
    milestones,
  };
}

// ============================================
// DIFF COMPUTATION
// ============================================

/**
 * Compute diff between two events
 */
function computeDiff(prev: ChainEvent, current: ChainEvent): ChainDiff {
  return {
    specStateChanged: prev.specState !== current.specState,
    prevSpecState: prev.specState !== current.specState ? prev.specState : undefined,

    exportsChanged: prev.exportsCount !== current.exportsCount,
    exportsDelta: current.exportsCount - prev.exportsCount,

    receiptsChanged: prev.receiptsCount !== current.receiptsCount,
    receiptsDelta: current.receiptsCount - prev.receiptsCount,

    gateChanged: prev.gateOk !== current.gateOk,
    collisionChanged: prev.collisionBlocked !== current.collisionBlocked,

    snapshotChanged: prev.snapshotHashHex !== current.snapshotHashHex,
  };
}

// ============================================
// SUMMARY BUILDER
// ============================================

/**
 * Build timeline summary
 */
function buildSummary(events: ChainEvent[]): TimelineSummary {
  const eventCounts: Record<ChainEventKind, number> = {
    GENESIS: 0,
    APPROVAL_COMMIT: 0,
    FREEZE: 0,
    UNFREEZE: 0,
    RELEASE: 0,
    EXPORT: 0,
    FACTORY_RECEIPT: 0,
    UNKNOWN: 0,
  };

  for (const event of events) {
    eventCounts[event.kind]++;
  }

  const head = events[0];
  const genesis = events[events.length - 1];

  let durationMs: number | null = null;
  if (head && genesis) {
    const headTime = new Date(head.timestampIso).getTime();
    const genesisTime = new Date(genesis.timestampIso).getTime();
    durationMs = headTime - genesisTime;
  }

  return {
    totalManifests: events.length,
    eventCounts,
    totalExports: head?.exportsCount ?? 0,
    totalReceipts: head?.receiptsCount ?? 0,
    startedIso: genesis?.timestampIso ?? null,
    latestIso: head?.timestampIso ?? null,
    durationMs,
  };
}

// ============================================
// MILESTONE EXTRACTION
// ============================================

/**
 * Extract milestone events from chain
 */
function extractMilestones(events: ChainEvent[]): TimelineMilestone[] {
  const milestones: TimelineMilestone[] = [];

  // Track first occurrences
  let firstExport: ChainEvent | null = null;
  let firstReceipt: ChainEvent | null = null;
  let firstFreeze: ChainEvent | null = null;
  let firstRelease: ChainEvent | null = null;
  let firstAccepted: ChainEvent | null = null;
  let firstRejected: ChainEvent | null = null;

  // Scan from oldest to newest
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];

    if (event.kind === 'GENESIS') {
      milestones.push({
        type: 'genesis',
        event,
        label: 'Job Created',
        timestampIso: event.timestampIso,
      });
    }

    if (event.kind === 'EXPORT' && !firstExport) {
      firstExport = event;
      milestones.push({
        type: 'first_export',
        event,
        label: 'First Export',
        timestampIso: event.timestampIso,
      });
    }

    if (event.kind === 'FREEZE' && !firstFreeze) {
      firstFreeze = event;
      milestones.push({
        type: 'freeze',
        event,
        label: 'First Freeze',
        timestampIso: event.timestampIso,
      });
    }

    if (event.kind === 'RELEASE' && !firstRelease) {
      firstRelease = event;
      milestones.push({
        type: 'release',
        event,
        label: 'Released',
        timestampIso: event.timestampIso,
      });
    }

    if (event.kind === 'FACTORY_RECEIPT') {
      if (!firstReceipt) {
        firstReceipt = event;
        milestones.push({
          type: 'first_receipt',
          event,
          label: 'Factory Receipt',
          timestampIso: event.timestampIso,
        });
      }

      if (event.receipt?.receipt.verdict === 'ACCEPTED' && !firstAccepted) {
        firstAccepted = event;
        milestones.push({
          type: 'accepted',
          event,
          label: 'Factory Accepted',
          timestampIso: event.timestampIso,
        });
      }

      if (event.receipt?.receipt.verdict === 'REJECTED' && !firstRejected) {
        firstRejected = event;
        milestones.push({
          type: 'rejected',
          event,
          label: 'Factory Rejected',
          timestampIso: event.timestampIso,
        });
      }
    }
  }

  // Sort by timestamp
  milestones.sort(
    (a, b) => new Date(a.timestampIso).getTime() - new Date(b.timestampIso).getTime()
  );

  return milestones;
}

// ============================================
// FORMATTING HELPERS
// ============================================

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Get relative time string
 */
function getRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  } catch {
    return '';
  }
}

// ============================================
// TIMELINE FILTERS
// ============================================

/**
 * Filter timeline to auditable events only
 */
export function filterAuditableEvents(timeline: AcceptanceTimeline): TimelineEntry[] {
  return timeline.entries.filter((entry) => isAuditableEvent(entry.event.kind));
}

/**
 * Filter timeline by event kind
 */
export function filterByKind(
  timeline: AcceptanceTimeline,
  kinds: ChainEventKind[]
): TimelineEntry[] {
  const kindSet = new Set(kinds);
  return timeline.entries.filter((entry) => kindSet.has(entry.event.kind));
}

/**
 * Get entries with state changes
 */
export function getStateChangeEntries(timeline: AcceptanceTimeline): TimelineEntry[] {
  return timeline.entries.filter((entry) => entry.diff?.specStateChanged);
}
