import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRepairPhase0ExitReview, REQUIRED_PHASE0_REPORTS } from './build-repair-phase0-exit-review.mjs';

const META = {
  productMain: 'dd1119af6d0bcba0e38d38516ed1b11125bcf19f',
  governanceBaseline: '55557d7f178dcbe00fec15cffb3061df668eaff8',
  trustKernelHead: '8dfe0cc02e6cbbe8f4cefb3893d80a758fc8d49b',
  branchHead: '0000000000000000000000000000000000000000',
};

function writeGreenReports(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of REQUIRED_PHASE0_REPORTS) {
    if (name.endsWith('.tap')) {
      writeFileSync(join(dir, name), 'ok 1 - a\nok 2 - b\n1..2\n', 'utf8');
    } else if (name === 'repair-phase0-ledger.json') {
      writeFileSync(join(dir, name), JSON.stringify({ pass: true, errors: [], surfaceCount: 18, categories: [], roots: [] }), 'utf8');
    } else if (name === 'e2e.json') {
      writeFileSync(join(dir, name), JSON.stringify({ stats: { expected: 3, unexpected: 0, skipped: 0 } }), 'utf8');
    } else if (name === 'evidence-attestation.json') {
      writeFileSync(join(dir, name), JSON.stringify({ schema: 'EvidenceAttestationV1', verified: true }), 'utf8');
    } else {
      writeFileSync(join(dir, name), 'PASS\n', 'utf8');
    }
  }
}

function run(mutate = () => {}) {
  const base = mkdtempSync(join(tmpdir(), 'repair-exit-'));
  const reportsDir = join(base, 'reports');
  const outDir = join(base, 'out');
  mkdirSync(outDir, { recursive: true });
  writeGreenReports(reportsDir);
  mutate(reportsDir);
  try {
    return { base, result: buildRepairPhase0ExitReview({ reportsDir, outDir, meta: META }) , outDir };
  } finally {
    // caller inspects then cleans
  }
}

test('complete green fixture reports yield PENDING_OWNER_APPROVAL with VERIFIED evidence', () => {
  const { base, result, outDir } = run();
  assert.equal(result.evidence, 'VERIFIED');
  assert.equal(result.exitDecision, 'PENDING_OWNER_APPROVAL');
  const en = readFileSync(join(outDir, 'repair-intelligence-phase0-exit-review.en.md'), 'utf8');
  const th = readFileSync(join(outDir, 'repair-intelligence-phase0-exit-review.th.md'), 'utf8');
  for (const text of [en, th]) {
    assert.ok(text.includes('Phase 0 exit decision: PENDING_OWNER_APPROVAL'));
    assert.ok(text.includes('Phase 0 implementation evidence: VERIFIED'));
    assert.ok(text.includes('Phase 1A authority: DISABLED'));
    assert.ok(text.includes('Expert Label Protocol: PROPOSED / NOT RUN'));
    assert.ok(text.includes('Gate B: NOT PASSED'));
    assert.ok(text.includes('Immutable infrastructure: NOT CLAIMED'));
    assert.ok(text.includes(META.productMain));
  }
  rmSync(base, { recursive: true, force: true });
});

test('CI pgtap-<suite>.tap artifact names yield VERIFIED evidence without manual renaming', () => {
  const { base, result } = run((dir) => {
    for (const name of REQUIRED_PHASE0_REPORTS.filter((item) => item.endsWith('.tap'))) {
      renameSync(join(dir, name), join(dir, `pgtap-${name}`));
    }
  });
  assert.equal(result.evidence, 'VERIFIED');
  assert.ok(result.rows.filter((row) => row.name.endsWith('.tap')).every((row) => row.present && row.ok));
  rmSync(base, { recursive: true, force: true });
});

test('a missing report yields EVIDENCE_INCOMPLETE (never approval)', () => {
  const { base, result, outDir } = run((dir) => {
    rmSync(join(dir, REQUIRED_PHASE0_REPORTS.find((n) => n.endsWith('.tap'))));
  });
  assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
  assert.equal(result.exitDecision, 'PENDING_OWNER_APPROVAL');
  const en = readFileSync(join(outDir, 'repair-intelligence-phase0-exit-review.en.md'), 'utf8');
  assert.ok(en.includes('Phase 0 implementation evidence: EVIDENCE_INCOMPLETE'));
  rmSync(base, { recursive: true, force: true });
});

test('a failed report yields EVIDENCE_INCOMPLETE', () => {
  const { base, result } = run((dir) => {
    writeFileSync(join(dir, 'repair_phase0_containment.tap'), 'not ok 1 - broken\n1..1\n', 'utf8');
  });
  assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
  rmSync(base, { recursive: true, force: true });
});

test('no input state can produce APPROVED, PRODUCTION, or GA', () => {
  for (const mutate of [
    () => {},
    (dir) => rmSync(dir, { recursive: true, force: true }),
    (dir) => writeFileSync(join(dir, 'repair-phase0-ledger.json'), JSON.stringify({ pass: false, errors: ['x'] }), 'utf8'),
  ]) {
    const { base, result, outDir } = run(mutate);
    assert.equal(result.exitDecision, 'PENDING_OWNER_APPROVAL');
    for (const file of readdirSync(outDir)) {
      const text = readFileSync(join(outDir, file), 'utf8');
      assert.ok(!/\bAPPROVED\b/.test(text), `${file} must not claim APPROVED`);
      assert.ok(!/\bPRODUCTION\b/.test(text), `${file} must not claim PRODUCTION`);
      assert.ok(!/\bGA\b/.test(text), `${file} must not claim GA`);
    }
    rmSync(base, { recursive: true, force: true });
  }
});
