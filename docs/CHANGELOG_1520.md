# CHANGELOG [15.2.0]

> **Release:** 15.2.0
> **Branch:** `release/15.0.0`
> **Date:** 2026-09-01
> **Tag:** `v15.2.0`

---

## Overview

Release 15.2.0 completes the **eTax risk-tier alerting pipeline** and introduces **production-grade partition lifecycle management** for the `etax_submissions` table. The three deliverables in this release close the loop from database-level risk detection (0195b) through automated HTTP alerting (etax-risk-notify) to long-term data archival governance (0196 + etax_partition_lifecycle.sh).

---

## Added

### Migration 0195b — `01952_b_etax_risk_tier_notify_pgnet.sql`

Patches `fn_check_risk_tier_changes` (introduced in Migration 0195) to dispatch a real-time HTTP POST to the `etax-risk-notify` Edge Function whenever a risk-tier transition is detected.

**Key additions:**

- **`platform_config` table** — key/value store (`key TEXT PK`, `value TEXT`, `updated_at TIMESTAMPTZ`) for runtime-configurable secrets and URLs. Seeded with `etax_risk_notify_url` and `etax_risk_notify_secret` (empty defaults; must be set in production via `UPDATE platform_config`).
- **`net.http_post()` dispatch** — inside the AFTER UPDATE trigger on `etax_risk_tier_state`, reads `etax_risk_notify_url` and `etax_risk_notify_secret` from `platform_config` at runtime and enqueues a `pg_net` HTTP POST with the full 9-field pg_notify payload as JSON body.
- **Fault isolation** — the entire `net.http_post()` block is wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING`. A pg_net failure, missing `platform_config` row, or network error will never abort the triggering transaction.
- **`rpc_etax_notify_request_status(request_id BIGINT)`** — debug RPC that queries `net.http_response_queue` to inspect the status of a specific pg_net dispatch request. Returns `request_id`, `status_code`, `response_body`, `error_msg`, and `created_at`. Accessible to `authenticated` and `service_role`.
- **RLS** — `platform_config` is protected with `service_role`-only write policy; `authenticated` users have no SELECT on it (secrets stay server-side).

**Payload dispatched (JSON body):**

```json
{
  "org_id": "...",
  "org_name": "...",
  "previous_tier": "LOW",
  "new_tier": "CRITICAL",
  "health_score": 42,
  "risk_rank": 1,
  "health_status": "CRITICAL",
  "is_priority_review": true,
  "transitioned_at": "2026-09-01T00:00:00Z"
}
```

---

### Migration 0196 — `0196_etax_submissions_partitioning.sql`

Converts `etax_submissions` to a **monthly range-partitioned table** (`PARTITION BY RANGE (created_at)`) for production-scale query performance and data lifecycle governance.

**Key additions:**

- **39 explicit monthly partitions** — `etax_submissions_y2024m01` through `etax_submissions_y2027m03`, plus a `etax_submissions_default` catch-all partition.
- **Cross-partition unique constraint** — since PostgreSQL does not enforce UNIQUE across partitions natively, a `BEFORE INSERT` trigger (`fn_enforce_etax_unique`) raises an exception if a duplicate `(org_id, invoice_id, document_type)` combination exists in any partition.
- **`fn_auto_create_next_etax_partition()`** — function that calculates the partition for the month following the current date and creates it with `CREATE TABLE IF NOT EXISTS … PARTITION OF etax_submissions FOR VALUES FROM … TO …`. Scheduled via pg_cron on the **20th of each month** (`0 0 20 * *` as `auto-create-etax-partition`), ensuring the next month's partition always exists before the month begins.
- **`rpc_etax_partition_health()`** — returns a row per partition: `partition_name`, `partition_start`, `partition_end`, `row_count`, `size_bytes`, `is_default`. Accessible to `authenticated` and `service_role`.
- **`v_etax_partition_retention`** — view over `rpc_etax_partition_health()` that annotates each partition with a `retention_status`: `ACTIVE` (within 24 months), `ARCHIVE_CANDIDATE` (older than 24 months), or `DEFAULT`. Used by `etax_partition_lifecycle.sh` to identify partitions eligible for archival.

**Performance impact:** Range partitioning on `created_at` eliminates full-table scans for time-bound queries (e.g., `WHERE created_at >= NOW() - INTERVAL '3 months'`), enabling partition pruning in the query planner. Each partition is independently vacuumed and analyzed.

---

### Edge Function — `etax-risk-notify`

**Path:** `supabase/functions/etax-risk-notify/index.ts`
**Trigger:** HTTP POST from `pg_net` (dispatched by 0195b trigger) on risk-tier transitions
**Size:** 357 lines

Consumes the JSON payload from 0195b and delivers real-time alerts through two channels:

| Channel | Condition | Payload |
|---------|-----------|---------|
| **LINE Notify** | Always (if `LINE_NOTIFY_TOKEN` set) | Thai-language formatted message with org name, tier transition, health score, risk rank, and priority review flag |
| **Webhook** | Always (if `WEBHOOK_URL` set in `platform_config`) | Full JSON payload with HMAC-SHA256 signature header (`X-Monolith-Signature`) |

**Security:** Validates `X-Monolith-Secret` header against `platform_config.etax_risk_notify_secret` before processing. Returns `401` on mismatch.

**Fault tolerance:**
- LINE Notify and webhook dispatches are independent; failure of one does not abort the other.
- All errors are logged with structured JSON to Supabase Edge Function logs.
- Returns `200` with a `results` array even on partial delivery failure, so `pg_net` does not retry unnecessarily.

**Environment variables required (Supabase Edge Function Secrets):**
- `LINE_NOTIFY_TOKEN` — LINE Notify personal access token
- `SUPABASE_URL` — injected automatically by Supabase runtime

---

### Script — `scripts/etax_partition_lifecycle.sh`

A production-safe bash script for managing the archival lifecycle of `etax_submissions` monthly partitions.

**Usage:**

```bash
# Dry-run (default) — lists ARCHIVE_CANDIDATE partitions, no changes
./scripts/etax_partition_lifecycle.sh

