// Feature: monolith-workflow-copilot — re-quote state machine (Req 21.6, 21.10, 21.11, 21.17)
// mirror supabase/migrations/0024 + 0087 rpc_accept_requote (ground truth).

import { stepForGate, type DesignGate } from './gate-wiring';
import type { ProcessStep } from '../domain/types';

export interface RequoteState {
  internalAccepted: boolean;
  customerAccepted: boolean;
  /** ADR-037 (0087): gate ที่แตกตอน scope_change — เก็บไว้เพื่อ revert ตอน accept ครบคู่ */
  gate?: DesignGate | null;
}

export type RequoteStatus =
  | 'awaiting_requote'
  | 'awaiting_customer_acceptance'
  | 'proceed';

export type RequoteActor = 'internal' | 'customer';

export interface RequoteOutcome {
  state: RequoteState;
  status: RequoteStatus;
  /** ปลด lock + เดินต่อได้หรือไม่ (เฉพาะเมื่อครบทั้งคู่ — Req 21.17) */
  proceed: boolean;
  /**
   * ADR-037 — เมื่อ proceed และรู้ gate: งาน revert current_step กลับไป step ของ gate นั้น
   * (ปลด lock ของ gate + เคลียร์ _requote; trigger 0084 re-lock เองเมื่อ gate ผ่านการอนุมัติรอบใหม่)
   * null = ไม่ revert (ไม่รู้ gate — พฤติกรรม legacy ก่อน 0087 หรือยังไม่ proceed)
   */
  revertToStep: ProcessStep | null;
}

/**
 * Req 21.6/21.10/21.17 — "re-quote approved" = internal (PM+exec single consolidated)
 * AND customer accept ครบทั้งคู่. ปลด lock/เดินต่อเฉพาะเมื่อทั้งสอง flag เป็นจริง.
 *   internal accept (customer ยัง) → awaiting_customer_acceptance
 *   customer accept (internal ยัง) → awaiting_requote (ยังไม่เดินต่อ)
 *   ครบคู่ → proceed + revert ไป step ของ gate ที่แตก (ADR-037)
 */
export function acceptRequote(prev: RequoteState, actor: RequoteActor): RequoteOutcome {
  const state: RequoteState = {
    internalAccepted: prev.internalAccepted || actor === 'internal',
    customerAccepted: prev.customerAccepted || actor === 'customer',
    gate: prev.gate ?? null,
  };
  if (state.internalAccepted && state.customerAccepted) {
    return {
      state,
      status: 'proceed',
      proceed: true,
      revertToStep: state.gate != null ? stepForGate(state.gate) : null,
    };
  }
  if (state.internalAccepted && !state.customerAccepted) {
    return { state, status: 'awaiting_customer_acceptance', proceed: false, revertToStep: null };
  }
  return { state, status: 'awaiting_requote', proceed: false, revertToStep: null };
}
