/**
 * packetV3.determinism.test.ts - Task 7 deterministic FactoryPacket V3 suite
 *
 * Byte-for-byte reproducibility is the whole point of the builder (design §11.1,
 * §16.2). A nondeterministic build is a failure even if every logical assertion
 * passes, so this suite treats the pinned golden bytes as the contract:
 *
 *  - the same logical release rebuilt ~100x yields ONE sha256 and one byte string
 *  - permuting input key/array order yields identical bytes
 *  - Unicode names/content and Windows/POSIX paths normalize to identical bytes
 *  - the committed golden packet.zip / expected-packet.sha256 / expected-manifest.json
 *    are compared byte-for-byte; a NORMAL run FAILS on any drift and never rewrites
 *    the vector. Regeneration happens ONLY under UPDATE_TRUST_VECTORS=1.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex, computeReleaseAuthorizationHash } from '../canonical/hash.js';
import type { TrustResult } from '../result.js';
import type {
  CapabilityReportV1,
  ReleaseCertificateV1,
  TenantScopeV1,
} from '../contracts/protocolV3.js';
import {
  buildReleaseSnapshot,
  type ReleaseSnapshotInputV3,
} from '../snapshot/buildReleaseSnapshot.js';
import { buildUnsignedPayloadV3 } from '../packet/buildUnsignedPayloadV3.js';
import {
  packageFactoryPacketV3,
  buildFactoryManifestV3,
  FACTORY_PACKET_V3_ALLOWLIST,
} from '../packet/packageFactoryPacketV3.js';
import {
  buildFixedZip,
  listZipPaths,
  readFixedZip,
  ZipProfileError,
  type ZipEntry,
} from '../packet/fixedZipProfile.js';

// ---------------------------------------------------------------------------
// Golden-vector locations (worktree_root/test-vectors/factory-packet-v3/...)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTOR_ROOT = join(__dirname, '..', '..', '..', '..', 'test-vectors', 'factory-packet-v3');
const VALID_MINIMAL = join(VECTOR_ROOT, 'valid-minimal');
const INPUT_JSON = join(VALID_MINIMAL, 'input.json');
const EXPECTED_MANIFEST = join(VALID_MINIMAL, 'expected-manifest.json');
const PACKET_ZIP = join(VALID_MINIMAL, 'packet.zip');
const EXPECTED_SHA = join(VALID_MINIMAL, 'expected-packet.sha256');
const MUTATIONS_INDEX = join(VECTOR_ROOT, 'mutations', 'index.json');

const UPDATE = process.env.UPDATE_TRUST_VECTORS === '1';

// ---------------------------------------------------------------------------
// The one canonical fixture. `input.json` is generated FROM this under UPDATE
// mode so the committed vector and this constant can never silently diverge.
// ---------------------------------------------------------------------------

const TENANT_SCOPE: TenantScopeV1 = {
  tenantId: 'tenant-001',
  orgId: 'org-monolith',
  siteId: 'site-001',
  policyVersion: 'policy-2026.07',
};

const CANDIDATE_HASH = sha256Hex('MONOLITH/fixture/candidate/wr-0001');
const MACHINE_PROFILE_HASH = sha256Hex('MONOLITH/fixture/machine-profile/cnc-01');
const ATTESTATION_HASH = sha256Hex('MONOLITH/fixture/attestation/att-0001');
const RELEASE_AUTHORIZATION_HASH = computeReleaseAuthorizationHash(CANDIDATE_HASH, []);
// Set by Task 8's worker over the FINAL bytes (§10.2 step 6). The builder treats
// it as an opaque persisted field and never depends on it, so a sentinel here is
// correct and cannot make the embedded certificate self-referential/circular.
const EXPECTED_PACKET_HASH_SENTINEL = sha256Hex(
  'MONOLITH/NOT_FOR_PRODUCTION/expectedPacketHash-set-by-task8-worker',
);

const SNAPSHOT_INPUT: ReleaseSnapshotInputV3 = {
  tenantScope: TENANT_SCOPE,
  workingRevisionId: 'wr-0001',
  candidateHash: CANDIDATE_HASH,
  // Deliberately UNSORTED and containing a Unicode ref so the builder's own
  // canonicalization (sort + NFC) is exercised by the golden path.
  contentRefs: [
    'entity/panel/P-002',
    'entity/panel/P-001',
    'operation/drill/OP-010',
    'operation/bore/OP-002',
    'entity/label/ครัว-01',
  ],
  machineProfileHash: MACHINE_PROFILE_HASH,
  policyVersion: 'policy-2026.07',
  profileVersion: 'profile-cnc-01-v3',
};

const CAPABILITY_REPORT: CapabilityReportV1 = {
  reportHash: sha256Hex(
    canonicalJson({
      domain: 'MONOLITH/CapabilityReport/V1',
      machineProfileHash: MACHINE_PROFILE_HASH,
      supported: true,
      evaluatedOperationCount: 2,
      blockers: [],
    }),
  ),
  machineProfileHash: MACHINE_PROFILE_HASH,
  supported: true,
  evaluatedOperationCount: 2,
  blockers: [],
};

/** Certificate minus `contentHash`; the harness binds contentHash at build time. */
const CERTIFICATE_BASE: Omit<ReleaseCertificateV1, 'contentHash'> = {
  releaseRevisionId: 'rr-000000000000000000000001',
  tenantScope: TENANT_SCOPE,
  candidateHash: CANDIDATE_HASH,
  releaseAuthorizationHash: RELEASE_AUTHORIZATION_HASH,
  sortedGrantHashes: [],
  attestationId: 'att-0001',
  attestationHash: ATTESTATION_HASH,
  expectedPacketHash: EXPECTED_PACKET_HASH_SENTINEL,
  signerKeyId: 'dev-release-ed25519-0001',
  algorithm: 'ed25519',
  releaseSequence: 1,
  releasedAt: '1980-01-01T00:00:00.000Z',
  signature: {
    alg: 'ed25519',
    keyId: 'dev-release-ed25519-0001',
    // Fixed dev marker signature (64 zero bytes, base64). Real bytes come from
    // the managed signer in Task 8; this vector only proves packaging determinism.
    sig: Buffer.alloc(64, 0).toString('base64'),
  },
};

