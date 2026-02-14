/**
 * buildIssuePackFromReceipt.ts - Build Issue Pack from Rejected Receipt
 *
 * FLOW:
 * 1. Extract rejectReasons from SignedFactoryReceipt
 * 2. Map each reason to canonical IssueRef
 * 3. Create IssueItem for each with deterministic ID
 * 4. Bundle into IssuePack with audit metadata
 *
 * DETERMINISM:
 * - Pack ID is hash of inputs (idempotent)
 * - Issue IDs are hash of pack+index+code (stable)
 * - Same rejection always produces same IssuePack
 */

import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { IssuePack, IssueItem, IssueEvidence } from './issueTypes';
import { makePackId, makeIssueId } from './issueId';
import { mapRejectReasonToIssueRef, createNoReasonIssueRef } from './mapRejectReason';

// ============================================
// BUILDER
// ============================================

/**
 * Build Issue Pack from a rejected factory receipt
 *
 * @param args.revisionJobId - New revision job ID (e.g., "JOB_001__R2")
 * @param args.parentReleaseHashHex - Hash of the release that was rejected
 * @param args.signedReceipt - The signed factory receipt with rejection
 * @returns IssuePack ready to embed in genesis manifest
 */
export async function buildIssuePackFromRejectedReceipt(args: {
  revisionJobId: string;
  parentReleaseHashHex: string;
  signedReceipt: SignedFactoryReceipt;
}): Promise<IssuePack> {
  const receipt = args.signedReceipt.receipt;
  const now = new Date().toISOString();

  // Extract and normalize reasons
  const reasons = (receipt.rejectReasons ?? [])
    .map((x) => (x ?? '').trim())
    .filter(Boolean);

  // Create deterministic pack ID
  const packId = await makePackId({
    revisionJobId: args.revisionJobId,
    parentReleaseHashHex: args.parentReleaseHashHex,
    receiptHashHex: args.signedReceipt.receiptHashHex,
    reasons,
  });

  // Build evidence common to all issues
  const evidence: IssueEvidence = {
    receiptHashHex: args.signedReceipt.receiptHashHex,
    stationId: receipt.stationId,
    inspector: receipt.inspector,
    headManifestHashHex: receipt.headManifestHashHex,
  };

  // Create issue items
  const items: IssueItem[] = [];

  if (reasons.length > 0) {
    // Map each reason to an issue
    for (let i = 0; i < reasons.length; i++) {
      const ref = mapRejectReasonToIssueRef(reasons[i]);
      const id = await makeIssueId({ packId, index: i, code: ref.code });

      items.push({
        id,
        severity: 'ERROR',
        status: 'OPEN',
        createdAtIso: now,
        updatedAtIso: now,
        source: ref,
        evidence,
      });
    }
  } else {
    // No reasons provided - create generic issue
    // This ensures the revision is not silently "ok"
    const ref = createNoReasonIssueRef();
    const id = await makeIssueId({ packId, index: 0, code: ref.code });

    items.push({
      id,
      severity: 'ERROR',
      status: 'OPEN',
      createdAtIso: now,
      updatedAtIso: now,
      source: ref,
      evidence,
    });
  }

  // Build and return pack
  return {
    version: '1.0',
    packId,
    jobId: args.revisionJobId,
    parentReleaseHashHex: args.parentReleaseHashHex,
    createdAtIso: now,
    createdFrom: {
      kind: 'FACTORY_RECEIPT_REJECTION',
      receiptHashHex: args.signedReceipt.receiptHashHex,
      stationId: receipt.stationId,
      inspector: receipt.inspector,
    },
    items,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Count issues by status
 */
export function countIssuesByStatus(pack: IssuePack): Record<string, number> {
  const counts: Record<string, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    WAIVED: 0,
  };

  for (const item of pack.items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }

  return counts;
}

/**
 * Check if pack has blocking issues
 */
export function packHasBlockingIssues(pack: IssuePack): boolean {
  return pack.items.some(
    (item) =>
      item.severity === 'ERROR' &&
      (item.status === 'OPEN' || item.status === 'IN_PROGRESS')
  );
}
