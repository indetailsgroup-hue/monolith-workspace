/**
 * classifyManifest.ts - Classify Manifest into Chain Event
 *
 * ARCHITECTURE:
 * - Compare current manifest with previous to determine event kind
 * - Extract relevant metadata for timeline display
 * - Handle edge cases (genesis, unknown states)
 *
 * CLASSIFICATION RULES:
 * 1. GENESIS: prevManifestHashHex is null
 * 2. FREEZE: specState changed to FROZEN
 * 3. UNFREEZE: specState changed from FROZEN to DRAFT
 * 4. RELEASE: specState changed to RELEASED
 * 5. EXPORT: exports count increased
 * 6. FACTORY_RECEIPT: receipts count increased
 * 7. APPROVAL_COMMIT: geometry/param changes in DRAFT state
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { ChainEvent, ChainEventKind } from './chainEventTypes';
import type { SpecState } from '../spec/specState';

// ============================================
// CLASSIFY SINGLE MANIFEST
// ============================================

/**
 * Classify a manifest by comparing with its predecessor
 *
 * @param current - Current manifest
 * @param prev - Previous manifest (null for genesis)
 * @returns ChainEvent with classified kind
 */
export function classifyManifest(
  current: SignedJobManifest,
  prev: SignedJobManifest | null
): ChainEvent {
  const trust = current.signedTrust?.trust;
  const prevTrust = prev?.signedTrust?.trust;

  // Extract spec states
  const specState: SpecState = trust?.spec?.state ?? 'DRAFT';
  const prevSpecState: SpecState = prevTrust?.spec?.state ?? 'DRAFT';

  // Extract counts
  const exportsCount = current.exports?.length ?? 0;
  const prevExportsCount = prev?.exports?.length ?? 0;

  const receiptsCount = current.receipts?.length ?? 0;
  const prevReceiptsCount = prev?.receipts?.length ?? 0;

  // Extract gate/collision status
  const gateOk = !!trust?.gate?.ok;
  const collisionBlocked = !!trust?.collision?.blocked;

  // Determine event kind
  const kind = determineEventKind({
    isGenesis: current.prevManifestHashHex === null,
    specState,
    prevSpecState,
    exportsCount,
    prevExportsCount,
    receiptsCount,
    prevReceiptsCount,
  });

  // Extract receipt if this is a FACTORY_RECEIPT event
  const receipt =
    kind === 'FACTORY_RECEIPT' && current.receipts && current.receipts.length > 0
      ? current.receipts[current.receipts.length - 1]
      : undefined;

  return {
    kind,
    manifestHashHex: current.manifestHashHex,
    prevHashHex: current.prevManifestHashHex,
    timestampIso: trust?.timestampIso ?? current.createdIso ?? new Date().toISOString(),
    specState,
    exportsCount,
    receiptsCount,
    gateOk,
    collisionBlocked,
    snapshotHashHex: trust?.snapshotHashHex,
    receipt,
    manifestKeyId: current.manifestKeyId,
    createdBy: current.createdBy,
  };
}

// ============================================
// EVENT KIND DETERMINATION
// ============================================

interface DetermineKindArgs {
  isGenesis: boolean;
  specState: SpecState;
  prevSpecState: SpecState;
  exportsCount: number;
  prevExportsCount: number;
  receiptsCount: number;
  prevReceiptsCount: number;
}

/**
 * Determine event kind from state changes
 */
function determineEventKind(args: DetermineKindArgs): ChainEventKind {
  const {
    isGenesis,
    specState,
    prevSpecState,
    exportsCount,
    prevExportsCount,
    receiptsCount,
    prevReceiptsCount,
  } = args;

  // 1. Genesis (first manifest)
  if (isGenesis) {
    return 'GENESIS';
  }

  // 2. Factory receipt added
  if (receiptsCount > prevReceiptsCount) {
    return 'FACTORY_RECEIPT';
  }

  // 3. Spec state transitions
  if (specState !== prevSpecState) {
    // DRAFT/FROZEN → RELEASED
    if (specState === 'RELEASED') {
      return 'RELEASE';
    }

    // DRAFT → FROZEN
    if (specState === 'FROZEN' && prevSpecState !== 'FROZEN') {
      return 'FREEZE';
    }

    // FROZEN → DRAFT (unfreeze)
    if (specState === 'DRAFT' && prevSpecState === 'FROZEN') {
      return 'UNFREEZE';
    }
  }

  // 4. Export added (while in same state)
  if (exportsCount > prevExportsCount) {
    return 'EXPORT';
  }

  // 5. Approval commit (geometry/param change in DRAFT)
  if (specState === 'DRAFT') {
    return 'APPROVAL_COMMIT';
  }

  // 6. Unknown (shouldn't happen in normal flow)
  return 'UNKNOWN';
}

// ============================================
// BATCH CLASSIFICATION
// ============================================

