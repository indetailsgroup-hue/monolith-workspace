# CHANGELOG [15.6.0]

> **Release:** 15.6.0
> **Branch:** main
> **Date:** 2026-09-01
> **Status:** General Availability

---

## Summary

Completes the long-term SLA retention layer introduced in Migration 0201 with full
test coverage, staging validation, and operational documentation. Adds the 8th pg_cron
job (`archive-etax-sla-breach-daily`) to `supabase/config.toml` and extends the
standalone HTML eTax Compliance Dashboard with a bar/line chart type toggle on the
SLA Monitor tab, enabling side-by-side analysis of daily breach counts versus the
running cumulative total.

---

## What's New

### Migration 0201 — `etax_sla_breach_archive` (long-term SLA breach retention)

**File:** `supabase/migrations/0201_etax_sla_breach_archive.sql`

Already shipped in v15.5.0 as the migration file. This release delivers its full
supporting artefacts:

- **`etax_sla_breach_archive` table** — composite PK `(org_id, document_type, breach_date)`;
  columns: `org_id`, `document_type`, `breach_date`, `org_name`, `total_created`,
  `breached_count`, `breach_rate`, `severity_tier`, `cumulative_breached`,
  `sla_threshold_hours`, `archived_at`; RLS enabled; three secondary indexes:
  `idx_sla_archive_org_date`, `idx_sla_archive_severity_date`, `idx_sla_archive_doctype_date`.
- **`fn_archive_etax_sla_breach_timeline()`** — SECURITY DEFINER; reads `v_etax_sla_breach_timeline`
  and upserts into `etax_sla_breach_archive` via `ON CONFLICT DO UPDATE`, making it
  fully idempotent. Stamps `platform_config.sla_archive_last_run` (JSONB) with `run_at`,
  `rows_upserted`, `duration_ms`, and `success` after every run.
- **`rpc_etax_sla_breach_archive(p_org_id, p_document_type, p_from_date, p_to_date)`** —
  SECURITY DEFINER; `authenticated` EXECUTE; `anon` REVOKED; full historical range
  (no 90-day cap); RLS enforced so each caller sees only their org's rows.
- **pg_cron job `archive-etax-sla-breach-daily`** — runs at `15 0 * * *` UTC (daily, 00:15)
  via `SELECT public.fn_archive_etax_sla_breach_timeline();` — the 8th scheduled job
  in the platform.

### Test Suite — `0201_etax_sla_breach_archive.test.ts`

**File:** `src/__tests__/migrations/0201_etax_sla_breach_archive.test.ts`
**Commit:** `ee477563fb87`

32 test cases across 5 groups:

| Group | Focus | Cases |
|-------|-------|-------|
| A | Table structure: 11 columns, composite PK, 3 indexes, RLS enabled, numeric types, `archived_at` default | 19 |
| B | `fn_archive_etax_sla_breach_timeline` idempotency: two runs, row count stable, `archived_at` refreshed, auth-role rejection | 7 |
| C | `platform_config.sla_archive_last_run` stamping: key presence, JSONB validity, `run_at` / `rows_upserted` / `duration_ms` fields, recency, update-on-rerun | 7 |
| D | `rpc_etax_sla_breach_archive` date-range filter: null params, `p_from_date`, `p_to_date`, combined window, future → empty, `p_document_type`, `p_org_id` scoping | 8 |
| E | RLS cross-tenant isolation: Org A sees only Org A, Org B sees only Org B, Org A cannot pull Org B by explicit `p_org_id`, service_role sees all, anon rejected | 6 |

### Staging Validator — `staging_validate_0201.sh`

**File:** `scripts/staging_validate_0201.sh`
**Commit:** `abc3e44dc93b`

12 validation sections:

| § | Validation |
|---|-----------|
| 1 | Environment variables |
| 2 | `etax_sla_breach_archive` table existence |
| 3 | PK (`etax_sla_breach_archive_pk`) + 3 secondary indexes |
| 4 | RLS enabled on table |
| 5 | `fn_archive_etax_sla_breach_timeline` existence + SECURITY DEFINER flag |
| 6 | `fn_archive` execution returns `success: true` + `rows_upserted ≥ 0` |
| 7 | `platform_config.sla_archive_last_run` stamped with `run_at` (recency ≤ 5 min), `rows_upserted`, `duration_ms` |
| 8 | `rpc_etax_sla_breach_archive` function existence |
| 9 | REST POST `rpc_etax_sla_breach_archive` returns HTTP 200 and a JSON array |
| 10 | `p_from_date`/`p_to_date` filter correctness (future range → empty; historical range respects bound) |
| 11 | RLS cross-tenant: Org A cannot see Org B rows; anon caller rejected (401/403) |
| 12 | vitest `0201_etax_sla_breach_archive` suite in CI mode |

