/**
 * Property 13 — Template-bound classification + named-slot substitution.
 * LINE OA Commerce (Module B5). Spec task: 5.7.
 *
 * Feature: line-oa-commerce, Property 13: Classification returns exactly
 * {template-bound, free-text}; unbound content is rejected; accepted outbound
 * equals the active template body with only named slots substituted
 *
 * Validates: Requirements 5.3, 5.4, 5.5, 5.7, 11.6
 *
 * Over randomly generated template sets (active/inactive × shared/scoped) and
 * outbound content requests (template-reference / free_text / structured), we
 * assert:
 *   (a) `classifyOutbound` always returns a value in exactly {template-bound,
 *       free-text} — no third category ever appears (Req 5.7 / 11.6).
 *   (b) Unbound content — free_text, structured, or a template reference that is
 *       absent/inactive (so not bound to an ACTIVE template) — is classified
 *       free-text and rejected by `composeOutbound`; it is never accepted/sent
 *       (Req 5.4 / 5.5 / 5.7).
 *   (c) Any accepted `composeOutbound` result has its body equal to the resolved
 *       active template body with ONLY its named slots substituted — verified
 *       against an independent oracle that reconstructs the body and proves no
 *       extra free/structured content can appear; `slotValues` records exactly
 *       the substituted slots (Req 5.3 / 5.6).
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  classifyOutbound,
  composeOutbound,
  resolveTemplate,
  extractSlotNames,
  type MessageTemplate,
  type OutboundContentRequest,
} from "../../../supabase/functions/_shared/line-oa/templates";

/** Pool of verticals so scope/conversation equality collides frequently. */
const verticalArb = fc.constantFrom("monolith", "tcck", "vertical_a", "vertical_b");

/** Slot-name pool used both in template bodies and in supplied slot maps. */
const slotNameArb = fc.constantFrom("order_id", "name", "amount", "eta", "branch");

/** Small pool of template keys so references hit and miss the template set. */
const templateKeyArb = fc.constantFrom("order_ready", "greeting", "receipt", "missing_key");

/**
 * A template body composed of literal fragments and `{{slot}}` placeholders.
 * Built from structured parts (not free text containing braces) so the declared
 * slot set is well-defined and the literal text never accidentally forms a
 * placeholder.
 */
const bodyArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      // Literal fragment: letters/spaces/digits only, no brace characters.
      fc
        .stringMatching(/^[A-Za-z0-9 .,!?]*$/)
        .map((s) => ({ kind: "lit" as const, value: s })),
      slotNameArb.map((name) => ({ kind: "slot" as const, value: name })),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((parts) =>
    parts
      .map((p) => (p.kind === "slot" ? `{{${p.value}}}` : p.value))
      .join(""),
  );

const templateArb: fc.Arbitrary<MessageTemplate> = fc.record({
  templateKey: templateKeyArb,
  verticalContext: fc.option(verticalArb, { nil: null, freq: 3 }),
  body: bodyArb,
  isActive: fc.boolean(),
});

/** A set of templates; duplicates of (key, scope) may occur — mirrors real data. */
const templatesArb: fc.Arbitrary<MessageTemplate[]> = fc.array(templateArb, {
  minLength: 0,
  maxLength: 6,
});

/** A map of slot values; values are arbitrary strings (incl. ones with braces). */
const slotsArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  slotNameArb,
  fc.string({ maxLength: 12 }),
  { maxKeys: 5 },
);

/** A content request: template reference, free text, or structured payload. */
const requestArb: fc.Arbitrary<OutboundContentRequest> = fc.oneof(
  fc.record({
    kind: fc.constant("template" as const),
    templateKey: templateKeyArb,
    slots: slotsArb,
  }),
  fc.record({
    kind: fc.constant("free_text" as const),
    text: fc.string({ maxLength: 40 }),
  }),
  fc.record({
    kind: fc.constant("structured" as const),
    payload: fc.anything(),
  }),
);

/**
 * Independent oracle for "body equals the active template body with ONLY its
 * named slots substituted". Rebuilds the expected body by replacing each
 * `{{slot}}` declared in the resolved body with its supplied value and asserts
 * no `{{...}}` placeholder remains. Crucially, the result is derived purely from
 * the template body + slot map, so any extra free/structured content in the
 * actual result would break equality.
 */
function expectedSubstitution(
  body: string,
  slots: Readonly<Record<string, string>>,
): { body: string; used: Record<string, string> } {
  const used: Record<string, string> = {};
  const out = body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, name: string) => {
    if (Object.prototype.hasOwnProperty.call(slots, name)) {
      used[name] = slots[name];
      return slots[name];
    }
    return m;
  });
  return { body: out, used };
}

describeProperty(
  13,
  "Classification returns exactly {template-bound, free-text}; unbound content is rejected; accepted outbound equals the active template body with only named slots substituted",
  () => {
    it("classifies into exactly two categories, rejects unbound content, and substitutes only named slots", () => {
      fc.assert(
        fc.property(
          templatesArb,
          requestArb,
          verticalArb,
          (templates, request, vertical) => {
            // (a) Classification is always one of exactly {template-bound, free-text}.
            const classification = classifyOutbound(request, templates, vertical);
            expect(["template-bound", "free-text"]).toContain(classification);

            const result = composeOutbound(request, templates, vertical);

            // Resolve once to reason about the expected outcome.
            const resolution =
              request.kind === "template"
                ? resolveTemplate(templates, request.templateKey, vertical)
                : ({ ok: false, reason: "absent" } as const);

            const boundToActive = request.kind === "template" && resolution.ok;

            // Classification agrees with bound-to-active-template status.
            expect(classification).toBe(boundToActive ? "template-bound" : "free-text");

            // (b) Unbound content (free_text/structured/absent/inactive) is rejected
            //     and never accepted/sent.
            if (!boundToActive) {
              expect(result.status).toBe("rejected");
              return;
            }

            // From here, request is a template reference bound to an ACTIVE template.
            const template = resolution.template;
            const declaredSlots = extractSlotNames(template.body);
            const slots = (request as Extract<OutboundContentRequest, { kind: "template" }>).slots;
            const allDeclaredProvided = declaredSlots.every((s) =>
              Object.prototype.hasOwnProperty.call(slots, s),
            );

            if (!allDeclaredProvided) {
              // A declared slot lacks a value ⇒ rejected (never send an unfilled body).
              expect(result.status).toBe("rejected");
              expect(result.status === "rejected" && result.reason).toBe("missing_slot");
              return;
            }

            // (c) Accepted: body equals the active template body with ONLY its
            //     named slots substituted, and slotValues records exactly those.
            const oracle = expectedSubstitution(template.body, slots);
            expect(result.status).toBe("accepted");
            if (result.status !== "accepted") return;

            expect(result.classification).toBe("template-bound");
            expect(result.body).toBe(oracle.body);
            // No unsubstituted placeholder leaks through.
            expect(result.body).not.toMatch(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/);
            // slotValues is exactly the set of declared slots that were substituted.
            expect(result.slotValues).toEqual(oracle.used);
            expect(Object.keys(result.slotValues).sort()).toEqual(
              declaredSlots.slice().sort(),
            );
          },
        ),
        fcParams(),
      );
    });
  },
);
