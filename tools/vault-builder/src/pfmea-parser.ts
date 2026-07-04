/**
 * pfmea-parser.ts — parser เนื้อหา PFMEA จาก `_daph_extract/*.txt` (Phase 3 data wiring)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export)
 *
 * ออกแบบให้ robust ต่อ hazard ที่พบจากต้นฉบับจริง:
 *  1. Carry-forward: เซลล์ Process Step / SEV ว่าง = continuation ของขั้น/Failure Mode ก่อนหน้า
 *  2. Filler rows "0 | 0": แถว template เปล่าท้ายชีต → ข้าม
 *  3. Column shift: extract ตัดเซลล์ว่างทิ้ง → ห้าม parse by fixed index
 *     ใช้ RPN self-check (SEV×OCC×DET = RPN ที่กรอก) เป็นตัวยืนยัน + หา triple ที่ถูกต้อง
 *  4. OCC "0" = ยังไม่ประเมิน (ไม่ใช่ occurrence ต่ำสุด) → ตีเป็น null
 *  5. Embedded newline กลางเซลล์: เนื้อหาหลายบรรทัดในเซลล์เดียว → รวมตาม marker "R<n>:"
 *
 * ผลลัพธ์ตั้งใจให้ "ตรวจสอบได้" (auditable): แต่ละ row มี rpnCheck เพื่อบอกว่าตัวเลข
 * ที่สกัดได้ผ่านการ cross-check กับ RPN ต้นฉบับหรือไม่ — ความไม่แน่นอนถูกรายงาน ไม่ซ่อน
 */

export interface ParsedPfmeaRow {
  processStep: string;
  /** คอลัมน์ Requirement (key input X) — มักเป็นเนื้อหากิจกรรมจริง (เช่น "ทำ Furniture Selection") */
  requirement: string | null;
  failureMode: string | null;
  cause: string | null;
  control: string | null;
  /** SEV/OCC/DET ที่สกัดได้ (null = ไม่พบ/ยังไม่ประเมิน; "0" ถือเป็น null) */
  sev: number | null;
  occ: number | null;
  det: number | null;
  /** RPN ที่กรอกในต้นฉบับ (ถ้ามี) */
  statedRpn: number | null;
  /** true = พบ triple SEV×OCC×DET ที่ product = statedRpn (ยืนยันความถูกต้อง) */
  rpnCheckOk: boolean;
}

export interface ParsedPfmeaFile {
  fileName: string;
  processOwner: string | null;
  steps: string[];
  rows: ParsedPfmeaRow[];
}

/** rating ที่ใช้ได้ = จำนวนเต็ม 1–10 ("0"/ว่าง = ยังไม่ประเมิน → null) */
function toRating(token: string): number | null {
  const n = Number(token.trim());
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** ตรวจว่า token เป็น Process Step header เช่น "1.Sales", "3.Cutting", "1. Incoming" */
function asStepHeader(token: string): string | null {
  const m = token.match(/^\s*(\d+)\s*\.\s*(.+)$/s);
  if (!m) return null;
  const name = m[2].replace(/\s+/g, ' ').trim();
  return name.length > 0 ? `${m[1]}. ${name}` : null;
}

/** แถว filler: ทุก token เป็น "0" หรือว่าง */
function isFiller(tokens: string[]): boolean {
  return tokens.every((t) => t.trim() === '' || t.trim() === '0');
}

/**
 * รวมบรรทัดของ extract เป็น "record" ต่อ marker R<n>:
 * บรรทัดที่ไม่ขึ้นต้นด้วย R<n>: คือ continuation ของเซลล์ก่อนหน้า (embedded newline)
 */
function toRecords(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const records: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    if (/^R\d+:/.test(line)) {
      if (current !== null) records.push(current);
      current = line.replace(/^R\d+:\s?/, '');
    } else if (current !== null) {
      current += ' ' + line.trim();
    }
  }
  if (current !== null) records.push(current);
  return records;
}

