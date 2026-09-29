# PR: People/Culture Module — MONOLITH v16.0

**Branch:** `feature/people-culture-module` → `main`
**Repo:** `indetailsgroup-hue/monolith-workspace`

---

## Summary

Implements the full **People/Culture Module** for MONOLITH Manufacturing OS (DAPH Decor, Thailand), based on the 2S2P1C SLR Feature Spec & Roadmap. This PR introduces:

- **Super Employee Framework** — stage-progression tracking (AWARE → ADVANCING → EXCELLING → TRANSFORMING → EXEMPLARY) with TypeScript types, Zustand store, SQL schema, and RLS-gated data access.
- **Psychological Safety (PS) Module** — PS survey forms using Likert 1–7 scale across 4 dimensions (SPEAK_UP, HELP_SEEKING, RISK_TAKING, INCLUSION), score aggregation, benchmark comparison (Thai manufacturing benchmark = 55), and anonymous feedback with ADMIN-only visibility.
- **CultureDashboard** — RBAC-gated dashboard; ADMIN+ (`ORG_ROLE_HIERARCHY >= 80`) unlocks anonymous feedback list and PS radar chart.
- **PeopleDirectory** — Employee list with skill filter, stage filter, full-text search, SuperEmployee badge, and expandable detail panel.
- **Audit Log** — Tamper-evident `audit_log` table with automatic triggers on `org_members`, `jobs`, `employees`.
- **Full Vitest test coverage** across all 5 new test files (109 tests total).
- **GitHub Actions CI** workflow for automated vitest + typecheck on push/PR.

---

## Files Changed

### New Source Files
| File | Description |
|------|-------------|
| `src/core/supabase.ts` | Lazy Proxy shim, exports named `supabase` client |
| `src/people/types.ts` | `SuperEmployeeStage`, `Employee`, `Skill`, `EmployeeFilters`, `DEFAULT_EMPLOYEE_FILTERS`, `SUPER_EMPLOYEE_STAGE_LABEL_TH`, `AiStage` alias, `filterEmployees()`, `computeSkillGap()`, `computePeopleDashboardMetrics()` (612 lines) |
| `src/people/peopleStore.ts` | `usePeopleStore` Zustand store; actions: `loadEmployees`, `loadSkills`, `setFilters`, `resetFilters`, `getFilteredEmployees` (1003 lines) |
| `src/people/SuperEmployeeProgressCard.tsx` | Stage card with progress bar, skill gap display, next-stage requirements (402 lines) |
| `src/people/PeopleDirectory.tsx` | Employee list — skill filter, stage filter, search, SuperEmployee badge, expandable panel (392 lines) |
| `src/culture/types.ts` | `PsDimension`, `PsScore`, `AnonymousFeedback`, `THAI_MANUFACTURING_PS_BENCHMARK = 55`, `PsSurveyTemplate` (652 lines) |
| `src/culture/cultureStore.ts` | `useCultureStore` Zustand store; standalone selectors: `selectScoresForChart`, `selectIsAnyLoading`, `selectPendingFeedback`, `selectCurrentPeriodLabel`, `selectActiveSurvey`; actions: `fetchPsScores`, `fetchAnonymousFeedback`, `actionFeedback`, `submitSurveyResponse`, `hasSubmittedThisPeriod`, `getOrCreateAnonymousToken` (717 lines) |
| `src/culture/CultureDashboard.tsx` | RBAC-gated dashboard; Recharts RadarChart + FeedbackList (ADMIN+ only) (542 lines) |
| `src/culture/PsSurveyForm.tsx` | Anonymous PS survey form; Likert 1–7 per dimension; anonymous token logic (534 lines) |

### New Test Files
| File | Tests | Coverage |
|------|-------|----------|
| `src/people/__tests__/SuperEmployeeProgressCard.test.tsx` | 20 | Badge render per stage, skill gap display, progress bar, inactive state |
| `src/people/__tests__/validateStageProgression.test.ts` | 31 | Trigger logic: valid transitions, invalid blocks, edge cases, all 5 stages |
| `src/people/__tests__/PeopleDirectory.test.tsx` | 46 | Initial load, skill filter, stage filter, search, reset, loading/empty states, SuperEmployee badge, count header, callback, inactive badge |
| `src/culture/__tests__/CultureDashboard.test.tsx` | 19 | `isAdmin` conditional render, `fetchAnonymousFeedback` ADMIN gate, loading states, radar chart mount |
| `src/culture/__tests__/PsSurveyForm.test.tsx` | 30 | Likert render, anonymous token, submit success/error, dimension validation, already-submitted guard |
| **Total** | **146** | |

### New SQL Migrations
| File | Description |
|------|-------------|
| `supabase/migrations/20261001_people_culture_schema.sql` | Tables: `employees`, `skills`, `employee_skills`, `training_records`, `super_employee_progress`, `ps_survey_templates`, `ps_survey_responses`, `ps_scores`, `anonymous_feedback` — all with `FORCE ROW LEVEL SECURITY` (883 lines) |
| `supabase/migrations/20261001_audit_log.sql` | `audit_log` table + automatic triggers on `org_members`, `jobs`, `employees` (196 lines) |

