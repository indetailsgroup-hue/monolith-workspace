# CHANGELOG [15.0.0] — MONOLITH Manufacturing OS
## Full Release Notes for PR #74 (`release/15.0.0 → main`)

> **Release date:** 2026-09-01
> **Branch:** `release/15.0.0`
> **PR:** [#74](https://github.com/indetailsgroup-hue/monolith-workspace/pull/74)
> **Tag:** `v15.0.0` (pending merge)
> **Previous stable tag:** `v14.8.0`

---

## Overview

Version 15.0.0 is the first production-ready release of the **MONOLITH Manufacturing OS
eTax Compliance & Accounting Infrastructure** layer. It delivers end-to-end eTax
submission automation, multi-tenant RLS hardening, real-time risk monitoring, observability
views, partition-based data lifecycle management, and the full eTax Compliance and
Accounting Management UI — all running on a Supabase (PostgreSQL + Edge Functions) backend
with a React 18 + TypeScript frontend.

---

## Contents

1. [Database Migrations](#database-migrations)
2. [Edge Functions](#edge-functions)
3. [Test Suites](#test-suites)
4. [Staging Validators & Scripts](#staging-validators--scripts)
5. [UI Components](#ui-components)
6. [Configuration](#configuration)
7. [Documentation & OpenAPI](#documentation--openapi)
8. [Breaking Changes & Migration Order](#breaking-changes--migration-order)
9. [Upgrade Checklist](#upgrade-checklist)

---

## Database Migrations

All migrations target the `release/15.0.0` branch under `supabase/migrations/`.
Apply them **in numeric order** on a fresh or reset database.

### Foundation

#### `0000_multi_tenant_schema.sql`
Bootstrap schema for multi-tenant isolation. Creates `organizations`, `org_members`,
`get_user_org_id()` helper, and baseline RLS policy structure. All subsequent migrations
depend on this foundation.

### Accounting Core

#### `0176_auto_journal_invoice_approval.sql`
- Adds `fn_auto_journal_on_invoice_approval()` trigger function
- Fires `AFTER UPDATE ON invoices` when `status` transitions to `approved`
- Auto-inserts journal entries: DR 1200 Accounts Receivable / CR 4100 Revenue (net) / CR 2200 VAT Payable (7%)
- RLS: `org_id` isolated; `SECURITY DEFINER` with explicit search path

#### `0177_auto_receipt_posting.sql`
- Adds `fn_auto_receipt_on_payment_slip_confirm()` trigger
- Fires when `payment_slips.status` → `confirmed`
- Auto-posts receipt: DR 1100 Cash/Bank / CR 1200 Accounts Receivable
- Idempotency guard prevents duplicate posting on re-confirmation

#### `0178_multi_tenant_rls_hardening.sql`
- Pluralizes all singular table references from legacy schema
- Adds `IF NOT EXISTS` guards on all `org_id` column additions
- Hardens RLS policies across `invoices`, `payment_slips`, `journal_entries`,
  `receipts`, `books`, `book_entries`
- Fixes `get_user_org_id()` to use `org_members` join (not deprecated `users.org_id`)

#### `0179_multi_book_support.sql`
- Adds `book_id UUID NOT NULL REFERENCES books(id)` to `journal_entries` and `book_entries`
- Creates `rpc_list_books(p_org_id)` RPC for multi-book selection UI
- Updates journal-posting triggers (0176, 0177) to respect `book_id`

### Notification Infrastructure

#### `0180_overdue_invoice_detection.sql`
- Adds `overdue_invoices` view: selects `invoices` where `due_date < now()` and `status = 'approved'`
- Creates `fn_queue_overdue_notifications()` — inserts into `notification_queue` for each overdue invoice
- Scheduled via pg_cron `notify-overdue` cron job (01:00 UTC daily)

#### `0181_notification_queue.sql`
- Creates `notification_queue` table: `id`, `org_id`, `type`, `payload JSONB`, `status`, `attempt_count`, `created_at`, `processed_at`
- RLS: org-scoped read; service_role full access
- Adds `fn_mark_notification_processed()` AFTER-UPDATE trigger

#### `0182_org_notification_settings.sql`
- Adds `notification_settings JSONB DEFAULT '{}'` to `organizations`
- Schema: `{ "line_notify_token": "...", "webhook_url": "...", "overdue_alerts": true, "etax_alerts": true }`
- No migration data; existing rows get empty object default

### eTax Pipeline

#### `0183_etax_pdf_pipeline.sql`
- Adds `pdf_status` (`pending` / `generating` / `ready` / `failed`) and `pdf_path TEXT` to `etax_submissions`
- Creates `fn_queue_pdf_generation()` trigger: fires when `etax_submissions.status` → `submitted`
- `rpc_etax_pdf_ready(p_submission_id)` marks a submission's PDF as ready
- Storage bucket policy: `etax-pdfs` bucket, org-scoped read

#### `0184_etax_retry_hardening.sql`
- Caps `attempt_count` at 5; transitions to `failed` after max retries
- Adds `last_error TEXT` and `next_retry_at TIMESTAMPTZ` columns
- `rpc_etax_requeue(p_submission_id)` resets a failed submission for manual retry
- Idempotency: prevents re-queuing a submission already in `submitting` state

#### `0185_etax_audit_log.sql`
- Creates `etax_submission_audit` table: immutable append-only log of all status transitions
- Columns: `id`, `submission_id`, `org_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `notes`
- RLS: authenticated can read own org; service_role full access; no UPDATE/DELETE
- `fn_etax_audit_on_status_change()` AFTER UPDATE trigger on `etax_submissions`

### Observability Views

#### `0186_v_etax_compliance_dashboard.sql`
- Creates `v_etax_compliance_dashboard` view
- Columns: `org_id`, `total_submissions`, `submitted_count`, `failed_count`, `pending_count`,
  `cancellation_rate`, `avg_attempt_count`, `last_submission_at`, `compliance_score`
- Aggregated per-org from `etax_submissions`; RLS-transparent

#### `0187_mv_etax_compliance_dashboard.sql`
- Wraps `v_etax_compliance_dashboard` as `mv_etax_compliance_dashboard` materialized view
- pg_cron: `refresh-etax-compliance-mv` runs every 15 minutes (`*/15 * * * *`)
- `rpc_etax_compliance_dashboard_cached()` RPC serves from MV; falls back to live view on stale
- Adds `mv_last_refreshed_at` column to track freshness

#### `0188_mv_refresh_lag_alert.sql`
- Creates `fn_check_mv_refresh_lag()` — fires when `mv_last_refreshed_at` exceeds 20-minute threshold
- Inserts into `notification_queue` with `type = 'MV_REFRESH_LAG'`
- pg_cron: `check-mv-refresh-lag` runs every 5 minutes (`*/5 * * * *`)

#### `0189_v_mv_alert_history.sql`
- Creates `v_mv_alert_history` view over `notification_queue`
- Filters `type IN ('MV_REFRESH_LAG', 'ETAX_RISK_RANK_CHANGED')`
- Columns: `id`, `org_id`, `type`, `payload`, `status`, `created_at`, `resolved_at`

#### `0190_v_etax_submission_health.sql`
- Creates `v_etax_submission_health` per-org health snapshot view
- Derived fields: `health_status` (`HEALTHY` / `WARNING` / `CRITICAL`),
  `failed_rate`, `retry_pressure`, `stale_queue_depth`

#### `0191_v_etax_health_trend.sql`
- Creates `v_etax_health_trend` 30-day daily trend view
- Buckets submissions by `DATE(created_at)` for the last 30 days
- Columns: `org_id`, `trend_date`, `daily_submitted`, `daily_failed`, `daily_health_score`

#### `0192_mv_etax_health_trend.sql`
- Wraps `v_etax_health_trend` as `mv_etax_health_trend` materialized view
- pg_cron: `refresh-etax-health-trend-mv` runs daily at midnight (`0 0 * * *`)
- `rpc_etax_health_trend_cached(p_org_id, p_days)` RPC for dashboard consumption

#### `0193_v_etax_full_health_summary.sql`
- Creates `v_etax_full_health_summary` — joins compliance dashboard MV + health trend MV
- Single-query org health snapshot: compliance score, trend direction, last 7-day delta,
  risk band, priority review flag
- Used as primary data source for eTax Compliance Dashboard UI

#### `0194_v_etax_org_risk_ranking.sql`
- Creates `v_etax_org_risk_ranking` cross-org risk ranking view (service_role only)
- Ranks all organizations by `health_score DESC`, assigns `risk_rank INT`
- Columns: `org_id`, `org_name`, `health_score`, `risk_tier`, `risk_rank`,
  `total_submissions`, `compliance_score`, `is_priority_review`

### Risk Tier & Alerting

#### `0195_etax_risk_tier_state.sql`
- Creates `etax_risk_tier_state` table: `org_id PK`, `risk_tier`, `health_score`, `risk_rank`, `updated_at`
- `fn_check_risk_tier_changes()` trigger: fires after UPDATE on `etax_risk_tier_state`
- Emits `pg_notify('etax_risk_rank_changed', payload_json)` on tier transitions
- Payload fields (9): `org_id`, `org_name`, `previous_tier`, `new_tier`, `health_score`,
  `risk_rank`, `health_status`, `is_priority_review`, `transitioned_at`
- `rpc_etax_risk_tier_state(p_org_id)` RPC for authenticated read

#### `01952_b_etax_risk_tier_notify_pgnet.sql`
- Patches `fn_check_risk_tier_changes()` to dispatch HTTP POST via `net.http_post()`
- Reads `etax_risk_notify_url` and `etax_risk_notify_secret` from `platform_config` table at runtime
- Creates `platform_config` table: PK `key TEXT`, columns `value TEXT`, `updated_at`
- Fault isolation: `EXCEPTION WHEN OTHERS → RAISE WARNING` ensures pg_net failure never aborts the transaction
- `rpc_etax_notify_request_status(p_request_id)` debug RPC for inspecting `net.http_response_collector`

### Partition Architecture

#### `0196_etax_submissions_monthly_partition.sql`
- Converts `etax_submissions` to `PARTITION BY RANGE (created_at)` (monthly)
- 39 explicit monthly partitions: `p_2024_01` through `p_2027_03`
- Default partition `p_default` catches out-of-range rows
- Cross-partition unique index via trigger (preserves `id` + `org_id` uniqueness)
- `fn_auto_create_next_etax_partition()` — pg_cron monthly auto-provisioning (`0 0 20 * *`)
- `rpc_etax_partition_health()` — returns row counts, size, and last-insert per partition
- `v_etax_partition_retention` — flags partitions older than 24 months as `ARCHIVE_CANDIDATE`

#### `0197_partition_archive_log.sql`
- Creates `partition_archive_log` audit table (append-only, service_role writes)
- Columns: `id BIGSERIAL PK`, `partition_name`, `original_range_start`, `original_range_end`,
  `row_count_at_archive`, `size_bytes_at_archive`, `action` (CHECK constraint:
  `DETACH` / `DETACH_RENAME` / `DETACH_DROP` / `DETACH_BACKUP_RENAME` / `DETACH_BACKUP_DROP`),
  `archived_name`, `backup_file_path`, `backup_size_bytes`, `archived_by`,
  `archived_at`, `notes`, `script_version`, `hostname`, `created_at`, `updated_at`
- RLS: service_role full CRUD; authenticated role **blocked** from direct reads
- `v_partition_archive_summary` — per-partition aggregate of archive actions
- `rpc_partition_archive_log(p_partition_name, p_from_date, p_to_date, p_limit)` — filtered log query
- `rpc_partition_archive_log_stats()` — aggregate stats by action type
- `fn_partition_archive_log_set_updated_at` BEFORE UPDATE trigger

---

## Edge Functions

All functions live under `supabase/functions/` and are deployed via
`supabase functions deploy --project-ref <ref>`.

### `notify-overdue/index.ts`
- Triggered by pg_cron at 01:00 UTC daily
- Reads `notification_queue` for `type = 'OVERDUE_INVOICE'` entries
- Dispatches LINE Notify (if `line_notify_token` present) and/or POST to `webhook_url`
- Respects per-org `notification_settings.overdue_alerts` flag
- Marks processed entries via `rpc_mark_notification_processed`

### `etax-submit-worker/index.ts`
- Triggered by pg_cron every 5 minutes (`*/5 * * * *`)
- Polls `etax_submissions` for `status = 'queued'` rows
- Submits to Revenue Department eTax API (RD API), updates `status` → `submitted` / `failed`
- Inline PDF download: fetches PDF URL from RD API response, stores to `etax-pdfs` storage bucket
- Respects `attempt_count` cap (max 5), sets `next_retry_at` on transient failure
- Idempotency: acquires advisory lock on `submission_id` before processing

### `etax-risk-notify/index.ts` (357 lines)
- Subscribes to `etax_risk_rank_changed` pg_notify channel via Supabase Realtime
- Filters for `new_tier = 'CRITICAL'` transitions
- Dispatches LINE Notify message and/or HTTP POST webhook
- Reads target URL and secret from `platform_config` (`etax_risk_notify_url`, `etax_risk_notify_secret`)
- Signed request: `X-Monolith-Secret` header on every outbound call
- Graceful error handling: logs failures without crashing the listener loop

---

## Test Suites

All test files live under `src/__tests__/` (unit/integration) and `e2e/` (Playwright).

### Migration Tests (`src/__tests__/migrations/`)

| File | Lines | Coverage |
|------|-------|----------|
| `0176_auto_journal.test.ts` | ~280 | trigger fire, DR/CR amounts, VAT split, idempotency |
| `0177_receipt_posting.test.ts` | ~260 | payment_slip confirm → receipt, duplicate guard |
| `0178_rls_hardening.test.ts` | ~350 | cross-org isolation, plural table names, IF NOT EXISTS |
| `0179_multi_book.test.ts` | ~230 | book_id propagation, rpc_list_books |
| `0180_overdue_detection.test.ts` | ~220 | overdue view accuracy, queue insert |
| `0181_notification_queue.test.ts` | ~200 | insert, RLS, mark-processed trigger |
| `0182_org_notification_settings.test.ts` | ~180 | JSONB default, partial update |
| `0183_etax_pdf_pipeline.test.ts` | ~310 | pdf_status transitions, trigger on submit |
| `0184_etax_retry.test.ts` | ~290 | max retry cap, requeue RPC, idempotency |
| `0185_etax_audit_log.test.ts` | ~340 | immutable log, RLS, trigger on status change |
| `0186_compliance_dashboard.test.ts` | ~380 | view accuracy, compliance_score formula |
| `0187_mv_compliance_dashboard.test.ts` | ~420 | MV data, staleness, refresh, rpc_cached |
| `0188_mv_refresh_lag.test.ts` | ~390 | alert trigger threshold, notification_queue insert |
| `0189_alert_history.test.ts` | ~310 | view filtering, type enum, resolved_at |
| `0190_submission_health.test.ts` | ~360 | health_status bands, failed_rate formula |
| `0191_health_trend.test.ts` | ~380 | 30-day buckets, daily_health_score |
| `0192_mv_health_trend.test.ts` | ~440 | MV freshness, rpc_etax_health_trend_cached params |
| `0193_full_health_summary.test.ts` | ~420 | joined summary, trend_direction, priority_review |
| `0194_org_risk_ranking.test.ts` | ~380 | rank ordering, is_priority_review, service_role gate |
| `0195_risk_tier_state.test.ts` | ~390 | pg_notify payload, tier transition logic |
| `0195b_pgnet_notify.test.ts` | **636** | pg_net POST dispatch, platform_config resolution, fault isolation, rpc_etax_notify_request_status |
| `0196_monthly_partition.test.ts` | ~460 | partition routing, cross-partition unique, rpc_partition_health |
| `0197_partition_archive_log.test.ts` | **718** | insert, RLS enforcement, rpc_partition_archive_log filtering, rpc_partition_archive_log_stats aggregates, cross-tenant isolation |

### RLS Tests (`src/__tests__/rls/`)

Migration-level RLS policy tests for 0186–0195 covering AUTHENTICATED cross-org
isolation, SERVICE_ROLE bypass, and ANON rejection.

### UI Tests (`src/__tests__/ui/`)

| File | Coverage |
|------|----------|
| `EtaxComplianceDashboard.test.tsx` | render, risk tier chips, health score bar, sort by rank, loading/error states |
| `AccountingManagement.test.tsx` | multi-book selector, invoice approval flow, receipt posting confirmation |

### E2E Tests (`e2e/`)

| File | Coverage |
|------|----------|
| `etax-compliance.spec.ts` | full Playwright flow: login → eTax dashboard → drill-down → export |
| `accounting-management.spec.ts` | invoice create → approve → journal confirmation → receipt |

---

## Staging Validators & Scripts

### Per-Migration Staging Validators (`scripts/`)

13 standalone bash scripts, each independently verifiable against a live Supabase instance:

```
staging_validate_0186.sh   staging_validate_0187.sh   staging_validate_0188.sh
staging_validate_0189.sh   staging_validate_0190.sh   staging_validate_0191.sh
staging_validate_0192.sh   staging_validate_0193.sh   staging_validate_0194.sh
staging_validate_0195.sh   staging_validate_0195b.sh  staging_validate_0196.sh
staging_validate_0197.sh
```

Each script:
- Checks table/view/MV existence via `information_schema`
- Validates RLS policies via `pg_policies`
- Calls RPCs and asserts response shape
- Runs a lightweight insert-then-query smoke test
- Accepts `--dry-run` (mock CI) and `--no-vitest` flags
- Exits 0 on PASS, 1 on FAIL

### Master Orchestrator

**`scripts/staging_validate_all.sh`** — chains all 13 validators in dependency order,
produces a colour-coded pass/fail summary table, and runs a combined vitest suite across
`src/__tests__/(rls|migrations)/` covering 0186–0197.

```bash
./scripts/staging_validate_all.sh             # full run
./scripts/staging_validate_all.sh --dry-run   # mock CI, no DB calls
./scripts/staging_validate_all.sh --no-vitest # skip vitest, DB-only
```

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `scripts/preflight_db_reset.sh` | Pre-flight checklist before `supabase db reset`; `--dry-run` supported |
| `scripts/etax_partition_lifecycle.sh` | DETACH + ARCHIVE `etax_submissions` partitions flagged as `ARCHIVE_CANDIDATE`; writes audit rows to `partition_archive_log`; `--dry-run` / `--execute` modes |

---

## UI Components

### eTax Compliance Dashboard (`src/components/EtaxComplianceDashboard.tsx`)
- Real-time org risk ranking table (sourced from `v_etax_org_risk_ranking`)
- Risk tier chips: CRITICAL (red) / WARNING (amber) / HEALTHY (green)
- Health score progress bars with trend arrow (7-day delta)
- Priority review flag column
- Sort by rank, health score, org name
- Auto-refresh every 60 seconds via Supabase Realtime subscription on `etax_risk_tier_state`

### Accounting Management (`src/components/AccountingManagement.tsx`)
- Multi-book selector (calls `rpc_list_books`)
- Invoice list with one-click approval (calls `rpc_approve_invoice`)
- Journal preview modal showing DR/CR lines before confirmation
- Receipt posting status indicator per invoice
- Filters: status, date range, book_id

### Standalone HTML Dashboard (`public/etax-compliance-dashboard.html`)
- Zero-dependency static page (vanilla JS + Supabase REST API)
- Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `<meta>` tags or URL params
- Polls `rpc_etax_health_trend_cached` and `v_etax_org_risk_ranking` via REST
- Auto-refreshes every 30 seconds; works behind a CDN without a build step

### App Router (`src/routes/index.tsx` v0.13.0)
- `/etax-compliance` → `<EtaxComplianceDashboard />`
- `/accounting` → `<AccountingManagement />`
- Both routes require `FINANCE` or `ADMIN` role (guarded by `<RequireRole>` wrapper)

---

## Configuration

### `supabase/config.toml`

Six pg_cron jobs registered:

| Job name | Schedule | Purpose |
|----------|----------|---------|
| `etax-submit-worker` | `*/5 * * * *` | Process eTax submission queue |
| `notify-overdue` | `0 1 * * *` | Dispatch overdue invoice alerts |
| `refresh-etax-compliance-mv` | `*/15 * * * *` | Refresh compliance dashboard MV |
| `check-mv-refresh-lag` | `*/5 * * * *` | Alert on MV staleness |
| `refresh-etax-health-trend-mv` | `0 0 * * *` | Refresh health trend MV (daily) |
| `auto-create-etax-partition` | `0 0 20 * *` | Auto-provision next month's partition |

Three Edge Function sections: `notify-overdue`, `etax-submit-worker`, `etax-risk-notify`.

---

## Documentation & OpenAPI

### `docs/openapi_monolith_rpcs.yaml` — v15.2.0

OpenAPI 3.0 specification covering all RPCs introduced in migrations 0176–0197:

**14 paths · 28 schemas · 6 tags**

| Tag | Paths |
|-----|-------|
| Accounting | `rpc_approve_invoice`, `rpc_void_invoice`, `rpc_list_books` |
| eTax Submission | `rpc_etax_pdf_ready`, `rpc_etax_requeue` |
| eTax Compliance | `rpc_etax_compliance_dashboard_cached`, `rpc_etax_health_trend_cached`, `rpc_etax_risk_tier_state` |
| eTax Notifications | `rpc_etax_notify_request_status` |
| Partition Management | `rpc_etax_partition_health`, `rpc_partition_archive_log`, `rpc_partition_archive_log_stats` |
| Notification | `rpc_mark_notification_processed` |

### CHANGELOGs

Full version history: `docs/CHANGELOG_1400.md` through `docs/CHANGELOG_1530.md`

---

## Breaking Changes & Migration Order

> ⚠️ Migrations **must** be applied in numeric order. Skipping any migration will cause
> foreign key or trigger dependency failures.

```
0000_multi_tenant_schema.sql        ← REQUIRED FIRST (bootstrap)
0176_auto_journal_invoice_approval.sql
0177_auto_receipt_posting.sql
0178_multi_tenant_rls_hardening.sql
0179_multi_book_support.sql
0180_overdue_invoice_detection.sql
0181_notification_queue.sql
0182_org_notification_settings.sql
0183_etax_pdf_pipeline.sql
0184_etax_retry_hardening.sql
0185_etax_audit_log.sql
0186_v_etax_compliance_dashboard.sql
0187_mv_etax_compliance_dashboard.sql
0188_mv_refresh_lag_alert.sql
0189_v_mv_alert_history.sql
0190_v_etax_submission_health.sql
0191_v_etax_health_trend.sql
0192_mv_etax_health_trend.sql
0193_v_etax_full_health_summary.sql
0194_v_etax_org_risk_ranking.sql
0195_etax_risk_tier_state.sql
01952_b_etax_risk_tier_notify_pgnet.sql ← patch, after 0195
0196_etax_submissions_monthly_partition.sql
0197_partition_archive_log.sql
```

**Schema changes that require attention:**

| Change | Impact |
|--------|--------|
| `etax_submissions` partitioned by `created_at` (0196) | Existing rows must fall within a declared partition range. Run `preflight_db_reset.sh` to validate before applying. |
| `partition_archive_log` RLS blocks authenticated reads (0197) | All log reads must go through `rpc_partition_archive_log` or `rpc_partition_archive_log_stats` — no direct `SELECT`. |
| `platform_config` table (0195b) | Requires manual INSERT of `etax_risk_notify_url` and `etax_risk_notify_secret` before deploying `etax-risk-notify` Edge Function. |

---

## Upgrade Checklist

```bash
# 1. Pre-flight
./scripts/preflight_db_reset.sh --dry-run
./scripts/preflight_db_reset.sh

# 2. Apply migrations (Supabase CLI)
supabase db reset --linked                        # on staging
supabase db push --project-ref <prod-ref>         # on production

# 3. Seed platform_config
psql $DATABASE_URL <<'SQL'
INSERT INTO platform_config (key, value) VALUES
  ('etax_risk_notify_url',    'https://your-edge-function-url/etax-risk-notify'),
  ('etax_risk_notify_secret', 'your-secret-here')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL

# 4. Deploy edge functions
supabase functions deploy notify-overdue        --project-ref <ref>
supabase functions deploy etax-submit-worker    --project-ref <ref>
supabase functions deploy etax-risk-notify      --project-ref <ref>

# 5. Validate staging
./scripts/staging_validate_all.sh

# 6. Merge & tag
# Approve PR #74 in GitHub → merge → tag v15.0.0
git tag v15.0.0 <merge-commit-sha>
git push origin v15.0.0
```

---

*MONOLITH Manufacturing OS — Release 15.0.0 · Built by Indetails Group*
