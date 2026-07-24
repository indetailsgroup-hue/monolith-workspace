#!/usr/bin/env node
/**
 * final-gate-check.mjs — the trust-kernel CI FINAL acceptance checker, extracted from
 * `.github/workflows/trust-kernel-verify.yml` so it can be self-tested off-CI.
 *
 * It reads the COMPLETE machine-readable reports produced by every leg and rejects any
 * failure, cancellation, SKIP/PENDING/TODO, missing report, empty suite, unverified
 * evidence attestation, or cross-platform golden-packet hash mismatch. There is no
 * override.
 *
 * WHY A MODULE (not an inline heredoc): the inline gate could never be exercised
 * without pushing to CI, so a whole class of gate bugs (a SKIP that is invisible to
 * vitest v1 aggregates; a `test.todo`; an evidence gate that passes on env-presence)
 * went undetected. This module is imported by `final-gate-check.selftest.mjs`, which
 * proves the gate flags each of those with a deliberate fixture.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A per-assertion status that means the assertion did NOT actually run to a pass.
// vitest/jest emit these across v1 and v3. ANY of them fails the gate.
const NON_RUN_STATUSES = new Set(['skipped', 'pending', 'todo', 'disabled']);

/**
 * Violations from ONE parsed vitest JSON report. This is the security-critical part:
 * under vitest v1.6.1 an `it.skip` reports numPendingTests=0/numTodoTests=0/
 * numTotalTests=2/numPassedTests=2/success=true — the SKIP is INVISIBLE to every
 * aggregate. The gate therefore MUST iterate each testResults[].assertionResults[]
 * status and reject skipped/pending/todo/disabled, in ADDITION to the aggregates.
 * Do NOT trust numPending/numTodo/numTotal under v1 (C1/C2).
 */
export function checkVitestReport(r, f) {
  const violations = [];
  if (typeof r.numTotalTests !== 'number') return violations; // not a vitest report
  if (r.numTotalTests <= 0) violations.push(`empty suite in ${f} (numTotalTests=0)`);
  if (r.numFailedTests > 0) violations.push(`${r.numFailedTests} failed test(s) in ${f}`);
  if (r.numPendingTests > 0) violations.push(`${r.numPendingTests} skipped test(s) in ${f}`);
  // C2: a `test.todo` evades the guarantee in v1 and v3; reject the aggregate where present.
  if (typeof r.numTodoTests === 'number' && r.numTodoTests > 0) {
    violations.push(`${r.numTodoTests} todo test(s) in ${f}`);
  }
  if (r.success !== true) violations.push(`report ${f} is not success`);

  // C1/C2: authoritative per-assertion sweep — the ONLY reliable skip/todo detector
  // under vitest v1.6.1, where aggregates lie about a SKIP.
  const suites = Array.isArray(r.testResults) ? r.testResults : [];
  const offenders = [];
  for (const s of suites) {
    const ars = Array.isArray(s && s.assertionResults) ? s.assertionResults : [];
    for (const a of ars) {
      const status = String((a && a.status) || '').toLowerCase();
      if (NON_RUN_STATUSES.has(status)) offenders.push(`${status}:${(a && a.title) || '?'}`);
    }
  }
  if (offenders.length > 0) {
    violations.push(
      `${offenders.length} non-passing assertion status(es) in ${f} [${offenders.join(', ')}] ` +
        `(per-assertion; vitest v1 aggregates hide these)`,
    );
  }
  return violations;
}

const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : [p];
      })
    : [];

/**
 * Evaluate the complete report tree + job results. Returns the list of violations
 * (empty === PASS). Pure: all inputs are explicit.
 */
