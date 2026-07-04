// Feature: monolith-workflow-copilot — exponential backoff + delivery failure (Req 18.1, 18.2, 18.3)
import type { RetryConfig } from '../domain/config';

/**
 * Req 18.2 — คำนวณหน่วงครั้งถัดไปแบบ exponential: base * factor^(attempt) จำกัดที่ maxDelay.
 * attempt เริ่มที่ 0 (ครั้งแรกที่ล้มเหลว).
 */
export function nextBackoffDelayMs(attempt: number, config: RetryConfig): number {
  const raw = config.baseDelayMs * Math.pow(config.backoffFactor, Math.max(0, attempt));
  return Math.min(raw, config.maxDelayMs);
}

/**
 * Req 18.3 — ครบจำนวน retry แล้วหรือยัง (attempts = จำนวนครั้งที่พยายามไปแล้ว).
 * เมื่อ true → mark Delivery_Failure ถาวร (คงไว้แม้ recover ภายหลัง).
 */
export function isRetriesExhausted(attempts: number, config: RetryConfig): boolean {
  return attempts >= config.maxAttempts;
}

export interface DeliveryState {
  attempts: number;
  status: 'pending' | 'sent' | 'delivery_failure';
}

/**
 * Req 18.1–18.3 — เปลี่ยนสถานะหลังพยายามส่ง 1 ครั้ง:
 *   success → sent
 *   fail + ยังไม่ครบ → pending (รอ retry), attempts+1
 *   fail + ครบ → delivery_failure (ถาวร), attempts+1
 * delivery_failure คงอยู่เสมอ (idempotent — recover ภายหลังไม่ย้อนสถานะ).
 */
export function recordAttempt(
  state: DeliveryState,
  success: boolean,
  config: RetryConfig,
): DeliveryState {
  if (state.status === 'delivery_failure') return state; // คงถาวร
  if (success) return { attempts: state.attempts, status: 'sent' };
  const attempts = state.attempts + 1;
  return {
    attempts,
    status: isRetriesExhausted(attempts, config) ? 'delivery_failure' : 'pending',
  };
}
