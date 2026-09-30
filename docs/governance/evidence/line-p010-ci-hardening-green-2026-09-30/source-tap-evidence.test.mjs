// Strict TAP evidence checks for db-verify (scripts/line-ci-tap.mjs).
// Run: node --test tests/line-oa-commerce/ci/tap-evidence.test.mjs
// No database is needed; every input is a fixed TAP text.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LINE_SUITES, SUITES, analyzeTap, buildMetadata, executionOrigin, summarize,
} from '../../../scripts/line-ci-tap.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/line-ci-tap.mjs', import.meta.url));

const okLines = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `ok ${from + i} - assertion ${from + i}`);
const tapText = (...lines) => `${lines.flat().join('\n')}\n`;
const fullTap = (n) => tapText('CREATE EXTENSION', `1..${n}`, okLines(1, n), 'ROLLBACK');
const codes = (analysis) => analysis.failures.map((f) => f.code);

// The predicate db-verify.yml used before this change: at least one ok, no not ok.
const oldPredicate = (text) => (text.match(/^ok /gm) || []).length > 0 && (text.match(/^not ok /gm) || []).length === 0;

// repair_phase0_containment as observed locally: plan 8, six results, psql stopped.
const STOPPED = tapText('BEGIN', 'CREATE EXTENSION', '1..8', okLines(1, 6));

const FAIL_CLOSED_STDOUT = tapText(
  'BEGIN',
  '# migration under test: ../migrations/0198_line_oa_revoke_client_write_grants.sql',
  'CREATE EXTENSION', '1..13', 'CREATE FUNCTION', 'CREATE FUNCTION',
  okLines(1, 1), 'SAVEPOINT', 'CREATE ROLE', 'GRANT', 'ROLLBACK', 'RELEASE',
  okLines(2, 13), 'ROLLBACK',
);
const EXPECTED_ERRORS = [
  'psql:supabase/migrations/0198_line_oa_revoke_client_write_grants.sql:65: ERROR:  P0-10: write privileges remain after revoke: anon:line_oa_orders',
  'CONTEXT:  PL/pgSQL function inline_code_block line 36 at RAISE',
];

test('suite list is the twelve db-verify suites with the three LINE suites last', () => {
  assert.deepEqual([...SUITES], [
    'workflow_db_invariants', 'trust_kernel_tenancy', 'trust_kernel_governance',
    'trust_kernel_release', 'trust_kernel_bundles', 'trust_kernel_containment',
    'trust_kernel_safety', 'repair_phase0_organization', 'repair_phase0_containment',
    'line_outbound_claim_record', 'line_oa_client_write_revoke',
    'line_oa_client_write_revoke_fail_closed',
  ]);
  assert.deepEqual([...LINE_SUITES], SUITES.slice(9));
});

test('plan 8 with 6 ok and psql exit 3 fails (the stopped containment suite)', () => {
  // The old predicate accepted this output. This line only documents the defect;
  // the RED proof for this file is that it fails while the module is absent.
  assert.equal(oldPredicate(STOPPED), true);

  const a = analyzeTap(STOPPED, 3);
  assert.equal(a.pass, false);
  assert.equal(a.plan, 8);
  assert.equal(a.ok, 6);
  assert.equal(a.results, 6);
  assert.equal(a.exitCode, 3);
  assert.deepEqual(codes(a), ['incomplete-results', 'nonzero-exit']);
  assert.match(a.failures[0].detail, /missing: 7, 8/);
});

test('plan 8 with 6 ok fails even when psql exits 0', () => {
  const a = analyzeTap(STOPPED, 0);
  assert.equal(a.pass, false);
  assert.deepEqual(codes(a), ['incomplete-results']);
});

test('fail-closed suite: 13 of 13 with psql noise and exit 0 passes', () => {
  const a = analyzeTap(FAIL_CLOSED_STDOUT, 0);
  assert.equal(a.pass, true);
  assert.equal(a.plan, 13);
  assert.equal(a.ok, 13);
  assert.equal(a.notOk, 0);
  assert.equal(a.sqlErrorLines, 0);
  assert.deepEqual(a.failures, []);
});

