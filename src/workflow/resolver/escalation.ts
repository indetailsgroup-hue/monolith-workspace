// Feature: monolith-workflow-copilot — escalation evaluation (Req 8.1–8.7, ADR-011 RPN fail-safe)
import type { EscalationConfig } from '../domain/config';

export type EscalationStage =
  | 'design_signoff'
  | 'production_release'
  | 'procurement'
  | 'installation';

export type EscalationTarget =
  | 'designer_lead'
  | 'production_planning_lead'
  | 'installation_lead'
  | 'executive_owner'
  | 'human_review';

export type RpnStatus = 'computed' | 'severity_only' | 'not_assessed';

export interface EscalationContext {
  stage: EscalationStage;
  rpnStatus?: RpnStatus;
  rpn?: number | null;
  severity?: number | null;
  budget?: number | null;
  /** จัดซื้อเกินงบหรือไม่ (Req 8.3) */
  overBudget?: boolean;
}

export interface EscalationDecision {
  target: EscalationTarget;
  /** ผู้ที่ต้องแจ้งเพิ่ม (เช่น Sale/PM สำหรับ Installation, Req 8.6) */
  notify: string[];
  reason: string;
}

/**
 * Req 8.1–8.7 + ADR-011 — ประเมินเป้าหมายการยกระดับการอนุมัติ.
 * RPN fail-safe: rpn_status ≠ computed → ห้ามสรุปว่า "ไม่เกิน threshold".
 */
export function evaluateEscalation(
  ctx: EscalationContext,
  config: EscalationConfig,
): EscalationDecision {
  switch (ctx.stage) {
    case 'design_signoff':
      // Req 8.4 — Designer lead เสมอ ไม่ยกระดับ
      return { target: 'designer_lead', notify: [], reason: 'design_signoff_always_lead' };

    case 'procurement':
      // Req 8.3 — จัดซื้อเกินงบ → executive_owner ทันที
      if (ctx.overBudget || (ctx.budget ?? 0) > config.budgetCeiling) {
        return { target: 'executive_owner', notify: [], reason: 'procurement_over_budget' };
      }
      return { target: 'production_planning_lead', notify: [], reason: 'procurement_within_budget' };

    case 'installation':
      // Req 8.6 — Installation lead + แจ้ง Sale/PM
      return {
        target: 'installation_lead',
        notify: ['Sale', 'Project_Manager'],
        reason: 'installation_stage',
      };

    case 'production_release': {
      // Req 8.2 — budget เกิน ceiling → executive_owner
      if ((ctx.budget ?? 0) > config.budgetCeiling) {
        return { target: 'executive_owner', notify: [], reason: 'budget_over_ceiling' };
      }
      // RPN evaluation พร้อม fail-safe (ADR-011)
      const status: RpnStatus = ctx.rpnStatus ?? 'not_assessed';
      if (status === 'not_assessed') {
        // ไม่ประเมิน → บังคับ human review (ไม่ผ่านอัตโนมัติ)
        return { target: 'human_review', notify: [], reason: 'rpn_not_assessed_force_review' };
      }
      if (status === 'severity_only') {
        if ((ctx.severity ?? 0) >= config.severityOnlyEscalateAt) {
          return { target: 'executive_owner', notify: [], reason: 'severity_only_high_sev' };
        }
        return {
          target: 'production_planning_lead',
          notify: [],
          reason: 'severity_only_below_threshold',
        };
      }
      // computed
      if ((ctx.rpn ?? 0) > config.rpnThreshold) {
        return { target: 'executive_owner', notify: [], reason: 'rpn_over_threshold' };
      }
      // Req 8.5 — ไม่เข้าเงื่อนไข → หัวหน้า Production Planning
      return {
        target: 'production_planning_lead',
        notify: [],
        reason: 'production_release_normal',
      };
    }
  }
}
