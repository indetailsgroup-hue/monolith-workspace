/**
 * compileCapabilities.ts - Exhaustive, fail-closed capability compiler (design §12)
 *
 * The V3 capability compiler enumerates EVERY operation against the one canonical
 * machine profile and returns a stable `CAP_*` reason code with zero publishable
 * output on the first blocker it finds (design §12, §13): an unknown tool, an
 * unsupported operation, an out-of-range parameter, or an attestation not bound
 * to the profile. On PASS the report's `checkedOperationIds` is the SORTED set of
 * ALL input operation IDs - an operation is never silently dropped.
 *
 * `compileDialectToolBindings` is the dialect-emission defense (design §12): a
 * CIX/G-code layer re-derives tool numbers from the canonical profile and refuses
 * to emit for an unknown tool or unsupported operation EVEN when a forged upstream
 * `CapabilityReportV1` claims PASS. It never defaults an unknown tool to `TNO=1`.
 * The upstream report is accepted only as an argument to be ignored - the verdict
 * comes from the profile, not from any claimed report.
 *
 * Pure functions: no I/O, clock, or randomness. Full attestation signature/expiry
 * verification is Task 3's `verifyProfileAttestation`; the compiler enforces the
 * profile<->attestation binding and ACTIVE status, failing closed otherwise.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type { TrustReasonCode } from '../reasonCodes.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import { canonicalProfileHash } from './canonicalProfile.js';
import type {
  CapabilityReportV1,
  MachineProfileAttestationV1,
} from '../contracts/protocolV3.js';
import type {
  CanonicalMachineProfileV1,
  CapabilityOperationV1,
  CapabilitySnapshotV1,
  CompiledCapabilityReportV1,
  DialectToolBindingV1,
} from '../contracts/capability.js';

const REPORT_DOMAIN = 'MONOLITH/CapabilityReport/V1';

interface OperationBlocker {
  code: TrustReasonCode;
  detail: Record<string, string>;
}

/**
 * Compile the capability report for a snapshot against the canonical profile and
 * its attestation. Exhaustive and fail-closed: any blocker aborts with a stable
 * reason code and no report.
 */
export function compileCapabilities(
  snapshot: CapabilitySnapshotV1,
  profile: CanonicalMachineProfileV1,
  attestation: MachineProfileAttestationV1,
): TrustResult<CompiledCapabilityReportV1> {
  const machineProfileHash = canonicalProfileHash(profile);

  // 1. Attestation must be ACTIVE and bound to THIS canonical profile. (Full
  //    signature/scope/expiry verification is Task 3's verifyProfileAttestation.)
  if (attestation.status !== 'ACTIVE') {
    return err('CAP_PROFILE_ATTESTATION_INVALID', { status: String(attestation.status) });
  }
  if (attestation.profileHash !== machineProfileHash) {
    return err('CAP_PROFILE_ATTESTATION_INVALID', {
      reason: 'attestation not bound to canonical profile hash',
    });
  }

  // 2. The snapshot must be bound to the same canonical profile.
  if (snapshot.machineProfileHash !== machineProfileHash) {
    return err('CAP_PROFILE_MISMATCH', {
      reason: 'snapshot machineProfileHash does not match the canonical profile',
    });
  }

  // 3. Enumerate EVERY operation in input order; the first blocker fails closed.
  for (const operation of snapshot.operations) {
    const blocker = findOperationBlocker(operation, profile);
    if (blocker !== null) {
      return err(blocker.code, blocker.detail);
    }
  }

  // 4. PASS: the checked set is the sorted set of ALL input operation IDs.
  const checkedOperationIds = [...new Set(snapshot.operations.map((o) => o.operationId))].sort();
  const evaluatedOperationCount = snapshot.operations.length;
  const reportHash = sha256Hex(
    canonicalJson({
      domain: REPORT_DOMAIN,
      machineProfileHash,
      supported: true,
      evaluatedOperationCount,
      checkedOperationIds,
      blockers: [],
    }),
  );

  const report: CompiledCapabilityReportV1 = {
    reportHash,
    machineProfileHash,
    supported: true,
    evaluatedOperationCount,
    blockers: [],
    checkedOperationIds,
  };
  return ok(report);
}

/**
 * The dialect-emission defense (design §12). Re-derives each operation's machine
 * (T/TNO) number from the canonical profile and fails closed on an unknown tool
 * or unsupported operation. The `upstreamReport` is accepted only to be ignored:
 * a forged report claiming PASS cannot coerce emission, and an unknown tool is
 * NEVER defaulted to machine number 1.
 */
export function compileDialectToolBindings(
  snapshot: CapabilitySnapshotV1,
  profile: CanonicalMachineProfileV1,
  upstreamReport: CapabilityReportV1,
): TrustResult<DialectToolBindingV1[]> {
  // Independence: the verdict is derived from the profile, not the report.
  void upstreamReport;

  const bindings: DialectToolBindingV1[] = [];
  for (const operation of snapshot.operations) {
    if (!profile.operationCatalogue.includes(operation.operationType)) {
      return err('CAP_UNSUPPORTED_OPERATION', {
        operationId: operation.operationId,
        operationType: operation.operationType,
      });
    }
    const tool = profile.tools.find((t) => t.toolId === operation.toolId);
    if (tool === undefined) {
      return err('CAP_UNKNOWN_TOOL', {
        operationId: operation.operationId,
        toolId: operation.toolId,
      });
    }
    bindings.push({
      operationId: operation.operationId,
      toolId: operation.toolId,
      machineNumber: tool.machineNumber,
    });
  }
  return ok(bindings);
}

// ---------------------------------------------------------------------------
// Per-operation evaluation (pure)
// ---------------------------------------------------------------------------

function findOperationBlocker(
  operation: CapabilityOperationV1,
  profile: CanonicalMachineProfileV1,
): OperationBlocker | null {
  // Unsupported operation type.
  if (!profile.operationCatalogue.includes(operation.operationType)) {
    return {
      code: 'CAP_UNSUPPORTED_OPERATION',
      detail: { operationId: operation.operationId, operationType: operation.operationType },
    };
  }

  // Unknown tool - never defaulted.
  const tool = profile.tools.find((t) => t.toolId === operation.toolId);
  if (tool === undefined) {
    return {
      code: 'CAP_UNKNOWN_TOOL',
      detail: { operationId: operation.operationId, toolId: operation.toolId },
    };
  }

  // Unsupported face (only when the profile constrains faces).
  if (
    operation.face !== undefined &&
    profile.faces.length > 0 &&
    !profile.faces.includes(operation.face)
  ) {
    return {
      code: 'CAP_UNSUPPORTED_OPERATION',
      detail: { operationId: operation.operationId, face: operation.face, reason: 'unsupported face' },
    };
  }

  // Parameter ranges.
  for (const range of profile.ranges) {
    const value = operation.parameters[range.parameter];
    if (typeof value === 'number' && (value < range.min || value > range.max)) {
      return {
        code: 'CAP_PARAMETER_RANGE',
        detail: {
          operationId: operation.operationId,
          parameter: range.parameter,
          value: String(value),
          min: String(range.min),
          max: String(range.max),
        },
      };
    }
  }

  return null;
}
