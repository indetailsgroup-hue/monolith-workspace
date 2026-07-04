/**
 * Integration test — line-outbound-sender claim-and-record wiring (mocked LINE API).
 * LINE OA Commerce (Module B5). Spec task: 19.4.
 *
 * Requirements: 4.4 (a reported failure is recorded as `failed` and never marked
 * delivered) and 4.6 (the resolved Channel_Access_Token never appears in any log
 * line or error message — including on the failure path where the LINE error
 * echoes the token).
 *
 * This is an INTEGRATION test (not a numbered property test): it exercises the
 * real `processOutboundBatch` orchestration wired to test doubles so no network
 * or database is touched —
 *   * a spy {@link SenderDataAccess} (records `claimPending`/`recordResult`),
 *   * a mock {@link VaultTokenResolver} that returns a fixed token,
 *   * the deterministic LINE Messaging API mock (`MockLineMessagingApi`) wrapped
 *     in a {@link LineMessagingClient} adapter so we can drive ok/fail outcomes
 *     and assert the token was passed through, and
 *   * the production scrubbing logger (`createScrubbingLogger`) pointed at a
 *     capturing sink so we can assert nothing leaks.
 *
 * What we verify:
 *   1. A pending row is claimed and processed (claimPending invoked with the
 *      batch size; the LINE client is called once per claimed row).
 *   2. `recordResult` marks the row `sent` on a successful LINE send and
 *      `failed` (with a non-empty error detail) on a failed send — driven by the
 *      mock LINE client (Req 4.4).
 *   3. The resolved token never appears in the captured log output, on either
 *      the success or the failure path — even when the LINE error detail echoes
 *      the token verbatim (Req 4.6).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  processOutboundBatch,
  createScrubbingLogger,
  type SenderDataAccess,
  type VaultTokenResolver,
  type LineMessagingClient,
  type LineSendRequest,
  type LineSendOutcome,
  type ClaimedOutbound,
  type SendResultStatus,
} from "../../../supabase/functions/line-outbound-sender/index";
import {
  MockLineMessagingApi,
  type LineSendType,
} from "./mocks/lineMessagingApi";

/**
 * A long, opaque, token-shaped value so the scrubbing logger's defensive
 * "long base64-ish run" rule and the explicit registered-secret rule both have
 * something realistic to redact.
 */
const RESOLVED_TOKEN =
  "channelAccessToken_0123456789ABCDEFabcdef0123456789ABCDEFabcdef+/=";

/** Build a claimable pending row bound to an active template that renders cleanly. */
function pendingRow(overrides: Partial<ClaimedOutbound> = {}): ClaimedOutbound {
  return {
    outboundId: "ob-1",
    conversationId: "conv-1",
    sendType: "push",
    templateKey: "order_ready",
    slotValues: { order_id: "A1" },
    lineUserId: "Uabc123",
    verticalContext: "tcck",
    channelAccessTokenRef: "vault://tcck/access_token",
    candidateTemplates: [
      {
        templateKey: "order_ready",
        verticalContext: "tcck",
        body: "Your order {{order_id}} is ready.",
        isActive: true,
      },
    ],
    ...overrides,
  };
}

/** A spy SenderDataAccess: returns the configured rows and records every call. */
class SpyDataAccess implements SenderDataAccess {
  claimCalls: number[] = [];
  recordCalls: Array<{
    outboundId: string;
    status: SendResultStatus;
    errorDetail: string | null;
  }> = [];

  constructor(private readonly rows: ClaimedOutbound[]) {}

  claimPending(limit: number): Promise<ClaimedOutbound[]> {
    this.claimCalls.push(limit);
    return Promise.resolve(this.rows);
  }

  recordResult(
    outboundId: string,
    status: SendResultStatus,
    errorDetail: string | null,
  ): Promise<void> {
    this.recordCalls.push({ outboundId, status, errorDetail });
    return Promise.resolve();
  }
}

/** A mock VaultTokenResolver that always returns the fixed resolved token. */
const fixedTokenVault: VaultTokenResolver = {
  resolveAccessToken: () => Promise.resolve(RESOLVED_TOKEN),
};

/**
 * Adapter that wraps the deterministic LINE mock as a {@link LineMessagingClient}.
 * It forwards the resolved `accessToken` into the mock (so we can assert it was
 * passed through) and maps the mock's result to the sender's outcome shape.
 */
function clientFromMock(mock: MockLineMessagingApi): LineMessagingClient {
  return {
    send(request: LineSendRequest, accessToken: string): Promise<LineSendOutcome> {
      const sendType: LineSendType = request.endpoint;
      const res = mock.send({
        sendType,
        replyToken: request.endpoint === "reply" ? request.replyToken : undefined,
        to: request.endpoint === "push" ? request.to : undefined,
        messages: [...request.messages],
        accessToken,
      });
      return Promise.resolve(
        res.ok ? { ok: true } : { ok: false, errorDetail: res.errorDetail },
      );
    },
  };
}

