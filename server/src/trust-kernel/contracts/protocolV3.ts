/**
 * protocolV3.ts - FactoryPacket V3 protocol contracts
 *
 * Versioned TypeScript types for the MONOLITH Production Trust Kernel, encoding
 * the approved design (2026-07-22) sections 6 (domain model), 7 (authorization),
 * 8 (component contracts), 11 (determinism/crypto), 12 (capability safety), and
 * 13 (error model). Names and fields track the written spec; where the spec
 * describes what a hash "covers" rather than an explicit field list, the field
 * shape here is a faithful structuring of that prose (noted in the design deltas
 * of the Task 1 report).
 *
 * `protocolV3.schema.json` mirrors these types with `additionalProperties:false`
 * at every signed boundary.
 *
 * Phase: NOT_FOR_PRODUCTION. Types only; no runtime behaviour.
 *
 * @version 0.13.2
 */

import type { TrustReasonCode } from '../reasonCodes.js';
import type {
  WorkingRevisionStatus,
  ReleaseAttemptStatus,
  ArtifactStatus,
  ReleaseRevisionStatus,
} from '../result.js';

export type {
  WorkingRevisionStatus,
  ReleaseAttemptStatus,
  ArtifactStatus,
  ReleaseRevisionStatus,
};

// ============================================================================
// Shared scalar aliases and enums
// ============================================================================

/** 64-character lowercase-hex SHA-256 digest. */
export type Sha256Hex = string;
/** ISO-8601 UTC timestamp. */
export type Iso8601 = string;

/** Authorization roles (design §7.3). */
export type TrustRole =
  | 'DESIGNER'
  | 'RELEASE_APPROVER'
  | 'FACTORY'
  | 'SAFETY_REVOKER'
  | 'ADMIN'
  | 'QA_EVIDENCE';

/** Actions a `VerifiedActionContextV1` may permit (design §10). */
export type PermittedAction = 'FREEZE' | 'RELEASE' | 'REVOKE' | 'GRANT_WARNING_EXCEPTION';

/** Artifact Class Matrix (design §9). */
export type ArtifactClass = 'P0_PREVIEW' | 'P1_REVIEW' | 'P2_MANUFACTURING' | 'P3_DISTRIBUTION';

/** Pinned managed signing algorithm (design §11.2). */
export type SignatureAlgorithm = 'ed25519';

/** Trusted key purpose (design §11.3). */
export type KeyPurpose = 'RELEASE' | 'PROFILE_ATTESTATION' | 'WARNING_EXCEPTION';

/** Key-revocation semantics; the explicit mode is the sole source of meaning (design §11.3). */
export type RevocationMode = 'ALL_SIGNATURES' | 'SIGNED_AT_OR_AFTER' | 'ISSUANCE_DISABLED';

/** High-water-mark bundle discriminator, keyed with trust scope (design §11.3). */
export type TrustBundleType = 'TRUST' | 'RELEASE_STATUS';

/** Signature envelope carried by every signed contract. */
export interface SignatureEnvelopeV1 {
  alg: SignatureAlgorithm;
  keyId: string;
  sig: string;
}

// ============================================================================
// 1. TenantScopeV1 (design §6.1)
// ============================================================================

export interface TenantScopeV1 {
  tenantId: string;
  orgId: string;
  siteId: string;
  policyVersion: string;
}

// ============================================================================
// 2. ActorContextV1 (design §7.1, §8)
// ============================================================================

export interface ActorContextV1 {
  tenantScope: TenantScopeV1;
  userId: string;
  roles: TrustRole[];
  aal: string;
  membershipVersion: number;
}

// ============================================================================
// 3. VerifiedActionContextV1 (design §7.2)
// ============================================================================

export interface VerifiedActionContextV1 {
  actionContextId: string;
  tenantScope: TenantScopeV1;
  actorUserId: string;
  roles: TrustRole[];
  aal: string;
  membershipVersion: number;
  permittedAction: PermittedAction;
  candidateHash: Sha256Hex | null;
  releaseAuthorizationHash: Sha256Hex | null;
  requestHash: Sha256Hex;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  nonce: string;
}

// ============================================================================
// 4. WorkingRevision (design §6.2)
// ============================================================================