interface FixtureInputFile {
  snapshotInput: ReleaseSnapshotInputV3;
  capabilityReport: CapabilityReportV1;
  certificate: ReleaseCertificateV1;
}

function unwrap<T>(r: TrustResult<T>): T {
  // strictNullChecks is off in this package, so `!r.ok` does not narrow the
  // boolean-discriminated union; read the failure code through an explicit cast.
  if (!r.ok) {
    throw new Error(`expected ok result, received failure ${(r as { code: string }).code}`);
  }
  return r.value;
}

/** Build the full packet from a parsed/declared input object. Pure + async. */
async function buildFromInput(input: FixtureInputFile): Promise<{
  packet: Uint8Array;
  manifest: ReturnType<typeof buildFactoryManifestV3>;
}> {
  const snapshot = unwrap(buildReleaseSnapshot(input.snapshotInput));
  const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, input.capabilityReport));
  const packet = await packageFactoryPacketV3(unsigned, input.certificate);
  const manifest = buildFactoryManifestV3(unsigned, input.certificate.releaseRevisionId);
  return { packet, manifest };
}

/** Build the fixture from the in-file constants, binding contentHash into the cert. */
async function buildFixturePacket(): Promise<{
  packet: Uint8Array;
  manifest: ReturnType<typeof buildFactoryManifestV3>;
  certificate: ReleaseCertificateV1;
}> {
  const snapshot = unwrap(buildReleaseSnapshot(SNAPSHOT_INPUT));
  const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, CAPABILITY_REPORT));
  const certificate: ReleaseCertificateV1 = {
    ...CERTIFICATE_BASE,
    contentHash: unsigned.contentHash,
  };
  const packet = await packageFactoryPacketV3(unsigned, certificate);
  const manifest = buildFactoryManifestV3(unsigned, certificate.releaseRevisionId);
  return { packet, manifest, certificate };
}

const MUTATIONS = {
  vectorId: 'factory-packet-v3/valid-minimal',
  description:
    'Negative and permutation cases proving the builder is a pure function of ' +
    'declared bytes + constants and that a normal run rejects any golden drift.',
  cases: [
    {
      id: 'permute-contentRefs',
      kind: 'input-permutation',
      expect: 'identical-bytes',
      detail: 'Reversing snapshotInput.contentRefs must not change any output byte.',
    },
    {
      id: 'permute-object-keys',
      kind: 'input-permutation',
      expect: 'identical-bytes',
      detail: 'Reordering object keys in the tenant scope must not change output.',
    },
    {
      id: 'windows-path-separators',
      kind: 'path-normalization',
      expect: 'identical-bytes',
      detail: 'Backslash zip entry paths normalize to POSIX before packaging.',
    },
    {
      id: 'flip-one-packet-byte',
      kind: 'packet-byte-drift',
      expect: 'sha256-differs',
      detail: 'Flipping a single committed packet byte must change the sha256.',
    },
    {
      id: 'extra-non-allowlisted-file',
      kind: 'allowlist-rejection',
      expect: 'PACKET_EXTRA_FILE',
      detail: 'A file outside the exact allowlist is rejected, never packaged.',
    },
  ],
};