export function evaluateReports({ root, jobResults }) {
  const violations = [];

  // (a) Job-level results: any non-success (failure/cancelled/skipped) is rejected.
  //     claim-linters is intentionally advisory (cross-repo-pending) and excluded.
  //     evidence-self-verify is NOT gated here by job result — its success must be
  //     proven by a verified attestation report, never by env-presence (see (f)).
  for (const [name, res] of Object.entries(jobResults ?? {})) {
    if (res !== 'success') violations.push(`job "${name}" did not succeed (result=${res})`);
  }

  const files = walk(root);

  const req = (pred, msg) => {
    if (!files.some(pred)) violations.push(`missing required report: ${msg}`);
  };
  req((f) => /server-ubuntu-latest\.json$/.test(f), 'server-ubuntu-latest.json');
  req((f) => /server-windows-latest\.json$/.test(f), 'server-windows-latest.json');
  req((f) => /verifier-ubuntu-latest\.json$/.test(f), 'verifier-ubuntu-latest.json');
  req((f) => /edge\.json$/.test(f), 'edge.json');
  req((f) => /pgtap-trust_kernel_release\.tap$/.test(f), 'pgtap-trust_kernel_release.tap');
  req((f) => /e2e\.json$/.test(f), 'e2e.json');

  // (b) vitest JSON reports: >0 tests, 0 failed, 0 skipped/pending/todo, success true.
  for (const f of files.filter((f) => f.endsWith('.json') && !/e2e\.json$/.test(f) && !/evidence-attestation.*\.json$/.test(f))) {
    let r;
    try {
      r = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      violations.push(`unparseable report ${f}`);
      continue;
    }
    violations.push(...checkVitestReport(r, f));
  }

  // (c) Playwright e2e JSON: no unexpected, no skipped, >0 expected.
  const e2e = files.find((f) => /e2e\.json$/.test(f));
  if (e2e) {
    try {
      const r = JSON.parse(fs.readFileSync(e2e, 'utf8'));
      const s = r.stats || {};
      if ((s.expected || 0) <= 0) violations.push('e2e ran zero tests');
      if ((s.unexpected || 0) > 0) violations.push(`e2e has ${s.unexpected} unexpected failure(s)`);
      if ((s.skipped || 0) > 0) violations.push(`e2e has ${s.skipped} skipped test(s)`);
      if ((s.flaky || 0) > 0) violations.push(`e2e has ${s.flaky} flaky test(s)`);
    } catch {
      violations.push('unparseable e2e report');
    }
  }

  // (d) pgTAP: each suite has at least one `ok` and zero `not ok`.
  for (const f of files.filter((f) => f.endsWith('.tap'))) {
    const tap = fs.readFileSync(f, 'utf8');
    const ok = (tap.match(/^ok /gm) || []).length;
    const notOk = (tap.match(/^not ok /gm) || []).length;
    if (ok === 0) violations.push(`empty pgTAP suite ${f}`);
    if (notOk > 0) violations.push(`${notOk} pgTAP failure(s) in ${f}`);
  }

  // (f) Evidence gate (C3): a verified EvidenceAttestation proof is REQUIRED. The
  //     evidence-self-verify job's success on env-PRESENCE is not a passed gate; the
  //     gate reads the attestation report the job must emit and demands verified===true.
  //     Absent or unverified => UNVERIFIED (fail closed), never green.
  const evidenceFiles = files.filter((f) => /evidence-attestation.*\.json$/.test(f));
  if (evidenceFiles.length === 0) {
    violations.push(
      'evidence gate UNVERIFIED: no EvidenceAttestation proof report found — presence-of-signer-env is not a passed gate (design §16.4)',
    );
  } else {
    for (const f of evidenceFiles) {
      let a;
      try {
        a = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        violations.push(`unparseable evidence attestation report ${f}`);
        continue;
      }
      if (a.verified !== true) {
        violations.push(
          `evidence gate UNVERIFIED in ${f}: attestation.verified !== true (a real, SEPARATE evidence signer + verify must produce a verified attestation)`,
        );
      }
    }
  }

  // (e) Cross-platform golden packet byte-identity: ubuntu sha == windows sha.
  const shaU = files.find((f) => /golden-ubuntu-latest\.sha$/.test(f));
  const shaW = files.find((f) => /golden-windows-latest\.sha$/.test(f));
  if (!shaU || !shaW) violations.push('missing golden packet sha from one OS');
  else {
    const u = fs.readFileSync(shaU, 'utf8').trim();
    const w = fs.readFileSync(shaW, 'utf8').trim();
    if (u !== w) violations.push(`cross-platform golden packet sha MISMATCH: ubuntu=${u} windows=${w}`);
  }

  return violations;
}

// --- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv[2] || 'all-reports';
  const jobResults = {
    'matrix-tests': process.env.R_MATRIX,
    'edge-db': process.env.R_EDGE,
    'e2e': process.env.R_E2E,
  };
  const violations = evaluateReports({ root, jobResults });
  if (violations.length > 0) {
    console.error('TRUST KERNEL FINAL GATE: FAIL');
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }
  console.log('TRUST KERNEL FINAL GATE: PASS — complete reports, no failure/skip/empty/missing, cross-platform bytes identical.');
}