test('expected SQL errors are noise, not results, whether stderr is separate or merged', () => {
  const merged = tapText('1..13', okLines(1, 1), EXPECTED_ERRORS, okLines(2, 13));
  const a = analyzeTap(merged, 0);
  assert.equal(a.pass, true);
  assert.equal(a.sqlErrorLines, 1);

  // The stderr stream on its own is not TAP evidence.
  const stderrOnly = analyzeTap(tapText(EXPECTED_ERRORS), 0);
  assert.equal(stderrOnly.pass, false);
  assert.ok(codes(stderrOnly).includes('missing-plan'));
  assert.ok(codes(stderrOnly).includes('no-results'));

  // An error that made psql stop is still a failure.
  assert.equal(analyzeTap(merged, 3).pass, false);
});

test('a nonzero or unrecorded psql exit fails even with a complete TAP', () => {
  assert.deepEqual(codes(analyzeTap(fullTap(13), 3)), ['nonzero-exit']);
  assert.deepEqual(codes(analyzeTap(fullTap(13), 1)), ['nonzero-exit']);
  for (const bad of [undefined, null, '0', Number.NaN, 0.5]) {
    assert.deepEqual(codes(analyzeTap(fullTap(13), bad)), ['invalid-exit-code']);
  }
  assert.equal(analyzeTap(null, 0).pass, false);
  assert.ok(codes(analyzeTap(null, 0)).includes('missing-tap'));
});

test('exactly one valid nonzero plan is required', () => {
  assert.deepEqual(codes(analyzeTap(tapText(okLines(1, 13)), 0)), ['missing-plan']);
  assert.deepEqual(codes(analyzeTap(tapText('1..3', okLines(1, 3), '1..3'), 0)), ['duplicate-plan']);
  assert.ok(codes(analyzeTap(tapText('1..0'), 0)).includes('invalid-plan'));
  assert.ok(codes(analyzeTap(tapText('1..0 # SKIP no database'), 0)).includes('invalid-plan'));
  assert.ok(codes(analyzeTap(tapText('2..4', okLines(2, 4)), 0)).includes('invalid-plan'));
});

test('the plan may come first or last, not in the middle', () => {
  assert.equal(analyzeTap(tapText('1..3', okLines(1, 3)), 0).pass, true);
  assert.equal(analyzeTap(tapText(okLines(1, 3), '1..3'), 0).pass, true);
  assert.deepEqual(codes(analyzeTap(tapText(okLines(1, 2), '1..3', okLines(3, 3)), 0)), ['misplaced-plan']);
});

test('plan-like text in comments, data rows and descriptions is not a plan', () => {
  const a = analyzeTap(tapText(
    '#         want: 1..99', ' 1..99', '1..99|row', 'ok 1 - description mentions 1..99', '1..1',
  ), 0);
  assert.equal(a.pass, true);
  assert.equal(a.plan, 1);
  assert.equal(a.planLines, 1);
});

test('result numbers must be unique, sequential and inside the plan', () => {
  const duplicate = analyzeTap(tapText('1..3', 'ok 1 - a', 'ok 2 - b', 'ok 2 - b again'), 0);
  assert.equal(duplicate.pass, false);
  assert.ok(codes(duplicate).includes('duplicate-result'));
  assert.ok(codes(duplicate).includes('incomplete-results'));

  assert.deepEqual(codes(analyzeTap(tapText('1..3', 'ok 1 - a', 'ok 3 - c', 'ok 2 - b'), 0)), ['out-of-order-result']);
  assert.deepEqual(codes(analyzeTap(tapText('1..2', okLines(1, 3)), 0)), ['extra-results']);
  assert.ok(codes(analyzeTap(tapText('1..2', 'ok - a', 'ok - b'), 0)).includes('unnumbered-result'));
});

test('not ok, bail out, SKIP and TODO never count as a pass', () => {
  const failed = analyzeTap(tapText('1..2', 'ok 1 - a', 'not ok 2 - b'), 0);
  assert.deepEqual(codes(failed), ['failed-result']);
  assert.equal(failed.notOk, 1);

  assert.deepEqual(codes(analyzeTap(tapText('1..2', okLines(1, 2), 'Bail out! database went away'), 0)), ['bail-out']);
  assert.deepEqual(codes(analyzeTap(tapText('1..2', 'ok 1 - a', 'ok 2 - b # SKIP no pg_cron'), 0)), ['skip-directive']);
  assert.deepEqual(codes(analyzeTap(tapText('1..2', 'ok 1 - a', 'ok 2 - b # TODO later'), 0)), ['todo-directive']);
  assert.deepEqual(codes(analyzeTap(tapText('1..2', 'ok 1 - a', 'not ok 2 - b # TODO later'), 0)), ['failed-result', 'todo-directive']);

  // pgTAP escapes a literal hash in a description; that is not a directive.
  assert.equal(analyzeTap(tapText('1..2', 'ok 1 - a', 'ok 2 - checks the \\# TODO marker'), 0).pass, true);
});

