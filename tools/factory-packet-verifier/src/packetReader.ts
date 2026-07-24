/**
 * packetReader.ts - Independent, defensive FactoryPacket V3 reader (design §14)
 *
 * Parses the store-only FactoryPacket V3 ZIP with `yauzl` and enforces, IN THIS
 * ORDER (zip-bomb / path-traversal defense BEFORE any deep parse):
 *
 *   1. entry-count ceiling
 *   2. per-entry path safety: POSIX-normalized, no absolute / drive / `.` / `..` /
 *      empty segment, and no duplicate path            -> PACKET_EXTRA_FILE
 *   3. per-entry uncompressed size <= maxFileBytes,
 *      compression ratio <= maxCompressionRatio,
 *      running total <= maxTotalUncompressedBytes       -> PACKET_RESOURCE_LIMIT
 *   4. only THEN read content, and require the decoded length to equal the
 *      declared uncompressed size                        -> PACKET_RESOURCE_LIMIT
 *   5. parse manifest + certificate (schemaVersion V3)   -> PACKET_SCHEMA_UNSUPPORTED
 *   6. the packet's exact path set must equal the allowlist
 *      { manifest.json, release-certificate.json } U manifest.files[].path
 *                                                         -> PACKET_EXTRA_FILE
 *
 * Imports NOTHING from the builder. Uses only `yauzl` and node built-ins.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

import {
  vok,
  verr,
  type VResult,
  type VerifierResourceLimits,
  type FactoryPacketManifestV3,
  type ReleaseCertificateV1,
} from './types.js';

export const MANIFEST_PATH = 'manifest.json';
export const CERTIFICATE_PATH = 'release-certificate.json';

export interface RawEntry {
  path: string;
  bytes: Uint8Array;
}

export interface ParsedPacket {
  rawEntries: RawEntry[];
  paths: string[];
  manifest: FactoryPacketManifestV3;
  certificate: ReleaseCertificateV1;
  /** All entries as a path -> bytes map. */
  fileBytes: Map<string, Uint8Array>;
  totalBytes: number;
}

/** POSIX-normalize and reject any unsafe in-packet path. Returns null when unsafe. */
export function safePosixPath(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const posix = raw.replace(/\\/g, '/');
  if (posix.startsWith('/')) return null;
  if (/^[a-zA-Z]:/.test(posix)) return null;
  for (const segment of posix.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return null;
  }
  return posix;
}

/**
 * Read every entry, enforcing resource + path limits BEFORE reading content.
 * Rejects with a stable code; never throws across the boundary.
 */
function readEntries(
  zipBytes: Uint8Array,
  limits: VerifierResourceLimits,
): Promise<VResult<{ entries: RawEntry[]; totalBytes: number }>> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(
      Buffer.from(zipBytes),
      // decodeStrings:false so YAUZL does not pre-reject/normalize entry names -
      // path safety (traversal, absolute, drive, dot segments) is OUR authoritative
      // check and must surface as PACKET_EXTRA_FILE, not a generic parse error.
      { lazyEntries: true, decodeStrings: false, validateEntrySizes: true },
      (openErr, zipfile?: ZipFile) => {
        if (openErr || !zipfile) {
          resolve(verr('PACKET_SCHEMA_UNSUPPORTED', { reason: openErr?.message ?? 'zip could not be opened' }));
          return;
        }

        const entries: RawEntry[] = [];
        const seen = new Set<string>();
        let total = 0;
        let count = 0;
        let settled = false;

        const done = (r: VResult<{ entries: RawEntry[]; totalBytes: number }>): void => {
          if (settled) return;
          settled = true;
          try {
            zipfile.close();
          } catch {
            /* ignore */
          }
          resolve(r);
        };

        zipfile.on('error', (err: Error) => done(verr('PACKET_SCHEMA_UNSUPPORTED', { reason: err.message })));

        zipfile.on('entry', (entry: Entry) => {
          count += 1;
          if (count > limits.maxEntryCount) {
            done(verr('PACKET_RESOURCE_LIMIT', { reason: 'too many entries', count: String(count) }));
            return;
          }

          const rawName = entry.fileName as unknown;
          const declaredName =
            typeof rawName === 'string' ? rawName : Buffer.from(rawName as Uint8Array).toString('utf-8');
          const path = safePosixPath(declaredName);
          if (path === null) {
            done(verr('PACKET_EXTRA_FILE', { reason: 'unsafe entry path', path: declaredName }));
            return;
          }
          if (seen.has(path)) {
            done(verr('PACKET_EXTRA_FILE', { reason: 'duplicate entry path', path }));
            return;
          }
          seen.add(path);

          const uncompressed = entry.uncompressedSize;
          const compressed = entry.compressedSize;
          if (uncompressed > limits.maxFileBytes) {
            done(verr('PACKET_RESOURCE_LIMIT', { reason: 'entry exceeds maxFileBytes', path, bytes: String(uncompressed) }));
            return;
          }
          const ratio = compressed > 0 ? uncompressed / compressed : uncompressed > 0 ? Infinity : 1;
          if (ratio > limits.maxCompressionRatio) {
            done(verr('PACKET_RESOURCE_LIMIT', { reason: 'compression ratio exceeds policy', path, ratio: String(ratio) }));
            return;
          }
          total += uncompressed;
          if (total > limits.maxTotalUncompressedBytes) {
            done(verr('PACKET_RESOURCE_LIMIT', { reason: 'total uncompressed size exceeds policy', total: String(total) }));
            return;
          }

          // Metadata is within limits: now it is safe to read the content.
          zipfile.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) {
              done(verr('PACKET_SCHEMA_UNSUPPORTED', { reason: streamErr?.message ?? 'entry stream unavailable' }));
              return;
            }
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('error', (e: Error) => done(verr('PACKET_RESOURCE_LIMIT', { reason: e.message, path })));
            stream.on('end', () => {
              const bytes = Buffer.concat(chunks);
              if (bytes.length !== uncompressed) {
                done(verr('PACKET_RESOURCE_LIMIT', { reason: 'declared/actual size mismatch', path }));
                return;
              }
              entries.push({ path, bytes: new Uint8Array(bytes) });
              zipfile.readEntry();
            });
          });
        });

        zipfile.on('end', () => done(vok({ entries, totalBytes: total })));
        zipfile.readEntry();
      },
    );
  });
}

function parseJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf-8')) as T;
  } catch {
    return null;
  }
}

/** Read + structurally validate a FactoryPacket V3 packet. */
export async function readFactoryPacket(
  zipBytes: Uint8Array,
  limits: VerifierResourceLimits,
): Promise<VResult<ParsedPacket>> {
  const read = await readEntries(zipBytes, limits);
  if (!read.ok) return read;
  const { entries, totalBytes } = read.value;

  const fileBytes = new Map<string, Uint8Array>();
  for (const e of entries) fileBytes.set(e.path, e.bytes);

  const manifestBytes = fileBytes.get(MANIFEST_PATH);
  if (manifestBytes === undefined) {
    return verr('PACKET_EXTRA_FILE', { reason: 'required manifest.json is missing' });
  }
  const manifest = parseJson<FactoryPacketManifestV3>(manifestBytes);
  if (manifest === null || manifest.schemaVersion !== 'V3' || !Array.isArray(manifest.files)) {
    return verr('PACKET_SCHEMA_UNSUPPORTED', { reason: 'manifest.json is not a V3 manifest' });
  }

  const certBytes = fileBytes.get(CERTIFICATE_PATH);
  if (certBytes === undefined) {
    return verr('PACKET_EXTRA_FILE', { reason: 'required release-certificate.json is missing' });
  }
  const certificate = parseJson<ReleaseCertificateV1>(certBytes);
  if (certificate === null || typeof certificate.releaseRevisionId !== 'string') {
    return verr('PACKET_SCHEMA_UNSUPPORTED', { reason: 'release-certificate.json is not a V3 certificate' });
  }

  // Exact allowlist: the two envelope files plus exactly the manifest-declared files.
  const allow = new Set<string>([MANIFEST_PATH, CERTIFICATE_PATH]);
  for (const f of manifest.files) {
    if (typeof f.path !== 'string') {
      return verr('PACKET_SCHEMA_UNSUPPORTED', { reason: 'manifest file entry has no path' });
    }
    allow.add(f.path);
  }
  const paths = entries.map((e) => e.path);
  if (paths.length !== allow.size) {
    return verr('PACKET_EXTRA_FILE', { reason: 'packet file set is not exactly the allowlist', found: String(paths.length), expected: String(allow.size) });
  }
  for (const p of paths) {
    if (!allow.has(p)) {
      return verr('PACKET_EXTRA_FILE', { reason: 'file not in allowlist', path: p });
    }
  }

  return vok({ rawEntries: entries, paths, manifest, certificate, fileBytes, totalBytes });
}
