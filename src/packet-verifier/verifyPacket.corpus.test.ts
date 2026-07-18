// S17-5 §14 tamper corpus — END-TO-END through the full orchestrator:
// real ZIP bytes in → three-field result out. Every fixture must fail with the
// exact stable code AT the exact ladder step (first-fail-wins), built from the
// spec alone (SoD: no S17-4 artifacts).
import { describe, it, expect } from 'vitest';
import {
  verifyPacket, SUPPORTED_SCHEMA_BUNDLE_AGGREGATE, VERIFIER_VERSION,
  type VerifierDeps, type AuditRecord,
} from './verifyPacket';
import { makePacketFixture, type PacketFixture } from './testkit/packetFixture';
import { writePacketZip } from './testkit/zipWriter';
import { generateTestKey, signPreimageLowS, toHighSTwin, type TestKey } from './testkit/testSigner';
import { buildSignaturePreimage, type TrustedKeyRecord } from './checks/signatureCheck';
import { jcsSerialize } from './canonical/jcs';
import { sha256Hex } from './crypto/sha256';
import type { ZipEntry } from './container/zipStrictReader';
import type { JsonValue } from './canonical/strictJson';

const te = new TextEncoder();
type Obj = { [k: string]: JsonValue };

interface Harness {
  key: TestKey;
  fx: PacketFixture;
  zip: Uint8Array;
  deps: VerifierDeps;
  audits: AuditRecord[];
}

function happyDeps(key: TestKey, audits: AuditRecord[], overrides: Partial<VerifierDeps> = {}): VerifierDeps {
  return {
    keyRegistry: {
      lookup: async () => ({
        keyId: 'key-001', state: 'ACTIVE' as const, spkiDer: key.spkiDer,
        notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2027-01-01T00:00:00.000Z',
      }),
    },
    authority: {
      revisionState: async () => 'RELEASED' as const,
      machineProfileAllowed: async () => true,
      exporterAllowed: async () => true,
      registryVersionCurrent: async () => true,
      gatePolicySupported: async () => true,
    },
    runRegistry: {
      bindingForRun: async () => null,
      bindingForFingerprint: async () => null,
    },
    governance: { shadowMode: true },
    auditSink: { append: async (r) => { audits.push(r); } },
    now: () => '2026-07-17T23:00:00.000Z',
    ...overrides,
  };
}

async function makeHarness(): Promise<Harness> {
  const key = await generateTestKey();
  const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
  const audits: AuditRecord[] = [];
  return { key, fx, zip: writePacketZip(fx.entries), deps: happyDeps(key, audits), audits };
}

/** rebuild the packet after mutating the attestation VALUE, re-signing it */
async function resignedZip(h: Harness, mutate: (att: Obj) => void): Promise<{ zip: Uint8Array; filename: string }> {
  const att = JSON.parse(new TextDecoder().decode(h.fx.attestationBytes)) as Obj;
  mutate(att);
  const sigObj = att.signature as Obj;
  sigObj.valueBase64 = 'A'.repeat(85) + 'Q=='; // placeholder; preimage strips it anyway
  const preimage = buildSignaturePreimage(att as JsonValue);
  sigObj.valueBase64 = await signPreimageLowS(preimage, h.key);
  const attBytes = te.encode(jcsSerialize(att as JsonValue));
  const entries: ZipEntry[] = h.fx.entries.map((e) =>
    e.name === 'attestation.json' ? { name: e.name, bytes: attBytes } : e,
  );
  const jobRunId = att.jobRunId as string;
  const contentId = att.packetContentId as string;
  const filename = `NFP-factory-packet-${jobRunId}-${contentId.slice(7, 19)}.zip`;
  return { zip: writePacketZip(entries), filename };
}

interface RebuildOptions {
  /** replace/add payload bytes by path (ZIP + manifest re-hash) */
  payloads?: Record<string, Uint8Array>;
  /** mutate the manifest VALUE (runs BEFORE files re-hash + content-id recompute) */
  mutateManifest?: (mv: Obj) => void;
  /** mutate the attestation VALUE before re-signing */
  mutateAttestation?: (att: Obj) => void;
}

function utf8Cmp(a: string, b: string): number {
  const ea = te.encode(a);
  const eb = te.encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i++) if (ea[i] !== eb[i]) return ea[i] - eb[i];
  return ea.length - eb.length;
}

/** Rebuild the FULL coherent chain (manifest hashes → content id → re-signed
 *  attestation) so only the intended defect survives — the F-01 attacker
 *  model: a generator that lies CONSISTENTLY. */
