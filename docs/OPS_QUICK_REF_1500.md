# MONOLITH Manufacturing OS — Ops Quick Reference Card
## Release 15.0.0 · 2026-09-01

> Full details: `docs/DEPLOYMENT_RUNBOOK_1500.md` · OpenAPI: `docs/openapi_monolith_rpcs.yaml`

---

## pg_cron Jobs (6)

| Job Name | Schedule | Function | Managed By |
|----------|----------|----------|------------|
| `etax-submit-worker` | `*/5 * * * *` | Process queued eTax submissions; inline PDF download; max 5 retries | Edge Fn |
| `check-mv-refresh-lag` | `*/5 * * * *` | Alert if `mv_etax_compliance_dashboard` stale > 20 min → `notification_queue` | DB trigger |
| `refresh-etax-compliance-mv` | `*/15 * * * *` | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard` | pg_cron |
| `notify-overdue` | `0 1 * * *` | Dispatch overdue invoice LINE/webhook alerts per org `notification_settings` | Edge Fn |
| `refresh-etax-health-trend-mv` | `0 0 * * *` | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_health_trend` | pg_cron |
| `auto-create-etax-partition` | `0 0 20 * *` | Auto-provision next month's `etax_submissions` partition via `fn_auto_create_next_etax_partition()` | DB fn |

**Check all jobs:**
```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```
**Pause all jobs (emergency):**
```sql
UPDATE cron.job SET active = false WHERE jobname IN ('etax-submit-worker','notify-overdue','refresh-etax-compliance-mv','check-mv-refresh-lag','refresh-etax-health-trend-mv','auto-create-etax-partition');
```

---

## Edge Functions (3)

| Function | Trigger | Key Env Vars | Timeout |
|----------|---------|-------------|---------|
| `notify-overdue` | pg_cron `0 1 * * *` | `LINE_NOTIFY_TOKEN` | 30 s |
| `etax-submit-worker` | pg_cron `*/5 * * * *` | `RD_ETAX_API_URL`, `RD_ETAX_API_KEY` | 60 s |
| `etax-risk-notify` | pg_notify `etax_risk_rank_changed` via pg_net | `MONOLITH_NOTIFY_SECRET` | 30 s |

**Deploy all:**
```bash
supabase functions deploy notify-overdue etax-submit-worker etax-risk-notify --project-ref $PROD_PROJECT_REF
```
**View logs:**
```bash
supabase functions logs etax-submit-worker --project-ref $PROD_PROJECT_REF --tail 50
supabase functions logs etax-risk-notify   --project-ref $PROD_PROJECT_REF --tail 50
```
**Smoke test:**
```bash
supabase functions invoke etax-submit-worker --project-ref $STAGING_PROJECT_REF --body '{}'
```

---

## Staging Validators (13)

Run master script: `./scripts/staging_validate_all.sh`
Expected result: **Passed: 13   Failed: 0   Skipped: 0**

| # | Script | Migration | Primary Object Validated |
|---|--------|-----------|-------------------------|
| 1 | `staging_validate_0186.sh` | 0186 | `v_etax_compliance_dashboard` view |
| 2 | `staging_validate_0187.sh` | 0187 | `mv_etax_compliance_dashboard` MV + freshness |
| 3 | `staging_validate_0188.sh` | 0188 | MV refresh-lag alert trigger (20-min threshold) |
| 4 | `staging_validate_0189.sh` | 0189 | `v_mv_alert_history` type filtering |
| 5 | `staging_validate_0190.sh` | 0190 | `v_etax_submission_health` HEALTHY/WARNING/CRITICAL bands |
| 6 | `staging_validate_0191.sh` | 0191 | `v_etax_health_trend` 30-day daily buckets |
| 7 | `staging_validate_0192.sh` | 0192 | `mv_etax_health_trend` + `rpc_etax_health_trend_cached` |
| 8 | `staging_validate_0193.sh` | 0193 | `v_etax_full_health_summary` joined accuracy |
| 9 | `staging_validate_0194.sh` | 0194 | `v_etax_org_risk_ranking` rank order + service_role gate |
| 10 | `staging_validate_0195.sh` | 0195 | `etax_risk_tier_state` + `fn_check_risk_tier_changes` + pg_notify |
| 11 | `staging_validate_0195b.sh` | 0195b | `platform_config` + `net.http_post` in trigger + `rpc_etax_notify_request_status` |
| 12 | `staging_validate_0196.sh` | 0196 | Monthly partitions + `rpc_etax_partition_health` + `v_etax_partition_retention` |
| 13 | `staging_validate_0197.sh` | 0197 | `partition_archive_log` RLS + both RPCs + smoke test |

**Flags:** `--dry-run` (no DB) · `--no-vitest` (DB-only, skip vitest)

---

## Key RPCs — Cheat Sheet