export interface WorkingRevision {
  workingRevisionId: string;
  parentRevisionId: string | null;
  tenantScope: TenantScopeV1;
  status: WorkingRevisionStatus;
  contentRefs: string[];
  creatorUserId: string;
  freezerUserId: string | null;
  frozenAt: Iso8601 | null;
  candidateHash: Sha256Hex | null;
  policyVersion: string;
  profileVersion: string;
}

// ============================================================================
// 5. ReleaseCandidate (design §6.3)
// ============================================================================

export interface ReleaseCandidate {
  candidateHash: Sha256Hex;
  tenantScope: TenantScopeV1;
  workingRevisionId: string;
  snapshotHash: Sha256Hex;
  gateInputsHash: Sha256Hex;
  machineProfileHash: Sha256Hex;
  attestationId: string;
  attestationHash: Sha256Hex;
  policyVersion: string;
  requiredArtifactClasses: ArtifactClass[];
  sortedGrantHashes: Sha256Hex[];
  releaseAuthorizationHash: Sha256Hex | null;
}

// ============================================================================
// 6. ReleaseAttempt (design §6.4)
// ============================================================================

export interface ReleaseAttempt {
  releaseAttemptId: string;
  tenantScope: TenantScopeV1;
  actorUserId: string;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  idempotencyKey: string;
  requestHash: Sha256Hex;
  status: ReleaseAttemptStatus;
  releaseRevisionId: string | null;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

// ============================================================================
// 7. ReleaseSnapshotV3 (design §8, §10, §11.1)
// ============================================================================

export interface ReleaseSnapshotV3 {
  snapshotHash: Sha256Hex;
  tenantScope: TenantScopeV1;
  workingRevisionId: string;
  candidateHash: Sha256Hex;
  contentRefs: string[];
  machineProfileHash: Sha256Hex;
  policyVersion: string;
  profileVersion: string;
}

// ============================================================================
// 8. MachineCapabilityProfileV1 (design §12)
// ============================================================================

export interface CapabilityToolV1 {
  toolId: string;
  description?: string;
}

export interface CapabilityRangeV1 {
  parameter: string;
  min: number;
  max: number;
  unit: string;
}

export interface MachineCapabilityProfileV1 {
  machineId: string;
  dialectVersion: string;
  supportedOperationTypes: string[];
  tools: CapabilityToolV1[];
  ranges: CapabilityRangeV1[];
  faces: string[];
  units: string;
  coordinateConventions: string;
  postprocessorVersion: string;
}

// ============================================================================
// 9. MachineProfileAttestationV1 (design §12) - signed boundary
// ============================================================================

export interface MachineProfileAttestationV1 {
  attestationId: string;
  tenantId: string;
  siteId: string;
  machineId: string;
  profileHash: Sha256Hex;
  toolLibraryHash: Sha256Hex;
  postprocessorId: string;
  postprocessorVersion: string;
  postprocessorBinaryHash: Sha256Hex;
  approverUserId: string;
  issuedAt: Iso8601;
  validFrom: Iso8601;
  validUntil: Iso8601;
  status: string;
  attestationSequence: number;
  signature: SignatureEnvelopeV1;
}

// ============================================================================
// 10. WarningExceptionGrantV1 (design §12) - signed boundary
// ============================================================================

export interface WarningExceptionGrantV1 {
  grantId: string;
  warningCode: string;
  entityIds: string[];
  tenantId: string;
  siteId: string;
  candidateHash: Sha256Hex;
  reason: string;
  policyVersion: string;
  approverUserIds: string[];
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  signature: SignatureEnvelopeV1;
}

// ============================================================================
// 11. CapabilityReportV1 (design §8, §12)
// ============================================================================

export interface CapabilityBlockerV1 {
  reasonCode: TrustReasonCode;
  operationRef: string;
  detail?: Record<string, string>;
}

export interface CapabilityReportV1 {
  reportHash: Sha256Hex;
  machineProfileHash: Sha256Hex;
  supported: boolean;
  evaluatedOperationCount: number;
  blockers: CapabilityBlockerV1[];
}

// ============================================================================
// 12. FactoryPacketManifestV3 (design §8, §11, §14) - signed boundary
// ============================================================================

export interface PacketFileEntryV3 {
  path: string;
  sha256: Sha256Hex;
  bytes: number;
}

export interface FactoryPacketManifestV3 {
  schemaVersion: 'V3';
  tenantScope: TenantScopeV1;
  releaseRevisionId: string;
  candidateHash: Sha256Hex;
  files: PacketFileEntryV3[];
  contentHash: Sha256Hex;
}

// ============================================================================
// 13. ReleaseCertificateV1 (design §8, §10, §11.2) - signed boundary
// ============================================================================

export interface ReleaseCertificateV1 {
  releaseRevisionId: string;
  tenantScope: TenantScopeV1;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  sortedGrantHashes: Sha256Hex[];
  attestationId: string;
  attestationHash: Sha256Hex;
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  signerKeyId: string;
  algorithm: SignatureAlgorithm;
  releaseSequence: number;
  releasedAt: Iso8601;
  signature: SignatureEnvelopeV1;
}

// ============================================================================
// 14. ArtifactRecordV1 (design §6.5)
// ============================================================================

export interface ArtifactRecordV1 {
  artifactId: string;
  tenantScope: TenantScopeV1;
  artifactClass: ArtifactClass;
  releaseAttemptId: string;
  releaseRevisionId: string | null;
  status: ArtifactStatus;
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  objectLocator: string;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

// ============================================================================
// 15. ReleaseRevision (design §6.6)
// ============================================================================

export interface ApprovalEvidenceV1 {
  approverUserId: string;
  membershipVersion: number;
  aal: string;
  decisionAt: Iso8601;
  reason: string;
}

export interface ReleaseRevision {
  releaseRevisionId: string;
  tenantScope: TenantScopeV1;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  sortedGrantHashes: Sha256Hex[];
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  releaseCertificate: ReleaseCertificateV1;
  approverUserId: string;
  approvalEvidence: ApprovalEvidenceV1;
  attestationId: string;
  attestationHash: Sha256Hex;
  parentReleaseRevisionId: string | null;
  status: ReleaseRevisionStatus;
  releaseSequence: number;
  releasedAt: Iso8601;
}

// ============================================================================
// 16. TrustBundleV1 (design §11.3) - signed boundary
// ============================================================================

export interface TrustedKeyV1 {
  keyId: string;
  purpose: KeyPurpose;
  algorithm: SignatureAlgorithm;
  validFrom: Iso8601;
  validUntil: Iso8601;
}

export interface KeyRevocationV1 {
  keyId: string;
  revocationMode: RevocationMode;
  effectiveAt: Iso8601;
  reason: string;
}

/** Revocation entry binding ID/hash, effectiveAt, and reason (design §11.3). */
export interface RevocationEntryV1 {
  id: string;
  hash: Sha256Hex;
  effectiveAt: Iso8601;
  reason: string;
}

export interface TrustBundleV1 {
  bundleType: 'TRUST';
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  trustedKeys: TrustedKeyV1[];
  keyRevocations: KeyRevocationV1[];
  profileAttestationRevocations: RevocationEntryV1[];
  warningExceptionGrantRevocations: RevocationEntryV1[];
  signature: SignatureEnvelopeV1;
}

// ============================================================================
// 17. ReleaseStatusBundleV1 (design §11.3) - signed boundary
// ============================================================================

export interface ReleaseStatusBundleV1 {
  bundleType: 'RELEASE_STATUS';
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  revokedReleaseRevisionIds: string[];
  signature: SignatureEnvelopeV1;
}

// ============================================================================
// 18. VerificationReportV1 (design §14)
// ============================================================================

export type VerificationVerdict = 'PASS' | 'FAIL';

export interface VerificationReportV1 {
  verdict: VerificationVerdict;
  reasonCodes: TrustReasonCode[];
  checkedHashes: Record<string, Sha256Hex>;
  bundleSequences: Record<string, number>;
  verifierBuildHash: Sha256Hex;
  validAsOf: Iso8601;
  freshnessAgeSeconds: number;
  checkpoint: string | null;
  summary: string;
}

// ============================================================================
// 19. EvidenceAttestationV1 (design §13, §16.4) - signed boundary
// ============================================================================

export interface GitRootStateV1 {
  root: string;
  commit: string;
  branch: string;
  dirtyFiles: string[];
}

export interface EvidenceAttestationV1 {
  gitState: GitRootStateV1[];
  commandDigests: Sha256Hex[];
  reportDigests: Sha256Hex[];
  ciRunId: string;
  workflowIdentity: string;
  builderBinaryHash: Sha256Hex;
  verifierBinaryHash: Sha256Hex;
  issuedAt: Iso8601;
  retentionPolicy: string;
  evidenceRootHash: Sha256Hex;
  signerKeyId: string;
  signature: SignatureEnvelopeV1;
}
