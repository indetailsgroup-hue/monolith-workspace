# Roadmap ฉบับสมบูรณ์ของ MONOLITH

วันที่เอกสาร: 2026-07-10  
ภาษา: TH  
ฉบับเอกสาร: 1.0  
ระยะเวลาแผน: 2026-07-10 ถึง 2027-06-30  
เอกสารแม่บท: `monolith-complete-prd-v5.th.md` ฉบับ 5.1  
สถานะ: Planning Baseline — target dates ต้อง rebaseline หลังผ่าน RG-0  
ผลิตภัณฑ์: MONOLITH Manufacturing OS / MONOLITH Operating System

## 1. บทสรุปผู้บริหาร

Roadmap นี้เปลี่ยน PRD v5.1 จาก target-state ให้เป็นโปรแกรมส่งมอบ 12 เดือนที่มี owner, dependency, release gate, evidence และ rollback ชัดเจน เป้าหมายไม่ใช่สร้างทุก module พร้อมกัน แต่คือรักษา manufacturing truth ให้ปลอดภัยก่อน แล้วค่อยเพิ่ม front-door speed, spatial evidence, ERP, field execution และ board intelligence ตามลำดับ

ลำดับเชิงกลยุทธ์คือ:

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

หลักตัดสินใจสำคัญ:

- ห้ามเปิด production pilot ขณะที่ P0 blocker ยังเปิด
- ห้ามให้ Concept Sandbox, SpatialLM, ERP หรือ AI/MCP มีทางลัดไป CNC/release/accounting
- วันที่ในแผนเป็น planning target ไม่ใช่ commitment จนกว่าจะผ่าน evidence gate ของ phase ก่อนหน้า
- business KPI ต้องเก็บ baseline 30–60 วันก่อนกำหนด target ยกเว้น hard safety invariant ที่ตั้งเป้าเป็นศูนย์หรือ 100% ได้ทันที
- ทุก release ต้องอัปเดต Source Register, Claim Ledger และ As-Built Status ใน PRD v5.1

## 2. อำนาจของ Roadmap และ Evidence Baseline

Roadmap นี้ subordinate ต่อ PRD v5.1 ถ้าเนื้อหาขัดกัน ให้ system invariant, prohibited action, Safety Gate policy และ production blocker ใน PRD มาก่อน schedule

