// Feature: monolith-workflow-copilot — property test for capture orchestration (Req 7.7, 7.9 §1)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { orchestrateCapture } from '../capture-orchestrate';

describe('field-capture orchestration (§1, Req 7.7/7.9)', () => {
  // Feature: monolith-workflow-copilot, Property 40: capture rollback preserves failure-audit (best-effort)
  it('Property 40: business fail → ไม่มี captureId แต่ failure-audit ติด (เมื่อ log สำเร็จ)', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (businessSucceeds, logSucceeds) => {
        let captureWritten = false;
        let failureLogged = false;
        const res = orchestrateCapture({
          recordCapture: () => {
            if (!businessSucceeds) throw new Error('business failure');
            captureWritten = true;
            return 'cap-1';
          },
          logCaptureFailure: () => {
            if (!logSucceeds) throw new Error('edge died');
            failureLogged = true;
          },
        });

        if (businessSucceeds) {
          expect(res.ok).toBe(true);
          expect(captureWritten).toBe(true);
        } else {
          // business roll back: ไม่มี captureId
          expect(res.ok).toBe(false);
          if (!res.ok) {
            // failure-audit ติดก็ต่อเมื่อ log สำเร็จ (best-effort)
            expect(res.failureLogged).toBe(logSucceeds);
            expect(failureLogged).toBe(logSucceeds);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Property 40b: business fail + log สำเร็จ → failure-audit ติด', () => {
    let logged = false;
    const res = orchestrateCapture({
      recordCapture: () => {
        throw new Error('atomic rollback');
      },
      logCaptureFailure: () => {
        logged = true;
      },
    });
    expect(res).toEqual({ ok: false, error: 'atomic rollback', failureLogged: true });
    expect(logged).toBe(true);
  });
});
