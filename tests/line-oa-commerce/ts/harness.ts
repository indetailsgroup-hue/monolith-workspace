/**
 * PBT harness (TypeScript / fast-check) — LINE OA Commerce (Module B5)
 * Spec task: 1.1 Scaffold migrations, Edge Functions, and the PBT harness
 *
 * This harness drives property-based tests over the Edge-Function / adapter logic
 * (pure TypeScript): signature framing, idempotency keying, template
 * classification, brand-voice limits, confidence/guardrail logic, etc.
 *
 * The database-layer properties (RLS, RPC behavior, immutability) are exercised
 * by the Python `hypothesis` harness under `../py`.
 *
 * Conventions established here:
 *   1. Property-tag convention. Every property test is tagged with a comment of
 *      the form:
 *        // Feature: line-oa-commerce, Property {n}: {text}
 *      Use `propertyTag(n, text)` to build the canonical string and
 *      `describeProperty(n, text, fn)` to bind it to a Vitest block.
 *   2. Default iterations. Property tests run a minimum of 100 iterations.
 *      Use `PROPERTY_RUNS` / `fcParams()` so every `fc.assert` shares the default.
 */

import fc from "fast-check";

/** Feature slug used in every property tag for this module. */
export const FEATURE = "line-oa-commerce" as const;

/** Default minimum number of iterations for every property test (spec: ≥ 100). */
export const PROPERTY_RUNS = 100 as const;

/**
 * Build the canonical property-tag string.
 *
 * @example
 *   propertyTag(1, "Signature verification round-trip and rejection")
 *   // => "Feature: line-oa-commerce, Property 1: Signature verification round-trip and rejection"
 */
export function propertyTag(n: number, text: string): string {
  return `Feature: ${FEATURE}, Property ${n}: ${text}`;
}

/**
 * Default parameters for `fc.assert`, guaranteeing the ≥100-iteration floor.
 * Callers may override (e.g. bump `numRuns`) but should not drop below
 * `PROPERTY_RUNS`.
 */
export function fcParams(
  overrides: fc.Parameters<unknown> = {},
): fc.Parameters<unknown> {
  return { numRuns: PROPERTY_RUNS, ...overrides };
}

export { fc };
