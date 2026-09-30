# Stage 1 work plan: Daph D1 Shadow Pilot — v0.2

- **Date:** 29 September 2026
- **Status:** A draft for planning and quotes. It is not a quotation or a spending approval.
- **Code checked:** `main` @ `5dc57e10`
- **Pages/Designer status updated:** 30 September 2026, `main` @ `12ef2dc6`, after PR #127 and PR #130 were deployed. Only section 2 (the Pages rows), WP0 0.2 and WP1 1.2 changed; everything else is still as checked at `5dc57e10`.
- **Scope:** Daph uses Monolith to track one real house, with data stored on the server. The factory still cuts from its existing work orders (`SHADOW_MODE_NOT_FOR_PRODUCTION = true`; the packet verifier can only return `NO_CUT`).

> This plan builds on [DAPH-SHADOW-PILOT-READINESS-v0.1.1](DAPH-SHADOW-PILOT-READINESS-v0.1.1.en.md) ([TH](DAPH-SHADOW-PILOT-READINESS-v0.1.1.th.md)), in the same PR. v0.1.1 only rewords v0.1 to pass the repo guardrails; its substance is unchanged. That report is a retrospective at baseline `5dc57e10` and is not updated; the Pages/Designer status after that baseline is recorded here.

## 1. How to use this plan

- It frames investigation and pilot preparation. It does not commit to scope or budget.
- **WP1 is a decision point.** Once WP1 has checked the real system, re-estimate scope and budget before committing to all of WP2–WP4.
- Every day and baht figure is an up-front estimate. **Nobody has yet confirmed that the time estimates are enough.**

## 2. Facts this plan relies on

