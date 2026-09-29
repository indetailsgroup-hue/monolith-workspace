# CHANGELOG [15.4.0] — 2026-09-01

## [15.4.0] – 2026-09-01

> **Scope:** Migration 0199 (materialized-view SLA cache), completion of the
> Migration 0198 delivery (test suite + staging validator pushed to `main`),
> and the 7th pg_cron job in `supabase/config.toml`.
> This release closes the SLA observability work stream that began with
> Migration 0198 (`v_etax_submission_sla`) and brings the pg_cron job count
> to **7** and the staging validator count to **14**.

---

### Added

#### Migration 0199 — `mv_etax_submission_sla` (commit `781b5aeed314`)

A materialized view that caches the live `v_etax_submission_sla` view for
low-latency dashboard reads, refreshed hourly by pg_cron.

**New database objects:**

| Object | Type | Description |
|--------|------|-------------|
| `mv_etax_submission_sla` | Materialized view | Caches all 11 columns of `v_etax_submission_sla`; populated with `WITH DATA` |
| `mv_etax_submission_sla_pk` | Unique index | `(org_id, document_type)` — required for `REFRESH CONCURRENTLY` |
| `idx_mv_etax_sla_severity` | Index | `(severity_tier)` — fast filter on severity tier |
| `idx_mv_etax_sla_breach_flag` | Partial index | `WHERE sla_breach_flag = TRUE` — fast breach-only queries |
| `fn_refresh_mv_etax_submission_sla()` | Function (SECURITY DEFINER) | `REFRESH MATERIALIZED VIEW CONCURRENTLY` + stamps `platform_config('mv_etax_sla_last_refreshed')` |
| `rpc_etax_submission_sla_cached(p_document_type, p_severity)` | Function (SECURITY DEFINER) | Queries the MV with RLS org-scoping; ordered by severity DESC then breach_rate DESC |

**Grant matrix:**

| Principal | `mv_etax_submission_sla` | `fn_refresh_mv_etax_submission_sla` | `rpc_etax_submission_sla_cached` |
|-----------|--------------------------|-------------------------------------|----------------------------------|
| `anon` | REVOKED | REVOKED | REVOKED |
| `authenticated` | SELECT ✅ | REVOKED | EXECUTE ✅ |
| `service_role` | SELECT ✅ | EXECUTE ✅ | EXECUTE ✅ |

**Why a materialized view?**  
`v_etax_submission_sla` joins `etax_submissions`, `invoices`, and
`platform_config` on every query. Under multi-tenant load, repeated full-table
scans degrade dashboard response times. The MV pre-aggregates per-org,
per-document-type SLA metrics and serves them from a single indexed scan.
`CONCURRENTLY` refresh ensures zero read downtime during hourly maintenance.

**SLA severity tier reference** (unchanged from 0198):

| Tier | Breach rate condition |
|------|-----------------------|
| `HEALTHY` | `= 0 %` |
| `NORMAL` | `> 0 %` |
| `ELEVATED` | `≥ 10 %` |
| `WARNING` | `≥ 25 %` |
| `CRITICAL` | `≥ 50 %` |

---

#### `supabase/config.toml` — 7th pg_cron job (commit `6ea843bd7df2`)

```toml
# [7] Hourly refresh of mv_etax_submission_sla
[cron."refresh-etax-sla-mv"]
schedule = "0 * * * *"
command  = "SELECT public.fn_refresh_mv_etax_submission_sla();"
```

**Complete pg_cron job registry (7 jobs):**

| # | Job name | Schedule | Command |
|---|----------|----------|---------|
| 1 | `etax-submit-worker` | `*/5 * * * *` | Edge Function HTTP POST |
| 2 | `notify-overdue` | `0 1 * * *` | Edge Function HTTP POST |
| 3 | `refresh-etax-compliance-mv` | `*/15 * * * *` | `rpc_refresh_etax_compliance_mv()` |
| 4 | `check-mv-refresh-lag` | `*/5 * * * *` | `fn_check_mv_refresh_lag()` |
| 5 | `refresh-etax-health-trend-mv` | `0 0 * * *` | `rpc_refresh_etax_health_trend_mv()` |
| 6 | `auto-create-etax-partition` | `0 0 20 * *` | `fn_auto_create_next_etax_partition()` |
| 7 | `refresh-etax-sla-mv` | `0 * * * *` | `fn_refresh_mv_etax_submission_sla()` |

---

#### Migration 0198 — test suite pushed (commit `60bca9855ed4`)

`src/__tests__/migrations/0198_etax_submission_sla.test.ts` (709 lines)
was written in the previous session but not yet committed to `main`.
It is now merged and registered in the test runner.

**Test groups:**

| Group | Description | Tests |
|-------|-------------|-------|
| A | Column presence (11 columns) | 4 |
| B | SLA breach flag accuracy (`< 24 h` → no breach; `> 24 h` → breach) | 4 |
| C | Severity tier logic (HEALTHY / NORMAL / ELEVATED / WARNING / CRITICAL) | 5 |
| D | `rpc_etax_submission_sla` — `p_document_type` + `p_severity` filtering | 5 |
| E | `rpc_etax_sla_summary` — cross-document-type aggregate + `worst_document_type` | 5 |
| F | Cross-tenant RLS isolation | 4 |
| G | `platform_config` SLA threshold seed + COALESCE fallback | 3 |

