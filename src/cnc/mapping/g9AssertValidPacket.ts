/**
 * g9AssertValidPacket.ts - G9 Persistence Gate for OperationGraph
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This module provides the runtime assertion that enforces the G9 invariant
 * at the buildOperationGraph boundary. Any FactoryPacket entering the
 * manufacturing pipeline MUST pass through this gate.
 *
 * ## Trusted Paths (do not need explicit assertion):
 * - `buildFactoryPacket()` - Creates packet from validated store state
 * - `buildFactoryPacketFromStores()` - Same, convenience wrapper
 *
 * ## Untrusted Paths (MUST use assertValidatedPacket):
 * - Loading packet from file system
 * - Receiving packet from API
 * - Importing packet from external source
 *
 * @version 1.0.0 - G9 OperationGraph Boundary
 */

import type { FactoryPacket } from '../../factory/packet/types';
import type { ValidatedFactoryPacket } from '../../core/gate/brandTypes';

// ============================================
// ERROR CODES
// ============================================

/**
 * G9 Violation Error Code
 *
 * This error code indicates that unvalidated external state attempted
 * to enter the OperationGraph pipeline. This is a CRITICAL error that
 * must be fixed at the calling site.
 */
export const G9_ERROR_CODE = 'MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH' as const;

// ============================================
// G9 VIOLATION ERROR
// ============================================

/**
 * G9 Violation Error
 *
 * Thrown when unvalidated data attempts to enter OperationGraph.
 */
export class G9ViolationError extends Error {
  public readonly code = G9_ERROR_CODE;
  public readonly violations: string[];

  constructor(violations: string[], source?: string) {
    const sourceInfo = source ? ` (source: ${source})` : '';
    super(`[${G9_ERROR_CODE}] Factory packet failed G9 validation${sourceInfo}: ${violations.join('; ')}`);
    this.name = 'G9ViolationError';
    this.violations = violations;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, G9ViolationError);
    }
  }
}

// ============================================
// VALIDATION RULES
// ============================================

/**
 * Validate FactoryPacket structure for G9 compliance.
 *
 * This is a structural validation that ensures the packet has all
 * required fields in the correct format. It does NOT validate
 * business logic or data correctness - that's the job of upstream gates.
 *
 * @param packet - Packet to validate
 * @returns Array of violation messages (empty if valid)
 */
function validatePacketStructure(packet: unknown): string[] {
  const violations: string[] = [];

  // Must be an object
  if (typeof packet !== 'object' || packet === null) {
    violations.push('Packet must be a non-null object');
    return violations;
  }

  const p = packet as Record<string, unknown>;

  // Required: manifest
  if (!p.manifest || typeof p.manifest !== 'object') {
    violations.push('Missing or invalid manifest');
  } else {
    const manifest = p.manifest as Record<string, unknown>;
    if (typeof manifest.jobId !== 'string' || !manifest.jobId) {
      violations.push('manifest.jobId must be a non-empty string');
    }
    if (typeof manifest.contentHash !== 'string' || !manifest.contentHash) {
      violations.push('manifest.contentHash must be a non-empty string');
    }
    if (typeof manifest.schema !== 'string') {
      violations.push('manifest.schema must be a string');
    }
  }

  // Required: drillMap
  if (!p.drillMap || typeof p.drillMap !== 'object') {
    violations.push('Missing or invalid drillMap');
  } else {
    const dm = p.drillMap as Record<string, unknown>;
    if (!Array.isArray(dm.panels)) {
      violations.push('drillMap.panels must be an array');
    }
  }

  // Required: connectors
  if (!p.connectors || typeof p.connectors !== 'object') {
    violations.push('Missing or invalid connectors');
  } else {
    const conn = p.connectors as Record<string, unknown>;
    if (!Array.isArray(conn.minifix)) {
      violations.push('connectors.minifix must be an array');
    }
  }

  // Required: cutList
  if (!p.cutList || typeof p.cutList !== 'object') {
    violations.push('Missing or invalid cutList');
  }

  // Required: gateResult
  if (!p.gateResult || typeof p.gateResult !== 'object') {
    violations.push('Missing or invalid gateResult');
  }

  return violations;
}

// ============================================
// G9 ASSERTION (RUNTIME BOUNDARY)
// ============================================

