// Strict TAP evidence checks for db-verify (scripts/line-ci-tap.mjs).
// Run: node --test tests/line-oa-commerce/ci/tap-evidence.test.mjs
// No database is needed; every input is a fixed TAP text.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LINE_SUITES, SUITES, analyzeTap, buildMetadata, executionOrigin, summarize,
} from '../../../scripts/line-ci-tap.mjs';
// Namespace import, so an export that does not exist yet fails its own tests only.
import * as lineCiTap from '../../../scripts/line-ci-tap.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/line-ci-tap.mjs', import.meta.url));

const okLines = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `ok ${from + i} - assertion ${from + i}`);
const tapText = (...lines) => `${lines.flat().join('\n')}\n`;
const fullTap = (n) => tapText('CREATE EXTENSION', `1..${n}`, okLines(1, n), 'ROLLBACK');
const codes = (analysis) => analysis.failures.map((f) => f.code);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const EMPTY_SHA256 = sha256('');

// Synthetic provenance values; none of them names a real commit or source tree.
const FIXED_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const FIXED_REF = 'refs/heads/evidence-followup';
const FIXED_SOURCE_SHA256 = 'ab'.repeat(32);
const PROVENANCE_FIELDS = ['commit', 'ref', 'runId', 'migrationsApplied', 'testedSourceSha256'];

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

