# MONOLITH delivery roadmap

Publication note: This is a dated evidence snapshot, not a new runtime or CI audit. Local artifact references are not included in this publication. SC-01–SC-18 are roadmap workstream IDs, distinct from Steering Committee resolutions.

11 September 2026 · EN · Revision 2 — SciSpace reconciliation added; delivery proposals remain subject to their gates

## Target and recommendation

Deliver one traceable cabinet/interior project from design through approval, manufacturing evidence, installation and financial close. Expand after this journey passes acceptance. This is a proposed product roadmap, not an approved implementation plan or permission to cut material.

Three approaches were considered:
- **Complete one pilot journey first — recommended:** exposes integration gaps while reusing existing modules; broad feature expansion waits.
- Complete every module independently: broader coverage, but delays proof that the whole project works.
- Lead with AI and marketplace features: attractive demonstrations, but depends on unresolved data and operational acceptance.

Working assumption: a cabinet/interior delivery pilot is the first business priority. Team capacity, pilot customer, machine access and integration providers are not yet confirmed. Phase order is dependency-based; elapsed durations are not commitments.

## Evidence baseline and repository boundaries

GitHub main examined: **52e0eeb12527d4bb3866ee726b4f30d4d74dca57**. Local governance root: `[local governance workspace]`, HEAD `aa1b30e`. Local active product root: its separate `determined-williams/` repository, HEAD `9c4bee6`. Both worktrees contain pre-existing changes and were inspected separately. Current remote product claims below come from GitHub main, not the older local checkout. CONTEXT and the 21 July scope correction informed this review.

- Implementation exists for cabinet/3D design, connectors, drawers/hinges, curved panels, DXF/CNC packets, workflow/LINE, field, accounting and organizational modules.
- v17.5.2 is published, but Full Verify fails: lint has 2,237 warnings against a ceiling of 2,235. Root tests/build and dependent E2E were skipped in that run. Separate smoke and pgTAP succeeded; several service checks succeeded.
- Real cutting remains blocked by shadow mode. ADR-064 signatures and completed dogfood evidence remain outstanding in inspected records.
- Org Health PERFORMANCE uses a fixed 75.0 placeholder; its route was not found in the inspected canonical registry. AI CRUD/store implementation alone does not prove model execution or business acceptance.
- Billing-report failure is undiagnosed; five dependency PRs remain open.
- Source presence and migration file counts do not establish deployed, applied or accepted behavior.

See the [detailed audit](../reports/2026-09-10-monolith-work-status.en.html) and [repository comparison](../reports/2026-09-11-monolith-cp06-comparison.en.html). No fresh local product test suite was run for this roadmap.

## Delivery sequence

| Phase | Work and outcome | Completion gate | Proposed accountable role |
|---|---|---|---|
| R0 — Reliable baseline | Reconcile remote/local revisions; isolate delivery work; repair lint regression; diagnose billing-report; refresh stale status records and triage dependency PRs | Required CI passes on the same candidate SHA, including previously skipped checks; every remaining failure has an explicit disposition and owner | Tech lead + QA |
| R1 — Project and access integrity | Validate login, organization/project context, roles, tenant isolation, approval versions and evidence references across the selected pilot; rehearse migration/backup/restore in staging | Negative cross-tenant and unauthorized-action tests pass; approved design and packet revisions stay traceable; restore rehearsal succeeds | Backend/security lead + QA |
| R2 — Complete shadow pilot | Run one project through design → quotation → customer approval → BOM/DXF/packet verification → simulated factory handoff → field acceptance record → financial reconciliation; resolve integration gaps using existing modules | One revision-bound evidence pack covers every step; rejection, revision and retry paths work; no unresolved critical pilot defect; shadow restrictions remain active | Product owner + design/factory/field/finance representatives |
| R3 — Controlled factory pilot | Close S17-1…5; obtain ADR-064 signatures; complete required full-chain dogfood; calibrate machine profile; review verifier, stop and rollback procedures | All four existing real-cut conditions are evidenced and approved by authorized owners before cutting; controlled pilot results are reviewed against agreed tolerances | Factory lead + PO/TL/Security |
| R4 — Operational release | Complete field photo/QC/rework/acceptance flow, purchasing/inventory/accounting reconciliation and selected external integrations; validate monitoring, support and recovery | Named users accept the selected journey in its target environment; transactions reconcile, recovery works, support ownership and release evidence are recorded | Operations/finance lead + release owner |
| R5 — Business and AI expansion | Replace Org Health placeholder with approved metrics and accessible routes; verify live scheduler/quotation AI; then consider capacity planning, benchmarks, DesignHub and spatial capabilities | Each feature has real data, authorization checks, measurable acceptance and an owner; AI additionally has evaluation, budget and human-review controls | Product owner + data/AI lead |

