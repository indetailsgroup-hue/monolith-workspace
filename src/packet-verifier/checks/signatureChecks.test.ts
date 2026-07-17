// S17-5 checks 7–8 tests — identity consistency + ECDSA signature (§10/§12)
import { describe, it, expect } from 'vitest';
import { makePacketFixture } from '../testkit/packetFixture';
import { generateTestKey, signPreimageLowS, toHighSTwin, type TestKey } from '../testkit/testSigner';
import { checkIdentityConsistency } from './consistencyCheck';
import {
  checkSignature, buildSignaturePreimage, type TrustedKeyRegistry, type TrustedKeyRecord,
} from './signatureCheck';
import { decodeBase64Strict, encodeBase64 } from '../crypto/base64Strict';
import { validateP256Spki } from '../crypto/spki';

function registryOf(record: TrustedKeyRecord | 'unknown' | 'unavailable'): TrustedKeyRegistry {
  return { lookup: async () => record };
}

function activeRecord(key: TestKey, overrides: Partial<TrustedKeyRecord> = {}): TrustedKeyRecord {
  return {
    keyId: 'key-001',
    state: 'ACTIVE',
    spkiDer: key.spkiDer,
    notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('check 7 — identity consistency', () => {
  it('coherent fixture passes', async () => {
    const fx = await makePacketFixture();
    expect(checkIdentityConsistency(fx.manifest, fx.attestation)).toEqual({ ok: true });
  });
  it('machineProfile.version drift → PKT_IDENTITY_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const att = { ...fx.attestation, machineProfile: { ...fx.attestation.machineProfile, version: '9.9.9' } };
    expect(checkIdentityConsistency(fx.manifest, att)).toMatchObject({ ok: false, code: 'PKT_IDENTITY_MISMATCH' });
  });
  it('exporter.buildCommit drift → PKT_IDENTITY_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const att = { ...fx.attestation, exporter: { ...fx.attestation.exporter, buildCommit: 'e'.repeat(40) } };
    expect(checkIdentityConsistency(fx.manifest, att)).toMatchObject({ ok: false, code: 'PKT_IDENTITY_MISMATCH' });
  });
  it('releasedRevision.revisionId drift → PKT_IDENTITY_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const att = { ...fx.attestation, releasedRevision: { ...fx.attestation.releasedRevision, revisionId: 'rev-999' } };
    expect(checkIdentityConsistency(fx.manifest, att)).toMatchObject({ ok: false, code: 'PKT_IDENTITY_MISMATCH' });
  });
  it('attested gate digest not matching the manifest-listed digest → PKT_GATE_EVIDENCE_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const att = { ...fx.attestation, gate: { ...fx.attestation.gate, evidenceSha256: 'sha256:' + '1'.repeat(64) } };
    expect(checkIdentityConsistency(fx.manifest, att)).toMatchObject({ ok: false, code: 'PKT_GATE_EVIDENCE_MISMATCH' });
  });
  it('gate evidence file absent from manifest.files → PKT_GATE_EVIDENCE_MISMATCH', async () => {
    const fx = await makePacketFixture();
    const manifest = { ...fx.manifest, files: fx.manifest.files.filter((f) => f.path !== 'gate-result.json') };
    expect(checkIdentityConsistency(manifest, fx.attestation)).toMatchObject({ ok: false, code: 'PKT_GATE_EVIDENCE_MISMATCH' });
  });
});

