/**
 * verify.test.ts - Corpus + independence + cross-implementation proof for the
 * standalone independent FactoryPacket V3 verifier (plan Task 10, design §14).
 *
 * This suite is the specification. It proves:
 *
 *  1. CORPUS  - the committed valid-minimal vector PASSes, and every mutation
 *     (path traversal, duplicate path, unknown extra file, corrupt hash, bundle
 *     signature mutation, certificate signature mutation, wrong key purpose,
 *     scope mismatch, expired bundle, stale-but-unexpired bundle, revoked release,
 *     revoked profile attestation, revoked warning-exception grant, zip-bomb ratio,
 *     oversize file, oversize total, untrusted clock, missing checkpoint, sequence
 *     rollback) FAILs with its specified stable reason code.
 *
 *  2. INDEPENDENCE - the verifier's resolved import graph never enters
 *     `server/src`, `src/factory/packet`, or `src/core/manufacturing`, and the
 *     boundary scanner actually catches a deliberately bad import (positive
 *     control). The canonical JSON is reimplemented here from the protocol text
 *     and reproduces the builder's committed bytes byte-for-byte.
 *
 *  3. REAL ED25519 - the @noble/ed25519 verification path is exercised end-to-end
 *     through verify() with an EPHEMERAL keypair generated at test time (never
 *     committed), proving the real-signature capability while the committed shadow
 *     vectors use the deterministic NOT_FOR_PRODUCTION scheme with the trust root
 *     pinned in policy.
 *
 * No builder code is imported anywhere. No private key material is committed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed from '@noble/ed25519';

import { canonicalJson, sha256Hex } from './canonical.js';
import { readFactoryPacket } from './packetReader.js';
import { stateKey, bootstrapStateFromCheckpoint, checkSequence } from './freshnessStore.js';
import { verify, verifyEd25519Detached } from './verify.js';
import { DEFAULT_RESOURCE_LIMITS } from './types.js';
import type {
  TenantScopeV1,
  TrustBundleV1,
  ReleaseStatusBundleV1,
  ReleaseCertificateV1,
  VerifierPolicyV1,
  VerifierStateV1,
  VerifierResourceLimits,
} from './types.js';

// ---------------------------------------------------------------------------
// Paths + vector loading
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = HERE;
const VECTOR_DIR = join(HERE, '..', '..', '..', 'test-vectors', 'factory-packet-v3', 'valid-minimal');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(VECTOR_DIR, name), 'utf-8')) as T;
}

const PACKET_BYTES = new Uint8Array(readFileSync(join(VECTOR_DIR, 'packet.zip')));
const TRUST_BUNDLE = loadJson<TrustBundleV1>('trust-bundle.json');
const STATUS_BUNDLE = loadJson<ReleaseStatusBundleV1>('release-status-bundle.json');
const POLICY = loadJson<VerifierPolicyV1>('policy.json');
const CHECKPOINT = loadJson<Record<string, unknown>>('checkpoint.json');
const EXPECTED_PACKET_SHA = readFileSync(join(VECTOR_DIR, 'expected-packet.sha256'), 'utf-8').trim();

const SCOPE: TenantScopeV1 = POLICY.permittedTrustScope;
const FIXED_BUILD_HASH = 'b'.repeat(64);

// A clock 1 hour after both bundles were issued: fresh and unexpired.
const NOW_FRESH = '2026-07-24T01:00:00.000Z';

// ---------------------------------------------------------------------------
// Deep clone + deterministic shadow re-signing (the committed NOT_FOR_PRODUCTION
// scheme). Re-signing lets a mutation isolate a downstream semantic check while
// still passing signature verification - exactly what a real vector generator
// holding the test private key would do. The scheme is KEYLESS by construction
// (a sha256 over the digest), so a test can reproduce it; that is the whole point
// of option (b) - the trust root is enforced by PINNING, not by secret custody.
// ---------------------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const TRUST_BUNDLE_PURPOSE = 'TRUST_BUNDLE';

function shadowSign<T extends { signature: unknown }>(bundle: T, keyId: string): T {
  const { signature: _drop, ...unsigned } = bundle as Record<string, unknown>;
  const digest = sha256Hex(canonicalJson(unsigned));
  const sig = createHash('sha256').update(`${digest}|${keyId}|${TRUST_BUNDLE_PURPOSE}`).digest('base64');
  return { ...(bundle as Record<string, unknown>), signature: { alg: 'ed25519', keyId, sig } } as T;
}

const PINNED_KEY_ID = POLICY.pinnedTrustBundleKey.keyId;

// ---------------------------------------------------------------------------
// Minimal store-only ZIP writer (test-only; the standard ZIP format, not builder
// code). Correct CRC-32 + sizes so yauzl reads it. Used to assemble mutated
// packets from the committed payload bytes.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface RawZipEntry {
  path: string;
  bytes: Uint8Array;
  method?: number; // 0 store (default), 8 deflate
  declaredUncompressed?: number; // override central-dir uncompressed size (bomb test)
  compressed?: Uint8Array; // pre-deflated payload for method 8
}

function buildZip(entries: RawZipEntry[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 0;
    const nameBuf = Buffer.from(e.path, 'utf-8');
    const stored = method === 8 ? Buffer.from(e.compressed ?? deflateRawSync(Buffer.from(e.bytes))) : Buffer.from(e.bytes);
    const crc = crc32(e.bytes);
    const uncompressed = e.declaredUncompressed ?? e.bytes.length;
    const compressed = stored.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressed, 18);
    lh.writeUInt32LE(uncompressed, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, stored);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressed, 20);
    ch.writeUInt32LE(uncompressed, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, nameBuf]));
    offset += 30 + nameBuf.length + stored.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  return new Uint8Array(Buffer.concat([...local, ...central, eocd]));
}

// The committed packet's raw entries (path -> bytes), read through OUR reader.
let GOLDEN_ENTRIES: { path: string; bytes: Uint8Array }[] = [];
async function goldenEntries(): Promise<{ path: string; bytes: Uint8Array }[]> {
  if (GOLDEN_ENTRIES.length === 0) {
    const r = await readFactoryPacket(PACKET_BYTES, DEFAULT_RESOURCE_LIMITS);
    if (!r.ok) throw new Error(`golden packet unreadable: ${r.code}`);
    GOLDEN_ENTRIES = r.value.rawEntries.map((e) => ({ path: e.path, bytes: e.bytes }));
  }
  return GOLDEN_ENTRIES.map((e) => ({ path: e.path, bytes: new Uint8Array(e.bytes) }));
}

function entryBytes(entries: { path: string; bytes: Uint8Array }[], path: string): Uint8Array {
  const e = entries.find((x) => x.path === path);
  if (!e) throw new Error(`missing entry ${path}`);
  return e.bytes;
}
function replaceEntry(
  entries: { path: string; bytes: Uint8Array }[],
  path: string,
  bytes: Uint8Array,
): { path: string; bytes: Uint8Array }[] {
  return entries.map((e) => (e.path === path ? { path, bytes } : e));
}
function certOf(entries: { path: string; bytes: Uint8Array }[]): ReleaseCertificateV1 {
  return JSON.parse(Buffer.from(entryBytes(entries, 'release-certificate.json')).toString('utf-8'));
}
function certBytes(cert: ReleaseCertificateV1): Uint8Array {
  return new Uint8Array(Buffer.from(canonicalJson(cert), 'utf-8'));
}

// ---------------------------------------------------------------------------
// State fixtures
// ---------------------------------------------------------------------------

function stateWithCheckpoint(): VerifierStateV1 {
  return bootstrapStateFromCheckpoint(CHECKPOINT);
}
function noCheckpoint(): VerifierStateV1 {
  return { bootstrapCheckpoint: {}, highWaterMarks: {} };
}
function stateAtSequence(seq: number): VerifierStateV1 {
  return {
    bootstrapCheckpoint: {
      [stateKey('TRUST', SCOPE)]: 1,
      [stateKey('RELEASE_STATUS', SCOPE)]: 1,
    },
    highWaterMarks: {
      [stateKey('TRUST', SCOPE)]: seq,
      [stateKey('RELEASE_STATUS', SCOPE)]: seq,
    },
  };
}

// ---------------------------------------------------------------------------
// The single verify entry the corpus drives
// ---------------------------------------------------------------------------

interface RunOverrides {
  packetBytes?: Uint8Array;
  trustBundle?: TrustBundleV1;
  statusBundle?: ReleaseStatusBundleV1;
  policy?: VerifierPolicyV1;
  state?: VerifierStateV1;
  nowIso?: string | null;
  limits?: VerifierResourceLimits;
}

async function run(o: RunOverrides = {}) {
  return verify({
    packetBytes: o.packetBytes ?? PACKET_BYTES,
    trustBundle: o.trustBundle ?? TRUST_BUNDLE,
    statusBundle: o.statusBundle ?? STATUS_BUNDLE,
    policy: o.policy ?? POLICY,
    state: o.state ?? stateWithCheckpoint(),
    nowIso: o.nowIso === undefined ? NOW_FRESH : o.nowIso,
    verifierBuildHash: FIXED_BUILD_HASH,
    limits: o.limits ?? DEFAULT_RESOURCE_LIMITS,
  });
}

// ===========================================================================
// 1. VALID corpus - the committed vector PASSes
// ===========================================================================

describe('valid-minimal', () => {
  it('PASSes with a bootstrap checkpoint', async () => {
    const { report, nextState } = await run();
    expect(report.verdict).toBe('PASS');
    expect(report.codes).toEqual([]);
    expect(report.validAsOf).toBe('2026-07-24T00:00:00.000Z');
    expect(report.checkpoint).not.toBeNull();
    expect(report.verifierBuildHash).toBe(FIXED_BUILD_HASH);
    // High-water marks advance only after a full PASS.
    expect(nextState).not.toBeNull();
    expect(nextState!.highWaterMarks[stateKey('TRUST', SCOPE)]).toBe(1);
    expect(nextState!.highWaterMarks[stateKey('RELEASE_STATUS', SCOPE)]).toBe(1);
  });

  it('reports checked hashes and bundle sequences', async () => {
    const { report } = await run();
    expect(report.checkedHashes.packetSha256).toBe(EXPECTED_PACKET_SHA);
    expect(report.bundleSequences.TRUST).toBe(1);
    expect(report.bundleSequences.RELEASE_STATUS).toBe(1);
    expect(report.freshnessAgeSeconds).toBe(3600);
  });
});

// ===========================================================================
// 2. MUTATION corpus - each FAILs with its specified stable code
// ===========================================================================

async function packetFrom(entries: { path: string; bytes: Uint8Array }[]) {
  return buildZip(entries.map((e) => ({ path: e.path, bytes: e.bytes })));
}

describe('mutation corpus', () => {
  it('re-packed valid packet still PASSes (harness sanity)', async () => {
    const entries = await goldenEntries();
    const { report } = await run({ packetBytes: await packetFrom(entries) });
    expect(report.verdict).toBe('PASS');
  });

  it('path traversal -> PACKET_EXTRA_FILE', async () => {
    const entries = await goldenEntries();
    entries.push({ path: '../evil.txt', bytes: new Uint8Array([1, 2, 3]) });
    const { report } = await run({ packetBytes: await packetFrom(entries) });
    expect(report.verdict).toBe('FAIL');
    expect(report.codes).toEqual(['PACKET_EXTRA_FILE']);
  });

  it('duplicate path -> PACKET_EXTRA_FILE', async () => {
    const entries = await goldenEntries();
    entries.push({ path: 'manifest.json', bytes: entryBytes(entries, 'manifest.json') });
    const { report } = await run({ packetBytes: await packetFrom(entries) });
    expect(report.codes).toEqual(['PACKET_EXTRA_FILE']);
  });

  it('unknown extra file -> PACKET_EXTRA_FILE', async () => {
    const entries = await goldenEntries();
    entries.push({ path: 'payload/extra.json', bytes: new Uint8Array(Buffer.from('{}')) });
    const { report } = await run({ packetBytes: await packetFrom(entries) });
    expect(report.codes).toEqual(['PACKET_EXTRA_FILE']);
  });

  it('missing manifest-listed file -> PACKET_EXTRA_FILE', async () => {
    const entries = (await goldenEntries()).filter((e) => e.path !== 'payload/snapshot.json');
    const { report } = await run({ packetBytes: await packetFrom(entries) });
    expect(report.codes).toEqual(['PACKET_EXTRA_FILE']);
  });

  it('corrupt hash -> PACKET_HASH_MISMATCH', async () => {
    const entries = await goldenEntries();
    const snap = new Uint8Array(entryBytes(entries, 'payload/snapshot.json'));
    snap[snap.length - 1] ^= 0x01; // flip one byte; length unchanged
    const { report } = await run({ packetBytes: await packetFrom(replaceEntry(entries, 'payload/snapshot.json', snap)) });
    expect(report.codes).toEqual(['PACKET_HASH_MISMATCH']);
  });

  it('zip-bomb ratio -> PACKET_RESOURCE_LIMIT', async () => {
    // One deflate entry declaring a huge uncompressed size over a tiny payload.
    const bomb = buildZip([
      { path: 'manifest.json', bytes: new Uint8Array(1024), method: 8, declaredUncompressed: 500_000_000 },
    ]);
    const { report } = await run({ packetBytes: bomb });
    expect(report.codes).toEqual(['PACKET_RESOURCE_LIMIT']);
  });

  it('oversize file -> PACKET_RESOURCE_LIMIT', async () => {
    const limits: VerifierResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, maxFileBytes: 100 };
    const { report } = await run({ limits });
    expect(report.codes).toEqual(['PACKET_RESOURCE_LIMIT']);
  });

  it('oversize total -> PACKET_RESOURCE_LIMIT', async () => {
    const limits: VerifierResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, maxTotalUncompressedBytes: 500 };
    const { report } = await run({ limits });
    expect(report.codes).toEqual(['PACKET_RESOURCE_LIMIT']);
  });

  it('bundle signature mutation -> CRYPTO_SIGNATURE_INVALID', async () => {
    const bundle = clone(TRUST_BUNDLE);
    // Flip a base64 char in the signature.
    bundle.signature.sig = bundle.signature.sig[0] === 'A' ? 'B' + bundle.signature.sig.slice(1) : 'A' + bundle.signature.sig.slice(1);
    const { report } = await run({ trustBundle: bundle });
    expect(report.codes).toEqual(['CRYPTO_SIGNATURE_INVALID']);
  });

  it('certificate signature mutation -> CRYPTO_SIGNATURE_INVALID', async () => {
    const entries = await goldenEntries();
    const cert = certOf(entries);
    cert.signature.sig = Buffer.alloc(64, 0x01).toString('base64'); // no longer the zero dev marker
    const { report } = await run({ packetBytes: await packetFrom(replaceEntry(entries, 'release-certificate.json', certBytes(cert))) });
    expect(report.codes).toEqual(['CRYPTO_SIGNATURE_INVALID']);
  });

  it('wrong key purpose -> CRYPTO_ALGORITHM_DENIED', async () => {
    const bundle = clone(TRUST_BUNDLE);
    // Relabel the RELEASE key so no valid RELEASE authority remains, then re-sign.
    for (const k of bundle.trustedKeys) if (k.purpose === 'RELEASE') k.purpose = 'PROFILE_ATTESTATION';
    const { report } = await run({ trustBundle: shadowSign(bundle, PINNED_KEY_ID) });
    expect(report.codes).toEqual(['CRYPTO_ALGORITHM_DENIED']);
  });

  it('scope mismatch -> TRUST_SCOPE_MISMATCH', async () => {
    const policy = clone(POLICY);
    policy.permittedTrustScope.siteId = 'site-999';
    const { report } = await run({ policy });
    expect(report.codes).toEqual(['TRUST_SCOPE_MISMATCH']);
  });

  it('expired bundle -> TRUST_BUNDLE_EXPIRED', async () => {
    const { report } = await run({ nowIso: '2026-09-01T00:00:00.000Z' });
    expect(report.codes).toEqual(['TRUST_BUNDLE_EXPIRED']);
  });

  it('stale-but-unexpired bundle -> TRUST_FRESHNESS_UNPROVEN', async () => {
    // 2 days after issuance (> 86400s staleness) but before the 30-day expiry.
    const { report } = await run({ nowIso: '2026-07-26T00:00:01.000Z' });
    expect(report.codes).toEqual(['TRUST_FRESHNESS_UNPROVEN']);
  });

  it('revoked release revision -> STATE_RELEASE_REVOKED', async () => {
    const status = clone(STATUS_BUNDLE);
    status.revokedReleaseRevisionIds = [...status.revokedReleaseRevisionIds, 'rr-000000000000000000000001'];
    const { report } = await run({ statusBundle: shadowSign(status, PINNED_KEY_ID) });
    expect(report.codes).toEqual(['STATE_RELEASE_REVOKED']);
  });

  it('revoked profile attestation -> CAP_PROFILE_ATTESTATION_INVALID', async () => {
    const entries = await goldenEntries();
    const cert = certOf(entries);
    const rev = TRUST_BUNDLE.profileAttestationRevocations[0];
    cert.attestationId = rev.id;
    cert.attestationHash = rev.hash;
    const { report } = await run({ packetBytes: await packetFrom(replaceEntry(entries, 'release-certificate.json', certBytes(cert))) });
    expect(report.codes).toEqual(['CAP_PROFILE_ATTESTATION_INVALID']);
  });

  it('revoked warning-exception grant -> GATE_WARNING_EXCEPTION_MISMATCH', async () => {
    const entries = await goldenEntries();
    const cert = certOf(entries);
    cert.sortedGrantHashes = [TRUST_BUNDLE.warningExceptionGrantRevocations[0].hash];
    const { report } = await run({ packetBytes: await packetFrom(replaceEntry(entries, 'release-certificate.json', certBytes(cert))) });
    expect(report.codes).toEqual(['GATE_WARNING_EXCEPTION_MISMATCH']);
  });

  it('untrusted / unavailable clock -> TRUST_CLOCK_UNAVAILABLE', async () => {
    const { report } = await run({ nowIso: null });
    expect(report.codes).toEqual(['TRUST_CLOCK_UNAVAILABLE']);
    const bad = await run({ nowIso: 'not-a-timestamp' });
    expect(bad.report.codes).toEqual(['TRUST_CLOCK_UNAVAILABLE']);
  });

  it('missing bootstrap checkpoint on first use -> TRUST_CHECKPOINT_REQUIRED', async () => {
    const { report } = await run({ state: noCheckpoint() });
    expect(report.codes).toEqual(['TRUST_CHECKPOINT_REQUIRED']);
  });

  it('sequence rollback below high-water mark -> TRUST_SEQUENCE_ROLLBACK', async () => {
    const { report } = await run({ state: stateAtSequence(10) });
    expect(report.codes).toEqual(['TRUST_SEQUENCE_ROLLBACK']);
  });

  it('a FAIL never advances the high-water marks', async () => {
    const { nextState } = await run({ state: stateAtSequence(10) });
    expect(nextState).toBeNull();
  });
});

// ===========================================================================
// 3. CROSS-IMPLEMENTATION canonical agreement (independence, positive proof)
// ===========================================================================

describe('cross-implementation canonical agreement', () => {
  it('reproduces the builder-committed payload bytes byte-for-byte', async () => {
    const entries = await goldenEntries();
    for (const name of ['manifest.json', 'payload/capability-report.json', 'payload/snapshot.json', 'release-certificate.json']) {
      const raw = Buffer.from(entryBytes(entries, name));
      const parsed = JSON.parse(raw.toString('utf-8'));
      const mine = Buffer.from(canonicalJson(parsed), 'utf-8');
      expect(mine.equals(raw)).toBe(true);
    }
  });

  it('reproduces the committed bundle signatures under the pinned deterministic scheme', () => {
    for (const b of [TRUST_BUNDLE, STATUS_BUNDLE] as Array<{ signature: { keyId: string; sig: string } }>) {
      const { signature, ...unsigned } = b as Record<string, unknown> & { signature: { keyId: string; sig: string } };
      const digest = sha256Hex(canonicalJson(unsigned));
      const expected = createHash('sha256').update(`${digest}|${signature.keyId}|TRUST_BUNDLE`).digest('base64');
      expect(signature.sig).toBe(expected);
    }
  });

  it('re-hashes the committed packet to the golden sha256', () => {
    expect(sha256Hex(PACKET_BYTES)).toBe(EXPECTED_PACKET_SHA);
  });
});

// ===========================================================================
// 4. INDEPENDENCE - import-boundary scanner + positive control
// ===========================================================================

const FORBIDDEN_TREES = ['server/src', 'src/factory/packet', 'src/core/manufacturing'];
const ALLOWED_BARE = new Set([
  '@noble/ed25519',
  'yauzl',
  'vitest',
  'node:fs',
  'node:crypto',
  'node:zlib',
  'node:path',
  'node:url',
]);

function extractImportSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/** Flag any specifier that escapes this workspace or is not an allowed dependency. */
function forbiddenImports(filePath: string, source: string): string[] {
  const bad: string[] = [];
  for (const spec of extractImportSpecifiers(source)) {
    const s = spec.replace(/\\/g, '/');
    if (FORBIDDEN_TREES.some((t) => s.includes(t))) {
      bad.push(spec);
      continue;
    }
    if (s.startsWith('.')) {
      // A relative import must stay inside this workspace's src tree.
      const resolved = join(dirname(filePath), s).replace(/\\/g, '/');
      if (!resolved.includes('/factory-packet-verifier/')) bad.push(spec);
      continue;
    }
    // Bare specifier: must be an allowlisted dependency or node builtin.
    const bareRoot = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
    if (!ALLOWED_BARE.has(s) && !ALLOWED_BARE.has(bareRoot) && !s.startsWith('node:')) bad.push(spec);
  }
  return bad;
}

