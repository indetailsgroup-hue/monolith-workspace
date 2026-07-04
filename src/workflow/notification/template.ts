// Feature: monolith-workflow-copilot — template binding + length enforcement (Req 6.7, 6.8, 6.10, 12.2, 12.5, 12.6)
import type { NotificationChannel } from '../domain/types';

export const MAX_MESSAGE_LENGTH = 200;

export type ComposeResult =
  | { ok: true; text: string; queued: boolean }
  | { ok: false; error: 'free_text_not_allowed' | 'segment_too_long' };

/**
 * Req 6.7/6.8/6.10/12.2/12.5/12.6 — ประกอบข้อความจาก Message_Templates เท่านั้น:
 *   - templateId ไม่อยู่ในชุดที่อนุญาต → ปฏิเสธ free-text (Req 6.7)
 *   - Direct เกิน 200 → queue ไม่ truncate (Req 6.8/6.10)
 *   - segment อื่นเกิน 200 → reject (Req 12.5/12.6)
 */
export function composeMessage(
  channel: NotificationChannel,
  templateId: string,
  allowedTemplates: ReadonlySet<string>,
  renderedText: string,
): ComposeResult {
  if (!allowedTemplates.has(templateId)) {
    return { ok: false, error: 'free_text_not_allowed' };
  }
  if (renderedText.length > MAX_MESSAGE_LENGTH) {
    if (channel === 'direct_push') {
      return { ok: true, text: renderedText, queued: true }; // queue, ไม่ตัด
    }
    return { ok: false, error: 'segment_too_long' };
  }
  return { ok: true, text: renderedText, queued: false };
}
