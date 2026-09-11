# MONOLITH — Work status as of 10 September 2026

Publication note: This is a dated evidence snapshot, not a new runtime or CI audit. Local artifact references are not included in this publication. SC-01–SC-18 are roadmap workstream IDs, distinct from Steering Committee resolutions.


## Verdict

Substantial product implementation exists, and [v17.5.2 was published on 7 September](https://github.com/indetailsgroup-hue/monolith-workspace/releases/tag/v17.5.2). However, **current main does not pass the complete CI gate, and Designer packets remain prohibited for real cutting**. Remaining work includes quality gates, integrations, unfinished feature portions and production/factory evidence.

No overall completion percentage is defensible: checklists mix parent/child tasks, several are stale, and there is no recently ratified scope denominator. Source presence, main integration, release, deployment and operational acceptance are distinct states.

## Scope and revisions

- Review date: 2026-09-10, Asia/Bangkok.
- GitHub main pinned to [52e0eeb12527d4bb3866ee726b4f30d4d74dca57](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/package.json); version 17.5.2. Non-truncated recursive tree: 4,137 blob files and 322 SQL migration source files, not a count of canonical production-applied migrations.
- Parent governance root: [local governance workspace], branch guardrails/claim-linters, HEAD aa1b30e509ece9d8efad3d68e949860aa79bdecf; before report creation: 11 modified / 574 untracked status entries.
- Nested product root: determined-williams/, branch fix/dxf-truth-chain, HEAD 9c4bee6759f6d1919a320a2f56088ce683287f58 (11 August); 10 modified / 12 deleted / 61 untracked entries; local package remains 2.1.0.
- CONTEXT.md and the 21 July repository-scope correction were read. Parent apps/packages do not establish runtime absence.
- This is a workstream review and inventory of all 13 discovered task files, not a line-by-line security audit or UAT of every requirement. Tests on the old local snapshot were not presented as current-main results.
- Separate local branches/worktrees were not exhaustively ancestry-compared with remote main; they are not automatically classified as merged or deployed.

## Priority findings

1. **B1 — Main quality gate is red (VERIFIED FACT):** 2,237 lint warnings exceed the 2,235 ceiling; zero errors. Full Verify stops at lint, skipping the root suite in that job. Separate TypeScript/build lanes succeeded. Reduce warnings and complete required jobs before the next release.
2. **B0 if packets are used for real cutting — NO_CUT remains (VERIFIED FACT):** [src/core/config/shadowMode.ts](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) is true; [docs/governance/adr-064-signoff-checklist.th.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/governance/adr-064-signoff-checklist.th.md) retains placeholder hashes and four PENDING signatures. Software publication does not authorize manufacturing.
3. **B1 — Org Health contains simulated data (VERIFIED FACT):** SQL fixes PERFORMANCE at 75.0 with placeholder_v18.5 provenance. Do not represent it as a measured performance outcome.
4. **B1 — Status records drift (CONTRADICTED):** progress still calls published v17.5.2 a release candidate. Field Purchase, Curved and Accounting source has advanced beyond checkboxes. The 6–7 September “all gates passed” record is not today's main status.
5. **B2 — Billing report failure (VERIFIED FACT / cause UNKNOWN):** the failed run returns no jobs. Workflow validation/check annotations need investigation; no cause is inferred.

## Workstream matrix

“Implemented” means the cited source/wiring exists; it does not certify every feature against production acceptance. Missing integration conclusions are UNKNOWN or INFERENCE within the stated inspection scope.

| Workstream | Status | Evidence and remaining work |
|---|---|---|
| Designer / Cabinet / 3D | Implemented | Parametric cabinet, panels, materials and 3D tools; factory qualification remains separate. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/App.tsx) |
| Connector / Drawer / Hinge | Implemented | Drawer calculators, drill maps, HingeCatalog and UI exist; the old blanket pending claim conflicts with source. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/manufacturing/drawer/generateDrawerPanels.ts) |
| Curved panels / Kerf / DXF | Implemented portions with new regression coverage | Curve, kerf and mating-slot code plus Stage 11–12 smoke assertions exist; 2/33 checked boxes is stale, not 6% delivery. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/manufacturing/curve/kerfPatternGenerator.ts) |
| CNC / Factory Packet / Verifier | Implemented; real cutting blocked | S17-4 generator CI succeeded, but shadowMode=true and ADR-064 signatures remain PENDING. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) |
| Workflow / Approvals / Copilot | Implemented; checklist closed | 137 checked / 0 unchecked is a document state, not certification of every production flow. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-workflow-copilot/tasks.md) |
| LINE OA Commerce | Implemented; checklist closed | 81 checked / 0 unchecked with RPCs, Edge Functions and tests; no live LINE transaction executed in this review. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/line-oa-commerce/tasks.md) |
| Capture / OCR / MCP | Partial; integration needs verification | Core and Edge Functions exist; PDPA, on-prem and external service coverage still needs live evidence reconciliation. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/capture-spine/tasks.md) |
| Installation / Field PWA | Implemented with CI evidence | Field App build/test and pages workflow succeeded; 37 unchecked items need reconciliation against later delivery and field evidence. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/packages/field-app/package.json) |
| Field Purchase | Implemented; old checklist contradicted | Receiving, payment, budget and notification migrations and Edge Function exist; September report records deployment despite 0/16 checklist. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/functions/field-purchase-line/index.ts) |
| Accounting / Ledger / WHT / eTax | Substantial implementation; full ERP unverified | Ledger, multibook, tax, /accounting, /etax and E2E files exist; bank API, OCR, PDM and full live accounting flow are not freshly established. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-accounting/tasks.md) |
| Tenancy / Roles / Plan / Billing | Implemented; whole-system coverage unproven | Eleven business routes use active tenant/member/role/plan boundaries; every mutation quota and commercial pricing need further proof. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/businessModuleRegistry.ts) |
| People / Culture foundation | Implemented with release record | PeopleDirectory, skills/state, survey/feedback store and UI/tests exist; not every roadmap feature is established. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/culture/cultureStore.ts) |
| Process Templates / Bottleneck | Implemented with release record | Store, template list, heatmap, tests/stories and published v17.0.0 exist. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/jobs/processTemplateStore.ts) |
| Training / Super Employee | Implemented | Store/UI/tests/stories and routes exist; older roadmap plan tiers differ from runtime. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/training/trainingStore.ts) |
| AI Cost Estimation | Cost tracking implemented | Usage, cost, ROI, budget and dashboard exist; this does not establish autonomous construction estimating. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-cost/aiCostEstimationStore.ts) |
| AI Production Scheduler | Workflow present; AI engine unverified | Store manages machines, runs, items, constraints and approval; no model invocation found in the inspected store. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-scheduler/aiSchedulerStore.ts) |
| Culture Metrics / eNPS | Implemented; forward version track | Dashboard/store/tests/stories and route exist; v17.5.3+ are forward version records, not separately verified releases. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/culture-metrics/cultureMetricsStore.ts) |
| OrgChart / Role Network | Implemented and routed | Canvas/store/schema/tests exist; v18.x remains a forward track in progress records. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/BusinessModuleRoutes.tsx) |
| QC Anomaly Detection | Implemented and routed | Thresholds, measurements, SQL detection, UI/tests exist; calibration against live factory data is unverified. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/migrations/20270210_qc_anomaly_detection.sql) |
| AI Quotation Draft | Workflow present; AI generation unverified | Draft, line item, submit, approve and reject flow exists; inspected store uses DB CRUD without model invocation. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-quotation/aiQuotationDraftStore.ts) |
| Leadership Actions | Implemented and routed | Board/store/tests/stories and OWNER/ADMIN route boundary exist. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/leadership-actions/LeadershipActionBoard.tsx) |
| Org Health Score | Incomplete | UI/store/SQL exist, but PERFORMANCE=75.0 is a placeholder; no route found in inspected canonical registry/index. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/migrations/20270227_org_health_score.sql) |
| Digital Shadow / HOMAG | Implemented with CI evidence | Build/unit/integration lane succeeded with Redis and local OPC UA simulator; not machine commissioning. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/packages/digital-shadow-service/package.json) |
| Daph Second Brain | Checklist closed | Active checklist 61/0; archived 0/16 is not fresh backlog; local exports have pending changes. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/daph-obsidian-second-brain/tasks.md) |
| Design Hub / Marketplace / UGC | Planned; implementation not established | Checklist 0/56 and tree discovery found design/requirements/tasks; not a proof of absence under every possible symbol. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/design-hub-platform-phase2/tasks.md) |
| Capacity AI / Benchmarks / Team Builder / SOP AI | Planned; implementation evidence not found | Listed in 2S2P1C roadmap; no dedicated module/migration identified in this inventory. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md) |
| SpatialLM / Change Readiness / AI Comfort / Labels | Completion not established | Roadmap/pending entries exist without verified production callers; spatialHash is not SpatialLM. [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md) |