// ===========================================================================
// 1. Byte-determinism (no committed golden required)
// ===========================================================================

describe('FactoryPacket V3 - byte determinism', () => {
  it('produces one sha256 and one byte string across ~100 rebuilds', async () => {
    const runs = await Promise.all(Array.from({ length: 100 }, () => buildFixturePacket()));
    const bytes = runs.map((r) => r.packet);
    const shas = new Set(bytes.map((b) => sha256Hex(b)));
    expect(shas.size).toBe(1);
    expect(bytes.every((b) => Buffer.from(b).equals(Buffer.from(bytes[0])))).toBe(true);
  });

  it('emits zip entries in their own sorted order', async () => {
    const { packet } = await buildFixturePacket();
    const paths = listZipPaths(packet);
    expect(paths).toEqual([...paths].sort());
    // Exactly the allowlist, no more, no less.
    expect(paths).toEqual([...FACTORY_PACKET_V3_ALLOWLIST].sort());
  });

  it('is invariant to snapshot array order (contentRefs permutation)', async () => {
    const a = await buildFixturePacket();
    const permuted: ReleaseSnapshotInputV3 = {
      ...SNAPSHOT_INPUT,
      contentRefs: [...SNAPSHOT_INPUT.contentRefs].reverse(),
    };
    const snapshot = unwrap(buildReleaseSnapshot(permuted));
    const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, CAPABILITY_REPORT));
    const certificate: ReleaseCertificateV1 = { ...CERTIFICATE_BASE, contentHash: unsigned.contentHash };
    const b = await packageFactoryPacketV3(unsigned, certificate);
    expect(Buffer.from(b).equals(Buffer.from(a.packet))).toBe(true);
  });

  it('is invariant to object key order in the tenant scope', async () => {
    const reordered: ReleaseSnapshotInputV3 = {
      ...SNAPSHOT_INPUT,
      tenantScope: {
        policyVersion: TENANT_SCOPE.policyVersion,
        siteId: TENANT_SCOPE.siteId,
        orgId: TENANT_SCOPE.orgId,
        tenantId: TENANT_SCOPE.tenantId,
      },
    };
    const a = await buildFixturePacket();
    const snapshot = unwrap(buildReleaseSnapshot(reordered));
    const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, CAPABILITY_REPORT));
    const certificate: ReleaseCertificateV1 = { ...CERTIFICATE_BASE, contentHash: unsigned.contentHash };
    const b = await packageFactoryPacketV3(unsigned, certificate);
    expect(Buffer.from(b).equals(Buffer.from(a.packet))).toBe(true);
  });

  it('serializes identical empty optional collections identically', async () => {
    const empties: ReleaseSnapshotInputV3 = { ...SNAPSHOT_INPUT, contentRefs: [] };
    const s1 = unwrap(buildReleaseSnapshot(empties));
    const s2 = unwrap(buildReleaseSnapshot({ ...empties, contentRefs: [] }));
    expect(s1.snapshotHash).toBe(s2.snapshotHash);
    const u1 = unwrap(buildUnsignedPayloadV3(s1, CAPABILITY_REPORT));
    const u2 = unwrap(buildUnsignedPayloadV3(s2, CAPABILITY_REPORT));
    expect(u1.contentHash).toBe(u2.contentHash);
  });
});

// ===========================================================================
// 2. fixedZipProfile - normalization, allowlist, and store-only invariants
// ===========================================================================

