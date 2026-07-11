# MONOLITH Complete PRD

Document date: 2026-07-10  
Language edition: EN  
Document edition: 5.1 (Evidence-Control Revision)  
Product: MONOLITH Manufacturing OS / MONOLITH Operating System  
Scope: Canonical PRD merged from the detailed MONOLITH PRD v3, the reviewed PRD v4 program-execution additions, Coohom/front-door research, ERP research, SpatialLM discussion, manufacturing truth doctrine, and field-execution architecture.

## 1. Executive Summary

MONOLITH is not a generic interior design application and not a Coohom+DAPH integration. MONOLITH is a manufacturing-safe operating system for custom interior and built-in furniture businesses where a design must become a verified factory packet and a real installed job.

The product mission is:

> Make the first 10 minutes feel fast, visual, and confidence-building; make the last mile deterministic, gated, traceable, and field-verifiable.

The permanent center of gravity is **manufacturing truth + field execution**. Front-door AI, rendering, catalogs, SpatialLM, ERP, LINE, and customer approvals are valuable only when they strengthen the verified chain:

```text
Lead / brief / site evidence
  -> Concept Sandbox
  -> Spatial Evidence + Capture Spine
  -> Parametric Contract
  -> Safety Gate
  -> Released Spec
  -> Factory Packet / CNC Manifest
  -> Work Order / Field Execution
  -> Customer Acceptance / Audit / Job Cost
```

The governing doctrine is:

**Design is free. Manufacturing is deterministic. Field reality closes the loop.**

## 2. Strategic Positioning

| Product frame | Decision |
| --- | --- |
| What MONOLITH is | A design-to-factory-to-field operating system for custom built-in furniture and interior work |
| What MONOLITH is not | A generic room planner, a decorative render tool, a generic ERP, or a Coohom clone |
| What MONOLITH learns from Coohom | Fast entry, editable scene, catalog browsing, visual confidence, presentation polish |
| What MONOLITH must keep unique | Parametric Contract, Material Stack, Connector OS, Safety Gate, signed Factory Packet, LINE-native field proof, audit, Thai operating context |
| What SpatialLM is used for | Spatial Evidence Compiler: parse point clouds/video/RGB-D/LiDAR into candidate walls/openings/bounding boxes |
| What SpatialLM is not used for | It must not create CNC paths, mutate release state, or replace Safety Gate |
| What ERP ideas are used for | Business backbone patterns: document states, item master, BOM snapshot, WIP, job cost, stock, PO, ledger |
| What ERP must not do | ERP must not edit manufacturing geometry, drill maps, CNC, or release state directly |

## 3. Evidence Boundary

This PRD separates:

| Evidence class | Meaning |
| --- | --- |
| Existing system evidence | Current local MONOLITH PRD, codebase docs, migrations, API docs, Connector OS docs, Safety Gate docs, LINE architecture, Customer Journey, Requirements Overview |
| Research-backed benchmark | Coohom public pages/research, NIST AI RMF, ISO 9241-210, ISO 23247, Microsoft Human-AI guidelines, SpatialLM paper |
| Product requirement | Target behavior to build or formalize in MONOLITH |
| Roadmap item | Future implementation, not a current production claim |

No requirement in this PRD may be used to imply that a module is production-ready unless it is backed by code, tests, deployment evidence, and operational proof.

This edition removes non-resolvable generated citation markers and uses the Evidence Tier model, Source Register, Claim Ledger, and As-Built Status at the end of the document as its traceability system. If a requirement depends on external research, the implementing team must record the source ID and exact source link in the relevant epic or design spec before development starts.

## 4. Product Vision

MONOLITH should become the business operating spine for manufacturing-first interior/furniture work:

1. Capture messy human inputs from LINE, site surveys, photos, documents, measurements, and design briefs.
2. Turn inputs into structured evidence through Capture Spine and Spatial Evidence Compiler.
3. Let designers explore quickly in a Concept Sandbox.
4. Convert only verified intent into Parametric Contract objects.
5. Validate production readiness through Safety Gate.
6. Release deterministic factory packets with signatures, manifests, and offline verification.
7. Execute work in the factory and field through work orders, room/lane tasks, proofs, issues, and acceptance.
8. Feed actual cost, defects, rework, and field deviations back into management dashboards.

The ideal board-level promise:

> MONOLITH is for businesses that lose money when render, measurement, cutlist, purchase order, CNC file, installation proof, and customer approval drift apart.

## 5. Business Goals and Outcomes

### 5.1 Strategic Goals

| Goal | Decision meaning |
| --- | --- |
| Reduce design-to-factory mismatch | Fewer rework loops caused by visual design, cabinet structure, material stack, connector rules, cutlist, CNC, and factory packet drifting apart |
| Reduce field uncertainty | Site reality, installation issues, proof photos, room/lane status, and customer acceptance become governed evidence rather than chat noise |
| Improve approval integrity | Customer, designer lead, production, finance, and executive approvals bind to revision, scope, timestamp, channel, and accountable owner |
| Build an ERP-ready backbone without losing manufacturing truth | Item master, BOM snapshot, stock, PO, WIP, job cost, and ledger flows receive truth from Released Spec and cannot overwrite production geometry |
| Preserve speed at the front door | Intake, concept, visual confidence, catalog browsing, and approval packet creation are fast without creating unsafe production shortcuts |

### 5.2 Measurable Business Outcomes

| Outcome cluster | Metric examples | Initial owner | Measurement rule |
| --- | --- | --- | --- |
| Front-door speed | Time to first useful concept, intake-to-qualified-brief time, approval packet preparation time | Product + Sales Ops | Baseline during first 30-60 days, then set target by project type |
| Manufacturing quality | First-pass Safety Gate pass rate, factory packet rejection rate, CNC/post error rate, rework/scrap cost | Design Lead + Factory Lead | Measure by released package and machine profile version |
| Field execution | Room/lane completion accuracy, issue aging, punch-list age, close-house cycle time | Operations Lead | Measure by project, room, lane, and installation phase |
| Financial control | Job cost variance, committed-vs-actual variance, capture-to-post lag, WIP accuracy | Finance Owner | Measure from Released Spec snapshot through actual cost and ledger posting |
| Governance | Waiver count, escalation count, approval SLA, audit completeness | Executive Owner | Review weekly during pilot and monthly after stabilization |

## 6. Non-Goals

MONOLITH must explicitly avoid attractive work that weakens the operating spine:

- It is not a generic decorative room planner.
- It is not a Coohom clone or a dependency on Coohom.
- It is not a big-bang replacement for every ERP/accounting workflow on day one.
- It is not a public multi-tenant SaaS before the core truth chain, privacy model, and operational controls are proven.
- It is not an autonomous AI production-release system.
- It is not a SpatialLM-driven CNC generator.
- It is not a renderer that pretends visual confidence is manufacturing truth.

## 7. Assumptions and Constraints

### 7.1 Assumptions

- Teams will accept stricter workflows when the front door is faster and field work has lower friction.
- The first machine profile set is limited, versioned, and has a named owner.
- Released Spec is the starting point for BOM snapshot, work order, procurement, and job-cost traceability.
- Executives prefer phased rollout and coexistence over a big-bang rewrite.
- LINE/PWA surfaces remain important because customers and field teams should not need deep system training.

### 7.2 Constraints

- Sensitive data must stay inside a controlled boundary when required by PDPA, customer confidentiality, or operational policy.
- SpatialLM starts as sandbox/prototype evidence and cannot touch release, CNC, or accounting paths.
- Accounting posting must be co-designed with finance owners; product or AI cannot decide ledger policy alone.
- Any workflow that can affect production, payment, customer acceptance, or factory output must have authorization, audit, rollback or correction path, and owner.
- Offline or degraded-mode behavior is required for factory packet verification and field proof capture.

## 8. Core Problems

