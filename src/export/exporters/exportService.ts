/**
 * Export Service - Only RELEASED + Verify + Policy
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Gate check: SpecState must be RELEASED
 * - Verify: Bundle must pass integrity checks
 * - Policy: Export must be allowed by policy
 *
 * v1.0: Initial export service
 */

import type { ArtifactBundle, ExportRequest, ArtifactFile } from '../types';
import type { VerifyReport } from '../verify/verifyTypes';
import type { ExportPolicy, PolicyReport } from '../policy/policyTypes';
import { verifyArtifactBundle, extractManifestFromArtifact } from '../verify/verifyBundle';
import { evalExportPolicy } from '../policy/policyEval';
import { mockCutlistCsvExporter } from './mockCsvExporter';
import type { Exporter } from './exporterTypes';

/** Spec state type (matching useSpecStore) */
export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

/**
 * Export gate report.
 */
export interface ExportGateReport {
  /** Verification report */
  verify: VerifyReport;
  /** Policy report */
  policy: PolicyReport;
}

/**
 * Export result.
 */
export interface ExportOnlyReleasedResult {
  /** Overall success */
  ok: boolean;
  /** Gate reports */
  gate: ExportGateReport;
  /** Exported files (if ok) */
  exportFiles?: ArtifactFile[];
  /** Error code (if not ok) */
  error?: string;
}

/** Registered exporters */
const EXPORTERS: Exporter[] = [mockCutlistCsvExporter];

/**
 * Export only if RELEASED + verify + policy pass.
 * This is the main entry point for factory-safe exports.
 */
export function exportOnlyReleased(input: {
  specState: SpecState;
  artifactBundle: ArtifactBundle;
  request: ExportRequest;
  policy: ExportPolicy;
}): ExportOnlyReleasedResult {
  // Gate 1: Check SpecState is RELEASED
  if (input.specState !== 'RELEASED') {
    return {
      ok: false,
      gate: {
        verify: {
          ok: false,
          issues: [
            {
              severity: 'ERROR',
              code: 'NOT_RELEASED',
              message: `Export requires SpecState=RELEASED, got ${input.specState}`,
            },
          ],
        },
        policy: {
          ok: false,
          decisions: [{ effect: 'DENY', reason: 'SpecState not RELEASED' }],
        },
      },
      error: 'NOT_RELEASED',
    };
  }

  // Gate 2: Verify bundle integrity
  const verify = verifyArtifactBundle(input.artifactBundle);

  // Extract manifest for policy evaluation
  const manifest = extractManifestFromArtifact(input.artifactBundle);

  // Gate 3: Evaluate policy
  const policy = evalExportPolicy({
    policy: input.policy,
    request: input.request,
    verify,
    manifest,
  });

  // Check gates
  if (!verify.ok || !policy.ok) {
    return {
      ok: false,
      gate: { verify, policy },
      error: 'GATE_BLOCKED',
    };
  }

  // Find exporter for format
  const exporter = EXPORTERS.find((e) => e.format === input.request.format);
  if (!exporter) {
    return {
      ok: false,
      gate: { verify, policy },
      error: `NO_EXPORTER_${input.request.format}`,
    };
  }

  // Run export
  const bundleJson = JSON.stringify(input.artifactBundle);
  const result = exporter.export({
    bundleJson,
    jobName: input.request.jobName,
  });

  return {
    ok: true,
    gate: { verify, policy },
    exportFiles: result.files,
  };
}