| สิ่งอ้างอิง | Identity | บทบาทใน Roadmap |
| --- | --- | --- |
| PRD v5.1 TH/EN | `monolith-complete-prd-v5.sha256` | target requirements, claims, as-built baseline |
| Code snapshot | commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c` | implementation baseline ณ 2026-07-10 |
| Worktree state | dirty | ผล audit ไม่ใช่ clean-commit certification |
| Automated evidence | 4,545 root tests, TypeScript, build, 7 browser smoke ผ่าน | test-environment confidence เท่านั้น |
| Missing evidence | live DB/RLS, production deployment, real CNC, key ceremony, field pilot | ต้องปิดตาม release gates |

การเปลี่ยน code revision, source hash หรือ environment ทำให้ as-built claim ที่เกี่ยวข้องกลับเป็น `REVERIFY` จนกว่าจะ rerun gate

## 3. Program Objective และผลลัพธ์ 12 เดือน

ภายใน 2027-06-30 โปรแกรมต้องส่งมอบผลลัพธ์ต่อไปนี้:

1. production release path ที่ server-authorized, RELEASED-only, deterministic, signed และ verify ได้ครบ packet
2. factory pilot ที่ใช้ machine profile จริงอย่างน้อยหนึ่งเส้น พร้อม operator runbook และ rollback
3. front door ที่เริ่มงานเร็ว แต่ Concept Sandbox export ไป production ไม่ได้
4. approval packet ที่ bind identity, revision, quorum และ audit
5. spatial/capture pilot สำหรับ 1–2 ห้อง โดย output เป็น evidence เท่านั้น
6. ERP Backbone ที่รับ BOM snapshot จาก Released Spec และทำ shadow procurement/job cost/reconciliation ได้
7. field digital thread ที่รองรับ mobile/offline proof, issue, NCR, close-house และ customer acceptance
8. metric registry และ executive dashboard ที่ trace ทุก KPI กลับ source table/owner ได้
9. release evidence pack ที่ทำให้สถานะ `VERIFIED` พิสูจน์ซ้ำได้จาก immutable revision

## 4. Planning Principles

1. **Safety before speed:** ปิด auth/release/packet blocker ก่อนสร้าง front-door feature
2. **One truth chain:** ไม่มี release path คู่ขนานผ่าน vendor, ERP, field หรือ AI
3. **Pilot before scale:** ทุก phase ต้องมี controlled pilot ก่อนขยายเครื่องจักร/ทีม/หน่วยธุรกิจ
4. **Evidence before status:** ห้ามเลื่อน status จาก `PARTIAL` เป็น `VERIFIED` จากการประชุมหรือ demo อย่างเดียว
5. **Config before hardcode:** machine, threshold, waiver, role และ policy ต้อง version/config ได้
6. **Human authority:** AI/Spatial/OCR/MCP เสนอได้ แต่ write action สำคัญต้องผ่าน accountable human
7. **Coexistence over big bang:** ของเดิมทำงานต่อได้จน proof chain ใหม่เสถียร
8. **Rebaseline honestly:** scope/date/capacity เปลี่ยนต้องบันทึก ไม่ซ่อนด้วยการลด acceptance criteria

## 5. Assumptions and Constraints

| ประเภท | Planning assumption / constraint |
| --- | --- |
| Capacity | มี core squad ข้าม frontend/CAD, backend/platform, QA และ product; ถ้าต่ำกว่าสมมติฐาน §22 ต้องเลื่อน phase ไม่ลด safety gate |
| Factory | เลือกเครื่องจักร pilot ได้หนึ่ง profile และมี factory owner ร่วม UAT |
| Data | มี project/room ที่อนุญาตใช้ pilot และทำ PDPA classification ได้ |
| Finance | finance owner ยอมทำ shadow posting ก่อน real posting |
| Field | มี ops champion และ controlled project สำหรับ mobile/offline pilot |
| Vendor | Coohom/SmartLink เป็น benchmark จนกว่าจะผ่าน procurement gate ไม่ใช่ dependency ของ critical path |
| Deployment | ต้องมี isolated test DB, staging และ key/secrets boundary ก่อน RG-2 |
| Timeline | target date ทั้งหมด rebaseline หลัง RG-0 และทุก quarter |

## 6. As-Built Baseline

| กลุ่ม | สถานะเริ่มต้น | Roadmap implication |
| --- | --- | --- |
| Designer Workspace / Parametric Contract | VERIFIED ใน test environment | รักษา regression coverage และเพิ่ม deployed immutability proof |
| Material Stack / Connector OS | VERIFIED ใน test environment | ใช้เป็น core ของ machine pilot |
| Safety Gate / Release | PARTIAL / BLOCKED | เป็น critical path Phase 0 |
| Factory Packet / Export | PARTIAL / BLOCKED | ต้องแก้ determinism, verification, auth, key ก่อน pilot |
| Front Door / Concept Sandbox | PARTIAL / PLANNED | เริ่มหลัง RG-2 เพื่อไม่แย่ง capacity จาก safety closure |
| Spatial Evidence | PARTIAL | มี SiteSurveyZone substrate แต่ไม่มี model runtime |
| Capture / LINE | PARTIAL / NOT VERIFIED | ต้องมี DB/RLS และ live sandbox proof |
| ERP / Finance | PARTIAL | เริ่มด้วย object registry และ shadow mode |
| Field | PARTIAL / NOT VERIFIED | ต้องเพิ่ม test/offline/secret hygiene |
| Executive Analytics | PARTIAL | ทำหลัง source-table lineage พร้อม |

## 7. Workstream Model

| Workstream | Scope | Accountable role | Primary FR |
| --- | --- | --- | --- |
| `WS-00` Program Evidence & Governance | source/claim/as-built, release evidence, change control | Program Owner | all |
| `WS-01` Identity, Security & PDPA | IAM, JWT, secrets, service role, threat model, retention | Security/Platform Lead | FR-09, 13, 16 |
| `WS-02` Truth and Release Integrity | spec states, gate invariants, waiver, immutable release | Manufacturing Tech Lead | FR-06, 09 |
| `WS-03` Factory Packet & Machine | deterministic packet, signature, verify, machine profiles | Factory Integration Lead | FR-08, 11 |
| `WS-04` Front Door & Concept | intake, sandbox, conversion, presentation | Product/Design Lead | FR-01, 02, 05 |
| `WS-05` Capture & Spatial Evidence | capture, survey, provenance, SpatialLM sandbox | Capture/AI Lead | FR-03, 04 |
| `WS-06` Catalog, Material & Connector | trust tiers, certification, catalog/machine versions | Data Steward | FR-07, 08 |
| `WS-07` Approval & LINE | customer packet, identity, quorum, retry, consent | Engagement Lead | FR-10, 13 |
| `WS-08` ERP, Procurement & Finance | item/BOM/WO/WIP/PO/job cost/shadow posting | Finance Systems Lead | FR-12, 15 |
| `WS-09` Field Execution | mobile/offline, proof, issue, close-house, acceptance | Field Operations Lead | FR-14 |
| `WS-10` Analytics & Board | metric registry, dashboard, benefit realization | Data/Product Lead | FR-17 |
| `WS-11` Platform, QA & Operations | CI, DB/RLS, test parity, observability, DR/runbooks | QA/Platform Lead | all |

## 8. Master Timeline

| Phase / Release | Target dates | Primary outcome | Hard gate |
| --- | --- | --- | --- |
| Phase 0 — `R0.1 Safety Closure` | 2026-07-10 → 2026-08-09 | evidence baseline + P0 safety closure | `RG-1` |
| Phase 1 — `R0.2 Factory Pilot Ready` | 2026-08-10 → 2026-09-08 | one controlled machine path, signed/verified packet | `RG-2` |
| Phase 2 — `R0.3 Front Door Pilot` | 2026-09-09 → 2026-10-08 | intake + sandbox + conversion + approval pilot | `RG-3` |
| Phase 3 — `R0.4 Spatial Sandbox` | 2026-10-09 → 2026-12-31 | capture hardening + 1–2 room spatial pilot | `RG-4` |
| Phase 4 — `R0.5 ERP/Field Pilot` | 2027-01-01 → 2027-03-31 | ERP shadow + field digital thread | `RG-5`, `RG-6` |
| Phase 5 — `R1.0 Controlled Scale` | 2027-04-01 → 2027-06-30 | board intelligence, multi-machine/BU controlled scale | `RG-7` |

## 9. Phase 0 — Safety Closure (0–30 วัน)

เป้าหมาย: ปิดช่องที่ทำให้ production authority, release state หรือ packet integrity ถูก bypass ได้

### Scope

- `AB-AUTH-01`: server-owned actor/role mapping จาก JWT/session
- `AB-EXP-01`: CNC export require `RELEASED` ทุก entry point
- `AB-PKT-01`: canonical identity/time และ deterministic ZIP
- `AB-PKT-02`: full packet verification
- `AB-KEY-01`: production public-key set และ key rotation ceremony
- `AB-TST-01`: factory package/root test parity
- `AB-GATE-01`: strict bypass scanner ใช้งานได้
- `AB-DB-01`: isolated DB/RLS CI
- `AB-FIELD-01`: field test script และ secret hygiene
- owner, rollback, runbook และ evidence location ของ blocker ทุกตัว

### Exit criteria

- P0 blocker เปิดอยู่ = 0
- unauthorized role/header ไม่สามารถให้ authority ได้
- export จาก DRAFT/FROZEN ถูก reject ทั้ง UI, API และ direct call
- packet จาก input เดียวกันให้ hash เดียวกันใน repeat corpus
- tampered file/manifest/signature/revision/machine profile ถูก reject
- production key ไม่ใช่ placeholder และ rotation/revocation test ผ่าน
- root/package/DB required suites ผ่านและเก็บ CI artifact

## 10. Phase 1 — Factory Pilot Ready (31–60 วัน)

เป้าหมาย: พิสูจน์ truth → packet → verify → operator flow บนเครื่องจักรเป้าหมายหนึ่งเส้นโดยไม่ขยาย scope

### Scope

- freeze `MachineProfileVersion` และ tool table ของ pilot
- golden jobs ครอบ normal, boundary และ tampered cases
- signed Factory Packet + offline verifier
- operator checklist, dry-run mode, abort/rollback procedure
- packet-to-machine adapter และ post-processor conformance
- production receipt, audit event และ evidence archive
- controlled dry run ก่อน material cutting จริง

### Exit criteria

- factory owner และ QA sign-off packet golden set
- released revision, manifest, file hash, machine profile และ receipt trace กลับได้ครบ
- failed verify ไม่มีทางถูก run ต่อโดย default
- operator สามารถ verify offline และหยุดงานได้โดยไม่พึ่ง developer
- incident drill และ rollback ผ่าน

## 11. Phase 2 — Front Door and Approval Pilot (61–90 วัน)

เป้าหมาย: เพิ่มความเร็วเริ่มงานโดยไม่สร้าง production shortcut

### Scope

- Intake Router จาก LINE/web/manual intake
- Concept Sandbox ที่มี badge/state ชัดและ no-export invariant
- ConceptGraph → Parametric Contract conversion workflow
- Catalog Trust Tiers seed: Public, Project, Verified, Certified
- Approval Packet สำหรับ G1/G2/G3/G4 พร้อม identity, revision, quorum และ expiry
- presentation/render deck ที่ไม่ถูกตีความเป็น manufacturing approval
- baseline time-to-first-concept และ approval SLA

### Exit criteria

- sandbox object ไป CNC/release โดยไม่ convert ไม่ได้
- conversion ทุกครั้งมี source mapping, verifier และ owner
- customer approval bind packet hash/revision และแยกจาก factory release
- pilot users ทำ flow ได้โดยไม่ต้องรู้ internal architecture
- feedback และ abandonment reason ถูกเก็บเพื่อ rebaseline Phase 3

## 12. Phase 3 — Spatial Evidence Sandbox and Capture Hardening (เดือน 4–6)

เป้าหมาย: เร่ง survey/capture โดยคง human verification และแยกจาก release path

### Scope

- Spatial Evidence Contract สำหรับ walls/openings/object boxes/confidence/provenance
- data boundary สำหรับ video/LiDAR/RGB-D/point cloud และ retention policy
- SpatialLM/runtime PoC บน 1–2 ห้อง
- comparison กับ manual survey และ correction workload
- mobile capture, offline queue, retry/idempotency และ conflict handling
- SiteSurveyZone version/supersede flow
- promote เฉพาะ verified evidence เข้า design context

### Exit criteria

- model output ถูก mark candidate และ export production ไม่ได้
- measurement-critical field ต้อง human verify
- accuracy/correction/bias/failure taxonomy ถูกบันทึก ไม่เลือกเฉพาะ successful samples
- delete/retention/consent flow ผ่าน PDPA review
- fallback manual survey ทำงานได้เมื่อ model/service ล่ม

## 13. Phase 4 — ERP Backbone and Field Digital Thread (เดือน 7–9)

เป้าหมาย: เชื่อม released demand กับ business/field reality โดยไม่ย้าย manufacturing authority

### Scope

- Item Master/Object Registry และ identity mapping
- BOM Snapshot จาก Released Spec เท่านั้น
- Work Order, WIP, stock reservation และ procurement trigger
- committed/actual cost และ job-cost variance
- shadow accounting posting + reconciliation
- field work item, room/lane, proof, issue/NCR และ offline sync
- close-house/customer acceptance + authorization/audit

### Exit criteria

- ERP แก้ geometry/drill/CNC/release ไม่ได้
- duplicate/retry ไม่สร้าง PO, stock move หรือ journal ซ้ำ
- finance owner reconcile shadow posting กับ source documents ได้
- field proof bind released revision/room/work item
- close-house ไม่ผ่านถ้า proof/issue/authorization ไม่ครบ

## 14. Phase 5 — Board Intelligence and Controlled Scale (เดือน 10–12)

เป้าหมาย: ทำให้ผู้บริหารเห็น speed, integrity, manufacturing, field และ financial outcome จาก source ที่ trace ได้ และขยายอย่างควบคุม

### Scope

- Metric Registry: definition, owner, source table, cadence, baseline, threshold
- executive dashboard และ drill-down ถึง project/package/revision
- closed-loop rule enrichment จาก NCR/rework/variance
- machine profile เพิ่มหลัง conformance gate
- business unit rollout playbook, training และ support model
- SLO, incident response, DR/restore และ release certification

### Exit criteria

- KPI ทุกตัวมี source lineage และ owner
- ไม่มี vanity metric ที่ไม่มี decision/action
- new machine/BU ใช้ repeatable onboarding + certification
- benefit realization ผ่าน baseline comparison และ finance/ops sign-off
- R1.0 evidence pack ทำซ้ำได้จาก clean revision

## 15. Epic Register

Size เป็น relative planning size (`S`, `M`, `L`, `XL`) ไม่ใช่ duration commitment

### 15.1 Safety, Factory, and Platform Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-000` | evidence baseline, owner map, release manifest | 00 | S | none | RG-0 |
| `RM-001` | JWT/session → server-owned actor/role | 01 | L | RM-000 | RG-1 |
| `RM-002` | RELEASED-only export invariant ทุก entry point | 02 | M | RM-001 | RG-1 |
| `RM-003` | deterministic job identity/manifest/ZIP | 03 | L | RM-000 | RG-1 |
| `RM-004` | full packet verifier + negative corpus | 03 | L | RM-003 | RG-1 |
| `RM-005` | production key set, rotation, revocation | 01 | M | RM-001 | RG-1 |
| `RM-006` | package/root test-runner parity | 11 | S | none | RG-1 |
| `RM-007` | strict bypass scanner repair | 11 | S | none | RG-1 |
| `RM-008` | isolated DB/RLS integration CI | 11 | M | DEC-05 | RG-1 |
| `RM-009` | field test harness + secret hygiene | 09/11 | M | environment | RG-1 |
| `RM-010` | versioned pilot machine profile/tool table | 03/06 | M | RM-004, DEC-02 | RG-2 |
| `RM-011` | offline verifier + receipt/archive | 03 | M | RM-004, RM-005 | RG-2 |
| `RM-012` | controlled factory pilot + runbook | 03 | L | RM-010, RM-011 | RG-2 |

