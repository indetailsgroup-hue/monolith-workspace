// Feature: monolith-workflow-copilot — Quiet_Hours mirror ของ 0086 fn_wf_in_quiet_hours (Req 6.4/6.6/6.9, B2/F10)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  QUIET_START_MINUTES,
  QUIET_END_MINUTES,
  bangkokMinutesOfDay,
  isQuietMinutes,
  isInQuietHours,
} from '../quiet-hours';

describe('Quiet_Hours 20:00–08:00 เวลาไทย (มติ grill 2026-07-06)', () => {
  it('ขอบหน้าต่างตรง glossary: 20:00 เข้า quiet · 08:00 พ้น quiet (= เวลา digest)', () => {
    expect(isQuietMinutes(20 * 60)).toBe(true); // 20:00 → quiet เริ่ม
    expect(isQuietMinutes(20 * 60 - 1)).toBe(false); // 19:59 → ยังส่งปกติ
    expect(isQuietMinutes(8 * 60 - 1)).toBe(true); // 07:59 → ยัง quiet
    expect(isQuietMinutes(8 * 60)).toBe(false); // 08:00 → พ้น quiet (digest ออกพอดี)
    expect(isQuietMinutes(0)).toBe(true); // เที่ยงคืน → quiet (หน้าต่างข้ามวัน)
    expect(isQuietMinutes(12 * 60)).toBe(false); // เที่ยงวัน → ปกติ
  });

  it('แปลงเวลาไทยจาก UTC ถูก (UTC+7 คงที่ — ไทยไม่มี DST)', () => {
    // 13:00Z = 20:00 ไทย → quiet · 01:00Z = 08:00 ไทย → พ้น quiet
    expect(isInQuietHours(new Date('2026-07-06T13:00:00Z'))).toBe(true);
    expect(isInQuietHours(new Date('2026-07-06T12:59:00Z'))).toBe(false);
    expect(isInQuietHours(new Date('2026-07-06T01:00:00Z'))).toBe(false);
    expect(isInQuietHours(new Date('2026-07-06T00:59:00Z'))).toBe(true);
    // ข้ามวันฝั่ง UTC: 18:00Z = 01:00 ไทยวันถัดไป → quiet
    expect(isInQuietHours(new Date('2026-07-06T18:00:00Z'))).toBe(true);
    expect(bangkokMinutesOfDay(new Date('2026-07-06T18:30:00Z'))).toBe(90); // 01:30 ไทย
  });

  it('Property: quiet ⟺ นาที ∈ [1200, 1440) ∪ [0, 480) — ครอบทุกนาทีของวัน', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 * 60 - 1 }), (m) => {
        expect(isQuietMinutes(m)).toBe(m >= QUIET_START_MINUTES || m < QUIET_END_MINUTES);
      }),
      { numRuns: 200 },
    );
  });

  it('Property: หน้าต่าง quiet ยาว 12 ชั่วโมงพอดี (20:00→08:00)', () => {
    let quietCount = 0;
    for (let m = 0; m < 24 * 60; m++) if (isQuietMinutes(m)) quietCount++;
    expect(quietCount).toBe(12 * 60);
  });
});
