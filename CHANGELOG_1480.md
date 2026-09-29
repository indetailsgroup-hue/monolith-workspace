# CHANGELOG [14.8.0]

**Branch:** `feat/accounting-rls-multibook`
**PR:** [#46](https://github.com/indetailsgroup-hue/monolith-workspace/pull/46)
**Scope:** Staging Validation Completion · Migration 0195 · eTax Compliance Dashboard UI · Accounting Management UI · Integration Test Suite 0193+0194

---

## Overview

Release 14.8.0 closes the eTax observability stack (migrations 0186–0195) by delivering three
interdependent layers in a single batch:

1. **Staging validator parity** — scripts for migrations 0186, 0187, and 0190 are now present,
   bringing `staging_validate_all.sh` from five SKIP entries to zero; all eight validators pass.
2. **Migration 0195 — pg_notify risk-tier events** — a SECURITY DEFINER trigger function that
   snapshots each org's `risk_tier` state after every MV refresh and fires a Postgres NOTIFY
   event (`etax_risk_rank_changed`) only when the tier actually changes
   (CRITICAL ↔ WARNING ↔ HEALTHY).
3. **eTax Compliance Dashboard UI** — a React/TypeScript page that consumes the three new views
   (`v_etax_compliance_dashboard`, `v_etax_full_health_summary`, `v_etax_org_risk_ranking`) with
   auto-refresh, KPI cards, badge components, and an interactive risk-ranking table.
4. **Accounting Management UI** — a React/TypeScript page for multi-book ledger browsing and
   chart-of-accounts tree management backed by migration 0179.
5. **Integration test suite 0193+0194** — Groups A–G covering the full data path from
   `etax_submissions` through MV refresh into `v_etax_full_health_summary` and
   `v_etax_org_risk_ranking`, including DENSE_RANK accuracy, risk_tier thresholds,
   `is_priority_review` alignment, and RLS tenant isolation.

---

## Migrations

### `0195_etax_risk_tier_notify.sql` — commit `19542b97`

**Purpose:** Emit a real-time pg_notify event whenever an organisation's eTax risk tier
transitions, enabling Edge Functions and external consumers to react without polling.

| Section | Description |
|---------|-------------|
| §0 | Dependency guard — aborts if `v_etax_org_risk_ranking` (0194) is absent |
| §1 | `etax_risk_tier_state` table — PK `org_id`, columns `risk_tier CHECK(IN('CRITICAL','WARNING','HEALTHY'))`, `health_score NUMERIC`, `risk_rank INT`, `updated_at TIMESTAMPTZ`; RLS enabled |
| §2 | `fn_check_risk_tier_changes()` — SECURITY DEFINER trigger function; upserts state snapshot; fires pg_notify only when `v_prev_tier IS DISTINCT FROM v_rec.risk_tier` |
| §3 | Triggers on `etax_compliance_mv_refresh_log` AND `etax_health_trend_mv_refresh_log` (AFTER INSERT) |
| §4 | `rpc_etax_risk_tier_state()` — authenticated, SECURITY DEFINER, OWNER/ADMIN/FINANCE roles, raises P0001 on missing membership |
| §5 | `rpc_etax_risk_tier_state_admin(p_org_id UUID, p_tier TEXT, p_limit INT)` — service_role only, raises P0003, `p_limit` clamped 1–200 |
| §6 | Permission grants: EXECUTE to `authenticated` (§4) and `service_role` (§5) |
| §7 | Verification block: asserts table, function, triggers, and RPCs exist |
| §8 | Rollback instructions |

**pg_notify payload schema:**
```json
{
  "org_id":            "uuid",
  "org_name":          "string",
  "previous_tier":     "CRITICAL|WARNING|HEALTHY|null",
  "new_tier":          "CRITICAL|WARNING|HEALTHY",
  "health_score":      0-100,
  "risk_rank":         integer,
  "health_status":     "critical|warning|healthy",
  "is_priority_review": boolean,
  "transitioned_at":   "ISO8601"
}
```

**RLS policy:** authenticated users may SELECT only their own org's row from
`etax_risk_tier_state`; `service_role` has unrestricted access.

---

## Staging Validation Scripts

### `scripts/staging_validate_0186.sh` — commit `66d484dd`

Validates migration `0186_etax_compliance_dashboard.sql`.

| Section | Coverage |
|---------|----------|
| §1 | Environment / prerequisites |
| §2 | `v_etax_compliance_dashboard` view existence and 14-column schema |
| §3 | RLS — authenticated user sees only own org |
| §4 | `rpc_etax_compliance_dashboard()` — authenticated RPC, OWNER/ADMIN/FINANCE |
| §5 | `rpc_etax_compliance_dashboard_admin()` — service_role, p_org_id / p_status / p_limit |
| §6 | Data accuracy assertions — submitted_count, failed_count, success_rate formula |
| §7 | Cross-tenant isolation: org A cannot read org B rows |
| §8 | p_limit clamp (1–200) |
| §9 | Rollback safety |
| §10 | Dry-run / --no-vitest flags |
| §11 | vitest CI mode |

### `scripts/staging_validate_0187.sh` — commit `c9118fa3`

Validates migration `0187_etax_compliance_dashboard_mv.sql`.

| Section | Coverage |
|---------|----------|
| §1–§3 | Prerequisites, MV existence, unique index `uq_mv_etax_compliance_org` |
| §4 | `rpc_refresh_etax_compliance_mv()` — service_role only |
| §5 | Freshness-lag view `v_mv_refresh_lag` thresholds (fresh < 900 s / stale / critical) |
| §6 | Row count after refresh matches `etax_submissions` aggregate |
| §7 | pg_cron entry `*/15 * * * *` present in `cron.job` |
| §8–§11 | Cross-tenant, p_limit, dry-run, vitest CI |

### `scripts/staging_validate_0190.sh` — commit `5bbaff16`

Validates migration `0190_etax_submission_health.sql`.

| Section | Coverage |
|---------|----------|
| §1–§2 | Prerequisites, `v_etax_submission_health` 17-column schema |
| §3 | `rpc_etax_submission_health()` — authenticated, OWNER/ADMIN/FINANCE |
| §4 | `rpc_etax_submission_health_admin(p_org_id, p_status, p_limit)` — service_role |
| §5 | status-breakdown counters (queued, submitting, submitted, failed, cancelled, exhausted) |
| §6 | `retry_exhaustion_rate_pct` formula accuracy |
| §7–§11 | RLS, p_limit clamp, dry-run, vitest CI |

**All eight entries in `staging_validate_all.sh` now resolve to PASS** (0186, 0187, 0188, 0189,
0190, 0191, 0192, 0193).

---

## UI — eTax Compliance Dashboard

**Stack:** React 18 + TypeScript + Vite + Tailwind + Supabase JS v2

### `src/hooks/useEtaxCompliance.ts` — commit `35e23272`

Auto-refresh hook; fetches all three data sources in parallel every 60 seconds.

```typescript
const { compliance, healthSummary, riskRanking, loading, error, lastRefreshed } =
  useEtaxCompliance({ refreshInterval: 60_000 });
```

- `compliance` → rows from `v_etax_compliance_dashboard`
- `healthSummary` → rows from `v_etax_full_health_summary`
- `riskRanking` → rows from `v_etax_org_risk_ranking` (OWNER/ADMIN/FINANCE only)
- Returns `lastRefreshed: Date` for freshness indicator

### `src/components/etax/HealthScoreBadge.tsx` — commit `8edfb5a0`

Three badge primitives used across the dashboard:

| Component | Props | Behaviour |
|-----------|-------|-----------|
| `HealthScoreBadge` | `score: number` | Green ≥ 80 / Yellow 50–79 / Red < 50 |
| `RiskTierBadge` | `tier: 'CRITICAL'\|'WARNING'\|'HEALTHY'` | Colour-coded pill |
| `FreshnessBadge` | `freshness: 'fresh'\|'stale'\|'critical'` | MV lag indicator |

### `src/components/etax/ComplianceSummaryCards.tsx` — commit `97820f29`

Six-card KPI row:
- Total Submissions · Submitted · Failed · Success Rate · Overdue with Pending eTax · Failed Last 24 h
- MV freshness strip below cards (last refresh timestamp + `FreshnessBadge`)

### `src/components/etax/OrgRiskRankingTable.tsx` — commit `5e6b32ff`

Full risk ranking table:
- Columns: Rank · Organisation · Health Score · Risk Tier · Status · Priority Review · Last Submission
- Sort by any column (client-side)
- Filter by tier (ALL / CRITICAL / WARNING / HEALTHY)
- Full-text search on `org_name`
- Row highlight: red background for CRITICAL, yellow for WARNING

### `src/pages/EtaxComplianceDashboard.tsx` — commit `a7b9ce1c`

Main eTax compliance page with three tabs:
- **Overview** — `ComplianceSummaryCards` + top-5 critical orgs
- **Risk Ranking** — `OrgRiskRankingTable` (full list)
- **Compliance Detail** — per-org drill-down from `v_etax_compliance_dashboard`

---

## UI — Accounting Management

**Backed by:** Migration 0179 (`accounting_books`, `chart_of_accounts`, `journal_entries`, `journal_entry_lines`)

### `src/hooks/useAccounting.ts` — commit `94cc7895`

Three hooks:

| Hook | Returns |
|------|---------|
| `useBooks(orgId)` | List of `accounting_books` for the org |
| `useChartOfAccounts(bookId)` | Recursive account tree (`parent_id` → children) |
| `useJournalEntries(bookId, params)` | Paginated journal entries with line items |

### `src/components/accounting/ChartOfAccounts.tsx` — commit `04901087`

Recursive tree view:
- Expand / collapse account groups
- Inline **Add Account** modal (code, name, type, parent)
- **Edit** and **Deactivate** actions with confirmation
- Account type badges: ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE

### `src/components/accounting/MultiBookLedger.tsx` — commit `589a46aa`

Journal entry list:
- Expand row to view debit/credit line detail
- Paginated (page size: 25)
- Balance check indicator (debit total = credit total per entry)
- Filter by date range, entry status

### `src/pages/AccountingManagement.tsx` — commit `0ac4fa70`

Main accounting page:
- **Book selector sidebar** (48 px collapsed, 240 px expanded)
- Auto-selects default book on load
- Tabs: **Chart of Accounts** / **Journal Ledger**
- Breadcrumb: Organisation → Book → Section

---

## Integration Test Suite

### `src/__tests__/rls/0193_0194_integration.test.ts` — commit `6f2f1aa9`

Full-path integration test: `etax_submissions` → MV refresh → `v_etax_full_health_summary` → `v_etax_org_risk_ranking`

| Group | Description | Tests |
|-------|-------------|-------|
| A | Data pipeline: `etax_submissions` → MVs → views | 5 |
| B | `v_etax_full_health_summary` `health_score` formula correctness | 6 |
| C | `v_etax_org_risk_ranking` DENSE_RANK accuracy | 4 |
| D | `risk_tier` threshold mapping (CRITICAL / WARNING / HEALTHY) | 4 |
| E | `is_priority_review` flag alignment | 3 |
| F | RLS / tenant isolation | 6 |
| G | Edge cases (zero submissions, 100% success, tie-breaking, score bounds) | 7 |
| **Total** | | **35** |

Key assertions:
- `health_score` is bounded `[0, 100]` (GREATEST/LEAST guards)
- DENSE_RANK produces no gaps for distinct scores
- Tie-breaking by `org_id ASC` is deterministic
- `is_priority_review` ≡ `(risk_tier = 'CRITICAL')` for every row
- `v_etax_full_health_summary` and `v_etax_org_risk_ranking` agree on `health_score` for the same org
- Service_role admin RPC `p_limit=200` caps result set; `p_limit=9999` is clamped without error

---

## Checklist

### Staging Validators
- [x] `staging_validate_0186.sh` — §1–§11 ✅
- [x] `staging_validate_0187.sh` — §1–§11 ✅
- [x] `staging_validate_0188.sh` — §1–§11 ✅ (prior release)
- [x] `staging_validate_0189.sh` — §1–§11 ✅ (prior release)
- [x] `staging_validate_0190.sh` — §1–§11 ✅
- [x] `staging_validate_0191.sh` — §1–§11 ✅ (prior release)
- [x] `staging_validate_0192.sh` — §1–§11 ✅ (prior release)
- [x] `staging_validate_0193.sh` — §1–§11 ✅ (prior release)
- [x] `staging_validate_all.sh` — all 8 entries PASS ✅

### Migrations
- [x] `0195_etax_risk_tier_notify.sql` ✅

### UI Files
- [x] `src/hooks/useEtaxCompliance.ts` ✅
- [x] `src/components/etax/HealthScoreBadge.tsx` ✅
- [x] `src/components/etax/ComplianceSummaryCards.tsx` ✅
- [x] `src/components/etax/OrgRiskRankingTable.tsx` ✅
- [x] `src/pages/EtaxComplianceDashboard.tsx` ✅
- [x] `src/hooks/useAccounting.ts` ✅
- [x] `src/components/accounting/ChartOfAccounts.tsx` ✅
- [x] `src/components/accounting/MultiBookLedger.tsx` ✅
- [x] `src/pages/AccountingManagement.tsx` ✅

### Test Suites
- [x] `src/__tests__/rls/0193_0194_integration.test.ts` ✅

---

## Migration Lineage (0186 → 0195)

```
0186 v_etax_compliance_dashboard
  └─ 0187 mv_etax_compliance_dashboard  ──────────────────────────────┐
       └─ 0188 mv_refresh_lag_alert                                   │
            └─ 0189 v_mv_alert_history                                │
0190 v_etax_submission_health                                         │
0191 v_etax_health_trend                                              │
  └─ 0192 mv_etax_health_trend  ──────────────────────────────────────┤
       └─ 0193 v_etax_full_health_summary  (JOIN 0187 MV + 0192 MV)  │
            └─ 0194 v_etax_org_risk_ranking  (DENSE_RANK on 0193)    │
                 └─ 0195 etax_risk_tier_state  ◄─── triggers ─────────┘
                          pg_notify: etax_risk_rank_changed
```

---

*Generated: 2026-09-01 | MONOLITH Manufacturing OS*
