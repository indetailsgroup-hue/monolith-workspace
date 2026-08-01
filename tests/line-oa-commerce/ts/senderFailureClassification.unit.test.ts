import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLineMessagingClient,
  createScrubbingLogger,
  processOutboundBatch,
  type ClaimedOutbound,
  type LineMessagingClient,
  type SenderDataAccess,
  type VaultTokenResolver,
} from "../../../supabase/functions/line-outbound-sender/index";

function row(overrides: Partial<ClaimedOutbound> = {}): ClaimedOutbound {
  return {
    outboundId: "ob-classify",
    conversationId: "conv-classify",
    sendType: "push",
    templateKey: "tpl-classify",
    slotValues: {},
    lineUserId: "U-classify",
    verticalContext: "monolith",
    channelAccessTokenRef: "token-ref",
    candidateTemplates: [{
      templateKey: "tpl-classify",
      verticalContext: "monolith",
      body: "hello",
      isActive: true,
    }],
    ...overrides,
  };
}

function capturingData(
  claimed: ClaimedOutbound,
  extras: Partial<SenderDataAccess> = {},
) {
  const failureClasses: Array<string | undefined> = [];
  const data: SenderDataAccess = {
    async claimPending() {
      return [claimed];
    },
    async recordResult(_id, _status, _detail, failureClass?: string) {
      failureClasses.push(failureClass);
    },
    ...extras,
  };
  return { data, failureClasses };
}

const resolvedVault: VaultTokenResolver = {
  resolveAccessToken: async () => "resolved-token",
};

const successfulLine: LineMessagingClient = {
  send: async () => ({ ok: true }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LINE outbound failure classification", () => {
  it.each([
    [400, "permanent"],
    [401, "permanent"],
    [409, "permanent"],
    [429, "transient"],
    [500, "transient"],
    [503, "transient"],
  ] as const)("classifies LINE HTTP %i as %s", async (status, expectedClass) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("LINE failure", { status })),
    );

    const outcome = await createLineMessagingClient().send(
      { endpoint: "push", to: "U-target", messages: [] },
      "resolved-token",
    );

    expect(outcome).toMatchObject({ ok: false, failureClass: expectedClass });
  });

  it("treats LINE retry-key replay acceptance as successful delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, {
        status: 409,
        headers: { "x-line-accepted-request-id": "accepted-request-id" },
      })),
    );

    const outcome = await createLineMessagingClient().send(
      {
        endpoint: "push",
        to: "U-target",
        messages: [],
        retryKey: "ob-replayed",
      },
      "resolved-token",
    );

    expect(outcome).toEqual({ ok: true });
  });

  it("records token, template, and media-signer failures as permanent", async () => {
    const cases: Array<{
      claimed: ClaimedOutbound;
      vault: VaultTokenResolver;
      extras?: Partial<SenderDataAccess>;
    }> = [
      {
        claimed: row({ outboundId: "ob-token" }),
        vault: { resolveAccessToken: async () => null },
      },
      {
        claimed: row({ outboundId: "ob-template", candidateTemplates: [] }),
        vault: resolvedVault,
      },
      {
        claimed: row({
          outboundId: "ob-enrichment",
          enrichmentFailure: "conversation_enrichment_missing",
        }),
        vault: resolvedVault,
      },
      {
        claimed: row({
          outboundId: "ob-media",
          slotValues: { media_path: "private/photo.jpg" },
          candidateTemplates: [{
            templateKey: "tpl-classify",
            verticalContext: "monolith",
            body: "",
            isActive: true,
            messageKind: "image",
          }],
        }),
        vault: resolvedVault,
      },
    ];

    for (const testCase of cases) {
      const { data, failureClasses } = capturingData(
        testCase.claimed,
        testCase.extras,
      );
      await processOutboundBatch(
        {
          data,
          vault: testCase.vault,
          line: successfulLine,
          logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
        },
        { batchSize: 1 },
      );
      expect(failureClasses, testCase.claimed.outboundId).toEqual(["permanent"]);
    }
  });

  it("records thrown network or timeout failures as transient", async () => {
    const { data, failureClasses } = capturingData(row());
    const networkFailure: LineMessagingClient = {
      send: async () => {
        throw new TypeError("fetch failed");
      },
    };

    await processOutboundBatch(
      {
        data,
        vault: resolvedVault,
        line: networkFailure,
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(failureClasses).toEqual(["transient"]);
  });

  it.each([
    {
      name: "Vault lookup exception",
      claimed: row({ outboundId: "ob-vault-operational" }),
      vault: {
        resolveAccessToken: async () => {
          throw new TypeError("vault fetch failed");
        },
      } satisfies VaultTokenResolver,
      extras: {},
    },
    {
      name: "media signing exception",
      claimed: row({
        outboundId: "ob-media-operational",
        slotValues: { media_path: "private/photo.jpg" },
        candidateTemplates: [{
          templateKey: "tpl-classify",
          verticalContext: "monolith",
          body: "",
          isActive: true,
          messageKind: "image",
        }],
      }),
      vault: resolvedVault,
      extras: {
        createSignedMediaUrl: async () => {
          throw new TypeError("storage fetch failed");
        },
      },
    },
    {
      name: "media signing response without a URL",
      claimed: row({
        outboundId: "ob-media-empty-response",
        slotValues: { media_path: "private/photo.jpg" },
        candidateTemplates: [{
          templateKey: "tpl-classify",
          verticalContext: "monolith",
          body: "",
          isActive: true,
          messageKind: "image",
        }],
      }),
      vault: resolvedVault,
      extras: { createSignedMediaUrl: async () => null },
    },
  ])("records $name as transient so the row can re-pend", async (testCase) => {
    const { data, failureClasses } = capturingData(
      testCase.claimed,
      testCase.extras,
    );

    const summary = await processOutboundBatch(
      {
        data,
        vault: testCase.vault,
        line: successfulLine,
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary.results[0]).toMatchObject({
      status: "failed",
      failureClass: "transient",
    });
    expect(failureClasses).toEqual(["transient"]);
  });
});
