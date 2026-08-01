import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("db-verify LINE outbound suite registration", () => {
  it("runs and reports line_outbound_claim_record in both fixed suite lists", () => {
    const workflow = readFileSync(
      new URL("../../../.github/workflows/db-verify.yml", import.meta.url),
      "utf8",
    );
    const runList = workflow.match(/for suite in([\s\S]*?); do/)?.[1];
    const evidenceList = workflow.match(
      /const suites = \[([\s\S]*?)\]\.map/,
    )?.[1];
    const lineOutboundTransaction = workflow.match(
      /if \[\[ "\$suite" == "line_outbound_claim_record" \]\]; then([\s\S]*?)\n\s*else/,
    )?.[1];

    expect(runList).toContain("line_outbound_claim_record");
    expect(evidenceList).toContain("'line_outbound_claim_record'");
    expect(lineOutboundTransaction).toContain('-c "begin;"');
  });

  it("runs the two-client race only under its explicit empty ephemeral-stack contract", () => {
    const workflow = readFileSync(
      new URL("../../../.github/workflows/db-verify.yml", import.meta.url),
      "utf8",
    );
    const harness = readFileSync(
      new URL(
        "../concurrency/claim-race.mjs",
        import.meta.url,
      ),
      "utf8",
    );

    expect(workflow).toContain("LINE_CLAIM_RACE_EPHEMERAL: \"1\"");
    expect(workflow).toContain(
      "node tests/line-oa-commerce/concurrency/claim-race.mjs",
    );
    expect(harness).toContain("LINE_CLAIM_RACE_EPHEMERAL");
    expect(harness).toMatch(/eligibleCount[\s\S]*status = 'pending'/);
    expect(harness).toContain("requires zero pre-existing eligible rows");
  });
});
