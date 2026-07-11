# PRD ฉบับสมบูรณ์ของ MONOLITH

วันที่เอกสาร: 2026-07-10  
ภาษา: TH  
ฉบับเอกสาร: 5.1 (Evidence-Control Revision)  
ผลิตภัณฑ์: MONOLITH Manufacturing OS / MONOLITH Operating System  
ขอบเขต: PRD ฉบับ canonical ที่ merge จาก PRD v3 ซึ่งมี requirement รายละเอียด, ส่วน program execution ที่ตรวจทานจาก PRD v4, งานวิจัย Coohom/front door, ERP research, แนวทาง SpatialLM, doctrine ด้าน manufacturing truth และ field execution architecture

## 1. บทสรุปผู้บริหาร

MONOLITH ไม่ใช่ interior design app ทั่วไป และไม่ใช่ Coohom+DAPH integration. MONOLITH คือ operating system ที่ทำให้งาน custom interior และ built-in furniture เดินจาก design ไป factory packet และงานติดตั้งจริงได้อย่าง verify ได้

พันธกิจของสินค้า:

> ทำให้ 10 นาทีแรกเร็ว เห็นภาพ และสร้างความมั่นใจ แต่ทำให้ last mile deterministic, gated, traceable และ field-verifiable

ศูนย์ถ่วงถาวรของระบบคือ **manufacturing truth + field execution**. AI, render, catalog, SpatialLM, ERP, LINE และ approval มีคุณค่าเมื่อช่วยเสริมเส้นโซ่ที่ตรวจสอบได้เท่านั้น:

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

หลักการปกครองระบบคือ:

**Design is free. Manufacturing is deterministic. Field reality closes the loop.**

## 2. การวางตำแหน่งเชิงยุทธศาสตร์

| กรอบสินค้า | คำตัดสิน |
| --- | --- |
| MONOLITH คืออะไร | design-to-factory-to-field operating system สำหรับงาน built-in furniture และ interior custom |
| MONOLITH ไม่ใช่อะไร | ไม่ใช่ generic room planner, decorative render tool, generic ERP หรือ clone Coohom |
| สิ่งที่เรียนจาก Coohom | เริ่มเร็ว, editable scene, catalog browsing, visual confidence, presentation polish |
| สิ่งที่ MONOLITH ต้องรักษา | Parametric Contract, Material Stack, Connector OS, Safety Gate, signed Factory Packet, LINE-native field proof, audit, Thai operating context |
| ใช้ SpatialLM เพื่ออะไร | Spatial Evidence Compiler: อ่าน point cloud/video/RGB-D/LiDAR เป็น candidate walls/openings/bounding boxes |
| ไม่ใช้ SpatialLM เพื่ออะไร | ห้ามสร้าง CNC path, เปลี่ยน release state, หรือแทน Safety Gate |
| ใช้ ERP idea เพื่ออะไร | business backbone: document states, item master, BOM snapshot, WIP, job cost, stock, PO, ledger |
| ERP ห้ามทำอะไร | ห้ามแก้ manufacturing geometry, drill map, CNC หรือ release state โดยตรง |

## 3. ขอบเขตหลักฐาน

PRD นี้แยกหลักฐานเป็น:

| ชั้นหลักฐาน | ความหมาย |
| --- | --- |
| Existing system evidence | PRD เดิม, blueprint, migration, API docs, Connector OS, Safety Gate, LINE architecture, Customer Journey, Requirements Overview |
| Research-backed benchmark | Coohom public pages/research, NIST AI RMF, ISO 9241-210, ISO 23247, Microsoft Human-AI guidelines, SpatialLM paper |
| Product requirement | พฤติกรรมเป้าหมายที่ต้อง build หรือ formalize ใน MONOLITH |
| Roadmap item | สิ่งที่จะ implement ภายหลัง ไม่ใช่ production claim ปัจจุบัน |

ห้ามใช้ requirement ใน PRD นี้ไป claim ว่า module ใด production-ready จนกว่าจะมี code, test, deployment evidence และ operational proof รองรับ

ฉบับนี้ลบ citation marker แบบ generated ที่ trace กลับไม่ได้ออกทั้งหมด และใช้ Evidence Tier, Source Register, Claim Ledger และ As-Built Status ท้ายเอกสารเป็นระบบ traceability หลัก ถ้า requirement ใดอิงงานวิจัยภายนอก ทีม implementation ต้องใส่ source ID และ exact source link ใน epic หรือ design spec ก่อนเริ่ม development

## 4. Product Vision

MONOLITH ควรเป็น business operating spine สำหรับงาน interior/furniture ที่มี manufacturing เป็นศูนย์ถ่วง:

1. รับ input ที่ messy จาก LINE, site survey, photo, document, measurement และ design brief
2. แปลง input เป็น structured evidence ผ่าน Capture Spine และ Spatial Evidence Compiler
3. ให้ designer explore ได้เร็วใน Concept Sandbox
4. convert เฉพาะ intent ที่ verify แล้วเข้า Parametric Contract
5. ตรวจ production readiness ผ่าน Safety Gate
6. release factory packet แบบ deterministic พร้อม signature, manifest และ offline verification
7. execute งานโรงงานและหน้างานผ่าน work order, room/lane task, proof, issue และ acceptance
8. feed actual cost, defect, rework และ field deviation กลับเข้า dashboard ผู้บริหาร

คำสัญญาระดับ board:

> MONOLITH คือระบบสำหรับธุรกิจที่เสียเงินจริงเมื่อ render, measurement, cutlist, purchase order, CNC file, installation proof และ customer approval ไม่ตรงกัน

## 5. Business Goals and Outcomes

### 5.1 Strategic Goals

| Goal | ความหมายต่อการตัดสินใจ |
| --- | --- |
| ลด design-to-factory mismatch | ลด rework ที่เกิดจาก visual design, cabinet structure, material stack, connector rules, cutlist, CNC และ factory packet ไม่ตรงกัน |
| ลด field uncertainty | site reality, installation issue, proof photo, room/lane status และ customer acceptance กลายเป็น governed evidence ไม่ใช่ noise ใน chat |
| เพิ่ม approval integrity | approval ของลูกค้า, designer lead, production, finance และ executive ผูกกับ revision, scope, timestamp, channel และ owner ชัดเจน |
| สร้าง ERP-ready backbone โดยไม่เสีย manufacturing truth | item master, BOM snapshot, stock, PO, WIP, job cost และ ledger รับ truth จาก Released Spec และห้าม overwrite production geometry |
| รักษาความเร็วของ front door | intake, concept, visual confidence, catalog browsing และ approval packet เร็วขึ้นโดยไม่สร้างทางลัดอันตรายสู่ production |

### 5.2 Measurable Business Outcomes

| Outcome cluster | ตัวอย่าง metric | Owner เริ่มต้น | กติกาการวัด |
| --- | --- | --- | --- |
| Front-door speed | time to first useful concept, intake-to-qualified-brief time, approval packet preparation time | Product + Sales Ops | เก็บ baseline 30-60 วันแรก แล้วตั้ง target ตามประเภท project |
| Manufacturing quality | first-pass Safety Gate pass rate, factory packet rejection rate, CNC/post error rate, rework/scrap cost | Designer Lead + Factory Lead | วัดตาม released package และ machine profile version |
| Field execution | room/lane completion accuracy, issue aging, punch-list age, close-house cycle time | Operations Lead | วัดตาม project, room, lane และ installation phase |
| Financial control | job cost variance, committed-vs-actual variance, capture-to-post lag, WIP accuracy | Finance Owner | วัดตั้งแต่ Released Spec snapshot ไปถึง actual cost และ ledger posting |
| Governance | waiver count, escalation count, approval SLA, audit completeness | Executive Owner | review รายสัปดาห์ช่วง pilot และรายเดือนหลัง stabilize |

## 6. Non-Goals

MONOLITH ต้องประกาศให้ชัดว่าสิ่งต่อไปนี้ไม่ใช่เป้าหมาย เพื่อกัน scope ที่ดูน่าสนใจแต่ทำลาย operating spine:

- ไม่ใช่ generic decorative room planner
- ไม่ใช่ Coohom clone และไม่ใช่ dependency บน Coohom
- ไม่ใช่การแทน ERP/accounting workflow ทั้งหมดแบบ big-bang ตั้งแต่วันแรก
- ไม่ใช่ public multi-tenant SaaS ก่อนพิสูจน์ truth chain, privacy model และ operational controls
- ไม่ใช่ autonomous AI production-release system
- ไม่ใช่ SpatialLM-driven CNC generator
- ไม่ใช่ renderer ที่ทำให้ visual confidence ถูกเข้าใจผิดว่าเป็น manufacturing truth

