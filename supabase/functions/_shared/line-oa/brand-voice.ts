// Outbound-content helper: brand voice + segment-length enforcement
// Feature: line-oa-commerce (Module B5)
// Spec task: 5.3 Implement the brand-voice resolver (`brand_voice(vertical_context)`)
//            and 200-char enforcement
//
// Pure logic only — NO DB writes, NO HTTP. This is one of the three vertical
// adapter seams from design.md (Decision 3):
//
//   | Seam         | Selector          | Used by                              |
//   |--------------|-------------------|--------------------------------------|
//   | brand_voice  | vertical_context  | brand-voice enforcement in           |
//   |              |                   | rpc_send_line_outbound               |
//
// `rpc_send_line_outbound` resolves the conversation's Brand_Voice_Guideline by
// `vertical_context` and rejects any outbound segment longer than 200 chars
// before staging the outbound row. The logic below is the pure core that both
// the DB-side RPC and the property-based tests exercise.
//
// Requirements:
//   9.1 Apply the Brand_Voice_Guideline for the Conversation's vertical_context.
//   9.2 Constrain each Outbound_Message segment to a maximum of 200 characters.
//   9.3 Reject (with an error) any segment that exceeds 200 characters; do not send.
//   9.4 When vertical-scoped, apply the guideline matching the vertical_context.

/**
 * Maximum allowed length, in Unicode code points, of a single outbound message
 * segment (Req 9.2). Brand_Voice_Guideline defines this ceiling.
 */
export const MAX_SEGMENT_LENGTH = 200 as const;

/**
 * A resolved Brand_Voice_Guideline for a vertical (Req 9.1, 9.4).
 *
 * The guideline is intentionally data-driven (dispatch by `verticalContext`)
 * rather than branched code, so adding a vertical is a registry entry, not a
 * fork (design.md Decision 3).
 */
export interface BrandVoiceGuideline {
  /** The vertical this guideline applies to (e.g. `monolith`, `tcck`). */
  readonly verticalContext: string;
  /** Short, human-readable tone descriptor — "short and warm" per the glossary. */
  readonly tone: string;
  /** Per-segment ceiling in code points; always {@link MAX_SEGMENT_LENGTH}. */
  readonly maxSegmentLength: number;
  /** Longer-form description of the voice for operators/authors. */
  readonly description: string;
}

/**
 * Vertical-scoped Brand_Voice_Guideline registry (Req 9.4).
 *
 * One entry per vertical operating on the platform. All verticals share the
 * 200-char-per-segment ceiling (Req 9.2) but carry their own tone.
 */
const BRAND_VOICE_REGISTRY: Readonly<Record<string, BrandVoiceGuideline>> = {
  // MONOLITH — furniture / interior-design manufacturing.
  monolith: {
    verticalContext: "monolith",
    tone: "short, warm, craft-confident",
    maxSegmentLength: MAX_SEGMENT_LENGTH,
    description:
      "Warm and concise with quiet craftsmanship pride; helpful, never salesy.",
  },
  // TCCK — Thai Curry Cloud Kitchen (food).
  tcck: {
    verticalContext: "tcck",
    tone: "short, warm, appetizing",
    maxSegmentLength: MAX_SEGMENT_LENGTH,
    description:
      "Warm and friendly with appetite appeal; quick, cheerful, and clear.",
  },
};

/**
 * Error raised when a guideline is requested for a vertical that has no
 * configured Brand_Voice_Guideline. The resolver is strict: a conversation's
 * `vertical_context` must map to a known guideline (Req 9.1).
 */
export class UnknownVerticalError extends Error {
  constructor(public readonly verticalContext: string) {
    super(`No Brand_Voice_Guideline configured for vertical_context "${verticalContext}".`);
    this.name = "UnknownVerticalError";
  }
}

/**
 * Resolve the Brand_Voice_Guideline for a vertical (the `brand_voice(vertical_context)`
 * adapter seam — Req 9.1, 9.4).
 *
 * @param verticalContext the Conversation's vertical (e.g. `monolith`, `tcck`).
 * @returns the matching {@link BrandVoiceGuideline}.
 * @throws {UnknownVerticalError} if the vertical has no configured guideline.
 *
 * @example
 *   brandVoice("tcck").maxSegmentLength // => 200
 */