### 15.2 Front Door, Catalog, Approval, and Spatial Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-020` | unified intake router and evidence identity | 04/07 | L | RG-1 | RG-3 |
| `RM-021` | Concept Sandbox + no-export enforcement | 04 | L | RM-020 | RG-3 |
| `RM-022` | verified conversion to Parametric Contract | 04/02 | XL | RM-021 | RG-3 |
| `RM-023` | revision-bound Approval Packet | 07 | L | RM-020, RM-001 | RG-3 |
| `RM-024` | Catalog Trust Tiers + certified seed set | 06 | L | DEC-06 | RG-3 |
| `RM-030` | Spatial Evidence Contract/provenance | 05 | M | RM-000 | RG-4 |
| `RM-031` | SpatialLM/runtime PoC for 1–2 rooms | 05 | L | RM-030, DEC-07 | RG-4 |
| `RM-032` | mobile/offline capture hardening | 05/09 | L | RM-008 | RG-4 |
| `RM-033` | verification/promote/fallback workflow | 05/02 | L | RM-030, RM-031, RM-032 | RG-4 |

### 15.3 ERP, Field, AI Governance, Analytics, and Scale Epics

| Epic | Outcome | WS | Size | Dependency | Target gate |
| --- | --- | --- | --- | --- | --- |
| `RM-040` | Item Master/Object Registry | 08 | L | RM-001 | RG-5 |
| `RM-041` | BOM Snapshot → Work Order/WIP | 08 | XL | RM-040, Released Spec | RG-5 |
| `RM-042` | procurement + committed/actual job cost | 08 | XL | RM-041 | RG-5 |
| `RM-043` | shadow accounting + reconciliation | 08 | L | RM-042, DEC-08 | RG-5 |
| `RM-050` | field work item/room/lane + offline | 09 | XL | RM-009, RM-032 | RG-6 |
| `RM-051` | proof, issue, NCR, rework loop | 09 | L | RM-050 | RG-6 |
| `RM-052` | close-house and customer acceptance | 09/07 | L | RM-051, IAM | RG-6 |
| `RM-060` | metric registry and source lineage | 10 | M | RM-041, RM-051 | RG-7 |
| `RM-061` | executive dashboard + drill-down | 10 | L | RM-060 | RG-7 |
| `RM-062` | closed-loop rule/catalog improvement | 10/06 | L | RM-051, RM-060 | RG-7 |
| `RM-063` | Pending Invocation + governed MCP writes | 01/11 | L | RM-001, RM-000 | RG-5 |
| `RM-070` | multi-machine certification | 03 | XL | RG-2 evidence | RG-7 |
| `RM-071` | observability, SLO, incident and DR | 11 | L | RM-008, RG-2 | RG-7 |
| `RM-072` | R1.0 release certification/evidence pack | 00/11 | M | all gates | RG-7 |

