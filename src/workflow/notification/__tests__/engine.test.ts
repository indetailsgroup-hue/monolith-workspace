// Feature: monolith-workflow-copilot — property tests for notification engine (Req 1.4, 6, 12.3)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { routeNotification, type NotificationIntent } from '../routing';
import { evaluateSuppression } from '../suppression';
import { composeMessage, MAX_MESSAGE_LENGTH } from '../template';
import { resolveMissingBinding } from '../missing-binding';
import { shouldCelebrate, type CompletionKind } from '../celebrate';
import type { NotificationChannel } from '../../domain/types';

const arbChannel = fc.constantFrom<NotificationChannel>('direct_push', 'group_message');

describe('notification routing (Req 6.1, 6.2)', () => {
  // Feature: monolith-workflow-copilot, Property 12: การจัดเส้นทางการแจ้งเตือน direct vs group
  it('Property 12: personal → direct_push; cross-team/FYI → group_message', () => {
    const cases: [NotificationIntent, NotificationChannel][] = [
      ['personal_responsibility', 'direct_push'],
      ['personal_approval', 'direct_push'],
      ['cross_team_handoff', 'group_message'],
      ['fyi', 'group_message'],
    ];
    for (const [intent, expected] of cases) {
      expect(routeNotification(intent)).toBe(expected);
    }
  });
});

describe('notification suppression matrix (Req 6.3, 6.5, 6.6, 6.9)', () => {
  // Feature: monolith-workflow-copilot, Property 13: เมทริกซ์การระงับการแจ้งเตือน (mute เหนือกว่า, Direct ข้ามเวลาเท่านั้น)
  it('Property 13: mute ชนะทุกกรณี; Direct ข้าม quiet; non-Direct ใน quiet → digest', () => {
    fc.assert(
      fc.property(arbChannel, fc.boolean(), fc.boolean(), (channel, muted, inQuietHours) => {
        const res = evaluateSuppression({ channel, muted, inQuietHours });
        if (muted) {
          expect(res).toBe('suppress'); // mute เหนือสุด รวม Direct
        } else if (channel === 'direct_push') {
          expect(res).toBe('deliver'); // Direct ข้าม quiet
        } else {
          expect(res).toBe(inQuietHours ? 'suppress_digest' : 'deliver');
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('notification template binding (Req 6.7, 6.8, 6.10, 12.x)', () => {
  const allowed = new Set(['tpl_approval', 'tpl_handoff']);
  // Feature: monolith-workflow-copilot, Property 14: เนื้อหาผูกเทมเพลต ความยาว ≤ 200 และ queue ไม่ truncate
  it('Property 14: free-text ปฏิเสธ; Direct เกิน 200 → queue; non-Direct เกิน 200 → reject', () => {
    fc.assert(
      fc.property(
        arbChannel,
        fc.string({ minLength: 0, maxLength: 400 }),
        fc.boolean(),
        (channel, text, useAllowed) => {
          const templateId = useAllowed ? 'tpl_approval' : 'tpl_unknown';
          const res = composeMessage(channel, templateId, allowed, text);
          if (!useAllowed) {
            expect(res).toEqual({ ok: false, error: 'free_text_not_allowed' });
            return;
          }
          if (text.length > MAX_MESSAGE_LENGTH) {
            if (channel === 'direct_push') {
              expect(res).toEqual({ ok: true, text, queued: true }); // ไม่ truncate
            } else {
              expect(res).toEqual({ ok: false, error: 'segment_too_long' });
            }
          } else {
            expect(res).toEqual({ ok: true, text, queued: false });
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('missing binding escalation (Req 1.4)', () => {
  // Feature: monolith-workflow-copilot, Property 2: ไม่มี binding active → ยกระดับทันทีพร้อม audit สองรายการ
  it('Property 2: ไม่มี binding → escalate + audit คู่ (failure + escalation), ไม่ block', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.option(fc.string({ minLength: 1 }), { nil: null }), (has, head) => {
        const res = resolveMissingBinding({ hasActiveBinding: has, deptHeadWithBinding: head });
        if (has) {
          expect(res.action).toBe('deliver_direct');
        } else {
          expect(res.action === 'escalate' || res.action === 'escalate_unresolved').toBe(true);
          if (res.action !== 'deliver_direct') {
            expect(res.audits).toEqual(['binding_missing_failure', 'binding_missing_escalation']);
          }
          if (head) {
            expect(res.action).toBe('escalate');
            if (res.action === 'escalate') expect(res.escalateTo).toBe(head);
          } else {
            expect(res.action).toBe('escalate_unresolved');
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('celebrate completion (Req 12.3, 12.7)', () => {
  const arbKind = fc.constantFrom<CompletionKind>('finished_last_step', 'manual_close', 'cancelled');
  // Feature: monolith-workflow-copilot, Property 25: การแสดงความยินดีเมื่อจบขั้นสุดท้ายเท่านั้น
  it('Property 25: celebrate เฉพาะ reachedLastStep + finished_last_step; error อื่นไม่กระทบ', () => {
    fc.assert(
      fc.property(fc.boolean(), arbKind, fc.boolean(), (reached, kind, err) => {
        const res = shouldCelebrate({
          reachedLastStep: reached,
          completionKind: kind,
          otherOperationError: err,
        });
        expect(res).toBe(reached && kind === 'finished_last_step');
      }),
      { numRuns: 200 },
    );
  });
});