## 7. Assumptions and Constraints

### 7.1 Assumptions

- ทีมจะยอมรับ workflow ที่เข้มขึ้น ถ้า front door เร็วขึ้นและ field work friction ต่ำลง
- machine profile ชุดแรกมีจำนวนจำกัด versioned และมี owner ชัดเจน
- Released Spec เป็นจุดเริ่มของ BOM snapshot, work order, procurement และ job-cost traceability
- ผู้บริหารเลือก phased rollout และ coexistence มากกว่า big-bang rewrite
- LINE/PWA ยังเป็น surface สำคัญ เพราะลูกค้าและทีมหน้างานไม่ควรถูกบังคับให้เรียนระบบลึก

### 7.2 Constraints

- sensitive data ต้องอยู่ใน controlled boundary เมื่อ PDPA, customer confidentiality หรือ operational policy กำหนด
- SpatialLM เริ่มในฐานะ sandbox/prototype evidence และห้ามแตะ release, CNC หรือ accounting path
- accounting posting ต้อง co-design กับ finance owner; product หรือ AI ตัดสิน ledger policy เองไม่ได้
- workflow ใดที่กระทบ production, payment, customer acceptance หรือ factory output ต้องมี authorization, audit, rollback/correction path และ owner
- factory packet verification และ field proof capture ต้องมี offline/degraded-mode behavior

## 8. ปัญหาหลักที่แก้

| ปัญหา | คำตอบของ MONOLITH |
| --- | --- |
| design สวยแต่ผลิตไม่ได้ | visual output เป็น production truth ไม่ได้จนกว่าจะ convert และผ่าน gate |
| site measurement messy | site survey capture + Spatial Evidence Compiler + human verification |
| AI hallucinate dimension/geometry | AI เป็น parser/advisor ไม่ใช่ release authority |
| CNC files trace ไม่ได้ | Factory Packet, manifest, checksums, signed receipt, offline verify |
| handoff กระจัดกระจาย | canonical workflow 8 ขั้นพร้อม RACI, approval, SLA, escalation |
| field proof อยู่ใน chat | LINE group evidence ถูก capture, classify, verify และผูกกับ Work_Item |
| ERP data drift จาก production data | ERP Backbone รับ snapshot จาก Released Spec ไม่แก้ manufacturing truth เอง |
| customer approval คลุมเครือ | Approval Packet ผูก scope, render, revision, timestamp, identity และ channel |
| บริบทไทยสำคัญ | PDPA-by-architecture, self-host OCR/LLM, VAT/WHT/eTax ไทย, LINE-native UX |

## 9. Guiding Principles

1. **Manufacturing Truth Wins**: production output มาจาก Parametric Contract, Safety Gate, Released Spec, Factory Packet, OperationGraph และ manifest
2. **Visual Is Not Truth**: render และ concept scene เป็น communication artifact จนกว่าจะถูก convert
3. **Spatial AI Is Evidence, Not Authority**: SpatialLM อ่านโลกได้ แต่ตัดสิน release ไม่ได้
4. **Human Verification Is Mandatory**: capture, spatial interpretation, accounting, approval และ release ต้องมี accountable human ในจุดสำคัญ
5. **No Silent Drift**: ทุก change หลัง approval ต้องมี revision, reason และ audit
6. **Gate Failure Is Product Value**: ระบบต้องอธิบายว่าทำไม block และ fix อย่างไรจึงปลอดภัย
7. **LINE Is the Human Surface**: ลูกค้า ทีมหน้างาน และ approval ใช้ช่องทางคุ้นเคย โดยมี back-end control เข้ม
8. **ERP Is a Business Layer**: ERP backbone ดู job cost, WIP, stock, PO, invoice, ledger แต่ไม่เป็นเจ้าของ CNC truth
9. **PDPA by Architecture**: sensitive data ต้อง controlled, redacted และ purpose-bound
10. **Append-Only Audit**: approval, capture decision, release event, packet signature และ field proof ต้อง immutable

## 10. Personas and Operating Roles

| Persona | งานหลัก | Surface หลัก |
| --- | --- | --- |
| Executive Owner | ตัดสิน high-risk approval, budget exception, roadmap, KPI | Executive dashboard, escalation feed |
| Sales / Engagement | รับ lead, qualify, สร้าง requirement record | LINE OA, PWA, CRM-lite intake |
| Surveyor | เก็บ site reality: dimension, opening, MEP, photo, constraint | Mobile/PWA, Spatial Survey, Capture Spine |
| Designer | สร้าง concept, convert เป็น parametric design, แก้ gate blocker | Designer Workspace, Concept Sandbox, Truth HUD |
| Designer Lead | approve design gate, freeze/release spec, handle critical revision | Gate panel, Approval Packet, release controls |
| 3D Visualizer | ทำ presentation render/deck โดยรักษา revision truth | Render deck, client view |
| Production Planner | แปลง Released Spec เป็น BOM, routing, schedule, work order | ERP Backbone, Factory Packet viewer |
| Factory Operator | execute packet, verify files, operate CNC/post outputs | Factory UI, offline receipt verifier |
| QA | ตรวจ output, capture defect/rework, link NCR to packet/spec | QC capture, NCR dashboard |
| Installation Team Lead | เริ่ม T0, คุม rooms/lanes, close house, ขอ customer acceptance | LINE group, Installation PWA |
| Installation Crew | ทำงาน, upload proof, report issue อย่างน้อย friction | LINE group, mobile checklist |
| Accountant / Purchasing | verify document, post ledger, VAT/WHT, PO, stock, job cost | Accounting module, Capture Spine |
| Finance Policy Owner | ถือ policy VAT/WHT/eTax, posting threshold, approval limit และ accounting coexistence | Finance policy console, ERP Backbone, escalation queue |
| Data Steward | ถือ item master, certified catalog, mapping integrity, naming และ trust-tier hygiene | Catalog admin, object registry, audit dashboard |
| Customer | approve design และ installation โดยไม่ต้องเรียนระบบ | LINE Flex, web fallback, curated client view |
| AI Agent / MCP Client | read, summarize, propose, route, prepare action ภายใต้ governance | MCP tools, pending invocation queue |

## 11. End-to-End Customer Journey

canonical journey:

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

- ลูกค้าไม่ต้องมี MONOLITH account
- ลูกค้าเห็น curated update ไม่ใช่ noise ภายใน
- ลูกค้า approve ผ่าน LINE Flex หรือ short-lived web fallback
- customer approval ผูก revision, scope, timestamp และ channel
- ลูกค้าขอแก้หลัง lock ต้องเข้า revision/requote workflow

### Internal Requirements

- ทุกขั้นมี RACI, owner, approver, SLA, status และ audit
- ข้ามขั้นไม่ได้ถ้าไม่มี allowed transition และ audit reason
- G1/G2/G3/G4 lock ป้องกันการแก้ scope ที่ approve แล้วแบบเงียบ ๆ
- RPN/budget/critical risk escalate ถึง executive owner
- quiet hours และ digest ลด notification noise

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
| Intake Router / Concept Sandbox | เริ่มงานเร็วโดยไม่ทำให้ early visual exploration ถูกเข้าใจผิดว่าเป็น production truth |
| Spatial Evidence / Capture Spine | แปลง site/document evidence ที่ messy ให้เป็น record ที่ verify ได้และมี provenance |
| Designer Workspace / Parametric Contract | เปลี่ยน design intent เป็น candidate manufacturing truth ที่ตรวจได้ |
| Material Stack / Connector OS / Safety Gate | เปลี่ยน design เป็น deterministic manufacturing decision และอธิบาย blocker ได้ |
| Released Spec / Factory Packet / Export | สร้าง factory packet ที่ signed, repeatable และ verify offline ได้ |
| ERP Backbone | แปลง released demand เป็น business control: BOM snapshot, routing, WIP, procurement, stock, job cost และ ledger |
| Field Layer | ปิด loop ด้วย installed reality, issue proof, punch list, customer acceptance และ field variance |
| Governance / MCP | ให้ automation ช่วยงานได้โดยไม่เสีย authorization, audit, data minimization หรือ human accountability |

## 14. Functional Requirements

### FR-01 Front Door Intake Router

**Priority:** P0  
**Purpose:** แปลง first-touch input ทุกแบบให้เข้าช่อง governance ที่ถูก

Inputs:

- prompt หรือ design brief
- floor plan image/PDF/DWG/DXF ตามที่ support จริง
- room/site photo
- walkthrough video หรือ RGB-D/LiDAR scan
- LINE message หรือ customer requirement
- existing project/job
- manual template/module start

