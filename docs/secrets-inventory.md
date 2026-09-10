# Secrets Inventory — monolith-workspace

> Generated: 2026-09-10  
> Scope: all 28 GitHub Actions workflow files under `.github/workflows/`  
> Total distinct secrets: **20**

---

## Full Secrets Table

| # | Secret Name | Category | Workflows Using It |
|---|---|---|---|
| 1 | `CHROMATIC_PLAYWRIGHT_PROJECT_TOKEN` | Visual-testing | `chromatic.yml` |
| 2 | `CHROMATIC_PROJECT_TOKEN` | Visual-testing | `chromatic.yml` |
| 3 | `DATABASE_URL` | Database | `ci.yml`, `production-bootstrap-plan.yml`, `production-migration-apply.yml`, `supabase-db-lint.yml` |
| 4 | `FIELD_SUPABASE_ANON_KEY` | Supabase (field-app) | `field-app-pages.yml` |
| 5 | `FIELD_SUPABASE_URL` | Supabase (field-app) | `field-app-pages.yml` |
| 6 | `GITHUB_TOKEN` | GitHub built-in | `billing-report.yml`, `chromatic-pr-comment.yml`, `dependabot-auto-merge.yml`, `kernel-pyocc.yml`, `keyset-dual-approval.yml`, `migration-diff-summary.yml`, `supabase-db-lint.yml`, `vitest-pr-summary.yml` |
| 7 | `LINE_API_BASE` | LINE Messaging | `ci.yml` |
| 8 | `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging | `ci.yml` |
| 9 | `LINE_FPR_CHANNEL_ACCESS_TOKEN` | LINE Messaging (FPR) | `ci.yml` |
| 10 | `LINE_FPR_CHANNEL_SECRET` | LINE Messaging (FPR) | `ci.yml` |
| 11 | `LINE_NOTIFY_TOKEN` | LINE Notify | `billing-report.yml` |
| 12 | `MIGRATION_BACKUP_KEY` | Database | `production-migration-apply.yml` |
| 13 | `SUPABASE_ACCESS_TOKEN` | Supabase (core) | `ci.yml` |
| 14 | `SUPABASE_ANON_KEY` | Supabase (core) | `ci.yml` |
| 15 | `SUPABASE_JWT_SECRET` | Supabase (core) | `ci.yml` |
| 16 | `SUPABASE_PROJECT_REF` | Supabase (core) | `ci.yml`, `production-bootstrap-plan.yml`, `production-migration-apply.yml`, `supabase-db-lint.yml` |
| 17 | `SUPABASE_SERVICE_ROLE_KEY` | Supabase (core) | `ci.yml` |
| 18 | `SUPABASE_URL` | Supabase (core) | `ci.yml` |
| 19 | `VITE_LINE_LOGIN_CHANNEL_ID` | Build variable | `field-app-pages.yml` |
| 20 | `VITE_MONOLITH_URL` | Build variable | `field-app-pages.yml` |

---

## Naming Inconsistency Findings

### Issue 1 — LINE Messaging secret naming (no prefix vs. `FPR_` prefix)

| Secret | Workflow | Notes |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | `ci.yml` | No module prefix — ambiguous which LINE channel |
| `LINE_FPR_CHANNEL_ACCESS_TOKEN` | `ci.yml` | Has `FPR_` prefix — clearly scoped to FPR module |
| `LINE_FPR_CHANNEL_SECRET` | `ci.yml` | Has `FPR_` prefix — clearly scoped to FPR module |

**Risk:** `LINE_CHANNEL_ACCESS_TOKEN` is under-qualified; if a second LINE channel is ever added, the name will clash or require a breaking rename.

### Issue 2 — Supabase URL/key naming (`SUPABASE_*` bare vs. `FIELD_SUPABASE_*` prefix)

| Secret | Workflow | Notes |
|---|---|---|
| `SUPABASE_URL` | `ci.yml` | Bare — refers to the main/monolith Supabase project |
| `SUPABASE_ANON_KEY` | `ci.yml` | Bare |
| `FIELD_SUPABASE_URL` | `field-app-pages.yml` | `FIELD_` prefix — separate field-app Supabase project |
| `FIELD_SUPABASE_ANON_KEY` | `field-app-pages.yml` | `FIELD_` prefix |

**Risk:** The bare names suggest a single Supabase project, but there are actually two. A developer adding a third project has no clear naming convention to follow.

### Issue 3 — `VITE_*` build variables stored as Secrets instead of Repository Variables

| Secret | Workflow | Why it's a problem |
|---|---|---|
| `VITE_LINE_LOGIN_CHANNEL_ID` | `field-app-pages.yml` | Not sensitive — a public LINE Login channel ID used at build time |
| `VITE_MONOLITH_URL` | `field-app-pages.yml` | Not sensitive — a public URL injected into the Vite bundle |

**Risk:** Storing non-sensitive values as encrypted Secrets makes them invisible to `${{ vars.* }}` references, prevents auditing via the UI variable list, and wastes secret slot budget unnecessarily.

---

## Recommended Remediation Actions

| Priority | Action |
|---|---|
| P1 | Rename `LINE_CHANNEL_ACCESS_TOKEN` → `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN` (or a clear module prefix) and update `ci.yml` |
| P1 | Rename bare `SUPABASE_URL` / `SUPABASE_ANON_KEY` → `MONOLITH_SUPABASE_URL` / `MONOLITH_SUPABASE_ANON_KEY` (or `CORE_`) to mirror the `FIELD_` convention; update all 4 workflows that reference them |
| P2 | Move `VITE_LINE_LOGIN_CHANNEL_ID` and `VITE_MONOLITH_URL` from **Secrets** to **Repository Variables** (`vars.VITE_LINE_LOGIN_CHANNEL_ID` etc.) and update `field-app-pages.yml` accordingly |
| P3 | Add a naming convention doc under `docs/` (e.g., `<MODULE>_<SERVICE>_<CREDENTIAL_TYPE>`) so future secrets follow a consistent pattern |
| P3 | Consider splitting the 7 `LINE_*` secrets (`LINE_API_BASE`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_FPR_*`, `LINE_NOTIFY_TOKEN`) into a dedicated LINE-integration secrets review — they represent 3 different LINE products (Messaging API, FPR channel, Notify) |

---

## Notes

- `GITHUB_TOKEN` is an automatically provisioned built-in; it does not need to be created or rotated manually.
- `LINE_NOTIFY_TOKEN` (secret #11) is referenced in `billing-report.yml` but **has not yet been set** in the repository. The workflow step that sends the LINE notification is guarded with `if: env.LINE_NOTIFY_TOKEN != ''` so it silently skips until the secret is populated.
- `MIGRATION_BACKUP_KEY` is used exclusively in `production-migration-apply.yml`, which intentionally keeps `cancel-in-progress: false` to protect DB write serialization.
