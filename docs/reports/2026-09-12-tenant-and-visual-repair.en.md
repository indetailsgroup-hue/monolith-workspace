# Tenant and visual repair — technical handoff

**Edition:** English

**Date:** 12 September 2026

**Status:** Published dfdb466 CI verified; static-chart follow-up locally checked, new-head CI and six remaining visual acceptances pending at authoring

**Source baseline:** product commit `a99b474b790d1b94932302ed818834272f16e529`

**Published repair source commit:** `3da55463ccb1bacb179068084218afae9c78a6c4` (included in published 529930f; verified checkpoint below)

**Companion:** [Thai edition](2026-09-12-tenant-and-visual-repair.th.md)

This patch addresses a jobs INSERT policy bypass, the organization claim required by existing RPCs, an incorrect repeated-invoice-approval assertion, and specific visual defects found during Build 93 review. Evidence is scoped to source review, the recorded tests, and the named browser checks. This record grants neither production deployment nor operational acceptance, and it does not integrate the SciSpace v2 package.

## Published verification checkpoint

At the recorded **04:35:35 UTC, 12 September 2026** checkpoint, published head [dfdb466871f83cb812d17506788a973ac21c5a98](https://github.com/indetailsgroup-hue/monolith-workspace/commit/dfdb466871f83cb812d17506788a973ac21c5a98) had **19 successful PR workflows**. It includes the required database step, role-select color correction and the subsequently unsuccessful 2,000 ms Culture delay experiment. These results apply to that published checkpoint; consult [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106) for later CI, visual acceptance and integration outcomes.

| Hosted check associated with dfdb466 | Verified result | Scope |
|---|---|---|
| Root unit / typecheck / build | **361 files / 7,329 tests passed**; full TypeScript and build succeeded | [Full Verify job 103498040023](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34673089458/job/103498040023) |
| SQL pgTAP | **37 files / 695 assertions passed** | Fresh CI Supabase with the complete prepared migration chain |
| Repaired 0173 SDK suite | **55 cases passed in the required step** | Strict setup, Auth-issued login/refresh, FINANCE allowance, VIEWER/cross-tenant denial and repeat-approval rejection |
| Configured TypeScript database selection | **31 files / 1,407 reported passed; zero reported skipped** | The log explicitly reports unavailable `public.run_sql(query)` for legacy 0205 F1/F2/G3/G4; those cases return before assertions. The total is not proof of non-vacuous assertions in every case |

Database [job 103498040070](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34673089545/job/103498040070) confirmed the required step, outcome report, evidence upload and cleanup all succeeded. Raw logs identify standard PR merge ref `0a144abb1a33432ba77ed71024567ceb5c55ee41`, combining dfdb466 with base `1c554a3cdf33c43ae4971ce1b984d39572f5d47a`. Compact proof is parent-only `tmp/ci-dfdb466-evidence.json`; no raw credential-bearing logs were saved.

<!-- adversary: Independently fetched complete root and database job logs and final step outcomes for this PR-head checkpoint. Parsed root 361/7329, SQL 37/695, strict 0173 55 and configured 31/1407; retained actual 0205 early-return warnings and PR merge-ref qualification. CI success does not accept unstable visuals or certify later source edits. -->

The preceding 529930f checkpoint and source commits `3da5546` / `187c6302` remain dated history; 187c6302 was published through dfdb466. Static-chart source candidate [53fbc3368393293dde0cb94df252155f86831125](https://github.com/indetailsgroup-hue/monolith-workspace/commit/53fbc3368393293dde0cb94df252155f86831125) has the local verification below; CI and Chromatic capture for the next published head are **PENDING at authoring**. Final outcomes will be recorded in PR #106 and the parent final addendum.

At the authenticated PR #106 UI inspection, merge still required verified commit signatures and at least one approving review from a reviewer with write access. Merge remains pending those repository gates and the remaining visual review; CI success alone does not authorize bypassing them.

## 1. Repository and evidence boundary

The governance parent and original nested product were inspected separately before this document was written. Their existing changes were preserved.

| Repository | Observed HEAD | Scope |
|---|---|---|
| Parent governance/bootstrap: `C:/Users/thai3/determined-williams (2)` | `aa1b30e509ece9d8efad3d68e949860aa79bdecf` | Governance records and local evidence; 11 tracked changes / 607 grouped untracked entries at inspection. |
| Original nested product: `determined-williams/` | `9c4bee6759f6d1919a320a2f56088ce683287f58` | Existing product working tree; 22 tracked changes / 61 grouped untracked entries, preserved. |
| Implementation checkout: `C:/Users/thai3/.codex/worktrees/monolith-scispace-r0-20260912` | `a99b474b790d1b94932302ed818834272f16e529` | Product code and candidate tests on `codex/scispace-r0-quality-gates`; concurrent repair edits are in progress. |

Parent-only authority files are `CONTEXT.md` and `docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md`. They are named here as parent paths, not published relative links in the product checkout. Product implementation claims below refer to the implementation checkout.

## 2. Retained baseline and earlier local verification

The actual legacy result at `a99b474` was **47 passing and 4 failing cases out of 51, with zero skipped**, while the SQL lane recorded **673 passing assertions across 35 files**. The four failures were the VIEWER jobs INSERT case, two RPC cases requiring a top-level organization claim, and the repeated invoice approval assertion. Earlier stale database fixture names had blocked the 51 cases before their authorization assertions; compatibility repair exposed these four real failures. The SQL result therefore did not establish that the legacy TypeScript contract was green. Coordinator proof: [baseline run 34668739760, job 103485889281](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34668739760/job/103485889281).

<!-- adversary: The coordinator supplied the actual a99b474 job above with the 47/51 legacy result and SQL 673 result. This draft preserves the four failures and does not relabel the baseline as a successful complete tenant lane. At that initial handoff candidate CI had not yet been supplied; the exact published result is now recorded above. -->

| Earlier local check | Evidence before the published checkpoint | Limit at that time |
|---|---|---|
| Jobs restrictive guard | 7 source test assertions; native PostgreSQL 18 log records 7 PASS results. | Source-extracted minimal fixture, not the full historical migration chain. |
| Shared Auth hook | 15 source test assertions; native PostgreSQL 18 log records 15 PASS results, including function privileges and claim behavior. | Same limited native fixture; hosted Auth activation and complete Supabase startup are separate checks. |
| Legacy SDK suite | Candidate file now contains 55 total cases; added real password-login/refresh paths and FINANCE positive coverage. | The subsequent 529930f job passed all 55; see the exact-head result above. |
| Culture chart regression | Implementing reviewer reported 20 focused tests passing, including the real-selector/real-axis regression. | Local focused result; updated visual snapshots and final candidate CI remain pending. |
| QC control styling | Scoped ESLint and scoped `git diff --check` exited 0 for the 9-line change. | Reversible style-only change; Build 93 contains the earlier pixels. |

<!-- adversary: Read both native logs and counted 7 plus 15 PASS entries; no full-chain claim is made. The Culture 20-test result is attributed to its implementing reviewer. The QC scoped lint and diff checks were executed during this review. -->

The native proof files are parent-only local evidence: `tmp/legacy-db-20260912/jobs-native-final.log` and `tmp/legacy-db-20260912/hook-native-final.log`. The harness at `tmp/legacy-db-20260912/native_assertions.sql` and prepared local fixture are auxiliary evidence, not substitutes for applying every migration.

The coordinator subsequently recorded a local root Vitest result of **360 files / 7,326 tests, all passing with zero skipped**, and a full TypeScript build check with exit 0. Evidence is parent-only `tmp/final-aggregate-20260912/root-vitest.json`, `root-vitest.log`, `typecheck.log`, and `status.json`. This aggregate precedes the late quotation tax-label fix described below; it is not verification of that later candidate and is not hosted CI success.

<!-- adversary: The coordinator supplied the 360-file/7326-test result and TypeScript exit 0; the named local aggregate is explicitly dated before the late tax change. The later 529930f SDK result is separately recorded above. -->

## 3. Tenant repair mechanism and retained contracts

**Jobs INSERT.** Legacy organization-only permissive INSERT and FOR ALL policies combine with other permissive policies using OR. A matching organization could therefore admit a VIEWER even when the canonical `0178` role predicate rejected that user. The new jobs-only restrictive INSERT policy independently requires the existing organization and role predicate: factory, admin, designer, or governance role. FINANCE retains its existing governance allowance. UPDATE and DELETE semantics are outside this repair. Source: `supabase/migrations/20270324_jobs_insert_role_guard.sql:6`; regression source: `supabase/tests/20270324_jobs_insert_role_guard.sql:4`.

**Auth-issued organization claim.** The existing `0180` RPC guard requires top-level `org_id`; the earlier signed local fixture supplied only `app_metadata.org_id`. The candidate supplies a shared `public.custom_access_token_hook` and enables that same function in local `supabase/config.toml:40`. It checks that the Auth event user matches the token subject and that the server-managed selected organization exists with active membership. Invalid or stale selections lose top-level `org_id`; other claims are preserved. User-editable metadata supplies no tenant authority and the hook chooses no fallback organization. It changes no roles. Source: `supabase/migrations/20270325_auth_org_claim_hook.sql:6`.

The function uses SECURITY DEFINER with an empty search path, explicit schema-qualified relations, and execution limited to `supabase_auth_admin`; PUBLIC, anon, authenticated, and service_role execution is revoked. The 15 SQL cases cover privileges, subject matching, active/foreign/inactive/malformed selections, stale-claim removal, other-claim preservation, and refresh. The SDK cases use Supabase Auth password login and refresh, inspect returned signed claims, and call the RPC with those issued tokens. They manufacture no signed sessions. Sources: `supabase/tests/20270325_auth_org_claim_hook.sql:4`, `src/__tests__/rls/0173_rls_multitenancy.test.ts:234`.

Supabase documents this hook as running before access-token issuance, including the `token_refresh` authentication method, and requires its standard token claims to remain valid. See [official Custom Access Token Hook documentation](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook).

**Repeated invoice approval.** The existing invoice function deliberately raises `P0004` for an already-approved invoice. The client receives a PostgREST error and null data, rather than a `data.success=false` payload. The repaired assertion checks that error and verifies unchanged approval fields and journal count. Source contract: `supabase/migrations/0176_auto_journal_on_approval.sql:470`; candidate assertion: `src/__tests__/rls/0173_rls_multitenancy.test.ts:1000`. This is a test-contract correction, not a change to the invoice function.

## 4. Auth activation prerequisite and remaining tenant limitation

A hosted Supabase project must apply the migration and separately enable this same function as its Custom Access Token hook. Local configuration does not establish hosted enablement. Before operational use, verify a fresh hosted login and refresh using eligible membership, then verify that a foreign selection or inactive membership loses the tenant claim and the existing RPC rejects the resulting token. Retain the existing role policy; this hook is not a new role-assignment mechanism.

The pre-existing multi-organization resolver divergence remains: `get_user_org_id()` chooses the earliest active membership by `joined_at`, while the identity guard can validate the selected organization in the JWT. `rpc_job_board` still resolves its query organization through `get_user_org_id()`. Thus a user with multiple active memberships needs an explicit follow-up reconciliation of selection and query scope; this patch does not establish that those scopes coincide. Sources: `supabase/migrations/20261001_people_culture_schema.sql:24` and `supabase/migrations/0180_identity_reconciliation_hardening.sql:296`.

## 5. Build 93 defects and earlier fixture verification

This table preserves the initial 3da5546 source/local-checkpoint findings from the Build 93 review. The later Build 94 and Build 95 sections supersede its historical pending-capture entries.

| Area | Observed cause and candidate change | Review evidence and remaining check |
|---|---|---|
| CultureDashboard | Chart selector emits `period`, but XAxis read `periodLabel`; use the selector's actual field. Two native selects receive explicit white backgrounds/light control scheme. | Regression uses the real Zustand selector and Recharts axes, with only responsive-container sizing mocked; 20 focused tests reported. Sources: `src/culture/cultureStore.ts:676`, `src/culture/CultureDashboard.tsx:385`, `src/culture/__tests__/CultureDashboard.chart.test.tsx`. Updated capture pending. |
| QcAnomalyDashboard | Three native filters inherited dark control backgrounds with dark text on a light panel. Set white background, `#374151` text, and light control scheme. | Exactly 9 style lines; scoped lint/diff check recorded above. Source: `src/qc-anomaly/QcAnomalyDashboard.tsx:257`. Eleven old snapshots withheld. |
| Role detail panel | Text on the light role panel inherited an unreadable foreground. Give the panel explicit `#111827` text color. | `src/role-network/RoleNetworkCanvas.tsx:338`; reviewer reported scoped ESLint exit 0 for this and the two story corrections. Five earlier role-panel snapshots withheld for new captures. |
| AiCostDashboard | Percentage-height bars had no definite parent height and collapsed. Provide a full-height column and bounded bar plot. Correct the named 40% budget fixture to 215 / 537.50, and use the actual month label/end date. | Coordinator's local browser measurement: heights 59.7143 / 94.875 / 120 px for costs 107 / 170 / 215; common bottom 520.857 px and plot height 120 px. Screenshot showed three bars. Sources: `src/ai-cost/AiCostDashboard.tsx:353`, `src/ai-cost/AiCostDashboard.stories.tsx:68`. Hosted capture pending. |
| BottleneckHeatmap SingleStage | Fixture specified 10 jobs without coherent bottleneck count/rate. Set 4 bottlenecks and 40%. | `src/jobs/BottleneckHeatmap.stories.tsx:92`; inspect the new fixture snapshot. |
| OrgChart drag interaction | Story spy did not apply the production store's optimistic coordinate update, so cards and SVG edges used different final positions. Update the story's flat-node geometry after dragging. | `src/orgchart/OrgChartCanvas.stories.tsx:322`; fixture alignment, not a production drag algorithm change. New capture pending. |
| AiQuotationDraftBoard — late finding | The UI appended a percent sign to the stored tax fraction: `0.07` appeared as 0.07%, although 700 tax on a 10,000 subtotal is 7%. Display fraction × 100 with at most two decimal places; preserve stored fraction and amounts. | `src/ai-quotation/AiQuotationDraftBoard.tsx:1123`; canonical `supabase/migrations/20270215_ai_quotation_draft.sql:62` stores a fraction and line 147 multiplies subtotal by it. Three rendering regressions (0.07 / 0.0725 / 0) cover 7% / 7.25% / 0% and unchanged monetary values. Two old snapshots remain withheld. |

<!-- adversary: Visual defects were compared with source fixtures and browser snapshots; spies were not assumed to mutate store data. AiCost geometry is the coordinator's observed local DOM result, not a hosted capture or a general responsive-layout certification. -->

Why the defects escaped earlier checks: AiCost unit assertions counted bar nodes without measuring their rendered height. The coordinator's new browser geometry evidence is recorded in parent-only `tmp/ai-cost-cua-geometry-20260912.json`. Legacy Culture tests/stories injected unused store selector methods, so the XAxis field drift was not exercised through the production selector; the new regression uses that selector and real Recharts axes. Fixture count/rate consistency and drag geometry now follow the production data contract instead of accepting a spy-only visual inconsistency.

The late quotation regression first produced 2 failures and 1 pass; after the display fix, 77 focused tests passed (3 new rendering cases plus 74 store cases). Incremental TypeScript build and diff check exited 0; scoped ESLint reported 0 errors and 3 existing warnings. Proof: `src/ai-quotation/__tests__/AiQuotationDraftBoard.test.tsx`; parent-only `tmp/quotation-tax-red.log`, `tmp/quotation-tax-green.log`, `tmp/quotation-tax-types.log`, and `tmp/quotation-tax-types-status.json`. This targeted delta follows the earlier 7,326-test aggregate; the full unit suite was not rerun at that local checkpoint. The subsequent 529930f hosted aggregate passed 361 files / 7,329 tests.

<!-- adversary: The implementing reviewer supplied the red 2-fail/1-pass then green 77-case logs, checked unchanged tax/subtotal/total and stored fraction, and recorded incremental TypeScript exit 0. Coordinator independently read that evidence; subsequent 529930f hosted CI is recorded above. -->

## 6. Build 93 acceptance checkpoint

[Build 93](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=93) belongs to `a99b474` and contains the earlier visual state. At approximately **03:43 UTC on 12 September 2026**, the coordinator verified the live overview: **211 changed snapshots, 170 Accepted and 41 Unreviewed/withheld**. Each accepted snapshot was viewed individually; defects were withheld for a fresh capture. This is the old-build review result, not acceptance of the repaired candidate.

| Reviewer scope | Checkpoint supplied | Authority |
|---|---|---|
| Coordinator scope | 87 reviewed: 66 accepted; 21 withheld. | Coordinator's completed assigned scope. |
| This reviewer: QC 14, SuperEmployee 10, courses 10, enrollment 8 | 42 inspected; 31 persisted Accepted and 11 QC snapshots left Unreviewed/withheld. | Parent-only exact-name/URL ledger: `tmp/chromatic-build93-reconciliation-review.json`; 42 unique URLs verified. |
| Other visual reviewer | 82 reviewed: 73 accepted; 9 withheld. | Completed 64-story scope plus 18 quotation stories; holds comprise Bottleneck SingleStage, OrgChart NodeDrag, five role-panel stories, and two tax-label stories. |

<!-- adversary: The 42-row scope was individually inspected after image completion; build-table acceptance was checked and the final admin-resolve story was directly revisited to confirm persistence. No batch acceptance of unseen snapshots was used. -->

Training enrollment's failure story intentionally displays “DB write failed — server error” and retains its employee tag for retry. Success clears the form; its spy does not populate a real timeline. Other action stories may retain fixture state when callbacks only record calls. Those expected states were preserved in the review.

## 6.1. Build 94 acceptance checkpoint

At **04:21 UTC on 12 September 2026**, the coordinator confirmed [Build 94](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=94): **28 Accepted / 5 Unreviewed / 8 Auto-ignored**. Accepted images comprise 13 coordinator cases (nine stable Culture stories and four AiCost stories), 11 QC cases and four other corrected cases. Five role-panel images were held for the select-color follow-up. Eight Culture images were **Auto-ignored by Chromatic and were UNACCEPTED at that checkpoint**: NonAdmin VIEWER, Multiple Periods, SAFETY filter, RESOLVED filter, PENDING filter, ACKNOWLEDGE, RESOLVE and DISMISS. Auto-ignore is not review approval. Coordinator evidence is parent-only `tmp/chromatic-build94-root-review.json`.

The earlier 2,000 ms Culture delay was scoped to story metadata. Recharts 2.15.4 uses JavaScript animation (Line 1,500 ms, Bar 400 ms); the [Chromatic animation guidance](https://www.chromatic.com/docs/animations/) explains that JavaScript animation is not automatically paused. This was a controlled hypothesis, not confirmed root cause at that checkpoint. A subsequently inspected NonAdmin trace showed bar lengths cycling over a 7.1-second sequence; whether those frames span capture attempts or remounts remains unresolved. That observation limits the explanation based only on the initial 1,500 ms animation. The subsequent Build 95 result below rejected the delay-only remedy.

The coordinator also measured the local AdminWithFeedback story through CUA in two separated samples: bar widths were identical at 775.212158 / 715.580444 / 691.727783 / 763.285828 px. That local render settled without an observed continuous loop. That observation supported trying the delay first; it did not establish the later hosted result.

## 6.2. Build 95: delay experiment insufficient

[Build 95](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=95) is associated with dfdb466: **233 tests, 13 changes; 7 Accepted and 6 Auto-ignored/held**. Five role-panel images were accepted after the select-color fix. SAFETY and ACKNOWLEDGE Culture stories became stable and were individually accepted. NonAdmin VIEWER, Multiple Periods, RESOLVED, PENDING, RESOLVE and DISMISS remain **UNACCEPTED**.

The fully loaded Multiple Periods image (2560 × 2862) stops the trend line between Q2 and Q3 and has no point markers, while the Q3 label and score 71 are present. Its trace contains 22 screenshot calls through 18.6 seconds. Thus the 2,000 ms delay did not meet the complete-capture requirement. The [official flake-filter documentation](https://www.chromatic.com/docs/flake-filter/) says auto-ignore status is reevaluated per build and does not persist; these six statuses cannot be dismissed as inherited flags.

Parent evidence: `tmp/chromatic-build95-culture-review.json`.

## 7. Replacement mechanism and verification

The replacement adds optional `animateCharts?: boolean` and passes it to the real Recharts Line and Bar. Omission leaves `undefined`, preserving the library's existing CSR/SSR defaults; only Culture story metadata sets `animateCharts: false`. The failed `chromatic.delay: 2000` is removed. Product motion, fixtures and interaction assertions are preserved.

The implementing reviewer reported a regression-first RED of **1 failed / 1 passed**, with four expected SVG bars absent. GREEN rendered complete bars and line markers immediately, after rerender and after a score-store update, without advancing timers. It uses real Recharts and the real selector with only a fixed viewport adapter: widths 109 / 218 / 327 / 436 px, then 327 / 109 / 436 / 218 px; line markers change from two to three. The real-chart file passed **2 tests**, and the focused Culture/PS selection passed **51 tests across 3 files**.

Full `tsc --noEmit -p tsconfig.json`, scoped lint and diff checks exited 0; lint retained three existing story warnings. Source and assertions were independently read for this handoff: `src/culture/CultureDashboard.tsx`, `src/culture/CultureDashboard.stories.tsx`, `src/culture/__tests__/CultureDashboard.chart.test.tsx`.

<!-- adversary: Implementer supplied complete RED/GREEN/focused/type/lint tool output, and this report's reviewer inspected the source/test diff. The test checks actual SVG widths and marker counts across store updates, not mock-prop equality. Local geometry proof does not establish new Chromatic stability; fresh capture and new-head CI remain pending. -->

The required database step and its always-run outcome report, artifact upload and cleanup passed at dfdb466. Five role-panel select captures were accepted in Build 95. These completed items remain separate from the new static-chart verification.

The final source revision, exact-head CI, new visual result and integration outcome will be recorded in [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106) and a parent final addendum. This document is the authoring checkpoint, not a claim that later checks already passed. Hosted Auth activation/login/refresh, multi-organization resolver reconciliation, production release, operational acceptance and SciSpace v2 canonical integration remain separate evidence gates.