/** A capturing sink + the production scrubbing logger built on top of it. */
function capturingLogger() {
  const lines: string[] = [];
  const logger = createScrubbingLogger({
    info: (m) => lines.push(m),
    error: (m) => lines.push(m),
  });
  return { logger, lines };
}

describe("line-outbound-sender claim-and-record wiring (mocked LINE API)", () => {
  let line: MockLineMessagingApi;

  beforeEach(() => {
    line = new MockLineMessagingApi();
  });

  it("claims a pending row, sends via LINE with the resolved token, and records it as sent", async () => {
    const data = new SpyDataAccess([pendingRow()]);
    const { logger, lines } = capturingLogger();

    const summary = await processOutboundBatch(
      { data, vault: fixedTokenVault, line: clientFromMock(line), logger },
      { batchSize: 25 },
    );

    // 1. The pending row was claimed and processed.
    expect(data.claimCalls).toEqual([25]);
    expect(line.callCount).toBe(1);
    // The resolved token was passed through to the LINE call (Req 4.1/4.2 wiring).
    expect(line.calls[0].accessToken).toBe(RESOLVED_TOKEN);

    // 2. recordResult marked the row sent with no error detail.
    expect(data.recordCalls).toEqual([
      { outboundId: "ob-1", status: "sent", errorDetail: null },
    ]);
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });

    // 3. No log line contains the resolved token.
    const log = lines.join("\n");
    expect(log).not.toContain(RESOLVED_TOKEN);
  });

  it("records a failed send (never marked sent) and keeps the token out of logs even when the error echoes it", async () => {
    const data = new SpyDataAccess([pendingRow()]);
    const { logger, lines } = capturingLogger();

    // Drive a failure whose error detail VERBATIM echoes the resolved token —
    // the worst case for secret hygiene (Req 4.6 failure path).
    line.setBehavior({
      kind: "fail",
      status: 401,
      errorDetail: `LINE auth rejected for Bearer ${RESOLVED_TOKEN}`,
    });

    const summary = await processOutboundBatch(
      { data, vault: fixedTokenVault, line: clientFromMock(line), logger },
      { batchSize: 10 },
    );

    // 1. The row was claimed and the LINE client was invoked.
    expect(data.claimCalls).toEqual([10]);
    expect(line.callCount).toBe(1);

    // 2. recordResult marked the row failed with a non-empty error detail and
    //    never sent (Req 4.4).
    expect(data.recordCalls).toHaveLength(1);
    const recorded = data.recordCalls[0];
    expect(recorded.outboundId).toBe("ob-1");
    expect(recorded.status).toBe("failed");
    expect(recorded.errorDetail).toBeTruthy();
    expect(recorded.errorDetail).not.toBe("");
    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 1 });

    // 3a. The persisted error detail must not leak the raw token (it is scrubbed
    //     before being handed to recordResult).
    expect(recorded.errorDetail ?? "").not.toContain(RESOLVED_TOKEN);

    // 3b. No captured log line contains the resolved token, on the failure path.
    const log = lines.join("\n");
    expect(log).not.toContain(RESOLVED_TOKEN);
  });

  it("processes every claimed row and records a terminal status for each", async () => {
    const rows = [
      pendingRow({ outboundId: "ob-1", slotValues: { order_id: "A1" } }),
      pendingRow({ outboundId: "ob-2", slotValues: { order_id: "B2" } }),
      pendingRow({ outboundId: "ob-3", slotValues: { order_id: "C3" } }),
    ];
    const data = new SpyDataAccess(rows);
    const { logger, lines } = capturingLogger();

    const summary = await processOutboundBatch(
      { data, vault: fixedTokenVault, line: clientFromMock(line), logger },
      { batchSize: 25 },
    );

    expect(line.callCount).toBe(3);
    expect(summary).toMatchObject({ claimed: 3, sent: 3, failed: 0 });
    // Each claimed row terminates in exactly one recorded result.
    expect(data.recordCalls.map((c) => c.outboundId).sort()).toEqual([
      "ob-1",
      "ob-2",
      "ob-3",
    ]);
    expect(data.recordCalls.every((c) => c.status === "sent")).toBe(true);

    // Every call carried the resolved token; none of it leaked into logs.
    expect(line.calls.every((c) => c.accessToken === RESOLVED_TOKEN)).toBe(true);
    expect(lines.join("\n")).not.toContain(RESOLVED_TOKEN);
  });
});
