# MONOLITH Complete Roadmap

Document date: 2026-07-10  
Language edition: EN  
Document edition: 1.0  
Planning horizon: 2026-07-10 through 2027-06-30  
Governing document: `monolith-complete-prd-v5.en.md` edition 5.1  
Status: Planning Baseline — target dates must be rebaselined after RG-0  
Product: MONOLITH Manufacturing OS / MONOLITH Operating System

## 1. Executive Summary

This roadmap turns PRD v5.1 from a target state into a 12-month delivery program with explicit owners, dependencies, release gates, evidence, and rollback. The objective is not to build every module at once. It is to secure manufacturing truth first, then add front-door speed, spatial evidence, ERP, field execution, and board intelligence in that order.

The strategic sequence is:

```text
Evidence Baseline
  → Identity + Release Safety
  → Deterministic Factory Packet
  → Controlled Factory Pilot
  → Front Door + Approval Pilot
  → Spatial Evidence Sandbox
  → ERP Shadow + Field Digital Thread
  → Board Intelligence + Controlled Scale
```

Key decisions:

- No production pilot while any P0 blocker remains open.
- Concept Sandbox, SpatialLM, ERP, and AI/MCP must never gain a shortcut to CNC, release, or accounting.
- Dates are planning targets, not commitments, until the previous phase evidence gate passes.
- Business KPIs require 30–60 days of baseline data before target-setting, except hard safety invariants that can immediately target zero or 100%.
- Every release must update the PRD v5.1 Source Register, Claim Ledger, and As-Built Status.

## 2. Roadmap Authority and Evidence Baseline

This roadmap is subordinate to PRD v5.1. If they conflict, system invariants, prohibited actions, Safety Gate policy, and production blockers in the PRD take precedence over schedule.

