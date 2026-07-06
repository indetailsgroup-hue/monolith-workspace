// Feature: monolith-workflow-copilot — property tests for revision discipline (Req 20, 21)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { classifyRevision, countsTowardThreshold } from '../classify';
import { evaluateBillable } from '../threshold';
import { acceptRequote, type RequoteState, type RequoteActor } from '../requote-fsm';
import { resolveCustomerApproverSet, isCustomerApprovalStep } from '../../resolver/customer-approver';
import type { ProcessStep } from '../../domain/types';

describe('revision classification (Req 21)', () => {
  // Feature: monolith-workflow-copilot, Property 37: CAR-3 — change แตะ field ที่ lock → scope_change
  it('Property 37: touches locked field → scope_change (เหนือกว่า reason อื่น)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('layout', 'misc', 'note'), { maxLength: 4 }),
        fc.boolean(),
        fc.boolean(),
        (changed, matches, clear) => {
          const reason = classifyRevision({
            changedFields: changed,
            lockedFields: ['layout'],
            matchesSignedSpec: matches,
            isClear: clear,
          });
          if (changed.includes('layout')) expect(reason).toBe('scope_change');
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 39: CAR-5 — daph_defect ไม่นับ threshold → QA_Metric
  it('Property 39: ≠ signed spec (ไม่แตะ lock) → daph_defect และไม่นับ threshold', () => {
    const reason = classifyRevision({
      changedFields: ['note'],
      lockedFields: ['layout'],
      matchesSignedSpec: false,
      isClear: true,
    });
    expect(reason).toBe('daph_defect');
    expect(countsTowardThreshold('daph_defect')).toBe(false);
    expect(countsTowardThreshold('customer_change')).toBe(true);
  });

  // Feature: monolith-workflow-copilot, Property 38: CAR-4 — revision เกิน 1/gate → escalate (soft)
  it('Property 38: customer_change ครั้งที่ >1/gate → billable + escalatePm (ไม่ hard-block)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (prior) => {
        const res = evaluateBillable('customer_change', prior);
        expect(res.billable).toBe(prior >= 1);
        expect(res.escalatePm).toBe(prior >= 1);
        // reason อื่นไม่นับ
        expect(evaluateBillable('daph_defect', prior).billable).toBe(false);
        expect(evaluateBillable('scope_change', prior).billable).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe('re-quote FSM (Req 21.6, 21.10, 21.17)', () => {
  // Feature: monolith-workflow-copilot, Property 41: re-quote ไม่ proceed ก่อน customer accept (§2)
  it('Property 41: proceed เฉพาะเมื่อ internal AND customer accept ครบทั้งคู่', () => {
    const arbActor = fc.constantFrom<RequoteActor>('internal', 'customer');
    fc.assert(
      fc.property(fc.array(arbActor, { maxLength: 6 }), (actors) => {
        let state: RequoteState = { internalAccepted: false, customerAccepted: false };
        let lastProceed = false;
        for (const a of actors) {
          const out = acceptRequote(state, a);
          state = out.state;
          lastProceed = out.proceed;
          // proceed ⟺ ทั้งสอง flag จริง
          expect(out.proceed).toBe(state.internalAccepted && state.customerAccepted);
        }
        expect(lastProceed).toBe(
          actors.includes('internal') && actors.includes('customer'),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('Property 41b: customer-only → awaiting_requote (ไม่ proceed)', () => {
    const out = acceptRequote({ internalAccepted: false, customerAccepted: false }, 'customer');
    expect(out.status).toBe('awaiting_requote');
    expect(out.proceed).toBe(false);
  });

  it('Property 41c: internal-only → awaiting_customer_acceptance', () => {
    const out = acceptRequote({ internalAccepted: false, customerAccepted: false }, 'internal');
    expect(out.status).toBe('awaiting_customer_acceptance');
    expect(out.proceed).toBe(false);
  });

  // ADR-037 (0087) — full revert: proceed + รู้ gate → revert กลับ step ของ gate
  it('ADR-037: ครบคู่ + รู้ gate → revertToStep = step ของ gate (inverse map)', () => {
    const first = acceptRequote(
      { internalAccepted: false, customerAccepted: false, gate: 'G2' },
      'internal',
    );
    expect(first.proceed).toBe(false);
    expect(first.revertToStep).toBeNull(); // ยังไม่ครบคู่ ห้าม revert
    expect(first.state.gate).toBe('G2'); // gate ต้องคงอยู่ระหว่างรอ

    const done = acceptRequote(first.state, 'customer');
    expect(done.proceed).toBe(true);
    expect(done.revertToStep).toBe('3D_Presentation'); // G2 → 3D_Presentation
  });

  it('ADR-037: ครบคู่แต่ไม่รู้ gate (legacy ก่อน 0087) → proceed โดยไม่ revert', () => {
    const out = acceptRequote({ internalAccepted: true, customerAccepted: false }, 'customer');
    expect(out.proceed).toBe(true);
    expect(out.revertToStep).toBeNull();
  });

  it('ADR-037: ทุก gate revert กลับ step ตัวเองถูกต้อง', () => {
    const expected = {
      G1: 'Designer',
      G2: '3D_Presentation',
      G3: '3D_Rendering_Final',
      G4: 'Production Planning',
    } as const;
    for (const gate of ['G1', 'G2', 'G3', 'G4'] as const) {
      const out = acceptRequote(
        { internalAccepted: true, customerAccepted: false, gate },
        'customer',
      );
      expect(out.revertToStep).toBe(expected[gate]);
    }
  });
});

describe('customer approver set (Req 20)', () => {
  const DESIGN_STEPS: ProcessStep[] = ['Designer', '3D_Presentation', '3D_Rendering_Final'];
  // Feature: monolith-workflow-copilot, Property 35: CAR-1 — Customer_Approver เป็น project-scoped
  it('Property 35: design step + customer → set รวม customer; ไม่มี customer → degrade single', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ProcessStep>(...DESIGN_STEPS, 'Sale', 'Factory'),
        fc.option(fc.string({ minLength: 1 }), { nil: null }),
        (step, customer) => {
          const res = resolveCustomerApproverSet(
            { step, internalLeadIds: ['lead'], primaryCustomerId: customer },
            'majority',
          );
          const expectCustomer = isCustomerApprovalStep(step) && customer !== null;
          expect(res.includesCustomer).toBe(expectCustomer);
          if (expectCustomer) {
            expect(res.approverIds).toContain(customer);
            expect(res.approverIds).toContain('lead');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 36: CAR-2 — design/3D ผ่านเมื่อ unanimous {lead + customer}
  it('Property 36: design step + customer → quorum unanimous', () => {
    for (const step of DESIGN_STEPS) {
      const res = resolveCustomerApproverSet(
        { step, internalLeadIds: ['lead'], primaryCustomerId: 'cust1' },
        'majority',
      );
      expect(res.quorum).toBe('unanimous');
      expect(res.approverIds.sort()).toEqual(['cust1', 'lead']);
    }
  });
});
