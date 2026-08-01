import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("line-outbound-sender production claim wiring", () => {
  it("claims rows through rpc_claim_line_outbound_batch instead of an unlocked table SELECT", () => {
    const source = readFileSync(
      new URL(
        "../../../supabase/functions/line-outbound-sender/index.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const claimBody = source.match(
      /async claimPending\(limit\)[\s\S]*?\n\s*async recordResult/,
    )?.[0];

    expect(claimBody).toBeDefined();
    expect(claimBody).toMatch(
      /client\.rpc\(\s*"rpc_claim_line_outbound_batch"/,
    );
    expect(claimBody).not.toContain(
      '.from("line_oa_outbound_messages")',
    );
    expect(claimBody).toMatch(
      /if \(!isGroup && \(!convo\?\.line_user_id \|\| !convo\.vertical_context\)\)/,
    );
  });
});
