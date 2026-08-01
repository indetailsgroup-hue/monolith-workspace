#!/usr/bin/env node
/**
 * Issue and self-verify an EvidenceAttestationV1 proof (design §16.4).
 *
 * Usage:
 *   node issue-evidence-attestation.mjs <output.json> <evidence-manifest.json> <reports-root>
 *
 * The manifest path may instead be supplied as EVIDENCE_MANIFEST_PATH. The
 * managed signer receives only a SHA-256 digest; the separate verifier receives
 * only that digest, the public key id, and the returned signature. No endpoint,
 * credential, or signature material is written to logs.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertEvidenceReportLayers,
  assertManifestReferencedFiles,
  buildUnsignedEvidenceAttestation,
  canonicalJson as canonicalizeJson,
  EvidenceIntegrityError,
  REQUIRED_PRE_ATTESTATION_REPORTS,
  recomputeEvidenceRootHash,
  sha256,
} from './evidence-manifest-integrity.mjs';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MANIFEST_KEYS = [
  'schema', 'phase', 'parentGit', 'productGit', 'layers',
  'dependencyLockHashes', 'environmentProfile', 'builderBinaryPath',
  'builderBinaryHash', 'verifierBinaryPath', 'verifierBinaryHash',
  'goldenPacketHash', 'ciRunId', 'workflowIdentity',
  'retentionDays', 'evidenceKeyId', 'issuedAt', 'evidenceRootHash',
].sort();
const REQUIRED_LAYER_NAMES = [...REQUIRED_PRE_ATTESTATION_REPORTS].sort();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
  try {
    return canonicalizeJson(value);
  } catch {
    fail('MANIFEST_INVALID', 'manifest contains a non-JSON value');
  }
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

  assertHashMap(manifest.dependencyLockHashes, 'dependencyLockHashes');
  assertEnvironmentProfile(manifest.environmentProfile);
  if (typeof manifest.builderBinaryPath !== 'string' || manifest.builderBinaryPath.length === 0
      || typeof manifest.verifierBinaryPath !== 'string' || manifest.verifierBinaryPath.length === 0) {
    fail('MANIFEST_INVALID', 'builder and verifier binary paths are required');
  }
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
  if (recomputeEvidenceRootHash(body) !== evidenceRootHash) {
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

function assertPinnedContext(manifest, env) {
  let head;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    fail('CONFIG_MISSING', 'unable to resolve the checked-out product Git commit');
  }
  if (manifest.productGit.commit !== head) {
    fail('EVIDENCE_MISMATCH', 'manifest productGit.commit does not match the checked-out HEAD');
  }

  const contextPins = [
    ['GITHUB_RUN_ID', manifest.ciRunId, env.GITHUB_RUN_ID],
    ['GITHUB_WORKFLOW', manifest.workflowIdentity, env.GITHUB_WORKFLOW],
  ];
  for (const [name, claimed, actual] of contextPins) {
    if (typeof actual === 'string' && actual.length > 0 && claimed !== actual) {
      fail('EVIDENCE_MISMATCH', `manifest context does not match ${name}`);
    }
  }
  const missing = contextPins.filter(([, , actual]) => typeof actual !== 'string' || actual.length === 0);
  if (missing.length > 0 && env.EVIDENCE_ALLOW_UNPINNED_CONTEXT !== '1') {
    fail('CONFIG_MISSING', `${missing.map(([name]) => name).join(' and ')} require EVIDENCE_ALLOW_UNPINNED_CONTEXT=1 for a local run`);
  }
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

function validateEndpointConfig(value, label) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    fail('CONFIG_INVALID', `${label} endpoint must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    fail('CONFIG_INVALID', `${label} endpoint protocol is not allowed`);
  }
  return endpoint;
}

function validateIssuerConfig(env) {
  const signerUrl = env.EVIDENCE_SIGNER_URL;
  const keyId = env.EVIDENCE_SIGNER_KEY_ID;
  const verifyUrl = env.EVIDENCE_VERIFY_URL;
  if (!signerUrl || !keyId || !verifyUrl) {
    fail('CONFIG_MISSING', 'signer URL, evidence key id, and verify URL must all be configured');
  }
  const releaseKeyIds = String(env.RELEASE_SIGNER_KEY_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (releaseKeyIds.length === 0) {
    fail('CONFIG_MISSING', 'RELEASE_SIGNER_KEY_IDS must name at least one release signing key');
  }
  if (releaseKeyIds.includes(keyId)) {
    fail('EVIDENCE_KEY_INVALID', 'evidence key must be separate from release keys');
  }

  const signerEndpoint = validateEndpointConfig(signerUrl, 'signer');
  const verifyEndpoint = validateEndpointConfig(verifyUrl, 'verifier');
  if (env.EVIDENCE_ALLOW_INSECURE_TRANSPORT !== '1') {
    if (signerEndpoint.protocol !== 'https:' || verifyEndpoint.protocol !== 'https:') {
      fail('CONFIG_INVALID', 'signer and verifier endpoints must both use HTTPS');
    }
    if (signerEndpoint.origin === verifyEndpoint.origin) {
      fail('CONFIG_INVALID', 'signer and verifier endpoints must use separate origins');
    }
  }
  return { signerUrl, keyId, verifyUrl };
}

export async function issueEvidenceProof({ manifestPath, reportsRoot, env = process.env, fetchImpl = fetch }) {
  const { signerUrl, keyId, verifyUrl } = validateIssuerConfig(env);

  const manifest = validateEvidenceManifest(parseJsonFile(manifestPath), keyId);
  try {
    assertEvidenceReportLayers(manifest, reportsRoot);
    assertManifestReferencedFiles(manifest, repoRoot);
  } catch (error) {
    if (error instanceof EvidenceIntegrityError) fail(error.code, error.message);
    throw error;
  }
  assertPinnedContext(manifest, env);
  const unsigned = buildUnsignedEvidenceAttestation(manifest, keyId);
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
  const reportsRoot = argv[4] || env.EVIDENCE_REPORTS_ROOT;
  try {
    const report = await issueEvidenceProof({ manifestPath, reportsRoot, env });
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
