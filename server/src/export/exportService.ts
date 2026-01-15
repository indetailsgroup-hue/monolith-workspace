/**
 * Export Service
 *
 * Step 9: Orchestrates bundle verification, policy, and export
 *
 * Features:
 * - Bundle retrieval and verification
 * - Policy evaluation
 * - Export job processing
 * - Exporter dispatch
 */

import { casGet } from '../storage/cas.js';
import { verifyBundle, extractManifest, getBundleId } from '../verify/verifyBundle.js';
import { evalExportPolicy, DEFAULT_EXPORT_POLICY } from '../policy/policy.js';
import { setJobProcessor, enqueueJob, getJob } from './jobQueue.js';
import type {
  ArtifactBundle,
  ArtifactFile,
  ExportJob,
  ExportJobResult,
  ExportRequest,
  ExportFormat,
  ExportPolicy,
  VerifyReport,
  PolicyReport,
} from '../types.js';

// Import exporters
import { exportCutlistCsv } from './exporters/cutlistCsv.js';
import { exportDxfR12 } from './exporters/dxfR12.js';
import { exportGcode } from './exporters/gcode.js';

// ============================================================================
// Exporter Registry
// ============================================================================

export type ExporterFn = (
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
) => ArtifactFile[];

const exporters: Record<ExportFormat, ExporterFn> = {
  CUTLIST_CSV: exportCutlistCsv,
  DXF_R12: exportDxfR12,
  GCODE: exportGcode,
  STEP: (bundle, jobName) => {
    // STEP export not implemented yet
    throw new Error('STEP export not implemented');
  },
  PDF: (bundle, jobName) => {
    // PDF export not implemented yet
    throw new Error('PDF export not implemented');
  },
};

// ============================================================================
// Bundle Cache (in-memory for quick access)
// ============================================================================

const bundleCache = new Map<string, ArtifactBundle>();

/**
 * Store a bundle in the cache for export processing.
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

// ============================================================================
// Export Request Processing
// ============================================================================

export interface ExportRequestResult {
  ok: boolean;
  jobId?: string;
  verify?: VerifyReport;
  policy?: PolicyReport;
  error?: string;
}

/**
 * Process an export request:
 * 1. Verify the bundle
 * 2. Evaluate policy
 * 3. Queue the export job
 */
export async function processExportRequest(
  bundleId: string,
  request: ExportRequest,
  policy: ExportPolicy = DEFAULT_EXPORT_POLICY
): Promise<ExportRequestResult> {
  // 1. Get the bundle
  const bundle = getCachedBundle(bundleId);
  if (!bundle) {
    return {
      ok: false,
      error: 'BUNDLE_NOT_FOUND',
    };
  }

  // 2. Verify the bundle
  const verify = await verifyBundle(bundle);
  if (!verify.ok) {
    return {
      ok: false,
      verify,
      error: 'VERIFICATION_FAILED',
    };
  }

  // 3. Evaluate policy
  const manifest = extractManifest(bundle);
  const policyResult = evalExportPolicy({
    policy,
    request,
    verify,
    manifest,
  });

  if (!policyResult.ok) {
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'POLICY_DENIED',
    };
  }

  // 4. Queue the export job
  const job = enqueueJob(bundleId, request);

  return {
    ok: true,
    jobId: job.id,
    verify,
    policy: policyResult,
  };
}

// ============================================================================
// Job Processor
// ============================================================================

async function processExportJob(job: ExportJob): Promise<ExportJobResult> {
  const startTime = Date.now();

  // Get the bundle
  const bundle = getCachedBundle(job.bundleId);
  if (!bundle) {
    throw new Error('Bundle not found in cache');
  }

  // Get the exporter
  const exporter = exporters[job.request.format];
  if (!exporter) {
    throw new Error(`No exporter for format: ${job.request.format}`);
  }

  // Run the export
  const files = exporter(bundle, job.request.jobName, job.request.options);

  return {
    files,
    processingTimeMs: Date.now() - startTime,
  };
}

// Initialize the job processor
setJobProcessor(processExportJob);

// ============================================================================
// Direct Export (for simple/synchronous cases)
// ============================================================================

export interface DirectExportResult {
  ok: boolean;
  files?: ArtifactFile[];
  verify?: VerifyReport;
  policy?: PolicyReport;
  error?: string;
}

/**
 * Export directly without queuing (for simple cases).
 */
export async function exportDirect(
  bundle: ArtifactBundle,
  request: ExportRequest,
  policy: ExportPolicy = DEFAULT_EXPORT_POLICY
): Promise<DirectExportResult> {
  // 1. Verify the bundle
  const verify = await verifyBundle(bundle);
  if (!verify.ok) {
    return {
      ok: false,
      verify,
      error: 'VERIFICATION_FAILED',
    };
  }

  // 2. Evaluate policy
  const manifest = extractManifest(bundle);
  const policyResult = evalExportPolicy({
    policy,
    request,
    verify,
    manifest,
  });

  if (!policyResult.ok) {
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: 'POLICY_DENIED',
    };
  }

  // 3. Get the exporter
  const exporter = exporters[request.format];
  if (!exporter) {
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: `NO_EXPORTER_${request.format}`,
    };
  }

  // 4. Run the export
  try {
    const files = exporter(bundle, request.jobName, request.options);
    return {
      ok: true,
      files,
      verify,
      policy: policyResult,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Export failed';
    return {
      ok: false,
      verify,
      policy: policyResult,
      error: errorMessage,
    };
  }
}
