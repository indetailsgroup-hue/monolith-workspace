// Feature: monolith-workflow-copilot — property tests for escalation (Req 8, ADR-011)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateEscalation, type EscalationContext } from '../escalation';
import { DEFAULT_WORKFLOW_CONFIG } from '../../domain/config';

const CFG = DEFAULT_WORKFLOW_CONFIG.escalation;

describe('escalation evaluation (Req 8, ADR-011)', () => {
  // Feature: monolith-workflow-copilot, Property 17: เกณฑ์การยกระดับการอนุมัติตามความเสี่ยง/งบประมาณ
  it('Property 17: design_signoff → designer_lead เสมอ (Req 8.4)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e9, noNaN: true }), (budget) => {
        const ctx: EscalationContext = { stage: 'design_signoff', budget };
        expect(evaluateEscalation(ctx, CFG).target).toBe('designer_lead');
      }),
      { numRuns: 100 },
    );
  });

  it('Property 17b: production_release — budget เกิน ceiling → executive_owner', () => {
    fc.assert(
      fc.property(
        fc.double({ min: CFG.budgetCeiling + 1, max: 1e9, noNaN: true }),
        (budget) => {
          const ctx: EscalationContext = {
            stage: 'production_release',
            budget,
            rpnStatus: 'computed',
            rpn: 0,
          };
          expect(evaluateEscalation(ctx, CFG).target).toBe('executive_owner');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 17c: production_release computed — RPN > threshold → executive; else production lead', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (rpn) => {
        const ctx: EscalationContext = {
          stage: 'production_release',
          budget: 0,
          rpnStatus: 'computed',
          rpn,
        };
        const target = evaluateEscalation(ctx, CFG).target;
        expect(target).toBe(rpn > CFG.rpnThreshold ? 'executive_owner' : 'production_planning_lead');
      }),
      { numRuns: 200 },
    );
  });

  it('Property 17d: not_assessed → human_review (fail-safe ADR-011)', () => {
    const ctx: EscalationContext = { stage: 'production_release', budget: 0, rpnStatus: 'not_assessed' };
    expect(evaluateEscalation(ctx, CFG).target).toBe('human_review');
  });

  it('Property 17e: severity_only — SEV ≥ threshold → executive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15 }), (sev) => {
        const ctx: EscalationContext = {
          stage: 'production_release',
          budget: 0,
          rpnStatus: 'severity_only',
          severity: sev,
        };
        const target = evaluateEscalation(ctx, CFG).target;
        expect(target).toBe(
          sev >= CFG.severityOnlyEscalateAt ? 'executive_owner' : 'production_planning_lead',
        );
      }),
      { numRuns: 100 },
    );
  });

  it('Property 17f: installation → installation_lead + แจ้ง Sale/PM (Req 8.6)', () => {
    const d = evaluateEscalation({ stage: 'installation' }, CFG);
    expect(d.target).toBe('installation_lead');
    expect(d.notify).toEqual(['Sale', 'Project_Manager']);
  });

  it('Property 17g: procurement เกินงบ → executive_owner (Req 8.3)', () => {
    expect(evaluateEscalation({ stage: 'procurement', overBudget: true }, CFG).target).toBe(
      'executive_owner',
    );
  });
});
