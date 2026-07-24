/**
 * buildEvidenceManifest.ts — the self-verifying evidence manifest (design §16.4,
 * plan Task 12 Step 2).
 *
 * The manifest binds everything a Shadow-Trust-Ready claim rests on: the Git state
 * of BOTH roots (parent governance + nested product), the exact command/report
 * digests with pass/fail/skip counts for every CI layer, dependency-lock hashes,
 * the environment profile, the builder and independent-verifier binary hashes, the
 * golden packet hash, the CI run/workflow identity, retention policy, and the
 * evidence signing key id. `evidenceRootHash` is the SHA-256 of the RFC-8785-style
 * canonical JSON of the manifest body (every field except the root hash itself), so
 * any mutation of any bound field changes the root hash and the attestation over it.
 *
 * `checkEvidenceComplete` is the "a truncated log or skipped test cannot support a
 * passing claim" gate (design §16.4): a layer with a failure, a skip, an empty suite
 * (zero passed), a missing report digest, or a non-zero exit code makes the whole
 * manifest incomplete, and issuance (issueEvidenceAttestation) refuses it.
 *
 * Pure construction + hashing only — no I/O, no key material.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;

/** Which Git root a state belongs to (design §2: parent governance + nested product). */
export type GitRoot = 'parent' | 'product';

/** The recorded Git state of one root: commit, branch, and the dirty-file list. */
export interface GitState {
  root: GitRoot;
  commit: string;
  branch: string;
  dirtyFiles: readonly string[];
}

/**
 * A digest of one CI layer's machine-readable result: the exact command, its exit
 * code, pass/fail/skip counts, and the SHA-256 of the result file (JSON/TAP). These
 * are what the attestation binds — "exact command/report digests" (design §16.4).
 */
export interface DigestRef {
  name: string;
  command: string;
  exitCode: number;
  passed: number;
  failed: number;
  skipped: number;
  sha256: string;
}

export interface EvidenceManifestInput {
  parentGit: GitState;
  productGit: GitState;
  layers: readonly DigestRef[];
  dependencyLockHashes: Readonly<Record<string, string>>;
  environmentProfile: Readonly<Record<string, string>>;
  builderBinaryHash: string;
  verifierBinaryHash: string;
  goldenPacketHash: string;
  ciRunId: string;
  workflowIdentity: string;
  retentionDays: number;
  evidenceKeyId: string;
  issuedAt: string;
}

export interface EvidenceManifestV1 {
  schema: 'EvidenceManifestV1';
  phase: 'NOT_FOR_PRODUCTION';
  parentGit: GitState;
  productGit: GitState;
  layers: readonly DigestRef[];
  dependencyLockHashes: Readonly<Record<string, string>>;
  environmentProfile: Readonly<Record<string, string>>;
  builderBinaryHash: string;
  verifierBinaryHash: string;
  goldenPacketHash: string;
  ciRunId: string;
  workflowIdentity: string;
  retentionDays: number;
  evidenceKeyId: string;
  issuedAt: string;
  evidenceRootHash: string;
}

/** Thrown when the manifest input is structurally malformed (mirrors buildTrustBundle). */
export class EvidenceManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceManifestError';
  }
}

function assertGitState(g: GitState, label: string): void {
  if (!g || typeof g !== 'object') throw new EvidenceManifestError(`${label} git state is missing`);
  if (!GIT_COMMIT.test(g.commit)) throw new EvidenceManifestError(`${label} git commit must be a 40-hex sha`);
  if (typeof g.branch !== 'string' || g.branch.length === 0) throw new EvidenceManifestError(`${label} git branch is required`);
  if (!Array.isArray(g.dirtyFiles)) throw new EvidenceManifestError(`${label} git dirtyFiles must be an array`);
}

function assertSha(value: string, label: string): void {
  if (!SHA256_HEX.test(value)) throw new EvidenceManifestError(`${label} must be a 64-char lowercase-hex sha256`);
}

/**
 * Build the manifest and compute its deterministic root hash. Validates the shape of
 * every bound field so a malformed manifest can never be signed. The root hash is
 * computed over the canonical body (all fields except `evidenceRootHash`).
 */
