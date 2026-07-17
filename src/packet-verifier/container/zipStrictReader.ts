// S17-5 check 1 — Container safety: strict ZIP v2 byte-profile reader (spec §6).
//
// Deliberately hand-written: general-purpose ZIP libraries silently "repair"
// exactly the conditions this verifier must REJECT (data descriptors, ZIP64,
// extra fields, comments, local/central mismatches, duplicate entries, gaps).
// The reader is fail-closed: any deviation from the v2 byte profile returns a
// stable failure code; nothing is normalized before judgment.
//
// Enforced (spec §6, profile rules 1–8):
//   r1  no folder prefixes / directory entries
//   r2  entry order: manifest.json first, payload in canonical path order,
//       attestation.json last
//   r3  method 0 (STORE) only
//   r4  DOS date 0x0021 (1980-01-01), DOS time 0x0000
//   r5  flags 0x0800 (UTF-8 only) · version-needed 2.0 (20) · version-made-by
//       UNIX/3.0 (0x031e) · external attrs 0644 regular file (0x81a40000) ·
//       internal attrs 0
//   r6  no encryption / data descriptor / ZIP64 / extra field / comments /
//       directory entries / symlinks / duplicates / local-vs-central name
//       mismatch / traversal / absolute path / backslash / case-fold collision
//   r7  CRC-32 + size fields consistent local↔central AND against real bytes;
//       central order == local order
//   r8  limits: ≤32 entries · ≤16 MiB per entry · ≤64 MiB total · path ≤128
//       UTF-8 bytes · no multi-disk
// Plus: byte-exact layout — local entries back-to-back from offset 0, then
// central directory, then EOCD; no gaps, no prefix, no trailing bytes.

import { crc32 } from './crc32';
import type { PacketFailureCode } from '../codes';

export interface ZipEntry {
  /** canonical entry name (validated UTF-8, forward-slash-free root name) */
  name: string;
  /** raw stored bytes (STORE ⇒ identical to uncompressed content) */
  bytes: Uint8Array;
}

export type ZipReadResult =
  | { ok: true; entries: readonly ZipEntry[] }
  | { ok: false; code: PacketFailureCode; detail: string };

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const LIMIT_ENTRIES = 32;
const LIMIT_ENTRY_BYTES = 16 * 1024 * 1024;
const LIMIT_TOTAL_BYTES = 64 * 1024 * 1024;
const LIMIT_PATH_BYTES = 128;

const FLAGS_REQUIRED = 0x0800;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 0x031e; // UNIX (3) << 8 | 30 (3.0)
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;
const EXTERNAL_ATTRS = 0x81a40000; // regular file 0644
const CONTROL_FIRST = 'manifest.json';
const CONTROL_LAST = 'attestation.json';

function fail(code: PacketFailureCode, detail: string): ZipReadResult {
  return { ok: false, code, detail };
}

/** strict UTF-8 decode (reject invalid sequences — no replacement characters). */
function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function validateEntryName(nameBytes: Uint8Array): { name?: string; error?: string } {
  if (nameBytes.length === 0) return { error: 'empty entry name' };
  if (nameBytes.length > LIMIT_PATH_BYTES) return { error: `path exceeds ${LIMIT_PATH_BYTES} UTF-8 bytes` };
  const name = decodeUtf8Strict(nameBytes);
  if (name === null) return { error: 'entry name is not valid UTF-8' };
  for (const ch of name) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x20 || cp === 0x7f) return { error: 'control character in entry name' };
  }
  if (name.includes('\\')) return { error: 'backslash in entry name' };
  if (name.startsWith('/')) return { error: 'absolute path' };
  if (name.includes('/')) return { error: 'folder prefix / directory component (root entries only)' };
  if (name === '.' || name === '..' || name.includes('..')) return { error: 'path traversal segment' };
  if (name.endsWith('/')) return { error: 'directory entry' };
  return { name };
}

/**
 * Parse + validate a packet ZIP against the v2 byte profile.
 * Returns entries in **archive order** (order itself is validated: r2).
 */
