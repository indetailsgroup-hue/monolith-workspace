import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLineRequest,
  createLineMessagingClient,
  type ClaimedOutbound,
} from "../../../supabase/functions/line-outbound-sender/index";

function row(overrides: Partial<ClaimedOutbound> = {}): ClaimedOutbound {
  return {
    outboundId: "ob-retry-key",
    conversationId: "conv-retry-key",
    sendType: "push",
    templateKey: "tpl-retry-key",
    slotValues: {},
    lineUserId: "U-retry-key",
    verticalContext: "monolith",
    channelAccessTokenRef: "token-ref",
    candidateTemplates: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LINE push retry-key header", () => {
  it("sets X-Line-Retry-Key to the outbound row id for push", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const request = buildLineRequest(row(), "hello");

    await createLineMessagingClient().send(request, "resolved-token");

    expect(request).toMatchObject({
      endpoint: "push",
      retryKey: "ob-retry-key",
    });
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      "X-Line-Retry-Key": "ob-retry-key",
    });
  });

  it("does not set X-Line-Retry-Key on the single-use reply endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const request = buildLineRequest(
      row({ sendType: "reply", replyToken: "reply-token" }),
      "hello",
    );

    await createLineMessagingClient().send(request, "resolved-token");

    expect(request.endpoint).toBe("reply");
    expect(fetchSpy.mock.calls[0][1]?.headers).not.toHaveProperty(
      "X-Line-Retry-Key",
    );
  });
});
