import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_REPORT_MANIFEST = Object.freeze([
  'server-ubuntu-latest.json',
  'server-windows-latest.json',
  'determinism-ubuntu-latest.json',
  'determinism-windows-latest.json',
  'verifier-ubuntu-latest.json',
  'verifier-windows-latest.json',
  'containment-ubuntu-latest.json',
  'containment-windows-latest.json',
  'repair-ubuntu-latest.json',
  'repair-windows-latest.json',
  'route-ledger.txt',
  'repair-phase0-ledger.json',
  'repair-docs.txt',
  'golden-ubuntu-latest.sha',
  'golden-windows-latest.sha',
  'edge.json',
  'pgtap-trust_kernel_tenancy.tap',
  'pgtap-trust_kernel_governance.tap',
  'pgtap-trust_kernel_release.tap',
  'pgtap-trust_kernel_bundles.tap',
  'pgtap-trust_kernel_containment.tap',
  'pgtap-workflow_db_invariants.tap',
  'pgtap-trust_kernel_safety.tap',
  'pgtap-repair_phase0_organization.tap',
  'pgtap-repair_phase0_containment.tap',
  'e2e.json',
  'claim-linters.txt',
  'evidence-manifest.json',
  'evidence-attestation.json',
]);

export const REQUIRED_PRE_ATTESTATION_REPORTS = Object.freeze(
  REQUIRED_REPORT_MANIFEST.filter((name) => !['evidence-manifest.json', 'evidence-attestation.json'].includes(name)),
);

export const EVIDENCE_BUILDER_BINARY_PATH = 'scripts/trust-kernel/build-evidence-manifest.mjs';
export const EVIDENCE_VERIFIER_BINARY_PATH = 'scripts/trust-kernel/final-gate-check.mjs';
export const EVIDENCE_DEPENDENCY_LOCK_PATHS = Object.freeze([
  'package-lock.json',
  'server/package-lock.json',
]);

export class EvidenceIntegrityError extends Error {
  constructor(code, detail) {
    super(detail);
    this.name = 'EvidenceIntegrityError';
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('value contains a non-finite number');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new TypeError('value contains a non-JSON value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function recomputeEvidenceRootHash(manifest) {
  const { evidenceRootHash: _claimedRoot, ...body } = manifest;
  return sha256(canonicalJson(body));
}

export function buildUnsignedEvidenceAttestation(manifest, keyId = manifest.evidenceKeyId) {
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

function walk(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

export function assertEvidenceReportLayers(manifest, reportsRoot) {
  const filesByBasename = new Map();
  for (const file of walk(reportsRoot)) {
    const name = path.basename(file);
    filesByBasename.set(name, [...(filesByBasename.get(name) ?? []), file]);
  }

  for (const layer of manifest.layers) {
    const matches = filesByBasename.get(layer.name) ?? [];
    if (matches.length === 0) {
      throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', `actual report file is absent for layer ${layer.name}`);
    }
    for (const file of matches) {
      if (sha256(fs.readFileSync(file)) !== layer.sha256) {
        throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', `actual report digest differs for layer ${layer.name}`);
      }
    }
  }
}

function resolveReferencedFile(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (path.isAbsolute(relativePath) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', `${label} path escapes the product root`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', `${label} referenced file is absent`);
  }
  return resolved;
}

function assertReferencedHash(root, relativePath, expectedHash, label) {
  const file = resolveReferencedFile(root, relativePath, label);
  if (sha256(fs.readFileSync(file)) !== expectedHash) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', `${label} digest differs from the referenced file bytes`);
  }
}

export function assertManifestReferencedFiles(manifest, root) {
  if (manifest.builderBinaryPath !== EVIDENCE_BUILDER_BINARY_PATH) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', 'builder binary path is not the pinned evidence builder');
  }
  if (manifest.verifierBinaryPath !== EVIDENCE_VERIFIER_BINARY_PATH) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', 'verifier binary path is not the pinned final-gate verifier');
  }
  const actualLockPaths = Object.keys(manifest.dependencyLockHashes).sort();
  const expectedLockPaths = [...EVIDENCE_DEPENDENCY_LOCK_PATHS].sort();
  if (JSON.stringify(actualLockPaths) !== JSON.stringify(expectedLockPaths)) {
    throw new EvidenceIntegrityError('EVIDENCE_MISMATCH', 'dependency lock path set does not match the pinned lock files');
  }
  assertReferencedHash(root, manifest.builderBinaryPath, manifest.builderBinaryHash, 'builder binary');
  assertReferencedHash(root, manifest.verifierBinaryPath, manifest.verifierBinaryHash, 'verifier binary');
  for (const [relativePath, expectedHash] of Object.entries(manifest.dependencyLockHashes)) {
    assertReferencedHash(root, relativePath, expectedHash, `dependency lock ${relativePath}`);
  }
}