test('pgTAP finish diagnostics fail, and a silent finish does not excuse a missing plan or results', () => {
  const short = analyzeTap(tapText('1..8', okLines(1, 6), '# Looks like you planned 8 tests but ran 6'), 0);
  assert.deepEqual(codes(short), ['incomplete-results', 'finish-diagnostic']);

  const complained = analyzeTap(tapText('1..2', okLines(1, 2), '# Looks like you failed 1 test of 2'), 0);
  assert.deepEqual(codes(complained), ['finish-diagnostic']);

  // finish() printed nothing and psql exited 0, but the evidence is incomplete.
  assert.equal(analyzeTap(tapText(okLines(1, 13), 'ROLLBACK'), 0).pass, false);
  const noResults = analyzeTap(tapText('1..13', 'ROLLBACK'), 0);
  assert.equal(noResults.pass, false);
  assert.ok(codes(noResults).includes('no-results'));
  assert.ok(codes(noResults).includes('incomplete-results'));
});

const evidence = (suite, text = fullTap(3), exitCode = 0) => ({
  suite, stdout: `tap/${suite}.tap`, stderr: `tap/${suite}.stderr`, ...analyzeTap(text, exitCode),
});
const allPassing = () => SUITES.map((suite) => evidence(suite));
const entry = (summary, suite) => summary.pgtap.suites.find((s) => s.suite === suite);

test('summary passes only when all twelve suites have passing evidence', () => {
  const s = summarize(allPassing(), {});
  assert.equal(s.pass, true);
  assert.equal(s.fullPass, true);
  assert.equal(s.linePass, true);
  assert.equal(s.pgtap.pass, true);
  assert.deepEqual(s.missingSuites, []);
  assert.deepEqual(s.pgtap.suites.map((x) => x.suite), [...SUITES]);
  assert.equal(entry(s, 'workflow_db_invariants').file, 'workflow_db_invariants.sql');
});

test('a suite without result JSON is missing evidence and fails the summary', () => {
  const gone = 'line_oa_client_write_revoke_fail_closed';
  const s = summarize(allPassing().filter((r) => r.suite !== gone), {});
  assert.equal(s.pass, false);
  assert.equal(s.fullPass, false);
  assert.equal(s.linePass, false);
  assert.deepEqual(s.missingSuites, [gone]);
  assert.equal(entry(s, gone).missing, true);
  assert.deepEqual(codes(entry(s, gone)), ['missing-evidence']);

  const empty = summarize([], {});
  assert.equal(empty.pass, false);
  assert.deepEqual(empty.missingSuites, [...SUITES]);
});

test('linePass can be true while fullPass is false, and the top-level pass follows fullPass', () => {
  const results = allPassing().map((r) => (r.suite === 'repair_phase0_containment' ? evidence(r.suite, STOPPED, 3) : r));
  const s = summarize(results, {});
  assert.equal(s.linePass, true);
  assert.equal(s.fullPass, false);
  assert.equal(s.pass, false);
  assert.equal(s.pgtap.pass, false);
  assert.deepEqual(s.missingSuites, []);

  const stopped = entry(s, 'repair_phase0_containment');
  assert.equal(stopped.pass, false);
  assert.equal(stopped.exitCode, 3);
  assert.equal(stopped.plan, 8);
  assert.equal(stopped.ok, 6);
  assert.equal(stopped.stdout, 'tap/repair_phase0_containment.tap');
  assert.equal(stopped.stderr, 'tap/repair_phase0_containment.stderr');
});

test('summary does not trust a pass flag that the recorded facts contradict', () => {
  const flip = (change) => allPassing().map((r) => (r.suite === 'trust_kernel_safety' ? change(r) : r));

  const exitChanged = summarize(flip((r) => ({ ...r, exitCode: 3 })), {});
  assert.equal(exitChanged.pass, false);
  assert.deepEqual(codes(entry(exitChanged, 'trust_kernel_safety')), ['inconsistent-result']);

  const forced = summarize(flip((r) => ({ ...evidence(r.suite, STOPPED, 3), pass: true })), {});
  assert.equal(forced.pass, false);
  assert.equal(entry(forced, 'trust_kernel_safety').pass, false);
});