router ต้อง classify input เป็น:

| Mode | ความหมาย | next step ที่อนุญาต |
| --- | --- | --- |
| Concept | mood, layout, visual idea | Concept Sandbox |
| Site Evidence | measurement, photo, scan, site condition | Spatial Evidence + human verification |
| Production Intent | cabinet/module/material/hardware request | Parametric Contract candidate |
| Business Evidence | quote, receipt, PO, issue, approval | Capture Spine document workflow |

Acceptance criteria:

- ไม่มี intake ใดสร้าง production data โดยตรง
- ทุก intake มี source, user, timestamp, confidence/provenance ถ้ามี
- input ที่ low-confidence หรือ ambiguous ต้อง human review

### FR-02 Concept Sandbox

**Priority:** P0  
**Purpose:** ให้ front-door speed แบบ Coohom โดยไม่ทำลาย manufacturing truth

Capabilities:

- AI-assisted layout/styling alternatives
- mood/material exploration
- drag/drop modules และ decorative assets
- editable scene graph
- render preview และ client presentation draft
- workflow "Convert to production candidate"

Constraints:

- sandbox สร้าง BOM, PO, cutlist, CNC, Factory Packet หรือ release state ไม่ได้
- sandbox data ถูก mark เป็น non-manufacturing truth
- conversion ทุกครั้งสร้าง diff และ unknowns list

### FR-03 Spatial Evidence Compiler

**Priority:** P0 สำหรับ sandbox prototype, P1 สำหรับ production workflow  
**Purpose:** ใช้เทคโนโลยีแบบ SpatialLM เพื่ออ่าน spatial reality ไม่ใช่ตัดสิน manufacturing

Input candidates:

- point cloud
- RGB-D/LiDAR scan
- mobile walkthrough video ที่ถูก process เป็น point cloud
- concept scene ที่แปลงเป็น geometry เพื่อ check

Output candidates:

- walls, doors, windows
- 3D oriented bounding boxes
- object category และ orientation
- room boundary / opening constraints
- clearance และ collision hints

Governance:

- spatial output เป็น candidate evidence เท่านั้น
- ต้อง human verification ก่อน commit เข้า SiteSurveyZone หรือ Parametric Contract
- ไม่มี direct path ไป CNC, drill map, Factory Packet, RELEASED state หรือ accounting posting
- ต้อง log source, model version, confidence, verifier และ final accepted values

Phase 1 acceptance:

- process ห้อง pilot 1-2 ห้อง
- generate walls/openings/large-object bounding boxes
- มี overlay review UI
- commit เฉพาะ verified site constraints
- วัด survey/recode time และ spatial-error detection

### FR-04 Capture Spine

**Priority:** P0  
**Purpose:** แปลง messy evidence เป็น structured, verified, auditable records

Capture types:

- customer_requirement
- site_survey
- spec_draft
- installation_proof
- qc_capture
- expense_document
- material_receipt
- field_purchase_request

Rules:

- lifecycle: proposed -> approved/rejected -> emitted -> superseded
- ห้ามเดา placeholder
- OCR/AI output เป็น draft จนกว่ามนุษย์ verify
- fraud flags เป็น warning ไม่ใช่ reject เงียบ เว้นแต่นโยบายกำหนด
- commit adapters เขียนได้เฉพาะ target ที่อนุญาต

### FR-05 Designer Workspace

**Priority:** P0  
**Purpose:** เป็น production-aware design surface หลัก

Required surfaces:

- ซ้าย: Designer Intent panel
- กลาง: 2D/3D viewport พร้อม view modes
- ขวา: Parametric Contract panel
- Truth HUD ที่เห็นใน context design

Required capabilities:

- parametric cabinet/module modeling
- material stack selection
- hardware selection และ preview
- X-Ray drill map view
- measurement และ snap tools
- project save/version lineage
- gate status visible during design

### FR-06 Parametric Contract

**Priority:** P0  
**Purpose:** เป็น candidate manufacturing truth

ต้อง define:

- cabinet/module identity
- dimensions และ tolerances
- panel roles และ quantities
- material stack และ edge banding
- hardware/connector rules
- site constraints
- revision state
- linked concept/evidence sources

Rules:

- mutation หลัง approval ต้องมี revision reason
- contract ห้ามเกิดจาก concept โดยไม่มี conversion workflow
- contract release ไม่ได้ถ้าไม่ผ่าน Safety Gate

### FR-07 Catalog Trust Tiers

**Priority:** P0  
**Purpose:** ให้ browse เร็วโดยไม่ปน production truth

| Tier | ตัวอย่าง | ใช้ได้ถึงไหน |
| --- | --- | --- |
| Decorative | sofa, lamp, vase | render/presentation only |
| Spec-bound | finish, paint, fixture SKU | proposal/spec, no CNC |
| Production-bound | board, edge band, hinge, rail | BOM/cost/gate candidate |
| Certified | verified material/hardware/machine profile | Factory Packet/CNC eligible |

Acceptance:

- decorative asset เป็น production item ไม่ได้ถ้าไม่มี explicit mapping
- certified asset ต้องมี version, supplier, spec และ approval owner

### FR-08 Material Stack + Connector OS

**Priority:** P0  
**Purpose:** compile furniture hardware เป็น deterministic manufacturing instructions

Requirements:

- แยก finished visual envelope ออกจาก production core drilling
- support core vs surface vs glue vs edge banding thickness
- support DRILL_ON_CORE และ DRILL_ON_FINISHED modes
- compile hardware specs ผ่าน Selection -> Placer -> Synthesis -> Emission
- emit OperationGraph metadata สำหรับ pair, role, frame, connector, feature
- enforce System 32 และ Connector OS rules ผ่าน Gate

### FR-09 Safety Gate and Release State

**Priority:** P0  
**Purpose:** เป็น manufacturing authority

Release states:

```text
DRAFT -> FROZEN -> GATED -> RELEASED -> EXPORTED
```

Gate ต้อง validate:

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

- BLOCKER ป้องกัน release/export
- WARNING waive ได้เฉพาะพร้อม role, reason และ audit
- auto-fix patch ต้อง deterministic
- export จาก non-released state ห้าม เว้น simulation output ที่กำหนดชัด

### FR-10 Approval Packet

**Priority:** P0  
**Purpose:** ทำให้ approval ชัดทั้งทางกฎหมายและ operational

Approval packet ประกอบด้วย:

- render/image set
- scope summary
- room/lane/module list
- material/hardware summary
- exclusions และ assumptions
- revision ID
- gate status
- price/variation status ถ้ามี
- approver identity, timestamp, channel

Gate locks:

- G1 concept/mood
- G2 layout/presentation
- G3 final materials/render
- G4 production planning/release

### FR-11 Factory Packet and Multi-Machine Export

**Priority:** P0  
**Purpose:** เปลี่ยน released design เป็น manufacturing package ที่ verify ได้

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
- future formats หลัง post-processor profiles

Acceptance:

- output deterministic สำหรับ released input เดิม
- packet verify offline ได้
- manifest หรือ signature mismatch ต้อง block trust

### FR-12 ERP Backbone

**Priority:** P0/P1  
**Purpose:** บริหาร business operations รอบ manufacturing truth

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

- BOM Snapshot มาจาก Released Spec
- material demand มาจาก Released Spec หรือ approved change เท่านั้น
- ERP ห้ามแก้ geometry, drill maps, CNC หรือ release state โดยตรง
- Job cost เชื่อม estimate, planned cost, committed cost, actual cost, rework และ WIP

### FR-13 LINE-Native Engagement

**Priority:** P0  
**Purpose:** ทำให้ human workflow ง่าย แต่ back-end governance เข้ม

Requirements:

- HMAC verification สำหรับ webhook
- idempotency สำหรับ inbound events ทุกชนิด
- outbound templates ต้อง pre-approved เท่านั้น; ไม่มี free-text LLM
- customer ไม่เป็น DB principal
- staff identity binding ต้อง deterministic
- LINE group membership ไม่ใช่ authorization
- customer group รับเฉพาะ curated approved updates
- internal proof ห้าม auto-forward ไป customer group

### FR-14 Field Execution and Installation

**Priority:** P0/P1  
**Purpose:** ปิด loop จาก Released Spec ไป installed reality

Requirements:

- Installation project map เป็น house -> rooms -> lanes
- T0 readiness checklist ก่อน start
- work items ต่อ room/lane/person
- photo proof และ issue capture ผ่าน LINE/PWA
- punch list และ NCR support
- close-house ทำได้เฉพาะ Installation Team Lead ที่ authorized
- customer acceptance ผ่าน LINE Flex หรือ web fallback
- field evidence link กับ Released Spec และ Factory Packet

