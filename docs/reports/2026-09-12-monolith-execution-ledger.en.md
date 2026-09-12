# MONOLITH — approved work execution ledger

12 September 2026 · EN · Candidate publication record

The owner approved the SciSpace/Codex allocation and authorized execution. Codex has implemented the engineering packages below in an isolated checkout. SciSpace dispatch and credential revocation remain pending the two specific responses described below. This record does not declare the whole programme complete.

## Current work

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

## Pending external actions

Automatic approval review rejected submitting the SciSpace draft because it contains detailed internal project status for an external destination, and broad approval was not considered payload-specific. The exact assignment remains unsent. The pending question identifies S-01–05, Roadmap/Intake links, work IDs, status corrections and source revision, with no password or token values.

A separate pending question identifies five token entries proposed for revocation. Their connections will stop until securely reconfigured. No exposed credential value was reused, copied to a report, or tested. No new credential was created.

The temporary PostgreSQL and Storybook services were stopped after tests. No production deployment or domain-owner acceptance is claimed.

[Approved allocation](2026-09-12-monolith-work-allocation.en.md) · [TPC interface record](2026-09-12-team-pulse-interface.en.md) · [Thai edition](2026-09-12-monolith-execution-ledger.th.md)
