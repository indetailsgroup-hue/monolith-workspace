/**
 * bible-code.ts — Bible_Code grammar parser/formatter (WO-3 / Req 8)
 *
 * Feature: Design Hub Phase 2 (Released_Spec designIntent.parsedSpec)
 * อิง BIBLE_CODE_GRAMMAR_SPEC.md (ตรวจจาก The Bible Cabinet.txt — catalog จริง)
 *
 * 3 ระบอบ (type-driven, positional + valid-set):
 *   Counter  DKC : W 300–1200/50 · D=580 · H=750 · options {count×(S|D|M)} หรือ {L|R}
 *   Cabinet  DC  : W 350–1200/50 · D=400 · H 600–1200/50 · shelve (1|2)×S
 *   Wardrobe DWD : W 600–1050/50 · D ∈ {530,600} · H=2400 · ไม่มี options
 *
 * encoding = mm ÷ 10 (300→"30", 1200→"120", 580→"58", 2400→"240")
 * parse คืน Result (ไม่ throw) — invalid → { ok:false, error, badToken? } ระบุ token ผิด
 */

export type FurnitureType = 'Counter' | 'Cabinet' | 'Wardrobe';
export type CountToken = 'S' | 'D' | 'M'; // Shelve | Drawer(ALTO) | Microwave
export type LShapeToken = 'L' | 'R'; // open Left | open Right

/** option ของ Counter/Cabinet: count×token (S/D/M) หรือ L/R (ไม่มี count) */
export type SpecOption =
  | { kind: 'count'; token: CountToken; count: number }
  | { kind: 'lshape'; token: LShapeToken };

export interface ParsedSpec {
  furnitureType: FurnitureType;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  options: SpecOption[];
}

export type ParseResult =
  | { ok: true; spec: ParsedSpec }
  | { ok: false; error: string; badToken?: string };

// ---------------------------------------------------------------------------
// Canonical ranges (§3 — บังคับ validate; "อย่าใช้กฎความกว้างเดียว")
// ---------------------------------------------------------------------------

function rangeSet(min: number, max: number, step: number): ReadonlySet<number> {
  const s = new Set<number>();
  for (let v = min; v <= max; v += step) s.add(v);
  return s;
}

export const RANGES = {
  Counter: { prefix: 'DKC', width: rangeSet(300, 1200, 50), depth: 580, height: 750 },
  Cabinet: { prefix: 'DC', width: rangeSet(350, 1200, 50), depth: 400, height: rangeSet(600, 1200, 50) },
  Wardrobe: { prefix: 'DWD', width: rangeSet(600, 1050, 50), depth: new Set([530, 600]), height: 2400 },
} as const;

const COUNT_TOKENS: ReadonlySet<string> = new Set(['S', 'D', 'M']);
const LSHAPE_TOKENS: ReadonlySet<string> = new Set(['L', 'R']);
/** canonical order ของ count options (P4: S ก่อน D ก่อน M) */
const COUNT_ORDER: Record<CountToken, number> = { S: 0, D: 1, M: 2 };

function enc(mm: number): string {
  return String(mm / 10);
}
function decToMm(token: string): number {
  return parseInt(token, 10) * 10;
}

// ---------------------------------------------------------------------------
// Option parsing (Counter) — sequence ของ (Count + Letter) หรือ L/R เดี่ยว
// ---------------------------------------------------------------------------

function parseCounterOptions(s: string): { ok: true; options: SpecOption[] } | { ok: false; error: string; badToken?: string } {
  const options: SpecOption[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (LSHAPE_TOKENS.has(ch)) {
      // L/R ต้องอยู่เดี่ยว ไม่มี count และเป็น token สุดท้าย
      if (i !== 0 || s.length !== 1) {
        return { ok: false, error: `L/R must stand alone with no other options`, badToken: ch };
      }
      options.push({ kind: 'lshape', token: ch as LShapeToken });
      i += 1;
      continue;
    }
    // คาดหวัง digit (count) ตามด้วย S/D/M
    if (ch >= '1' && ch <= '9') {
      const letter = s[i + 1];
      if (letter === undefined || !COUNT_TOKENS.has(letter)) {
        return { ok: false, error: `expected option letter S/D/M after count`, badToken: letter ?? ch };
      }
      const count = Number(ch);
      if (count < 1 || count > 3) {
        return { ok: false, error: `option count out of range 1–3`, badToken: ch };
      }
      options.push({ kind: 'count', token: letter as CountToken, count });
      i += 2;
      continue;
    }
    // bare OptLetter (S/D/M) ไม่มี count นำหน้า = count 1 (โดยปริยาย)
    // หลักฐาน: golden vector §5 `DKC305875S` = 1×Shelve (catalog p4) ขัดกับ EBNF §2
    // ที่บังคับ Count — catalog เป็น ground truth จึงรองรับ implicit count=1
    if (COUNT_TOKENS.has(ch)) {
      options.push({ kind: 'count', token: ch as CountToken, count: 1 });
      i += 1;
      continue;
    }
    return { ok: false, error: `unknown option token`, badToken: ch };
  }
  return { ok: true, options };
}

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

