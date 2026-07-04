/**
 * Property test — LINE OA Commerce (Module B5)
 * Spec task: 5.4 Write property test for brand-voice enforcement
 *
 * Property 22: Applied guideline matches the conversation vertical; every
 * accepted segment ≤ 200 chars; longer segments are rejected and not sent.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 *
 * Exercises the pure `brand_voice` adapter seam (design.md Decision 3) that
 * `rpc_send_line_outbound` uses: resolve the Brand_Voice_Guideline for the
 * conversation's `vertical_context` (Req 9.1, 9.4), constrain each outbound
 * segment to ≤ 200 code points (Req 9.2), and reject — never send — any
 * segment that exceeds the ceiling (Req 9.3).
 *
 * Length is measured in Unicode code points via `measureSegmentLength` so the
 * test and the implementation share one consistent measure (astral characters
 * such as emoji and Thai text count as a human would expect).
 */

import { it, expect } from "vitest";
import { fc, fcParams } from "./harness";
import { describeProperty } from "./property";
import {
  brandVoice,
  configuredVerticals,
  enforceSegments,
  measureSegmentLength,
  MAX_SEGMENT_LENGTH,
} from "../../../supabase/functions/_shared/line-oa/brand-voice";

// Each entry is a single Unicode code point. Mixing ASCII, Thai, an emoji
// (astral / surrogate pair), and a precomposed accented letter ensures the
// code-point measure is exercised against characters whose UTF-16 length
// differs from their code-point count.
const SINGLE_CODE_POINT_CHARS = ["a", "Z", "9", " ", "ก", "ม", "é", "😀", "🍜"] as const;
const charArb = fc.constantFrom(...SINGLE_CODE_POINT_CHARS);

/** A segment whose code-point length lies in [min, max]. */
function segmentOfCodePointLength(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .integer({ min, max })
    .chain((n) =>
      fc.array(charArb, { minLength: n, maxLength: n }).map((cs) => cs.join("")),
    );
}

// Bias generation so BOTH within-limit (≤ 200) and over-limit (> 200) segments
// reliably appear, including the exact boundaries 200 and 201.
const withinLimitSegment = segmentOfCodePointLength(0, MAX_SEGMENT_LENGTH);
const overLimitSegment = segmentOfCodePointLength(MAX_SEGMENT_LENGTH + 1, 400);
const segmentArb = fc.oneof(withinLimitSegment, overLimitSegment);

const verticalArb = fc.constantFrom(...configuredVerticals());

describeProperty(
  22,
  "Applied guideline matches the conversation vertical; every accepted segment ≤ 200 chars; longer segments are rejected and not sent",
  () => {
    it("resolves the matching guideline, accepts only ≤200-char segments, and rejects (never sends) longer ones", () => {
      fc.assert(
        fc.property(
          verticalArb,
          fc.array(segmentArb, { minLength: 0, maxLength: 8 }),
          (vertical, segments) => {
            // Req 9.1 / 9.4 — the resolved guideline matches the requested vertical.
            const guideline = brandVoice(vertical);
            expect(guideline.verticalContext).toBe(vertical);
            expect(guideline.maxSegmentLength).toBe(MAX_SEGMENT_LENGTH);

            const outcome = enforceSegments(segments, guideline.maxSegmentLength);

            const accepted = outcome.results.filter((r) => r.ok);
            const rejected = outcome.rejected;

            // The accepted set and rejected set partition the input exactly.
            expect(accepted.length + rejected.length).toBe(segments.length);

            // Req 9.2 — every accepted segment is within the 200-char ceiling.
            for (const r of accepted) {
              expect(r.ok).toBe(true);
              expect(measureSegmentLength(r.segment)).toBeLessThanOrEqual(
                MAX_SEGMENT_LENGTH,
              );
              expect(r.length).toBeLessThanOrEqual(MAX_SEGMENT_LENGTH);
            }

            // Req 9.3 — every over-limit segment is rejected (carries an error)
            // and is NOT among the accepted (sent) segments.
            const acceptedRefs = new Set(accepted);
            for (const r of outcome.results) {
              if (measureSegmentLength(r.segment) > MAX_SEGMENT_LENGTH) {
                expect(r.ok).toBe(false);
                expect(r.error).toBeTruthy();
                expect(acceptedRefs.has(r)).toBe(false);
                expect(rejected).toContain(r);
              }
            }

            // The whole message is acceptable iff no segment was rejected.
            expect(outcome.ok).toBe(rejected.length === 0);
          },
        ),
        fcParams(),
      );
    });
  },
);
