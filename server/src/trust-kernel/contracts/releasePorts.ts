/**
 * releasePorts.ts - Release authority port + pure release state machine
 *
 * The TypeScript contract boundary for the MONOLITH Production Trust Kernel's
 * release authority (approved design 2026-07-22 §6 domain model & lifecycle,
 * §10 release transaction choreography). Two concerns live here:
 *
 *   1. `ReleaseAuthorityPort` — the async surface that mirrors the six release
 *      RPCs of migration 0182 (`rpc_trust_freeze`, `rpc_trust_begin_release`,
 *      `rpc_trust_commit_release`, `rpc_trust_mark_artifact_available`,
 *      `rpc_trust_void_artifact`, `rpc_trust_revoke`). Task 8's worker consumes
 *      this port; every method returns a typed `TrustResult` carrying a stable
 *      reason code from `../reasonCodes.js` on failure.
 *
 *   2. A pure, side-effect-free state machine (`RELEASE_TRANSITIONS` and the
 *      `canReleaseTransition` / `legalReleaseTargets` / `isTerminalReleaseStatus`
 *      / `isReleaseConsumable` helpers). Its state sets are DRIVEN from Task 1's
 *      status tuples (`../result.js`), so the machine can never drift from the
 *      authoritative status members. The database migration enforces the same
 *      machine at the authority boundary; this module lets the worker and UI
 *      reason about it without a round trip.
 *
 * `VOID` is a legal transition target for `attempt` and `artifact` only; it is
 * not a `release revision` status at all (design §6.6). A committed `ACTIVE`
 * revision is consumable only with an `AVAILABLE` artifact (design §10.2).
 *
 * Phase: NOT_FOR_PRODUCTION. Pure functions and types only; no I/O, no crypto.
 *
 * @version 0.13.2
 */

import type { TrustResult } from '../result.js';
import type {
  ReleaseAttemptStatus,
  ArtifactStatus,
  ReleaseRevisionStatus,
} from '../result.js';
import type { Sha256Hex, ReleaseCertificateV1 } from './protocolV3.js';

// ============================================================================
// Pure release state machine (design §6, §10) — driven from Task 1's tuples
// ============================================================================

/** The three release aggregates whose lifecycles this module pins. */
export const RELEASE_AGGREGATES = ['attempt', 'artifact', 'revision'] as const;
export type ReleaseAggregate = (typeof RELEASE_AGGREGATES)[number];

/**
 * The legal forward transitions of each release aggregate. Keys are exactly the
 * status members of Task 1's tuples; every target is itself a member of the same
 * tuple. Terminal states map to an empty target list (append-only history —
 * design §6.6, §6.7). `VOID` appears only under `attempt` and `artifact`.
 */
export const RELEASE_TRANSITIONS: {
  attempt: Readonly<Record<ReleaseAttemptStatus, readonly ReleaseAttemptStatus[]>>;
  artifact: Readonly<Record<ArtifactStatus, readonly ArtifactStatus[]>>;
  revision: Readonly<Record<ReleaseRevisionStatus, readonly ReleaseRevisionStatus[]>>;
} = {
  // PENDING preconditions passed; it may fail, publish, or void (§6.4, §10.2/§10.3).
  attempt: {
    PENDING: ['FAILED', 'PUBLISHED', 'VOID'],
    FAILED: [],
    PUBLISHED: [],
    VOID: [],
  },
  // QUARANTINED -> MATERIALIZING at commit; -> AVAILABLE after byte verification;
  // either pre-availability state may VOID (§6.5, §10.2/§10.3).
  artifact: {
    QUARANTINED: ['MATERIALIZING', 'VOID'],
    MATERIALIZING: ['AVAILABLE', 'VOID'],
    AVAILABLE: [],
    VOID: [],
  },
  // A committed release is immutable ACTIVE; the only transition is revocation.
  revision: {
    ACTIVE: ['REVOKED'],
    REVOKED: [],
  },
};

/** The legal transition targets of `status` for `aggregate` (empty if unknown/terminal). */
export function legalReleaseTargets(aggregate: ReleaseAggregate, status: string): readonly string[] {
  const table = RELEASE_TRANSITIONS[aggregate] as Readonly<Record<string, readonly string[]>>;
  return table[status] ?? [];
}

/** True iff `aggregate` may transition from `from` to `to`. Unknown states never transition. */
export function canReleaseTransition(aggregate: ReleaseAggregate, from: string, to: string): boolean {
  return legalReleaseTargets(aggregate, from).includes(to);
}

/** True iff `status` is a known, terminal (no-outgoing) state of `aggregate`. */
export function isTerminalReleaseStatus(aggregate: ReleaseAggregate, status: string): boolean {
  const table = RELEASE_TRANSITIONS[aggregate] as Readonly<Record<string, readonly string[]>>;
  const targets = table[status];
  return targets !== undefined && targets.length === 0;
}