## 16. Critical Path and Dependencies

### Critical Path A — Production Safety

```text
RM-000 → RM-001 → RM-002
RM-003 → RM-004 → RM-010 → RM-011 → RM-012
RM-005 ───────────────────────┘
```

Phase 1 เลื่อนไม่ได้ถ้า IAM, release invariant, determinism, verifier หรือ key ceremony ยังไม่ผ่าน

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
| `RG-0` Baseline Accepted | Program Owner + Tech Lead | scope, owner, capacity, source hashes, clean backlog | no owner/evidence = no start |
| `RG-1` Safety Closed | Security + Manufacturing Tech Lead | P0=0, auth/release/determinism/verify/key tests | any P0 = fail |
| `RG-2` Factory Pilot Ready | Factory Owner + QA | machine profile, golden packet, offline verify, runbook, rollback | failed/tampered packet runnable = fail |
| `RG-3` Front Door Pilot Ready | Product + Design Lead | no-export sandbox, conversion audit, approval identity | sandbox authority leak = fail |
| `RG-4` Spatial Pilot Accepted | Survey Lead + PDPA Owner | 1–2 room results, correction data, retention/fallback | model output reaches release = fail |
| `RG-5` ERP Shadow Accepted | Finance Lead + Ops | BOM/WO/PO/job-cost trace, idempotency, reconciliation | ERP mutates manufacturing truth = fail |
| `RG-6` Field Pilot Accepted | Field Ops + PM | offline proof, issue closure, acceptance auth | close-house without proof = fail |
| `RG-7` Controlled Scale | Executive Owner | KPI lineage, SLO/DR, training, release evidence | stale evidence/open critical risk = fail |

