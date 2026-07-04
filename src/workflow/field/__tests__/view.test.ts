// Feature: monolith-workflow-copilot — property tests for Field_View (Req 7)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildFieldView, NO_STANDARD_DOC_MESSAGE } from '../view';

describe('Field_View (Req 7)', () => {
  // Feature: monolith-workflow-copilot, Property 15: Obsidian_Deep_Link แสดงเมื่อมีความรู้เท่านั้น
  it('Property 15: มี deepLink → link แสดง; ไม่มี → null + ข้อความ', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (link) => {
        const view = buildFieldView({ step: 'Designer', checklist: ['a'], deepLink: link });
        const hasKnowledge = typeof link === 'string' && link.length > 0;
        if (hasKnowledge) {
          expect(view.link).toBe(link);
          expect(view.emptyMessage).toBeNull();
        } else {
          expect(view.link).toBeNull();
          expect(view.emptyMessage).toBe(NO_STANDARD_DOC_MESSAGE);
        }
      }),
      { numRuns: 200 },
    );
  });
});