/**
 * พยายามหา (sev, occ, det) จาก rating tokens ของแถว โดยใช้ statedRpn เป็นตัวยืนยัน
 * คืน null ถ้า cross-check ไม่ผ่าน
 */
function reconcileTriple(
  ratings: number[],
  statedRpn: number | null,
): { sev: number; occ: number; det: number } | null {
  if (statedRpn === null) return null;
  // ลองทุกการจัดเรียง 3 ตัวจาก ratings ที่ product = statedRpn (คงลำดับซ้าย→ขวา = sev,occ,det)
  for (let i = 0; i < ratings.length; i++) {
    for (let j = i + 1; j < ratings.length; j++) {
      for (let k = j + 1; k < ratings.length; k++) {
        if (ratings[i] * ratings[j] * ratings[k] === statedRpn) {
          return { sev: ratings[i], occ: ratings[j], det: ratings[k] };
        }
      }
    }
  }
  return null;
}

/** parse ไฟล์ PFMEA หนึ่งไฟล์จากเนื้อหา extract */
export function parsePfmeaText(fileName: string, text: string): ParsedPfmeaFile {
  const records = toRecords(text);
  const rows: ParsedPfmeaRow[] = [];
  const steps: string[] = [];
  let currentStep: string | null = null;
  let currentSev: number | null = null;
  let processOwner: string | null = null;

  for (const rec of records) {
    const ownerMatch = rec.match(/Process Owner:\s*([^|]+)/);
    if (ownerMatch) processOwner = ownerMatch[1].trim();

    const tokens = rec.split('|').map((t) => t.trim());
    if (tokens.length === 0 || isFiller(tokens)) continue;

    // step header?
    const header = asStepHeader(tokens[0]);
    if (header) {
      currentStep = header;
      currentSev = null;
      if (!steps.includes(header)) steps.push(header);
    }
    if (currentStep === null) continue; // ยังไม่ถึงแถวข้อมูลจริง (header/legend)

    // เก็บ rating tokens (1–10) ตามลำดับ และ RPN candidate (int > 10)
    const ratingTokens: number[] = [];
    let statedRpn: number | null = null;
    for (const t of tokens) {
      const n = Number(t);
      if (Number.isInteger(n)) {
        if (n >= 1 && n <= 10) ratingTokens.push(n);
        else if (n > 10) statedRpn = n; // RPN (เช่น 84–280)
      }
    }

    const triple = reconcileTriple(ratingTokens, statedRpn);
    let sev: number | null;
    let occ: number | null;
    let det: number | null;
    let rpnCheckOk = false;
    if (triple) {
      ({ sev, occ, det } = triple);
      currentSev = sev; // carry-forward SEV ของ Failure Mode
      rpnCheckOk = true;
    } else {
      // ไม่มี RPN ที่ตรวจได้ → ใช้ SEV ตัวแรกที่พบ (carry-forward ถ้าไม่มี), OCC/DET = null
      sev = ratingTokens.length > 0 ? ratingTokens[0] : currentSev;
      if (sev !== null) currentSev = sev;
      occ = null;
      det = null;
    }

    // ข้อความเชิงคุณภาพ (ไม่บังคับ) — เก็บแบบ best-effort จาก token ที่ไม่ใช่ตัวเลข
    const textTokens = tokens.filter((t) => t !== '' && !Number.isInteger(Number(t)) && !asStepHeader(t));
    // textTokens[0] = คอลัมน์ Requirement (เนื้อหากิจกรรม) — ห้ามทิ้ง (กัน data-loss ของ row ที่กรอกแค่ Requirement+SEV)
    const requirement = textTokens.length >= 1 ? textTokens[0] : null;
    const failureMode = textTokens.length >= 2 ? textTokens[1] : null;
    const cause = textTokens.length >= 3 ? textTokens[2] : null;
    const control = textTokens.length >= 4 ? textTokens[3] : null;

    rows.push({
      processStep: currentStep,
      requirement,
      failureMode,
      cause,
      control,
      sev,
      occ,
      det,
      statedRpn,
      rpnCheckOk,
    });
  }

  return { fileName, processOwner, steps, rows };
}
