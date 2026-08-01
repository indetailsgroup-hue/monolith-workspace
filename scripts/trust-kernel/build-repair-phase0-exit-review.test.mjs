import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRepairPhase0ExitReview, REQUIRED_PHASE0_REPORTS } from './build-repair-phase0-exit-review.mjs';
import { buildEvidenceManifestFromReports } from './build-evidence-manifest.mjs';
import {
  buildUnsignedEvidenceAttestation,
  REQUIRED_PRE_ATTESTATION_REPORTS,
} from './evidence-manifest-integrity.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const KEY_ID = 'monolith-evidence-key-0001';
const CI_RUN_ID = 'exit-review-fixture-run';
const META = {
  productMain: 'dd1119af6d0bcba0e38d38516ed1b11125bcf19f',
  governanceBaseline: '55557d7f178dcbe00fec15cffb3061df668eaff8',
  trustKernelHead: '8dfe0cc02e6cbbe8f4cefb3893d80a758fc8d49b',
  branchHead: HEAD,
  ciRunId: CI_RUN_ID,
};
const MANIFEST_ENV = {
  R_MATRIX: 'success',
  R_EDGE: 'success',
  R_E2E: 'success',
  R_CLAIM: 'success',
  GITHUB_SHA: HEAD,
  GITHUB_REF_NAME: 'codex/repair-intelligence-phase0-trust',
  GITHUB_RUN_ID: CI_RUN_ID,
  GITHUB_WORKFLOW: 'Trust Kernel Verify',
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  EVIDENCE_SIGNER_KEY_ID: KEY_ID,
};
const CLEAN_VITEST = {
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  success: true,
  testResults: [{ assertionResults: [{ status: 'passed', title: 'green' }] }],
};
const CLEAN_TAP = 'ok 1 - a\nok 2 - b\n1..2\n';

function writeTapPair(dir, name, text) {
  writeFileSync(join(dir, name), text, 'utf8');
  writeFileSync(join(dir, `pgtap-${name}`), text, 'utf8');
}

function writeGreenReports(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of REQUIRED_PRE_ATTESTATION_REPORTS) {
    let content;
    if (name.endsWith('.tap')) content = CLEAN_TAP;
    else if (name === 'e2e.json') content = JSON.stringify({ stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 0 } });
    else if (name === 'repair-phase0-ledger.json') content = JSON.stringify({ pass: true, errors: [], surfaceCount: 18, categories: [], roots: [] });
    else if (name === 'repair-docs.txt') content = 'REPAIR PHASE 0 DOCS: PASS\n';
    else if (name === 'route-ledger.txt') content = 'ROUTE LEDGER: PASS\n';
    else if (name === 'claim-linters.txt') content = 'CLAIM LINTERS: PASS\n';
    else if (name.endsWith('.sha')) content = `${'a'.repeat(64)}\n`;
    else content = JSON.stringify(CLEAN_VITEST);
    writeFileSync(join(dir, name), content, 'utf8');
  }
  for (const name of REQUIRED_PHASE0_REPORTS.filter((item) => item.endsWith('.tap'))) {
    writeFileSync(join(dir, name), readFileSync(join(dir, `pgtap-${name}`)));
  }
  const manifest = buildEvidenceManifestFromReports({ reportsRoot: dir, env: MANIFEST_ENV, root: REPO_ROOT });
  writeFileSync(join(dir, 'evidence-manifest.json'), JSON.stringify(manifest), 'utf8');
  writeFileSync(join(dir, 'evidence-attestation.json'), JSON.stringify({
    schema: 'EvidenceAttestationV1',
    verified: true,
    reason: 'fixture proof',
    attestation: {
      ...buildUnsignedEvidenceAttestation(manifest),
      signatureBase64: Buffer.alloc(64, 7).toString('base64'),
    },
  }), 'utf8');
}

function run(mutate = () => {}, meta = META) {
  const base = mkdtempSync(join(tmpdir(), 'repair-exit-'));
  const reportsDir = join(base, 'reports');
  const outDir = join(base, 'out');
  mkdirSync(outDir, { recursive: true });
  writeGreenReports(reportsDir);
  mutate(reportsDir);
  try {
    return { base, result: buildRepairPhase0ExitReview({ reportsDir, outDir, meta }) , outDir };
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
      rmSync(join(dir, name));
    }
  });
  assert.equal(result.evidence, 'VERIFIED');
  assert.ok(result.rows.filter((row) => row.name.endsWith('.tap')).every((row) => row.present && row.ok));
  rmSync(base, { recursive: true, force: true });
});

