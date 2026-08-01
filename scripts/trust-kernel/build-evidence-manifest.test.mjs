import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildEvidenceManifestFromReports,
  REQUIRED_PRE_ATTESTATION_REPORTS,
} from './build-evidence-manifest.mjs';

const CLEAN_VITEST = {
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  success: true,
  testResults: [{ assertionResults: [{ status: 'passed', title: 'green' }] }],
};

const ENV = {
  R_MATRIX: 'success',
  R_EDGE: 'success',
  R_E2E: 'success',
  R_CLAIM: 'success',
  GITHUB_SHA: '1'.repeat(40),
  GITHUB_REF_NAME: 'codex/repair-intelligence-phase0-trust',
  GITHUB_RUN_ID: '12345',
  GITHUB_WORKFLOW: 'Trust Kernel Verify',
  GITHUB_WORKFLOW_REF: 'monolith/.github/workflows/trust-kernel-verify.yml@refs/heads/main',
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  EVIDENCE_SIGNER_KEY_ID: 'monolith-evidence-key-0001',
};

function writeCleanReports(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of REQUIRED_PRE_ATTESTATION_REPORTS) {
    let content;
    if (name.endsWith('.tap')) content = 'ok 1 - green\n1..1\n';
    else if (name === 'e2e.json') content = JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 } });
    else if (name === 'repair-phase0-ledger.json') content = JSON.stringify({ pass: true, surfaceCount: 1, errors: [] });
    else if (name === 'repair-docs.txt') content = 'REPAIR PHASE 0 DOCS: PASS\n';
    else if (name === 'route-ledger.txt') content = 'ROUTE LEDGER: PASS\n';
    else if (name === 'claim-linters.txt') content = 'CLAIM LINTERS: PASS\n';
    else if (name.endsWith('.sha')) content = `${'a'.repeat(64)}\n`;
    else content = JSON.stringify(CLEAN_VITEST);
    writeFileSync(join(dir, name), content, 'utf8');
  }
}

test('builds a root-hash-valid manifest from the complete validated CI report set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-manifest-complete-'));
  try {
    writeCleanReports(dir);
    const manifest = buildEvidenceManifestFromReports({ reportsRoot: dir, env: ENV });
    assert.equal(manifest.schema, 'EvidenceManifestV1');
    assert.equal(manifest.layers.length, REQUIRED_PRE_ATTESTATION_REPORTS.length);
    assert.deepEqual(manifest.layers.map((layer) => layer.name).sort(), [...REQUIRED_PRE_ATTESTATION_REPORTS].sort());
    assert.equal(manifest.builderBinaryPath, 'scripts/trust-kernel/build-evidence-manifest.mjs');
    assert.equal(manifest.verifierBinaryPath, 'scripts/trust-kernel/final-gate-check.mjs');
    assert.equal(manifest.workflowIdentity, ENV.GITHUB_WORKFLOW);
    assert.match(manifest.evidenceRootHash, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to build a manifest when any required CI report is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-manifest-missing-'));
  try {
    writeCleanReports(dir);
    rmSync(join(dir, REQUIRED_PRE_ATTESTATION_REPORTS[0]));
    assert.throws(
      () => buildEvidenceManifestFromReports({ reportsRoot: dir, env: ENV }),
      /missing required report/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
