/**
 * reasonCodes.ts - Stable Trust Kernel reason-code registry
 *
 * The single source of truth for the machine-readable error vocabulary shared
 * by UI, API, CI, and the standalone verifier (design §13). Codes are stable
 * string literals grouped by namespace; adding a code is a versioned protocol
 * change, never an ad-hoc string at a call site.
 *
 * Phase: NOT_FOR_PRODUCTION. Types and constants only.
 *
 * @version 0.13.2
 */

// ============================================================================
// Registry (design §13 - 8 namespaces)
// ============================================================================

/**
 * The complete stable reason-code registry from the approved design §13.
 * The order is grouped by namespace and is not semantically significant.
 */
export const TRUST_REASON_CODES = [
  // AUTH - identity, membership, scope, separation of duties, action context
  'AUTH_REQUIRED',
  'AUTH_ANON_NOT_ALLOWED',
  'AUTH_MEMBERSHIP_REVOKED',
  'AUTH_SCOPE_DENIED',
  'AUTH_SOD_VIOLATION',
  'AUTH_ACTION_CONTEXT_INVALID',
  'AUTH_ACTION_CONTEXT_EXPIRED',

  // STATE - candidate/authorization freshness, CAS conflict, revocation, idempotency
  'STATE_CANDIDATE_STALE',
  'STATE_RELEASE_AUTHORIZATION_STALE',
  'STATE_CONFLICT',
  'STATE_RELEASE_REVOKED',
  'STATE_IDEMPOTENCY_MISMATCH',

  // GATE - hard blockers and warning-exception handling
  'GATE_HARD_BLOCKER',
  'GATE_WARNING_EXCEPTION_EXPIRED',
  'GATE_WARNING_EXCEPTION_MISMATCH',

  // CAP - machine capability and profile attestation
  'CAP_UNKNOWN_TOOL',
  'CAP_UNSUPPORTED_OPERATION',
  'CAP_PROFILE_MISMATCH',
  'CAP_PROFILE_ATTESTATION_INVALID',
  'CAP_PROFILE_ATTESTATION_EXPIRED',
  'CAP_PARAMETER_RANGE',

  // PACKET - envelope, schema, and content integrity
  'PACKET_SCHEMA_UNSUPPORTED',
  'PACKET_HASH_MISMATCH',
  'PACKET_EXTRA_FILE',
  'PACKET_RESOURCE_LIMIT',

  // CRYPTO - managed signing and signature verification
  'CRYPTO_SIGNER_UNAVAILABLE',
  'CRYPTO_SIGNATURE_INVALID',
  'CRYPTO_ALGORITHM_DENIED',

  // TRUST - trust/release-status bundle freshness and provenance
  'TRUST_BUNDLE_EXPIRED',
  'TRUST_SEQUENCE_ROLLBACK',
  'TRUST_SCOPE_MISMATCH',
  'TRUST_CLOCK_UNAVAILABLE',
  'TRUST_CHECKPOINT_REQUIRED',
  'TRUST_FRESHNESS_UNPROVEN',

  // STORE - private artifact store and P2 plaintext containment
  'STORE_QUARANTINE_FAILED',
  'STORE_HASH_MISMATCH',
  'STORE_ARTIFACT_UNAVAILABLE',
  'STORE_PLAINTEXT_ACCESS_DENIED',
] as const;

/** A stable machine-readable reason code from the design §13 registry. */
export type TrustReasonCode = (typeof TRUST_REASON_CODES)[number];

/** Runtime membership check against the stable registry. */
export function isTrustReasonCode(value: unknown): value is TrustReasonCode {
  return typeof value === 'string' && (TRUST_REASON_CODES as readonly string[]).includes(value);
}