test('summary rejects evidence filed under the wrong suite, twice, or for an unknown suite', () => {
  const swapped = allPassing().map((r) => (r.suite === 'workflow_db_invariants' ? { ...r, stdout: 'tap/trust_kernel_safety.tap' } : r));
  const a = summarize(swapped, {});
  assert.equal(a.pass, false);
  assert.deepEqual(codes(entry(a, 'workflow_db_invariants')), ['suite-file-mismatch']);

  const b = summarize([...allPassing(), evidence(SUITES[0])], {});
  assert.equal(b.pass, false);
  assert.ok(codes(entry(b, SUITES[0])).includes('duplicate-evidence'));

  const c = summarize([...allPassing(), evidence('made_up_suite')], {});
  assert.equal(c.pass, false);
  assert.deepEqual(c.unexpectedSuites, ['made_up_suite']);

  const d = summarize(allPassing().map((r) => ({ ...r, runId: 'old-run' })), { runId: 'this-run' });
  assert.equal(d.pass, false);
  assert.ok(codes(entry(d, SUITES[0])).includes('stale-result'));
});

test('metadata: a local run is labelled local and does not claim an Ubuntu runner', () => {
  const local = buildMetadata({});
  assert.equal(local.origin, 'local');
  assert.equal(local.evidenceTier, null);
  assert.equal(local.runUrl, null);
  assert.match(local.environment, /^local /);
  assert.doesNotMatch(local.environment, /ubuntu|github-actions/i);

  // ci-replica.py sets GITHUB_SHA and friends to 'local' but not GITHUB_ACTIONS.
  const replica = buildMetadata({ GITHUB_SHA: 'local', GITHUB_SERVER_URL: 'local', GITHUB_REPOSITORY: 'local', GITHUB_RUN_ID: 'local' });
  assert.equal(replica.origin, 'local');
  assert.equal(replica.runUrl, null);
  assert.equal(replica.commit, null);

  const s = summarize(allPassing(), local);
  assert.equal(s.origin, 'local');
  assert.equal(s.environment, local.environment);
  assert.equal(summarize(allPassing()).origin, 'local');
});

test('metadata: github-actions is reported only when GITHUB_ACTIONS=true', () => {
  const ci = buildMetadata({
    GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', ImageOS: 'ubuntu24', GITHUB_SHA: 'abc123', GITHUB_REF: 'refs/heads/x',
    GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '42',
  });
  assert.equal(ci.origin, 'github-actions');
  assert.equal(ci.evidenceTier, 'E0');
  assert.equal(ci.commit, 'abc123');
  assert.equal(ci.runUrl, 'https://github.com/owner/repo/actions/runs/42');
  assert.match(ci.environment, /^github-actions Linux/);

  assert.equal(executionOrigin({}), 'local');
  assert.equal(executionOrigin({ GITHUB_ACTIONS: 'true' }), 'github-actions');
  assert.equal(executionOrigin({ LINE_DB_EVIDENCE_ORIGIN: 'ci-replica' }), 'ci-replica');
  assert.equal(executionOrigin({ GITHUB_ACTIONS: 'true', LINE_DB_EVIDENCE_ORIGIN: 'ci-replica' }), 'ci-replica');

  const spoof = buildMetadata({ LINE_DB_EVIDENCE_ORIGIN: 'github-actions' });
  assert.equal(spoof.origin, 'local');
  assert.equal(spoof.originClaimRejected, 'github-actions');
  assert.equal(spoof.evidenceTier, null);
});

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-ci-tap-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'tap'));
  return dir;
}
const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env, GITHUB_ACTIONS: 'false', LINE_DB_EVIDENCE_ORIGIN: '', LINE_DB_RUN_ID: 'test-run',
    LINE_DB_MIGRATIONS_FILE: 'no-such-file.txt',
  },
});
const tapPath = (suite) => path.join('tap', `${suite}.tap`);
const resultPath = (suite) => path.join('tap', `${suite}.result.json`);
const readJson = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
function checkSuite(dir, suite, text, exitCode) {
  fs.writeFileSync(path.join(dir, tapPath(suite)), text);
  return cli(dir, 'check', tapPath(suite), String(exitCode), suite, resultPath(suite));
}

