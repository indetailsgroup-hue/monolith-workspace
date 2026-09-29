# Changelog

## [14.6.0] – 2026-08-28

### Added

#### `scripts/staging_validate_0193.sh` — Full-Health-Summary Staging Validation Script

End-to-end staging validation for Migration 0193 (`v_etax_full_health_summary`).
Covers eleven sections with `--dry-run` and `--no-vitest` flags for CI compatibility.

**Sections:**
- **§1 Prerequisites** — verifies `psql` and `python3` binaries present; validates
  `DB_URL` environment variable; tests live DB connection; asserts superuser role.
- **§2 Schema** — confirms `v_etax_full_health_summary` exists with all 29 expected
  columns; confirms both RPCs (`rpc_etax_full_health_summary`,
  `rpc_etax_full_health_summary_admin`) are registered; verifies both dependency
  materialized views (`mv_etax_compliance_dashboard`, `mv_etax_health_trend`) are
  present.
- **§3 Permissions** — asserts `authenticated` role has no direct `SELECT` on the
  view; asserts `service_role` has `SELECT`; asserts `authenticated` can `EXECUTE`
  the standard RPC; asserts `service_role` can `EXECUTE` the admin RPC; confirms
  both functions carry `SECURITY DEFINER`.
- **§4 Seed** — inserts Scenario B: 5 `submitted` + 5 `failed` submissions today for
  Org A (`test_tag = 'staging_validate_0193'`); inserts a distinct Org B row for
  isolation verification; records seed timestamps for cleanup.
- **§5 MV Refresh** — calls `fn_refresh_etax_compliance_mv('test')` and
  `fn_refresh_etax_health_trend_mv('test')`; verifies each function wrote a row to
  its respective refresh-log table (`etax_compliance_mv_refresh_log`,
  `etax_health_trend_mv_refresh_log`); confirms Org A appears in both MVs after
  refresh.
- **§6 Formula Accuracy** — reads raw MV inputs for Org A; runs a Python 3 mirror
  of the SQL formula:
  ```
  GREATEST(0, LEAST(100,
    100
    − ROUND((100 − compliance_success_rate) × 0.40)
    − ROUND(today_retry_exhaustion_rate_pct × 0.30)
    − LEAST(overdue_with_pending_etax × 2, 20)
    − LEAST(failed_last_24h, 10)
  ))
  ```
  Uses banker's rounding (`round()` in Python 3) to match PostgreSQL `ROUND()`.
  Compares computed score against `health_score` returned by the view.
  Additionally runs 8 synthetic boundary spot-checks via psql `WITH` clause:
  perfect score (100), full failure (0), overdue cap at 20, `failed_last_24h` cap
  at 10, and boundary scores 80, 79, 50, 49.
- **§7 Threshold Boundaries** — verifies the seeded Org A `health_status` label
  matches the expected status derived from `health_score`; executes 8 SQL `CASE`
  boundary assertions (`≥80 → healthy`, `79 → warning`, `≥50 → warning`,
  `49 → critical`, `0 → critical`); inline label check for scores 80, 79, 50, 49.
- **§8 Org Isolation** — confirms Org A `total_submissions` in the view matches the
  seeded count; confirms Org B count is distinct from Org A and does not bleed into
  Org A's row.
- **§9 Admin RPC Smoke-Test** — invokes `rpc_etax_full_health_summary_admin` via
  REST (`SUPABASE_URL` + `SERVICE_ROLE_KEY`) if available, with psql fallback;
  asserts `health_score` and `health_status` columns present; asserts ASC ordering
  is stable; asserts `p_org_id` filter scopes result to one org.
- **§10 Freshness Summary** — prints the current state of `v_mv_refresh_lag`,
  `v_mv_health_trend_lag`, and the top 5 rows of `v_etax_full_health_summary` for
  operator review.
- **§11 CI Vitest** — (skippable via `--no-vitest`) runs
  `vitest run src/__tests__/rls/0193_etax_full_health_summary.test.ts` and exits
  non-zero on failure.
- **Cleanup** — deletes `etax_submissions` rows tagged
  `test_tag = 'staging_validate_0193'`; deletes refresh-log rows with
  `triggered_by = 'test'` created in the last hour.

**Flags:**
- `--dry-run` — prints all check steps with mock pass/fail values without
  connecting to a real database; suitable for CI pre-flight and local review.
- `--no-vitest` — skips §11; useful when running only infrastructure checks without
  a Node.js/Vitest environment.

---

#### `src/__tests__/rls/0192_0193_integration.test.ts` — MV + Full-Health-Summary Integration Test Suite

Combined integration test suite covering the full data path from raw `etax_submissions`
through `mv_etax_compliance_dashboard` and `mv_etax_health_trend` into
`v_etax_full_health_summary`. **50 tests across 7 groups.**

