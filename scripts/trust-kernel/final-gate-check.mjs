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
import {
  assertEvidenceReportLayers,
  assertManifestReferencedFiles,
  buildUnsignedEvidenceAttestation,
  canonicalJson,
  REQUIRED_REPORT_MANIFEST,
  recomputeEvidenceRootHash,
} from './evidence-manifest-integrity.mjs';
import { validateEvidenceManifest } from './issue-evidence-attestation.mjs';

// Exact basenames emitted by trust-kernel-verify.yml. This is the single source
// of truth for report completeness; semantic checks below validate each report
// after this manifest has established that every workflow output is present.
export { REQUIRED_REPORT_MANIFEST };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEd25519Signature(signatureBase64) {
  return typeof signatureBase64 === 'string'
    && BASE64.test(signatureBase64)
    && Buffer.from(signatureBase64, 'base64').length === 64;
}

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
export function checkVitestReport(r, f, { required = false } = {}) {
  const violations = [];
  if (typeof r.numTotalTests !== 'number') {
    // A report the gate REQUIRES must be a valid vitest report; shape drift
    // (an empty object, a truncated write, wrong schema) is a failure, not a
    // no-op pass. Non-required reports in the tree may be other shapes.
    if (required) violations.push(`required report ${f} is not a valid vitest report (numTotalTests missing)`);
    return violations;
  }
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

/** Validate the manifest-backed EvidenceAttestation proof against report-tree bytes. */
export function checkEvidenceProof({ root, env = process.env, expectedProductCommit }) {
  const violations = [];
  const files = walk(root);
  const evidenceFiles = files.filter((f) => /evidence-attestation.*\.json$/.test(f));
  const manifestFile = files.find((f) => path.basename(f) === 'evidence-manifest.json');
  if (evidenceFiles.length === 0) {
    return [
      'evidence gate UNVERIFIED: no EvidenceAttestation proof report found — presence-of-signer-env is not a passed gate (design §16.4)',
    ];
  }

  for (const f of evidenceFiles) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      violations.push(`unparseable evidence attestation report ${f}`);
      continue;
    }
    if (!isRecord(report) || report.schema !== 'EvidenceAttestationV1'
        || report.verified !== true || !isRecord(report.attestation)) {
      violations.push(`evidence gate UNVERIFIED in ${f}: a complete EvidenceAttestationV1 with verified=true is required`);
      continue;
    }
    const attestation = report.attestation;
    if (!isEd25519Signature(attestation.signatureBase64)) {
      violations.push(`evidence gate INVALID in ${f}: signatureBase64 is not a 64-byte base64 Ed25519 signature`);
    }
    if (typeof env.GITHUB_RUN_ID === 'string' && env.GITHUB_RUN_ID.length > 0
        && attestation.ciRunId !== env.GITHUB_RUN_ID) {
      violations.push(`evidence gate INVALID in ${f}: attestation ciRunId does not match GITHUB_RUN_ID`);
    }
    if (typeof expectedProductCommit === 'string' && expectedProductCommit.length > 0
        && attestation.productGit?.commit !== expectedProductCommit) {
      violations.push(`evidence gate INVALID in ${f}: attestation productGit.commit does not match the expected product commit`);
    }
    if (!manifestFile) {
      violations.push(`evidence gate INVALID in ${f}: evidence-manifest.json is missing`);
      continue;
    }
    try {
      const manifest = validateEvidenceManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), attestation.keyId);
      assertEvidenceReportLayers(manifest, root);
      assertManifestReferencedFiles(manifest, repoRoot);
      const recomputedRoot = recomputeEvidenceRootHash(manifest);
      if (attestation.evidenceRootHash !== recomputedRoot) {
        violations.push(`evidence gate INVALID in ${f}: evidenceRootHash does not match the root recomputed from the report tree`);
      }
      const expectedUnsigned = buildUnsignedEvidenceAttestation(manifest);
      const { signatureBase64: _signature, ...actualUnsigned } = attestation;
      if (canonicalJson(actualUnsigned) !== canonicalJson(expectedUnsigned)) {
        violations.push(`evidence gate INVALID in ${f}: signed attestation fields do not match evidence-manifest.json`);
      }
    } catch (error) {
      violations.push(`evidence gate INVALID in ${f}: ${error instanceof Error ? error.message : 'manifest verification failed'}`);
    }
  }
  return violations;
}

/**
 * Evaluate the complete report tree + job results. Returns the list of violations
 * (empty === PASS). Pure: all inputs are explicit.
 */
