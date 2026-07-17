// Strict RFC 4648 standard-Base64 decode for the 64-byte signature (§10.1.5):
// alphabet-only, padded, and the re-encode of the decoded bytes must reproduce
// the input string EXACTLY (rejects non-zero padding bits / alternate forms).
// No Base64url, no whitespace, no forgiveness.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET.charCodeAt(i)] = i;
  return m;
})();

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

/** strict decode: returns null on ANY deviation (charset, padding, canonicality). */
export function decodeBase64Strict(s: string): Uint8Array | null {
  if (s.length === 0 || s.length % 4 !== 0) return null;
  const padIdx = s.indexOf('=');
  if (padIdx !== -1 && padIdx < s.length - 2) return null; // '=' only at the tail
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const body = s.slice(0, s.length - pad);
  if (body.includes('=')) return null;
  const outLen = (s.length / 4) * 3 - pad;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < body.length; i += 4) {
    const c: number[] = [];
    for (let j = 0; j < 4 && i + j < body.length; j++) {
      const code = body.charCodeAt(i + j);
      if (code >= 128 || REV[code] === -1) return null;
      c.push(REV[code]);
    }
    while (c.length < 4) c.push(0);
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  // canonical gate: re-encode must reproduce the exact input (padding bits zero)
  if (encodeBase64(out) !== s) return null;
  return out;
}
