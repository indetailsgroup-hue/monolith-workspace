// §10.2 — trusted-registry public key: exact DER SubjectPublicKeyInfo for
// id-ecPublicKey (1.2.840.10045.2.1) on prime256v1 (1.2.840.10045.3.1.7),
// BIT STRING (zero unused bits) carrying an uncompressed point 0x04‖X‖Y of
// exactly 65 bytes. Compressed points, PEM text, other curves and
// non-canonical DER are rejected. Hand-parsed: minimal, fail-closed.

const OID_EC_PUBLIC_KEY = [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
const OID_PRIME256V1 = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];

export type SpkiResult = { ok: true } | { ok: false; detail: string };

function readLen(der: Uint8Array, at: number): { len: number; next: number } | null {
  if (at >= der.length) return null;
  const first = der[at];
  if (first < 0x80) return { len: first, next: at + 1 };
  if (first === 0x81) {
    if (at + 1 >= der.length) return null;
    const l = der[at + 1];
    if (l < 0x80) return null; // non-minimal DER length
    return { len: l, next: at + 2 };
  }
  if (first === 0x82) {
    if (at + 2 >= der.length) return null;
    const l = (der[at + 1] << 8) | der[at + 2];
    if (l < 0x100) return null; // non-minimal
    return { len: l, next: at + 3 };
  }
  return null; // longer forms never legitimate for a P-256 SPKI
}

function matchBytes(der: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (at + expected.length > der.length) return false;
  for (let i = 0; i < expected.length; i++) if (der[at + i] !== expected[i]) return false;
  return true;
}

/** Validate the exact canonical P-256 SPKI shape (91 bytes total). */
export function validateP256Spki(der: Uint8Array): SpkiResult {
  let at = 0;
  if (der[at] !== 0x30) return { ok: false, detail: 'not a DER SEQUENCE' };
  const outer = readLen(der, at + 1);
  if (outer === null) return { ok: false, detail: 'bad outer length' };
  if (outer.next + outer.len !== der.length) return { ok: false, detail: 'trailing bytes after SPKI' };
  at = outer.next;

  if (der[at] !== 0x30) return { ok: false, detail: 'missing AlgorithmIdentifier SEQUENCE' };
  const alg = readLen(der, at + 1);
  if (alg === null) return { ok: false, detail: 'bad AlgorithmIdentifier length' };
  let a = alg.next;
  if (!matchBytes(der, a, OID_EC_PUBLIC_KEY)) return { ok: false, detail: 'algorithm OID is not id-ecPublicKey' };
  a += OID_EC_PUBLIC_KEY.length;
  if (!matchBytes(der, a, OID_PRIME256V1)) return { ok: false, detail: 'curve OID is not prime256v1' };
  a += OID_PRIME256V1.length;
  if (a !== alg.next + alg.len) return { ok: false, detail: 'unexpected bytes in AlgorithmIdentifier' };
  at = a;

  if (der[at] !== 0x03) return { ok: false, detail: 'missing BIT STRING' };
  const bits = readLen(der, at + 1);
  if (bits === null) return { ok: false, detail: 'bad BIT STRING length' };
  if (bits.next + bits.len !== der.length) return { ok: false, detail: 'BIT STRING does not end the SPKI' };
  if (der[bits.next] !== 0x00) return { ok: false, detail: 'BIT STRING unused bits must be zero' };
  const point = der.subarray(bits.next + 1, bits.next + bits.len);
  if (point.length !== 65) return { ok: false, detail: `public point must be 65 bytes, got ${point.length}` };
  if (point[0] !== 0x04) return { ok: false, detail: 'point must be uncompressed (0x04‖X‖Y)' };
  return { ok: true };
}
