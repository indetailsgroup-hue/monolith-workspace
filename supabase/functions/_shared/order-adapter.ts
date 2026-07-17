// Order adapter registry — LINE OA Commerce (Module B5)
// Feature: line-oa-commerce
// Spec task: 5.1 Implement the order adapter registry (`order_adapter(vertical_context)`)
//
// Pure-logic adapter seam (Design Decision 3). `Order_Intake_Normalization`
// (invoked by the `rpc_create_line_order` SECURITY DEFINER RPC, task 13.1) uses
// `orderAdapter(vertical_context)` to map a vertical-specific raw order into the
// single canonical Order_Lifecycle shape consumed downstream:
//
//   * furniture (MONOLITH): line items / dimensions
//   * food      (TCCK):     menu items / modifiers
//
// One shared implementation serves both verticals; vertical differences live in
// data-driven adapters selected by `vertical_context`, never in forked code.
// Adding a third vertical is one adapter registration, not a fork.
//
// This module is PURE LOGIC: no DB writes, no HTTP, no I/O. It is importable by
// both the Deno Edge Functions and the Node/Vitest + fast-check harness.
//
// Requirements: 8.3 (apply normalization to produce the canonical order shape),
//               8.4 (reject invalid/empty canonical output — never submit it).

/* ----------------------------------------------------------------------------
 * Canonical Order_Lifecycle shape
 * ------------------------------------------------------------------------- */

/**
 * A single normalized line in the canonical order. Vertical-specific extras
 * (furniture dimensions, food modifiers) are preserved under `attributes` so the
 * canonical shape stays vertical-agnostic while losing no information.
 */
export interface CanonicalOrderItem {
  /** Canonical, vertical-agnostic item identifier (e.g. SKU or menu item id). */
  readonly sku: string;
  /** Human-readable item name. */
  readonly name: string;
  /** Quantity ordered; always a positive integer in valid canonical output. */
  readonly quantity: number;
  /** Normalized vertical-specific attributes (dimensions, modifiers, …). */
  readonly attributes: Readonly<Record<string, unknown>>;
}

/**
 * The canonical order shape consumed by the Order_Lifecycle. Valid output always
 * carries the originating `vertical_context` and a non-empty `items` list.
 */
export interface CanonicalOrder {
  readonly vertical_context: string;
  readonly items: ReadonlyArray<CanonicalOrderItem>;
  /** Convenience count; always equals `items.length` (≥ 1) in valid output. */
  readonly item_count: number;
}

/* ----------------------------------------------------------------------------
 * Normalization result (never both — produce valid output OR a rejection)
 * ------------------------------------------------------------------------- */

/**
 * The result of normalizing a raw order. Exactly one of the two variants:
 *   * `{ ok: true, order }`  — a schema-valid, non-empty canonical order that
 *     alone may be submitted to the Order_Lifecycle (Req 8.3), or
 *   * `{ ok: false, error }` — a rejection; invalid or empty canonical output is
 *     never produced and never submitted (Req 8.4).
 */
export type NormalizationResult =
  | { readonly ok: true; readonly order: CanonicalOrder }
  | { readonly ok: false; readonly error: string };

/** Signature of a per-vertical order adapter. */
export type OrderAdapter = (rawOrder: unknown) => NormalizationResult;

/** Supported business verticals. */
export const VERTICALS = ["monolith", "food"] as const;

/* ----------------------------------------------------------------------------
 * Shared input-validation helpers (pure)
 * ------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function reject(error: string): NormalizationResult {
  return { ok: false, error };
}

/** A non-empty, trimmed string; otherwise `null`. */
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A positive integer quantity; otherwise `null`. */
function asPositiveIntQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Finalize a list of canonical items into a valid, non-empty canonical order. */
function finalize(
  verticalContext: string,
  items: CanonicalOrderItem[],
): NormalizationResult {
  // Guard the core invariant of Req 8.4: empty canonical output is a rejection,
  // never a submittable order.
  if (items.length === 0) {
    return reject("normalization produced an empty order (no valid items)");
  }
  return {
    ok: true,
    order: {
      vertical_context: verticalContext,
      items,
      item_count: items.length,
    },
  };
}

/* ----------------------------------------------------------------------------
 * Furniture (MONOLITH) adapter — line items / dimensions
 * ------------------------------------------------------------------------- */

/** Read an optional non-negative numeric dimension; `undefined` if absent. */
function readDimension(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null; // present but invalid
  }
  return value;
}

const furnitureAdapter: OrderAdapter = (rawOrder) => {
  if (!isPlainObject(rawOrder)) {
    return reject("furniture order must be an object");
  }

  const lineItems = rawOrder["line_items"];
  if (!Array.isArray(lineItems)) {
    return reject("furniture order requires a 'line_items' array");
  }
  if (lineItems.length === 0) {
    return reject("furniture order has no line_items");
  }

  const items: CanonicalOrderItem[] = [];
  for (let i = 0; i < lineItems.length; i++) {
    const raw = lineItems[i];
    if (!isPlainObject(raw)) {
      return reject(`furniture line_items[${i}] must be an object`);
    }

    const sku = asNonEmptyString(raw["sku"]);
    if (sku === null) {
      return reject(`furniture line_items[${i}] requires a non-empty 'sku'`);
    }

    const name = asNonEmptyString(raw["name"]) ?? sku;

    const quantity = asPositiveIntQuantity(raw["quantity"]);
    if (quantity === null) {
      return reject(
        `furniture line_items[${i}] requires a positive integer 'quantity'`,
      );
    }

    // Dimensions are optional, but if present must be valid non-negative numbers.
    const attributes: Record<string, unknown> = {};
    const rawDimensions = raw["dimensions"];
    if (rawDimensions !== undefined && rawDimensions !== null) {
      if (!isPlainObject(rawDimensions)) {
        return reject(
          `furniture line_items[${i}].dimensions must be an object`,
        );
      }
      const dimensions: Record<string, number> = {};
      for (const key of ["width_mm", "height_mm", "depth_mm"] as const) {
        const dim = readDimension(rawDimensions[key]);
        if (dim === null) {
          return reject(
            `furniture line_items[${i}].dimensions.${key} must be a non-negative number`,
          );
        }
        if (dim !== undefined) dimensions[key] = dim;
      }
      attributes["dimensions"] = dimensions;
    }

    items.push({ sku, name, quantity, attributes });
  }

  return finalize("monolith", items);
};