| Reference | Identity | Role in roadmap |
| --- | --- | --- |
| PRD v5.1 TH/EN | `monolith-complete-prd-v5.sha256` | Target requirements, claims, as-built baseline |
| Code snapshot | Commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c` | Implementation baseline as of 2026-07-10 |
| Worktree state | Dirty | Audit result is not clean-commit certification |
| Automated evidence | 4,545 root tests, TypeScript, build, and 7 browser smoke scenarios passed | Test-environment confidence only |
| Missing evidence | Live DB/RLS, production deployment, real CNC, key ceremony, field pilot | Must be closed through release gates |

A code revision, source hash, or environment change returns affected as-built claims to `REVERIFY` until the relevant gate is rerun.

## 3. Program Objective and 12-Month Outcomes

By 2027-06-30, the program must deliver:

1. a production release path that is server-authorized, RELEASED-only, deterministic, signed, and fully packet-verifiable
2. a factory pilot on at least one real machine path with operator runbook and rollback
3. a fast front door whose Concept Sandbox cannot export to production
4. an Approval Packet bound to identity, revision, quorum, and audit
5. a spatial/capture pilot for 1–2 rooms whose outputs remain evidence only
6. an ERP Backbone that receives BOM snapshots from Released Spec and supports shadow procurement, job costing, and reconciliation
7. a field digital thread for mobile/offline proof, issues, NCR, close-house, and customer acceptance
8. a Metric Registry and executive dashboard that trace every KPI to source table and owner
9. a release evidence pack that can reproduce every `VERIFIED` status from an immutable revision

## 4. Planning Principles

1. **Safety before speed:** close auth, release, and packet blockers before front-door feature expansion
2. **One truth chain:** no parallel release path through a vendor, ERP, field, or AI
3. **Pilot before scale:** every phase requires a controlled pilot before expanding machines, teams, or business units
4. **Evidence before status:** a meeting or demo alone cannot move `PARTIAL` to `VERIFIED`
5. **Config before hardcode:** machine, threshold, waiver, role, and policy must be versioned/configurable
6. **Human authority:** AI, spatial, OCR, and MCP may propose; accountable humans approve critical writes
7. **Coexistence over big bang:** legacy work continues until the new proof chain is stable
8. **Rebaseline honestly:** scope/date/capacity changes must be recorded, not hidden by weakening acceptance criteria

## 5. Assumptions and Constraints

| Type | Planning assumption / constraint |
| --- | --- |
| Capacity | A cross-functional core squad exists across frontend/CAD, backend/platform, QA, and product; if below §22 assumptions, phases move rather than safety gates shrinking |
| Factory | One pilot machine profile can be selected and a factory owner participates in UAT |
| Data | A project/room is authorized for pilot use and can be PDPA-classified |
| Finance | A finance owner accepts shadow posting before real posting |
| Field | An operations champion and controlled project are available for mobile/offline pilot |
| Vendor | Coohom/SmartLink remains a benchmark until procurement gate approval and is not a critical-path dependency |
| Deployment | Isolated test DB, staging, and key/secrets boundary exist before RG-2 |
| Timeline | All target dates rebaseline after RG-0 and quarterly |

## 6. As-Built Baseline

| Group | Starting status | Roadmap implication |
| --- | --- | --- |
| Designer Workspace / Parametric Contract | VERIFIED in test environment | Preserve regression coverage and add deployed immutability proof |
| Material Stack / Connector OS | VERIFIED in test environment | Use as the core of the machine pilot |
| Safety Gate / Release | PARTIAL / BLOCKED | Critical path for Phase 0 |
| Factory Packet / Export | PARTIAL / BLOCKED | Fix determinism, verification, auth, and key before pilot |
| Front Door / Concept Sandbox | PARTIAL / PLANNED | Start after RG-2 so safety closure keeps capacity |
| Spatial Evidence | PARTIAL | SiteSurveyZone substrate exists; no model runtime |
| Capture / LINE | PARTIAL / NOT VERIFIED | Requires DB/RLS and live sandbox proof |
| ERP / Finance | PARTIAL | Begin with object registry and shadow mode |
| Field | PARTIAL / NOT VERIFIED | Add tests, offline proof, and secret hygiene |
| Executive Analytics | PARTIAL | Build after source-table lineage exists |

## 7. Workstream Model

| Workstream | Scope | Accountable role | Primary FR |
| --- | --- | --- | --- |
| `WS-00` Program Evidence & Governance | Source/claim/as-built, release evidence, change control | Program Owner | all |
| `WS-01` Identity, Security & PDPA | IAM, JWT, secrets, service role, threat model, retention | Security/Platform Lead | FR-09, 13, 16 |
| `WS-02` Truth and Release Integrity | Spec states, gate invariants, waiver, immutable release | Manufacturing Tech Lead | FR-06, 09 |
| `WS-03` Factory Packet & Machine | Deterministic packet, signature, verification, machine profiles | Factory Integration Lead | FR-08, 11 |
| `WS-04` Front Door & Concept | Intake, sandbox, conversion, presentation | Product/Design Lead | FR-01, 02, 05 |
| `WS-05` Capture & Spatial Evidence | Capture, survey, provenance, SpatialLM sandbox | Capture/AI Lead | FR-03, 04 |
| `WS-06` Catalog, Material & Connector | Trust tiers, certification, catalog/machine versions | Data Steward | FR-07, 08 |
| `WS-07` Approval & LINE | Customer packet, identity, quorum, retry, consent | Engagement Lead | FR-10, 13 |
| `WS-08` ERP, Procurement & Finance | Item/BOM/WO/WIP/PO/job cost/shadow posting | Finance Systems Lead | FR-12, 15 |
| `WS-09` Field Execution | Mobile/offline, proof, issue, close-house, acceptance | Field Operations Lead | FR-14 |
| `WS-10` Analytics & Board | Metric Registry, dashboard, benefit realization | Data/Product Lead | FR-17 |
| `WS-11` Platform, QA & Operations | CI, DB/RLS, test parity, observability, DR/runbooks | QA/Platform Lead | all |

## 8. Master Timeline

| Phase / Release | Target dates | Primary outcome | Hard gate |
| --- | --- | --- | --- |
| Phase 0 — `R0.1 Safety Closure` | 2026-07-10 → 2026-08-09 | Evidence baseline + P0 safety closure | `RG-1` |
| Phase 1 — `R0.2 Factory Pilot Ready` | 2026-08-10 → 2026-09-08 | One controlled machine path, signed/verified packet | `RG-2` |
| Phase 2 — `R0.3 Front Door Pilot` | 2026-09-09 → 2026-10-08 | Intake + sandbox + conversion + approval pilot | `RG-3` |
| Phase 3 — `R0.4 Spatial Sandbox` | 2026-10-09 → 2026-12-31 | Capture hardening + 1–2 room spatial pilot | `RG-4` |
| Phase 4 — `R0.5 ERP/Field Pilot` | 2027-01-01 → 2027-03-31 | ERP shadow + field digital thread | `RG-5`, `RG-6` |
| Phase 5 — `R1.0 Controlled Scale` | 2027-04-01 → 2027-06-30 | Board intelligence, multi-machine/BU controlled scale | `RG-7` |

## 9. Phase 0 — Safety Closure (Days 0–30)

Objective: close every path that can bypass production authority, release state, or packet integrity.

### Scope

- `AB-AUTH-01`: server-owned actor/role mapping from JWT/session
- `AB-EXP-01`: CNC export requires `RELEASED` at every entry point
- `AB-PKT-01`: canonical identity/time and deterministic ZIP
- `AB-PKT-02`: full packet verification
- `AB-KEY-01`: production public-key set and key rotation ceremony
- `AB-TST-01`: factory package/root test parity
- `AB-GATE-01`: operational strict bypass scanner
- `AB-DB-01`: isolated DB/RLS CI
- `AB-FIELD-01`: field test script and secret hygiene
- owner, rollback, runbook, and evidence location for every blocker

### Exit criteria

- Open P0 blockers = 0.
- Untrusted roles/headers cannot grant authority.
- DRAFT/FROZEN exports are rejected in UI, API, and direct calls.
- Identical input produces identical hashes across the repeat corpus.
- Tampered file/manifest/signature/revision/machine profile is rejected.
- Production key is non-placeholder and rotation/revocation tests pass.
- Root/package/DB required suites pass and retain CI artifacts.

## 10. Phase 1 — Factory Pilot Ready (Days 31–60)

Objective: prove truth → packet → verify → operator flow on one target machine path without scope expansion.

### Scope

- freeze pilot `MachineProfileVersion` and tool table
- golden jobs covering normal, boundary, and tampered cases
- signed Factory Packet + offline verifier
- operator checklist, dry-run mode, abort/rollback procedure
- packet-to-machine adapter and post-processor conformance
- production receipt, audit event, and evidence archive
- controlled dry run before real material cutting

### Exit criteria

- Factory owner and QA sign off the packet golden set.
- Released revision, manifest, file hash, machine profile, and receipt trace end to end.
- Failed verification cannot continue by default.
- Operator can verify offline and stop work without a developer.
- Incident drill and rollback pass.

## 11. Phase 2 — Front Door and Approval Pilot (Days 61–90)

Objective: increase starting speed without creating a production shortcut.

### Scope

- Intake Router from LINE/web/manual intake
- Concept Sandbox with explicit badge/state and no-export invariant
- ConceptGraph → Parametric Contract conversion workflow
- Catalog Trust Tiers seed: Public, Project, Verified, Certified
- G1/G2/G3/G4 Approval Packet with identity, revision, quorum, and expiry
- presentation/render deck that is not interpreted as manufacturing approval
- baseline time-to-first-concept and approval SLA

### Exit criteria

- Sandbox objects cannot reach CNC/release without conversion.
- Every conversion records source mapping, verifier, and owner.
- Customer approval binds packet hash/revision and remains separate from factory release.
- Pilot users complete the flow without understanding internal architecture.
- Feedback and abandonment reasons are captured to rebaseline Phase 3.

## 12. Phase 3 — Spatial Evidence Sandbox and Capture Hardening (Months 4–6)

Objective: accelerate survey/capture while preserving human verification and isolation from release.

### Scope

- Spatial Evidence Contract for walls/openings/object boxes/confidence/provenance
- data boundary for video/LiDAR/RGB-D/point cloud and retention policy
- SpatialLM/runtime PoC on 1–2 rooms
- comparison against manual survey and correction workload
- mobile capture, offline queue, retry/idempotency, and conflict handling
- SiteSurveyZone version/supersede flow
- promote only verified evidence into design context

### Exit criteria

- Model output is marked candidate and cannot export to production.
- Measurement-critical fields require human verification.
- Accuracy, correction, bias, and failure taxonomy include unsuccessful samples.
- Delete/retention/consent flows pass PDPA review.
- Manual survey fallback works when model/service is unavailable.

## 13. Phase 4 — ERP Backbone and Field Digital Thread (Months 7–9)

Objective: connect released demand to business and field reality without moving manufacturing authority.

### Scope

- Item Master/Object Registry and identity mapping
- BOM Snapshot from Released Spec only
- Work Order, WIP, stock reservation, and procurement trigger
- committed/actual cost and job-cost variance
- shadow accounting posting + reconciliation
- field work item, room/lane, proof, issue/NCR, and offline sync
- close-house/customer acceptance + authorization/audit

### Exit criteria

- ERP cannot edit geometry, drill maps, CNC, or release.
- Duplicate/retry cannot create duplicate PO, stock movement, or journal.
- Finance owner reconciles shadow posting to source documents.
- Field proof binds released revision, room, and work item.
- Close-house fails when proof, issues, or authorization is incomplete.

## 14. Phase 5 — Board Intelligence and Controlled Scale (Months 10–12)

Objective: let executives see speed, integrity, manufacturing, field, and financial outcomes from traceable sources and scale them under control.

### Scope

- Metric Registry: definition, owner, source table, cadence, baseline, threshold
- executive dashboard and drill-down to project/package/revision
- closed-loop rule enrichment from NCR/rework/variance
- additional machine profiles only after conformance gate
- business-unit rollout playbook, training, and support model
- SLO, incident response, DR/restore, and release certification

### Exit criteria

- Every KPI has source lineage and owner.
- No vanity metric without a decision/action.
- New machine/BU uses repeatable onboarding + certification.
- Benefit realization passes baseline comparison and finance/ops sign-off.
- R1.0 evidence pack is reproducible from a clean revision.

## 15. Epic Register

Size is relative planning size (`S`, `M`, `L`, `XL`), not a duration commitment.

### 15.1 Safety, Factory, and Platform Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-000` | Evidence baseline, owner map, release manifest | 00 | S | none | RG-0 |
| `RM-001` | JWT/session → server-owned actor/role | 01 | L | RM-000 | RG-1 |
| `RM-002` | RELEASED-only export invariant at every entry point | 02 | M | RM-001 | RG-1 |
| `RM-003` | Deterministic job identity/manifest/ZIP | 03 | L | RM-000 | RG-1 |
| `RM-004` | Full packet verifier + negative corpus | 03 | L | RM-003 | RG-1 |
| `RM-005` | Production key set, rotation, revocation | 01 | M | RM-001 | RG-1 |
| `RM-006` | Package/root test-runner parity | 11 | S | none | RG-1 |
| `RM-007` | Strict bypass scanner repair | 11 | S | none | RG-1 |
| `RM-008` | Isolated DB/RLS integration CI | 11 | M | DEC-05 | RG-1 |
| `RM-009` | Field test harness + secret hygiene | 09/11 | M | environment | RG-1 |
| `RM-010` | Versioned pilot machine profile/tool table | 03/06 | M | RM-004, DEC-02 | RG-2 |
| `RM-011` | Offline verifier + receipt/archive | 03 | M | RM-004, RM-005 | RG-2 |
| `RM-012` | Controlled factory pilot + runbook | 03 | L | RM-010, RM-011 | RG-2 |

