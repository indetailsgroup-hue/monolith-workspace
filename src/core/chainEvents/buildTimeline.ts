/**
 * buildTimeline.ts - Build Acceptance Timeline
 *
 * Converts a manifest chain into a human-readable timeline
 * of events (approvals, freezes, releases, exports, receipts).
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';

// ============================================
// TYPES
// ============================================

/**
 * Timeline event type
 */
export type TimelineEventType =
  | 'GENESIS'
  | 'APPROVAL'
  | 'FREEZE'
  | 'RELEASE'
  | 'UNFREEZE'
  | 'EXPORT'
  | 'FACTORY_RECEIPT'
  | 'REVISION_FORK'
  | 'ISSUE_UPDATE';

/**
 * Single timeline event
 */
export interface TimelineEvent {
  /** Event type */
  type: TimelineEventType;
  /** Event timestamp */
  timestamp: string;
  /** Manifest hash that produced this event */
  manifestHashHex: string;
  /** Human-readable summary */
  summary: string;
  /** Additional data */
  details?: Record<string, unknown>;
}

/**
 * Acceptance status derived from timeline
 */
export interface AcceptanceStatus {
  /** Current spec state */
  specState: 'DRAFT' | 'FROZEN' | 'RELEASED';
  /** Last factory verdict */
  lastVerdict?: 'ACCEPTED' | 'REJECTED';
  /** Whether there are unresolved issues */
  hasBlockingIssues: boolean;
}

/**
 * Timeline milestone
 */
export interface Milestone {
  /** Milestone name */
  name: string;
  /** Whether reached */
  reached: boolean;
  /** When reached */
  timestamp?: string;
}

/**
 * Complete acceptance timeline
 */
export interface AcceptanceTimeline {
  /** Job ID */
  jobId: string;
  /** All events in chronological order */
  events: TimelineEvent[];
  /** Current acceptance status */
  acceptance: AcceptanceStatus;
  /** Key milestones */
  milestones: Milestone[];
  /** Summary statistics */
  summary?: {
    totalManifests: number;
    totalReceipts: number;
    totalExports: number;
  };
}

// ============================================
// BUILD TIMELINE
// ============================================

/**
 * Build an acceptance timeline from a manifest chain
 *
 * @param chain - Manifests in chronological order (genesis first)
 * @param jobId - Job ID
 */