## CI at the examined revision

| Workflow / job | GitHub conclusion |
|---|---|
| [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518) | failure: root lint; root typecheck/test/build skipped; dependent E2E jobs skipped |
| [Lint](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559) | warning budget failure; ESLint errors job and app/server TypeScript job success |
| [Standalone E2E Smoke](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950557) | success |
| [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950490) | success |
| [npm audit](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950487) | success |
| [billing-report.yml](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459949364) | failure; no jobs returned; cause UNKNOWN |
| Full Verify: factory server, field app, digital shadow, tools, S17-4, LineOS, node controls, manifests, strict bypass scan, hermetic build, dependency audit | success at examined SHA |


These are freshly retrieved GitHub Actions conclusions for the same SHA, not locally rerun tests or reused September 6–7 test counts. Standalone smoke success and dependent smoke skipped in Full Verify can coexist because they are different workflows.

## Incomplete work versus unverified completion

- **Confirmed outstanding:** lint budget, complete Full Verify, billing-report failure, PERFORMANCE placeholder, Org Health routing/acceptance, status-ledger reconciliation.
- **Workflow exists; integration unverified:** AI scheduler model execution, AI quotation generation, external bank/OCR/PDM, end-to-end accounting, production quota coverage and live tenant-boundary acceptance.
- **Roadmap / implementation not identified in inventory:** Design Hub Phase 2, marketplace/UGC/learning/payment scope, Capacity Planning AI, Industry Benchmarks, Cross-functional Team Builder and SOP AI Assistant.
- **UNKNOWN:** complete dogfood house-chain acceptance, physical machine calibration/bench evidence, current key/signoff ceremony and field acceptance. The [dogfood record](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/evidence/dogfood/house-01/started.json) establishes STARTED on 18 July and realCutAllowed=false only; house-01 tree contains started.json/sha256, not a completion record.
- Change Readiness, AI Adoption Comfort, SpatialLM and labels require specific caller and acceptance evidence; similarly named modules are insufficient.

