# CHANGELOG — MONOLITH Manufacturing OS

## [15.7.0] — 2026-09-01

### Overview

Release 15.7.0 delivers the **executive SLA dashboard layer** — a single-query
view (`v_etax_sla_executive_summary`) that fuses real-time materialized-view data
(`mv_etax_submission_sla`, Migration 0199) with long-term breach archive data
(`v_etax_sla_archive_org_rollup`, Migration 0202) into one unified KPI row per
organisation. The standalone HTML eTax Compliance Dashboard's **SLA Monitor tab**
is extended with two new archive data panels sourced from
`rpc_etax_sla_archive_summary` and `rpc_etax_sla_archive_org_rollup`.

---

### Added

#### Migration 0203 — `v_etax_sla_executive_summary`

**File:** `supabase/migrations/0203_etax_sla_executive_summary.sql`

- **`v_etax_sla_executive_summary`** — New view (`security_invoker = true`) that
  performs a `FULL OUTER JOIN` between:
  - `mv_etax_submission_sla` aggregated to one row per org (live, hourly-refreshed)
  - `v_etax_sla_archive_org_rollup` (long-term archive, Migration 0202)

  Exposes **24 columns** covering both live and archive KPIs per organisation:

  | Category | Key Columns |
  |---|---|
  | Identity | `org_id`, `org_name` |
  | Live (MV) | `live_total_submissions`, `live_breach_count`, `live_breach_rate_pct`, `live_worst_severity`, `live_avg_processing_hours`, `live_last_submission_at` |
  | Archive | `first_archived_date`, `last_archived_date`, `archive_total_days`, `archive_total_created`, `archive_total_breached`, `archive_breach_rate_pct`, `archive_worst_severity`, `archive_peak_cumulative`, `breached_document_types`, `last_archived_at` |
  | Combined KPIs | `peak_breach_rate_pct`, `combined_worst_severity`, `requires_attention`, `has_live_data`, `has_archive_data` |

  `combined_worst_severity` uses a `GREATEST` CASE rank so the worst tier across
  both live and archive drives the result. `requires_attention = TRUE` when either
  source reports WARNING or CRITICAL.

- **`rpc_etax_sla_executive_summary`** — SECURITY DEFINER RPC wrapping the view.
  Parameters: `p_org_id UUID`, `p_requires_attention BOOLEAN`,
  `p_has_archive_data BOOLEAN`. Results ordered by `combined_worst_severity DESC`,
  `peak_breach_rate_pct DESC`. Non-service_role callers are tenant-isolated via
  `get_user_org_id()`. `anon` REVOKED.

- **`platform_config`** entry: `migration_0203_applied` JSON stamp with
  `version`, `description`, `applied_at`.

#### eTax Compliance Dashboard — SLA Monitor tab archive panels

**File:** `public/etax-compliance-dashboard.html`

Two new panels added to the SLA Monitor tab:

1. **Archive Org Rollup** — table sourced from `rpc_etax_sla_archive_org_rollup`
   showing per-org long-term totals: `archive_total_days`, `total_created`,
   `total_breached`, `overall_breach_rate`, `worst_severity_tier`,
   `peak_cumulative`, `breached_document_types`. Severity tier badges match the
   existing tier colour palette.

2. **Archive Summary by Tier** — table sourced from `rpc_etax_sla_archive_summary`
   grouped by `(org_name, severity_tier)` showing `avg_breach_rate`,
   `max_breach_rate`, `total_archive_days`, `max_cumulative`. A tier filter
   dropdown controls both the fetch and the rendered rows.

Both panels lazy-load when the SLA Monitor tab is first activated and refresh
with the global Refresh button. State is held in `state.slaArchiveRollup` and
`state.slaArchiveSummary`. Each panel shows a pulse skeleton while loading and
a graceful empty state when no archive data exists yet.

---

### Changed

- `fetchAllData()` — extended to fetch `rpc_etax_sla_archive_summary` and
  `rpc_etax_sla_archive_org_rollup` in parallel alongside existing SLA fetches.
- `state` object — two new keys: `slaArchiveRollup: []`, `slaArchiveSummary: []`.
- `renderSlaTab()` — calls two new sub-renderers:
  `renderSlaArchiveRollup()` and `renderSlaArchiveSummary()`.

---

### Metrics

| Item | Count |
|---|---|
| New views | 1 (`v_etax_sla_executive_summary`) |
| New RPCs | 1 (`rpc_etax_sla_executive_summary`) |
| Migration columns | 24 |
| Dashboard panels added | 2 |
| New state keys | 2 |
| RPC sources added to dashboard | 2 |

---

### Upgrade Notes

1. Apply migration `0203` after `0202` is confirmed present:
   ```bash
   psql $DATABASE_URL -f supabase/migrations/0203_etax_sla_executive_summary.sql
   ```
2. No pg_cron jobs added in this migration. Refresh cadence is inherited from
   `mv_etax_submission_sla` (hourly, Migration 0199) and
   `fn_archive_etax_sla_breach_timeline` (daily 00:15 UTC, Migration 0201).
3. `v_etax_sla_executive_summary` uses `security_invoker = true` — row visibility
   follows the caller's RLS context. `rpc_etax_sla_executive_summary` is
   SECURITY DEFINER and applies `get_user_org_id()` isolation explicitly.

---

### Commit References

| Artifact | Commit |
|---|---|
| Migration 0203 | `35ccd2514e2d` |
| CHANGELOG 15.7.0 (final) | `fe7fa0a50978` |
| Dashboard HTML update | `24a8e618ffb0` |
| Test suite 0203 | `d5d822e02030` |
| `staging_validate_0203.sh` | `3ced1b56e2b2` |
| `staging_validate_all.sh` (entry 19) | `dc28f6856fde` |
| OpenAPI spec v15.7.0 | `5e9f86baab8c` |