ทุก gate ต้องมี verdict `PASS`, `FAIL` หรือ `CONDITIONAL` พร้อม owner, timestamp, evidence links และ expiry ห้าม auto-pass จาก deadline

## 18. Pilot Portfolio

| Pilot | Scope | Success evidence | Rollback |
| --- | --- | --- | --- |
| Factory Pilot A | 1 known machine profile, controlled cabinet/job, dry run ก่อน cut | packet/verify/receipt/operator sign-off | return to approved legacy export |
| Front Door Pilot B | representative leads/projects, concept-to-approval | time baseline, conversion audit, no-export proof | manual intake + existing designer flow |
| Spatial Pilot C | 1–2 rooms, non-production path | manual comparison, correction time, failure taxonomy | manual survey remains authority |
| ERP Shadow Pilot D | representative released jobs or one full accounting cycle | BOM/PO/WIP/job-cost reconciliation | no real posting; shadow tables only |
| Field Pilot E | one controlled project from work item to acceptance | offline sync, proof binding, issue/close-house audit | parallel legacy field process |

## 19. QA and Test Strategy

| Layer | Required coverage | Release evidence |
| --- | --- | --- |
| Unit/property | math, geometry, connector, state, idempotency | deterministic CI results |
| Golden/packet | valid, boundary, tampered, wrong machine/revision/key | immutable golden corpus |
| Contract/API | auth, schema, versioning, error codes | API contract report |
| DB/RLS | role isolation, RPC, retry, duplicate, migration | isolated DB artifact |
| Browser E2E | release, export, approval, failure states | screenshots/report |
| Security | header spoof, privilege escalation, secret scan, key rotation | threat-test report |
| Field/offline | queue, conflict, retry, reconnect, device loss | device/offline report |
| Factory UAT | dry run, operator verify, abort, receipt | signed pilot checklist |
| Finance reconciliation | shadow vs source/legacy | accountant sign-off |
| Disaster recovery | backup/restore, key revocation, service outage | drill report |

