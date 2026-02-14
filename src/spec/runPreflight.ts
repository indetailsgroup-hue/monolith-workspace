/**
 * runPreflight.ts - Preflight Engine for Release
 *
 * B4: Checks required before FROZEN → RELEASED transition
 *
 * Preflight Checks:
 * 1. Gate PASS - All validation rules passed
 * 2. No waived items (or explicit acknowledgment)
 * 3. All required signatures present
 * 4. Content hash stability (no changes since freeze)
 *
 * @version 1.0.0 - Phase B4: Preflight + Release Lock
 */

import { useSpecStore } from '../core/store/useSpecStore';
import { useCabinetStore } from '../core/store/useCabinetStore';
import { useDrillMapStore } from '../core/store/useDrillMapStore';
import { sha256Hex } from '../crypto/sha256';

// ============================================
// PREFLIGHT CHECK TYPES
// ============================================

export type PreflightCheckId =
  | 'GATE_PASS'
  | 'NO_WAIVED_ITEMS'
  | 'SIGNATURES_PRESENT'
  | 'CONTENT_HASH_STABLE'
  | 'SPEC_STATE_FROZEN';

export type PreflightSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface PreflightCheck {
  id: PreflightCheckId;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIPPED';
  severity: PreflightSeverity;
  message: string;
  /** Additional details for debugging */
  details?: string;
  /** Can this check be waived/acknowledged? */
  waivable: boolean;
}

export interface PreflightResult {
  /** Overall result - true if all ERROR checks passed */
  ok: boolean;
  /** Timestamp of preflight run */
  timestamp: number;
  /** All individual checks */
  checks: PreflightCheck[];
  /** Count by status */
  summary: {
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
  };
  /** Content hashes computed during preflight */
  computedHashes: {
    cabinetsHash: string;
    drillMapHash: string;
  } | null;
}

export interface PreflightOptions {
  /** Skip certain checks */
  skip?: PreflightCheckId[];
  /** Explicitly acknowledge waived items */
  acknowledgeWaivers?: boolean;
  /** Required signature count (default: 0) */
  requiredSignatures?: number;
  /** Expected content hash (for stability check) */
  expectedContentHash?: string;
}

// ============================================
// PREFLIGHT ENGINE
// ============================================

/**
 * Run preflight checks before release
 *
 * Usage:
 * ```typescript
 * const result = await runPreflight();
 * if (result.ok) {
 *   // Safe to proceed with release
 *   await specStore.releaseSpec();
 * } else {
 *   // Show blockers to user
 *   console.log(result.checks.filter(c => c.status === 'FAIL'));
 * }
 * ```
 */