Dependencies: R0 → R1 → R2 → R3. R4 preparation can follow R2 in parallel with factory readiness, but real-cut production release still requires R3. R5 discovery can run earlier; it must not displace pilot blockers.

R2 can record simulated manufacturing and staged field/finance acceptance; it must label those records explicitly. R3 must satisfy the repository's actual dogfood/signoff definition, not treat a simulated R2 record as automatic permission.

## First two-week planning window

This is a prioritization window, not a guaranteed two-week completion date.

1. Pin the candidate revision and inventory local changes before any integration. Record which branch will receive fixes.
2. Find and correct the lint warning increase without raising the ceiling simply to pass. Run Full Verify and investigate any newly exposed failures.
3. Diagnose billing-report separately. Triage dependency PRs by compatibility and risk; merge only after their checks pass.
4. Create a single evidence-backed backlog: implemented / integrated / verified / accepted. Update stale checklists without deleting historical evidence.
5. Select one pilot project, its users and minimum integrations. Define acceptance for each R2 handoff.
6. Start R1 access and project-revision tests on the selected flow. Produce the R2 implementation plan only after that scope is agreed.

Window exit: a trustworthy candidate baseline, an owned blocker list and one testable pilot scope. If CI is still failing, keep the window open around those failures instead of claiming pilot readiness.

## Review checkpoints and measures

- **Day 30 review:** assess R0/R1 evidence and remaining blockers; revise delivery dates from actual capacity.
- **Day 60 review:** assess complete shadow-pilot coverage and the real-cut gate evidence.
- **Day 90 review:** decide whether controlled rollout is justified; expand only after acceptance.

These are review checkpoints from an agreed kickoff, not promised phase completion dates. Track required CI pass rate at one SHA, accepted pilot steps, unresolved critical defects, tenant-isolation results, evidence completeness, manufacturing discrepancies and reconciliation discrepancies. Establish numerical business targets with pilot owners before R2; do not invent current performance values.

## Deferred scope and decisions

CP06 is outside this roadmap. FieldFlow is a separate incomplete artifact; first compare it with MONOLITH's existing field app before deciding whether to reuse anything.

Defer marketplace/UGC/learning expansion, broad autonomous AI and new spatial products until the pilot demonstrates a need. Existing People/Training/OrgChart/QC modules should be maintained and checked for regressions rather than rebuilt by default.

Decisions before implementation planning: name the pilot project and owner; confirm available team and machine; select target environment and external providers; agree manufacturing tolerances and acceptance ownership. Proposed roles above are not actual assignments.

## Risks and control points

- Remote/local divergence: isolate the chosen revision and preserve existing work.
- Stale completion claims: bind each acceptance record to revision, environment and date.
- Factory access/signatures unavailable: continue shadow validation; keep real cutting blocked.
- External integrations unavailable: use explicitly labelled staging evidence; do not mark live acceptance complete.
- Scope growth: require a pilot blocker or an approved subsequent phase for new features.

## Revision 2 — SciSpace work incorporated

**Authorization:** the owner approved incorporating SciSpace work into the roadmap on 11 September 2026. This approves this documentation revision; budgets, procurement, deployment and production signoffs are not approved by that message. R0–R5 remain the delivery sequence.