/**
 * Assert that a FactoryPacket is valid for OperationGraph entry.
 *
 * This is the G9 runtime boundary. Call this function before passing
 * any FactoryPacket to buildOperationGraph() if the packet came from
 * an external source (file, API, import).
 *
 * @param packet - Untrusted FactoryPacket to validate
 * @param source - Optional source description for error messages
 * @returns ValidatedFactoryPacket (branded type)
 * @throws G9ViolationError with code MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH
 *
 * @example
 * ```typescript
 * // Loading packet from file (untrusted)
 * const raw = JSON.parse(fileContent);
 * const validated = assertValidatedPacket(raw, 'file:packet.json');
 * const result = buildOperationGraph(validated, machine);
 *
 * // Building packet internally (trusted - no assertion needed)
 * const { packet } = await buildFactoryPacket(input, context);
 * const validated = markPacketAsValidated(packet); // Internal trust
 * const result = buildOperationGraph(validated, machine);
 * ```
 */
export function assertValidatedPacket(
  packet: unknown,
  source?: string
): ValidatedFactoryPacket {
  const violations = validatePacketStructure(packet);

  if (violations.length > 0) {
    throw new G9ViolationError(violations, source);
  }

  // All checks passed - brand the packet
  return packet as ValidatedFactoryPacket;
}

/**
 * Assert packet is valid (safe version, returns result).
 *
 * @param packet - Untrusted packet to validate
 * @param source - Optional source description
 * @returns Result with branded packet or violations
 */
export function assertValidatedPacketSafe(
  packet: unknown,
  source?: string
): { ok: true; packet: ValidatedFactoryPacket } | { ok: false; violations: string[]; error: G9ViolationError } {
  const violations = validatePacketStructure(packet);

  if (violations.length > 0) {
    return {
      ok: false,
      violations,
      error: new G9ViolationError(violations, source),
    };
  }

  return {
    ok: true,
    packet: packet as ValidatedFactoryPacket,
  };
}

// ============================================
// TRUSTED PATH HELPERS
// ============================================

/**
 * Trusted source identifiers for packet validation.
 *
 * Only these sources are allowed to use markPacketAsValidated().
 * CI will enforce this via bypass scan patterns.
 */
export type TrustedPacketSource =
  | 'internal:buildFactoryPacket'
  | 'internal:buildFactoryPacketFromStores'
  | 'internal:factoryExport'
  | 'internal:dxfExport'
  | 'internal:gcodeGeneration'
  | 'test:fixture';

/**
 * Trusted modules allowlist.
 *
 * ONLY these file patterns may call markPacketAsValidated().
 * CI bypass scan will enforce this.
 */
export const TRUSTED_MODULES_ALLOWLIST = [
  '**/factory/packet/buildFactoryPacket.ts',
  '**/factory/cnc/generateGcodeForJob.ts',
  '**/core/export/dxfExportFromOperationGraph.ts',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.test.tsx',
] as const;

/**
 * Mark an internally-built packet as validated.
 *
 * ⚠️ INTERNAL TRUSTED PATH ONLY - Do not call with external data!
 *
 * Use this ONLY for packets built via buildFactoryPacket() or
 * buildFactoryPacketFromStores(). These paths are trusted because
 * they read from Zustand stores that have already been validated
 * at the persistence boundary (G9 entry point).
 *
 * ALLOWED CALLERS (enforced by CI):
 * - factory/packet/buildFactoryPacket.ts
 * - factory/cnc/generateGcodeForJob.ts
 * - core/export/dxfExportFromOperationGraph.ts
 * - Test files (__tests__/*, *.test.ts)
 *
 * @param packet - Packet from trusted internal build
 * @param source - Trusted source identifier (for audit trail)
 * @returns ValidatedFactoryPacket (branded)
 *
 * @example
 * ```typescript
 * // In buildFactoryPacket.ts (trusted)
 * const { packet } = await buildFactoryPacket(input, context);
 * const validated = markPacketAsValidated(packet, 'internal:buildFactoryPacket');
 *
 * // In test file (trusted)
 * const validated = markPacketAsValidated(mockPacket, 'test:fixture');
 * ```
 */
export function markPacketAsValidated(
  packet: FactoryPacket,
  source?: TrustedPacketSource
): ValidatedFactoryPacket {
  // Log source for audit trail in development
  if (process.env.NODE_ENV === 'development' && source) {
    // Audit trail - can be captured by logging system
    (packet as unknown as Record<string, unknown>).__g9_trusted_source = source;
  }

  // No validation needed - this path is trusted
  // The brand is applied directly
  return packet as ValidatedFactoryPacket;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if an error is a G9 violation.
 */
export function isG9ViolationError(error: unknown): error is G9ViolationError {
  return error instanceof G9ViolationError;
}

/**
 * Check if error has the G9 violation code.
 */
export function hasG9ViolationCode(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) {
    return (error as { code: string }).code === G9_ERROR_CODE;
  }
  return false;
}
