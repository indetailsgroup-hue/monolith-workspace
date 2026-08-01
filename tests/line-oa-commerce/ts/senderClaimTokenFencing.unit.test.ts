import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createScrubbingLogger,
  processOutboundBatch,
  type ClaimedOutbound,
  type SenderDataAccess,
} from "../../../supabase/functions/line-outbound-sender/index";

describe("line-outbound-sender claim-token fencing", () => {
  it("passes the token received with a claimed row to recordResult", async () => {
    const claimed = {
      outboundId: "ob-fenced",
      conversationId: "conv-fenced",
      sendType: "push",
      templateKey: "tpl-fenced",
      slotValues: {},
      lineUserId: "U-fenced",
      verticalContext: "monolith",
      channelAccessTokenRef: "token-ref",
      candidateTemplates: [{
        templateKey: "tpl-fenced",
        verticalContext: "monolith",
        body: "hello",
        isActive: true,
      }],
      claimToken: "11111111-1111-4111-8111-111111111111",
    } as ClaimedOutbound;
    const recordedTokens: Array<string | undefined> = [];
    const data: SenderDataAccess = {
      claimPending: async () => [claimed],
      recordResult: async (
        _id,
        _status,
        _detail,
        _failureClass,
        claimToken?: string,
      ) => {
        recordedTokens.push(claimToken);
      },
    };

    await processOutboundBatch(
      {
        data,
        vault: { resolveAccessToken: async () => "resolved-token" },
        line: { send: async () => ({ ok: true }) },
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(recordedTokens).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("maps claim_token from the claim RPC and sends it back to the record RPC", () => {
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
    const recordBody = source.match(
      /async recordResult\([\s\S]*?\n\s*\/\/ 0134/,
    )?.[0];

    expect(claimBody).toMatch(/claimToken:\s*r\.claim_token/);
    expect(recordBody).toMatch(/p_claim_token:\s*claimToken/);
  });

  it("does not count a fenced recorded=false result as sent", async () => {
    const claimed = {
      outboundId: "ob-stale-worker",
      conversationId: "conv-fenced",
      sendType: "push",
      templateKey: "tpl-fenced",
      slotValues: {},
      lineUserId: "U-fenced",
      verticalContext: "monolith",
      channelAccessTokenRef: "token-ref",
      candidateTemplates: [{
        templateKey: "tpl-fenced",
        verticalContext: "monolith",
        body: "hello",
        isActive: true,
      }],
      claimToken: "11111111-1111-4111-8111-111111111111",
    } as ClaimedOutbound;
    const summary = await processOutboundBatch(
      {
        data: {
          claimPending: async () => [claimed],
          recordResult: async () => false,
        },
        vault: { resolveAccessToken: async () => "resolved-token" },
        line: { send: async () => ({ ok: true }) },
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 0 });
  });
});
