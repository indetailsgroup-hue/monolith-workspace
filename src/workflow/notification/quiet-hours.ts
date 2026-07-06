// Feature: monolith-workflow-copilot — Quiet_Hours window (Req 6.4, 6.6, 6.9)
// mirror supabase/migrations/0086 fn_wf_in_quiet_hours (ground truth ฝั่ง DB).
//
// ค่าจริงจากมติ owner (grill-with-docs 2026-07-06, glossary workflow spec):
//   Quiet_Hours = 20:00–08:00 เวลาไทย · Daily_Digest = 08:00 ไทย (= '0 1 * * *' UTC — 0089)
// ไทยไม่มี DST → offset UTC+7 คงที่ ใช้เลขตายตัวได้อย่างปลอดภัย

/** นาทีตั้งแต่เที่ยงคืน (เวลาไทย) ที่ Quiet_Hours เริ่ม — 20:00 */
export const QUIET_START_MINUTES = 20 * 60;
/** นาทีตั้งแต่เที่ยงคืน (เวลาไทย) ที่ Quiet_Hours จบ (exclusive) — 08:00 = เวลา Daily_Digest */
export const QUIET_END_MINUTES = 8 * 60;

const BANGKOK_UTC_OFFSET_MINUTES = 7 * 60;
const MINUTES_PER_DAY = 24 * 60;

/** นาทีตั้งแต่เที่ยงคืนตามเวลาไทย (Asia/Bangkok = UTC+7 คงที่) ของ instant ที่ให้มา */
export function bangkokMinutesOfDay(at: Date): number {
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (utcMinutes + BANGKOK_UTC_OFFSET_MINUTES) % MINUTES_PER_DAY;
}

/**
 * หน้าต่างข้ามเที่ยงคืน: [20:00, 24:00) ∪ [00:00, 08:00) — mirror เงื่อนไข OR ใน fn_wf_in_quiet_hours.
 * ขอบ: 20:00 = quiet แล้ว · 08:00 = พ้น quiet แล้ว (digest ออก 08:00 พอดี)
 */
export function isQuietMinutes(minutesOfDayBangkok: number): boolean {
  return minutesOfDayBangkok >= QUIET_START_MINUTES || minutesOfDayBangkok < QUIET_END_MINUTES;
}

/** instant นี้อยู่ใน Quiet_Hours (เวลาไทย) หรือไม่ */
export function isInQuietHours(at: Date): boolean {
  return isQuietMinutes(bangkokMinutesOfDay(at));
}
