// Pure-logic helper: message-template resolution, classification, and slot
// substitution — LINE OA Commerce (Module B5).
//
// Spec task: 5.5 Implement template vertical-scope resolution and template-bound
//            classification.
// Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 11.6.
// Correctness Properties exercised by later tasks: 12 (vertical isolation) and
//            13 (template-bound classification + named-slot substitution).
//
// This module is intentionally PURE: no database access, no HTTP, no secrets, no
// I/O of any kind. It is the deterministic core consumed by the
// `rpc_send_line_outbound` write path (task 11.4) and by the `fast-check`
// property harness (tasks 5.6/5.7). Keeping it free of runtime dependencies lets
// it run identically under the Deno Edge runtime and under Node/Vitest.
//
// Design model:
//   * A Message_Template is keyed by (template_key, vertical_context). A NULL
//     vertical_context is a *shared* template, resolvable for every vertical; a
//     non-NULL vertical_context is vertical-scoped and resolvable only for the
//     matching vertical (Req 5.2 / Property 12).
//   * Outbound content is classified into exactly two mutually exclusive
//     categories — `template-bound` and `free-text` — where `template-bound`
//     means "bound to an ACTIVE template that resolves for the conversation's
//     vertical". Everything else (free text, structured-but-unbound payloads,
//     references to absent or inactive templates) is `free-text` and rejected
//     (Req 5.4 / 5.7 / 11.6 / Property 13).
//   * An accepted outbound equals the resolved active template body with ONLY
//     its named slots substituted; no free or structured content is ever
//     appended (Req 5.3 / Property 13).

/** A business-vertical/tenant context, e.g. `"monolith"` or `"tcck"`. */
export type VerticalContext = string;

/**
 * A pre-approved outbound message definition (Req 5.1).
 *
 * `verticalContext === null` denotes a shared template available to every
 * vertical; a non-null value scopes the template to a single vertical (Req 5.2).
 * The template body carries named slots in `{{slot_name}}` form, e.g.
 * `"Your order {{order_id}} is ready."`.
 */
export interface MessageTemplate {
  readonly templateKey: string;
  readonly verticalContext: VerticalContext | null;
  readonly body: string;
  readonly isActive: boolean;
  /**
   * ชนิดข้อความ (0098 — 1.8c): 'text' (default) = body คือข้อความตรง ๆ;
   * 'flex' = body คือ JSON {"altText": "...", "contents": {bubble}} (หลัง substitute slots)
   */
  readonly messageKind?: "text" | "flex";
}

/**
 * An intended piece of outbound content presented for classification/compose.
 *
 * Only the `template` shape can ever be accepted; `free_text` and `structured`
 * model the two ways unbound content can arrive (Req 5.4: "regardless of whether
 * the content is free text or structured-but-unbound content").
 */
export type OutboundContentRequest =
  | {
      readonly kind: "template";
      readonly templateKey: string;
      readonly slots: Readonly<Record<string, string>>;
    }
  | { readonly kind: "free_text"; readonly text: string }
  | { readonly kind: "structured"; readonly payload: unknown };

/** The two mutually exclusive outbound categories (Req 5.7 / Property 13). */
export type OutboundClassification = "template-bound" | "free-text";

/** Why a template could not be resolved to a sendable definition. */
export type TemplateResolutionFailure = "absent" | "inactive";

/** Result of resolving a `(template_key, vertical_context)` pair (Req 5.5). */
export type TemplateResolution =
  | { readonly ok: true; readonly template: MessageTemplate }
  | { readonly ok: false; readonly reason: TemplateResolutionFailure };

/** Why a compose attempt was rejected (Req 5.4, 5.5, 5.7). */
export type ComposeRejectionReason =
  | "template_absent"
  | "template_inactive"
  | "unbound_content"
  | "missing_slot";

/**
 * Outcome of composing an outbound message.
 *
 * On success the message is `template-bound` and `body` is the resolved active
 * template body with its named slots substituted; `slotValues` is the subset of
 * slots actually used (recorded for audit per Req 5.6). On failure the content
 * is rejected and never sent (Req 5.4 / 5.5).
 */
export type ComposeOutboundResult =
  | {
      readonly status: "accepted";
      readonly classification: "template-bound";
      readonly templateKey: string;
      readonly verticalContext: VerticalContext;
      readonly body: string;
      readonly slotValues: Readonly<Record<string, string>>;
    }
  | {
      readonly status: "rejected";
      readonly classification: OutboundClassification;
      readonly reason: ComposeRejectionReason;
    };

/**
 * Matches a single named slot placeholder, e.g. `{{order_id}}` or `{{ name }}`.
 * Slot names are `[A-Za-z0-9_]+`. Surrounding whitespace inside the braces is
 * tolerated and ignored.
 */
const SLOT_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Is `template` resolvable for a conversation in `verticalContext`?
 *
 * True iff the template is shared (NULL scope) or its scope equals the
 * conversation's vertical. This is the exact predicate of Property 12; it does
 * NOT consider `isActive` (active/inactive is an orthogonal concern handled by
 * {@link resolveTemplate}).
 */
export function isTemplateResolvable(
  template: MessageTemplate,
  verticalContext: VerticalContext,
): boolean {
  return (
    template.verticalContext === null ||
    template.verticalContext === verticalContext
  );
}

