# SciSpace / MONOLITH — R0 quality repair and remaining work

12 September 2026 · EN · Reviewed repair candidate; integration and operational acceptance pending

## Result and evidence scope

This work completes a bounded local repair of the lint warning gate and the document claim gate. It does not complete MONOLITH delivery. The [existing roadmap](../roadmap/2026-09-11-monolith-delivery-roadmap.en.md) retains all eighteen SciSpace workstreams and phases R0–R5; the [intake review](2026-09-11-scispace-reconciliation-intake.en.md) retains all thirteen CON dispositions.

The parent governance repository was inspected at aa1b30e509ece9d8efad3d68e949860aa79bdecf and the separate nested product repository at 9c4bee6759f6d1919a320a2f56088ce683287f58. Both had pre-existing work. This repair uses a separate clean clone based on remote product commit [793305be](https://github.com/indetailsgroup-hue/monolith-workspace/commit/793305bedb9eb901d122ca681207acc985eefcdd), on branch codex/scispace-r0-quality-gates. CONTEXT and the 21 July repository-scope correction were read. The original checkouts were not edited.

Remote main continued advancing during this work. Comparison through [662c0f72](https://github.com/indetailsgroup-hue/monolith-workspace/commit/662c0f72c7b98b2a14e0181544c7d1d8ac8995c5) showed eight intervening commits with no overlap with the nine repair files. That upstream revision changed the warning ceiling to 2,280. This patch does not change the ceiling or lint rules; its local result also satisfies the earlier stricter 2,235 ceiling.

## Completed repair and validation

| Repair / check | Evidence |
|---|---|
| CultureDashboard test typing | Replaced 47 unnecessary any casts on existing OrgPlan string literals; all input values and assertions are retained |
| Full-tree ESLint, original ceiling 2,235 | Before: 2,277 warnings, zero errors, exit 1. After: 2,230 warnings, zero errors, exit 0; 2,145 files inspected |
| CultureDashboard suite | 47 of 47 tests passed before and after the edit |
| App TypeScript | Project typecheck with no output emission passed, exit 0 |
| Document claim gate | Eleven new findings resolved by source-scoped observations and explicit acceptance limits; existing allowlist unchanged |
| Certification gate | Passed within the existing allowlist; historical debt remains visible |
| TH/EN document companions | Both work-status and FieldFlow reports are aligned with their HTML companions |

Local test environment: Windows, Node 24.19.0, lockfile dependencies installed. The complete root test suite, database replay and live deployment were outside this bounded validation. GitHub checks on the proposed integration remain necessary. The older reports keep their original dated evidence; wording repair does not turn those snapshots into a current audit.

## Remaining work, ordered for delivery

Accountable roles below are proposed responsibilities, not appointments or signoffs.

| Priority / scope | Next action | Proposed accountable role | Completion evidence |
|---|---|---|---|
| R0 — integrate this repair | Review the Draft PR and evaluate its checks against current main | Engineering + QA | Same-revision lint, document gates and applicable tests succeed; integration recorded |
| R0 — database verification | Reconcile the current migration chain and latest failing suites; inspect EST policies that reference user_profiles against existing organization-membership helpers | Database/security + QA | Fresh database replay and meaningful same-org, cross-org, inactive-member and admin tests pass |
| R0 — billing workflow | Correct the invalid direct secrets reference in the notification step condition; retain conditional notification behavior | Platform/CI | Actions validation plus empty/configured-token fixtures pass; network is mocked during tests |
| R0 — status and handoffs | Refresh each status against its exact commit/run; reconcile Round 23/24 notes before adopting proposed fixes | Engineering + programme owner | Each closure has scope, revision, environment and result; historical expectations stay labelled |
| R0/R1 — SciSpace reconciliation | Finish AIE/GAP semantic crosswalk, source-qualified namespaces, VS-01 title maintenance and PFMEA consumer trace | Product/architecture + QA | Distinct requirements preserved; domain-specific actions and authorized decisions recorded |
| R1/R2 — one shadow pilot | Select project, users and integrations; verify access and the design-to-field/finance journey | Product + platform/field/finance | End-to-end evidence, denial/retry/revision paths and named-user acceptance |
| R3/R4 — factory and operations | Complete existing manufacturing, recovery and field acceptance gates | Factory + security/release owners | Required machine, signoff, operational and reconciliation evidence |
| R5 / business lanes | Keep remaining AI, marketplace, BOI and supplier-knowledge work in the existing eighteen-row roadmap | Product and relevant domain owners | Scoped requirement, owner and acceptance before delivery or external use |

The [EST migration failure](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34660023279) was observed at 779bba2e. The [billing startup failure](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34660379760) was observed at 578111bd. These are dated findings requiring revalidation on the next candidate. GitHub documents that secrets cannot be referenced directly in an if condition. [Workflow guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#using-secrets-in-a-workflow).

The open-issue and PR inventory was empty at the initial remote snapshot; that did not mean the backlog was empty. New PRs and concurrent main changes must be considered when starting the next task.

## Collaboration boundary

The published SciSpace roadmap and intake are available through GitHub. The inspected SciSpace browser session showed Login; private SciSpace conversations were not accessed. This work sent no SciSpace messages and changed no canonical AIE/GAP definitions, safety thresholds, manufacturing authorization, production database or deployment.