test('suite list is the fifteen db-verify suites with the six LINE suites last', () => {
  assert.deepEqual([...SUITES], [
    'workflow_db_invariants', 'trust_kernel_tenancy', 'trust_kernel_governance',
    'trust_kernel_release', 'trust_kernel_bundles', 'trust_kernel_containment',
    'trust_kernel_safety', 'repair_phase0_organization', 'repair_phase0_containment',
    'line_outbound_claim_record', 'line_oa_client_write_revoke',
    'line_oa_client_write_revoke_fail_closed', 'line_oa_definer_execute_matrix',
    'line_oa_definer_execute_fail_closed', 'line_inbound_handler_retry',
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

// A good fixture records the hash of its (empty) stderr, as the CLI check does.
const evidence = (suite, text = fullTap(3), exitCode = 0) => ({
  suite, stdout: `tap/${suite}.tap`, stderr: `tap/${suite}.stderr`, stderrSha256: EMPTY_SHA256,
  ...analyzeTap(text, exitCode),
});
const allPassing = () => SUITES.map((suite) => evidence(suite));
const entry = (summary, suite) => summary.pgtap.suites.find((s) => s.suite === suite);

test('summary passes only when all fifteen suites have passing evidence', () => {
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

test('summary rejects a stderr path named for another suite or recorded without a hash', () => {
  const change = (suite, edit) => allPassing().map((r) => (r.suite === suite ? edit(r) : r));

  const misnamed = summarize(change('trust_kernel_safety', (r) => ({ ...r, stderr: 'tap/trust_kernel_tenancy.stderr' })), {});
  assert.equal(misnamed.pass, false);
  assert.equal(misnamed.linePass, true);
  assert.deepEqual(codes(entry(misnamed, 'trust_kernel_safety')), ['stderr-file-mismatch']);

  const unhashed = summarize(change('line_oa_client_write_revoke', ({ stderrSha256, ...rest }) => rest), {});
  assert.equal(unhashed.pass, false);
  assert.equal(unhashed.linePass, false);
  assert.deepEqual(codes(entry(unhashed, 'line_oa_client_write_revoke')), ['missing-stderr-hash']);

  const badHash = summarize(change('line_oa_client_write_revoke', (r) => ({ ...r, stderrSha256: 'not-a-digest' })), {});
  assert.deepEqual(codes(entry(badHash, 'line_oa_client_write_revoke')), ['missing-stderr-hash']);

  const good = summarize(allPassing(), {});
  assert.equal(entry(good, 'trust_kernel_safety').stderrSha256, EMPTY_SHA256);
});

test('verdict scope: a full pgTAP pass is pgtap-only and never a workflow verdict', () => {
  const s = summarize(allPassing(), {});
  assert.equal(s.fullPgTapPass, true);
  assert.equal(s.verdictScope, 'pgtap-only');
  assert.equal(s.workflowPass, null);
  assert.equal(s.pgtap.fullPgTapPass, true);
  // The old names stay as aliases of the pgTAP verdict.
  assert.equal(s.pass, s.fullPgTapPass);
  assert.equal(s.fullPass, s.fullPgTapPass);
  assert.equal(s.pgtap.pass, s.fullPgTapPass);
  assert.equal(s.pgtap.fullPass, s.fullPgTapPass);
});

test('verdict scope: LINE suites can pass while the full pgTAP verdict fails, and the workflow stays unevaluated', () => {
  const results = allPassing().map((r) => (r.suite === 'repair_phase0_containment' ? evidence(r.suite, STOPPED, 3) : r));
  const s = summarize(results, {});
  assert.equal(s.linePass, true);
  assert.equal(s.fullPgTapPass, false);
  assert.equal(s.pgtap.fullPgTapPass, false);
  assert.equal(s.fullPass, false);
  assert.equal(s.pass, false);
  assert.equal(s.verdictScope, 'pgtap-only');
  assert.equal(s.workflowPass, null);

  const empty = summarize([], {});
  assert.equal(empty.fullPgTapPass, false);
  assert.equal(empty.workflowPass, null);
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

test('metadata: the tested source digest comes from LINE_DB_EVIDENCE_SOURCE_SHA256', () => {
  assert.equal(buildMetadata({}).testedSourceSha256, null);
  assert.equal(buildMetadata({ LINE_DB_EVIDENCE_SOURCE_SHA256: '' }).testedSourceSha256, null);
  assert.equal(buildMetadata({ LINE_DB_EVIDENCE_SOURCE_SHA256: FIXED_SOURCE_SHA256 }).testedSourceSha256, FIXED_SOURCE_SHA256);

  const local = buildMetadata({
    LINE_DB_EVIDENCE_COMMIT: FIXED_COMMIT, LINE_DB_EVIDENCE_REF: FIXED_REF,
    LINE_DB_EVIDENCE_SOURCE_SHA256: FIXED_SOURCE_SHA256, LINE_DB_RUN_ID: 'run-1',
  });
  assert.equal(local.commit, FIXED_COMMIT);
  assert.equal(local.ref, FIXED_REF);
  assert.equal(local.runId, 'run-1');
});

test('provenance: complete metadata is reported complete and the digest reaches the summary', () => {
  const metadata = {
    commit: FIXED_COMMIT, ref: FIXED_REF, runId: 'run-1', migrationsApplied: 198, testedSourceSha256: FIXED_SOURCE_SHA256,
  };
  assert.deepEqual(lineCiTap.assessProvenance(metadata), { provenanceComplete: true, missingProvenance: [] });

  const s = summarize(allPassing().map((r) => ({ ...r, runId: 'run-1' })), metadata);
  assert.equal(s.pass, true);
  assert.equal(s.fullPgTapPass, true);
  assert.equal(s.provenanceComplete, true);
  assert.deepEqual(s.missingProvenance, []);
  assert.equal(s.testedSourceSha256, FIXED_SOURCE_SHA256);
  assert.equal(s.commit, FIXED_COMMIT);
  assert.equal(s.migrationsApplied, 198);
});

test('provenance: missing metadata is reported, and does not fail a passing TAP run', () => {
  const s = summarize(allPassing(), {});
  assert.equal(s.pass, true);
  assert.equal(s.fullPgTapPass, true);
  assert.equal(s.linePass, true);
  assert.equal(s.provenanceComplete, false);
  assert.deepEqual(s.missingProvenance, PROVENANCE_FIELDS);
  assert.equal(s.testedSourceSha256, null);

  // Complete provenance does not rescue failing evidence either.
  const failing = summarize([], {
    commit: FIXED_COMMIT, ref: FIXED_REF, runId: 'run-1', migrationsApplied: 198, testedSourceSha256: FIXED_SOURCE_SHA256,
  });
  assert.equal(failing.provenanceComplete, true);
  assert.equal(failing.pass, false);
  assert.equal(failing.fullPgTapPass, false);
});

test('provenance: invalid values count as missing', () => {
  const complete = {
    commit: FIXED_COMMIT, ref: FIXED_REF, runId: 'run-1', migrationsApplied: 198, testedSourceSha256: FIXED_SOURCE_SHA256,
  };
  const missing = (change) => lineCiTap.assessProvenance({ ...complete, ...change }).missingProvenance;

  for (const commit of ['abc123', 'local', '', null, FIXED_COMMIT.slice(0, 39), `${FIXED_COMMIT}0`, 'g'.repeat(40)]) {
    assert.deepEqual(missing({ commit }), ['commit']);
  }
  for (const ref of ['', '   ', null, undefined, 7]) assert.deepEqual(missing({ ref }), ['ref']);
  for (const runId of ['', ' ', null, undefined]) assert.deepEqual(missing({ runId }), ['runId']);
  for (const migrationsApplied of ['unknown', '198', 0, -1, 1.5, Number.NaN, null, undefined]) {
    assert.deepEqual(missing({ migrationsApplied }), ['migrationsApplied']);
  }
  for (const testedSourceSha256 of ['', 'xyz', null, FIXED_COMMIT, 'z'.repeat(64), `${FIXED_SOURCE_SHA256}00`]) {
    assert.deepEqual(missing({ testedSourceSha256 }), ['testedSourceSha256']);
  }

  assert.deepEqual(lineCiTap.assessProvenance({}).missingProvenance, PROVENANCE_FIELDS);
  assert.equal(lineCiTap.assessProvenance({}).provenanceComplete, false);
  assert.deepEqual(lineCiTap.assessProvenance().missingProvenance, PROVENANCE_FIELDS);
});

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-ci-tap-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'tap'));
  return dir;
}
// Provenance variables are blanked so the caller's environment cannot leak in.
const cliWith = (cwd, extraEnv, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env, GITHUB_ACTIONS: 'false', LINE_DB_EVIDENCE_ORIGIN: '', LINE_DB_RUN_ID: 'test-run',
    LINE_DB_MIGRATIONS_FILE: 'no-such-file.txt',
    LINE_DB_EVIDENCE_COMMIT: '', LINE_DB_EVIDENCE_REF: '', LINE_DB_EVIDENCE_SOURCE_SHA256: '',
    ...extraEnv,
  },
});
const cli = (cwd, ...args) => cliWith(cwd, {}, ...args);
const tapPath = (suite) => path.join('tap', `${suite}.tap`);
const stderrPath = (suite) => path.join('tap', `${suite}.stderr`);
const resultPath = (suite) => path.join('tap', `${suite}.result.json`);
const readJson = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
// Writes the TAP file and a real stderr file beside it (empty unless given).
function checkSuite(dir, suite, text, exitCode, stderrText = '') {
  fs.writeFileSync(path.join(dir, tapPath(suite)), text);
  fs.writeFileSync(path.join(dir, stderrPath(suite)), stderrText);
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
  fs.writeFileSync(path.join(dir, stderrPath('trust_kernel_tenancy')), '');
  const noExit = cli(dir, 'check', tapPath('trust_kernel_tenancy'), '', 'trust_kernel_tenancy', resultPath('trust_kernel_tenancy'));
  assert.equal(noExit.status, 1);
  assert.deepEqual(codes(readJson(dir, resultPath('trust_kernel_tenancy'))), ['invalid-exit-code']);

  assert.equal(cli(dir).status, 2);
});

test('CLI check refuses a missing stderr file and a stderr file named for another suite', (t) => {
  const dir = sandbox(t);

  // A complete TAP with no stderr file beside it (the default path).
  const suite = 'line_outbound_claim_record';
  fs.writeFileSync(path.join(dir, tapPath(suite)), fullTap(3));
  const missing = cli(dir, 'check', tapPath(suite), '0', suite, resultPath(suite));
  assert.equal(missing.status, 1);
  const missingResult = readJson(dir, resultPath(suite));
  assert.equal(missingResult.pass, false);
  assert.equal(missingResult.ok, 3);
  assert.equal(missingResult.stderrSha256, null);
  assert.deepEqual(codes(missingResult), ['missing-stderr']);

  // The same when the stderr path is passed explicitly, as the runner does.
  const explicit = cli(dir, 'check', tapPath(suite), '0', suite, resultPath(suite), stderrPath(suite));
  assert.equal(explicit.status, 1);
  assert.deepEqual(codes(readJson(dir, resultPath(suite))), ['missing-stderr']);

  // A stderr file that exists but belongs to another name.
  const other = path.join('tap', 'other.stderr');
  fs.writeFileSync(path.join(dir, other), '');
  const misnamed = cli(dir, 'check', tapPath(suite), '0', suite, resultPath(suite), other);
  assert.equal(misnamed.status, 1);
  const misnamedResult = readJson(dir, resultPath(suite));
  assert.equal(misnamedResult.pass, false);
  assert.equal(misnamedResult.stderrSha256, EMPTY_SHA256);
  assert.deepEqual(codes(misnamedResult), ['stderr-file-mismatch']);

  // Another suite's stderr does not stand in either.
  fs.writeFileSync(path.join(dir, stderrPath('trust_kernel_safety')), '');
  const borrowed = cli(dir, 'check', tapPath(suite), '0', suite, resultPath(suite), stderrPath('trust_kernel_safety'));
  assert.equal(borrowed.status, 1);
  assert.deepEqual(codes(readJson(dir, resultPath(suite))), ['stderr-file-mismatch']);
});

test('CLI check accepts an empty stderr and a stderr that holds the expected SQL error', (t) => {
  const dir = sandbox(t);

  const empty = checkSuite(dir, 'line_outbound_claim_record', fullTap(3), 0);
  assert.equal(empty.status, 0);
  const emptyResult = readJson(dir, resultPath('line_outbound_claim_record'));
  assert.equal(emptyResult.pass, true);
  assert.equal(emptyResult.stderrSha256, EMPTY_SHA256);
  assert.deepEqual(emptyResult.failures, []);

  const suite = 'line_oa_client_write_revoke_fail_closed';
  const expectedStderr = tapText(EXPECTED_ERRORS);
  fs.writeFileSync(path.join(dir, tapPath(suite)), FAIL_CLOSED_STDOUT);
  fs.writeFileSync(path.join(dir, stderrPath(suite)), expectedStderr);
  const expected = cli(dir, 'check', tapPath(suite), '0', suite, resultPath(suite), stderrPath(suite));
  assert.equal(expected.status, 0);
  const expectedResult = readJson(dir, resultPath(suite));
  assert.equal(expectedResult.pass, true);
  assert.equal(expectedResult.plan, 13);
  assert.equal(expectedResult.stderrSha256, sha256(expectedStderr));
  assert.notEqual(expectedResult.stderrSha256, EMPTY_SHA256);
  assert.equal(baseNameOf(expectedResult.stderr), `${suite}.stderr`);
  assert.deepEqual(expectedResult.failures, []);

  // The assembler accepts the same unchanged stderr files.
  for (const other of SUITES.filter((s) => s !== suite)) assert.equal(checkSuite(dir, other, fullTap(3), 0).status, 0);
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);
  const green = readJson(dir, 'out.json');
  assert.equal(green.pass, true);
  assert.equal(green.linePass, true);
  assert.equal(entry(green, suite).pass, true);
  assert.equal(entry(green, suite).stderrSha256, sha256(expectedStderr));
  assert.equal(entry(green, 'workflow_db_invariants').stderrSha256, EMPTY_SHA256);
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
  assert.equal(summary.missingSuites.length, 13);
  assert.equal(entry(summary, 'repair_phase0_containment').exitCode, 3);
  assert.equal(entry(summary, 'repair_phase0_containment').pass, false);
  assert.equal(entry(summary, 'line_outbound_claim_record').pass, true);
});

test('CLI assemble passes only with fifteen fresh passing results', (t) => {
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

test('CLI assemble re-reads each stderr file: deleted, replaced or misnamed stderr fails even when every TAP passes', (t) => {
  const dir = sandbox(t);
  for (const suite of SUITES) assert.equal(checkSuite(dir, suite, fullTap(3), 0).status, 0);
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);

  // Deleted after the check.
  const lineErr = path.join(dir, stderrPath('line_outbound_claim_record'));
  fs.rmSync(lineErr);
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  const deleted = readJson(dir, 'out.json');
  assert.equal(deleted.pass, false);
  assert.equal(deleted.fullPgTapPass, false);
  assert.equal(deleted.linePass, false);
  assert.equal(entry(deleted, 'line_outbound_claim_record').ok, 3);
  assert.deepEqual(codes(entry(deleted, 'line_outbound_claim_record')), ['missing-stderr']);
  fs.writeFileSync(lineErr, '');
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);

  // Replaced after the check.
  const safetyErr = path.join(dir, stderrPath('trust_kernel_safety'));
  fs.writeFileSync(safetyErr, 'psql:late.sql:1: ERROR:  written after the check\n');
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  const replaced = readJson(dir, 'out.json');
  assert.equal(replaced.pass, false);
  assert.equal(replaced.linePass, true);
  assert.deepEqual(codes(entry(replaced, 'trust_kernel_safety')), ['stale-stderr']);
  fs.writeFileSync(safetyErr, '');
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);

  // A result that records a stderr path with another basename.
  const resultFile = path.join(dir, resultPath('workflow_db_invariants'));
  const original = fs.readFileSync(resultFile, 'utf8');
  fs.writeFileSync(path.join(dir, 'tap', 'other.stderr'), '');
  fs.writeFileSync(resultFile, JSON.stringify({ ...JSON.parse(original), stderr: path.join('tap', 'other.stderr') }));
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  const misnamed = readJson(dir, 'out.json');
  assert.equal(misnamed.pass, false);
  assert.deepEqual(codes(entry(misnamed, 'workflow_db_invariants')), ['stderr-file-mismatch']);

  // A result that records no stderr hash.
  const { stderrSha256, ...noHash } = JSON.parse(original);
  assert.equal(stderrSha256, EMPTY_SHA256);
  fs.writeFileSync(resultFile, JSON.stringify(noHash));
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 1);
  assert.deepEqual(codes(entry(readJson(dir, 'out.json'), 'workflow_db_invariants')), ['missing-stderr-hash']);

  fs.writeFileSync(resultFile, original);
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);
});

