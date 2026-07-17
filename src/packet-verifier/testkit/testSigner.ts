// S17-5 test signer — ephemeral P-256 keys generated IN TESTS ONLY.
// No real custody material; KMS is never touched (S17-6 is human-owned).
// Produces spec-canonical low-S signatures, plus the high-S twin used to prove
// the verifier rejects math-valid-but-non-canonical signatures (§10.1.6).

import { encodeBase64, decodeBase64Strict } from '../crypto/base64Strict';

const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_HALF_N = P256_N / 2n;

export interface TestKey {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  spkiDer: Uint8Array;
}

export async function generateTestKey(): Promise<TestKey> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, spkiDer: spki };
}

function bytesToBigInt(b: Uint8Array): bigint {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

function bigIntTo32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

/** Sign a preimage; WebCrypto returns raw r‖s — normalize s to low-S per §10.1.4. */
export async function signPreimageLowS(preimage: Uint8Array, key: TestKey): Promise<string> {
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, preimage as BufferSource),
  );
  const r = raw.subarray(0, 32);
  let s = bytesToBigInt(raw.subarray(32, 64));
  if (s > P256_HALF_N) s = P256_N - s; // canonical low-S (twin remains valid math)
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(bigIntTo32(s), 32);
  return encodeBase64(out);
}

/** Flip a canonical low-S signature to its math-valid high-S twin (s' = n − s). */
export function toHighSTwin(valueBase64: string): string {
  const raw = decodeBase64Strict(valueBase64);
  if (raw === null || raw.length !== 64) throw new Error('not a canonical 64-byte signature');
  const s = bytesToBigInt(raw.subarray(32, 64));
  const out = new Uint8Array(64);
  out.set(raw.subarray(0, 32), 0);
  out.set(bigIntTo32(P256_N - s), 32);
  return encodeBase64(out);
}