test('CLI check writes the result file and exits 1 for failing evidence', (t) => {
  const dir = sandbox(t);

  const stopped = checkSuite(dir, 'repair_phase0_containment', STOPPED, 3);
  assert.equal(stopped.status, 1);
  const result = readJson(dir, resultPath('repair_phase0_containment'));
  assert.equal(result.pass, false);
  assert.equal(result.suite, 'repair_phase0_containment');
  assert.equal(result.exitCode, 3);
  assert.equal(baseNameOf(result.stdout), 'repair_phase0_containment.tap');
  assert.equal(baseNameOf(result.stderr), 'repair_phase0_containment.stderr');
  assert.equal(result.tapSha256.length, 64);
  assert.equal(result.runId, 'test-run');

  assert.equal(checkSuite(dir, 'line_outbound_claim_record', fullTap(3), 0).status, 0);
  assert.equal(readJson(dir, resultPath('line_outbound_claim_record')).pass, true);

  // A TAP file that does not belong to the named suite.
  fs.writeFileSync(path.join(dir, 'tap', 'other.tap'), fullTap(3));
  const wrongFile = cli(dir, 'check', path.join('tap', 'other.tap'), '0', 'line_oa_client_write_revoke', path.join('tap', 'wrong.json'));
  assert.equal(wrongFile.status, 1);
  assert.ok(codes(readJson(dir, path.join('tap', 'wrong.json'))).includes('suite-file-mismatch'));

  // No TAP file at all, and an exit code that was not recorded.
  const noTap = cli(dir, 'check', tapPath('trust_kernel_safety'), '0', 'trust_kernel_safety', resultPath('trust_kernel_safety'));
  assert.equal(noTap.status, 1);
  assert.ok(codes(readJson(dir, resultPath('trust_kernel_safety'))).includes('missing-tap'));
  fs.writeFileSync(path.join(dir, tapPath('trust_kernel_tenancy')), fullTap(3));
  const noExit = cli(dir, 'check', tapPath('trust_kernel_tenancy'), '', 'trust_kernel_tenancy', resultPath('trust_kernel_tenancy'));
  assert.equal(noExit.status, 1);
  assert.deepEqual(codes(readJson(dir, resultPath('trust_kernel_tenancy'))), ['invalid-exit-code']);

  assert.equal(cli(dir).status, 2);
});

test('CLI assemble writes the artifact even when suites fail or are missing', (t) => {
  const dir = sandbox(t);
  checkSuite(dir, 'repair_phase0_containment', STOPPED, 3);
  checkSuite(dir, 'line_outbound_claim_record', fullTap(3), 0);

  const run = cli(dir, 'assemble', 'tap', 'db-verify-evidence.json');
  assert.equal(run.status, 1);
  const summary = readJson(dir, 'db-verify-evidence.json');
  assert.equal(summary.pass, false);
  assert.equal(summary.fullPass, false);
  assert.equal(summary.linePass, false);
  assert.equal(summary.origin, 'local');
  assert.equal(summary.missingSuites.length, 10);
  assert.equal(entry(summary, 'repair_phase0_containment').exitCode, 3);
  assert.equal(entry(summary, 'repair_phase0_containment').pass, false);
  assert.equal(entry(summary, 'line_outbound_claim_record').pass, true);
});

test('CLI assemble passes only with twelve fresh passing results', (t) => {
  const dir = sandbox(t);
  for (const suite of SUITES) assert.equal(checkSuite(dir, suite, fullTap(3), 0).status, 0);

  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);
  const green = readJson(dir, 'out.json');
  assert.equal(green.pass, true);
  assert.equal(green.linePass, true);
  assert.deepEqual(green.missingSuites, []);

  // The TAP file changes after its result was written: the result is stale.
  fs.writeFileSync(path.join(dir, tapPath('trust_kernel_safety')), STOPPED);
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  const stale = readJson(dir, 'out.json');
  assert.equal(stale.pass, false);
  assert.equal(stale.linePass, true);
  assert.ok(codes(entry(stale, 'trust_kernel_safety')).includes('stale-result'));

  // A passing result copied under another suite's name is not accepted.
  fs.copyFileSync(path.join(dir, resultPath('line_outbound_claim_record')), path.join(dir, resultPath('workflow_db_invariants')));
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  const swapped = readJson(dir, 'out.json');
  assert.deepEqual(codes(entry(swapped, 'workflow_db_invariants')), ['suite-file-mismatch', 'invalid-result', 'stale-result']);
});

function baseNameOf(file) {
  return file.split(/[\\/]/).pop();
}
