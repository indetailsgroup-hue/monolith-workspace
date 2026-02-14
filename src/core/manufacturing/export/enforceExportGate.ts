// src/core/manufacturing/export/enforceExportGate.ts
/**
 * Export Gate Enforcement.
 *
 * Central enforcement function that MUST be called server-side.
 * UI disable buttons are NOT enforcement - this is.
 *
 * "Nothing reaches the factory without passing the Gate."
 *
 * v0.10.8.5 - Cross-Language Signing
 */

import { ExportBlockCode } from "./exportGate.v1";
import { ToolpathManifestV1 } from "../manifest/toolpathManifest.v1";
import { stableStringify, sha256 } from "../audit/hashing";
import {
  verifySignatureWithPinnedKeys,
  PinnedKeySetV1,
} from "./sigVerify";

// =============================================================================
// GATE CONTEXT
// =============================================================================

/**
 * Spec state for gate context.
 */
export type GateSpecState = "DRAFT" | "FROZEN" | "RELEASED";

/**
 * Gate verdict (pass/fail).
 */
export type GateVerdict = "PASS" | "FAIL";

/**
 * Export gate context.
 *
 * All inputs for gate enforcement decision.
 */
export interface ExportGateContext {
  /** Spec state */
  specState: GateSpecState;

  /** Gate report status */
  gateStatus: GateVerdict;

  /** Simulation verdicts (one per sheet) */
  simVerdicts: GateVerdict[];

  /** Verifier badge statuses (one per sheet) */
  verifierBadges: GateVerdict[];

  /** Consistency verdicts (one per sheet) */
  consistencyVerdicts: GateVerdict[];

  /** Toolpath manifest (required) */
  manifest?: ToolpathManifestV1;

  /** Whether signature is required (policy) */
  signatureRequired: boolean;

  /** Pinned key set for signature verification (required if signatureRequired) */
  pinnedKeySet?: PinnedKeySetV1;

  /** Whether to verify signature against pinned keys (default: true if signatureRequired) */
  verifySignature?: boolean;
}

/**
 * Enforcement decision.
 */
export type EnforcementDecision =
  | { ok: true }
  | { ok: false; code: ExportBlockCode; detail?: Record<string, unknown> };

// =============================================================================
// ENFORCEMENT FUNCTION
// =============================================================================

/**
 * Enforce export gate.
 *
 * THIS IS THE CENTRAL ENFORCEMENT - MUST BE CALLED SERVER-SIDE.
 *
 * Export is BLOCKED unless ALL conditions are true:
 * 1. specState === "RELEASED"
 * 2. gateStatus === "PASS"
 * 3. ALL simVerdicts === "PASS"
 * 4. ALL verifierBadges === "PASS"
 * 5. ALL consistencyVerdicts === "PASS"
 * 6. manifest exists
 * 7. manifest.chain.manifestHash matches recomputed hash
 * 8. (if signatureRequired) manifest.signature.scheme !== "NONE"
 *
 * @param ctx Export gate context
 * @returns Enforcement decision
 */
