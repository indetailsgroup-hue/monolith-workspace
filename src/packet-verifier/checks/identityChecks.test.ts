// S17-5 checks 3–6 tests + control-file shape validators (spec §6/§8.2/§12)
import { describe, it, expect } from 'vitest';
import { makePacketFixture } from '../testkit/packetFixture';
import {
  checkExactFileSet, checkByteIntegrity, checkContentIdentity, checkManifestBinding, NFP_MARKER,
} from './identityChecks';
import { validateManifestShape, validateAttestationShape } from '../shapes/shapes';
import { parseCanonicalJson } from '../canonical/canonical';
import type { JsonValue } from '../canonical/strictJson';

type Obj = { [k: string]: JsonValue };

describe('packet fixture — internal coherence (built from spec alone)', () => {
  it('manifest bytes are canonical and both shapes validate', async () => {
    const fx = await makePacketFixture();
    const parsed = parseCanonicalJson(fx.manifestBytes);
    expect(parsed.ok).toBe(true);
    expect(validateManifestShape(fx.manifestValue).ok).toBe(true);
    expect(fx.entries[0].name).toBe('manifest.json');
    expect(fx.entries[fx.entries.length - 1].name).toBe('attestation.json');
  });
  it('passes checks 3–6 end-to-end when untampered', async () => {
    const fx = await makePacketFixture();
    expect(checkExactFileSet(fx.entries, fx.manifest)).toEqual({ ok: true });
    expect(await checkByteIntegrity(fx.entries, fx.manifest)).toEqual({ ok: true });
    expect(await checkContentIdentity(fx.manifestValue, fx.manifest)).toEqual({ ok: true });
    expect(await checkManifestBinding(fx.manifestBytes, fx.manifest, fx.attestation)).toEqual({ ok: true });
  });
});