describe('check 8 — ECDSA signature over the §10.1 preimage', () => {
  it('genuinely signed low-S packet verifies', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes));
    const r = await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key)));
    expect(r).toEqual({ ok: true });
  });

  it('high-S twin is REJECTED even though the ECDSA math verifies (§10.1.6)', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as { signature: { valueBase64: string } };
    const twin = toHighSTwin(value.signature.valueBase64);

    // adversarial proof: WebCrypto itself accepts the twin over the same preimage…
    const preimage = buildSignaturePreimage(value as never);
    const rawTwin = decodeBase64Strict(twin) as Uint8Array;
    const mathValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key.publicKey, rawTwin as BufferSource, preimage as BufferSource,
    );
    expect(mathValid).toBe(true);

    // …but the verifier must reject it as non-canonical
    value.signature.valueBase64 = twin;
    const att = { ...fx.attestation, signature: { ...fx.attestation.signature, valueBase64: twin } };
    const r = await checkSignature(value as never, att, registryOf(activeRecord(key)));
    expect(r).toMatchObject({ ok: false, code: 'PKT_SIGNATURE_INVALID' });
    if (!r.ok) expect(r.detail).toContain('high-S');
  });

  it('any signed-field tamper after signing → PKT_SIGNATURE_INVALID', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as { jobRunId: string };
    value.jobRunId = '00000000-0000-4000-8000-000000000000';
    const att = { ...fx.attestation, jobRunId: value.jobRunId };
    const r = await checkSignature(value as never, att, registryOf(activeRecord(key)));
    expect(r).toMatchObject({ ok: false, code: 'PKT_SIGNATURE_INVALID' });
  });

  it('signature from a different key → PKT_SIGNATURE_INVALID', async () => {
    const signer = await generateTestKey();
    const other = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), signer) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes));
    const r = await checkSignature(value as never, fx.attestation, registryOf(activeRecord(other)));
    expect(r).toMatchObject({ ok: false, code: 'PKT_SIGNATURE_INVALID' });
  });

  it('s out of range (s = 0) → PKT_SIGNATURE_INVALID before any crypto', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const zeroS = new Uint8Array(64);
    zeroS.set(new Uint8Array(32).fill(1), 0); // r = something, s = 0
    const bad = encodeBase64(zeroS);
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes)) as { signature: { valueBase64: string } };
    value.signature.valueBase64 = bad;
    const att = { ...fx.attestation, signature: { ...fx.attestation.signature, valueBase64: bad } };
    const r = await checkSignature(value as never, att, registryOf(activeRecord(key)));
    expect(r).toMatchObject({ ok: false, code: 'PKT_SIGNATURE_INVALID' });
    if (!r.ok) expect(r.detail).toContain('range');
  });

  it('registry lifecycle codes: unknown / unavailable / revoked / not-yet-valid / expired / retired-window', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes));

    expect(await checkSignature(value as never, fx.attestation, registryOf('unknown')))
      .toMatchObject({ ok: false, code: 'PKT_KEY_UNKNOWN' });
    expect(await checkSignature(value as never, fx.attestation, registryOf('unavailable')))
      .toMatchObject({ ok: false, code: 'PKT_AUTHORITY_UNAVAILABLE' });
    expect(await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { state: 'REVOKED' }))))
      .toMatchObject({ ok: false, code: 'PKT_KEY_REVOKED' });
    expect(await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { notBefore: '2026-12-01T00:00:00.000Z' }))))
      .toMatchObject({ ok: false, code: 'PKT_KEY_NOT_YET_VALID' });
    expect(await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { notAfter: '2026-01-02T00:00:00.000Z' }))))
      .toMatchObject({ ok: false, code: 'PKT_KEY_EXPIRED' });
    // retirement AFTER issuedAt (2026-07-17) still verifies the old packet…
    expect(await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { state: 'RETIRED', retiredAt: '2026-08-01T00:00:00.000Z' }))))
      .toEqual({ ok: true });
    // …retirement BEFORE issuedAt does not
    expect(await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { state: 'RETIRED', retiredAt: '2026-06-01T00:00:00.000Z' }))))
      .toMatchObject({ ok: false, code: 'PKT_KEY_EXPIRED' });
  });

  it('malformed registry SPKI → PKT_KEY_UNKNOWN (trust data unusable)', async () => {
    const key = await generateTestKey();
    const fx = await makePacketFixture({ sign: (v) => signPreimageLowS(buildSignaturePreimage(v), key) });
    const value = JSON.parse(new TextDecoder().decode(fx.attestationBytes));
    const truncated = key.spkiDer.subarray(0, key.spkiDer.length - 5);
    const r = await checkSignature(value as never, fx.attestation, registryOf(activeRecord(key, { spkiDer: truncated })));
    expect(r).toMatchObject({ ok: false, code: 'PKT_KEY_UNKNOWN' });
  });
});

describe('crypto primitives', () => {
  it('validateP256Spki accepts a real WebCrypto SPKI and rejects mutations', async () => {
    const key = await generateTestKey();
    expect(validateP256Spki(key.spkiDer)).toEqual({ ok: true });
    const wrongCurve = new Uint8Array(key.spkiDer);
    wrongCurve[key.spkiDer.length - 66 - 2] ^= 0x01; // damage curve OID tail
    expect(validateP256Spki(wrongCurve).ok).toBe(false);
    const compressed = new Uint8Array(key.spkiDer);
    compressed[compressed.length - 65] = 0x02; // point form byte
    expect(validateP256Spki(compressed).ok).toBe(false);
  });
  it('decodeBase64Strict rejects Base64url, whitespace, bad padding, non-canonical bits', () => {
    expect(decodeBase64Strict('AAA_')).toBeNull(); // base64url char
    expect(decodeBase64Strict('AA A=')).toBeNull(); // whitespace
    expect(decodeBase64Strict('AAAA=')).toBeNull(); // bad length
    expect(decodeBase64Strict('A===')).toBeNull(); // over-padding
    expect(decodeBase64Strict('AB==')).toBeNull(); // non-zero padding bits ('B' low bits set)
    const roundtrip = decodeBase64Strict('AQ==');
    expect(roundtrip).not.toBeNull();
    expect(Array.from(roundtrip as Uint8Array)).toEqual([1]);
  });
});