/* ----------------------------------------------------------------------------
 * Food (TCCK) adapter — menu items / modifiers
 * ------------------------------------------------------------------------- */

const foodAdapter: OrderAdapter = (rawOrder) => {
  if (!isPlainObject(rawOrder)) {
    return reject("food order must be an object");
  }

  const menuItems = rawOrder["menu_items"];
  if (!Array.isArray(menuItems)) {
    return reject("food order requires a 'menu_items' array");
  }
  if (menuItems.length === 0) {
    return reject("food order has no menu_items");
  }

  const items: CanonicalOrderItem[] = [];
  for (let i = 0; i < menuItems.length; i++) {
    const raw = menuItems[i];
    if (!isPlainObject(raw)) {
      return reject(`food menu_items[${i}] must be an object`);
    }

    const sku = asNonEmptyString(raw["item_id"]);
    if (sku === null) {
      return reject(`food menu_items[${i}] requires a non-empty 'item_id'`);
    }

    const name = asNonEmptyString(raw["name"]) ?? sku;

    const quantity = asPositiveIntQuantity(raw["quantity"]);
    if (quantity === null) {
      return reject(
        `food menu_items[${i}] requires a positive integer 'quantity'`,
      );
    }

    // Modifiers are optional, but if present must be a well-formed list.
    const attributes: Record<string, unknown> = {};
    const rawModifiers = raw["modifiers"];
    if (rawModifiers !== undefined && rawModifiers !== null) {
      if (!Array.isArray(rawModifiers)) {
        return reject(`food menu_items[${i}].modifiers must be an array`);
      }
      const modifiers: Array<{ id: string; name: string }> = [];
      for (let m = 0; m < rawModifiers.length; m++) {
        const rawMod = rawModifiers[m];
        if (!isPlainObject(rawMod)) {
          return reject(
            `food menu_items[${i}].modifiers[${m}] must be an object`,
          );
        }
        const id = asNonEmptyString(rawMod["id"]);
        if (id === null) {
          return reject(
            `food menu_items[${i}].modifiers[${m}] requires a non-empty 'id'`,
          );
        }
        modifiers.push({ id, name: asNonEmptyString(rawMod["name"]) ?? id });
      }
      attributes["modifiers"] = modifiers;
    }

    items.push({ sku, name, quantity, attributes });
  }

  return finalize("food", items);
};

/* ----------------------------------------------------------------------------
 * Registry
 * ------------------------------------------------------------------------- */

/**
 * Adapter registry keyed by `vertical_context`. The single source of dispatch;
 * registering a third vertical here is the only change needed to extend the
 * platform (Design Decision 3).
 */
const ADAPTER_REGISTRY: Readonly<Record<string, OrderAdapter>> = {
  monolith: furnitureAdapter,
  food: foodAdapter,
};

/**
 * Resolve the order adapter for a `vertical_context`.
 *
 * @returns the vertical's {@link OrderAdapter}, or `undefined` if the
 *          `vertical_context` has no registered adapter.
 *
 * @example
 *   const adapter = orderAdapter("food");
 *   const result = adapter?.({ menu_items: [{ item_id: "GAENG", quantity: 1 }] });
 */
export function orderAdapter(verticalContext: string): OrderAdapter | undefined {
  // Only OWN registry keys are adapters. Without this guard a vertical named
  // after an inherited Object member ("valueOf", "toString", "constructor", …)
  // resolves to that prototype function instead of undefined and is wrongly
  // treated as a registered adapter (then throws when invoked).
  return Object.prototype.hasOwnProperty.call(ADAPTER_REGISTRY, verticalContext)
    ? ADAPTER_REGISTRY[verticalContext]
    : undefined;
}

/**
 * Apply `Order_Intake_Normalization`: select the vertical's adapter and map the
 * raw order into the canonical Order_Lifecycle shape.
 *
 * Guarantees (Req 8.3, 8.4): the returned result is either a schema-valid,
 * non-empty {@link CanonicalOrder} (`ok: true`) or a rejection (`ok: false`);
 * invalid or empty canonical output is never produced. An unregistered
 * `vertical_context` is rejected rather than throwing.
 */
export function normalizeOrder(
  verticalContext: string,
  rawOrder: unknown,
): NormalizationResult {
  const adapter = orderAdapter(verticalContext);
  if (adapter === undefined) {
    return reject(`no order adapter registered for vertical '${verticalContext}'`);
  }
  try {
    return adapter(rawOrder);
  } catch (err) {
    // Uphold the documented guarantee: normalizeOrder never throws. A malformed
    // rawOrder — e.g. one whose keys shadow Object built-ins like `valueOf` /
    // `toString`, breaking coercion inside the adapter — is surfaced as a clean
    // rejection rather than a thrown/rejected error (which otherwise leaked as
    // an unhandled async rejection and randomly reddened unrelated tests).
    return reject(
      `order adapter for '${verticalContext}' threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
