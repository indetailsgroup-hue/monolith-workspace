// S17-5 §14 tamper corpus — END-TO-END through the full orchestrator:
// real ZIP bytes in → three-field result out. Every fixture must fail with the
// exact stable code AT the exact ladder step (first-fail-wins), built from the
// spec alone (SoD: no S17-4 artifacts).
import { describe, it, expect } from 'vitest';
import { verifyPacket, type VerifierDeps, type AuditRecord } from './verifyPacket';
import { makePacketFixture, type PacketFixture } from './testkit/packetFixture';
import { writePacketZip } from './testkit/zipWriter';
import { generateTestKey, signPreimageLowS, toHighSTwin, type TestKey } from './testkit/testSigner';
import { buildSignaturePreimage } from './checks/signatureCheck';
import { jcsSerialize } from './canonical/jcs';
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
    // same byte length as the original {"parts":[]} so size passes and ONLY the hash catches it
    const entries = h.fx.entries.map((e) =>
      e.name === 'cutlist.json' ? { name: e.name, bytes: te.encode('{"partz":[]}') } : e,
    );
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_HASH_MISMATCH', failedCheck: 'byte_integrity' });
  });
  it('length-changing payload tamper → PKT_SIZE_MISMATCH fires before hash (ladder order inside check 4)', async () => {
    const h = await makeHarness();
    const entries = h.fx.entries.map((e) =>
      e.name === 'cutlist.json' ? { name: e.name, bytes: te.encode('{"parts":[1]}') } : e,
    );
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_SIZE_MISMATCH', failedCheck: 'byte_integrity' });
  });
  it('two-file name swap with identical hash SET (§14.2) → byte_integrity catches per-path', async () => {
    const h = await makeHarness();
    const a = h.fx.entries.find((e) => e.name === 'cutlist.json') as ZipEntry;
    const b = h.fx.entries.find((e) => e.name === 'drillmap.json') as ZipEntry;
    const entries = h.fx.entries.map((e) => {
      if (e.name === 'cutlist.json') return { name: e.name, bytes: b.bytes };
      if (e.name === 'drillmap.json') return { name: e.name, bytes: a.bytes };
      return e;
    });
    const { result } = await verifyPacket(writePacketZip(entries), h.fx.sourceFilename, h.deps);
    expect(result).toMatchObject({ code: 'PKT_HASH_MISMATCH', failedCheck: 'byte_integrity' });
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
  it('NFP marker labelled with a non-canonical contentSchema (bytes correct) → PKT_NFP_POLICY_MISMATCH', async () => {
    // §5 prose pins monolith.factory.nfp-marker@1.0 even though the machine-
    // readable manifest schema leaves contentSchema free (interop finding
    // 2026-07-18): the whole chain is coherent, only the label deviates.
    const key = await generateTestKey();
    const fx = await makePacketFixture({
      sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key),
      nfpContentSchema: 'monolith.nfp-marker@1.0',
    });
    const audits: AuditRecord[] = [];
    const { result } = await verifyPacket(writePacketZip(fx.entries), fx.sourceFilename, happyDeps(key, audits));
    expect(result).toMatchObject({ code: 'PKT_NFP_POLICY_MISMATCH', failedCheck: 'shadow_policy' });
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
