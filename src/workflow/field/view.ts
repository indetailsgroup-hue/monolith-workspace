// Feature: monolith-workflow-copilot — Field_View builder (Req 7.1, 7.2, 7.4, 7.5)
import type { ProcessStep } from '../domain/types';

export const NO_STANDARD_DOC_MESSAGE = 'ยังไม่มีเอกสารมาตรฐาน';

export interface FieldViewInput {
  step: ProcessStep;
  /** เช็กลิสต์จาก SOS/JES */
  checklist: string[];
  /** Obsidian_Deep_Link ถ้ามีความรู้ของขั้นนี้ (มิฉะนั้น null/undefined) */
  deepLink?: string | null;
}

export interface FieldView {
  step: ProcessStep;
  checklist: string[];
  /** แสดง link เฉพาะเมื่อมีความรู้ (Req 7.4) */
  link: string | null;
  /** ข้อความเมื่อไม่มีเอกสารมาตรฐาน (Req 7.5) */
  emptyMessage: string | null;
}

/**
 * Req 7.1/7.2/7.4/7.5 — ประกอบ Field_View:
 *   แสดง Process_Step ปัจจุบัน + เช็กลิสต์
 *   มีความรู้ → Obsidian_Deep_Link
 *   ไม่มี → ซ่อน link + ข้อความ "ยังไม่มีเอกสารมาตรฐาน"
 */
export function buildFieldView(input: FieldViewInput): FieldView {
  const hasKnowledge = typeof input.deepLink === 'string' && input.deepLink.length > 0;
  return {
    step: input.step,
    checklist: input.checklist,
    link: hasKnowledge ? (input.deepLink as string) : null,
    emptyMessage: hasKnowledge ? null : NO_STANDARD_DOC_MESSAGE,
  };
}