/**
 * A committed `ACTIVE` release revision is consumable only when its artifact is
 * `AVAILABLE`; a `REVOKED` revision or a not-yet-`AVAILABLE` artifact is never
 * consumable (design §10.2, §10.4). The database mirrors this in
 * `assert_release_consumable`.
 */
export function isReleaseConsumable(revisionStatus: string, artifactStatus: string): boolean {
  return revisionStatus === 'ACTIVE' && artifactStatus === 'AVAILABLE';
}

// ============================================================================
// ReleaseAuthorityPort — mirrors the six release RPCs (consumed by Task 8)
// ============================================================================

/** `rpc_trust_freeze`: DRAFT -> FROZEN + candidate creation (design §10.1). */
export interface FreezeRequest {
  actionContextId: string;
  workingRevisionId: string;
  candidateHash: Sha256Hex;
  snapshotHash: Sha256Hex;
  gateInputsHash: Sha256Hex;
  machineProfileHash: Sha256Hex;
  attestationId: string;
  attestationHash: Sha256Hex;
  policyVersion: string;
}
export interface FreezeResult {
  candidateId: string;
}

/** `rpc_trust_begin_release`: consume context, four-eyes, allocate attempt (design §10.2). */
export interface BeginReleaseRequest {
  actionContextId: string;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  idempotencyKey: string;
  requestHash: Sha256Hex;
}
export interface BeginReleaseResult {
  attemptId: string;
  releaseRevisionId: string;
  releaseSequence: number;
  status: ReleaseAttemptStatus;
  idempotentReplay: boolean;
}

/** `rpc_trust_commit_release`: worker-only; ACTIVE revision + MATERIALIZING artifact (design §10.2). */
export interface CommitReleaseRequest {
  attemptId: string;
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  certificate: ReleaseCertificateV1;
  signerKeyId: string;
}
export interface CommitReleaseResult {
  releaseRevisionId: string;
}

/** `rpc_trust_mark_artifact_available`: worker-only; MATERIALIZING -> AVAILABLE (design §10.2). */
export interface MarkArtifactAvailableRequest {
  artifactId: string;
  contentHash: Sha256Hex;
}
export interface MarkArtifactAvailableResult {
  artifactId: string;
  status: ArtifactStatus;
}

/** `rpc_trust_void_artifact`: worker-only; VOID an uncommitted attempt/artifact (design §10.3). */
export interface VoidArtifactRequest {
  attemptId: string;
  reason: string;
}
export interface VoidArtifactResult {
  attemptId: string;
  status: ReleaseAttemptStatus;
}

/**
 * The four machine-readable revocation reason classes (migration 0185 CHECK,
 * design §10.4). Only `SAFETY` may later seed a deny-only content block (plan
 * Task 3 provenance rule). CHECK-extensible: adding a member is a versioned
 * change and must widen the SQL CHECK and this union together.
 */
export const REVOKE_REASON_CLASSES = ['SAFETY', 'OPERATIONAL', 'SUPERSEDED', 'ATTESTATION_STALE'] as const;
export type RevokeReasonClass = (typeof REVOKE_REASON_CLASSES)[number];

/** `rpc_trust_revoke`: consume context; ACTIVE -> REVOKED, append-only (design §10.4). */
export interface RevokeReleaseRequest {
  actionContextId: string;
  releaseRevisionId: string;
  reason: string;
  /** Required machine-readable classification of the revocation (migration 0185). */
  reasonClass: RevokeReasonClass;
}
export interface RevokeReleaseResult {
  releaseRevisionId: string;
  status: ReleaseRevisionStatus;
}

/**
 * The release authority surface. Postgres (migration 0182) is the sole
 * implementation of this port; the worker (Task 8) is a client. Every method is
 * one authorized transaction and returns a stable reason code on failure — the
 * port never throws for a domain error.
 */
export interface ReleaseAuthorityPort {
  freeze(request: FreezeRequest): Promise<TrustResult<FreezeResult>>;
  beginRelease(request: BeginReleaseRequest): Promise<TrustResult<BeginReleaseResult>>;
  commitRelease(request: CommitReleaseRequest): Promise<TrustResult<CommitReleaseResult>>;
  markArtifactAvailable(
    request: MarkArtifactAvailableRequest,
  ): Promise<TrustResult<MarkArtifactAvailableResult>>;
  voidArtifact(request: VoidArtifactRequest): Promise<TrustResult<VoidArtifactResult>>;
  revoke(request: RevokeReleaseRequest): Promise<TrustResult<RevokeReleaseResult>>;
}
