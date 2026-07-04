# LINE OA Commerce — Database Migrations (`line_oa_*`)

This directory holds the SQL migration files for the **LINE OA Commerce (Module B5)**
feature. Migrations are applied in lexicographic filename order (the Supabase CLI
convention: `<timestamp>_<description>.sql`).

> **Scaffold status:** This is structural scaffolding only (spec task 1.1). The actual
> DDL (the eight `line_oa_*` tables, enums, constraints, RLS policies, the audit
> immutability trigger) and the PL/pgSQL `SECURITY DEFINER` RPCs are added by later
> tasks. Do **not** add table/RPC definitions here until the corresponding task.

## Planned migration sequence (filled by later tasks)

| Order | Concern | Spec task |
|-------|---------|-----------|
| init  | Scaffold marker (`00000000000000_line_oa_init.sql`)           | 1.1 |
| schema | Enums + the eight `line_oa_*` tables (`00000000000001_line_oa_schema.sql`) | 2.1 ✅ |
| constraints | Uniqueness, partial-unique, and CHECK constraints (`00000000000002_line_oa_constraints.sql`) | 2.2 ✅ |
| rls | Enable RLS + `SELECT` policies (`TO authenticated`) (`00000000000003_line_oa_rls.sql`) | 3.1 ✅ |
| audit | Audit-log immutability trigger + `REVOKE UPDATE, DELETE` (`00000000000004_line_oa_audit_immutability.sql`) | 3.2 ✅ |
| rpcs | `SECURITY DEFINER` RPCs (ingest, resolve, send, order, sync…) | 6–17 |

## Conventions

- All tables are named `line_oa_*`.
- All writes flow through `SECURITY DEFINER` RPCs that re-check role, resolve the
  actor via `public.resolve_actor()`, write `line_oa_audit_log`, and scrub secrets.
- Channel secrets live in **Supabase Vault**; `line_oa_channels` stores only
  Vault references, never plaintext.
- Reuses shipped platform helpers: `public.get_active_site_codes()`,
  `public.has_site_access()`, `public.is_governance_role()`,
  `public.has_any_app_role()`, `public.resolve_actor()`.

## Applying migrations (local)

```bash
supabase db reset            # rebuild local DB from all migrations
supabase migration up        # apply pending migrations
```
