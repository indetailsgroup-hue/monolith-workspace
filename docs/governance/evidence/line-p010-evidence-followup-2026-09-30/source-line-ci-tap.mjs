#!/usr/bin/env node
// Strict TAP evidence check for the db-verify pgTAP suites (Node builtins only).
//
//   node scripts/line-ci-tap.mjs check <tap> <exit-code> <suite> <result-json> [stderr-file]
//   node scripts/line-ci-tap.mjs assemble <tap-dir> <output-json>
//
// check: a suite passes only with psql exit 0, exactly one plan 1..N (N > 0)
// placed before or after all results, and results numbered 1..N in order, all
// plain ok. The psql stderr file (default: <suite>.stderr beside the TAP file)
// must exist, even if empty, and be named <suite>.stderr; its hash is recorded.
// Its content is not judged: an expected SQL ERROR in it is not a failure.
// It always writes the result JSON and exits 1 when the suite fails.
// assemble: needs <suite>.result.json and the unchanged <suite>.tap and
// <suite>.stderr for each of the twelve suites. It always writes the artifact
// and exits 1 unless all pass.
//
// The verdict covers pgTAP only (verdictScope 'pgtap-only'). fullPgTapPass is
// the twelve-suite verdict; pass and fullPass are kept as aliases of it.
// workflowPass is always null: the rest of the workflow is not evaluated here.
// provenanceComplete / missingProvenance report traceability separately and
// never change the pgTAP verdict or the exit code.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUITES = Object.freeze([
  'workflow_db_invariants', 'trust_kernel_tenancy', 'trust_kernel_governance',
  'trust_kernel_release', 'trust_kernel_bundles', 'trust_kernel_containment',
  'trust_kernel_safety', 'repair_phase0_organization', 'repair_phase0_containment',
  'line_outbound_claim_record', 'line_oa_client_write_revoke',
  'line_oa_client_write_revoke_fail_closed',
]);
export const LINE_SUITES = Object.freeze([
  'line_outbound_claim_record', 'line_oa_client_write_revoke',
  'line_oa_client_write_revoke_fail_closed',
]);