describe('fixedZipProfile', () => {
  const allowlist = ['a.txt', 'dir/b.txt'] as const;

  it('normalizes Windows separators to POSIX and yields identical bytes', () => {
    const posix: ZipEntry[] = [
      { path: 'a.txt', bytes: Buffer.from('alpha', 'utf-8') },
      { path: 'dir/b.txt', bytes: Buffer.from('beta', 'utf-8') },
    ];
    const windows: ZipEntry[] = [
      { path: 'a.txt', bytes: Buffer.from('alpha', 'utf-8') },
      { path: 'dir\\b.txt', bytes: Buffer.from('beta', 'utf-8') },
    ];
    const z1 = buildFixedZip(posix, allowlist);
    const z2 = buildFixedZip(windows, allowlist);
    expect(Buffer.from(z1).equals(Buffer.from(z2))).toBe(true);
  });

  it('sorts entries regardless of input order', () => {
    const forward = buildFixedZip(
      [
        { path: 'a.txt', bytes: Buffer.from('alpha', 'utf-8') },
        { path: 'dir/b.txt', bytes: Buffer.from('beta', 'utf-8') },
      ],
      allowlist,
    );
    const reversed = buildFixedZip(
      [
        { path: 'dir/b.txt', bytes: Buffer.from('beta', 'utf-8') },
        { path: 'a.txt', bytes: Buffer.from('alpha', 'utf-8') },
      ],
      allowlist,
    );
    expect(Buffer.from(forward).equals(Buffer.from(reversed))).toBe(true);
    expect(listZipPaths(forward)).toEqual(['a.txt', 'dir/b.txt']);
  });

  it('round-trips store-only content byte-for-byte', () => {
    const entries: ZipEntry[] = [
      { path: 'a.txt', bytes: Buffer.from('alpha ครัว', 'utf-8') },
      { path: 'dir/b.txt', bytes: Buffer.from('beta', 'utf-8') },
    ];
    const zip = buildFixedZip(entries, allowlist);
    const back = readFixedZip(zip);
    expect(back.map((e) => e.path)).toEqual(['a.txt', 'dir/b.txt']);
    expect(Buffer.from(back[0].bytes).toString('utf-8')).toBe('alpha ครัว');
  });

  it('rejects a non-allowlisted / extra file with PACKET_EXTRA_FILE', () => {
    const entries: ZipEntry[] = [{ path: 'evil.txt', bytes: Buffer.from('x', 'utf-8') }];
    try {
      buildFixedZip(entries, allowlist);
      throw new Error('expected buildFixedZip to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ZipProfileError);
      expect((e as ZipProfileError).code).toBe('PACKET_EXTRA_FILE');
    }
  });

  it('rejects path traversal and absolute paths', () => {
    for (const bad of ['../escape', '/abs', 'dir/../../x', 'C:/x']) {
      expect(() => buildFixedZip([{ path: bad, bytes: Buffer.from('x') }], [bad])).toThrow(
        ZipProfileError,
      );
    }
  });

  it('rejects a duplicate path', () => {
    const entries: ZipEntry[] = [
      { path: 'a.txt', bytes: Buffer.from('one') },
      { path: 'a.txt', bytes: Buffer.from('two') },
    ];
    expect(() => buildFixedZip(entries, allowlist)).toThrow(ZipProfileError);
  });
});

// ===========================================================================
// 3. buildUnsignedPayloadV3 - manifest content and NOT_FOR_PRODUCTION marker
// ===========================================================================

describe('buildUnsignedPayloadV3', () => {
  it('lists every file with path, bytes, sha256, media type, and artifact class', async () => {
    const snapshot = unwrap(buildReleaseSnapshot(SNAPSHOT_INPUT));
    const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, CAPABILITY_REPORT));
    expect(unsigned.notForProduction).toBe(true);
    for (const f of unsigned.files) {
      expect(typeof f.path).toBe('string');
      expect(f.bytes).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.mediaType.length).toBeGreaterThan(0);
      expect(f.artifactClass.length).toBeGreaterThan(0);
    }
    // The declared payload set carries the NOT_FOR_PRODUCTION marker.
    expect(unsigned.files.some((f) => f.path === 'NOT_FOR_PRODUCTION.txt')).toBe(true);
  });

  it('rejects a capability report bound to a different machine profile', () => {
    const snapshot = unwrap(buildReleaseSnapshot(SNAPSHOT_INPUT));
    const wrong: CapabilityReportV1 = {
      ...CAPABILITY_REPORT,
      machineProfileHash: sha256Hex('some-other-profile'),
    };
    const r = buildUnsignedPayloadV3(snapshot, wrong);
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('CAP_PROFILE_MISMATCH');
  });
});

// ===========================================================================
// 4. packageFactoryPacketV3 - certificate binding
// ===========================================================================

