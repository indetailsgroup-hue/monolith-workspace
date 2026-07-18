// S17-5 testkit — profile-perfect ZIP writer (§6 v2 byte profile).
// Emits exactly what the strict reader accepts; corpus tests mutate the
// OUTPUT bytes (or the inputs) to produce violations. Verifier-track only.

import { crc32 } from '../container/crc32';
import type { ZipEntry } from '../container/zipStrictReader';

const te = new TextEncoder();

function u16(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff]; }
function u32(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

/** Write entries (already in §6 order) as a v2-profile STORE archive. */
export function writePacketZip(entries: readonly ZipEntry[]): Uint8Array {
  const out: number[] = [];
  const locals: { name: Uint8Array; offset: number; crc: number; size: number }[] = [];
  for (const e of entries) {
    const name = te.encode(e.name);
    const crc = crc32(e.bytes);
    locals.push({ name, offset: out.length, crc, size: e.bytes.length });
    out.push(...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0x0000), ...u16(0x0021), ...u32(crc), ...u32(e.bytes.length), ...u32(e.bytes.length),
      ...u16(name.length), ...u16(0));
    out.push(...name, ...e.bytes);
  }
  const cdStart = out.length;
  for (const l of locals) {
    out.push(...u32(0x02014b50), ...u16(0x031e), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0x0000), ...u16(0x0021), ...u32(l.crc), ...u32(l.size), ...u32(l.size),
      ...u16(l.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0x81a40000), ...u32(l.offset));
    out.push(...l.name);
  }
  const cdSize = out.length - cdStart;
  out.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0));
  return new Uint8Array(out);
}
