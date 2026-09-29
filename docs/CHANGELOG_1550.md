# CHANGELOG [15.5.0]

> **Release:** 15.5.0  
> **Branch:** main  
> **Date:** 2026-09-01  
> **Status:** General Availability

---

## Summary

Closes the final chapter of the eTax SLA observability platform with daily breach-trend
analysis, a fourth SLA Monitor tab in the standalone HTML dashboard, a full MV-refresh
pipeline integration test suite, and staging validation coverage for Migration 0200.
The OpenAPI spec is bumped to v15.5.0 with the new `rpc_etax_sla_breach_timeline` path.

---

## What's New

### Migration 0200 — `v_etax_sla_breach_timeline` (daily breach trend view)

**File:** `supabase/migrations/0200_etax_sla_breach_timeline.sql`

- Adds `v_etax_sla_breach_timeline` view using `generate_series` calendar spine so that
  every day in the last 90 days appears — even days with zero submissions — preventing
  gaps in trend charts.
- Computes per-day metrics per `(org_id, document_type)`:
  - `total_created`, `breached_count`, `breach_rate`
  - `severity_tier` (HEALTHY / NORMAL / ELEVATED / WARNING / CRITICAL) per that day's rate
  - `cumulative_breached` — monotonically increasing running total (window function)
  - `sla_threshold_hours` sourced from `platform_config.etax_sla_hours` (default 24)
- Adds `rpc_etax_sla_breach_timeline(p_org_id, p_document_type, p_days DEFAULT 30)`
  (SECURITY DEFINER, max 90 days, RLS enforced)
- Grants: `authenticated` EXECUTE; `anon` REVOKED

### Combined Integration Test Suite — SLA MV Refresh Pipeline

**File:** `src/__tests__/migrations/0198_0199_sla_pipeline_integration.test.ts`

End-to-end pipeline coverage across all three layers of the SLA observability stack:

| Group | Focus |
|-------|-------|
| A | `v_etax_submission_sla` — column presence, breach flag accuracy, severity tier, org_name, breach_rate bounds |
| B | `mv_etax_submission_sla` — post-refresh population, Org A T01 presence, breach count parity with live view, unique index |
| C | `fn_refresh_mv_etax_submission_sla` — execution, platform_config timestamp, concurrent refresh safety |
| D | `rpc_etax_submission_sla_cached` — row identity with MV, `p_document_type`, `p_severity` filters |
| E | MV staleness — new data invisible via cached RPC before refresh; visible after |
| F | RLS consistency — Org A/B isolation enforced identically at all three layers |
| G | Pipeline integrity — breach counts, breach_rate formula, sla_threshold_hours config parity |

### eTax Compliance Dashboard — SLA Monitor Tab (4th tab)

**File:** `public/etax-compliance-dashboard.html`

- Adds a fourth **SLA Monitor** tab to the standalone HTML dashboard alongside Overview,
  Risk Ranking, and Compliance Detail.
- Fetches from `rpc_etax_submission_sla_cached` (per-document-type rows) and
  `rpc_etax_sla_summary` (org-level health card).
- Severity tier badge rendering: CRITICAL (red), WARNING (orange), ELEVATED (yellow),
  NORMAL (blue), HEALTHY (green).
- SLA summary card shows: total submissions, breach count, breach rate %, worst document
  type, and the SLA threshold in hours.
- `switchTab` updated to include the `'sla'` panel; `state` extended with `slaRows` and
  `slaSummary`; `fetchAllData` extended with `rpc_etax_submission_sla_cached` and
  `rpc_etax_sla_summary` fetches.

### Staging Validator — `staging_validate_0200.sh`

**File:** `scripts/staging_validate_0200.sh`

Eleven validation sections:

| § | Validation |
|---|-----------|
| 1 | Environment variables |
| 2 | `v_etax_sla_breach_timeline` view existence |
| 3 | All 10 required columns present |
| 4 | Calendar spine continuity (no day gaps in 30-day window) |
| 5 | `rpc_etax_sla_breach_timeline` function existence |
| 6 | REST POST HTTP 200 (default p_days) |
| 7 | `p_days=7` filter — no rows older than 7 days |
| 8 | `p_document_type=T01` filter — all rows are T01 |
| 9 | `cumulative_breached` monotonicity |
| 10 | RLS cross-tenant isolation |
| 11 | vitest `0198_0199_sla_pipeline_integration` suite in CI mode |

### `staging_validate_all.sh` — Entry 16

- Registry extended to 16 validators (`0186` → `0200`)
- `TEST_PATTERN` updated to include `0200`
- Coverage summary header updated to `0186–0200`

### OpenAPI Spec — v15.5.0

**File:** `docs/openapi_monolith_rpcs.yaml`

- Version bumped to `15.5.0`
- Added path `/rpc/rpc_etax_sla_breach_timeline` with full request/response schema,
  parameters (`p_org_id`, `p_document_type`, `p_days`), and security definition
- Response schema includes all 10 columns of `v_etax_sla_breach_timeline`

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0200_etax_sla_breach_timeline.sql` | New |
| `src/__tests__/migrations/0198_0199_sla_pipeline_integration.test.ts` | New |
| `public/etax-compliance-dashboard.html` | Updated (SLA Monitor tab added) |
| `scripts/staging_validate_0200.sh` | New |
| `scripts/staging_validate_all.sh` | Updated (entry 16, TEST_PATTERN) |
| `docs/openapi_monolith_rpcs.yaml` | Updated (v15.5.0, +1 path) |
| `docs/CHANGELOG_1550.md` | New |

---

## Upgrade Notes

- Migration 0200 is additive only: no existing tables, views, or functions are modified.
- The HTML dashboard upgrade is backward-compatible — existing config in `localStorage`
  continues to work; the SLA tab gracefully shows empty state if `rpc_etax_submission_sla_cached`
  returns no rows.
- `staging_validate_all.sh` requires `staging_validate_0200.sh` to be present in
  `scripts/`; the entry is registered as SKIP if the file is missing.

---

## Breaking Changes

None.

---

## Migration Sequence (complete)

```
0176 → 0177 → 0178 → 0179 → 0180 → 0181 → 0182 → 0183 → 0184 → 0185
0186 → 0187 → 0188 → 0189 → 0190 → 0191 → 0192 → 0193 → 0194 → 0195
0195b → 0196 → 0197 → 0198 → 0199 → 0200
```

Migration sequence is now **complete** through v15.5.0.
