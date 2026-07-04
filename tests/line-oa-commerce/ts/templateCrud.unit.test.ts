/**
 * Unit tests — Message-template CRUD & named-slot definitions.
 * LINE OA Commerce (Module B5). Spec task: 5.8.
 *
 * Validates: Requirements 5.1
 *
 * These are EXAMPLE-BASED unit tests (not a numbered property test). They cover
 * the template lifecycle exposed by the pure template-logic layer:
 *
 *   * create        — defining a template (keyed by (template_key,
 *                     vertical_context)) and discovering its named slots.
 *   * activate /    — an inactive template is not resolvable to a sendable
 *     deactivate      definition; flipping `isActive` toggles resolvability,
 *                     and re-activation restores it (isActive transitions, Req 5.5).
 *   * named slots   — `extractSlotNames` enumerates the distinct `{{slot}}`
 *                     identifiers declared in a template body (Req 5.3).
 *   * shared vs     — a NULL-scoped template is shared across verticals; a
 *     scoped          non-NULL scope is vertical-specific, and a vertical-scoped
 *                     definition overrides the shared one for the same key (Req 5.2).
 *
 * The template store is modeled the way the `line_oa_message_templates` table
 * keys rows — (template_key, vertical_context) with NULL = shared scope (see
 * migrations 00000000000001 / 00000000000002) — so the CRUD operations here mirror
 * the database semantics while exercising only the pure, side-effect-free logic.
 */

import { describe, it, expect } from "vitest";
import {
  resolveTemplate,
  extractSlotNames,
  isTemplateResolvable,
  type MessageTemplate,
} from "../../../supabase/functions/_shared/line-oa/templates";

/**
 * Minimal in-memory template store mirroring the (template_key, vertical_context)
 * composite key of `line_oa_message_templates` (NULL vertical = shared scope).
 * `create` enforces key uniqueness; `setActive` performs the activate/deactivate
 * transition. This is test scaffolding around the pure logic under test — it has
 * no I/O and no database access.
 */
class TemplateStore {
  private readonly rows: MessageTemplate[] = [];

  private static sameKey(
    a: Pick<MessageTemplate, "templateKey" | "verticalContext">,
    b: Pick<MessageTemplate, "templateKey" | "verticalContext">,
  ): boolean {
    return a.templateKey === b.templateKey && a.verticalContext === b.verticalContext;
  }

  /** Create a template; rejects a duplicate (template_key, vertical_context). */
  create(template: MessageTemplate): void {
    if (this.rows.some((r) => TemplateStore.sameKey(r, template))) {
      throw new Error(
        `duplicate template key (${template.templateKey}, ${String(template.verticalContext)})`,
      );
    }
    this.rows.push({ ...template });
  }

  /** Flip the active flag for a stored template (activate / deactivate). */
  setActive(
    templateKey: string,
    verticalContext: string | null,
    isActive: boolean,
  ): void {
    const row = this.rows.find((r) =>
      TemplateStore.sameKey(r, { templateKey, verticalContext }),
    );
    if (!row) {
      throw new Error(
        `no template (${templateKey}, ${String(verticalContext)}) to update`,
      );
    }
    row.isActive = isActive;
  }

  /** Snapshot the candidate set passed into the pure resolver. */
  all(): readonly MessageTemplate[] {
    return this.rows.map((r) => ({ ...r }));
  }
}

describe("template CRUD — create & named-slot definitions (Req 5.1, 5.3)", () => {
  it("creates a template and resolves it for its vertical", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "order_ready",
      verticalContext: "monolith",
      body: "Your order {{order_id}} is ready for pickup.",
      isActive: true,
    });

    const resolution = resolveTemplate(store.all(), "order_ready", "monolith");
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.template.body).toBe(
      "Your order {{order_id}} is ready for pickup.",
    );
  });

  it("rejects creating a duplicate (template_key, vertical_context) key", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "order_ready",
      verticalContext: "tcck",
      body: "Order {{order_id}} ready.",
      isActive: true,
    });

    expect(() =>
      store.create({
        templateKey: "order_ready",
        verticalContext: "tcck",
        body: "duplicate body",
        isActive: true,
      }),
    ).toThrow(/duplicate template key/);
  });

  it("allows the same template_key under a different vertical scope", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "order_ready",
      verticalContext: "monolith",
      body: "Furniture order {{order_id}} ready.",
      isActive: true,
    });
    // Same key, different scope — distinct composite key, so allowed.
    expect(() =>
      store.create({
        templateKey: "order_ready",
        verticalContext: "tcck",
        body: "Food order {{order_id}} ready.",
        isActive: true,
      }),
    ).not.toThrow();
    // And the shared (NULL) scope is yet another distinct key.
    expect(() =>
      store.create({
        templateKey: "order_ready",
        verticalContext: null,
        body: "Order {{order_id}} ready.",
        isActive: true,
      }),
    ).not.toThrow();
  });

  it("enumerates distinct named slots declared in a body", () => {
    expect(
      extractSlotNames("Hi {{customer_name}}, order {{order_id}} total {{total}}."),
    ).toEqual(["customer_name", "order_id", "total"]);
  });

  it("returns no slots for a body without placeholders", () => {
    expect(extractSlotNames("Thanks for your order!")).toEqual([]);
  });

  it("de-duplicates a slot referenced multiple times and tolerates inner whitespace", () => {
    expect(
      extractSlotNames("{{order_id}} — see {{ order_id }} again, plus {{eta}}."),
    ).toEqual(["order_id", "eta"]);
  });
});