describe('dependency independence', () => {
  it('no verifier source imports builder code or escapes the workspace', () => {
    // Scan the SHIPPED production modules only. Test files legitimately carry
    // forbidden import strings as data (the positive control below), and are never
    // part of the graph the CLI/`dist` loads.
    const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const offenders: Record<string, string[]> = {};
    for (const f of files) {
      const bad = forbiddenImports(join(SRC_DIR, f), readFileSync(join(SRC_DIR, f), 'utf-8'));
      if (bad.length > 0) offenders[f] = bad;
    }
    expect(offenders).toEqual({});
  });

  it('the scanner CATCHES a deliberately bad import (positive control)', () => {
    const evil = `import { canonicalJson } from '../../../server/src/trust-kernel/canonical/canonicalJson.js';`;
    expect(forbiddenImports(join(SRC_DIR, 'evil.ts'), evil)).toContain(
      '../../../server/src/trust-kernel/canonical/canonicalJson.js',
    );
    const escape = `import x from '../../other-tool/src/x.js';`;
    expect(forbiddenImports(join(SRC_DIR, 'evil.ts'), escape).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. REAL Ed25519 - exercised end-to-end with an EPHEMERAL keypair (never committed)
// ===========================================================================

describe('real Ed25519 verification (ephemeral keypair, never committed)', () => {
  it('verifyEd25519Detached accepts a real signature and rejects tampering', async () => {
    const priv = ed.utils.randomSecretKey ? ed.utils.randomSecretKey() : (ed as unknown as { utils: { randomPrivateKey(): Uint8Array } }).utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const msg = new TextEncoder().encode('MONOLITH real-signature smoke test');
    const sig = await ed.signAsync(msg, priv);
    const pubHex = Buffer.from(pub).toString('hex');
    const sigB64 = Buffer.from(sig).toString('base64');
    expect(await verifyEd25519Detached(pubHex, msg, sigB64)).toBe(true);
    const tampered = Buffer.from(sig);
    tampered[0] ^= 0x01;
    expect(await verifyEd25519Detached(pubHex, msg, tampered.toString('base64'))).toBe(false);
  });

  it('verify() drives the real Ed25519 branch when policy pins a real public key', async () => {
    const priv = ed.utils.randomSecretKey ? ed.utils.randomSecretKey() : (ed as unknown as { utils: { randomPrivateKey(): Uint8Array } }).utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const pubHex = Buffer.from(pub).toString('hex');

    // Re-sign both bundles with a REAL Ed25519 signature over their canonical bytes,
    // and pin the real public key in policy. The deterministic shadow scheme is NOT
    // used here - this exercises the @noble verification path inside verify().
    async function realSign<T extends { signature: unknown }>(bundle: T): Promise<T> {
      const { signature: _d, ...unsigned } = bundle as Record<string, unknown>;
      const msg = new TextEncoder().encode(canonicalJson(unsigned));
      const sig = await ed.signAsync(msg, priv);
      return { ...(bundle as Record<string, unknown>), signature: { alg: 'ed25519', keyId: PINNED_KEY_ID, sig: Buffer.from(sig).toString('base64') } } as T;
    }
    const policy = clone(POLICY);
    policy.pinnedTrustBundleKey.publicKeyHex = pubHex;
    const { report } = await run({
      trustBundle: await realSign(TRUST_BUNDLE),
      statusBundle: await realSign(STATUS_BUNDLE),
      policy,
    });
    expect(report.verdict).toBe('PASS');

    // A tampered real signature must fail.
    const badPolicy = clone(POLICY);
    badPolicy.pinnedTrustBundleKey.publicKeyHex = pubHex;
    const good = await realSign(TRUST_BUNDLE);
    const badBytes = Buffer.from(good.signature.sig, 'base64');
    badBytes[0] ^= 0x01;
    good.signature.sig = badBytes.toString('base64');
    const { report: badReport } = await run({ trustBundle: good, policy: badPolicy });
    expect(badReport.codes).toEqual(['CRYPTO_SIGNATURE_INVALID']);
  });
});

// ===========================================================================
// 6. HARDENING MUTATIONS (Phase-Gate-C findings C5–C8) — bind the cert to the
//    resolved RELEASE authority, never crash on a hostile payload, bind the
//    packet-hash sentinel, and cross-check the snapshot's embedded identity.
// ===========================================================================

const CONTENT_DOMAIN = 'MONOLITH/FactoryPacketContent/V3';
const EXPECTED_PACKET_HASH_SENTINEL = sha256Hex(
  'MONOLITH/NOT_FOR_PRODUCTION/expectedPacketHash-set-by-task8-worker',
);

interface ManifestShape {
  tenantScope: TenantScopeV1;
  candidateHash: string;
  contentHash: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  [k: string]: unknown;
}

function manifestOf(entries: { path: string; bytes: Uint8Array }[]): ManifestShape {
  return JSON.parse(Buffer.from(entryBytes(entries, 'manifest.json')).toString('utf-8'));
}
function bytesOfJson(obj: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(canonicalJson(obj), 'utf-8'));
}
function rebindFileEntry(manifest: ManifestShape, filePath: string, bytes: Uint8Array): void {
  const entry = manifest.files.find((f) => f.path === filePath);
  if (!entry) throw new Error(`manifest has no file ${filePath}`);
  entry.sha256 = sha256Hex(bytes);
  entry.bytes = bytes.length;
}
function computeContentHash(
  manifest: ManifestShape,
  snapshot: { snapshotHash: string; machineProfileHash: string },
  capability: { reportHash: string },
): string {
  return sha256Hex(
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
}

/**
 * Reseal a packet after mutating the snapshot and/or certificate: reserialize the
 * mutated snapshot, rebind its manifest file digest, recompute the manifest+cert
 * contentHash so the ONLY remaining discrepancy is the injected one, and repack. A
 * real vector generator holding the test private key would do exactly this.
 */
async function reseal(
  entries: { path: string; bytes: Uint8Array }[],
  opts: {
    mutateSnapshot?: (s: Record<string, unknown>) => void;
    mutateCert?: (c: ReleaseCertificateV1) => void;
  } = {},
): Promise<Uint8Array> {
  let next = entries.map((e) => ({ path: e.path, bytes: e.bytes }));
  const manifest = manifestOf(next);
  const snapshot = JSON.parse(Buffer.from(entryBytes(next, 'payload/snapshot.json')).toString('utf-8'));
  const capability = JSON.parse(Buffer.from(entryBytes(next, 'payload/capability-report.json')).toString('utf-8'));
  const cert = certOf(next);

  if (opts.mutateSnapshot) opts.mutateSnapshot(snapshot);
  const snapBytes = bytesOfJson(snapshot);
  next = replaceEntry(next, 'payload/snapshot.json', snapBytes);
  rebindFileEntry(manifest, 'payload/snapshot.json', snapBytes);

  manifest.contentHash = computeContentHash(manifest, snapshot, capability);
  cert.contentHash = manifest.contentHash;
  if (opts.mutateCert) opts.mutateCert(cert);

  next = replaceEntry(next, 'manifest.json', bytesOfJson(manifest));
  next = replaceEntry(next, 'release-certificate.json', certBytes(cert));
  return packetFrom(next);
}

describe('C5 — the certificate is bound to the resolved RELEASE authority', () => {
  it('reseal harness sanity: an identity reseal still PASSes', async () => {
    const { report } = await run({ packetBytes: await reseal(await goldenEntries()) });
    expect(report.verdict).toBe('PASS');
  });

  it('a cert signed by an unrelated dev-* keyId FAILs (not just any dev- marker)', async () => {
    const entries = await goldenEntries();
    const packet = await reseal(entries, {
      mutateCert: (c) => {
        c.signerKeyId = 'dev-attacker-9999';
        c.signature.keyId = 'dev-attacker-9999';
        // keep the zero-byte dev marker signature (the shadow scheme)
      },
    });
    const { report } = await run({ packetBytes: packet });
    expect(report.verdict).toBe('FAIL');
    expect(report.codes).toEqual(['CRYPTO_SIGNATURE_INVALID']);
  });
});

describe('C6 — a hostile payload yields a stable FAIL, never an uncaught crash', () => {
  it('a {} capability-report (with a rebound manifest digest) FAILs with a code', async () => {
    const entries = await goldenEntries();
    const manifest = manifestOf(entries);
    const emptyCap = new Uint8Array(Buffer.from('{}', 'utf-8'));
    rebindFileEntry(manifest, 'payload/capability-report.json', emptyCap);
    let next = replaceEntry(entries, 'payload/capability-report.json', emptyCap);
    next = replaceEntry(next, 'manifest.json', bytesOfJson(manifest));
    // verify() must RESOLVE to a FAIL verdict, not reject with an uncaught throw.
    const outcome = await run({ packetBytes: await packetFrom(next) });
    expect(outcome.report.verdict).toBe('FAIL');
    expect(['PACKET_SCHEMA_UNSUPPORTED', 'PACKET_HASH_MISMATCH']).toContain(outcome.report.codes[0]);
  });

  it('a snapshot missing snapshotHash FAILs with a code (no crash)', async () => {
    const entries = await goldenEntries();
    const manifest = manifestOf(entries);
    const snapshot = JSON.parse(Buffer.from(entryBytes(entries, 'payload/snapshot.json')).toString('utf-8'));
    delete snapshot.snapshotHash;
    const snapBytes = bytesOfJson(snapshot);
    rebindFileEntry(manifest, 'payload/snapshot.json', snapBytes);
    let next = replaceEntry(entries, 'payload/snapshot.json', snapBytes);
    next = replaceEntry(next, 'manifest.json', bytesOfJson(manifest));
    const outcome = await run({ packetBytes: await packetFrom(next) });
    expect(outcome.report.verdict).toBe('FAIL');
    expect(['PACKET_SCHEMA_UNSUPPORTED', 'PACKET_HASH_MISMATCH']).toContain(outcome.report.codes[0]);
  });
});

describe('C7 — expectedPacketHash is bound to the documented sentinel, not ignored', () => {
  it('a cert whose expectedPacketHash is not the sentinel FAILs', async () => {
    const packet = await reseal(await goldenEntries(), {
      mutateCert: (c) => {
        c.expectedPacketHash = 'd'.repeat(64); // valid hex, wrong value
      },
    });
    const { report } = await run({ packetBytes: packet });
    expect(report.verdict).toBe('FAIL');
    expect(report.codes).toEqual(['PACKET_HASH_MISMATCH']);
  });

  it('the golden cert carries exactly the documented sentinel', async () => {
    const cert = certOf(await goldenEntries());
    expect(cert.expectedPacketHash).toBe(EXPECTED_PACKET_HASH_SENTINEL);
  });
});

describe('C8 — the snapshot embedded identity is cross-checked against the manifest', () => {
  it('a snapshot.candidateHash that disagrees with the manifest FAILs', async () => {
    const packet = await reseal(await goldenEntries(), {
      mutateSnapshot: (s) => {
        s.candidateHash = 'a'.repeat(64); // differs from manifest.candidateHash
      },
    });
    const { report } = await run({ packetBytes: packet });
    expect(report.verdict).toBe('FAIL');
    expect(report.codes).toEqual(['PACKET_HASH_MISMATCH']);
  });

  it('a snapshot.tenantScope that disagrees with the manifest FAILs', async () => {
    const packet = await reseal(await goldenEntries(), {
      mutateSnapshot: (s) => {
        (s.tenantScope as TenantScopeV1).siteId = 'site-evil';
      },
    });
    const { report } = await run({ packetBytes: packet });
    expect(report.verdict).toBe('FAIL');
    expect(report.codes).toEqual(['TRUST_SCOPE_MISMATCH']);
  });
});

// ===========================================================================
// 7. C17 — an anomalous-high sequence cannot poison the freshness high-water store.
// ===========================================================================

describe('C17 — bounded sequence forward-jump', () => {
  it('a forward jump far beyond the current high-water is rejected', () => {
    const state = stateAtSequence(1); // high-water = 1
    const res = checkSequence({ bundleType: 'TRUST', scope: SCOPE, sequence: 5_000_000, policy: POLICY, state });
    expect(res.ok).toBe(false);
    expect((res as { code?: string }).code).toBe('TRUST_SEQUENCE_ROLLBACK');
  });

  it('a normal forward step is still accepted', () => {
    const state = stateAtSequence(1);
    const res = checkSequence({ bundleType: 'TRUST', scope: SCOPE, sequence: 2, policy: POLICY, state });
    expect(res.ok).toBe(true);
  });

  it('a huge first-use sequence beyond the checkpoint floor is rejected', () => {
    const state: VerifierStateV1 = {
      bootstrapCheckpoint: { [stateKey('TRUST', SCOPE)]: 1 },
      highWaterMarks: {},
    };
    const res = checkSequence({ bundleType: 'TRUST', scope: SCOPE, sequence: 9_000_000, policy: POLICY, state });
    expect(res.ok).toBe(false);
    expect((res as { code?: string }).code).toBe('TRUST_SEQUENCE_ROLLBACK');
  });
});
