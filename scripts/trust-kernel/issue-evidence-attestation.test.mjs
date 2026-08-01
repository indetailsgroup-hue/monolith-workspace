import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { REQUIRED_PRE_ATTESTATION_REPORTS } from './evidence-manifest-integrity.mjs';

const SCRIPT = fileURLToPath(new URL('./issue-evidence-attestation.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const KEY_ID = 'monolith-evidence-key-0001';
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const CI_RUN_ID = 'gha-run-12345';
const WORKFLOW_IDENTITY = 'Trust Kernel Verify';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function signatureFor(digestSha256) {
  return createHash('sha512').update(digestSha256).digest('base64');
}

function requiredLayers() {
  return REQUIRED_PRE_ATTESTATION_REPORTS.map((name) => ({
    name,
    command: `validate downloaded CI report ${name}`,
    exitCode: 0,
    passed: 1,
    failed: 0,
    skipped: 0,
    sha256: sha256(name),
  }));
}

function completeManifest(overrides = {}) {
  const builderBinaryPath = 'scripts/trust-kernel/build-evidence-manifest.mjs';
  const verifierBinaryPath = 'scripts/trust-kernel/final-gate-check.mjs';
  const body = {
    schema: 'EvidenceManifestV1',
    phase: 'NOT_FOR_PRODUCTION',
    parentGit: { root: 'parent', commit: HEAD, branch: 'main', dirtyFiles: [] },
    productGit: { root: 'product', commit: HEAD, branch: 'codex/repair-intelligence-phase0-trust', dirtyFiles: [] },
    layers: requiredLayers(),
    dependencyLockHashes: {
      'package-lock.json': sha256(readFileSync(join(REPO_ROOT, 'package-lock.json'))),
      'server/package-lock.json': sha256(readFileSync(join(REPO_ROOT, 'server/package-lock.json'))),
    },
    environmentProfile: { os: 'ubuntu-24.04', node: 'v22.21.1' },
    builderBinaryPath,
    builderBinaryHash: sha256(readFileSync(join(REPO_ROOT, builderBinaryPath))),
    verifierBinaryPath,
    verifierBinaryHash: sha256(readFileSync(join(REPO_ROOT, verifierBinaryPath))),
    goldenPacketHash: 'e'.repeat(64),
    ciRunId: CI_RUN_ID,
    workflowIdentity: WORKFLOW_IDENTITY,
    retentionDays: 90,
    evidenceKeyId: KEY_ID,
    issuedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
  return { ...body, evidenceRootHash: sha256(canonicalJson(body)) };
}

async function runCli(args, env = {}) {
  const workerEnv = { ...process.env, ...DEFAULT_TEST_ENV, ...env };
  for (const [name, value] of Object.entries(workerEnv)) {
    if (value === null) delete workerEnv[name];
  }
  const child = new Worker(SCRIPT, {
    argv: args,
    env: workerEnv,
    stdout: true,
    stderr: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr };
}

function writeReports(reportsRoot, layers = requiredLayers()) {
  mkdirSync(reportsRoot);
  for (const layer of layers) writeFileSync(join(reportsRoot, layer.name), layer.name, 'utf8');
}

const PINNED_CONTEXT = {
  GITHUB_RUN_ID: CI_RUN_ID,
  GITHUB_WORKFLOW: WORKFLOW_IDENTITY,
};
const DEFAULT_TEST_ENV = {
  RELEASE_SIGNER_KEY_IDS: 'monolith-release-key-0001',
  EVIDENCE_ALLOW_INSECURE_TRANSPORT: '1',
};

test('missing manifest input writes verified:false and exits 1', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-missing-'));
  const outPath = join(dir, 'evidence-attestation.json');
  try {
    const result = await runCli([outPath], {
      EVIDENCE_SIGNER_URL: 'http://127.0.0.1:1/sign',
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: 'http://127.0.0.1:1/verify',
    });
    assert.equal(result.code, 1);
    const report = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(report.verified, false);
    assert.match(report.reason, /^MANIFEST_MISSING:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit insecure-transport opt-in allows mock signer/verifier endpoints', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ url: req.url, body });

    res.setHeader('content-type', 'application/json');
    if (req.url === '/sign') {
      res.end(JSON.stringify({
        algorithm: 'Ed25519',
        keyId: KEY_ID,
        signatureBase64: signatureFor(body.digestSha256),
      }));
      return;
    }
    if (req.url === '/verify') {
      const expected = signatureFor(body.digestSha256);
      res.end(JSON.stringify({ verified: body.signatureBase64 === expected }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-valid-'));
  const reportsRoot = join(dir, 'all-reports');
  const outPath = join(dir, 'evidence-attestation.json');
  const manifestPath = join(dir, 'evidence-manifest.json');
  writeReports(reportsRoot);
  writeFileSync(manifestPath, `${JSON.stringify(completeManifest(), null, 2)}\n`, 'utf8');

  try {
    const { port } = server.address();
    const result = await runCli([outPath, manifestPath, reportsRoot], {
      EVIDENCE_SIGNER_URL: `http://127.0.0.1:${port}/sign`,
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: `http://127.0.0.1:${port}/verify`,
      ...PINNED_CONTEXT,
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(report.verified, true);
    assert.equal(report.attestation.schema, 'EvidenceAttestationV1');
    assert.equal(report.attestation.keyId, KEY_ID);
    assert.equal(requests.length, 2);
    assert.deepEqual(Object.keys(requests[0].body).sort(), ['digestSha256', 'keyId', 'purpose']);
    assert.deepEqual(Object.keys(requests[1].body).sort(), ['digestSha256', 'keyId', 'signatureBase64']);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit EVIDENCE_ALLOW_UNPINNED_CONTEXT=1 permits a local signing run', async () => {
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/sign') {
      res.end(JSON.stringify({
        algorithm: 'Ed25519',
        keyId: KEY_ID,
        signatureBase64: signatureFor(body.digestSha256),
      }));
      return;
    }
    res.end(JSON.stringify({ verified: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-local-opt-in-'));
  const reportsRoot = join(dir, 'all-reports');
  const outPath = join(dir, 'evidence-attestation.json');
  const manifestPath = join(dir, 'evidence-manifest.json');
  writeReports(reportsRoot);
  writeFileSync(manifestPath, `${JSON.stringify(completeManifest(), null, 2)}\n`, 'utf8');
  try {
    const { port } = server.address();
    const result = await runCli([outPath, manifestPath, reportsRoot], {
      EVIDENCE_SIGNER_URL: `http://127.0.0.1:${port}/sign`,
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: `http://127.0.0.1:${port}/verify`,
      GITHUB_RUN_ID: null,
      GITHUB_WORKFLOW: null,
      EVIDENCE_ALLOW_UNPINNED_CONTEXT: '1',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(outPath, 'utf8')).verified, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('forged layer digest with a recomputed manifest root fails EVIDENCE_MISMATCH', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ url: req.url, body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/sign') {
      res.end(JSON.stringify({
        algorithm: 'Ed25519',
        keyId: KEY_ID,
        signatureBase64: signatureFor(body.digestSha256),
      }));
      return;
    }
    res.end(JSON.stringify({ verified: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-forged-layer-'));
  const reportsRoot = join(dir, 'all-reports');
  const outPath = join(dir, 'evidence-attestation.json');
  const manifestPath = join(dir, 'evidence-manifest.json');
  writeReports(reportsRoot);
  const forgedLayers = requiredLayers();
  forgedLayers[0] = { ...forgedLayers[0], sha256: sha256(`forged-${forgedLayers[0].name}`) };
  writeFileSync(manifestPath, `${JSON.stringify(completeManifest({ layers: forgedLayers }), null, 2)}\n`, 'utf8');

  try {
    const { port } = server.address();
    const result = await runCli([outPath, manifestPath, reportsRoot], {
      EVIDENCE_SIGNER_URL: `http://127.0.0.1:${port}/sign`,
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: `http://127.0.0.1:${port}/verify`,
      ...PINNED_CONTEXT,
    });
    assert.equal(result.code, 1);
    const report = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(report.verified, false);
    assert.match(report.reason, /^EVIDENCE_MISMATCH:/);
    assert.equal(requests.length, 0, 'forged evidence must be rejected before the signer is called');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const contextCase of [
  {
    name: 'product Git commit does not match the checked-out HEAD',
    overrides: { productGit: { root: 'product', commit: 'f'.repeat(40), branch: 'main', dirtyFiles: [] } },
    env: PINNED_CONTEXT,
    expected: /^EVIDENCE_MISMATCH:/,
  },
  {
    name: 'ciRunId does not match GITHUB_RUN_ID',
    overrides: {},
    env: { ...PINNED_CONTEXT, GITHUB_RUN_ID: 'different-run' },
    expected: /^EVIDENCE_MISMATCH:/,
  },
  {
    name: 'workflowIdentity does not match GITHUB_WORKFLOW',
    overrides: {},
    env: { ...PINNED_CONTEXT, GITHUB_WORKFLOW: 'Different Workflow' },
    expected: /^EVIDENCE_MISMATCH:/,
  },
  {
    name: 'local context is unpinned without an explicit opt-in',
    overrides: {},
    env: { GITHUB_RUN_ID: null, GITHUB_WORKFLOW: null },
    expected: /^CONFIG_MISSING:/,
  },
]) {
  test(`${contextCase.name} is rejected before signing`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-context-'));
    const reportsRoot = join(dir, 'all-reports');
    const outPath = join(dir, 'evidence-attestation.json');
    const manifestPath = join(dir, 'evidence-manifest.json');
    writeReports(reportsRoot);
    writeFileSync(manifestPath, `${JSON.stringify(completeManifest(contextCase.overrides), null, 2)}\n`, 'utf8');
    try {
      const result = await runCli([outPath, manifestPath, reportsRoot], {
        EVIDENCE_SIGNER_URL: 'http://127.0.0.1:1/sign',
        EVIDENCE_SIGNER_KEY_ID: KEY_ID,
        EVIDENCE_VERIFY_URL: 'http://127.0.0.1:1/verify',
        ...contextCase.env,
      });
      assert.equal(result.code, 1);
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      assert.match(report.reason, contextCase.expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const referencedFileCase of [
  {
    name: 'builder binary hash differs from the referenced file bytes',
    overrides: { builderBinaryHash: 'b'.repeat(64) },
  },
  {
    name: 'verifier binary hash differs from the referenced file bytes',
    overrides: { verifierBinaryHash: 'd'.repeat(64) },
  },
  {
    name: 'dependency lock hash differs from the referenced file bytes',
    overrides: {
      dependencyLockHashes: {
        'package-lock.json': 'e'.repeat(64),
        'server/package-lock.json': sha256(readFileSync(join(REPO_ROOT, 'server/package-lock.json'))),
      },
    },
  },
  {
    name: 'builder binary path is redirected to another in-repo file',
    overrides: {
      builderBinaryPath: 'package.json',
      builderBinaryHash: sha256(readFileSync(join(REPO_ROOT, 'package.json'))),
    },
  },
  {
    name: 'verifier binary path is redirected to another in-repo file',
    overrides: {
      verifierBinaryPath: 'package.json',
      verifierBinaryHash: sha256(readFileSync(join(REPO_ROOT, 'package.json'))),
    },
  },
  {
    name: 'dependency lock set is replaced by another in-repo file',
    overrides: {
      dependencyLockHashes: { 'package.json': sha256(readFileSync(join(REPO_ROOT, 'package.json'))) },
    },
  },
]) {
  test(`${referencedFileCase.name} fails EVIDENCE_MISMATCH before signing`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-referenced-file-'));
    const reportsRoot = join(dir, 'all-reports');
    const outPath = join(dir, 'evidence-attestation.json');
    const manifestPath = join(dir, 'evidence-manifest.json');
    writeReports(reportsRoot);
    writeFileSync(manifestPath, `${JSON.stringify(completeManifest(referencedFileCase.overrides), null, 2)}\n`, 'utf8');
    try {
      const result = await runCli([outPath, manifestPath, reportsRoot], {
        EVIDENCE_SIGNER_URL: 'http://127.0.0.1:1/sign',
        EVIDENCE_SIGNER_KEY_ID: KEY_ID,
        EVIDENCE_VERIFY_URL: 'http://127.0.0.1:1/verify',
        ...PINNED_CONTEXT,
      });
      assert.equal(result.code, 1);
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      assert.match(report.reason, /^EVIDENCE_MISMATCH:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('absent actual report file fails EVIDENCE_MISMATCH before signing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-absent-report-'));
  const reportsRoot = join(dir, 'all-reports');
  const outPath = join(dir, 'evidence-attestation.json');
  const manifestPath = join(dir, 'evidence-manifest.json');
  const layers = requiredLayers();
  writeReports(reportsRoot, layers.slice(1));
  writeFileSync(manifestPath, `${JSON.stringify(completeManifest(), null, 2)}\n`, 'utf8');
  try {
    const result = await runCli([outPath, manifestPath, reportsRoot], {
      EVIDENCE_SIGNER_URL: 'http://127.0.0.1:1/sign',
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: 'http://127.0.0.1:1/verify',
      ...PINNED_CONTEXT,
    });
    assert.equal(result.code, 1);
    const report = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.match(report.reason, /^EVIDENCE_MISMATCH:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const configCase of [
  {
    name: 'RELEASE_SIGNER_KEY_IDS is unset',
    env: {
      RELEASE_SIGNER_KEY_IDS: null,
      EVIDENCE_SIGNER_URL: 'https://evidence-signer.test/sign',
      EVIDENCE_VERIFY_URL: 'https://evidence-verifier.test/verify',
    },
    expected: /^CONFIG_MISSING:/,
  },
  {
    name: 'RELEASE_SIGNER_KEY_IDS is empty',
    env: {
      RELEASE_SIGNER_KEY_IDS: '',
      EVIDENCE_SIGNER_URL: 'https://evidence-signer.test/sign',
      EVIDENCE_VERIFY_URL: 'https://evidence-verifier.test/verify',
    },
    expected: /^CONFIG_MISSING:/,
  },
  {
    name: 'the evidence key is listed as a release signing key',
    env: {
      RELEASE_SIGNER_KEY_IDS: KEY_ID,
      EVIDENCE_SIGNER_URL: 'https://evidence-signer.test/sign',
      EVIDENCE_VERIFY_URL: 'https://evidence-verifier.test/verify',
    },
    expected: /^EVIDENCE_KEY_INVALID:/,
  },
  {
    name: 'the signer endpoint is not HTTPS',
    env: {
      RELEASE_SIGNER_KEY_IDS: 'monolith-release-key-0001',
      EVIDENCE_SIGNER_URL: 'http://evidence-signer.test/sign',
      EVIDENCE_VERIFY_URL: 'https://evidence-verifier.test/verify',
    },
    expected: /^CONFIG_INVALID:/,
  },
  {
    name: 'the verifier endpoint is not HTTPS',
    env: {
      RELEASE_SIGNER_KEY_IDS: 'monolith-release-key-0001',
      EVIDENCE_SIGNER_URL: 'https://evidence-signer.test/sign',
      EVIDENCE_VERIFY_URL: 'http://evidence-verifier.test/verify',
    },
    expected: /^CONFIG_INVALID:/,
  },
  {
    name: 'the signer and verifier share an origin',
    env: {
      RELEASE_SIGNER_KEY_IDS: 'monolith-release-key-0001',
      EVIDENCE_SIGNER_URL: 'https://evidence-service.test/sign',
      EVIDENCE_VERIFY_URL: 'https://evidence-service.test/verify',
    },
    expected: /^CONFIG_INVALID:/,
  },
]) {
  test(`${configCase.name} is rejected before signing`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-config-'));
    const reportsRoot = join(dir, 'all-reports');
    const outPath = join(dir, 'evidence-attestation.json');
    const manifestPath = join(dir, 'evidence-manifest.json');
    writeReports(reportsRoot);
    writeFileSync(manifestPath, `${JSON.stringify(completeManifest(), null, 2)}\n`, 'utf8');
    try {
      const result = await runCli([outPath, manifestPath, reportsRoot], {
        EVIDENCE_SIGNER_KEY_ID: KEY_ID,
        ...PINNED_CONTEXT,
        EVIDENCE_ALLOW_INSECURE_TRANSPORT: null,
        ...configCase.env,
      });
      assert.equal(result.code, 1);
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      assert.match(report.reason, configCase.expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const [name, layers] of [
  ['omitted required report layer', requiredLayers().slice(1)],
  ['duplicate required report layer', [...requiredLayers(), requiredLayers()[0]]],
]) {
  test(`${name} writes verified:false before signing`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-attestation-incomplete-'));
    const outPath = join(dir, 'evidence-attestation.json');
    const manifestPath = join(dir, 'evidence-manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(completeManifest({ layers }), null, 2)}\n`, 'utf8');
    try {
      const result = await runCli([outPath, manifestPath], {
        EVIDENCE_SIGNER_URL: 'http://127.0.0.1:1/sign',
        EVIDENCE_SIGNER_KEY_ID: KEY_ID,
        EVIDENCE_VERIFY_URL: 'http://127.0.0.1:1/verify',
      });
      assert.equal(result.code, 1);
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      assert.equal(report.verified, false);
      assert.match(report.reason, /^EVIDENCE_INCOMPLETE:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
