/**
 * Property test — LINE OA Commerce (Module B5)
 * Spec task: 11.2 Write property test for tier-classification ordering
 *
 * Property 24: Autonomy_Tier classification completes before any
 * approval/withholding decision.
 *
 * **Validates: Requirements 11.1, 11.2**
 *
 * Exercises the pure D2 autonomy-governance seam (design.md task 11.1) that
 * `rpc_send_line_outbound` and every other AI-action surface route through:
 * `classifyAutonomyTier` (Req 11.1) must run BEFORE any approve/withhold gate
 * decision (Req 11.2). Ordering is proven two ways here:
 *
 *   1. Structurally — `evaluateAutonomyGate` only accepts a `TierClassification`,
 *      a value that can ONLY be produced by `classifyAutonomyTier`. There is no
 *      way to reach a `GateEvaluation` without first classifying the action.
 *   2. By the explicit step markers — the classification always carries
 *      `classifiedAtStep === 1` and the evaluation always carries
 *      `decidedAtStep === 2`, so classification (1) strictly precedes the
 *      decision (2). The evaluation's `tier` is exactly the classified tier,
 *      and `governAiAction` wires the two steps together in order.
 *
 * Generates arbitrary AiActions across every action kind (with templateBound
 * true / false / absent) and arbitrary ApprovalContexts so the ordering holds
 * regardless of tier, decision, or fail-safe outcome.
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  type AiAction,
  type AiActionKind,
  classifyAutonomyTier,
  evaluateAutonomyGate,
  governAiAction,
} from "../../../supabase/functions/_shared/line-oa/autonomyGate";

// Every governed action kind (Req 11.1 must classify *any* contemplated action).
const ACTION_KINDS: readonly AiActionKind[] = [
  "outbound_template_slot_fill",
  "outbound_free_text",
  "outbound_structured_unbound",
  "identity_merge",
  "notify",
] as const;

const kindArb = fc.constantFrom(...ACTION_KINDS);
const verticalArb = fc.constantFrom("furniture", "food");

// templateBound is only meaningful for slot-fill, but we let it be true/false/
// absent for every kind to prove ordering is independent of it.
const templateBoundArb = fc.option(fc.boolean(), { nil: undefined });

const actionArb: fc.Arbitrary<AiAction> = fc.record({
  actionId: fc.string({ minLength: 1, maxLength: 24 }),
  kind: kindArb,
  verticalContext: verticalArb,
  templateBound: templateBoundArb,
});

const approvalArb = fc.record({
  mechanismAvailable: fc.boolean(),
  approved: fc.boolean(),
});

describeProperty(
  24,
  "Autonomy_Tier classification completes before any approval/withholding decision",
  () => {
    it("classifies (step 1) before deciding (step 2); the gate's tier equals the classified tier and no decision is reachable without a classification", () => {
      fc.assert(
        fc.property(actionArb, approvalArb, (action, approval) => {
          // --- Step 1: classification (Req 11.1) -----------------------------
          // The ONLY producer of a TierClassification. Its presence is the gate
          // key — there is no other way to obtain one.
          const classification = classifyAutonomyTier(action);

          // Classification is marked as step 1 (Req 11.2 ordering marker).
          expect(classification.classifiedAtStep).toBe(1);
          // It classified the exact action we passed.
          expect(classification.action).toBe(action);

          // --- Step 2: gate decision (Req 11.2) ------------------------------
          // `evaluateAutonomyGate` structurally REQUIRES the classification, so
          // a decision cannot be produced without classification having run.
          const evaluation = evaluateAutonomyGate(classification, approval);

          // The decision is marked as step 2, strictly after classification (1).
          expect(evaluation.decidedAtStep).toBe(2);
          expect(classification.classifiedAtStep).toBeLessThan(
            evaluation.decidedAtStep,
          );

          // The decision is made on the already-classified tier — never a tier
          // computed during or after the decision.
          expect(evaluation.tier).toBe(classification.tier);

          // Classification is deterministic / decision-independent: re-running it
          // yields the same tier regardless of the approval context. This proves
          // the tier is fixed before any approval/withholding logic is consulted.
          expect(classifyAutonomyTier(action).tier).toBe(classification.tier);

          // --- End-to-end ordering via the single entry point ----------------
          // `governAiAction` wires step 1 -> step 2 -> audit in order; the result
          // carries the same step markers and the same (single) classified tier.
          const governed = governAiAction(action, approval);
          expect(governed.classification.classifiedAtStep).toBe(1);
          expect(governed.evaluation.decidedAtStep).toBe(2);
          expect(governed.classification.classifiedAtStep).toBeLessThan(
            governed.evaluation.decidedAtStep,
          );
          // The tier classified in step 1 is the tier the gate decided on and the
          // tier recorded in the audit payload — one consistent classification.
          expect(governed.evaluation.tier).toBe(governed.classification.tier);
          expect(governed.audit.autonomyTier).toBe(governed.classification.tier);
        }),
        fcParams(),
      );
    });
  },
);
