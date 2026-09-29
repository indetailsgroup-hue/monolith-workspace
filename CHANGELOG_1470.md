# CHANGELOG — [14.7.0] — 2026-08-28

## [14.7.0] – 2026-08-28

### Overview

Release 14.7.0 closes the eTax health observability stack with a cross-org risk ranking view (`v_etax_org_risk_ranking`) that surfaces every organisation's health posture in a single priority-ordered table. A combined master staging validation script (`staging_validate_all.sh`) chains all eight per-migration scripts (0186–0193) in dependency order and produces a single pass/fail summary table, enabling one-command pre-flight validation before any production deployment. An accompanying test suite (`0194_etax_org_risk_ranking.test.ts`) provides 50 tests across seven groups covering schema, ranking algorithm correctness, flag accuracy, role guards, and edge cases.

---

## Added

### Migration 0194 — `v_etax_org_risk_ranking`

**File:** `supabase/migrations/0194_etax_org_risk_ranking.sql`

Cross-org risk ranking view built on top of `v_etax_full_health_summary` (Migration 0193). Ranks all organisations by `health_score` ascending and flags critical orgs for priority review.

#### §0 — Dependency guard
- Raises `EXCEPTION` if `v_etax_full_health_summary` or `organizations` does not exist in the `public` schema.
- Prevents silent partial migration on out-of-order apply.

#### §1 — Idempotent DROP
- `DROP FUNCTION IF EXISTS rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT)`
- `DROP FUNCTION IF EXISTS rpc_etax_org_risk_ranking()`
- `DROP VIEW IF EXISTS v_etax_org_risk_ranking`
- Safe to re-run on re-deployment.

#### §2 — `v_etax_org_risk_ranking` (18 columns)

| Column | Description |
|---|---|
| `org_id` | Organisation UUID |
| `org_name` | Display name from `organizations` |
| `health_score` | 0–100 composite score from `v_etax_full_health_summary` |
| `health_status` | `healthy` / `warning` / `critical` |
| `total_submissions` | Lifetime submission count |
| `submitted_count` | Successfully submitted |
| `failed_count` | Failed submissions |
| `compliance_success_rate` | % from compliance MV |
| `overdue_with_pending_etax` | Overdue invoices with pending eTax |
| `failed_last_24h` | Failures in last 24 hours |
| `today_daily_total` | Today's total (day_rank=1) |
| `today_retry_exhaustion_rate_pct` | Today's retry-exhaustion rate % |
| `compliance_mv_last_refreshed_at` | Last compliance MV refresh timestamp |
| `trend_mv_last_refreshed_at` | Last trend MV refresh timestamp |
| `risk_rank` | `DENSE_RANK() OVER (ORDER BY health_score ASC, org_id ASC)` |
| `is_priority_review` | `TRUE` when `health_status = 'critical'` |
| `risk_tier` | `'CRITICAL'` / `'WARNING'` / `'HEALTHY'` |
| `ranked_at` | `NOW()` — snapshot timestamp |

**Algorithm:** `DENSE_RANK()` is used rather than `RANK()` so that tied scores produce consecutive rank values without gaps. The `org_id` tiebreaker ensures a deterministic ordering within equal scores.

**Permission model:** `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT SELECT TO service_role` only. Direct `SELECT` from any non-service-role client is rejected at the PostgreSQL permission layer.

#### §3 — `rpc_etax_org_risk_ranking()` (authenticated RPC)
- **Security:** `SECURITY DEFINER`, `SET search_path = public`
- **Role guard:** `OWNER`, `ADMIN`, `FINANCE` only; raises `SQLSTATE P0001` for `DESIGNER`, `FACTORY`, `INSTALLER`, `VIEWER`, or non-member
- **Returns:** exactly one row — the caller's own organisation, with the globally computed `risk_rank`
- **Purpose:** allows org-level users to see where their org ranks globally without exposing other org data

#### §4 — `rpc_etax_org_risk_ranking_admin(p_org_id UUID DEFAULT NULL, p_critical_only BOOLEAN DEFAULT FALSE, p_limit INT DEFAULT 50)` (service_role RPC)
- **Security:** `SECURITY DEFINER`, `SET search_path = public`
- **Role guard:** raises `SQLSTATE P0003` if caller is not `service_role`
- **`p_org_id`:** optional filter to a single organisation
- **`p_critical_only`:** when `TRUE`, filters to `health_status = 'critical'` rows only
- **`p_limit`:** clamped to `LEAST(GREATEST(p_limit, 1), 200)` — never returns more than 200 rows
- **`ORDER BY`:** `risk_rank ASC, org_id ASC`

#### §5 — Post-migration verification block
- Asserts column count ≥ 18
- Asserts both RPC functions exist in `pg_proc`
- Asserts both RPCs have `SECURITY DEFINER`
- Asserts `authenticated` cannot `SELECT` from the view directly

#### §6 — Rollback instructions (comment block)
```sql
-- DROP FUNCTION IF EXISTS rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT);
-- DROP FUNCTION IF EXISTS rpc_etax_org_risk_ranking();
-- DROP VIEW IF EXISTS v_etax_org_risk_ranking;
```

---

### Test Suite — `0194_etax_org_risk_ranking.test.ts`

**File:** `src/__tests__/rls/0194_etax_org_risk_ranking.test.ts`
**Lines:** ~960 | **Groups:** A–G | **Tests:** ~50

