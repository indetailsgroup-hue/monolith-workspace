/**
 * Property 12 — Vertical-scoped templates are isolated.
 * LINE OA Commerce (Module B5). Spec task: 5.6.
 *
 * Feature: line-oa-commerce, Property 12: A vertical-V template is resolvable for
 * a conversation iff its vertical_context equals V (NULL scope resolvable for all)
 *
 * Validates: Requirements 5.2
 *
 * A Message_Template scoped to vertical V is resolvable for a conversation iff
 * the conversation's vertical_context equals V; a template with NULL scope
 * (shared) is resolvable for every vertical. We assert this iff directly against
 * an independent oracle (`scope === null || scope === conversationVertical`) over
 * randomly generated template scopes and conversation verticals, and corroborate
 * it through `resolveTemplate`: a vertical-mismatched scoped template is the only
 * candidate for its key and therefore resolves to `absent`, whereas a shared or
 * vertical-matching template resolves successfully.
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  isTemplateResolvable,
  resolveTemplate,
  type MessageTemplate,
} from "../../../supabase/functions/_shared/line-oa/templates";

/**
 * Small pool of vertical names so equality collisions between a template's scope
 * and a conversation's vertical occur frequently, while still covering the
 * "different vertical" case. Mixing a fixed pool keeps the iff meaningfully
 * exercised on both branches.
 */
const verticalArb = fc.constantFrom(
  "monolith",
  "tcck",
  "vertical_a",
  "vertical_b",
);

/** A template scope: NULL (shared) or one of the pooled verticals. */
const scopeArb: fc.Arbitrary<string | null> = fc.option(verticalArb, {
  nil: null,
  freq: 3, // ~1 in 3 are shared (NULL) so both iff branches are well covered
});

describeProperty(
  12,
  "A vertical-V template is resolvable for a conversation iff its vertical_context equals V (NULL scope resolvable for all)",
  () => {
    it("is resolvable iff scope is NULL or equals the conversation vertical", () => {
      fc.assert(
        fc.property(
          scopeArb,
          verticalArb,
          fc.boolean(),
          (scope, conversationVertical, isActive) => {
            const template: MessageTemplate = {
              templateKey: "order_ready",
              verticalContext: scope,
              body: "Your order {{order_id}} is ready.",
              isActive,
            };

            // Independent oracle for the iff (Property 12 / Req 5.2).
            const expectedResolvable =
              scope === null || scope === conversationVertical;

            // 1) The pure predicate matches the oracle exactly (iff).
            expect(isTemplateResolvable(template, conversationVertical)).toBe(
              expectedResolvable,
            );

            // 2) Corroborate through resolveTemplate: with this template as the
            //    sole candidate for its key, resolution can only succeed when the
            //    template is resolvable for the vertical. A non-resolvable scope
            //    yields `absent`; a resolvable-but-inactive one yields `inactive`;
            //    a resolvable-and-active one succeeds.
            const resolution = resolveTemplate(
              [template],
              "order_ready",
              conversationVertical,
            );
            if (!expectedResolvable) {
              expect(resolution.ok).toBe(false);
              expect(resolution.ok === false && resolution.reason).toBe("absent");
            } else if (isActive) {
              expect(resolution.ok).toBe(true);
            } else {
              expect(resolution.ok).toBe(false);
              expect(resolution.ok === false && resolution.reason).toBe(
                "inactive",
              );
            }
          },
        ),
        fcParams(),
      );
    });
  },
);
