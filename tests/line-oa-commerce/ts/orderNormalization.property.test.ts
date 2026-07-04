/**
 * Property test — LINE OA Commerce (Module B5). Spec task: 5.2
 *
 * Feature: line-oa-commerce, Property 20: Normalization yields valid canonical
 * output or rejects; invalid/empty output is never submitted
 *
 * Validates: Requirements 8.3, 8.4
 *
 * For any raw order (valid or malformed) in either vertical (furniture:
 * line_items/dimensions; food: menu_items/modifiers), `normalizeOrder` must
 * return EITHER:
 *   * `{ ok: true, order }` where `order` is a schema-valid, NON-EMPTY canonical
 *     order (the only thing that may be submitted to the Order_Lifecycle), OR
 *   * `{ ok: false, error }` — a rejection that carries NO canonical output.
 * Invalid or empty canonical output is never produced and never submitted.
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  normalizeOrder,
  type CanonicalOrder,
  type NormalizationResult,
} from "../../../supabase/functions/_shared/order-adapter";

/* ----------------------------------------------------------------------------
 * Canonical-order schema validator (independent of the implementation under
 * test): asserts the shape Req 8.3/8.4 promises for accepted output.
 * ------------------------------------------------------------------------- */

function isValidCanonicalOrder(
  order: CanonicalOrder,
  expectedVertical: string,
): boolean {
  if (typeof order !== "object" || order === null) return false;
  if (order.vertical_context !== expectedVertical) return false;
  if (!Array.isArray(order.items)) return false;
  // Non-empty: Req 8.4 — empty canonical output must be a rejection, not output.
  if (order.items.length === 0) return false;
  // Convenience count must agree with the item list.
  if (order.item_count !== order.items.length) return false;

  return order.items.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    if (typeof item.sku !== "string" || item.sku.length === 0) return false;
    if (typeof item.name !== "string" || item.name.length === 0) return false;
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return false;
    }
    if (
      typeof item.attributes !== "object" ||
      item.attributes === null ||
      Array.isArray(item.attributes)
    ) {
      return false;
    }
    return true;
  });
}

/* ----------------------------------------------------------------------------
 * Generators — valid AND invalid/malformed raw orders for both verticals.
 * ------------------------------------------------------------------------- */

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim().length > 0);

const positiveIntQty = fc.integer({ min: 1, max: 99 });

/** A well-formed furniture line item (sku + positive qty, optional dims/name). */
const validFurnitureLineItem = fc.record(
  {
    sku: nonEmptyString,
    name: fc.option(nonEmptyString, { nil: undefined }),
    quantity: positiveIntQty,
    dimensions: fc.option(
      fc.record(
        {
          width_mm: fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), {
            nil: undefined,
          }),
          height_mm: fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), {
            nil: undefined,
          }),
          depth_mm: fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), {
            nil: undefined,
          }),
        },
        { requiredKeys: [] },
      ),
      { nil: undefined },
    ),
  },
  { requiredKeys: ["sku", "quantity"] },
);

/** A well-formed food menu item (item_id + positive qty, optional modifiers). */
const validFoodMenuItem = fc.record(
  {
    item_id: nonEmptyString,
    name: fc.option(nonEmptyString, { nil: undefined }),
    quantity: positiveIntQty,
    modifiers: fc.option(
      fc.array(
        fc.record(
          { id: nonEmptyString, name: fc.option(nonEmptyString, { nil: undefined }) },
          { requiredKeys: ["id"] },
        ),
        { maxLength: 4 },
      ),
      { nil: undefined },
    ),
  },
  { requiredKeys: ["item_id", "quantity"] },
);

const validFurnitureOrder = fc.record({
  line_items: fc.array(validFurnitureLineItem, { minLength: 1, maxLength: 5 }),
});

const validFoodOrder = fc.record({
  menu_items: fc.array(validFoodMenuItem, { minLength: 1, maxLength: 5 }),
});

