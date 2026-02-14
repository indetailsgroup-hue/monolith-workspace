/**
 * proofService.ts - P12 Authority Proof Bundle Service
 *
 * Assembles proof bundle from authoritative sources:
 * - job.snapshot.json (P10 state)
 * - activity.jsonl (P8 activity log)
 * - lineage.jsonl (P9.1 lineage chain)
 * - canExport check (P10/P11.1 gate)
 *
 * @version 0.12.12
 */

import { safeJobId, readJobSnapshot } from '../state/jobStateStorage.js';
import { canExport as canExportJob } from '../state/stateService.js';
import { readActivity } from '../activity/activityStorage.js';
import { readLineageEvents } from '../lineage/lineageStorage.js';
import type { ActivityRecord } from '../activity/activityTypes.js';
import type { LineageEvent } from '../lineage/lineageTypes.js';
import {
  PROOF_VERSION,
  type JobProof,
  type JobProofError,
  type JobProofResult,
  type ProofLatestVerify,
  type ProofLatestExport,
  type ProofLineageHead,
  type ProofVerdict,
  type ProofWarning,
  type ProofWarningCode,
} from './proofTypes.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find first item matching predicate (items should be sorted newest-first).
 */
function pickLatest<T>(items: T[], pred: (x: T) => boolean): T | undefined {
  for (const it of items) {
    if (pred(it)) return it;
  }
  return undefined;
}

/**
 * Parse verdict string to typed ProofVerdict.
 */
function parseVerdict(v: string | undefined): ProofVerdict {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'PASS') return 'PASS';
  if (s === 'PASS_WITH_WARN') return 'PASS_WITH_WARN';
  if (s === 'FAIL') return 'FAIL';
  return 'UNKNOWN';
}

/**
 * Extract verify evidence from activity record.
 */
function extractVerify(record: ActivityRecord | undefined): ProofLatestVerify | undefined {
  if (!record) return undefined;
  if (!record.verify) return undefined;

  const at = record.at;
  if (!at) return undefined;

  return {
    at,
    verdict: parseVerdict(record.verify.verdict),
    code: record.verify.code,
    summary: record.verify.summary,
  };
}

/**
 * Extract export evidence from activity record.
 */
function extractExportFromActivity(record: ActivityRecord | undefined): ProofLatestExport | undefined {
  if (!record) return undefined;
  if (!record.export) return undefined;

  const at = record.at;
  if (!at) return undefined;

  return {
    at,
    dialect: record.export.dialect,
    profileId: record.export.profileId,
    mode: record.export.mode,
    target: record.export.target,
    artifactSha256: record.export.artifactSha256,
    artifactName: record.export.artifactName,
  };
}

/**
 * Extract export evidence from lineage event (fallback).
 */
function extractExportFromLineage(event: LineageEvent | undefined): ProofLatestExport | undefined {
  if (!event) return undefined;
  if (!event.export) return undefined;

  const at = event.at;
  if (!at) return undefined;

  return {
    at,
    dialect: event.export.dialect,
    profileId: event.export.profileId,
    mode: event.export.mode,
    target: event.export.target,
    artifactSha256: event.export.artifactSha256,
    artifactName: event.export.artifactName,
  };
}

/**
 * Extract lineage head (most recent with revision).
 */
function extractLineageHead(events: LineageEvent[]): ProofLineageHead | undefined {
  const head = pickLatest(events, (e) => Boolean(e.revision?.revisionId));
  if (!head) return undefined;

  return {
    revisionId: head.revision?.revisionId,
    at: head.at,
  };
}

/**
 * Validate SHA-256 hex string (64 lowercase hex chars).
 */
