/**
 * buildIssuePackFromReceipt.ts - Build Issue Pack from Rejected Receipt
 *
 * When a factory receipt is REJECTED, an issue pack is created
 * containing one IssueItem per reject reason.
 *
 * @version 1.0.0
 */

import type { IssuePack, IssueItem } from './issueTypes';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';

/**
 * Build an issue pack from a rejected factory receipt
 *
 * Each reject reason becomes an IssueItem with:
 * - severity from the reason
 * - status = OPEN
 * - title/description from the reason code/message
 */
export async function buildIssuePackFromRejectedReceipt(args: {
  revisionJobId: string;
  parentReleaseHashHex: string;
  signedReceipt: SignedFactoryReceipt;
}): Promise<IssuePack> {
  const { revisionJobId, parentReleaseHashHex, signedReceipt } = args;
  const receipt = signedReceipt.receipt;
  const nowIso = new Date().toISOString();

  // Generate issue items from reject reasons
  const items: IssueItem[] = (receipt.rejectReasons ?? []).map((reason, index) => ({
    id: `ISS_${signedReceipt.receiptHashHex.slice(0, 8)}_${index}`,
    severity: reason.severity === 'WARNING' ? 'WARNING' : 'ERROR',
    status: 'OPEN',
    title: reason.code,
    description: reason.message,
    note: `From factory receipt: ${signedReceipt.receiptHashHex.slice(0, 16)}`,
    createdIso: nowIso,
  }));

  // If no reject reasons, create a generic issue
  if (items.length === 0) {
    items.push({
      id: `ISS_${signedReceipt.receiptHashHex.slice(0, 8)}_0`,
      severity: 'ERROR',
      status: 'OPEN',
      title: 'FACTORY_REJECTED',
      description: receipt.note ?? 'Factory rejected without specific reasons',
      createdIso: nowIso,
    });
  }

  return {
    id: `PACK_${signedReceipt.receiptHashHex.slice(0, 12)}`,
    revision: revisionJobId,
    items,
    createdIso: nowIso,
  };
}