/**
 * Resolve a template by `(templateKey, verticalContext)` over a candidate set
 * (Req 5.2, 5.5).
 *
 * Resolution rules:
 *   1. Consider only templates with a matching `templateKey` that are resolvable
 *      for `verticalContext` (shared or vertical-matching).
 *   2. A vertical-scoped template takes precedence over a shared one for the
 *      same key (the more specific definition overrides the shared default).
 *   3. If no candidate matches → `absent`. If the chosen candidate is inactive →
 *      `inactive`. Otherwise → ok.
 *
 * No fallback from an inactive specific template to a shared active one: a
 * reference that resolves to an inactive template is rejected as `inactive`
 * (Req 5.5).
 */
export function resolveTemplate(
  templates: readonly MessageTemplate[],
  templateKey: string,
  verticalContext: VerticalContext,
): TemplateResolution {
  const candidates = templates.filter(
    (t) => t.templateKey === templateKey && isTemplateResolvable(t, verticalContext),
  );

  if (candidates.length === 0) {
    return { ok: false, reason: "absent" };
  }

  // Prefer the vertical-specific definition over the shared (NULL) one.
  const chosen =
    candidates.find((t) => t.verticalContext === verticalContext) ?? candidates[0];

  if (!chosen.isActive) {
    return { ok: false, reason: "inactive" };
  }

  return { ok: true, template: chosen };
}

/**
 * Classify outbound content into exactly one of {template-bound, free-text}
 * (Req 5.7 / Property 13).
 *
 * Content is `template-bound` iff it references a template that resolves to an
 * ACTIVE definition for `verticalContext`. Free text, structured-but-unbound
 * payloads, and references to absent/inactive templates are all `free-text`.
 */
export function classifyOutbound(
  request: OutboundContentRequest,
  templates: readonly MessageTemplate[],
  verticalContext: VerticalContext,
): OutboundClassification {
  if (request.kind !== "template") {
    return "free-text";
  }
  const resolution = resolveTemplate(templates, request.templateKey, verticalContext);
  return resolution.ok ? "template-bound" : "free-text";
}

/**
 * Substitute named slots into a template body, replacing ONLY `{{slot}}`
 * placeholders (Req 5.3 / Property 13).
 *
 * Every placeholder present in `body` must have a value in `slots`; a missing
 * value yields `{ ok: false }` so the caller can reject rather than send a
 * message with an unfilled placeholder. Slot keys that do not appear in the body
 * are ignored — they cannot inject extra content. The returned `used` map is the
 * exact set of slots substituted (for audit per Req 5.6).
 */
export function substituteSlots(
  body: string,
  slots: Readonly<Record<string, string>>,
):
  | { ok: true; body: string; used: Record<string, string> }
  | { ok: false; missing: string[] } {
  const used: Record<string, string> = {};
  const missing: string[] = [];

  const substituted = body.replace(SLOT_PATTERN, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(slots, name)) {
      const value = slots[name];
      used[name] = value;
      return value;
    }
    if (!missing.includes(name)) {
      missing.push(name);
    }
    return _match;
  });

  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true, body: substituted, used };
}

/**
 * Extract the distinct named-slot identifiers declared in a template body.
 * Useful for template CRUD/validation (task 5.8) and for callers that want the
 * declared slot set without performing substitution.
 */
export function extractSlotNames(body: string): string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(SLOT_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}

/**
 * Compose an outbound message from a content request (Req 5.3, 5.4, 5.5, 5.7,
 * 11.6 / Property 13).
 *
 * Pipeline:
 *   1. Classify the request. Anything not bound to an active template is
 *      `free-text` and rejected as `unbound_content` — never sent (Req 5.4/5.7).
 *   2. For a template reference, resolve it; reject `absent`/`inactive`
 *      (Req 5.5). A reference to an absent/inactive template is `free-text`
 *      because it is not bound to an active template.
 *   3. Substitute only the named slots of the resolved active body; reject if a
 *      declared slot has no value (`missing_slot`).
 *   4. On success the accepted body equals the template body with only its named
 *      slots substituted — no additional free or structured content (Property 13).
 *
 * This function performs no send and no persistence; the caller (RPC) stages the
 * accepted result and audits it.
 */
export function composeOutbound(
  request: OutboundContentRequest,
  templates: readonly MessageTemplate[],
  verticalContext: VerticalContext,
): ComposeOutboundResult {
  // Step 1 — unbound content (free text or structured) is rejected outright.
  if (request.kind !== "template") {
    return { status: "rejected", classification: "free-text", reason: "unbound_content" };
  }

  // Step 2 — resolve the referenced template.
  const resolution = resolveTemplate(templates, request.templateKey, verticalContext);
  if (!resolution.ok) {
    // Not bound to an ACTIVE template ⇒ classified free-text (Req 5.7).
    return {
      status: "rejected",
      classification: "free-text",
      reason: resolution.reason === "absent" ? "template_absent" : "template_inactive",
    };
  }

  // Step 3 — substitute only the named slots of the active template body.
  const substitution = substituteSlots(resolution.template.body, request.slots);
  if (!substitution.ok) {
    return { status: "rejected", classification: "template-bound", reason: "missing_slot" };
  }

  // Step 4 — accepted, template-bound, body is purely template + slot values.
  return {
    status: "accepted",
    classification: "template-bound",
    templateKey: resolution.template.templateKey,
    verticalContext,
    body: substitution.body,
    slotValues: substitution.used,
  };
}
