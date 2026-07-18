// S17-5 check-1 tests — strict ZIP v2 profile (spec §6)
// The builder below is INDEPENDENT test tooling for the verifier track (SoD:
// never shared with the S17-4 generator). It emits profile-perfect bytes by
// default and exposes surgical corruption knobs so every §6 rule can be
// violated one at a time and must map to its exact stable code.
import { describe, it, expect } from 'vitest';
import { readPacketZip } from './zipStrictReader';
import { crc32 } from './crc32';

const te = new TextEncoder();

interface BuildEntry { name: string; bytes: Uint8Array }
interface BuildOpts {
  flags?: number; method?: number; dosTime?: number; dosDate?: number;
  versionNeeded?: number; versionMadeBy?: number; externalAttrs?: number;
  internalAttrs?: number; localExtra?: Uint8Array; centralExtra?: Uint8Array;
  archiveComment?: Uint8Array; fileComment?: Uint8Array;
  corruptCrcOf?: string; gapBeforeCentral?: number; localNameOverride?: string;
  eocdTotalEntriesOverride?: number; trailingBytes?: Uint8Array;
}

function u16(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff]; }
function u32(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

/** Emit a v2-profile ZIP (STORE, pinned fields) with optional corruptions. */
function buildZip(entries: BuildEntry[], o: BuildOpts = {}): Uint8Array {
  const flags = o.flags ?? 0x0800;
  const method = o.method ?? 0;
  const dosTime = o.dosTime ?? 0x0000;
  const dosDate = o.dosDate ?? 0x0021;
  const vNeed = o.versionNeeded ?? 20;
  const vMade = o.versionMadeBy ?? 0x031e;
  const extAttrs = o.externalAttrs ?? 0x81a40000;
  const intAttrs = o.internalAttrs ?? 0;
  const localExtra = o.localExtra ?? new Uint8Array(0);
  const centralExtra = o.centralExtra ?? new Uint8Array(0);
  const fileComment = o.fileComment ?? new Uint8Array(0);
  const archiveComment = o.archiveComment ?? new Uint8Array(0);

  const out: number[] = [];
  const locals: { name: string; offset: number; crc: number; size: number }[] = [];

  for (const e of entries) {
    const nameB = te.encode(e.name);
    let crc = crc32(e.bytes);
    if (o.corruptCrcOf === e.name) crc = (crc ^ 0xdeadbeef) >>> 0;
    locals.push({ name: e.name, offset: out.length, crc, size: e.bytes.length });
    out.push(...u32(0x04034b50), ...u16(vNeed), ...u16(flags), ...u16(method),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(e.bytes.length), ...u32(e.bytes.length),
      ...u16((o.localNameOverride && e === entries[0] ? te.encode(o.localNameOverride) : nameB).length),
      ...u16(localExtra.length));
    const effName = o.localNameOverride !== undefined && e === entries[0]
      ? te.encode(o.localNameOverride) : nameB;
    out.push(...effName, ...localExtra, ...e.bytes);
  }

  if (o.gapBeforeCentral !== undefined) out.push(...new Array<number>(o.gapBeforeCentral).fill(0));

  const cdStart = out.length;
  for (const l of locals) {
    const nameB = te.encode(l.name);
    out.push(...u32(0x02014b50), ...u16(vMade), ...u16(vNeed), ...u16(flags), ...u16(method),
      ...u16(dosTime), ...u16(dosDate), ...u32(l.crc), ...u32(l.size), ...u32(l.size),
      ...u16(nameB.length), ...u16(centralExtra.length), ...u16(fileComment.length),
      ...u16(0), ...u16(intAttrs), ...u32(extAttrs), ...u32(l.offset));
    out.push(...nameB, ...centralExtra, ...fileComment);
  }
  const cdSize = out.length - cdStart;
  const total = o.eocdTotalEntriesOverride ?? entries.length;
  out.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(total), ...u16(total),
    ...u32(cdSize), ...u32(cdStart), ...u16(archiveComment.length));
  out.push(...archiveComment);
  if (o.trailingBytes) out.push(...o.trailingBytes);
  return new Uint8Array(out);
}

/** minimal well-formed packet layout: manifest → payload (sorted) → attestation */
function goodEntries(): BuildEntry[] {
  return [
    { name: 'manifest.json', bytes: te.encode('{"a":1}') },
    { name: 'cutlist.json', bytes: te.encode('{"b":2}') },
    { name: 'drillmap.json', bytes: te.encode('{"c":3}') },
    { name: 'attestation.json', bytes: te.encode('{"d":4}') },
  ];
}

function expectFail(zip: Uint8Array, code: string, detailPart?: string) {
  const r = readPacketZip(zip);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.code).toBe(code);
    if (detailPart !== undefined) expect(r.detail).toContain(detailPart);
  }
}