function isValidSha256Hex(hash: string | undefined): boolean {
  if (!hash) return false;
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * P12.1: Validate proof invariants and collect warnings.
 * Returns warnings array (empty if all invariants pass).
 */
function validateProofInvariants(
  proof: Omit<JobProof, 'version' | 'warnings'>
): { warnings: ProofWarning[]; adjustedCanExport: boolean } {
  const warnings: ProofWarning[] = [];
  let adjustedCanExport = proof.canExport;

  // Invariant 1: RELEASED state must have revisionId
  if (proof.state.specState === 'RELEASED' && !proof.state.revisionId) {
    warnings.push({
      code: 'W_RELEASED_NO_REVISION',
      message: 'RELEASED state but no revisionId - cannot verify artifact lineage',
    });
    adjustedCanExport = false;
  }

  // Invariant 2: FROZEN/RELEASED should have manifestSha256
  if (
    (proof.state.specState === 'FROZEN' || proof.state.specState === 'RELEASED') &&
    !proof.state.manifestSha256
  ) {
    warnings.push({
      code: 'W_MISSING_MANIFEST_HASH',
      message: `${proof.state.specState} state but no manifestSha256`,
    });
  }

  // Invariant 3: artifactSha256 must be valid if present
  if (proof.latestExport?.artifactSha256) {
    if (!isValidSha256Hex(proof.latestExport.artifactSha256)) {
      warnings.push({
        code: 'W_INVALID_ARTIFACT_HASH',
        message: 'latestExport.artifactSha256 is not a valid SHA-256 hex string',
      });
      // Clear invalid hash to prevent downstream confusion
      proof.latestExport.artifactSha256 = undefined;
    }
  }

  // Invariant 4: PASS_WITH_WARN should not allow export (consistency check)
  if (proof.latestVerify?.verdict === 'PASS_WITH_WARN' && proof.canExport) {
    warnings.push({
      code: 'W_PASS_WITH_WARN_EXPORTED',
      message: 'Latest verify was PASS_WITH_WARN but canExport is true - verify policy consistency',
    });
    // Don't force canExport=false here - the canExport endpoint is authoritative
    // This is just a warning for audit purposes
  }

  // Invariant 5: lineageHead.revisionId should match state.revisionId (if both exist)
  if (
    proof.lineageHead?.revisionId &&
    proof.state.revisionId &&
    proof.lineageHead.revisionId !== proof.state.revisionId
  ) {
    warnings.push({
      code: 'W_LINEAGE_MISMATCH',
      message: `lineageHead.revisionId (${proof.lineageHead.revisionId.slice(0, 12)}...) !== state.revisionId (${proof.state.revisionId.slice(0, 12)}...)`,
    });
  }

  return { warnings, adjustedCanExport };
}

// ============================================================================
// Main Service
// ============================================================================

/**
 * Build proof bundle for a job.
 *
 * Reads from:
 * - job.snapshot.json (authoritative state)
 * - activity.jsonl (verify events, export success events)
 * - lineage.jsonl (export linkage, revision chain)
 * - canExport gate check
 */
export async function buildJobProof(jobIdRaw: string): Promise<JobProofResult> {
  // Validate job ID
  let jobId: string;
  try {
    jobId = safeJobId(jobIdRaw);
  } catch (e) {
    return {
      ok: false,
      jobId: String(jobIdRaw || ''),
      code: 'E_INVALID_JOBID',
      error: 'Invalid jobId',
    };
  }

  try {
    // Read all sources in parallel
    const [snapshot, activityItems, lineageItems, canExportResult] = await Promise.all([
      readJobSnapshot(jobId),
      readActivity(jobId, { limit: 500 }).catch(() => [] as ActivityRecord[]),
      readLineageEvents(jobId, { limit: 500 }).catch(() => [] as LineageEvent[]),
      canExportJob(jobId).catch(() => ({ canExport: false, specState: 'DRAFT', reason: 'Error checking export' })),
    ]);

    // Activity items should already be sorted newest-first
    // But ensure stable sort just in case
    activityItems.sort((a, b) => {
      const ta = Date.parse(a.at || '') || 0;
      const tb = Date.parse(b.at || '') || 0;
      if (tb !== ta) return tb - ta;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    lineageItems.sort((a, b) => {
      const ta = Date.parse(a.at || '') || 0;
      const tb = Date.parse(b.at || '') || 0;
      if (tb !== ta) return tb - ta;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    // Find latest verify (prefer VERIFY_RUN, fallback to VERIFY_RESULT)
    const latestVerifyRecord =
      pickLatest(activityItems, (e) => e.type === 'VERIFY_RUN') ||
      pickLatest(activityItems, (e) => e.type === 'VERIFY_RESULT' as any);

    // Find latest export success (prefer activity, fallback to lineage)
    const latestExportActivity = pickLatest(activityItems, (e) => e.type === 'EXPORT_SUCCESS');
    const latestExportLineage = pickLatest(lineageItems, (e) => e.type === 'EXPORT_SUCCESS_LINK');

    // Extract evidence
    const latestVerify = extractVerify(latestVerifyRecord);
    const latestExport =
      extractExportFromActivity(latestExportActivity) ||
      extractExportFromLineage(latestExportLineage);
    const lineageHead = extractLineageHead(lineageItems);

    // Build preliminary proof (without version/warnings)
    const preliminaryProof = {
      ok: true as const,
      jobId,
      state: {
        specState: snapshot.specState,
        revisionId: snapshot.revision?.revisionId,
        packetSha256: snapshot.revision?.packetSha256,
        manifestSha256: snapshot.revision?.manifestSha256,
        updatedAt: snapshot.updatedAt,
        frozenAt: snapshot.frozenAt,
        releasedAt: snapshot.releasedAt,
        revokedAt: snapshot.revokedAt,
      },
      latestVerify,
      latestExport,
      lineageHead,
      canExport: canExportResult.canExport,
      canExportReason: canExportResult.reason,
      generatedAt: new Date().toISOString(),
    };

    // P12.1: Validate invariants
    const { warnings, adjustedCanExport } = validateProofInvariants(preliminaryProof);

    // Build final proof with version and warnings
    const proof: JobProof = {
      ...preliminaryProof,
      version: PROOF_VERSION,
      canExport: adjustedCanExport,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return proof;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error';

    // Check if it's a not-found error
    if (message.includes('ENOENT') || message.includes('not found')) {
      return {
        ok: false,
        jobId,
        code: 'E_NOT_FOUND',
        error: `Job not found: ${jobId}`,
      };
    }

    return {
      ok: false,
      jobId,
      code: 'E_INTERNAL',
      error: message,
    };
  }
}
