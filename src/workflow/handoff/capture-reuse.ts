// Feature: monolith-workflow-copilot — capture-once-reuse (Req 12.1)

export type WorkItemData = Record<string, unknown>;

/**
 * Req 12.1 — นำข้อมูลที่ป้อนแล้วใน work_item.data กลับมาใช้ในขั้นถัดไปโดยไม่ขอซ้ำ:
 * คืนรายชื่อ field ที่ "ขาด" (ต้องขอเพิ่ม) เทียบกับ field ที่ขั้นถัดไปต้องการ.
 */
export function missingFields(
  existingData: WorkItemData,
  requiredFields: readonly string[],
): string[] {
  return requiredFields.filter(
    (f) => existingData[f] === undefined || existingData[f] === null,
  );
}

/** true ถ้าทุก field ที่ต้องการมีอยู่แล้ว (ไม่ต้องขอซ้ำ) */
export function canReuseAll(
  existingData: WorkItemData,
  requiredFields: readonly string[],
): boolean {
  return missingFields(existingData, requiredFields).length === 0;
}

/** รวมข้อมูลที่ป้อนใหม่เข้ากับของเดิม (ของเดิมไม่ถูกขอซ้ำ; ใหม่ override เฉพาะที่ส่งมา) */
export function mergeCaptured(
  existingData: WorkItemData,
  newlyCaptured: WorkItemData,
): WorkItemData {
  return { ...existingData, ...newlyCaptured };
}