| Problem | MONOLITH answer |
| --- | --- |
| Beautiful designs can be unbuildable | Visual output cannot become production truth until converted and gated |
| Site measurements are messy | Site survey capture + Spatial Evidence Compiler + human verification |
| AI can hallucinate dimensions or geometry | AI is a parser/advisor, not a release authority |
| CNC files often lack traceability | Factory Packet, manifest, checksums, signed receipt, offline verify |
| Work handoff is fragmented | Canonical 8-step workflow with RACI, approvals, SLA, escalation |
| Field proof lives in chat | LINE group evidence is captured, classified, verified, linked to Work_Item |
| ERP data can drift from production data | ERP Backbone receives snapshots from Released Spec, never free-edits manufacturing truth |
| Customer approvals can be ambiguous | Approval Packet binds scope, render, revision, timestamp, identity, and channel |
| Thai privacy/accounting context is special | PDPA-by-architecture, self-host OCR/LLM, Thai VAT/WHT/eTax direction, LINE-native UX |

## 9. Guiding Principles

1. **Manufacturing Truth Wins**: production output comes from Parametric Contract, Safety Gate, Released Spec, Factory Packet, OperationGraph, and manifest.
2. **Visual Is Not Truth**: renders and concept scenes are communication artifacts until converted.
3. **Spatial AI Is Evidence, Not Authority**: SpatialLM may parse the world; it must not decide release.
4. **Human Verification Is Mandatory**: capture, spatial interpretation, accounting, approval, and release all require accountable humans at critical gates.
5. **No Silent Drift**: every change after approval creates revision, reason, and audit.
6. **Gate Failure Is Product Value**: the system should explain why it blocks and how to fix safely.
7. **LINE Is the Human Surface**: customers, field teams, and approvals should work through familiar channels with strict back-end controls.
8. **ERP Is a Business Layer**: ERP backbone manages job cost, WIP, stock, PO, invoices, and ledger; it does not own CNC truth.
9. **PDPA by Architecture**: sensitive data stays controlled, redacted, and purpose-bound.
10. **Append-Only Audit**: approvals, capture decisions, release events, packet signatures, and field proof must be immutable.

## 10. Personas and Operating Roles

| Persona | Core job | Main surfaces |
| --- | --- | --- |
| Executive Owner | Decide high-risk approvals, budget exceptions, roadmap, operational KPIs | Executive dashboard, escalation feed |
| Sales / Engagement | Capture lead, qualify customer, create requirement record | LINE OA, PWA, CRM-lite intake |
| Surveyor | Capture site reality: dimensions, openings, MEP, photos, constraints | Mobile/PWA, Spatial Survey, Capture Spine |
| Designer | Create concept, convert to parametric design, resolve gate blockers | Designer Workspace, Concept Sandbox, Truth HUD |
| Designer Lead | Approve design gate, freeze/release spec, handle critical revisions | Gate panel, Approval Packet, release controls |
| 3D Visualizer | Prepare presentation render/deck while preserving revision truth | Render deck, client view |
| Production Planner | Convert Released Spec to BOM, routing, schedule, work order | ERP Backbone, Factory Packet viewer |
| Factory Operator | Execute packet, verify files, operate CNC/post outputs | Factory UI, offline receipt verifier |
| QA | Validate output, capture defects/rework, link NCR to packet/spec | QC capture, NCR dashboard |
| Installation Team Lead | Start T0, coordinate rooms/lanes, close house, request customer acceptance | LINE group, Installation PWA |
| Installation Crew | Execute tasks, upload proof, report issues with minimal friction | LINE group, mobile checklist |
| Accountant / Purchasing | Verify documents, post ledger, manage VAT/WHT, PO, stock, job cost | Accounting module, Capture Spine |
| Finance Policy Owner | Own VAT/WHT/eTax, posting thresholds, approval limits, and accounting coexistence rules | Finance policy console, ERP Backbone, escalation queue |
| Data Steward | Own item master, certified catalog, mapping integrity, data naming, and trust-tier hygiene | Catalog admin, object registry, audit dashboard |
| Customer | Approve design and installation without system training | LINE Flex, web fallback, curated client view |
| AI Agent / MCP Client | Read, summarize, propose, route, and prepare actions under governance | MCP tools, pending invocation queue |

## 11. End-to-End Customer Journey

The canonical journey is:

```text
Ad / website
  -> Add LINE OA
  -> Sales conversation
  -> Customer requirement capture
  -> Sale
  -> Area Measurement
  -> Designer / G1
  -> 3D Presentation / G2
  -> Production Planning / G4
  -> 3D Final / G3
  -> Factory
  -> Installation
  -> Customer acceptance
  -> Closeout / warranty / analytics
```

### Customer-Facing Requirements

- The customer should not need a MONOLITH account for approvals.
- The customer receives curated updates, not internal operational noise.
- The customer approves through LINE Flex or a short-lived web fallback link.
- Customer approval binds revision, scope, timestamp, and channel.
- Customer-requested changes after a lock create revision/requote workflow.

### Internal Requirements

- Every step has RACI, owner, approver, SLA, status, and audit.
- Steps cannot be skipped without allowed transition and audit reason.
- G1/G2/G3/G4 locks prevent silent mutation of already approved scope.
- RPN/budget/critical risk escalates to executive owner.
- Quiet hours and digest reduce notification noise.

## 12. Product Architecture

```text
MONOLITH Front Door
  Intake Router · Concept Sandbox · Render Deck · Approval Packet

Spatial Evidence + Capture Layer
  SpatialLM sandbox · site survey · OCR · verify · evidence graph

Designer Workspace
  3D viewport · Designer Intent · Parametric Contract · Truth HUD

Truth Layer
  Material Stack · Connector OS · Drill Map · Safety Gate · Released Spec

Manufacturing Layer
  Factory Packet · OperationGraph · DXF/G-code/MPR/CIX/XXL · signed receipt

ERP Backbone
  Item master · BOM snapshot · routing · work order · stock · PO · job cost · ledger

Field Layer
  Installation project · rooms · lanes · LINE groups · T0 · proof · issue · acceptance

Governance Layer
  IAM · RLS · MCP · audit · PDPA · approvals · D2 autonomy ladder
```

## 13. Core Module Outcomes

| Module group | Outcome |
| --- | --- |
| Intake Router / Concept Sandbox | Start work quickly without pretending early visual exploration is production truth |
| Spatial Evidence / Capture Spine | Convert messy site and document evidence into verifiable records with provenance |
| Designer Workspace / Parametric Contract | Turn design intent into candidate manufacturing truth that can be checked |
| Material Stack / Connector OS / Safety Gate | Convert design into deterministic manufacturing decisions and explain blockers |
| Released Spec / Factory Packet / Export | Produce signed, repeatable, offline-verifiable factory packets |
| ERP Backbone | Convert released demand into business control: BOM snapshot, routing, WIP, procurement, stock, job cost, and ledger |
| Field Layer | Close the loop with installed reality, issue proof, punch list, customer acceptance, and field variance |
| Governance / MCP | Let automation help without losing authorization, audit, data minimization, or human accountability |

## 14. Functional Requirements

### FR-01 Front Door Intake Router

**Priority:** P0  
**Purpose:** Convert all first-touch inputs into the correct governed lane.

Inputs:

- Prompt or design brief
- Floor plan image/PDF/DWG/DXF where supported
- Room/site photo
- Walkthrough video or RGB-D/LiDAR scan
- LINE message or customer requirement
- Existing project/job
- Manual template/module start

The router must classify input into:

| Mode | Meaning | Allowed next step |
| --- | --- | --- |
| Concept | mood, layout, visual idea | Concept Sandbox |
| Site Evidence | measurement, photo, scan, site condition | Spatial Evidence + human verification |
| Production Intent | cabinet/module/material/hardware request | Parametric Contract candidate |
| Business Evidence | quote, receipt, PO, issue, approval | Capture Spine document workflow |

Acceptance criteria:

- No intake creates production data directly.
- Every intake has source, user, timestamp, confidence/provenance where applicable.
- Low-confidence or ambiguous intake requires human review.

### FR-02 Concept Sandbox

**Priority:** P0  
**Purpose:** Give Coohom-like first-start speed without corrupting manufacturing truth.

Capabilities:

- AI-assisted layout/styling alternatives
- Mood/material exploration
- Drag/drop modules and decorative assets
- Editable scene graph
- Render preview and client presentation draft
- "Convert to production candidate" workflow