async function rebuiltZip(h: Harness, opts: RebuildOptions): Promise<{ zip: Uint8Array; filename: string }> {
  const payloads = new Map(
    h.fx.entries
      .filter((e) => e.name !== 'manifest.json' && e.name !== 'attestation.json')
      .map((e) => [e.name, e.bytes] as const),
  );
  for (const [p, b] of Object.entries(opts.payloads ?? {})) payloads.set(p, b);

  const mv = JSON.parse(new TextDecoder().decode(h.fx.manifestBytes)) as Obj;
  opts.mutateManifest?.(mv);
  const files = (mv.files as Obj[]).map((f) => ({ ...f }));
  for (const f of files) {
    const b = payloads.get(f.path as string);
    if (b !== undefined) {
      f.sizeBytes = b.length;
      f.sha256 = await sha256Hex(b);
    }
  }
  mv.files = files as unknown as JsonValue;

  const descriptor: Obj = {};
  for (const [k, val] of Object.entries(mv)) if (k !== 'packetContentId') descriptor[k] = val as JsonValue;
  const contentId = 'sha256:' + (await sha256Hex(te.encode(jcsSerialize(descriptor))));
  const manifestValue: Obj = { ...descriptor, packetContentId: contentId };
  const manifestBytes = te.encode(jcsSerialize(manifestValue as JsonValue));

  const att = JSON.parse(new TextDecoder().decode(h.fx.attestationBytes)) as Obj;
  att.packetContentId = contentId;
  att.manifestSha256 = 'sha256:' + (await sha256Hex(manifestBytes));
  const gateBytes = payloads.get('gate-result.json');
  if (gateBytes !== undefined) {
    (att.gate as Obj).evidenceSha256 = 'sha256:' + (await sha256Hex(gateBytes));
  }
  opts.mutateAttestation?.(att);
  (att.signature as Obj).valueBase64 = 'A'.repeat(85) + 'Q==';
  (att.signature as Obj).valueBase64 = await signPreimageLowS(buildSignaturePreimage(att as JsonValue), h.key);
  const attBytes = te.encode(jcsSerialize(att as JsonValue));

  const payloadNames = [...payloads.keys()]
    .filter((name) => (mv.files as Obj[]).some((f) => f.path === name))
    .sort(utf8Cmp);
  const entries: ZipEntry[] = [
    { name: 'manifest.json', bytes: manifestBytes },
    ...payloadNames.map((name) => ({ name, bytes: payloads.get(name) as Uint8Array })),
    { name: 'attestation.json', bytes: attBytes },
  ];
  const filename = `NFP-factory-packet-${att.jobRunId as string}-${contentId.slice(7, 19)}.zip`;
  return { zip: writePacketZip(entries), filename };
}

describe('corpus — positive ceiling', () => {
  it('valid shadow packet → exactly {VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY} + audit appended', async () => {
    const h = await makeHarness();
    const { result, audit } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({
      integrityStatus: 'VERIFIED',
      operationalDisposition: 'NO_CUT',
      code: 'PKT_OK_SHADOW_ONLY',
    });
    expect(h.audits).toHaveLength(1);
    expect(audit.packetContentId).toBe(h.fx.manifest.packetContentId);
    expect(audit.jobRunId).toBe(h.fx.attestation.jobRunId);
  });
  it('PKT_OK is not an emittable code (reserved — unreachable by construction)', async () => {
    // the codes union simply has no PKT_OK member; assert at runtime over a
    // representative pass + fail result set
    const h = await makeHarness();
    const pass = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    const failRun = await verifyPacket(h.zip, null, h.deps);
    for (const r of [pass.result, failRun.result]) {
      expect(r.code).not.toBe('PKT_OK');
      expect(r.operationalDisposition).toBe('NO_CUT');
    }
  });
});

