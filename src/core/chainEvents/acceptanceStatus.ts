/**
 * acceptanceStatus.ts - Derive Acceptance Status from Chain
 *
 * ARCHITECTURE:
 * - Analyze chain events to determine overall acceptance status
 * - Status represents where the job is in the factory workflow
 *
 * STATUS DEFINITIONS:
 * - DRAFT: Still being designed, not ready for factory
 * - FROZEN: Locked for review, not yet released
 * - READY_FOR_FACTORY: Released, awaiting factory receipt
 * - ACCEPTED: Factory signed acceptance receipt
 * - REJECTED: Factory signed rejection receipt
 * - PARTIALLY_ACCEPTED: Some receipts accepted, some rejected
 */

import type { ChainEvent } from './chainEventTypes';
import type { SpecState } from '../spec/specState';
import type { FactoryVerdict } from '../receipt/factoryReceiptTypes';

// ============================================
// ACCEPTANCE STATUS
// ============================================

/**
 * Overall acceptance status for a job
 */
export type AcceptanceStatus =
  | 'DRAFT'
  | 'FROZEN'
  | 'READY_FOR_FACTORY'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PARTIALLY_ACCEPTED';

/**
 * Detailed acceptance info
 */
export interface AcceptanceInfo {
  /** Overall status */
  status: AcceptanceStatus;

  /** Current spec state */
  specState: SpecState;

  /** Whether released */
  isReleased: boolean;

  /** Whether has factory receipts */
  hasReceipts: boolean;

  /** Receipt counts by verdict */
  receiptCounts: {
    accepted: number;
    rejected: number;
    total: number;
  };

  /** Latest receipt verdict (if any) */
  latestVerdict?: FactoryVerdict;

  /** Latest receipt timestamp */
  latestReceiptIso?: string;

  /** Rejection reasons (if rejected) */
  rejectReasons?: string[];

  /** Status message */
  message: string;

  /** Status color (Tailwind) */
  color: string;

  /** Status icon */
  icon: string;
}

// ============================================
// DERIVE ACCEPTANCE STATUS
// ============================================

/**
 * Derive acceptance status from chain events
 *
 * @param events - Chain events (newest first)
 * @returns AcceptanceInfo with status and details
 */
export function deriveAcceptanceStatus(events: ChainEvent[]): AcceptanceInfo {
  if (events.length === 0) {
    return createDraftStatus();
  }

  // Get HEAD event (newest)
  const head = events[0];
  const specState = head.specState;

  // Count receipts by verdict
  const receiptEvents = events.filter((e) => e.kind === 'FACTORY_RECEIPT' && e.receipt);
  const acceptedCount = receiptEvents.filter(
    (e) => e.receipt?.receipt.verdict === 'ACCEPTED'
  ).length;
  const rejectedCount = receiptEvents.filter(
    (e) => e.receipt?.receipt.verdict === 'REJECTED'
  ).length;
  const totalReceipts = receiptEvents.length;

  // Get latest receipt
  const latestReceiptEvent = receiptEvents[0];
  const latestReceipt = latestReceiptEvent?.receipt;

  // Determine status based on state and receipts
  let status: AcceptanceStatus;
  let message: string;
  let color: string;
  let icon: string;

  if (specState === 'DRAFT') {
    status = 'DRAFT';
    message = 'Design in progress';
    color = 'text-gray-400';
    icon = '✏️';
  } else if (specState === 'FROZEN') {
    status = 'FROZEN';
    message = 'Locked for review';
    color = 'text-cyan-400';
    icon = '❄️';
  } else if (specState === 'RELEASED') {
    if (totalReceipts === 0) {
      status = 'READY_FOR_FACTORY';
      message = 'Released, awaiting factory acceptance';
      color = 'text-amber-400';
      icon = '📦';
    } else if (rejectedCount > 0 && acceptedCount === 0) {
      status = 'REJECTED';
      message = `Rejected by factory (${rejectedCount} rejection${rejectedCount > 1 ? 's' : ''})`;
      color = 'text-red-400';
      icon = '❌';
    } else if (acceptedCount > 0 && rejectedCount === 0) {
      status = 'ACCEPTED';
      message = `Accepted by factory (${acceptedCount} receipt${acceptedCount > 1 ? 's' : ''})`;
      color = 'text-green-400';
      icon = '✓';
    } else {
      status = 'PARTIALLY_ACCEPTED';
      message = `Mixed: ${acceptedCount} accepted, ${rejectedCount} rejected`;
      color = 'text-orange-400';
      icon = '⚠️';
    }
  } else {
    // Fallback
    status = 'DRAFT';
    message = 'Unknown state';
    color = 'text-gray-400';
    icon = '?';
  }

  // Collect rejection reasons
  const rejectReasons: string[] = [];
  for (const e of receiptEvents) {
    if (e.receipt?.receipt.verdict === 'REJECTED' && e.receipt.receipt.rejectReasons) {
      rejectReasons.push(...e.receipt.receipt.rejectReasons);
    }
  }

  return {
    status,
    specState,
    isReleased: specState === 'RELEASED',
    hasReceipts: totalReceipts > 0,
    receiptCounts: {
      accepted: acceptedCount,
      rejected: rejectedCount,
      total: totalReceipts,
    },
    latestVerdict: latestReceipt?.receipt.verdict,
    latestReceiptIso: latestReceipt?.receipt.acceptedAtIso,
    rejectReasons: rejectReasons.length > 0 ? rejectReasons : undefined,
    message,
    color,
    icon,
  };
}

// ============================================
// STATUS HELPERS
// ============================================

/**
 * Create default DRAFT status
 */
function createDraftStatus(): AcceptanceInfo {
  return {
    status: 'DRAFT',
    specState: 'DRAFT',
    isReleased: false,
    hasReceipts: false,
    receiptCounts: { accepted: 0, rejected: 0, total: 0 },
    message: 'No manifests in chain',
    color: 'text-gray-400',
    icon: '✏️',
  };
}

/**
 * Check if status allows further factory receipts
 */
export function canAddReceipt(status: AcceptanceStatus): boolean {
  return status === 'READY_FOR_FACTORY' || status === 'PARTIALLY_ACCEPTED';
}

/**
 * Check if status indicates factory workflow is complete
 */
export function isFactoryComplete(status: AcceptanceStatus): boolean {
  return status === 'ACCEPTED' || status === 'REJECTED';
}

/**
 * Get status severity for sorting (higher = more severe)
 */
export function getStatusSeverity(status: AcceptanceStatus): number {
  switch (status) {
    case 'REJECTED':
      return 100;
    case 'PARTIALLY_ACCEPTED':
      return 80;
    case 'ACCEPTED':
      return 60;
    case 'READY_FOR_FACTORY':
      return 40;
    case 'FROZEN':
      return 30;
    case 'DRAFT':
      return 20;
  }
}

/**
 * Get status badge variant
 */
export function getStatusBadge(status: AcceptanceStatus): {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'info' | 'default';
} {
  switch (status) {
    case 'ACCEPTED':
      return { label: 'Accepted', variant: 'success' };
    case 'REJECTED':
      return { label: 'Rejected', variant: 'error' };
    case 'PARTIALLY_ACCEPTED':
      return { label: 'Partial', variant: 'warning' };
    case 'READY_FOR_FACTORY':
      return { label: 'Ready', variant: 'info' };
    case 'FROZEN':
      return { label: 'Frozen', variant: 'info' };
    case 'DRAFT':
      return { label: 'Draft', variant: 'default' };
  }
}
