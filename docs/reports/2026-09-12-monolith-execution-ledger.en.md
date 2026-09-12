# MONOLITH — approved work execution ledger

12 September 2026 · EN · Verified published checkpoint and static-capture follow-up

The original SciSpace assignment was sent and acknowledged. Its v2 package is received and inspected, with integration **HOLD**. The separate eight-point v3 draft remains **UNSENT**, pending exact-payload approval. Published dfdb466 passed CI; six Culture images still require fresh acceptance after the new static-chart change. The whole programme remains open.

## Latest recorded checkpoint — 12 September 2026

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

### Build 95 visual acceptance

[Build 95](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=95) is associated with dfdb466: **233 tests, 13 changes; 7 Accepted and 6 Auto-ignored/held**. Five role-panel images were accepted after the select-color fix. SAFETY and ACKNOWLEDGE Culture stories became stable and were individually accepted. NonAdmin VIEWER, Multiple Periods, RESOLVED, PENDING, RESOLVE and DISMISS remain **UNACCEPTED**.

The fully loaded Multiple Periods image (2560 × 2862) stops the trend line between Q2 and Q3 and has no point markers, while the Q3 label and score 71 are present. Its trace contains 22 screenshot calls through 18.6 seconds. Thus the 2,000 ms delay did not meet the complete-capture requirement. The [official flake-filter documentation](https://www.chromatic.com/docs/flake-filter/) says auto-ignore status is reevaluated per build and does not persist; these six statuses cannot be dismissed as inherited flags.

Parent evidence: `tmp/chromatic-build95-culture-review.json`.

### Static-chart follow-up

The replacement adds optional `animateCharts?: boolean` and passes it to the real Recharts Line and Bar. Omission leaves `undefined`, preserving the library's existing CSR/SSR defaults; only Culture story metadata sets `animateCharts: false`. The failed `chromatic.delay: 2000` is removed. Product motion, fixtures and interaction assertions are preserved.

The implementing reviewer reported a regression-first RED of **1 failed / 1 passed**, with four expected SVG bars absent. GREEN rendered complete bars and line markers immediately, after rerender and after a score-store update, without advancing timers. It uses real Recharts and the real selector with only a fixed viewport adapter: widths 109 / 218 / 327 / 436 px, then 327 / 109 / 436 / 218 px; line markers change from two to three. The real-chart file passed **2 tests**, and the focused Culture/PS selection passed **51 tests across 3 files**.

Full `tsc --noEmit -p tsconfig.json`, scoped lint and diff checks exited 0; lint retained three existing story warnings. Source and assertions were independently read for this handoff: `src/culture/CultureDashboard.tsx`, `src/culture/CultureDashboard.stories.tsx`, `src/culture/__tests__/CultureDashboard.chart.test.tsx`.

<!-- adversary: Implementer supplied complete RED/GREEN/focused/type/lint tool output, and this report's reviewer inspected the source/test diff. The test checks actual SVG widths and marker counts across store updates, not mock-prop equality. Local geometry proof does not establish new Chromatic stability; fresh capture and new-head CI remain pending. -->

### Work allocation

| Work | Current state | Evidence / remaining action |
|---|---|---|
| O-01 credentials | Five-token revocation selection still pending | The existing exact-selection question remains open; no revocation is recorded. SciSpace assignment approval does not settle this separate action |
| C-01 transport | Earlier repair implemented and hosted-verified | Retain the dated b89727f2 evidence below; candidate checks remain revision-specific |
| C-02 integration / legacy DB | Required step verified at published dfdb466 | Strict 55 cases passed; preserve the configured 1407-total early-return qualification |
| C-03 billing | Engineering repair and offline checks verified | Live monthly collection and operational acceptance remain open |
| C-04 components / visual review | Build 95: seven accepted; six Culture cases held | Delay experiment insufficient; static story charts locally verified, new CI/capture pending at authoring |
| C-05 Team Pulse | Implemented with dated evidence below | Preserve gates, tenant/identity boundaries and separate operational acceptance |
| S-01 / S-02 | v2 delivered for review; integration HOLD | 45 ZIP files; all 44 manifest hash/size entries matched. Integrity does not settle source/decision reconciliation or acceptance |
| S-03 pilot SOP/API/field requirements | Assigned; delivered preparation incomplete | Complete roles, inputs/outputs, failure handling and acceptance contracts against actual pilot decisions |
| S-04 supplier knowledge/BOM | Assigned; source and scope corrections remain | Preserve supplier-native Barausse/Blum evidence, BOM and installation scope according to the chosen pilot |
| S-05 business/research/training | Assigned; source and scope corrections remain | Retain its approved scope; no budget, procurement or programme closure is inferred |
| SciSpace v3 correction follow-up | UNSENT; exact-payload approval pending | Eight-point, 3,333-character draft. Automatic approval review blocked submission; this is separate from the original assignment already sent |

### Retained scope and external actions

The a99b474 baseline remains recorded below: 47 passed / 4 failed of 51, followed by the native 7 + 15 checks, local aggregate 360/7326 and late quotation 77-case delta. The later 529930f and dfdb466 hosted checkpoints supersede their pending-CI status without rewriting that history. Five-token revocation selection is still pending; original SciSpace assignment approval does not settle it. Hosted Auth activation, the existing multi-organization resolver limitation, operational acceptance and live monthly billing verification remain separate.

SciSpace v2 contains 45 files; all 44 manifest hash/size entries matched. Integrity is separate from content acceptance; see the parent-only docs/reports/2026-09-12-scispace-v2-acceptance-review.en.md and companion editions. The 3,333-character v3 follow-up was blocked by automatic approval review and awaits approval of the exact payload.

[Technical repair report](2026-09-12-tenant-and-visual-repair.en.md).

## Retained historical publication evidence

The following sections preserve earlier publication-state wording and dated evidence, including the parent-only 1ed4c3f5 and 02:21 UTC dispatch addenda where present. References to an unsent original assignment, an uninspected ZIP, older visual counts, service shutdowns or pending checks describe those earlier snapshots. The latest handoff above governs current status.

## Historical work table — candidate publication snapshot

| Work | Lead | State at publication | Evidence / remaining action |
|---|---|---|---|
| O-01 exposed credentials | Codex with account owner | Exact revocation selection pending | GitHub browser sign-in is available and both token inventories were inspected. Values in history cannot be mapped certainly to names in settings. A specific question proposes five related tokens; none has been revoked or tested |
| C-01 transport coverage | Codex | Implemented and hosted repair verified | Four Node projects execute 28 files / 202 tests; six guard regressions prevent empty or partly skipped coverage. Workflow, Edge and entitlement lanes passed at repair commit b89727f2 |
| C-02 integration | Codex | Code committed; final candidate CI pending | Main 1c554a3c merged without conflicts. Repair commit b89727f2 is published; interface/type correction commit 97822d0 follows. Final checks and publication are tracked in PR #106 |
| C-03 billing reports | Codex | Implemented; offline hosted checks passed | Supported job API, explicit sampled gross estimates, partial-data failure, CSV/log/job summary. Live monthly collection remains unverified |
| C-04 component failure | Codex | Repaired and hosted verified | OrgHealthScoreBoard save interaction passed local regression and hosted Chromatic at b89727f2 |
| C-05 Team Pulse Check | Codex; SciSpace requirements | Interface implemented and locally verified | Admin/member interface, lifecycle, response form, identity resets, store and database boundaries tested. Hosted checks for the new interface and operational acceptance remain separate |
| S-01 source/status register | SciSpace; Codex verifies | Specific dispatch approval pending | Draft prepared in Elastic Monolith Review, including existing Roadmap/Intake sources. Automatic approval review blocked submission |
| S-02 semantic reconciliation | SciSpace | Same dispatch pending | Preserve AIE/GAP capabilities and namespace distinctions; actual recorded decisions govern |
| S-03 pilot SOP/API/field requirements | SciSpace | Same dispatch pending | Specify roles, inputs, outputs, failure handling and acceptance; pilot decisions remain inputs |
| S-04 supplier knowledge/BOM | SciSpace | Same dispatch pending; pilot-dependent | Preserve Barausse/Blum work and source provenance; validate units, quantities and publication |
| S-05 business/research/training | SciSpace | Same dispatch pending; business-dependent | Evidence preparation is authorized; no budget, procurement, eligibility or programme closure is inferred |

## Repository and revision boundary

The parent governance root is C:/Users/thai3/determined-williams (2), HEAD aa1b30e509ece9d8efad3d68e949860aa79bdecf. The separate nested product root determined-williams/ is at 9c4bee6759f6d1919a320a2f56088ce683287f58. Separate status checks recorded 11 tracked changes / 599 untracked entries in the parent, including this ledger, and 22 / 61 in the nested root. These counts use default grouped untracked directories. Existing source changes are preserved; later report additions may increase the parent's untracked count.

CONTEXT.md and the 21 July scope correction were read. The correction is a parent-only source at docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md; it is not copied into the product repository.

Implementation uses C:/Users/thai3/.codex/worktrees/monolith-scispace-r0-20260912 on codex/scispace-r0-quality-gates. The source baseline is main 1c554a3cdf33c43ae4971ce1b984d39572f5d47a, merged as ba3fde65. Reviewed repairs are [b89727f2](https://github.com/indetailsgroup-hue/monolith-workspace/commit/b89727f26328e1bc32bfef0ff33254785151b620); interface and matcher corrections are 97822d0d6138fd219a4da98e14d0d4003043683f. Running SciSpace work was not interrupted.

## What changed and how it was verified

- **Transport:** Broad exclusions caused all four selected suites to find no tests. A separate Node configuration now covers workflow + LINE OA commerce (15 files / 67 tests), Edge (12 / 117), and entitlement (1 / 18). The result guard requires every inventoried file to contain only passing assertions. Migration changes now trigger Edge tests that read factory SQL contracts.
- **Billing:** Replaced invalid secret conditions and retired timing/LINE Notify paths. The report samples up to ten completed runs per workflow by creation window, including available retries outside that window. It labels gross standard-runner assumptions, not an invoice or monthly spend. API failure and unknown runners produce incomplete data and a failing result, with retained evidence. Four Node tests and 13 Python tests passed, including cross-month retries. A replay of one real GitHub API response also priced its supported runners; this was not a live monthly report.
- **Component:** Storybook restored mocks to implementations that returned undefined. Async original implementations now preserve the Promise contract. The affected 31-test suite, five local browser interactions, and hosted Chromatic passed.
- **TPC store/database:** Store actions return confirmed success, reject mismatched contexts and ignore obsolete completions. Same-user/session write ordering cannot roll a confirmed CLOSED state back locally. A composite foreign key binds responses to the session's organization; insert policy requires an active session in that organization; the summary view applies caller RLS. The original view reproduced a member-results leak, while the repair passed 18 real PostgreSQL assertions on both repaired and fresh scoped fixtures. Hosted PostgreSQL 15 and 18 also passed. The fixture models minimal organization/auth prerequisites, not the complete Supabase migration chain.
- **TPC interface:** Administrators create, activate and close sessions and view summaries; members answer active sessions. The existing PROFESSIONAL/ENTERPRISE module gate remains. User/role/organization/plan changes remount and clear cached data before display. Failed writes retain form values. The 137 focused tests comprise 24 board cases, one portable story interaction, 48 dashboard tests and 64 store tests. Six synthetic Storybook scenarios were inspected. Dark-host contrast was corrected and visually rechecked. Responses contain no stored user ID, but membership is required; free text may identify people and one-response-per-person is not guaranteed.
- **People typings:** Hosted TypeScript found 41 missing DOM matcher declarations. The exact command reproduced the failure and passed after adding Vitest-specific matcher types. Assertions and exclusions are unchanged; configuration changes now trigger the affected workflow.

The root suite passed 7,324/7,324 tests across 359 files after initial UI integration, with no skipped/failed tests. One additional user-only identity regression and the subsequent visual styling adjustment passed the final 137-test focused suite. Full project typechecking and application build passed; build emitted large-chunk warnings. ESLint reported zero errors and 2,216 warnings within the unchanged 2,280 budget. Actionlint 1.7.12 passed all six affected workflows.

At b89727f2, 17 workflows succeeded and Dependabot Auto-Merge was skipped. People & Culture CI failed only at its matcher typecheck, corrected in the subsequent candidate. Verified runs include [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220209), [FPR](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220196), [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220166), [DB Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220133), [Entitlement](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220159), [Edge](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220097), [TPC role isolation](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220240), [Billing offline checks](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220132) and [Chromatic](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220181). These dated repair results do not substitute for final-candidate checks. Consult [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106) for its current revision and checks.

## Historical external-action status

Automatic approval review rejected submitting the SciSpace draft because it contains detailed internal project status for an external destination, and broad approval was not considered payload-specific. The exact assignment remains unsent. The pending question identifies S-01–05, Roadmap/Intake links, work IDs, status corrections and source revision, with no password or token values.

A separate pending question identifies five token entries proposed for revocation. Their connections will stop until securely reconfigured. No exposed credential value was reused, copied to a report, or tested. No new credential was created.

The temporary PostgreSQL and Storybook services were stopped after tests. No production deployment or domain-owner acceptance is claimed.

[Approved allocation](2026-09-12-monolith-work-allocation.en.md) · [TPC interface record](2026-09-12-team-pulse-interface.en.md) · [Thai edition](2026-09-12-monolith-execution-ledger.th.md)