describe('packageFactoryPacketV3', () => {
  it('rejects a certificate not bound to the payload contentHash', async () => {
    const snapshot = unwrap(buildReleaseSnapshot(SNAPSHOT_INPUT));
    const unsigned = unwrap(buildUnsignedPayloadV3(snapshot, CAPABILITY_REPORT));
    const badCert: ReleaseCertificateV1 = {
      ...CERTIFICATE_BASE,
      contentHash: sha256Hex('not-the-content'),
    };
    await expect(packageFactoryPacketV3(unsigned, badCert)).rejects.toBeInstanceOf(ZipProfileError);
  });
});

// ===========================================================================
// 5. Golden vectors - byte-for-byte; NORMAL run fails on drift, never rewrites
// ===========================================================================

describe('FactoryPacket V3 - golden vectors', () => {
  it('materializes or compares the committed golden bytes', async () => {
    const { packet, manifest, certificate } = await buildFixturePacket();
    const sha = sha256Hex(packet);

    if (UPDATE) {
      // Regeneration is gated behind UPDATE_TRUST_VECTORS=1 (plan Step 4).
      mkdirSync(VALID_MINIMAL, { recursive: true });
      mkdirSync(dirname(MUTATIONS_INDEX), { recursive: true });
      const inputFile: FixtureInputFile = {
        snapshotInput: SNAPSHOT_INPUT,
        capabilityReport: CAPABILITY_REPORT,
        certificate,
      };
      writeFileSync(INPUT_JSON, JSON.stringify(inputFile, null, 2) + '\n');
      writeFileSync(EXPECTED_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
      writeFileSync(PACKET_ZIP, packet);
      writeFileSync(EXPECTED_SHA, sha + '\n');
      writeFileSync(MUTATIONS_INDEX, JSON.stringify(MUTATIONS, null, 2) + '\n');
      return;
    }

    // NORMAL run: the goldens MUST already be committed. Missing => hard fail,
    // never silent creation.
    expect(existsSync(PACKET_ZIP)).toBe(true);
    expect(existsSync(EXPECTED_SHA)).toBe(true);
    expect(existsSync(EXPECTED_MANIFEST)).toBe(true);

    const goldenZip = readFileSync(PACKET_ZIP);
    const goldenSha = readFileSync(EXPECTED_SHA, 'utf-8').trim();
    const goldenManifest = JSON.parse(readFileSync(EXPECTED_MANIFEST, 'utf-8'));

    expect(sha).toBe(goldenSha);
    expect(Buffer.from(packet).equals(goldenZip)).toBe(true);
    expect(canonicalJson(manifest)).toBe(canonicalJson(goldenManifest));
  });

  it('rebuilds byte-identically from the committed input.json', async () => {
    if (UPDATE) return; // input.json is written by the test above under UPDATE.
    expect(existsSync(INPUT_JSON)).toBe(true);
    const input = JSON.parse(readFileSync(INPUT_JSON, 'utf-8')) as FixtureInputFile;
    const { packet } = await buildFromInput(input);
    const goldenZip = readFileSync(PACKET_ZIP);
    expect(Buffer.from(packet).equals(goldenZip)).toBe(true);
    expect(sha256Hex(packet)).toBe(readFileSync(EXPECTED_SHA, 'utf-8').trim());
  });

  it('the packet manifest.json entry equals the expected-manifest golden', async () => {
    if (UPDATE) return;
    const { packet } = await buildFixturePacket();
    const entries = readFixedZip(packet);
    const manifestEntry = entries.find((e) => e.path === 'manifest.json');
    expect(manifestEntry).toBeDefined();
    const embedded = JSON.parse(Buffer.from(manifestEntry!.bytes).toString('utf-8'));
    const goldenManifest = JSON.parse(readFileSync(EXPECTED_MANIFEST, 'utf-8'));
    expect(canonicalJson(embedded)).toBe(canonicalJson(goldenManifest));
  });

  it('NORMAL comparison is byte-sensitive: a one-byte drift flips the sha256', () => {
    if (UPDATE) return;
    const goldenZip = readFileSync(PACKET_ZIP);
    const goldenSha = readFileSync(EXPECTED_SHA, 'utf-8').trim();
    expect(sha256Hex(goldenZip)).toBe(goldenSha); // committed pair is consistent
    const mutated = Buffer.from(goldenZip);
    const idx = Math.floor(mutated.length / 2);
    mutated[idx] = mutated[idx] ^ 0xff;
    expect(sha256Hex(mutated)).not.toBe(goldenSha); // drift is detected
  });
});