## Open PRs and issues

GitHub search returned five open PRs, all dependency upgrades, and zero open results for is:issue. An empty issue list is not an empty backlog.

- [#72: chore(deps)(deps-dev): bump @vitest/ui from 3.2.7 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/72)
- [#71: chore(deps)(deps-dev): bump vitest from 2.1.9 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/71)
- [#69: chore(deps)(deps-dev): bump @vitest/coverage-v8 from 2.1.9 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/69)
- [#64: chore(deps/server)(deps): bump ioredis from 5.11.1 to 6.0.0 in /server](https://github.com/indetailsgroup-hue/monolith-workspace/pull/64)
- [#63: chore(deps/server)(deps): bump pdfkit from 0.17.2 to 0.20.2 in /server](https://github.com/indetailsgroup-hue/monolith-workspace/pull/63)

## Local work requiring reconciliation

The parent has modified tenancy/protected-delivery plans and document-renderer work. The nested repository has pending order-adapter.ts and orderNormalization.property.test.ts changes, generated dist changes and Daph exports. These cannot automatically be counted as shipped.

Separate ProjectContext, protected-delivery, LINE trust, repair, Section 16 and Section 4 worktrees/branches exist. The parent ProjectContext preflight targets codex/repair-operations-phase-a-adr and records DEPLOYED_LINEAGE_UNESTABLISHED. Lane closure cannot close main without revision/source comparison.

## Appendix — checklist inventory

| Checklist | Checked | Unchecked |
|---|---:|---:|
| [.kiro/specs/capture-spine/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/capture-spine/tasks.md) | 30 | 6 |
| [.kiro/specs/curved-panel-system/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/curved-panel-system/tasks.md) | 2 | 31 |
| [.kiro/specs/daph-obsidian-second-brain/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/daph-obsidian-second-brain/tasks.md) | 61 | 0 |
| [.kiro/specs/design-hub-platform-phase2/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/design-hub-platform-phase2/tasks.md) | 0 | 56 |
| [.kiro/specs/entitlement-tier/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/entitlement-tier/tasks.md) | 8 | 11 |
| [.kiro/specs/field-purchase/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/field-purchase/tasks.md) | 0 | 16 |
| [.kiro/specs/installation-pm/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/installation-pm/tasks.md) | 112 | 37 |
| [.kiro/specs/line-oa-commerce/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/line-oa-commerce/tasks.md) | 81 | 0 |
| [.kiro/specs/monolith-accounting/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-accounting/tasks.md) | 32 | 49 |
| [.kiro/specs/monolith-mcp-layer/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-mcp-layer/tasks.md) | 43 | 6 |
| [.kiro/specs/monolith-workflow-copilot/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-workflow-copilot/tasks.md) | 137 | 0 |
| [.kiro/specs/_archived/obsidian-second-brain/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/_archived/obsidian-second-brain/tasks.md) | 0 | 16 |
| [specs/main/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/specs/main/tasks.md) | 0 | 0 |

Counts include parent and child checkbox lines, not unique deliverables, and must not become progress percentages. Archived Second Brain is superseded by the active checklist. specs/main/tasks.md uses a different format; 0/0 does not mean no work. Every checkbox line is retained in the evidence JSON (local evidence snapshot; not published).

## Proposed sequence and acceptance (PROPOSAL)

| Priority | Proposed owner | Work | Acceptance |
|---|---|---|---|
| 1 | Engineering / QA | Repair lint/billing workflow; rerun main | At most 2,235 warnings; all required Full Verify lanes execute and succeed |
| 2 | Product / Tech Lead | Reconcile status ledger | Every requirement maps to commit, route, test/run and release/deployment status; explicitly supersede stale claims |
| 3 | Data / Product | Org Health and AI integrations | Real PERFORMANCE data or unavailable state; routing/permissions/tests; AI invocation and acceptance |
| 4 | Platform / Finance / Field | Live tenant/accounting/LINE validation | Cross-tenant rejection, complete transaction/rollback evidence and signed field acceptance |
| 5 | PO / TL / Security / Factory | Real-cut authorization gates | Exact-byte signatures, completed dogfood, calibrated profile/bench evidence and approval before NFP changes |
| 6 | Product | Rebaseline remaining roadmap | Explicit scope, owner and acceptance before Design Hub/advanced AI expansion |

## Confidence and limitations

High confidence in revision, source presence, explicit flags/placeholders, release existence and CI conclusions; moderate confidence in implementation breadth; live operation of every system remains unverified. No product, governance status, commit, push, merge or deployment was changed.

Read source snapshots, checklists and CI job metadata are retained in evidence JSON; tree/run snapshots are in tmp/2026-09-10-github-tree.json and tmp/2026-09-10-github-runs.json. GitHub may advance after this snapshot; use the pinned SHA.
