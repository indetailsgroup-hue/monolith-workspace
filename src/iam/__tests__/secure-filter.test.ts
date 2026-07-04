// Feature: monolith-accounting, Property AUTHZ-2: Secure Filter Enforcement (no bypass)
// Validates: Requirements 9.2
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  canInvoke,
  invoke,
  passesSecureFilter,
  isAuthorized,
  SecureFilterError,
  type ToolCall,
  type InvokeContext,
} from '../secure-filter';

const arbCall: fc.Arbitrary<ToolCall> = fc.record({
  toolName: fc.string({ maxLength: 8 }), // อาจว่าง (ทดสอบ filter)
  toolClass: fc.constantFrom('Read_Tool', 'Write_Tool', 'Approval_Tool', 'BAD_Class' as any),
  requiredRoles: fc.array(fc.constantFrom('designer', 'production', 'finance'), { maxLength: 3 }),
  paramsValid: fc.boolean(),
});
const arbCtx: fc.Arbitrary<InvokeContext> = fc.record({
  principalRoles: fc.array(fc.constantFrom('designer', 'production', 'finance', 'sale'), { maxLength: 4 }),
  isGovernance: fc.boolean(),
});

describe('MCP secure-filter — Property AUTHZ-2 (no bypass)', () => {
  it('exec ถูกเรียก ⟺ canInvoke (ผ่านทั้ง secure filter และ authz) (9.2)', () => {
    fc.assert(
      fc.property(arbCall, arbCtx, (call, ctx) => {
        let calls = 0;
        const exec = () => { calls++; return 'ok'; };
        const allowed = canInvoke(call, ctx);
        if (allowed) {
          expect(invoke(call, ctx, exec)).toBe('ok');
          expect(calls).toBe(1); // execute พอดี 1 ครั้ง
        } else {
          expect(() => invoke(call, ctx, exec)).toThrow(SecureFilterError);
          expect(calls).toBe(0); // ไม่มี bypass — exec ไม่ถูกเรียก
        }
      }),
      { numRuns: 500 },
    );
  });

  it('canInvoke ⟺ passesSecureFilter AND isAuthorized (สองชั้น)', () => {
    fc.assert(
      fc.property(arbCall, arbCtx, (call, ctx) => {
        expect(canInvoke(call, ctx)).toBe(passesSecureFilter(call) && isAuthorized(call, ctx));
      }),
      { numRuns: 500 },
    );
  });

  it('ผ่าน filter แต่ไม่มีสิทธิ์ → throw (ไม่ execute)', () => {
    let calls = 0;
    const call: ToolCall = { toolName: 'createInvoice', toolClass: 'Write_Tool', requiredRoles: ['finance'], paramsValid: true };
    const ctx: InvokeContext = { principalRoles: ['designer'], isGovernance: false };
    expect(() => invoke(call, ctx, () => { calls++; })).toThrow(SecureFilterError);
    expect(calls).toBe(0);
  });

  it('params ไม่ผ่าน validate → throw ก่อน authz (secure filter ก่อน)', () => {
    const call: ToolCall = { toolName: 'x', toolClass: 'Read_Tool', requiredRoles: [], paramsValid: false };
    expect(() => invoke(call, { principalRoles: [], isGovernance: true }, () => 1)).toThrow(SecureFilterError);
  });
});
