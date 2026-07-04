// Feature: monolith-workflow-copilot — Copilot suggestion builder (Req 5.1–5.7, 5.9, 12.4)
import type { AutonomyLadderTier } from '../autonomy/registry';

export interface CopilotOption {
  label: string;
  pros: string[];
  cons: string[];
}

export interface PfmeaCitation {
  processStep: string;
  failureMode: string;
  rpn: number | null;
  rpnStatus: 'computed' | 'severity_only' | 'not_assessed';
}

export interface BuildSuggestionInput {
  options: CopilotOption[];
  /** ต้องอ้าง PFMEA เสมอ (Req 5.4) */
  citation: PfmeaCitation | null;
  autonomyTier: AutonomyLadderTier;
  /** กลไกอนุมัติพร้อมหรือไม่ (Req 5.9) */
  approvalMechanismReady: boolean;
}

export type BuildSuggestionResult =
  | {
      ok: true;
      options: CopilotOption[];
      citation: PfmeaCitation;
      autonomyTier: AutonomyLadderTier;
      advisoryOnly: true;
    }
  | {
      ok: false;
      error:
        | 'invalid_option_count'
        | 'option_missing_pros_cons'
        | 'missing_pfmea_citation'
        | 'fail_safe_block_no_approval';
    };

/**
 * Req 5.1–5.7/5.9/12.4 — สร้าง Copilot_Suggestion:
 *   - 2–3 ตัวเลือก (นอกช่วง → reject)
 *   - แต่ละตัวมี pros/cons
 *   - อ้าง PFMEA_Risk_Row + RPN เสมอ
 *   - advisory-only (ไม่เปลี่ยน state อัตโนมัติ)
 *   - tier ต้องอนุมัติแต่ Approval_Mechanism ไม่พร้อม → fail-safe block
 */
export function buildSuggestion(input: BuildSuggestionInput): BuildSuggestionResult {
  if (input.options.length < 2 || input.options.length > 3) {
    return { ok: false, error: 'invalid_option_count' };
  }
  for (const o of input.options) {
    if (o.pros.length === 0 || o.cons.length === 0) {
      return { ok: false, error: 'option_missing_pros_cons' };
    }
  }
  if (input.citation === null) {
    return { ok: false, error: 'missing_pfmea_citation' };
  }
  // advisory tier (L0) ไม่ต้องการ approval mechanism; ตั้งแต่ L1 ขึ้นไปต้องมีกลไกอนุมัติพร้อม
  const needsApproval = input.autonomyTier !== 'L0_advisory';
  if (needsApproval && !input.approvalMechanismReady) {
    return { ok: false, error: 'fail_safe_block_no_approval' };
  }
  return {
    ok: true,
    options: input.options,
    citation: input.citation,
    autonomyTier: input.autonomyTier,
    advisoryOnly: true,
  };
}