describe('corpus — pre-parse + container (§14.3/§14.4 families)', () => {
  it('missing source filename → PKT_FILENAME_INVALID (fail-closed)', async () => {
    const h = await makeHarness();
    const { result } = await verifyPacket(h.zip, null, h.deps);
    expect(result).toMatchObject({ code: 'PKT_FILENAME_INVALID', failedCheck: 'container_safety' });
  });
  it('malformed NFP filename → PKT_FILENAME_INVALID', async () => {
    const h = await makeHarness();
    const { result } = await verifyPacket(h.zip, 'factory-packet.zip', h.deps);
    expect(result).toMatchObject({ code: 'PKT_FILENAME_INVALID', failedCheck: 'container_safety' });
  });
  it('raw 1-byte flip inside entry data breaks CRC → PKT_ZIP_PROFILE_INVALID at container', async () => {
    const h = await makeHarness();
    const zip = new Uint8Array(h.zip);
    // flip a byte inside the cutlist payload region (after its local header)
    const idx = h.zip.length >> 1;
    zip[idx] = zip[idx] ^ 0xff;
    const { result } = await verifyPacket(zip, h.fx.sourceFilename, h.deps);
    expect(result.integrityStatus).toBe('FAILED');
    expect(result.failedCheck).toBe('container_safety');
  });
  it('multi-defect packet: container violation wins over deeper defects (first-fail-wins)', async () => {
    const h = await makeHarness();
    // deep defect: swap payload bytes (would be PKT_HASH_MISMATCH at check 4)…
    const entries: ZipEntry[] = h.fx.entries.map((e) =>
      e.name === 'cutlist.json' ? { name: e.name, bytes: te.encode('{"tampered":true}') } : e,
    );
    // …plus container defect: append trailing bytes
    const zip = new Uint8Array([...writePacketZip(entries), 0x00]);
    const { result } = await verifyPacket(zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_ZIP_PROFILE_INVALID', failedCheck: 'container_safety' });
  });
});

describe('corpus — strict parse (§14.6 family)', () => {
  it('non-canonical manifest (whitespace) → PKT_JSON_NON_CANONICAL at strict_parse', async () => {
    const h = await makeHarness();
    const pretty = te.encode(JSON.stringify(JSON.parse(new TextDecoder().decode(h.fx.manifestBytes)), null, 2));
    const entries = h.fx.entries.map((e) => (e.name === 'manifest.json' ? { name: e.name, bytes: pretty } : e));
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_JSON_NON_CANONICAL', failedCheck: 'strict_parse' });
  });
  it('CRLF inside the NFP text payload → strict_parse failure', async () => {
    const h = await makeHarness();
    const entries = h.fx.entries.map((e) =>
      e.name === 'NOT_FOR_PRODUCTION.txt' ? { name: e.name, bytes: te.encode('NOT FOR PRODUCTION\r\n') } : e,
    );
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_JSON_NON_CANONICAL', failedCheck: 'strict_parse' });
  });
});

describe('corpus — file set + byte integrity (§14.3/§14.5 families)', () => {
  it('missing payload (rebuilt) → PKT_FILE_MISSING at exact_file_set', async () => {
    const h = await makeHarness();
    const entries = h.fx.entries.filter((e) => e.name !== 'cutlist.json');
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_FILE_MISSING', failedCheck: 'exact_file_set' });
  });
  it('extra unlisted file → PKT_FILE_EXTRA at exact_file_set', async () => {
    const h = await makeHarness();
    const entries = [...h.fx.entries];
    // canonical position: after drillmap.json, before gate-result.json ('e' < 'g')
    const at = entries.findIndex((e) => e.name === 'gate-result.json');
    entries.splice(at, 0, { name: 'extra.json', bytes: te.encode('{"x":1}') });
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_FILE_EXTRA', failedCheck: 'exact_file_set' });
  });
  it('CRC-consistent same-length payload tamper (rebuilt) → PKT_HASH_MISMATCH at byte_integrity', async () => {
    const h = await makeHarness();
    // schema-valid, canonical, SAME byte length as the fixture gate evidence
    // (policyVersion digit change) so strict parse (F-01) and size both pass
    // and ONLY the hash catches it
    const gate = h.fx.entries.find((e) => e.name === 'gate-result.json') as ZipEntry;
    const tampered = new TextDecoder().decode(gate.bytes).replace('"1.0.0"', '"2.0.0"');
    expect(te.encode(tampered).length).toBe(gate.bytes.length);
    const entries = h.fx.entries.map((e) =>
      e.name === 'gate-result.json' ? { name: e.name, bytes: te.encode(tampered) } : e,
    );
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_HASH_MISMATCH', failedCheck: 'byte_integrity' });
  });
  it('length-changing payload tamper → PKT_SIZE_MISMATCH fires before hash (ladder order inside check 4)', async () => {
    const h = await makeHarness();
    // schema-valid canonical bytes of a DIFFERENT length (policyVersion 10.0.0)
    const gate = h.fx.entries.find((e) => e.name === 'gate-result.json') as ZipEntry;
    const tampered = new TextDecoder().decode(gate.bytes).replace('"1.0.0"', '"10.0.0"');
    const entries = h.fx.entries.map((e) =>
      e.name === 'gate-result.json' ? { name: e.name, bytes: te.encode(tampered) } : e,
    );
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SIZE_MISMATCH', failedCheck: 'byte_integrity' });
  });
  it('two-file name swap with identical hash SET (§14.2) → fails closed at strict_parse (F-01 catches the schema const first)', async () => {
    // pre-F-01 this was caught by per-path digests at check 4; payload schema
    // validation now rejects the swapped bytes earlier (each payload carries
    // its own schema const) — first-fail-wins. Per-path digest binding stays
    // covered by the identityChecks unit suite and the hash-tamper case above.
    const h = await makeHarness();
    const a = h.fx.entries.find((e) => e.name === 'cutlist.json') as ZipEntry;
    const b = h.fx.entries.find((e) => e.name === 'drillmap.json') as ZipEntry;
    const entries = h.fx.entries.map((e) => {
      if (e.name === 'cutlist.json') return { name: e.name, bytes: b.bytes };
      if (e.name === 'drillmap.json') return { name: e.name, bytes: a.bytes };
      return e;
    });
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
    expect(result.integrityStatus).toBe('FAILED');
  });
});

describe('corpus — identity chain (§14.5 family)', () => {
  it('re-signed attestation with wrong manifestSha256 → PKT_MANIFEST_BINDING_MISMATCH at manifest_binding', async () => {
    const h = await makeHarness();
    const { zip, filename } = await resignedZip(h, (att) => {
      att.manifestSha256 = 'sha256:' + '5'.repeat(64);
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_MANIFEST_BINDING_MISMATCH', failedCheck: 'manifest_binding' });
  });
  it('re-signed attestation with drifted machineProfile → PKT_IDENTITY_MISMATCH at identity_consistency', async () => {
    const h = await makeHarness();
    const { zip, filename } = await resignedZip(h, (att) => {
      (att.machineProfile as Obj).version = '9.9.9';
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_IDENTITY_MISMATCH', failedCheck: 'identity_consistency' });
  });
});

describe('corpus — signature family (§14 signature/key states)', () => {
  it('high-S twin end-to-end → PKT_SIGNATURE_INVALID at signature', async () => {
    const h = await makeHarness();
    const att = JSON.parse(new TextDecoder().decode(h.fx.attestationBytes)) as Obj;
    (att.signature as Obj).valueBase64 = toHighSTwin((att.signature as Obj).valueBase64 as string);
    const attBytes = te.encode(jcsSerialize(att as JsonValue));
    const entries = h.fx.entries.map((e) => (e.name === 'attestation.json' ? { name: e.name, bytes: attBytes } : e));
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SIGNATURE_INVALID', failedCheck: 'signature' });
  });
  it('key states end-to-end: REVOKED / NOT_YET_VALID / EXPIRED / UNKNOWN / unavailable', async () => {
    const h = await makeHarness();
    const run = async (record: unknown, expected: string) => {
      const deps = happyDeps(h.key, h.audits, {
        keyRegistry: { lookup: async () => record as never },
      });
      const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, deps);
      expect(result.code).toBe(expected);
      expect(result.failedCheck).toBe('signature');
    };
    const base = {
      keyId: 'key-001', spkiDer: h.key.spkiDer,
      notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2027-01-01T00:00:00.000Z',
    };
    await run({ ...base, state: 'REVOKED' }, 'PKT_KEY_REVOKED');
    await run({ ...base, state: 'ACTIVE', notBefore: '2026-12-01T00:00:00.000Z' }, 'PKT_KEY_NOT_YET_VALID');
    await run({ ...base, state: 'ACTIVE', notAfter: '2026-01-02T00:00:00.000Z' }, 'PKT_KEY_EXPIRED');
    await run('unknown', 'PKT_KEY_UNKNOWN');
    await run('unavailable', 'PKT_AUTHORITY_UNAVAILABLE');
  });
});

describe('corpus — authoritative + run/replay (§12.9/§12.10)', () => {
  it('revision no longer RELEASED → PKT_REVISION_NOT_RELEASED at authoritative', async () => {
    const h = await makeHarness();
    h.deps.authority.revisionState = async () => 'NOT_RELEASED';
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_REVISION_NOT_RELEASED', failedCheck: 'authoritative' });
  });
  it('machine profile off the allowlist → PKT_MACHINE_PROFILE_MISMATCH', async () => {
    const h = await makeHarness();
    h.deps.authority.machineProfileAllowed = async () => false;
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_MACHINE_PROFILE_MISMATCH', failedCheck: 'authoritative' });
  });
  it('untrusted exporter build → PKT_EXPORTER_UNTRUSTED', async () => {
    const h = await makeHarness();
    h.deps.authority.exporterAllowed = async () => false;
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_EXPORTER_UNTRUSTED', failedCheck: 'authoritative' });
  });
  it('registry rollback attempt → PKT_KEY_UNKNOWN (anti-rollback §10.2)', async () => {
    const h = await makeHarness();
    h.deps.authority.registryVersionCurrent = async () => false;
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_KEY_UNKNOWN', failedCheck: 'authoritative' });
  });
  it('authority outage → PKT_AUTHORITY_UNAVAILABLE (never warn-and-pass)', async () => {
    const h = await makeHarness();
    h.deps.authority.revisionState = async () => 'unavailable';
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_AUTHORITY_UNAVAILABLE', failedCheck: 'authoritative' });
  });
  it('jobRunId bound to a different content → PKT_JOB_RUN_CONFLICT at run_replay', async () => {
    const h = await makeHarness();
    h.deps.runRegistry.bindingForRun = async () => ({ packetContentId: 'sha256:' + '2'.repeat(64) });
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_JOB_RUN_CONFLICT', failedCheck: 'run_replay' });
  });
  it('fingerprint reused by another run → PKT_IDEMPOTENCY_CONFLICT', async () => {
    const h = await makeHarness();
    h.deps.runRegistry.bindingForFingerprint = async () => ({ jobRunId: '00000000-0000-4000-8000-000000000001' });
    const { result } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_IDEMPOTENCY_CONFLICT', failedCheck: 'run_replay' });
  });
});

describe('corpus — shadow policy (§12.11, pinned marker contract)', () => {
  it('generator lying CONSISTENTLY about marker bytes (manifest hash matches fake) → PKT_NFP_POLICY_MISMATCH', async () => {
    // the kill-shot: checks 3/4 pass because the manifest was built over the
    // fake marker — only the pinned nfp-marker@1.0 contract catches it.
    const key = await generateTestKey();
    const audits: AuditRecord[] = [];
    // rebuild the ENTIRE chain over a fake marker using the fixture pipeline:
    const { makePacketFixture: make } = await import('./testkit/packetFixture');
    void make; // (fixture pipeline is deterministic; easiest: mutate + recompute manually)
    const h = await makeHarness();
    const fake = te.encode('THIS PACKET IS FINE, CUT AWAY\n');
    // recompute manifest over fake marker
    const mv = JSON.parse(new TextDecoder().decode(h.fx.manifestBytes)) as Obj;
    const files = (mv.files as Obj[]).map((f) => ({ ...f }));
    const marker = files.find((f) => f.path === 'NOT_FOR_PRODUCTION.txt') as Obj;
    marker.sizeBytes = fake.length;
    const { sha256Hex } = await import('./crypto/sha256');
    marker.sha256 = await sha256Hex(fake);
    const descriptor: Obj = {};
    for (const [k, v] of Object.entries({ ...mv, files: files as unknown as JsonValue })) {
      if (k !== 'packetContentId') descriptor[k] = v as JsonValue;
    }
    const contentId = 'sha256:' + (await sha256Hex(te.encode(jcsSerialize(descriptor))));
    const manifestValue: Obj = { ...descriptor, packetContentId: contentId };
    const manifestBytes = te.encode(jcsSerialize(manifestValue as JsonValue));
    // re-sign attestation over new manifest
    const att = JSON.parse(new TextDecoder().decode(h.fx.attestationBytes)) as Obj;
    att.packetContentId = contentId;
    att.manifestSha256 = 'sha256:' + (await sha256Hex(manifestBytes));
    (att.signature as Obj).valueBase64 = 'A'.repeat(85) + 'Q==';
    (att.signature as Obj).valueBase64 = await signPreimageLowS(buildSignaturePreimage(att as JsonValue), key);
    const attBytes = te.encode(jcsSerialize(att as JsonValue));
    const entries: ZipEntry[] = h.fx.entries.map((e) => {
      if (e.name === 'manifest.json') return { name: e.name, bytes: manifestBytes };
      if (e.name === 'attestation.json') return { name: e.name, bytes: attBytes };
      if (e.name === 'NOT_FOR_PRODUCTION.txt') return { name: e.name, bytes: fake };
      return e;
    });
    const filename = `NFP-factory-packet-${att.jobRunId as string}-${contentId.slice(7, 19)}.zip`;
    const deps = happyDeps(key, audits);
    const { result } = await verifyPacket(writePacketZip(entries), filename, deps);
    expect(result).toMatchObject({ code: 'PKT_NFP_POLICY_MISMATCH', failedCheck: 'shadow_policy' });
  });
  it('filename ids not matching the attested run/content → PKT_NFP_POLICY_MISMATCH', async () => {
    const h = await makeHarness();
    const wrongName = `NFP-factory-packet-00000000-0000-4000-8000-00000000ffff-${'0'.repeat(12)}.zip`;
    const { result } = await verifyPacket(h.zip, wrongName, h.deps);
    expect(result).toMatchObject({ code: 'PKT_NFP_POLICY_MISMATCH', failedCheck: 'shadow_policy' });
  });
  it('NFP marker labelled with a non-canonical contentSchema (bytes correct) → PKT_SCHEMA_UNSUPPORTED at strict_parse', async () => {
    // §5 prose pins monolith.factory.nfp-marker@1.0; the whole chain is
    // coherent, only the label deviates. Pre-F-02 this surfaced at check 11
    // (shadow_policy); the closed path↔mediaType↔contentSchema registry now
    // rejects the label at check 2 — first-fail-wins, and the §5 check at
    // check 11 remains as defence-in-depth.
    const key = await generateTestKey();
    const fx = await makePacketFixture({
      sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key),
      nfpContentSchema: 'monolith.nfp-marker@1.0',
    });
    const audits: AuditRecord[] = [];
    const { result } = await verifyPacket(writePacketZip(fx.entries), fx.sourceFilename, happyDeps(key, audits));
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
    expect(result.diagnostics.join(' ')).toContain('contentSchema');
  });
});

describe('corpus — audit (§12.12)', () => {
  it('audit record is appended for pass AND fail, carrying the primary code', async () => {
    const h = await makeHarness();
    await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    await verifyPacket(h.zip, null, h.deps);
    expect(h.audits).toHaveLength(2);
    expect(h.audits[0].code).toBe('PKT_OK_SHADOW_ONLY');
    expect(h.audits[1].code).toBe('PKT_FILENAME_INVALID');
    expect(h.audits[1].failedCheck).toBe('container_safety');
  });
});

describe('corpus — payload schema enforcement (review 2026-07-18 F-01/F-02)', () => {
  // a fully valid cutlist part for order/constraint mutations
  const partOf = (id: string): Obj => ({
    partId: id, cabinetId: 'cab-001', materialId: 'mdf-18', quantity: 1,
    finishWidthUm: 600000, finishHeightUm: 720000, cutWidthUm: 600000, cutHeightUm: 719500,
    thicknessUm: 18000, grain: 'VERTICAL',
    edgeBandUm: { leftUm: 0, rightUm: 0, topUm: 1000, bottomUm: 0 },
    premillUm: { leftUm: 0, rightUm: 0, topUm: 500, bottomUm: 0 },
  });
  const jsonBytes = (v: JsonValue) => te.encode(jcsSerialize(v));

  it('F-01 HEART: coherent chain over bare {"result":"PASS"} gate evidence → PKT_SCHEMA_UNSUPPORTED at strict_parse', async () => {
    // THE review false-accept (F-01): these exact gate bytes — with manifest
    // hashes, content id, evidenceSha256 and signature all consistently
    // rebuilt over them — reached {VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY} in
    // the pre-fix build. The closed-registry payload validation must kill it
    // at check 2, never letting integrity read VERIFIED again.
    const h = await makeHarness();
    const { zip, filename } = await rebuiltZip(h, {
      payloads: { 'gate-result.json': te.encode('{"result":"PASS"}') },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
    expect(result.integrityStatus).toBe('FAILED');
  });
  it('gate-result result FAIL (coherent chain) → PKT_SCHEMA_UNSUPPORTED (schema const PASS only)', async () => {
    const h = await makeHarness();
    const { zip, filename } = await rebuiltZip(h, {
      payloads: {
        'gate-result.json': jsonBytes({
          schema: 'monolith.factory.gate-result@2.0', policyVersion: '1.0.0', result: 'FAIL', findings: [],
        }),
      },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('gate evidence policyVersion differing from the attested gate → PKT_GATE_EVIDENCE_MISMATCH at identity_consistency', async () => {
    // schema-valid evidence, coherent digests — ONLY the cross-check between
    // parsed gate evidence and the signed attestation gate fields catches it
    const h = await makeHarness();
    const { zip, filename } = await rebuiltZip(h, {
      payloads: {
        'gate-result.json': jsonBytes({
          schema: 'monolith.factory.gate-result@2.0', policyVersion: '2.0.0', result: 'PASS', findings: [],
        }),
      },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_GATE_EVIDENCE_MISMATCH', failedCheck: 'identity_consistency' });
  });
  it('cutlist parts out of canonical partId order → PKT_SCHEMA_UNSUPPORTED (x-monolith-orderBy)', async () => {
    const h = await makeHarness();
    const { zip, filename } = await rebuiltZip(h, {
      payloads: {
        'cutlist.json': jsonBytes({
          schema: 'monolith.factory.cutlist@2.0', parts: [partOf('part-002'), partOf('part-001')],
        }),
      },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('micrometre violations (cutlist quantity 0 / drillmap negative diameter) → PKT_SCHEMA_UNSUPPORTED', async () => {
    const h = await makeHarness();
    const q0 = await rebuiltZip(h, {
      payloads: {
        'cutlist.json': jsonBytes({
          schema: 'monolith.factory.cutlist@2.0', parts: [{ ...partOf('part-001'), quantity: 0 }],
        }),
      },
    });
    const r1 = await verifyPacket(q0.zip, q0.filename, h.deps);
    expect(r1.result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });

    const negUm = await rebuiltZip(h, {
      payloads: {
        'drillmap.json': jsonBytes({
          schema: 'monolith.factory.drillmap@2.0',
          panels: [{
            panelId: 'panel-001', cabinetId: 'cab-001', role: 'LEFT_SIDE',
            dimensionsUm: { widthUm: 600000, heightUm: 720000, thicknessUm: 18000 },
            points: [{
              pointId: 'point-001',
              positionUm: { xUm: 1, yUm: 2, zUm: 3 },
              directionMicro: { xMicro: 0, yMicro: 0, zMicro: 1000000 },
              diameterUm: -8000, depthUm: 12500, throughHole: false,
              purpose: 'CAM_LOCK', componentType: 'HOUSING', face: 'A', status: 'VALID',
            }],
          }],
        }),
      },
    });
    const r2 = await verifyPacket(negUm.zip, negUm.filename, h.deps);
    expect(r2.result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('payload unknown field / missing field → PKT_SCHEMA_UNSUPPORTED', async () => {
    const h = await makeHarness();
    const unknown = await rebuiltZip(h, {
      payloads: {
        'connector-ops.json': jsonBytes({
          schema: 'monolith.factory.connector-ops@2.0', operations: [], note: 'x',
        }),
      },
    });
    const r1 = await verifyPacket(unknown.zip, unknown.filename, h.deps);
    expect(r1.result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });

    const missing = await rebuiltZip(h, {
      payloads: {
        'connectors.minifix.json': jsonBytes({ schema: 'monolith.factory.connectors-minifix@2.0' }),
      },
    });
    const r2 = await verifyPacket(missing.zip, missing.filename, h.deps);
    expect(r2.result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('unknown payload extra.json with CORRECT hash listed in the manifest → PKT_SCHEMA_UNSUPPORTED (closed registry)', async () => {
    const h = await makeHarness();
    const extraBytes = jsonBytes({ schema: 'x' });
    const extraSha = await sha256Hex(extraBytes);
    const { zip, filename } = await rebuiltZip(h, {
      payloads: { 'extra.json': extraBytes },
      mutateManifest: (mv) => {
        const files = mv.files as Obj[];
        const at = files.findIndex((f) => f.path === 'gate-result.json');
        files.splice(at, 0, {
          path: 'extra.json', mediaType: 'application/json', contentSchema: 'monolith.factory.extra@1.0',
          sizeBytes: extraBytes.length, sha256: extraSha,
        });
      },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('manifest missing the required cutlist.json payload → PKT_SCHEMA_UNSUPPORTED', async () => {
    const h = await makeHarness();
    const { zip, filename } = await rebuiltZip(h, {
      mutateManifest: (mv) => {
        mv.files = (mv.files as Obj[]).filter((f) => f.path !== 'cutlist.json') as unknown as JsonValue;
      },
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
  });
  it('manifest paths violating the canonicalPath contract → PKT_SCHEMA_UNSUPPORTED (F-02, fixture mutate)', async () => {
    const h = await makeHarness();
    const renameCutlist = (to: string) => (mv: Obj) => {
      for (const f of mv.files as Obj[]) if (f.path === 'cutlist.json') f.path = to;
    };
    for (const [badPath, hint] of [
      ['CON.json', 'reserved'], // Windows reserved device name
      ['x.', 'trailing'], //       trailing dot
      ['x ', 'trailing'], //       trailing space
      ['cafe\u0301.json', 'NFC'], // non-NFC
    ] as const) {
      const { zip, filename } = await rebuiltZip(h, { mutateManifest: renameCutlist(badPath) });
      const { result } = await verifyPacket(zip, filename, h.deps);
      expect(result, badPath).toMatchObject({ code: 'PKT_SCHEMA_UNSUPPORTED', failedCheck: 'strict_parse' });
      expect(result.diagnostics.join(' '), badPath).toContain(hint);
    }
  });
  it('ZIP entry named CON.json → PKT_PATH_INVALID at container_safety (same validator at the ZIP layer)', async () => {
    const h = await makeHarness();
    const entries: ZipEntry[] = [
      h.fx.entries[0], // manifest.json
      { name: 'CON.json', bytes: te.encode('x\n') }, // 'C' < 'N' keeps r2 order
      ...h.fx.entries.slice(1),
    ];
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_PATH_INVALID', failedCheck: 'container_safety' });
  });
});

describe('corpus — dependency exception boundary + audit contract (review 2026-07-18 F-03)', () => {
  it('keyRegistry.lookup throwing → stable PKT_AUTHORITY_UNAVAILABLE at signature + audit appended', async () => {
    const h = await makeHarness();
    const before = h.audits.length;
    h.deps.keyRegistry.lookup = async () => { throw new Error('simulated registry outage'); };
    const outcome = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(outcome.result).toMatchObject({ code: 'PKT_AUTHORITY_UNAVAILABLE', failedCheck: 'signature' });
    expect(outcome.result.integrityStatus).toBe('FAILED');
    expect(outcome.result.diagnostics.join(' ')).toContain('simulated registry outage');
    expect(h.audits.length).toBe(before + 1); // the outage run IS audited
    expect(outcome.auditPersisted).toBe(true);
  });
  it('authority.revisionState rejecting → PKT_AUTHORITY_UNAVAILABLE at authoritative + audit appended', async () => {
    const h = await makeHarness();
    const before = h.audits.length;
    h.deps.authority.revisionState = () => Promise.reject(new Error('authority down'));
    const outcome = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(outcome.result).toMatchObject({ code: 'PKT_AUTHORITY_UNAVAILABLE', failedCheck: 'authoritative' });
    expect(h.audits.length).toBe(before + 1);
    expect(outcome.auditPersisted).toBe(true);
  });
  it('runRegistry.bindingForRun throwing → PKT_AUTHORITY_UNAVAILABLE at run_replay + audit appended', async () => {
    const h = await makeHarness();
    const before = h.audits.length;
    h.deps.runRegistry.bindingForRun = async () => { throw new Error('run registry down'); };
    const outcome = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(outcome.result).toMatchObject({ code: 'PKT_AUTHORITY_UNAVAILABLE', failedCheck: 'run_replay' });
    expect(h.audits.length).toBe(before + 1);
    expect(outcome.auditPersisted).toBe(true);
  });
  it('auditSink.append throwing turns SUCCESS into PKT_AUTHORITY_UNAVAILABLE at audit_result, auditPersisted=false', async () => {
    // a run that cannot be audited cannot claim success (§12.12)
    const h = await makeHarness();
    h.deps.auditSink.append = async () => { throw new Error('sink down'); };
    const outcome = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(outcome.result).toMatchObject({ code: 'PKT_AUTHORITY_UNAVAILABLE', failedCheck: 'audit_result' });
    expect(outcome.result.integrityStatus).toBe('FAILED');
    expect(outcome.auditPersisted).toBe(false);
  });
  it('auditSink.append throwing on a FAILED run keeps the primary code (first-fail-wins) + diagnostic', async () => {
    const h = await makeHarness();
    h.deps.auditSink.append = async () => { throw new Error('sink down'); };
    const outcome = await verifyPacket(h.zip, null, h.deps);
    expect(outcome.result.code).toBe('PKT_FILENAME_INVALID'); // primary code preserved
    expect(outcome.result.failedCheck).toBe('container_safety');
    expect(outcome.result.diagnostics.join(' ')).toContain('audit sink failed');
    expect(outcome.auditPersisted).toBe(false);
  });
});

describe('corpus — key lifecycle boundaries + historical policy (review 2026-07-18 F-04)', () => {
  // fixture attestation issuedAt = 2026-07-17T12:00:00.000Z
  const ISSUED = '2026-07-17T12:00:00.000Z';
  const lifecycleRun = async (
    h: Harness,
    record: Partial<TrustedKeyRecord>,
    verifyPolicy?: { allowHistorical?: boolean },
  ) => {
    const deps = happyDeps(h.key, h.audits, {
      keyRegistry: {
        lookup: async () => ({
          keyId: 'key-001', state: 'ACTIVE' as const, spkiDer: h.key.spkiDer,
          notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2027-01-01T00:00:00.000Z',
          ...record,
        }),
      },
      ...(verifyPolicy !== undefined ? { verifyPolicy } : {}),
    });
    return (await verifyPacket(h.zip, h.fx.sourceFilename, deps)).result;
  };
  it('issuedAt == notAfter → PKT_KEY_EXPIRED (half-open window, >= not >)', async () => {
    const h = await makeHarness();
    expect(await lifecycleRun(h, { notAfter: ISSUED }))
      .toMatchObject({ code: 'PKT_KEY_EXPIRED', failedCheck: 'signature' });
  });
  it('RETIRED record without retiredAt boundary → PKT_KEY_UNKNOWN', async () => {
    const h = await makeHarness();
    expect(await lifecycleRun(h, { state: 'RETIRED' }))
      .toMatchObject({ code: 'PKT_KEY_UNKNOWN', failedCheck: 'signature' });
  });
  it('issuedAt == retiredAt → PKT_KEY_REVOKED (signed at/after retirement)', async () => {
    const h = await makeHarness();
    expect(await lifecycleRun(h, { state: 'RETIRED', retiredAt: ISSUED }, { allowHistorical: true }))
      .toMatchObject({ code: 'PKT_KEY_REVOKED', failedCheck: 'signature' });
  });
  it('RETIRED + issued < retiredAt WITHOUT allowHistorical (default) → PKT_KEY_REVOKED', async () => {
    const h = await makeHarness();
    expect(await lifecycleRun(h, { state: 'RETIRED', retiredAt: '2026-08-01T00:00:00.000Z' }))
      .toMatchObject({ code: 'PKT_KEY_REVOKED', failedCheck: 'signature' });
  });
  it('RETIRED + issued < retiredAt + allowHistorical:true → verification proceeds → PKT_OK_SHADOW_ONLY', async () => {
    const h = await makeHarness();
    expect(await lifecycleRun(h, { state: 'RETIRED', retiredAt: '2026-08-01T00:00:00.000Z' }, { allowHistorical: true }))
      .toMatchObject({ code: 'PKT_OK_SHADOW_ONLY', integrityStatus: 'VERIFIED' });
  });
  it('registry record with impossible calendar notBefore (2026-02-30) → PKT_KEY_UNKNOWN (malformed record)', async () => {
    const h = await makeHarness();
    const result = await lifecycleRun(h, { notBefore: '2026-02-30T00:00:00.000Z' });
    expect(result).toMatchObject({ code: 'PKT_KEY_UNKNOWN', failedCheck: 'signature' });
    expect(result.diagnostics.join(' ')).toContain('malformed');
  });
  it('attestation issuedAt with impossible calendar date (2026-02-30) → rejected at strict_parse (F-04)', async () => {
    const h = await makeHarness();
    const { zip, filename } = await resignedZip(h, (att) => {
      att.issuedAt = '2026-02-30T12:00:00.000Z'; // regex-valid, calendar-impossible
    });
    const { result } = await verifyPacket(zip, filename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_ATTESTATION_INVALID', failedCheck: 'strict_parse' });
  });
});

describe('corpus — PKT_SIGNATURE_MISSING (review 2026-07-18 F-06)', () => {
  it('attestation whose signature object lacks valueBase64 → PKT_SIGNATURE_MISSING', async () => {
    const h = await makeHarness();
    const att = JSON.parse(new TextDecoder().decode(h.fx.attestationBytes)) as Obj;
    delete (att.signature as Obj).valueBase64;
    const attBytes = te.encode(jcsSerialize(att as JsonValue));
    const entries = h.fx.entries.map((e) => (e.name === 'attestation.json' ? { name: e.name, bytes: attBytes } : e));
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SIGNATURE_MISSING', failedCheck: 'strict_parse' });
    expect(result.integrityStatus).toBe('FAILED');
  });
});

describe('corpus — audit record exact contents (review 2026-07-18 F-05)', () => {
  it('PASS run: audit carries policy versions, actor ids, governance mode and all six checked hashes', async () => {
    const h = await makeHarness();
    const { audit, auditPersisted } = await verifyPacket(h.zip, h.fx.sourceFilename, h.deps);
    expect(auditPersisted).toBe(true);
    expect(audit).toEqual({
      verifierVersion: VERIFIER_VERSION,
      schemaBundleAggregate: SUPPORTED_SCHEMA_BUNDLE_AGGREGATE,
      timestamp: '2026-07-17T23:00:00.000Z',
      sourceFilename: h.fx.sourceFilename,
      integrityStatus: 'VERIFIED',
      operationalDisposition: 'NO_CUT',
      code: 'PKT_OK_SHADOW_ONLY',
      failedCheck: undefined,
      packetContentId: h.fx.manifest.packetContentId,
      manifestSha256: h.fx.attestation.manifestSha256,
      jobRunId: h.fx.attestation.jobRunId,
      registryVersion: '1.0.0',
      gatePolicyVersion: '1.0.0',
      actorSubjectId: 'actor-001',
      authorizationContextId: 'authz-001',
      governanceShadowMode: true,
      fileHashes: Object.fromEntries(h.fx.manifest.files.map((f) => [f.path, f.sha256])),
      diagnostics: [],
    });
    expect(Object.keys(audit.fileHashes as Record<string, string>)).toHaveLength(6);
  });
  it('FAIL before parse: parse-dependent fields stay undefined; governance mode still recorded', async () => {
    const h = await makeHarness();
    const { audit, auditPersisted } = await verifyPacket(h.zip, null, h.deps);
    expect(auditPersisted).toBe(true);
    expect(audit).toEqual({
      verifierVersion: VERIFIER_VERSION,
      schemaBundleAggregate: SUPPORTED_SCHEMA_BUNDLE_AGGREGATE,
      timestamp: '2026-07-17T23:00:00.000Z',
      sourceFilename: null,
      integrityStatus: 'FAILED',
      operationalDisposition: 'NO_CUT',
      code: 'PKT_FILENAME_INVALID',
      failedCheck: 'container_safety',
      packetContentId: undefined,
      manifestSha256: undefined,
      jobRunId: undefined,
      registryVersion: undefined,
      gatePolicyVersion: undefined,
      actorSubjectId: undefined,
      authorizationContextId: undefined,
      governanceShadowMode: true,
      fileHashes: undefined,
      diagnostics: ['source filename not provided (fail-closed in shadow mode)'],
    });
  });
});
