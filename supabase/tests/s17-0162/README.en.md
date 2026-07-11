# S17 Migration 0162 — PostgreSQL Dry-Run Package

Document version: 1.0

Prepared: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

Target migration: `supabase/migrations/0162_factory_server_identity_released_only.sql`

Status: **verification package — non-production only**

> This package does not apply migration 0162 to production, approve a merge, or close S17-1/S17-2. Both drivers open one transaction and end with `ROLLBACK`.

## 1. What the package proves

The assertions execute the exact migration against a real PostgreSQL engine and test:

1. legacy RPC overloads that accepted caller-selected actor fields are removed
2. only `service_role` has direct execution privilege on the new mutating RPCs
3. an authenticated client attempting to inject a forged actor is denied and writes no job/event
4. malformed server actor context is rejected before state or audit mutation
5. a wrong action role is rejected for packet recording and verification
6. invalid transition order returns an error and writes no event
7. a FROZEN job cannot record/upload a packet, become exportable, or record verification
8. the positive control `DRAFT -> FROZEN -> RELEASED -> record packet -> verify` succeeds and records server actor context

The package does **not** prove hosted Supabase Auth behavior, Storage behavior, Edge deployment, PostgREST schema-cache refresh, production metadata completeness, or P0 closure.

## 2. Package files

| File | Purpose |
| --- | --- |
| `dry-run-bootstrap.sql` | Build migrations 0155/0156/0157/0161 in a disposable DB, apply 0162, run assertions, roll back |
| `dry-run-existing.sql` | Check an existing non-production database is at 0161, apply 0162, run assertions, roll back |
| `bootstrap-pre0162.sql` | Minimal Supabase roles and `fn_is_service_role()` helper for an empty disposable PostgreSQL database |
| `preflight-existing.sql` | Fail-closed check for expected pre-0162 tables and legacy signatures |
| `assertions.sql` | Negative cases and positive controls |
| `run-0162-dry-run.ps1` | Guarded psql runner for a supplied non-production connection |
| `run-0162-ephemeral.ps1` | Creates a temporary PostgreSQL cluster, runs bootstrap mode, stops it, and removes it |
| `local-postgres-dry-run-evidence.json` | Hash-bound record of the reproduced PostgreSQL 18.1 bootstrap run and its exclusions |

## 3. Recommended command: disposable PostgreSQL

Prerequisites: PostgreSQL client/server binaries (`psql`, `initdb`, `pg_ctl`, `createdb`, `pg_isready`) on `PATH`.

From repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-0162/run-0162-ephemeral.ps1 `
  -Port 55439
```

Choose another unused port when necessary. A successful run ends with all four markers:

```text
S17_0162_ASSERTIONS_PASS
S17_0162_DRY_RUN_PASS mode=bootstrap transaction=rolled_back
S17_0162_PSQL_PACKAGE_PASS
S17_0162_EPHEMERAL_POSTGRES_PASS
```

## 4. Existing pre-0162 non-production database

The target must be a disposable snapshot with migrations through 0161 and without 0162. Never point this command at production.

```powershell
$env:S17_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/s17_0162_staging'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-0162/run-0162-dry-run.ps1 `
  -Mode existing-pre0162 `
  -ExpectedDatabase s17_0162_staging `
  -ConfirmNonProduction
```

The runner uses `psql -X -w`, `ON_ERROR_STOP=1`, checks the connected database name, rejects protected/production-like names, and never prompts for a password. Prefer `.pgpass`, `PGPASSFILE`, or a short-lived secret environment variable in controlled operator environments.

## 5. Failure behavior

- Any SQL assertion raises `S17_ASSERT_FAIL` and psql exits non-zero.
- A target that is not at 0161 raises `S17_PREFLIGHT_FAIL` before migration execution.
- On error, disconnecting rolls back the open transaction; successful drivers also execute an explicit `ROLLBACK`.
- The ephemeral runner stops PostgreSQL and deletes only its generated `monolith-s17-0162-<guid>` directory under the system temporary directory.

## 6. Reproduced local evidence

On 2026-07-11 the bootstrap driver passed on PostgreSQL 18.1 using a temporary database named `s17_0162_dryrun`. All negative cases and positive controls passed, the transaction rolled back, the server stopped, and the temporary cluster was removed. The exact input hashes and exclusions are recorded in `local-postgres-dry-run-evidence.json`. This is local real-PostgreSQL evidence only; hosted/staging evidence remains required before human closure.

## 7. Human gate

Applying 0162 to a hosted or production database requires a separate human decision, an approved deployment sequence, metadata readiness, backup/abort preparation, and independent review. This package grants none of those authorities.