/**
 * Classify a chain of manifests into events
 *
 * @param chain - Array of manifests (newest first)
 * @returns Array of ChainEvents (newest first)
 */
export function classifyChain(chain: SignedJobManifest[]): ChainEvent[] {
  if (chain.length === 0) return [];

  const events: ChainEvent[] = [];

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    const prev = i + 1 < chain.length ? chain[i + 1] : null;

    // Use expanded classification for multiple receipts
    const expanded = classifyManifestExpanded(current, prev);
    events.push(...expanded);
  }

  return events;
}

/**
 * Classify a manifest with expanded receipt events
 *
 * When multiple receipts are added in a single manifest,
 * this function emits one FACTORY_RECEIPT event per receipt.
 *
 * @param current - Current manifest
 * @param prev - Previous manifest (null for genesis)
 * @returns Array of ChainEvents (may have multiple receipt events)
 */
export function classifyManifestExpanded(
  current: SignedJobManifest,
  prev: SignedJobManifest | null
): ChainEvent[] {
  const trust = current.signedTrust?.trust;
  const prevTrust = prev?.signedTrust?.trust;

  // Extract spec states
  const specState: SpecState = trust?.spec?.state ?? 'DRAFT';
  const prevSpecState: SpecState = prevTrust?.spec?.state ?? 'DRAFT';

  // Extract counts
  const exportsCount = current.exports?.length ?? 0;
  const prevExportsCount = prev?.exports?.length ?? 0;

  const receiptsCount = current.receipts?.length ?? 0;
  const prevReceiptsCount = prev?.receipts?.length ?? 0;

  // Extract gate/collision status
  const gateOk = !!trust?.gate?.ok;
  const collisionBlocked = !!trust?.collision?.blocked;

  // Base event data
  const baseEvent: Omit<ChainEvent, 'kind' | 'receipt'> = {
    manifestHashHex: current.manifestHashHex,
    prevHashHex: current.prevManifestHashHex,
    timestampIso: trust?.timestampIso ?? current.createdIso ?? new Date().toISOString(),
    specState,
    exportsCount,
    receiptsCount,
    gateOk,
    collisionBlocked,
    snapshotHashHex: trust?.snapshotHashHex,
    manifestKeyId: current.manifestKeyId,
    createdBy: current.createdBy,
  };

  const events: ChainEvent[] = [];

  // 1. Genesis (first manifest)
  if (current.prevManifestHashHex === null) {
    events.push({ kind: 'GENESIS', ...baseEvent });
    return events;
  }

  // 2. Spec state transitions
  if (specState !== prevSpecState) {
    if (specState === 'RELEASED') {
      events.push({ kind: 'RELEASE', ...baseEvent });
    } else if (specState === 'FROZEN' && prevSpecState !== 'FROZEN') {
      events.push({ kind: 'FREEZE', ...baseEvent });
    } else if (specState === 'DRAFT' && prevSpecState === 'FROZEN') {
      events.push({ kind: 'UNFREEZE', ...baseEvent });
    }
  }

  // 3. Export added
  if (exportsCount > prevExportsCount) {
    events.push({ kind: 'EXPORT', ...baseEvent });
  }

  // 4. Factory receipts - emit one event per new receipt
  if (receiptsCount > prevReceiptsCount) {
    const newReceipts = (current.receipts ?? []).slice(prevReceiptsCount);
    for (const receipt of newReceipts) {
      events.push({
        kind: 'FACTORY_RECEIPT',
        ...baseEvent,
        // Use receipt's own timestamp if available
        timestampIso: receipt.receipt.acceptedAtIso ?? baseEvent.timestampIso,
        receipt,
      });
    }
  }

  // 5. If no events emitted, it's an approval commit
  if (events.length === 0) {
    events.push({ kind: 'APPROVAL_COMMIT', ...baseEvent });
  }

  return events;
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if event represents a state change
 */
export function isStateChangeEvent(kind: ChainEventKind): boolean {
  return kind === 'FREEZE' || kind === 'UNFREEZE' || kind === 'RELEASE';
}

/**
 * Check if event is auditable (should be highlighted)
 */
export function isAuditableEvent(kind: ChainEventKind): boolean {
  return kind === 'RELEASE' || kind === 'FACTORY_RECEIPT' || kind === 'FREEZE';
}

/**
 * Get event priority for sorting (higher = more important)
 */
export function getEventPriority(kind: ChainEventKind): number {
  switch (kind) {
    case 'FACTORY_RECEIPT':
      return 100;
    case 'RELEASE':
      return 90;
    case 'FREEZE':
      return 80;
    case 'EXPORT':
      return 70;
    case 'UNFREEZE':
      return 60;
    case 'APPROVAL_COMMIT':
      return 50;
    case 'GENESIS':
      return 40;
    case 'UNKNOWN':
      return 0;
  }
}