function evaluateReportTree({ root, jobResults, requireEvidence, env = process.env }) {
  const violations = [];

  // (a) Job-level results: any non-success (failure/cancelled/skipped) is rejected.
  //     The final CLI supplies matrix, edge, E2E, claim-linter, and evidence job
  //     results. The pre-attestation caller intentionally has no evidence job yet.
  for (const [name, res] of Object.entries(jobResults ?? {})) {
    if (res !== 'success') violations.push(`job "${name}" did not succeed (result=${res})`);
  }

  const files = walk(root);

  const presentReportNames = new Set(files.map((f) => path.basename(f)));
  for (const report of REQUIRED_REPORT_MANIFEST) {
    if (!requireEvidence && ['evidence-manifest.json', 'evidence-attestation.json'].includes(report)) continue;
    if (!presentReportNames.has(report)) violations.push(`missing required report: ${report}`);
  }

  // Repair Phase 0 evidence (Task 8): the disposition ledger, both Repair pgTAP
  // suites, the bilingual document verifier, the route ledger, and the PINNED
  // claim/certification linter result are load-bearing. A missing report is a
  // failed gate — never a warning.
  const repairLedger = files.find((f) => /repair-phase0-ledger\.json$/.test(f));
  if (repairLedger) {
    try {
      const rl = JSON.parse(fs.readFileSync(repairLedger, 'utf8'));
      if (rl.pass !== true) violations.push(`repair-phase0-ledger.json did not pass: ${JSON.stringify(rl.errors ?? [])}`);
      if (!(typeof rl.surfaceCount === 'number' && rl.surfaceCount > 0)) {
        violations.push('repair-phase0-ledger.json reports zero surfaces (empty ledger)');
      }
    } catch {
      violations.push('unparseable repair-phase0-ledger.json');
    }
  }

  const reqText = (re, marker, msg) => {
    const f = files.find((x) => re.test(x));
    if (!f) return;
    if (!fs.readFileSync(f, 'utf8').includes(marker)) {
      violations.push(`${msg} does not contain "${marker}" (gate requires the verifier's PASS output, not job status)`);
    }
  };
  reqText(/repair-docs\.txt$/, 'REPAIR PHASE 0 DOCS: PASS', 'repair-docs.txt (bilingual document verifier)');
  reqText(/route-ledger\.txt$/, 'ROUTE LEDGER: PASS', 'route-ledger.txt (route disposition ledger)');
  reqText(/claim-linters\.txt$/, 'CLAIM LINTERS: PASS', 'claim-linters.txt (pinned claim/certification linters)');

  // (b) vitest JSON reports: >0 tests, 0 failed, 0 skipped/pending/todo, success true.
  // A report matching a REQUIRED name (server/verifier/determinism/containment/
  // edge/repair) must be a valid vitest report — shape drift on those fails.
  const REQUIRED_VITEST = /(server|verifier|determinism|containment|edge|repair)-?.*\.json$/;
  for (const f of files.filter((f) => f.endsWith('.json') && !/e2e\.json$/.test(f) && !/evidence-(attestation|manifest).*\.json$/.test(f) && !/repair-phase0-ledger\.json$/.test(f))) {
    let r;
    try {
      r = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      violations.push(`unparseable report ${f}`);
      continue;
    }
    violations.push(...checkVitestReport(r, f, { required: REQUIRED_VITEST.test(f) }));
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

  // (d) pgTAP: each suite has at least one `ok`, zero `not ok`, no Bail out!,
  //     and no SKIP/TODO directive (a skipped assertion is not a passed one).
  for (const f of files.filter((f) => f.endsWith('.tap'))) {
    const tap = fs.readFileSync(f, 'utf8');
    const ok = (tap.match(/^ok /gm) || []).length;
    const notOk = (tap.match(/^not ok /gm) || []).length;
    if (ok === 0) violations.push(`empty pgTAP suite ${f}`);
    if (notOk > 0) violations.push(`${notOk} pgTAP failure(s) in ${f}`);
    if (/^Bail out!/mi.test(tap)) violations.push(`pgTAP Bail out! in ${f}`);
    const directives = (tap.match(/#\s*(SKIP|TODO)\b/gi) || []).length;
    if (directives > 0) violations.push(`${directives} pgTAP SKIP/TODO directive(s) in ${f}`);
  }

  // (f) Evidence gate (C3): require the evidence job AND its complete proof. The
  //     local gate validates shape and binds the signed fields to a manifest whose
  //     report/file digests are recomputed from this checkout and report tree.
  if (requireEvidence) violations.push(...checkEvidenceProof({ root, env }));

  // (e) Cross-platform golden packet byte-identity: ubuntu sha == windows sha.
  const shaU = files.find((f) => /golden-ubuntu-latest\.sha$/.test(f));
  const shaW = files.find((f) => /golden-windows-latest\.sha$/.test(f));
  if (!shaU || !shaW) violations.push('missing golden packet sha from one OS');
  else {
    const u = fs.readFileSync(shaU, 'utf8').trim();
    const w = fs.readFileSync(shaW, 'utf8').trim();
    // Two empty (or non-sha) files must never count as a match — a byte-identity
    // proof requires an actual 64-hex digest on both sides.
    if (!/^[0-9a-f]{64}$/i.test(u) || !/^[0-9a-f]{64}$/i.test(w)) {
      violations.push(`golden packet sha is empty or malformed (ubuntu="${u}" windows="${w}")`);
    } else if (u !== w) {
      violations.push(`cross-platform golden packet sha MISMATCH: ubuntu=${u} windows=${w}`);
    }
  }

  return violations;
}

/** Final acceptance path: the verified attestation is always load-bearing. */
export function evaluateReports({ root, jobResults, env = process.env }) {
  return evaluateReportTree({ root, jobResults, requireEvidence: true, env });
}

/**
 * Evidence-issuance preflight: validates the identical upstream report tree
 * before the circular evidence-attestation.json output exists. This is not a
 * final-gate override; the CLI and exported final evaluator always require it.
 */
export function evaluatePreAttestationReports({ root, jobResults }) {
  return evaluateReportTree({ root, jobResults, requireEvidence: false });
}

// --- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv[2] || 'all-reports';
  const jobResults = {
    'matrix-tests': process.env.R_MATRIX,
    'edge-db': process.env.R_EDGE,
    'e2e': process.env.R_E2E,
    // Repair Phase 0 Task 8: the pinned claim/certification linters are load-
    // bearing; their job result gates alongside their PASS report.
    'claim-linters': process.env.R_CLAIM,
    'evidence-self-verify': process.env.R_EVIDENCE,
  };
  const violations = evaluateReports({ root, jobResults });
  if (violations.length > 0) {
    console.error('TRUST KERNEL FINAL GATE: FAIL');
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }
  console.log('TRUST KERNEL FINAL GATE: PASS — complete reports, no failure/skip/empty/missing, cross-platform bytes identical.');
}
