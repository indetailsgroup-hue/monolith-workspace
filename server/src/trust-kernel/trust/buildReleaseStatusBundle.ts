/**
 * buildReleaseStatusBundle.ts - Unsigned ReleaseStatusBundleV1 construction
 *
 * Builds the unsigned `ReleaseStatusBundleV1` (design §11.3): the set of REVOKED
 * `ReleaseRevision` ids for a trust scope. The recall unit is the release-revision
 * id (§11.3, the Phase-A owner note "revoke is revision-scoped").
 *
 * VOID is NEVER included. A `VOID` attempt/artifact ends the flow BEFORE a release
 * revision exists (design §6.6); it is not a release-revision status at all, so it
 * can never enter this bundle. The function includes an id iff its row status is
 * exactly `REVOKED`, which structurally excludes `ACTIVE` and `VOID`.
 *
 * The revoked set is de-duplicated and sorted so the canonical bytes are
 * deterministic regardless of the caller's row order. This is a pure projection
 * over rows that come from the EXISTING release_revision authority (0182) — never
 * a second source of truth (global "no dual write" constraint).
 *
 * Phase: NOT_FOR_PRODUCTION. Pure function only; no I/O, no crypto, no keys.
 */

import type { TenantScopeV1, ReleaseStatusBundleV1, Iso8601 } from '../contracts/protocolV3.js';
import { assertTrustScope, assertSequence, assertWindow, TrustBundleError } from './buildTrustBundle.js';

/**
 * One release-lifecycle row projected from the authority. Only `status ==='REVOKED'`
 * rows enter the bundle; a VOID attempt/artifact row is deliberately accepted here
 * so the exclusion is explicit and testable.
 *
 * PGB-4: each row carries the trust scope of the release revision it projects, so
 * the builder can verify every row belongs to `meta.trustScope` instead of trusting
 * the caller to have pre-filtered. `tenantId` is required; `siteId` is present when
 * the release revision carries one.
 */
export interface ReleaseRevocationRow {
  releaseRevisionId: string;
  status: string;
  tenantId: string;
  siteId?: string;
}

/** A `ReleaseStatusBundleV1` before the trust authority binds its signature. */
export type UnsignedReleaseStatusBundleV1 = Omit<ReleaseStatusBundleV1, 'signature'>;

export interface BuildReleaseStatusBundleMeta {
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
}

export function buildReleaseStatusBundle(
  rows: readonly ReleaseRevocationRow[],
  meta: BuildReleaseStatusBundleMeta,
): UnsignedReleaseStatusBundleV1 {
  assertTrustScope(meta.trustScope);
  assertSequence(meta.sequence);
  assertWindow(meta.issuedAt, meta.expiresAt);

  const revoked = new Set<string>();
  for (const row of rows) {
    // PGB-4: bundle scope enforcement. Every row MUST belong to this bundle's trust
    // scope. A cross-tenant row is a projection error and is REJECTED (never silently
    // dropped), matching the file's throw-based error style (assert* above).
    if (row.tenantId !== meta.trustScope.tenantId) {
      throw new TrustBundleError(
        'TRUST_SCOPE_MISMATCH',
        `release-status row ${row.releaseRevisionId} tenant ${String(row.tenantId)} is outside the bundle trust scope ${meta.trustScope.tenantId}`,
      );
    }
    // The recall unit is the release-revision id, and ONLY a REVOKED revision
    // qualifies. VOID / ACTIVE never enter the bundle.
    if (row.status === 'REVOKED' && typeof row.releaseRevisionId === 'string' && row.releaseRevisionId.length > 0) {
      revoked.add(row.releaseRevisionId);
    }
  }

  return {
    bundleType: 'RELEASE_STATUS',
    trustScope: meta.trustScope,
    sequence: meta.sequence,
    issuedAt: meta.issuedAt,
    expiresAt: meta.expiresAt,
    revokedReleaseRevisionIds: [...revoked].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}