**Coverage:** the previously identified SciSpace groups are now explicitly mapped below, together with related deliverables discovered in the same package changelog. This is a workstream-level reconciliation, not an exhaustive audit of every file or the owner's SciSpace account. Direct attribution comes from Scispace Agent author markers in S14/S16–20 records, S51–58 generators and local document generators. Other entries are associated through the package changelog; individual authorship is not independently established.

**Status vocabulary:** D = document/specification exists or is recorded; C = source/configuration/prototype exists; V = runtime verification; A = operational acceptance. D/C never imply V/A. “Not verified” is not a finding that implementation is absent. No new runtime tests were executed.

### Evidence-to-delivery matrix

| ID / work | Document and provenance | Implementation evidence | Verification / acceptance | Remaining work and exit evidence | Roadmap / proposed owner |
|---|---|---|---|---|---|
| SC-01 SOP, summary, executive decks and training | Package changelog; S14 tracked authorship; S1–15 related package history | Documentation generators and deliverables; no product feature inferred | D; V/A not applicable to document creation, runtime claims unverified | Maintain one source index, match SOP requirements to actual modules, record unresolved claims and aligned TH/EN deliverables | R0; product/document owner |
| SC-02 Agent orchestration, KPI/SLA, incident response — S16–18 | Direct SciSpace tracked-change records | Workflow/LINE product source exists; conformance to these contracts not traced end-to-end | D; V/A not verified | Map pilot agents/events; test retry, deduplication, escalation and human handoff; measure agreed KPIs | R1–R2, operational drills R4; integration lead |
| SC-03 Privacy, ethics, lifecycle, audit and steering — S19–23 | S19–20 direct authorship; S21–23 package records | IAM/role and workflow source exists; full policy enforcement unverified | D; V/A not verified | Map permissions/data retention, human review, agent retirement and audit responsibilities; attach negative tests and review records | R1 and R4; security/governance owner |
| SC-04 Programme amendments and deployment narratives — S24–50 | Changelog and SOP-to-GitHub mapping, including future programme years | Document statements only for claimed programme completion | D; go-live/ratification claims not independently verified | Classify each as proposal, historical record or supported acceptance; reconcile S1–52 mapping with current revision; replace assumed dates/coverage with evidence | R0, later R5; programme owner |
| SC-05 AI Creative Engine procurement — S51 | Generator explicitly names Scispace Agent | RFP/spec and Thai procurement brief; no supplier award established | D; procurement acceptance unverified | Resolve AIE ID conflict first; confirm business case, scope, budget owner, evaluation and buy/build decision before any RFP | R0 definitions; R5 delivery; product/procurement |
| SC-06 AI vendor integration and go-live — S52–53 | Direct SciSpace generators and vendor brief | Integration/SLA/cutover plans; connected AIE service not established | D; V/A not verified | Once SC-05 is approved, validate interfaces, tenant separation, UAT, rollback and actual support results | R5 after SC-05; integration/release owner |
| SC-07 Phase 3 definition, RFP, onboarding and go-live — S54–57 | Four direct SciSpace generators | Plans for biophilic/design freeze/sensory/POE/CX/materials/model governance; feature completeness unknown | D; V/A not verified | Resolve GAP IDs; map each intended capability to existing source before creating tasks; schedule only accepted business scope | R0 reconciliation; R5 expansion; product/data lead |
| SC-08 BAU Governance — S58 | Direct generator and closure-certificate template | Document generation, not independent programme closure | D; signatures/operational acceptance unverified | Prepare support owners, review cadence, incident and recovery evidence; issue closure only for the actually delivered scope | R4 for pilot; R5 for expanded programme; operations |
| SC-09 MCP, automation, LINE/LIFF and API reference | Package records: MCP implementation, automation spec, customer journey and 55-tool API reference | HTML code examples; existing workflow/LINE runtime is a separate source of evidence | D/C; deployed 55-tool coverage not established | Inventory documented vs implemented endpoints; reconcile identity/payloads; exercise pilot events with authorization, retry and delivery receipts | R1–R2; integration lead |
| SC-10 RAG, prompts, knowledge approval and agent evaluation | Package changelog records pgvector roadmap, prompt engineering, approval workflow and evaluation metrics | Specifications/examples; live retrieval/model evaluation not verified | D; V/A not verified | Preserve source/rights metadata; define approval before knowledge publication; evaluate retrieval/model outputs on a named dataset | R1 governance; R5 AI delivery; knowledge/AI owner |
| SC-11 Installation agent and PFMEA | Installation spec and PFMEA dashboard package records | HTML dashboard with embedded data and local status, plus existing product QC/field source | D/C; real incident/halt acceptance not verified | Resolve severity thresholds and checklist rules; bind defects/photos to project revision; test critical escalation and human release | R2–R4; field/QA lead |
| SC-12 Installation HTML field prototype | thai_installation_agent_fieldapp.html | Directly inspected simulateSync() and browser service-worker registration | C prototype; sync/offline acceptance not verified | Compare with existing MONOLITH field app; retain useful UX; prove actual API/offline/conflict recovery before claiming sync | R2 architecture choice, R4 acceptance; field lead |
| SC-13 FieldFlow native mobile and onboarding | Local SciSpace-authored pack generators; DOCX/PDF; related extracted Expo source | T1–T12 partial source, Drizzle schema and tests; see artifact audit | C partial; no fresh build/device/RLS acceptance | Select existing field app vs native investment; if native is selected, fix package/types, photo contract, storage isolation/recovery, magic-link callback, offline/search; complete device and integration tests | Decision R1–R2; selected delivery R4; mobile/backend leads |
| SC-14 Platform/client boundary, configs and Swift example | Platform spec, registry, client JSON and validator recorded in package | Config/validator source and showcase pages; changelog pass counts are historical | C; live multi-tenant/client deployment unverified | Reconcile with canonical MONOLITH tenant model; verify secrets remain server-side and isolation in runtime; keep Swift logistics as deferred example | R1 Daph/platform boundary; R5 other verticals; platform/security |
| SC-15 VS-01 Vision-to-BOQ | Pinned docs/specs VS-01 draft, HTML and checksum; package records | Detailed spec/prompts/schemas/ACs; matching live pipeline not established | D; AC-VS01-01–10 not independently passed | Resolve naming and canonical-value claims; benchmark current candidate models when implementing; enforce confidence/refusal/provenance/human review and all 10 ACs | R5 sandbox after R1; AI/design owner |
| SC-16 BOI executive summary | Local create_boi_summary.py author marker and DOCX output | Business document, not an application feature or BOI approval | D; business/legal/financial validation not performed | Reconcile product scope/cost/evidence with this roadmap; obtain current eligibility and financial review before external use | Business lane alongside R0/R2; business/finance owner |
| SC-17 Barausse knowledge and research | Local generators plus SCISPACE_REFERENCES in four extracted topic files | Thai notes and research tables; no canonical import established | D; supplier/engineering acceptance unverified | Verify source version, rights, units and supplier-native codes; review market data separately from technical facts before governed knowledge import | R1 knowledge review; R5 reusable catalog; knowledge/domain owner |
| SC-18 Barausse BOM, installation checklist and worksheet | Local SciSpace author markers and DOCX/HTML outputs | Project-specific documents for SECRET doors, including 1-bedroom/2-bath BOM | D; physical fit/install/cost acceptance unverified | Validate measurements, hardware compatibility, quantity and site procedure with domain owner; use in pilot only if selected project includes these doors | Conditional R2–R4; design/installation lead |