Constraints:

- Sandbox cannot create BOM, PO, cutlist, CNC, Factory Packet, or release state.
- Sandbox data is marked non-manufacturing truth.
- Every conversion produces a diff and unknowns list.

### FR-03 Spatial Evidence Compiler

**Priority:** P0 for sandbox prototype, P1 for production workflow  
**Purpose:** Use SpatialLM-like technology to read spatial reality, not to judge manufacturing.

Input candidates:

- Point cloud
- RGB-D/LiDAR scan
- Mobile walkthrough video processed into point cloud
- Existing concept scene converted to geometry for checking

Output candidates:

- Walls, doors, windows
- 3D oriented bounding boxes
- Object category and orientation
- Room boundary / opening constraints
- Clearance and collision hints

Governance:

- Spatial output is candidate evidence only.
- Human verification is required before commit to SiteSurveyZone or Parametric Contract.
- No direct path to CNC, drill map, Factory Packet, RELEASED state, or accounting posting.
- The module must log source, model version, confidence, verifier, and final accepted values.

Phase 1 acceptance:

- Process 1-2 pilot rooms.
- Generate walls/openings/large-object bounding boxes.
- Provide overlay review UI.
- Commit only verified site constraints.
- Measure survey/recode time and spatial-error detection.

### FR-04 Capture Spine

**Priority:** P0  
**Purpose:** Convert messy evidence into structured, verified, auditable records.

Capture types include:

- customer_requirement
- site_survey
- spec_draft
- installation_proof
- qc_capture
- expense_document
- material_receipt
- field_purchase_request

Rules:

- proposed -> approved/rejected -> emitted -> superseded lifecycle
- No guessed placeholder values.
- OCR/AI output is draft until human verified.
- Fraud flags warn; they do not silently reject unless policy says so.
- Commit adapters write only to allowed targets.

### FR-05 Designer Workspace

**Priority:** P0  
**Purpose:** Provide the main production-aware design surface.

Required surfaces:

- Left: Designer Intent panel
- Center: 2D/3D viewport with view modes
- Right: Parametric Contract panel
- Truth HUD visible in design context

Required capabilities:

- Parametric cabinet/module modeling
- Material stack selection
- Hardware selection and preview
- X-Ray drill map view
- measurement and snap tools
- project save/version lineage
- gate status visible during design

### FR-06 Parametric Contract

**Priority:** P0  
**Purpose:** Become the candidate manufacturing truth.

Must define:

- cabinet/module identity
- dimensions and tolerances
- panel roles and quantities
- material stack and edge banding
- hardware/connector rules
- site constraints
- revision state
- linked concept/evidence sources

Rules:

- Contract mutation after approval requires revision reason.
- Contract cannot be generated from concept without conversion workflow.
- Contract cannot release without Safety Gate.

### FR-07 Catalog Trust Tiers

**Priority:** P0  
**Purpose:** Allow fast browsing without contaminating production.

| Tier | Example | Use |
| --- | --- | --- |
| Decorative | sofa, lamp, vase | render/presentation only |
| Spec-bound | finish, paint, fixture SKU | proposal/spec, no CNC |
| Production-bound | board, edge band, hinge, rail | BOM/cost/gate candidate |
| Certified | verified material/hardware/machine profile | Factory Packet/CNC eligible |

Acceptance:

- Decorative assets cannot be converted to production items without explicit mapping.
- Certified assets carry version, supplier, spec, and approval owner.

### FR-08 Material Stack + Connector OS

**Priority:** P0  
**Purpose:** Compile furniture hardware into deterministic manufacturing instructions.

Requirements:

- Separate finished visual envelope from production core drilling.
- Support core vs surface vs glue vs edge banding thickness.
- Support DRILL_ON_CORE and DRILL_ON_FINISHED modes.
- Compile hardware specs through Selection -> Placer -> Synthesis -> Emission.
- Emit OperationGraph metadata for pair, role, frame, connector, feature.
- Enforce System 32 and Connector OS rules through Gate.

### FR-09 Safety Gate and Release State

**Priority:** P0  
**Purpose:** Be the manufacturing authority.

Release states:

```text
DRAFT -> FROZEN -> GATED -> RELEASED -> EXPORTED
```

Gate must validate:

- geometry
- panel dimensions
- connector pair integrity
- coaxial/axis alignment
- arrow orientation
- clearance
- material stack consistency
- packet validity
- machine/post compatibility

Rules:

- BLOCKER prevents release/export.
- WARNING may be waived only with role, reason, and audit.
- Auto-fix patches must be deterministic.
- Export from non-released state is prohibited except explicitly allowed simulation outputs.

### FR-10 Approval Packet

**Priority:** P0  
**Purpose:** Make approvals legally and operationally clear.

Approval packet includes:

- render/image set
- scope summary
- room/lane/module list
- material/hardware summary
- exclusions and assumptions
- revision ID
- gate status
- price/variation status if available
- approver identity, timestamp, channel

Gate locks:

- G1 concept/mood
- G2 layout/presentation
- G3 final materials/render
- G4 production planning/release

### FR-11 Factory Packet and Multi-Machine Export

**Priority:** P0  
**Purpose:** Turn released designs into verifiable manufacturing packages.

Required outputs:

- Factory Packet ZIP
- drillMap.json
- connectors.json
- cutList.json
- gateResult.json
- OperationGraph
- CNC/DXF files
- manifest with checksums
- signed receipt

Machine outputs:

- DXF R12
- Generic/FANUC-style G-code fallback
- MPR for Homag/Weeke
- CIX for Biesse
- XXL for SCM/Morbidelli
- future formats behind post-processor profiles

Acceptance:

- Output is deterministic for same released input.
- Packet can be verified offline.
- Manifest or signature mismatch blocks trust.

### FR-12 ERP Backbone

**Priority:** P0/P1  
**Purpose:** Manage business operations around manufacturing truth.

Core objects:

- Party
- Project/Job
- Item Master
- BOM Snapshot
- Routing/Operation
- Work Order / Job Card
- Stock Move / Reservation
- Purchase Request / PO / Receipt
- Quality Inspection / NCR
- Invoice / Payment / Journal Entry
- Approval / Audit Event

Rules:

- BOM Snapshot comes from Released Spec.
- Material demand comes only from Released Spec or approved change.
- ERP cannot directly edit geometry, drill maps, CNC, or release state.
- Job cost links estimate, planned cost, committed cost, actual cost, rework, and WIP.

### FR-13 LINE-Native Engagement

**Priority:** P0  
**Purpose:** Make the human workflow easy while keeping back-end governance strict.

Requirements:

- HMAC verification for webhook.
- Idempotency for all inbound events.
- Pre-approved outbound templates only; no free-text LLM.
- Customer is not a DB principal.
- Staff identity binding is deterministic.
- LINE group membership is not authorization.
- Customer group receives curated approved updates only.
- Internal proof is never auto-forwarded to customer group.

### FR-14 Field Execution and Installation

**Priority:** P0/P1  
**Purpose:** Close the loop from Released Spec to installed reality.

Requirements:

- Installation project maps to house -> rooms -> lanes.
- T0 readiness checklist before start.
- Work items per room/lane/person.
- Photo proof and issue capture through LINE/PWA.
- Punch list and NCR support.
- Close-house action only by authorized Installation Team Lead.
- Customer acceptance through LINE Flex or web fallback.
- Field evidence links to Released Spec and Factory Packet.

### FR-15 Accounting, Procurement, and Job Costing

**Priority:** P1  
**Purpose:** Make financial truth follow production truth.

Requirements:

- Double-entry ledger.
- Multi-book support.
- VAT/WHT logic for Thai context.
- PO/receipt/stock/issue flow.
- Actual purchase price and moving average.
- Job cost by project/package.
- WIP and billing milestone visibility.
- Capture Spine integration for expense/material documents.

### FR-16 MCP and AI Copilot

**Priority:** P0/P1  
**Purpose:** Allow AI to assist without bypassing governance.

Requirements:

- Tool catalog by role and site.
- Read tools may execute under policy.
- Write/Approval tools create Pending Invocation.
- Human approval required for risky actions.
- Data minimization and PII redaction at MCP boundary.
- All invocations are audited.
- Untrusted content is treated as data, not command.

### FR-17 Executive Dashboard and Analytics

**Priority:** P1  
**Purpose:** Make the system governable by management.

Dashboard categories:

- sales conversion
- design approval SLA
- gate pass/fail rate
- concept-to-contract conversion
- survey-to-verified-record lag
- factory packet rejection
- CNC/post errors
- material variance
- rework/scrap
- field issue rate
- punch-list age
- job cost variance
- WIP/cash forecast

## 15. Cross-Feature Governance Rules

### 15.1 Provenance Required

Every object created by automation, AI, OCR, SpatialLM, import, customer channel, or external system must carry at least source, timestamp, processor/model version where applicable, verifier status, and final accountable owner before it can become committed truth.

### 15.2 Escalation by Risk

Every gate, approval, waiver, posting, export, or closeout action above a configured risk threshold must route to a higher-authority role. High-risk actions must not default to auto-pass.

### 15.3 Reconciliation Loop

Field variance, NCR, rework, scrap, supplier variance, and accounting variance must feed back into rule improvement, catalog certification, gate policy, machine profile governance, and executive dashboards. Incidents cannot end as isolated chat messages.

### 15.4 No Silent Authority Transfer

No module may acquire authority over another module's source of truth by integration side effect. Front Door cannot release production truth; ERP cannot change geometry or CNC; Field proof cannot mutate Released Spec backward; AI/MCP write actions must enter Pending Invocation and human gate.

## 16. Non-Functional Requirements

| Requirement | Target |
| --- | --- |
| Determinism | Same released input produces same packet/hash/output |
| Traceability | Every output links back to source evidence, revision, gate, user, timestamp |
| Security | RLS, least privilege, secret isolation, signed artifacts |
| Privacy | PDPA-by-architecture, redaction, data minimization, controlled egress |
| Reliability | Idempotent webhooks, retries, offline field queues, offline packet verification |
| Usability | Front stage simple; back stage absorbs complexity |
| Mobile field use | One-hand flows, minimal fields, LINE/PWA first |
| Auditability | Append-only audit for approvals, capture, release, export, field proof |
| Extensibility | New capture types, machine profiles, catalog items, document types by config where possible |
| Governance | Fail-safe; missing policy blocks, not passes |

## 17. System Invariants

1. A render cannot release production.
2. A concept scene cannot generate CNC directly.
3. SpatialLM output cannot bypass human verification.
4. ERP cannot edit drill maps or CNC.
5. Customer approval cannot silently change scope.
6. Released Spec cannot mutate without revision workflow.
7. Factory export requires release state and gate proof.
8. Field completion requires evidence and authorized close.
9. AI write actions require human gate.
10. Sensitive evidence cannot leave the controlled boundary without policy.

## 18. Data Model Summary

| Domain | Key entities |
| --- | --- |
| Front Door | Intake, ConceptGraph, RenderDeck, ApprovalPacket |
| Spatial Evidence | SpatialCapture, SceneCodeCandidate, SiteSurveyZone, VerificationOverlay |
| Capture | CaptureArtifact, CaptureTypeConfig, VerifyDecision, CommitAdapter |
| Design | Project, Cabinet, Panel, MaterialStack, HardwareSpec, ParametricContract |
| Truth | DrillMap, GateResult, ReleasedSpec, Revision, Waiver |
| Manufacturing | FactoryPacket, OperationGraph, ToolpathManifest, ExportReceipt |
| ERP | Item, BOMSnapshot, Routing, WorkOrder, StockMove, PO, Receipt, LedgerEntry |
| Field | InstallationProject, Room, Lane, WorkItem, ProofPhoto, Issue, PunchList, Acceptance |
| Governance | Principal, Role, SiteAccess, Approval, AuditEvent, PendingInvocation |
| Program Execution | ReleasePolicy, MetricDefinition, PilotCohort, MigrationMapping, ExceptionWaiverReasonCatalog |

## 19. RACI and Governance Matrix

| Workstream | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Front Door intake and concept | Product + Sales Ops | Product Owner | Designer Lead, Sales Lead | Executive Owner |
| Spatial evidence pilot | Survey Lead + Product | Operations Lead | Designer Lead, Privacy Owner | Executive Owner |
| Parametric Contract and Safety Gate | Engineering + Designer Lead | Manufacturing Truth Owner | Factory Lead, QA | Product Owner |
| Factory Packet and export | Engineering + Factory Lead | Factory Lead | Machine Profile Owner, QA | Executive Owner |
| ERP Backbone and job cost | Finance + Engineering | Finance Policy Owner | Production Planner, Accountant | Executive Owner |
| Field digital thread | Operations + Field Lead | Operations Lead | Customer Success, QA | Executive Owner |
| MCP/AI write actions | Engineering + Governance | Security/Governance Owner | Product Owner, Data Steward | Executive Owner |
| Certified catalog and item master | Data Steward | Manufacturing Truth Owner | Finance, Purchasing, Design | Product Owner |

## 20. Release Strategy and Pilot Plan

### 20.1 Rollout Philosophy

- Do not use a big-bang rewrite.
- Start with modules that strengthen governance without interrupting production continuity.
- Use coexistence and shadow mode where accounting, field operations, or factory output could be disrupted.
- Keep front-door speed and production authority separate.
- Treat pilot evidence as the basis for target setting, not as proof of broad production readiness.

### 20.2 Suggested Release Order

1. Truth chain stabilization.
2. Front Door + Approval Packet.
3. Capture Spine hardening.
4. Spatial Evidence sandbox for 1-2 rooms with no CNC/release/accounting path.
5. Factory Packet and export integrity improvements.
6. ERP Backbone object registry + BOM snapshot + job cost shadow mode.
7. Field digital thread.
8. Board dashboard intelligence.

### 20.3 Pilot Strategy

| Pilot | Scope | Exit evidence |
| --- | --- | --- |
| Controlled factory pilot | Small project with known factory path and limited machine profile | Deterministic packet, gate proof, signed receipt, packet rejection data |
| Spatial evidence pilot | 1-2 rooms only, no CNC/release path | Verified SiteSurveyZone candidates, human correction log, survey time baseline |
| Accounting shadow pilot | Released Spec to BOM snapshot to job cost without real posting first | Variance map, finance sign-off, posting rule gaps |
| Field pilot | Moderate installation complexity with room/lane work | Proof completeness, issue aging, close-house acceptance audit |

## 21. Migration and Coexistence Strategy

### 21.1 Data Migration Principles

- Migrated data must preserve identity, revision lineage, provenance, and source confidence.
- Legacy records with incomplete evidence must be marked as lower-confidence legacy data rather than normalized into false certainty.
- Old factory packets must not be regenerated unless evidence parity and release lineage are proven.
- Migration scripts must produce audit reports, reject counts, and owner review queues.

### 21.2 Coexistence Rules

- Existing designs may remain readable, but new releases must follow the rules of the deployed modules.
- Accounting uses shadow mode before real posting.
- Field teams can run LINE/PWA in parallel with existing process until proof completion and closeout are stable.
- SpatialLM begins as an assistive evidence layer and does not replace manual survey.

## 22. Dependencies

### 22.1 Internal Dependencies

- Canonical PRD, blueprint, Safety Gate documents, Connector OS documents, and release/export contracts.
- Machine profile ownership and versioning.
- Finance policy owner for VAT/WHT/eTax, posting thresholds, and approval limits.
- Operations owner for room/lane, T0, close-house, and acceptance behavior.
- Data steward for certified catalog, item master, naming, mapping, and trust-tier hygiene.

### 22.2 External Dependencies

- LINE platform stability and policy boundary.
- OCR/LLM/self-host infrastructure boundary.
- SpatialLM model/runtime feasibility for sandbox use only.
- ERP patterns from Odoo, ERPNext/Frappe, Acumatica, and Infor as architectural references, not runtime dependencies.
- Local legal/accounting review for approval language, PDPA handling, VAT/WHT/eTax, and document retention.

