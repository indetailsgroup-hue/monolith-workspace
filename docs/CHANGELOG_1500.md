# CHANGELOG [15.0.0] — eTax Observability Stack Complete

**Release Date:** 2026-09-01
**Branch:** `feat/accounting-rls-multibook`
**Milestone:** eTax Observability Stack completion (Migrations 0186–0195)

---

## Overview

Release 15.0.0 marks the **completion of the eTax Observability Stack** for the MONOLITH Manufacturing OS.
This release closes the full arc from raw `etax_submissions` data through materialized-view caching,
compliance dashboards, health trend analytics, org-level risk ranking, and real-time risk-tier
notifications via PostgreSQL `pg_notify`. It also finalises the App router integration for both new
page routes and delivers the comprehensive test/validation infrastructure required for production
deployment.

---

## Migrations

| Migration | Summary |
|---|---|
| `0195_etax_risk_tier_notify.sql` | `etax_risk_tier_state` table, `fn_check_risk_tier_changes()` SECURITY DEFINER trigger, `rpc_etax_risk_tier_state` / `rpc_etax_risk_tier_state_admin`, triggers on both MV refresh-log tables |
| *(all 0186–0194 shipped in 14.x releases)* | *(see CHANGELOG_1430.md through CHANGELOG_1480.md)* |

---

## Test Suites

### `0195_etax_risk_tier_notify.test.ts` — 52 tests across 7 groups

| Group | Coverage | Tests |
|---|---|---|
| A | `etax_risk_tier_state` table structure + RLS (own-org SELECT, cross-org isolation, service_role bypass, write-denied for authenticated users, VIEWER denied) | 8 |
| B | `fn_check_risk_tier_changes` trigger: HEALTHY→CRITICAL fires, no-change suppressed, SECURITY DEFINER confirmed, trigger on both tables, tier transition upserts correctly | 6 |
| C | pg_notify payload schema: all 9 fields present, channel name `etax_risk_rank_changed`, IS DISTINCT FROM guard, `transitioned_at` timestamp, valid JSON | 5 |
| D | Dual-table trigger coverage: compliance log fires, health trend log fires, both triggers are FOR EACH ROW, multi-org single-insert test | 5 |
| E | `rpc_etax_risk_tier_state`: FINANCE/ADMIN/OWNER allowed; DESIGNER/FACTORY/VIEWER raise P0001; unauthenticated rejected; empty-state returns `[]` not error; result shape validated | 9 |
| F | `rpc_etax_risk_tier_state_admin`: service_role allowed; p_limit 0→1, 500→200, -1→1 (all clamps); p_tier filter; p_org_id filter; combined filters; P0003 on authenticated/anon callers | 10 |
| G | Cross-tenant isolation (mutual RPC opacity); idempotency (duplicate upsert = 1 row); multi-org trigger isolation; rollback/cascade cleanup; `updated_at` is valid ISO timestamp | 7 |

**Total: 52 tests**

---

## Scripts

### `staging_validate_all.sh` — Updated (8 → 10 entries)

Added entries for Migration 0194 and 0195:

```
"0194|${SCRIPT_DIR}/staging_validate_0194.sh"
"0195|${SCRIPT_DIR}/staging_validate_0195.sh"
```

Updated vitest pattern:
```bash
# Before
TEST_PATTERN="src/__tests__/rls/(0186|0187|0188|0189|0190|0191|0192|0193|0194)"

# After
TEST_PATTERN="src/__tests__/rls/(0186|0187|0188|0189|0190|0191|0192|0193|0194|0195)"
```

Updated header comment: dependency chain now reads `0186 → … → 0195`.

---

## App Router

### `src/routes/index.tsx` — Updated to v0.13.0

**New lazy imports (after FinanceDashboard block):**
```tsx
// v15 eTax Observability
const EtaxComplianceDashboard = lazy(() =>
  import('../pages/EtaxComplianceDashboard').then(m => ({
    default: m.EtaxComplianceDashboard ?? (m as any).default,
  }))
);

// v15 Accounting Management
const AccountingManagement = lazy(() =>
  import('../pages/AccountingManagement').then(m => ({
    default: m.AccountingManagement ?? (m as any).default,
  }))
);
```

**New routes (inserted after `/finance`, before `/safety`):**

| Path | Component | Roles |
|---|---|---|
| `/etax` | `EtaxComplianceDashboard` | OWNER, ADMIN, FINANCE |
| `/accounting` | `AccountingManagement` | OWNER, ADMIN, FINANCE |

**Updated ROUTE MAP comment** — added `/etax` and `/accounting` documentation entries.

---

## Full Migration Lineage (0178–0195)

| Migration | Purpose | Status |
|---|---|---|
| 0178 | RLS dedup + hardening | ✅ |
| 0179 | Multi-book dynamic ledger + Chart of Accounts | ✅ |
| 0176 | Auto journal on invoice approval | ✅ |
| 0177 | Auto receipt on payment confirmation | ✅ |
| 0180 | Overdue invoice detection + auto-notification queue | ✅ |
| 0181 | eTax auto-submit pipeline | ✅ |
| 0182 | Organization notification settings (`notification_settings` JSONB) | ✅ |
| 0183 | eTax PDF download pipeline | ✅ |
| 0184 | Scheduled jobs (pg_cron entries) | ✅ |
| 0185 | eTax audit log (`etax_audit_log` table + triggers) | ✅ |
| 0186 | `v_etax_compliance_dashboard` view | ✅ |
| 0187 | `mv_etax_compliance_dashboard` materialized view + pg_cron 15-min refresh | ✅ |
| 0188 | MV refresh-lag alert trigger + `v_mv_refresh_lag` | ✅ |
| 0189 | `v_mv_alert_history` view | ✅ |
| 0190 | `v_etax_submission_health` view | ✅ |
| 0191 | `v_etax_health_trend` (daily 30-day trend) | ✅ |
| 0192 | `mv_etax_health_trend` + pg_cron daily refresh + `rpc_etax_health_trend_cached` | ✅ |
| 0193 | `v_etax_full_health_summary` (composite LEFT JOIN, health_score formula) | ✅ |
| 0194 | `v_etax_org_risk_ranking` (DENSE_RANK, is_priority_review, risk_tier) | ✅ |
| 0195 | `etax_risk_tier_state` + `fn_check_risk_tier_changes` pg_notify trigger | ✅ |

