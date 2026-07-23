/**
 * result.ts - Typed Trust Kernel result and lifecycle status constants
 *
 * Every Trust Kernel service boundary returns a typed `TrustResult<T>` that is
 * either a success value or a stable reason code (design §13). The lifecycle
 * status constants pin the exact members and order of each aggregate's state
 * machine (design §6); `VOID` is deliberately absent from release-revision
 * status because the flow ends at attempt/artifact before a revision exists.
 *
 * Phase: NOT_FOR_PRODUCTION. Types and constants only.
 *
 * @version 0.13.2
 */

import type { TrustReasonCode } from './reasonCodes.js';

// ============================================================================
// TrustResult
// ============================================================================

/**
 * The typed result of any Trust Kernel operation: either an `ok` value or a
 * stable reason code with an optional string-only detail map (safe to log).
 */
export type TrustResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TrustReasonCode; detail?: Readonly<Record<string, string>> };

/** Construct a successful result. */
export function ok<T>(value: T): TrustResult<T> {
  return { ok: true, value };
}

/** Construct a failed result with a stable reason code. */
export function err<T = never>(
  code: TrustReasonCode,
  detail?: Readonly<Record<string, string>>,
): TrustResult<T> {
  return detail === undefined ? { ok: false, code } : { ok: false, code, detail };
}

// ============================================================================
// Lifecycle status constants (design §6)
// ============================================================================

/** `WorkingRevision` statuses (design §6.2). */
export const WORKING_REVISION_STATUSES = ['DRAFT', 'FROZEN'] as const;
export type WorkingRevisionStatus = (typeof WORKING_REVISION_STATUSES)[number];

/** `ReleaseAttempt` statuses (design §6.4). */
export const RELEASE_ATTEMPT_STATUSES = ['PENDING', 'FAILED', 'PUBLISHED', 'VOID'] as const;
export type ReleaseAttemptStatus = (typeof RELEASE_ATTEMPT_STATUSES)[number];

/** `ArtifactRecordV1` statuses (design §6.5). */
export const ARTIFACT_STATUSES = ['QUARANTINED', 'MATERIALIZING', 'AVAILABLE', 'VOID'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

/** `ReleaseRevision` statuses (design §6.6); `VOID` is not a release-revision status. */
export const RELEASE_REVISION_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type ReleaseRevisionStatus = (typeof RELEASE_REVISION_STATUSES)[number];