# Execute mode — DETACH + rename to _archived_YYYYMMDD suffix
./scripts/etax_partition_lifecycle.sh --execute

# Execute with pg_dump backup before detaching
./scripts/etax_partition_lifecycle.sh --execute --backup --backup-dir /mnt/archive/etax

# Execute + DROP (irreversible — requires CONFIRM prompt)
./scripts/etax_partition_lifecycle.sh --execute --drop

# Skip confirmation prompt (for CI/automated use)
./scripts/etax_partition_lifecycle.sh --execute --force

# Override DB connection
./scripts/etax_partition_lifecycle.sh --db-url postgresql://...
```

**Full option reference:**

| Option | Default | Description |
|--------|---------|-------------|
| `--execute` | false | Apply live changes (DETACH + rename/drop) |
| `--backup` | false | `pg_dump` each partition before detaching |
| `--drop` | false | DROP partition after detaching (irreversible) |
| `--backup-dir DIR` | `./partition_backups` | Directory for pg_dump files |
| `--audit-log FILE` | `./etax_partition_lifecycle_audit.log` | Path to append-only audit log |
| `--db-url URL` | `$SUPABASE_DB_URL` | Postgres connection string |
| `--min-row-count N` | 0 | Abort if total rows > N (safety gate) |
| `--force` | false | Skip `CONFIRM` prompt and row-count gate |

**Safety features:**
- Queries `v_etax_partition_retention` (Migration 0196) for `ARCHIVE_CANDIDATE` rows.
- Live row count is re-fetched from the partition at execution time; any mismatch with the view is logged as a warning but does not block execution.
- `CONFIRM` typed confirmation required unless `--force` is passed.
- Writes an audit entry to `partition_archive_log` table (Migration 0197) if it exists.
- Exit codes: `0` success, `1` error, `2` user aborted, `3` no candidates found.

**Audit log format:**
```
[2026-09-01T00:00:00+0000] Processing etax_submissions_y2024m01 | live_rows=12847 | range=2024-01-01->2024-02-01
[2026-09-01T00:00:00+0000]   BACKUP OK: ./partition_backups/etax_submissions_y2024m01_20260901T000000.sql size=4.2M
[2026-09-01T00:00:00+0000]   DETACH OK: etax_submissions_y2024m01
[2026-09-01T00:00:00+0000]   RENAME OK: etax_submissions_y2024m01 -> etax_submissions_y2024m01_archived_20260901
[2026-09-01T00:00:00+0000] === Summary: total=1 ok=1 failed=0 ===
```

---

## Test Suites

| File | Coverage |
|------|----------|
| `src/__tests__/migrations/0195b_pgnet_notify.test.ts` | Groups A–G: pg_net dispatch, platform_config resolution, fault isolation, rpc_etax_notify_request_status, cross-tenant isolation |
| `src/__tests__/migrations/0196_etax_partitioning.test.ts` | Groups A–G: partition existence, insert routing, cross-partition unique, fn_auto_create_next_etax_partition, rpc_etax_partition_health, v_etax_partition_retention, cross-tenant isolation |

---

## Staging Validators

| Script | Sections |
|--------|----------|
| `scripts/staging_validate_0195b.sh` | §1 platform_config table, §2 net.http_post in trigger body, §3 rpc_etax_notify_request_status, §4 fault-isolation smoke test, §5 platform_config RLS |
| `scripts/staging_validate_0196.sh` | §1–§8: partition existence, insert routing, partition health RPC, retention view, auto-create function, cross-partition unique, pg_cron job, cross-tenant |

---

## Migration Order

When applying to a fresh environment, run migrations in this sequence:

```
0000 → 0176 → 0177 → 0178 → 0179 → 0180 → 0181 → 0182 → 0183 → 0184
→ 0185 → 0186 → 0187 → 0188 → 0189 → 0190 → 0191 → 0192 → 0193 → 0194
→ 0195 → 0195b → 0196 → 0197
```

> **Note:** 0195b must be applied after 0195 (it patches `fn_check_risk_tier_changes`). 0197 must be applied after 0196 (`partition_archive_log` references `etax_submissions` partition names). 0196 must be applied on a database where `etax_submissions` currently exists as a plain (non-partitioned) table; the migration handles the conversion.

---

## Breaking Changes

None. All changes are additive. The `etax_submissions` partitioning migration preserves all existing rows via `INSERT INTO … SELECT` into the appropriate partition during migration.

---

## Upgrade Notes

1. Set `platform_config` values before enabling the 0195b trigger in production:
   ```sql
   UPDATE platform_config SET value = 'https://your-project.supabase.co/functions/v1/etax-risk-notify'
   WHERE key = 'etax_risk_notify_url';
   UPDATE platform_config SET value = 'your-secret-token'
   WHERE key = 'etax_risk_notify_secret';
   ```
2. Set `LINE_NOTIFY_TOKEN` in Supabase Edge Function Secrets (Dashboard → Edge Functions → etax-risk-notify → Secrets).
3. Run `preflight_db_reset.sh` on staging before applying migrations.
4. After applying 0196, verify partition health: `SELECT * FROM rpc_etax_partition_health();`
5. Test the lifecycle script in dry-run before first production archival: `./scripts/etax_partition_lifecycle.sh`

---

## Full Changelog

- See [CHANGELOG_1400.md](./CHANGELOG_1400.md) through [CHANGELOG_1510.md](./CHANGELOG_1510.md) for prior release history.
