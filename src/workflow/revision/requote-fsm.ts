// Feature: monolith-workflow-copilot — re-quote state machine (Req 21.6, 21.10, 21.11, 21.17)
// mirror supabase/migrations/0024 rpc_accept_requote (ground truth).

export interface RequoteState {
  internalAccepted: boolean;
  customerAccepted: boolean;
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
}

/**
 * Req 21.6/21.10/21.17 — "re-quote approved" = internal (PM+exec single consolidated)
 * AND customer accept ครบทั้งคู่. ปลด lock/เดินต่อเฉพาะเมื่อทั้งสอง flag เป็นจริง.
 *   internal accept (customer ยัง) → awaiting_customer_acceptance
 *   customer accept (internal ยัง) → awaiting_requote (ยังไม่เดินต่อ)
 */
export function acceptRequote(prev: RequoteState, actor: RequoteActor): RequoteOutcome {
  const state: RequoteState = {
    internalAccepted: prev.internalAccepted || actor === 'internal',
    customerAccepted: prev.customerAccepted || actor === 'customer',
  };
  if (state.internalAccepted && state.customerAccepted) {
    return { state, status: 'proceed', proceed: true };
  }
  if (state.internalAccepted && !state.customerAccepted) {
    return { state, status: 'awaiting_customer_acceptance', proceed: false };
  }
  return { state, status: 'awaiting_requote', proceed: false };
}
