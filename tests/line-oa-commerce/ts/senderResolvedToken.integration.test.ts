/**
 * Integration tests — line-outbound-sender resolves the Channel_Access_Token
 * from Vault and calls the LINE Messaging API using that resolved token, for
 * BOTH reply and push sends. LINE OA Commerce (Module B5). Spec task: 19.2.
 *
 * These are example-based integration tests (NOT a numbered property test):
 * they wire the real `processOutboundBatch` orchestration from
 * `supabase/functions/line-outbound-sender/index.ts` against
 *   * a mock {@link VaultTokenResolver} (so no real Vault / DB), and
 *   * the deterministic LINE Messaging API mock from `mocks/lineMessagingApi.ts`
 *     (so no network),
 * and assert that the token the sender hands to the LINE messaging client is
 * exactly the one the Vault resolver returned for the row's
 * `channelAccessTokenRef` — for a reply send and for a push send.
 *
 * Validates: Requirements 4.1 (reply uses the resolved token), 4.2 (push uses
 * the resolved token).
 *
 * Scope boundary: tests only. The implementation under test is exercised, not
 * modified.
 */

import { describe, it, expect } from "vitest";
import {
  processOutboundBatch,
  createScrubbingLogger,
  type ClaimedOutbound,
  type LineMessagingClient,
  type SenderDataAccess,
  type SenderDeps,
  type SendResultStatus,
  type VaultTokenResolver,
} from "../../../supabase/functions/line-outbound-sender/index";
import { MockLineMessagingApi } from "./mocks/lineMessagingApi";
import type { MessageTemplate } from "../../../supabase/functions/_shared/line-oa/templates";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Adapt the deterministic {@link MockLineMessagingApi} to the sender's
 * {@link LineMessagingClient} interface. The adapter forwards the resolved
 * `accessToken` straight through so the recorded call captures exactly the
 * token the sender chose to use (the key assertion for Req 4.1 / 4.2).
 */
function lineClientFromMock(mock: MockLineMessagingApi): LineMessagingClient {
  return {
    async send(request, accessToken) {
      const result = mock.send({
        sendType: request.endpoint,
        replyToken: request.endpoint === "reply" ? request.replyToken : undefined,
        to: request.endpoint === "push" ? request.to : undefined,
        messages: [...request.messages],
        accessToken,
      });
      return result.ok
        ? { ok: true }
        : { ok: false, errorDetail: result.errorDetail };
    },
  };
}

/**
 * A Vault resolver backed by a fixed `ref -> token` table. Records every ref it
 * is asked to resolve so tests can assert the sender resolved the row's token by
 * its reference (and never used a hard-coded value).
 */
function mockVault(table: Record<string, string>): VaultTokenResolver & {
  readonly resolvedRefs: string[];
} {
  const resolvedRefs: string[] = [];
  return {
    resolvedRefs,
    async resolveAccessToken(ref: string) {
      resolvedRefs.push(ref);
      return table[ref] ?? null;
    },
  };
}

/** Data-access double: serves a fixed batch and records the result calls. */
function mockData(rows: ClaimedOutbound[]): SenderDataAccess & {
  readonly recorded: Array<{
    outboundId: string;
    status: SendResultStatus;
    errorDetail: string | null;
  }>;
} {
  const recorded: Array<{
    outboundId: string;
    status: SendResultStatus;
    errorDetail: string | null;
  }> = [];
  return {
    recorded,
    async claimPending(limit: number) {
      return rows.slice(0, limit);
    },
    async recordResult(outboundId, status, errorDetail) {
      recorded.push({ outboundId, status, errorDetail });
    },
  };
}

/** An active, shared template whose body needs no slots (keeps render trivial). */
function activeTemplate(
  templateKey: string,
  verticalContext: string | null,
): MessageTemplate {
  return {
    templateKey,
    verticalContext,
    body: "Your order is ready.",
    isActive: true,
  };
}

