// Feature: monolith-workflow-copilot — SLA / reminder / timeout sweep (Req 13.1–13.5)
import type { SlaConfig } from '../domain/config';

/** Req 13.1 — คำนวณ SLA_Deadline (epoch ms) จากเวลาเริ่มและ config */
export function computeDeadlineMs(startMs: number, config: SlaConfig): number {
  return startMs + config.deadlineMinutes * 60 * 1000;
}

/**
 * Req 13.2/13.3 — reminder fractions ที่ "ถึงกำหนด" ณ เวลา now:
 * คืนสัดส่วนที่ elapsed/duration ≥ fraction (เช่น 0.5, 1.0).
 * reminder เหล่านี้จัดเป็น Direct_Responsibility_Item (Req 13.5 — caller กำหนด channel).
 */
export function dueReminderFractions(
  startMs: number,
  nowMs: number,
  config: SlaConfig,
): number[] {
  const durationMs = config.deadlineMinutes * 60 * 1000;
  if (durationMs <= 0) return [...config.reminderFractions];
  const elapsedFraction = (nowMs - startMs) / durationMs;
  return config.reminderFractions.filter((f) => elapsedFraction >= f);
}

/**
 * Req 13.4 — เกิน timeout: escalate ทันทีเมื่อ now > deadline
 * (ไม่รอ formal status เปลี่ยน).
 */
export function isTimedOut(startMs: number, nowMs: number, config: SlaConfig): boolean {
  return nowMs > computeDeadlineMs(startMs, config);
}
