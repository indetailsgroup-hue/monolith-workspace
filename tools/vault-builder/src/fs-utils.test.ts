/**
 * fs-utils.test.ts — Property test: Thai character integrity (round-trip)
 *
 * Feature: daph-obsidian-second-brain, Property 7: Thai integrity
 * Validates: Requirements 5.5 (รองรับชื่อ/เนื้อหาภาษาไทยโดยไม่ทำให้อักขระเสียหาย)
 *
 * คุณสมบัติ: สำหรับสตริงใด ๆ (รวมภาษาไทย สระบน/ล่าง วรรณยุกต์ อักขระผสม)
 * เมื่อ writeUtf8 แล้ว readUtf8 กลับ ผลลัพธ์ต้องเท่ากับต้นฉบับทุกอักขระ (identity)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readUtf8, renameWithRetry, writeUtf8 } from './fs-utils.js';

function errWithCode(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

describe('renameWithRetry — transient Windows rename resilience', () => {
  it('retries EPERM/EACCES/EBUSY then succeeds (fixes the intermittent flake)', () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      let calls = 0;
      const sleeps: number[] = [];
      const rename = () => {
        calls += 1;
        if (calls <= 2) throw errWithCode(code);
      };
      renameWithRetry('from', 'to', rename, (ms) => sleeps.push(ms));
      expect(calls).toBe(3); // failed twice, succeeded on the third
      expect(sleeps.length).toBe(2); // one backoff before each retry
    }
  });

  it('rethrows a non-transient error immediately without retrying', () => {
    let calls = 0;
    const rename = () => {
      calls += 1;
      throw errWithCode('ENOSPC');
    };
    expect(() => renameWithRetry('from', 'to', rename, () => {})).toThrow('ENOSPC');
    expect(calls).toBe(1);
  });

  it('gives up after maxAttempts and rethrows the transient error', () => {
    let calls = 0;
    const rename = () => {
      calls += 1;
      throw errWithCode('EPERM');
    };
    expect(() => renameWithRetry('from', 'to', rename, () => {}, 4)).toThrow('EPERM');
    expect(calls).toBe(4);
  });
});

describe('fs-utils — Thai round-trip (Property 7 / Req 5.5)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'daph-fsutils-'));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  // อักขระไทยที่ใช้สร้าง input หลากหลาย (พยัญชนะ สระบน/ล่าง วรรณยุกต์ ไม้ไต่คู้ ฯลฯ)
  const thaiChars =
    'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ' +
    'ะาำิีึืุูเแโใไๅๆ็่้๊๋์ํ' +
    '๐๑๒๓๔๕๖๗๘๙ ';

  const arbThai = fc
    .array(fc.constantFrom(...thaiChars.split('')), { minLength: 0, maxLength: 200 })
    .map((chars) => chars.join(''));

  // ผสมไทย + อังกฤษ + อักขระพิเศษที่พบในชื่อไฟล์จริง (P'oil, วงเล็บ, จุด, ขีด)
  const arbMixed = fc
    .array(
      fc.oneof(
        fc.constantFrom(...thaiChars.split('')),
        fc.constantFrom(..."ABCdef123 -_.,()'\n\t#|→".split('')),
      ),
      { minLength: 0, maxLength: 300 },
    )
    .map((chars) => chars.join(''));

  it('writeUtf8 → readUtf8 เป็น identity สำหรับสตริงไทยล้วน', () => {
    let n = 0;
    fc.assert(
      fc.property(arbThai, (content) => {
        const file = join(workDir, `thai-${n++}.md`);
        writeUtf8(file, content);
        return readUtf8(file) === content;
      }),
      { numRuns: 100 },
    );
  });

  it('writeUtf8 → readUtf8 เป็น identity สำหรับสตริงผสมไทย/อังกฤษ/อักขระพิเศษ', () => {
    let n = 0;
    fc.assert(
      fc.property(arbMixed, (content) => {
        const file = join(workDir, `mixed-${n++}.md`);
        writeUtf8(file, content);
        return readUtf8(file) === content;
      }),
      { numRuns: 100 },
    );
  });

  it('เขียนทับซ้ำ (idempotent) ด้วยเนื้อหาเดิมให้ผลอ่านเท่าเดิม', () => {
    const file = join(workDir, 'idempotent.md');
    const content = 'การติดตั้งโครงอลูมิเนียม — DAPH PFMEA, Sale (P\'oil)';
    writeUtf8(file, content);
    writeUtf8(file, content);
    expect(readUtf8(file)).toBe(content);
  });
});
