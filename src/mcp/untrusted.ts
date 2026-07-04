// Feature: monolith-mcp-layer — Untrusted_Content + Source_Provenance (Req 19.1, 19.2, 19.4, 19.5, 19.6)
// Pure. หลัก: เนื้อหาจาก client / external = ไม่น่าเชื่อถือ — ไม่เคยตีความเป็นคำสั่ง (โค้ดไม่ execute content เลย).
// authz re-derive จาก Principal+C12 เท่านั้น (กัน confused deputy) อยู่ใน authz.ts — โมดูลนี้ "ตรวจจับ+mark" เพื่อ audit.

/** heuristic patterns ของคำสั่งฝังตัว (prompt-injection / tool-poisoning) — ใช้ "ตรวจจับเพื่อ audit" เท่านั้น */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(the\s+)?(above|prior|previous)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:/i,
  /\bact\s+as\b/i,
  /override\s+(the\s+)?(authorization|approval|permission)/i,
  /grant\s+(me\s+)?(admin|elevated|root)/i,
  /bypass\s+(the\s+)?(approval|authorization|gate)/i,
];

/**
 * Req 19.1/19.2/19.6 — ตรวจจับคำสั่งฝังตัวใน Untrusted_Content (เพื่อ audit + เพิกเฉย).
 * NOTE: ค่าที่คืนใช้ "บันทึก detection" เท่านั้น — ไม่เคยถูกใช้ยกระดับสิทธิ์/ข้าม gate (Req 19.2 state preservation).
 */
export function detectEmbeddedInstructions(content: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(content));
}

/** ผลการ trace ค่าหนึ่งกลับไป Knowledge_Export (Source_Provenance) */
export interface SourceProvenance {
  recordId: string;
  sourceVersion: string;
  importedAt: string;
}

export type ProvenanceMark =
  | { verified: true; provenance: SourceProvenance } // trace ได้ (Req 19.4)
  | { verified: false; value: unknown }; // trace ไม่ได้ → unverified แต่ "คงค่าไว้" (Req 19.5)

/**
 * Req 19.4/19.5 — แนบ Source_Provenance ให้ค่าที่อ้างความรู้:
 *   trace ได้ → verified + provenance (recordId/source_version/imported_at)
 *   trace ไม่ได้ → mark unverified โดย "คงค่าเดิมไว้" (ไม่ซ่อน — กัน placeholder/ตัวเลขปลอม)
 */
export function markProvenance(
  value: unknown,
  provenance: SourceProvenance | null,
): ProvenanceMark {
  if (provenance === null) return { verified: false, value };
  return { verified: true, provenance };
}