/**
 * Malformed / hostile raw orders: empty containers, wrong types, missing
 * required fields, non-positive or non-integer quantities, garbage, etc. These
 * must all funnel into the rejection branch (never invalid canonical output).
 */
const malformedRawOrder = fc.oneof(
  fc.anything(),
  fc.constant({}),
  fc.constant({ line_items: [] }),
  fc.constant({ menu_items: [] }),
  fc.constant({ line_items: "not-an-array" }),
  fc.constant({ menu_items: 42 }),
  fc.record({ line_items: fc.array(fc.anything(), { maxLength: 3 }) }),
  fc.record({ menu_items: fc.array(fc.anything(), { maxLength: 3 }) }),
  // furniture items missing/invalid sku or quantity
  fc.record({
    line_items: fc.array(
      fc.record({
        sku: fc.oneof(fc.constant(""), fc.integer(), fc.constant(undefined)),
        quantity: fc.oneof(
          fc.constant(0),
          fc.integer({ min: -50, max: 0 }),
          fc.double({ min: 0.1, max: 5, noNaN: true }),
          fc.string(),
        ),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  }),
  // food items missing/invalid item_id or quantity
  fc.record({
    menu_items: fc.array(
      fc.record({
        item_id: fc.oneof(fc.constant(""), fc.integer(), fc.constant(undefined)),
        quantity: fc.oneof(
          fc.constant(0),
          fc.integer({ min: -50, max: 0 }),
          fc.string(),
        ),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  }),
);

/** vertical_context + raw order pairs spanning valid and invalid inputs. */
const verticalAndRawOrder = fc.oneof(
  fc.tuple(fc.constant("monolith"), validFurnitureOrder),
  fc.tuple(fc.constant("food"), validFoodOrder),
  fc.tuple(fc.constant("monolith"), malformedRawOrder),
  fc.tuple(fc.constant("food"), malformedRawOrder),
  // wrong-vertical payloads (food order under furniture and vice-versa)
  fc.tuple(fc.constant("monolith"), validFoodOrder),
  fc.tuple(fc.constant("food"), validFurnitureOrder),
  // unregistered verticals must reject, never throw or emit output
  fc.tuple(
    fc.string({ maxLength: 8 }).filter((v) => v !== "monolith" && v !== "food"),
    fc.oneof(validFurnitureOrder, validFoodOrder, malformedRawOrder),
  ),
);

/* ----------------------------------------------------------------------------
 * Property 20
 * ------------------------------------------------------------------------- */

describeProperty(
  20,
  "Normalization yields valid canonical output or rejects; invalid/empty output is never submitted",
  () => {
    it("always returns valid non-empty canonical output OR a rejection without output", () => {
      fc.assert(
        fc.property(verticalAndRawOrder, ([vertical, rawOrder]) => {
          const result: NormalizationResult = normalizeOrder(vertical, rawOrder);

          // The result must be exactly one of the two discriminated variants.
          expect(typeof result).toBe("object");
          expect(result).not.toBeNull();
          expect(typeof result.ok).toBe("boolean");

          if (result.ok) {
            // Accepted: must be a schema-valid, NON-EMPTY canonical order whose
            // vertical_context equals the requested vertical (only this may be
            // submitted to the Order_Lifecycle — Req 8.3).
            expect(isValidCanonicalOrder(result.order, vertical)).toBe(true);
            expect(result.order.items.length).toBeGreaterThan(0);
            // A successful result never carries an error.
            expect("error" in result).toBe(false);
          } else {
            // Rejected: carries an error string and NEVER any canonical output
            // (Req 8.4 — invalid/empty output is never submitted).
            expect(typeof result.error).toBe("string");
            expect(result.error.length).toBeGreaterThan(0);
            expect("order" in result).toBe(false);
          }
        }),
        fcParams(),
      );
    });
  },
);
