/**
 * pfmea-parser.test.ts — tests + smoke report สำหรับ PFMEA parser
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 *
 * - anchor unit tests: ยืนยัน carry-forward + RPN self-check + filler skip ด้วยตัวอย่างจริง
 * - smoke report: parse ไฟล์ PFMEA จริงทั้งหมดใน _daph_extract แล้ว log สรุป
 *   (computed = มี RPN ที่ cross-check ผ่าน) เพื่อใช้รายงาน canonical selection
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parsePfmeaText } from './pfmea-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
// tools/vault-builder/src → repo root → _daph_extract
const extractDir = join(here, '..', '..', '..', '_daph_extract');

describe('pfmea-parser', () => {
  it('anchor: Factory carry-forward + RPN self-check', () => {
    // เลียนโครงสร้างจริง: R12 full row (sev8/occ2/det7/rpn112), R13 continuation (occ3 → 168)
    const sample = [
      'R12: 1. Incoming Inspection | วัสดุถูกต้อง | วัสดุไม่ถูกต้อง | DAPH : Scrap 100% | 8 | Operator ไม่ตรวจ | 2 | ตรวจสอบก่อนผลิต | 100% สายตา | 7 | 112 | 0',
      'R13: เอกสารไม่ระบุ | 3 | บันทึก check sheet | 100% สายตา | 7 | 168',
      'R16: 0 | 0',
    ].join('\n');
    const parsed = parsePfmeaText('sample', sample);
    expect(parsed.steps).toContain('1. Incoming Inspection');
    expect(parsed.rows.length).toBe(2); // filler R16 ถูกข้าม
    expect(parsed.rows[0]).toMatchObject({ requirement: 'วัสดุถูกต้อง', failureMode: 'วัสดุไม่ถูกต้อง', sev: 8, occ: 2, det: 7, statedRpn: 112, rpnCheckOk: true });
    // R13 continuation: 8×3×7 = 168 → triple พบ (8 carry มาเป็น rating ใน row? ไม่—row นี้มี 3,7)
    expect(parsed.rows[1].statedRpn).toBe(168);
  });

  it('anchor: OCC "0" และ row ที่ไม่มี RPN → ไม่ computed', () => {
    const sample = 'R12: 1.Sales Process | เก็บข้อมูล | ไม่เก็บข้อมูล | DAPH : Scrap | 9 | สาเหตุ | control | detect | 0 | 0';
    const parsed = parsePfmeaText('s', sample);
    expect(parsed.rows[0].rpnCheckOk).toBe(false);
    expect(parsed.rows[0].occ).toBeNull(); // "0" ไม่ถือเป็น occurrence
    expect(parsed.rows[0].det).toBeNull();
  });

  it('smoke report: parse PFMEA จริงทั้งหมด + สรุป', () => {
    if (!existsSync(extractDir)) {
      console.warn(`[pfmea-report] ไม่พบ ${extractDir} — ข้าม smoke report`);
      return;
    }
    const files = readdirSync(extractDir).filter((f) => /PFMEA.*\.xlsx\.txt$/.test(f));
    const summary: string[] = [];
    let totalComputed = 0;
    for (const f of files.sort()) {
      const text = readFileSync(join(extractDir, f), 'utf8');
      const parsed = parsePfmeaText(f, text);
      const computed = parsed.rows.filter((r) => r.rpnCheckOk).length;
      const sevOnly = parsed.rows.filter((r) => !r.rpnCheckOk && r.sev !== null).length;
      const none = parsed.rows.filter((r) => r.sev === null).length;
      totalComputed += computed;
      summary.push(
        `${f}\n   owner=${parsed.processOwner ?? '?'} | steps=${parsed.steps.length} | rows=${parsed.rows.length} | computed=${computed} sevOnly=${sevOnly} notAssessed=${none}`,
      );
    }
    console.log('\n===== PFMEA PARSE REPORT =====\n' + summary.join('\n') + '\n');
    expect(totalComputed).toBeGreaterThan(0); // อย่างน้อย Factory ต้อง compute ได้
  });
});
