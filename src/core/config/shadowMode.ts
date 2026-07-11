/**
 * shadowMode.ts — ADR-065 Q3: Designer shadow mode ระหว่าง dogfood (S17 ยังไม่ปิด)
 *
 * เส้นแดง ADR-065: ห้ามตัดชิ้นงานจริงจาก packet จนกว่า S17 ปิด
 * packet ทุกใบที่ออกจาก Designer จึงติดป้าย NOT-FOR-PRODUCTION ทั้งใน
 * ชื่อไฟล์ zip, ไฟล์ประกาศใน packet และ UI — โรงงานตัดจากใบสั่งเดิม
 * แล้วใช้ packet เทียบกับของจริงเป็น evidence ป้อน S17 เท่านั้น
 *
 * เงื่อนไขปิด flag (gate "ตัดจริง" — ต้องครบทั้งสี่):
 *   1. S17-1..5 ปิดครบ (identity / RELEASED invariant / packet spec / determinism / verifier)
 *   2. ADR-064 ลงชื่อครบ 4 (Product Owner, Tech Lead, Security Owner, Factory Owner)
 *   3. บ้าน dogfood ผ่านเต็มสาย ≥1 งาน
 *   4. machine profile 1 ตัว calibrate กับโรงงานแล้ว
 */

export const SHADOW_MODE_NOT_FOR_PRODUCTION = true;

export const NOT_FOR_PRODUCTION_LABEL = 'NOT-FOR-PRODUCTION';

export const NOT_FOR_PRODUCTION_FILE = 'NOT_FOR_PRODUCTION.txt';

export const NOT_FOR_PRODUCTION_NOTICE = [
  '*** NOT FOR PRODUCTION — ห้ามใช้ตัดชิ้นงานจริง ***',
  '',
  'packet นี้ออกในโหมด shadow ระหว่างช่วง dogfood (ADR-065 Q3)',
  'ห้ามนำไปตัดชิ้นงานจริงจนกว่า S17 production blockers จะปิดครบ',
  'และ gate "ตัดจริง" ผ่านทั้งสี่เงื่อนไข (ดู ADR-065)',
  '',
  'This packet was produced in shadow mode during the dogfood phase.',
  'Do NOT cut real workpieces from it until all S17 production',
  'blockers are closed and the four-condition real-cut gate passes.',
  '',
  'ใช้ได้เฉพาะ: เทียบกับใบสั่งผลิตเดิมของโรงงานเพื่อเก็บ evidence ป้อน S17',
].join('\n');
