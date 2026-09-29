# CHANGELOG — Monolith Manufacturing OS

## [14.5.0] – 2026-08-28

### Migration 0193 — `v_etax_full_health_summary` (Full Health Summary View)

**File:** `supabase/migrations/0193_etax_full_health_summary.sql`
**Branch:** `feat/accounting-rls-multibook`
**Commit:** `66d89bd47e10`

#### Overview

Migration 0193 introduces `v_etax_full_health_summary`, a unified per-organisation health snapshot that joins the materialized compliance data from `mv_etax_compliance_dashboard` (Migration 0187) with the daily trend data from `mv_etax_health_trend` (Migration 0192). The view produces a single composite `health_score` (0–100) and a categorical `health_status` label for each organisation, enabling dashboards, alerting pipelines, and admin oversight tools to consume a single authoritative health signal rather than aggregating across multiple views.

#### New Objects

| Object | Type | Description |
|--------|------|-------------|
| `v_etax_full_health_summary` | View | Per-org composite health snapshot — compliance + today's trend |
| `rpc_etax_full_health_summary()` | Function | Authenticated, single-org snapshot; OWNER/ADMIN/FINANCE only |
| `rpc_etax_full_health_summary_admin(p_org_id UUID DEFAULT NULL)` | Function | Service-role-only cross-org view ordered by health_score ASC |

#### View Design

`v_etax_full_health_summary` is built on a LEFT JOIN strategy:

- **Anchor:** `mv_etax_compliance_dashboard` — provides compliance totals, PDF success, failure counts, overdue signals, and audit timestamps.
- **Today's trend:** `mv_etax_health_trend` joined on `(org_id, day_rank = 1)` — provides the most-recent day's `retry_exhaustion_rate_pct` and `success_rate_pct`. When the trend MV has no row for today (e.g. on first deploy before a cron run), the LEFT JOIN returns NULL for trend columns and the health_score formula degrades gracefully to compliance-only inputs.
- **Prerequisite guard:** Both `etax_compliance_mv_refresh_log` and `etax_health_trend_mv_refresh_log` are CROSS JOINed via a `(SELECT 1 FROM … LIMIT 1)` subquery. If either table contains zero rows — meaning the corresponding MV has never been refreshed — the CROSS JOIN produces an empty result, making the view return no rows rather than stale or misleading data. This is a deliberate safety rail that prevents the health score from being computed against an uninitialised MV.

#### `health_score` Formula

```sql
health_score = GREATEST(0, LEAST(100,
    100
    - ROUND((100 - compliance_success_rate) * 0.40)
    - ROUND(today_retry_exhaustion_rate_pct       * 0.30)
    - LEAST(overdue_with_pending_etax * 2, 20)
    - LEAST(failed_last_24h, 10)
))
```

**Component weights and rationale:**

| Component | Weight | Cap | Rationale |
|-----------|--------|-----|-----------|
| `(100 − compliance_success_rate) × 0.40` | 40% | — | Historical submission success is the primary long-term signal; a 10-point drop in success rate costs 4 score points |
| `today_retry_exhaustion_rate_pct × 0.30` | 30% | — | Today's retry exhaustion signals acute pipeline stress; high exhaustion today disproportionately degrades the score |
| `overdue_with_pending_etax × 2` | up to 20 | 20 | Each overdue invoice with a pending eTax job represents a compliance liability; capped at 20 to prevent a single burst of overdues from collapsing an otherwise healthy score |
| `failed_last_24h` | 1 pt each | 10 | Recent individual failures add a recency penalty capped at 10; avoids over-penalising transient failures |

The formula is intentionally integer-typed (ROUND, GREATEST, LEAST all return integer when inputs are integer). Callers should treat `health_score` as an integer in `[0, 100]`.

#### `health_status` Labels

| Label | Condition | Intended Use |
|-------|-----------|-------------|
| `'healthy'` | `health_score >= 80` | No action required |
| `'warning'` | `50 <= health_score < 80` | Monitor; investigate pending failures |
| `'critical'` | `health_score < 50` | Immediate intervention required |

#### Full Column List (`v_etax_full_health_summary`)

```
org_id, org_name,
total_submissions, submitted_count, failed_count, cancelled_count,
queued_count, submitting_count,
compliance_success_rate, avg_attempt_count, max_attempt_count,
submissions_with_pdf_downloaded, pdf_success_rate,
last_submission_at, last_failed_at, oldest_unresolved_failed_at,
failed_last_24h, last_audit_event_at,
overdue_invoice_count, overdue_with_pending_etax,
today_daily_total, today_daily_submitted, today_daily_failed,
today_daily_exhausted, today_retry_exhaustion_rate_pct,
today_success_rate_pct,
health_score, health_status,
compliance_mv_last_refreshed_at, trend_mv_last_refreshed_at
```

#### RPC Access Design

| RPC | Caller | Role Guard | On Violation |
|-----|--------|-----------|-------------|
| `rpc_etax_full_health_summary()` | `authenticated` | `OWNER`, `ADMIN`, `FINANCE` | raises `P0001` (permission denied) |
| `rpc_etax_full_health_summary_admin(p_org_id)` | `service_role` | `current_setting('role') = 'service_role'` check | raises `EXCEPTION` (not empty set) |

`rpc_etax_full_health_summary_admin` raises an `EXCEPTION` (not returns an empty result set) when called by a non-service_role caller. This is intentional: the admin RPC is not a graceful-degradation endpoint; it is a privileged internal surface, and a hard exception makes misconfiguration immediately visible rather than silently returning an empty list.