export async function runPreflight(
  options: PreflightOptions = {}
): Promise<PreflightResult> {
  const { skip = [], acknowledgeWaivers = false, requiredSignatures = 0, expectedContentHash } = options;

  const checks: PreflightCheck[] = [];
  let computedHashes: PreflightResult['computedHashes'] = null;

  // Get current state from stores
  const specState = useSpecStore.getState();
  const cabinetState = useCabinetStore.getState();

  // ─────────────────────────────────────────────────────────────────────
  // Check 1: Spec State is FROZEN
  // ─────────────────────────────────────────────────────────────────────
  if (!skip.includes('SPEC_STATE_FROZEN')) {
    const isFrozen = specState.specState === 'FROZEN';
    checks.push({
      id: 'SPEC_STATE_FROZEN',
      name: 'Spec State is FROZEN',
      status: isFrozen ? 'PASS' : 'FAIL',
      severity: 'ERROR',
      message: isFrozen
        ? 'Spec is in FROZEN state, ready for release'
        : `Spec must be FROZEN to release (current: ${specState.specState})`,
      waivable: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Check 2: Gate PASS
  // ─────────────────────────────────────────────────────────────────────
  if (!skip.includes('GATE_PASS')) {
    const validation = specState.validation;
    const gatePassed = validation?.ok === true;

    checks.push({
      id: 'GATE_PASS',
      name: 'Gate Validation Passed',
      status: gatePassed ? 'PASS' : 'FAIL',
      severity: 'ERROR',
      message: gatePassed
        ? `All ${validation?.passCount || 0} validation rules passed`
        : `${validation?.failCount || 0} validation error(s) must be resolved`,
      details: validation?.rules
        .filter((r) => r.status === 'FAIL')
        .map((r) => `- ${r.name}: ${r.message}`)
        .join('\n'),
      waivable: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Check 3: No Waived Items (or acknowledged)
  // ─────────────────────────────────────────────────────────────────────
  if (!skip.includes('NO_WAIVED_ITEMS')) {
    const validation = specState.validation;
    const warnCount = validation?.warnCount || 0;

    if (warnCount === 0) {
      checks.push({
        id: 'NO_WAIVED_ITEMS',
        name: 'No Warnings or Waivers',
        status: 'PASS',
        severity: 'WARN',
        message: 'No warnings to acknowledge',
        waivable: true,
      });
    } else if (acknowledgeWaivers) {
      checks.push({
        id: 'NO_WAIVED_ITEMS',
        name: 'Warnings Acknowledged',
        status: 'WARN',
        severity: 'WARN',
        message: `${warnCount} warning(s) explicitly acknowledged`,
        details: validation?.rules
          .filter((r) => r.status === 'WARN')
          .map((r) => `- ${r.name}: ${r.message}`)
          .join('\n'),
        waivable: true,
      });
    } else {
      checks.push({
        id: 'NO_WAIVED_ITEMS',
        name: 'Warnings Not Acknowledged',
        status: 'FAIL',
        severity: 'WARN',
        message: `${warnCount} warning(s) require acknowledgment before release`,
        details: validation?.rules
          .filter((r) => r.status === 'WARN')
          .map((r) => `- ${r.name}: ${r.message}`)
          .join('\n'),
        waivable: true,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Check 4: Signatures Present (if required)
  // ─────────────────────────────────────────────────────────────────────
  if (!skip.includes('SIGNATURES_PRESENT')) {
    if (requiredSignatures === 0) {
      checks.push({
        id: 'SIGNATURES_PRESENT',
        name: 'Signatures (Optional)',
        status: 'SKIPPED',
        severity: 'INFO',
        message: 'No signatures required for this release',
        waivable: false,
      });
    } else {
      // In a real implementation, check signature store
      // For now, we'll assume signatures are not implemented
      checks.push({
        id: 'SIGNATURES_PRESENT',
        name: 'Signatures Required',
        status: 'FAIL',
        severity: 'ERROR',
        message: `${requiredSignatures} signature(s) required but not found`,
        waivable: false,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Check 5: Content Hash Stability
  // ─────────────────────────────────────────────────────────────────────
  if (!skip.includes('CONTENT_HASH_STABLE')) {
    try {
      // Compute current content hashes
      const drillMapState = useDrillMapStore.getState();
      const cabinetsJson = JSON.stringify(cabinetState.cabinets);
      const drillMapJson = JSON.stringify(drillMapState.drillMap || null);

      const cabinetsHash = await sha256Hex(cabinetsJson);
      const drillMapHash = await sha256Hex(drillMapJson);

      computedHashes = { cabinetsHash, drillMapHash };

      if (expectedContentHash) {
        // Compare with expected hash
        const combinedHash = await sha256Hex(cabinetsHash + drillMapHash);
        const matches = combinedHash === expectedContentHash;

        checks.push({
          id: 'CONTENT_HASH_STABLE',
          name: 'Content Hash Stable',
          status: matches ? 'PASS' : 'FAIL',
          severity: 'ERROR',
          message: matches
            ? 'Content hash matches frozen snapshot'
            : 'Content has changed since freeze (hash mismatch)',
          details: matches
            ? `Hash: ${combinedHash.slice(0, 16)}...`
            : `Expected: ${expectedContentHash.slice(0, 16)}...\nActual: ${combinedHash.slice(0, 16)}...`,
          waivable: false,
        });
      } else {
        // No expected hash - just verify computation works
        checks.push({
          id: 'CONTENT_HASH_STABLE',
          name: 'Content Hash Computed',
          status: 'PASS',
          severity: 'INFO',
          message: 'Content hash computed successfully',
          details: `Cabinets: ${cabinetsHash.slice(0, 16)}...\nDrillMap: ${drillMapHash.slice(0, 16)}...`,
          waivable: false,
        });
      }
    } catch (error) {
      checks.push({
        id: 'CONTENT_HASH_STABLE',
        name: 'Content Hash Error',
        status: 'FAIL',
        severity: 'ERROR',
        message: 'Failed to compute content hash',
        details: error instanceof Error ? error.message : 'Unknown error',
        waivable: false,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Compute Summary
  // ─────────────────────────────────────────────────────────────────────
  const summary = {
    passed: checks.filter((c) => c.status === 'PASS').length,
    failed: checks.filter((c) => c.status === 'FAIL').length,
    warned: checks.filter((c) => c.status === 'WARN').length,
    skipped: checks.filter((c) => c.status === 'SKIPPED').length,
  };

  // OK if no ERROR-severity checks failed
  const errorFails = checks.filter(
    (c) => c.status === 'FAIL' && c.severity === 'ERROR'
  ).length;
  const ok = errorFails === 0;

  return {
    ok,
    timestamp: Date.now(),
    checks,
    summary,
    computedHashes,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get human-readable preflight summary
 */
export function formatPreflightSummary(result: PreflightResult): string {
  const lines: string[] = [];

  lines.push(`Preflight ${result.ok ? 'PASSED' : 'FAILED'}`);
  lines.push(`─────────────────────────────`);

  for (const check of result.checks) {
    const icon =
      check.status === 'PASS'
        ? '✓'
        : check.status === 'FAIL'
          ? '✗'
          : check.status === 'WARN'
            ? '⚠'
            : '○';
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }

  lines.push(`─────────────────────────────`);
  lines.push(
    `Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warned} warned`
  );

  return lines.join('\n');
}

/**
 * Get blocking issues from preflight result
 */
export function getPreflightBlockers(result: PreflightResult): PreflightCheck[] {
  return result.checks.filter(
    (c) => c.status === 'FAIL' && c.severity === 'ERROR'
  );
}

/**
 * Get warnings from preflight result
 */
export function getPreflightWarnings(result: PreflightResult): PreflightCheck[] {
  return result.checks.filter(
    (c) => c.status === 'FAIL' && c.severity === 'WARN'
  );
}