Total: **30 test cases**

---

#### `scripts/staging_validate_0198.sh` (commit `c5a706fb22d2`)

11-section staging validator for Migration 0198.

| Section | Coverage |
|---------|----------|
| §1 | Environment prerequisites |
| §2 | `v_etax_submission_sla` view existence |
| §3 | Required columns (11) |
| §4 | SLA breach flag smoke test (30 h-old submission → `sla_breach_flag = TRUE`) |
| §5 | Severity tier boundary verification (all 5 tiers in view definition) |
| §6 | `rpc_etax_submission_sla` existence + `p_document_type` + `p_severity` filter |
| §7 | `rpc_etax_sla_summary` existence + aggregate shape + `worst_document_type` |
| §8 | RLS enforcement (anon vs service_role + cross-tenant isolation) |
| §9 | `platform_config.etax_sla_hours` seed check |
| §10 | Vitest unit tests |
| §11 | Summary |

---

#### `scripts/staging_validate_all.sh` — entry 14 registered (commit `ed94842b4a3b`)

`staging_validate_0198.sh` added as the 14th entry in `SCRIPT_REGISTRY`.
`TEST_PATTERN` updated to include `0198`:

```bash
TEST_PATTERN="src/__tests__/(rls|migrations)/(0186|...|0197|0198)"
```

**Complete validator registry (14 entries):**

| # | Migration | Script | Coverage |
|---|-----------|--------|----------|
| 1 | 0186 | `staging_validate_0186.sh` | `v_etax_compliance_dashboard` |
| 2 | 0187 | `staging_validate_0187.sh` | `mv_etax_compliance_dashboard` |
| 3 | 0188 | `staging_validate_0188.sh` | MV refresh-lag alert trigger |
| 4 | 0189 | `staging_validate_0189.sh` | `v_mv_alert_history` |
| 5 | 0190 | `staging_validate_0190.sh` | `v_etax_submission_health` |
| 6 | 0191 | `staging_validate_0191.sh` | `v_etax_health_trend` |
| 7 | 0192 | `staging_validate_0192.sh` | `mv_etax_health_trend` + cached RPC |
| 8 | 0193 | `staging_validate_0193.sh` | `v_etax_full_health_summary` |
| 9 | 0194 | `staging_validate_0194.sh` | `v_etax_org_risk_ranking` |
| 10 | 0195 | `staging_validate_0195.sh` | pg_notify risk tier trigger |
| 11 | 0195b | `staging_validate_0195b.sh` | pg_net HTTP POST dispatch |
| 12 | 0196 | `staging_validate_0196.sh` | Monthly partition architecture |
| 13 | 0197 | `staging_validate_0197.sh` | `partition_archive_log` audit table |
| 14 | 0198 | `staging_validate_0198.sh` | `v_etax_submission_sla` SLA view |

---

### Migration Dependency Chain (complete, 0176 → 0199)

```
0176  auto-journal on invoice approval
0177  auto-receipt posting on payment_slip confirm
0178  multi-tenant RLS hardening
0179  multi-book dynamic support (book_id)
0180  overdue invoice detection + auto-notification
0181  notification queue
0182  notification_settings JSONB on organizations
0183  etax PDF download pipeline
0184  etax_document_types reference table
0185  etax_submissions audit log
0186  v_etax_compliance_dashboard view
0187  mv_etax_compliance_dashboard + 15-min refresh
0188  MV refresh-lag alert trigger
0189  v_mv_alert_history view
0190  v_etax_submission_health view
0191  v_etax_health_trend (30-day daily trend)
0192  mv_etax_health_trend + daily refresh + cached RPC
0193  v_etax_full_health_summary
0194  v_etax_org_risk_ranking
0195  pg_notify etax_risk_rank_changed trigger
0195b pg_net HTTP POST for risk-tier webhook dispatch
0196  monthly partitioning on etax_submissions
0197  partition_archive_log audit table
0198  v_etax_submission_sla (SLA breach tracking)
0199  mv_etax_submission_sla + hourly refresh + cached RPC  ← this release
```

---

### Commits in this release

| Commit | File | Description |
|--------|------|-------------|
| `6ea843bd7df2` | `supabase/config.toml` | Add 7th pg_cron job `refresh-etax-sla-mv` |
| `781b5aeed314` | `supabase/migrations/0199_mv_etax_submission_sla.sql` | Migration 0199 |
| `ed94842b4a3b` | `scripts/staging_validate_all.sh` | Register entry 14 (0198); update TEST_PATTERN |
| `c5a706fb22d2` | `scripts/staging_validate_0198.sh` | Staging validator §1–§11 |
| `60bca9855ed4` | `src/__tests__/migrations/0198_etax_submission_sla.test.ts` | Test suite Groups A–G |

---

### Pending (next release)

- Test suite for Migration 0199 (`0199_mv_etax_submission_sla.test.ts`, Groups A–G)
- `staging_validate_0199.sh` (§1–§11)
- Register entry 15 (`0199`) in `staging_validate_all.sh`
- CHANGELOG [15.5.0]