## 23. Risk Register

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Team treats concept as truth | High | Medium | Clear badges/states, mandatory conversion workflow, no export from sandbox |
| Safety Gate is bypassed as friction | High | Medium | Strong gate reason UX, formal waiver policy, audit visibility, executive exception dashboard |
| Accounting scope grows too large | High | High | Shadow mode, phased rollout, finance co-design, restricted posting surface |
| SpatialLM is overpromised | Medium | High | Sandbox only, no release path, measured pilot, explicit executive policy |
| Field adoption is low | High | Medium | LINE/PWA-first flows, minimal required input, operations champion, digest controls |
| Catalog mapping becomes unreliable | Medium | Medium | Trust tiers, certified catalog owner, mapping review, data stewardship |
| Machine profile drift | High | Medium | Versioned machine profiles, signed packet verification, export receipt checks |
| Notification noise causes abandonment | Medium | Medium | Quiet hours, role-based routing, digest, escalation thresholds |
| Governance slows the front door | High | Medium | Keep speed in concept/intake; enforce strictness only on release, accounting, and closeout paths |

## 24. Program-Level Acceptance Criteria

### 24.1 Front Door Ready

- Customers and internal teams can start a job without learning the full system.
- A useful concept can be created quickly.
- Approval Packet is readable and binds scope, revision, timestamp, identity, and channel.
- No shortcut exists from front door to Released Spec without conversion and gate.

### 24.2 Truth Layer Ready

- Parametric Contract, Material Stack, Connector OS, and Safety Gate can explain blockers.
- Released Spec is immutable except through revision workflow.
- Factory Packet can be verified offline and traced back to release evidence.

### 24.3 ERP Backbone Ready

- BOM Snapshot is created from Released Spec.
- Stock move, PO, receipt, actual cost, and ledger candidate trace back to project/package.
- Accounting post cannot be created from unverified AI/capture output.

### 24.4 Field Ready

- Room/lane work items are usable on mobile.
- Proof, issue, punch list, and acceptance link back to released truth.
- Close-house and customer acceptance require authorization and audit.

## 25. Definition of Done and Module Readiness

### 25.1 Feature Definition of Done

A feature is Done only when:

- Requirement, UX flow, edge cases, and prohibited actions are reviewed.
- Permissions, RLS where applicable, and audit events are specified.
- System invariants are encoded or guarded by verifiable controls.
- Required analytics events and dashboards are defined.
- Error states, retry behavior, offline behavior, and fallback ownership are specified.
- Documentation and runbook are updated.
- Pilot evidence proves the workflow on at least one real or representative path when the feature affects production, field, finance, or approval.

### 25.2 Module Readiness Checklist

Every module must answer:

- Who is the owner?
- What is the source of truth?
- What actions are prohibited?
- What is the rollback or correction path?
- What happens if the service is down?
- Where is the audit trail created?
- Which thresholds/escalations are configuration, and which are hardcoded?
- Which outputs require signatures or verification?

## 26. SpatialLM Policy

- SpatialLM is used to read spatial evidence, not to replace engineering judgment.
- Output is candidate evidence until verified by an accountable human.
- The first phase is survey acceleration and constraint visibility only.
- SpatialLM must not write CNC, change release state, assert final manufacturability, or post accounting events.
- SpatialLM evidence may enrich SiteSurveyZone only after verification and provenance capture.

## 27. ERP Policy

- Odoo is a reference for flow mapping, shop-floor patterns, and field-service patterns.
- ERPNext/Frappe is a reference for document state, object registry, permissions, naming series, and workflow.
- Acumatica is a benchmark for project accounting, job cost, WIP, and field-office visibility.
- Infor is a north-star benchmark for PLM/MES/WMS/CPQ integration and BOM lifecycle thinking.
- MONOLITH ERP Backbone is a business operating layer around manufacturing truth, not the owner of geometry, drill maps, CNC, release state, or factory packet truth.

## 28. Roadmap

### Phase 0: Stabilize Existing Truth Chain

- Keep existing CAD/CAM/Factory Packet/Safety Gate as the non-negotiable core.
- Verify code/test status before any external production claim.
- Preserve current PRD/blueprint as implementation evidence.

### Phase 1: MONOLITH Front Door Program

- Intake Router.
- Concept Sandbox.
- Approval Packet.
- Catalog trust tiers.
- Gate Reason UX.
- Render deck tied to revision and approval.

### Phase 2: Spatial Evidence Sandbox

- SpatialLM-based prototype for 1-2 rooms.
- Point-cloud/video/LiDAR input.
- Walls/openings/bounding boxes output.
- Overlay human verification.
- Commit only verified constraints to SiteSurveyZone.
- No path to CNC/release in year one.

### Phase 3: Conversion Engine

- Concept-to-Parametric Contract diff.
- Material/hardware mapping.
- Preliminary gate.
- Unknowns and blockers list.
- Production-safe patch suggestions.

### Phase 4: ERP Backbone

- Document object registry.
- Item Master and production-bound catalog.
- BOM Snapshot from Released Spec.
- Work Order / Job Card.
- Stock reservation/issue/return/scrap.
- Job cost, WIP, procurement, PO, invoice milestones.

### Phase 5: Field Digital Thread

- Installation PWA polish.
- House/room/lane tasks.
- LINE groups with hard guardrails.
- T0, proof, issue, punch list, close-house, customer acceptance.
- Field-to-design feedback through deviation analytics.

### Phase 6: Board Intelligence

- Executive dashboards.
- Gate/rework/field/cost analytics.
- Supplier and factory throughput analytics.
- Closed-loop improvement of design standards and Safety Gate rules.

## 29. Success Metrics

| Metric | Why |
| --- | --- |
| Time to first useful concept | Front-door speed |
| Survey-to-verified SiteSurveyZone time | Spatial evidence ROI |
| Concept-to-contract conversion rate | Sandbox usefulness |
| First-pass Safety Gate pass rate | Production readiness |
| Gate-fix cycle time | Designer productivity |
| Render approval to Released Spec drift | Approval integrity |
| Factory packet rejection rate | Manufacturing quality |
| CNC/post error rate | Machine readiness |
| Defect/rework cost | Business impact |
| Field issue rate | Site execution quality |
| Punch-list age | Closeout discipline |
| Job cost variance | Financial control |
| Capture-to-post lag | Back-office efficiency |
| Approval SLA | Workflow health |

Targets should be set after 30-60 days of baseline data, not invented upfront.

Metric definitions must include owner, source system/table, cadence, baseline period, target policy, and escalation threshold before the metric becomes a board KPI.

## 30. Open Questions

1. Which pilot room/project will be used for Spatial Evidence Phase 1?
2. Which scan source is preferred first: iPhone LiDAR, Android RGB-D, or normal video reconstructed to point cloud?
3. Which assets qualify as Certified production-bound catalog items in v1?
4. Which machine profile is the first production pilot target?
5. Which ERP Backbone object should be implemented first: Item Master, BOM Snapshot, Work Order, or Job Cost?
6. What approval language should be legally reviewed for G1/G2/G3/G4 packets?
7. What is the deployment boundary for self-host OCR/LLM and SpatialLM processing?
8. Which dashboards are board-critical for the first month?
9. What initial waiver thresholds are allowed for warnings, blockers, budget variance, and schedule variance?
10. Which roles can waive warnings without executive escalation?
11. What is the seed set for production-bound certified catalog items?
12. Which 90-day rollout sequence is safest for the first live business unit?

## 31. Evidence Tier and Usage Policy

The Evidence Tier model answers two separate questions: “How authoritative is this source for this type of claim?” and “Can this claim prove MONOLITH production status?” A high-tier source does not prove every kind of claim. For example, an E1 paper may prove research feasibility, but it cannot prove that a MONOLITH module has been deployed.

### 31.1 Evidence Tier

