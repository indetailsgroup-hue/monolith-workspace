/**
 * manifestDiff.ts - Compute Diff Between Manifests
 *
 * Produces human-readable diff between two manifests
 * for Chain Viewer drill-down.
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';

// ============================================
// TYPES
// ============================================

export interface ManifestDiff {
  /** Selection IDs added in current */
  addedSelectionIds: string[];
  /** Selection IDs removed from previous */
  removedSelectionIds: string[];
  /** Gate status change */
  gateOkChanged?: { from: boolean; to: boolean };
  /** Exports added in current */
  exportAdded: Array<{ kind: string; filename: string }>;
  /** Exports removed from previous */
  exportRemoved: Array<{ kind: string; filename: string }>;
  /** Collision status change */
  collisionBlockedChanged?: { from: boolean; to: boolean };
  /** Error count change */
  errorCountChanged?: { from: number; to: number };
  /** Warning count change */
  warningCountChanged?: { from: number; to: number };
}

// ============================================
// HELPERS
// ============================================

function setDiff(prev: string[], curr: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev);
  const currSet = new Set(curr);

  return {
    added: curr.filter((x) => !prevSet.has(x)),
    removed: prev.filter((x) => !currSet.has(x)),
  };
}

function exportKey(e: { kind: string; filename: string }): string {
  return `${e.kind}::${e.filename}`;
}

// ============================================
// DIFF FUNCTION
// ============================================

/**
 * Compute diff between two manifests
 *
 * @param prev - Previous manifest (null for first in chain)
 * @param curr - Current manifest
 * @returns Diff summary
 */
export function diffManifests(
  prev: SignedJobManifest | null,
  curr: SignedJobManifest
): ManifestDiff {
  const prevTrust = prev?.signedTrust?.trust;
  const currTrust = curr?.signedTrust?.trust;

  // Selection diff
  const prevSel = prevTrust?.selectionIds ?? [];
  const currSel = currTrust?.selectionIds ?? [];
  const selDiff = setDiff(prevSel, currSel);

  // Gate status
  const prevGate = !!prevTrust?.gate?.ok;
  const currGate = !!currTrust?.gate?.ok;
  const gateChanged = prev ? prevGate !== currGate : undefined;

  // Exports diff
  const prevExports = prev?.exports ?? [];
  const currExports = curr?.exports ?? [];
  const prevExportKeys = new Set(prevExports.map(exportKey));
  const currExportKeys = new Set(currExports.map(exportKey));

  const exportAdded = currExports
    .filter((e) => !prevExportKeys.has(exportKey(e)))
    .map((e) => ({ kind: e.kind, filename: e.filename }));

  const exportRemoved = prevExports
    .filter((e) => !currExportKeys.has(exportKey(e)))
    .map((e) => ({ kind: e.kind, filename: e.filename }));

  // Collision status
  const prevBlocked = !!prevTrust?.collision?.blocked;
  const currBlocked = !!currTrust?.collision?.blocked;
  const collisionChanged = prev ? prevBlocked !== currBlocked : undefined;

  // Error/warning counts
  const prevErrors = prevTrust?.gate?.errorCount ?? 0;
  const currErrors = currTrust?.gate?.errorCount ?? 0;
  const prevWarnings = prevTrust?.gate?.warningCount ?? 0;
  const currWarnings = currTrust?.gate?.warningCount ?? 0;

  return {
    addedSelectionIds: selDiff.added,
    removedSelectionIds: selDiff.removed,
    gateOkChanged: gateChanged ? { from: prevGate, to: currGate } : undefined,
    exportAdded,
    exportRemoved,
    collisionBlockedChanged: collisionChanged
      ? { from: prevBlocked, to: currBlocked }
      : undefined,
    errorCountChanged:
      prev && prevErrors !== currErrors
        ? { from: prevErrors, to: currErrors }
        : undefined,
    warningCountChanged:
      prev && prevWarnings !== currWarnings
        ? { from: prevWarnings, to: currWarnings }
        : undefined,
  };
}

/**
 * Check if diff has any changes
 */
export function hasDiffChanges(diff: ManifestDiff): boolean {
  return (
    diff.addedSelectionIds.length > 0 ||
    diff.removedSelectionIds.length > 0 ||
    diff.gateOkChanged !== undefined ||
    diff.exportAdded.length > 0 ||
    diff.exportRemoved.length > 0 ||
    diff.collisionBlockedChanged !== undefined ||
    diff.errorCountChanged !== undefined ||
    diff.warningCountChanged !== undefined
  );
}

/**
 * Format diff as summary text
 */
export function formatDiffSummary(diff: ManifestDiff): string {
  const parts: string[] = [];

  if (diff.addedSelectionIds.length > 0) {
    parts.push(`+${diff.addedSelectionIds.length} selected`);
  }
  if (diff.removedSelectionIds.length > 0) {
    parts.push(`-${diff.removedSelectionIds.length} selected`);
  }
  if (diff.gateOkChanged) {
    parts.push(`gate: ${diff.gateOkChanged.from ? 'OK' : 'BLOCKED'} → ${diff.gateOkChanged.to ? 'OK' : 'BLOCKED'}`);
  }
  if (diff.exportAdded.length > 0) {
    parts.push(`+${diff.exportAdded.length} exports`);
  }
  if (diff.collisionBlockedChanged) {
    parts.push(`collision: ${diff.collisionBlockedChanged.to ? 'BLOCKED' : 'OK'}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
