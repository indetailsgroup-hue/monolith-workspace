/**
 * ownership.ts — accountable-owner map validation (design §19, §20).
 *
 * Every trust-kernel domain maps to exactly one of the five accountable owners.
 * `validateOwnership` rejects an unowned domain (a domain whose owner is absent or is
 * not one of the five) and any protocol/invariant change record that lacks BOTH a
 * versioned decision AND a migration reference — an owner "may evolve implementation
 * inside the boundary, but cannot change a protocol or invariant without a versioned
 * decision and migration" (design §20).
 *
 * The canonical map lives in `docs/governance/trust-kernel-ownership.json`; this
 * module validates any document of that shape.
 *
 * Phase: NOT_FOR_PRODUCTION. Pure validation; no I/O.
 */

/** The five accountable owners (design §19). */
export const ACCOUNTABLE_OWNERS = [
  'Security/IAM',
  'Release Governance',
  'Manufacturing Engineering',
  'Platform Engineering',
  'Independent QA/Safety',
] as const;

export type AccountableOwner = (typeof ACCOUNTABLE_OWNERS)[number];

export interface OwnershipDomain {
  domain: string;
  owner: string;
  summary?: string;
}

export interface OwnershipChangeRecord {
  id: string;
  kind: 'protocol' | 'invariant' | 'implementation' | string;
  summary?: string;
  versionedDecision?: string;
  migrationRef?: string;
}

export interface OwnershipDoc {
  domains: OwnershipDomain[];
  changeControl?: { records?: OwnershipChangeRecord[] };
}

export type ValidateOwnershipResult = { ok: boolean; violations: string[] };

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const OWNER_SET: ReadonlySet<string> = new Set(ACCOUNTABLE_OWNERS);

/**
 * Validate an ownership document. Returns `{ ok: true, violations: [] }` for a clean
 * map; otherwise `{ ok: false, violations: [...] }` naming each unowned domain and
 * each protocol/invariant change record missing a decision or migration reference.
 */
export function validateOwnership(doc: OwnershipDoc): ValidateOwnershipResult {
  const violations: string[] = [];

  if (!doc || !Array.isArray(doc.domains) || doc.domains.length === 0) {
    return { ok: false, violations: ['ownership doc has no domains'] };
  }

  for (const d of doc.domains) {
    if (!nonEmpty(d.domain)) {
      violations.push('a domain entry is missing its domain name');
      continue;
    }
    if (!nonEmpty(d.owner) || !OWNER_SET.has(d.owner)) {
      violations.push(`domain "${d.domain}" is unowned or has a non-accountable owner: "${d.owner ?? ''}"`);
    }
  }

  // Every one of the five accountable owner areas must own at least one domain.
  const ownersPresent = new Set(doc.domains.map((d) => d.owner));
  for (const o of ACCOUNTABLE_OWNERS) {
    if (!ownersPresent.has(o)) violations.push(`accountable owner area is unrepresented: ${o}`);
  }

  // Protocol/invariant changes require a versioned decision AND a migration reference.
  const records = doc.changeControl?.records ?? [];
  for (const r of records) {
    if (r.kind === 'protocol' || r.kind === 'invariant') {
      if (!nonEmpty(r.versionedDecision)) {
        violations.push(`change record "${r.id}" (${r.kind}) lacks a versioned decision`);
      }
      if (!nonEmpty(r.migrationRef)) {
        violations.push(`change record "${r.id}" (${r.kind}) lacks a migration reference`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
