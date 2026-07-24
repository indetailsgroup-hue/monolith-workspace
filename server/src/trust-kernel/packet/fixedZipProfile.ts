/**
 * fixedZipProfile.ts - Deterministic store-only ZIP writer (design §11.1)
 *
 * The packaging layer of the FactoryPacket V3 builder. Byte-for-byte
 * reproducibility is the contract: the output is a PURE FUNCTION of the declared
 * entry bytes plus the constants pinned here, and is independent of the runtime
 * locale, wall clock, filesystem ordering, and randomness (design §11.1, §16.2).
 *
 * Why hand-rolled instead of `yazl` (which the server already depends on):
 *   - yazl defaults every entry's mtime to `new Date()` (wall clock),
 *   - yazl's `dateToDosDateTime` reads LOCAL date components (getFullYear/
 *     getHours/...), so even a fixed Date encodes different DOS bytes across
 *     timezones,
 *   - yazl injects an extended-timestamp (0x5455) extra field derived from that
 *     mtime.
 * All three couple the bytes to clock/locale. A fixed store-only writer with no
 * extra fields removes every one of those degrees of freedom.
 *
 * Profile constants (identical on every entry, every platform):
 *   - method 0 (STORE, no compression)
 *   - DOS date 1980-01-01, DOS time 00:00:00
 *   - UTF-8 filename flag (general purpose bit 11)
 *   - fixed UNIX permissions 0100644 in the central-directory external attrs
 *   - no extra fields, no comments, sorted POSIX paths, exact allowlist
 *
 * Phase: NOT_FOR_PRODUCTION. Pure functions only; no I/O, clock, or randomness.
 *
 * @version 0.13.2
 */

import type { TrustReasonCode } from '../reasonCodes.js';

// ============================================================================
// Pinned ZIP profile constants
// ============================================================================

/** DOS date for 1980-01-01: day(1) | month(1)<<5 | (year-1980=0)<<9 = 0x0021. */
export const FIXED_ZIP_DOS_DATE = 0x0021;
/** DOS time for 00:00:00. */
export const FIXED_ZIP_DOS_TIME = 0x0000;
/** General purpose bit flag: bit 11 (UTF-8 filename encoding). */
export const ZIP_UTF8_FLAG = 0x0800;
/** Store (no compression). */
export const ZIP_METHOD_STORE = 0x0000;
/** Version needed to extract: 2.0. */
export const ZIP_VERSION_NEEDED = 20;
/** Version made by: host UNIX (3) << 8 | spec 2.0 (20). */
export const ZIP_VERSION_MADE_BY = (3 << 8) | 20;
/** External file attributes: fixed regular-file permissions 0100644 in high 16 bits. */
export const ZIP_EXTERNAL_ATTRS = 0o100644 << 16;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

// ============================================================================
// Errors
// ============================================================================

/** Thrown on any packaging-integrity violation; carries a stable reason code. */
export class ZipProfileError extends Error {
  readonly code: TrustReasonCode;
  constructor(code: TrustReasonCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ZipProfileError';
    this.code = code;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ZipEntry {
  /** Path as declared; backslashes are normalized to POSIX before packaging. */
  path: string;
  bytes: Uint8Array;
}

export interface ZipReadEntry {
  path: string;
  bytes: Uint8Array;
}

// ============================================================================
// CRC-32 (IEEE 802.3, reflected 0xEDB88320) - hand-rolled for zero version drift
// ============================================================================

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ============================================================================
// Path normalization and validation
// ============================================================================

/**
 * Normalize a declared path to its canonical POSIX form: backslashes to `/`,
 * Unicode NFC (so visually identical names produce identical bytes, design
 * §11.1), and reject anything that is not a safe relative in-packet path.
 */
export function normalizeZipPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new ZipProfileError('PACKET_EXTRA_FILE', 'empty or non-string path');
  }
  const posix = rawPath.replace(/\\/g, '/').normalize('NFC');
  if (posix.startsWith('/')) {
    throw new ZipProfileError('PACKET_EXTRA_FILE', `absolute path not allowed: ${posix}`);
  }
  if (/^[a-zA-Z]:/.test(posix)) {
    throw new ZipProfileError('PACKET_EXTRA_FILE', `drive-qualified path not allowed: ${posix}`);
  }
  for (const segment of posix.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ZipProfileError('PACKET_EXTRA_FILE', `unsafe path segment in: ${posix}`);
    }
  }
  return posix;
}