### Conflicts to close before dependent implementation

1. **ID collision:** SciSpace DOCX S17 is Agent KPI/SLA, while the manufacturing S17-1…5 gate is a separate namespace. They cannot close one another.
2. **AIE scope drift:** S51 describes AIE-003 rendering, AIE-004 QA and AIE-005 integration gateway; S52 acceptance describes material SKUs, mood boards and presentation rendering respectively. Freeze one versioned requirement map before procurement or tests.
3. **GAP scope drift:** S53 describes GAP-13 ethics, GAP-14 decommissioning and GAP-15 data-subject requests; S54 uses those IDs for CX, sustainable procurement and model governance. Record an explicit mapping or renumbering decision; retain both originals.
4. **Programme dates and closure:** the package includes future programme-year narratives and closure statements. Changelog generation, accepted Word edits and historical validator counts do not establish real signatures, deployment, customer count or achieved coverage.
5. **VS-01 naming:** the pinned spec heading still includes “S55”, although package notes say VS-01 avoids the procurement S55 collision. Normalize references and validate claimed canonical values against current governed contracts before implementation.
6. **Field acceptance rules:** package descriptions use different PFMEA severity/checklist thresholds. Choose approved domain-specific rules, not a silent union of conflicting defaults. HTML simulated sync must not count as backend acceptance.

