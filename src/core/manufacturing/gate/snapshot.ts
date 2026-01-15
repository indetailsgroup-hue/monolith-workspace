/**
 * Freeze Snapshot - Immutable Manufacturing Contract
 *
 * When designer clicks "Freeze", we create a snapshot that:
 * - Records the exact state of intents + opGraph
 * - Generates a hash for verification
 * - Provides provenance for audit trail
 *
 * v1.0: Initial freeze snapshot
 */

import type { GateReport, CabinetGateReport } from './types';
import type { DesignIntent } from '../../modeling/types';

/**
 * Frozen snapshot for a single panel.
 */
export interface FrozenSnapshot {
  /** Unique snapshot ID */
  snapshotId: string;
  /** ISO timestamp */
  createdAt: string;
  /** Panel ID */
  panelId: string;
  /** Content hash (FNV-1a for MVP, SHA-256 for production) */
  hash: string;
  /** Gate report at freeze time */
  gate: GateReport;
  /** Frozen intents (immutable copy) */
  intents: DesignIntent[];
}

/**
 * Cabinet-level frozen snapshot.
 */
export interface CabinetFrozenSnapshot {
  /** Unique snapshot ID */
  snapshotId: string;
  /** ISO timestamp */
  createdAt: string;
  /** Cabinet ID */
  cabinetId: string;
  /** Combined hash of all panels */
  hash: string;
  /** Per-panel snapshots */
  panels: Map<string, FrozenSnapshot>;
  /** Cabinet gate report */
  gate: CabinetGateReport;
}

/**
 * FNV-1a hash (fast, non-cryptographic).
 * Good for development; use SHA-256 for production.
 */
function fnv1aHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generate unique snapshot ID.
 */
function generateSnapshotId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `snap_${ts}_${rand}`;
}

/**
 * Create frozen snapshot for a panel.
 */
export function createFrozenSnapshot(input: {
  panelId: string;
  gate: GateReport;
  intents: DesignIntent[];
}): FrozenSnapshot {
  // Create deterministic string for hashing
  const content = JSON.stringify({
    panelId: input.panelId,
    intents: input.intents,
    opGraph: input.gate.opGraph,
  });

  const hash = fnv1aHash(content);

  return {
    snapshotId: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    panelId: input.panelId,
    hash,
    gate: input.gate,
    intents: JSON.parse(JSON.stringify(input.intents)), // Deep clone
  };
}

/**
 * Create cabinet-level frozen snapshot.
 */
export function createCabinetFrozenSnapshot(input: {
  cabinetId: string;
  gate: CabinetGateReport;
  intents: DesignIntent[];
  panelIds: string[];
}): CabinetFrozenSnapshot {
  const panels = new Map<string, FrozenSnapshot>();
  const hashes: string[] = [];

  for (const panelId of input.panelIds) {
    const panelGate = input.gate.panels.get(panelId);
    if (panelGate) {
      const panelIntents = input.intents.filter(
        (i) => i.target.panelId === panelId
      );
      const snapshot = createFrozenSnapshot({
        panelId,
        gate: panelGate,
        intents: panelIntents,
      });
      panels.set(panelId, snapshot);
      hashes.push(snapshot.hash);
    }
  }

  // Combined hash
  const combinedHash = fnv1aHash(hashes.join(':'));

  return {
    snapshotId: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    cabinetId: input.cabinetId,
    hash: combinedHash,
    panels,
    gate: input.gate,
  };
}

/**
 * Verify snapshot integrity.
 */
export function verifySnapshot(
  snapshot: FrozenSnapshot,
  currentIntents: DesignIntent[]
): { valid: boolean; reason?: string } {
  // Recalculate hash
  const content = JSON.stringify({
    panelId: snapshot.panelId,
    intents: snapshot.intents,
    opGraph: snapshot.gate.opGraph,
  });

  const currentHash = fnv1aHash(content);

  if (currentHash !== snapshot.hash) {
    return {
      valid: false,
      reason: `Hash mismatch: expected ${snapshot.hash}, got ${currentHash}`,
    };
  }

  // Check if current intents match frozen intents
  const panelIntents = currentIntents.filter(
    (i) => i.target.panelId === snapshot.panelId
  );

  if (panelIntents.length !== snapshot.intents.length) {
    return {
      valid: false,
      reason: `Intent count mismatch: frozen ${snapshot.intents.length}, current ${panelIntents.length}`,
    };
  }

  return { valid: true };
}

/**
 * Export snapshot as JSON for storage/audit.
 */
export function exportSnapshot(snapshot: FrozenSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Import snapshot from JSON.
 */
export function importSnapshot(json: string): FrozenSnapshot {
  return JSON.parse(json);
}