### Accounting

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_approve_invoice(p_invoice_id)` | UUID | Triggers auto-journal (0176); returns updated invoice |
| `rpc_void_invoice(p_invoice_id, p_reason)` | UUID, TEXT | Reversal journal entries posted |
| `rpc_list_books(p_org_id)` | UUID | Multi-book selector; returns `[{id, name, currency}]` |

### eTax Submission

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_etax_pdf_ready(p_submission_id)` | UUID | Marks PDF as ready; sets `pdf_status = 'ready'` |
| `rpc_etax_requeue(p_submission_id)` | UUID | Resets failed submission; blocked if already `submitting` |

### eTax Compliance & Health

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_etax_compliance_dashboard_cached()` | — | Reads from MV; falls back to live view if stale |
| `rpc_etax_health_trend_cached(p_org_id, p_days)` | UUID, INT | Returns daily trend rows from `mv_etax_health_trend` |
| `rpc_etax_risk_tier_state(p_org_id)` | UUID | Current risk tier + health score for org |

### eTax Notifications

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_etax_notify_request_status(p_request_id)` | BIGINT | Inspects `net.http_response_collector` for a pg_net request |

### Partition Management

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_etax_partition_health()` | — | Row counts, size, last-insert per partition |
| `rpc_partition_archive_log(p_partition_name, p_from_date, p_to_date, p_limit)` | TEXT?, DATE?, DATE?, INT | Filtered audit log; requires service_role |
| `rpc_partition_archive_log_stats()` | — | Aggregate counts by action type |

### Notification

| RPC | Params | Notes |
|-----|--------|-------|
| `rpc_mark_notification_processed(p_notification_id)` | UUID | Marks `notification_queue` entry as processed |

---

## Partition Lifecycle Commands

```bash
# 1. Review candidates (read-only SQL)
psql $DATABASE_URL -c "SELECT partition_name, age_months, pg_size_pretty(size_bytes) FROM v_etax_partition_retention WHERE retention_status = 'ARCHIVE_CANDIDATE';"

# 2. Dry-run (no changes)
./scripts/etax_partition_lifecycle.sh --dry-run

# 3. Archive (detach + rename + audit log)
./scripts/etax_partition_lifecycle.sh --execute

# 4. Archive with pg_dump backup
export PARTITION_BACKUP_DIR="/mnt/backups/etax-partitions/$(date +%Y%m)"
./scripts/etax_partition_lifecycle.sh --execute --backup

# 5. Drop after backup (IRREVERSIBLE — requires --force)
./scripts/etax_partition_lifecycle.sh --execute --drop --force

# 6. Check archive log stats
psql $DATABASE_URL -c "SELECT * FROM rpc_partition_archive_log_stats();"
```

---

## Emergency Procedures

### MV refresh stuck

```sql
-- Force refresh immediately
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_health_trend;
-- Check lag
SELECT now() - mv_last_refreshed_at AS lag FROM mv_etax_compliance_dashboard LIMIT 1;
```

### eTax queue backlog

```sql
-- Count backlog
SELECT status, COUNT(*) FROM etax_submissions GROUP BY status;
-- Requeue a specific failed submission
SELECT * FROM rpc_etax_requeue(p_submission_id := '<uuid>');
-- Check last error
SELECT id, last_error, attempt_count, next_retry_at FROM etax_submissions WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10;
```

### Risk notify not firing

```sql
-- Verify platform_config
SELECT key, LEFT(value,40) AS val FROM platform_config WHERE key LIKE 'etax_risk%';
-- Check last pg_net request
SELECT * FROM rpc_etax_notify_request_status(p_request_id := <id>);
-- Check pg_net queue
SELECT id, status, error_msg FROM net.http_response_collector ORDER BY created DESC LIMIT 5;
```

### Partition insert failing

```sql
-- Check partition coverage for today
SELECT c.relname AS partition, pg_get_expr(c.relpartbound, c.oid) AS bounds
FROM pg_class p JOIN pg_inherits i ON p.oid = i.inhparent
JOIN pg_class c ON i.inhrelid = c.oid
WHERE p.relname = 'etax_submissions' ORDER BY bounds;
-- Manually create missing partition (if auto-create failed)
SELECT fn_auto_create_next_etax_partition();
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `scripts/staging_validate_all.sh` | Master validator — 13 scripts, pass/fail summary |
| `scripts/preflight_db_reset.sh` | Pre-flight before `supabase db reset` |
| `scripts/etax_partition_lifecycle.sh` | Partition detach/backup/drop lifecycle |
| `docs/DEPLOYMENT_RUNBOOK_1500.md` | Full production deployment runbook |
| `docs/CHANGELOG_1500_release_notes.md` | Consolidated release notes for v15.0.0 |
| `docs/openapi_monolith_rpcs.yaml` | OpenAPI v15.2.0 — 14 paths, 28 schemas |
| `supabase/config.toml` | pg_cron jobs + edge function config |
| `public/etax-compliance-dashboard.html` | Standalone HTML dashboard (no build step) |

---

*MONOLITH Manufacturing OS · Release 15.0.0 · Indetails Group · 2026-09-01*
