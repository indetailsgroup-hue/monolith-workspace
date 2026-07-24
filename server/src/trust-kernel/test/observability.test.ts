/**
 * observability.test.ts — Task 12 Step 3 (design §18, §19, §20).
 *
 * SECURITY EVENTS: every SecurityEventV1 carries tenant scope, event id, actor USER
 *   id, membership version, candidate/release revision, artifact hash, reason code,
 *   correlation id, and an authority timestamp. A human display name is SUPPLEMENTARY
 *   and can NEVER satisfy an identity field. The log is append-only and exports
 *   canonical JSONL.
 * METRICS: the approved metric/alert catalogue covers all required security/release
 *   categories, and every trigger reason code is a stable §13 code.
 * OWNERSHIP: every domain maps to one of the five accountable owners; an unowned
 *   domain is rejected, and any protocol/invariant change record lacking a versioned
 *   decision + migration reference is rejected.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  recordSecurityEvent,
  SecurityEventLog,
  type SecurityEventInput,
} from '../observability/securityEvents.js';
import {
  TRUST_METRIC_RULES,
  REQUIRED_METRIC_CATEGORIES,
  validateMetricRules,
} from '../observability/metrics.js';
import { validateOwnership, ACCOUNTABLE_OWNERS } from '../observability/ownership.js';

const HEX = (c: string) => c.repeat(64);

function eventInput(over: Partial<SecurityEventInput> = {}): SecurityEventInput {
  return {
    eventId: 'evt-0001',
    tenantScope: { tenantId: 'T-001', siteId: 'S-001' },
    actorUserId: 'user-uuid-123',
    membershipVersion: 7,
    releaseRevision: 'RR-1',
    artifactHash: HEX('a'),
    reasonCode: 'AUTH_SOD_VIOLATION',
    correlationId: 'corr-abc',
    authorityTimestamp: '2026-07-24T00:00:00.000Z',
    ...over,
  };
}

describe('SecurityEventV1 — identity fields cannot be satisfied by a display name', () => {
  it('records a well-formed event with all required identity fields', () => {
    const res = recordSecurityEvent(eventInput());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.schema).toBe('SecurityEventV1');
      expect(res.value.actorUserId).toBe('user-uuid-123');
    }
  });

  it('REJECTS a missing actorUserId even when a display name is present', () => {
    const res = recordSecurityEvent(
      eventInput({ actorUserId: '', actorDisplayName: 'Alice Approver' } as Partial<SecurityEventInput>),
    );
    expect(res).toMatchObject({ ok: false });
    expect((res as { field?: string }).field).toBe('actorUserId');
  });

  it('keeps a display name only as supplementary data, never as identity authority', () => {
    const res = recordSecurityEvent(eventInput({ actorDisplayName: 'Alice Approver' } as Partial<SecurityEventInput>));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.actorDisplayName).toBe('Alice Approver');
      // the identity authority is the user id, independent of the display name
      expect(res.value.actorUserId).toBe('user-uuid-123');
    }
  });

  it('rejects a missing tenant scope, membership version, artifact hash, reason code, correlation id, or timestamp', () => {
    expect(recordSecurityEvent(eventInput({ tenantScope: undefined } as Partial<SecurityEventInput>)).ok).toBe(false);
    expect(recordSecurityEvent(eventInput({ membershipVersion: undefined } as Partial<SecurityEventInput>)).ok).toBe(false);
    expect(recordSecurityEvent(eventInput({ artifactHash: 'short' })).ok).toBe(false);
    expect(recordSecurityEvent(eventInput({ reasonCode: 'NOT_A_CODE' } as unknown as Partial<SecurityEventInput>)).ok).toBe(false);
    expect(recordSecurityEvent(eventInput({ correlationId: '' })).ok).toBe(false);
    expect(recordSecurityEvent(eventInput({ authorityTimestamp: 'not-a-time' })).ok).toBe(false);
  });

  it('requires at least a candidate OR a release revision', () => {
    const res = recordSecurityEvent(eventInput({ releaseRevision: undefined, candidateRevision: undefined }));
    expect(res.ok).toBe(false);
    const withCandidate = recordSecurityEvent(eventInput({ releaseRevision: undefined, candidateRevision: 'C-1' }));
    expect(withCandidate.ok).toBe(true);
  });
});

describe('SecurityEventLog — append-only, canonical JSONL export', () => {
  it('appends events in order and exports one canonical JSON line each', () => {
    const log = new SecurityEventLog();
    log.append(eventInput({ eventId: 'evt-1' }));
    log.append(eventInput({ eventId: 'evt-2' }));
    const jsonl = log.exportJsonl();
    const lines = jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).eventId).toBe('evt-1');
    expect(JSON.parse(lines[1]).eventId).toBe('evt-2');
    // a canonical line has sorted keys (actorUserId before tenantScope, etc.)
    expect(lines[0].indexOf('"actorUserId"')).toBeLessThan(lines[0].indexOf('"tenantScope"'));
  });

  it('exposes no mutation/deletion surface and freezes stored events (append-only)', () => {
    const log = new SecurityEventLog();
    const stored = log.append(eventInput({ eventId: 'evt-1' }));
    expect(Object.isFrozen(stored)).toBe(true);
    expect((log as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((log as unknown as Record<string, unknown>).clear).toBeUndefined();
    // the exported snapshot is a copy — mutating it cannot alter the log
    const snapshot = log.events();
    expect(() => (snapshot as unknown[]).push({} as never)).toThrow();
  });

  it('rejects an invalid event at append time (fail-closed)', () => {
    const log = new SecurityEventLog();
    expect(() => log.append(eventInput({ actorUserId: '' }))).toThrow();
    expect(log.events()).toHaveLength(0);
  });
});

describe('metrics — approved catalogue covers every required category with valid codes', () => {
  it('validateMetricRules passes for the shipped catalogue', () => {
    expect(validateMetricRules(TRUST_METRIC_RULES)).toEqual({ ok: true });
  });
  it('covers every required security/release category', () => {
    const covered = new Set(TRUST_METRIC_RULES.map((r) => r.category));
    for (const cat of REQUIRED_METRIC_CATEGORIES) expect(covered.has(cat)).toBe(true);
  });
  it('every metric rule triggers on stable §13 reason codes and names an owner', () => {
    for (const r of TRUST_METRIC_RULES) {
      expect(r.triggerReasonCodes.length).toBeGreaterThan(0);
      expect(ACCOUNTABLE_OWNERS).toContain(r.owner);
    }
  });
  it('rejects a catalogue with an uncovered category', () => {
    const partial = TRUST_METRIC_RULES.filter((r) => r.category !== 'BLOCKED_LEGACY_ROUTE');
    expect(validateMetricRules(partial).ok).toBe(false);
  });
  it('rejects a rule that references a non-registry reason code', () => {
    const bad = [{ ...TRUST_METRIC_RULES[0], triggerReasonCodes: ['NOPE'] as unknown as never }];
    expect(validateMetricRules(bad as typeof TRUST_METRIC_RULES).ok).toBe(false);
  });
});

describe('ownership — every domain owned; protocol/invariant changes need decision + migration', () => {
  const ownershipPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../docs/governance/trust-kernel-ownership.json',
  );
  const ownershipDoc = () => JSON.parse(readFileSync(ownershipPath, 'utf-8'));

  it('the shipped ownership map validates', () => {
    expect(validateOwnership(ownershipDoc())).toEqual({ ok: true, violations: [] });
  });

  it('all five accountable owner areas are represented', () => {
    const doc = ownershipDoc();
    const owners = new Set(doc.domains.map((d: { owner: string }) => d.owner));
    for (const o of ACCOUNTABLE_OWNERS) expect(owners.has(o)).toBe(true);
  });

  it('rejects an unowned domain (owner not in the accountable set)', () => {
    const doc = ownershipDoc();
    doc.domains.push({ domain: 'rogue-domain', owner: 'Nobody', summary: 'x' });
    const res = validateOwnership(doc);
    expect(res.ok).toBe(false);
    expect(res.violations.join(' ')).toMatch(/rogue-domain/);
  });

  it('rejects a domain with an empty owner', () => {
    const doc = ownershipDoc();
    doc.domains.push({ domain: 'blank', owner: '', summary: 'x' });
    expect(validateOwnership(doc).ok).toBe(false);
  });

  it('rejects a protocol/invariant change record lacking a versioned decision', () => {
    const doc = ownershipDoc();
    doc.changeControl.records.push({ id: 'x', kind: 'protocol', summary: 'y', versionedDecision: '', migrationRef: '0184' });
    expect(validateOwnership(doc).ok).toBe(false);
  });

  it('rejects a protocol/invariant change record lacking a migration reference', () => {
    const doc = ownershipDoc();
    doc.changeControl.records.push({ id: 'x', kind: 'invariant', summary: 'y', versionedDecision: 'ADR-1', migrationRef: '' });
    expect(validateOwnership(doc).ok).toBe(false);
  });
});