function normalizeAllowlist(allowlist: readonly string[]): Set<string> {
  return new Set(allowlist.map((a) => a.replace(/\\/g, '/').normalize('NFC')));
}

// ============================================================================
// buildFixedZip - the deterministic packager
// ============================================================================

/**
 * Package `entries` into a store-only ZIP whose bytes are a pure function of the
 * declared bytes and the pinned constants. Paths are normalized, checked against
 * the exact allowlist, de-duplicated, and sorted; any violation throws a
 * `ZipProfileError` and yields zero output (builder all-or-nothing).
 */
export function buildFixedZip(entries: readonly ZipEntry[], allowlist: readonly string[]): Uint8Array {
  const allow = normalizeAllowlist(allowlist);
  const seen = new Set<string>();

  const normalized = entries.map((entry) => {
    const path = normalizeZipPath(entry.path);
    if (seen.has(path)) {
      throw new ZipProfileError('PACKET_EXTRA_FILE', `duplicate path: ${path}`);
    }
    seen.add(path);
    if (!allow.has(path)) {
      throw new ZipProfileError('PACKET_EXTRA_FILE', `path not in allowlist: ${path}`);
    }
    return { path, bytes: entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes) };
  });

  // Sort by UTF-16 code unit - identical to Array.prototype.sort() default so a
  // caller's `expect(paths).toEqual([...paths].sort())` holds.
  normalized.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of normalized) {
    const nameBuf = Buffer.from(entry.path, 'utf-8');
    const data = Buffer.from(entry.bytes);
    const crc = crc32(entry.bytes);
    const size = data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(ZIP_METHOD_STORE, 8);
    local.writeUInt16LE(FIXED_ZIP_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_ZIP_DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(ZIP_VERSION_MADE_BY, 4);
    central.writeUInt16LE(ZIP_VERSION_NEEDED, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(ZIP_METHOD_STORE, 10);
    central.writeUInt16LE(FIXED_ZIP_DOS_TIME, 12);
    central.writeUInt16LE(FIXED_ZIP_DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(ZIP_EXTERNAL_ATTRS >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));

    offset += local.length + nameBuf.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of centralParts) centralSize += c.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(normalized.length, 8);
  eocd.writeUInt16LE(normalized.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return new Uint8Array(Buffer.concat([...localParts, ...centralParts, eocd]));
}

// ============================================================================
// readFixedZip / listZipPaths - parse the store-only format this module writes
// ============================================================================

/** Parse a store-only ZIP produced by `buildFixedZip` into its entries in central-directory order. */
export function readFixedZip(zip: Uint8Array): ZipReadEntry[] {
  const buf = Buffer.from(zip);
  if (buf.length < 22) {
    throw new ZipProfileError('PACKET_SCHEMA_UNSUPPORTED', 'truncated zip');
  }
  // No comment is ever written, so the EOCD is the final 22 bytes.
  const eocd = buf.length - 22;
  if (buf.readUInt32LE(eocd) !== SIG_EOCD) {
    throw new ZipProfileError('PACKET_SCHEMA_UNSUPPORTED', 'EOCD signature not found');
  }
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipReadEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipProfileError('PACKET_SCHEMA_UNSUPPORTED', 'central directory signature not found');
    }
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf-8', p + 46, p + 46 + nameLen);

    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const bytes = new Uint8Array(buf.subarray(dataStart, dataStart + size));

    out.push({ path: name, bytes });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The sorted POSIX path list carried by a store-only ZIP (central-directory order). */
export function listZipPaths(zip: Uint8Array): string[] {
  return readFixedZip(zip).map((e) => e.path);
}
