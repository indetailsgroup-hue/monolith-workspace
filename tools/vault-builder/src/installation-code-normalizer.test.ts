/**
 * installation-code-normalizer.test.ts — Property tests สำหรับ normalizer รหัสซ้ำ (Phase 1)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 1 data fix)
 *
 * Properties:
 *  - P-IN1: รหัส canonical ไม่ซ้ำกันเลย สำหรับชุดชีตใด ๆ
 *  - P-IN2: รหัส canonical = ลำดับชีต (1-based) เสมอ ไม่ขึ้นกับ rawCode
 *  - P-IN3: wasReassigned ⟺ rawCode ≠ canonicalCode
 *  - unit: สถานการณ์ bug จริง (JES ชีต 7–16 = DAPH-JES-006), throw เมื่อ ordinal ผิด
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  canonicalInstallationCode,
  normalizeInstallationCodes,
} from './installation-code-normalizer.js';

const RUNS = { numRuns: 200 };

describe('installation-code-normalizer (Phase 1)', () => {
  it('P-IN1 & P-IN2: รหัส canonical ไม่ซ้ำ + = ลำดับชีต', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('SOS' as const, 'JES' as const),
        fc.array(fc.option(fc.string(), { nil: null }), { minLength: 1, maxLength: 16 }),
        (kind, rawCodes) => {
          const out = normalizeInstallationCodes(kind, rawCodes);
          const codes = out.map((o) => o.canonicalCode);
          expect(new Set(codes).size).toBe(codes.length); // ไม่ซ้ำ
          out.forEach((o, i) => {
            expect(o.sheetOrdinal).toBe(i + 1);
            expect(o.canonicalCode).toBe(canonicalInstallationCode(kind, i + 1));
          });
        },
      ),
      RUNS,
    );
  });

  it('P-IN3: wasReassigned ⟺ rawCode ≠ canonicalCode', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('SOS' as const, 'JES' as const),
        fc.array(fc.option(fc.string(), { nil: null }), { minLength: 1, maxLength: 16 }),
        (kind, rawCodes) => {
          const out = normalizeInstallationCodes(kind, rawCodes);
          for (const o of out) {
            const expectedReassign = (o.rawCode ?? null) !== o.canonicalCode;
            expect(o.wasReassigned).toBe(expectedReassign);
          }
        },
      ),
      RUNS,
    );
  });

  it('unit: สถานการณ์ bug จริง — JES ชีต 7–16 ซ้ำ DAPH-JES-006', () => {
    // ชีต 1–6 ถูกต้อง, ชีต 7–16 ซ้ำเป็น 006 (ตามต้นฉบับจริง)
    const raw = [
      'DAPH-JES-001',
      'DAPH-JES-002',
      'DAPH-JES-003',
      'DAPH-JES-004',
      'DAPH-JES-005',
      'DAPH-JES-006',
      ...Array(10).fill('DAPH-JES-006'),
    ];
    const out = normalizeInstallationCodes('JES', raw);
    expect(out.map((o) => o.canonicalCode)).toEqual([
      'DAPH-JES-001', 'DAPH-JES-002', 'DAPH-JES-003', 'DAPH-JES-004',
      'DAPH-JES-005', 'DAPH-JES-006', 'DAPH-JES-007', 'DAPH-JES-008',
      'DAPH-JES-009', 'DAPH-JES-010', 'DAPH-JES-011', 'DAPH-JES-012',
      'DAPH-JES-013', 'DAPH-JES-014', 'DAPH-JES-015', 'DAPH-JES-016',
    ]);
    // ชีต 1–6 ตรง → ไม่ reassign; 7–16 ถูกแก้
    expect(out.slice(0, 6).every((o) => !o.wasReassigned)).toBe(true);
    expect(out.slice(6).every((o) => o.wasReassigned)).toBe(true);
  });

  it('unit: SOS ชีต 7–16 ซ้ำ SOS 002 → แก้เป็น 007–016', () => {
    const raw = [
      'SOS 001', 'SOS 002', 'SOS 003', 'SOS 004', 'SOS 005', 'SOS 006',
      ...Array(10).fill('SOS 002'),
    ];
    const out = normalizeInstallationCodes('SOS', raw);
    expect(out[6].canonicalCode).toBe('SOS 007');
    expect(out[15].canonicalCode).toBe('SOS 016');
    expect(out.slice(6).every((o) => o.wasReassigned)).toBe(true);
  });

  it('unit: throw เมื่อ sheetOrdinal < 1 หรือไม่ใช่จำนวนเต็ม', () => {
    expect(() => canonicalInstallationCode('JES', 0)).toThrow(RangeError);
    expect(() => canonicalInstallationCode('SOS', 1.5)).toThrow(RangeError);
  });
});