describe("template CRUD — activate / deactivate transitions (Req 5.1, 5.5)", () => {
  it("does not resolve a template created inactive", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "promo",
      verticalContext: "monolith",
      body: "Deal: {{code}}",
      isActive: false,
    });

    const resolution = resolveTemplate(store.all(), "promo", "monolith");
    expect(resolution.ok).toBe(false);
    expect(resolution.ok === false && resolution.reason).toBe("inactive");
  });

  it("deactivating an active template makes it non-resolvable, reactivating restores it", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "promo",
      verticalContext: "monolith",
      body: "Deal: {{code}}",
      isActive: true,
    });

    // Active → resolvable.
    expect(resolveTemplate(store.all(), "promo", "monolith").ok).toBe(true);

    // Deactivate → rejected as inactive.
    store.setActive("promo", "monolith", false);
    const deactivated = resolveTemplate(store.all(), "promo", "monolith");
    expect(deactivated.ok).toBe(false);
    expect(deactivated.ok === false && deactivated.reason).toBe("inactive");

    // Reactivate → resolvable again.
    store.setActive("promo", "monolith", true);
    expect(resolveTemplate(store.all(), "promo", "monolith").ok).toBe(true);
  });

  it("treats an absent key distinctly from an inactive one", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "promo",
      verticalContext: "monolith",
      body: "Deal: {{code}}",
      isActive: false,
    });

    // Existing-but-inactive → inactive.
    expect(resolveTemplate(store.all(), "promo", "monolith").ok).toBe(false);
    const inactive = resolveTemplate(store.all(), "promo", "monolith");
    expect(inactive.ok === false && inactive.reason).toBe("inactive");

    // Never-created key → absent.
    const absent = resolveTemplate(store.all(), "does_not_exist", "monolith");
    expect(absent.ok).toBe(false);
    expect(absent.ok === false && absent.reason).toBe("absent");
  });
});

describe("template CRUD — shared vs vertical-scoped resolution (Req 5.1, 5.2)", () => {
  it("resolves a shared (NULL-scope) template for any vertical", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "greeting",
      verticalContext: null,
      body: "Welcome, {{customer_name}}!",
      isActive: true,
    });

    for (const vertical of ["monolith", "tcck", "some_other_vertical"]) {
      const resolution = resolveTemplate(store.all(), "greeting", vertical);
      expect(resolution.ok).toBe(true);
      expect(resolution.ok && resolution.template.verticalContext).toBeNull();
    }
  });

  it("isolates a vertical-scoped template to its own vertical", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "dim_confirm",
      verticalContext: "monolith",
      body: "Dimensions confirmed for order {{order_id}}.",
      isActive: true,
    });

    // Resolvable for its own vertical.
    expect(resolveTemplate(store.all(), "dim_confirm", "monolith").ok).toBe(true);

    // Absent for a different vertical — scoping isolates it.
    const otherVertical = resolveTemplate(store.all(), "dim_confirm", "tcck");
    expect(otherVertical.ok).toBe(false);
    expect(otherVertical.ok === false && otherVertical.reason).toBe("absent");
  });

  it("prefers a vertical-scoped definition over the shared one for the same key", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "order_ready",
      verticalContext: null,
      body: "Order {{order_id}} ready.",
      isActive: true,
    });
    store.create({
      templateKey: "order_ready",
      verticalContext: "tcck",
      body: "Your meal {{order_id}} is hot and ready!",
      isActive: true,
    });

    // tcck conversation gets the vertical-specific override.
    const scoped = resolveTemplate(store.all(), "order_ready", "tcck");
    expect(scoped.ok).toBe(true);
    expect(scoped.ok && scoped.template.verticalContext).toBe("tcck");
    expect(scoped.ok && scoped.template.body).toBe(
      "Your meal {{order_id}} is hot and ready!",
    );

    // A vertical with no override falls back to the shared definition.
    const sharedFallback = resolveTemplate(store.all(), "order_ready", "monolith");
    expect(sharedFallback.ok).toBe(true);
    expect(sharedFallback.ok && sharedFallback.template.verticalContext).toBeNull();
  });

  it("does NOT fall back to a shared active template when the scoped one is inactive", () => {
    const store = new TemplateStore();
    store.create({
      templateKey: "order_ready",
      verticalContext: null,
      body: "Order {{order_id}} ready.",
      isActive: true,
    });
    store.create({
      templateKey: "order_ready",
      verticalContext: "tcck",
      body: "Your meal {{order_id}} is ready!",
      isActive: true,
    });

    // Deactivate the scoped override — the reference resolves to the chosen
    // (scoped) candidate and is rejected as inactive rather than silently
    // falling back to the shared active definition (Req 5.5).
    store.setActive("order_ready", "tcck", false);
    const resolution = resolveTemplate(store.all(), "order_ready", "tcck");
    expect(resolution.ok).toBe(false);
    expect(resolution.ok === false && resolution.reason).toBe("inactive");
  });

  it("matches isTemplateResolvable predicate for shared and scoped templates", () => {
    const shared: MessageTemplate = {
      templateKey: "greeting",
      verticalContext: null,
      body: "Hi {{name}}",
      isActive: true,
    };
    const scoped: MessageTemplate = {
      templateKey: "greeting",
      verticalContext: "monolith",
      body: "Hi {{name}}",
      isActive: true,
    };

    expect(isTemplateResolvable(shared, "monolith")).toBe(true);
    expect(isTemplateResolvable(shared, "tcck")).toBe(true);
    expect(isTemplateResolvable(scoped, "monolith")).toBe(true);
    expect(isTemplateResolvable(scoped, "tcck")).toBe(false);
  });
});
