/**
 * proofTypes.ts - P12.1 Authority Proof Bundle Types
 *
 * Canonical types for proof bundle endpoint:
 * - ProofState: Server-authoritative state snapshot
 * - ProofLatestVerify: Most recent verification result
 * - ProofLatestExport: Most recent export success
 * - JobProof: Complete proof bundle response
 *
 * @version 0.12.13
 */

// ============================================================================
// Version Constant
// ============================================================================

export const PROOF_VERSION = 'MONOLITH_PROOF_V1' as const;

// ============================================================================
// Proof State Types
// ============================================================================

export type ProofSpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

export type ProofVerdict = 'PASS' | 'PASS_WITH_WARN' | 'FAIL' | 'UNKNOWN';

export interface ProofState {
  specState: ProofSpecState;
  revisionId?: string;
  packetSha256?: string;
  manifestSha256?: string;

  updatedAt?: string;
  frozenAt?: string;
  releasedAt?: string;
  revokedAt?: string;
}

// ============================================================================
// Proof Evidence Types
// ============================================================================

export interface ProofLatestVerify {
  at: string;
  verdict: ProofVerdict;
  code?: string;
  summary?: string;
}

export interface ProofLatestExport {
  at: string;
  dialect?: string;
  profileId?: string;
  mode?: string;
  target?: string;

  artifactSha256?: string;
  artifactName?: string;
}

export interface ProofLineageHead {
  revisionId?: string;
  at?: string;
}

// ============================================================================
// Invariant Warning Types
// ============================================================================

export type ProofWarningCode =
  | 'W_RELEASED_NO_REVISION'     // RELEASED state but no revisionId
  | 'W_INVALID_ARTIFACT_HASH'    // artifactSha256 is not valid hex sha256
  | 'W_PASS_WITH_WARN_EXPORTED'  // PASS_WITH_WARN verdict but canExport was true
  | 'W_MISSING_MANIFEST_HASH'    // FROZEN/RELEASED but no manifestSha256
  | 'W_LINEAGE_MISMATCH';        // lineageHead.revisionId doesn't match state.revisionId

export interface ProofWarning {
  code: ProofWarningCode;
  message: string;
}

// ============================================================================
// Proof Bundle Response Types
// ============================================================================

export interface JobProof {
  ok: true;
  version: typeof PROOF_VERSION;
  jobId: string;

  state: ProofState;

  latestVerify?: ProofLatestVerify;
  latestExport?: ProofLatestExport;

  lineageHead?: ProofLineageHead;

  canExport: boolean;
  canExportReason?: string;

  warnings?: ProofWarning[];

  generatedAt: string; // server time
}

export type ProofErrorCode = 'E_INVALID_JOBID' | 'E_INTERNAL' | 'E_NOT_FOUND';

export interface JobProofError {
  ok: false;
  jobId: string;
  code: ProofErrorCode;
  error: string;
}

export type JobProofResult = JobProof | JobProofError;