export function readPacketZip(zip: Uint8Array): ZipReadResult {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);

  // ---- EOCD: comments are forbidden (r6) ⇒ EOCD sits exactly at length-22 ----
  if (zip.length < 22) return fail('PKT_ZIP_PROFILE_INVALID', 'shorter than an empty ZIP');
  const eocdOff = zip.length - 22;
  if (u32(eocdOff) !== SIG_EOCD) {
    return fail('PKT_ZIP_PROFILE_INVALID', 'EOCD not at expected offset (archive comment or trailing bytes are forbidden)');
  }
  const diskNo = u16(eocdOff + 4);
  const cdDisk = u16(eocdOff + 6);
  const entriesOnDisk = u16(eocdOff + 8);
  const entriesTotal = u16(eocdOff + 10);
  const cdSize = u32(eocdOff + 12);
  const cdOffset = u32(eocdOff + 16);
  const commentLen = u16(eocdOff + 20);
  if (commentLen !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'archive comment present');
  if (diskNo !== 0 || cdDisk !== 0 || entriesOnDisk !== entriesTotal) {
    return fail('PKT_ZIP_PROFILE_INVALID', 'multi-disk archive');
  }
  if (entriesTotal === 0) return fail('PKT_ZIP_PROFILE_INVALID', 'empty archive');
  if (entriesTotal > LIMIT_ENTRIES) return fail('PKT_LIMIT_EXCEEDED', `more than ${LIMIT_ENTRIES} entries`);
  if (cdOffset + cdSize !== eocdOff) {
    return fail('PKT_ZIP_PROFILE_INVALID', 'gap or overlap between central directory and EOCD');
  }
  if (entriesTotal === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return fail('PKT_ZIP_PROFILE_INVALID', 'ZIP64 sentinel values');
  }

  // ---- central directory: fixed-field profile + collect records (r5/r6/r8) ----
  interface Central {
    name: string;
    crc: number;
    compSize: number;
    uncompSize: number;
    localOffset: number;
  }
  const centrals: Central[] = [];
  let off = cdOffset;
  for (let i = 0; i < entriesTotal; i++) {
    if (off + 46 > eocdOff) return fail('PKT_ZIP_PROFILE_INVALID', 'central directory truncated');
    if (u32(off) !== SIG_CENTRAL) return fail('PKT_ZIP_PROFILE_INVALID', 'bad central-header signature');
    const madeBy = u16(off + 4);
    const needed = u16(off + 6);
    const flags = u16(off + 8);
    const method = u16(off + 10);
    const dosTime = u16(off + 12);
    const dosDate = u16(off + 14);
    const crc = u32(off + 16);
    const compSize = u32(off + 20);
    const uncompSize = u32(off + 24);
    const nameLen = u16(off + 28);
    const extraLen = u16(off + 30);
    const commentLen2 = u16(off + 32);
    const diskStart = u16(off + 34);
    const internalAttrs = u16(off + 36);
    const externalAttrs = u32(off + 38);
    const localOffset = u32(off + 42);

    if (madeBy !== VERSION_MADE_BY) return fail('PKT_ZIP_PROFILE_INVALID', `version-made-by 0x${madeBy.toString(16)} != UNIX/3.0`);
    if (needed !== VERSION_NEEDED) return fail('PKT_ZIP_PROFILE_INVALID', `version-needed ${needed} != 2.0`);
    if (flags !== FLAGS_REQUIRED) {
      // covers encryption (bit0), data descriptor (bit3), anything but UTF-8 bit
      return fail('PKT_ZIP_PROFILE_INVALID', `general-purpose flags 0x${flags.toString(16)} != 0x0800`);
    }
    if (method !== 0) return fail('PKT_ZIP_PROFILE_INVALID', `compression method ${method} != STORE`);
    if (dosTime !== DOS_TIME || dosDate !== DOS_DATE) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'DOS time/date not pinned to 1980-01-01 00:00');
    }
    if (extraLen !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'extra field present (central)');
    if (commentLen2 !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'file comment present');
    if (diskStart !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'multi-disk entry');
    if (internalAttrs !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'internal attributes not zero');
    if (externalAttrs !== EXTERNAL_ATTRS) {
      // also rejects symlink modes (r6) — only regular-file 0644 is allowed
      return fail('PKT_ZIP_PROFILE_INVALID', `external attributes 0x${externalAttrs.toString(16)} != 0644 regular file`);
    }
    if (compSize !== uncompSize) return fail('PKT_ZIP_PROFILE_INVALID', 'STORE sizes disagree (central)');
    if (uncompSize > LIMIT_ENTRY_BYTES) return fail('PKT_LIMIT_EXCEEDED', 'entry exceeds 16 MiB');
    if (off + 46 + nameLen + extraLen + commentLen2 > eocdOff) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'central record overruns directory');
    }
    const nameBytes = zip.subarray(off + 46, off + 46 + nameLen);
    const v = validateEntryName(nameBytes);
    if (v.error !== undefined) return fail('PKT_PATH_INVALID', v.error);
    centrals.push({ name: v.name as string, crc, compSize, uncompSize, localOffset });
    off += 46 + nameLen;
  }
  if (off !== eocdOff) return fail('PKT_ZIP_PROFILE_INVALID', 'central directory size mismatch');

  // ---- duplicates + case-fold collisions (r6) ----
  const seenExact = new Set<string>();
  const seenFold = new Set<string>();
  for (const c of centrals) {
    if (seenExact.has(c.name)) return fail('PKT_PATH_INVALID', `duplicate entry ${c.name}`);
    const folded = c.name.toLowerCase();
    if (seenFold.has(folded)) return fail('PKT_PATH_INVALID', `case-fold collision on ${c.name}`);
    seenExact.add(c.name);
    seenFold.add(folded);
  }

  // ---- local records: back-to-back from offset 0, fields matching central (r7) ----
  const entries: ZipEntry[] = [];
  let cursor = 0;
  let totalBytes = 0;
  for (const c of centrals) {
    if (c.localOffset !== cursor) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'central order != local order, or gap between local entries');
    }
    if (cursor + 30 > cdOffset) return fail('PKT_ZIP_PROFILE_INVALID', 'local header overruns central directory');
    if (u32(cursor) !== SIG_LOCAL) return fail('PKT_ZIP_PROFILE_INVALID', 'bad local-header signature');
    const needed = u16(cursor + 4);
    const flags = u16(cursor + 6);
    const method = u16(cursor + 8);
    const dosTime = u16(cursor + 10);
    const dosDate = u16(cursor + 12);
    const crc = u32(cursor + 14);
    const compSize = u32(cursor + 18);
    const uncompSize = u32(cursor + 22);
    const nameLen = u16(cursor + 26);
    const extraLen = u16(cursor + 28);
    if (needed !== VERSION_NEEDED || flags !== FLAGS_REQUIRED || method !== 0 ||
        dosTime !== DOS_TIME || dosDate !== DOS_DATE) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'local header fields deviate from v2 profile');
    }
    if (extraLen !== 0) return fail('PKT_ZIP_PROFILE_INVALID', 'extra field present (local)');
    if (crc !== c.crc || compSize !== c.compSize || uncompSize !== c.uncompSize) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'local record disagrees with central record');
    }
    const nameBytes = zip.subarray(cursor + 30, cursor + 30 + nameLen);
    const localName = decodeUtf8Strict(nameBytes);
    if (localName !== c.name) return fail('PKT_ZIP_PROFILE_INVALID', 'local/central names differ');

    const dataStart = cursor + 30 + nameLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > cdOffset) return fail('PKT_ZIP_PROFILE_INVALID', 'entry data overruns central directory');
    const bytes = zip.subarray(dataStart, dataEnd);
    if (crc32(bytes) !== c.crc) return fail('PKT_ZIP_PROFILE_INVALID', `CRC-32 mismatch on ${c.name}`);

    totalBytes += uncompSize;
    if (totalBytes > LIMIT_TOTAL_BYTES) return fail('PKT_LIMIT_EXCEEDED', 'total uncompressed size exceeds 64 MiB');

    entries.push({ name: c.name, bytes });
    cursor = dataEnd;
  }
  if (cursor !== cdOffset) return fail('PKT_ZIP_PROFILE_INVALID', 'gap between last entry and central directory');

  // ---- ordering (r2): manifest.json first · payload canonical order · attestation.json last ----
  const names = entries.map((e) => e.name);
  if (names[0] !== CONTROL_FIRST) return fail('PKT_ZIP_PROFILE_INVALID', `first entry must be ${CONTROL_FIRST}`);
  if (names[names.length - 1] !== CONTROL_LAST) {
    return fail('PKT_ZIP_PROFILE_INVALID', `last entry must be ${CONTROL_LAST}`);
  }
  const payload = names.slice(1, -1);
  if (payload.includes(CONTROL_FIRST) || payload.includes(CONTROL_LAST)) {
    return fail('PKT_PATH_INVALID', 'control file duplicated among payload'); // defence-in-depth (dup check above)
  }
  for (let i = 1; i < payload.length; i++) {
    const a = new TextEncoder().encode(payload[i - 1]);
    const b = new TextEncoder().encode(payload[i]);
    let cmp = 0;
    const n = Math.min(a.length, b.length);
    for (let j = 0; j < n && cmp === 0; j++) cmp = a[j] - b[j];
    if (cmp === 0) cmp = a.length - b.length;
    if (cmp >= 0) {
      return fail('PKT_ZIP_PROFILE_INVALID', 'payload entries not in canonical UTF-8 byte order');
    }
  }

  return { ok: true, entries };
}