### FR-15 Accounting, Procurement, and Job Costing

**Priority:** P1  
**Purpose:** ให้ financial truth เดินตาม production truth

Requirements:

- double-entry ledger
- multi-book support
- VAT/WHT logic สำหรับไทย
- PO/receipt/stock/issue flow
- actual purchase price และ moving average
- job cost by project/package
- WIP และ billing milestone visibility
- Capture Spine integration สำหรับ expense/material documents

### FR-16 MCP and AI Copilot

**Priority:** P0/P1  
**Purpose:** ให้ AI ช่วยโดยไม่ข้าม governance

Requirements:

- tool catalog ตาม role และ site
- Read tools execute ได้ภายใต้นโยบาย
- Write/Approval tools สร้าง Pending Invocation
- risky action ต้อง human approval
- data minimization และ PII redaction ที่ MCP boundary
- audit ทุก invocation
- untrusted content ต้องถูกมองเป็น data ไม่ใช่ command

### FR-17 Executive Dashboard and Analytics

**Priority:** P1  
**Purpose:** ทำให้ผู้บริหาร govern ระบบได้จริง

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

object ทุกตัวที่เกิดจาก automation, AI, OCR, SpatialLM, import, customer channel หรือ external system ต้องมีอย่างน้อย source, timestamp, processor/model version ถ้าเกี่ยวข้อง, verifier status และ accountable owner ก่อนจะกลายเป็น committed truth

### 15.2 Escalation by Risk

gate, approval, waiver, posting, export หรือ closeout action ที่เกิน risk threshold ตาม config ต้อง route ไป role ที่มี authority สูงขึ้น action ที่ high-risk ห้าม default เป็น auto-pass

### 15.3 Reconciliation Loop

field variance, NCR, rework, scrap, supplier variance และ accounting variance ต้องย้อนกลับไปปรับ rule, catalog certification, gate policy, machine profile governance และ executive dashboard ไม่ใช่จบเป็น incident เดี่ยวหรือ chat message เดี่ยว

### 15.4 No Silent Authority Transfer

module ใดห้ามได้ authority เหนือ source of truth ของอีก module จากผลข้างเคียงของ integration Front Door release production truth ไม่ได้, ERP แก้ geometry/CNC ไม่ได้, Field proof mutate Released Spec ย้อนหลังไม่ได้ และ AI/MCP write action ต้องเข้า Pending Invocation + human gate

## 16. Non-Functional Requirements

| Requirement | Target |
| --- | --- |
| Determinism | same released input ต้องได้ packet/hash/output เดิม |
| Traceability | ทุก output link กลับไป source evidence, revision, gate, user, timestamp |
| Security | RLS, least privilege, secret isolation, signed artifacts |
| Privacy | PDPA-by-architecture, redaction, data minimization, controlled egress |
| Reliability | idempotent webhooks, retries, offline field queues, offline packet verification |
| Usability | หน้าบ้านง่าย หลังบ้านรับความยาก |
| Mobile field use | one-hand flows, minimal fields, LINE/PWA first |
| Auditability | append-only audit สำหรับ approval, capture, release, export, field proof |
| Extensibility | capture types, machine profiles, catalog items, document types เพิ่มด้วย config เมื่อทำได้ |
| Governance | fail-safe; policy หาย = block ไม่ใช่ pass |

## 17. System Invariants

1. render release production ไม่ได้
2. concept scene สร้าง CNC โดยตรงไม่ได้
3. SpatialLM output bypass human verification ไม่ได้
4. ERP แก้ drill maps หรือ CNC ไม่ได้
5. customer approval แก้ scope แบบเงียบ ๆ ไม่ได้
6. Released Spec mutate ไม่ได้ถ้าไม่ผ่าน revision workflow
7. Factory export ต้องมี release state และ gate proof
8. Field completion ต้องมี evidence และ authorized close
9. AI write actions ต้องผ่าน human gate
10. sensitive evidence ออกนอก boundary ไม่ได้ถ้าไม่มี policy

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

- ไม่ทำ big-bang rewrite
- เริ่มจาก module ที่เพิ่ม governance โดยไม่ทำให้ production continuity เสี่ยง
- ใช้ coexistence และ shadow mode เมื่องานบัญชี หน้างาน หรือ factory output อาจถูกกระทบ
- แยก front-door speed ออกจาก production authority ให้ชัด
- ใช้ pilot evidence เป็นฐานตั้ง target ไม่ใช่หลักฐานว่า production-ready ทั้งระบบ

### 20.2 Suggested Release Order

1. Truth chain stabilization
2. Front Door + Approval Packet
3. Capture Spine hardening
4. Spatial Evidence sandbox สำหรับ 1-2 rooms โดยไม่มี CNC/release/accounting path
5. Factory Packet และ export integrity improvements
6. ERP Backbone object registry + BOM snapshot + job cost shadow mode
7. Field digital thread
8. Board dashboard intelligence

### 20.3 Pilot Strategy

| Pilot | Scope | Exit evidence |
| --- | --- | --- |
| Controlled factory pilot | project เล็กที่ factory path ชัดและ machine profile จำกัด | deterministic packet, gate proof, signed receipt, packet rejection data |
| Spatial evidence pilot | 1-2 rooms เท่านั้น, ไม่มี CNC/release path | verified SiteSurveyZone candidates, human correction log, survey time baseline |
| Accounting shadow pilot | Released Spec -> BOM snapshot -> job cost โดยยังไม่ post จริง | variance map, finance sign-off, posting rule gaps |
| Field pilot | installation complexity ระดับกลางพร้อม room/lane work | proof completeness, issue aging, close-house acceptance audit |

## 21. Migration and Coexistence Strategy

### 21.1 Data Migration Principles

- migrated data ต้อง preserve identity, revision lineage, provenance และ source confidence
- legacy record ที่ evidence ไม่ครบต้อง mark เป็น lower-confidence legacy data ไม่ใช่ normalize ให้ดูแน่นอนเกินจริง
- factory packet เก่าห้าม regenerate ถ้ายังพิสูจน์ evidence parity และ release lineage ไม่ได้
- migration script ต้องมี audit report, reject count และ owner review queue

### 21.2 Coexistence Rules

- design เดิมอ่านได้ แต่ release ใหม่ต้องเข้า rule ของ module ที่ deploy แล้ว
- accounting ใช้ shadow mode ก่อน post จริง
- field team ใช้ LINE/PWA ควบคู่ process เดิมจนกว่า proof completion และ closeout จะเสถียร
- SpatialLM เริ่มเป็น assistive evidence layer และไม่แทน manual survey

## 22. Dependencies

### 22.1 Internal Dependencies

- canonical PRD, blueprint, Safety Gate docs, Connector OS docs และ release/export contracts
- machine profile ownership และ versioning
- finance policy owner สำหรับ VAT/WHT/eTax, posting threshold และ approval limit
- operations owner สำหรับ room/lane, T0, close-house และ acceptance behavior
- data steward สำหรับ certified catalog, item master, naming, mapping และ trust-tier hygiene

### 22.2 External Dependencies

- LINE platform stability และ policy boundary
- OCR/LLM/self-host infrastructure boundary
- SpatialLM model/runtime feasibility สำหรับ sandbox เท่านั้น
- ERP patterns จาก Odoo, ERPNext/Frappe, Acumatica และ Infor เป็น architectural reference ไม่ใช่ runtime dependency
- legal/accounting review ในพื้นที่จริงสำหรับ approval language, PDPA handling, VAT/WHT/eTax และ document retention

## 23. Risk Register

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| ทีมตีความ concept เป็น truth | สูง | กลาง | badge/state ชัด, mandatory conversion workflow, no export from sandbox |
| Safety Gate ถูก bypass เพราะถูกมองว่าเป็น friction | สูง | กลาง | gate reason UX ดี, waiver policy formal, audit visibility, executive exception dashboard |
| accounting scope ใหญ่เกินไป | สูง | สูง | shadow mode, phased rollout, finance co-design, restricted posting surface |
| SpatialLM ถูก overpromise | กลาง | สูง | sandbox only, no release path, measured pilot, explicit executive policy |
| field adoption ต่ำ | สูง | กลาง | LINE/PWA-first, minimal input, operations champion, digest controls |
| catalog mapping ไม่น่าเชื่อถือ | กลาง | กลาง | trust tiers, certified catalog owner, mapping review, data stewardship |
| machine profile drift | สูง | กลาง | versioned machine profiles, signed packet verification, export receipt checks |
| notification noise ทำให้คนเลิกใช้ | กลาง | กลาง | quiet hours, role-based routing, digest, escalation thresholds |
| governance ทำให้ front door ช้า | สูง | กลาง | ให้ speed อยู่ที่ concept/intake และ enforce strictness เฉพาะ release, accounting, closeout path |