export function buildEvidenceManifest(input: EvidenceManifestInput): EvidenceManifestV1 {
  assertGitState(input.parentGit, 'parent');
  assertGitState(input.productGit, 'product');
  if (input.parentGit.root !== 'parent') throw new EvidenceManifestError('parentGit.root must be "parent"');
  if (input.productGit.root !== 'product') throw new EvidenceManifestError('productGit.root must be "product"');
  if (!Array.isArray(input.layers) || input.layers.length === 0) {
    throw new EvidenceManifestError('at least one CI layer digest is required');
  }
  for (const l of input.layers) {
    if (typeof l.name !== 'string' || l.name.length === 0) throw new EvidenceManifestError('layer name is required');
    if (typeof l.command !== 'string' || l.command.length === 0) throw new EvidenceManifestError(`layer "${l.name}" command is required`);
    assertSha(l.sha256, `layer "${l.name}" report sha256`);
    for (const [k, v] of [['exitCode', l.exitCode], ['passed', l.passed], ['failed', l.failed], ['skipped', l.skipped]] as const) {
      if (!Number.isInteger(v) || (v as number) < 0) throw new EvidenceManifestError(`layer "${l.name}" ${k} must be a non-negative integer`);
    }
  }
  assertSha(input.builderBinaryHash, 'builderBinaryHash');
  assertSha(input.verifierBinaryHash, 'verifierBinaryHash');
  assertSha(input.goldenPacketHash, 'goldenPacketHash');
  if (typeof input.ciRunId !== 'string' || input.ciRunId.length === 0) throw new EvidenceManifestError('ciRunId is required');
  if (typeof input.workflowIdentity !== 'string' || input.workflowIdentity.length === 0) throw new EvidenceManifestError('workflowIdentity is required');
  if (!Number.isInteger(input.retentionDays) || input.retentionDays <= 0) throw new EvidenceManifestError('retentionDays must be a positive integer');
  if (typeof input.evidenceKeyId !== 'string' || input.evidenceKeyId.length === 0) throw new EvidenceManifestError('evidenceKeyId is required');
  if (Number.isNaN(Date.parse(input.issuedAt))) throw new EvidenceManifestError('issuedAt must be an ISO-8601 timestamp');

  const body = {
    schema: 'EvidenceManifestV1' as const,
    phase: 'NOT_FOR_PRODUCTION' as const,
    parentGit: input.parentGit,
    productGit: input.productGit,
    layers: input.layers,
    dependencyLockHashes: input.dependencyLockHashes,
    environmentProfile: input.environmentProfile,
    builderBinaryHash: input.builderBinaryHash,
    verifierBinaryHash: input.verifierBinaryHash,
    goldenPacketHash: input.goldenPacketHash,
    ciRunId: input.ciRunId,
    workflowIdentity: input.workflowIdentity,
    retentionDays: input.retentionDays,
    evidenceKeyId: input.evidenceKeyId,
    issuedAt: input.issuedAt,
  };
  const evidenceRootHash = sha256Hex(canonicalJson(body));
  return { ...body, evidenceRootHash };
}

/** Recompute the root hash from the manifest body and compare — tamper detection. */
export function verifyEvidenceRootHash(manifest: EvidenceManifestV1): boolean {
  const { evidenceRootHash, ...body } = manifest;
  return sha256Hex(canonicalJson(body)) === evidenceRootHash;
}

/** Why an evidence manifest cannot support a passing claim (design §16.4). */
export type EvidenceCompletenessReason =
  | 'FAILURE_PRESENT'
  | 'SKIP_PRESENT'
  | 'EMPTY_SUITE'
  | 'MISSING_REPORT'
  | 'NONZERO_EXIT'
  | 'ROOT_HASH_MISMATCH';

export type EvidenceCompletenessResult =
  | { ok: true }
  | { ok: false; reason: EvidenceCompletenessReason; detail: string };

/**
 * The pass gate: reject a manifest that carries any failure, skip, empty suite,
 * missing report digest, non-zero exit, or a broken root hash. A truncated or skipped
 * result can never support a passing evidence claim (design §16.4). The CI final job
 * and issueEvidenceAttestation both run this before signing/attesting.
 */
export function checkEvidenceComplete(manifest: EvidenceManifestV1): EvidenceCompletenessResult {
  if (!verifyEvidenceRootHash(manifest)) {
    return { ok: false, reason: 'ROOT_HASH_MISMATCH', detail: 'manifest root hash does not match its body' };
  }
  for (const l of manifest.layers) {
    if (!SHA256_HEX.test(l.sha256)) return { ok: false, reason: 'MISSING_REPORT', detail: `layer "${l.name}" has no valid report digest` };
    if (l.exitCode !== 0) return { ok: false, reason: 'NONZERO_EXIT', detail: `layer "${l.name}" exited ${l.exitCode}` };
    if (l.failed > 0) return { ok: false, reason: 'FAILURE_PRESENT', detail: `layer "${l.name}" has ${l.failed} failure(s)` };
    if (l.skipped > 0) return { ok: false, reason: 'SKIP_PRESENT', detail: `layer "${l.name}" has ${l.skipped} skip(s)` };
    if (l.passed <= 0) return { ok: false, reason: 'EMPTY_SUITE', detail: `layer "${l.name}" recorded zero passing assertions` };
  }
  return { ok: true };
}