// Whole-line matches only: a plan quoted in a comment, an indented line, a data
// row or a test description is never a plan.
const PLAN_RE = /^(\d+)\.\.(\d+)(?:\s*#\s*(.*))?$/;
const RESULT_RE = /^(not ok|ok)(?:\s+(\d+))?(?:\s+(.*))?$/;
const DIRECTIVE_RE = /(?:^|[^\\])#\s*(skip|todo)\b/i;
const BAIL_RE = /^bail out!/i;
const FINISH_RE = /^#\s*(?:looks like you\b|no tests run)/i;
const SQL_ERROR_RE = /\b(?:ERROR|FATAL|PANIC):\s/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const COMMIT_RE = /^[0-9a-f]{40}$/i;

const baseName = (file) => String(file).split(/[\\/]/).pop();
const isSha256 = (value) => typeof value === 'string' && SHA256_RE.test(value);

export function analyzeTap(text, exitCode) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const plans = [];
  const numbers = [];
  const finishDiagnostics = [];
  let ok = 0;
  let notOk = 0;
  let skip = 0;
  let todo = 0;
  let bailOut = false;
  let sqlErrorLines = 0;

  if (typeof text !== 'string') fail('missing-tap', 'no TAP output was captured');
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : '';
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    if (BAIL_RE.test(line)) {
      bailOut = true;
      continue;
    }
    if (line.startsWith('#')) {
      if (FINISH_RE.test(line)) finishDiagnostics.push(line);
      continue;
    }
    const plan = PLAN_RE.exec(line);
    if (plan) {
      plans.push({
        line,
        first: Number(plan[1]),
        last: Number(plan[2]),
        directive: plan[3] ?? '',
        resultsBefore: numbers.length,
      });
      continue;
    }
    const result = RESULT_RE.exec(line);
    if (result) {
      if (result[1] === 'ok') ok += 1;
      else notOk += 1;
      numbers.push(result[2] === undefined ? null : Number(result[2]));
      const directive = DIRECTIVE_RE.exec(result[3] ?? '');
      if (directive && directive[1].toLowerCase() === 'skip') skip += 1;
      if (directive && directive[1].toLowerCase() === 'todo') todo += 1;
      continue;
    }
    // psql noise (command tags, expected errors when stderr is merged in).
    if (SQL_ERROR_RE.test(line)) sqlErrorLines += 1;
  }

  let plan = null;
  if (plans.length === 0) {
    fail('missing-plan', 'no plan line (1..N) found');
  } else if (plans.length > 1) {
    fail('duplicate-plan', `${plans.length} plan lines found: ${plans.map((p) => p.line).join(', ')}`);
  } else if (plans[0].first !== 1 || !Number.isSafeInteger(plans[0].last) || plans[0].last < 1
             || plans[0].directive !== '') {
    fail('invalid-plan', `plan must be 1..N with N > 0 and no directive, found: ${plans[0].line}`);
  } else {
    plan = plans[0].last;
    if (plans[0].resultsBefore !== 0 && plans[0].resultsBefore !== numbers.length) {
      fail('misplaced-plan', `plan appears after ${plans[0].resultsBefore} of ${numbers.length} results; it must come before or after all of them`);
    }
  }

  const seen = new Set();
  const duplicates = [];
  const outOfOrder = [];
  let unnumbered = 0;
  let next = 1;
  for (const n of numbers) {
    if (n === null) {
      unnumbered += 1;
      continue;
    }
    if (seen.has(n)) {
      duplicates.push(n);
      continue;
    }
    if (n !== next) outOfOrder.push(`${n} (expected ${next})`);
    seen.add(n);
    next = n + 1;
  }
  if (numbers.length === 0) fail('no-results', 'no ok / not ok result lines found');
  if (unnumbered > 0) fail('unnumbered-result', `${unnumbered} result line(s) without a test number`);
  if (duplicates.length > 0) fail('duplicate-result', `test number(s) reported more than once: ${duplicates.join(', ')}`);
  if (outOfOrder.length > 0) fail('out-of-order-result', `test number(s) out of sequence: ${outOfOrder.join(', ')}`);
  if (plan !== null) {
    const missing = [];
    for (let id = 1; id <= plan && missing.length < 20; id += 1) {
      if (!seen.has(id)) missing.push(id);
    }
    if (numbers.length < plan || missing.length > 0) {
      fail('incomplete-results', `planned ${plan}, found ${numbers.length} result(s); missing: ${missing.join(', ') || 'none by number'}`);
    }
    const beyond = [...seen].filter((n) => n > plan || n < 1);
    if (numbers.length > plan || beyond.length > 0) {
      fail('extra-results', `planned ${plan}, found ${numbers.length} result(s); outside the plan: ${beyond.join(', ') || 'none by number'}`);
    }
  }
  if (notOk > 0) fail('failed-result', `${notOk} not ok result(s)`);
  if (skip > 0) fail('skip-directive', `${skip} result(s) carry a SKIP directive`);
  if (todo > 0) fail('todo-directive', `${todo} result(s) carry a TODO directive`);
  if (bailOut) fail('bail-out', 'the suite bailed out');
  if (finishDiagnostics.length > 0) fail('finish-diagnostic', finishDiagnostics.join(' | '));
  if (!Number.isInteger(exitCode)) fail('invalid-exit-code', 'psql exit code was not recorded as an integer');
  else if (exitCode !== 0) fail('nonzero-exit', `psql exited with ${exitCode}`);

  return {
    pass: failures.length === 0,
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    plan,
    planLines: plans.length,
    results: numbers.length,
    ok,
    notOk,
    skip,
    todo,
    bailOut,
    sqlErrorLines,
    finishDiagnostics,
    failures,
  };
}

// A result counts as passing only when its own fields agree; a bare pass flag
// is never trusted.
function consistent(r) {
  return r.pass === true && r.exitCode === 0 && Number.isInteger(r.plan) && r.plan > 0
    && r.results === r.plan && r.ok === r.plan && r.notOk === 0;
}

// Adds a failure unless one with the same code is already listed.
function addOnce(failures, code, detail) {
  if (!failures.some((f) => f && f.code === code)) failures.push({ code, detail });
}