## 24. Program-Level Acceptance Criteria

### 24.1 Front Door Ready

- ลูกค้าและทีมภายในเริ่มงานได้โดยไม่ต้องเข้าใจทั้งระบบ
- สร้าง useful concept ได้เร็ว
- Approval Packet อ่านง่ายและผูก scope, revision, timestamp, identity และ channel
- ไม่มี shortcut จาก front door ไป Released Spec โดยไม่มี conversion และ gate

### 24.2 Truth Layer Ready

- Parametric Contract, Material Stack, Connector OS และ Safety Gate อธิบาย blocker ได้
- Released Spec immutable ยกเว้นผ่าน revision workflow
- Factory Packet verify offline ได้และ trace กลับหา release evidence ได้

### 24.3 ERP Backbone Ready

- BOM Snapshot สร้างจาก Released Spec
- stock move, PO, receipt, actual cost และ ledger candidate trace กลับหา project/package ได้
- accounting post สร้างจาก unverified AI/capture output ไม่ได้

### 24.4 Field Ready

- room/lane work item ใช้งานบนมือถือได้
- proof, issue, punch list และ acceptance link กลับหา released truth ได้
- close-house และ customer acceptance ต้องมี authorization และ audit

## 25. Definition of Done and Module Readiness

### 25.1 Feature Definition of Done

feature ใดจะถือว่า Done ได้เมื่อ:

- requirement, UX flow, edge cases และ prohibited actions ถูก review
- permissions, RLS ถ้าเกี่ยวข้อง และ audit events ถูกระบุ
- system invariants ถูก encode หรือมี guardrail ที่ verify ได้
- analytics events และ dashboard ที่จำเป็นถูกกำหนด
- error states, retry behavior, offline behavior และ fallback ownership ถูกระบุ
- docs และ runbook update แล้ว
- pilot evidence พิสูจน์ workflow อย่างน้อยหนึ่งเส้นจริงหรือ representative เมื่อ feature กระทบ production, field, finance หรือ approval

### 25.2 Module Readiness Checklist

ทุก module ต้องตอบได้ว่า:

- ใครคือ owner?
- source of truth คืออะไร?
- action ใดห้ามทำ?
- rollback หรือ correction path คืออะไร?
- ถ้า service ล่ม งานต้องเดินอย่างไร?
- audit trail ถูกสร้างตรงไหน?
- threshold/escalation ใดเป็น config และใด hardcode?
- output ใดต้อง signed หรือ verified?

## 26. SpatialLM Policy

- SpatialLM ใช้อ่าน spatial evidence ไม่ใช่แทน engineering judgment
- output เป็น candidate evidence จนกว่าจะถูก verify โดย accountable human
- phase แรกคือ survey acceleration และ constraint visibility เท่านั้น
- SpatialLM ห้ามเขียน CNC, เปลี่ยน release state, ยืนยัน manufacturability ขั้นสุดท้าย หรือ post accounting event
- SpatialLM evidence enrich SiteSurveyZone ได้หลัง verification และ provenance capture เท่านั้น

## 27. ERP Policy

- Odoo ใช้เป็น reference สำหรับ flow mapping, shop-floor pattern และ field-service pattern
- ERPNext/Frappe ใช้เป็น reference สำหรับ document state, object registry, permissions, naming series และ workflow
- Acumatica ใช้เป็น benchmark สำหรับ project accounting, job cost, WIP และ field-office visibility
- Infor ใช้เป็น north-star benchmark สำหรับ PLM/MES/WMS/CPQ integration และ BOM lifecycle thinking
- MONOLITH ERP Backbone เป็น business operating layer รอบ manufacturing truth ไม่ใช่เจ้าของ geometry, drill map, CNC, release state หรือ factory packet truth

## 28. Roadmap

### Phase 0: Stabilize Existing Truth Chain

- รักษา CAD/CAM/Factory Packet/Safety Gate เดิมเป็น core ที่ห้ามต่อรอง
- verify code/test status ก่อน external production claim ใด ๆ
- preserve PRD/blueprint เดิมเป็น implementation evidence

### Phase 1: MONOLITH Front Door Program

- Intake Router
- Concept Sandbox
- Approval Packet
- Catalog trust tiers
- Gate Reason UX
- Render deck ที่ผูกกับ revision และ approval

### Phase 2: Spatial Evidence Sandbox

- SpatialLM-based prototype สำหรับ 1-2 ห้อง
- point-cloud/video/LiDAR input
- walls/openings/bounding boxes output
- overlay human verification
- commit เฉพาะ verified constraints เข้า SiteSurveyZone
- ไม่มี path ไป CNC/release ในปีแรก

### Phase 3: Conversion Engine

- Concept-to-Parametric Contract diff
- material/hardware mapping
- preliminary gate
- unknowns และ blockers list
- production-safe patch suggestions

### Phase 4: ERP Backbone

- document object registry
- Item Master และ production-bound catalog
- BOM Snapshot จาก Released Spec
- Work Order / Job Card
- stock reservation/issue/return/scrap
- job cost, WIP, procurement, PO, invoice milestones

### Phase 5: Field Digital Thread

- Installation PWA polish
- house/room/lane tasks
- LINE groups พร้อม hard guardrails
- T0, proof, issue, punch list, close-house, customer acceptance
- field-to-design feedback ผ่าน deviation analytics

### Phase 6: Board Intelligence

- executive dashboards
- gate/rework/field/cost analytics
- supplier และ factory throughput analytics
- closed-loop improvement ของ design standard และ Safety Gate rules

## 29. Success Metrics

| Metric | Why |
| --- | --- |
| Time to first useful concept | front-door speed |
| Survey-to-verified SiteSurveyZone time | Spatial evidence ROI |
| Concept-to-contract conversion rate | sandbox usefulness |
| First-pass Safety Gate pass rate | production readiness |
| Gate-fix cycle time | designer productivity |
| Render approval to Released Spec drift | approval integrity |
| Factory packet rejection rate | manufacturing quality |
| CNC/post error rate | machine readiness |
| Defect/rework cost | business impact |
| Field issue rate | site execution quality |
| Punch-list age | closeout discipline |
| Job cost variance | financial control |
| Capture-to-post lag | back-office efficiency |
| Approval SLA | workflow health |

ตัวเลข target ต้องตั้งหลังเก็บ baseline 30-60 วัน ไม่ตั้งจากอากาศ

metric definition ต้องมี owner, source system/table, cadence, baseline period, target policy และ escalation threshold ก่อนจะยกระดับเป็น board KPI

## 30. Open Questions

1. จะใช้ห้อง/โปรเจกต์ pilot ใดสำหรับ Spatial Evidence Phase 1?
2. scan source แรกควรเป็น iPhone LiDAR, Android RGB-D หรือ video ปกติที่ reconstruct เป็น point cloud?
3. asset ใดจะถูกยกระดับเป็น Certified production-bound catalog items ใน v1?
4. machine profile ใดเป็น production pilot target แรก?
5. ERP Backbone object ใดควร implement ก่อน: Item Master, BOM Snapshot, Work Order หรือ Job Cost?
6. approval language สำหรับ G1/G2/G3/G4 packet ต้องให้กฎหมาย review อย่างไร?
7. deployment boundary ของ self-host OCR/LLM และ SpatialLM processing อยู่ตรงไหน?
8. dashboard ใดสำคัญที่สุดสำหรับ board ในเดือนแรก?
9. waiver threshold แรกสำหรับ warning, blocker, budget variance และ schedule variance ควรตั้งที่ระดับใด?
10. role ใด waive warning ได้โดยไม่ต้อง escalate ถึง executive?
11. production-bound certified catalog seed set ชุดแรกคืออะไร?
12. 90-day rollout sequence ใดปลอดภัยที่สุดสำหรับ business unit แรก?

## 31. Evidence Tier and Usage Policy

Evidence Tier ใช้ตอบคำถามสองข้อแยกกัน: “แหล่งนี้น่าเชื่อถือระดับใดสำหรับ claim ประเภทนี้” และ “claim นี้พิสูจน์สถานะ production ของ MONOLITH ได้หรือไม่” แหล่งระดับสูงไม่ได้แปลว่าใช้พิสูจน์ได้ทุกเรื่อง ตัวอย่างเช่น paper ระดับ E1 พิสูจน์ research feasibility ได้ แต่พิสูจน์ว่า module ของ MONOLITH deploy แล้วไม่ได้

