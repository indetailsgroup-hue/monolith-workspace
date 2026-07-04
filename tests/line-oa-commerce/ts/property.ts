/**
 * Vitest binding for the property-tag convention — LINE OA Commerce (Module B5).
 * Spec task: 1.1 (scaffold)
 *
 * `describeProperty(n, text, fn)` opens a Vitest `describe` block whose name is the
 * canonical property tag, so test output and `-t` filtering line up with the
 * `Feature: line-oa-commerce, Property {n}: {text}` convention.
 */

import { describe } from "vitest";
import { propertyTag } from "./harness";

/**
 * Bind a property-based test block to its canonical tag.
 *
 * @example
 *   describeProperty(1, "Signature verification round-trip and rejection", () => {
 *     it("verifies a correct HMAC and rejects tampered bodies", () => {
 *       fc.assert(fc.property(...), fcParams());
 *     });
 *   });
 */
export function describeProperty(
  n: number,
  text: string,
  fn: () => void,
): void {
  describe(propertyTag(n, text), fn);
}
