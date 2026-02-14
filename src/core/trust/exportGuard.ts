/**
 * exportGuard.ts - Export Guard for Factory Enforcement
 *
 * ARCHITECTURE:
 * - Enforces that only valid jobs can be exported
 * - Verifies trust report hash integrity
 * - Prevents tampering and unauthorized exports
 *
 * FACTORY POLICY (North Star):
 * - No export without valid TrustReport
 * - Hash mismatch blocks export
 * - All exports are traceable
 */

import type { JobManifest } from './manifestTypes';
import type { TrustReport } from './trustReportTypes';
import { sha256Json } from './hashTrustReport';

// ============================================
// GUARD RESULT
// ============================================

export interface ExportGuardResult {
  /** Whether export is allowed */
  ok: boolean;
  /** Reason for blocking (if not ok) */
  reason?: string;
  /** Additional details */
  details?: string[];
}

// ============================================
// MAIN GUARD
// ============================================

/**
 * Assert that export is allowed based on manifest
 *
 * Checks:
 * 1. TrustReport exists
 * 2. Gate is OK (no errors)
 * 3. Collision is not blocked
 * 4. Hash matches (integrity)
 *
 * @param manifest - Job manifest to validate
 * @returns Guard result
 */
export async function assertExportAllowed(
  manifest: JobManifest
): Promise<ExportGuardResult> {
  const details: string[] = [];

  // 1. Check TrustReport exists
  if (!manifest?.trustReport) {
    return {
      ok: false,
      reason: 'Missing TrustReport',
      details: ['Job manifest does not contain a TrustReport'],
    };
  }

  // 2. Check Gate OK
  if (!manifest.trustReport.gate?.ok) {
    details.push(`Gate has ${manifest.trustReport.gate.errorCount} errors`);
    return {
      ok: false,
      reason: 'Gate validation failed',
      details,
    };
  }

  // 3. Check Collision OK
  if (manifest.trustReport.collision?.blocked) {
    details.push(`Collision blocked with ${manifest.trustReport.collision.pairCount} pairs`);
    return {
      ok: false,
      reason: 'Collision detection blocked',
      details,
    };
  }

  // 4. Verify hash integrity
  const computedHash = await sha256Json(manifest.trustReport);
  if (computedHash !== manifest.trustReportHash) {
    return {
      ok: false,
      reason: 'TrustReport hash mismatch',
      details: [
        'The TrustReport has been modified since validation',
        `Expected: ${manifest.trustReportHash}`,
        `Computed: ${computedHash}`,
      ],
    };
  }

  return { ok: true };
}

/**
 * Synchronous version (without hash verification)
 * Use when async is not available
 */
export function assertExportAllowedSync(
  manifest: JobManifest
): ExportGuardResult {
  if (!manifest?.trustReport) {
    return { ok: false, reason: 'Missing TrustReport' };
  }

  if (!manifest.trustReport.gate?.ok) {
    return {
      ok: false,
      reason: 'Gate validation failed',
      details: [`Gate has ${manifest.trustReport.gate.errorCount} errors`],
    };
  }

  if (manifest.trustReport.collision?.blocked) {
    return {
      ok: false,
      reason: 'Collision detection blocked',
      details: [`Collision blocked with ${manifest.trustReport.collision.pairCount} pairs`],
    };
  }

  // Note: hash not verified in sync version
  return { ok: true };
}

// ============================================
// EXPORT ENFORCEMENT
// ============================================

/**
 * Guard export operation
 * Throws error if export not allowed
 */
export async function guardExport(manifest: JobManifest): Promise<void> {
  const result = await assertExportAllowed(manifest);

  if (!result.ok) {
    const message = `Export blocked: ${result.reason}`;
    const detailStr = result.details?.join('\n  ') ?? '';

    throw new Error(detailStr ? `${message}\n  ${detailStr}` : message);
  }
}

/**
 * Create export-safe wrapper
 * Returns null if export not allowed
 */
export async function withExportGuard<T>(
  manifest: JobManifest,
  exportFn: () => Promise<T>
): Promise<T | null> {
  const result = await assertExportAllowed(manifest);

  if (!result.ok) {
    console.warn('[ExportGuard] Export blocked:', result.reason);
    return null;
  }

  return exportFn();
}

// ============================================
// QUICK CHECKS
// ============================================

/**
 * Quick check if manifest allows export (no hash verification)
 */
export function canExport(manifest: JobManifest | null): boolean {
  if (!manifest?.trustReport) return false;
  if (!manifest.trustReport.gate?.ok) return false;
  if (manifest.trustReport.collision?.blocked) return false;
  return true;
}

/**
 * Get export blocking reasons
 */
export function getExportBlockingReasons(manifest: JobManifest): string[] {
  const reasons: string[] = [];

  if (!manifest?.trustReport) {
    reasons.push('Missing TrustReport');
    return reasons;
  }

  if (!manifest.trustReport.gate?.ok) {
    reasons.push(`Gate blocked: ${manifest.trustReport.gate.errorCount} errors`);
  }

  if (manifest.trustReport.collision?.blocked) {
    reasons.push(`Collision blocked: ${manifest.trustReport.collision.pairCount} pairs`);
  }

  return reasons;
}