### 31.1 Evidence Tier

| Tier | ประเภทหลักฐาน | ใช้ยืนยันได้ | ห้ามตีความเกิน |
| --- | --- | --- | --- |
| **E0 — Direct As-Built Evidence** | source code, schema/migration, automated test, build artifact, signed packet, deployment/operational record ที่ผูกกับ revision | สถานะ implementation ภายในขอบเขต environment และ revision ที่ตรวจ | ห้ามเรียก production-ready ถ้ายังขาด deployment, live integration หรือ operational proof |
| **E1 — Primary / Authoritative** | approved canonical decision, official standard/regulator/API contract, peer-reviewed paper | requirement, policy, protocol หรือ research capability ที่แหล่งระบุโดยตรง | ห้ามใช้แทน E0 เพื่อ claim ว่า MONOLITH implement แล้ว |
| **E2 — First-Party Vendor Claim** | vendor product page, help center, official blog, official demo | capability ที่ vendor ประกาศและใช้เป็น benchmark | ห้ามถือเป็นผลทดสอบอิสระ, SLA, API compatibility หรือ fit กับเครื่องจักร DAPH |
| **E3 — Secondary Synthesis** | research report, trade media, market analysis, review, comparison document | context, discovery, candidate requirement และคำถามสำหรับ due diligence | ห้ามใช้เป็น sole acceptance evidence หรือ production decision |
| **E4 — Inference / Recommendation** | architectural inference, hypothesis, target, recommendation | product direction และ experiment ที่ต้องพิสูจน์ต่อ | ห้ามเขียนเป็น fact, current capability หรือ committed KPI |

### 31.2 กติกาการใช้งาน

- claim ว่า **implemented** ต้องมี E0 ที่ชี้ไปยัง code/schema และ test ที่เกี่ยวข้อง
- claim ว่า **production-ready** ต้องมี E0 ครบ code + test + deployment + operational proof และไม่มี blocker ที่ยังเปิดอยู่
- external research decision ต้องมี E1 หรือ E2 ที่ชี้ exact URL/เวอร์ชัน และต้องระบุว่าเป็น primary evidence หรือ vendor claim
- E3/E4 ใช้สร้าง hypothesis, roadmap หรือ acceptance test ได้ แต่ห้ามใช้ผ่าน acceptance test ด้วยตัวเอง
- claim ที่ส่งผลต่อ CNC, release, accounting posting, IAM, PDPA หรือ customer acceptance ต้องมี accountable owner และ verification date
- เมื่อ source เปลี่ยน, URL หาย, hash ไม่ตรง หรือ code revision เปลี่ยน claim ที่เกี่ยวข้องกลับเป็น `REVERIFY` อัตโนมัติ

### 31.3 Freshness and Re-verification

Source owner ต้องทบทวน claim ที่มีผลต่อ production อย่างน้อยทุก release candidate ส่วน vendor/web source ต้อง re-check ก่อน procurement, contract signing หรือ public claim ทุกครั้ง เวอร์ชัน PDF/Markdown ที่อยู่ใน `Downloads` เป็น provenance pointer ที่ hash ไว้แล้ว แต่ยังไม่ใช่ durable evidence store จนกว่าจะย้ายเข้า controlled repository หรือ evidence archive

## 32. Source Register

### 32.1 Internal MONOLITH Sources

| Source ID | Tier | Artifact / Revision | SHA-256 หรือ identity | การใช้งานที่อนุญาต |
| --- | --- | --- | --- | --- |
| `SRC-I01` | E1 | `docs/prd/monolith-complete-prd.th.md` / `.en.md` | TH `E363271C...7546C6D`; EN `299BA724...BF59F0` | requirement baseline ก่อน v5 |
| `SRC-I02` | E3 | `C:\Users\thai3\Downloads\monolith-complete-prd-v4.th.md` | `70AEBC56...D8DD44D` | program-execution additions; ไม่ใช่ standalone full PRD |
| `SRC-I03` | E3 | `docs/research/coohom-vs-monolith-comparison.th.md` / `.en.md` | TH `2EEA72F3...E4B08`; EN `6BC1D2F6...18906B` | strategic comparison และ evidence caveat |
| `SRC-I04` | E3/E4 | `docs/research/monolith-front-door-doctrine.th.md` / `.en.md` | TH `9EB37FF8...A9FDD`; EN `47B5EB1D...FE0379` | front-door doctrine, product inference และ recommendation |
| `SRC-I05` | E3/E4 | `docs/research/erp-deep-research-for-monolith.th.md` / `.en.md` | TH `2762AD44...2BE60`; EN `3D136404...99806` | ERP pattern benchmark; ไม่ใช่ runtime dependency |
| `SRC-I06` | E0 | Local code snapshot `determined-williams/` | Git `d7b1c879b1e0397699603bd2615f6fe271fa8c9c`, branch `fix/drillmap-bolt-and-brun-dowels`, dirty worktree | as-built code inspection เฉพาะ snapshot นี้ |
| `SRC-I07` | E0 | Read-only audit session 2026-07-10 | root tests/build/typecheck/smoke + targeted code inspection; summary in §34 | as-built status; ต้อง rerun เมื่อ revision หรือ environment เปลี่ยน |
| `SRC-I08` | E0 | `docs/prd/monolith-complete-prd-v5.sha256` | SHA-256 ของ v5.1 TH/EN Markdown และ HTML | integrity check สำหรับ deliverable ชุดนี้ |

ไฟล์ implementation ที่เป็นหลักฐานแกนระบบรวมถึง `determined-williams/docs/PRD.md`, `MASTER_BLUEPRINT.md`, `REQUIREMENTS-OVERVIEW.md`, `docs/SAFETY_GATE.md`, `docs/api/FACTORY_EXPORT_API.md`, `docs/connector-os/`, `docs/LINE-Architecture-System-Complete.md`, `docs/architecture/MULTI_MACHINE_EXPORT_DESIGN.md`, `src/`, `server/`, `supabase/migrations/`, `supabase/functions/` และ `packages/field-app/` โดยเอกสารอธิบาย intent ส่วน code/test/schema เป็น E0 สำหรับสถานะ as-built

### 32.2 User-Provided Coohom / Manycore Upstream Package

| Source ID | Tier | Artifact | SHA-256 | ข้อจำกัด |
| --- | --- | --- | --- | --- |
| `SRC-U01` | E3 | `Coohom Technology Deep Dive — Architecture, Algorithms & AI Research (Executive Edition).md` | `6CF39D7A...8F969` | ผสม paper, vendor source และ inferred internals; ต้อง trace claim ต่อรายการ |
| `SRC-U02` | E3 | `Coohom Complete Suite Intelligence Report — Executive Decision-Grade Analysis.md/.pdf` | MD `1D24F30E...ECBA`; PDF `2EB0F260...FFBB` | executive synthesis; title ไม่ได้ยกระดับทุก claim เป็น E1 |
| `SRC-U03` | E3 | `Coohom Deep Research Report — ฉบับสมบูรณ์ (ภาค 2 กลยุทธ์ & การขยายตัว).pdf` | `855C2C6D...BFAF9` | strategy/vendor/market synthesis; ตัวเลขต้องตรวจ source ต้นทาง |
| `SRC-U04` | E3 | `Coohom Manycore Tech — Technology Deep Dive for DAPH Studio 2026.md/.pdf` | MD `0351FCC1...04A4`; PDF `5B1B555C...A5297` | upstream integration proposal; direct SmartLink-to-CNC path ไม่ใช่ MONOLITH policy |

hash แสดงแบบย่อในตารางเพื่ออ่านง่าย ค่าเต็มอยู่ใน §32.4 และต้องคงไว้ใน release evidence manifest หาก archive ชุดนี้เข้า controlled repository

### 32.3 External Primary, Standard, and Vendor Sources