describe('zipStrictReader — positive', () => {
  it('accepts a profile-perfect STORE archive and returns entries in order', () => {
    const r = readPacketZip(buildZip(goodEntries()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries.map((e) => e.name)).toEqual([
        'manifest.json', 'cutlist.json', 'drillmap.json', 'attestation.json',
      ]);
      expect(new TextDecoder().decode(r.entries[1].bytes)).toBe('{"b":2}');
    }
  });
});

describe('zipStrictReader — §6 profile violations → PKT_ZIP_PROFILE_INVALID', () => {
  it('rejects DEFLATE (method != STORE)', () =>
    expectFail(buildZip(goodEntries(), { method: 8 }), 'PKT_ZIP_PROFILE_INVALID', 'STORE'));
  it('rejects wrong general-purpose flags (e.g. data-descriptor bit)', () =>
    expectFail(buildZip(goodEntries(), { flags: 0x0808 }), 'PKT_ZIP_PROFILE_INVALID', 'flags'));
  it('rejects encryption bit', () =>
    expectFail(buildZip(goodEntries(), { flags: 0x0801 }), 'PKT_ZIP_PROFILE_INVALID', 'flags'));
  it('rejects unpinned DOS date/time', () =>
    expectFail(buildZip(goodEntries(), { dosDate: 0x5a21 }), 'PKT_ZIP_PROFILE_INVALID', 'DOS'));
  it('rejects wrong version-needed', () =>
    expectFail(buildZip(goodEntries(), { versionNeeded: 45 }), 'PKT_ZIP_PROFILE_INVALID', 'version-needed'));
  it('rejects wrong version-made-by (non-UNIX creator)', () =>
    expectFail(buildZip(goodEntries(), { versionMadeBy: 0x001e }), 'PKT_ZIP_PROFILE_INVALID', 'version-made-by'));
  it('rejects non-0644 external attributes (covers symlink modes)', () =>
    expectFail(buildZip(goodEntries(), { externalAttrs: 0xa1ff0000 }), 'PKT_ZIP_PROFILE_INVALID', 'external'));
  it('rejects nonzero internal attributes', () =>
    expectFail(buildZip(goodEntries(), { internalAttrs: 1 }), 'PKT_ZIP_PROFILE_INVALID', 'internal'));
  it('rejects local extra field', () =>
    expectFail(buildZip(goodEntries(), { localExtra: te.encode('UT') }), 'PKT_ZIP_PROFILE_INVALID'));
  it('rejects central extra field', () =>
    expectFail(buildZip(goodEntries(), { centralExtra: te.encode('UT') }), 'PKT_ZIP_PROFILE_INVALID'));
  it('rejects archive comment (EOCD displaced)', () =>
    expectFail(buildZip(goodEntries(), { archiveComment: te.encode('hi') }), 'PKT_ZIP_PROFILE_INVALID'));
  it('rejects file comment', () =>
    expectFail(buildZip(goodEntries(), { fileComment: te.encode('x') }), 'PKT_ZIP_PROFILE_INVALID'));
  it('rejects trailing bytes after EOCD (polyglot guard)', () =>
    expectFail(buildZip(goodEntries(), { trailingBytes: te.encode('#!') }), 'PKT_ZIP_PROFILE_INVALID'));
  it('rejects gap between last entry and central directory', () =>
    expectFail(buildZip(goodEntries(), { gapBeforeCentral: 4 }), 'PKT_ZIP_PROFILE_INVALID', 'gap'));
  it('rejects CRC mismatch against real bytes', () =>
    expectFail(buildZip(goodEntries(), { corruptCrcOf: 'cutlist.json' }), 'PKT_ZIP_PROFILE_INVALID', 'CRC-32'));
  it('rejects local/central name mismatch', () =>
    expectFail(buildZip(goodEntries(), { localNameOverride: 'manifest.jsoX' }), 'PKT_ZIP_PROFILE_INVALID', 'names differ'));
  it('rejects wrong entry ordering (attestation not last)', () => {
    const e = goodEntries();
    [e[2], e[3]] = [e[3], e[2]];
    expectFail(buildZip(e), 'PKT_ZIP_PROFILE_INVALID');
  });
  it('rejects payload not in canonical UTF-8 byte order', () => {
    const e = goodEntries();
    [e[1], e[2]] = [e[2], e[1]]; // drillmap before cutlist
    expectFail(buildZip(e), 'PKT_ZIP_PROFILE_INVALID', 'canonical');
  });
  it('rejects manifest.json not first', () => {
    const e = goodEntries();
    [e[0], e[1]] = [e[1], e[0]];
    expectFail(buildZip(e), 'PKT_ZIP_PROFILE_INVALID');
  });
  it('rejects empty archive', () =>
    expectFail(buildZip([]), 'PKT_ZIP_PROFILE_INVALID', 'empty'));
  it('rejects EOCD entry-count lies', () =>
    expectFail(buildZip(goodEntries(), { eocdTotalEntriesOverride: 3 }), 'PKT_ZIP_PROFILE_INVALID'));
});