| Tier | Evidence type | May support | Must not be over-interpreted as |
| --- | --- | --- | --- |
| **E0 — Direct As-Built Evidence** | Source code, schema/migration, automated test, build artifact, signed packet, deployment or operational record tied to a revision | Implementation status within the inspected environment and revision | Production-ready when deployment, live integration, or operational proof is still missing |
| **E1 — Primary / Authoritative** | Approved canonical decision, official standard/regulator/API contract, peer-reviewed paper | A requirement, policy, protocol, or research capability directly stated by the source | Proof that MONOLITH has implemented the capability |
| **E2 — First-Party Vendor Claim** | Vendor product page, help center, official blog, official demo | A vendor-declared capability used as a benchmark | Independent test results, SLA, API compatibility, or fit with DAPH machinery |
| **E3 — Secondary Synthesis** | Research report, trade media, market analysis, review, comparison document | Context, discovery, candidate requirements, and due-diligence questions | Sole acceptance evidence or a production decision |
| **E4 — Inference / Recommendation** | Architectural inference, hypothesis, target, recommendation | Product direction and experiments that still require validation | Fact, current capability, or committed KPI |

### 31.2 Usage Rules

- An **implemented** claim requires E0 that points to the relevant code/schema and tests.
- A **production-ready** claim requires E0 across code + tests + deployment + operational proof, with no open blocker affecting that capability.
- An external research decision requires E1 or E2 with an exact URL/version and an explicit label of primary evidence or vendor claim.
- E3/E4 may create hypotheses, roadmap items, or acceptance tests, but cannot pass those tests on their own.
- Claims affecting CNC, release, accounting posting, IAM, PDPA, or customer acceptance require an accountable owner and verification date.
- When a source changes, a URL disappears, a hash no longer matches, or the code revision changes, related claims automatically return to `REVERIFY`.

### 31.3 Freshness and Re-verification

The source owner must review production-impacting claims at least once per release candidate. Vendor/web sources must be rechecked before procurement, contract signing, or a public claim. PDF/Markdown files currently located in `Downloads` are hashed provenance pointers, but they are not a durable evidence store until archived in a controlled repository or evidence archive.

## 32. Source Register

### 32.1 Internal MONOLITH Sources

| Source ID | Tier | Artifact / Revision | SHA-256 or identity | Permitted use |
| --- | --- | --- | --- | --- |
| `SRC-I01` | E1 | `docs/prd/monolith-complete-prd.th.md` / `.en.md` | TH `E363271C...7546C6D`; EN `299BA724...BF59F0` | Pre-v5 requirement baseline |
| `SRC-I02` | E3 | `C:\Users\thai3\Downloads\monolith-complete-prd-v4.th.md` | `70AEBC56...D8DD44D` | Program-execution additions; not a standalone full PRD |
| `SRC-I03` | E3 | `docs/research/coohom-vs-monolith-comparison.th.md` / `.en.md` | TH `2EEA72F3...E4B08`; EN `6BC1D2F6...18906B` | Strategic comparison and evidence caveats |
| `SRC-I04` | E3/E4 | `docs/research/monolith-front-door-doctrine.th.md` / `.en.md` | TH `9EB37FF8...A9FDD`; EN `47B5EB1D...FE0379` | Front-door doctrine, product inference, and recommendations |
| `SRC-I05` | E3/E4 | `docs/research/erp-deep-research-for-monolith.th.md` / `.en.md` | TH `2762AD44...2BE60`; EN `3D136404...99806` | ERP pattern benchmark; not a runtime dependency |
| `SRC-I06` | E0 | Local code snapshot `determined-williams/` | Git `d7b1c879b1e0397699603bd2615f6fe271fa8c9c`, branch `fix/drillmap-bolt-and-brun-dowels`, dirty worktree | As-built code inspection for this snapshot only |
| `SRC-I07` | E0 | Read-only audit session 2026-07-10 | Root tests/build/typecheck/smoke + targeted code inspection; summary in §34 | As-built status; rerun when revision or environment changes |
| `SRC-I08` | E0 | `docs/prd/monolith-complete-prd-v5.sha256` | SHA-256 values for v5.1 TH/EN Markdown and HTML | Integrity check for this deliverable set |

Core implementation evidence includes `determined-williams/docs/PRD.md`, `MASTER_BLUEPRINT.md`, `REQUIREMENTS-OVERVIEW.md`, `docs/SAFETY_GATE.md`, `docs/api/FACTORY_EXPORT_API.md`, `docs/connector-os/`, `docs/LINE-Architecture-System-Complete.md`, `docs/architecture/MULTI_MACHINE_EXPORT_DESIGN.md`, `src/`, `server/`, `supabase/migrations/`, `supabase/functions/`, and `packages/field-app/`. Documentation explains intent; code, tests, and schemas provide E0 as-built evidence.

### 32.2 User-Provided Coohom / Manycore Upstream Package

| Source ID | Tier | Artifact | SHA-256 | Limitation |
| --- | --- | --- | --- | --- |
| `SRC-U01` | E3 | `Coohom Technology Deep Dive — Architecture, Algorithms & AI Research (Executive Edition).md` | `6CF39D7A...8F969` | Mixes papers, vendor sources, and inferred internals; trace each claim separately |
| `SRC-U02` | E3 | `Coohom Complete Suite Intelligence Report — Executive Decision-Grade Analysis.md/.pdf` | MD `1D24F30E...ECBA`; PDF `2EB0F260...FFBB` | Executive synthesis; the title does not elevate every claim to E1 |
| `SRC-U03` | E3 | `Coohom Deep Research Report — Complete Edition (Part 2: Strategy & Expansion).pdf` | `855C2C6D...BFAF9` | Strategy/vendor/market synthesis; numbers require original-source verification |
| `SRC-U04` | E3 | `Coohom Manycore Tech — Technology Deep Dive for DAPH Studio 2026.md/.pdf` | MD `0351FCC1...04A4`; PDF `5B1B555C...A5297` | Upstream integration proposal; a direct SmartLink-to-CNC path is not MONOLITH policy |

Hashes are abbreviated in the table for readability. Full values are recorded in §32.4 and must remain in the release evidence manifest if this package is archived into a controlled repository.

### 32.3 External Primary, Standard, and Vendor Sources

