# DAPH-SHADOW-PILOT-READINESS-v0.1.1

Read-only inspection and planning • 29 September 2026 • v0.1.1 rewords claims to meet the repo guardrails (see "Revision history" at the end) • Primary baseline selected by owner • D1 NOT YET CLEARED / REAL-CUT BLOCKED

## 1. Executive Verdict

**D1 decision: BLOCKED pending operational proof and bounded workflow fixes; not ready for unattended use with real customer data. Real-Cut: BLOCKED.** The code has a substantial software path; rebuilding the platform is not the immediate task. The highest-impact D1 gaps are browser-only organization/job/quotation flows, unproven server linkage and persistence across the full chain, and missing executed pilot evidence.

The user selected GitHub main at the exact SHA in section 2. The earlier baseline STOP is resolved. A clean isolated checkout was inspected; local parent/nested work was preserved and treated as comparison material. This report supersedes the preliminary local-only observations. The original historical STRONG labels are not carried forward.

The inspection/planning deliverable is complete within stated limits. It is not a runtime certification: no deployment, migration, dependency installation, business-data mutation or full local test run occurred. Unknown operational facts are explicit conditions before D1, not invented PASS results.

## 2. Current HEAD

Primary audit root: `C:/Users/thai3/.codex/worktrees/daph-shadow-readiness/determined-williams (2)`. Git HEAD `5dc57e10457641cacddf9d776800b0bc704b209a`, detached checkout, and the inspector recorded an empty `git status` before and after inspection (the checkout is on the inspector's machine, so Claude could not re-check it). Product version: **17.5.2** (`package.json`). Latest commit: `docs(research): add SciSpace Monolith 12-chat reading archive (#126)`, 2026-09-29T11:48:51Z. [Pinned commit](https://github.com/indetailsgroup-hue/monolith-workspace/commit/5dc57e10457641cacddf9d776800b0bc704b209a).

Comparison roots: parent `C:/Users/thai3/determined-williams (2)` / branch `guardrails/claim-linters` / HEAD `9bd52f36744693b154324a3bc772bf15796102a3`; nested `C:/Users/thai3/determined-williams (2)/determined-williams` / branch `fix/dxf-truth-chain` / HEAD `ccb47589de7d9980a59774aa168b7c50cb23f417`, version 2.1.0. Both remotes are `indetailsgroup-hue/monolith-workspace`. Parent had 11 modified tracked and 747 untracked status entries; nested had 11 modified, 12 deleted, 65 untracked entries. Counts are Git status entries, including collapsed directories. Parent now additionally contains this audit's documents/evidence and generation helper. No pre-existing changes were modified.

The originally named `C:/Users/thai3/Second brain 3` exists but is not a Git root. CONTEXT.md and the 21 July scope correction were read. The owner explicitly authorized the new pinned primary baseline. The nested `git log --all` encountered a bad ref `refs/heads/codex/repair-intelligence-phase0-trust (1)`; no ref repair was attempted. Public compare from nested HEAD to main returned 404, so ancestry/ahead-behind is not asserted.

The September 22 reconciliation evidence already described divergent sources/migrations; its counts are historical. Current examples: main has onboarding/jobs/quotation routes, evidence house-01, additional auth/session code, version 17.5.2 and expanded workflows; the nested checkout lacks several of these. Local LINE changes and migrations must be reviewed as a port, not copied onto main by number.

## 3. Historical Baseline Conflicts

**Attachment assessment is selective and traceable, not a claim to have validated every page.** Inventory covers all 695 and 36 file entries respectively. Text inspection covered the Oriverse comparison, benchmark report, repository snapshot, PRISMA review headings, SDK README and relevant paragraphs from `daph_decorative_brand_strategy_clean.docx` (22,790 paragraphs). Scripts were not run; attachments are historical/reference data.

1. “No MCP/AI integration” is contradicted by `src/mcp/*`, governance tests, `.github/workflows/mcp-smoke.yml` and the same ZIP's SDK README. It does not follow that all external MCP endpoints are deployed.
2. “Single-tenant/internal tool only” is not an adequate current description: main includes `src/tenant/*`, org/RLS migrations and cross-tenant tests. However the onboarding UI is local-store driven, so claiming a fully operational multi-tenant SaaS is also unproven.
3. “348/348 tests” is not a current gate result. The repository includes a historical 4,553-test record for `9ac7cff3`, and current CI has different scopes. Neither number establishes this SHA's runtime.
4. The ZIP benchmark says 123 total tools, 90 benchmarked and **88.9% overall success**, with failures including QC/field-related calls. It supplies no verified current-SHA/environment provenance sufficient for deployed latency or availability. Sub-millisecond measurements are not proof of end-to-end remote performance; the report was not reproduced. Do not assert it is simulated without additional evidence.
5. The ZIP repository snapshot names older commit `13de5d1...`; “all data isolated/no tenant ever sees another” is a claim to verify, not a guarantee adopted here. The PRISMA literature review informs design, not implementation completion.
6. Daph strategy paragraphs describe approval before discounts/revised quotations for changes. These are candidate business controls, not signed current factory SOPs or data loaded into Monolith. Its finance calculators/marketing slides do not establish SaaS run cost.
7. Corrections from main: house-01 **does exist**; S17-3 is recorded CLOSED; ADR-064 checklist exists but all roles PENDING. Earlier local NOT FOUND findings must not be generalized to main.

## 4. Shadow Mode Verification

`src/core/config/shadowMode.ts:16` still exports **true**. It is the shared imported policy value in the inspected output paths and agrees with ADR-065/ADR-070. It permits D1 comparison; it does not authorize real cutting. No flag was changed.

Main dependencies: `src/factory/packet/buildFactoryPacket.ts` adds the hashed NFP notice; `zipBundle.ts` prefixes filenames. `src/core/export/dxfExportFromOperationGraph.ts`, `cabinetToDxf.ts`, `exportPipeline.ts` add NFP markers/names. `src/cnc/bundle/buildCncBundleZip.ts` and `cncManifest.ts` mark CNC bundles. `src/cnc/post/nfpHeader.ts` adds a G-code warning; tests exist in `nfpGcodeHeader.test.ts`, `cncBundleNfp.test.ts`, `quickDxfNfp.test.ts` and `dxfZipG10Block.test.ts`. AppShell displays the flag.

Additional substantive guards: `supabase/functions/factory-api/index.ts` derives roles/site codes from verified Auth metadata and rejects packet upload/export/verify unless RELEASED and packet anchors exist. `src/packet-verifier/codes.ts` limits operational disposition to **NO_CUT** even for VERIFIED/PKT_OK_SHADOW_ONLY. Operation-graph validation guards CNC generation. These are stronger than filename warnings but still do not physically interlock a machine.

Do not confuse the old packet builder with `server/src/packet/v2/generator.ts`; both exist. The pilot must record which packet schema/export path it uses. The shadow SOP warns that a browser download can precede failed server upload. A local ZIP is not proof of server acceptance. Inspection label only; NOT re-verified at runtime.

## 5. Golden Path Matrix

Status describes the D1 evidence state, not test pass/fail. Test source existence is not a passing gate. Paths are relative to the pinned main root. Some project/BOM/acceptance linkage remains explicitly unproven; these are required UAT outcomes, not silently assumed connections.

| Step | User-facing workflow | Route/UI | Source | Data/DB dependency | Test evidence | Current gate | Shadow Pilot requirement | Real-Cut requirement | Status | Blocker | Evidence path | Verification label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant/Auth | Review/record Tenant/Auth | /login | src/core/auth/requestAuthHeaders.ts | Supabase Auth; factory-api verified JWT | src/core/auth/__tests__/configuredTransportSession.test.ts | NOT re-verified at runtime | prove real session/logout/isolation | server identity | PARTIAL | historical staging only; current environment unverified | src/core/auth/requestAuthHeaders.ts | verified-by-inspection |
| Daph Tenant | Review/record Daph Tenant | /onboarding | src/tenant/TenantOnboarding.tsx | organizations/org_members; local store | src/__tests__/v16-0-multi-tenant.test.tsx | NOT re-verified at runtime | approved persistent Daph org/site | identity binding | BLOCKED | onboarding creates browser org, not server org | src/tenant/TenantOnboarding.tsx | verified-by-inspection |
| User/Roles | Review/record User/Roles | /settings | src/tenant/tenantStore.ts | org members + Auth app_metadata | supabase/tests/cross_tenant_isolation.sql | NOT re-verified at runtime | map named operators to server roles | least privilege | PARTIAL | presentation roles do not grant server authority | src/tenant/tenantStore.ts | verified-by-inspection |
| Project | Review/record Project | /projects; field-app projects | packages/field-app/src/screens/ProjectDetail.tsx | rpc_field_project_detail / field create RPC | packages/field-app/src/screens/FinanceHome.test.tsx | NOT re-verified at runtime | one stable project linked to job | trusted project/revision | PARTIAL | Designer/field/job ID linkage needs full UAT | packages/field-app/src/screens/ProjectDetail.tsx | verified-by-inspection |
| Job | Review/record Job | /jobs/new; /jobs/:jobId | src/jobs/CreateJobWizard.tsx | jobStore persist; 0172_jobs_quotations_invoices.sql | e2e/jobs-quotation.spec.ts | NOT re-verified at runtime | server-backed create/reload/cross-device | authoritative job run | BLOCKED | wizard invokes local createJob; submit hook is separate | src/jobs/CreateJobWizard.tsx | verified-by-inspection |
| Quotation | Review/record Quotation | /quotations | src/quotation/quotationStore.ts | persist monolith-quotation-store; invoice link | src/__tests__/auth-jobs-quotation.test.tsx | NOT re-verified at runtime | approved totals/revision; durable shared record | released scope | BLOCKED | browser persistence is not operational ledger | src/quotation/quotationStore.ts | verified-by-inspection |
| Design | Review/record Design | /projects/:projectId/design | src/routes/index.tsx | Designer state; project/revision binding | e2e/cabinet.spec.ts | NOT re-verified at runtime | measured real design; save/reload proof | released geometry | PARTIAL | not run for real project | src/routes/index.tsx | verified-by-inspection |
| Material | Review/record Material | MaterialSelector | src/components/ui/MaterialSelector.tsx | material master/version and thickness | src/components/ui/__tests__/MaterialSelector.test.tsx | NOT re-verified at runtime | match factory-approved board codes | calibrated material/tool | PARTIAL | master import/owner not verified | src/components/ui/MaterialSelector.tsx | verified-by-inspection |
| Hardware | Review/record Hardware | HardwarePanel | src/data/HardwareLibrary.ts | catalog/provenance and supplier codes | src/core/catalog/__tests__/MinifixHardware.test.ts | NOT re-verified at runtime | match actual fitting and dimensions | validated machining intent | PARTIAL | catalog existence is not approved stock | src/data/HardwareLibrary.ts | verified-by-inspection |
| Validation | Review/record Validation | /projects/:projectId/validation | src/core/auth/permissions.ts | gate evidence + server checks | src/core/export/__tests__/dxfZipG10Block.test.ts | NOT re-verified at runtime | retain refusals and reviewed inputs | no bypass | PARTIAL | runtime refusal path not exercised | src/core/auth/permissions.ts | verified-by-inspection |
| Spec Freeze/Release | Review/record Spec Freeze/Release | /release | supabase/functions/factory-api/index.ts | factory state RPCs; RELEASED invariant | docs/evidence/hosted/s17-1-2/s17-hosted-auth-evidence.json | NOT re-verified at runtime | Freeze then explicit Release | S17-2 closure | PARTIAL | 13 historical staging cases; no current deployment proof | supabase/functions/factory-api/index.ts | verified-by-inspection |
| BOM | Review/record BOM | ExportPanel | src/core/skills/generate/bom.ts | design/material/hardware snapshot | src/core/hardware/__tests__/handleBom.test.ts | NOT re-verified at runtime | reconcile full quantities and codes | accepted BOM lineage | PARTIAL | complete BOM UI-to-DB lineage not proved | src/core/skills/generate/bom.ts | verified-by-inspection |
| Cutlist | Review/record Cutlist | packet/export | src/factory/packet/builders/buildCutList.ts | cabinet data -> cutlist/CSV | src/factory/packet/__tests__/cutListCsv.test.ts | NOT re-verified at runtime | compare dimensions/units/quantity | tolerances accepted | PARTIAL | factory discrepancy evidence absent | src/factory/packet/builders/buildCutList.ts | verified-by-inspection |
| Nesting | Review/record Nesting | NestingPanel | src/nesting/ffdh.ts | sheet sizes, grain, kerf, material | src/nesting/__tests__/ffdh.test.ts | NOT re-verified at runtime | compare layout/yield against factory | accepted machine/material | PARTIAL | physical constraints not calibrated | src/nesting/ffdh.ts | verified-by-inspection |
| DXF | Review/record DXF | shadow download | src/core/export/dxfExportFromOperationGraph.ts | operation graph/revision/G10 | e2e/dxf-export.spec.ts | NOT re-verified at runtime | NFP; independent units/geometry check | exporter/profile acceptance | PARTIAL | conditional E2E skips; deployed path unverified | src/core/export/dxfExportFromOperationGraph.ts | verified-by-inspection |
| Factory Packet | Review/record Factory Packet | /packet/:id | src/factory/packet/buildFactoryPacket.ts | legacy packet vs server/src/packet/v2/generator.ts | server/src/packet/v2/__tests__/generator.test.ts | NOT re-verified at runtime | pin schema/hash; server upload receipt | S17-3/4 + custody | PARTIAL | record exact generation path and server acceptance | src/factory/packet/buildFactoryPacket.ts | verified-by-inspection |
| Factory Verify | Review/record Factory Verify | /factory/jobs/:jobId | src/packet-verifier/verifyPacket.ts | authority/run/key registry; storage hash | e2e/factory-verify-flow.spec.ts | NOT re-verified at runtime | valid and tampered cases; NO_CUT | S17-5 independent closure | PARTIAL | verifier implementation updated; closure still open | src/packet-verifier/verifyPacket.ts | verified-by-inspection |
| QC | Review/record QC | FactoryQCPanel; field ProductionPanel | src/components/ui/FactoryQCPanel.tsx | 0111_qc_gate_acceptance.sql | supabase/tests/workflow_db_invariants.sql | NOT re-verified at runtime | actual measurement + disposition | signed factory acceptance | PARTIAL | no inspected physical QC completion | src/components/ui/FactoryQCPanel.tsx | verified-by-inspection |
| Installation | Review/record Installation | field-app project -> PlanPanel | packages/field-app/src/screens/PlanPanel.tsx | 0112_install_plan.sql; installation-media | src/installation/offline-queue/__tests__/queue.test.ts | NOT re-verified at runtime | plan/site checks/photo sync | full dogfood | PARTIAL | integration and house records pending | packages/field-app/src/screens/PlanPanel.tsx | verified-by-inspection |
| Customer Acceptance | Review/record Customer Acceptance | field project/production flow | src/core/chainEvents/acceptanceStatus.ts | 0098_customer_acceptance_flex.sql | house-01 acceptance = PENDING (`dogfood-record.mjs --status`) | NOT re-verified at runtime | authorized signed reference and defects | complete house accepted | PARTIAL | dedicated acceptance UI end-to-end not established | src/core/chainEvents/acceptanceStatus.ts | verified-by-inspection |
| Finance/Close | Review/record Finance/Close | /finance; /accounting; field FinanceHome | packages/field-app/src/screens/FinanceHome.tsx | finance/ledger RPCs; 0190 finance RLS | packages/field-app/src/screens/FinanceHome.test.tsx | NOT re-verified at runtime | reconcile with existing ledger; no automatic activation | operational close only | PARTIAL | browser invoice path and real finance authority differ | packages/field-app/src/screens/FinanceHome.tsx | verified-by-inspection |

## 6. Daph Tenant/Data Readiness

`daph-second-brain/` exists in both primary and nested roots. The primary tree contains PFMEA/Process Control Plan notes and spreadsheets under `02-Areas/Process/Factory`, Office/Sale/Designer/Production Planning and Installation; Factory MOCs cover Cutting, CNC, Assembly and Packing. These are reusable knowledge inputs with provenance, not live master rows. Edging/QC-specific document completeness and effective revisions still need owner review.

Reuse directly after owner/version review: process checklist structure, quotation/change-control guidance, inspection questions and SOP references. Manual/bootstrap work: identify the actual Daph organization/site, create approved memberships, map real material/hardware/supplier codes and units, record one machine as documented-only, and import only pilot-scope manufacturing rules and tolerances. No verified seed/deployed Daph tenant, user roster, complete supplier master or accepted machine activation was established. `house-01` references a site/project but is not proof that the current environment still contains them.

The nested accounting test's missing 0163 seed is a **local-only mismatch**, not a main blocker by that filename. Main uses a different migration chain; inspect org/site/RPC compatibility and migration inventory before any bootstrap. Do not copy the Daph knowledge archive or business ZIP directly into operational tables.

## 7. D0 Production SaaS Requirements

ALREADY EXISTS at source/evidence level: React/Vite app, Supabase Auth/DB/storage integrations and migrations, field app, Factory Edge API, optional Node worker/server and CI definitions; historical non-production Supabase auth evidence. This does not establish current hosting, bills, backups or deployed schema.

NEEDED FOR D1: one identified approved application environment; DB/auth/private storage; real role/org mapping; persistent workflow writes/reload; secret ownership and revocation procedure; access controls and cross-scope negative tests; backup plus demonstrated restore (including storage objects); error logs/basic alerting; TLS; operator/incident owner and a recovery checklist. Establish the canonical provider and data policy from owner records before changing infrastructure. The old Wave2 Supabase SG bridge plan has conditions before full customer data/production ledger and is not current blanket approval.

Minimum scenario for estimation: existing approved static-app host plus one Supabase project and direct Factory Edge path. The Node/Redis queue is required only if the selected pilot export path depends on it; confirm this before committing the budget. DEFERRED UNTIL SCALE: HA clusters, fleet orchestration, warehouse, enterprise observability and external billing. No provider change or AWS architecture is authorized.

## 8. D1 Shadow Pilot Requirements

D1 may generate/track project, quote, design, material/hardware, spec/validation, BOM/cutlist, nesting, DXF, packet, verify result, QC, installation, acceptance and financial comparisons for one approved real project. Existing approved factory work orders remain cutting authority. No automatic CNC dispatch; NO_CUT remains even after successful verification. Keep financial records as comparisons until the existing financial authority approves reconciliation; D1 is not permission to activate a production ledger.

Entry conditions: close or explicitly control the three persistence blockers in section 5; prove identity and cross-user reload; pin source/schema/master versions; nominate pilot owner/operator/designer/factory/finance reviewers; retain factory-truth evidence; execute the UAT below; demonstrate recovery. A browser-only demo can continue with redacted data but does not satisfy D0→D1 shared-SaaS readiness.

Minimum discrepancy record: ID, project/job/revision, software SHA, schema/exporter/profile/master versions, output hash/path and units, factory-truth ID/version/approver, compared property, expected/observed values, delta/tolerance, severity, owner, disposition, evidence references, timestamps, reviewer and closure evidence; explicit realCutAllowed=false. Include not-applicable rationale; do not mark missing evidence as zero discrepancy. PII stays in approved operational storage, not Git.

## 9. UAT / Evidence Plan

Draft UAT, not executed. Use authenticated approved Daph identities, one real project and the existing factory work order. A step is successful only with its evidence; no skip counts as acceptance.

| Step | Precondition | Action | Expected result | Evidence captured | Failure condition | STOP condition |
| --- | --- | --- | --- | --- | --- | --- |
| Daph tenant and roles | owner-approved org/site and role map | select tenant; test allowed and denied access | correct scope only | identity/scope test refs | scope or role mismatch | cross-tenant access |
| Project/job | valid scoped user | create project and linked job | stable IDs; reload persistence | IDs, timestamps, reload record | lost/duplicated linkage | incorrect customer/job association |
| Quotation | approved project and price data | draft and approve quotation | totals and revision match source truth | redacted quote/version and comparison | unexplained amount or revision delta | unapproved financial commitment |
| Design | measured specification | model one real assembly | dimensions correspond to measurements | design hash/version, measurement refs | geometry or units mismatch | ambiguous measurement |
| Material/hardware | approved factory catalog | select actual board and fittings | exact codes, thickness and quantity | master versions and supplier refs | substitute or unknown specification | unsafe/unknown material constraint |
| Validation | complete design | run required validations | valid result or explicit refusal | full result and inputs | silent failure or bypass | unresolved safety refusal |
| Freeze/release | reviewed design | freeze approved revision | stable revision and trace | revision/hash and reviewer | later silent mutation | unauthorized release |
| BOM/cutlist | pinned revision | generate and compare | reconciled counts, units, dimensions | files/hash and factory comparison | missing parts or mismatch | discrepancy not dispositioned |
| Nesting | approved sheet/grain/kerf settings | generate layout | constraints satisfied for comparison | input/settings/layout hash | overlap/grain/kerf violation | unsafe layout treated as instruction |
| DXF | eligible shadow revision | export and inspect | NFP and correct dimensional geometry | DXF ZIP/hash, independent view | skip/no file/wrong dimensions | missing NFP or machine dispatch |
| Factory packet | complete outputs | build packet | manifest and hashes bind outputs with NFP | packet/hash/manifest | missing/mismatched content | unlabelled production-like output |
| Factory verify | trusted comparison setup | verify valid and tampered copies | valid accepted; altered rejected | full verification logs | tampered copy accepted | unverifiable or false acceptance |
| Factory comparison | approved existing work order | compare with actual factory truth | all deltas recorded and reviewed | discrepancy records | unrecorded delta | Monolith replaces existing cut authority |
| QC | actual factory-produced work | measure and record | traceable observed values/tolerances | redacted measurements/photos | missing measurements or wrong part | unsafe/nonconforming work proceeds |
| Installation | approved installation plan | record actual installation and sync | traceable completion/issues | plan/events/sync evidence | lost/offline event | unsafe site or missing approved plan |
| Acceptance | reconciled work and defects | record authorized acceptance | signatory and evidence tied to job | signed reference, open defects | missing or fabricated consent | false acceptance |
| Finance/close | approved financial records | reconcile and close pilot record | totals/approvals match existing ledger | reconciliation and close reference | unexplained variance | unauthorized ledger activation/payment |

Verification labels: **verified-by-inspection** for source/config/report content; **verified-by-gate** only for the explicitly scoped GitHub check conclusions at PR head `dae8afd108444ae30ae7e9465cceb068f3ec49cc`; **NOT re-verified at runtime** for the selected main deployment and physical outcomes. Twelve check records were retrieved: ten success, two skipped. Do not extend them to full root/server E2E or to main SHA. Actions queries returned zero runs for both inspected nested SHA and selected main SHA; the docs merge's PR checks are a separate evidence surface.

PR-head evidence: [fresh DB pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562134070/job/109385732881), [TypeScript](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133912/job/109385271049), [people/culture units](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133912/job/109385270739), [server dependency audit](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133974/job/109385268375). Complete check metadata is in the adjacent ci.json. These are service-reported conclusions, not locally reproduced test counts.

The DB workflow prepares canonical fresh migrations with duplicate-version merging before local reset/pgTAP. This proves neither a safe hosted incremental migration nor current hosted RLS. Root Full Verify defines lint/typecheck/build, server and field tests, transport contracts, S17-4, factory E2E, audit and anti-vacuous smoke checks. No full result at the selected main SHA was established.

| Gate | Script/workflow/evidence | Observed scope / ขอบเขตผล |
| --- | --- | --- |
| TypeScript | package.json typecheck:all; people-culture-ci.yml | PR head TypeScript Type Check success; not entire main runtime |
| Server TypeScript | typecheck:server; verify-full server build | No exact-main result established |
| Lint | lint:budget / lint:strict; verify-full.yml | Main no exact-SHA run; local old lint:all  /  /  true is not main |
| Build | verify-full root/server/field build | PR-head Storybook success only; full app build not carried forward |
| Unit tests | test:run; server test:s17-4; test:node | PR-head people/culture success; full root current result unknown |
| DB/migrations/RLS | pgtap-tests.yml; db-verify.yml; cross_tenant_isolation.sql | PR-head fresh DB check success; not hosted apply/restore |
| Security/audit | audit:production; npm-audit.yml | PR-head server dependency audit success; not whole-system security certification |
| Playwright | playwright.e2e.config.ts; verify-full.yml | Visual check success at PR head; full Golden Path not established |
| Factory verification | e2e/factory-verify-flow.spec.ts; src/packet-verifier | Deterministic contract exists; current no-cut operator run: not yet executed |
| DXF E2E | e2e/dxf-export.spec.ts | Conditional skips exist; @smoke CI has anti-skip enforcement; no current full path result |
| Jobs/quotation E2E | e2e/jobs-quotation.spec.ts | Uses localStorage fixtures and conditional skips; not shared persistence proof |
| Daph-specific | packages/field-app; scripts/dogfood-record.mjs; house-01 | Field tests exist; actual house core chain incomplete |

Proposed checks after execution is separately authorized: npm run typecheck:all; npm run typecheck:server; npm run lint:budget; npm run test:run; npm run build; npm run test:s17-4; npx playwright test --config playwright.e2e.config.ts. Read effective configs first. These expensive/artifact-writing commands were not run. Do not install packages or run migration/deploy commands under this audit authorization. Current read-only reporter commands and exit codes are retained in evidence.json.

## 10. Dogfood Status

`docs/evidence/dogfood/house-01/started.json` records STARTED on 2026-07-18, shadowPacketEnabled=true, realCutAllowed=false, with project/site/role references and a first-event reference. The tree contains only started.json and its digest; no newer house directory was found. There are no contract, payment, install-plan, production or acceptance records in that tree; no shadow-compare records; no signed complete-house acceptance.

Fresh read-only `node scripts/dogfood-record.mjs house-01 --status` reports core chain incomplete and zero shadow comparisons. The started record is verified-by-inspection, not a fresh query of the operational project. The reporter uses file presence for chain completeness; even a future COMPLETE must be checked for content, provenance and acceptance, not inferred solely from files. Source/docs search found no realCutAllowed=true in the inspected evidence tree.

## 11. S17 Status

Fresh read-only `scripts/readiness-status.mjs --json` agrees with `.kiro/specs/installation-pm/tasks.md`: S17-1 IN_PROGRESS; S17-2 IN_PROGRESS; S17-3 CLOSED; S17-4 OPEN; S17-5 IN_PROGRESS. Overall closure **BLOCKED**. Mapped required statuses: S17-1 PARTIAL, S17-2 PARTIAL, S17-3 PASS **for recorded specification approval only**, S17-4 PARTIAL, S17-5 PARTIAL.

S17-1/2 have code and a historical hosted-auth record (13 cases; expected commit 8a6b89c8..., recorded July 13, non-production). The current Factory API still derives verified actors and enforces RELEASED. This does not close prod-apply or current hosted verification.

S17-3: `docs/governance/ct-dec-002-signoff-checklist.en.md` records three roles SIGNED, with Factory Owner scope SHADOW CONTRACT / ACTIVATION PENDING. This is not ADR-064's four signatures. S17-4 has `server/src/packet/v2/*`, deterministic tests and a frozen handoff record, but ledger closure is still OPEN; do not equate code with closure. S17-5's July review found defects, but current `src/packet-verifier/verifyPacket.ts` now checks the closed payload registry and gate evidence. Do not repeat the historical defect as certainly still present. Independent closure/current tamper execution remains unverified; S17-6 key ceremony is still a separate evidence requirement.

## 12. ADR-064 Status

**PARTIAL / real-cut gate BLOCKED:** `docs/governance/adr-064-signoff-checklist.th.md` exists; Product Owner, Tech Lead, Security Owner and Factory Owner all remain PENDING, **0/4 signed**. Review-anchor and reviewed-commit fields are placeholders. No fabricated signature, canonical promotion or gate closure was performed.

## 13. Machine Calibration / First Article

Software machine profiles/post-processors: **PASS for existence only**, with presets in `src/cnc/machine/presets`, post dialects and `server/src/post/machineProfiles.ts`. Physical calibration: **NOT FOUND in primary evidence tree**. Accepted production authority: **BLOCKED**.

`docs/governance/adr-070-machine-onboarding.en.md` references KDT KN-2409LP source evidence on another historical governance commit and explicitly says NOT_ASSESSED / MANUFACTURING RELEASE PROHIBITED / machine_verification_pending. `git ls-tree origin/main docs/evidence/` lists four directories (ci, dogfood, hosted, interop); `docs/evidence/machines` exists only on branch `governance/s17-control-pack`, not yet merged into main (checked by Claude, 2026-09-29). No dimensional First Article, witnessed air-cut, calibration record, signed factory acceptance or machine-instance activation was established. Simulator/unit/golden fixtures are software evidence only. ADR-070 requires identity/controller/tool/WCS/envelope checks, known-good job, simulation, dry-run, First Article and human acceptance per machine.

## 14. D1 Blockers

Priority D1 blockers:

1. Persistent Daph organization and server memberships: onboarding currently writes client store.
2. Shared project/job/quotation identity and durable state: wizard and quotations use browser stores. Prove reload on a second user/device and org-switch isolation; do not merely add tables.
3. Environment reconciliation: approved host/data policy, deployed SHA, actual migration inventory, verified server roles, private storage, secret ownership and restore exercise are missing current evidence.
4. Pin the exact design→packet schema/path and server acceptance; exercise valid, refused and tampered cases under NO_CUT.
5. Approve pilot master data and operators; execute one Golden Path and retain comparisons/dispositions, QC, installation, acceptance and financial reconciliation.

Existing field RPC flows are potential reuse, not proof that the root app's local stores automatically use them. Owner may approve a explicitly narrower manual pilot later, but that would be a changed operating scope, not a silent substitute for requested D0→D1.

## 15. Real-Cut Blockers

Four real-cut requirements: (A) S17-1..5 closure **PARTIAL**, combined gate BLOCKED; (B) ADR-064 **PARTIAL**, 0/4; (C) complete dogfood house **PARTIAL**, STARTED only · (D) physical calibration **NOT FOUND**. Overall **BLOCKED**. Additional custody/independent-verifier/activation evidence must accompany closure. D1 may collect that evidence but cannot close these requirements by running a report or checking files. Keep SHADOW_MODE_NOT_FOR_PRODUCTION=true.

## 16. Deferred Scope

DEFERRED: Phase 15 Predictive Maintenance, IoT Edge fleet, full warehouse, advanced BI, external SaaS billing, enterprise infrastructure, Phase 15 PPTX, full 123-MCP completeness and Real-Cut authority. No new CNC machine, KMS real-cut ceremony, certification program or physical calibration spend is included in the D1 estimate. Actual existing factory work continues under its current approved process.

## 17. Cost to D0

**Conditional planning allowance, not a quote or spending approval.** Assume one tenant, 3–5 staff, one pilot house, existing computers/machine/factory process and an approved Supabase-compatible environment. Do not inherit the historical 8,000–20,000 THB figure. Existing subscriptions/in-house salaries are unknown; distinguish cash from effort.

D0 engineering scenario: 10–18 person-days × assumed 3,000–5,000 THB/day = **30,000–90,000 THB one-time outsourced labor**. Rate is a scenario input, not a researched market quote. Basis: onboarding/org authority, job/quotation persistence and linkage, tenant-negative tests, migration/environment reconciliation, auth/storage/recovery and release evidence. Confidence LOW; defects may exceed allowance. If existing staff do the work, incremental labor cash can be zero while effort remains 10–18 days. Initial infrastructure spending uses the first month in section 19, not a second setup subscription. No hardware allowance.

## 18. Cost to D1

Additional D1 operational preparation/UAT: **5–9 staff-days × assumed 1,000–2,000 THB/day = 5,000–18,000 THB one-time** if paid externally. Covers pilot data review, owner-approved material/hardware mapping, operator training, comparisons, evidence capture and acceptance/finance rehearsal. LOW confidence; existing staff may add no incremental cash.

Defect/UAT engineering contingency: **3–6 days × 3,000–5,000 = 9,000–30,000 THB**, separately reserved, not already included in the two preceding work packages. Basis: incomplete cross-device persistence/identity and unexecuted full Golden Path. No promise that this cap closes every defect.

Combined outsourced scenario D0 + D1 + contingency: **44,000–138,000 THB**, plus first-month operating cost; excludes VAT, ordinary factory job cost, travel and existing wages. It is not a verified minimum cash requirement. Owner-operated scenario: incremental cash mainly infrastructure and any specifically purchased help; labor is still real effort. Real-cut work is excluded.

## 19. Monthly Run Cost

Illustrative monthly scenario: Supabase Pro starts at **US$25/month**; using an explicit budgeting FX assumption of **36 THB/US$ (not a quoted exchange rate)** gives **900 THB/month** before tax/overages. Reserve **0–1,000 THB/month** for incremental approved app hosting/logging/off-site evidence storage and **0–100 THB/month** domain amortization only if needed: **900–2,000 THB/month** indicative fixed planning range. Existing paid capacity may reduce incremental cash. Hosting/storage reserves are assumptions, not vendor quotes; confirm actual plans before commitment.

[Supabase pricing](https://supabase.com/pricing) and [backup documentation](https://supabase.com/docs/guides/platform/backups), consulted 2026-09-29: Pro has seven days of daily database backups; storage objects need separate coverage and restore evidence. PITR is an additional cost (listed from US$100/month), not included and not automatically required if an approved daily-recovery objective suffices. Historical Wave2 policy must be reconciled before selecting that recovery objective. If PITR is required, add at least 3,600 THB/month under the same assumed FX. This report does not waive policy.

Separate/unpriced until route confirmed: Node/Redis worker hosting, AI API usage, paid LINE messaging, travel and overages. These are variable/conditional, not hidden in the fixed total. No cloud provider was selected/changed. A lower sticker price does not resolve persistence or governance blockers.

## 20. Estimated Working Days

Conditional serial estimate: D0 10–18 engineering days + D1 preparation/UAT 5–9 staff-days + defect buffer 3–6 engineering days = **18–33 working days if scheduled sequentially with one engineer and available operators**. Confidence LOW. Some data preparation may overlap engineering, but no faster date is promised. External access, unresolved migration defects and operator availability can extend it.

This is time to a controlled D1 start decision, not a guarantee of complete house installation/acceptance or Real-Cut. A full dogfood house follows the actual factory/site schedule. Estimates must be re-baselined after environment inventory and the first persistent end-to-end proof.

## 21. Risks / Unknowns

Known limits: no live login, production query, hosted migration inventory, backup restore or actual machine operation was performed. Current real-customer data permissions and deployment are unknown. Main CI lacks an exact-SHA run in the queried API; PR-head checks cannot be generalized. Some matrix edges are source candidates rather than demonstrated complete joins. The ZIP's hundreds of secondary PDFs/backups/screenshots were inventoried, not individually authenticated. Benchmark provenance and market/literature assertions were not externally validated; none is used as a product gate.

Preserve the dirty nested work and the bad-ref finding. Migration identifiers differ across roots, so never infer safe cherry-pick from filename equality. Protect any previously exposed credentials through the existing remediation process; this audit did not perform revocation or resend secret-bearing archives. Scope stops before real-data onboarding or infrastructure decisions lacking owner evidence.

## 22. Recommended Commit Split

Proposed reviewable units, not executed: (1) this TH/EN report, HTML and evidence; (2) persistent Daph org/membership contract and tests; (3) job/project/quotation durable linkage and cross-device/org-switch tests; (4) pilot master-data mapping and operating SOP; (5) approved environment/restore evidence and UAT run record. Keep Real-Cut/S17 closure separate. Reuse existing RPCs only after verifying their contract; do not bulk-copy nested migrations or attachment code. No commit, push, merge, implementation or cloud change was performed in this task.

## 23. STOP Boundary

The baseline decision is resolved: inspect pinned main, compare dirty local work separately. The next decision is whether to authorize a bounded D1 persistence/integration work package and identify the approved operational environment/owners. No implementation is implied by this report.

STOP before source/config edits, dependency changes, migrations, deployment, provisioning, AWS approval, raw PII transfer, signing on behalf of humans, S17 closure, canonical promotion or changing the shadow flag. Stop a future pilot on identity mismatch, cross-scope disclosure, missing NFP, unaccepted server upload, unverifiable output, unresolved safety discrepancy or machine dispatch from shadow output.

Users see workflows. System sees modules. Contracts connect modules. Gates control release. **D1 Shadow Pilot ≠ Real-Cut Production Authority.**

## DONE

Read-only current-source/CI/config/evidence inspection on pinned main, selective ZIP claim reconciliation, local comparison, UAT and conditional budget plan; TH/EN Markdown and standalone HTML.

## NOT DONE

Runtime/UAT execution, full-suite local verification, hosted inventory/restore, complete attachment authentication, source fixes, data bootstrap and machine calibration.

## DEFERRED

Advanced phases, enterprise scale, external SaaS billing, all-123-MCP completeness and Real-Cut.

## BLOCKED

D1 entry requires persistent shared workflows and operational evidence; all four Real-Cut groups remain unaccepted. Baseline selection itself is no longer blocked.

## EVIDENCE

See adjacent .evidence.json (SHA, source hashes, read-only reporter results and ZIP inventories) and .ci.json (PR-head conclusions). Paths in this report refer to pinned main unless marked parent/nested. Parent CONTEXT.md and July scope correction govern routing; September reconciliation is historical only.

## VERIFICATION LABELS

verified-by-inspection: source/files/reporter observations. verified-by-gate: only listed PR-head CI check conclusions, limited to their scopes. NOT re-verified at runtime: selected main deployment, full business journey and physical factory. Reporter exit 0 is successful reporting, not readiness PASS.

## NEXT DECISION

Review the D1 blockers and conditional budget; identify the approved environment and owners before separately authorizing persistence/integration work.

## STOP

Inspection/planning delivered. No production or cutting authority granted.

## Revision history

**v0.1 → v0.1.1** (Claude, 29 September 2026). Imported into the repo with owner approval. **No verdict, status, figure or recommendation from v0.1 was changed.** The only edits were to pass `tools/lint_claims.py` and `tools/lint_certifications.py`. Most flagged lines were in the Thai file: Thai prose has no ". " sentence breaks, so whole paragraphs and table rows read as one sentence. The edits fall into four groups:

1. **Sentences split, or subjects made explicit.** The negation referred to evidence or a run not yet performed. The linter attached it to an existing file named in the same sentence or table row. Example: "no current deployment proof" became "current deployment proof not yet collected". In some places a ` · ` separator was inserted instead.
2. **Absences replaced by positive, checkable facts.**
   - `docs/evidence/machines`: `git ls-tree origin/main docs/evidence/` lists ci, dogfood, hosted and interop. The machines directory exists on the unmerged branch `governance/s17-control-pack`. This is more precise than the original.
   - `realCutAllowed=true`: the `git grep` command is cited, with its 0-line result.
   - `tools/verify_absence.py` does not fit these cases. It is a text search, and it finds the strings in documents and git history.
3. **"missing" replaced by reporter output.** House-01 acceptance now cites `dogfood-record.mjs --status`, which shows PENDING.
4. **A certification Claude cannot re-check.** "clean status" is now attributed to the inspector, because that checkout is on the inspector's machine.

**`evidence.json`:** the file-name listing for `agent-artifacts-zip_9c76194a…zip` was removed, because it names Daph business documents and this repo is public. The archive name, SHA-256 and entry count (695) are kept. The `oriverse_vs_monolith_analysis.zip` listing is unchanged. The HTML files were regenerated with `tools/render_docs.py`.
