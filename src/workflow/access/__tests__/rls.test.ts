// Feature: monolith-workflow-copilot — property tests for RLS predicate (Req 9.4, 10.1, 10.2)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canReadRow, hasSiteAccess } from '../rls';

describe('RLS read predicate (Req 10)', () => {
  // Feature: monolith-workflow-copilot, Property 21: การอ่านคืนเฉพาะแถวที่ผู้เรียกมีสิทธิ์ (RLS)
  it('Property 21: governance เห็นทุกแถว; มิฉะนั้นต้อง has_site_access', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.constantFrom('S1', 'S2', 'S3'), { nil: null }),
        fc.array(fc.constantFrom('S1', 'S2', 'S3'), { maxLength: 3 }),
        (isGovernance, rowSite, accessible) => {
          const res = canReadRow({ isGovernance, rowSiteCode: rowSite, accessibleSites: accessible });
          if (isGovernance) {
            expect(res).toBe(true);
          } else if (rowSite === null) {
            expect(res).toBe(false); // null site → false
          } else {
            expect(res).toBe(accessible.includes(rowSite));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('hasSiteAccess: null → false', () => {
    expect(hasSiteAccess(null, ['S1'])).toBe(false);
    expect(hasSiteAccess('S1', ['S1'])).toBe(true);
    expect(hasSiteAccess('S2', ['S1'])).toBe(false);
  });
});
