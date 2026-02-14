/**
 * generateFactoryChecklist.ts - Factory Acceptance Checklist Generator
 *
 * Produces audit-ready checklist from verified manifest chain.
 *
 * CHECKLIST CONTAINS:
 * - Chain verification status
 * - Gate validation summary
 * - Collision summary
 * - Export artifact hashes
 * - Key IDs used for signatures
 *
 * PURPOSE:
 * - Factory can verify job integrity before manufacturing
 * - Auditors can trace every export to approved state
 * - QC can review gate issues and collision status
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import { verifyChain } from '../trust/verifyManifestChain';

// ============================================
// CHECKLIST TYPES
// ============================================

/**
 * Factory acceptance checklist version
 */
export type ChecklistVersion = '1.0';

/**
 * Per-cabinet error summary
 */
export interface CabinetErrorSummary {
  id: string;
  codes: string[];
}

/**
 * Gate summary for checklist
 */
export interface ChecklistGateSummary {
  ok: boolean;
  perCabinetErrors: CabinetErrorSummary[];
  warningsCount: number;
}

/**
 * Collision summary for checklist
 */
export interface ChecklistCollisionSummary {
  blocked: boolean;
  pairCount: number;
  worstPenetrationMm?: number;
  worstGapMm?: number;
}

/**
 * Export summary for checklist
 */
export interface ChecklistExportSummary {
  kind: string;
  filename: string;
  hash: string;
  sizeBytes?: number;
  createdIso?: string;
}

/**
 * Chain verification summary
 */
export interface ChecklistVerificationSummary {
  chainOk: boolean;
  reason?: string;
  chainLength?: number;
  keyIdApproval?: string;
  keyIdManifest?: string;
  genesisHashHex?: string;
}

/**
 * Factory acceptance checklist
 */
export interface FactoryAcceptanceChecklist {
  version: ChecklistVersion;
  jobId: string;
  headHash: string;
  generatedIso: string;

  verification: ChecklistVerificationSummary;
  gate: ChecklistGateSummary;
  collision: ChecklistCollisionSummary;
  exports: ChecklistExportSummary[];

  // Raw trust data for deep inspection
  rawTrustTimestamp?: string;
  rawTrustInputHash?: string;
}

// ============================================
// GENERATOR
// ============================================

/**
 * Generate factory acceptance checklist from manifest chain
 *
 * @param args.jobId - Job identifier
 * @param args.store - Manifest store
 * @param args.keyring - Keyring for verification
 * @param args.maxDepth - Maximum chain depth
 * @returns Checklist or error
 */
export async function generateFactoryChecklist(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  maxDepth?: number;
}): Promise<
  | { ok: true; checklist: FactoryAcceptanceChecklist }
  | { ok: false; reason: string }
> {
  const { jobId, store, keyring, maxDepth = 25 } = args;

  // 1. Load HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No HEAD manifest for job' };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: 'HEAD manifest missing from store' };
  }

  // 2. Verify chain
  const chainResult = await verifyChain({ head, keyring, store, maxDepth });

  // 3. Extract trust data
  const trust = head.signedTrust?.trust;
  const gateOk = !!trust?.gate?.ok;

  // 4. Build per-cabinet errors
  const perCabinetErrors: CabinetErrorSummary[] = [];
  if (trust?.gate?.perCabinet) {
    for (const pc of trust.gate.perCabinet) {
      if (!pc.ok) {
        const errorCodes = pc.issues
          .filter((i) => i.severity === 'ERROR')
          .map((i) => i.code);
        if (errorCodes.length > 0) {
          perCabinetErrors.push({ id: pc.id, codes: errorCodes });
        }
      }
    }
  }

  // 5. Count warnings
  let warningsCount = 0;
  if (trust?.gate?.perCabinet) {
    for (const pc of trust.gate.perCabinet) {
      warningsCount += pc.issues.filter((i) => i.severity === 'WARNING').length;
    }
  }

  // 6. Build collision summary
  const collision: ChecklistCollisionSummary = {
    blocked: !!trust?.collision?.blocked,
    pairCount: trust?.collision?.pairCount ?? 0,
    worstPenetrationMm: trust?.collision?.worstPenetrationMm,
    worstGapMm: trust?.collision?.worstGapMm,
  };

  // 7. Build export summary
  const exports: ChecklistExportSummary[] = (head.exports ?? []).map((e) => ({
    kind: e.kind,
    filename: e.filename,
    hash: e.contentHashHex,
    sizeBytes: e.sizeBytes,
    createdIso: e.createdIso,
  }));

  // 8. Build checklist
  const checklist: FactoryAcceptanceChecklist = {
    version: '1.0',
    jobId,
    headHash,
    generatedIso: new Date().toISOString(),

    verification: {
      chainOk: chainResult.ok,
      reason: chainResult.ok ? undefined : chainResult.reason,
      chainLength: chainResult.chainLength,
      keyIdApproval: head.signedTrust?.keyId,
      keyIdManifest: head.manifestKeyId,
      genesisHashHex: chainResult.genesisHashHex,
    },

    gate: {
      ok: gateOk,
      perCabinetErrors,
      warningsCount,
    },

    collision,
    exports,

    rawTrustTimestamp: trust?.timestampIso,
    rawTrustInputHash: trust?.inputsHash,
  };

  return { ok: true, checklist };
}

