/**
 * exportServiceP22a.ts - P2.2a Export Service
 *
 * High-level export orchestration with:
 * - Bundle verification
 * - Policy evaluation
 * - Deterministic ZIP creation
 * - Audit logging
 * - SHA-256 hash response
 *
 * This is the main entry point for gated exports.
 */

import { verifyBundle, extractManifest, extractSignature, getBundleId } from '../verify/verifyBundle.js';
import { evalExportPolicy, DEFAULT_EXPORT_POLICY } from '../policy/policy.js';
import { createFactoryPackage, createDeterministicZip, calculateHash } from './zipBundle.js';
import {
  logExportSuccess,
  logVerifyFail,
  logPolicyDenied,
  logExportError,
} from './exportAudit.js';
import { getExportOptionsResponse } from './exportOptions.js';
import { recordExportSuccess } from '../lineage/lineageStorage.js';
import { buildJobProof } from '../proof/proofService.js';
import { buildSignedReceipt, addZipHash, serializeReceipt } from './exportReceipt.js';
import type {
  ExportOptionsResponse,
  ExportZipResponse,
  ZipBundleResult,
} from './exportTypes.js';
import type { ArtifactBundle, ArtifactFile, ExportPolicy, VerifyReport, PolicyEffect, ExportFormat as BaseExportFormat } from '../types.js';

// Import exporters from existing service
import { exportCutlistCsv } from './exporters/cutlistCsv.js';
import { exportDxfR12 } from './exporters/dxfR12.js';
import { exportDxfR12PerPart } from './exporters/dxfR12PerPart.js';
import { exportGcode } from './exporters/gcode.js';

// ============================================================================
// Exporter Registry
// ============================================================================

export type ExporterFn = (
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
) => ArtifactFile[];

const exporters: Partial<Record<BaseExportFormat, ExporterFn>> = {
  CUTLIST_CSV: exportCutlistCsv,
  DXF_R12: exportDxfR12,
  DXF_R12_PER_PART: exportDxfR12PerPart, // P14A: Use new POLYLINE+VERTEX+SEQEND writer
  GCODE: exportGcode,
  // STEP and PDF not implemented yet
  // Legacy: exportDxfPerPart still available for backwards compatibility
};

// ============================================================================
// Bundle Cache
// ============================================================================

const bundleCache = new Map<string, ArtifactBundle>();

/**
 * Store a bundle in cache for export processing.
 */
export function cacheBundleForExport(bundle: ArtifactBundle): string {
  const bundleId = getBundleId(bundle);
  bundleCache.set(bundleId, bundle);
  return bundleId;
}

/**
 * Get a cached bundle.
 */
export function getCachedBundle(bundleId: string): ArtifactBundle | null {
  return bundleCache.get(bundleId) ?? null;
}

/**
 * Clear bundle cache (for testing).
 */
export function clearBundleCache(): void {
  bundleCache.clear();
}

// ============================================================================
// Main Export Function
// ============================================================================

export interface ExportP22aResult {
  ok: boolean;
  /** ZIP buffer (only if ok=true) */
  zipBuffer?: Buffer;
  /** SHA-256 of ZIP (hex) */
  zipSha256Hex?: string;
  /** Verification report */
  verify?: VerifyReport;
  /** Policy result */
  policy?: {
    ok: boolean;
    decisions: Array<{ effect: PolicyEffect; reason: string }>;
  };
  /** Error code */
  error?: string;
  /** Error message */
  message?: string;
  /** Processing time in ms */
  processingTimeMs?: number;
  /** File count in export */
  fileCount?: number;
}

/**
 * Execute a gated export with full P2.2a features:
 * 1. Verify bundle integrity and signature
 * 2. Evaluate export policy
 * 3. Run exporter to generate files
 * 4. Create deterministic ZIP with manifest
 * 5. Log audit entry
 * 6. Return ZIP buffer with SHA-256 hash
 */
