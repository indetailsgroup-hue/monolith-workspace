// Feature: monolith-workflow-copilot — notification suppression matrix (Req 6.3, 6.5, 6.6, 6.9)
import type { NotificationChannel } from '../domain/types';

export interface SuppressionInput {
  channel: NotificationChannel;
  /** ผู้ใช้ mute หมวดนี้หรือไม่ (Req 6.5) */
  muted: boolean;
  /** อยู่ในช่วง Quiet_Hours หรือไม่ (Req 6.6) */
  inQuietHours: boolean;
}

export type SuppressionResult =
  | 'deliver' // ส่งทันที
  | 'suppress_digest' // ระงับ + สะสมเข้า Daily_Digest (Req 6.6)
  | 'suppress'; // ระงับสนิท (mute)

/**
 * Req 6.3/6.5/6.6/6.9 — เมทริกซ์การระงับ:
 *   mute เหนือสุดเสมอ (รวม Direct) → suppress
 *   Direct ข้ามได้เฉพาะ Quiet_Hours (ไม่ข้าม mute) → deliver
 *   non-Direct ใน Quiet_Hours → suppress_digest
 *   non-Direct นอก Quiet_Hours → deliver
 */
export function evaluateSuppression(input: SuppressionInput): SuppressionResult {
  if (input.muted) return 'suppress'; // mute ชนะทุกกรณี (รวม Direct)
  if (input.channel === 'direct_push') return 'deliver'; // Direct ข้าม Quiet_Hours
  // non-Direct
  return input.inQuietHours ? 'suppress_digest' : 'deliver';
}