### Changes to phase gates and immediate backlog

- **R0 now also requires:** SC-01/04 index, IDs/source hashes, a conflict register for items 1–5, and a disposition for every SC row. Existing historical CI observations retain their dated SHA; this revision does not claim a fresh CI run.
- **R1 now also requires:** selected agent/knowledge governance from SC-02/03/10, platform boundary checks from SC-14 and one field-app architecture decision covering SC-12/13 and the existing product field app.
- **R2 now also requires:** SC-09 pilot contract tests and SC-11 defect/handoff evidence; SC-18 only when Barausse belongs to the selected pilot.
- **R3 remains unchanged:** actual manufacturing authority gates still control real cutting. No SciSpace go-live or BAU document bypasses them.
- **R4 now also requires:** selected field implementation device/offline acceptance, incident/support drills and scope-specific SC-08 BAU ownership.
- **R5 now explicitly tracks:** SC-05/06/07/10/15 and optional multi-client expansion from SC-14. These are visible backlog, not a promise to build all of them.
- **Business/knowledge lane:** SC-16/17 can be reviewed alongside delivery; BOI approval and market-research completion are not automatic factory-pilot blockers.

Add to the first two-week window: inventory and resolve terminology conflicts; classify programme assertions; select the field path; select applicable Barausse pilot inputs; assign business review of BOI. Then produce a scoped implementation plan with file-level changes and tests. Do not execute all historical procurement/deployment steps merely because they appear in imported documents.

### Evidence links for this revision

- [SciSpace package changelog](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/changelog_v25.md)
- [Historical SOP × source mapping](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/sop_github_mapping.md)
- [S51](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s51.py) / [S52](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s52.py)
- [S53](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s53.py) / [S54](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s54.py) / [S58](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s58.py)
- [HTML field prototype](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/thai_installation_agent_fieldapp.html)
- [VS-01 spec](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/specs/vs01-vision-to-boq-vertical-slice-v1.th.md)
- [Local FieldFlow audit](../reports/2026-09-11-fieldflow-artifact-status.en.html)
- Local bundle: ../../agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/ — author evidence in create_fieldflow_pack.py, create_boi_summary.py, build_barausse_notes.py, build_barausse_bom.py, build_barausse_checklist.py and build_worksheet_p1.py.


## SciSpace package intake follow-up

The returned package has been reviewed with corrections. Its 13 CON records are mapped to SC/R phases in the [intake review](../reports/2026-09-11-scispace-reconciliation-intake.en.html). CON-013 is resolved as missing local handoff context. AIE/GAP canonical choices and blanket PFMEA threshold changes are not adopted; R0 semantic reconciliation and R1 domain-specific validation remain backlog.

## Sources

- [Pinned source](https://github.com/indetailsgroup-hue/monolith-workspace/tree/52e0eeb12527d4bb3866ee726b4f30d4d74dca57)
- [Full Verify evidence](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518)
- [Lint evidence](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559)
- [Real-cut restriction](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts)
- [Existing complete roadmap — historical planning baseline](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/prd/monolith-complete-roadmap-v1.en.md)

Documentation only. No product code, migrations, release settings, approvals or deployment changed.
