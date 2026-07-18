import {
  assertCanonicalPath,
  compareUtf8,
  concatBytes,
  PacketGenerationError,
  utf8,
} from './canonical.js';
import { ZIP_PROFILE } from './constants.js';

export interface DeterministicZipEntry {
  path: string;
  bytes: Uint8Array;
}

interface EncodedZipEntry extends DeterministicZipEntry {
  nameBytes: Uint8Array;
  crc32: number;
  localOffset: number;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createDeterministicZip(entries: readonly DeterministicZipEntry[]): Uint8Array {
  validateEntries(entries);
  const encoded: EncodedZipEntry[] = [];
  const localChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = utf8(entry.path);
    const normalizedBytes = new Uint8Array(entry.bytes);
    const item: EncodedZipEntry = {
      path: entry.path,
      bytes: normalizedBytes,
      nameBytes,
      crc32: crc32(normalizedBytes),
      localOffset,
    };
    const header = localHeader(item);
    localChunks.push(header, nameBytes, normalizedBytes);
    localOffset += header.byteLength + nameBytes.byteLength + normalizedBytes.byteLength;
    encoded.push(item);
  }

  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of encoded) {
    const header = centralHeader(entry);
    centralChunks.push(header, entry.nameBytes);
    centralSize += header.byteLength + entry.nameBytes.byteLength;
  }

  const eocd = endOfCentralDirectory(entries.length, centralSize, localOffset);
  return concatBytes(...localChunks, ...centralChunks, eocd);
}

function validateEntries(entries: readonly DeterministicZipEntry[]): void {
  if (entries.length < 3 || entries.length > ZIP_PROFILE.maxEntries) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', 'entry count is outside controlled-pilot limits');
  }
  if (entries[0]?.path !== 'manifest.json' || entries[entries.length - 1]?.path !== 'attestation.json') {
    throw new PacketGenerationError(
      'PKT_ZIP_PROFILE_INVALID',
      'entry order must be manifest, canonical payloads, attestation',
    );
  }
  const payloadPaths = entries.slice(1, -1).map((entry) => entry.path);
  const sortedPayloadPaths = [...payloadPaths].sort(compareUtf8);
  if (payloadPaths.some((path, index) => path !== sortedPayloadPaths[index])) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', 'payload entries are not in UTF-8 byte order');
  }

  const paths = new Set<string>();
  const foldedPaths = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    assertCanonicalPath(entry.path);
    if (entry.path.includes('/')) {
      throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `v2 entries must be at ZIP root: ${entry.path}`);
    }
    const pathBytes = utf8(entry.path);
    if (pathBytes.byteLength > ZIP_PROFILE.maxPathBytes) {
      throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `path is longer than 128 UTF-8 bytes: ${entry.path}`);
    }
    const folded = entry.path.toLowerCase();
    if (paths.has(entry.path) || foldedPaths.has(folded)) {
      throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `duplicate or case-fold collision: ${entry.path}`);
    }
    if (entry.bytes.byteLength > ZIP_PROFILE.maxEntryBytes) {
      throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `entry exceeds 16 MiB: ${entry.path}`);
    }
    paths.add(entry.path);
    foldedPaths.add(folded);
    total += entry.bytes.byteLength;
  }
  if (total > ZIP_PROFILE.maxTotalBytes) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', 'archive exceeds 64 MiB uncompressed');
  }
}

function localHeader(entry: EncodedZipEntry): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, ZIP_PROFILE.versionNeeded, true);
  view.setUint16(6, ZIP_PROFILE.utf8Flag, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, ZIP_PROFILE.dosTime, true);
  view.setUint16(12, ZIP_PROFILE.dosDate, true);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.bytes.byteLength, true);
  view.setUint32(22, entry.bytes.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  return bytes;
}

function centralHeader(entry: EncodedZipEntry): Uint8Array {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, ZIP_PROFILE.versionMadeBy, true);
  view.setUint16(6, ZIP_PROFILE.versionNeeded, true);
  view.setUint16(8, ZIP_PROFILE.utf8Flag, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, ZIP_PROFILE.dosTime, true);
  view.setUint16(14, ZIP_PROFILE.dosDate, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.bytes.byteLength, true);
  view.setUint32(24, entry.bytes.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, ZIP_PROFILE.externalAttributes, true);
  view.setUint32(42, entry.localOffset, true);
  return bytes;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return bytes;
}
