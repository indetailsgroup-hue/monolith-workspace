# Diff Report: 0178_rls_dedup_and_hardening vs 20260828_multi_tenant_schema
**Generated:** 2026-08-28  
**Branch:** `feat/accounting-rls-multibook`  
**Purpose:** Identify conflicts, gaps, and dependency order before running `supabase db reset`

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 2 | Table name mismatch (singular vs plural); 0178 will error at runtime |
| 🟠 High | 2 | `org_id` coverage gap; `ledger_entries` not in 0178 scope |
| 🟡 Medium | 1 | Dependency order — `get_user_org_id()` defined in multi_tenant, required by 0178 |
| 🟢 Low | 1 | `rpc_approve_quotation` references `public.quotation` (singular) — may not exist |

**Recommendation:** Do NOT run `supabase db reset` until the Critical issues (table name conflicts) are resolved. The correct fix is to align 0178's table references to match the plural names used throughout the rest of the codebase (confirmed by migration filename `0172_jobs_quotations_invoices.sql`).

---

## 1. Files Compared

### File A: `supabase/migrations/0178_rls_dedup_and_hardening.sql`
- **Location:** branch `feat/accounting-rls-multibook`
- **Purpose:** Add `org_id` + RLS policies + hardening for core transactional tables
- **Size:** 547 lines

### File B: `supabase/migrations/20260828_multi_tenant_schema.sql`
- **Location:** `main` branch
- **Purpose:** Bootstrap multi-tenant infrastructure — create `organizations`, `org_members`, `org_invitations`; add `org_id` to core tables; define `get_user_org_id()`
- **Size:** 195 lines

---

## 2. Table Inventory Comparison

### Tables targeted by 0178 (SINGULAR names)

| Table | Action in 0178 |
|-------|----------------|
| `public.customer` | ADD COLUMN org_id; index; 4 RLS policies |
| `public.job` | ADD COLUMN org_id; index; 4 RLS policies |
| `public.job_panel` | ADD COLUMN org_id; index; 3 RLS policies |
| `public.quotation` | ADD COLUMN org_id; index; 4 RLS policies |
| `public.quotation_line` | ADD COLUMN org_id; index; 3 RLS policies |
| `public.invoice` | ADD COLUMN org_id; index; 2 RLS policies; 2 triggers |
| `public.invoice_payment` | ADD COLUMN org_id; index; 2 RLS policies; 1 trigger |

### Tables targeted by multi_tenant_schema (PLURAL names)

| Table | Action in multi_tenant_schema |
|-------|-------------------------------|
| `public.organizations` | CREATE TABLE |
| `public.org_members` | CREATE TABLE |
| `public.org_invitations` | CREATE TABLE |
| `public.jobs` | ADD COLUMN org_id; index; 3 RLS policies |
| `public.quotations` | ADD COLUMN org_id; index; 3 RLS policies |
| `public.invoices` | ADD COLUMN org_id; index; 3 RLS policies |
| `public.ledger_entries` | ADD COLUMN org_id; index; 3 RLS policies |

---

## 3. Critical Conflicts

### 🔴 CRITICAL-1: Table Name Mismatch (Singular vs Plural)

```
0178 references:          multi_tenant_schema references:
  public.job              ≠   public.jobs
  public.quotation        ≠   public.quotations
  public.invoice          ≠   public.invoices
  (no overlap)                public.ledger_entries
```

**Impact:** PostgreSQL treats `job` and `jobs` as **completely separate tables**. If the actual tables in the database are named `jobs`, `quotations`, `invoices` (plural — as strongly suggested by the migration filename `0172_jobs_quotations_invoices.sql`), then 0178 will:

1. Attempt to `ALTER TABLE public.job ADD COLUMN org_id` → **ERROR: relation "job" does not exist**
2. Fail immediately at migration apply time
3. Block `supabase db reset` from completing

**Evidence that plural is correct:**
- Migration 0172 is named `0172_jobs_quotations_invoices.sql` → plural filenames strongly imply plural table names
- `20260828_multi_tenant_schema.sql` (created by the project team) uses plural names
- Standard Rails/Laravel/Supabase convention: plural table names

**Fix required in 0178:**

