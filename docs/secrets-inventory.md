# Secrets Inventory — monolith-workspace

> Generated: 2026-09-11  
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
| 8 | `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN` | LINE Messaging | `ci.yml` |
| 9 | `LINE_FPR_CHANNEL_ACCESS_TOKEN` | LINE Messaging (FPR) | `ci.yml` |
| 10 | `LINE_FPR_CHANNEL_SECRET` | LINE Messaging (FPR) | `ci.yml` |
| 11 | `LINE_NOTIFY_TOKEN` | LINE Notify | `billing-report.yml` |
| 12 | `MIGRATION_BACKUP_KEY` | Database | `production-migration-apply.yml` |
| 13 | `MONOLITH_SUPABASE_ACCESS_TOKEN` | Supabase (core) | `ci.yml` |
| 14 | `MONOLITH_SUPABASE_ANON_KEY` | Supabase (core) | `ci.yml` |
| 15 | `MONOLITH_SUPABASE_JWT_SECRET` | Supabase (core) | `ci.yml` |
| 16 | `MONOLITH_SUPABASE_PROJECT_REF` | Supabase (core) | `ci.yml`, `production-bootstrap-plan.yml`, `production-migration-apply.yml`, `supabase-db-lint.yml` |
| 17 | `MONOLITH_SUPABASE_SERVICE_ROLE_KEY` | Supabase (core) | `ci.yml` |
| 18 | `MONOLITH_SUPABASE_URL` | Supabase (core) | `ci.yml` |
| 19 | `VITE_LINE_LOGIN_CHANNEL_ID` | Build variable (**→ Repository Variable**) | `field-app-pages.yml` |
| 20 | `VITE_MONOLITH_URL` | Build variable (**→ Repository Variable**) | `field-app-pages.yml` |

---

## Naming Inconsistency Findings

### Issue 1 — LINE Messaging secret naming (no prefix vs. `FPR_` prefix)

| Secret | Workflow | Notes |
|---|---|---|
| `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN` | `ci.yml` | **Renamed** (was `LINE_CHANNEL_ACCESS_TOKEN`) — clearly scoped to Monolith |
| `LINE_FPR_CHANNEL_ACCESS_TOKEN` | `ci.yml` | ✅ Compliant — MODULE=LINE, SERVICE=FPR_CHANNEL, TYPE=ACCESS_TOKEN |
| `LINE_FPR_CHANNEL_SECRET` | `ci.yml` | ✅ Compliant — MODULE=LINE, SERVICE=FPR_CHANNEL, TYPE=SECRET |

**Resolved:** renamed to `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN`; now consistent with the `FPR_` and `NOTIFY` prefix convention.

**Verification:** `LINE_FPR_CHANNEL_ACCESS_TOKEN` and `LINE_FPR_CHANNEL_SECRET` were audited against the `MODULE_SERVICE_CREDENTIAL_TYPE` pattern (see `docs/secrets-naming-convention.md`) — both are fully compliant and require no changes.

### Issue 2 — Supabase URL/key naming (`SUPABASE_*` bare vs. `FIELD_SUPABASE_*` prefix)

| Secret | Workflow | Notes |
|---|---|---|
| `MONOLITH_SUPABASE_URL` | `ci.yml` | **Renamed** (was `SUPABASE_URL`) |
| `MONOLITH_SUPABASE_ANON_KEY` | `ci.yml` | **Renamed** (was `SUPABASE_ANON_KEY`) |
| `MONOLITH_SUPABASE_ACCESS_TOKEN` | `ci.yml` | **Renamed** (was `SUPABASE_ACCESS_TOKEN`) |
| `MONOLITH_SUPABASE_JWT_SECRET` | `ci.yml` | **Renamed** (was `SUPABASE_JWT_SECRET`) |
| `MONOLITH_SUPABASE_PROJECT_REF` | `ci.yml`, `production-bootstrap-plan.yml`, `production-migration-apply.yml`, `supabase-db-lint.yml` | **Renamed** (was `SUPABASE_PROJECT_REF`) — 10 refs across 4 files |
| `MONOLITH_SUPABASE_SERVICE_ROLE_KEY` | `ci.yml` | **Renamed** (was `SUPABASE_SERVICE_ROLE_KEY`) |
| `FIELD_SUPABASE_URL` | `field-app-pages.yml` | `FIELD_` prefix — separate field-app Supabase project |
| `FIELD_SUPABASE_ANON_KEY` | `field-app-pages.yml` | `FIELD_` prefix |