export async function enforceExportGate(
  ctx: ExportGateContext
): Promise<EnforcementDecision> {
  // 1) Spec must be RELEASED
  if (ctx.specState !== "RELEASED") {
    return {
      ok: false,
      code: "E_SPEC_NOT_RELEASED",
      detail: { actual: ctx.specState },
    };
  }

  // 2) Gate report must PASS
  if (ctx.gateStatus !== "PASS") {
    return {
      ok: false,
      code: "E_GATE_NOT_PASS",
      detail: { actual: ctx.gateStatus },
    };
  }

  // 3) ALL sim reports must PASS
  const failedSimIndex = ctx.simVerdicts.findIndex((v) => v === "FAIL");
  if (failedSimIndex !== -1) {
    return {
      ok: false,
      code: "E_SIM_FAIL",
      detail: {
        failedIndex: failedSimIndex,
        verdicts: ctx.simVerdicts,
      },
    };
  }

  // 4) ALL verifier reports must PASS
  const failedVerifyIndex = ctx.verifierBadges.findIndex((v) => v === "FAIL");
  if (failedVerifyIndex !== -1) {
    return {
      ok: false,
      code: "E_VERIFY_FAIL",
      detail: {
        failedIndex: failedVerifyIndex,
        badges: ctx.verifierBadges,
      },
    };
  }

  // 5) ALL consistency reports must PASS
  const failedConsistencyIndex = ctx.consistencyVerdicts.findIndex(
    (v) => v === "FAIL"
  );
  if (failedConsistencyIndex !== -1) {
    return {
      ok: false,
      code: "E_CONSISTENCY_FAIL",
      detail: {
        failedIndex: failedConsistencyIndex,
        verdicts: ctx.consistencyVerdicts,
      },
    };
  }

  // 6) Manifest must exist
  const m = ctx.manifest;
  if (!m) {
    return { ok: false, code: "E_MANIFEST_MISSING" };
  }

  // 7) Manifest hash must match recomputed
  const hashValid = await verifyManifestHashInternal(m);
  if (!hashValid.ok) {
    return {
      ok: false,
      code: "E_MANIFEST_HASH_MISMATCH",
      detail: {
        stated: m.chain.manifestHash.hex,
        recomputed: hashValid.computed,
      },
    };
  }

  // 8) Signature required check
  if (ctx.signatureRequired && m.signature.scheme === "NONE") {
    return {
      ok: false,
      code: "E_SIGNATURE_REQUIRED",
      detail: { signatureScheme: m.signature.scheme },
    };
  }

  // 9) Signature verification with pinned keys (if required)
  const shouldVerifySignature = ctx.verifySignature ?? ctx.signatureRequired;
  if (shouldVerifySignature && m.signature.scheme !== "NONE") {
    // Must have pinned key set
    if (!ctx.pinnedKeySet) {
      return {
        ok: false,
        code: "E_SIGNATURE_REQUIRED",
        detail: { reason: "Pinned key set required for signature verification" },
      };
    }

    // Must have signature data
    if (!m.signature.signatureHex || !m.signature.publicKeyId) {
      return {
        ok: false,
        code: "E_SIGNATURE_REQUIRED",
        detail: {
          reason: "Missing signature data",
          hasSignatureHex: !!m.signature.signatureHex,
          hasPublicKeyId: !!m.signature.publicKeyId,
        },
      };
    }

    // Verify signature against pinned keys
    const verifyResult = await verifySignatureWithPinnedKeys(
      m.chain.manifestHash.hex,
      m.signature.signatureHex,
      m.signature.publicKeyId,
      ctx.pinnedKeySet
    );

    if (!verifyResult.ok) {
      // Map signature verification error codes to export block codes
      const blockCode: ExportBlockCode =
        verifyResult.code === "KEY_NOT_ALLOWED"
          ? "E_PERMISSION_DENIED"
          : verifyResult.code === "SIGNATURE_INVALID"
            ? "E_MANIFEST_HASH_MISMATCH"
            : "E_SIGNATURE_REQUIRED";

      return {
        ok: false,
        code: blockCode,
        detail: {
          signatureVerification: verifyResult.code,
          ...verifyResult.detail,
        },
      };
    }
  }

  // ALL CHECKS PASSED
  return { ok: true };
}

/**
 * Verify manifest hash internally.
 */
async function verifyManifestHashInternal(
  m: ToolpathManifestV1
): Promise<{ ok: true } | { ok: false; computed: string }> {
  // Reconstruct unsigned content (same as buildToolpathManifest)
  const unsignedContent = {
    version: m.version,
    createdAtIso: m.createdAtIso,
    job: m.job,
    manufacturingTruth: m.manufacturingTruth,
    toolpath: m.toolpath,
    gate: m.gate,
  };

  const computed = await sha256(stableStringify(unsignedContent));

  if (computed === m.chain.manifestHash.hex.toLowerCase()) {
    return { ok: true };
  }

  return { ok: false, computed };
}

// =============================================================================
// SYNC ENFORCEMENT (for quick checks)
// =============================================================================

/**
 * Quick sync check (without manifest hash verification).
 *
 * Use for UI display only - NOT for enforcement.
 */
export function quickExportGateCheck(
  ctx: Omit<ExportGateContext, "manifest" | "signatureRequired"> & {
    hasManifest: boolean;
  }
): { canExport: boolean; firstBlockCode?: ExportBlockCode } {
  if (ctx.specState !== "RELEASED") {
    return { canExport: false, firstBlockCode: "E_SPEC_NOT_RELEASED" };
  }

  if (ctx.gateStatus !== "PASS") {
    return { canExport: false, firstBlockCode: "E_GATE_NOT_PASS" };
  }

  if (ctx.simVerdicts.some((v) => v === "FAIL")) {
    return { canExport: false, firstBlockCode: "E_SIM_FAIL" };
  }

  if (ctx.verifierBadges.some((v) => v === "FAIL")) {
    return { canExport: false, firstBlockCode: "E_VERIFY_FAIL" };
  }

  if (ctx.consistencyVerdicts.some((v) => v === "FAIL")) {
    return { canExport: false, firstBlockCode: "E_CONSISTENCY_FAIL" };
  }

  if (!ctx.hasManifest) {
    return { canExport: false, firstBlockCode: "E_MANIFEST_MISSING" };
  }

  return { canExport: true };
}

