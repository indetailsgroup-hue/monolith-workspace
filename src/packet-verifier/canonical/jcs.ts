// S17-5 check 2 — RFC 8785 JSON Canonicalization Scheme serializer (spec §7.1)
//
// Used for the roundtrip gate: canonical input bytes MUST equal
// jcsSerialize(parseStrictJson(input)). Numbers follow ECMAScript ToString
// (which is exactly what RFC 8785 specifies); object keys sort by UTF-16
// code units; strings use JCS minimal escaping.

import type { JsonValue } from './strictJson';

function escapeString(s: string): string {
  let out = '"';
  for (let idx = 0; idx < s.length; idx++) {
    const c = s.charCodeAt(idx);
    const ch = s[idx];
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0c) out += '\\f';
    else if (c === 0x0d) out += '\\r';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/** RFC 8785 number serialization = ECMAScript Number::toString(10). */
export function jcsNumber(v: number): string {
  if (!Number.isFinite(v)) throw new Error('non-finite number reached serializer');
  if (Object.is(v, -0)) throw new Error('negative zero reached serializer');
  return String(v);
}

export function jcsSerialize(v: JsonValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return jcsNumber(v);
  if (typeof v === 'string') return escapeString(v);
  if (Array.isArray(v)) return '[' + v.map(jcsSerialize).join(',') + ']';
  // object — keys sorted by UTF-16 code units (default JS string comparison
  // via manual code-unit compare; localeCompare is explicitly NOT allowed)
  const keys = Object.keys(v).sort((a, b) => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a.charCodeAt(i) - b.charCodeAt(i);
      if (d !== 0) return d;
    }
    return a.length - b.length;
  });
  return '{' + keys.map((k) => escapeString(k) + ':' + jcsSerialize(v[k])).join(',') + '}';
}