#### GRANT Design

```sql
GRANT SELECT ON v_etax_full_health_summary TO service_role;
GRANT EXECUTE ON FUNCTION rpc_etax_full_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_etax_full_health_summary_admin(UUID) TO service_role;
REVOKE ALL ON v_etax_full_health_summary FROM authenticated;
REVOKE ALL ON v_etax_full_health_summary FROM anon;
```

`authenticated` has no direct SELECT on the underlying view; all access flows through the `SECURITY DEFINER` RPCs, which enforce org-scoping and role checks before querying.

#### Inline Verification Block

Migration 0193 ends with a `DO $$ … $$` block that:
1. Asserts all six expected columns are present on `v_etax_full_health_summary` via `information_schema.columns`.
2. Asserts both RPC functions exist in `pg_proc`.
3. Asserts `SELECT` is NOT granted to `authenticated` on the view.
4. Raises `EXCEPTION` with a descriptive message if any assertion fails, ensuring the migration is rolled back cleanly on misconfiguration.

---

### Test Suite — `0192_mv_etax_health_trend.test.ts`

**File:** `src/__tests__/rls/0192_mv_etax_health_trend.test.ts`
**Lines:** 959 | **Groups:** A–G | **Tests:** 54
**Commit:** `053e55a683a2`

#### Test Groups

| Group | Name | Tests | Key Scenarios |
|-------|------|-------|---------------|
| A | `rpc_etax_health_trend_cached` — Org Isolation | 8 | Org A cannot read Org B rows; VIEWER raises P0001; DESIGNER raises P0001; FINANCE returns data; anon raises 401 |
| B | `mv_age_seconds` Accuracy | 7 | Age reported ≤ elapsed since refresh; age matches log timestamp delta; age < 10 s immediately after refresh; age increases monotonically between refreshes |
| C | `fn_refresh_etax_health_trend_mv` — Concurrent vs Blocking | 9 | Concurrent NOWAIT raises advisory-lock error; blocking mode waits and completes; sequential calls succeed; triggered_by values written to log |
| D | `rpc_etax_health_trend_cached_admin` — Service-Role Guard | 10 | Non-service_role raises EXCEPTION; service_role receives all orgs; p_org_id filter scopes correctly; p_days=1 returns day_rank=1 only; mv_age_seconds present; empty-org returns empty list |
| E | `day_rank` Ordering and Boundary | 8 | day_rank=1 is MAX(submission_day); day_rank sequence is dense (no gaps); only 30 days returned; rows ordered DESC by submission_day within org |
| F | `retry_exhaustion_rate_pct` Daily Precision | 6 | All submitted = 0%; all exhausted = 100%; mixed correctly; NULL when daily_total=0; ROUND(2) precision |
| G | Refresh Log Integrity | 6 | Log row written on every refresh; duration_ms > 0; row_count >= 0; triggered_by constrained to enum values; duplicate refresh within 1 s still writes new log row |

#### Notable Test Helpers

- `makeAuthClient(role, orgId?)` — creates a user, inserts into `org_members`, signs in, returns typed Supabase client
- `seedSubmission(opts)` — inserts into `etax_submissions` with `metadata.test_tag` for isolated cleanup
- `refreshTrendMV()` — calls `fn_refresh_etax_health_trend_mv('test')` via RPC
- `getMvAge()` — reads `v_mv_health_trend_lag.lag_seconds` immediately after refresh for timing assertions
- `calcExpectedExhaustionRate(exhausted, total)` — JS mirror of SQL `ROUND(daily_exhausted * 100.0 / NULLIF(daily_total, 0), 2)`

---

### Notes

1. **Formula is integer-typed:** `health_score` is computed entirely from `ROUND`, `GREATEST`, and `LEAST` over integer inputs. Downstream consumers should store and compare it as `INT`, not `NUMERIC`.
2. **CROSS JOIN refresh-log requirement:** If either `etax_compliance_mv_refresh_log` or `etax_health_trend_mv_refresh_log` is empty (e.g. on a fresh staging environment before any cron run), `v_etax_full_health_summary` returns zero rows. Call both `fn_refresh_etax_compliance_mv('migration')` and `fn_refresh_etax_health_trend_mv('migration')` at the end of any seed/setup script to pre-populate the log tables.
3. **Admin RPC EXCEPTION design:** `rpc_etax_full_health_summary_admin` raises an `EXCEPTION` (not an empty result) for non-service_role callers. This differs from most RPCs in the codebase which return empty sets on role mismatch. The intent is to make accidental non-service_role calls loudly fail during integration tests rather than silently returning nothing.
4. **Org absent from compliance MV is absent from the full summary view:** Organisations that have never had an `etax_submission` row will not appear in `mv_etax_compliance_dashboard` and therefore will not appear in `v_etax_full_health_summary`. This is by design — the health summary is only meaningful for orgs actively using eTax submission.

---

### Files Changed in 14.5.0

```
supabase/migrations/0193_etax_full_health_summary.sql          (added, 525 lines)
src/__tests__/rls/0193_etax_full_health_summary.test.ts        (added, ~960 lines)
src/__tests__/rls/0192_mv_etax_health_trend.test.ts            (added, 959 lines)
scripts/staging_validate_0192.sh                                (added)
CHANGELOG_1450.md                                               (added)
```

---

*Previous release: [14.4.0] — Migration 0192 (`mv_etax_health_trend`), 0191 test suite*
*Next release: [14.6.0] — planned: staging validation for 0193, combined 0192+0193 integration test suite*
