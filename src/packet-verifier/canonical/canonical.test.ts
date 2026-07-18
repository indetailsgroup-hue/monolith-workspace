// S17-5 check-2 tests — strict parser + JCS + canonical-bytes gate + formats (spec §7)
import { describe, it, expect } from 'vitest';
import { parseStrictJson } from './strictJson';
import { jcsSerialize } from './jcs';
import { parseCanonicalJson, parseCanonicalTextFile } from './canonical';
import { isCanonicalTimestamp, isLowercaseUuid, isSemver, isSha256Field } from './formats';

const te = new TextEncoder();

describe('parseStrictJson — rejections JSON.parse would allow', () => {
  it('rejects duplicate keys BEFORE constructing the object', () => {
    const r = parseStrictJson('{"a":1,"a":2}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('duplicate key');
  });
  it('rejects nested duplicate keys', () => {
    expect(parseStrictJson('{"x":{"b":1,"b":1}}').ok).toBe(false);
  });
  it('rejects negative zero', () => {
    const r = parseStrictJson('{"v":-0}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('negative zero');
  });
  it('rejects unsafe integers (|v| > 2^53-1)', () => {
    expect(parseStrictJson('9007199254740993').ok).toBe(false);
    expect(parseStrictJson('9007199254740991').ok).toBe(true);
  });
  it('rejects leading zeros / bad numbers', () => {
    expect(parseStrictJson('01').ok).toBe(false);
    expect(parseStrictJson('1.').ok).toBe(false);
    expect(parseStrictJson('.5').ok).toBe(false);
    expect(parseStrictJson('1e').ok).toBe(false);
  });
  it('rejects NaN/Infinity tokens (not JSON)', () => {
    expect(parseStrictJson('NaN').ok).toBe(false);
    expect(parseStrictJson('Infinity').ok).toBe(false);
  });
  it('rejects lone surrogates (escaped and raw)', () => {
    expect(parseStrictJson('"\\ud800"').ok).toBe(false);
    expect(parseStrictJson('"\\udc00"').ok).toBe(false);
    expect(parseStrictJson('"\\ud83d\\ude00"').ok).toBe(true); // proper pair
  });
  it('rejects raw control characters in strings', () => {
    expect(parseStrictJson('"ab"').ok).toBe(false);
  });
  it('rejects trailing data', () => {
    expect(parseStrictJson('{} x').ok).toBe(false);
  });
  it('rejects depth beyond backstop', () => {
    const deep = '['.repeat(80) + ']'.repeat(80);
    expect(parseStrictJson(deep).ok).toBe(false);
  });
});

describe('jcsSerialize — RFC 8785 behaviour', () => {
  it('serializes the RFC number vectors via ES ToString', () => {
    expect(jcsSerialize(333333333.33333329)).toBe('333333333.3333333');
    expect(jcsSerialize(1e30)).toBe('1e+30');
    expect(jcsSerialize(4.5)).toBe('4.5');
    expect(jcsSerialize(0.002)).toBe('0.002');
    expect(jcsSerialize(1e-27)).toBe('1e-27');
    expect(jcsSerialize(10.0)).toBe('10');
  });
  it('sorts object keys by UTF-16 code units', () => {
    expect(jcsSerialize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    // "é" (0x00e9) sorts after "z" (0x007a) by code units — not locale order
    expect(jcsSerialize({ 'é': 1, z: 2 })).toBe('{"z":2,"é":1}');
  });
  it('uses minimal escaping with lowercase \\u00xx for other controls', () => {
    expect(jcsSerialize('')).toBe('"\\u0007"');
    expect(jcsSerialize('a\tb\n')).toBe('"a\\tb\\n"');
    expect(jcsSerialize('quote " back \\ slash')).toBe('"quote \\" back \\\\ slash"');
  });
});

describe('parseCanonicalJson — roundtrip byte gate', () => {
  it('accepts canonical bytes and returns the value', () => {
    const r = parseCanonicalJson(te.encode('{"a":[1,2],"b":"x"}'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: [1, 2], b: 'x' });
  });
  it('rejects whitespace (non-canonical)', () => {
    const r = parseCanonicalJson(te.encode('{ "a": 1 }'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PKT_JSON_NON_CANONICAL');
  });
  it('rejects unsorted keys', () => {
    expect(parseCanonicalJson(te.encode('{"b":1,"a":2}')).ok).toBe(false);
  });
  it('rejects non-canonical number forms', () => {
    expect(parseCanonicalJson(te.encode('{"v":4.50}')).ok).toBe(false);
    expect(parseCanonicalJson(te.encode('{"v":1E30}')).ok).toBe(false);
    expect(parseCanonicalJson(te.encode('{"v":2e-3}')).ok).toBe(false); // canonical is 0.002
  });
  it('rejects non-minimal string escaping', () => {
    expect(parseCanonicalJson(te.encode('{"v":"\\u0041"}')).ok).toBe(false); // "A" must be literal
  });
  it('rejects BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...te.encode('{}')]);
    const r = parseCanonicalJson(withBom);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain('BOM');
  });
  it('rejects invalid UTF-8 bytes', () => {
    expect(parseCanonicalJson(new Uint8Array([0x22, 0xff, 0x22])).ok).toBe(false);
  });
  it('rejects duplicate keys with the stable code', () => {
    const r = parseCanonicalJson(te.encode('{"a":1,"a":1}'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PKT_JSON_NON_CANONICAL');
  });
});

describe('parseCanonicalTextFile — §7.4 LF-only text', () => {
  it('accepts LF text without BOM', () => {
    const r = parseCanonicalTextFile(te.encode('NOT FOR PRODUCTION\nshadow mode\n'));
    expect(r.ok).toBe(true);
  });
  it('rejects CR / CRLF', () => {
    expect(parseCanonicalTextFile(te.encode('line\r\n')).ok).toBe(false);
  });
  it('rejects BOM', () => {
    expect(parseCanonicalTextFile(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).ok).toBe(false);
  });
});

describe('formats — §7.6/§7.10 exact scalar forms', () => {
  it('sha256 field form', () => {
    expect(isSha256Field('sha256:' + 'a'.repeat(64))).toBe(true);
    expect(isSha256Field('sha256:' + 'A'.repeat(64))).toBe(false); // uppercase forbidden
    expect(isSha256Field('a'.repeat(64))).toBe(false); // missing prefix
  });
  it('pinned RFC 3339 timestamp', () => {
    expect(isCanonicalTimestamp('2026-07-17T12:34:56.789Z')).toBe(true);
    expect(isCanonicalTimestamp('2026-07-17T12:34:56Z')).toBe(false); // ms required
    expect(isCanonicalTimestamp('2026-07-17T12:34:56.789+07:00')).toBe(false); // Z only
    expect(isCanonicalTimestamp('2026-13-40T25:61:61.000Z')).toBe(false); // not a real instant
  });
  it('lowercase UUID', () => {
    expect(isLowercaseUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isLowercaseUuid('123E4567-E89B-42D3-A456-426614174000')).toBe(false);
  });
  it('SemVer without leading v', () => {
    expect(isSemver('1.2.3')).toBe(true);
    expect(isSemver('1.2.3-rc.1+build.5')).toBe(true);
    expect(isSemver('v1.2.3')).toBe(false);
    expect(isSemver('1.02.3')).toBe(false);
  });
});
