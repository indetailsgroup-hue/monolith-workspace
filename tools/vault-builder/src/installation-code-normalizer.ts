/**
 * installation-code-normalizer.ts — แก้รหัสเอกสารซ้ำใน Installation (Phase 1)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 1 data fix)
 *
 * ปัญหาในต้นฉบับ (ยืนยันจาก `_daph_extract/2.JES_DAPH_INSTALLATION.xlsx.txt`,
 * `1.SOS_DAPH_INSTALLATION.xlsx.txt`): ชีต 7–16 ของ JES ใช้ `DAPH-JES-006` ซ้ำ
 * และชีต 7–16 ของ SOS ใช้ `SOS 002` ซ้ำ (data-entry bug — ก๊อปชีตแล้วลืมแก้ Doc no.)
 *
 * นโยบาย (deterministic, non-destructive — ไม่แก้ไฟล์ Excel ต้นฉบับ): ออกรหัส
 * canonical = ลำดับชีต (1-based) เสมอ → JES/SOS ของ Installation ได้รหัสไม่ซ้ำ
 * 001..016 ตามลำดับขั้น ป้องกัน Document_Set linker ยุบรวมงานผิด
 */

export type InstallationDocKind = 'SOS' | 'JES';

/** รหัส canonical ของชีตที่ลำดับ `sheetOrdinal` (1-based) */
export function canonicalInstallationCode(kind: InstallationDocKind, sheetOrdinal: number): string {
  if (!Number.isInteger(sheetOrdinal) || sheetOrdinal < 1) {
    throw new RangeError(`sheetOrdinal must be an integer >= 1, got ${sheetOrdinal}`);
  }
  const num = String(sheetOrdinal).padStart(3, '0');
  return kind === 'JES' ? `DAPH-JES-${num}` : `SOS ${num}`;
}

export interface NormalizedSheetCode {
  sheetOrdinal: number;
  /** รหัสดิบที่อ่านจากต้นฉบับ (อาจซ้ำ) — null ถ้าหาไม่พบ */
  rawCode: string | null;
  /** รหัส canonical ตามลำดับชีต */
  canonicalCode: string;
  /** true เมื่อ rawCode ไม่ตรงกับ canonical (พบ bug รหัสซ้ำ/ผิด) */
  wasReassigned: boolean;
}

/**
 * normalize รหัสของชุดชีต Installation
 * @param kind SOS | JES
 * @param rawCodes รหัสดิบเรียงตามลำดับชีต (index 0 = ชีต 1); null = หาไม่พบ
 * @returns รายการรหัส canonical ไม่ซ้ำ + ธงว่าถูก reassign หรือไม่
 */
export function normalizeInstallationCodes(
  kind: InstallationDocKind,
  rawCodes: ReadonlyArray<string | null>,
): NormalizedSheetCode[] {
  return rawCodes.map((rawCode, i) => {
    const sheetOrdinal = i + 1;
    const canonicalCode = canonicalInstallationCode(kind, sheetOrdinal);
    const normalizedRaw = rawCode?.trim() ?? null;
    return {
      sheetOrdinal,
      rawCode: normalizedRaw,
      canonicalCode,
      wasReassigned: normalizedRaw !== canonicalCode,
    };
  });
}
