// D2 Autonomy_Tier classification and fail-safe gate
// Feature: line-oa-commerce (Module B5)
// Spec task: 11.1 Implement D2 Autonomy_Tier classification and fail-safe gate
//
// This module owns the *pure* autonomy-governance logic for every AI action on a
// LINE Conversation. It is deliberately dependency-free (no Deno/Node APIs, no DB
// access) so it can be:
//   * called by the outbound composition path `rpc_send_line_outbound` (task 11.4)
//     and any other AI-action surface, and
//   * exercised deterministically by the fast-check property tests (tasks 11.2 /
//     11.3 — Properties 24 & 25) with mocks, per the PBT harness conventions.
//
// It implements the D2 (AI Autonomy Ladder) governance contract for this module:
//   * Req 11.1 / 11.2 — classify an action's Autonomy_Tier BEFORE any approve or
//     withhold decision is made.
//   * Req 11.3 — a low-risk (autonomous) tier proceeds within the D2 guardrails.
//   * Req 11.4 — a gated tier is withheld until a human approves it.
//   * Req 11.5 — if the approval mechanism is unavailable for a gated action, the
//     action is BLOCKED as a fail-safe and never proceeds without approval.
//   * Req 11.7 — every governed action emits an audit record carrying its tier and
//     its approval outcome (persisted by the calling SECURITY DEFINER RPC).
//
// Ordering (Req 11.2) is enforced *structurally*: `evaluateAutonomyGate` only
// accepts a `TierClassification`, a value that can only be produced by
// `classifyAutonomyTier`. There is no way to reach a gate decision without having
// first classified the action.

/**
 * The D2 Autonomy Ladder tiers, in ascending order of risk.
 *
 * Autonomous tiers (`T0_NOTIFY`, `T1_TEMPLATE_SLOT_FILL`) may proceed without a
 * human in the loop, strictly within the D2 guardrails (Req 11.3). For outbound
 * messaging the only autonomous capability in this wave is template-bound
 * slot-filling (Req 11.6 / Requirement 5).
 *
 * Gated tiers (`T2_HUMAN_APPROVAL`, `T3_RESTRICTED`) require explicit human
 * approval before execution (Req 11.4) and fail safe — i.e. block — when the
 * approval mechanism is unavailable (Req 11.5).
 */
export enum AutonomyTier {
  /** Informational-only action with no external side effect. Autonomous. */
  T0_NOTIFY = "T0_NOTIFY",
  /** Template-bound slot-filling within guardrails (Req 11.6). Autonomous. */
  T1_TEMPLATE_SLOT_FILL = "T1_TEMPLATE_SLOT_FILL",
  /** Action that needs a human decision before it may proceed. Gated. */
  T2_HUMAN_APPROVAL = "T2_HUMAN_APPROVAL",
  /** High-risk action prohibited from autonomy in this wave (e.g. identity merge / R-03). Gated. */
  T3_RESTRICTED = "T3_RESTRICTED",
}

/** The kinds of AI action this module governs. */
export type AiActionKind =
  /** Fill the named slots of a Message_Template (the one autonomous outbound capability). */
  | "outbound_template_slot_fill"
  /** Free-text outbound generation (never autonomous in this wave; Req 5.4). */
  | "outbound_free_text"
  /** Structured-but-unbound outbound content (never autonomous; Req 5.4 / 5.7). */
  | "outbound_structured_unbound"
  /** Cross-channel identity merge (never autonomous; R-03 / Req 7). */
  | "identity_merge"
  /** Purely informational notification with no external effect. */
  | "notify";

/**
 * A contemplated AI action on a LINE Conversation, described well enough to be
 * classified into an {@link AutonomyTier}.
 */
export interface AiAction {
  /**
   * Stable identifier of the action, used as the audit `entity_ref` (Req 11.7,
   * 13.1). Typically the conversation id, outbound id, or merge-candidate id.
   */
  readonly actionId: string;
  /** What the AI is attempting. */
  readonly kind: AiActionKind;
  /** The Vertical_Context of the owning Conversation (carried into the audit record). */
  readonly verticalContext: string;
  /**
   * Whether the outbound content is bound to an *active* Message_Template. Only
   * meaningful for outbound kinds; a `outbound_template_slot_fill` that is not
   * actually template-bound is treated as gated, never autonomous (Req 5.4 /
   * 11.6).
   */
  readonly templateBound?: boolean;
}

/**
 * Result of classifying an {@link AiAction}. The presence of `classifiedAtStep`
 * (always `1`) is the ordering marker that proves classification ran before any
 * gate decision (Req 11.2). This type can only be produced by
 * {@link classifyAutonomyTier}, so a gate decision cannot be reached without it.
 */
export interface TierClassification {
  readonly action: AiAction;
  readonly tier: AutonomyTier;
  /** Ordering marker: classification is always step 1 (Req 11.2). */
  readonly classifiedAtStep: 1;
}