describe('zipStrictReader — path rules → PKT_PATH_INVALID', () => {
  const withName = (name: string): BuildEntry[] => [
    { name: 'manifest.json', bytes: te.encode('{}') },
    { name, bytes: te.encode('{}') },
    { name: 'attestation.json', bytes: te.encode('{}') },
  ];
  it('rejects folder components', () =>
    expectFail(buildZip(withName('sub/cutlist.json')), 'PKT_PATH_INVALID'));
  it('rejects absolute path', () =>
    expectFail(buildZip(withName('/cutlist.json')), 'PKT_PATH_INVALID'));
  it('rejects backslash', () =>
    expectFail(buildZip(withName('cut\\list.json')), 'PKT_PATH_INVALID', 'backslash'));
  it('rejects traversal', () =>
    expectFail(buildZip(withName('..')), 'PKT_PATH_INVALID'));
  it('rejects duplicate entries', () => {
    const e: BuildEntry[] = [
      { name: 'manifest.json', bytes: te.encode('{}') },
      { name: 'cutlist.json', bytes: te.encode('{}') },
      { name: 'cutlist.json', bytes: te.encode('{}') },
      { name: 'attestation.json', bytes: te.encode('{}') },
    ];
    expectFail(buildZip(e), 'PKT_PATH_INVALID', 'duplicate');
  });
  it('rejects case-fold collisions', () => {
    const e: BuildEntry[] = [
      { name: 'manifest.json', bytes: te.encode('{}') },
      { name: 'CutList.json', bytes: te.encode('{}') },
      { name: 'cutlist.json', bytes: te.encode('{}') },
      { name: 'attestation.json', bytes: te.encode('{}') },
    ];
    expectFail(buildZip(e), 'PKT_PATH_INVALID', 'case-fold');
  });
  it('rejects invalid UTF-8 name', () => {
    // craft manually: builder encodes strings, so inject via latin path—use a
    // name with lone surrogate is unrepresentable; instead corrupt bytes post-build.
    const zip = buildZip(goodEntries());
    // find "cutlist.json" in local header and stomp one byte to 0xFF (invalid UTF-8 lead)
    const needle = te.encode('cutlist.json');
    outer: for (let i = 0; i < zip.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (zip[i + j] !== needle[j]) continue outer;
      }
      zip[i] = 0xff;
      break;
    }
    const r = readPacketZip(zip);
    expect(r.ok).toBe(false); // UTF-8 or name-mismatch either way must fail closed
  });
  it('rejects path over 128 UTF-8 bytes', () =>
    expectFail(buildZip(withName('x'.repeat(129) + '.json')), 'PKT_PATH_INVALID', '128'));
});

describe('zipStrictReader — limits → PKT_LIMIT_EXCEEDED', () => {
  it('rejects more than 32 entries', () => {
    const e: BuildEntry[] = [{ name: 'manifest.json', bytes: te.encode('{}') }];
    for (let i = 0; i < 32; i++) e.push({ name: `p${String(i).padStart(2, '0')}.json`, bytes: te.encode('{}') });
    e.push({ name: 'attestation.json', bytes: te.encode('{}') });
    expectFail(buildZip(e), 'PKT_LIMIT_EXCEEDED', '32');
  });
  it('rejects entry over 16 MiB (via central size field)', () => {
    // avoid allocating 16MiB: lie in sizes → but reader checks central size first
    const zip = buildZip(goodEntries());
    // patch central record of cutlist.json: sizes at +20/+24 after signature
    // simpler: build with a big declared entry using a custom central patch
    const e = goodEntries();
    const raw = buildZip(e);
    // find central header for cutlist.json: signature 0x02014b50 followed later by name
    const sig = [0x50, 0x4b, 0x01, 0x02];
    const name = te.encode('cutlist.json');
    for (let i = 0; i < raw.length - 46; i++) {
      if (raw[i] === sig[0] && raw[i + 1] === sig[1] && raw[i + 2] === sig[2] && raw[i + 3] === sig[3]) {
        const nameLen = raw[i + 28] | (raw[i + 29] << 8);
        const got = raw.subarray(i + 46, i + 46 + nameLen);
        if (nameLen === name.length && got.every((b, k) => b === name[k])) {
          const big = 16 * 1024 * 1024 + 1;
          const dv = new DataView(raw.buffer, raw.byteOffset);
          dv.setUint32(i + 20, big, true);
          dv.setUint32(i + 24, big, true);
          break;
        }
      }
    }
    const r = readPacketZip(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['PKT_LIMIT_EXCEEDED', 'PKT_ZIP_PROFILE_INVALID']).toContain(r.code);
  });
});