/** Build a ClaimedOutbound row with sane defaults for these tests. */
function makeRow(overrides: Partial<ClaimedOutbound>): ClaimedOutbound {
  const verticalContext = overrides.verticalContext ?? "monolith";
  const templateKey = overrides.templateKey ?? "order_ready";
  return {
    outboundId: "ob-1",
    conversationId: "conv-1",
    sendType: "push",
    templateKey,
    slotValues: {},
    lineUserId: "U-line-user",
    verticalContext,
    channelAccessTokenRef: "ref-channel",
    candidateTemplates: [activeTemplate(templateKey, verticalContext)],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("line-outbound-sender — reply/push send via Vault-resolved token (mocked LINE API)", () => {
  it("sends a REPLY using the Channel_Access_Token resolved from Vault (Req 4.1)", async () => {
    const RESOLVED_TOKEN = "monolith-channel-access-token-aaaaaaaaaaaaaaaaaaaa";
    const line = new MockLineMessagingApi();
    const vault = mockVault({ "ref-monolith": RESOLVED_TOKEN });
    const data = mockData([
      makeRow({
        outboundId: "ob-reply",
        sendType: "reply",
        replyToken: "reply-token-xyz",
        verticalContext: "monolith",
        channelAccessTokenRef: "ref-monolith",
      }),
    ]);

    const deps: SenderDeps = {
      data,
      vault,
      line: lineClientFromMock(line),
      logger: createScrubbingLogger(),
    };

    const summary = await processOutboundBatch(deps, { batchSize: 10 });

    // The sender resolved the token by the row's Vault reference.
    expect(vault.resolvedRefs).toEqual(["ref-monolith"]);

    // Exactly one LINE call, a reply, carrying the resolved token.
    expect(line.callCount).toBe(1);
    const call = line.calls[0];
    expect(call.sendType).toBe("reply");
    expect(call.replyToken).toBe("reply-token-xyz");
    expect(call.accessToken).toBe(RESOLVED_TOKEN);

    // The send succeeded and was recorded as sent.
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(data.recorded).toEqual([
      { outboundId: "ob-reply", status: "sent", errorDetail: null },
    ]);
  });

  it("sends a PUSH using the Channel_Access_Token resolved from Vault (Req 4.2)", async () => {
    const RESOLVED_TOKEN = "tcck-channel-access-token-bbbbbbbbbbbbbbbbbbbbbbbb";
    const line = new MockLineMessagingApi();
    const vault = mockVault({ "ref-tcck": RESOLVED_TOKEN });
    const data = mockData([
      makeRow({
        outboundId: "ob-push",
        sendType: "push",
        lineUserId: "U-push-target",
        verticalContext: "tcck",
        channelAccessTokenRef: "ref-tcck",
      }),
    ]);

    const deps: SenderDeps = {
      data,
      vault,
      line: lineClientFromMock(line),
      logger: createScrubbingLogger(),
    };

    const summary = await processOutboundBatch(deps, { batchSize: 10 });

    expect(vault.resolvedRefs).toEqual(["ref-tcck"]);

    expect(line.callCount).toBe(1);
    const call = line.calls[0];
    expect(call.sendType).toBe("push");
    expect(call.to).toBe("U-push-target");
    expect(call.accessToken).toBe(RESOLVED_TOKEN);

    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(data.recorded).toEqual([
      { outboundId: "ob-push", status: "sent", errorDetail: null },
    ]);
  });

  it("a reply row with no usable reply token falls back to PUSH, still using the resolved token (Req 4.2/4.5)", async () => {
    const RESOLVED_TOKEN = "fallback-channel-access-token-cccccccccccccccccccc";
    const line = new MockLineMessagingApi();
    const vault = mockVault({ "ref-fallback": RESOLVED_TOKEN });
    const data = mockData([
      makeRow({
        outboundId: "ob-fallback",
        sendType: "reply",
        replyToken: undefined, // unavailable → push fallback
        lineUserId: "U-fallback",
        channelAccessTokenRef: "ref-fallback",
      }),
    ]);

    const deps: SenderDeps = {
      data,
      vault,
      line: lineClientFromMock(line),
      logger: createScrubbingLogger(),
    };

    await processOutboundBatch(deps, { batchSize: 10 });

    expect(line.callCount).toBe(1);
    const call = line.calls[0];
    expect(call.sendType).toBe("push");
    expect(call.to).toBe("U-fallback");
    expect(call.accessToken).toBe(RESOLVED_TOKEN);
  });

  it("resolves a DISTINCT token per channel reference across reply and push in one batch (Req 4.1/4.2)", async () => {
    const REPLY_TOKEN_SECRET = "monolith-token-dddddddddddddddddddddddddddddddd";
    const PUSH_TOKEN_SECRET = "tcck-token-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const line = new MockLineMessagingApi();
    const vault = mockVault({
      "ref-monolith": REPLY_TOKEN_SECRET,
      "ref-tcck": PUSH_TOKEN_SECRET,
    });
    const data = mockData([
      makeRow({
        outboundId: "ob-reply",
        sendType: "reply",
        replyToken: "rt-1",
        verticalContext: "monolith",
        channelAccessTokenRef: "ref-monolith",
      }),
      makeRow({
        outboundId: "ob-push",
        sendType: "push",
        lineUserId: "U-push",
        verticalContext: "tcck",
        channelAccessTokenRef: "ref-tcck",
      }),
    ]);

    const deps: SenderDeps = {
      data,
      vault,
      line: lineClientFromMock(line),
      logger: createScrubbingLogger(),
    };

    const summary = await processOutboundBatch(deps, { batchSize: 10 });

    expect(summary).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
    expect(line.callCount).toBe(2);

    const replyCall = line.calls.find((c) => c.sendType === "reply");
    const pushCall = line.calls.find((c) => c.sendType === "push");

    // Each send used the token resolved for ITS OWN channel reference.
    expect(replyCall?.accessToken).toBe(REPLY_TOKEN_SECRET);
    expect(pushCall?.accessToken).toBe(PUSH_TOKEN_SECRET);
    // Tokens are not crossed between channels.
    expect(replyCall?.accessToken).not.toBe(pushCall?.accessToken);
  });
});
