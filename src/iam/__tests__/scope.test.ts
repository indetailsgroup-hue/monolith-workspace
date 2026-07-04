// Feature: monolith-accounting, Property AUTHZ-1: User-Scoped Result (RLS)
// Validates: Requirements 13.1, 13.2, 13.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { enforceScope, isRowVisible, authorizeCrossDept, assertDeptAccess, type AuthContext, type ScopedRow } from '../scope';

const arbRow: fc.Arbitrary<ScopedRow> = fc.record({
  ownerUserId: fc.constantFrom('u1', 'u2', 'u3'),
  departmentId: fc.constantFrom('acc', 'prod', 'sale', 'design'),
});
const arbCtx: fc.Arbitrary<AuthContext> = fc.record({
  userId: fc.constantFrom('u1', 'u2', 'u3'),
  departments: fc.uniqueArray(fc.constantFrom('acc', 'prod', 'sale', 'design'), { maxLength: 4 }),
  isGovernance: fc.boolean(),
});

describe('IAM scope — Property AUTHZ-1 (RLS user-scoped)', () => {
  it('ผลลัพธ์ = ทั้งหมดและเฉพาะแถวที่มองเห็นได้ (soundness+completeness) + ⊆ input (13.1/13.5)', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 40 }), arbCtx, (rows, ctx) => {
        const scoped = enforceScope(rows, ctx);
        // soundness: ทุกแถวที่คืน มองเห็นได้
        for (const r of scoped) expect(isRowVisible(r, ctx)).toBe(true);
        // completeness: ทุกแถวที่มองเห็นได้ ถูกคืน
        expect(scoped.length).toBe(rows.filter((r) => isRowVisible(r, ctx)).length);
        // ⊆ input
        expect(scoped.length).toBeLessThanOrEqual(rows.length);
      }),
      { numRuns: 400 },
    );
  });

  it('non-governance: ไม่เห็นแถวแผนกอื่นที่ไม่ใช่เจ้าของ (13.2)', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 40 }), arbCtx, (rows, ctx) => {
        if (ctx.isGovernance) return;
        const scoped = enforceScope(rows, ctx);
        for (const r of scoped) {
          const ok = r.ownerUserId === ctx.userId || ctx.departments.includes(r.departmentId);
          expect(ok).toBe(true);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('governance เห็นทุกแถว', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 20 }), (rows) => {
        const scoped = enforceScope(rows, { userId: 'x', departments: [], isGovernance: true });
        expect(scoped.length).toBe(rows.length);
      }),
      { numRuns: 200 },
    );
  });

  it('cross-dept ไม่มีสิทธิ์ → ปฏิเสธเสมอ (fail-closed)', () => {
    const ctx: AuthContext = { userId: 'u1', departments: ['acc'], isGovernance: false };
    expect(authorizeCrossDept(ctx, 'prod')).toBe(false);
    expect(() => assertDeptAccess(ctx, 'prod')).toThrow();
    expect(authorizeCrossDept(ctx, 'acc')).toBe(true);
    expect(authorizeCrossDept({ ...ctx, isGovernance: true }, 'prod')).toBe(true);
  });
});