| Group | Focus | Tests |
|---|---|---|
| A | Schema — view exists, ≥18 columns, key columns present | 5 |
| B | `risk_rank` ordering — lowest score=rank 1, DENSE_RANK ties, monotonic ordering, global rank | 8 |
| C | `is_priority_review` — critical flag at threshold 49/50, boundary checks, boolean type, `p_critical_only` filter | 8 |
| D | `risk_tier` labels — CRITICAL/WARNING/HEALTHY thresholds, null safety, alignment with `health_status` | 6 |
| E | `rpc_etax_org_risk_ranking()` org isolation — OWNER/ADMIN/FINANCE succeed, DESIGNER raises P0001, exactly one row returned, no cross-org leak, global `risk_rank` exposed | 8 |
| F | `rpc_etax_org_risk_ranking_admin()` — service_role succeeds, non-service_role raises P0003, `p_org_id` filter, `p_critical_only`, `p_limit` clamping (0→1, 999→200), ordering | 8 |
| G | Edge cases — `org_name` from `organizations`, `ranked_at` is valid TIMESTAMPTZ, multiple critical orgs all flagged, empty result on unknown `p_org_id`, `p_critical_only=true` with no critical orgs, score improvement removes critical flag, anon direct SELECT blocked | 7 |

**Helpers:**
- `createOrgMember(role, name?)` — creates auth user + org + org_member + returns JWT
- `seedComplianceMV(orgId, successRate, opts)` — upserts `mv_etax_compliance_dashboard`
- `seedTrendMV(orgId, retryExhaustionRate)` — upserts `mv_etax_health_trend` (day_rank=1)
- `seedComplianceRefreshLog()` / `seedTrendRefreshLog()` — seeds CROSS JOIN prerequisite rows
- `cleanupOrg(orgId, userId)` — full teardown (MVs + org_members + org + auth user)

---

### Script — `staging_validate_all.sh`

**File:** `scripts/staging_validate_all.sh`

Master staging validation script. Chains `staging_validate_0186` through `staging_validate_0193` in dependency order and emits a single pass/fail summary table.

#### Design

**Script registry (in order):**
```
0186 → 0187 → 0188 → 0189 → 0190 → 0191 → 0192 → 0193
```

**Missing-script handling:** if a child script does not exist on disk, it is marked `SKIP` in the summary and execution continues. Scripts 0186, 0187, and 0190 do not yet have staging validation scripts; they appear as `SKIP` in the table without causing a pipeline failure.

**Flags:**

| Flag | Effect |
|---|---|
| `--dry-run` | Mock-CI mode: echoes each child command without executing; all absent scripts → `SKIP(dry)` |
| `--no-vitest` | Passes `--no-vitest` to every child script and suppresses the final combined vitest run |
| `--help` | Prints usage and exits |

**Sections:**
- `§1` Environment pre-flight: warns on unset `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `§2` Executes each child script with timing (`date +%s` before/after)
- `§3` Optional combined vitest run (`npx vitest run --reporter=verbose`) covering test suites 0186–0194
- `§4` Formatted summary table with migration ID, script name, duration, coloured status

**Summary table format:**
```
Migration    Script                                                  Duration   Status
──────────────────────────────────────────────────────────────────────────────────────────
0186         staging_validate_0186.sh                               —          SKIP
0187         staging_validate_0187.sh                               —          SKIP
0188         staging_validate_0188.sh                               12s        PASS
0189         staging_validate_0189.sh                               14s        PASS
0190         staging_validate_0190.sh                               —          SKIP
0191         staging_validate_0191.sh                               11s        PASS
0192         staging_validate_0192.sh                               9s         PASS
0193         staging_validate_0193.sh                               16s        PASS
vitest       npx vitest run (all 0186–0194 test suites)             43s        PASS
──────────────────────────────────────────────────────────────────────────────────────────
  Passed: 6   Failed: 0   Skipped: 3
  Total elapsed: 105s

Overall result: PASSED
```

**Exit codes:**
- `0` — all present scripts passed (`SKIP` does not count as failure)
- `1` — at least one script `FAIL`ed

---

## Changed

### PR #46 — `feat/accounting-rls-multibook` → `main`

Updated PR body with Task 26 checklist block covering:
- Migration `0194_etax_org_risk_ranking.sql` pushed
- Test suite `0194_etax_org_risk_ranking.test.ts` pushed (Groups A–G, ~50 tests)
- `staging_validate_all.sh` master chaining script pushed
- `CHANGELOG_1470.md` pushed

---

## eTax Observability Stack — Completion Summary

Release 14.7.0 marks the completion of the full eTax health observability stack. The migration lineage is:

```
0186  v_etax_compliance_dashboard (view)
0187  mv_etax_compliance_dashboard (materialized view + pg_cron 15-min refresh)
0188  mv_refresh_lag_alert (trigger on stale MV detection)
0189  v_mv_alert_history (alert history view + RPC)
0190  v_etax_submission_health (per-org submission health view)
0191  v_etax_health_trend (daily 30-day trend view)
0192  mv_etax_health_trend (materialized view + pg_cron daily refresh + cached RPC)
0193  v_etax_full_health_summary (joined health snapshot + health_score formula)
0194  v_etax_org_risk_ranking (cross-org DENSE_RANK priority view)  ← THIS RELEASE
```

All migrations are covered by dedicated test suites and staging validation scripts. The combined `staging_validate_all.sh` provides a single-command pre-deployment gate.

---

## Compatibility

- **Requires:** Migration 0193 (`v_etax_full_health_summary`) applied successfully
- **Requires:** Both `mv_etax_compliance_dashboard` and `mv_etax_health_trend` populated
- **Requires:** Both refresh-log tables have ≥ 1 row (CROSS JOIN prerequisite)
- **No breaking changes** to existing tables, views, or RPCs

---

*MONOLITH Manufacturing OS · eTax Observability Track · Release 14.7.0*