export async function executeGatedExport(
  bundleId: string,
  format: BaseExportFormat,
  jobName: string,
  options?: Record<string, unknown>,
  policy: ExportPolicy = DEFAULT_EXPORT_POLICY,
  requester?: string
): Promise<ExportP22aResult> {
  const startTime = Date.now();

  // 1. Get bundle from cache
  const bundle = getCachedBundle(bundleId);
  if (!bundle) {
    logExportError({
      bundleId,
      format,
      requester,
      error: 'Bundle not found in cache',
    });
    return {
      ok: false,
      error: 'BUNDLE_NOT_FOUND',
      message: 'Bundle not found in cache. Upload bundle first.',
    };
  }

  // 2. Verify bundle
  const verify = await verifyBundle(bundle);
  if (!verify.ok) {
    const errorCount = verify.issues.filter((i) => i.severity === 'ERROR').length;
    logVerifyFail({
      bundleId,
      format,
      requester,
      issueCount: verify.issues.length,
      errorCount,
      error: verify.issues[0]?.message,
    });
    return {
      ok: false,
      verify,
      error: 'VERIFICATION_FAILED',
      message: verify.issues[0]?.message ?? 'Bundle verification failed',
    };
  }

  // 3. Evaluate policy
  const manifest = extractManifest(bundle);
  const policyResult = evalExportPolicy({
    policy,
    request: { format, jobName, options },
    verify,
    manifest,
  });

  if (!policyResult.ok) {
    const deniedDecision = policyResult.decisions.find((d) => d.effect === 'DENY');
    const reason = deniedDecision?.reason ?? 'Policy denied';
    logPolicyDenied({
      bundleId,
      format,
      requester,
      deniedReason: reason,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'POLICY_DENIED',
      message: reason,
    };
  }

  // 4. Get exporter
  const exporter = exporters[format];
  if (!exporter) {
    logExportError({
      bundleId,
      format,
      requester,
      error: `No exporter for format: ${format}`,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'NO_EXPORTER',
      message: `Export format ${format} is not implemented`,
    };
  }

  // 5. Run exporter
  let exportFiles: ArtifactFile[];
  try {
    exportFiles = exporter(bundle, jobName, options);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Export failed';
    logExportError({
      bundleId,
      format,
      requester,
      error: errorMsg,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'EXPORT_FAILED',
      message: errorMsg,
    };
  }

  // 6. P13: Build proof bundle for receipt
  const proofResult = await buildJobProof(bundleId);
  if (!proofResult.ok) {
    const proofError = proofResult as { error: string };
    logExportError({
      bundleId,
      format,
      requester,
      error: `Proof unavailable: ${proofError.error}`,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'EXPORT_LOCKED',
      message: 'Cannot export: proof bundle unavailable for audit trail',
    };
  }
  const proof = proofResult;

  // 7. Create factory package ZIP
  const signature = extractSignature(bundle);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const signatureJson = signature ? JSON.stringify(signature, null, 2) : undefined;
  const verifyReportJson = JSON.stringify(verify, null, 2);

  // Generate stable job ID for this export
  const exportJobId = `job_${Date.now().toString(36)}`;
  const artifactName = `${jobName}_${format}.zip`;

  // First pass: create ZIP without receipt to get content hash
  let contentZipResult: ZipBundleResult;
  try {
    contentZipResult = await createFactoryPackage({
      jobId: exportJobId,
      projectName: manifest?.bundleId ?? 'Unnamed',
      format,
      manifest: manifestJson,
      signature: signatureJson,
      verifyReport: verifyReportJson,
      files: exportFiles.map((f) => ({
        name: f.name,
        content: f.content,
      })),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'ZIP creation failed';
    logExportError({
      bundleId,
      format,
      requester,
      error: errorMsg,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'ZIP_FAILED',
      message: errorMsg,
    };
  }

  // P13.1: Build signed receipt with content hash
  let receipt = buildSignedReceipt({
    jobId: bundleId,
    contentSha256: contentZipResult.sha256Hex,
    export: {
      target: 'FACTORY',
      dialect: format,
      mode: 'PRODUCTION',
      artifactName,
    },
    proof,
  });
  const receiptJson = serializeReceipt(receipt);

  // Second pass: create final ZIP with receipt included
  let zipResult: ZipBundleResult;
  try {
    zipResult = await createFactoryPackage({
      jobId: exportJobId,
      projectName: manifest?.bundleId ?? 'Unnamed',
      format,
      manifest: manifestJson,
      signature: signatureJson,
      verifyReport: verifyReportJson,
      receipt: receiptJson,
      files: exportFiles.map((f) => ({
        name: f.name,
        content: f.content,
      })),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'ZIP creation failed';
    logExportError({
      bundleId,
      format,
      requester,
      error: errorMsg,
    });
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'ZIP_FAILED',
      message: errorMsg,
    };
  }

  // P13.1: Add final ZIP hash to receipt for download verification
  receipt = addZipHash(receipt, zipResult.sha256Hex);

  const processingTimeMs = Date.now() - startTime;

  // 8. Log success
  logExportSuccess({
    bundleId,
    format,
    requester,
    zipHashHex: zipResult.sha256Hex,
    fileCount: exportFiles.length,
    processingTimeMs,
  });

  // 9. P9.1: Record server-anchored lineage event
  // Compute manifest hash as revision anchor (server-derived)
  const manifestHash = calculateHash(Buffer.from(manifestJson, 'utf-8'));

  await recordExportSuccess({
    jobId: bundleId,
    revisionId: manifestHash,
    manifestSha256: manifestHash,
    artifactSha256: zipResult.sha256Hex,
    artifactName,
    sizeBytes: zipResult.sizeBytes,
    dialect: format,
    mode: 'PRODUCTION',
    actor: requester ? { role: 'API', name: requester } : { role: 'SYSTEM' },
    note: `Export ${format} via P2.2a pipeline (P13 receipt: ${receipt.receiptId.slice(0, 12)}...)`,
  });

  return {
    ok: true,
    zipBuffer: zipResult.buffer,
    zipSha256Hex: zipResult.sha256Hex,
    verify,
    policy: policyResult,
    processingTimeMs,
    fileCount: exportFiles.length,
  };
}

// ============================================================================
// API Response Builders
// ============================================================================

/**
 * Build API response from export result.
 */
export function buildExportZipResponse(result: ExportP22aResult): ExportZipResponse {
  if (!result.ok) {
    return {
      ok: false,
      verify: result.verify,
      policy: result.policy,
      error: result.error,
      message: result.message,
    };
  }

  return {
    ok: true,
    zipBase64: result.zipBuffer?.toString('base64'),
    zipSha256Hex: result.zipSha256Hex,
    verify: result.verify,
    policy: result.policy,
  };
}

/**
 * Get export options response.
 */
export function getOptionsResponse(): ExportOptionsResponse {
  return getExportOptionsResponse();
}

// ============================================================================
// Direct Export (Simple ZIP without full package)
// ============================================================================

/**
 * Export directly to a simple ZIP (without manifest/signature).
 * For quick exports without full factory package structure.
 */
export async function exportDirectZip(
  bundle: ArtifactBundle,
  format: BaseExportFormat,
  jobName: string,
  options?: Record<string, unknown>
): Promise<{
  ok: boolean;
  buffer?: Buffer;
  sha256Hex?: string;
  error?: string;
}> {
  // Get exporter
  const exporter = exporters[format];
  if (!exporter) {
    return { ok: false, error: `No exporter for format: ${format}` };
  }

  // Run exporter
  let files: ArtifactFile[];
  try {
    files = exporter(bundle, jobName, options);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Export failed' };
  }

  // Create simple ZIP
  const entries = files.map((f) => ({
    name: f.name,
    content: f.content,
  }));

  const result = await createDeterministicZip(entries);

  return {
    ok: true,
    buffer: result.buffer,
    sha256Hex: result.sha256Hex,
  };
}
