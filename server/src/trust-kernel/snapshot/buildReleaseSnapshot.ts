/**
 * buildReleaseSnapshot.ts - Immutable canonical release snapshot (design §8, §11.1)
 *
 * `SnapshotService` (design §8): given a frozen working revision projection it
 * owns the tenant scope, the candidate/profile hashes, the policy/profile
 * versions, and the SORTED operation/entity references, and binds them all into
 * a single `snapshotHash`. It is a pure function - no clock, locale, or
 * randomness - and array order is irrelevant because references are sorted, so
 * the same logical revision always yields the same `snapshotHash` (design §11.1).
 *
 * `computeSnapshotHash` is exported so the payload builder can re-verify the
 * binding without duplicating the hashing formula.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import type { ReleaseSnapshotV3, TenantScopeV1, Sha256Hex } from '../contracts/protocolV3.js';

export const SNAPSHOT_DOMAIN = 'MONOLITH/ReleaseSnapshot/V3';
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The frozen-working-revision projection the snapshot service consumes. */
export interface ReleaseSnapshotInputV3 {
  tenantScope: TenantScopeV1;
  workingRevisionId: string;
  candidateHash: Sha256Hex;
  /** Operation/entity references; unordered on input, canonicalized to a sorted set of NFC strings. */
  contentRefs?: string[];
  machineProfileHash: Sha256Hex;
  policyVersion: string;
  profileVersion: string;
}

/** The canonical fields (without the derived hash) a snapshot binds. */
interface SnapshotBoundFields {
  tenantScope: TenantScopeV1;
  workingRevisionId: string;
  candidateHash: Sha256Hex;
  contentRefs: string[];
  machineProfileHash: Sha256Hex;
  policyVersion: string;
  profileVersion: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** SHA-256 over the canonical JSON of the domain-tagged bound fields. */
export function computeSnapshotHash(fields: SnapshotBoundFields): Sha256Hex {
  return sha256Hex(
    canonicalJson({
      domain: SNAPSHOT_DOMAIN,
      tenantScope: fields.tenantScope,
      workingRevisionId: fields.workingRevisionId,
      candidateHash: fields.candidateHash,
      contentRefs: fields.contentRefs,
      machineProfileHash: fields.machineProfileHash,
      policyVersion: fields.policyVersion,
      profileVersion: fields.profileVersion,
    }),
  );
}

/** Build the immutable `ReleaseSnapshotV3` or return a stable reason code. */
export function buildReleaseSnapshot(input: ReleaseSnapshotInputV3): TrustResult<ReleaseSnapshotV3> {
  const ts = input.tenantScope;
  if (
    ts == null ||
    !isNonEmptyString(ts.tenantId) ||
    !isNonEmptyString(ts.orgId) ||
    !isNonEmptyString(ts.siteId) ||
    !isNonEmptyString(ts.policyVersion)
  ) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'tenantScope' });
  }
  if (!isNonEmptyString(input.workingRevisionId)) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'workingRevisionId' });
  }
  if (!SHA256_HEX.test(input.candidateHash)) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'candidateHash' });
  }
  if (!SHA256_HEX.test(input.machineProfileHash)) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'machineProfileHash' });
  }
  if (!isNonEmptyString(input.policyVersion)) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'policyVersion' });
  }
  if (!isNonEmptyString(input.profileVersion)) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'profileVersion' });
  }

  const rawRefs = input.contentRefs ?? [];
  if (!Array.isArray(rawRefs) || rawRefs.some((r) => typeof r !== 'string')) {
    return err('PACKET_SCHEMA_UNSUPPORTED', { field: 'contentRefs' });
  }

  // NFC-normalize then sort by UTF-16 code unit. Sorting makes the hash
  // independent of the caller's array order while preserving the multiset.
  const contentRefs = rawRefs.map((r) => r.normalize('NFC')).sort();

  const bound: SnapshotBoundFields = {
    tenantScope: {
      tenantId: ts.tenantId,
      orgId: ts.orgId,
      siteId: ts.siteId,
      policyVersion: ts.policyVersion,
    },
    workingRevisionId: input.workingRevisionId,
    candidateHash: input.candidateHash,
    contentRefs,
    machineProfileHash: input.machineProfileHash,
    policyVersion: input.policyVersion,
    profileVersion: input.profileVersion,
  };

  return ok({ snapshotHash: computeSnapshotHash(bound), ...bound });
}