required test ห้ามถูก skip ใน release candidate ถ้า environment ยังไม่มี ให้ gate เป็น `NOT VERIFIED` ไม่ใช่ pass

## 20. Security, PDPA, and Key Management Plan

- server derives actor/role จาก trusted session/JWT เท่านั้น
- service-role credential ไม่ออกสู่ client และ function ต้อง enforce authorization ก่อน privileged RPC
- secret inventory, owner, rotation date และ emergency revoke path ต้องอยู่ใน runbook
- signing key แยก environment; production private key ห้ามอยู่ใน repo
- public-key set ต้อง version, revoke และ verify historical receipt ได้
- site photos/video/point cloud/PII ต้องมี purpose, consent, residency, retention และ deletion policy
- vendor transfer ต้องผ่าน DPA, data-flow review และ minimum-data design
- audit event สำคัญเป็น append-only และผูก actor/session/revision
- incident response ต้องมี kill switch สำหรับ export, AI writes, vendor integration และ field closeout

## 21. Migration and Coexistence Plan

| Stage | Legacy behavior | New behavior | Exit condition |
| --- | --- | --- | --- |
| Shadow | legacy remains authoritative | new system observes/calculates | parity report acceptable |
| Dual-run | controlled jobs use both | compare packet/ERP/field outputs | discrepancy within approved policy |
| Controlled cutover | selected BU/machine uses new path | rollback ready | pilot gate passed |
| Scale | additional machine/BU onboarded | certification per profile | repeatable evidence pack |

migrated object ต้อง preserve identity, revision, provenance และ confidence ห้าม regenerate old packet ให้ดูเหมือน new evidence โดยไม่มี parity

## 22. Team Capacity and RACI

### 22.1 Planning Capacity Assumption

สมมติฐานขั้นต่ำสำหรับ timeline นี้ ไม่ใช่ headcount commitment:

- 1 Program/Product Owner
- 1 Technical Lead/Architect
- 2 Frontend/CAD engineers
- 2 Backend/Platform engineers
- 1 QA/SDET
- 0.5 DevOps/Security
- 0.5 Data/Analytics
- rotating domain owners: Factory, Survey, Field, Finance, Legal/PDPA, Data Steward

ถ้าขาด core role เกินหนึ่ง sprint ต้อง rebaseline critical path ห้ามชดเชยด้วยการข้าม gate

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
| Daily during Phase 0 | blocker stand-up | owner, next evidence, unblock action |
| Weekly | program delivery review | epic status, critical path, risk/decision log |
| Biweekly | release evidence review | test/evidence freshness, claim/as-built updates |
| Monthly | executive steering | scope/date/capacity tradeoff, benefit baseline |
| Per gate | gate review | signed verdict, conditions, expiry, rollback |
| Quarterly | roadmap rebaseline | phase dates, capacity, procurement and KPI targets |

WIP limit: phase ละไม่เกิน 3 critical epics active และ workstream ละ 1 primary epic เว้นแต่ Program Owner อนุมัติ capacity/evidence plan

## 24. KPI and Benefit Realization

### 24.1 Hard Invariants

| KPI | Target before production pilot |
| --- | --- |
| Open P0 blocker | 0 |
| Unauthorized release/export | 0 |
| CNC export not RELEASED | 0 |
| Deterministic packet repeat | 100% ของ golden corpus |
| Tampered packet rejection | 100% ของ negative corpus |
| Required DB/RLS/security suites | 100% pass, 0 required skip |
| Repository production secret | 0 |