export function buildTimeline(
  chain: SignedJobManifest[],
  jobId: string
): AcceptanceTimeline {
  const events: TimelineEvent[] = [];
  let prevSpecState: string | undefined;

  for (let i = 0; i < chain.length; i++) {
    const manifest = chain[i];
    const timestamp = manifest.createdIso;

    // Genesis event
    if (i === 0 && manifest.prevManifestHashHex === null) {
      events.push({
        type: 'GENESIS',
        timestamp,
        manifestHashHex: manifest.manifestHashHex,
        summary: 'Job created',
      });
    }

    // Spec state changes
    const specState = manifest.signedTrust?.trust?.spec?.state;
    if (specState && specState !== prevSpecState) {
      if (specState === 'FROZEN') {
        events.push({
          type: 'FREEZE',
          timestamp,
          manifestHashHex: manifest.manifestHashHex,
          summary: 'Spec frozen for review',
        });
      } else if (specState === 'RELEASED') {
        events.push({
          type: 'RELEASE',
          timestamp,
          manifestHashHex: manifest.manifestHashHex,
          summary: 'Spec released for factory',
        });
      } else if (specState === 'DRAFT' && prevSpecState === 'FROZEN') {
        events.push({
          type: 'UNFREEZE',
          timestamp,
          manifestHashHex: manifest.manifestHashHex,
          summary: 'Spec unfrozen for edits',
        });
      }
      prevSpecState = specState;
    }

    // Approval events (non-genesis commits)
    if (i > 0 && manifest.signedTrust && !manifest.revision) {
      const trust = manifest.signedTrust.trust;
      if (trust.selectionIds.length > 0) {
        events.push({
          type: 'APPROVAL',
          timestamp: manifest.signedTrust.timestampIso,
          manifestHashHex: manifest.manifestHashHex,
          summary: `State approved: ${trust.selectionIds.length} cabinet(s)`,
        });
      }
    }

    // Export events
    if (manifest.exports && manifest.exports.length > 0) {
      const prevExports = i > 0 ? (chain[i - 1].exports?.length ?? 0) : 0;
      if (manifest.exports.length > prevExports) {
        events.push({
          type: 'EXPORT',
          timestamp,
          manifestHashHex: manifest.manifestHashHex,
          summary: `Export bundle created (${manifest.exports.length} artifact(s))`,
        });
      }
    }

    // Receipt events
    if (manifest.receipts && manifest.receipts.length > 0) {
      const prevReceipts = i > 0 ? (chain[i - 1].receipts?.length ?? 0) : 0;
      for (let r = prevReceipts; r < manifest.receipts.length; r++) {
        const receipt = manifest.receipts[r];
        events.push({
          type: 'FACTORY_RECEIPT',
          timestamp: receipt.receipt.acceptedAtIso ?? timestamp,
          manifestHashHex: manifest.manifestHashHex,
          summary: `Factory ${receipt.receipt.verdict}: ${receipt.receipt.stationId ?? 'unknown station'}`,
          details: {
            verdict: receipt.receipt.verdict,
            stationId: receipt.receipt.stationId,
            receiptHash: receipt.receiptHashHex,
          },
        });
      }
    }

    // Revision fork events
    if (manifest.revision) {
      events.push({
        type: 'REVISION_FORK',
        timestamp,
        manifestHashHex: manifest.manifestHashHex,
        summary: `Revision ${manifest.revision.revisionNumber}: ${manifest.revision.reason}`,
        details: {
          revisionNumber: manifest.revision.revisionNumber,
          forkedFromJobId: manifest.revision.forkedFromJobId,
        },
      });
    }
  }

  // Derive acceptance status from last manifest
  const last = chain[chain.length - 1];
  const specState = (last?.signedTrust?.trust?.spec?.state ?? 'DRAFT') as 'DRAFT' | 'FROZEN' | 'RELEASED';

  const lastReceipt = last?.receipts?.[last.receipts.length - 1];
  const lastVerdict = lastReceipt?.receipt?.verdict as 'ACCEPTED' | 'REJECTED' | undefined;

  const allIssues = (last?.issuePacks ?? []).flatMap((p) => p.items);
  const hasBlockingIssues = allIssues.some(
    (i) => i.severity === 'ERROR' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')
  );

  // Build milestones
  const milestones: Milestone[] = [
    {
      name: 'Created',
      reached: chain.length > 0,
      timestamp: chain[0]?.createdIso,
    },
    {
      name: 'Frozen',
      reached: events.some((e) => e.type === 'FREEZE'),
      timestamp: events.find((e) => e.type === 'FREEZE')?.timestamp,
    },
    {
      name: 'Released',
      reached: events.some((e) => e.type === 'RELEASE'),
      timestamp: events.find((e) => e.type === 'RELEASE')?.timestamp,
    },
    {
      name: 'Exported',
      reached: events.some((e) => e.type === 'EXPORT'),
      timestamp: events.find((e) => e.type === 'EXPORT')?.timestamp,
    },
    {
      name: 'Factory Accepted',
      reached: events.some(
        (e) => e.type === 'FACTORY_RECEIPT' && (e.details as { verdict?: string })?.verdict === 'ACCEPTED'
      ),
      timestamp: events.find(
        (e) => e.type === 'FACTORY_RECEIPT' && (e.details as { verdict?: string })?.verdict === 'ACCEPTED'
      )?.timestamp,
    },
  ];

  return {
    jobId,
    events,
    acceptance: {
      specState,
      lastVerdict,
      hasBlockingIssues,
    },
    milestones,
  };
}