describe('check 3 — exact file set', () => {
  it('missing manifest-listed payload → PKT_FILE_MISSING', async () => {
    const fx = await makePacketFixture();
    const entries = fx.entries.filter((e) => e.name !== 'cutlist.json');
    const r = checkExactFileSet(entries, fx.manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_FILE_MISSING' });
  });
  it('unlisted ZIP entry → PKT_FILE_EXTRA', async () => {
    const fx = await makePacketFixture();
    const entries = [...fx.entries];
    entries.splice(1, 0, { name: 'extra.json', bytes: new TextEncoder().encode('{}') });
    const r = checkExactFileSet(entries, fx.manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_FILE_EXTRA' });
  });
  it('NFP marker absent from manifest.files under shadow mode → PKT_FILE_MISSING (§NFP.5)', async () => {
    const fx = await makePacketFixture();
    const manifest = {
      ...fx.manifest,
      files: fx.manifest.files.filter((f) => f.path !== NFP_MARKER),
    };
    const entries = fx.entries.filter((e) => e.name !== NFP_MARKER);
    const r = checkExactFileSet(entries, manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_FILE_MISSING' });
    if (!r.ok) expect(r.detail).toContain(NFP_MARKER);
  });
  it('control file listed inside manifest.files → PKT_FILE_EXTRA (self-hash recursion guard)', async () => {
    const fx = await makePacketFixture();
    const manifest = {
      ...fx.manifest,
      files: [
        ...fx.manifest.files,
        { path: 'manifest.json', mediaType: 'application/json' as const, contentSchema: 'x', sizeBytes: 1, sha256: 'a'.repeat(64) },
      ],
    };
    const r = checkExactFileSet(fx.entries, manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_FILE_EXTRA' });
  });
  it('missing control file → PKT_FILE_MISSING', async () => {
    const fx = await makePacketFixture();
    const entries = fx.entries.filter((e) => e.name !== 'attestation.json');
    const r = checkExactFileSet(entries, fx.manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_FILE_MISSING' });
  });
});

describe('check 4 — byte integrity', () => {
  it('sizeBytes lie → PKT_SIZE_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const manifest = {
      ...fx.manifest,
      files: fx.manifest.files.map((f) => (f.path === 'cutlist.json' ? { ...f, sizeBytes: f.sizeBytes + 1 } : f)),
    };
    const r = await checkByteIntegrity(fx.entries, manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_SIZE_MISMATCH' });
  });
  it('single byte flip → PKT_HASH_MISMATCH (size unchanged)', async () => {
    const fx = await makePacketFixture();
    const entries = fx.entries.map((e) => {
      if (e.name !== 'cutlist.json') return e;
      const bytes = new Uint8Array(e.bytes);
      bytes[0] = bytes[0] ^ 0x01;
      return { ...e, bytes };
    });
    const r = await checkByteIntegrity(entries, fx.manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_HASH_MISMATCH' });
  });
  it('NFP marker byte tamper → PKT_HASH_MISMATCH (§NFP.5: wrong bytes fail at check 4)', async () => {
    const fx = await makePacketFixture();
    const entries = fx.entries.map((e) =>
      e.name === NFP_MARKER ? { ...e, bytes: new TextEncoder().encode('PRODUCTION OK\n') } : e,
    );
    // size differs too, so allow either size or hash — both are check-4 codes
    const r = await checkByteIntegrity(entries, fx.manifest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['PKT_SIZE_MISMATCH', 'PKT_HASH_MISMATCH']).toContain(r.code);
  });
});

describe('check 5 — content identity (§8.2 anti-swap)', () => {
  it('tampered packetContentId → PKT_CONTENT_ID_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const manifest = { ...fx.manifest, packetContentId: 'sha256:' + 'f'.repeat(64) };
    const value = { ...(fx.manifestValue as Obj), packetContentId: 'sha256:' + 'f'.repeat(64) };
    const r = await checkContentIdentity(value, manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_CONTENT_ID_MISMATCH' });
  });
  it('path swap with same hash set → PKT_CONTENT_ID_MISMATCH (the v1 contentHash hole)', async () => {
    const fx = await makePacketFixture();
    const v = fx.manifestValue as Obj;
    const files = (v.files as Obj[]).map((f) => ({ ...f }));
    // swap the sha256 of two entries while keeping the sorted path order —
    // descriptor changes, so the recomputed id must diverge
    const a = files[1] as { sha256: string };
    const b = files[2] as { sha256: string };
    [a.sha256, b.sha256] = [b.sha256, a.sha256];
    const value: JsonValue = { ...v, files: files as unknown as JsonValue };
    const r = await checkContentIdentity(value, fx.manifest);
    expect(r).toMatchObject({ ok: false, code: 'PKT_CONTENT_ID_MISMATCH' });
  });
});

describe('check 6 — manifest binding', () => {
  it('shipped manifest bytes differ from attested hash → PKT_MANIFEST_BINDING_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const tampered = new Uint8Array([...fx.manifestBytes, 0x0a]);
    const r = await checkManifestBinding(tampered, fx.manifest, fx.attestation);
    expect(r).toMatchObject({ ok: false, code: 'PKT_MANIFEST_BINDING_MISMATCH' });
  });
  it('attestation claims a different packetContentId → PKT_MANIFEST_BINDING_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const attestation = { ...fx.attestation, packetContentId: 'sha256:' + '9'.repeat(64) };
    const r = await checkManifestBinding(fx.manifestBytes, fx.manifest, attestation);
    expect(r).toMatchObject({ ok: false, code: 'PKT_MANIFEST_BINDING_MISMATCH' });
  });
});

describe('shape validators — schema-exact rejections', () => {
  it('manifest: unknown key → PKT_SCHEMA_UNSUPPORTED (additionalProperties:false)', async () => {
    const fx = await makePacketFixture();
    const v = { ...(fx.manifestValue as Obj), extra: 1 };
    const r = validateManifestShape(v);
    expect(r).toMatchObject({ ok: false, code: 'PKT_SCHEMA_UNSUPPORTED' });
  });
  it('manifest: files out of canonical order → PKT_SCHEMA_UNSUPPORTED (x-monolith-orderBy)', async () => {
    const fx = await makePacketFixture();
    const v = fx.manifestValue as Obj;
    const files = [...(v.files as JsonValue[])];
    [files[1], files[2]] = [files[2], files[1]];
    const r = validateManifestShape({ ...v, files });
    expect(r).toMatchObject({ ok: false, code: 'PKT_SCHEMA_UNSUPPORTED' });
  });
  it('manifest: wrong schema const → PKT_SCHEMA_UNSUPPORTED', async () => {
    const fx = await makePacketFixture();
    const r = validateManifestShape({ ...(fx.manifestValue as Obj), schema: 'monolith.factory.packet@9.9' });
    expect(r).toMatchObject({ ok: false, code: 'PKT_SCHEMA_UNSUPPORTED' });
  });
  it('manifest: uppercase file sha256 → PKT_SCHEMA_UNSUPPORTED (lowercase hex only)', async () => {
    const fx = await makePacketFixture();
    const v = fx.manifestValue as Obj;
    const files = (v.files as Obj[]).map((f, i) => (i === 1 ? { ...f, sha256: 'A'.repeat(64) } : f));
    const r = validateManifestShape({ ...v, files: files as unknown as JsonValue });
    expect(r).toMatchObject({ ok: false, code: 'PKT_SCHEMA_UNSUPPORTED' });
  });
  it('attestation: bad jobRunId (not lowercase UUID v4) → PKT_ATTESTATION_INVALID', async () => {
    const fx = await makePacketFixture();
    const base = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as Obj;
    const r = validateAttestationShape({ ...base, jobRunId: 'NOT-A-UUID' });
    expect(r).toMatchObject({ ok: false, code: 'PKT_ATTESTATION_INVALID' });
  });
  it('attestation: unsupported schema const → PKT_SCHEMA_UNSUPPORTED', async () => {
    const fx = await makePacketFixture();
    const base = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as Obj;
    const r = validateAttestationShape({ ...base, schema: 'monolith.factory.packet-attestation@2.0' });
    expect(r).toMatchObject({ ok: false, code: 'PKT_SCHEMA_UNSUPPORTED' });
  });
  it('attestation: signature valueBase64 breaking the 88-char low-padding pattern → PKT_ATTESTATION_INVALID', async () => {
    const fx = await makePacketFixture();
    const base = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as Obj;
    const sig = { ...(base.signature as Obj), valueBase64: 'A'.repeat(85) + 'B==' }; // last char not in [AQgw]
    const r = validateAttestationShape({ ...base, signature: sig });
    expect(r).toMatchObject({ ok: false, code: 'PKT_ATTESTATION_INVALID' });
  });
  it('attestation: gate.result must be exactly PASS → PKT_ATTESTATION_INVALID', async () => {
    const fx = await makePacketFixture();
    const base = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as Obj;
    const gate = { ...(base.gate as Obj), result: 'FAIL' };
    const r = validateAttestationShape({ ...base, gate });
    expect(r).toMatchObject({ ok: false, code: 'PKT_ATTESTATION_INVALID' });
  });
});
