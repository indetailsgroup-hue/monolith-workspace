#!/usr/bin/env node
// gate-negative-control.mjs — prove the Phase 0 gates actually BITE.
//
// A gate that has only ever been seen green is unproven: it might pass because
// it checks nothing. This harness deliberately breaks each control and asserts
// the control REJECTS the break. It is safe to run locally and repeatedly — the
// only live mutation (a throwaway unguarded route for the route-ledger control)
// is removed in a finally block, and the run fails loudly if the tree is left
// dirty.
//
// Run:  node scripts/trust-kernel/gate-negative-control.mjs
//       (or: npm run gate:negative-control)
// Exit: 0 only if EVERY gate passed clean AND failed on its deliberate violation.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failures = 0;

function ok(name) { console.log(`  ok   - ${name}`); }
function bad(name, extra = '') { failures += 1; console.error(`  FAIL - ${name} ${extra}`); }

// Run a node command; return { code, out }. Never throws on non-zero exit.
function run(args) {
  try {
    const out = execFileSync('node', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// (1) The extracted final-gate self-test already injects skip/todo/empty/missing/
//     unverified-evidence/empty-sha/bail/named-pgtap violations and asserts the
//     gate rejects each. Its own exit code IS the proof that the gate bites.
console.log('final gate — deliberate-violation self-test:');
{
  const r = run(['scripts/trust-kernel/final-gate-check.selftest.mjs']);
  if (r.code === 0 && /FINAL-GATE SELF-TEST: PASS/.test(r.out)) ok('final gate rejects every injected violation class');
  else bad('final-gate self-test did not pass', `(exit ${r.code})`);
}

// (2) The ledger validator's own test suite carries RED cases (missing surface,
//     unresolvable negative test, later-phase RETAIN). A green run proves each
//     rejection fires.
console.log('capability ledger — RED-case suite:');
{
  const r = run(['--test', 'scripts/trust-kernel/verify-repair-phase0-ledger.test.mjs']);
  if (r.code === 0 && /# fail 0/.test(r.out)) ok('ledger validator rejects malformed / incomplete ledgers');
  else bad('ledger validator RED-case suite did not pass', `(exit ${r.code})`);
}

// (3) The bilingual-docs verifier RED cases (empty HTML, hostile Gate B claim,
//     missing status line, widened forbidden verbs).
console.log('bilingual docs verifier — RED-case suite:');
{
  const r = run(['--test', 'scripts/trust-kernel/verify-repair-phase0-docs.test.mjs']);
  if (r.code === 0 && /# fail 0/.test(r.out)) ok('docs verifier rejects empty / hostile HTML and claims');
  else bad('docs verifier RED-case suite did not pass', `(exit ${r.code})`);
}

// (4) LIVE control for the route-ledger open-world byte-route sweep: plant a
//     throwaway HTTP route that res.send()s bytes with no guard, and assert the
//     REAL verifier fails. Cleaned up in finally; tree-clean asserted after.
console.log('route ledger — live unguarded-byte-route injection:');
{
  const leakDir = join(repoRoot, 'server', 'src', '__negctl__');
  const leakFile = join(leakDir, 'leak.ts');
  let planted = false;
  try {
    // Baseline: the verifier must PASS on the clean tree first.
    const base = run(['scripts/trust-kernel/verify-route-ledger.mjs']);
    if (base.code !== 0) { bad('route ledger did not pass on the clean tree', `(exit ${base.code})`); }

    mkdirSync(leakDir, { recursive: true });
    writeFileSync(leakFile,
      'import { Router } from "express";\n' +
      'export function leakRouter() {\n' +
      '  const router = Router();\n' +
      '  router.get("/leak/:id", (req, res) => { res.send(Buffer.from("bytes")); });\n' +
      '  return router;\n' +
      '}\n', 'utf8');
    planted = true;

    const broken = run(['scripts/trust-kernel/verify-route-ledger.mjs']);
    if (broken.code !== 0 && /open-world server byte route/.test(broken.out)) {
      ok('route ledger rejects a new unguarded byte route');
    } else {
      bad('route ledger did NOT reject the planted unguarded byte route', `(exit ${broken.code})`);
    }
  } finally {
    if (existsSync(leakDir)) rmSync(leakDir, { recursive: true, force: true });
  }
  // Safety: the injected path must be gone and untracked by git.
  if (existsSync(leakFile)) bad('cleanup failed — negative-control leak file still present');
  else ok('live control cleaned up (no repo mutation left behind)');
  if (planted) {
    const status = run(['-e', 'process.stdout.write(require("child_process").execSync("git status --porcelain server/src/__negctl__", {encoding:"utf8"}))']);
    if (status.out.trim() !== '') bad('git tree not clean after negative control', status.out.trim());
  }
}

if (failures > 0) {
  console.error(`\nGATE NEGATIVE CONTROL: FAIL (${failures} control(s) did not bite)`);
  process.exit(1);
}
console.log('\nGATE NEGATIVE CONTROL: PASS — every gate rejected its deliberate violation.');