### `staging_validate_all.sh` — Entry 17

**File:** `scripts/staging_validate_all.sh`
**Commit:** `58d3eb051390`

- `"0201|staging_validate_0201.sh"` registered as entry 17 after entry 16 (0200).
- `TEST_PATTERN` regex updated to include `0201`.
- Coverage comments updated to `0186–0201` throughout.
- Total validators: **17** (0186 → 0201).

### `supabase/config.toml` — 8th pg_cron Job

**File:** `supabase/config.toml`

Adds the `[cron."archive-etax-sla-breach-daily"]` block documenting the daily SLA
breach archival job introduced by Migration 0201. Updates the header comment table
from 7 to 8 jobs.

| # | Job name | Schedule | Description |
|---|----------|----------|-------------|
| 1 | `etax-submit-worker` | `*/5 * * * *` | Poll & submit queued eTax docs |
| 2 | `notify-overdue` | `0 1 * * *` | Nightly overdue invoice alerts |
| 3 | `refresh-etax-compliance-mv` | `*/15 * * * *` | Refresh `mv_etax_compliance_dashboard` |
| 4 | `check-mv-refresh-lag` | `*/5 * * * *` | Alert if MV refresh > 15 min stale |
| 5 | `refresh-etax-health-trend-mv` | `0 0 * * *` | Daily refresh `mv_etax_health_trend` |
| 6 | `auto-create-etax-partition` | `0 0 20 * *` | Pre-create next monthly partition |
| 7 | `refresh-etax-sla-mv` | `0 * * * *` | Hourly refresh `mv_etax_submission_sla` |
| **8** | **`archive-etax-sla-breach-daily`** | **`15 0 * * *`** | **Daily SLA breach archive into `etax_sla_breach_archive`** |

### eTax Compliance Dashboard — Bar/Line Chart Toggle

**File:** `public/etax-compliance-dashboard.html`
**Commit:** `ee2a44d0ba34`

Extends the SLA Monitor tab chart with a segmented control toggle:

- **Segmented control** — two buttons ("Cumulative" / "Daily Breaches") inserted in the
  chart header controls row, left of the Days selector.
- **`_chartMode` state variable** — `'line'` (default) or `'bar'`; persists across
  Days selector changes and Refresh calls.
- **Line mode** — existing behaviour: `cumulative_breached` per document type, Chart.js
  `type: 'line'`, tooltip "N cumulative breaches", y-axis title "Cumulative Breaches".
- **Bar mode** — `breached_count` per document type, Chart.js `type: 'bar'`,
  `borderRadius: 4`, tooltip "N daily breaches", y-axis title "Daily Breaches".
- **`switchChartMode(mode)`** — updates button CSS (`bg-brand-500 text-white` active /
  `bg-white text-slate-600` inactive) then calls `renderSlaChart(state.slaTimeline)`.
- Chart heading and subtitle text update dynamically to reflect the active mode
  ("30-Day Cumulative Breach Trend" vs "Daily Breach Counts").

---

## Files Changed

| File | Status | Commit |
|------|--------|--------|
| `src/__tests__/migrations/0201_etax_sla_breach_archive.test.ts` | Added | `ee477563fb87` |
| `scripts/staging_validate_0201.sh` | Added | `abc3e44dc93b` |
| `scripts/staging_validate_all.sh` | Modified | `58d3eb051390` |
| `public/etax-compliance-dashboard.html` | Modified | `ee2a44d0ba34` |
| `supabase/config.toml` | Modified | *(this release)* |

---

## Infrastructure

- **pg_cron jobs:** 7 → **8** total (`archive-etax-sla-breach-daily` at `15 0 * * *`)
- **Staging validators:** 16 → **17** (0186–0201)
- **Test suites (0186–0201):** 17 suites, **300+** test cases cumulative
- **`etax_sla_breach_archive` retention:** unbounded (no 90-day cap); data grows as
  `fn_archive_etax_sla_breach_timeline` runs nightly via pg_cron

---

## Upgrade Notes

1. Run `supabase db push` to apply Migration 0201 if not already applied.
2. After migration, call `fn_archive_etax_sla_breach_timeline()` once manually (via
   service_role) to seed `etax_sla_breach_archive` from the current 90-day window.
3. Verify `platform_config.sla_archive_last_run` is populated before enabling
   pg_cron — confirms the function is reachable by the scheduler.
4. Run `scripts/staging_validate_0201.sh` against your staging instance to confirm
   all 12 checks pass before promoting to production.

---

*Previous release:* [15.5.0](./CHANGELOG_1550.md)