### 15.2 Front Door, Catalog, Approval, and Spatial Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-020` | Unified intake router and evidence identity | 04/07 | L | RG-1 | RG-3 |
| `RM-021` | Concept Sandbox + no-export enforcement | 04 | L | RM-020 | RG-3 |
| `RM-022` | Verified conversion to Parametric Contract | 04/02 | XL | RM-021 | RG-3 |
| `RM-023` | Revision-bound Approval Packet | 07 | L | RM-020, RM-001 | RG-3 |
| `RM-024` | Catalog Trust Tiers + certified seed set | 06 | L | DEC-06 | RG-3 |
| `RM-030` | Spatial Evidence Contract/provenance | 05 | M | RM-000 | RG-4 |
| `RM-031` | SpatialLM/runtime PoC for 1–2 rooms | 05 | L | RM-030, DEC-07 | RG-4 |
| `RM-032` | Mobile/offline capture hardening | 05/09 | L | RM-008 | RG-4 |
| `RM-033` | Verification/promote/fallback workflow | 05/02 | L | RM-030, RM-031, RM-032 | RG-4 |

### 15.3 ERP, Field, AI Governance, Analytics, and Scale Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-040` | Item Master/Object Registry | 08 | L | RM-001 | RG-5 |
| `RM-041` | BOM Snapshot → Work Order/WIP | 08 | XL | RM-040, Released Spec | RG-5 |
| `RM-042` | Procurement + committed/actual job cost | 08 | XL | RM-041 | RG-5 |
| `RM-043` | Shadow accounting + reconciliation | 08 | L | RM-042, DEC-08 | RG-5 |
| `RM-050` | Field work item/room/lane + offline | 09 | XL | RM-009, RM-032 | RG-6 |
| `RM-051` | Proof, issue, NCR, rework loop | 09 | L | RM-050 | RG-6 |
| `RM-052` | Close-house and customer acceptance | 09/07 | L | RM-051, IAM | RG-6 |
| `RM-060` | Metric Registry and source lineage | 10 | M | RM-041, RM-051 | RG-7 |
| `RM-061` | Executive dashboard + drill-down | 10 | L | RM-060 | RG-7 |
| `RM-062` | Closed-loop rule/catalog improvement | 10/06 | L | RM-051, RM-060 | RG-7 |
| `RM-063` | Pending Invocation + governed MCP writes | 01/11 | L | RM-001, RM-000 | RG-5 |
| `RM-070` | Multi-machine certification | 03 | XL | RG-2 evidence | RG-7 |
| `RM-071` | Observability, SLO, incident, and DR | 11 | L | RM-008, RG-2 | RG-7 |
| `RM-072` | R1.0 release certification/evidence pack | 00/11 | M | all gates | RG-7 |