| Source ID | Tier | Source | Supports |
| --- | --- | --- | --- |
| `SRC-X01` | E1 | [SpatialLM paper](https://arxiv.org/abs/2506.07491) and [NeurIPS 2025 record](https://nips.cc/virtual/2025/poster/115535) | Point cloud → structured walls/doors/windows/object boxes and research benchmarks |
| `SRC-X02` | E2 | [Coohom AI Home Design / AIHom](https://www.coohom.com/case/ai-home-design) | Fast editable 2D/3D front-door benchmark |
| `SRC-X03` | E2 | [Coohom Floor Planner](https://www.coohom.com/case/floor-planner) | Floor-plan UX capability claim |
| `SRC-X04` | E2 | [Coohom 3D Render](https://www.coohom.com/case/3d-render-home) | Rendering/presentation benchmark |
| `SRC-X05` | E2 | [Coohom Model Library](https://www.coohom.com/3d-models) | Catalog-breadth claim; not a certified manufacturing catalog |
| `SRC-X06` | E2 | [Coohom SmartLink](https://blog.coohom.com/coohom-smartlink-suite-at-indiawood-2026-closing-the-gap-between-design-and-production/) | Vendor claims for design validation, live synchronization, and CNC workflow |
| `SRC-X07` | E2 | [Coohom AI Modeler Guide](https://www.coohom.com/helpcenter/model-materials-ai-modeler-user-guide) | Confirms Tripo 3D/HY 3D tools; does not disclose internal neural architecture |
| `SRC-X08` | E1 | [Microsoft Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) and [HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/) | Human-AI interaction and failure-mode design |
| `SRC-X09` | E1 | [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | AI governance and risk framing |
| `SRC-X10` | E1 | [ISO 9241-210](https://www.iso.org/standard/77520.html) and [ISO 23247](https://www.iso.org/standard/75066.html) | Human-centred design and digital-twin framework |
| `SRC-X11` | E1 | [NIST AMS 300-6](https://doi.org/10.6028/NIST.AMS.300-6) | Product-data traceability |

External URLs were last checked on 2026-07-10 and remain dynamic sources. A production decision must record access date, version, and an archived snapshot where licensing permits.

### 32.4 Full Local Hash Manifest

```text
SRC-I01-TH  E363271DCF31BD4F22F81B0886258696AB7F2D1E05F22831790DB6A6F7546C6D  monolith-complete-prd.th.md
SRC-I01-EN  299BA72490D04112836C330D115712DE7A67D52E6DC985F7DCC8D97FCDBF59F0  monolith-complete-prd.en.md
SRC-I02     70AEBC56DFDC7EB6A024AE6FD68D5BB5B6802D588A21EC04F0775BB9AD8DD44D  monolith-complete-prd-v4.th.md
SRC-I03-TH  2EEA72F3DF4BF80CD7E342AB544061EB496D5EEE15A5BF94FF460F339FDE4B08  coohom-vs-monolith-comparison.th.md
SRC-I03-EN  6BC1D2F6F66EDDFFD367DE849C3267E8D807BE509711ECEAD685F7A84618906B  coohom-vs-monolith-comparison.en.md
SRC-I04-TH  9EB37FF85CCE2046E1C019D1EB24E9D50D3106EB9A36AB837C32B163F4CA9FDD  monolith-front-door-doctrine.th.md
SRC-I04-EN  47B5EB1DEE81B37E7AF4BBADF5E91658EE9A8E1A5C7EE6E5A2A90533D0FE0379  monolith-front-door-doctrine.en.md
SRC-I05-TH  2762AD44F8C9DE5DEF3051F93D259E112A4B99DD98E22751149916454A52BE60  erp-deep-research-for-monolith.th.md
SRC-I05-EN  3D136404680D1FD4FD044C088279C04F27FDC0DBB80CAA9C2B759756BCD99806  erp-deep-research-for-monolith.en.md
SRC-U01     6CF39D7AB95CCCA46716C99E8928390D1A9A29C49965C4352FB9B45430F8F969  Coohom Technology Deep Dive.md
SRC-U02-MD  1D24F30E0F3ABF0D77769D0329524C923579D2BE0BE606F125960D484BCAECBA  Coohom Complete Suite Intelligence Report.md
SRC-U02-PDF 2EB0F260483A2735FB8245A61FA7054F2AC74637ACF100C596ABC345D1C8FFBB  Coohom Complete Suite Intelligence Report.pdf
SRC-U03-PDF 855C2C6D84E226D18A6D2D6EB13F7BD643B57C92FC96FB9DECC0D3C3443BFAF9  Coohom Deep Research Report Part 2.pdf
SRC-U04-MD  0351FCC1AD26CD96E697B29F831006A7842E468A01A3AD690419B4C5500404A4  Coohom Manycore Tech Deep Dive.md
SRC-U04-PDF 5B1B555C7F40C4173AC7EACDC9B2D359F56A5348A5503512062A6053F19A5297  Coohom Manycore Tech Deep Dive.pdf
```

## 33. Claim Ledger

The Claim Ledger connects sources, PRD decisions, and as-built evidence. `ACCEPTED` means accepted as a requirement or decision; it does not mean implemented. `AS-BUILT GAP` means the current code does not yet satisfy the requirement.

| Claim ID | Claim | Sources / Tier | PRD Decision | Status and proof obligation |
| --- | --- | --- | --- | --- |
| `CLM-001` | Coohom provides a fast front door and editable visual scene | `SRC-X02`–`SRC-X05` / E2, `SRC-U01`–`SRC-U04` / E3 | Use as a UX benchmark | **ACCEPTED WITH BOUNDARY** — scene/catalog data must not become production truth automatically |
| `CLM-002` | SmartLink supports a design-to-production/CNC workflow | `SRC-X06` / E2, `SRC-U02`–`SRC-U04` / E3 | Vendor benchmark, not runtime dependency | **VENDOR CLAIM** — require paid demo, machine matrix, API contract, and packet comparison before integration consideration |
| `CLM-003` | SpatialLM can parse point clouds into structured indoor elements | `SRC-X01` / E1 | Feasibility basis for Spatial Evidence Compiler | **ACCEPTED** — pilot must measure precision/recall and human correction on DAPH data |
| `CLM-004` | SpatialLM can create CNC or release manufacturing truth | No primary evidence; E4 inference | Prohibited by policy | **REJECTED** — SpatialLM output is candidate evidence only |
| `CLM-005` | Coohom uses the reported bidirectional DAG, U-Net, Hough/RDP, 50 mm auto-close, and internal pipelines | `SRC-U01` / E3-E4; `SRC-X07` confirms only the tool surface | Must not be encoded as fact or dependency | **UNVERIFIED** — require official technical disclosure or reproducible black-box study |
| `CLM-006` | “The first 10 minutes” is a proven performance fact | `SRC-I04` / E4, vendor speed claims E2 | Product aspiration | **TARGET, NOT BASELINE** — set SLA only after 30–60 days of baseline data |
| `CLM-007` | Spatial AI/AI/OCR is evidence, not authority | `SRC-I01`, `SRC-I04`, `SRC-X08`, `SRC-X09` / E1-E4 | System invariant | **ACCEPTED** — write paths require provenance, verifier, and human gate |
| `CLM-008` | ERP is a business layer around manufacturing truth | `SRC-I01`, `SRC-I05` / E1-E4 | Architectural boundary | **ACCEPTED** — ERP must not edit geometry, drill maps, CNC, or release state |
| `CLM-009` | Factory Packet must be deterministic, signed, and offline-verifiable | `SRC-I01`, implementation docs, `SRC-I06` / E0-E1 | Mandatory release requirement | **ACCEPTED; AS-BUILT GAP** — see `AB-PKT-01`–`AB-PKT-02` |
| `CLM-010` | Concept Sandbox is already implemented | PRD only / E4; audit `SRC-I07` | Target capability | **AS-BUILT GAP** — no systematic sandbox graph separated from manufacturing truth was located |
| `CLM-011` | Catalog Trust Tiers are already implemented | PRD only / E4; E0 catalog foundation | Target capability | **AS-BUILT GAP** — catalog code exists, but Public/Project/Verified/Certified enforcement was not found end to end |
| `CLM-012` | LINE/Capture/Field digital thread is fully production-ready | `SRC-I06`, `SRC-I07` / E0 | Target remains | **PARTIAL / NOT VERIFIED** — migrations/functions/field app exist; DB/RLS integration and field-app automated tests remain incomplete |
| `CLM-013` | Factory authorization boundary is production-ready | `SRC-I06`, `SRC-I07` / E0 | Mandatory control | **AS-BUILT GAP** — frontend role is stored in localStorage and the edge function trusts `x-actor-role/name` |
| `CLM-014` | Main UI allows CNC export only from `RELEASED` | `SRC-I06`, `SRC-I07` / E0 | Mandatory invariant | **AS-BUILT GAP** — `AppShell.tsx:174` permits `FROZEN` when the gate is OK |
| `CLM-015` | Factory packet generation is bit-identical | `SRC-I06`, `SRC-I07` / E0 | Mandatory requirement | **AS-BUILT GAP** — job ID, manifest time, and ZIP time still contain runtime entropy |
| `CLM-016` | Server `/verify` validates manifest/files/signature/gate/machine end to end | `SRC-I06`, `SRC-I07` / E0 | Mandatory verification boundary | **AS-BUILT GAP** — current behavior primarily validates the packet SHA anchor |
| `CLM-017` | CAD/CAM, Parametric Contract, Connector OS, and Safety Gate have real implementations | `SRC-I06`, `SRC-I07` / E0 | Preserve as core | **VERIFIED IN TEST ENVIRONMENT** — not equivalent to production certification |
| `CLM-018` | ERP/finance/executive analytics are complete | `SRC-I06`, `SRC-I07` / E0 | Roadmap target | **PARTIAL** — schema/workflow foundations exist, but `/finance` and other routes remain placeholders |

## 34. As-Built Status

### 34.1 Snapshot and Audit Boundary

| Field | Value |
| --- | --- |
| Audit date | 2026-07-10 |
| Repository | `determined-williams/` |
| Git identity | Commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c`, branch `fix/drillmap-bolt-and-brun-dowels` |
| Worktree | **DIRTY** — modified/untracked files predated this documentation task; results represent a local workspace snapshot, not clean-commit certification |
| Automated evidence observed | Root Vitest: 261 files / 4,545 tests passed; TypeScript check passed; Vite build passed; browser smoke: 7 scenarios passed |
| Partial test evidence | Python suite: 10 passed / 96 skipped because `LINE_OA_TEST_DATABASE_URL` was absent; live DB/RLS was not proven |
| Toolchain variance | Factory server package tests under Vitest 1.6 failed 13 tests due to CLI side effects/process exit, while the same golden tests passed under root Vitest; test-runner drift remains |
| Excluded from certification | Production deployment, live Supabase/LINE credentials, real CNC execution, receipt-key ceremony, paid Coohom/SmartLink environment, and field pilot |

### 34.2 Status Definitions

| Status | Meaning |
| --- | --- |
| **VERIFIED** | Implementation was located and automated evidence passed in the stated environment |
| **PARTIAL** | Material implementation exists, but flow, control, integration, or proof is incomplete |
| **PLANNED** | Defined in PRD/roadmap without sufficient implementation evidence |
| **BLOCKED** | A gap prevents production release even though part of the capability exists |
| **NOT VERIFIED** | Code/schema may exist, but this audit lacked the environment or evidence to decide |

### 34.3 FR-01 to FR-17 As-Built Matrix

| FR | Capability | Status | Evidence summary | Next proof required |
| --- | --- | --- | --- | --- |
| FR-01 | Front Door Intake Router | **PARTIAL** | LINE/capture/routes exist, but unified front-door routing and a complete evidence graph were not located | End-to-end intake test + role/channel routing |
| FR-02 | Concept Sandbox | **PLANNED** | No sandbox graph/state separated from manufacturing truth was located | Sandbox data model, conversion gate, and no-export tests |
| FR-03 | Spatial Evidence Compiler | **PARTIAL** | `site_survey_zone` schema/adapter exists; no SpatialLM runtime pipeline was located | Model/runtime PoC, provenance schema, accuracy benchmark |
| FR-04 | Capture Spine | **PARTIAL** | `src/capture/`, migrations, and commit-target adapters exist | Live DB/RLS integration, retries, offline, and failure proof |
| FR-05 | Designer Workspace | **VERIFIED** | `src/spec/ui/DesignerScreen.tsx`, designer rules/stores, and 3D/CAD tests exist | Usability/pilot evidence and production telemetry |
| FR-06 | Parametric Contract | **VERIFIED** | Spec/store/state machine and manufacturing transformations have test coverage | Released-spec immutability proof in the deployed boundary |
| FR-07 | Catalog Trust Tiers | **PARTIAL** | `src/core/catalog/` and manufacturing catalogs exist; full trust-tier enforcement was not located | Tier schema, certification owner, export-deny tests |
| FR-08 | Material Stack + Connector OS | **VERIFIED** | Material registry, connector compiler, and drill-map/gate tests exist | Machine-profile pilot and versioned catalog evidence |
| FR-09 | Safety Gate and Release State | **PARTIAL / BLOCKED** | Gate engine/tests are strong; main UI export allows `FROZEN`; strict bypass scan is not operational | Fix `AB-EXP-01`, bypass scanner, and release-invariant tests |
| FR-10 | Approval Packet | **PARTIAL** | Approval quorum/authz/idempotency and LINE workflow foundations exist | Customer-facing packet E2E, identity/quorum/audit proof |
| FR-11 | Factory Packet and Multi-Machine Export | **PARTIAL / BLOCKED** | Exporters/packet paths exist; determinism, server verification, auth, and production key remain blocked | Close `AB-PKT-01`–`AB-PKT-02`, `AB-AUTH-01`, `AB-KEY-01` |
| FR-12 | ERP Backbone | **PARTIAL** | Migrations/object flows exist in part; key routes remain placeholders | Released demand → BOM/WO/PO/job-cost integration test |
| FR-13 | LINE-Native Engagement | **PARTIAL / NOT VERIFIED** | Supabase functions/migrations and some TS/Python tests exist | Live sandbox, DB/RLS suite, delivery/retry/consent evidence |
| FR-14 | Field Execution and Installation | **PARTIAL / NOT VERIFIED** | `src/workflow/field/`, bridge, and `packages/field-app/` screens exist | Field-app test script, offline sync, close-house pilot |
| FR-15 | Accounting, Procurement, Job Costing | **PARTIAL** | Ledger/capture/migration foundations exist; finance UI and real posting are incomplete | Accountant-reviewed shadow posting and reconciliation |
| FR-16 | MCP and AI Copilot | **PARTIAL** | `src/mcp/` contains authz, PDPA, redaction, autonomy, and tests | Deployed IAM, Pending Invocation E2E, and audit proof |
| FR-17 | Executive Dashboard and Analytics | **PARTIAL** | Factory dashboard components exist; complete board-KPI lineage was not located | Metric registry, source-table lineage, baseline, and executive acceptance |

### 34.4 Production Blocker Register

| Blocker ID | Priority | Evidence | Production exit condition |
| --- | --- | --- | --- |
| `AB-AUTH-01` | P0 | `src/core/auth/roles.ts:67`; `supabase/functions/factory-api/index.ts:136-137` | JWT/session → server-owned actor/role mapping; client headers have no authority |
| `AB-EXP-01` | P0 | `src/components/layout/AppShell.tsx:174` | CNC export requires `RELEASED` and the format-specific gate at every entry point |
| `AB-PKT-01` | P0 | `src/factory/packet/useFactoryPacket.ts:352`; `src/factory/packet/buildFactoryPacket.ts:126` | Canonical job identity/time policy and deterministic ZIP metadata |
| `AB-PKT-02` | P0 | `supabase/functions/factory-api/index.ts:193-207` | Verify manifest, per-file hash, signature, gate, revision, and machine profile |
| `AB-KEY-01` | P0 | `server/src/crypto/production.receipt.pubkeys.v1.json:1` | Approved non-placeholder production public-key set + rotation ceremony |
| `AB-TST-01` | P1 | Factory server package Vitest 1.6 result | CLI entrypoint does not run/exit on import; package/root test parity |
| `AB-GATE-01` | P1 | `scripts/gates/bypass-scan.ts:135,147`; `.claude/gates/ci-bypass-patterns.txt:156` | Scanner parses regex alternation and the strict gate passes with usable signal-to-noise |
| `AB-DB-01` | P1 | 96 Python tests skipped | Provision isolated DB, run RLS/integration suite, and retain CI artifact |
| `AB-FIELD-01` | P1 | `packages/field-app/` has no test script; `.env` is untracked | Test/offline suite, secret hygiene, and pilot evidence |

### 34.5 Promotion Rule

A capability may move to `VERIFIED` or `production-ready` only when the Claim Ledger points to immutable E0 source IDs, automated tests cover the invariant, deployment evidence is tied to the revision, the operational owner signs off, and no related P0 blocker remains. A status change must update §33 and §34 together; changing roadmap prose alone is prohibited.

## 35. Revision Notes for v5

### v5.0

Preserved the detailed FR-01 to FR-17 requirements from PRD v3 and folded the useful PRD v4 additions into canonical sections: business goals, non-goals, assumptions and constraints, RACI, release strategy, migration and coexistence, dependencies, risk register, program-level acceptance criteria, Definition of Done, SpatialLM policy, and ERP policy.

### v5.1 — Evidence-Control Revision

- Added Evidence Tiers E0-E4 and usage policy.
- Converted the Source Register into a source-ID registry with hashes/revisions and added the upstream Coohom/Manycore package.
- Added a Claim Ledger that separates source fact, vendor claim, inference, PRD decision, and as-built gap.
- Added an As-Built Status Matrix for FR-01 through FR-17 and a Production Blocker Register.
- Bound the audit snapshot to commit/branch/worktree state and recorded test limitations.
- Reaffirmed that a PRD target is not a production claim and every status must be reverified when the code/source revision changes.

The generated citation markers from v4 remain removed because they are not resolvable in a standalone document. `monolith-complete-prd-v5.sha256` is the release evidence manifest containing the full SHA-256 values of all four v5.1 TH/EN Markdown and HTML files.