// Traceability of the run, reported apart from the TAP verdict. A field that
// is absent or malformed is listed in missingProvenance.
export function assessProvenance(metadata = {}) {
  const m = metadata ?? {};
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const checks = [
    ['commit', typeof m.commit === 'string' && COMMIT_RE.test(m.commit)],
    ['ref', text(m.ref)],
    ['runId', text(m.runId)],
    ['migrationsApplied', Number.isSafeInteger(m.migrationsApplied) && m.migrationsApplied > 0],
    ['testedSourceSha256', isSha256(m.testedSourceSha256)],
  ];
  const missingProvenance = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { provenanceComplete: missingProvenance.length === 0, missingProvenance };
}

export function summarize(results, metadata = {}) {
  const list = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object');
  const failures = [];
  const runIds = [...new Set(list.filter((r) => r.runId !== undefined).map((r) => r.runId))];
  if (runIds.length > 1) {
    failures.push({ code: 'mixed-run-ids', detail: `result files come from ${runIds.length} different runs` });
  }
  const suites = SUITES.map((suite) => {
    const file = `${suite}.sql`;
    const found = list.filter((r) => r.suite === suite);
    if (found.length === 0) {
      return {
        suite, file, missing: true, pass: false, exitCode: null, stdout: null, stderr: null,
        stderrSha256: null, plan: null, results: 0, ok: 0, notOk: 0,
        failures: [{ code: 'missing-evidence', detail: `no result JSON for ${suite}` }],
      };
    }
    const r = found[0];
    const why = Array.isArray(r.failures)
      ? [...r.failures]
      : [{ code: 'invalid-result', detail: 'result JSON has no failures list' }];
    if (found.length > 1) why.push({ code: 'duplicate-evidence', detail: `${found.length} results claim ${suite}` });
    if (typeof r.stdout !== 'string' || baseName(r.stdout) !== `${suite}.tap`) {
      why.push({ code: 'suite-file-mismatch', detail: `stdout file ${r.stdout} is not ${suite}.tap` });
    }
    if (typeof r.stderr !== 'string') {
      why.push({ code: 'invalid-result', detail: 'stderr path was not recorded' });
    } else {
      if (baseName(r.stderr) !== `${suite}.stderr`) {
        addOnce(why, 'stderr-file-mismatch', `stderr file ${r.stderr} is not ${suite}.stderr`);
      }
      if (!isSha256(r.stderrSha256)) {
        addOnce(why, 'missing-stderr-hash', `no sha256 of ${suite}.stderr was recorded`);
      }
    }
    if (metadata.runId != null && r.runId !== metadata.runId) {
      why.push({ code: 'stale-result', detail: `result run id ${r.runId} is not ${metadata.runId}` });
    }
    if (why.length === 0 && !consistent(r)) {
      why.push({ code: 'inconsistent-result', detail: 'pass flag, exit code, plan and counts do not agree' });
    }
    return {
      suite, file, missing: false, pass: why.length === 0,
      exitCode: Number.isInteger(r.exitCode) ? r.exitCode : null,
      stdout: r.stdout ?? null, stderr: r.stderr ?? null,
      stderrSha256: r.stderrSha256 ?? null,
      plan: r.plan ?? null, results: r.results ?? 0, ok: r.ok ?? 0, notOk: r.notOk ?? 0,
      failures: why,
    };
  });
  const unexpectedSuites = [...new Set(list.map((r) => String(r.suite)).filter((s) => !SUITES.includes(s)))];
  if (unexpectedSuites.length > 0) failures.push({ code: 'unexpected-suite', detail: unexpectedSuites.join(', ') });

  const missingSuites = suites.filter((s) => s.missing).map((s) => s.suite);
  const trusted = failures.length === 0;
  const linePass = trusted && LINE_SUITES.every((name) => suites.find((s) => s.suite === name).pass);
  const fullPgTapPass = trusted && suites.every((s) => s.pass);
  // Compatibility aliases: pass and fullPass mean fullPgTapPass, nothing wider.
  const fullPass = fullPgTapPass;
  const { provenanceComplete, missingProvenance } = assessProvenance(metadata);
  return {
    evidenceTier: metadata.evidenceTier ?? null,
    workflow: 'db-verify',
    origin: metadata.origin ?? 'local',
    originClaimRejected: metadata.originClaimRejected ?? null,
    environment: metadata.environment ?? 'unknown',
    commit: metadata.commit ?? null,
    ref: metadata.ref ?? null,
    runUrl: metadata.runUrl ?? null,
    runId: metadata.runId ?? null,
    timestamp: metadata.timestamp ?? new Date().toISOString(),
    migrationsApplied: metadata.migrationsApplied ?? 'unknown',
    testedSourceSha256: metadata.testedSourceSha256 ?? null,
    provenanceComplete,
    missingProvenance,
    // Only the pgTAP suites were judged; the workflow as a whole was not.
    verdictScope: 'pgtap-only',
    workflowPass: null,
    pass: fullPass,
    linePass,
    fullPass,
    fullPgTapPass,
    missingSuites,
    unexpectedSuites,
    failures,
    pgtap: { suites, linePass, fullPass, fullPgTapPass, missingSuites, pass: fullPass },
  };
}