## 16. Critical Path and Dependencies

### Critical Path A — Production Safety

```text
RM-000 → RM-001 → RM-002
RM-003 → RM-004 → RM-010 → RM-011 → RM-012
RM-005 ───────────────────────┘
```

Phase 1 cannot start if IAM, release invariant, determinism, verifier, or key ceremony is incomplete.

### Critical Path B — Front Door

```text
RM-020 → RM-021 → RM-022 → RM-023
                 RM-024 ─────┘
```

### Critical Path C — Spatial/Capture

```text
RM-030 → RM-031
RM-008 → RM-032 → RM-033
```

### Critical Path D — ERP/Field/Analytics

```text
RM-040 → RM-041 → RM-042 → RM-043
RM-009 + RM-032 → RM-050 → RM-051 → RM-052
RM-041 + RM-051 → RM-060 → RM-061 → RM-062
```

## 17. Release Gate Framework

| Gate | Decision owner | Required evidence | Fail rule |
| --- | --- | --- | --- |
| `RG-0` Baseline Accepted | Program Owner + Tech Lead | Scope, owner, capacity, source hashes, clean backlog | No owner/evidence = no start |
| `RG-1` Safety Closed | Security + Manufacturing Tech Lead | P0=0, auth/release/determinism/verify/key tests | Any P0 = fail |
| `RG-2` Factory Pilot Ready | Factory Owner + QA | Machine profile, golden packet, offline verify, runbook, rollback | Failed/tampered packet runnable = fail |
| `RG-3` Front Door Pilot Ready | Product + Design Lead | No-export sandbox, conversion audit, approval identity | Sandbox authority leak = fail |
| `RG-4` Spatial Pilot Accepted | Survey Lead + PDPA Owner | 1–2 room results, correction data, retention/fallback | Model output reaches release = fail |
| `RG-5` ERP Shadow Accepted | Finance Lead + Ops | BOM/WO/PO/job-cost trace, idempotency, reconciliation | ERP mutates manufacturing truth = fail |
| `RG-6` Field Pilot Accepted | Field Ops + PM | Offline proof, issue closure, acceptance auth | Close-house without proof = fail |
| `RG-7` Controlled Scale | Executive Owner | KPI lineage, SLO/DR, training, release evidence | Stale evidence/open critical risk = fail |

