#!/usr/bin/env node
/**
 * Build the run-specific EvidenceManifestV1 from the complete upstream CI
 * artifact tree. The canonical pre-attestation gate validates every report
 * before any digest can be signed; this builder only binds the validated bytes
 * and CI identity into the manifest.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_BUILDER_BINARY_PATH,
  EVIDENCE_DEPENDENCY_LOCK_PATHS,
  EVIDENCE_VERIFIER_BINARY_PATH,
  REQUIRED_PRE_ATTESTATION_REPORTS,
  recomputeEvidenceRootHash,
  sha256,
} from './evidence-manifest-integrity.mjs';
import {
  evaluatePreAttestationReports,
} from './final-gate-check.mjs';

export { REQUIRED_PRE_ATTESTATION_REPORTS };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function requiredValue(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  return value;
}

function reportIndex(reportsRoot) {
  const index = new Map();
  for (const file of walk(reportsRoot)) {
    const basename = path.basename(file);
    index.set(basename, [...(index.get(basename) ?? []), file]);
  }
  return index;
}

function selectRequiredReports(reportsRoot) {
  const index = reportIndex(reportsRoot);
  const selected = new Map();
  for (const name of REQUIRED_PRE_ATTESTATION_REPORTS) {
    const matches = index.get(name) ?? [];
    if (matches.length === 0) throw new Error(`missing required report: ${name}`);
    const byHash = new Map(matches.map((file) => [sha256(fs.readFileSync(file)), file]));
    if (byHash.size !== 1) throw new Error(`conflicting duplicate required report: ${name}`);
    selected.set(name, [...byHash.values()][0]);
  }
  return selected;
}

function trackedDirtyFiles(root) {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: root,
      encoding: 'utf8',
    }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
  } catch {
    throw new Error('unable to capture tracked Git state for evidence manifest');
  }
}

function reportCounts(name, file) {
  const text = fs.readFileSync(file, 'utf8');
  if (name.endsWith('.tap')) {
    return {
      passed: (text.match(/^ok /gm) ?? []).length,
      failed: (text.match(/^not ok /gm) ?? []).length,
      skipped: (text.match(/#\s*(SKIP|TODO)\b/gi) ?? []).length,
    };
  }
  if (name === 'e2e.json') {
    const stats = JSON.parse(text).stats ?? {};
    return {
      passed: stats.expected ?? 0,
      failed: (stats.unexpected ?? 0) + (stats.flaky ?? 0),
      skipped: stats.skipped ?? 0,
    };
  }
  if (name === 'repair-phase0-ledger.json') {
    const ledger = JSON.parse(text);
    return { passed: ledger.pass === true ? (ledger.surfaceCount ?? 1) : 0, failed: ledger.pass === true ? 0 : 1, skipped: 0 };
  }
  if (name.endsWith('.json')) {
    const report = JSON.parse(text);
    return {
      passed: report.numPassedTests ?? 0,
      failed: report.numFailedTests ?? 0,
      skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    };
  }
  return { passed: 1, failed: 0, skipped: 0 };
}

export function buildEvidenceManifestFromReports({ reportsRoot, env = process.env, root = repoRoot }) {
  const jobResults = {
    'matrix-tests': env.R_MATRIX,
    'edge-db': env.R_EDGE,
    e2e: env.R_E2E,
    'claim-linters': env.R_CLAIM,
  };
  const violations = evaluatePreAttestationReports({ root: reportsRoot, jobResults });
  if (violations.length > 0) {
    throw new Error(`pre-attestation report validation failed: ${violations.join('; ')}`);
  }

  const reports = selectRequiredReports(reportsRoot);
  const commit = requiredValue(env.GITHUB_SHA, 'GITHUB_SHA');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('GITHUB_SHA must be a 40-character lowercase commit');
  const branch = requiredValue(env.GITHUB_REF_NAME, 'GITHUB_REF_NAME');
  const keyId = requiredValue(env.EVIDENCE_SIGNER_KEY_ID, 'EVIDENCE_SIGNER_KEY_ID');
  const dirtyFiles = trackedDirtyFiles(root);
  const lockFiles = EVIDENCE_DEPENDENCY_LOCK_PATHS;
  const dependencyLockHashes = Object.fromEntries(lockFiles.map((name) => {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) throw new Error(`missing dependency lock: ${name}`);
    return [name, sha256(fs.readFileSync(file))];
  }));
  const builderBinaryPath = EVIDENCE_BUILDER_BINARY_PATH;
  const verifierBinaryPath = EVIDENCE_VERIFIER_BINARY_PATH;
  const builderFile = path.join(root, builderBinaryPath);
  const verifierFile = path.join(root, verifierBinaryPath);
  const goldenPacketHash = fs.readFileSync(reports.get('golden-ubuntu-latest.sha'), 'utf8').trim();

  const body = {
    schema: 'EvidenceManifestV1',
    phase: 'NOT_FOR_PRODUCTION',
    // Phase 0 is a single combined checkout. Both logical roots are bound to
    // the exact workflow commit rather than inventing an unobserved Git state.
    parentGit: { root: 'parent', commit, branch, dirtyFiles },
    productGit: { root: 'product', commit, branch, dirtyFiles },
    layers: REQUIRED_PRE_ATTESTATION_REPORTS.map((name) => {
      const file = reports.get(name);
      return {
        name,
        command: `pre-attestation gate validation of ${name}`,
        exitCode: 0,
        ...reportCounts(name, file),
        sha256: sha256(fs.readFileSync(file)),
      };
    }),
    dependencyLockHashes,
    environmentProfile: {
      os: requiredValue(env.RUNNER_OS, 'RUNNER_OS'),
      arch: requiredValue(env.RUNNER_ARCH, 'RUNNER_ARCH'),
      node: process.version,
    },
    builderBinaryPath,
    builderBinaryHash: sha256(fs.readFileSync(builderFile)),
    verifierBinaryPath,
    verifierBinaryHash: sha256(fs.readFileSync(verifierFile)),
    goldenPacketHash,
    ciRunId: requiredValue(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
    workflowIdentity: requiredValue(env.GITHUB_WORKFLOW, 'GITHUB_WORKFLOW'),
    retentionDays: 90,
    evidenceKeyId: keyId,
    issuedAt: new Date().toISOString(),
  };
  return { ...body, evidenceRootHash: recomputeEvidenceRootHash(body) };
}

function main() {
  const reportsRoot = path.resolve(process.argv[2] ?? 'all-reports');
  const outPath = path.resolve(process.argv[3] ?? 'reports/evidence-manifest.json');
  const manifest = buildEvidenceManifestFromReports({ reportsRoot });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`EVIDENCE MANIFEST: PASS — ${manifest.layers.length} required reports bound`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`::error::evidence manifest build failed: ${error instanceof Error ? error.message : 'unexpected failure'}`);
    process.exitCode = 1;
  }
}