export function brandVoice(verticalContext: string): BrandVoiceGuideline {
  const guideline = BRAND_VOICE_REGISTRY[verticalContext];
  if (guideline === undefined) {
    throw new UnknownVerticalError(verticalContext);
  }
  return guideline;
}

/** Design-name alias for {@link brandVoice} (`brand_voice(vertical_context)`). */
export const brand_voice = brandVoice;

/** The verticals with a configured Brand_Voice_Guideline. */
export function configuredVerticals(): string[] {
  return Object.keys(BRAND_VOICE_REGISTRY);
}

/**
 * Measure a segment's length in Unicode code points.
 *
 * Code points (not UTF-16 code units) are the unit of enforcement so that
 * astral characters (e.g. emoji) and Thai text count as a human would expect.
 * Both the enforcement helpers and tests should use this measure to stay
 * consistent.
 */
export function measureSegmentLength(segment: string): number {
  return Array.from(segment).length;
}

/** Outcome of enforcing the 200-char ceiling on a single segment (Req 9.2, 9.3). */
export interface SegmentEnforcementResult {
  /** True when the segment is within the ceiling and may be sent. */
  readonly ok: boolean;
  /** The segment that was evaluated. */
  readonly segment: string;
  /** Measured length in code points ({@link measureSegmentLength}). */
  readonly length: number;
  /** The ceiling applied (defaults to {@link MAX_SEGMENT_LENGTH}). */
  readonly maxSegmentLength: number;
  /** Present iff `ok` is false — the rejection reason (Req 9.3). */
  readonly error?: string;
}

/**
 * True iff `segment` is within the per-segment ceiling (Req 9.2).
 *
 * @param segment the outbound segment to check.
 * @param maxSegmentLength ceiling in code points (defaults to {@link MAX_SEGMENT_LENGTH}).
 */
export function isSegmentWithinLimit(
  segment: string,
  maxSegmentLength: number = MAX_SEGMENT_LENGTH,
): boolean {
  return measureSegmentLength(segment) <= maxSegmentLength;
}

/**
 * Enforce the 200-char ceiling on a single outbound segment (Req 9.2, 9.3).
 *
 * Accepts (`ok: true`) any segment of at most `maxSegmentLength` code points;
 * rejects (`ok: false`, with an `error`) anything longer, so the caller does
 * not send it.
 *
 * @param segment the outbound segment to enforce.
 * @param maxSegmentLength ceiling in code points (defaults to {@link MAX_SEGMENT_LENGTH}).
 */
export function enforceSegmentLength(
  segment: string,
  maxSegmentLength: number = MAX_SEGMENT_LENGTH,
): SegmentEnforcementResult {
  const length = measureSegmentLength(segment);
  if (length <= maxSegmentLength) {
    return { ok: true, segment, length, maxSegmentLength };
  }
  return {
    ok: false,
    segment,
    length,
    maxSegmentLength,
    error: `Outbound segment exceeds the ${maxSegmentLength}-character brand-voice limit (${length} characters).`,
  };
}

/** Outcome of enforcing the ceiling across all segments of an outbound message. */
export interface SegmentsEnforcementResult {
  /** True iff every segment is within the ceiling (none rejected). */
  readonly ok: boolean;
  /** Per-segment results, in input order. */
  readonly results: readonly SegmentEnforcementResult[];
  /** The subset of results that were rejected (Req 9.3). */
  readonly rejected: readonly SegmentEnforcementResult[];
}

/**
 * Enforce the 200-char ceiling across every segment of a composed
 * Outbound_Message (Req 9.2, 9.3).
 *
 * The whole message is acceptable only when every segment is within the
 * ceiling; any over-length segment makes the result `ok: false` and is listed
 * in `rejected` so the caller rejects the send rather than truncating.
 *
 * @param segments the composed outbound segments.
 * @param maxSegmentLength ceiling in code points (defaults to {@link MAX_SEGMENT_LENGTH}).
 */
export function enforceSegments(
  segments: readonly string[],
  maxSegmentLength: number = MAX_SEGMENT_LENGTH,
): SegmentsEnforcementResult {
  const results = segments.map((s) => enforceSegmentLength(s, maxSegmentLength));
  const rejected = results.filter((r) => !r.ok);
  return { ok: rejected.length === 0, results, rejected };
}
