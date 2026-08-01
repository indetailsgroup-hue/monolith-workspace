import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { REQUIRED_REPORT_MANIFEST } from './final-gate-check.mjs';

const SCRIPT = fileURLToPath(new URL('./issue-evidence-attestation.mjs', import.meta.url));
const KEY_ID = 'monolith-evidence-key-0001';

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

const REQUIRED_PRE_ATTESTATION_REPORTS = REQUIRED_REPORT_MANIFEST.filter((name) => name !== 'evidence-attestation.json');

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
  const body = {
    schema: 'EvidenceManifestV1',
    phase: 'NOT_FOR_PRODUCTION',
    parentGit: { root: 'parent', commit: '1'.repeat(40), branch: 'main', dirtyFiles: [] },
    productGit: { root: 'product', commit: '2'.repeat(40), branch: 'codex/repair-intelligence-phase0-trust', dirtyFiles: [] },
    layers: requiredLayers(),
    dependencyLockHashes: { 'package-lock.json': 'b'.repeat(64) },
    environmentProfile: { os: 'ubuntu-24.04', node: 'v22.21.1' },
    builderBinaryHash: 'c'.repeat(64),
    verifierBinaryHash: 'd'.repeat(64),
    goldenPacketHash: 'e'.repeat(64),
    ciRunId: 'gha-run-12345',
    workflowIdentity: 'monolith/.github/workflows/trust-kernel-verify.yml@refs/heads/main',
    retentionDays: 90,
    evidenceKeyId: KEY_ID,
    issuedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
  return { ...body, evidenceRootHash: sha256(canonicalJson(body)) };
}

async function runCli(args, env = {}) {
  const child = new Worker(SCRIPT, {
    argv: args,
    env: { ...process.env, ...env },
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

test('complete valid manifest is signed, verified, writes verified:true, and exits 0', async () => {
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
  const outPath = join(dir, 'evidence-attestation.json');
  const manifestPath = join(dir, 'evidence-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(completeManifest(), null, 2)}\n`, 'utf8');

  try {
    const { port } = server.address();
    const result = await runCli([outPath, manifestPath], {
      EVIDENCE_SIGNER_URL: `http://127.0.0.1:${port}/sign`,
      EVIDENCE_SIGNER_KEY_ID: KEY_ID,
      EVIDENCE_VERIFY_URL: `http://127.0.0.1:${port}/verify`,
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(report.verified, true);
    assert.equal(report.attestation.keyId, KEY_ID);
    assert.equal(requests.length, 2);
    assert.deepEqual(Object.keys(requests[0].body).sort(), ['digestSha256', 'keyId', 'purpose']);
    assert.deepEqual(Object.keys(requests[1].body).sort(), ['digestSha256', 'keyId', 'signatureBase64']);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

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
