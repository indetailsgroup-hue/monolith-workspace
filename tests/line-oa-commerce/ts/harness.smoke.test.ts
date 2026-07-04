/**
 * Harness smoke test — LINE OA Commerce (Module B5). Spec task: 1.1 (scaffold)
 *
 * Verifies the PBT harness scaffolding is wired up and discoverable by Vitest:
 *   * the property-tag convention produces the canonical string,
 *   * the ≥100-iteration default is in place and applied by `fc.assert`,
 *   * the LINE Messaging API mock is deterministic and records calls,
 *   * the `record_input_sync` spy/stub records calls and honors outcomes.
 *
 * This is a scaffold check, not a feature property test. Real property tests
 * (Properties 1–31) are added by later tasks and tagged via `describeProperty`.
 */

import { describe, it, expect } from "vitest";
import {
  FEATURE,
  PROPERTY_RUNS,
  fc,
  fcParams,
  propertyTag,
} from "./harness";
import { createMockLineMessagingApi } from "./mocks/lineMessagingApi";
import { createMockRecordInputSync } from "./mocks/recordInputSync";

describe("line-oa-commerce PBT harness (TS)", () => {
  it("builds the canonical property tag", () => {
    expect(propertyTag(1, "Signature verification round-trip and rejection")).toBe(
      "Feature: line-oa-commerce, Property 1: Signature verification round-trip and rejection",
    );
    expect(FEATURE).toBe("line-oa-commerce");
  });

  it("defaults to at least 100 iterations", () => {
    expect(PROPERTY_RUNS).toBeGreaterThanOrEqual(100);
    expect(fcParams().numRuns).toBe(100);
    expect(fcParams({ numRuns: 250 }).numRuns).toBe(250);
  });

  it("runs a fast-check property with the shared default params", () => {
    let runs = 0;
    fc.assert(
      fc.property(fc.integer(), (n) => {
        runs += 1;
        return n === n;
      }),
      fcParams(),
    );
    expect(runs).toBe(PROPERTY_RUNS);
  });

  it("provides a deterministic LINE Messaging API mock", () => {
    const line = createMockLineMessagingApi();
    const res = line.send({
      sendType: "push",
      to: "U123",
      messages: [{ type: "text", text: "hi" }],
      accessToken: "tok_test",
    });
    expect(res.ok).toBe(true);
    expect(line.callCount).toBe(1);

    line.setBehavior({ kind: "fail", status: 429, errorDetail: "rate_limited" });
    const fail = line.send({
      sendType: "reply",
      replyToken: "r1",
      messages: [],
      accessToken: "tok_test",
    });
    expect(fail.ok).toBe(false);
    expect(fail.errorDetail).toBe("rate_limited");
    expect(fail.errorDetail).not.toContain("tok_test");
  });

  it("provides a record_input_sync spy/stub", () => {
    const sync = createMockRecordInputSync();
    sync.recordInputSync("line", "BKK-SUK-01", { orders: 3 });
    expect(sync.callCount).toBe(1);
    expect(sync.calls[0]).toMatchObject({ syncSource: "line", siteCode: "BKK-SUK-01" });

    sync.setOutcome({ kind: "fail", reason: "downstream_unavailable" });
    expect(sync.recordInputSync("line", "BKK-SUK-01", {})).toEqual({
      kind: "fail",
      reason: "downstream_unavailable",
    });
  });
});
