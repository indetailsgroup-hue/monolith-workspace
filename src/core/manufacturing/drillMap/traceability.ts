/**
 * traceability.ts — Deterministic hashing + metadata for DrillMap audit trail
 *
 * Provides:
 * - stableStringify(): canonical JSON (sorted keys) for deterministic hashing
 * - sha256HexSync(): synchronous SHA-256 (pure TS, no crypto.subtle)
 * - buildDrillMapMeta(): builds DrillMapMeta from merged config/params
 *
 * WHY sync SHA-256?
 * generateMinifixDrillMap() is synchronous (called from React render path).
 * The project's existing sha256Hex() in src/crypto/sha256.ts uses async
 * crypto.subtle which cannot be used here. This pure-TS implementation
 * produces identical output and is used ONLY for audit hashing (not security).
 *
 * @version 1.0.0
 */

import type { DrillMapMeta } from './types';

// ============================================================================
// Stable Stringify (canonical JSON — sorted keys at every depth)
// ============================================================================

/**
 * Deterministic JSON stringify with sorted keys at every nesting level.
 * Same object with different key insertion order → identical string.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// ============================================================================
// SHA-256 (synchronous, pure TypeScript — no dependencies)
// ============================================================================

/**
 * Synchronous SHA-256 hash returning 64-char hex string.
 * Pure TypeScript — no Node crypto, no async crypto.subtle.
 *
 * Used for audit hashing of config/params inputs. For security-critical
 * hashing (signatures, manifests), use src/crypto/sha256.ts instead.
 */
export function sha256HexSync(input: string): string {
  // SHA-256 constants
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function ror(x: number, n: number): number { return (x >>> n) | (x << (32 - n)); }
  function ch(x: number, y: number, z: number): number { return (x & y) ^ (~x & z); }
  function maj(x: number, y: number, z: number): number { return (x & y) ^ (x & z) ^ (y & z); }
  function sigma0(x: number): number { return ror(x, 2) ^ ror(x, 13) ^ ror(x, 22); }
  function sigma1(x: number): number { return ror(x, 6) ^ ror(x, 11) ^ ror(x, 25); }
  function gamma0(x: number): number { return ror(x, 7) ^ ror(x, 18) ^ (x >>> 3); }
  function gamma1(x: number): number { return ror(x, 17) ^ ror(x, 19) ^ (x >>> 10); }

  // UTF-8 encode
  const enc = new TextEncoder().encode(input);
  const msgLen = enc.length;
  const bitLen = msgLen * 8;

  // Padding: message + 0x80 + zeros + 8-byte big-endian length
  const withOne = msgLen + 1;
  const padLen = (withOne % 64 <= 56)
    ? (56 - (withOne % 64))
    : (56 + (64 - (withOne % 64)));
  const total = withOne + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(enc, 0);
  buf[msgLen] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 2 ** 32), false);
  view.setUint32(total - 4, bitLen >>> 0, false);

  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const W = new Uint32Array(64);

  // Process 64-byte blocks
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      W[i] = (gamma1(W[i - 2]) + W[i - 7] + gamma0(W[i - 15]) + W[i - 16]) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[i] + W[i]) >>> 0;
      const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  // Produce 64-char hex output
  const result = new DataView(new ArrayBuffer(32));
  result.setUint32(0, h0); result.setUint32(4, h1);
  result.setUint32(8, h2); result.setUint32(12, h3);
  result.setUint32(16, h4); result.setUint32(20, h5);
  result.setUint32(24, h6); result.setUint32(28, h7);

  let hex = '';
  for (let i = 0; i < 32; i++) {
    hex += result.getUint8(i).toString(16).padStart(2, '0');
  }
  return hex;
}

// ============================================================================
// DrillMap Meta Builder
// ============================================================================

/** Generator version — bump when algorithm changes */
const GENERATOR_VERSION = '1.0.0';

/**
 * Build DrillMapMeta from merged config and params.
 * Hashes are computed from stableStringify → sha256HexSync.
 * Timestamps are NOT included in hashes (for determinism).
 */
export function buildDrillMapMeta(args: {
  generatorName: string;
  fullConfig: Record<string, unknown>;
  fullParams: Record<string, unknown>;
  connectorCount?: number;
  presetId?: string;
}): DrillMapMeta {
  const configCanonical = stableStringify(args.fullConfig);
  const paramsCanonical = stableStringify(args.fullParams);

  return {
    generator: {
      name: args.generatorName,
      version: GENERATOR_VERSION,
      env: (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ? 'dev' : 'prod',
    },
    inputs: {
      connectorCount: args.connectorCount,
      presetId: args.presetId,
      configHash: sha256HexSync(configCanonical),
      paramsHash: sha256HexSync(paramsCanonical),
    },
    timestamps: {
      generatedAtIso: new Date().toISOString(),
    },
  };
}