---

## Full Test Suite Inventory (14.x–15.0)

| Test File | Tests | Groups |
|---|---|---|
| `0173_rls_multitenancy.test.ts` | ~80 | A–E |
| `0177_payment_receipt.test.ts` | ~60 | A–E |
| `0180_overdue_detection.test.ts` | ~55 | A–E |
| `0181_etax_auto_submit.test.ts` | ~50 | A–E |
| `0183_etax_pdf_download.test.ts` | ~55 | A–F |
| `0185_etax_audit_log.test.ts` | ~48 | A–F |
| `0186_compliance_dashboard.test.ts` | 37 | A–G |
| `0187_etax_compliance_dashboard_mv.test.ts` | ~45 | A–G |
| `0188_mv_refresh_lag_alert.test.ts` | 42 | A–G |
| `0189_mv_alert_history.test.ts` | 44 | A–G |
| `0190_etax_submission_health.test.ts` | 52 | A–G |
| `0191_etax_health_trend.test.ts` | 57 | A–G |
| `0192_mv_etax_health_trend.test.ts` | 54 | A–G |
| `0193_etax_full_health_summary.test.ts` | 54 | A–G |
| `0194_etax_org_risk_ranking.test.ts` | ~50 | A–G |
| `0195_etax_risk_tier_notify.test.ts` | **52** | **A–G** |
| `0186_0187_integration.test.ts` | ~35 | A–G |
| `0192_0193_integration.test.ts` | 50 | A–G |
| `0193_0194_integration.test.ts` | ~35 | A–G |
| **Total** | **~905** | |

---

## Staging Validators

| Script | Migration | §0–§11 | Status |
|---|---|---|---|
| `staging_validate_0186.sh` | `v_etax_compliance_dashboard` | ✅ | Present |
| `staging_validate_0187.sh` | `mv_etax_compliance_dashboard` | ✅ | Present |
| `staging_validate_0188.sh` | MV refresh-lag alert | ✅ | Present |
| `staging_validate_0189.sh` | `v_mv_alert_history` | ✅ | Present |
| `staging_validate_0190.sh` | `v_etax_submission_health` | ✅ | Present |
| `staging_validate_0191.sh` | `v_etax_health_trend` | ✅ | Present |
| `staging_validate_0192.sh` | `mv_etax_health_trend` | ✅ | Present |
| `staging_validate_0193.sh` | `v_etax_full_health_summary` | ✅ | Present |
| `staging_validate_0194.sh` | `v_etax_org_risk_ranking` | ✅ | Present |
| `staging_validate_0195.sh` | `etax_risk_tier_state` + pg_notify | ✅ | Present |
| `staging_validate_all.sh` | **All 10 entries (0186–0195)** | ✅ | Updated |

---

## UI Pages

| Page | Route | Component | Roles |
|---|---|---|---|
| eTax Compliance Dashboard | `/etax` | `EtaxComplianceDashboard` | OWNER, ADMIN, FINANCE |
| Accounting Management | `/accounting` | `AccountingManagement` | OWNER, ADMIN, FINANCE |

Both pages are lazy-loaded via `import('../pages/...')` — code-split into separate chunks by Vite.

---

## pg_cron Schedule (5 jobs)

| Job | Schedule | Purpose |
|---|---|---|
| `etax-submit-worker` | `*/5 * * * *` | eTax auto-submit queue processor |
| `notify-overdue` | `0 1 * * *` | Daily overdue invoice notification |
| `refresh-etax-compliance-mv` | `*/15 * * * *` | Refresh `mv_etax_compliance_dashboard` |
| `check-mv-refresh-lag` | `*/5 * * * *` | MV freshness alert trigger |
| `refresh-etax-health-trend-mv` | `0 0 * * *` | Daily refresh `mv_etax_health_trend` |

---

## Breaking Changes

None. All new objects are additive. Existing RLS policies, views, and functions remain unchanged.

---

## Upgrade Path

```bash
# 1. Apply all pending migrations in order
supabase db push

# 2. Run staging validation suite
./scripts/staging_validate_all.sh

# 3. Run test suites
npx vitest run "src/__tests__/rls/(0186|0187|0188|0189|0190|0191|0192|0193|0194|0195)"

# 4. Deploy Edge Functions
supabase functions deploy notify-overdue
supabase functions deploy etax-submit-worker
```

---

## Next Phase (Post-Launch)

- [ ] pg_notify consumer Edge Function (subscribe `etax_risk_rank_changed` → webhook/LINE Notify/email)
- [ ] Realtime UI updates (replace 60s polling with Supabase Realtime subscriptions)
- [ ] UI test suites (`EtaxComplianceDashboard.test.tsx`, `AccountingManagement.test.tsx`)
- [ ] e2e tests (`e2e/etax-compliance.spec.ts`, `e2e/accounting-management.spec.ts`)
- [ ] CSV/Excel export from risk ranking table
- [ ] Performance tuning: partition `etax_submissions` by month, index audit
- [ ] OpenAPI/Swagger documentation for all RPCs
