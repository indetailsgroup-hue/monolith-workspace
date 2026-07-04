/**
 * Spy/stub mock of `record_input_sync` (the forecasting pipeline) —
 * LINE OA Commerce (Module B5). Spec task: 1.1 (scaffold)
 *
 * The forecasting contract (`record_input_sync` writing the append-only
 * `forecast_input_sync_log`) is owned elsewhere and must NOT be redefined by
 * this module. For tests we use a spy/stub that records each invocation so we
 * can assert: `Sync_Source='line'`, the associated `site_code`, append-only
 * behavior, and failure handling — without touching the real pipeline.
 */

export interface RecordInputSyncCall {
  syncSource: string;
  siteCode: string;
  payload: unknown;
}

/** Configurable outcome so failure-path properties (Req 10.3) are testable. */
export type RecordInputSyncOutcome =
  | { kind: "ok" }
  | { kind: "fail"; reason: string };

export class MockRecordInputSync {
  private outcome: RecordInputSyncOutcome = { kind: "ok" };
  /** Append-only log of every call (mirrors the append-only sync log). */
  readonly calls: RecordInputSyncCall[] = [];

  setOutcome(outcome: RecordInputSyncOutcome): void {
    this.outcome = outcome;
  }

  get callCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls.length = 0;
    this.outcome = { kind: "ok" };
  }

  /**
   * Stub entrypoint mirroring `record_input_sync(Sync_Source, site_code, ...)`.
   * Records the call (spy) and returns the configured outcome (stub).
   */
  recordInputSync(
    syncSource: string,
    siteCode: string,
    payload: unknown,
  ): RecordInputSyncOutcome {
    this.calls.push({ syncSource, siteCode, payload });
    return this.outcome;
  }
}

export function createMockRecordInputSync(): MockRecordInputSync {
  return new MockRecordInputSync();
}
