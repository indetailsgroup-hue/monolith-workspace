// S17-5 check 2 — strict JSON parser (spec §7.2)
//
// Hand-written because JSON.parse cannot enforce the spec: it silently keeps
// the LAST duplicate key (the spec requires rejection BEFORE the object is
// constructed), accepts "-0" (forbidden), and accepts integers beyond the
// safe range (forbidden). Grammar is RFC 8259; every deviation fails closed.
//
// Rejected at parse time: duplicate keys, negative zero, unsafe integers
// (|v| > Number.MAX_SAFE_INTEGER for fraction-less/exponent-less numbers),
// invalid escapes, lone surrogates, control characters in strings, trailing
// data, and depth beyond MAX_DEPTH (container-safety backstop).

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface StrictParseOk { ok: true; value: JsonValue }
export interface StrictParseErr { ok: false; error: string; offset: number }
export type StrictParseResult = StrictParseOk | StrictParseErr;

const MAX_DEPTH = 64;

export function parseStrictJson(text: string): StrictParseResult {
  let i = 0;
  const n = text.length;

  const err = (error: string): StrictParseErr => ({ ok: false, error, offset: i });

  function skipWs(): void {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  }

  function parseValue(depth: number): JsonValue | StrictParseErr {
    if (depth > MAX_DEPTH) return err(`nesting depth exceeds ${MAX_DEPTH}`);
    skipWs();
    if (i >= n) return err('unexpected end of input');
    const c = text[i];
    if (c === '{') return parseObject(depth);
    if (c === '[') return parseArray(depth);
    if (c === '"') return parseString();
    if (c === 't') return parseLiteral('true', true);
    if (c === 'f') return parseLiteral('false', false);
    if (c === 'n') return parseLiteral('null', null);
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    return err(`unexpected character ${JSON.stringify(c)}`);
  }

  function parseLiteral<T extends JsonValue>(lit: string, v: T): T | StrictParseErr {
    if (text.startsWith(lit, i)) { i += lit.length; return v; }
    return err(`invalid literal (expected ${lit})`);
  }

  function isErr(x: unknown): x is StrictParseErr {
    return typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false;
  }

  function parseObject(depth: number): JsonValue | StrictParseErr {
    i++; // {
    const obj: { [k: string]: JsonValue } = Object.create(null) as { [k: string]: JsonValue };
    const seen = new Set<string>();
    skipWs();
    if (i < n && text[i] === '}') { i++; return obj; }
    for (;;) {
      skipWs();
      if (i >= n || text[i] !== '"') return err('expected string key');
      const key = parseString();
      if (isErr(key)) return key;
      if (seen.has(key)) return err(`duplicate key ${JSON.stringify(key)}`);
      seen.add(key);
      skipWs();
      if (i >= n || text[i] !== ':') return err('expected ":"');
      i++;
      const v = parseValue(depth + 1);
      if (isErr(v)) return v;
      obj[key] = v;
      skipWs();
      if (i < n && text[i] === ',') { i++; continue; }
      if (i < n && text[i] === '}') { i++; return obj; }
      return err('expected "," or "}"');
    }
  }

  function parseArray(depth: number): JsonValue | StrictParseErr {
    i++; // [
    const arr: JsonValue[] = [];
    skipWs();
    if (i < n && text[i] === ']') { i++; return arr; }
    for (;;) {
      const v = parseValue(depth + 1);
      if (isErr(v)) return v;
      arr.push(v);
      skipWs();
      if (i < n && text[i] === ',') { i++; continue; }
      if (i < n && text[i] === ']') { i++; return arr; }
      return err('expected "," or "]"');
    }
  }

  function parseString(): string | StrictParseErr {
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= n) return err('unterminated string');
      const code = text.charCodeAt(i);
      const ch = text[i];
      if (ch === '"') { i++; break; }
      if (ch === '\\') {
        i++;
        if (i >= n) return err('unterminated escape');
        const e = text[i];
        if (e === '"' || e === '\\' || e === '/') { out += e; i++; continue; }
        if (e === 'b') { out += '\b'; i++; continue; }
        if (e === 'f') { out += '\f'; i++; continue; }
        if (e === 'n') { out += '\n'; i++; continue; }
        if (e === 'r') { out += '\r'; i++; continue; }
        if (e === 't') { out += '\t'; i++; continue; }
        if (e === 'u') {
          if (i + 4 >= n) return err('truncated \\u escape');
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return err('invalid \\u escape');
          const unit = parseInt(hex, 16);
          i += 5;
          if (unit >= 0xd800 && unit <= 0xdbff) {
            // must be followed by a low surrogate escape
            if (text[i] !== '\\' || text[i + 1] !== 'u') return err('lone high surrogate');
            const hex2 = text.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex2)) return err('invalid low surrogate escape');
            const unit2 = parseInt(hex2, 16);
            if (unit2 < 0xdc00 || unit2 > 0xdfff) return err('lone high surrogate');
            out += String.fromCharCode(unit, unit2);
            i += 6;
            continue;
          }
          if (unit >= 0xdc00 && unit <= 0xdfff) return err('lone low surrogate');
          out += String.fromCharCode(unit);
          continue;
        }
        return err(`invalid escape \\${e}`);
      }
      if (code < 0x20) return err('raw control character in string');
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return err('lone high surrogate (raw)');
        out += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) return err('lone low surrogate (raw)');
      out += ch;
      i++;
    }
    return out;
  }

  function parseNumber(): number | StrictParseErr {
    const start = i;
    if (text[i] === '-') i++;
    if (i >= n) return err('truncated number');
    if (text[i] === '0') {
      i++;
      if (i < n && text[i] >= '0' && text[i] <= '9') return err('leading zero');
    } else if (text[i] >= '1' && text[i] <= '9') {
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    } else {
      return err('invalid number');
    }
    let isInt = true;
    if (i < n && text[i] === '.') {
      isInt = false;
      i++;
      if (!(i < n && text[i] >= '0' && text[i] <= '9')) return err('missing fraction digits');
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    if (i < n && (text[i] === 'e' || text[i] === 'E')) {
      isInt = false;
      i++;
      if (i < n && (text[i] === '+' || text[i] === '-')) i++;
      if (!(i < n && text[i] >= '0' && text[i] <= '9')) return err('missing exponent digits');
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    const raw = text.slice(start, i);
    const v = Number(raw);
    if (!Number.isFinite(v)) return err('number out of range');
    if (Object.is(v, -0)) return err('negative zero');
    if (isInt && !Number.isSafeInteger(v)) return err('unsafe integer');
    return v;
  }

  const value = parseValue(0);
  if (isErr(value)) return value;
  skipWs();
  if (i !== n) return err('trailing data after JSON value');
  return { ok: true, value };
}
