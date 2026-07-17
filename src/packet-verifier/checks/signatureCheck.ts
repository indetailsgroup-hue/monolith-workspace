// S17-5 check 8 — signature (§10.1/§10.2/§12.8):
//   protected algorithm/key/registry lookup → SPKI shape → strict Base64 →
//   r/s range → mandatory low-S → key lifecycle vs issuedAt → ECDSA verify
//   over the §10.1 preimage. The verifier VERIFIES ONLY — it never recomputes
//   or re-signs, and a packet-embedded key can never establish trust (§10.1.7).
//
// Trust comes exclusively from the injected TrustedKeyRegistry (Security-Owner
// owned). Registry lookup failure is fail-closed: PKT_AUTHORITY_UNAVAILABLE.
//
// Lifecycle interpretation (documented for corpus review): ACTIVE verifies;
// RETIRED still verifies packets whose issuedAt ≤ retiredAt (retirement stops
// new signing, not verification of the window); REVOKED never verifies;
// issuedAt outside [notBefore, notAfter] → PKT_KEY_NOT_YET_VALID / PKT_KEY_EXPIRED.

import { jcsSerialize } from '../canonical/jcs';
import type { JsonValue } from '../canonical/strictJson';
import type { PacketAttestation } from '../shapes/shapes';
import type { CheckOutcome } from './identityChecks';
import { decodeBase64Strict } from '../crypto/base64Strict';
import { validateP256Spki } from '../crypto/spki';

export const SIGNATURE_DOMAIN_PREFIX = 'MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n';

/** P-256 group order n and floor(n/2) (§10.1.4/§10.1.6 — v0.4.1 constant). */
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_HALF_N = P256_N / 2n;

export type KeyState = 'ACTIVE' | 'RETIRED' | 'REVOKED';

export interface TrustedKeyRecord {
  keyId: string;
  state: KeyState;
  /** exact DER SubjectPublicKeyInfo bytes pinned by the Security Owner (§10.2) */
  spkiDer: Uint8Array;
  /** RFC3339 ms-UTC bounds; issuedAt must sit inside [notBefore, notAfter] */
  notBefore: string;
  notAfter: string;
  retiredAt?: string;
}

export interface TrustedKeyRegistry {
  /**
   * Resolve (keyId, registryVersion) to a pinned record.
   * 'unknown' = no such key in this registry version;
   * 'unavailable' = the authoritative lookup itself failed (network/state) —
   * MUST fail closed, never "warn and pass" (§10.2/§12).
   */
  lookup(keyId: string, registryVersion: string): Promise<TrustedKeyRecord | 'unknown' | 'unavailable'>;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

/** §10.1 preimage: keep signature.protected, omit ONLY signature.valueBase64. */
export function buildSignaturePreimage(attestationValue: JsonValue): Uint8Array {
  if (typeof attestationValue !== 'object' || attestationValue === null || Array.isArray(attestationValue)) {
    throw new Error('attestation value must be an object');
  }
  const src = attestationValue as { [k: string]: JsonValue };
  const unsigned: { [k: string]: JsonValue } = {};
  for (const [k, v] of Object.entries(src)) {
    if (k !== 'signature') { unsigned[k] = v; continue; }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('signature must be an object');
    const sig = v as { [k: string]: JsonValue };
    const keep: { [k: string]: JsonValue } = {};
    for (const [sk, sv] of Object.entries(sig)) if (sk !== 'valueBase64') keep[sk] = sv;
    unsigned[k] = keep;
  }
  const enc = new TextEncoder();
  const prefix = enc.encode(SIGNATURE_DOMAIN_PREFIX);
  const body = enc.encode(jcsSerialize(unsigned));
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

export async function checkSignature(
  attestationValue: JsonValue,
  attestation: PacketAttestation,
  registry: TrustedKeyRegistry,
): Promise<CheckOutcome> {
  const { protected: prot, valueBase64 } = attestation.signature;

  // 1) trusted-registry lookup — packet-embedded material never self-trusts
  const record = await registry.lookup(prot.keyId, prot.registryVersion);
  if (record === 'unavailable') {
    return { ok: false, code: 'PKT_AUTHORITY_UNAVAILABLE', detail: 'trusted-key registry lookup failed (fail-closed)' };
  }
  if (record === 'unknown') {
    return { ok: false, code: 'PKT_KEY_UNKNOWN', detail: `keyId ${prot.keyId} not in registry ${prot.registryVersion}` };
  }

  // 2) key lifecycle vs issuedAt (§10.2)
  if (record.state === 'REVOKED') {
    return { ok: false, code: 'PKT_KEY_REVOKED', detail: `key ${record.keyId} is REVOKED` };
  }
  const issued = Date.parse(attestation.issuedAt);
  if (issued < Date.parse(record.notBefore)) {
    return { ok: false, code: 'PKT_KEY_NOT_YET_VALID', detail: 'issuedAt before key notBefore' };
  }
  if (issued > Date.parse(record.notAfter)) {
    return { ok: false, code: 'PKT_KEY_EXPIRED', detail: 'issuedAt after key notAfter' };
  }
  if (record.state === 'RETIRED' && record.retiredAt !== undefined && issued > Date.parse(record.retiredAt)) {
    return { ok: false, code: 'PKT_KEY_EXPIRED', detail: 'issuedAt after key retirement' };
  }

  // 3) pinned SPKI must be the exact canonical P-256 form (§10.2)
  const spki = validateP256Spki(record.spkiDer);
  if (!spki.ok) {
    return { ok: false, code: 'PKT_KEY_UNKNOWN', detail: `registry SPKI unusable: ${spki.detail}` };
  }

  // 4) strict canonical Base64 → exactly 64 raw bytes (§10.1.5)
  const raw = decodeBase64Strict(valueBase64);
  if (raw === null || raw.length !== 64) {
    return { ok: false, code: 'PKT_SIGNATURE_INVALID', detail: 'signature is not canonical 64-byte Base64' };
  }

  // 5) scalar range + mandatory low-S — reject the high-S twin even though the
  //    ECDSA equation would verify (§10.1.6); never normalize attacker bytes.
  const r = bytesToBigInt(raw.subarray(0, 32));
  const s = bytesToBigInt(raw.subarray(32, 64));
  if (r < 1n || r >= P256_N || s < 1n || s >= P256_N) {
    return { ok: false, code: 'PKT_SIGNATURE_INVALID', detail: 'r/s out of range' };
  }
  if (s > P256_HALF_N) {
    return { ok: false, code: 'PKT_SIGNATURE_INVALID', detail: 'high-S signature rejected (low-S mandatory)' };
  }

  // 6) ECDSA verify over the §10.1 domain-separated preimage
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'spki', record.spkiDer as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
  } catch {
    return { ok: false, code: 'PKT_KEY_UNKNOWN', detail: 'registry SPKI rejected by WebCrypto' };
  }
  const preimage = buildSignaturePreimage(attestationValue);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, raw as BufferSource, preimage as BufferSource,
  );
  if (!valid) {
    return { ok: false, code: 'PKT_SIGNATURE_INVALID', detail: 'ECDSA verification failed over §10.1 preimage' };
  }
  return { ok: true };
}
