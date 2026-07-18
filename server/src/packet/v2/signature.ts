import {
  asJsonValue,
  concatBytes,
  jcsBytes,
  PacketGenerationError,
  sha256Hex,
  utf8,
} from './canonical.js';
import {
  ATTESTATION_SIGNATURE_DOMAIN,
  P256_HALF_ORDER,
  P256_ORDER,
} from './constants.js';
import type {
  PacketAttestationV2,
  PacketSignerAdapter,
  UnsignedPacketAttestationV2,
} from './types.js';

interface DerCursor {
  offset: number;
}

export interface ParsedP256Signature {
  r: bigint;
  s: bigint;
}

export function parseStrictEcdsaDer(signature: Uint8Array): ParsedP256Signature {
  if (signature.byteLength < 8 || signature.byteLength > 80) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER signature length is outside P-256 bounds');
  }
  const cursor: DerCursor = { offset: 0 };
  requireTag(signature, cursor, 0x30, 'SEQUENCE');
  const sequenceLength = readDerLength(signature, cursor);
  if (sequenceLength !== signature.byteLength - cursor.offset) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER SEQUENCE length does not cover exact input');
  }
  const r = readPositiveInteger(signature, cursor, 'r');
  const s = readPositiveInteger(signature, cursor, 's');
  if (cursor.offset !== signature.byteLength) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER signature contains trailing bytes');
  }
  if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'ECDSA scalar is outside 1..n-1');
  }
  return { r, s };
}

function requireTag(bytes: Uint8Array, cursor: DerCursor, expected: number, label: string): void {
  if (cursor.offset >= bytes.byteLength || bytes[cursor.offset] !== expected) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', `DER ${label} tag is missing`);
  }
  cursor.offset += 1;
}

function readDerLength(bytes: Uint8Array, cursor: DerCursor): number {
  if (cursor.offset >= bytes.byteLength) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER length is truncated');
  }
  const first = bytes[cursor.offset++];
  if ((first & 0x80) === 0) return first;
  const count = first & 0x7f;
  if (count === 0 || count > 2 || cursor.offset + count > bytes.byteLength) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER long-form length is invalid');
  }
  if (bytes[cursor.offset] === 0) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER length has non-minimal leading zero');
  }
  let length = 0;
  for (let index = 0; index < count; index += 1) {
    length = length * 256 + bytes[cursor.offset++];
  }
  if (length < 128) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'DER long-form length is not minimal');
  }
  return length;
}

function readPositiveInteger(bytes: Uint8Array, cursor: DerCursor, label: string): bigint {
  requireTag(bytes, cursor, 0x02, `${label} INTEGER`);
  const length = readDerLength(bytes, cursor);
  if (length === 0 || cursor.offset + length > bytes.byteLength) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', `DER ${label} INTEGER is truncated`);
  }
  const encoded = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  if ((encoded[0] & 0x80) !== 0) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', `DER ${label} INTEGER is negative`);
  }
  if (encoded.length > 1 && encoded[0] === 0 && (encoded[1] & 0x80) === 0) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', `DER ${label} INTEGER is not minimally encoded`);
  }
  const magnitude = encoded[0] === 0 ? encoded.subarray(1) : encoded;
  if (magnitude.byteLength > 32) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', `DER ${label} INTEGER exceeds P-256 width`);
  }
  let value = 0n;
  for (const byte of magnitude) value = (value << 8n) | BigInt(byte);
  return value;
}

export function normalizeP256SignatureToRaw(signatureDer: Uint8Array): Uint8Array {
  const { r, s } = parseStrictEcdsaDer(signatureDer);
  const lowS = s > P256_HALF_ORDER ? P256_ORDER - s : s;
  if (lowS < 1n || lowS > P256_HALF_ORDER) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'low-S normalization failed');
  }
  return concatBytes(bigIntToFixed32(r), bigIntToFixed32(lowS));
}

function bigIntToFixed32(value: bigint): Uint8Array {
  const result = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'ECDSA scalar exceeds 32 bytes');
  }
  return result;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.byteLength;
    const hasC = index + 2 < bytes.byteLength;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    output += BASE64_ALPHABET[a >>> 2];
    output += BASE64_ALPHABET[((a & 0x03) << 4) | (b >>> 4)];
    output += hasB ? BASE64_ALPHABET[((b & 0x0f) << 2) | (c >>> 6)] : '=';
    output += hasC ? BASE64_ALPHABET[c & 0x3f] : '=';
  }
  return output;
}

export async function signAttestation(
  unsignedAttestation: UnsignedPacketAttestationV2,
  signer: PacketSignerAdapter,
): Promise<{ attestation: PacketAttestationV2; messageDigestHex: string }> {
  const message = concatBytes(
    utf8(ATTESTATION_SIGNATURE_DOMAIN),
    jcsBytes(asJsonValue(unsignedAttestation)),
  );
  const messageDigestHex = sha256Hex(message);
  const messageDigest = Uint8Array.from(Buffer.from(messageDigestHex, 'hex'));
  const signatureDer = await signer.signDigest({
    keyId: unsignedAttestation.signature.protected.keyId,
    keySpec: 'ECC_NIST_P256',
    signingAlgorithm: 'ECDSA_SHA_256',
    messageType: 'DIGEST',
    messageDigest,
  });
  const rawSignature = normalizeP256SignatureToRaw(new Uint8Array(signatureDer));
  const valueBase64 = encodeBase64(rawSignature);
  if (!/^[A-Za-z0-9+/]{85}[AQgw]==$/.test(valueBase64)) {
    throw new PacketGenerationError('PKT_SIGNATURE_INVALID', 'raw signature Base64 is not canonical');
  }
  const attestation: PacketAttestationV2 = {
    ...unsignedAttestation,
    signature: {
      protected: unsignedAttestation.signature.protected,
      valueBase64,
    },
  };
  return { attestation, messageDigestHex };
}