| Source ID | Tier | Source | ใช้รองรับ |
| --- | --- | --- | --- |
| `SRC-X01` | E1 | [SpatialLM paper](https://arxiv.org/abs/2506.07491) และ [NeurIPS 2025 record](https://nips.cc/virtual/2025/poster/115535) | point cloud → structured walls/doors/windows/object boxes และ research benchmarks |
| `SRC-X02` | E2 | [Coohom AI Home Design / AIHom](https://www.coohom.com/case/ai-home-design) | fast editable 2D/3D front-door benchmark |
| `SRC-X03` | E2 | [Coohom Floor Planner](https://www.coohom.com/case/floor-planner) | floor-plan UX capability claim |
| `SRC-X04` | E2 | [Coohom 3D Render](https://www.coohom.com/case/3d-render-home) | rendering/presentation benchmark |
| `SRC-X05` | E2 | [Coohom Model Library](https://www.coohom.com/3d-models) | catalog breadth claim; ไม่ใช่ certified manufacturing catalog |
| `SRC-X06` | E2 | [Coohom SmartLink](https://blog.coohom.com/coohom-smartlink-suite-at-indiawood-2026-closing-the-gap-between-design-and-production/) | vendor claim เรื่อง design validation, live sync และ CNC workflow |
| `SRC-X07` | E2 | [Coohom AI Modeler Guide](https://www.coohom.com/helpcenter/model-materials-ai-modeler-user-guide) | ยืนยันการมี Tripo 3D/HY 3D tools; ไม่ยืนยัน internal neural architecture |
| `SRC-X08` | E1 | [Microsoft Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) และ [HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/) | human-AI interaction และ failure-mode design |
| `SRC-X09` | E1 | [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | AI governance/risk framing |
| `SRC-X10` | E1 | [ISO 9241-210](https://www.iso.org/standard/77520.html) และ [ISO 23247](https://www.iso.org/standard/75066.html) | human-centred design และ digital-twin framework |
| `SRC-X11` | E1 | [NIST AMS 300-6](https://doi.org/10.6028/NIST.AMS.300-6) | product-data traceability |

external URLs ตรวจล่าสุด 2026-07-10 และถือเป็น dynamic sources การตัดสินใจ production ต้องบันทึก access date, version และ archived snapshot เมื่อ license อนุญาต

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

Claim Ledger เป็นจุดเชื่อมระหว่าง source, PRD decision และ as-built evidence สถานะ `ACCEPTED` หมายถึงรับเป็น requirement/decision ไม่ได้หมายถึง implement แล้ว ส่วน `AS-BUILT GAP` หมายถึง code ปัจจุบันยังไม่ถึง requirement

| Claim ID | Claim | Sources / Tier | PRD Decision | สถานะและเงื่อนไขพิสูจน์ |
| --- | --- | --- | --- | --- |
| `CLM-001` | Coohom ให้ front-door ที่เริ่มเร็วและได้ editable visual scene | `SRC-X02`–`SRC-X05` / E2, `SRC-U01`–`SRC-U04` / E3 | ใช้เป็น UX benchmark | **ACCEPTED WITH BOUNDARY** — ห้าม scene/catalog กลายเป็น production truth โดยอัตโนมัติ |
| `CLM-002` | SmartLink รองรับ design-to-production/CNC workflow | `SRC-X06` / E2, `SRC-U02`–`SRC-U04` / E3 | ใช้เป็น vendor benchmark ไม่ใช่ runtime dependency | **VENDOR CLAIM** — ต้องมี paid demo, machine matrix, API contract และ packet comparison ก่อนพิจารณา integration |
| `CLM-003` | SpatialLM อ่าน point cloud เป็น structured indoor elements ได้ | `SRC-X01` / E1 | ใช้เป็น feasibility ของ Spatial Evidence Compiler | **ACCEPTED** — pilot ต้องวัด precision/recall และ human correction บนข้อมูล DAPH |
| `CLM-004` | SpatialLM สามารถสร้าง CNC หรือ release manufacturing truth ได้ | ไม่มี primary evidence; inference E4 | ห้ามโดย policy | **REJECTED** — SpatialLM output เป็น candidate evidence เท่านั้น |
| `CLM-005` | Coohom ใช้ bidirectional DAG, U-Net, Hough/RDP, 50 mm auto-close และ pipeline ภายในตามรายงาน | `SRC-U01` / E3-E4; `SRC-X07` ยืนยันเพียง tool surface | ห้าม encode เป็น fact หรือ dependency | **UNVERIFIED** — ต้องมี official technical disclosure หรือ reproducible black-box study |
| `CLM-006` | “10 นาทีแรก” เป็น performance fact ที่พิสูจน์แล้ว | `SRC-I04` / E4, vendor speed claims E2 | เป็น product aspiration | **TARGET, NOT BASELINE** — ตั้ง SLA หลังเก็บ baseline 30–60 วัน |
| `CLM-007` | Spatial AI/AI/OCR เป็น evidence ไม่ใช่ authority | `SRC-I01`, `SRC-I04`, `SRC-X08`, `SRC-X09` / E1-E4 | system invariant | **ACCEPTED** — ต้องมี provenance, verifier และ human gate ใน write path |
| `CLM-008` | ERP เป็น business layer รอบ manufacturing truth | `SRC-I01`, `SRC-I05` / E1-E4 | architectural boundary | **ACCEPTED** — ERP ห้ามแก้ geometry, drill map, CNC หรือ release state |
| `CLM-009` | Factory Packet ต้อง deterministic, signed และ verify offline ได้ | `SRC-I01`, implementation docs, `SRC-I06` / E0-E1 | mandatory release requirement | **ACCEPTED; AS-BUILT GAP** — ดู `AB-PKT-01`–`AB-PKT-02` |
| `CLM-010` | Concept Sandbox มีใช้งานแล้ว | PRD only / E4; audit `SRC-I07` | target capability | **AS-BUILT GAP** — ไม่พบ implementation ที่แยก sandbox graph อย่างเป็นระบบ |
| `CLM-011` | Catalog Trust Tiers มีใช้งานแล้ว | PRD only / E4; catalog foundation E0 | target capability | **AS-BUILT GAP** — มี catalog code แต่ไม่พบ tier enforcement ครบ Public/Project/Verified/Certified |
| `CLM-012` | LINE/Capture/Field digital thread พร้อม production ครบเส้น | `SRC-I06`, `SRC-I07` / E0 | target remains | **PARTIAL / NOT VERIFIED** — มี migrations/functions/field app แต่ DB/RLS integration และ field-app automated test ยังไม่ครบ |
| `CLM-013` | Factory authorization boundary พร้อม production | `SRC-I06`, `SRC-I07` / E0 | mandatory control | **AS-BUILT GAP** — frontend role อยู่ localStorage และ edge function เชื่อ `x-actor-role/name` |
| `CLM-014` | CNC export ใน main UI เปิดได้เฉพาะ `RELEASED` | `SRC-I06`, `SRC-I07` / E0 | mandatory invariant | **AS-BUILT GAP** — `AppShell.tsx:174` อนุญาต `FROZEN` เมื่อ gate OK |
| `CLM-015` | Factory packet generation bit-identical แล้ว | `SRC-I06`, `SRC-I07` / E0 | mandatory requirement | **AS-BUILT GAP** — job ID, manifest time และ ZIP time ยังมี runtime entropy |
| `CLM-016` | Server `/verify` ตรวจ manifest/files/signature/gate/machine ครบ | `SRC-I06`, `SRC-I07` / E0 | mandatory verification boundary | **AS-BUILT GAP** — ปัจจุบันตรวจ packet SHA anchor เป็นหลัก |
| `CLM-017` | CAD/CAM, Parametric Contract, Connector OS และ Safety Gate มี implementation จริง | `SRC-I06`, `SRC-I07` / E0 | preserve as core | **VERIFIED IN TEST ENVIRONMENT** — ไม่เท่ากับ production certification |
| `CLM-018` | ERP/finance/executive analytics พร้อมใช้งานครบ | `SRC-I06`, `SRC-I07` / E0 | roadmap target | **PARTIAL** — มี schema/workflow บางส่วน แต่ `/finance` และบาง route ยังเป็น placeholder |

## 34. As-Built Status

### 34.1 Snapshot and Audit Boundary

| Field | Value |
| --- | --- |
| Audit date | 2026-07-10 |
| Repository | `determined-williams/` |
| Git identity | commit `d7b1c879b1e0397699603bd2615f6fe271fa8c9c`, branch `fix/drillmap-bolt-and-brun-dowels` |
| Worktree | **DIRTY** — มี modified/untracked files อยู่ก่อนงานเอกสารนี้ จึงต้องมองผลเป็น local workspace snapshot ไม่ใช่ clean-commit certification |
| Automated evidence observed | root Vitest 261 files / 4,545 tests passed; TypeScript check passed; Vite build passed; browser smoke 7 scenarios passed |
| Partial test evidence | Python suite 10 passed / 96 skipped เพราะไม่มี `LINE_OA_TEST_DATABASE_URL`; live DB/RLS ไม่ได้ถูกพิสูจน์ |
| Toolchain variance | factory server package test ภายใต้ Vitest 1.6 ล้ม 13 tests จาก CLI side effect/process exit ขณะที่ golden tests เดียวกันผ่านภายใต้ root Vitest; ต้องแก้ test-runner drift |
| Excluded from certification | production deployment, live Supabase/LINE credentials, real CNC machine execution, receipt-key ceremony, paid Coohom/SmartLink environment และ field pilot |

### 34.2 Status Definitions

| Status | ความหมาย |
| --- | --- |
| **VERIFIED** | พบ implementation และ automated evidence ผ่านใน environment ที่ระบุ |
| **PARTIAL** | มี implementation สำคัญ แต่ flow, control, integration หรือ proof ยังไม่ครบ |
| **PLANNED** | อยู่ใน PRD/roadmap แต่ไม่พบ implementation ที่เพียงพอ |
| **BLOCKED** | มีช่องว่างที่ห้าม production release แม้ capability บางส่วนมีอยู่ |
| **NOT VERIFIED** | อาจมี code/schema แต่ audit นี้ไม่มี environment หรือ evidence พอจะตัดสิน |

### 34.3 FR-01 to FR-17 As-Built Matrix

| FR | Capability | Status | Evidence summary | Next proof required |
| --- | --- | --- | --- | --- |
| FR-01 | Front Door Intake Router | **PARTIAL** | มี LINE/capture/routes หลายส่วน แต่ไม่พบ unified front-door routing และ evidence graph ครบ | end-to-end intake test + role/channel routing |
| FR-02 | Concept Sandbox | **PLANNED** | ไม่พบ sandbox graph/state ที่แยกจาก manufacturing truth | sandbox data model, conversion gate และ no-export tests |
| FR-03 | Spatial Evidence Compiler | **PARTIAL** | มี `site_survey_zone` schema/adapter; ไม่พบ SpatialLM runtime pipeline | model/runtime PoC, provenance schema, accuracy benchmark |
| FR-04 | Capture Spine | **PARTIAL** | มี `src/capture/`, migrations และ commit-target adapters | live DB/RLS integration, retries, offline and failure proof |
| FR-05 | Designer Workspace | **VERIFIED** | มี `src/spec/ui/DesignerScreen.tsx`, designer rules/stores และ 3D/CAD tests | usability/pilot evidence และ production telemetry |
| FR-06 | Parametric Contract | **VERIFIED** | spec/store/state machine และ manufacturing transformations มี test coverage | released-spec immutability proof ใน deployed boundary |
| FR-07 | Catalog Trust Tiers | **PARTIAL** | มี `src/core/catalog/` และ manufacturing catalogs แต่ไม่พบ trust-tier enforcement ครบ | tier schema, certification owner, export deny tests |
| FR-08 | Material Stack + Connector OS | **VERIFIED** | material registry, connector compiler, drill-map/gate tests มีจริง | machine-profile pilot และ versioned catalog evidence |
| FR-09 | Safety Gate and Release State | **PARTIAL / BLOCKED** | gate engine/test แข็งแรง แต่ main UI export ยอม `FROZEN`; strict bypass scan ใช้งานไม่ได้ | แก้ `AB-EXP-01`, bypass scanner และ release-invariant tests |
| FR-10 | Approval Packet | **PARTIAL** | มี approval quorum/authz/idempotency และ LINE workflow foundations | customer-facing packet E2E, identity/quorum/audit proof |
| FR-11 | Factory Packet and Multi-Machine Export | **PARTIAL / BLOCKED** | exporters/packet path มีจริง แต่ determinism, server verify, auth และ production key ยังมี blocker | ปิด `AB-PKT-01`–`AB-PKT-02`, `AB-AUTH-01`, `AB-KEY-01` |
| FR-12 | ERP Backbone | **PARTIAL** | มี migrations/object flows บางส่วน; route หลักบางจุดยัง placeholder | released-demand → BOM/WO/PO/job-cost integration test |
| FR-13 | LINE-Native Engagement | **PARTIAL / NOT VERIFIED** | มี Supabase functions/migrations และ TS/Python tests บางส่วน | live sandbox, DB/RLS suite, delivery/retry/consent evidence |
| FR-14 | Field Execution and Installation | **PARTIAL / NOT VERIFIED** | มี `src/workflow/field/`, bridge และ `packages/field-app/` screens | field-app test script, offline sync, close-house pilot |
| FR-15 | Accounting, Procurement, Job Costing | **PARTIAL** | มี ledger/capture/migration foundations แต่ finance UI/real posting ไม่ครบ | accountant-reviewed shadow posting และ reconciliation |
| FR-16 | MCP and AI Copilot | **PARTIAL** | `src/mcp/` มี authz, PDPA, redaction, autonomy และ tests | deployed IAM, Pending Invocation E2E และ audit proof |
| FR-17 | Executive Dashboard and Analytics | **PARTIAL** | มี factory dashboard components แต่ไม่พบ board KPI lineage ครบ | metric registry, source-table lineage, baseline และ executive acceptance |

### 34.4 Production Blocker Register

| Blocker ID | Priority | Evidence | Production exit condition |
| --- | --- | --- | --- |
| `AB-AUTH-01` | P0 | `src/core/auth/roles.ts:67`; `supabase/functions/factory-api/index.ts:136-137` | JWT/session → server-owned actor/role mapping; client headers ไม่มี authority |
| `AB-EXP-01` | P0 | `src/components/layout/AppShell.tsx:174` | CNC export ต้อง require `RELEASED` และ format-specific gate ทุก entry point |
| `AB-PKT-01` | P0 | `src/factory/packet/useFactoryPacket.ts:352`; `src/factory/packet/buildFactoryPacket.ts:126` | canonical job identity/time policy และ deterministic ZIP metadata |
| `AB-PKT-02` | P0 | `supabase/functions/factory-api/index.ts:193-207` | verify manifest, per-file hash, signature, gate, revision และ machine profile |
| `AB-KEY-01` | P0 | `server/src/crypto/production.receipt.pubkeys.v1.json:1` | approved non-placeholder production public-key set + rotation ceremony |
| `AB-TST-01` | P1 | factory server package Vitest 1.6 result | CLI entrypoint ไม่ run/exit ตอน import; package/root test parity |
| `AB-GATE-01` | P1 | `scripts/gates/bypass-scan.ts:135,147`; `.claude/gates/ci-bypass-patterns.txt:156` | scanner parse regex alternation ได้และ strict gate ผ่านแบบ signal-to-noise ใช้งานได้ |
| `AB-DB-01` | P1 | 96 Python tests skipped | provision isolated DB, run RLS/integration suite และเก็บ CI artifact |
| `AB-FIELD-01` | P1 | `packages/field-app/` ไม่มี test script; `.env` untracked | test/offline suite, secret hygiene และ pilot evidence |

### 34.5 Promotion Rule

capability จะเลื่อนเป็น `VERIFIED` หรือ `production-ready` ได้เมื่อ Claim Ledger ชี้ Source ID ระดับ E0 ที่ immutable, automated tests ครอบ invariant, deployment evidence ผูก revision, operational owner ลงนาม และไม่มี P0 blocker ที่เกี่ยวข้อง การเปลี่ยนสถานะต้องแก้ §33 และ §34 พร้อมกัน ห้ามแก้เฉพาะคำบรรยายใน roadmap

## 35. Revision Notes for v5

### v5.0

รักษา detailed FR-01 ถึง FR-17 จาก PRD v3 ไว้ครบ และนำส่วนที่มีประโยชน์จาก PRD v4 เข้ามาเป็น canonical section ได้แก่ business goals, non-goals, assumptions and constraints, RACI, release strategy, migration and coexistence, dependencies, risk register, program-level acceptance criteria, Definition of Done, SpatialLM policy และ ERP policy

### v5.1 — Evidence-Control Revision

- เพิ่ม Evidence Tier E0-E4 และ usage policy
- เปลี่ยน Source Register เป็น source-ID registry พร้อม hash/revision และเพิ่ม upstream Coohom/Manycore package
- เพิ่ม Claim Ledger เพื่อแยก source fact, vendor claim, inference, PRD decision และ as-built gap
- เพิ่ม As-Built Status Matrix สำหรับ FR-01 ถึง FR-17 และ Production Blocker Register
- ตรึง audit snapshot กับ commit/branch/worktree state และบันทึก test limitations
- ยืนยันว่า PRD target ไม่ใช่ production claim และทุกสถานะต้อง re-verify เมื่อ code/source revision เปลี่ยน

citation marker แบบ generated ใน v4 ยังคงถูกตัดออกเพราะ trace กลับไม่ได้เมื่ออ่านเป็น standalone document ไฟล์ `monolith-complete-prd-v5.sha256` เป็น release evidence manifest ที่บันทึก SHA-256 เต็มของ v5.1 TH/EN Markdown และ HTML ทั้งสี่ไฟล์
