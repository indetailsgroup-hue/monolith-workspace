/**
 * risk-scoring.ts — การให้คะแนนความเสี่ยง PFMEA (pure logic)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 * อิง ADR-011 (RPN fail-safe) + ADR-012 (raw SOD + dual-standard RPN/Action Priority)
 *
 * รับค่า SEV/OCC/DET ดิบ (1–10 ตามสเกล AIAG-VDA/IATF-16949 หรือ null เมื่อยังไม่ประเมิน)
 * แล้วคำนวณ:
 *   - rpnStatus: computed | severity_only | not_assessed  (ADR-011)
 *   - rpn = SEV×OCC×DET (เฉพาะเมื่อครบ; มิฉะนั้น null)
 *   - actionPriority: High | Medium | Low (band-based ตามหลัก AIAG-VDA — เรียบเรียงใหม่
 *     ไม่คัดลอกตารางลิขสิทธิ์ verbatim; เป็นกลางต่อมาตรฐานและ monotonic)
 *   - severityWarning / requiresHumanReview: พฤติกรรม fail-safe (ADR-011)
 *
 * โมดูลนี้บริสุทธิ์ (ไม่มี IO) เพื่อให้ทดสอบด้วย property-based testing ได้
 */

/** สถานะความครบของการประเมินความเสี่ยง (ADR-011) */
export type RpnStatus = 'computed' | 'severity_only' | 'not_assessed';

/** ระดับความสำคัญของการลงมือแก้ไข (AIAG-VDA Action Priority) */
export type ActionPriority = 'High' | 'Medium' | 'Low';

/** ค่าคะแนนดิบหนึ่งตัว: จำนวนเต็ม 1–10 หรือ null (ยังไม่ประเมิน) */
export type RatingInput = number | null | undefined;

export interface RiskScore {
  sev: number | null;
  occ: number | null;
  det: number | null;
  rpnStatus: RpnStatus;
  /** SEV×OCC×DET เมื่อ rpnStatus === 'computed'; มิฉะนั้น null */
  rpn: number | null;
  /** Action Priority เมื่อครบทั้งสามค่า; มิฉะนั้น null (คำนวณไม่ได้) */
  actionPriority: ActionPriority | null;
  /** true เมื่อความรุนแรงสูง (SEV ≥ 8) แต่ยังไม่ได้ quantify เต็ม (severity_only) */
  severityWarning: boolean;
  /** true เมื่อระบบต้องบังคับให้มนุษย์ review (ห้าม auto-pass) ตาม ADR-011 */
  requiresHumanReview: boolean;
}

const SEV_HIGH_WARNING_THRESHOLD = 8;

/** ตรวจว่าเป็นจำนวนเต็มในช่วง 1–10 หรือไม่ */
function isValidRating(v: RatingInput): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;
}

/** normalize input: ค่าที่ไม่ใช่จำนวนเต็ม 1–10 ถือว่า "ยังไม่ประเมิน" (null) */
function normalize(v: RatingInput): number | null {
  return isValidRating(v) ? v : null;
}

/** จัดระดับ ordinal 0–3 (monotonic ไม่ลดลงตามค่าดิบ) */
function sevLevel(sev: number): 0 | 1 | 2 | 3 {
  if (sev >= 9) return 3; // 9–10 รุนแรงมาก (ความปลอดภัย/ข้อกำหนด)
  if (sev >= 7) return 2; // 7–8 สูง
  if (sev >= 4) return 1; // 4–6 ปานกลาง
  return 0; // 1–3 ต่ำ
}

function occLevel(occ: number): 0 | 1 | 2 | 3 {
  if (occ >= 8) return 3;
  if (occ >= 4) return 2;
  if (occ >= 2) return 1;
  return 0; // 1 = แทบไม่เกิด
}

/** DET: ค่าสูง = ตรวจจับยาก = แย่กว่า (monotonic เพิ่มตามความเสี่ยง) */
function detLevel(det: number): 0 | 1 | 2 | 3 {
  if (det >= 7) return 3; // 7–10 ตรวจจับต่ำ/ไม่ได้
  if (det >= 5) return 2; // 5–6 ปานกลาง
  if (det >= 3) return 1; // 3–4 ค่อนข้างดี
  return 0; // 1–2 ตรวจจับ/ป้องกันได้ดีมาก
}

/**
 * Action Priority แบบ band-based — monotonic ไม่ลดลงเมื่อ SEV/OCC/DET เพิ่ม
 * และให้ความสำคัญกับ SEV เป็นหลัก (หลัก AIAG-VDA)
 * ทุกเงื่อนไขเป็นแบบ "≥" จึงรับประกัน monotonicity โดยโครงสร้าง
 */
export function computeActionPriority(sev: number, occ: number, det: number): ActionPriority {
  const s = sevLevel(sev);
  const o = occLevel(occ);
  const d = detLevel(det);

  // ----- High -----
  const high =
    (s === 3 && (o >= 1 || d >= 1)) || // รุนแรงมาก + มีโอกาสเกิด/ตรวจยากแม้เล็กน้อย
    (s >= 2 && o >= 2) || // สูง + เกิดปานกลางขึ้นไป
    (s >= 2 && d >= 3) || // สูง + ตรวจจับแทบไม่ได้
    (o >= 3 && d >= 2); // เกิดบ่อยมาก + ตรวจจับได้ไม่ดี
  if (high) return 'High';

  // ----- Medium -----
  const medium =
    s >= 2 || // รุนแรงสูงขึ้นไป (แม้ rare+detectable) ยังเป็น Medium
    (s >= 1 && (o >= 1 || d >= 1)) ||
    o >= 2 ||
    d >= 2;
  if (medium) return 'Medium';

  return 'Low';
}

/**
 * คำนวณ RiskScore จากค่าดิบ SEV/OCC/DET
 * - ครบทั้งสาม → computed (rpn + actionPriority)
 * - มี SEV แต่ขาด OCC/DET → severity_only (rpn=null, AP=null) + fail-safe
 * - ไม่มี SEV → not_assessed (บังคับ human review)
 */
export function scoreRisk(sevIn: RatingInput, occIn: RatingInput, detIn: RatingInput): RiskScore {
  const sev = normalize(sevIn);
  const occ = normalize(occIn);
  const det = normalize(detIn);

  if (sev !== null && occ !== null && det !== null) {
    return {
      sev,
      occ,
      det,
      rpnStatus: 'computed',
      rpn: sev * occ * det,
      actionPriority: computeActionPriority(sev, occ, det),
      severityWarning: false,
      requiresHumanReview: false,
    };
  }

  if (sev !== null) {
    // มี SEV แต่ไม่ครบ → ยังประเมินความเสี่ยงเต็มไม่ได้ (ADR-011)
    return {
      sev,
      occ,
      det,
      rpnStatus: 'severity_only',
      rpn: null,
      actionPriority: null,
      severityWarning: sev >= SEV_HIGH_WARNING_THRESHOLD,
      requiresHumanReview: true, // ไม่ auto-pass จนกว่าจะ quantify เต็ม
    };
  }

  // ไม่มีแม้ SEV → ยังไม่ประเมินเลย
  return {
    sev,
    occ,
    det,
    rpnStatus: 'not_assessed',
    rpn: null,
    actionPriority: null,
    severityWarning: false,
    requiresHumanReview: true, // บังคับ human review (ADR-011)
  };
}