All 6 core Supabase secrets now carry the `MONOLITH_` module prefix, consistent with `FIELD_SUPABASE_*` naming.  
Remember to rename the actual secrets in **GitHub Settings → Secrets and Variables → Actions** to match the new names before the next workflow run.

### Issue 3 — `VITE_*` build variables stored as Secrets instead of Repository Variables

| Secret | Workflow | Why it's a problem |
|---|---|---|
| `VITE_LINE_LOGIN_CHANNEL_ID` | `field-app-pages.yml` | Not sensitive — a public LINE Login channel ID used at build time |
| `VITE_MONOLITH_URL` | `field-app-pages.yml` | Not sensitive — a public URL injected into the Vite bundle |

**Resolved:** `field-app-pages.yml` updated to use `${{ vars.VITE_LINE_LOGIN_CHANNEL_ID }}` and `${{ vars.VITE_MONOLITH_URL }}`. Action needed: create these two Repository Variables in GitHub Settings → Secrets and Variables → Variables, then delete the old Secrets of the same name.

---

## Recommended Remediation Actions

| Priority | Action |
|---|---|
| ~~P1~~ | ~~Rename `LINE_CHANNEL_ACCESS_TOKEN` → `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN`~~ — **DONE** (`ci.yml` secret ref updated; internal env var key left unchanged for app-code compatibility) |
| ~~P1~~ | ~~Rename bare `SUPABASE_URL` / `SUPABASE_ANON_KEY` → `MONOLITH_SUPABASE_URL` / `MONOLITH_SUPABASE_ANON_KEY`~~ — **DONE** (`ci.yml` updated) |
| ~~P2~~ | ~~Move `VITE_LINE_LOGIN_CHANNEL_ID` and `VITE_MONOLITH_URL` to **Repository Variables**~~ — **DONE** (workflow updated to `vars.*`; remember to create the Variables and delete the old Secrets in GitHub UI) |
| ~~P3~~ | ~~Add a naming convention doc~~ — **DONE** (`docs/secrets-naming-convention.md` created; full compliance table for all 20 secrets, approved MODULE/CREDENTIAL_TYPE token lists, future-secrets checklist) |
| ~~P3~~ | ~~Rename remaining non-compliant secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_JWT_SECRET`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`)~~ — **DONE** (renamed to `MONOLITH_SUPABASE_*` across all 4 workflow files; 15 refs updated) |
| ~~P3~~ | ~~Add CI lint step validating secret names against `MODULE_SERVICE_CREDENTIAL_TYPE` pattern~~ — **DONE** (`scripts/lint_secret_names.py` + job in `lint.yml` + `.pre-commit-config.yaml`) |

---

## Notes

- `GITHUB_TOKEN` is an automatically provisioned built-in; it does not need to be created or rotated manually.
- `LINE_NOTIFY_TOKEN` (secret #11) is referenced in `billing-report.yml` but **has not yet been set** in the repository. The workflow step that sends the LINE notification is guarded with `if: env.LINE_NOTIFY_TOKEN != ''` so it silently skips until the secret is populated.
- `MIGRATION_BACKUP_KEY` is used exclusively in `production-migration-apply.yml`, which intentionally keeps `cancel-in-progress: false` to protect DB write serialization.
- `DATABASE_URL` and `MIGRATION_BACKUP_KEY` are grandfathered (2-segment names) — see allowlist in `scripts/lint_secret_names.py`.
- After renaming secrets in workflows, update the **actual GitHub repository secrets** (Settings → Secrets and Variables → Actions) to use the new names. Old secret names must be deleted and new ones created with the correct values.
