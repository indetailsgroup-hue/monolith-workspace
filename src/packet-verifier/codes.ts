// S17-5 Full Verifier — stable result codes (CT-DEC-002 v0.4.1 §13)
// Track: Claude (independent reviewer track — SoD per sign-off checklist §5).
// Stable codes and severity MUST NOT change per locale (§13); UI text may translate.

/** integrityStatus of the three-field result (§12 tail). */
export type IntegrityStatus = 'VERIFIED' | 'FAILED';

/** operationalDisposition — while shadow mode governs, NO_CUT is the only emittable value. */
export type OperationalDisposition = 'NO_CUT';

/**
 * Stable result codes (§13). `PKT_OK` is RESERVED by the spec: it must not be
 * emittable until a future governance-controlled production profile passes the
 * four-condition real-cut gate and bumps the normative version — therefore it
 * is deliberately ABSENT from this union (unreachable by construction).
 */
export type PacketResultCode =
  // success (shadow ceiling)
  | 'PKT_OK_SHADOW_ONLY'
  // container / limits (check 1)
  | 'PKT_ZIP_PROFILE_INVALID'
  | 'PKT_PATH_INVALID'
  | 'PKT_LIMIT_EXCEEDED'
  | 'PKT_FILENAME_INVALID'
  // parse (check 2)
  | 'PKT_SCHEMA_UNSUPPORTED'
  | 'PKT_JSON_NON_CANONICAL'
  | 'PKT_ATTESTATION_INVALID'
  // file set (check 3)
  | 'PKT_FILE_MISSING'
  | 'PKT_FILE_EXTRA'
  // byte integrity (check 4)
  | 'PKT_SIZE_MISMATCH'
  | 'PKT_HASH_MISMATCH'
  // identity (checks 5–7)
  | 'PKT_CONTENT_ID_MISMATCH'
  | 'PKT_MANIFEST_BINDING_MISMATCH'
  | 'PKT_IDENTITY_MISMATCH'
  // signature / keys (check 8)
  | 'PKT_SIGNATURE_MISSING'
  | 'PKT_SIGNATURE_INVALID'
  | 'PKT_KEY_UNKNOWN'
  | 'PKT_KEY_REVOKED'
  | 'PKT_KEY_NOT_YET_VALID'
  | 'PKT_KEY_EXPIRED'
  // authoritative (check 9)
  | 'PKT_AUTHORITY_UNAVAILABLE'
  | 'PKT_REVISION_NOT_RELEASED'
  | 'PKT_MACHINE_PROFILE_MISMATCH'
  | 'PKT_EXPORTER_UNTRUSTED'
  | 'PKT_GATE_FAILED'
  | 'PKT_GATE_EVIDENCE_MISMATCH'
  // run / replay (check 10)
  | 'PKT_JOB_RUN_CONFLICT'
  | 'PKT_IDEMPOTENCY_CONFLICT'
  // shadow policy (check 11)
  | 'PKT_NFP_POLICY_MISMATCH';

/** Failure codes = every stable code except the shadow-success ceiling. */
export type PacketFailureCode = Exclude<PacketResultCode, 'PKT_OK_SHADOW_ONLY'>;

/**
 * §12 check ladder — first-fail-wins: the primary result code comes from the
 * lowest-numbered failing check; later diagnostics never replace or downgrade it.
 */
export const CHECK_LADDER = [
  'container_safety', //  1
  'strict_parse', //  2
  'exact_file_set', //  3
  'byte_integrity', //  4
  'content_identity', //  5
  'manifest_binding', //  6
  'identity_consistency', //  7
  'signature', //  8
  'authoritative', //  9
  'run_replay', // 10
  'shadow_policy', // 11
  'audit_result', // 12
] as const;
export type CheckName = (typeof CHECK_LADDER)[number];

/** Three-field verifier result (§12 tail — success example is exactly this shape). */
export interface VerifierResult {
  integrityStatus: IntegrityStatus;
  operationalDisposition: OperationalDisposition;
  code: PacketResultCode;
  /** check that produced the primary code (first-fail-wins) */
  failedCheck?: CheckName;
  /** non-authoritative diagnostics; MUST NOT replace/downgrade the primary code */
  diagnostics: readonly string[];
}

export function shadowSuccess(diagnostics: readonly string[] = []): VerifierResult {
  return {
    integrityStatus: 'VERIFIED',
    operationalDisposition: 'NO_CUT',
    code: 'PKT_OK_SHADOW_ONLY',
    diagnostics,
  };
}

export function failure(
  code: PacketFailureCode,
  failedCheck: CheckName,
  diagnostics: readonly string[] = [],
): VerifierResult {
  return {
    integrityStatus: 'FAILED',
    operationalDisposition: 'NO_CUT',
    code,
    failedCheck,
    diagnostics,
  };
}

/** Shadow-mode source-filename contract (§6): regex over the *provided* source filename. */
export const NFP_FILENAME_REGEX =
  /^NFP-factory-packet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{12}\.zip$/;
