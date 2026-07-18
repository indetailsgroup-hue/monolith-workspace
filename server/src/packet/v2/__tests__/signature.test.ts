import { describe, expect, it } from 'vitest';
import { P256_HALF_ORDER, P256_ORDER } from '../constants.js';
import {
  encodeBase64,
  normalizeP256SignatureToRaw,
  parseStrictEcdsaDer,
} from '../signature.js';
import { encodeDerSignature } from './fixtures.js';

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

describe('S17-4 ECDSA P-256 KMS signature adapter boundary', () => {
  it('strictly parses DER and emits fixed 64-byte raw r||s Base64', () => {
    const raw = normalizeP256SignatureToRaw(encodeDerSignature(1n, 2n));
    expect(raw).toHaveLength(64);
    expect(bytesToBigInt(raw.subarray(0, 32))).toBe(1n);
    expect(bytesToBigInt(raw.subarray(32))).toBe(2n);
    expect(encodeBase64(raw)).toMatch(/^[A-Za-z0-9+/]{85}[AQgw]==$/);
  });

  it('normalizes the high-S twin before serialization', () => {
    const highS = P256_ORDER - 2n;
    expect(highS).toBeGreaterThan(P256_HALF_ORDER);
    const raw = normalizeP256SignatureToRaw(encodeDerSignature(3n, highS));
    expect(bytesToBigInt(raw.subarray(32))).toBe(2n);
  });

  it('rejects non-minimal DER, trailing bytes, negative integers, zero, and out-of-range scalars', () => {
    expect(() => parseStrictEcdsaDer(Uint8Array.from([0x30, 0x07, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]))).toThrow(
      /not minimally encoded/,
    );
    expect(() => parseStrictEcdsaDer(Uint8Array.from([...encodeDerSignature(1n, 1n), 0x00]))).toThrow(
      /does not cover exact input/,
    );
    expect(() => parseStrictEcdsaDer(Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x80, 0x02, 0x01, 0x01]))).toThrow(
      /negative/,
    );
    expect(() => parseStrictEcdsaDer(encodeDerSignature(0n, 1n))).toThrow(/outside 1\.\.n-1/);
    expect(() => parseStrictEcdsaDer(encodeDerSignature(P256_ORDER, 1n))).toThrow(/outside 1\.\.n-1/);
  });
});
