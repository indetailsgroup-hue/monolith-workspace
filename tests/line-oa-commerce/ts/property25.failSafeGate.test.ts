/**
 * Property 25 — Fail-safe autonomy gate.
 * LINE OA Commerce (Module B5). Spec task: 11.3.
 *
 * Feature: line-oa-commerce, Property 25: Gated actions are withheld until
 * approval; if the approval mechanism is unavailable the action is blocked;
 * low-risk actions allowed within guardrails
 *
 * Validates: Requirements 11.3, 11.4, 11.5
 *
 * Over arbitrary AiActions (every kind, templateBound true/false) and every
 * ApprovalContext (mechanismAvailable / approved combinations) we assert the D2
 * fail-safe gate via `governAiAction`:
 *   * autonomous (low-risk) tier                         -> ALLOW   (Req 11.3)
 *   * gated tier, mechanism unavailable (any approved)   -> BLOCKED (Req 11.5)
 *   * gated tier, mechanism available, not approved      -> WITHHELD (Req 11.4)
 *   * gated tier, mechanism available, approved          -> ALLOW   (Req 11.4)
 * and that a gated action never proceeds (mayProceed === false) while WITHHELD
 * or BLOCKED. The expected tier is derived from an independent oracle so the
 * test does not merely mirror the implementation's control flow.
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  governAiAction,
  isAutonomousTier,
  AutonomyTier,
  GateDecision,
  ApprovalOutcome,
  type AiAction,
  type AiActionKind,
  type ApprovalContext,
} from "../../../supabase/functions/_shared/line-oa/autonomyGate";

/** Every governed action kind, so the iff is exercised on all branches. */
const kindArb: fc.Arbitrary<AiActionKind> = fc.constantFrom(
  "outbound_template_slot_fill",
  "outbound_free_text",
  "outbound_structured_unbound",
  "identity_merge",
  "notify",
);

const verticalArb = fc.constantFrom("monolith", "tcck", "vertical_a");

const actionArb: fc.Arbitrary<AiAction> = fc.record({
  actionId: fc.string({ minLength: 1, maxLength: 24 }),
  kind: kindArb,
  verticalContext: verticalArb,
  templateBound: fc.boolean(),
});

const approvalArb: fc.Arbitrary<ApprovalContext> = fc.record({
  mechanismAvailable: fc.boolean(),
  approved: fc.boolean(),
});

/**
 * Independent oracle for the D2 classification policy (mirrors the spec wording,
 * not the implementation's switch): the only autonomous outcomes are an
 * informational `notify` and a genuinely template-bound slot-fill.
 */
function expectedTier(action: AiAction): AutonomyTier {
  switch (action.kind) {
    case "notify":
      return AutonomyTier.T0_NOTIFY;
    case "outbound_template_slot_fill":
      return action.templateBound === true
        ? AutonomyTier.T1_TEMPLATE_SLOT_FILL
        : AutonomyTier.T2_HUMAN_APPROVAL;
    case "outbound_free_text":
    case "outbound_structured_unbound":
      return AutonomyTier.T2_HUMAN_APPROVAL;
    case "identity_merge":
      return AutonomyTier.T3_RESTRICTED;
  }
}

describeProperty(
  25,
  "Gated actions are withheld until approval; if the approval mechanism is unavailable the action is blocked; low-risk actions allowed within guardrails",
  () => {
    it("allows autonomous tiers, withholds/blocks gated tiers per fail-safe rules", () => {
      fc.assert(
        fc.property(actionArb, approvalArb, (action, approval) => {
          const result = governAiAction(action, approval);
          const tier = expectedTier(action);

          // Classification ran and matches the independent oracle (Req 11.1/11.2).
          expect(result.classification.tier).toBe(tier);
          expect(result.evaluation.tier).toBe(tier);

          if (isAutonomousTier(tier)) {
            // Low-risk action allowed within guardrails (Req 11.3).
            expect(result.evaluation.decision).toBe(GateDecision.ALLOW);
            expect(result.evaluation.approvalOutcome).toBe(
              ApprovalOutcome.AUTONOMOUS,
            );
            expect(result.mayProceed).toBe(true);
            expect(result.evaluation.failSafeTriggered).toBe(false);
            return;
          }

          // Gated tier (T2/T3).
          if (!approval.mechanismAvailable) {
            // Fail-safe: blocked regardless of the approved flag (Req 11.5).
            expect(result.evaluation.decision).toBe(GateDecision.BLOCKED);
            expect(result.evaluation.approvalOutcome).toBe(
              ApprovalOutcome.BLOCKED_FAILSAFE,
            );
            expect(result.evaluation.failSafeTriggered).toBe(true);
            // A gated action never proceeds when blocked.
            expect(result.mayProceed).toBe(false);
          } else if (approval.approved) {
            // Human approved the gated action (Req 11.4).
            expect(result.evaluation.decision).toBe(GateDecision.ALLOW);
            expect(result.evaluation.approvalOutcome).toBe(
              ApprovalOutcome.APPROVED,
            );
            expect(result.mayProceed).toBe(true);
            expect(result.evaluation.failSafeTriggered).toBe(false);
          } else {
            // Mechanism up but not yet approved -> withheld (Req 11.4).
            expect(result.evaluation.decision).toBe(GateDecision.WITHHELD);
            expect(result.evaluation.approvalOutcome).toBe(
              ApprovalOutcome.PENDING,
            );
            expect(result.evaluation.failSafeTriggered).toBe(false);
            // A gated action never proceeds when withheld.
            expect(result.mayProceed).toBe(false);
          }
        }),
        fcParams(),
      );
    });
  },
);
