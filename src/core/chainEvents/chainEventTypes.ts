/**
 * chainEventTypes.ts - Chain Event Types for Acceptance Timeline
 *
 * ARCHITECTURE:
 * - ChainEventKind: classifies what happened in each manifest
 * - ChainEvent: normalized event for timeline display
 * - Derived from comparing current manifest with previous
 *
 * EVENT KINDS:
 * - APPROVAL_COMMIT: geometry/param changes (DRAFT state)
 * - FREEZE: spec state changed to FROZEN
 * - RELEASE: spec state changed to RELEASED
 * - EXPORT: new exports added
 * - FACTORY_RECEIPT: factory signed acceptance/rejection
 */

import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { SpecState } from '../spec/specState';

// ============================================
// EVENT KINDS
// ============================================

/**
 * Kind of chain event
 */
export type ChainEventKind =
  | 'GENESIS'
  | 'APPROVAL_COMMIT'
  | 'FREEZE'
  | 'UNFREEZE'
  | 'RELEASE'
  | 'EXPORT'
  | 'FACTORY_RECEIPT'
  | 'UNKNOWN';

// ============================================
// CHAIN EVENT
// ============================================

/**
 * Chain event for timeline display
 *
 * Represents a single event in the manifest chain history.
 */
export interface ChainEvent {
  /** Event kind */
  kind: ChainEventKind;

  /** Manifest hash for this event */
  manifestHashHex: string;

  /** Previous manifest hash (null for genesis) */
  prevHashHex: string | null;

  /** Event timestamp (from trust report) */
  timestampIso: string;

  /** Spec state at this point */
  specState: SpecState;

  /** Number of exports at this point */
  exportsCount: number;

  /** Number of receipts at this point */
  receiptsCount: number;

  /** Gate status at this point */
  gateOk: boolean;

  /** Collision status at this point */
  collisionBlocked: boolean;

  /** Snapshot hash (if available) */
  snapshotHashHex?: string;

  /** Receipt payload (for FACTORY_RECEIPT events) */
  receipt?: SignedFactoryReceipt;

  /** Key ID used for signing (manifest key) */
  manifestKeyId: string;

  /** Created by identifier */
  createdBy?: string;
}

// ============================================
// EVENT HELPERS
// ============================================

/**
 * Get human-readable label for event kind
 */
export function getEventKindLabel(kind: ChainEventKind): string {
  switch (kind) {
    case 'GENESIS':
      return 'Genesis';
    case 'APPROVAL_COMMIT':
      return 'Approval Commit';
    case 'FREEZE':
      return 'Freeze';
    case 'UNFREEZE':
      return 'Unfreeze';
    case 'RELEASE':
      return 'Release';
    case 'EXPORT':
      return 'Export';
    case 'FACTORY_RECEIPT':
      return 'Factory Receipt';
    case 'UNKNOWN':
      return 'Unknown';
  }
}

/**
 * Get color for event kind (Tailwind-compatible)
 */
export function getEventKindColor(kind: ChainEventKind): string {
  switch (kind) {
    case 'GENESIS':
      return 'text-purple-400';
    case 'APPROVAL_COMMIT':
      return 'text-blue-400';
    case 'FREEZE':
      return 'text-cyan-400';
    case 'UNFREEZE':
      return 'text-amber-400';
    case 'RELEASE':
      return 'text-green-400';
    case 'EXPORT':
      return 'text-emerald-400';
    case 'FACTORY_RECEIPT':
      return 'text-lime-400';
    case 'UNKNOWN':
      return 'text-gray-400';
  }
}

/**
 * Get icon for event kind
 */
export function getEventKindIcon(kind: ChainEventKind): string {
  switch (kind) {
    case 'GENESIS':
      return '🌱';
    case 'APPROVAL_COMMIT':
      return '✓';
    case 'FREEZE':
      return '❄️';
    case 'UNFREEZE':
      return '🔓';
    case 'RELEASE':
      return '🚀';
    case 'EXPORT':
      return '📦';
    case 'FACTORY_RECEIPT':
      return '🏭';
    case 'UNKNOWN':
      return '?';
  }
}