/** Whether a tier is permitted to proceed autonomously within the D2 guardrails. */
export function isAutonomousTier(tier: AutonomyTier): boolean {
  return tier === AutonomyTier.T0_NOTIFY || tier === AutonomyTier.T1_TEMPLATE_SLOT_FILL;
}

/** Whether a tier requires explicit human approval before it may proceed. */
export function requiresHumanApproval(tier: AutonomyTier): boolean {
  return !isAutonomousTier(tier);
}

/**
 * Classify an AI action into its D2 Autonomy_Tier (Req 11.1).
 *
 * This is the FIRST step of governance and must complete before any approve or
 * withhold decision (Req 11.2). The returned {@link TierClassification} is the
 * only key that unlocks {@link evaluateAutonomyGate}.
 *
 * Classification policy for this wave:
 *   * `notify`                       -> T0_NOTIFY (autonomous)
 *   * `outbound_template_slot_fill`  -> T1_TEMPLATE_SLOT_FILL when truly template
 *                                       bound, else T2_HUMAN_APPROVAL (Req 11.6)
 *   * `outbound_free_text`           -> T2_HUMAN_APPROVAL (Req 5.4)
 *   * `outbound_structured_unbound`  -> T2_HUMAN_APPROVAL (Req 5.4 / 5.7)
 *   * `identity_merge`               -> T3_RESTRICTED (R-03 / Req 7 — never auto)
 */
export function classifyAutonomyTier(action: AiAction): TierClassification {
  let tier: AutonomyTier;
  switch (action.kind) {
    case "notify":
      tier = AutonomyTier.T0_NOTIFY;
      break;
    case "outbound_template_slot_fill":
      // Autonomous ONLY when the content is genuinely bound to an active template
      // (Req 11.6). A claimed-but-unbound slot-fill is gated, not autonomous.
      tier = action.templateBound === true
        ? AutonomyTier.T1_TEMPLATE_SLOT_FILL
        : AutonomyTier.T2_HUMAN_APPROVAL;
      break;
    case "outbound_free_text":
    case "outbound_structured_unbound":
      tier = AutonomyTier.T2_HUMAN_APPROVAL;
      break;
    case "identity_merge":
      tier = AutonomyTier.T3_RESTRICTED;
      break;
    default: {
      // Exhaustiveness guard: an unrecognized kind fails closed to the most
      // restrictive gated tier rather than slipping through autonomously.
      const _exhaustive: never = action.kind;
      void _exhaustive;
      tier = AutonomyTier.T3_RESTRICTED;
      break;
    }
  }
  return { action, tier, classifiedAtStep: 1 };
}

/**
 * The state of the human-approval mechanism for a gated action.
 *
 * `mechanismAvailable` models whether the approval system is reachable and
 * operational. When it is `false` for a gated action, the gate fails safe and
 * blocks (Req 11.5) regardless of `approved`.
 */
export interface ApprovalContext {
  /** Whether the human-approval mechanism is reachable / operational. */
  readonly mechanismAvailable: boolean;
  /** Whether a human has explicitly approved this specific action. */
  readonly approved: boolean;
}

/** The decision produced by the autonomy gate. */
export enum GateDecision {
  /** The action may proceed (autonomous tier, or gated tier with human approval). */
  ALLOW = "ALLOW",
  /** Gated action withheld pending a human approval that has not yet been granted (Req 11.4). */
  WITHHELD = "WITHHELD",
  /** Gated action blocked because the approval mechanism is unavailable (fail-safe, Req 11.5). */
  BLOCKED = "BLOCKED",
}

/** The approval outcome recorded in the audit trail (Req 11.7). */
export enum ApprovalOutcome {
  /** No approval required — proceeded under the D2 autonomous guardrails. */
  AUTONOMOUS = "AUTONOMOUS",
  /** A human approved the gated action. */
  APPROVED = "APPROVED",
  /** Gated action pending human approval. */
  PENDING = "PENDING",
  /** Gated action blocked as a fail-safe (approval mechanism unavailable). */
  BLOCKED_FAILSAFE = "BLOCKED_FAILSAFE",
}

/** The evaluated outcome of the gate for a classified action. */
export interface GateEvaluation {
  readonly tier: AutonomyTier;
  readonly decision: GateDecision;
  readonly approvalOutcome: ApprovalOutcome;
  /** True when the action proceeds (autonomous or approved). */
  readonly mayProceed: boolean;
  /** True when the action was blocked specifically by the fail-safe (Req 11.5). */
  readonly failSafeTriggered: boolean;
  /** Ordering marker: the gate decision is always step 2, after classification (Req 11.2). */
  readonly decidedAtStep: 2;
}

/**
 * Evaluate the fail-safe autonomy gate for a *classified* action (Req 11.3–11.5).
 *
 * Requiring a {@link TierClassification} (rather than a raw {@link AiAction})
 * structurally guarantees that classification precedes the decision (Req 11.2).
 *
 * Decision rules:
 *   * Autonomous tier                       -> ALLOW (within guardrails; Req 11.3).
 *   * Gated tier, mechanism unavailable      -> BLOCKED (fail-safe; Req 11.5).
 *   * Gated tier, approved                    -> ALLOW (Req 11.4).
 *   * Gated tier, not approved (mechanism up) -> WITHHELD (Req 11.4).
 *
 * Note the fail-safe is checked *before* the `approved` flag, so a stale/forged
 * approval can never slip past an unavailable mechanism.
 */