// 'github-actions' is reported only when GITHUB_ACTIONS=true; setting
// LINE_DB_EVIDENCE_ORIGIN cannot make a local run look like a GitHub run.
export function executionOrigin(env = process.env) {
  const onActions = env.GITHUB_ACTIONS === 'true';
  const claimed = (env.LINE_DB_EVIDENCE_ORIGIN ?? '').trim();
  if (claimed === '') return onActions ? 'github-actions' : 'local';
  if (claimed === 'github-actions' && !onActions) return 'local';
  return claimed;
}

export function buildMetadata(env = process.env) {
  const origin = executionOrigin(env);
  const ci = origin === 'github-actions';
  const claimed = (env.LINE_DB_EVIDENCE_ORIGIN ?? '').trim();
  const hasRun = ci && env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID;
  return {
    origin,
    originClaimRejected: claimed !== '' && claimed !== origin ? claimed : null,
    evidenceTier: ci ? 'E0' : null,
    environment: ci
      ? `github-actions ${env.RUNNER_OS ?? 'unknown-os'}${env.ImageOS ? ` (${env.ImageOS})` : ''} / supabase local (ephemeral)`
      : `local ${os.platform()} ${os.release()} ${os.arch()} / database from LINE_DB_TEST_DSN`,
    commit: (ci ? env.GITHUB_SHA : env.LINE_DB_EVIDENCE_COMMIT) ?? null,
    ref: (ci ? env.GITHUB_REF : env.LINE_DB_EVIDENCE_REF) ?? null,
    runUrl: hasRun ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
    runId: env.LINE_DB_RUN_ID || null,
    // Digest of the source tree the suites ran against, supplied by the runner.
    testedSourceSha256: (env.LINE_DB_EVIDENCE_SOURCE_SHA256 ?? '').trim() || null,
    timestamp: new Date().toISOString(),
  };
}

