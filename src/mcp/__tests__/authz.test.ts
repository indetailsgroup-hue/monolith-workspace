// Feature: monolith-mcp-layer, Property 3: Per-tool authorization (C12 + site access)
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6 (รวม G1 fix — governance cross-site เฉพาะ Read_Tool)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateToolAuthorization, type AuthzInput } from '../authz';
import type { ToolClass } from '../domain/types';

const TOOL_CLASSES: ToolClass[] = ['Read_Tool', 'Write_Tool', 'Approval_Tool'];
const arbToolClass = fc.constantFrom(...TOOL_CLASSES);
const arbSite = fc.constantFrom('A1', 'A2', 'A3', 'B1', 'B2');

const arbInput: fc.Arbitrary<AuthzInput> = fc.record({
  toolClass: arbToolClass,
  principalRoles: fc.array(fc.constantFrom('designer', 'production', 'admin', 'sale'), { maxLength: 4 }),
  requiredRoles: fc.array(fc.constantFrom('designer', 'production', 'admin', 'sale'), { maxLength: 3 }),
  isGovernance: fc.boolean(),
  siteCode: fc.oneof(fc.constant(null), arbSite),
  accessibleSites: fc.array(arbSite, { maxLength: 5 }),
  activeSites: fc.array(arbSite, { maxLength: 5 }),
});

describe('mcp authz — Property 3', () => {
  it('insufficient role ⇒ reject ไม่ว่ากรณีใด (Req 3.1)', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const hasRole =
          input.requiredRoles.length === 0 ||
          input.requiredRoles.some((r) => input.principalRoles.includes(r));
        const res = evaluateToolAuthorization(input);
        if (!hasRole) expect(res).toEqual({ ok: false, reason: 'insufficient_role' });
      }),
      { numRuns: 200 },
    );
  });

  it('site ผูกแต่ ∉ activeSites ⇒ reject site_inactive (Req 3.6, governance ก็ไม่ข้าม)', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const hasRole =
          input.requiredRoles.length === 0 ||
          input.requiredRoles.some((r) => input.principalRoles.includes(r));
        const res = evaluateToolAuthorization(input);
        if (hasRole && input.siteCode !== null && !input.activeSites.includes(input.siteCode)) {
          expect(res).toEqual({ ok: false, reason: 'site_inactive' });
        }
      }),
      { numRuns: 300 },
    );
  });

  it('G1: governance ข้ามไซต์ได้เฉพาะ Read_Tool; Write/Approval ต้อง has_site_access (Req 3.2/3.3/3.4)', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const hasRole =
          input.requiredRoles.length === 0 ||
          input.requiredRoles.some((r) => input.principalRoles.includes(r));
        if (!hasRole || input.siteCode === null) return;
        if (!input.activeSites.includes(input.siteCode)) return; // site_inactive case แยกทดสอบแล้ว
        const res = evaluateToolAuthorization(input);
        const hasSiteAccess = input.accessibleSites.includes(input.siteCode);
        const governanceReadCrossSite = input.isGovernance && input.toolClass === 'Read_Tool';
        if (hasSiteAccess || governanceReadCrossSite) {
          expect(res).toEqual({ ok: true });
        } else {
          // governance + Write/Approval ที่ไม่มี site access → ต้องถูกปฏิเสธ (ไม่ใช่ผ่าน)
          expect(res).toEqual({ ok: false, reason: 'site_access_denied' });
        }
      }),
      { numRuns: 500 },
    );
  });

  it('Write/Approval ของ governance ที่ไม่มี site access ไม่เคย ok:true (regression G1)', () => {
    fc.assert(
      fc.property(
        arbInput.filter((i) => i.toolClass !== 'Read_Tool' && i.siteCode !== null && i.isGovernance),
        (input) => {
          const hasRole =
            input.requiredRoles.length === 0 ||
            input.requiredRoles.some((r) => input.principalRoles.includes(r));
          const active = input.activeSites.includes(input.siteCode as string);
          const access = input.accessibleSites.includes(input.siteCode as string);
          const res = evaluateToolAuthorization(input);
          if (hasRole && active && !access) {
            expect(res.ok).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