// =============================================================================
// POLICY CONFIGURATION
// =============================================================================

/**
 * Export policy configuration.
 */
export interface ExportPolicy {
  /** Require signature for export */
  signatureRequired: boolean;

  /** Require all reports (sim, verify, consistency) */
  requireAllReports: boolean;

  /** Allowed spec states for export */
  allowedSpecStates: GateSpecState[];

  /** Allow export with warnings (but not failures) */
  allowWarnings: boolean;
}

/**
 * Default export policy (MVP - relaxed).
 */
export const DEFAULT_EXPORT_POLICY: ExportPolicy = {
  signatureRequired: false,
  requireAllReports: true,
  allowedSpecStates: ["RELEASED"],
  allowWarnings: true,
};

/**
 * Production export policy (strict).
 */
export const PRODUCTION_EXPORT_POLICY: ExportPolicy = {
  signatureRequired: true,
  requireAllReports: true,
  allowedSpecStates: ["RELEASED"],
  allowWarnings: false,
};

/**
 * Get effective signature requirement from policy.
 */
export function isSignatureRequired(
  policy: ExportPolicy = DEFAULT_EXPORT_POLICY
): boolean {
  return policy.signatureRequired;
}

// =============================================================================
// GATE SUMMARY
// =============================================================================

/**
 * Export gate summary.
 */
export interface ExportGateSummary {
  /** Can export */
  canExport: boolean;

  /** First block code (if blocked) */
  blockCode?: ExportBlockCode;

  /** Check details */
  checks: {
    specReleased: boolean;
    gatePassed: boolean;
    simPassed: boolean;
    verifyPassed: boolean;
    consistencyPassed: boolean;
    manifestPresent: boolean;
    manifestHashValid: boolean;
    signaturePresent: boolean;
    signatureVerified: boolean;
    publicKeyAllowed: boolean;
  };
}

/**
 * Get export gate summary.
 *
 * @param ctx Export gate context
 * @returns Gate summary
 */
export async function getExportGateSummary(
  ctx: ExportGateContext
): Promise<ExportGateSummary> {
  const specReleased = ctx.specState === "RELEASED";
  const gatePassed = ctx.gateStatus === "PASS";
  const simPassed = ctx.simVerdicts.every((v) => v === "PASS");
  const verifyPassed = ctx.verifierBadges.every((v) => v === "PASS");
  const consistencyPassed = ctx.consistencyVerdicts.every((v) => v === "PASS");
  const manifestPresent = !!ctx.manifest;

  let manifestHashValid = false;
  if (ctx.manifest) {
    const hashResult = await verifyManifestHashInternal(ctx.manifest);
    manifestHashValid = hashResult.ok;
  }

  const signaturePresent =
    !!ctx.manifest && ctx.manifest.signature.scheme !== "NONE";

  // Check signature verification
  let signatureVerified = false;
  let publicKeyAllowed = false;

  if (
    signaturePresent &&
    ctx.manifest?.signature.signatureHex &&
    ctx.manifest?.signature.publicKeyId &&
    ctx.pinnedKeySet
  ) {
    const verifyResult = await verifySignatureWithPinnedKeys(
      ctx.manifest.chain.manifestHash.hex,
      ctx.manifest.signature.signatureHex,
      ctx.manifest.signature.publicKeyId,
      ctx.pinnedKeySet
    );

    if (verifyResult.ok) {
      signatureVerified = true;
      publicKeyAllowed = true;
    } else if (verifyResult.code === "KEY_NOT_ALLOWED") {
      publicKeyAllowed = false;
      signatureVerified = false;
    } else if (verifyResult.code === "SIGNATURE_INVALID") {
      publicKeyAllowed = true;
      signatureVerified = false;
    }
  }

  const decision = await enforceExportGate(ctx);

  return {
    canExport: decision.ok,
    blockCode: decision.ok ? undefined : decision.code,
    checks: {
      specReleased,
      gatePassed,
      simPassed,
      verifyPassed,
      consistencyPassed,
      manifestPresent,
      manifestHashValid,
      signaturePresent,
      signatureVerified,
      publicKeyAllowed,
    },
  };
}
