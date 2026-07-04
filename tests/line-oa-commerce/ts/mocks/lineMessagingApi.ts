/**
 * Deterministic mock of the LINE Messaging API — LINE OA Commerce (Module B5).
 * Spec task: 1.1 (scaffold)
 *
 * Property-based and integration tests must never hit the real LINE Messaging
 * API. This mock is fully deterministic: given the same inputs and the same
 * configured behavior it always returns the same result, and it records every
 * call so tests can assert on them.
 *
 * It also doubles as a secret-hygiene probe: it captures the access token it was
 * called with so tests can assert the token is correctly resolved while
 * confirming it never leaks into logs/audit elsewhere.
 */

export type LineSendType = "reply" | "push";

export interface LineSendRequest {
  sendType: LineSendType;
  /** reply token (reply) — undefined/empty signals unavailable/expired. */
  replyToken?: string;
  to?: string;
  messages: unknown[];
  /** Access token the caller resolved (used only to assert resolution/scrubbing). */
  accessToken: string;
}

export interface LineSendResult {
  ok: boolean;
  status: number;
  /** Populated on failure; never contains the access token. */
  errorDetail?: string;
}

/** How the mock should respond. Deterministic and fully caller-controlled. */
export type MockBehavior =
  | { kind: "ok" }
  | { kind: "fail"; status: number; errorDetail: string };

export class MockLineMessagingApi {
  private behavior: MockBehavior = { kind: "ok" };
  readonly calls: LineSendRequest[] = [];

  /** Configure the deterministic response for subsequent calls. */
  setBehavior(behavior: MockBehavior): void {
    this.behavior = behavior;
  }

  /** Number of times the API was invoked. */
  get callCount(): number {
    return this.calls.length;
  }

  /** Reset recorded calls and behavior to defaults. */
  reset(): void {
    this.calls.length = 0;
    this.behavior = { kind: "ok" };
  }

  /** Deterministic send. Records the call, then returns the configured result. */
  send(req: LineSendRequest): LineSendResult {
    this.calls.push(req);
    if (this.behavior.kind === "fail") {
      return {
        ok: false,
        status: this.behavior.status,
        errorDetail: this.behavior.errorDetail,
      };
    }
    return { ok: true, status: 200 };
  }
}

/** Convenience factory for a fresh deterministic mock. */
export function createMockLineMessagingApi(): MockLineMessagingApi {
  return new MockLineMessagingApi();
}
