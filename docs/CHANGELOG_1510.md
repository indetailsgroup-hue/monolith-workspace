# CHANGELOG [15.1.0] — Post-Merge Stabilisation & Ops Documentation

**Released:** 2026-09-01  
**Branch:** main  
**Merge commit:** `27654058446d`  
**Tag:** `v15.0.0` (re-pointed to `27654058446d`)

---

## Summary

This release finalises the v15.0.0 lifecycle by landing `release/15.0.0` into `main`
via a conflict-resolved merge commit, updating the canonical `v15.0.0` tag to the
merged main HEAD, and publishing two new ops documentation artefacts: the updated
Deployment Runbook (v1.1.0, §13 added) and the one-page Ops Quick-Reference Card.

No new database objects, migrations, or edge functions are introduced in this entry.

---

## Changes

### Infrastructure — Merge & Tag

| Item | Detail |
|------|--------|
| **Merge commit** | `27654058446d` — `release/15.0.0 → main` |
| **Parents** | `main@532783bedff4` + `release/15.0.0@d431e3efa639` |
| **Tag `v15.0.0`** | Force-updated from `0132c574e969` (release branch HEAD) → `27654058446d` (main HEAD) |
| **PR #74** | Closed (merged out-of-band via Git Data API) |
| **Conflict resolution** | 20 files existed on both branches with divergent content; `release/15.0.0` version taken as authoritative for all conflicts |

**Conflicting files resolved (release/15.0.0 wins):**

```
.claude/progress.md
.github/workflows/pgtap-tests.yml
CHANGELOG.md
docs/security-posture-report.md
scripts/lint-rls-org-id.py
src/routes/index.tsx
src/tenant/types.ts
supabase/config.toml
supabase/migrations/0172_jobs_quotations_invoices.sql
supabase/migrations/0174_secdef_rpc_hardening.sql
supabase/migrations/0175_child_table_rls.sql
supabase/migrations/0180_identity_reconciliation_hardening.sql
supabase/migrations/0186_critical_tables_rls.sql
supabase/migrations/20260828_audit_log_usage_metering.sql
supabase/migrations/20260828_multi_tenant_schema.sql
supabase/migrations/20260828_notifications_super_admin.sql
supabase/migrations/20260828_platform_fts.sql
supabase/migrations/20260828_platform_search.sql
supabase/migrations/20260828_search_bookmarks_autocomplete.sql
tools/.lint_allowlist
```

**107 files** added from `release/15.0.0` with no conflict (migrations 0178–0197,
edge functions, test suites, staging validators, UI components, docs).

---

### Documentation

#### `docs/DEPLOYMENT_RUNBOOK_1500.md` — v1.1.0
- **Commit:** `4699f551ed64`
- Added **§13 Partition Archive Procedures** covering:
  - Pre-run checklist for `etax_partition_lifecycle.sh`
  - Dry-run execution (`--dry-run` flag) and output interpretation
  - Live execute mode with per-partition DETACH → `pg_dump` → ATTACH archive → INSERT log
  - Rollback procedure: re-ATTACH partition from archive schema
  - Backup verification (`pg_restore --list`) and `partition_archive_log` audit queries
  - Alert thresholds: warn if archive lag > 90 days, critical if > 180 days
- Table of Contents updated (§1–§13)
- Total: **943 lines**

#### `docs/OPS_QUICK_REF_1500.md` — new file
- **Commit:** `d431e3efa639`
- One-page quick-reference card for on-call engineers, covering:
  - All **6 pg_cron jobs** with schedule, function, and restart command
  - All **3 edge functions** with trigger, endpoint, and test curl command
  - All **13 staging validators** with migration scope and expected exit code
  - **Key RPCs** for etax health, risk tier state, partition archive log, and notify status
  - Emergency runbook references (§10 rollback, §13 partition archive)
- Total: **214 lines**

---

## Post-Merge Smoke Test — 2026-09-01

Executed: `bash scripts/staging_validate_all.sh --dry-run`  
Context: No live Supabase staging instance connected (SUPABASE_URL not set).
Shell syntax validation (`bash -n`) run against all scripts on `main`.

| Validator | Script Lines | Syntax | Dry-Run |
|-----------|-------------|--------|---------|
| 0186 | 440 | ✅ PASS | SKIP(dry) |
| 0187 | 410 | ✅ PASS | SKIP(dry) |
| 0188 | 555 | ✅ PASS | SKIP(dry) |
| 0189 | 618 | ✅ PASS | SKIP(dry) |
| 0190 | 498 | ✅ PASS | SKIP(dry) |
| 0191 | 634 | ✅ PASS | SKIP(dry) |
| 0192 | 648 | ✅ PASS | SKIP(dry) |
| 0193 | 865 | ✅ PASS | SKIP(dry) |
| **0194** | — | ⚠️ **MISSING** | SKIP |
| 0195 | 627 | ✅ PASS | SKIP(dry) |
| 0195b | 394 | ✅ PASS | SKIP(dry) |
| 0196 | 323 | ✅ PASS | SKIP(dry) |
| 0197 | 428 | ✅ PASS | SKIP(dry) |

**Result: 12 PASS syntax · 0 FAIL · 1 SKIP (0194 not found)**

> **Action required:** `scripts/staging_validate_0194.sh` was not pushed during the
> original release cycle. It must be authored and pushed before the next live staging
> run to achieve full 13/13 coverage. See §15.1.0 follow-up items below.

---

## Follow-Up Items (15.1.0)

| # | Item | Owner | Priority |
|---|------|-------|----------|
| 1 | Author `scripts/staging_validate_0194.sh` covering `v_etax_org_risk_ranking` | Backend | HIGH |
| 2 | Run full live `staging_validate_all.sh` once SUPABASE_URL is provisioned | DevOps | HIGH |
| 3 | Add Migration 0198 `v_etax_submission_sla` SLA-breach tracking view | Backend | MEDIUM |
| 4 | Update `staging_validate_all.sh` registry to include 0198 when ready | Backend | MEDIUM |

---

## Upgrade Notes

No schema changes. No migrations. No edge function deployments required.

To re-point your local `v15.0.0` tag to the merged main HEAD:

```bash
git fetch origin
git tag -d v15.0.0
git fetch origin refs/tags/v15.0.0:refs/tags/v15.0.0
# Verify
git rev-parse v15.0.0
# Expected: 27654058446d...
```

---

*CHANGELOG maintained by MONOLITH Engineering — release/15.0.0 stabilisation track.*