### 24.2 Business/Operational Metrics

| Cluster | Metrics | Target policy |
| --- | --- | --- |
| Speed | time-to-first-concept, survey-to-verified, approval SLA | baseline 30–60 วันก่อน target |
| Integrity | render-to-release drift, approval completeness, waiver rate | baseline + root-cause threshold |
| Manufacturing | first-pass gate, post error, packet rejection, scrap/rework | factory-verified baseline |
| Field | offline sync success, issue rate, punch-list age, acceptance completion | pilot baseline |
| Financial | BOM-to-PO lag, WIP accuracy, job-cost variance, capture-to-post lag | finance-reviewed baseline |
| Governance | stale claim/evidence, conditional gate age, unresolved P0/P1 | zero stale critical evidence |

## 25. Risk Register

| Risk | Trigger | Impact | Mitigation / owner |
| --- | --- | --- | --- |
| P0 closure slips | blocker lacks owner/evidence > 3 days | all later phases slip | daily escalation; Tech Lead |
| dirty worktree invalidates audit | release built from unknown state | evidence unreliable | clean release branch + manifest; Platform |
| machine profile drift | tool/profile changes without version | unsafe output | signed/versioned profile; Factory |
| DB/RLS not exercised | required tests skipped | data/auth leak | isolated DB CI; QA/Platform |
| front-door scope explosion | render/catalog requests crowd safety work | critical path slip | RG-2 prerequisite; Product |
| SpatialLM overpromise | demo treated as measurement truth | field/manufacturing error | sandbox/no-release invariant; Survey |
| ERP becomes truth owner | ERP writes manufacturing fields | silent drift | contract/RLS deny; Tech/Finance |
| field adoption low | proof completion below baseline | loop not closed | one-hand UX, ops champion, coexistence |
| vendor claim mismatch | API/machine behavior differs from marketing | procurement waste | demo/contract/conformance gate |
| key/secrets mishandled | placeholder/shared keys persist | forgery/incident | key ceremony, rotation, secret scan |
| capacity below plan | critical roles unavailable | schedule compression pressure | rebaseline scope/date; Program Owner |
| KPI gaming | metric lacks source/owner/action | false confidence | Metric Registry + audit; Data Lead |

## 26. Procurement and External Dependency Gates

| Dependency | Before commitment | Decision output |
| --- | --- | --- |
| Coohom/SmartLink | paid demo, machine matrix, API contract, packet sample, DPA/data residency, TCO | integrate, isolate as optional adapter, or reject |
| SpatialLM/runtime | model/license, compute, data boundary, accuracy/correction benchmark | sandbox continue/stop; never direct release |
| KMS/HSM/signing | key custody, rotation, revoke, audit, recovery | approved production key architecture |
| LINE | consent, retry, rate limit, template/policy, outage fallback | production communication boundary |
| Supabase/DB | region, backup, RLS, service-role custody, restore drill | staging/production readiness |
| CNC/post vendor | file contract, units, axes, tools, error behavior, support | certified MachineProfileVersion |

## 27. 30/60/90-Day Action Plan

### Day 0–30

- assign owner/target evidence ให้ blocker ทุกตัว
- close IAM, RELEASED-only export, determinism, verifier และ key P0
- repair package tests, bypass scanner, DB/RLS environment และ field hygiene
- create clean release branch and evidence archive
- hold RG-1; fail if any P0 remains

### Day 31–60

- freeze one machine profile/tool table
- build golden/negative packet corpus and offline verifier
- run controlled dry run, operator training and rollback drill
- collect receipt/audit evidence
- hold RG-2

### Day 61–90

- implement intake router, Concept Sandbox, conversion and Approval Packet
- seed Catalog Trust Tiers
- run representative front-door pilot
- baseline speed/approval metrics
- hold RG-3 and rebaseline months 4–12

## 28. Definition of Ready and Definition of Done

### Definition of Ready

epic พร้อมเริ่มเมื่อมี FR/Claim/Blocker linkage, accountable owner, dependency, data/privacy classification, acceptance tests, rollback, observability และ evidence destination

### Definition of Done

epic เสร็จเมื่อ:

- code/schema/config review ผ่าน
- required tests ผ่านโดยไม่มี unapproved skip
- security/PDPA/threat cases ที่เกี่ยวข้องผ่าน
- failure, retry, offline และ rollback ถูกพิสูจน์
- runbook/owner/telemetry พร้อม
- pilot/UAT evidence ผูก immutable revision
- PRD Claim Ledger และ As-Built Status ถูกอัปเดต
- gate owner ลง verdict และ expiry

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
| `DEC-01` | named accountable owners ทุก WS/gate | Executive/Program | RG-0 |
| `DEC-02` | first machine profile/tool table | Factory Owner | day 15 |
| `DEC-03` | factory/front/spatial/ERP/field pilot projects | Ops/Product | day 20 |
| `DEC-04` | production key custody/KMS approach | Security | day 15 |
| `DEC-05` | isolated DB/RLS CI environment | Platform | day 10 |
| `DEC-06` | Certified catalog seed set | Data Steward | day 60 |
| `DEC-07` | Spatial runtime/data residency/retention | Survey + PDPA | day 75 |
| `DEC-08` | first ERP object and accounting shadow rules | Finance | day 100 |
| `DEC-09` | field device/offline support matrix | Field Ops | day 150 |
| `DEC-10` | board KPI priority and decision owners | Executive | day 240 |
| `DEC-11` | committed team capacity vs §22 assumption | Executive/Program | RG-0 |

## 31. Rebaseline and Change Control

- rebaseline หลัง RG-0, RG-3 และทุก quarter
- change request ต้องระบุผลต่อ scope, date, capacity, risk, gate และ evidence
- P0/security/invariant ห้ามลดเพื่อรักษาวันส่ง
- งานใหม่เข้า critical path ได้เมื่อเอางานเทียบเท่าออกหรือเพิ่ม capacity ที่พิสูจน์ได้
- vendor/AI opportunity ที่ยัง E2–E4 อยู่ใน discovery lane ไม่แทรก committed release
- approved change ต้องอัปเดตทั้ง TH/EN Markdown, HTML และ SHA manifest

## 32. Deliverable Register

| Phase | Required deliverables |
| --- | --- |
| Phase 0 | threat model, auth/release contracts, deterministic spec, verifier corpus, key runbook, CI/RLS evidence |
| Phase 1 | MachineProfileVersion, golden packets, offline verifier, operator/rollback runbooks, pilot report |
| Phase 2 | intake map, sandbox/conversion spec, Approval Packet, catalog tier seed, UX/pilot report |
| Phase 3 | Spatial Evidence Contract, DPA/retention record, model benchmark, capture/offline report |
| Phase 4 | ERP object contracts, BOM/WO/PO/job-cost shadow reports, field/acceptance pilot report |
| Phase 5 | Metric Registry, executive dashboard, scale playbook, SLO/DR report, R1.0 evidence pack |

deliverable ที่เป็น project-facing document ต้องมี TH/EN Markdown และ HTML คู่กัน ส่วน machine-readable manifest/schema/test artifact ใช้ format canonical เดียวได้

## 33. Source Register

| Source ID | Source | Usage |
| --- | --- | --- |
| `RMAP-S01` | `docs/prd/monolith-complete-prd-v5.th.md` / `.en.md` | requirements, evidence tiers, claims, as-built and blockers |
| `RMAP-S02` | `docs/prd/monolith-complete-prd-v5.sha256` | PRD v5.1 integrity |
| `RMAP-S03` | code snapshot commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c` | as-built baseline only; dirty worktree noted |
| `RMAP-S04` | `determined-williams/docs/SAFETY_GATE.md` และ factory/export/connector docs | manufacturing/release intent |
| `RMAP-S05` | PRD §33 Claim Ledger | claim decision and proof obligation |
| `RMAP-S06` | PRD §34 As-Built Status | FR baseline and Production Blocker Register |
| `RMAP-S07` | `docs/prd/monolith-complete-roadmap-v1.sha256` | integrity ของ Roadmap TH/EN Markdown และ HTML |

## 34. Program Completion Criteria

Roadmap 12 เดือนถือว่าบรรลุเมื่อ:

1. `RG-1` ถึง `RG-7` มี signed verdict และ evidence ที่ยังไม่หมดอายุ
2. factory release path เป็น server-authorized, RELEASED-only, deterministic, signed และ full-verified
3. controlled factory pilot ผ่านและ onboarding machine เพิ่มใช้ certification ซ้ำได้
4. front door/sandbox/approval ผ่าน pilot โดยไม่มี authority leak
5. spatial capability อยู่ใน sandbox/evidence boundary และปิดได้โดยไม่กระทบ manual truth chain
6. ERP/finance และ field flow ผ่าน shadow/controlled pilot พร้อม reconciliation/rollback
7. KPI board ทุกตัวมี owner, source lineage, baseline และ action threshold
8. ไม่มี P0 blocker, required test skip, production secret หรือ stale critical claim
9. TH/EN docs, HTML, runbooks และ release evidence manifest ตรงกับ deployed revision

คำตัดสินสุดท้าย: MONOLITH ควร scale เมื่อ truth chain พิสูจน์ได้ ไม่ใช่เมื่อ feature list ดูครบ