test('CLI assemble reports provenance separately from the pgTAP verdict', (t) => {
  const dir = sandbox(t);
  for (const suite of SUITES) assert.equal(checkSuite(dir, suite, fullTap(3), 0).status, 0);

  // Every TAP passes but only the run id is known: still exit 0, not traceable.
  assert.equal(cli(dir, 'assemble', 'tap', 'out.json').status, 0);
  const bare = readJson(dir, 'out.json');
  assert.equal(bare.pass, true);
  assert.equal(bare.fullPass, true);
  assert.equal(bare.fullPgTapPass, true);
  assert.equal(bare.linePass, true);
  assert.equal(bare.verdictScope, 'pgtap-only');
  assert.equal(bare.workflowPass, null);
  assert.equal(bare.provenanceComplete, false);
  assert.deepEqual(bare.missingProvenance, ['commit', 'ref', 'migrationsApplied', 'testedSourceSha256']);
  assert.equal(bare.testedSourceSha256, null);

  // All five fields supplied the way the local runner supplies them.
  fs.writeFileSync(path.join(dir, 'migrations_applied.txt'), '198\n');
  const complete = cliWith(dir, {
    LINE_DB_EVIDENCE_COMMIT: FIXED_COMMIT,
    LINE_DB_EVIDENCE_REF: FIXED_REF,
    LINE_DB_EVIDENCE_SOURCE_SHA256: FIXED_SOURCE_SHA256,
    LINE_DB_MIGRATIONS_FILE: 'migrations_applied.txt',
  }, 'assemble', 'tap', 'out.json');
  assert.equal(complete.status, 0);
  const traced = readJson(dir, 'out.json');
  assert.equal(traced.pass, true);
  assert.equal(traced.fullPgTapPass, true);
  assert.equal(traced.pgtap.fullPgTapPass, true);
  assert.equal(traced.verdictScope, 'pgtap-only');
  assert.equal(traced.workflowPass, null);
  assert.equal(traced.provenanceComplete, true);
  assert.deepEqual(traced.missingProvenance, []);
  assert.equal(traced.commit, FIXED_COMMIT);
  assert.equal(traced.ref, FIXED_REF);
  assert.equal(traced.runId, 'test-run');
  assert.equal(traced.migrationsApplied, 198);
  assert.equal(traced.testedSourceSha256, FIXED_SOURCE_SHA256);
  assert.equal(traced.origin, 'local');

  // A malformed digest is passed through but reported as missing; TAP still passes.
  const malformed = cliWith(dir, {
    LINE_DB_EVIDENCE_COMMIT: FIXED_COMMIT,
    LINE_DB_EVIDENCE_REF: FIXED_REF,
    LINE_DB_EVIDENCE_SOURCE_SHA256: 'not-a-digest',
    LINE_DB_MIGRATIONS_FILE: 'migrations_applied.txt',
  }, 'assemble', 'tap', 'out.json');
  assert.equal(malformed.status, 0);
  const untraced = readJson(dir, 'out.json');
  assert.equal(untraced.pass, true);
  assert.equal(untraced.provenanceComplete, false);
  assert.deepEqual(untraced.missingProvenance, ['testedSourceSha256']);
});

function baseNameOf(file) {
  return file.split(/[\\/]/).pop();
}