export function parseBibleCode(codeRaw: string): ParseResult {
  const code = codeRaw.trim();

  // Counter — DKC + W + "5875" + options
  if (code.startsWith('DKC')) {
    const rest = code.slice(3);
    // W enc = 2–3 digits; ตามด้วย literal "5875"
    for (const wl of [3, 2]) {
      const wTok = rest.slice(0, wl);
      if (!/^\d+$/.test(wTok)) continue;
      if (rest.slice(wl, wl + 4) !== '5875') continue;
      const widthMm = decToMm(wTok);
      if (!RANGES.Counter.width.has(widthMm)) {
        return { ok: false, error: `Counter width ${widthMm}mm not in 300–1200 step 50`, badToken: wTok };
      }
      const optStr = rest.slice(wl + 4);
      const opt = parseCounterOptions(optStr);
      if (!opt.ok) return opt;
      return {
        ok: true,
        spec: { furnitureType: 'Counter', widthMm, depthMm: 580, heightMm: 750, options: opt.options },
      };
    }
    return { ok: false, error: `malformed Counter code (expected DKC<W>5875<opts>)`, badToken: rest };
  }

  // Wardrobe — DWD + W + D(53|60) + "240"
  if (code.startsWith('DWD')) {
    const rest = code.slice(3);
    if (!rest.endsWith('240')) {
      return { ok: false, error: `malformed Wardrobe code (must end with 240 = H2400)`, badToken: rest };
    }
    const wd = rest.slice(0, rest.length - 3);
    const dTok = wd.slice(-2);
    const wTok = wd.slice(0, wd.length - 2);
    if (!/^\d+$/.test(wTok) || !/^\d{2}$/.test(dTok)) {
      return { ok: false, error: `malformed Wardrobe W/D`, badToken: wd };
    }
    const depthMm = decToMm(dTok);
    if (!RANGES.Wardrobe.depth.has(depthMm)) {
      return { ok: false, error: `invalid wardrobe depth ${depthMm}mm (must be 530 or 600)`, badToken: dTok };
    }
    const widthMm = decToMm(wTok);
    if (!RANGES.Wardrobe.width.has(widthMm)) {
      return { ok: false, error: `Wardrobe width ${widthMm}mm not in 600–1050 step 50`, badToken: wTok };
    }
    return { ok: true, spec: { furnitureType: 'Wardrobe', widthMm, depthMm, heightMm: 2400, options: [] } };
  }

  // Cabinet — DC + W + "40" + H + (1|2) + "S"
  if (code.startsWith('DC')) {
    const rest = code.slice(2);
    const m = /^(.*?)([12])S$/.exec(rest);
    if (!m) {
      return { ok: false, error: `malformed Cabinet code (must end with shelve count 1S or 2S)`, badToken: rest };
    }
    const core = m[1];
    const shelveCount = Number(m[2]);
    for (const wl of [3, 2]) {
      const wTok = core.slice(0, wl);
      if (!/^\d+$/.test(wTok)) continue;
      if (core.slice(wl, wl + 2) !== '40') continue;
      const hTok = core.slice(wl + 2);
      if (!/^\d+$/.test(hTok)) continue;
      const widthMm = decToMm(wTok);
      const heightMm = decToMm(hTok);
      if (!RANGES.Cabinet.width.has(widthMm)) {
        return { ok: false, error: `Cabinet width ${widthMm}mm not in 350–1200 step 50`, badToken: wTok };
      }
      if (!RANGES.Cabinet.height.has(heightMm)) {
        return { ok: false, error: `Cabinet height ${heightMm}mm not in 600–1200 step 50`, badToken: hTok };
      }
      return {
        ok: true,
        spec: {
          furnitureType: 'Cabinet',
          widthMm,
          depthMm: 400,
          heightMm,
          options: [{ kind: 'count', token: 'S', count: shelveCount }],
        },
      };
    }
    return { ok: false, error: `malformed Cabinet code (expected DC<W>40<H><n>S)`, badToken: core };
  }

  return { ok: false, error: `unknown prefix (expected DKC | DC | DWD)`, badToken: code.slice(0, 3) };
}

// ---------------------------------------------------------------------------
// format (canonical) — spec → code
// ---------------------------------------------------------------------------

function formatOptions(options: SpecOption[]): string {
  const lshape = options.find((o) => o.kind === 'lshape');
  if (lshape) return lshape.token; // L/R เดี่ยว
  const counts = options.filter((o): o is Extract<SpecOption, { kind: 'count' }> => o.kind === 'count');
  // canonical order S → D → M (P4)
  const sorted = [...counts].sort((a, b) => COUNT_ORDER[a.token] - COUNT_ORDER[b.token]);
  return sorted.map((o) => `${o.count}${o.token}`).join('');
}

export function formatBibleCode(spec: ParsedSpec): string {
  switch (spec.furnitureType) {
    case 'Counter':
      return `DKC${enc(spec.widthMm)}5875${formatOptions(spec.options)}`;
    case 'Cabinet': {
      const shelve = spec.options.find((o) => o.kind === 'count' && o.token === 'S');
      const n = shelve && shelve.kind === 'count' ? shelve.count : 1;
      return `DC${enc(spec.widthMm)}40${enc(spec.heightMm)}${n}S`;
    }
    case 'Wardrobe':
      return `DWD${enc(spec.widthMm)}${enc(spec.depthMm)}240`;
  }
}

/** เทียบ spec แบบไม่สนลำดับ options (multiset) — ใช้ใน round-trip property */
export function specEquals(a: ParsedSpec, b: ParsedSpec): boolean {
  if (a.furnitureType !== b.furnitureType || a.widthMm !== b.widthMm || a.depthMm !== b.depthMm || a.heightMm !== b.heightMm) {
    return false;
  }
  const key = (o: SpecOption) => (o.kind === 'count' ? `c:${o.token}:${o.count}` : `l:${o.token}`);
  const sa = a.options.map(key).sort();
  const sb = b.options.map(key).sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}