// ============================================
// CHECKLIST STATUS
// ============================================

/**
 * Overall status from checklist
 */
export type ChecklistStatus = 'APPROVED' | 'BLOCKED' | 'INVALID';

/**
 * Get overall status from checklist
 */
export function getChecklistStatus(checklist: FactoryAcceptanceChecklist): ChecklistStatus {
  if (!checklist.verification.chainOk) {
    return 'INVALID';
  }

  if (!checklist.gate.ok || checklist.collision.blocked) {
    return 'BLOCKED';
  }

  return 'APPROVED';
}

/**
 * Get blocking reasons from checklist
 */
export function getBlockingReasons(checklist: FactoryAcceptanceChecklist): string[] {
  const reasons: string[] = [];

  if (!checklist.verification.chainOk) {
    reasons.push(`Chain verification failed: ${checklist.verification.reason}`);
  }

  if (!checklist.gate.ok) {
    const errorCount = checklist.gate.perCabinetErrors.reduce(
      (sum, e) => sum + e.codes.length,
      0
    );
    reasons.push(`Gate has ${errorCount} errors`);
  }

  if (checklist.collision.blocked) {
    reasons.push(`Collision blocked: ${checklist.collision.pairCount} pairs`);
  }

  return reasons;
}

// ============================================
// FORMATTING
// ============================================

/**
 * Format checklist as readable text
 */
export function formatChecklistText(checklist: FactoryAcceptanceChecklist): string {
  const status = getChecklistStatus(checklist);
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('   FACTORY ACCEPTANCE CHECKLIST');
  lines.push('═══════════════════════════════════════════');
  lines.push('');
  lines.push(`Job ID:     ${checklist.jobId}`);
  lines.push(`HEAD Hash:  ${checklist.headHash.slice(0, 16)}...`);
  lines.push(`Generated:  ${checklist.generatedIso}`);
  lines.push(`Status:     ${status}`);
  lines.push('');

  lines.push('─────────────────────────────────────────');
  lines.push('CHAIN VERIFICATION');
  lines.push('─────────────────────────────────────────');
  lines.push(`Chain OK:    ${checklist.verification.chainOk ? 'YES' : 'NO'}`);
  if (!checklist.verification.chainOk) {
    lines.push(`Reason:      ${checklist.verification.reason}`);
  }
  lines.push(`Chain Len:   ${checklist.verification.chainLength ?? 'N/A'}`);
  lines.push(`Approval Key: ${checklist.verification.keyIdApproval ?? 'N/A'}`);
  lines.push(`Manifest Key: ${checklist.verification.keyIdManifest ?? 'N/A'}`);
  lines.push('');

  lines.push('─────────────────────────────────────────');
  lines.push('GATE VALIDATION');
  lines.push('─────────────────────────────────────────');
  lines.push(`Gate OK:     ${checklist.gate.ok ? 'YES' : 'NO'}`);
  lines.push(`Warnings:    ${checklist.gate.warningsCount}`);

  if (checklist.gate.perCabinetErrors.length > 0) {
    lines.push('Per-Cabinet Errors:');
    for (const e of checklist.gate.perCabinetErrors) {
      lines.push(`  - ${e.id}: ${e.codes.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('─────────────────────────────────────────');
  lines.push('COLLISION');
  lines.push('─────────────────────────────────────────');
  lines.push(`Blocked:     ${checklist.collision.blocked ? 'YES' : 'NO'}`);
  lines.push(`Pairs:       ${checklist.collision.pairCount}`);
  if (checklist.collision.worstPenetrationMm !== undefined) {
    lines.push(`Worst Pen:   ${checklist.collision.worstPenetrationMm.toFixed(2)} mm`);
  }
  if (checklist.collision.worstGapMm !== undefined) {
    lines.push(`Worst Gap:   ${checklist.collision.worstGapMm.toFixed(2)} mm`);
  }
  lines.push('');

  lines.push('─────────────────────────────────────────');
  lines.push('EXPORTS');
  lines.push('─────────────────────────────────────────');
  if (checklist.exports.length === 0) {
    lines.push('(no exports recorded)');
  } else {
    for (const e of checklist.exports) {
      lines.push(`[${e.kind}] ${e.filename}`);
      lines.push(`  Hash: ${e.hash.slice(0, 32)}...`);
      if (e.sizeBytes) {
        lines.push(`  Size: ${e.sizeBytes} bytes`);
      }
    }
  }
  lines.push('');

  lines.push('═══════════════════════════════════════════');

  return lines.join('\n');
}