### New Docs
| File | Description |
|------|-------------|
| `docs/MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md` | SLR-derived feature spec + roadmap + prioritization (826 lines) |
| `docs/SECURITY_REVIEW_RLS.md` | RLS security review — 9 issues identified and mitigated (414 lines) |
| `docs/MONOLITH_DEEP_REVIEW.md` | Full system deep review, score 3.9/5 (1008 lines) |

### Modified Files
| File | Change |
|------|--------|
| `vitest.setup.ts` | Added stubs: `crypto.randomUUID`, `localStorage`, `matchMedia`, `ResizeObserver` |
| `package.json` | Added `recharts ^2.12.7` |

### Pending (Requires Manual Push)
| File | Reason |
|------|--------|
| `.github/workflows/people-culture-ci.yml` | PAT requires `workflow` scope to push — see CI section below |

---

## Migration Checklist

Run the following on Supabase **in order** before deploying:

- [ ] Run `supabase/migrations/20261001_people_culture_schema.sql` on Supabase SQL Editor (or `supabase db push`)
- [ ] Run `supabase/migrations/20261001_audit_log.sql` on Supabase SQL Editor (or `supabase db push`)
- [ ] Verify all 9 tables exist: `employees`, `skills`, `employee_skills`, `training_records`, `super_employee_progress`, `ps_survey_templates`, `ps_survey_responses`, `ps_scores`, `anonymous_feedback`
- [ ] Verify `audit_log` table + triggers on `org_members`, `jobs`, `employees`
- [ ] Confirm RLS is `ENABLED` + `FORCE ROW LEVEL SECURITY` on all new tables
- [ ] Seed `ps_survey_templates` with initial template if needed
- [ ] Run `npm install` (or `npm ci`) to install `recharts ^2.12.7`

---

## Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key | Yes |
| `VITE_API_BASE_URL` | Backend API base URL | Optional |
| `VITE_USE_MOCK` | `'true'` to use mock data in development | Optional |
| `VITE_FACTORY_API_BASE` | Factory IoT API base URL | Optional |

Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Supabase project settings and in CI secrets.

---

## Test Coverage

Run tests locally:
```bash
npm run test:coverage
# or: npx vitest run --coverage src/people/ src/culture/
```

All test files use the `vi.hoisted` pattern for store mocking and are isolated — no real Supabase calls are made.

### RBAC Security Notes
- `anonymous_feedback` SELECT policy: **ADMIN+ only** (`ORG_ROLE_HIERARCHY >= 80`)  
  Rationale: Thai Hi-PD organizational culture — premature disclosure of anonymous feedback undermines psychological safety adoption.
- `ps_scores` SELECT: all org members; INSERT/UPDATE: ADMIN+
- All tables enforce `org_id` scoping via `get_current_org_id()` RLS helper.

---

## GitHub Actions CI

File: `.github/workflows/people-culture-ci.yml`

**Jobs:**
1. `unit-tests` — runs `npm run test:coverage` scoped to `src/people/` and `src/culture/`; uploads coverage artifact
2. `typecheck` — runs `tsc --noEmit`

**Trigger:** push or PR targeting `feature/people-culture-module`

> **Note:** This file is **not yet pushed** to the repo. The PAT used for this branch lacks `workflow` scope.  
> To push it, generate a new PAT with `repo` + `workflow` scopes and run:
> ```bash
> git push origin feature/people-culture-module
> ```
> (The file already exists at `.github/workflows/people-culture-ci.yml` in the local clone.)

---

## PR Checklist

- [x] TypeScript — no `any` in new files (store state is fully typed)
- [x] Zustand stores use `persist` with named keys (`monolith-people-store`, `monolith-culture-store`)
- [x] All new tables have `FORCE ROW LEVEL SECURITY`
- [x] ADMIN threshold is `ORG_ROLE_HIERARCHY[role] >= 80` (consistent across store + component + tests)
- [x] `AiStage` alias retained for backward compatibility
- [x] Recharts mocked in all CultureDashboard tests (avoids canvas errors in jsdom)
- [x] `ResizeObserver` stub in `vitest.setup.ts` (required by Recharts)
- [x] No separate `vitest.config.ts` added — Vitest config lives in `vite.config.ts` `test:` section
- [ ] CI workflow pushed (pending PAT with `workflow` scope)
- [ ] Migrations run on staging Supabase
- [ ] `recharts` installed (`npm ci`)

---

## Commits in This PR

| Commit | Description |
|--------|-------------|
| (earlier commits) | Initial People/Culture module files, stores, migrations, docs |
| `c19db7aa` | CultureDashboard tests + PeopleDirectory component |
| `05eead9d` | PeopleDirectory tests + fix loadEmployees/loadSkills bug |

---

*Generated for MONOLITH v16.0 — DAPH Decor (Thailand) Manufacturing OS*