```sql
-- BEFORE (incorrect — singular)              AFTER (correct — plural)
ALTER TABLE public.customer ...          →   ALTER TABLE public.customers ...
ALTER TABLE public.job ...               →   ALTER TABLE public.jobs ...
ALTER TABLE public.job_panel ...         →   ALTER TABLE public.job_panels ...
ALTER TABLE public.quotation ...         →   ALTER TABLE public.quotations ...
ALTER TABLE public.quotation_line ...    →   ALTER TABLE public.quotation_lines ...
ALTER TABLE public.invoice ...           →   ALTER TABLE public.invoices ...
ALTER TABLE public.invoice_payment ...   →   ALTER TABLE public.invoice_payments ...
```

Also update all 20 RLS policy `ON` clauses, 7 index `ON` clauses, and 3 function bodies accordingly.

---

### 🔴 CRITICAL-2: Duplicate `org_id` Addition on Overlapping Tables

Both files attempt to add `org_id` to `jobs`, `quotations`, and `invoices` (assuming 0178 is corrected to plural names):

| Table | multi_tenant_schema | 0178 (after fix) |
|-------|---------------------|------------------|
| `jobs` | `ADD COLUMN org_id UUID NOT NULL` | `ADD COLUMN org_id UUID NOT NULL` |
| `quotations` | `ADD COLUMN org_id UUID NOT NULL` | `ADD COLUMN org_id UUID NOT NULL` |
| `invoices` | `ADD COLUMN org_id UUID NOT NULL` | `ADD COLUMN org_id UUID NOT NULL` |

**Impact:** If both migrations run sequentially, the second `ADD COLUMN org_id` will error:
```
ERROR: column "org_id" of relation "jobs" already exists
```

**Fix:** Both files must use `ADD COLUMN IF NOT EXISTS org_id UUID`:

```sql
-- In both migration files, change:
ALTER TABLE public.jobs ADD COLUMN org_id UUID NOT NULL ...;
-- To:
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS org_id UUID ...;
```

Alternatively (cleaner): since `multi_tenant_schema` runs first (timestamp `20260828` sorts before `0178`), remove the duplicate `ADD COLUMN` statements from 0178 for `jobs`, `quotations`, and `invoices`, keeping only the additional RLS policies that 0178 adds.

---

## 4. High-Priority Gaps

### 🟠 HIGH-1: `ledger_entries` Not Covered by 0178

`multi_tenant_schema` adds `org_id` and RLS to `public.ledger_entries`. Migration 0178 does **not** touch `ledger_entries`. This means the ledger's RLS is only as strong as what multi_tenant_schema set, without the hardening patterns that 0178 applies to other tables.

**Recommendation:** Consider adding `ledger_entries` RLS hardening to 0178 (or a separate migration 0178b).

### 🟠 HIGH-2: `customers`, `job_panels`, `quotation_lines`, `invoice_payments` Not in multi_tenant_schema

0178 adds `org_id` to `customer`, `job_panel`, `quotation_line`, `invoice_payment` — tables that `multi_tenant_schema` does NOT cover. This creates an uneven multi-tenant boundary where some tables are protected and others are not (assuming these tables exist with whatever name).

**Recommendation:** Verify these tables exist by inspecting migration 0172. If they exist, their inclusion in 0178 is correct.

---

## 5. Medium Issues

### 🟡 MEDIUM-1: Function Dependency Order

| Function | Defined in | Required by |
|----------|-----------|-------------|
| `get_user_org_id()` | `multi_tenant_schema` | 0178 (all RLS policies) |
| `update_updated_at()` | `multi_tenant_schema` | 0178 (triggers) |

**Current execution order by filename sort:**
```
20260828_multi_tenant_schema.sql   ← runs FIRST (timestamp prefix)
0178_rls_dedup_and_hardening.sql   ← runs AFTER (numeric prefix)
```

In Supabase, migrations are applied in **lexicographic order**. The character `2` (ASCII 50) sorts **after** `0` (ASCII 48), so:
- `0178_...` sorts BEFORE `20260828_...`
- This means **0178 runs FIRST** — but it requires `get_user_org_id()` which is defined in multi_tenant_schema that runs AFTER!

**This is a deployment-breaking dependency order issue.**

**Fix:** Rename `20260828_multi_tenant_schema.sql` to a numeric sequence name **before** 0178:

```
Rename: 20260828_multi_tenant_schema.sql  
    To: 0177b_multi_tenant_schema.sql     (runs before 0178)
    Or: 0000_multi_tenant_schema.sql      (runs very first)
```

Or alternatively, move the `get_user_org_id()` and `update_updated_at()` function definitions into a migration that runs before 0178.

---

## 6. Low Issues

### 🟢 LOW-1: `rpc_approve_quotation` References `public.quotation`

The `rpc_approve_quotation` function body in 0178 contains:
```sql
UPDATE public.quotation SET status = 'approved' WHERE ...
```

After renaming to plural, this must become `public.quotations`.

Similarly, `rpc_record_payment` references `public.invoice` and `public.invoice_payment` — must become `public.invoices` and `public.invoice_payments`.

---

## 7. Policy Name Collision Check

| Policy Name (0178) | On Table (0178) | Policy Name (multi_tenant) | On Table (multi_tenant) | Conflict? |
|--------------------|-----------------|---------------------------|-------------------------|-----------|
| `rls_invoice_select` | `public.invoice` | `invoices_select_policy` | `public.invoices` | No (different names + tables) |
| `rls_job_select` | `public.job` | `jobs_select_policy` | `public.jobs` | No |
| `rls_quotation_select` | `public.quotation` | `quotations_select_policy` | `public.quotations` | No |

No direct policy name collisions exist. After table rename fix, the policies will coexist on the same tables with different names — both will be evaluated (RLS ANDs all policies). Review for redundancy after fix.

---

## 8. Full Entity Diff Matrix

```
Entity Type          | 0178 Only              | Both Files            | multi_tenant Only
---------------------|------------------------|-----------------------|------------------
Tables created       | —                      | —                     | organizations
                     |                        |                       | org_members
                     |                        |                       | org_invitations
org_id added to      | customer               | jobs *                | ledger_entries
                     | job_panels             | quotations *          |
                     | quotation_lines        | invoices *            |
                     | invoice_payments       |                       |
Indexes              | 7 (on 0178 tables)     | —                     | 9 (on plural tables)
RLS policies         | 20 (on 0178 tables)    | —                     | 12 (on plural tables)
Functions            | rpc_approve_quotation  | —                     | get_user_org_id()
                     | rpc_record_payment     |                       | update_updated_at()
                     | rpc_job_board          |                       |
Triggers             | set_updated_at_invoice | —                     | —
                     | set_updated_at_        |                       |
                     |   invoice_payment      |                       |

* Only after renaming 0178 tables to plural
```

---

## 9. Action Plan Before `supabase db reset`

| Priority | Action | File to Edit |
|----------|--------|-------------|
| 🔴 1 | Rename all 7 table references in 0178 from singular to plural | `0178_rls_dedup_and_hardening.sql` |
| 🔴 2 | Add `IF NOT EXISTS` to all `ADD COLUMN org_id` in 0178 | `0178_rls_dedup_and_hardening.sql` |
| 🔴 3 | Rename `20260828_multi_tenant_schema.sql` to run before 0178 | rename file |
| 🟠 4 | Update `rpc_approve_quotation` + `rpc_record_payment` function bodies | `0178_rls_dedup_and_hardening.sql` |
| 🟡 5 | Verify `customers`, `job_panels`, `quotation_lines`, `invoice_payments` exist in 0172 | check `0172_full.sql` |
| 🟢 6 | Review redundant policies after plural rename (decide keep vs drop) | `0178_rls_dedup_and_hardening.sql` |

---

## 10. Recommended Migration Execution Order (after fixes)

```
0000_multi_tenant_schema.sql        ← renamed from 20260828_...  (defines get_user_org_id)
  ↓
0172_jobs_quotations_invoices.sql   ← creates jobs/quotations/invoices tables
  ↓
...existing migrations 0173–0177...
  ↓
0178_rls_dedup_and_hardening.sql    ← RLS hardening (now references plural tables)
  ↓
0179_multibook_dynamic.sql
0180_overdue_invoice_detection.sql
0181_etax_auto_submit.sql
0182_org_notification_settings.sql
0183_etax_pdf_download.sql
0184_scheduled_jobs.sql
```

---

*Report generated by automated conflict analysis of `/home/sandbox/0178_branch.sql` (547 lines) and `/home/sandbox/multi_tenant_schema.sql` (195 lines).*