**Group A — Full Pipeline Data Accuracy (6 tests)**
1. Submitted submissions appear in `mv_etax_compliance_dashboard` after refresh.
2. Today's submissions appear in `mv_etax_health_trend` with `day_rank = 1`.
3. Summary row exists in `v_etax_full_health_summary` after both MVs are refreshed.
4. `total_submissions` in summary matches compliance MV value.
5. `today_daily_total` in summary matches trend MV `daily_total` for `day_rank = 1`.
6. Both `compliance_mv_last_refreshed_at` and `trend_mv_last_refreshed_at` are
   populated in the same summary row.

**Group B — health_score End-to-End Formula (9 tests)**
1. 10 submitted / 0 failed → `health_score = 100`.
2. 5 submitted / 5 failed → `health_score = 75` (formula verified via JS mirror).
3. All-failed submission set → score degrades gracefully (≥ 0).
4. Score never drops below 0.
5. Score never exceeds 100.
6. Overdue submissions capped at 20 penalty points.
7. `failed_last_24h` capped at 10 penalty points.
8. `compliance_success_rate` in summary matches the value in compliance MV.
9. `health_score` is deterministic across double-refresh.

**Group C — health_status Threshold Boundaries (8 tests)**
1. Score 100 → `healthy`.
2. Score 80 → `healthy` (lower boundary).
3. Score 79 → `warning`.
4. Score 50 → `warning` (lower boundary).
5. Score 49 → `critical`.
6. Score 0 → `critical`.
7. View label matches `calcHealthStatus()` JS helper for all computed scores.
8. Admin RPC ordering has no label inversion across orgs.

**Group D — Multi-Org Isolation (8 tests)**
1. Org A data does not appear in Org B's compliance MV row.
2. Org A data does not appear in Org B's trend MV row.
3. Org A and Org B have separate rows in `v_etax_full_health_summary`.
4. Totals are not conflated across orgs.
5. Authenticated `rpc_etax_full_health_summary()` returns only the caller's org.
6. Admin `p_org_id` filter scopes result to exactly one org.
7. Org B caller cannot read Org A summary row.
8. Good-org and bad-org scores are distinct and correct.

**Group E — MV Staleness and Refresh Sequencing (7 tests)**
1. `compliance_mv_last_refreshed_at` advances after re-refresh.
2. `trend_mv_last_refreshed_at` advances after re-refresh.
3. New submission is NOT visible in summary before refresh.
4. New submission IS visible in summary after refresh.
5. `health_score` decreases after injecting failures.
6. `health_score` improves after resolving failures and re-refreshing.
7. Both timestamps are populated in the same summary row after a joint refresh.

**Group F — LEFT JOIN Behaviour (6 tests)**
1. Org with compliance data but no today trend row still appears in summary.
2. `today_daily_total` is `NULL` when no trend row exists for `day_rank = 1`.
3. `health_score` degrades gracefully when `retry_exhaustion_rate_pct` is NULL
   (treated as 0).
4. `today_daily_total` is populated after seeding today's submissions and refreshing
   the trend MV.
5. `compliance_mv_last_refreshed_at` is present even when trend row is absent.
6. `day_rank = 1` row is the most recent day's data.

**Group G — Refresh Log Integrity (6 tests)**
1. Compliance-only refresh advances only `compliance_mv_last_refreshed_at`.
2. Trend-only refresh advances only `trend_mv_last_refreshed_at`.
3. Multiple sequential refreshes do not corrupt the computed score.
4. Compliance refresh log `row_count` matches actual MV row count.
5. Trend refresh log `row_count` matches actual MV row count.
6. Admin RPC handles an org with no submissions gracefully (no panic, no row).

**Key helpers:** `createTestOrg`, `createAuthUser`, `getOrCreateInvoice`,
`seedSubmission(orgId, status, daysAgo, hourOffset)`, `refreshComplianceMV`,
`refreshTrendMV`, `refreshBothMVs`, `ensureRefreshLogs`, `getSummaryRow`,
`callRpcSummary`, `callRpcSummaryAdmin`, `calcHealthScore` (JS mirror of SQL formula),
`calcHealthStatus`.

---

### Notes

- **Banker's rounding:** both `staging_validate_0193.sh` (Python 3 `round()`) and
  `0192_0193_integration.test.ts` (`calcHealthScore`) mirror PostgreSQL's `ROUND()`
  behaviour (round-half-to-even) to avoid false formula mismatches.
- **CROSS JOIN refresh-log prerequisite:** `v_etax_full_health_summary` uses a
  `CROSS JOIN` against both refresh-log tables; if either table has zero rows, the
  view returns no data. Both the staging script (§5) and the integration tests
  (Group G) explicitly verify this prerequisite before asserting summary rows.
- **LEFT JOIN design:** orgs that have compliance data but no `day_rank = 1` trend
  entry still appear in the summary view (Group F). Downstream consumers must treat
  `today_daily_total`, `today_retry_exhaustion_rate_pct`, and related trend columns
  as nullable.
- **Cleanup isolation:** all seed data is tagged (`test_tag = 'staging_validate_0193'`
  in the staging script; `afterAll` blocks in the integration test) to prevent
  interference with production or other test runs.