| Fact | Evidence |
|---|---|
| Organisations, jobs and quotations are stored in the browser (Zustand `persist`) | `src/tenant/tenantStore.ts` (`monolith-tenant-store`), `src/jobs/jobStore.ts` (`monolith-jobs-store`), `src/quotation/quotationStore.ts` (`monolith-quotation-store`) |
| The job wizard calls the local store's `createJob` | `src/jobs/CreateJobWizard.tsx:57`, `:146` |
| Source defines `customers`, `jobs`, `job_panels`, `quotations` and `quotation_lines` with RLS | `supabase/migrations/0172_jobs_quotations_invoices.sql`; `org_id` added in 0173, 0179 and 0183 |
| `jobs` and `quotations` require `customer_id` and `created_by` (`NOT NULL`) | `0172_jobs_quotations_invoices.sql` lines 58–76 and 106–125 |
| Three realtime subscriptions listen on table `job` (singular), but the migration creates `jobs` | `src/jobs/JobDetailPage.tsx:330`, `src/jobs/useJobBoardRealtime.ts:140`, `src/jobs/useSupabaseRealtimeChannel.ts:205` |
| `jobs` was removed from realtime on purpose, to stop cross-organisation leaks | `supabase/migrations/0173_rls_isolation_hardening.sql`, section F6 |
| `useCreateJobSubmit.ts` posts to `/rest/v1/job` with the anon key as the Bearer token, and in source only `src/jobs/index.ts` references the hook | `src/jobs/useCreateJobSubmit.ts:133–139`; searched with `git grep useCreateJobSubmit -- src` |
| Three `0190` migrations share a number; CI merges duplicates before testing | `scripts/prepare_supabase_migrations_ci.sh --merge-duplicates` in `pgtap-tests.yml` and `db-verify.yml` |
| At `5dc57e10`: three workflows deployed GitHub Pages over one another, so `/designer/` and the Field PWA returned 404 (fixed since; see the next row) | `github-pages` deployment history (Deployments API): last field-app deploy 2026-09-13 [run 34731453999](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34731453999) at `13de5d1b`; docs deploy on top of it 2026-09-21 [run 35594892612](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/35594892612) at `62651733`. Live check 2026-09-29T12:59Z: `/` = 200 (docs site v2.0.0 title), `/designer/` = 404, `/manifest.webmanifest` = 404. Commands: `gh api repos/indetailsgroup-hue/monolith-workspace/deployments?environment=github-pages` and `curl -s -o /dev/null -w %{http_code}` per URL. Code fix in PR #127 |
| Since 30 Sep: one workflow deploys the Field PWA, the Designer and the docs together (PR #127), and the Designer works under the Pages sub-path (PR #130) | [PR #127](https://github.com/indetailsgroup-hue/monolith-workspace/pull/127) merged 2026-09-30T01:25Z as `c8e5380c`; deploy [run 36655069520](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36655069520) succeeded (deployment 6749271888). Live check 01:32Z: `/designer/` answered 200 but rendered the app's own "Page not found", because the router had no basename. [PR #130](https://github.com/indetailsgroup-hue/monolith-workspace/pull/130) merged 03:20Z as `12ef2dc6`; deploy [run 36663972596](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36663972596) succeeded (deployment 6750700437). GitHub reports `verified=true` for both merge commits and both PR heads (`293a2b20`, `1472311d`). Live check 2026-09-30T03:54:55Z: `/`, `/designer/`, `/docs/` and `/manifest.webmanifest` = 200; a Designer deep link such as `/designer/jobs` = 404 on the first request, and the site's `404.html` sends it back into the Designer. Rendered at 03:55:10Z: `/` shows the Field PWA login, `/designer/` the workspace with its 3D canvas, `/designer/jobs?view=list#top` the job board with the URL kept, `/docs/` chapter 1. Commands: `gh run view <run id>`, `gh api repos/indetailsgroup-hue/monolith-workspace/deployments?environment=github-pages`, `curl -s -o /dev/null -w %{http_code}` per URL, and the page title and text read in a browser |
| Real-cut gates: 0/4 | `node scripts/readiness-status.mjs --json`, run 29 Sep |

**Not yet confirmed:** whether the Supabase project we will use has every migration applied, whether server-side RLS behaves as the source says, and whether the data relationships and revisions are enough for the pilot. So "the database is ready" is not yet established.

## 3. WP0 — Owner decisions first

| # | Decision | Why |
|---|---|---|
| 0.1 | Which Supabase project to use | Source references two projects |
| 0.2 | Confirm where each site lives | Live since 30 Sep (PR #127, PR #130): Field PWA at `/`, Designer at `/designer/`, docs at `/docs/`. The owner still confirms this layout for the pilot |
| 0.3 | Which house is the pilot | Continue house-01 or start a new one |
| 0.4 | The 3–5 users and reviewers | Sales, designer, factory, finance |
| 0.5 | Policy for real customer data (PII) | What may be stored on the server |
| 0.6 | Whether to re-enable realtime on `jobs` | A security decision under 0173 F6 |

## 4. WP1 — Environment and deploy (2.75–3.75 engineer-days)

| Task | Days | Done when |
|---|---|---|
| 1.1 Compare the server's applied migrations with source and name the owner of each secret, **without renumbering files** | 1–1.5 | Migration and secret-owner lists match reality |
| 1.2 Fix the Pages collision | **Done 30 Sep:** PR #127 merged and deployed; the in-app 404 on `/designer/` it exposed was fixed in PR #130, also deployed; URLs checked 03:55Z (section 2). 0.25, kept in the WP1 total as effort spent | `/`, `/designer/` and `/docs/` all load: met on 30 Sep |
| 1.3 Configure auth redirects, TLS and the pilot env | 0.5 | Login and logout work from another machine |
| 1.4 Rehearse backup and restore for both the DB and storage objects | 1–1.5 | A successful restore is recorded |

**Decision after WP1:** re-estimate the scope and budget of WP2–WP4 from what WP1 found.

## 5. WP2 — Daph organisation and users (2–3 engineer-days)

| Task | Days | Done when |
|---|---|---|
| 2.1 Create the Daph org and site with a reviewed seed (no self-serve signup yet) | 0.5 | The org exists in the database |
| 2.2 Invite 3–5 users and set roles in `org_members` | 0.5 | Everyone logs in and sees the Daph org |
| 2.3 Make `tenantStore` read orgs from the server and disable in-browser org creation | 0.5–1 | The org survives clearing the browser |
| 2.4 **(Mandatory)** Cross-organisation read and write tests | 0.5–1 | A user from another org is refused both reads and writes |

## 6. WP3 — Jobs and quotations on the server (6–9.5 engineer-days)

| Task | Days | Done when |
|---|---|---|
| 3.0 Review the data model: customer (`customer_id`), creator (`created_by`), revisions, and saving a header with its lines so both succeed or both fail | 0.5–1 | A written conclusion on which schema or RPC additions are needed |
| 3.1 `jobStore` writes to `jobs` and `job_panels` | 1.5–2.5 | A job created on machine A appears on machine B |
| 3.2 Realtime uses the logged-in client, filters by `org_id`, plus a migration re-enabling realtime (needs 0.6 first) | 1 | Updates reach other machines; other orgs receive no events |
| 3.3 `quotationStore` writes to `quotations` and `quotation_lines` with revision and approver | 1.5–2.5 | Quotations and revisions survive a reload |
| 3.4 Link the Field-app project to the job and quotation | 0.5–1 | From a project you can reach its job and quotation |
| 3.5 Rewrite `e2e/jobs-quotation.spec.ts` to use the server instead of localStorage | 0.5–1 | Passes in CI |
| 3.6 Use the user's session instead of the anon key; fix or remove `useCreateJobSubmit.ts` | 0.5 | Every database write carries the user's JWT |

## 7. WP4 — Design to packet under NO_CUT (2–3.5 engineer-days)

| Task | Days | Done when |
|---|---|---|
| 4.1 Save the 3D design against the job and revision on the server | 1–1.5 | The same design opens on another machine |
| 4.2 Pick one packet path (the existing packet or `server/src/packet/v2`) and upload through factory-api | 0.5–1 | A server receipt with a hash |
| 4.3 **(Mandatory)** Test a valid file, a file that must be refused, and a tampered file | 0.5–1 | The tampered file is actually refused. A NO_CUT label alone does not count as a pass |

## 8. WP5 — Factory-side preparation (5–9 Daph staff-days, can run in parallel)

| Task | Days | Done when |
|---|---|---|
| 5.1 Map material and hardware codes used by the pilot house | 1.5–2.5 | Every part of the pilot house has a code in the system |
| 5.2 Train 3–5 users | 1–2 | Each person can do their own steps |
| 5.3 Discrepancy record form (per section 8 of the v0.1.1 report) | 0.5 | Ready to use |
| 5.4 Rehearse the 17-step UAT (per section 9 of the v0.1.1 report) | 1.5–3 | Every step has evidence; a skipped step never counts as passed |
| 5.5 Rehearse reconciling finance against the existing ledger | 0.5–1 | Totals match, or the difference is explained |

## 9. WP6 — Contingency for defects found in UAT (3–6 engineer-days)

## 10. Days and budget

| Item | Days | Rate (assumed) | THB |
|---|---|---|---|
| Engineering WP1–WP4 | 12.75–19.75 | 3,000–5,000 per day | 38,250–98,750 |
| Contingency WP6 | 3–6 | 3,000–5,000 per day | 9,000–30,000 |
| Staff WP5 (if hired) | 5–9 | 1,000–2,000 per day | 5,000–18,000 |
| **One-off total** | engineering 15.75–25.75 | | **52,250–146,750** |
| Monthly running cost | | | 900–2,000 per month |

- The rates are **assumptions**; no market survey was done. At 5,000–8,000 THB/day the total is roughly 84,000–224,000 THB.
- If the owner does the work with AI, **outside labour costs fall, but time and running costs remain.**
- Excludes VAT, travel, existing salaries, machinery and PITR (add a monthly cost if needed).

## 11. Two delivery points

**Point 1 — Ready to start D1** (about 4–6 weeks with one engineer working continuously)
1. Two users on two machines see the same jobs, quotations and designs.
2. The cross-organisation tests (2.4) and the tampered-packet test (4.3) pass.
3. A restore rehearsal succeeds.
4. The 17-step UAT rehearsal is complete, with evidence for every step.

**Point 2 — D1 complete** (depends on the factory and site schedule, outside Point 1's timeframe)
1. The real house has a full record: quotation → design → BOM and cut list → packet (NO_CUT) → QC → installation → handover → finance reconciliation.
2. Every discrepancy between the system and the factory has a disposition.
3. The pilot's data is used to estimate the next stage (real cutting) instead of guessing.

## 12. Out of scope

Real cutting and machine calibration, ADR-064 sign-off, S17 closure, inventory, full accounting (including the tables `src/hooks/useAccounting.ts` references), payroll, BI, IoT and Phase 15.

## 13. Revision history

**v0.1 → v0.2** (after a review checked against code `5dc57e10`)
1. Added 3.0 (data-model review) and 3.6 (authentication), after finding that `useCreateJobSubmit.ts` uses the anon key.
2. The cross-organisation test (2.4) and tampered-packet test (4.3) are mandatory, at least 0.5 days each.
3. Separated "ready to start D1" from "D1 complete".
4. Totals now match the subtasks; 3.2 re-estimated from 0.25 to 1 day.
5. 1.1 does not renumber the `0190` migrations.
6. WP1 is a decision point before committing to WP2–WP4.
7. Reworded "doing it yourself with AI costs almost no cash" to "outside labour costs fall, but time and running costs remain".

**v0.2 second revision** (after the second review)
1. 1.2 changed from "Done" to "Code fixed in PR #127, awaiting merge and deploy", because the live system has not changed yet.
2. The Pages 404 fact now cites run links, the deployed SHAs and a timestamped live check instead of a narrative.
3. References to the v0.1 report (outside the repo) now link to v0.1.1 in the same PR.

**v0.2 third revision** (30 Sep, after PR #127 and PR #130 were deployed)
1. 1.2 changed from "awaiting merge and deploy" to done, with the merge, deploy-run and live-check evidence in section 2.
2. Section 2 keeps the `5dc57e10` Pages fact as history and adds a row for the fix; WP0 0.2 now records the layout that is live.
3. The readiness report v0.1.1 is unchanged. It stays a retrospective at baseline `5dc57e10`, and its evidence hashes still match that commit.
4. No figure changed: the 0.25 day for 1.2 stays in the WP1 total and the one-off total is still 52,250–146,750 THB.