export function evaluateAutonomyGate(
  classification: TierClassification,
  approval: ApprovalContext,
): GateEvaluation {
  const { tier } = classification;

  if (isAutonomousTier(tier)) {
    return {
      tier,
      decision: GateDecision.ALLOW,
      approvalOutcome: ApprovalOutcome.AUTONOMOUS,
      mayProceed: true,
      failSafeTriggered: false,
      decidedAtStep: 2,
    };
  }

  // Gated tier (Req 11.4 / 11.5).
  if (!approval.mechanismAvailable) {
    // Fail-safe: never proceed without a working approval mechanism (Req 11.5).
    return {
      tier,
      decision: GateDecision.BLOCKED,
      approvalOutcome: ApprovalOutcome.BLOCKED_FAILSAFE,
      mayProceed: false,
      failSafeTriggered: true,
      decidedAtStep: 2,
    };
  }

  if (approval.approved) {
    return {
      tier,
      decision: GateDecision.ALLOW,
      approvalOutcome: ApprovalOutcome.APPROVED,
      mayProceed: true,
      failSafeTriggered: false,
      decidedAtStep: 2,
    };
  }

  return {
    tier,
    decision: GateDecision.WITHHELD,
    approvalOutcome: ApprovalOutcome.PENDING,
    mayProceed: false,
    failSafeTriggered: false,
    decidedAtStep: 2,
  };
}

/**
 * Audit record emitted for every governed AI action (Req 11.7).
 *
 * This is the autonomy-specific payload. The calling SECURITY DEFINER RPC adds the
 * common audit columns — `performed_by` (via `public.resolve_actor()`),
 * `performed_at` (UTC), and `site_code` where known — and writes the row to
 * `line_oa_audit_log`. No secret values are ever present in this record.
 */
export interface AutonomyAuditRecord {
  /** Canonical audit event type for autonomy governance. */
  readonly eventType: "ai_action_autonomy_gate";
  /** Affected entity reference (the action id). */
  readonly entityRef: string;
  /** Vertical_Context of the owning Conversation. */
  readonly verticalContext: string;
  /** The kind of AI action that was governed. */
  readonly actionKind: AiActionKind;
  /** The classified Autonomy_Tier (Req 11.7). */
  readonly autonomyTier: AutonomyTier;
  /** The gate decision. */
  readonly decision: GateDecision;
  /** The approval outcome (Req 11.7). */
  readonly approvalOutcome: ApprovalOutcome;
  /** Whether the fail-safe block was triggered (Req 11.5). */
  readonly failSafeTriggered: boolean;
}

/** The complete result of governing an AI action: classification, gate, and audit. */
export interface AutonomyGovernanceResult {
  readonly classification: TierClassification;
  readonly evaluation: GateEvaluation;
  readonly audit: AutonomyAuditRecord;
  /** Convenience: whether the caller may execute the action. */
  readonly mayProceed: boolean;
}

/**
 * Build the audit record for a classified-and-evaluated AI action (Req 11.7).
 * Pure and secret-free by construction.
 */
export function buildAutonomyAuditRecord(
  classification: TierClassification,
  evaluation: GateEvaluation,
): AutonomyAuditRecord {
  return {
    eventType: "ai_action_autonomy_gate",
    entityRef: classification.action.actionId,
    verticalContext: classification.action.verticalContext,
    actionKind: classification.action.kind,
    autonomyTier: evaluation.tier,
    decision: evaluation.decision,
    approvalOutcome: evaluation.approvalOutcome,
    failSafeTriggered: evaluation.failSafeTriggered,
  };
}

/**
 * Govern an AI action end-to-end: classify it (Req 11.1/11.2), evaluate the
 * fail-safe gate (Req 11.3–11.5), and emit the audit record (Req 11.7).
 *
 * This is the single entry point the outbound composition path
 * (`rpc_send_line_outbound`, task 11.4) and other AI-action surfaces call. The
 * caller persists `result.audit` to `line_oa_audit_log` and proceeds only when
 * `result.mayProceed` is true.
 */
export function governAiAction(
  action: AiAction,
  approval: ApprovalContext,
): AutonomyGovernanceResult {
  // Step 1 — classify BEFORE any decision (Req 11.1, 11.2).
  const classification = classifyAutonomyTier(action);
  // Step 2 — fail-safe gate decision (Req 11.3, 11.4, 11.5).
  const evaluation = evaluateAutonomyGate(classification, approval);
  // Always audit the tier + outcome (Req 11.7).
  const audit = buildAutonomyAuditRecord(classification, evaluation);

  return {
    classification,
    evaluation,
    audit,
    mayProceed: evaluation.mayProceed,
  };
}
