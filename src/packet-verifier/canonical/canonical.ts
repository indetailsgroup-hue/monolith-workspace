// S17-5 check 2 — canonical-bytes gate for JSON payloads + text-file rule (spec §7)
//
// A JSON payload passes only when: bytes are strict UTF-8 with no BOM, parse
// under the strict parser (duplicate keys / -0 / unsafe ints rejected), AND
// re-serializing via RFC 8785 reproduces the input byte-for-byte (catches
// whitespace, key order, number formatting, escaping — any non-canonical
// encoding). Nothing is normalized before judgment.

import { parseStrictJson, type JsonValue } from './strictJson';
import { jcsSerialize } from './jcs';
import type { PacketFailureCode } from '../codes';

export type CanonicalJsonResult =
  | { ok: true; value: JsonValue }
  | { ok: false; code: PacketFailureCode; detail: string };

function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function parseCanonicalJson(bytes: Uint8Array): CanonicalJsonResult {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'UTF-8 BOM present' };
  }
  const text = decodeUtf8Strict(bytes);
  if (text === null) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'invalid UTF-8' };
  }
  const parsed = parseStrictJson(text);
  if (!parsed.ok) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: `${parsed.error} (offset ${parsed.offset})` };
  }
  const canonical = jcsSerialize(parsed.value);
  if (canonical !== text) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'bytes are not RFC 8785 canonical form' };
  }
  return { ok: true, value: parsed.value };
}

export type TextFileResult = { ok: true; text: string } | { ok: false; code: PacketFailureCode; detail: string };

/** §7.4 — text payloads (e.g. NOT_FOR_PRODUCTION.txt): UTF-8, LF only, no BOM, no CR. */
export function parseCanonicalTextFile(bytes: Uint8Array): TextFileResult {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'UTF-8 BOM present in text file' };
  }
  const text = decodeUtf8Strict(bytes);
  if (text === null) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'text file is not valid UTF-8' };
  }
  if (text.includes('\r')) {
    return { ok: false, code: 'PKT_JSON_NON_CANONICAL', detail: 'CR byte in text file (LF only)' };
  }
  return { ok: true, text };
}