Every gate records `PASS`, `FAIL`, or `CONDITIONAL` with owner, timestamp, evidence links, and expiry. Deadline pressure must never auto-pass a gate.

## 18. Pilot Portfolio

| Pilot | Scope | Success evidence | Rollback |
| --- | --- | --- | --- |
| Factory Pilot A | One known machine profile, controlled cabinet/job, dry run before cutting | Packet/verify/receipt/operator sign-off | Return to approved legacy export |
| Front Door Pilot B | Representative leads/projects, concept-to-approval | Time baseline, conversion audit, no-export proof | Manual intake + existing designer flow |
| Spatial Pilot C | 1–2 rooms, non-production path | Manual comparison, correction time, failure taxonomy | Manual survey remains authority |
| ERP Shadow Pilot D | Representative released jobs or one complete accounting cycle | BOM/PO/WIP/job-cost reconciliation | No real posting; shadow tables only |
| Field Pilot E | One controlled project from work item to acceptance | Offline sync, proof binding, issue/close-house audit | Parallel legacy field process |

## 19. QA and Test Strategy

| Layer | Required coverage | Release evidence |
| --- | --- | --- |
| Unit/property | Math, geometry, connector, state, idempotency | Deterministic CI results |
| Golden/packet | Valid, boundary, tampered, wrong machine/revision/key | Immutable golden corpus |
| Contract/API | Auth, schema, versioning, error codes | API contract report |
| DB/RLS | Role isolation, RPC, retry, duplicate, migration | Isolated DB artifact |
| Browser E2E | Release, export, approval, failure states | Screenshots/report |
| Security | Header spoof, privilege escalation, secret scan, key rotation | Threat-test report |
| Field/offline | Queue, conflict, retry, reconnect, device loss | Device/offline report |
| Factory UAT | Dry run, operator verify, abort, receipt | Signed pilot checklist |
| Finance reconciliation | Shadow vs source/legacy | Accountant sign-off |
| Disaster recovery | Backup/restore, key revocation, service outage | Drill report |

A required test cannot be skipped in a release candidate. If the environment is unavailable, the gate is `NOT VERIFIED`, not passed.

## 20. Security, PDPA, and Key Management Plan

- Server derives actor/role from trusted session/JWT only.
- Service-role credential never reaches the client; functions enforce authorization before privileged RPC.
- Secret inventory records owner, rotation date, and emergency revoke path.
- Signing keys are environment-separated; production private keys never reside in the repository.
- Public-key sets are versioned/revocable and verify historical receipts.
- Site photos, video, point clouds, and PII have purpose, consent, residency, retention, and deletion policies.
- Vendor transfer requires DPA, data-flow review, and minimum-data design.
- Critical audit events are append-only and bind actor/session/revision.
- Incident response includes kill switches for export, AI writes, vendor integration, and field closeout.

