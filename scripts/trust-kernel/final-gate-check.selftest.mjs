#!/usr/bin/env node
/**
 * final-gate-check.selftest.mjs — proves the extracted CI FINAL gate actually flags
 * the classes of report that used to slip through the inline heredoc:
 *
 *   C1  a vitest v1.6.1 `it.skip` — INVISIBLE to numPending/numTodo/numTotal aggregates
 *       (numPendingTests=0, numTodoTests=0, numTotalTests=2, numPassedTests=2,
 *       success=true) but present as an assertionResult with status "skipped".
 *   C2  a `test.todo` — evades the aggregates in v1 and v3.
 *   C3  an evidence gate that "succeeded" on env-presence with NO verified attestation
 *       proof — must read as UNVERIFIED, never green.
 *
 * Run:  node scripts/trust-kernel/final-gate-check.selftest.mjs
 * Exit: 0 when the gate correctly flags every fixture; 1 otherwise.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEvidenceManifestFromReports } from './build-evidence-manifest.mjs';
import { buildUnsignedEvidenceAttestation } from './evidence-manifest-integrity.mjs';
import {
  checkVitestReport,
  evaluatePreAttestationReports,
  evaluateReports,
  REQUIRED_REPORT_MANIFEST,
} from './final-gate-check.mjs';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.error(`  NOT OK - ${name} ${extra}`);
  }
}

// A vitest v1.6.1 report with a skipped assertion but ALL aggregates green.
const SKIP_REPORT = {
  numTotalTestSuites: 1,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  success: true,
  testResults: [
    {
      assertionResults: [
        { status: 'passed', title: 'does a real thing' },
        { status: 'skipped', title: 'quietly skipped thing' },
      ],
    },
  ],
};

// A `test.todo` report — todo aggregate set AND a todo assertion.
const TODO_REPORT = {
  numTotalTests: 1,
  numPassedTests: 0,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 1,
  success: true,
  testResults: [{ assertionResults: [{ status: 'todo', title: 'not written yet' }] }],
};

const CLEAN_REPORT = {
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  success: true,
  testResults: [
    { assertionResults: [{ status: 'passed', title: 'a' }, { status: 'passed', title: 'b' }] },
  ],
};

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const CI_RUN_ID = 'final-gate-selftest-run';
const WORKFLOW_IDENTITY = 'Trust Kernel Verify';
const KEY_ID = 'monolith-evidence-key-0001';
const MANIFEST_ENV = {
  R_MATRIX: 'success',
  R_EDGE: 'success',
  R_E2E: 'success',
  R_CLAIM: 'success',
  GITHUB_SHA: HEAD,
  GITHUB_REF_NAME: 'codex/repair-intelligence-phase0-trust',
  GITHUB_RUN_ID: CI_RUN_ID,
  GITHUB_WORKFLOW: WORKFLOW_IDENTITY,
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  EVIDENCE_SIGNER_KEY_ID: KEY_ID,
};

function completeAttestation(manifest, verified) {
  return {
    schema: 'EvidenceAttestationV1',
    verified,
    reason: verified ? 'complete evidence manifest signed and cryptographically self-verified' : 'fixture rejection',
    attestation: {
      ...buildUnsignedEvidenceAttestation(manifest),
      signatureBase64: Buffer.alloc(64, 7).toString('base64'),
    },
  };
}

console.log('checkVitestReport unit checks:');
check('flags a hidden it.skip (status=skipped) despite green aggregates', checkVitestReport(SKIP_REPORT, 'x.json').length > 0);
check('flags a test.todo', checkVitestReport(TODO_REPORT, 'x.json').length > 0);
check('passes a genuinely clean report', checkVitestReport(CLEAN_REPORT, 'x.json').length === 0);

// --- end-to-end evaluateReports over a temp report tree ----------------------
function writeCleanTree(dir, { evidenceVerified }) {
  fs.mkdirSync(dir, { recursive: true });
  const w = (name, obj) => fs.writeFileSync(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
  w('server-ubuntu-latest.json', CLEAN_REPORT);
  w('server-windows-latest.json', CLEAN_REPORT);
  w('verifier-ubuntu-latest.json', CLEAN_REPORT);
  w('verifier-windows-latest.json', CLEAN_REPORT);
  w('determinism-ubuntu-latest.json', CLEAN_REPORT);
  w('determinism-windows-latest.json', CLEAN_REPORT);
  w('containment-ubuntu-latest.json', CLEAN_REPORT);
  w('containment-windows-latest.json', CLEAN_REPORT);
  w('repair-ubuntu-latest.json', CLEAN_REPORT);
  w('repair-windows-latest.json', CLEAN_REPORT);
  w('edge.json', CLEAN_REPORT);
  for (const suite of [
    'trust_kernel_tenancy', 'trust_kernel_governance', 'trust_kernel_release',
    'trust_kernel_bundles', 'trust_kernel_containment', 'trust_kernel_safety',
    'workflow_db_invariants',
  ]) {
    w(`pgtap-${suite}.tap`, 'ok 1 - a\nok 2 - b\n1..2\n');
  }
  w('e2e.json', { stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 0 } });
  w('golden-ubuntu-latest.sha', 'ac31db34a8352705758de374aea3938dc028c26dc97b96eb5ddf3a819ab42479\n');
  w('golden-windows-latest.sha', 'ac31db34a8352705758de374aea3938dc028c26dc97b96eb5ddf3a819ab42479\n');
  // Repair Phase 0 evidence (Task 8): disposition ledger, bilingual docs, route
  // ledger, pinned claim linters, and the two Repair pgTAP suites.
  w('repair-phase0-ledger.json', { pass: true, errors: [], surfaceCount: 18, categories: ['AUTH'], roots: ['PRODUCT'] });
  w('pgtap-repair_phase0_organization.tap', 'ok 1 - org table\nok 2 - scope\n1..2\n');
  w('pgtap-repair_phase0_containment.tap', 'ok 1 - policies removed\n1..1\n');
  w('repair-docs.txt', 'REPAIR PHASE 0 DOCS: PASS\n');
  w('route-ledger.txt', 'ROUTE LEDGER: PASS\n');
  w('claim-linters.txt', 'CLAIM LINTERS: PASS\n');
  const manifest = buildEvidenceManifestFromReports({ reportsRoot: dir, env: MANIFEST_ENV, root: REPO_ROOT });
  w('evidence-manifest.json', manifest);
  w('evidence-attestation.json', completeAttestation(manifest, evidenceVerified));
  for (const report of REQUIRED_REPORT_MANIFEST) {
    if (!fs.existsSync(path.join(dir, report))) throw new Error(`clean fixture omitted required report: ${report}`);
  }
  return dir;
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-finalgate-'));
const OK_JOBS = {
  'matrix-tests': 'success',
  'edge-db': 'success',
  'e2e': 'success',
  'claim-linters': 'success',
  'evidence-self-verify': 'success',
};
const FINAL_ENV = { GITHUB_RUN_ID: CI_RUN_ID };

console.log('evaluateReports end-to-end checks:');

// 1. A fully clean, evidence-verified tree PASSES (no violations).
{
  const dir = writeCleanTree(path.join(base, 'clean'), { evidenceVerified: true });
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: FINAL_ENV });
  check('clean+verified tree yields zero violations', v.length === 0, JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'minimal-evidence'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'evidence-attestation.json'), JSON.stringify({ verified: true }));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: FINAL_ENV });
  check('a bare {verified:true} evidence report is rejected', v.some((s) => /evidence|attestation|schema/i.test(s)), JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'evidence-job-failed'), { evidenceVerified: true });
  const v = evaluateReports({
    root: dir,
    jobResults: { ...OK_JOBS, 'evidence-self-verify': 'failure' },
    env: FINAL_ENV,
  });
  check('a failed evidence-self-verify job result is rejected', v.some((s) => /evidence-self-verify.*failure/i.test(s)), JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'evidence-root-mismatch'), { evidenceVerified: true });
  const file = path.join(dir, 'evidence-attestation.json');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  report.attestation.evidenceRootHash = '0'.repeat(64);
  fs.writeFileSync(file, JSON.stringify(report));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: FINAL_ENV });
  check('an attestation evidenceRootHash mismatch is rejected', v.some((s) => /evidence.*root|root.*mismatch/i.test(s)), JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'evidence-report-byte-drift'), { evidenceVerified: true });
  const file = path.join(dir, 'server-ubuntu-latest.json');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  report.testResults[0].assertionResults[0].title = 'still passing, but different report bytes';
  fs.writeFileSync(file, JSON.stringify(report));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: FINAL_ENV });
  check('report bytes that drift after manifest creation are rejected', v.some((s) => /digest differs|evidence.*mismatch/i.test(s)), JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'evidence-signature-shape'), { evidenceVerified: true });
  const file = path.join(dir, 'evidence-attestation.json');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  report.attestation.signatureBase64 = 'not-an-ed25519-signature';
  fs.writeFileSync(file, JSON.stringify(report));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: FINAL_ENV });
  check('a malformed Ed25519 signature shape is rejected', v.some((s) => /signature|Ed25519/i.test(s)), JSON.stringify(v));
}

{
  const dir = writeCleanTree(path.join(base, 'evidence-ci-run-mismatch'), { evidenceVerified: true });
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS, env: { GITHUB_RUN_ID: 'different-run' } });
  check('an attestation ciRunId mismatch is rejected when GITHUB_RUN_ID is present', v.some((s) => /ciRunId|GITHUB_RUN_ID/i.test(s)), JSON.stringify(v));
}

// The evidence issuer validates the complete upstream tree before an attestation
// exists. This dedicated path omits only that circular input; all other report
// semantics and job results remain load-bearing.
{
  const dir = writeCleanTree(path.join(base, 'clean-pre-attestation'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'evidence-attestation.json'));
  const v = evaluatePreAttestationReports({ root: dir, jobResults: OK_JOBS });
  check('pre-attestation validation accepts a clean tree without its not-yet-issued proof', v.length === 0, JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'failed-pre-attestation'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'evidence-attestation.json'));
  fs.writeFileSync(path.join(dir, 'server-ubuntu-latest.json'), JSON.stringify(SKIP_REPORT));
  const v = evaluatePreAttestationReports({ root: dir, jobResults: OK_JOBS });
  check('pre-attestation validation still rejects a hidden skip', v.some((s) => /skip|pending|todo/i.test(s)), JSON.stringify(v));
}

// Every named workflow output is load-bearing, not merely validated if present.
for (const report of REQUIRED_REPORT_MANIFEST) {
  const dir = writeCleanTree(path.join(base, `missing-${report}`), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, report));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check(`a missing workflow report ${report} is flagged`, v.some((s) => s.includes(report)), JSON.stringify(v));
}

// 2. Inject a hidden it.skip into ONE server report -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'skip'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'server-ubuntu-latest.json'), JSON.stringify(SKIP_REPORT));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a hidden it.skip in a server report is flagged', v.some((s) => /skip|pending|todo/i.test(s)), JSON.stringify(v));
}

// 3. Inject a test.todo -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'todo'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'containment-ubuntu-latest.json'), JSON.stringify(TODO_REPORT));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a test.todo is flagged', v.some((s) => /todo|skip|pending/i.test(s)), JSON.stringify(v));
}

// 4. Evidence attestation NOT verified -> gate FAILS (UNVERIFIED, not green).
{
  const dir = writeCleanTree(path.join(base, 'evunverified'), { evidenceVerified: false });
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('an unverified evidence attestation is flagged UNVERIFIED', v.some((s) => /evidence/i.test(s)), JSON.stringify(v));
}

// 5. Evidence attestation report absent entirely -> gate FAILS (presence-of-env is not a pass).
{
  const dir = writeCleanTree(path.join(base, 'evmissing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'evidence-attestation.json'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing evidence attestation proof is flagged UNVERIFIED', v.some((s) => /evidence/i.test(s)), JSON.stringify(v));
}

// 6. Repair Phase 0 evidence (Task 8): each required artifact, when MISSING or
//    failed, must fail the gate even though every other report is green.
{
  const dir = writeCleanTree(path.join(base, 'repair-ledger-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'repair-phase0-ledger.json'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing repair-phase0-ledger.json is flagged', v.some((s) => /repair-phase0-ledger/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'repair-ledger-failed'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'repair-phase0-ledger.json'), JSON.stringify({ pass: false, errors: ['x'], surfaceCount: 0 }));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a failed repair-phase0-ledger.json is flagged', v.some((s) => /repair-phase0-ledger/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'repair-org-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'pgtap-repair_phase0_organization.tap'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing repair_phase0_organization.tap is flagged', v.some((s) => /repair_phase0_organization/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'repair-contain-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'pgtap-repair_phase0_containment.tap'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing repair_phase0_containment.tap is flagged', v.some((s) => /repair_phase0_containment/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'repair-tap-empty'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'pgtap-repair_phase0_containment.tap'), '1..0\n');
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a zero-assertion repair pgTAP report is rejected', v.some((s) => /empty pgTAP/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'repair-docs-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'repair-docs.txt'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing bilingual docs verifier report is flagged', v.some((s) => /repair-docs/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'route-ledger-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'route-ledger.txt'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing route-ledger report is flagged', v.some((s) => /route-ledger/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'claim-linters-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'claim-linters.txt'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing pinned claim-linter report is flagged', v.some((s) => /claim-linters/i.test(s)), JSON.stringify(v));
}

// 14. A required named pgTAP suite missing -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'named-pgtap-missing'), { evidenceVerified: true });
  fs.unlinkSync(path.join(dir, 'pgtap-trust_kernel_safety.tap'));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a missing named pgTAP suite (trust_kernel_safety) is flagged', v.some((s) => /trust_kernel_safety/i.test(s)), JSON.stringify(v));
}

// 15. A required vitest report that is malformed/empty (shape drift) -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'shape-drift'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'server-ubuntu-latest.json'), JSON.stringify({ note: 'not a vitest report' }));
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a required report that is not a valid vitest report is flagged', v.some((s) => /server-ubuntu-latest|not a valid|shape/i.test(s)), JSON.stringify(v));
}

// 16. Two EMPTY golden sha files must NOT compare equal -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'empty-golden'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'golden-ubuntu-latest.sha'), '');
  fs.writeFileSync(path.join(dir, 'golden-windows-latest.sha'), '');
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('two empty golden sha files are rejected (not treated as a match)', v.some((s) => /golden|empty/i.test(s)), JSON.stringify(v));
}

// 17. A pgTAP report carrying a Bail out! / SKIP directive -> gate FAILS.
{
  const dir = writeCleanTree(path.join(base, 'tap-bailout'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'pgtap-trust_kernel_release.tap'), 'ok 1 - a\nBail out! db gone\n');
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a pgTAP Bail out! is flagged', v.some((s) => /bail/i.test(s)), JSON.stringify(v));
}
{
  const dir = writeCleanTree(path.join(base, 'tap-skip'), { evidenceVerified: true });
  fs.writeFileSync(path.join(dir, 'pgtap-trust_kernel_release.tap'), 'ok 1 - a # SKIP not today\nok 2 - b\n1..2\n');
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('a pgTAP # SKIP directive is flagged', v.some((s) => /skip/i.test(s)), JSON.stringify(v));
}

fs.rmSync(base, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nFINAL-GATE SELF-TEST: FAIL (${failures} check(s) did not hold)`);
  process.exit(1);
}
console.log('\nFINAL-GATE SELF-TEST: PASS');
