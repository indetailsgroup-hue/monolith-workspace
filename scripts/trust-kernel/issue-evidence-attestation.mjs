#!/usr/bin/env node
/**
 * Issue and self-verify an EvidenceAttestationV1 proof (design §16.4).
 *
 * Usage:
 *   node issue-evidence-attestation.mjs <output.json> <evidence-manifest.json>
 *
 * The manifest path may instead be supplied as EVIDENCE_MANIFEST_PATH. The
 * managed signer receives only a SHA-256 digest; the separate verifier receives
 * only that digest, the public key id, and the returned signature. No endpoint,
 * credential, or signature material is written to logs.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_REPORT_MANIFEST } from './final-gate-check.mjs';
import { REQUIRED_REPORT_MANIFEST } from './final-gate-check.mjs';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MANIFEST_KEYS = [
  'schema', 'phase', 'parentGit', 'productGit', 'layers',
  'dependencyLockHashes', 'environmentProfile', 'builderBinaryHash',
  'verifierBinaryHash', 'goldenPacketHash', 'ciRunId', 'workflowIdentity',
  'retentionDays', 'evidenceKeyId', 'issuedAt', 'evidenceRootHash',
].sort();
const REQUIRED_LAYER_NAMES = REQUIRED_REPORT_MANIFEST
  .filter((name) => name !== 'evidence-attestation.json')
  .sort();

class EvidenceError extends Error {
  constructor(code, detail) {
    super(detail);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

function fail(code, detail) {
  throw new EvidenceError(code, detail);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('MANIFEST_INVALID', 'manifest contains a non-finite number');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) fail('MANIFEST_INVALID', 'manifest contains a non-JSON value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    fail('MANIFEST_INVALID', `${label} must be a 64-character lowercase SHA-256`);
  }
}

function assertGitState(value, root) {
  if (!isRecord(value) || value.root !== root || !GIT_COMMIT.test(value.commit)
      || typeof value.branch !== 'string' || value.branch.length === 0
      || !Array.isArray(value.dirtyFiles) || !value.dirtyFiles.every((item) => typeof item === 'string')) {
    fail('MANIFEST_INVALID', `${root} Git state is incomplete or malformed`);
  }
}

function assertHashMap(value, label) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail('MANIFEST_INVALID', `${label} must be a non-empty object`);
  }
  for (const [name, digest] of Object.entries(value)) assertSha(digest, `${label}.${name}`);
}

function assertEnvironmentProfile(value) {
  if (!isRecord(value) || Object.keys(value).length === 0
      || !Object.values(value).every((item) => typeof item === 'string' && item.length > 0)) {
    fail('MANIFEST_INVALID', 'environmentProfile must contain non-empty string values');
  }
}

export function validateEvidenceManifest(manifest, configuredKeyId) {
  if (!isRecord(manifest) || JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(MANIFEST_KEYS)) {
    fail('MANIFEST_INVALID', 'EvidenceManifestV1 has missing or unexpected fields');
  }
  if (manifest.schema !== 'EvidenceManifestV1' || manifest.phase !== 'NOT_FOR_PRODUCTION') {
    fail('MANIFEST_INVALID', 'manifest schema or phase is invalid');
  }
  assertGitState(manifest.parentGit, 'parent');
  assertGitState(manifest.productGit, 'product');

  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) {
    fail('EVIDENCE_INCOMPLETE', 'manifest contains no evidence layers');
  }
  const layerNames = manifest.layers.map((layer) => layer?.name);
  if (new Set(layerNames).size !== layerNames.length
      || JSON.stringify([...layerNames].sort()) !== JSON.stringify(REQUIRED_LAYER_NAMES)) {
    fail('EVIDENCE_INCOMPLETE', 'manifest must contain each required CI report layer exactly once');
  }
  for (const layer of manifest.layers) {
    if (!isRecord(layer) || typeof layer.name !== 'string' || layer.name.length === 0
        || typeof layer.command !== 'string' || layer.command.length === 0) {
      fail('MANIFEST_INVALID', 'evidence layer identity is incomplete');
    }
    assertSha(layer.sha256, `layer ${layer.name} report digest`);
    for (const key of ['exitCode', 'passed', 'failed', 'skipped']) {
      if (!Number.isInteger(layer[key]) || layer[key] < 0) {
        fail('MANIFEST_INVALID', `layer ${layer.name} ${key} must be a non-negative integer`);
      }
    }
    if (layer.exitCode !== 0 || layer.failed !== 0 || layer.skipped !== 0 || layer.passed <= 0) {
      fail('EVIDENCE_INCOMPLETE', `layer ${layer.name} is failed, skipped, empty, or non-zero`);
    }
  }

  // Completeness against the shared workflow manifest: every required report
  // (except the attestation this script itself writes) must appear exactly
  // once. This must reject BEFORE any signer interaction so incomplete
  // evidence can never reach signing.
  const requiredNames = REQUIRED_REPORT_MANIFEST.filter((name) => name !== 'evidence-attestation.json');
  const layerCounts = new Map();
  for (const layer of manifest.layers) {
    layerCounts.set(layer.name, (layerCounts.get(layer.name) ?? 0) + 1);
  }
  for (const name of requiredNames) {
    if (!layerCounts.has(name)) {
      fail('EVIDENCE_INCOMPLETE', `required report layer ${name} is missing from the manifest`);
    }
  }
  for (const [name, count] of layerCounts) {
    if (count > 1) {
      fail('EVIDENCE_INCOMPLETE', `report layer ${name} appears ${count} times in the manifest`);
    }
  }

  assertHashMap(manifest.dependencyLockHashes, 'dependencyLockHashes');
  assertEnvironmentProfile(manifest.environmentProfile);
  assertSha(manifest.builderBinaryHash, 'builderBinaryHash');
  assertSha(manifest.verifierBinaryHash, 'verifierBinaryHash');
  assertSha(manifest.goldenPacketHash, 'goldenPacketHash');
  if (typeof manifest.ciRunId !== 'string' || manifest.ciRunId.length === 0
      || typeof manifest.workflowIdentity !== 'string' || manifest.workflowIdentity.length === 0
      || !Number.isInteger(manifest.retentionDays) || manifest.retentionDays <= 0
      || typeof manifest.issuedAt !== 'string' || !Number.isFinite(Date.parse(manifest.issuedAt))) {
    fail('MANIFEST_INVALID', 'CI identity, retention, or issuance time is invalid');
  }
  if (typeof configuredKeyId !== 'string' || configuredKeyId.length === 0
      || manifest.evidenceKeyId !== configuredKeyId || !/evidence/i.test(configuredKeyId)) {
    fail('EVIDENCE_KEY_INVALID', 'manifest key id must match a dedicated EVIDENCE key');
  }

  const { evidenceRootHash, ...body } = manifest;
  assertSha(evidenceRootHash, 'evidenceRootHash');
  if (sha256(canonicalJson(body)) !== evidenceRootHash) {
    fail('ROOT_HASH_MISMATCH', 'manifest evidenceRootHash does not match its canonical body');
  }
  return manifest;
}

function parseJsonFile(file) {
  if (!file || !fs.existsSync(file)) fail('MANIFEST_MISSING', 'evidence manifest input is missing');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('MANIFEST_INVALID', 'evidence manifest input is not valid JSON');
  }
}

function buildUnsignedAttestation(manifest, keyId) {
  return {
    schema: 'EvidenceAttestationV1',
    parentGit: manifest.parentGit,
    productGit: manifest.productGit,
    commandReportDigests: manifest.layers,
    ciRunId: manifest.ciRunId,
    workflowIdentity: manifest.workflowIdentity,
    builderBinaryHash: manifest.builderBinaryHash,
    verifierBinaryHash: manifest.verifierBinaryHash,
    evidenceRootHash: manifest.evidenceRootHash,
    issuedAt: manifest.issuedAt,
    retentionDays: manifest.retentionDays,
    keyId,
  };
}

async function postJson(url, body, { token, fetchImpl, label }) {
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    fail(`${label}_UNAVAILABLE`, `${label.toLowerCase()} endpoint is invalid`);
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    fail(`${label}_UNAVAILABLE`, `${label.toLowerCase()} endpoint protocol is not allowed`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    fail(`${label}_UNAVAILABLE`, `${label.toLowerCase()} request failed or timed out`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) fail(`${label}_UNAVAILABLE`, `${label.toLowerCase()} returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    fail(`${label}_INVALID`, `${label.toLowerCase()} response was not valid JSON`);
  }
}

function assertSignature(signatureBase64) {
  if (typeof signatureBase64 !== 'string' || !BASE64.test(signatureBase64)
      || Buffer.from(signatureBase64, 'base64').length !== 64) {
    fail('SIGNER_INVALID', 'managed signer returned an invalid Ed25519 signature');
  }
}

export async function issueEvidenceProof({ manifestPath, env = process.env, fetchImpl = fetch }) {
  const signerUrl = env.EVIDENCE_SIGNER_URL;
  const keyId = env.EVIDENCE_SIGNER_KEY_ID;
  const verifyUrl = env.EVIDENCE_VERIFY_URL;
  if (!signerUrl || !keyId || !verifyUrl) {
    fail('CONFIG_MISSING', 'signer URL, evidence key id, and verify URL must all be configured');
  }
  const releaseKeyIds = String(env.RELEASE_SIGNER_KEY_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (releaseKeyIds.includes(keyId)) fail('EVIDENCE_KEY_INVALID', 'evidence key must be separate from release keys');

  const manifest = validateEvidenceManifest(parseJsonFile(manifestPath), keyId);
  const unsigned = buildUnsignedAttestation(manifest, keyId);
  const digestSha256 = sha256(canonicalJson(unsigned));
  const signerResponse = await postJson(signerUrl, { keyId, purpose: 'EVIDENCE', digestSha256 }, {
    token: env.EVIDENCE_WORKLOAD_TOKEN,
    fetchImpl,
    label: 'SIGNER',
  });
  if (!isRecord(signerResponse) || signerResponse.algorithm !== 'Ed25519' || signerResponse.keyId !== keyId) {
    fail('SIGNER_INVALID', 'managed signer returned the wrong algorithm or key id');
  }
  assertSignature(signerResponse.signatureBase64);

  const verifyResponse = await postJson(verifyUrl, {
    digestSha256,
    keyId,
    signatureBase64: signerResponse.signatureBase64,
  }, {
    token: env.EVIDENCE_WORKLOAD_TOKEN,
    fetchImpl,
    label: 'VERIFIER',
  });
  if (!isRecord(verifyResponse) || verifyResponse.verified !== true) {
    fail('SIGNATURE_INVALID', 'evidence signature did not verify');
  }

  return {
    schema: 'EvidenceAttestationV1',
    verified: true,
    reason: 'complete evidence manifest signed and cryptographically self-verified',
    attestation: { ...unsigned, signatureBase64: signerResponse.signatureBase64 },
  };
}

function writeReport(outPath, report) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function main(argv = process.argv, env = process.env) {
  const outPath = argv[2] || 'reports/evidence-attestation.json';
  const manifestPath = argv[3] || env.EVIDENCE_MANIFEST_PATH;
  try {
    const report = await issueEvidenceProof({ manifestPath, env });
    writeReport(outPath, report);
    console.log('evidence self-verification: VERIFIED');
    return 0;
  } catch (error) {
    const code = error instanceof EvidenceError ? error.code : 'UNEXPECTED_FAILURE';
    const reason = error instanceof EvidenceError ? error.message : 'unexpected evidence verification failure';
    writeReport(outPath, { schema: 'EvidenceAttestationV1', verified: false, reason: `${code}: ${reason}` });
    console.error(`::error::evidence self-verification FAILED CLOSED (${code})`);
    return 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main();