## 21. Migration and Coexistence Plan

| Stage | Legacy behavior | New behavior | Exit condition |
| --- | --- | --- | --- |
| Shadow | Legacy remains authoritative | New system observes/calculates | Parity report acceptable |
| Dual-run | Controlled jobs use both | Compare packet/ERP/field outputs | Discrepancy within approved policy |
| Controlled cutover | Selected BU/machine uses new path | Rollback ready | Pilot gate passed |
| Scale | Additional machine/BU onboarded | Certification per profile | Repeatable evidence pack |

Migrated objects preserve identity, revision, provenance, and confidence. Old packets must not be regenerated to look like new evidence without parity.

## 22. Team Capacity and RACI

### 22.1 Planning Capacity Assumption

Minimum assumption for this timeline, not a headcount commitment:

- 1 Program/Product Owner
- 1 Technical Lead/Architect
- 2 Frontend/CAD engineers
- 2 Backend/Platform engineers
- 1 QA/SDET
- 0.5 DevOps/Security
- 0.5 Data/Analytics
- rotating domain owners: Factory, Survey, Field, Finance, Legal/PDPA, Data Steward

If a core role is missing for more than one sprint, rebaseline the critical path instead of bypassing a gate.

### 22.2 RACI

| Decision | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| PRD/Roadmap change | Product/Program | Executive Owner | Tech, Ops, Finance | all leads |
| IAM/release security | Platform/Security | Tech Lead | QA, Factory | Executive |
| Factory pilot release | Factory Integration | Factory Owner | QA, Design Lead | Ops/Executive |
| Spatial pilot | Capture/AI | Survey Lead | PDPA, Designer | Executive |
| ERP shadow posting | Finance Systems | Finance Lead | Ops, Accountant | Executive |
| Field close-house | Field Product/Ops | Ops Lead | PM, QA, Customer process owner | Executive |
| KPI publication | Data/Product | Executive Owner | Finance/Ops | all leads |

## 23. Governance Cadence

| Cadence | Forum | Output |
| --- | --- | --- |
| Daily during Phase 0 | Blocker stand-up | Owner, next evidence, unblock action |
| Weekly | Program delivery review | Epic status, critical path, risk/decision log |
| Biweekly | Release evidence review | Test/evidence freshness, claim/as-built updates |
| Monthly | Executive steering | Scope/date/capacity tradeoff, benefit baseline |
| Per gate | Gate review | Signed verdict, conditions, expiry, rollback |
| Quarterly | Roadmap rebaseline | Phase dates, capacity, procurement, KPI targets |

WIP limit: no more than three critical epics active per phase and one primary epic per workstream unless Program Owner approves an explicit capacity/evidence plan.

## 24. KPI and Benefit Realization

### 24.1 Hard Invariants

| KPI | Target before production pilot |
| --- | --- |
| Open P0 blocker | 0 |
| Unauthorized release/export | 0 |
| CNC export not RELEASED | 0 |
| Deterministic packet repeat | 100% of golden corpus |
| Tampered packet rejection | 100% of negative corpus |
| Required DB/RLS/security suites | 100% pass, 0 required skip |
| Repository production secret | 0 |

### 24.2 Business/Operational Metrics

| Cluster | Metrics | Target policy |
| --- | --- | --- |
| Speed | Time-to-first-concept, survey-to-verified, approval SLA | Baseline 30–60 days before target |
| Integrity | Render-to-release drift, approval completeness, waiver rate | Baseline + root-cause threshold |
| Manufacturing | First-pass gate, post error, packet rejection, scrap/rework | Factory-verified baseline |
| Field | Offline sync success, issue rate, punch-list age, acceptance completion | Pilot baseline |
| Financial | BOM-to-PO lag, WIP accuracy, job-cost variance, capture-to-post lag | Finance-reviewed baseline |
| Governance | Stale claim/evidence, conditional gate age, unresolved P0/P1 | Zero stale critical evidence |

## 25. Risk Register

