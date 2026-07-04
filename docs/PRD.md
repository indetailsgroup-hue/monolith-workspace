# PRD — MONOLITH Manufacturing OS (IIMOS Workspace)

**Product Requirements Document ฉบับสมบูรณ์**

| | |
|---|---|
| **ชื่อผลิตภัณฑ์** | MONOLITH Manufacturing OS (ชื่อ workspace: `monolith-workspace` / IIMOS) |
| **เวอร์ชัน** | 2.1.0 (Factory-Ready CNC Pipeline) |
| **วันที่จัดทำเอกสาร** | 4 กรกฎาคม 2026 |
| **Repository** | https://github.com/indetailsgroup-hue/iimos-workspace |
| **สถานะการทดสอบ** | TypeScript 0 errors · Vitest 4,404 tests ผ่าน · E2E smoke ผ่าน |

---

## สารบัญ

1. [บทสรุปผู้บริหาร (Executive Summary)](#1-บทสรุปผู้บริหาร)
2. [ปัญหาที่แก้ (Problem Statement)](#2-ปัญหาที่แก้)
3. [เป้าหมาย (Goals) และสิ่งที่ไม่ทำ (Non-Goals)](#3-เป้าหมายและ-non-goals)
4. [ผู้ใช้และ User Stories](#4-ผู้ใช้และ-user-stories)
5. [สถาปัตยกรรมภาพรวม 3 ชั้น](#5-สถาปัตยกรรมภาพรวม)
6. [ข้อกำหนดรายโมดูล (Functional Requirements)](#6-ข้อกำหนดรายโมดูล)
   - [6.1 โมดูล CAD — 3D Cabinet Designer](#61-โมดูล-cad--3d-cabinet-designer)
   - [6.2 โมดูล CAM — Drill Map, Gate, CNC, Nesting, DXF](#62-โมดูล-cam--manufacturing-pipeline)
   - [6.3 โมดูล Factory Server — Backend โรงงาน](#63-โมดูล-factory-server)
   - [6.4 โมดูล Knowledge — DAPH Second Brain / Vault Builder](#64-โมดูล-knowledge--vault-builder)
   - [6.5 โมดูล Workflow Copilot](#65-โมดูล-workflow-copilot)
   - [6.6 โมดูล LINE OA Commerce](#66-โมดูล-line-oa-commerce)
   - [6.7 โมดูล MCP Layer](#67-โมดูล-mcp-layer)
   - [6.8 โมดูล Capture Spine](#68-โมดูล-capture-spine)
   - [6.9 โมดูล Accounting — Ledger / Tax / Costing](#69-โมดูล-accounting)
   - [6.10 โมดูล IAM — Identity & Access (C12)](#610-โมดูล-iam--c12-foundation)
7. [Invariants และ Contracts ของระบบ](#7-invariants-และ-contracts)
8. [ข้อกำหนดที่ไม่ใช่ฟังก์ชัน (Non-Functional Requirements)](#8-non-functional-requirements)
9. [ตัวชี้วัดความสำเร็จ (Success Metrics)](#9-success-metrics)
10. [สถานะปัจจุบันและ Roadmap](#10-สถานะและ-roadmap)
11. [คำถามที่ยังเปิดอยู่ (Open Questions)](#11-open-questions)
12. [อภิธานศัพท์ (Glossary)](#12-glossary)
13. [ภาคผนวก: Tech Stack และคำสั่งตรวจสอบ](#13-ภาคผนวก)

---

## 1. บทสรุปผู้บริหาร

**MONOLITH Manufacturing OS** คือระบบปฏิบัติการธุรกิจครบวงจรสำหรับผู้ผลิตเฟอร์นิเจอร์บิลท์อิน (built-in furniture) ครอบคลุมตั้งแต่ **การออกแบบตู้ 3 มิติ → การผลิตด้วยเครื่อง CNC → การบริหารงานสำนักงาน/โรงงาน/ติดตั้ง → การเงินและบัญชี** ในระบบเดียว

หัวใจของผลิตภัณฑ์คือหลักการ **"โรงงานก่อน ความสวยทีหลัง" (Factory-First)** — ทุกผลลัพธ์ที่ส่งเข้าโรงงาน (DXF, G-code, Cut List) ต้องผ่านด่านตรวจความปลอดภัย (Safety Gate) ต้องทำซ้ำได้ผลเดิมแบบ bit-identical (Deterministic) และต้องตรวจสอบย้อนกลับได้ด้วยลายเซ็นดิจิทัล (Signed Receipt) — **ถ้ามันพังในโรงงานได้ มันต้อง fail ใน CI ก่อน**

ระบบแบ่งเป็น 3 ชั้นสถาปัตยกรรม:

```
┌─────────────────────────────────────────────────────────────┐
│  Engagement Layer     LINE OA Commerce · Customer Approval  │
├─────────────────────────────────────────────────────────────┤
│  Intelligence/Action  Workflow Copilot · MCP Layer          │
│  Layer                Capture Spine · Accounting            │
├─────────────────────────────────────────────────────────────┤
│  Knowledge Layer      DAPH Second Brain (QMS Vault)         │
│                       Knowledge_Export JSON                 │
└─────────────────────────────────────────────────────────────┘
        ▲ ทั้งหมดวางบนแกน CAD/CAM: Cabinet Designer → Gate →
          Factory Packet → OperationGraph → G-code/DXF → Factory
```

---

## 2. ปัญหาที่แก้

ธุรกิจเฟอร์นิเจอร์บิลท์อิน (เช่น DAPH) เผชิญปัญหาซ้ำ ๆ ที่ทำให้เสียทั้งเงิน เวลา และคุณภาพ:

1. **แบบที่ออกไม่ตรงกับที่ผลิตได้** — นักออกแบบวาดแบบใน CAD ทั่วไป โรงงานต้องตีความเอง เกิดของเสีย (เจาะทะลุแผ่น, รูไม่ตรงกัน, ระยะ Minifix ผิด) เพราะไม่มีระบบตรวจกฎการผลิตก่อนส่งไฟล์
2. **ไฟล์ CNC ไม่น่าเชื่อถือ** — ไม่รู้ว่า G-code/DXF ที่โรงงานได้รับตรงกับแบบเวอร์ชันไหน ใครแก้อะไร แก้เมื่อไหร่ ตรวจสอบย้อนกลับไม่ได้
3. **ความรู้กระบวนการ (QMS) กระจัดกระจาย** — เอกสาร SOS/JES/PFMEA อยู่ใน Excel หลายสิบไฟล์ ค้นหาไม่ได้ ไม่รู้ใครรับผิดชอบขั้นไหน (RACI) ความเสี่ยง (RPN) ไม่ถูกใช้จริง
4. **งานไหลไม่เป็นระบบ** — ไม่รู้ว่างานลูกค้าแต่ละรายอยู่ขั้นไหน (ขาย → วัดพื้นที่ → ออกแบบ → ผลิต → ติดตั้ง) การอนุมัติติดคอขวด ไม่มี SLA ไม่มี escalation
5. **เอกสารการเงิน/หน้างานเข้าระบบแบบมั่ว** — บิล/ใบเสร็จ/ผลสำรวจหน้างานถูกคีย์มือหรือ OCR โดยไม่มีคนตรวจ ข้อมูลผิดไหลเข้าบัญชีเงียบ ๆ และมีความเสี่ยง PDPA เมื่อส่งเอกสารไป cloud OCR ภายนอก

**ต้นทุนของการไม่แก้:** ของเสียจากการเจาะผิดคิดเป็นต้นทุนวัสดุ+เวลาโดยตรง, งานส่งช้าเพราะรออนุมัติ, ปิดบัญชีไม่ได้เพราะเอกสารไม่ครบ, และความเสี่ยงกฎหมายคุ้มครองข้อมูลส่วนบุคคล

---

## 3. เป้าหมายและ Non-Goals

### Goals (ผลลัพธ์ที่วัดได้)

| # | เป้าหมาย | ตัวชี้วัด |
|---|---------|----------|
| G-1 | **ของเสียจากไฟล์ผลิตผิดเป็นศูนย์** | ทุกไฟล์ที่ออกจากระบบผ่าน Gate G1–G11 + G10 (DXF safety) 100%; ไฟล์ที่ waive ต้องมีบันทึกเหตุผล |
| G-2 | **ผลลัพธ์การผลิตทำซ้ำได้ 100%** | Cabinet เดิม → Packet/G-code/ZIP hash (SHA-256) เดิมทุกครั้ง |
| G-3 | **ตรวจสอบย้อนกลับได้ทุกไฟล์** | ทุก export มี signed receipt (Ed25519) ตรวจ offline ได้ด้วย CLI |
| G-4 | **งานทุกออเดอร์รู้สถานะเสมอ** | work item ทุกใบระบุขั้น canonical (0–7) + ผู้อนุมัติ + SLA; งานเกิน SLA ถูก escalate อัตโนมัติ |
| G-5 | **เอกสารเข้าระบบต้องผ่านคนยืนยัน** | Artifact ทุกชิ้น approve ก่อน emit; ไม่มีการเดาค่า (no-guess fail-safe) |
| G-6 | **PDPA by architecture** | OCR ทำ on-premises; ข้อมูล PII ไม่ออกนอกองค์กร; redaction ที่ MCP boundary |

### Non-Goals (สิ่งที่ตั้งใจไม่ทำ)

| # | ไม่ทำ | เหตุผล |
|---|-------|--------|
| N-1 | ไม่เป็น CAD สำหรับงาน freeform/solid modeling ทั่วไป | โฟกัสตู้เฟอร์นิเจอร์แผ่น (panel-based) เท่านั้น — ความแม่นการผลิตมาก่อนความยืดหยุ่นการวาด |
| N-2 | ไม่ให้ AI ตัดสินใจแทนมนุษย์ (auto-execute) | Copilot เป็น advisory-only เสนอ 2–3 ตัวเลือก มนุษย์กดอนุมัติเสมอ (Human-in-the-loop) |
| N-3 | ไม่ทำ e-commerce checkout/ตะกร้าสินค้า | Order model คือ quote → order → ship ของงานสั่งผลิต ไม่ใช่ retail cart |
| N-4 | ไม่ใช้ cloud OCR/LLM ภายนอกกับเอกสาร PII | ขัด PDPA-by-architecture — ใช้ Typhoon OCR self-host |
| N-5 | ไม่ implement ลายเซ็น e-Tax (XAdES + X.509) เอง | ต้องใช้ CA ที่ ETDA รับรอง เป็นงาน governance/lawyer ไม่ใช่ src/crypto (ADR-025) |
| N-6 | ไม่ fork primitive ซ้ำ (reuse-not-fork) | ทุกโมดูลใหม่ต่อยอด C12 identity, audit, D2 autonomy ของเดิม ไม่สร้างซ้ำ |
| N-7 | UI 3D ไม่ใช่ความจริงการผลิต | G-code มาจาก OperationGraph ใน Factory Packet เท่านั้น ไม่มาจากค่าบน UI (Truth Derivation) |

---

## 4. ผู้ใช้และ User Stories

### Personas

| Persona | บทบาท | โมดูลหลักที่ใช้ |
|---------|-------|----------------|
| **Designer (นักออกแบบ)** | ออกแบบตู้ 3D, กำหนดวัสดุ/ฮาร์ดแวร์, แก้ blocker จาก Gate | CAD, Gate, Safety Panel |
| **Technician (ช่างเทคนิค/วิศวกร)** | ตรวจแบบ, อนุมัติ (Freeze/Release), เลือกเครื่อง CNC | Gate, Export, CNC profiles |
| **Factory Operator (โรงงาน)** | รับ Factory Packet, ดาวน์โหลด G-code/DXF, ตรวจ receipt, ติดตาม tool wear | Factory Server, CLI verify |
| **Admin (ผู้ดูแลระบบ)** | จัดการ role, override gate (มี audit), จัดการ signing keys | AdminOverride, Key management |
| **Office Staff (ฝ่ายสำนักงาน)** | ขาย, วัดพื้นที่, วางแผนผลิต — ทำงานผ่าน work item + อนุมัติผ่าน LINE | Workflow, LINE OA |
| **Executive Owner (เจ้าของ)** | รับ escalation ความเสี่ยงสูง (RPN/งบเกิน), ตัดสินใจ owner decisions | Workflow escalation, Copilot |
| **Customer (ลูกค้า)** | ดูแบบ 3D, อนุมัติแบบผ่าน LINE Flex/เว็บ fallback | customer-design-view, approval-postback |
| **Accountant (บัญชี)** | ตรวจ artifact ค่าใช้จ่าย, ปิดบัญชี, ภาษี VAT/WHT | Capture, Ledger, Tax |
| **AI Agent (ผ่าน MCP)** | เรียกใช้ Read tools อัตโนมัติ; Write/Approval tools ต้องรอมนุษย์ | MCP Layer |

### User Stories หลัก (เรียงตามความสำคัญ)

**การออกแบบและผลิต**
- ในฐานะ **Designer** ฉันต้องการปรับขนาดตู้ (กว้าง/สูง/ลึก/toe kick/จำนวนชั้น) ด้วย slider แล้วเห็นโครงสร้างแผ่นและรูเจาะอัปเดตแบบ real-time เพื่อออกแบบได้เร็วโดยไม่ต้องคำนวณเอง
- ในฐานะ **Designer** ฉันต้องการเห็นตำแหน่ง Minifix/เดือย/บานพับใน X-Ray mode พร้อมเส้นบอกระยะแบบ CAD เพื่อยืนยันว่าตรงกับมาตรฐาน System 32 ก่อนส่งผลิต
- ในฐานะ **Designer** เมื่อแบบละเมิดกฎการผลิต (เจาะชิดขอบเกิน, แผ่นซ้อนทับ, ระยะ B ผิด) ฉันต้องเห็น blocker พร้อมปุ่ม Focus ไปยังจุดปัญหาใน 3D และปุ่ม Fix อัตโนมัติเมื่อมี patch
- ในฐานะ **Technician** ฉันต้องการ Freeze spec เพื่อล็อกแบบก่อนส่งออก และ Release เมื่อพร้อมผลิตจริง โดยระบบห้าม export ตอนยังเป็น DRAFT
- ในฐานะ **Factory Operator** ฉันต้องการดาวน์โหลด CNC bundle (ZIP: G-code + manifest + checksums) ที่ระบุ dialect ตรงกับเครื่องของฉัน (Biesse/HOMAG/KDT/Fanuc ฯลฯ) และตรวจ receipt แบบ offline ได้
- ในฐานะ **Admin** ฉันต้องการ override gate ได้ในกรณีจำเป็น โดยระบบบังคับบันทึกเหตุผลและตัวตนลง audit log ที่แก้ไขไม่ได้

**การบริหารงาน**
- ในฐานะ **Office Staff** ฉันต้องการเห็นว่างานลูกค้าแต่ละรายอยู่ขั้นไหนใน 8 ขั้น canonical และส่งต่อขั้นถัดไปได้เมื่องานขั้นปัจจุบันจบ (ข้ามขั้นไม่ได้)
- ในฐานะ **ผู้อนุมัติ** ฉันต้องการกดอนุมัติ/ปฏิเสธจาก LINE ได้ในคลิกเดียว และมีเว็บ fallback เมื่อ LINE ล่ม โดยผลตัดสินสองช่องทางต้องตรงกันเสมอ
- ในฐานะ **Executive Owner** เมื่องานมีความเสี่ยง RPN เกิน threshold หรืองบเกินเพดาน ฉันต้องได้รับ escalation ทันที ไม่ใช่รู้ทีหลัง
- ในฐานะ **Customer** ฉันต้องการดูแบบและกดอนุมัติผ่าน LINE โดยไม่ต้องสมัคร account ระบบ (ระบบไม่สร้าง DB principal ให้ลูกค้า — ทำผ่าน Edge Function)

**ข้อมูลและการเงิน**
- ในฐานะ **Accountant** ฉันต้องการให้บิล/ใบเสร็จที่ถ่ายส่งเข้า LINE ถูก OCR แล้ว**รอคนยืนยัน**ก่อนลงบัญชี พร้อมธง fraud (VAT ไม่ตรง, vendor ไม่อยู่ใน master, เอกสารซ้ำ)
- ในฐานะ **Accountant** ฉันต้องการบัญชีคู่ (double-entry) หลายเล่ม (internal/statutory/tax) ที่ทุก entry สมดุลเสมอ และคิด VAT 7%/WHT ถูกต้องตามกฎไทย
- ในฐานะ **AI Agent** ฉันต้องการค้นหาเครื่องมือ (tool discovery) ตาม role ของ principal และเรียก Read tool ได้ทันที ส่วน Write tool ต้องเข้าคิวรอมนุษย์อนุมัติ (Pending_Invocation) พร้อม expiry

---

## 5. สถาปัตยกรรมภาพรวม

### 5.1 แกน CAD/CAM — เส้นทางจากแบบสู่โรงงาน (Trust Chain)

```
Cabinet (Zustand store)
   │  B1: generateDrillMap — กำหนดจุดเจาะ Minifix/Dowel ตาม System 32
   ▼
DrillMap (จุดเจาะ ~100+ จุด/ตู้)
   │  Gate G1–G11 — ตรวจกฎการผลิต → BLOCKER/WARNING/INFO
   ▼
FactoryPacket (JSON deterministic + SHA-256 content hash)     ← Freeze ที่นี่
   │  B3: G9 assertValidPacket — ด่านตรวจ packet ภายนอก
   ▼
OperationGraph (DRILL/BORE/POCKET/PROFILE/SLOT operations)
   │  B4: Post Processor ต่อ dialect เครื่อง
   ▼
G-code (Fanuc/BiesseISO/Heidenhain/CIX/MPR/XXL/Weeke)
DXF R12 (ผ่าน Gate G10.1/10.2/10.3)
   │  D5: Deterministic ZIP + Signed Receipt (Ed25519)
   ▼
Factory (ตรวจ receipt offline ด้วย monolith-receipt-verify)
```

### 5.2 ชั้นธุรกิจ — 3-Layer Business OS

| ชั้น | Spec | สถานะ | หน้าที่ |
|-----|------|-------|--------|
| **Knowledge** | daph-obsidian-second-brain | ✅ 100% | QMS Vault (SOS/JES/PFMEA/RACI) → `_knowledge-export.json` |
| **Intelligence/Action** | monolith-workflow-copilot | ✅ Phase 1 (113/134 tasks) | Work item, approval, SLA, Copilot, notification |
| | monolith-mcp-layer | 🔵 43/49 tasks | MCP tool catalog + D2 gating + rate limit + audit |
| | capture-spine | ✅ Wave 0+1 (42/43 tasks) | Ingest → OCR → verify → commit (ledger/spec/survey) |
| | monolith-accounting | 🟡 37/103 tasks (Phase 3) | Ledger คู่, multi-book, VAT/WHT, BOM costing |
| **Engagement** | line-oa-commerce | ✅ 100% (20/20 tasks) | LINE webhook, identity, order, template, outbound |
| | design-hub-platform-phase2 | ⏸ รอ owner decisions | Design Hub (Phase 2) |

### 5.3 หลักการสถาปัตยกรรม (Architectural Principles)

1. **Human-in-the-loop** — AI เสนอ (autonomy tier L0/L1) มนุษย์ตัดสิน; Write/Approval tool ผ่าน human gate เสมอ
2. **Reuse-not-fork** — C12 identity/role/site, audit, D2 Autonomy Ladder ใช้ร่วมทุกโมดูล
3. **Append-only audit** — ตาราง audit ทั้งหมด REVOKE UPDATE/DELETE
4. **Fail-safe / No-guess** — ข้อมูลไม่พร้อม → block ไม่ auto-pass; OCR สกัดไม่ได้ → null ไม่ใช่ "N/A"
5. **PDPA by architecture** — OCR on-prem (Typhoon), PII redaction ที่ boundary, ไม่มี egress
6. **Determinism ทุกชั้น** — stable JSON (sorted keys), deterministic ZIP (epoch mtime), FFDH sort ล็อกลำดับ
7. **Truth Derivation** — ความจริงการผลิตมาจาก Packet/OperationGraph ไม่ใช่ state บน UI

---

## 6. ข้อกำหนดรายโมดูล

> รูปแบบ: **[P0]** = Must-Have (ระบบใช้ไม่ได้ถ้าขาด), **[P1]** = Nice-to-Have, **[P2]** = Future
> เครื่องหมาย ✅ = implement แล้วและมีเทสต์คุ้มครอง, 🔵 = บางส่วน, 📋 = ยังไม่เริ่ม

### 6.1 โมดูล CAD — 3D Cabinet Designer

**ไฟล์หลัก:** `src/App.tsx`, `src/components/canvas/`, `src/components/ui/`, `src/core/store/`

#### 6.1.1 Workspace และ Viewport [P0] ✅

- Layout 3 แผง: ซ้าย = DesignerIntentPanel (Catalog/Materials/Hardware/Decor/Skills/Safety/Logic/Versions), กลาง = 3D Viewport, ขวา = ParametricContractPanel
- View presets 7 แบบ: Front/Left/Top (orthographic 2D), Perspective/Install (3D), Factory/CNC (top-down)
- WebGL context loss recovery (cooldown 2000ms)
- Dark/Light theme พร้อม persistence
- Infinite grid, lighting 2 directional + ambient, shadow map 2048²

#### 6.1.2 Parametric Cabinet Modeling [P0] ✅

- ประเภทตู้: BASE / WALL / TALL (CabinetTaxonomy)
- ปรับมิติผ่าน slider + input: Width, Height, Depth, Toe Kick, Shelf Count, Divider Count → `generatePanels()` สร้างแผ่นใหม่แบบ deterministic
- Construction type: **INSET** (บังใบ/เซาะร่อง) vs **OVERLAY** (วางทับ) — กระทบตำแหน่งรูเจาะทั้งระบบ
- Back panel: เปิด/ปิด, inset (เซาะร่อง `grooveDepth`, `backVoid`, `backThickness`) หรือ overlay; ตำแหน่ง `backZ = -D/2 + backVoid + backTotalT/2`
- Grain Direction ต่อแผ่น (VERTICAL/HORIZONTAL) พร้อม default ตาม role (ข้าง=ตั้ง, พื้น/ชั้น=นอน) และหมุน texture 90° แบบ real-time
- Panel Config Modal (double-click ที่แผ่นใน 3D หรือใน Panel List): ตั้ง offset, วัสดุ core/surface A/B, edge banding 4 ด้าน, groove settings
- Glue Mode: จัดตู้ชิดกันแบบ face-to-face (Preview → Enter ยืนยัน)
- Collision highlight เมื่อตู้ซ้อนทับ

#### 6.1.3 เครื่องมือแก้ไข (Tools) [P0] ✅

- Select (V), Move (G/W), Rotate (R), Scale (S), UV/True-Grain (U), Measure (M)
- Gizmo แบบ Plasticity: ล็อกแกน X/Y/Z, plane drag, step 1/5/10mm, Fine mode (Shift), HUD แสดง delta
- Snap system: grid/edge/corner + visual guides + preview
- Sketch mode บน construction plane (XY/YZ/ZX): Line (L), Rect (T), Point (P) + snap endpoint/midpoint
- Command Palette (Space/Cmd+K) ค้นหาคำสั่งทั้งหมด, Radial Menu (right-click, 8 ช่อง), Shortcut overlay (?)

#### 6.1.4 ระบบวัสดุ (Material Stack) [P0] ✅

- โครงสร้าง: Core (PB-01 Particleboard / MDF-01 / PLY-01) + Surface A/B (HPL-01, VEN-01 Veneer) + Edge (PVC-01, ABS-01, WD-01)
- ความหนารวมคำนวณกลางที่เดียว (`materialThickness.ts`): core + 2×surface + 2×glue + edge (ต่อด้าน) — **ห้ามกระจายสูตรความหนา** (thickness-compliance skill)
- TriplanarMaterial สำหรับลายไม้สมจริง, preload เฉพาะ texture ที่ใช้
- BIM classification badge ต่อวัสดุ

#### 6.1.5 ระบบฮาร์ดแวร์ (Hardware) [P0] ✅

- **Minifix S200 (Häfele)** — สเปคอ้างอิงจริง: CAM Ø15 ลึก 13.5mm (ไม้ 18mm), Bolt sleeve Ø10 ลึก 17.5mm, Shaft Ø5 ยาว 11mm, Dowel Ø8×30mm (19 edge + 11 face), Distance B = 24mm (มาตรฐาน) / 34mm (ทางเลือก)
- MinifixConfigPanel: เลือก Minifix 15/12, ปรับ depth ตามความหนาไม้ 16–19mm, Live 3D Preview ของชุดประกอบ
- **Minifix Transform**: V-Flip / H-Flip / rotate ต่อ connector ผ่าน HardwareContextMenu (right-click ใน X-Ray) — 3 ระบบ sync กัน: 3D hardware model, cam ใน Preview3D (quaternion รอบแกน bolt), ตำแหน่งรูเจาะ (Rodrigues 180°)
- Override system: dual-key resolution `pairKeyV2 (content-addressed) → pairId (legacy) → globalConfig → null`; persist ต่อ connector
- Catalog อื่น: บานพับ (Blum/Hettich/Grass + overlay types), Shelf pins 5mm, Drawer systems (Tandembox/ArciTech), Handles, LED lighting
- Hardware Library: บันทึก preset ผู้ใช้ (เช่น S200/18mm)
- ConnectorList: toggle การแสดงผลต่อชนิด (Minifix/Hinges/Dowels/Shelf pins/Drawers)

#### 6.1.6 Drill Map Visualization [P0] ✅

- X-Ray mode (Alt+Z) → แสดงฮาร์ดแวร์ + จุดเจาะ
- CADDrillIndicators: annotation 2D สไตล์ CAD (วงกลม+label; แดง=CAM, เขียว=BOLT, น้ำเงิน=DOWEL)
- CSGDrillOverlay: เจาะรูจริงใน geometry ด้วย CSG boolean
- HardwareSmartDimensions: เส้นบอกระยะแบบ datum chain — PART A (Distance B, ส้ม), PART B (ระยะแกน Z, เขียว), PART C (ระยะแกน Y ของ BACK connectors, เขียว) เช่น pattern `50, 32, 246, 32, 32, 246, 32, 50 = 720mm`
- CADDrillMapView: โมดอลแผนที่เจาะ 2D เต็มจอ

#### 6.1.7 เครื่องคิดเลขงานตกแต่ง (Decor Calculators) [P1] ✅

- Hidden Door Hinge Calculator (แขนบานพับ/มุมเปิด), Kerf Bending (ระยะ kerf ดัดโค้ง), Wainscoting (ตีตาราง), Slat Calculator (ระแนง)

#### 6.1.8 Persistence และ Versions [P0] ✅

- Save/Load โปรเจกต์ (localStorage, project-scoped), auto-save debounced, dirty tracking, Ctrl+S
- Project Lineage: commit history แบบ git-like (ChainViewer, LineageTimeline)
- Persist: theme, tool state, snap presets, hardware presets, drill map overrides

**Acceptance criteria ตัวอย่าง (6.1):**
- [ ] เปลี่ยน Width ตู้ → แผ่นทุกชิ้น + DrillMap สร้างใหม่ภายใน debounce 300ms โดยไม่มี error
- [ ] V-Flip connector → โมเดล 3D, cam preview และจุดเจาะหมุนตามกันครบ 3 ระบบ
- [ ] เปลี่ยน grain direction ขณะเปิด Panel Config → texture หมุนให้เห็นทันที (selection ใช้ emissive ไม่ปิด texture)

---

### 6.2 โมดูล CAM — Manufacturing Pipeline

**ไฟล์หลัก:** `src/gate/`, `src/cnc/`, `src/factory/`, `src/nesting/`, `src/core/export/`

#### 6.2.1 Gate System (Safety Gates) [P0] ✅

| Gate | ตรวจอะไร | ค่าคงที่สำคัญ |
|------|---------|--------------|
| G1–G6 | ขนาดตัดไม่ติดลบ, edge allowance, ระยะขอบขั้นต่ำ, ความลึกเจาะปลอดภัย, ระยะ fitting, clearance หลังตู้ | `minMarginToEdgeMm: 8`, `minFeatureSizeMm: 12`, `backPanelClearanceMm: 2`, `minFittingSpacingMm: 32` |
| G4 | เรขาคณิต: งบ OD (กว้าง/สูง/ลึก), แผ่นไม่ซ้อนทับ, ขอบประกอบเป็นไปได้ | `odToleranceMm: 0.1`, block เมื่อ overlap ≥ 1mm³ |
| G9 | Packet Validation Boundary — packet ภายนอกต้องผ่าน `assertValidPacket()` | Branded type `ValidatedFactoryPacket` |
| G10/.2/.3 | DXF: boundary layer, semantic (contour ไม่ตัดตัวเอง/ปิดสนิท), machine dialect | 3 ชั้นก่อน download |
| G11 | Minifix/System32: Distance B 24–34mm, ความลึกเดือย (SIDE 18 / TOP-BOTTOM 12), การจับคู่ CAM↔BOLT ≤0.1mm | `MATING_TOLERANCE: 0.1`, `DEPTH_TOLERANCE: 0.5` |

- ผลตรวจ 3 ระดับ: **BLOCKER** (ห้าม export) / **WARNING** (waive ได้) / **INFO**
- SafetyPanel: รายการ findings + ปุ่ม Focus (ซูมไปจุดปัญหาใน 3D) / Fix (apply patch อัตโนมัติ) / Copy
- Waive/Unwaive workflow พร้อมบันทึกเหตุผล; AdminOverrideDialog สำหรับ admin (audit บังคับ)
- **Spec state machine: DRAFT → FROZEN → RELEASED** — export ได้เฉพาะ FROZEN/RELEASED
- CI bypass-scan (`scripts/gates/bypass-scan.ts`): สแกน pattern ต้องห้ามที่พยายามข้าม gate ใน source; exit 1 = BLOCK

#### 6.2.2 Drill Map Generation [P0] ✅

- Deterministic: มุม TOP/BOTTOM รับ CAM, แผ่นข้างรับ BOLT/DOWEL, จำแนก corner type (TOP_LEFT…, SHELF_n_*, BACK_*)
- System 32: pitch 32mm, first hole 50mm; dowel ที่ชิดขอบเกิน `firstHoleZ` ถูกกรองออก
- B-run dowel generation แบบ axis-tagged keys + pairing validator (`validateBRunDowelPairing`)
- Bolt orientation policy (seam-driven twist) + `validateBoltPocketLinkage` (ทิศ bolt ชี้เข้า cam pocket)
- Panel basis: AABB → local frame ต่อแผ่น เพื่อความ deterministic
- Golden fixtures (เช่น `A_RUN_INSET_600x720x560_18mm.golden.json`) ป้องกัน regression

#### 6.2.3 CNC Pipeline [P0] ✅

- `mapDrillMapToOps`: Ø≤8mm → DRILL, Ø>8mm → BORE; ประเภท operation ทั้งหมด: DRILL / BORE / POCKET / PROFILE / SLOT (+ PeckDrill, Counterbore, Countersink, Tap, HelicalMill ตาม CHANGELOG D1)
- `buildOperationGraph`: ValidatedFactoryPacket + machine profile → OperationGraph + สถิติ
- Machine presets: KDT, Biesse, SCM, HOMAG, Generic; G-code dialects: Fanuc, Heidenhain, BiesseISO, CIX, MPR, XXL, Weeke
- GcodeBuilder: deterministic (เลขบรรทัด, comment, format คงที่)
- CNC Cache (IndexedDB): key = SHA-256(packetContentHash + machineId + dialect + postVersion); **Re-verify on load** ตรวจ tamper
- CNC Bundle ZIP: manifest schema `monolith.cnc.manifest@1.0` + opgraph.json + checksums

#### 6.2.4 Factory Packet [P0] ✅

- ส่วนประกอบ: `drillMap.json`, `connectors.json`, `cutList.json`, `gateResult.json`, `_manifest.json` (contentHash SHA-256)
- Deterministic serialization (sorted keys, stable pretty-print)
- **T008 Contract:** DXF export ต้องมาจาก OperationGraph เท่านั้น (มี e2e test log ยืนยัน)

#### 6.2.5 Nesting [P1] ✅

- FFDH (First Fit Decreasing Height) guillotine: sort สูง desc → กว้าง desc → ID asc (deterministic)
- Multi-sheet (สูงสุด 1000 แผ่น), utilization % ต่อแผ่น, รองรับ kerf width + edge clearance + grain direction + canRotate

#### 6.2.6 DXF Export [P0] ✅

- DXF R12 (AC1009): HEADER/TABLES (layers: OUTLINE, CUTOUT, SHEET, PATH)/BLOCKS/ENTITIES (POLYLINE)
- Groove/back panel параметры อ่านจาก `cabinet.manufacturing` (dual manufacturing data — sync ผ่าน `setManufacturingParam`)
- Export policy: อนุญาตเฉพาะ FROZEN/RELEASED + gate ผ่าน/waived

#### 6.2.7 Tool Wear Intelligence (D6) [P1] ✅

- toolUsageObserver ติดตามการใช้ต่อ operation, wear model (อายุเครื่องมือ vs ชั่วโมง/จำนวนรู), threshold + maintenance UX, IndexedDB store

---

### 6.3 โมดูล Factory Server

**ไฟล์หลัก:** `server/src/` (Express + BullMQ + Redis; แยก API process กับ Worker process)

#### 6.3.1 Bundle & Export API [P0] ✅

| Endpoint | หน้าที่ |
|----------|--------|
| `POST /api/bundle/upload` | อัปโหลด artifact bundle + ตรวจ manifest signature ก่อนเก็บ (CAS) |
| `GET /api/bundle/list`, `GET /api/bundle/:id` | รายการ/รายละเอียด bundle |
| `POST /api/export/queue` → `GET /api/export/status/:jobId` → `GET /api/export/download/:jobId` | Async export ผ่าน BullMQ (attempts 3, exponential backoff) |
| `POST /api/export/direct` | Export เล็ก แบบ synchronous |
| `POST /api/export/zip` | Gated export: ตรวจ state = RELEASED → deterministic ZIP + SHA-256 header (P2.2a) |
| `GET /api/export/options` | Format/dialect ที่มี (KDT/BIESSE/HOMAG …) |
| `GET /factory/export/options`, `POST /factory/jobs/:jobId/export`, `GET .../download`, `GET .../history` | Factory job export + ประวัติ (สูงสุด 1000 รายการ) |
| `GET /api/health` | version, uptime, CAS stats, queue stats, key count |

- **Export formats:** CUTLIST_CSV (dialect Excel/RFC4180/HOMAG/BIESSE/SCM), DXF_R12 (ต่อ sheet / ต่อ part + nesting), GCODE (GRBL/MACH3/LinuxCNC/Fanuc/HOMAG), PDF report (pdfkit: cutlist + BOM + material summary), STEP (3D CAD), BOM_JSON

#### 6.3.2 Signed Export Receipt (P13) [P0] ✅

- Receipt schema `MONOLITH_EXPORT_RECEIPT_V1`; `receiptId = SHA-256(canonical payload)`; บันทึก `zipSha256`
- ลงนาม **Ed25519** (key จาก env/file, PKCS8); pinned public keys (`production.receipt.pubkeys.v1.json`) + validity window (validFrom/validUntil) + revocation (reason + timestamp)
- Key management API: `POST /api/keys/register`, `GET /api/keys`, `POST /api/keys/:id/revoke`
- **CLI `monolith-receipt-verify`** ตรวจ ZIP แบบ offline — Golden Matrix P13.4: PASS baseline / unknown key / revoked key / not-yet-valid / expired; result codes `R_OK, R_SIG_INVALID, R_SIG_KEY_UNKNOWN, R_SIG_KEY_REVOKED, R_SIG_KEY_EXPIRED, …`; `--json`, `--strict` (warning = fail)

#### 6.3.3 Audit / Activity / Proof / Lineage [P0] ✅

- Audit log ค้นหาได้ (`GET /api/audit` + filters, `/api/audit/stats`): EXPORT_SUCCESS, VERIFY_FAIL, POLICY_DENIED, EXPORT_ERROR
- Activity timeline ต่อ job (P8, NDJSON): EXPORT_ATTEMPT, VERIFY_RUN, EXPORT_BLOCKED, EXPORT_SUCCESS + actor จาก headers
- Proof bundle (P12): `GET /factory/jobs/:jobId/proof` — server-authoritative state (specState, revisionId, hashes, latest verify/export) + proof warnings (`W_RELEASED_NO_REVISION`, `W_INVALID_ARTIFACT_HASH`)
- Lineage (P9.1): revision chain แบบ immutable ต่อ job

#### 6.3.4 Server-side Post Processing [P1] ✅

- FlatPart conversion (3D → sheet parts), DXF geometry builder, offset kernel (tabs, keepout, multi-tool), nest rotation, tool change planner, G-code writer + machine profiles

---

### 6.4 โมดูล Knowledge — Vault Builder

**ไฟล์หลัก:** `tools/vault-builder/src/`, output: `daph-second-brain/`

#### ข้อกำหนด (16 ข้อ — ✅ ครบ, 7 correctness properties ผ่าน PBT)

1. สแกน 2 โดเมน (Process: `New folder/` Excel QMS 28 ไฟล์; Hardware: `furniture-hardware-vault/` + PDF catalog `New folder (2)/`) → จำแนก Domain/Group/Unit/Type/Status/Owner ด้วย keyword rules
2. โมเดลกระบวนการ canonical: **Office 6 หน่วย** (Sale → Area Measurement → Designer → 3D_Presentation → Production Planning → 3D_Rendering_Final), **Factory 6 สถานี** (Laminate HPL → Cutting → Edging → CNC → Assembly → Packing), **Installation 16 ขั้น**
3. โครงสร้าง PARA (01-Projects / 02-Areas / 03-Resources / 04-Archives)
4. Index_Note ต่อเอกสาร (frontmatter + embed ต้นฉบับ)
5. Document_Set linking: SOS ↔ JES ↔ PFMEA ↔ Process Control Plan
6. Master_Process_Matrix จาก Excel (RACI + เวลา + ต้นทุน)
7. แปลง `.xls` BIFF ด้วย SheetJS/LibreOffice
8. Home Dashboard + MOC (prev/next links) | 9. kebab-case naming | 10. duplicate/draft → Archives | 11. tag taxonomy | 12. glossary | 13. Mermaid | 14. templates | 15. plugin guides
16. **Knowledge_Export** (`_knowledge-export.json` 113KB): PFMEA 122 rows + process model 28 entries + RACI + approval_quorum — สัญญา read-only ให้ Workflow Copilot

**Pipeline (idempotent, non-destructive):** Scanner → Classifier → Inventory → FileMover → DocumentSetLinker → NoteGenerator → MOCGenerator → DashboardGenerator → StaticAssets → KnowledgeExport
**Invariant:** รันซ้ำ = ผลเดิม (scan count คงที่ — มีเทสต์ยืนยัน); ไฟล์เก่าย้ายไป Archives ไม่ลบ; `_move-log.md` ย้อนกลับได้

> ⚠️ **ข้อจำกัดสำคัญ:** โฟลเดอร์ `New folder`, `New folder (2)`, `_daph_extract`, `furniture-hardware-vault`, `daph-second-brain` เป็น data source/output ของ pipeline — ห้ามย้าย/ลบออกจาก workspace

---

### 6.5 โมดูล Workflow Copilot

**ไฟล์หลัก:** `src/workflow/`, `supabase/migrations/0001–0035`, Edge Functions: `sla-sweep-scheduler`, `approval-postback`, `notification-retry-worker`, `customer-design-view`, `web-fallback-api`

#### ข้อกำหนด 21 ข้อ (Req 1–21) — ✅ Phase 1 เสร็จ, 🟡 Phase 1.5 (Req 21) ค้าง

**[P0] Process Model & Work Items ✅**
- Canonical 8 ขั้น (order 0–7): Sale → Area Measurement → Designer → 3D_Presentation → Production Planning → 3D_Rendering_Final → Factory → Installation
- Identity ของขั้น = `canonical_order` (integer) ไม่ใช่ชื่อ (ADR-017 — ชื่อซ้ำได้); handoff เข้มงวดข้ามขั้นไม่ได้
- Work item status: in_progress, awaiting_approval, blocked, rework, awaiting_requote, awaiting_customer_acceptance, completed
- Knowledge Import: `rpc_import_knowledge(payload, source_version)` validate Knowledge_Export → `process_model` (is_current flag)

**[P0] Approvals ✅**
- Quorum 3 แบบ: **unanimous** (ทุกคนอนุมัติ; reject = fail-fast), **majority** (>ครึ่ง), **first_response**
- Attempt-scoped: UNIQUE (work_item, gate_order, resolved_approver, attempt) — รอบใหม่เริ่ม attempt ใหม่ (0029 fresh cycle)
- Approver resolution จาก RACI: unanimous → approvers[]; อื่น → [accountable] (ADR-018)
- One-click approve ผ่าน **LINE** (Encrypted_Postback + HMAC verify) และ **web fallback** (JWT session) — idempotent ตาม webhook_event_id
- **Customer Approver (Req 20):** ลูกค้าอนุมัติผ่าน LINE Flex / customer-design-view โดยไม่เป็น DB principal; Edge Function mediate; timeout → escalate ไป project_manager
- Delegation: มอบอำนาจอนุมัติ + revoke (0016/0017)

**[P0] Notifications ✅**
- Dispatch state machine: queued → pending → sent/failed; channels: direct_push / group_message
- Quiet hours + mute category + **daily digest** (`notification_digest_pending`, no-orphan constraint); เร่งด่วน push ข้าม quiet hours
- Retry worker (backoff exponential); celebrate เมื่อจบขั้นสุดท้ายจริงเท่านั้น (ไม่ใช่ manual close) และเคารพ quiet hours (0034/0035)

**[P0] SLA & Escalation ✅**
- SLA sweep (cron): 50% ของ SLA → reminder, 100% → timeout + escalate (status='escalated')
- Escalation สู่ executive_owner เมื่อ **RPN > threshold** หรือ **budget > ceiling** (Req 13); RPN ยังไม่ประเมิน = fail-safe สู่ human review (ADR-011)

**[P0] Copilot (advisory-only) ✅**
- เสนอ 2–3 ตัวเลือก + ข้อดี/ข้อเสีย + อ้างอิงแถว PFMEA/RPN; ไม่ auto-execute (Req 5.5/5.6); กลไกไม่พร้อม → block (Req 5.7)
- Action Type Registry (Req 19): {risk_class, max_allowed_tier, r02_bound} ธรรมาภิบาล D2

**[P1 — Phase 1.5] Revision Discipline (Req 21) 🟡**
- Revision_Reason {daph_defect, customer_change, scope_change}; Design_Lock gates {G1–G4}; scope_change → **re-quote FSM**: awaiting_requote → internalAccepted ∧ customerAccepted → proceed (โครง code + migration 0024 มีแล้ว; ยังเหลือ task ปิด)

**Audit:** `workflow_audit_log` append-only; RLS site-scoped (governance | has_site_access)

---

### 6.6 โมดูล LINE OA Commerce

**ไฟล์หลัก:** `supabase/functions/line-webhook`, `line-outbound-sender`, migrations `00000000000000–62` — ✅ เสร็จ (13 req, 31 properties ผ่าน PBT)

**[P0] ทั้งหมด ✅**
- **Webhook ingest:** ตรวจ HMAC signature ด้วย per-channel secret จาก **Vault** (Edge Function ไม่ถือ secret); idempotent ตาม `webhook_event_id` UNIQUE
- **Multi-vertical:** channel เดียวรองรับ 2 ธุรกิจ (Monolith furniture + TCCK food) ผ่าน `vertical_context`
- **Identity resolution:** LINE user_id → canonical customer; `match_confidence` + `manual_review_required` — **ไม่ auto-merge** (มนุษย์ตรวจ)
- **Conversation lifecycle:** site_unresolved → open → closed; site resolve ผ่าน postback/manual; session timeout sweep (cron)
- **Outbound:** staged pending → sent/failed; worker claim rows, resolve token จาก Vault, ส่งผ่าน LINE API (reply/push), scrub logs
- **Message templates:** pre-approved + named slots (`{{order_id}}`), vertical-scoped, immutable version, **ไม่มี free-text LLM**; brand voice ≤200 ตัวอักษร
- **Order creation:** canonical Order_Lifecycle (quote → order → ship), origin_channel='line_oa', idempotent
- **Forecast sync + query audit**; RLS site-scoped; audit append-only

**ตาราง:** `line_oa_channels` (เก็บเฉพาะ Vault refs), `line_oa_conversations`, `line_oa_inbound_messages`, `line_oa_outbound_messages`, `line_oa_customer_identity`, `line_oa_message_templates`, `line_oa_orders`, `line_oa_audit_log`

---

### 6.7 โมดูล MCP Layer

**ไฟล์หลัก:** `src/mcp/`, `supabase/functions/mcp-server`, `mcp-approval-callback`, `mcp-pending-cleanup`, migrations `0036–0048` — 🔵 43/49 tasks

**[P0] Tool Catalog & Classification ✅**
- Registry: `tool_name` PK, `tool_class` ∈ {Read_Tool, Write_Tool, Approval_Tool}; constraint: Read → requires_approval=false, Write/Approval → true
- Discovery (`GET /mcp`) กรองตาม role ของ Principal; input/output JSON schema ต่อ tool

**[P0] Invocation Pipeline ✅**
- Read tool: execute ทันที (`rpc_mcp_invoke_read`)
- Write/Approval tool: สร้าง **Pending_Invocation** รอมนุษย์ → `mcp-approval-callback` resolve; **expiry** 1h–30d (default 72h) → `rpc_mcp_expire_pending` (cron `mcp-pending-cleanup`); expired ≠ rejected, ไม่มี side effect
- Idempotency: (idempotency_key, principal) PK + input_hash conflict detection
- Rate limit: scope Principal/MCP_Client/Tool_Class — count "strictly exceed", cost budget "reach-or-exceed"; ไม่มี policy → fail-safe block

**[P0] Governance & PDPA ✅**
- Authorization: role + site_access + active site; governance ข้าม site ได้**เฉพาะ Read** (Req 3.3); RPC re-derive สิทธิ์เอง (กัน confused-deputy Req 19.3)
- Data_Minimization_Boundary: redact PII + filter allowedFields ก่อนส่งออก MCP client
- Audit: `tool_invocation` (Model_Provenance, autonomy_tier, result_ref) append-only; client input = data เท่านั้น ไม่ตีความเป็นคำสั่ง (Untrusted_Content)

**[P1] 📋 คงเหลือ:** unit tests เพิ่มเติม + งานตาม ADR-019 (MCP-native write gate)

---

### 6.8 โมดูล Capture Spine

**ไฟล์หลัก:** `src/capture/`, Edge Functions: `capture-ingest`, `capture-ocr-extract`, `field-capture`, migrations `0049–0080` — ✅ Wave 0+1 (11 req)

**[P0] Ingest → OCR → Verify → Commit ✅**
- Ingest จาก LINE/Email/App (end-user JWT, `resolve_actor` = ผู้ส่งจริง); idempotency_key = `capture_type:SHA-256(content)`
- OCR **on-prem (Typhoon)** Stage 1 + field extraction Stage 2; บันทึก ocr_text, ai_payload, confidence, ai_provider, model_version (provenance)
- **Lifecycle:** proposed → approved/rejected → emitted → superseded; terminal + emitted = content immutable (แก้ = สร้างใหม่ + supersede link)
- **Human verify gate:** บังคับ confirm เมื่อ (ก) critical field ขาด (ข) confidence < threshold (ค) fraud suspicious; **approve-before-emit เสมอ**
- **No-guess:** ห้าม sentinel (N/A, unknown, TBD, "-", null-string) — สกัดไม่ได้ = null
- **Fraud signals (config):** VAT mismatch, vendor ไม่อยู่ใน master, total anomaly, เอกสารซ้ำ → flag (ไม่ auto-reject) + feedback loop; verify rules seed จาก PFMEA (pfmea_ref traceability)
- **Master validation:** vendor_master / material_master lookup; ไม่เจอ → unverified_fields + suspicious (ไม่ block)

**[P0] Commit Targets (config-driven ต่อ capture_type) ✅**
| capture_type | ปลายทาง |
|---|---|
| expense_document | Ledger (journal posting ผ่าน `rpc_capture_ledger_adapter`) |
| material_receipt | ราคาซื้อจริง + moving average cost (`rpc_capture_costing_adapter`) |
| site_survey | `site_survey_zone` (versioned ต่อ site+zone, supersede chain) |
| spec_draft | Released_Spec (CAM/BOM link, `rpc_capture_spec_adapter`) |
| qc_capture / installation_proof | QC record / POD |
| work_item_complete | ปิด work item (0063) |

- Receivables (ACC-12): `receivable` table + `rpc_find_overdue_receivables` + aged analysis (30/60/90/120+)

**[P2] Wave 2 📋:** e-Tax PDF/A-3 + XML signing (รอ ADR-025), email webhook, multi-dept cowork config

---

### 6.9 โมดูล Accounting

**ไฟล์หลัก:** `src/ledger/`, `src/tax/`, `src/manufacturing/`, `src/connectors/`, migrations `0066–0079` — 🟡 37/103 tasks (Phase 3)

**[P0] Ledger Engine ✅ (รากฐาน)**
- Double-entry: `journal_entry` + `journal_line` (debit XOR credit ต่อบรรทัด); **invariant: Σdebit = Σcredit ต่อ entry** (`rpc_post_journal_entry` ตรวจ)
- COA: `ledger_account` (asset/liability/equity/revenue/expense) seed 20+ บัญชี
- **Multi-book** (internal/statutory/tax): post/statement แยกเล่มเด็ดขาด; DB-first (RPC/RLS) ตาม ADR-024
- Expense category map (policy-driven allocation, 0067)

**[P0] Tax ✅ (ตรรกะ) / 📋 (เอกสารทางการ)**
- VAT 7%: `composeFromNet`, `splitInclusive` (ปัดเศษ 2 ตำแหน่ง)
- Invoice number: strictly-increasing seq + duplicate = throw (fail-safe); format `PREFIX-YYYY-NNNN`
- WHT: rate tables ต่อประเภทเงินได้ + RD prep format (ภ.ง.ด.3/53)
- e-Tax XML serialization มีโครง; **ลายเซ็น XAdES + X.509 = Non-Goal จนกว่า owner จัดหา CA (ADR-025)**

**[P1] Manufacturing Costing ✅ (ตรรกะ)**
- BOM: create/explode (qtyPerUnit × units); Job costing: material + labor + overhead → close → post to ledger (WIP/labor/overhead)
- Inventory issue: qty > stock → InsufficientStockError; Moving Average Cost ต่อ material receipt
- FX: dual-standard rounding — ปัดต่อบรรทัด 2 ตำแหน่ง + plug residual เข้า rounding_difference account (ADR-022)

**[P1] Connectors ✅ (บางส่วน)**
- PDM sync (part master, idempotent ตาม eventId, revision history append-only), BIM import, bank feed reconciliation (โครง)

**[P2] 📋 คงเหลือ:** bank feed connector จริง, multi-currency 160 สกุลเต็มรูป, รายงานงบการเงิน TFRS/NPAE, e-Tax production

---

### 6.10 โมดูล IAM — C12 Foundation

**ไฟล์หลัก:** `src/iam/`, migration `00000000000000_c12_foundation.sql` — ✅

- **C12 helpers (ใช้ร่วมทุกโมดูล):** `resolve_actor()`, `has_site_access(site_code)`, `is_governance_role()`, `has_any_app_role(roles[])`, `get_active_site_codes()`, `current_app_roles` view
- Roles: governance, site_admin, employee, customer_approver, sale, designer, production, finance
- RLS ทุกตารางธุรกิจ: fail-closed default; SELECT = governance | site_access; governance bypass เฉพาะที่กำหนด
- Scope enforcement ฝั่ง code: `isRowVisible`, `authorizeCrossDept` (fail-closed throw)

---

## 7. Invariants และ Contracts

### 7.1 ค่าคงที่การผลิต (Manufacturing Constants)

| ชื่อ | ค่า | ละเมิดแล้วเกิดอะไร |
|-----|-----|---------------------|
| Thickness safety margin | 0.5 mm | เจาะทะลุแผ่น → ของเสีย |
| Min edge margin | 8 mm | ขอบแตก → ข้อต่ออ่อน |
| Min fitting spacing (System 32) | 32 mm | รูชนกัน → ประกอบไม่ได้ |
| Distance B (Minifix) | 24 mm (standard) / 34 mm (alternate) | CAM ประกอบเยื้อง |
| Dowel depth | SIDE 18 mm / FACE 12 mm | เดือยยึดไม่พอ |
| CAM depth (ไม้ 18mm) | 13.5 mm (Häfele FF 3.10) | ล็อกไม่แน่น |
| Mating tolerance | ≤ 0.1 mm | ข้อต่อหลวม/สั่น |
| OD tolerance | 0.1 mm | ขนาดตู้เพี้ยน |

### 7.2 สัญญาความถูกต้องของข้อมูล (Data Contracts)

1. **Determinism end-to-end:** Cabinet เดิม → DrillMap → Packet → OperationGraph → G-code → ZIP เดิมทุก byte (SHA-256 ยืนยัน)
2. **G9 boundary:** ทุก packet ภายนอกผ่าน `assertValidPacket()`; type-level enforce ด้วย branded type
3. **T008:** DXF มาจาก OperationGraph เท่านั้น ไม่ใช่ mesh/Cabinet cache
4. **Journal balance:** Σdebit = Σcredit ต่อ entry เสมอ
5. **Approve-before-emit:** capture artifact ไม่มีทาง emit โดยไม่ approve; business commit รอ emitted
6. **Append-only audit:** ทุกตาราง audit REVOKE UPDATE/DELETE
7. **Idempotency ทุกทางเข้า:** webhook_event_id (LINE), capture idempotency_key, MCP (key, principal), PDM eventId
8. **Knowledge_Export → process_model:** read-only import พร้อม source_version + is_current

### 7.3 Safety Gate Golden Rules (จาก CONTRIBUTING.md)

1. ห้าม bypass Safety Gate | 2. ห้ามหย่อน Gate เพื่อให้เทสต์ผ่าน | 3. เปลี่ยน Gate ต้องอัปเดตเทสต์ | 4. กฎการผลิตทุกข้อต้องเป็น Gate | 5. **ถ้าพังในโรงงานได้ ต้อง fail ใน CI** | 6. error code ใหม่ต้องลง docs

---

## 8. Non-Functional Requirements

| หมวด | ข้อกำหนด |
|------|----------|
| **Security** | Ed25519 signing + pinned keys + revocation; HMAC webhook verify; secrets ใน Vault เท่านั้น (Edge Function ไม่ถือ plaintext); RLS fail-closed ทุกตาราง; JWT end-user ต่อ request |
| **Privacy (PDPA)** | OCR on-prem; PII redaction ที่ MCP boundary; log scrubbing ใน outbound sender; ไม่มี egress เอกสารการเงิน (ADR-021) |
| **Reliability** | BullMQ retry 3 + exponential backoff; notification retry worker; WebGL context recovery; CNC cache re-verify on load (tamper detection) |
| **Performance** | Export เสร็จ < 30 วินาที (e2e ยืนยัน); vendor chunk splitting (three ≈1MB แยก bundle); texture preload เฉพาะที่ใช้; drill map ใช้ useMemo + bail-out เร็ว |
| **Testability** | 4 ระดับบังคับ: Unit + Snapshot + Property-based (fast-check) + Multi-pair; golden fixtures; ปัจจุบัน 4,404 tests + 7 e2e smoke |
| **Auditability** | ทุก export/approval/capture/invocation มี audit แบบค้นหาได้ + timeline ต่อ job + proof endpoint |
| **i18n** | โดเมนธุรกิจสองภาษา (ศัพท์ไทยในเอกสาร spec/QMS; UI อังกฤษเป็นหลัก) |

---

## 9. Success Metrics

### Leading Indicators (วัดได้ทันทีหลังใช้งาน)
- % ไฟล์ export ที่ผ่าน gate โดยไม่มี BLOCKER ตั้งแต่ครั้งแรก (เป้า: เพิ่มขึ้นต่อเนื่อง — สะท้อนว่านักออกแบบเรียนรู้กฎ)
- จำนวน waive ต่อสัปดาห์ + สัดส่วนที่มีเหตุผลบันทึกครบ (เป้า: 100% มีเหตุผล)
- เวลาเฉลี่ยจาก Freeze → ดาวน์โหลดไฟล์โรงงาน (เป้า: < 5 นาที)
- % การอนุมัติที่จบภายใน SLA (เป้า: > 90%; timeout ทุกตัวมี escalation record)
- % capture artifact ที่ผ่าน human verify ก่อน emit (ต้อง = 100% โดยนิยาม; ตัวเลขที่ต่ำกว่าคือ bug)

### Lagging Indicators (วัดรายเดือน/ไตรมาส)
- ต้นทุนของเสียจากการเจาะ/ตัดผิด (เป้า: → 0)
- จำนวนงานที่ต้อง rework จาก revision ประเภท daph_defect (เป้า: ลดลงต่อเนื่อง)
- รอบเวลาปิดบัญชีรายเดือน (เป้า: ลดลงเมื่อ capture → ledger อัตโนมัติเต็มรูป)
- Utilization ของแผ่น (nesting) เฉลี่ย (เป้า: เพิ่มขึ้น)

---

## 10. สถานะและ Roadmap

### สถานะปัจจุบัน (2026-07-04)

| ระบบ | สถานะ | หลักฐาน |
|------|-------|---------|
| CAD/CAM แกนหลัก (v2.1.0) | ✅ Production-ready | FIX_PLAN ปิดครบ; tsc 0 errors; 4,404 tests; e2e ผ่าน |
| Knowledge Layer | ✅ 100% | Vault 224 ไฟล์; pipeline idempotent (PBT) |
| line-oa-commerce | ✅ 100% | 20/20 tasks; 31 properties |
| workflow-copilot | ✅ Phase 1 | 113/134 tasks; 42 properties |
| capture-spine | ✅ Wave 0+1 | 42/43 tasks; migrations ถึง 0080 |
| mcp-layer | 🔵 88% | 43/49 tasks |
| accounting | 🟡 36% | 37/103 tasks (ตรรกะแกนมีแล้ว) |
| design-hub phase2 | ⏸ | รอ 7 owner decisions |

### Roadmap ถัดไป (เรียงตาม dependency)

1. **[ตอนนี้]** ปิด workflow-copilot Phase 1.5 — Req 21 revision/design-lock/re-quote + ADR-017/018 (order-key + multi-approver migration)
2. **[ถัดไป]** mcp-layer unit tests ที่เหลือ + ADR-019 write-gate
3. **[Phase 3]** accounting เต็มรูป: bank feed จริง, งบการเงิน TFRS, multi-currency เต็ม
4. **[รอ owner]** 7 owner decisions (§11) → ปลดล็อก design-hub WO-0 และ capture Wave 2
5. **[รอ governance]** e-Tax XAdES + X.509 (จัดหา ETDA CA)

---

## 11. Open Questions

**Owner Decisions ค้าง 7 ข้อ (จาก REQUIREMENTS-OVERVIEW §4.2) — blocking Phase 3/design-hub:**

| # | คำถาม | ใครตอบ |
|---|-------|--------|
| 1 | โครง Vendor Master สุดท้าย (field ไหนบังคับ, ใคร maintain) | Owner + บัญชี |
| 2 | โครง Material Master + หน่วยนับมาตรฐาน | Owner + โรงงาน |
| 3 | Ledger schema เพิ่มเติม (เล่มไหนบ้าง, mapping ภาษี) | Owner + บัญชี |
| 4 | นโยบายราคาซื้อจริง (MAC vs FIFO ต่อวัสดุ) | Owner + บัญชี |
| 5 | Released_Spec contract เวอร์ชันถัดไป (CAM ↔ capture) | Owner + วิศวกรรม |
| 6 | MCP exposure — เปิด tool ไหนให้ AI client ภายนอก | Owner + governance |
| 7 | Auto-approve policy — งานประเภทไหน (ถ้ามี) อนุญาต tier สูงขึ้น | Owner + governance |

**คำถามทางเทคนิคที่ไม่ blocking:**
- (Engineering) กลยุทธ์ sync cloud ของโปรเจกต์ CAD (ปัจจุบัน localStorage; มี design doc `CLOUD_SYNC_ARCHITECTURE` แล้ว)
- (Engineering) การรวม repo history — branch ปัจจุบันเป็นคนละสายกับ main เดิม (ก.พ. 2026) ที่เก็บไว้ใน `legacy/main-2026-02`
- (Design) Design Hub Phase 2 naming ตาม spec: ใช้ "CAM/Manufacturing Engine (TS)" — ห้ามใช้คำ "north-star-foundation"

---

## 12. Glossary

| ศัพท์ | ความหมาย |
|------|----------|
| **SOS / JES / PFMEA** | Standard Operation Sheet / Job Element Sheet / Process FMEA (เอกสาร QMS) |
| **RPN** | Risk Priority Number = SEV × OCC × DET — เชื้อเพลิงของ Copilot escalation |
| **RACI** | Responsible / Accountable / Consulted / Informed — แผนที่ผู้รับผิดชอบต่อขั้น |
| **System 32** | มาตรฐานรูเจาะเฟอร์นิเจอร์ยุโรป pitch 32mm, first hole 50mm |
| **Minifix S200** | ข้อต่อ cam-lock ของ Häfele (CAM Ø15 + Bolt + Dowel Ø8) |
| **Distance B** | ระยะจากขอบแผ่นถึงศูนย์ CAM (24/34mm) |
| **INSET / OVERLAY** | แบบข้อต่อ: ฝังใน / วางทับ — กระทบ drill map ทั้งระบบ |
| **DrillMap** | แผนที่จุดเจาะทุกจุดของตู้ (world position + normal + Ø + depth + purpose) |
| **FactoryPacket** | JSON deterministic มัดรวม drillMap/connectors/cutList/gateResult + manifest hash |
| **OperationGraph** | กราฟ operations CNC (DRILL/BORE/POCKET/PROFILE/SLOT) — ความจริงเดียวของ G-code/DXF |
| **Gate (G1–G11)** | ด่านตรวจกฎการผลิต; G9 = packet boundary, G10 = DXF safety, G11 = Minifix/System32 |
| **DRAFT / FROZEN / RELEASED** | สถานะ spec; export ได้เมื่อ FROZEN ขึ้นไป |
| **Waive** | การยอมรับความเสี่ยง WARNING โดยบันทึกเหตุผล (BLOCKER waive ไม่ได้ ยกเว้น admin override) |
| **Signed Receipt (P13)** | ใบเสร็จ export ลงนาม Ed25519; ตรวจ offline ด้วย `monolith-receipt-verify` |
| **C12** | Foundation กลาง: identity/role/site (`resolve_actor`, `has_site_access`, governance) |
| **D2 Autonomy Ladder** | ระดับความอิสระของ AI action (L0 เสนอเท่านั้น → สูงขึ้นตาม registry) |
| **Knowledge_Export** | JSON จาก Vault (PFMEA 122 แถว + 28 process steps + RACI) — สัญญา read-only |
| **Canonical Order** | ลำดับขั้นกระบวนการ 0–7; identity ของขั้น (ชื่อซ้ำได้) |
| **Pending_Invocation** | MCP tool call ที่รอมนุษย์อนุมัติ (มี expiry; expired ≠ rejected) |
| **Capture Artifact** | เอกสาร/ภาพที่ ingest เข้ามา; lifecycle proposed → approved → emitted → superseded |
| **No-guess / Fail-safe** | หลักการ: ไม่เดาค่า ไม่ auto-pass เมื่อข้อมูล/กลไกไม่พร้อม |
| **PARA** | Projects / Areas / Resources / Archives (โครง Vault) |
| **MOC** | Map of Contents (หน้า index ต่อกลุ่ม/หน่วยใน Vault) |

---

## 13. ภาคผนวก

### 13.1 Tech Stack

| ชั้น | เทคโนโลยี |
|-----|-----------|
| Frontend | React 18, TypeScript 5.2, Vite 5, Three.js 0.159 + React Three Fiber + Drei, Zustand 4 (immer + persist), Tailwind CSS 3, framer-motion, three-bvh-csg |
| Factory Server | Node.js + Express 4, BullMQ 5 + Redis (ioredis), pdfkit, yazl/yauzl, @noble/ed25519 |
| Business Backend | Supabase (PostgreSQL + RLS + RPC + Edge Functions/Deno), Vault secrets |
| Testing | Vitest 3, fast-check 4 (PBT), Playwright 1.58 (e2e), pgTAP (supabase/tests) |
| Knowledge | Node/TS pipeline (SheetJS สำหรับ .xls BIFF), Obsidian vault output |

### 13.2 คำสั่งตรวจสอบมาตรฐาน

```bash
npx tsc -b tsconfig.build.json     # typecheck (script: typecheck:all)
npm run test:run                    # vitest ทั้งหมด (4,404 tests)
npm run build                       # tsc + vite build
npx playwright test --grep "@smoke" # e2e smoke (7 tests)
npm run verify                      # test + typecheck + e2e smoke รวม
npm run gate:bypass-scan            # CI gate bypass scan
```

### 13.3 เอกสารอ้างอิงภายใน

- `REQUIREMENTS-OVERVIEW.md` — requirements ครบ 8 spec + ADR-001..027
- `.kiro/specs/*/` — requirements.md / design.md / tasks.md ต่อ spec
- `.kiro/steering/` — architecture-decisions.md, ubiquitous-language.md
- `CHANGELOG.md` — v2.1.0 (D1–D3.3 CNC trust chain), v2.0.0
- `CONTRIBUTING.md` — Safety Gate policy + ระดับเทสต์บังคับ 4 ระดับ
- `docs/SKILL.md` — Minifix Drillmap (สเปค Häfele S200 ครบ)
- `docs/architecture/` — CLOUD_SYNC, CUT_OPTIMIZATION, MULTI_MACHINE_EXPORT designs
- `.claude/skills/` — 7 architectural-invariant skills (truth-derivation, zustand-reactivity, geometry-invariants, material-stack, export-determinism, thickness-compliance, monolith-dev-guide)

---

*เอกสารนี้สร้างจากการสำรวจ codebase จริง (source, migrations, specs, tests) ณ commit `2c19935` — สถานะ implement ทุกรายการอ้างอิงจากโค้ดและผลเทสต์ที่รันจริง ไม่ใช่จากแผน*
