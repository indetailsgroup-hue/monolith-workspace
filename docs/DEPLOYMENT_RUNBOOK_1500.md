# MONOLITH Manufacturing OS — Production Deployment Runbook
## Release 15.0.0

> **Document version:** 1.1.0
> **Release branch:** `release/15.0.0`
> **Target tag:** `v15.0.0`
> **PR:** [#74](https://github.com/indetailsgroup-hue/monolith-workspace/pull/74)
> **Prepared:** 2026-09-01
> **Status:** RC-1 — Approved for production deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Environment Setup](#2-environment-setup)
3. [Pre-flight Validation](#3-pre-flight-validation)
4. [Migration Order & Execution](#4-migration-order--execution)
5. [platform_config Seed](#5-platform_config-seed)
6. [Edge Function Deployment](#6-edge-function-deployment)
7. [pg_cron Job Verification](#7-pg_cron-job-verification)
8. [Post-Deploy Staging Validation](#8-post-deploy-staging-validation)
9. [Smoke Tests](#9-smoke-tests)
10. [Rollback Procedure](#10-rollback-procedure)
11. [Go / No-Go Decision](#11-go--no-go-decision)
12. [Post-Launch Monitoring](#12-post-launch-monitoring)
13. [Partition Archive Procedures](#13-partition-archive-procedures)

---

## 1. Pre-Deployment Checklist

Complete every item before proceeding. One unchecked item = deployment blocked.

### Code & Review

- [ ] PR #74 has at least **1 approved review** from a senior engineer
- [ ] All required GitHub branch protection checks pass:
  - [ ] `TypeScript Type Check`
  - [ ] `Unit Tests`
  - [ ] `Storybook Build`
  - [ ] `Chromatic`
- [ ] `release/15.0.0` branch is up-to-date with `main` (no divergence)
- [ ] CHANGELOG [15.0.0] reviewed: `docs/CHANGELOG_1500_release_notes.md`
- [ ] RC-1 declaration reviewed: `docs/CHANGELOG_1530.md`

### Infrastructure

- [ ] Supabase project-ref for **staging** confirmed and accessible
- [ ] Supabase project-ref for **production** confirmed and accessible
- [ ] `DATABASE_URL` (direct Postgres connection string) available for migration scripts
- [ ] `SUPABASE_SERVICE_ROLE_KEY` for staging and production stored in secrets manager
- [ ] `SUPABASE_ANON_KEY` for staging confirmed
- [ ] Storage bucket `etax-pdfs` exists on production project (create if absent)
- [ ] `pg_net` extension enabled on production Postgres (`CREATE EXTENSION IF NOT EXISTS pg_net`)
- [ ] `pg_cron` extension enabled on production Postgres
- [ ] `pgsodium` / `vault` available for secret rotation (optional but recommended)

### Secrets & Config

- [ ] `etax_risk_notify_url` value confirmed (production Edge Function URL)
- [ ] `etax_risk_notify_secret` value generated and stored securely
- [ ] LINE Notify tokens for each org loaded into `organizations.notification_settings`
- [ ] Revenue Department (RD) eTax API credentials loaded as Edge Function secrets

### Comms

- [ ] Maintenance window communicated to all tenants (recommended: 02:00–04:00 ICT)
- [ ] On-call engineer confirmed for 1-hour post-deploy window
- [ ] Rollback decision authority identified

---

## 2. Environment Setup

### 2.1 Install Supabase CLI

```bash
# macOS / Linux
brew install supabase/tap/supabase

# Verify
supabase --version   # must be >= 1.168.0
```

### 2.2 Authenticate

```bash
supabase login          # opens browser; paste personal access token
supabase projects list  # confirm both staging and production projects appear
```

### 2.3 Set Environment Variables

```bash
# Staging
export STAGING_PROJECT_REF="<staging-project-ref>"
export SUPABASE_URL="https://${STAGING_PROJECT_REF}.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"
export SUPABASE_ANON_KEY="<staging-anon-key>"
export DATABASE_URL="postgresql://postgres:<password>@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres"

# Production (set separately — never mix with staging)
export PROD_PROJECT_REF="<production-project-ref>"
export PROD_DATABASE_URL="postgresql://postgres:<password>@db.${PROD_PROJECT_REF}.supabase.co:5432/postgres"
```

### 2.4 Clone and Checkout

```bash
git clone https://github.com/indetailsgroup-hue/monolith-workspace.git
cd monolith-workspace
git fetch --all --tags
git checkout release/15.0.0
git log --oneline -5   # confirm HEAD is at or after 0132c574e969
```

---

## 3. Pre-flight Validation

### 3.1 Run Pre-flight Script (Staging)

```bash
# Dry-run first — no writes, only checks
./scripts/preflight_db_reset.sh --dry-run

# Full pre-flight if dry-run passes
./scripts/preflight_db_reset.sh
```

**Expected output:** All checks GREEN. Any RED check must be resolved before migration.

Common pre-flight failures and fixes:

| Failure | Resolution |
|---------|-----------|
| `pg_net extension missing` | `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_net;"` |
| `pg_cron extension missing` | `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_cron;"` |
| `etax-pdfs bucket missing` | Create via Supabase dashboard → Storage → New bucket `etax-pdfs`, set RLS |
| `organizations table not found` | Apply `0000_multi_tenant_schema.sql` first (see §4) |

### 3.2 Verify Existing Data Compatibility with Partitioned `etax_submissions`

Migration 0196 converts `etax_submissions` to a partitioned table. Existing rows must
fall within a declared partition range (2024-01 through 2027-03).

```sql
-- Run on staging (and production before migration) to check for out-of-range rows
SELECT
  COUNT(*) AS total_rows,
  MIN(created_at) AS earliest,
  MAX(created_at) AS latest,
  SUM(CASE WHEN created_at < '2024-01-01' THEN 1 ELSE 0 END) AS pre_range_rows,
  SUM(CASE WHEN created_at >= '2027-04-01' THEN 1 ELSE 0 END) AS post_range_rows
FROM etax_submissions;
```

**Action if `pre_range_rows > 0` or `post_range_rows > 0`:**
Either extend the partition range in `0196` or move those rows to the default partition
before applying the migration. Contact the DB lead for guidance.

---

## 4. Migration Order & Execution

### 4.1 Apply to Staging First

```bash
# Link CLI to staging project
supabase link --project-ref $STAGING_PROJECT_REF

# Push all migrations
supabase db push
```

If `supabase db push` is unavailable (self-hosted), apply manually in order:

### 4.2 Manual Migration Order

Apply each file exactly in the order listed. **Do not skip or reorder.**

```bash
PGURL="$DATABASE_URL"   # or $PROD_DATABASE_URL for production

psql "$PGURL" -f supabase/migrations/0000_multi_tenant_schema.sql
psql "$PGURL" -f supabase/migrations/0176_auto_journal_invoice_approval.sql
psql "$PGURL" -f supabase/migrations/0177_auto_receipt_payment_slip.sql
psql "$PGURL" -f supabase/migrations/0178_rls_multibook_hardening.sql
psql "$PGURL" -f supabase/migrations/0179_rls_policies_accounts.sql
psql "$PGURL" -f supabase/migrations/0180_overdue_invoice_detection.sql
psql "$PGURL" -f supabase/migrations/0181_etax_submission_queue.sql
psql "$PGURL" -f supabase/migrations/0182_notification_settings.sql
psql "$PGURL" -f supabase/migrations/0183_etax_pdf_pipeline.sql
psql "$PGURL" -f supabase/migrations/0184_etax_submission_indexes.sql
psql "$PGURL" -f supabase/migrations/0185_etax_submissions_audit_log.sql
psql "$PGURL" -f supabase/migrations/0186_v_etax_compliance_dashboard.sql
psql "$PGURL" -f supabase/migrations/0187_mv_etax_compliance_dashboard.sql
psql "$PGURL" -f supabase/migrations/0188_mv_refresh_lag_alert.sql
psql "$PGURL" -f supabase/migrations/0189_v_mv_alert_history.sql
psql "$PGURL" -f supabase/migrations/0190_v_etax_submission_health.sql
psql "$PGURL" -f supabase/migrations/0191_v_etax_health_trend.sql
psql "$PGURL" -f supabase/migrations/0192_mv_etax_health_trend.sql
psql "$PGURL" -f supabase/migrations/0193_v_etax_full_health_summary.sql
psql "$PGURL" -f supabase/migrations/0194_v_etax_org_risk_ranking.sql
psql "$PGURL" -f supabase/migrations/0195_etax_risk_tier_notify.sql
psql "$PGURL" -f supabase/migrations/01952_b_etax_risk_tier_notify_pgnet.sql
psql "$PGURL" -f supabase/migrations/0196_etax_submissions_partitioning.sql
psql "$PGURL" -f supabase/migrations/0197_partition_archive_log.sql
```

> **Checkpoint after each migration:** `echo $?` — must be `0`. Any non-zero exit means
> the migration failed; see §10 Rollback before proceeding.

### 4.3 Verify Migrations Applied

```sql
-- Check all 24 migrations are recorded in Supabase migration history
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY executed_at;
```

Expected: 24 rows (0000 + 0176–0197 including 0195b).

### 4.4 Migration-Specific Post-Steps

#### After 0187 — Force initial MV refresh

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard;
```

#### After 0192 — Force initial health trend MV refresh

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_health_trend;
```

#### After 0196 — Validate partition routing

```sql
-- Confirm a test row routes to the correct partition
EXPLAIN (ANALYZE false, VERBOSE true)
SELECT * FROM etax_submissions WHERE created_at = '2026-06-15';
-- "Rows Removed by Partition Pruning" should show only 1 partition scanned
```

---

## 5. platform_config Seed

**Required before deploying the `etax-risk-notify` Edge Function.**
Migration 0195b reads these values at trigger runtime; missing rows will cause
`RAISE WARNING` (non-fatal) but no notifications will be delivered.

```sql
-- Run as service_role / postgres superuser
INSERT INTO platform_config (key, value) VALUES
  ('etax_risk_notify_url',
   'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/etax-risk-notify'),
  ('etax_risk_notify_secret',
   '<YOUR_STRONG_SECRET_MIN_32_CHARS>')
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
```

**Verify:**

```sql
SELECT key, LEFT(value, 30) || '...' AS value_preview, updated_at
FROM platform_config
WHERE key IN ('etax_risk_notify_url', 'etax_risk_notify_secret');
```

Expected: 2 rows returned with non-null `value_preview`.

---

## 6. Edge Function Deployment

### 6.1 Set Edge Function Secrets

```bash
# Revenue Department eTax API credentials
supabase secrets set \
  RD_ETAX_API_URL="https://etax.rd.go.th/api/v1" \
  RD_ETAX_API_KEY="<rd-api-key>" \
  --project-ref $PROD_PROJECT_REF

# LINE Notify (global fallback — per-org tokens live in organizations.notification_settings)
supabase secrets set \
  LINE_NOTIFY_TOKEN="<global-fallback-token>" \
  --project-ref $PROD_PROJECT_REF

# Monolith signing secret (must match platform_config etax_risk_notify_secret)
supabase secrets set \
  MONOLITH_NOTIFY_SECRET="<YOUR_STRONG_SECRET_MIN_32_CHARS>" \
  --project-ref $PROD_PROJECT_REF
```

### 6.2 Deploy Functions

```bash
# Deploy in dependency order: notify-overdue first (no upstream deps)
supabase functions deploy notify-overdue \
  --project-ref $PROD_PROJECT_REF

# etax-submit-worker — depends on etax_submissions partitioned table (0196)
supabase functions deploy etax-submit-worker \
  --project-ref $PROD_PROJECT_REF

# etax-risk-notify — depends on platform_config (0195b) and etax_risk_tier_state (0195)
supabase functions deploy etax-risk-notify \
  --project-ref $PROD_PROJECT_REF
```

### 6.3 Verify Deployments

```bash
supabase functions list --project-ref $PROD_PROJECT_REF
```

Expected output — all three functions with `ACTIVE` status:

```
┌──────────────────────┬──────────┬─────────────────────┐
│ Name                 │ Status   │ Updated at          │
├──────────────────────┼──────────┼─────────────────────┤
│ notify-overdue       │ ACTIVE   │ 2026-09-01 …        │
│ etax-submit-worker   │ ACTIVE   │ 2026-09-01 …        │
│ etax-risk-notify     │ ACTIVE   │ 2026-09-01 …        │
└──────────────────────┴──────────┴─────────────────────┘
```

### 6.4 Invoke Smoke Test (Staging Only)

```bash
# Trigger etax-submit-worker manually (no-op if queue is empty)
supabase functions invoke etax-submit-worker \
  --project-ref $STAGING_PROJECT_REF \
  --body '{}'

# Expected: HTTP 200, body: {"processed": 0} or {"processed": N}
```

---

## 7. pg_cron Job Verification

After migrations are applied, confirm all 6 pg_cron jobs are registered:

```sql
SELECT jobname, schedule, active, command
FROM cron.job
ORDER BY jobname;
```

Expected 6 rows:

| jobname | schedule | active |
|---------|----------|--------|
| `auto-create-etax-partition` | `0 0 20 * *` | `t` |
| `check-mv-refresh-lag` | `*/5 * * * *` | `t` |
| `etax-submit-worker` | `*/5 * * * *` | `t` |
| `notify-overdue` | `0 1 * * *` | `t` |
| `refresh-etax-compliance-mv` | `*/15 * * * *` | `t` |
| `refresh-etax-health-trend-mv` | `0 0 * * *` | `t` |

**If any job is missing**, register it manually:

```sql
-- Example: re-register refresh-etax-compliance-mv
SELECT cron.schedule(
  'refresh-etax-compliance-mv',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard$$
);
```

---

## 8. Post-Deploy Staging Validation

Run the full staging validator suite against staging before touching production:

```bash
# Full run — all 13 validators
./scripts/staging_validate_all.sh

# Expected final output:
#   Passed: 13   Failed: 0   Skipped: 0
#   Overall result: PASSED
```

If any validator fails:

```bash
# Run that validator in isolation with verbose output
bash ./scripts/staging_validate_0<N>.sh 2>&1 | tee /tmp/validate_<N>.log
```

**All 13 validators must show PASS before proceeding to production.**

| Validator | What it checks |
|-----------|---------------|
| `0186` | `v_etax_compliance_dashboard` view existence + query |
| `0187` | `mv_etax_compliance_dashboard` freshness + `rpc_etax_compliance_dashboard_cached` |
| `0188` | MV refresh-lag alert trigger threshold |
| `0189` | `v_mv_alert_history` view filtering |
| `0190` | `v_etax_submission_health` health_status bands |
| `0191` | `v_etax_health_trend` 30-day buckets |
| `0192` | `mv_etax_health_trend` + `rpc_etax_health_trend_cached` params |
| `0193` | `v_etax_full_health_summary` joined accuracy |
| `0194` | `v_etax_org_risk_ranking` rank ordering + service_role gate |
| `0195` | `etax_risk_tier_state` + `fn_check_risk_tier_changes` + pg_notify payload |
| `0195b` | `platform_config` table + `net.http_post` in trigger + `rpc_etax_notify_request_status` |
| `0196` | Monthly partitions + `rpc_etax_partition_health` + `v_etax_partition_retention` |
| `0197` | `partition_archive_log` structure + RLS + both RPCs + insert-then-query smoke |

---

## 9. Smoke Tests

Run after production migration is complete, before opening the maintenance window:

### 9.1 Database Smoke Tests

```sql
-- 1. Confirm all views/MVs are queryable
SELECT COUNT(*) FROM v_etax_compliance_dashboard;
SELECT COUNT(*) FROM mv_etax_compliance_dashboard;
SELECT COUNT(*) FROM v_etax_org_risk_ranking;
SELECT COUNT(*) FROM v_etax_full_health_summary;
SELECT COUNT(*) FROM v_etax_partition_retention;

-- 2. Confirm RPCs respond
SELECT * FROM rpc_etax_health_trend_cached(
  p_org_id := (SELECT id FROM organizations LIMIT 1),
  p_days   := 7
) LIMIT 1;

SELECT * FROM rpc_etax_partition_health() LIMIT 3;

SELECT * FROM rpc_partition_archive_log_stats();

-- 3. Confirm partition routing for current month
EXPLAIN (ANALYZE false)
SELECT id FROM etax_submissions
WHERE created_at >= date_trunc('month', now())
  AND created_at <  date_trunc('month', now()) + INTERVAL '1 month'
LIMIT 1;
-- Must show "Partitions selected: 1" not full scan
```

### 9.2 Edge Function Smoke Tests

```bash
# Test etax-risk-notify is reachable (send dummy payload)
curl -X POST \
  "https://${PROD_PROJECT_REF}.supabase.co/functions/v1/etax-risk-notify" \
  -H "Content-Type: application/json" \
  -H "X-Monolith-Secret: $MONOLITH_NOTIFY_SECRET" \
  -d '{"type":"smoke_test","org_id":"00000000-0000-0000-0000-000000000000"}' \
  -w "\nHTTP %{http_code}\n"
# Expected: HTTP 200 (function handles unknown types gracefully)
```

### 9.3 UI Smoke Tests

```bash
# Open the standalone HTML dashboard in a browser:
open "https://<your-cdn-or-bucket-url>/etax-compliance-dashboard.html"

# Or run Playwright E2E against staging:
npx playwright test e2e/etax-compliance.spec.ts --project=chromium
npx playwright test e2e/accounting-management.spec.ts --project=chromium
```

---

## 10. Rollback Procedure

### 10.1 Determine Rollback Scope

| Failure Point | Rollback Action |
|--------------|----------------|
| Migration fails mid-run | See §10.2 — SQL rollback |
| Edge function crashes | Re-deploy previous version (see §10.3) |
| pg_cron jobs fire incorrectly | Pause jobs (see §10.4) |
| Partition migration breaks queries | Promote default partition (see §10.5) |

### 10.2 SQL Migration Rollback

Migrations are non-transactional DDL — you cannot `ROLLBACK` a `CREATE TABLE`.
Instead, undo each migration that was applied by running its inverse manually:

```sql
-- Example: rollback 0197
DROP TABLE IF EXISTS partition_archive_log CASCADE;
DROP VIEW  IF EXISTS v_partition_archive_summary CASCADE;

-- Example: rollback 0196 (partitioning is destructive — restore from backup)
-- ⚠️ Only safe if no production traffic has written to partitioned table
-- 1. Take pg_dump of etax_submissions
-- 2. Drop partitioned table
-- 3. Restore original table from backup
-- 4. Contact Supabase support for assistance if live traffic is affected
```

> **Important:** Rollback of 0196 (partitioning) after live writes is a data-loss risk.
> Always take a full `pg_dump` backup of `etax_submissions` immediately before applying 0196.

### 10.3 Edge Function Rollback

```bash
# Re-deploy the previous function version from the last stable tag
git checkout v14.8.0
supabase functions deploy etax-risk-notify --project-ref $PROD_PROJECT_REF
git checkout release/15.0.0   # restore working tree
```

### 10.4 Pause pg_cron Jobs

```sql
-- Pause all jobs immediately (prevents repeated failures during investigation)
UPDATE cron.job SET active = false
WHERE jobname IN (
  'etax-submit-worker',
  'notify-overdue',
  'refresh-etax-compliance-mv',
  'check-mv-refresh-lag',
  'refresh-etax-health-trend-mv',
  'auto-create-etax-partition'
);
```

### 10.5 Partition Emergency Fallback

If 0196 breaks queries and rollback is not feasible, route all reads to the default
partition while investigation proceeds:

```sql
-- This is a temporary workaround ONLY — not a production configuration
-- All new inserts go to p_default; query performance degrades
ALTER TABLE etax_submissions DETACH PARTITION p_2026_09;
-- ... (repeat for current month partition)
-- Then re-attach after fix:
ALTER TABLE etax_submissions ATTACH PARTITION p_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

---

## 11. Go / No-Go Decision

Complete this section with the deployment lead **before** applying migrations to production.

| Gate | Owner | Status |
|------|-------|--------|
| PR #74 approved (1+ reviews) | Lead Engineer | ☐ |
| All GitHub CI checks green | CI | ☐ |
| `staging_validate_all.sh` → 13 PASS | DevOps | ☐ |
| `platform_config` seeded on staging | DevOps | ☐ |
| Edge functions deployed & smoke-tested on staging | DevOps | ☐ |
| Production backup taken (full pg_dump) | DBA | ☐ |
| Maintenance window announced | PM | ☐ |
| On-call engineer confirmed | Lead Engineer | ☐ |

**Sign-off required from:** Lead Engineer + DBA before proceeding.

```
Lead Engineer sign-off:  _________________________  Date: ___________
DBA sign-off:            _________________________  Date: ___________
```

---

## 12. Post-Launch Monitoring

### First 15 Minutes

```sql
-- 1. Watch pg_cron job runs for errors
SELECT jobid, jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- 2. Check etax_submissions is routing to correct partitions
SELECT tableoid::regclass AS partition, COUNT(*) AS new_rows
FROM etax_submissions
WHERE created_at >= now() - INTERVAL '15 minutes'
GROUP BY 1;

-- 3. Verify MV is refreshing
SELECT now() - mv_last_refreshed_at AS refresh_lag
FROM mv_etax_compliance_dashboard
LIMIT 1;
-- Should be < 16 minutes after first cron run
```

### First Hour

```bash
# Check edge function invocation logs
supabase functions logs etax-submit-worker \
  --project-ref $PROD_PROJECT_REF \
  --tail 50

supabase functions logs etax-risk-notify \
  --project-ref $PROD_PROJECT_REF \
  --tail 50
```

```sql
-- Check notification queue for errors
SELECT type, status, COUNT(*) AS cnt
FROM notification_queue
WHERE created_at >= now() - INTERVAL '1 hour'
GROUP BY 1, 2
ORDER BY 1, 2;

-- Check etax audit log for unexpected transitions
SELECT from_status, to_status, COUNT(*) AS cnt
FROM etax_submission_audit
WHERE changed_at >= now() - INTERVAL '1 hour'
GROUP BY 1, 2
ORDER BY cnt DESC;
```

### Alerts to Watch

| Alert | Threshold | Response |
|-------|-----------|----------|
| `MV_REFRESH_LAG` in notification_queue | > 20 minutes | Check `check-mv-refresh-lag` cron job |
| `etax_submissions` insert failures | Any | Check partition range; run `rpc_etax_partition_health()` |
| `etax_risk_notify` HTTP errors in logs | > 3 consecutive | Check `platform_config` values; re-verify `etax_risk_notify_url` |
| `attempt_count = 5` rows in etax_submissions | Any `status = 'failed'` | Review `last_error`; use `rpc_etax_requeue()` if transient |

---

---

## 13. Partition Archive Procedures

The `scripts/etax_partition_lifecycle.sh` script manages the full lifecycle of
`etax_submissions` monthly partitions — from identification through detach, optional
backup, rename, and audit logging into `partition_archive_log` (Migration 0197).

### 13.1 Identify Archive Candidates

```sql
-- List all partitions flagged ARCHIVE_CANDIDATE (older than 24 months)
SELECT
  partition_name,
  range_start,
  range_end,
  row_count,
  pg_size_pretty(size_bytes) AS size,
  age_months,
  retention_status
FROM v_etax_partition_retention
WHERE retention_status = 'ARCHIVE_CANDIDATE'
ORDER BY range_start;
```

Alternatively, use the RPC (works via Supabase service_role):

```sql
SELECT * FROM rpc_etax_partition_health()
WHERE retention_status = 'ARCHIVE_CANDIDATE';
```

### 13.2 Dry-Run (Safe — No Changes)

Always run `--dry-run` first. The script lists candidates and prints the exact commands
it would execute without touching the database.

```bash
./scripts/etax_partition_lifecycle.sh --dry-run
```

**Expected output:**

```
[DRY-RUN] Found 2 ARCHIVE_CANDIDATE partition(s):
  p_2024_01  (2024-01-01 → 2024-02-01)  rows: 48,291  size: 14 MB
  p_2024_02  (2024-02-01 → 2024-03-01)  rows: 51,004  size: 15 MB

[DRY-RUN] Would execute for p_2024_01:
  ALTER TABLE etax_submissions DETACH PARTITION p_2024_01;
  ALTER TABLE p_2024_01 RENAME TO p_2024_01_archived_20260901;
  INSERT INTO partition_archive_log (...) VALUES (...);

[DRY-RUN] Would execute for p_2024_02:
  ... (same pattern)

[DRY-RUN] Complete. 2 partition(s) would be archived. No changes made.
```

### 13.3 Execute — Detach and Rename Only

Detaches the partition from `etax_submissions` (stops new writes), renames it with
`_archived_YYYYMMDD` suffix, and writes an audit row to `partition_archive_log`.

```bash
./scripts/etax_partition_lifecycle.sh --execute
```

**What this does:**

```sql
-- 1. Detach from parent table
ALTER TABLE etax_submissions DETACH PARTITION p_2024_01;

-- 2. Rename to archived name
ALTER TABLE p_2024_01 RENAME TO p_2024_01_archived_20260901;

-- 3. Audit log insert (action = DETACH_RENAME)
INSERT INTO partition_archive_log (
  partition_name, original_range_start, original_range_end,
  row_count_at_archive, size_bytes_at_archive,
  action, archived_name, archived_by, archived_at, script_version, hostname
) VALUES (
  'p_2024_01', '2024-01-01', '2024-02-01',
  48291, 14680064,
  'DETACH_RENAME', 'p_2024_01_archived_20260901',
  current_user, now(), '1.0.0', inet_server_addr()::text
);
```

**Post-execute verification:**

```sql
-- Confirm partition no longer attached to parent
SELECT relname FROM pg_class
WHERE relname LIKE 'p_2024_01%';
-- Should show: p_2024_01_archived_20260901  (detached table, still exists)

-- Confirm audit log entry
SELECT partition_name, action, archived_name, archived_at
FROM partition_archive_log
WHERE partition_name = 'p_2024_01'
ORDER BY archived_at DESC LIMIT 1;
```

### 13.4 Execute with pg_dump Backup

Adds a `pg_dump` of the partition to a backup directory before renaming.
Use this when you want a restorable snapshot before decommissioning.

```bash
# Set backup directory
export PARTITION_BACKUP_DIR="/mnt/backups/etax-partitions"
mkdir -p "$PARTITION_BACKUP_DIR"

./scripts/etax_partition_lifecycle.sh --execute --backup
```

**What `--backup` adds:**

```bash
# Before rename, pg_dump the detached table
pg_dump "$DATABASE_URL"   --table=p_2024_01   --format=custom   --compress=9   --file="${PARTITION_BACKUP_DIR}/p_2024_01_archived_20260901.pgdump"

# Verify backup integrity
pg_restore --list "${PARTITION_BACKUP_DIR}/p_2024_01_archived_20260901.pgdump"   | head -5
```

The audit row captures `backup_file_path` and `backup_size_bytes`:

```sql
-- action = DETACH_BACKUP_RENAME
SELECT partition_name, action, backup_file_path,
       pg_size_pretty(backup_size_bytes) AS backup_size
FROM partition_archive_log
WHERE partition_name = 'p_2024_01';
```

### 13.5 Execute with Drop (Destructive — Irreversible)

Detaches the partition **and permanently drops it**. Only use after confirming the
partition data is no longer needed and a backup exists.

```bash
# Requires explicit --force flag to prevent accidental drops
./scripts/etax_partition_lifecycle.sh --execute --drop --force
```

> ⚠️ **This operation is irreversible.** The partition table is `DROP TABLE`-ed after
> detaching. Run `--backup` first, then confirm the file is readable and its
> checksum matches the value recorded by the backup procedure.

**Safety gates enforced by the script:**

1. Refuses to run `--drop` without `--force`
2. Verifies the partition is detached before dropping
3. Requires `backup_file_path` in `partition_archive_log` unless `--no-backup-check` is also passed
4. Logs `action = DETACH_BACKUP_DROP` or `DETACH_DROP` in `partition_archive_log`

### 13.6 Query the Archive Log

```sql
-- All archive actions ordered by date
SELECT
  partition_name,
  action,
  archived_name,
  pg_size_pretty(size_bytes_at_archive) AS archived_size,
  archived_by,
  archived_at::date AS date
FROM partition_archive_log
ORDER BY archived_at DESC;

-- Aggregate stats by action type
SELECT * FROM rpc_partition_archive_log_stats();

-- Filter log for a specific partition
SELECT * FROM rpc_partition_archive_log(
  p_partition_name := 'p_2024_01',
  p_from_date      := NULL,
  p_to_date        := NULL,
  p_limit          := 50
);

-- View summary (one row per partition, latest action)
SELECT * FROM v_partition_archive_summary
ORDER BY latest_action_at DESC;
```

### 13.7 Restore an Archived Partition (Emergency)

If a detached (renamed) partition must be re-attached:

```sql
-- 1. Rename back to original name
ALTER TABLE p_2024_01_archived_20260901 RENAME TO p_2024_01;

-- 2. Re-attach to parent
ALTER TABLE etax_submissions ATTACH PARTITION p_2024_01
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- 3. Log the restoration in partition_archive_log (manual)
INSERT INTO partition_archive_log (
  partition_name, action, notes, archived_by, archived_at
) VALUES (
  'p_2024_01', 'DETACH',   -- closest available action; add RESTORE if extended
  'Re-attached for incident investigation — MONOLITH-INC-XXXX',
  current_user, now()
);
```

If restoring from a `pg_dump` backup (partition was dropped):

```bash
# Recreate the partition table
psql "$DATABASE_URL" -c "
  CREATE TABLE p_2024_01
    (LIKE etax_submissions INCLUDING ALL)
    PARTITION OF etax_submissions
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
"

# Restore data
pg_restore   --dbname="$DATABASE_URL"   --table=p_2024_01   --data-only   "${PARTITION_BACKUP_DIR}/p_2024_01_archived_20260901.pgdump"
```

### 13.8 Recommended Monthly Runbook

Run this procedure on the **1st of each month** as part of the monthly ops cycle:

```bash
# Step 1: Review candidates (read-only)
psql "$DATABASE_URL" -c "
  SELECT partition_name, range_start, age_months, pg_size_pretty(size_bytes)
  FROM v_etax_partition_retention
  WHERE retention_status = 'ARCHIVE_CANDIDATE'
  ORDER BY range_start;"

# Step 2: Dry-run to confirm scope
./scripts/etax_partition_lifecycle.sh --dry-run

# Step 3: Backup + archive
export PARTITION_BACKUP_DIR="/mnt/backups/etax-partitions/$(date +%Y%m)"
mkdir -p "$PARTITION_BACKUP_DIR"
./scripts/etax_partition_lifecycle.sh --execute --backup

# Step 4: Verify audit log
psql "$DATABASE_URL" -c "SELECT * FROM rpc_partition_archive_log_stats();"

# Step 5: (Optional) Drop if storage is constrained and backup verified
# ./scripts/etax_partition_lifecycle.sh --execute --drop --force
```


## Appendix A — Quick Reference Commands

```bash
# Re-run failed migration only
psql "$DATABASE_URL" -f supabase/migrations/0196_etax_submissions_partitioning.sql

# Force MV refresh manually
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_health_trend;"

# Check partition health
psql "$DATABASE_URL" -c "SELECT * FROM rpc_etax_partition_health();"

# Run partition archival (dry-run)
./scripts/etax_partition_lifecycle.sh --dry-run

# Run partition archival (live)
./scripts/etax_partition_lifecycle.sh --execute

# Full staging validation
./scripts/staging_validate_all.sh

# Pre-flight check
./scripts/preflight_db_reset.sh

# List edge function secrets
supabase secrets list --project-ref $PROD_PROJECT_REF
```

## Appendix B — Key Table/View Reference

| Object | Type | Migration | Access |
|--------|------|-----------|--------|
| `etax_submissions` | Partitioned table | 0196 | RLS: org_id |
| `etax_risk_tier_state` | Table | 0195 | RLS: org_id (read); service_role (write) |
| `platform_config` | Table | 0195b | service_role only |
| `partition_archive_log` | Table | 0197 | RLS: service_role write; auth blocked from direct read |
| `v_etax_compliance_dashboard` | View | 0186 | RLS-transparent |
| `mv_etax_compliance_dashboard` | MV | 0187 | service_role refresh |
| `v_etax_org_risk_ranking` | View | 0194 | service_role only |
| `v_etax_full_health_summary` | View | 0193 | RLS-transparent |
| `v_etax_partition_retention` | View | 0196 | service_role |

---

*MONOLITH Manufacturing OS — Production Deployment Runbook v1.0.0*
*Indetails Group · Release 15.0.0 · 2026-09-01*