| Risk | Trigger | Impact | Mitigation / owner |
| --- | --- | --- | --- |
| P0 closure slips | Blocker lacks owner/evidence > 3 days | All later phases slip | Daily escalation; Tech Lead |
| Dirty worktree invalidates audit | Release built from unknown state | Evidence unreliable | Clean release branch + manifest; Platform |
| Machine profile drift | Tool/profile changes without version | Unsafe output | Signed/versioned profile; Factory |
| DB/RLS not exercised | Required tests skipped | Data/auth leak | Isolated DB CI; QA/Platform |
| Front-door scope explosion | Render/catalog requests crowd safety work | Critical path slip | RG-2 prerequisite; Product |
| SpatialLM overpromise | Demo treated as measurement truth | Field/manufacturing error | Sandbox/no-release invariant; Survey |
| ERP becomes truth owner | ERP writes manufacturing fields | Silent drift | Contract/RLS deny; Tech/Finance |
| Field adoption low | Proof completion below baseline | Loop not closed | One-hand UX, ops champion, coexistence |
| Vendor claim mismatch | API/machine behavior differs from marketing | Procurement waste | Demo/contract/conformance gate |
| Key/secrets mishandled | Placeholder/shared keys persist | Forgery/incident | Key ceremony, rotation, secret scan |
| Capacity below plan | Critical roles unavailable | Schedule compression pressure | Rebaseline scope/date; Program Owner |
| KPI gaming | Metric lacks source/owner/action | False confidence | Metric Registry + audit; Data Lead |

## 26. Procurement and External Dependency Gates

| Dependency | Before commitment | Decision output |
| --- | --- | --- |
| Coohom/SmartLink | Paid demo, machine matrix, API contract, packet sample, DPA/data residency, TCO | Integrate, isolate as optional adapter, or reject |
| SpatialLM/runtime | Model/license, compute, data boundary, accuracy/correction benchmark | Sandbox continue/stop; never direct release |
| KMS/HSM/signing | Key custody, rotation, revoke, audit, recovery | Approved production key architecture |
| LINE | Consent, retry, rate limit, template/policy, outage fallback | Production communication boundary |
| Supabase/DB | Region, backup, RLS, service-role custody, restore drill | Staging/production readiness |
| CNC/post vendor | File contract, units, axes, tools, error behavior, support | Certified MachineProfileVersion |

## 27. 30/60/90-Day Action Plan

### Days 0–30

- assign owner/target evidence to every blocker
- close IAM, RELEASED-only export, determinism, verifier, and key P0s
- repair package tests, bypass scanner, DB/RLS environment, and field hygiene
- create clean release branch and evidence archive
- hold RG-1; fail if any P0 remains

### Days 31–60

- freeze one machine profile/tool table
- build golden/negative packet corpus and offline verifier
- run controlled dry run, operator training, and rollback drill
- collect receipt/audit evidence
- hold RG-2

### Days 61–90

- implement intake router, Concept Sandbox, conversion, and Approval Packet
- seed Catalog Trust Tiers
- run representative front-door pilot
- baseline speed/approval metrics
- hold RG-3 and rebaseline months 4–12

## 28. Definition of Ready and Definition of Done

### Definition of Ready

An epic is ready when it has FR/Claim/Blocker linkage, accountable owner, dependencies, data/privacy classification, acceptance tests, rollback, observability, and evidence destination.

### Definition of Done

An epic is done when:

- code/schema/config review passes
- required tests pass with no unapproved skip
- relevant security/PDPA/threat cases pass
- failure, retry, offline, and rollback are proven
- runbook, owner, and telemetry are ready
- pilot/UAT evidence binds an immutable revision
- PRD Claim Ledger and As-Built Status are updated
- gate owner records verdict and expiry

## 29. FR-to-Roadmap Traceability

| FR | Primary epics | Gate | Baseline → target |
| --- | --- | --- | --- |
| FR-01 | RM-020, RM-023 | RG-3 | PARTIAL → VERIFIED pilot |
| FR-02 | RM-021, RM-022 | RG-3 | PLANNED → VERIFIED pilot |
| FR-03 | RM-030, RM-031, RM-033 | RG-4 | PARTIAL → VERIFIED sandbox |
| FR-04 | RM-008, RM-032, RM-033 | RG-4 | PARTIAL → VERIFIED pilot |
| FR-05 | RM-012, RM-020 | RG-2/RG-3 | VERIFIED test → VERIFIED pilot |
| FR-06 | RM-002, RM-022 | RG-1/RG-3 | VERIFIED test → deployed proof |
| FR-07 | RM-024 | RG-3 | PARTIAL → VERIFIED seed set |
| FR-08 | RM-010, RM-070 | RG-2/RG-7 | VERIFIED test → machine-certified |
| FR-09 | RM-001, RM-002, RM-007 | RG-1 | BLOCKED → VERIFIED |
| FR-10 | RM-023 | RG-3 | PARTIAL → VERIFIED pilot |
| FR-11 | RM-003, RM-004, RM-005, RM-010, RM-011, RM-012 | RG-1/RG-2 | BLOCKED → factory-certified |
| FR-12 | RM-040, RM-041 | RG-5 | PARTIAL → VERIFIED shadow |
| FR-13 | RM-008, RM-020, RM-023 | RG-3/RG-5 | NOT VERIFIED → VERIFIED pilot |
| FR-14 | RM-009, RM-050, RM-051, RM-052 | RG-6 | NOT VERIFIED → VERIFIED pilot |
| FR-15 | RM-042, RM-043 | RG-5 | PARTIAL → finance-approved shadow |
| FR-16 | RM-001, RM-063 | RG-5 | PARTIAL → governed-write verified |
| FR-17 | RM-060, RM-061, RM-062 | RG-7 | PARTIAL → board-accepted |

