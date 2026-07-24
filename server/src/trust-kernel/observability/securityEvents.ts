/**
 * securityEvents.ts — append-only security/release event record (design §18).
 *
 * Every security or release event carries tenant scope, event id, actor USER id,
 * membership version, candidate/release revision, artifact hash, reason code,
 * correlation id, and an AUTHORITY timestamp. A human display name is supplementary
 * data and can NEVER satisfy an identity field: `actorDisplayName` is optional and is
 * ignored by every identity check — the identity authority is `actorUserId` alone.
 *
 * The log is append-only: `SecurityEventLog` exposes `append`/`events`/`exportJsonl`
 * and NO mutation or deletion surface; each stored event is frozen, and `events()`
 * returns a frozen snapshot. Export is canonical (RFC-8785-style sorted keys), one
 * JSON object per line (JSONL), suitable for an immutable audit sink.
 *
 * Phase: NOT_FOR_PRODUCTION. Pure in-memory recorder; no I/O, no key material.
 */
import { canonicalJson } from '../canonical/canonicalJson.js';
import { isTrustReasonCode, type TrustReasonCode } from '../reasonCodes.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Tenant scope carried by every event (design §7.2). */
export interface EventTenantScope {
  tenantId: string;
  siteId: string;
}

/** Input to record a security/release event. */
export interface SecurityEventInput {
  eventId: string;
  tenantScope: EventTenantScope;
  actorUserId: string;
  membershipVersion: number;
  /** At least one of candidate/release revision is required. */
  candidateRevision?: string;
  releaseRevision?: string;
  artifactHash: string;
  reasonCode: TrustReasonCode;
  correlationId: string;
  authorityTimestamp: string;
  /** SUPPLEMENTARY only — never identity authority (design §18). */
  actorDisplayName?: string;
}

/** The immutable recorded event. */
export interface SecurityEventV1 {
  schema: 'SecurityEventV1';
  eventId: string;
  tenantScope: EventTenantScope;
  actorUserId: string;
  membershipVersion: number;
  candidateRevision: string | null;
  releaseRevision: string | null;
  artifactHash: string;
  reasonCode: TrustReasonCode;
  correlationId: string;
  authorityTimestamp: string;
  actorDisplayName: string | null;
}

export type RecordSecurityEventResult =
  | { ok: true; value: SecurityEventV1 }
  | { ok: false; field: string; detail: string };

function nonEmptyString(v: unknown): v is string {
  // C15: fail closed on a whitespace-only value — a blank-after-trim identity/scope
  // field is not a real identity and must be rejected, not stored.
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validate + normalize a security event. A display name never substitutes for the
 * required `actorUserId`; a missing/blank identity field is rejected fail-closed.
 */
export function recordSecurityEvent(input: SecurityEventInput): RecordSecurityEventResult {
  if (!nonEmptyString(input.eventId)) return { ok: false, field: 'eventId', detail: 'event id is required' };
  if (!input.tenantScope || !nonEmptyString(input.tenantScope.tenantId) || !nonEmptyString(input.tenantScope.siteId)) {
    return { ok: false, field: 'tenantScope', detail: 'tenant scope (tenantId + siteId) is required' };
  }
  // Identity authority is the user id — a display name CANNOT satisfy it.
  if (!nonEmptyString(input.actorUserId)) {
    return { ok: false, field: 'actorUserId', detail: 'actor user id is required; a display name is not an identity' };
  }
  if (typeof input.membershipVersion !== 'number' || !Number.isInteger(input.membershipVersion) || input.membershipVersion < 0) {
    return { ok: false, field: 'membershipVersion', detail: 'membership version must be a non-negative integer' };
  }
  if (!nonEmptyString(input.candidateRevision) && !nonEmptyString(input.releaseRevision)) {
    return { ok: false, field: 'candidateRevision|releaseRevision', detail: 'a candidate or release revision is required' };
  }
  if (typeof input.artifactHash !== 'string' || !SHA256_HEX.test(input.artifactHash)) {
    return { ok: false, field: 'artifactHash', detail: 'artifact hash must be a 64-char lowercase-hex sha256' };
  }
  if (!isTrustReasonCode(input.reasonCode)) {
    return { ok: false, field: 'reasonCode', detail: 'reason code must be a stable §13 registry code' };
  }
  if (!nonEmptyString(input.correlationId)) return { ok: false, field: 'correlationId', detail: 'correlation id is required' };
  if (!nonEmptyString(input.authorityTimestamp) || Number.isNaN(Date.parse(input.authorityTimestamp))) {
    return { ok: false, field: 'authorityTimestamp', detail: 'authority timestamp must be an ISO-8601 time' };
  }

  const event: SecurityEventV1 = Object.freeze({
    schema: 'SecurityEventV1',
    eventId: input.eventId,
    tenantScope: Object.freeze({ tenantId: input.tenantScope.tenantId, siteId: input.tenantScope.siteId }),
    actorUserId: input.actorUserId,
    membershipVersion: input.membershipVersion,
    candidateRevision: nonEmptyString(input.candidateRevision) ? input.candidateRevision : null,
    releaseRevision: nonEmptyString(input.releaseRevision) ? input.releaseRevision : null,
    artifactHash: input.artifactHash,
    reasonCode: input.reasonCode,
    correlationId: input.correlationId,
    authorityTimestamp: input.authorityTimestamp,
    // Supplementary display name only; identity is actorUserId above.
    actorDisplayName: nonEmptyString(input.actorDisplayName) ? input.actorDisplayName : null,
  });
  return { ok: true, value: event };
}

/**
 * Append-only in-memory event log. There is deliberately no delete/clear/update
 * method: events are frozen on append and `events()` returns a frozen snapshot.
 */
export class SecurityEventLog {
  private readonly log: SecurityEventV1[] = [];

  /** Append a validated event; throws on an invalid event (fail-closed). */
  append(input: SecurityEventInput): SecurityEventV1 {
    const res = recordSecurityEvent(input);
    if (!res.ok) {
      // strictNullChecks is off here; read the failure fields via the cast idiom.
      const f = res as { field: string; detail: string };
      throw new Error(`SECURITY_EVENT_INVALID: ${f.field} — ${f.detail}`);
    }
    this.log.push(res.value);
    return res.value;
  }

  /** A frozen snapshot of the events in insertion order (append-only). */
  events(): readonly SecurityEventV1[] {
    return Object.freeze(this.log.slice());
  }

  /** Canonical JSONL export — one RFC-8785-style line per event, insertion order. */
  exportJsonl(): string {
    return this.log.map((e) => canonicalJson(e)).join('\n') + (this.log.length > 0 ? '\n' : '');
  }
}