test('different raw and pgtap TAP bytes fail EVIDENCE_CONFLICT with the suite name', () => {
  const base = mkdtempSync(join(tmpdir(), 'repair-exit-conflict-'));
  const reportsDir = join(base, 'reports');
  const outDir = join(base, 'out');
  const suite = 'trust_kernel_tenancy.tap';
  writeGreenReports(reportsDir);
  writeFileSync(join(reportsDir, `pgtap-${suite}`), 'ok 1 - different CI bytes\n1..1\n', 'utf8');
  try {
    assert.throws(
      () => buildRepairPhase0ExitReview({ reportsDir, outDir, meta: META }),
      new RegExp(`EVIDENCE_CONFLICT.*${suite}`),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('identical raw and pgtap TAP bytes coexist without a conflict', () => {
  const suite = 'trust_kernel_tenancy.tap';
  const { base, result } = run((dir) => {
    const bytes = readFileSync(join(dir, suite));
    writeFileSync(join(dir, `pgtap-${suite}`), bytes);
  });
  assert.equal(result.evidence, 'VERIFIED');
  assert.equal(result.rows.find((row) => row.name === suite)?.ok, true);
  rmSync(base, { recursive: true, force: true });
});

test('a missing report yields EVIDENCE_INCOMPLETE (never approval)', () => {
  const { base, result, outDir } = run((dir) => {
    const name = REQUIRED_PHASE0_REPORTS.find((item) => item.endsWith('.tap'));
    rmSync(join(dir, name));
    rmSync(join(dir, `pgtap-${name}`));
  });
  assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
  assert.equal(result.exitDecision, 'PENDING_OWNER_APPROVAL');
  const en = readFileSync(join(outDir, 'repair-intelligence-phase0-exit-review.en.md'), 'utf8');
  assert.ok(en.includes('Phase 0 implementation evidence: EVIDENCE_INCOMPLETE'));
  rmSync(base, { recursive: true, force: true });
});

test('a failed report yields EVIDENCE_INCOMPLETE', () => {
  const { base, result } = run((dir) => {
    writeTapPair(dir, 'repair_phase0_containment.tap', 'not ok 1 - broken\n1..1\n');
  });
  assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
  rmSync(base, { recursive: true, force: true });
});

for (const invalidEvidenceCase of [
  {
    name: 'a pgTAP SKIP directive',
    mutate: (dir) => writeTapPair(dir, 'trust_kernel_tenancy.tap', 'ok 1 - skipped # SKIP unavailable\n1..1\n'),
  },
  {
    name: 'a pgTAP TODO directive',
    mutate: (dir) => writeTapPair(dir, 'trust_kernel_tenancy.tap', 'ok 1 - pending # TODO later\n1..1\n'),
  },
  {
    name: 'a pgTAP Bail out',
    mutate: (dir) => writeTapPair(dir, 'trust_kernel_tenancy.tap', 'ok 1 - setup\nBail out! database unavailable\n'),
  },
  {
    name: 'a flaky E2E report',
    mutate: (dir) => writeFileSync(join(dir, 'e2e.json'), JSON.stringify({ stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 1 } }), 'utf8'),
  },
  {
    name: 'a bare verified:true attestation',
    mutate: (dir) => writeFileSync(join(dir, 'evidence-attestation.json'), JSON.stringify({ verified: true }), 'utf8'),
  },
]) {
  test(`${invalidEvidenceCase.name} yields EVIDENCE_INCOMPLETE`, () => {
    const { base, result } = run(invalidEvidenceCase.mutate);
    assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
    rmSync(base, { recursive: true, force: true });
  });
}

test('a stale CI run id yields EVIDENCE_INCOMPLETE', () => {
  const { base, result } = run(() => {}, { ...META, ciRunId: 'stale-run-id' });
  assert.equal(result.evidence, 'EVIDENCE_INCOMPLETE');
  rmSync(base, { recursive: true, force: true });
});

test('a stale product commit yields EVIDENCE_INCOMPLETE', () => {
  const { base, result } = run(() => {}, { ...META, branchHead: 'f'.repeat(40) });
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
