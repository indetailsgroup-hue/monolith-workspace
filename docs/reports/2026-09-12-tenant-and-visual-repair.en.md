# Tenant and visual repair — technical handoff

**Edition:** English

**Date:** 12 September 2026

**Status:** Published 529930f checkpoint verified; the next three-file source batch and remaining visual acceptance are pending

**Source baseline:** product commit `a99b474b790d1b94932302ed818834272f16e529`

**Published repair source commit:** `3da55463ccb1bacb179068084218afae9c78a6c4` (included in published 529930f; verified checkpoint below)

**Companion:** [Thai edition](2026-09-12-tenant-and-visual-repair.th.md)

This patch addresses a jobs INSERT policy bypass, the organization claim required by existing RPCs, an incorrect repeated-invoice-approval assertion, and specific visual defects found during Build 93 review. Evidence is scoped to source review, the recorded tests, and the named browser checks. This record grants neither production deployment nor operational acceptance, and it does not integrate the SciSpace v2 package.

## Published verification checkpoint

Published checkpoint [529930fde04c8a049dec6df0c069227cae0b841b](https://github.com/indetailsgroup-hue/monolith-workspace/commit/529930fde04c8a049dec6df0c069227cae0b841b) contains source `3da5546` and its technical report. At 04:16 UTC on 12 September 2026, all **19 PR workflows succeeded**. This result applies to that published revision, not the next source changes.

| Hosted check at 529930f | Observed result | Scope |
|---|---|---|
| Root unit suite / build / typecheck | **361 files / 7,329 tests passed**; build and TypeScript check succeeded | Includes the late quotation regression. [Full Verify run](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34671757990/job/103494307311) |
| SQL pgTAP | **37 files / 695 assertions passed** | Fresh local Supabase stack on the CI runner; complete prepared migration chain |
| Repaired 0173 SDK suite | **55 cases passed** | Strict setup and authorization assertions include Auth-issued login/refresh, allowed FINANCE, denied VIEWER/cross-tenant access, and repeat-approval rejection |
| Configured TypeScript database selection | **31 files / 1,407 reported passed; zero reported skipped** | Some other legacy cases still return early conditionally (for example, unavailable `0205` SQL helper paths). This total does not establish that every case exercised its database assertions |

Database proof: [run 34671758042, job 103494306989](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34671758042/job/103494306989). The coordinator's machine-readable record is parent-only `tmp/ci-529930f-evidence.json`.

<!-- adversary: Read the exact-head coordinator record: 19 successful workflows, SQL 37/695, strict 0173 55 PASS and configured 31/1407. Retain the conditional-early-return limitation; a reported zero-skipped total is not non-vacuous coverage proof. The next workflow, role-select and Culture capture changes require their own CI/capture result. -->

The three source follow-ups are committed locally at **187c6302af03a7dae4d51467050269b18584401b** and await publication at this handoff: make the TypeScript database step required, correct the role-panel native select colors, and add a Culture-only 2,000 ms capture delay. Their new CI and corrected visual captures are **PENDING**. The delay tests a likely Recharts JavaScript-animation cause; it is not yet a confirmed stability fix. Product animation, fixtures and interaction assertions remain unchanged.

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

This table preserves the defect findings and verification available during the earlier Build 93 review. The Build 94 checkpoint below supersedes its pending-capture entries.

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

At **04:21 UTC on 12 September 2026**, the coordinator confirmed [Build 94](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=94): **28 Accepted / 5 Unreviewed / 8 Auto-ignored**. Accepted images comprise 13 coordinator cases (nine stable Culture stories and four AiCost stories), 11 QC cases and four other corrected cases. Five role-panel images remain held for the select-color follow-up. Eight Culture images were **Auto-ignored by Chromatic and remain UNACCEPTED**: NonAdmin VIEWER, Multiple Periods, SAFETY filter, RESOLVED filter, PENDING filter, ACKNOWLEDGE, RESOLVE and DISMISS. Auto-ignore is not review approval. Coordinator evidence is parent-only `tmp/chromatic-build94-root-review.json`.

The 2,000 ms Culture delay is scoped to story metadata. Recharts 2.15.4 uses JavaScript animation (Line 1,500 ms, Bar 400 ms); the [Chromatic animation guidance](https://www.chromatic.com/docs/animations/) explains that JavaScript animation is not automatically paused. This is a controlled hypothesis, not confirmed root cause. A subsequently inspected NonAdmin trace showed bar lengths cycling over a 7.1-second sequence; whether those frames span capture attempts or remounts remains unresolved. That observation limits the explanation based only on the initial 1,500 ms animation. The next build must show stable, correct captures before acceptance.

The coordinator also measured the local AdminWithFeedback story through CUA in two separated samples: bar widths were identical at 775.212158 / 715.580444 / 691.727783 / 763.285828 px. That local render settled without an observed continuous loop. It supports testing the scoped delay first, while leaving the hosted instability explanation and final acceptance unresolved.

## 7. Next source batch and handoff gates

- **Required database step:** remove its `continue-on-error`, report success/failure/skipped/cancelled explicitly, and reject unknown outcomes. Keep JSON upload and cleanup under `always()`. Actual Bash report/exit checks went from four failures to nine passing checks; actionlint and YAML parsing passed. Parent evidence: `tmp/pgtap-required-status-red.json` and `tmp/pgtap-required-status-green.json`. This does not change branch protection or remove conditional guards in other suites.
- **Role select colors:** the native relationship-type select needs explicit light background, dark foreground and light control scheme. The five affected role snapshots remain held until the corrected capture.
- **Culture capture:** story-only `chromatic.delay: 2000` retains product animation, fixtures and assertions. Scoped lint had zero errors and three existing warnings; TypeScript and diff checks exited 0. Stability remains pending new capture.

Publish this batch with the reports once. Its exact-head CI and final snapshot result must be recorded in the PR and a final parent addendum; the verified 529930f result does not certify those later source changes. Hosted Auth activation/login/refresh, multi-organization resolver reconciliation, production release, operational acceptance and SciSpace v2 canonical integration remain separate evidence gates.