function readTap(file) {
  try {
    const bytes = fs.readFileSync(file);
    return { text: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    return { text: null, sha256: null };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function checkCommand([tapFile, exitText, suite, resultFile, stderrFile]) {
  const exitCode = /^\d+$/.test(exitText) ? Number(exitText) : null;
  const tap = readTap(tapFile);
  const analysis = analyzeTap(tap.text, exitCode);
  if (!SUITES.includes(suite)) {
    analysis.failures.push({ code: 'unknown-suite', detail: `${suite} is not one of the twelve db-verify suites` });
  }
  if (baseName(tapFile) !== `${suite}.tap`) {
    analysis.failures.push({ code: 'suite-file-mismatch', detail: `${tapFile} is not ${suite}.tap` });
  }
  // The stderr file must really exist (it may be empty). Only its presence,
  // name and hash are checked; an expected SQL ERROR inside it is fine.
  const stderrPath = stderrFile ?? `${tapFile.replace(/\.tap$/, '')}.stderr`;
  const stderrSha256 = readTap(stderrPath).sha256;
  if (baseName(stderrPath) !== `${suite}.stderr`) {
    analysis.failures.push({ code: 'stderr-file-mismatch', detail: `${stderrPath} is not ${suite}.stderr` });
  }
  if (stderrSha256 === null) {
    analysis.failures.push({ code: 'missing-stderr', detail: `${stderrPath} cannot be read` });
  }
  const result = {
    suite,
    stdout: tapFile,
    stderr: stderrPath,
    tapSha256: tap.sha256,
    stderrSha256,
    runId: process.env.LINE_DB_RUN_ID || null,
    origin: executionOrigin(),
    checkedAt: new Date().toISOString(),
    ...analysis,
    pass: analysis.failures.length === 0,
  };
  writeJson(resultFile, result);
  console.log(`${suite}: ${result.pass ? 'pass' : 'FAIL'} (plan ${result.plan ?? 'none'}, ok ${result.ok}, not ok ${result.notOk}, psql exit ${result.exitCode ?? 'unknown'})`);
  const prefix = process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '  ';
  for (const f of result.failures) console.log(`${prefix}${suite}: ${f.code}: ${f.detail}`);
  return result.pass ? 0 : 1;
}

// Reads one suite's result JSON and re-checks it against the TAP and stderr
// files beside it, so a result left over from another file or another run is
// not accepted.
function loadResult(tapDir, suite) {
  const file = path.join(tapDir, `${suite}.result.json`);
  if (!fs.existsSync(file)) return null;
  const tapFile = path.join(tapDir, `${suite}.tap`);
  const broken = (code, detail) => ({
    suite, stdout: tapFile, stderr: null, exitCode: null, pass: false, failures: [{ code, detail }],
  });
  let r;
  try {
    r = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return broken('invalid-result', `${file}: ${error.message}`);
  }
  if (!r || typeof r !== 'object' || Array.isArray(r)) return broken('invalid-result', `${file} is not a JSON object`);
  if (r.suite !== suite) return broken('suite-file-mismatch', `${file} reports suite ${r.suite}`);
  const failures = Array.isArray(r.failures)
    ? [...r.failures]
    : [{ code: 'invalid-result', detail: 'result JSON has no failures list' }];
  const tap = readTap(tapFile);
  if (tap.sha256 === null) {
    failures.push({ code: 'missing-tap', detail: `${tapFile} cannot be read` });
  } else if (tap.sha256 !== r.tapSha256) {
    failures.push({ code: 'stale-result', detail: `${tapFile} changed after ${file} was written` });
  } else if (r.pass === true && !analyzeTap(tap.text, r.exitCode).pass) {
    failures.push({ code: 'inconsistent-result', detail: `${file} says pass but ${tapFile} does not` });
  }
  // The stderr evidence is always the sibling <suite>.stderr, whatever path
  // the result recorded; a fully passing TAP does not excuse it.
  const stderrFile = path.join(tapDir, `${suite}.stderr`);
  if (typeof r.stderr !== 'string' || baseName(r.stderr) !== `${suite}.stderr`) {
    addOnce(failures, 'stderr-file-mismatch', `${file} records stderr file ${r.stderr}, not ${suite}.stderr`);
  }
  const stderr = readTap(stderrFile);
  if (stderr.sha256 === null) {
    addOnce(failures, 'missing-stderr', `${stderrFile} cannot be read`);
  } else if (!isSha256(r.stderrSha256)) {
    addOnce(failures, 'missing-stderr-hash', `${file} records no sha256 for ${suite}.stderr`);
  } else if (stderr.sha256 !== r.stderrSha256.toLowerCase()) {
    addOnce(failures, 'stale-stderr', `${stderrFile} changed after ${file} was written`);
  }
  return { ...r, failures, pass: r.pass === true && failures.length === 0 };
}

function assembleCommand([tapDir, outputFile]) {
  const results = SUITES.map((suite) => loadResult(tapDir, suite)).filter(Boolean);
  const metadata = buildMetadata();
  const migrationsFile = process.env.LINE_DB_MIGRATIONS_FILE || 'migrations_applied.txt';
  if (fs.existsSync(migrationsFile)) {
    const applied = fs.readFileSync(migrationsFile, 'utf8').trim();
    metadata.migrationsApplied = Number(applied) || applied || 'unknown';
  }
  const summary = summarize(results, metadata);
  writeJson(outputFile, summary);
  console.log(JSON.stringify(summary, null, 2));
  // The exit code is the pgTAP verdict only; incomplete provenance does not change it.
  return summary.fullPgTapPass ? 0 : 1;
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === 'check' && (args.length === 4 || args.length === 5)) return checkCommand(args);
  if (command === 'assemble' && args.length === 2) return assembleCommand(args);
  console.error('usage: line-ci-tap.mjs check <tap> <exit-code> <suite> <result-json> [stderr-file]');
  console.error('       line-ci-tap.mjs assemble <tap-dir> <output-json>');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
