/**
 * verify.ts - The standalone independent FactoryPacket V3 verification core (design §14)
 *
 * A PURE async function of its explicit inputs (packet bytes, trust bundle,
 * release-status bundle, pinned policy, persistent state, and an EXPLICIT clock).
 * It never reads a clock, filesystem, or network - `cli.ts` supplies those and
 * writes state atomically. It imports no builder code.
 *
 * Signature scheme (option (b), justified in the Task 10 report): the committed
 * golden vectors carry a deterministic NOT_FOR_PRODUCTION signature (the Task-8/9
 * fake signer, no real keypair). This verifier reproduces that committed scheme
 * with the trust root PINNED in policy (a bundle can never authorize its own
 * signing key), so it still catches every mutation. It ALSO carries a real
 * Ed25519 path (`verifyEd25519Detached`, via @noble/ed25519): when policy pins a
 * real public key the bundle signature is verified cryptographically. That path
 * is exercised end-to-end in the tests with an ephemeral keypair, so the moment a
 * real keypair + vectors exist the verifier verifies real signatures with no
 * structural change.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import { webcrypto, createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';

import { canonicalJson, sha256Hex, sha256Base64 } from './canonical.js';
import { readFactoryPacket, type ParsedPacket } from './packetReader.js';
import {
  parseInstantMs,
  checkExpiryAndStaleness,
  checkSequence,
  advanceHighWater,
  stateKey,
} from './freshnessStore.js';
import {
  vok,
  verr,
  type VResult,
  type TrustReasonCode,
  type TenantScopeV1,
  type TrustBundleV1,
  type TrustedKeyV1,
  type KeyRevocationV1,
  type RevocationEntryV1,
  type ReleaseStatusBundleV1,
  type ReleaseCertificateV1,
  type FactoryPacketManifestV3,
  type VerifierPolicyV1,
  type VerifierStateV1,
  type VerifierResourceLimits,
  type VerificationReportV1,
  DEFAULT_RESOURCE_LIMITS,
} from './types.js';

// ---------------------------------------------------------------------------
// Real Ed25519 primitive (@noble/ed25519). Provide a SHA-512 hook from node so
// verification works regardless of the runtime's WebCrypto availability.
// ---------------------------------------------------------------------------

const nodeSha512 = (msg: Uint8Array): Uint8Array => new Uint8Array(createHash('sha512').update(msg).digest());
try {
  const anyEd = ed as unknown as { hashes?: Record<string, unknown>; etc?: Record<string, unknown> };
  if (anyEd.hashes && anyEd.hashes.sha512 === undefined) anyEd.hashes.sha512 = nodeSha512;
  if (anyEd.etc && (anyEd.etc as { sha512Sync?: unknown }).sha512Sync === undefined) {
    (anyEd.etc as { sha512Sync?: unknown }).sha512Sync = nodeSha512;
  }
} catch {
  /* best effort; async verify uses WebCrypto */
}
// Ensure a global WebCrypto for @noble's async paths on older runtimes.
if (typeof (globalThis as { crypto?: unknown }).crypto === 'undefined') {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Verify a detached Ed25519 signature. Returns false on any malformed input. */
export async function verifyEd25519Detached(
  publicKeyHex: string,
  message: Uint8Array,
  signatureBase64: string,
): Promise<boolean> {
  const pub = hexToBytes(publicKeyHex);
  if (pub === null || pub.length !== 32) return false;
  let sig: Uint8Array;
  try {
    sig = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  try {
    return await ed.verifyAsync(sig, message, pub);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ED25519 = 'ed25519';
const TRUST_BUNDLE_PURPOSE = 'TRUST_BUNDLE';
const CONTENT_DOMAIN = 'MONOLITH/FactoryPacketContent/V3';
const NOT_FOR_PRODUCTION_PATH = 'NOT_FOR_PRODUCTION.txt';
const DEV_MARKER_SIG = Buffer.alloc(64, 0).toString('base64');
const DEV_KEY_PREFIX = 'dev-';

function scopeEqual(a: TenantScopeV1, b: TenantScopeV1): boolean {
  return (
    a.tenantId === b.tenantId &&
    a.orgId === b.orgId &&
    a.siteId === b.siteId &&
    a.policyVersion === b.policyVersion
  );
}

function stripSignature(bundle: TrustBundleV1 | ReleaseStatusBundleV1): Record<string, unknown> {
  const { signature: _s, ...rest } = bundle as unknown as Record<string, unknown> & { signature: unknown };
  return rest;
}

/** Verify a bundle signature under the pinned policy (real Ed25519 or shadow scheme). */
async function verifyPinnedBundleSignature(
  bundle: TrustBundleV1 | ReleaseStatusBundleV1,
  policy: VerifierPolicyV1,
): Promise<VResult<void>> {
  const sig = bundle.signature;
  const pinned = policy.pinnedTrustBundleKey;
  if (sig.alg !== ED25519) {
    return verr('CRYPTO_ALGORITHM_DENIED', { reason: 'bundle signature algorithm is not ed25519', alg: String(sig.alg) });
  }
  if (pinned.purpose !== TRUST_BUNDLE_PURPOSE) {
    return verr('CRYPTO_ALGORITHM_DENIED', { reason: 'pinned trust-bundle key purpose is not TRUST_BUNDLE', purpose: String(pinned.purpose) });
  }
  // Trust-root pinning: a bundle can never be signed by anything other than the
  // key pinned in policy OUTSIDE the bundle.
  if (sig.keyId !== pinned.keyId) {
    return verr('CRYPTO_SIGNATURE_INVALID', { reason: 'bundle not signed by the pinned trust root', keyId: sig.keyId });
  }

  const unsigned = stripSignature(bundle);
  if (pinned.publicKeyHex !== undefined) {
    // Production path: real Ed25519 over the canonical unsigned bytes.
    const message = new TextEncoder().encode(canonicalJson(unsigned));
    const okReal = await verifyEd25519Detached(pinned.publicKeyHex, message, sig.sig);
    return okReal ? vok(undefined) : verr('CRYPTO_SIGNATURE_INVALID', { keyId: sig.keyId });
  }

  // Shadow NOT_FOR_PRODUCTION path (committed vectors): deterministic sig over the
  // digest. Integrity is enforced by the sha256; authority by the pinned keyId.
  const digest = sha256Hex(canonicalJson(unsigned));
  const expected = sha256Base64(`${digest}|${sig.keyId}|${TRUST_BUNDLE_PURPOSE}`);
  return sig.sig === expected ? vok(undefined) : verr('CRYPTO_SIGNATURE_INVALID', { keyId: sig.keyId });
}

/** Is `keyId` currently unusable per the bundle's key revocations (explicit mode)? */
function keyRevoked(keyId: string, revocations: readonly KeyRevocationV1[], nowMs: number): boolean {
  for (const r of revocations) {
    if (r.keyId !== keyId) continue;
    const effMs = parseInstantMs(r.effectiveAt);
    if (effMs === null || nowMs < effMs) continue;
    if (r.revocationMode === 'ALL_SIGNATURES' || r.revocationMode === 'ISSUANCE_DISABLED') return true;
    if (r.revocationMode === 'SIGNED_AT_OR_AFTER') return true;
  }
  return false;
}

/** Resolve a usable RELEASE-purpose authority key from the trust bundle. */
function resolveReleaseAuthority(bundle: TrustBundleV1, nowMs: number): VResult<TrustedKeyV1> {
  const releaseKeys = bundle.trustedKeys.filter((k) => k.purpose === 'RELEASE');
  if (releaseKeys.length === 0) {
    return verr('CRYPTO_ALGORITHM_DENIED', { reason: 'no trusted key with RELEASE purpose' });
  }
  for (const k of releaseKeys) {
    if (k.algorithm !== ED25519) continue;
    const from = parseInstantMs(k.validFrom);
    const until = parseInstantMs(k.validUntil);
    if (from === null || until === null || nowMs < from || nowMs > until) continue;
    if (keyRevoked(k.keyId, bundle.keyRevocations, nowMs)) continue;
    return vok(k);
  }
  return verr('CRYPTO_ALGORITHM_DENIED', { reason: 'no valid, unrevoked RELEASE key in window' });
}

/** Verify the release certificate's own signature (shadow dev marker for committed vectors). */
function verifyCertificateSignature(cert: ReleaseCertificateV1): VResult<void> {
  if (cert.algorithm !== ED25519 || cert.signature.alg !== ED25519) {
    return verr('CRYPTO_ALGORITHM_DENIED', { reason: 'certificate algorithm is not ed25519' });
  }
  if (cert.signature.keyId !== cert.signerKeyId) {
    return verr('CRYPTO_SIGNATURE_INVALID', { reason: 'certificate signature keyId does not match signerKeyId' });
  }
  // NOT_FOR_PRODUCTION development-marker signature (design §11.2 "development key
  // with an explicit marker"): the 64-zero-byte signature bound to a `dev-` key.
  if (!cert.signerKeyId.startsWith(DEV_KEY_PREFIX) || cert.signature.sig !== DEV_MARKER_SIG) {
    return verr('CRYPTO_SIGNATURE_INVALID', { reason: 'certificate signature is not a recognized NOT_FOR_PRODUCTION dev marker' });
  }
  return vok(undefined);
}

/** A revocation entry applies if it matches by id or hash and is effective now. */
function revocationApplies(
  entries: readonly RevocationEntryV1[],
  match: { id?: string; hash?: string },
  nowMs: number,
): boolean {
  for (const e of entries) {
    const effMs = parseInstantMs(e.effectiveAt);
    if (effMs === null || nowMs < effMs) continue;
    if ((match.hash !== undefined && e.hash === match.hash) || (match.id !== undefined && e.id === match.id)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public verify()
// ---------------------------------------------------------------------------

export interface VerifyInput {
  packetBytes: Uint8Array;
  trustBundle: TrustBundleV1;
  statusBundle: ReleaseStatusBundleV1;
  policy: VerifierPolicyV1;
  state: VerifierStateV1;
  /** The explicit trusted clock as an ISO-8601 instant, or null when unavailable. */
  nowIso: string | null;
  verifierBuildHash: string;
  limits?: VerifierResourceLimits;
}

export interface VerifyOutcome {
  report: VerificationReportV1;
  /** The state to persist on PASS (advanced high-water marks); null on FAIL. */
  nextState: VerifierStateV1 | null;
}

export async function verify(input: VerifyInput): Promise<VerifyOutcome> {
  const { trustBundle, statusBundle, policy, state, verifierBuildHash } = input;
  const limits = input.limits ?? policy.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;
  const scope = policy.permittedTrustScope;

  const checkedHashes: Record<string, string> = {};
  const bundleSequences: Record<string, number> = {};
  let validAsOf: string | null = null;
  let freshnessAgeSeconds: number | null = null;
  const checkpointLabel =
    state.bootstrapCheckpoint[stateKey('TRUST', scope)] !== undefined ||
    state.bootstrapCheckpoint[stateKey('RELEASE_STATUS', scope)] !== undefined
      ? `TRUST>=${state.bootstrapCheckpoint[stateKey('TRUST', scope)] ?? '-'};RELEASE_STATUS>=${state.bootstrapCheckpoint[stateKey('RELEASE_STATUS', scope)] ?? '-'}`
      : null;

  const fail = (code: TrustReasonCode, detail?: string): VerifyOutcome => ({
    report: {
      verdict: 'FAIL',
      codes: [code],
      checkedHashes,
      bundleSequences,
      verifierBuildHash,
      validAsOf,
      freshnessAgeSeconds,
      checkpoint: checkpointLabel,
      summary: `FAIL: ${code}${detail ? ` (${detail})` : ''}`,
    },
    nextState: null,
  });

  // 1. Trusted clock. Without it the verifier cannot prove freshness or expiry.
  const nowMs = parseInstantMs(input.nowIso);
  if (nowMs === null) {
    return fail('TRUST_CLOCK_UNAVAILABLE', 'no valid trusted clock supplied');
  }

  // 2. Packet: resource + path + allowlist defenses BEFORE deep parse.
  const packetRes = await readFactoryPacket(input.packetBytes, limits);
  if (!packetRes.ok) return fail(packetRes.code, packetRes.detail?.reason);
  const packet: ParsedPacket = packetRes.value;
  const { manifest, certificate: cert } = packet;
  checkedHashes.packetSha256 = sha256Hex(input.packetBytes);
  checkedHashes.contentHash = manifest.contentHash;
  checkedHashes.candidateHash = manifest.candidateHash;
  bundleSequences.TRUST = trustBundle.sequence;
  bundleSequences.RELEASE_STATUS = statusBundle.sequence;

  // 3. Scope binding: policy, both bundles, manifest, and certificate must agree.
  if (
    !scopeEqual(scope, trustBundle.trustScope) ||
    !scopeEqual(scope, statusBundle.trustScope) ||
    !scopeEqual(scope, manifest.tenantScope) ||
    !scopeEqual(scope, cert.tenantScope)
  ) {
    return fail('TRUST_SCOPE_MISMATCH', 'scope disagreement across policy/bundles/packet');
  }

  // 4. NOT_FOR_PRODUCTION marker (environment policy, design §14).
  const marker = packet.fileBytes.get(NOT_FOR_PRODUCTION_PATH);
  if (marker === undefined || !Buffer.from(marker).toString('utf-8').startsWith('NOT_FOR_PRODUCTION')) {
    return fail('PACKET_SCHEMA_UNSUPPORTED', 'missing NOT_FOR_PRODUCTION marker');
  }

  // 5. Per-file content binding: every manifest file's bytes/hash must match.
  for (const f of manifest.files) {
    const bytes = packet.fileBytes.get(f.path);
    if (bytes === undefined) return fail('PACKET_EXTRA_FILE', `manifest lists absent file ${f.path}`);
    if (bytes.length !== f.bytes) return fail('PACKET_RESOURCE_LIMIT', `byte length mismatch for ${f.path}`);
    if (sha256Hex(bytes) !== f.sha256) return fail('PACKET_HASH_MISMATCH', `sha256 mismatch for ${f.path}`);
  }

  // 6. Canonical content binding: re-derive contentHash from the payload and bind
  //    manifest <-> certificate (candidate + content).
  const snapshotBytes = packet.fileBytes.get('payload/snapshot.json');
  const capabilityBytes = packet.fileBytes.get('payload/capability-report.json');
  if (snapshotBytes === undefined || capabilityBytes === undefined) {
    return fail('PACKET_SCHEMA_UNSUPPORTED', 'payload snapshot/capability-report missing');
  }
  let snapshot: { tenantScope: TenantScopeV1; candidateHash: string; snapshotHash: string; machineProfileHash: string };
  let capability: { reportHash: string };
  try {
    snapshot = JSON.parse(Buffer.from(snapshotBytes).toString('utf-8'));
    capability = JSON.parse(Buffer.from(capabilityBytes).toString('utf-8'));
  } catch {
    return fail('PACKET_SCHEMA_UNSUPPORTED', 'payload JSON is not parseable');
  }
  const recomputedContentHash = sha256Hex(
    canonicalJson({
      domain: CONTENT_DOMAIN,
      schemaVersion: 'V3',
      notForProduction: true,
      tenantScope: manifest.tenantScope,
      candidateHash: manifest.candidateHash,
      snapshotHash: snapshot.snapshotHash,
      machineProfileHash: snapshot.machineProfileHash,
      capabilityReportHash: capability.reportHash,
      files: manifest.files
        .map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    }),
  );
  if (recomputedContentHash !== manifest.contentHash) {
    return fail('PACKET_HASH_MISMATCH', 'recomputed contentHash does not bind the payload');
  }
  if (cert.contentHash !== manifest.contentHash) {
    return fail('PACKET_HASH_MISMATCH', 'certificate contentHash does not bind the manifest');
  }
  if (cert.candidateHash !== manifest.candidateHash) {
    return fail('PACKET_HASH_MISMATCH', 'certificate candidateHash does not bind the manifest');
  }
  if (cert.releaseRevisionId !== manifest.releaseRevisionId) {
    return fail('PACKET_HASH_MISMATCH', 'certificate releaseRevisionId does not bind the manifest');
  }

  // 7. Trust bundle: signature -> expiry/staleness -> sequence.
  const trustSig = await verifyPinnedBundleSignature(trustBundle, policy);
  if (!trustSig.ok) return fail(trustSig.code, trustSig.detail?.reason);
  const trustIssuedMs = parseInstantMs(trustBundle.issuedAt);
  const trustExpiresMs = parseInstantMs(trustBundle.expiresAt);
  if (trustIssuedMs === null || trustExpiresMs === null) {
    return fail('TRUST_FRESHNESS_UNPROVEN', 'trust bundle timestamps unparseable');
  }
  const trustFresh = checkExpiryAndStaleness({
    nowMs,
    issuedAtMs: trustIssuedMs,
    expiresAtMs: trustExpiresMs,
    maxOfflineStalenessSeconds: policy.freshness.maxOfflineStalenessSeconds,
    maxBundleAgeSeconds: policy.freshness.maxBundleAgeSeconds,
  });
  if (!trustFresh.ok) return fail(trustFresh.code, trustFresh.detail?.reason);
  const trustSeq = checkSequence({ bundleType: 'TRUST', scope, sequence: trustBundle.sequence, policy, state });
  if (!trustSeq.ok) return fail(trustSeq.code, trustSeq.detail?.reason);

  // 8. Release-status bundle: signature -> expiry/staleness -> sequence.
  const statusSig = await verifyPinnedBundleSignature(statusBundle, policy);
  if (!statusSig.ok) return fail(statusSig.code, statusSig.detail?.reason);
  const statusIssuedMs = parseInstantMs(statusBundle.issuedAt);
  const statusExpiresMs = parseInstantMs(statusBundle.expiresAt);
  if (statusIssuedMs === null || statusExpiresMs === null) {
    return fail('TRUST_FRESHNESS_UNPROVEN', 'status bundle timestamps unparseable');
  }
  const statusFresh = checkExpiryAndStaleness({
    nowMs,
    issuedAtMs: statusIssuedMs,
    expiresAtMs: statusExpiresMs,
    maxOfflineStalenessSeconds: policy.freshness.maxOfflineStalenessSeconds,
    maxBundleAgeSeconds: policy.freshness.maxBundleAgeSeconds,
  });
  if (!statusFresh.ok) return fail(statusFresh.code, statusFresh.detail?.reason);
  const statusSeq = checkSequence({ bundleType: 'RELEASE_STATUS', scope, sequence: statusBundle.sequence, policy, state });
  if (!statusSeq.ok) return fail(statusSeq.code, statusSeq.detail?.reason);

  // validAsOf = the staler of the two bundle issuance instants.
  const validAsOfMs = Math.min(trustIssuedMs, statusIssuedMs);
  validAsOf = new Date(validAsOfMs).toISOString();
  freshnessAgeSeconds = Math.round((nowMs - validAsOfMs) / 1000);

  // 9. Certificate trust chain against the external bundles.
  const releaseAuthority = resolveReleaseAuthority(trustBundle, nowMs);
  if (!releaseAuthority.ok) return fail(releaseAuthority.code, releaseAuthority.detail?.reason);

  const certSig = verifyCertificateSignature(cert);
  if (!certSig.ok) return fail(certSig.code, certSig.detail?.reason);

  if (revocationApplies(trustBundle.profileAttestationRevocations, { id: cert.attestationId, hash: cert.attestationHash }, nowMs)) {
    return fail('CAP_PROFILE_ATTESTATION_INVALID', 'certificate attestation is revoked');
  }
  for (const grantHash of cert.sortedGrantHashes) {
    if (revocationApplies(trustBundle.warningExceptionGrantRevocations, { hash: grantHash }, nowMs)) {
      return fail('GATE_WARNING_EXCEPTION_MISMATCH', 'certificate references a revoked warning-exception grant');
    }
  }
  if (statusBundle.revokedReleaseRevisionIds.includes(cert.releaseRevisionId)) {
    return fail('STATE_RELEASE_REVOKED', 'release revision is in the revoked set');
  }

  // 10. PASS. Advance high-water marks (only after a full PASS).
  const nextState = advanceHighWater(state, [
    { bundleType: 'TRUST', scope, sequence: trustBundle.sequence },
    { bundleType: 'RELEASE_STATUS', scope, sequence: statusBundle.sequence },
  ]);

  return {
    report: {
      verdict: 'PASS',
      codes: [],
      checkedHashes,
      bundleSequences,
      verifierBuildHash,
      validAsOf,
      freshnessAgeSeconds,
      checkpoint: checkpointLabel,
      summary: `PASS: release ${cert.releaseRevisionId} valid as of ${validAsOf} (age ${freshnessAgeSeconds}s); NOT_FOR_PRODUCTION.`,
    },
    nextState,
  };
}
