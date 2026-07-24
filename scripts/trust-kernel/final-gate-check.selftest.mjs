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
import { checkVitestReport, evaluateReports } from './final-gate-check.mjs';

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
  w('containment-ubuntu-latest.json', CLEAN_REPORT);
  w('edge.json', CLEAN_REPORT);
  w('pgtap-trust_kernel_release.tap', 'ok 1 - release\nok 2 - more\n1..2\n');
  w('e2e.json', { stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 0 } });
  w('golden-ubuntu-latest.sha', 'ac31db34a8352705758de374aea3938dc028c26dc97b96eb5ddf3a819ab42479\n');
  w('golden-windows-latest.sha', 'ac31db34a8352705758de374aea3938dc028c26dc97b96eb5ddf3a819ab42479\n');
  w('evidence-attestation.json', { schema: 'EvidenceAttestationV1', verified: evidenceVerified });
  return dir;
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-finalgate-'));
const OK_JOBS = { 'matrix-tests': 'success', 'edge-db': 'success', 'e2e': 'success' };

console.log('evaluateReports end-to-end checks:');

// 1. A fully clean, evidence-verified tree PASSES (no violations).
{
  const dir = writeCleanTree(path.join(base, 'clean'), { evidenceVerified: true });
  const v = evaluateReports({ root: dir, jobResults: OK_JOBS });
  check('clean+verified tree yields zero violations', v.length === 0, JSON.stringify(v));
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

fs.rmSync(base, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nFINAL-GATE SELF-TEST: FAIL (${failures} check(s) did not hold)`);
  process.exit(1);
}
console.log('\nFINAL-GATE SELF-TEST: PASS');