## 30. Open Decisions

| Decision ID | Decision needed | Owner | Deadline |
| --- | --- | --- | --- |
| `DEC-01` | Named accountable owners for every WS/gate | Executive/Program | RG-0 |
| `DEC-02` | First machine profile/tool table | Factory Owner | day 15 |
| `DEC-03` | Factory/front/spatial/ERP/field pilot projects | Ops/Product | day 20 |
| `DEC-04` | Production key custody/KMS approach | Security | day 15 |
| `DEC-05` | Isolated DB/RLS CI environment | Platform | day 10 |
| `DEC-06` | Certified catalog seed set | Data Steward | day 60 |
| `DEC-07` | Spatial runtime/data residency/retention | Survey + PDPA | day 75 |
| `DEC-08` | First ERP object and accounting shadow rules | Finance | day 100 |
| `DEC-09` | Field device/offline support matrix | Field Ops | day 150 |
| `DEC-10` | Board KPI priority and decision owners | Executive | day 240 |
| `DEC-11` | Committed team capacity vs §22 assumption | Executive/Program | RG-0 |

## 31. Rebaseline and Change Control

- Rebaseline after RG-0, RG-3, and every quarter.
- A change request states impact on scope, date, capacity, risk, gate, and evidence.
- P0/security/invariants cannot be weakened to preserve a date.
- New work enters the critical path only when equivalent work exits or proven capacity is added.
- Vendor/AI opportunities at E2–E4 stay in discovery and do not interrupt committed releases.
- Approved changes update TH/EN Markdown, HTML, and SHA manifest together.

## 32. Deliverable Register

| Phase | Required deliverables |
| --- | --- |
| Phase 0 | Threat model, auth/release contracts, deterministic spec, verifier corpus, key runbook, CI/RLS evidence |
| Phase 1 | MachineProfileVersion, golden packets, offline verifier, operator/rollback runbooks, pilot report |
| Phase 2 | Intake map, sandbox/conversion spec, Approval Packet, catalog tier seed, UX/pilot report |
| Phase 3 | Spatial Evidence Contract, DPA/retention record, model benchmark, capture/offline report |
| Phase 4 | ERP object contracts, BOM/WO/PO/job-cost shadow reports, field/acceptance pilot report |
| Phase 5 | Metric Registry, executive dashboard, scale playbook, SLO/DR report, R1.0 evidence pack |

Project-facing documents require paired TH/EN Markdown and HTML. Machine-readable manifests, schemas, and test artifacts may use one canonical format.

## 33. Source Register

| Source ID | Source | Usage |
| --- | --- | --- |
| `RMAP-S01` | `docs/prd/monolith-complete-prd-v5.th.md` / `.en.md` | Requirements, evidence tiers, claims, as-built, blockers |
| `RMAP-S02` | `docs/prd/monolith-complete-prd-v5.sha256` | PRD v5.1 integrity |
| `RMAP-S03` | Code snapshot commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c` | As-built baseline only; dirty worktree noted |
| `RMAP-S04` | `determined-williams/docs/SAFETY_GATE.md` and factory/export/connector docs | Manufacturing/release intent |
| `RMAP-S05` | PRD §33 Claim Ledger | Claim decision and proof obligation |
| `RMAP-S06` | PRD §34 As-Built Status | FR baseline and Production Blocker Register |
| `RMAP-S07` | `docs/prd/monolith-complete-roadmap-v1.sha256` | Integrity of Roadmap TH/EN Markdown and HTML |

## 34. Program Completion Criteria

The 12-month roadmap is achieved when:

1. `RG-1` through `RG-7` have signed, unexpired verdicts and evidence
2. the factory release path is server-authorized, RELEASED-only, deterministic, signed, and fully verified
3. the controlled factory pilot passes and additional machine onboarding uses repeatable certification
4. front door, sandbox, and approval pass pilot without authority leakage
5. spatial capability remains inside the sandbox/evidence boundary and can be disabled without harming the manual truth chain
6. ERP/finance and field flows pass shadow/controlled pilots with reconciliation and rollback
7. every board KPI has owner, source lineage, baseline, and action threshold
8. no P0 blocker, required test skip, production secret, or stale critical claim remains
9. TH/EN docs, HTML, runbooks, and release evidence manifest match the deployed revision

Final decision: MONOLITH should scale when its truth chain is provable, not when its feature list merely looks complete.
