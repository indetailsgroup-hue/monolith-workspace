# Requirements Document

## Introduction

เอกสารนี้กำหนด requirements ของโมดูล **Capture Spine** — pipeline วงปิดระดับองค์กร (org-wide) ที่แปลง input ดิบ (ภาพ/เอกสาร/ข้อความผ่าน LINE/Gmail) → record ที่มีโครงสร้างซึ่ง **มนุษย์ verify แล้ว** → commit เข้า business-layer พร้อม append-only audit โดย **ไม่เรียกออกนอกองค์กร** (OCR/LLM self-host) = PDPA-by-architecture ทุกแผนกใช้ร่วมกัน (บัญชี / ออกแบบ / จัดซื้อ / ผลิต / ติดตั้ง / ขนส่ง / co-working)

โมดูลนี้เป็น **Phase 2** สร้างหลัง `monolith-workflow-copilot` (Phase 1) และวางบน `monolith-mcp-layer` (MCP governance)

**Reuse-not-fork (ข้อบังคับ):**
- **Capture_Artifact lifecycle** = ลอกโครง `agent_artifact` ของ TCCK (proposed → approved/rejected → emitted → superseded) — proven pattern
- **MCP governance** = D2 Autonomy Ladder / audit / PII redaction / rate-limit / idempotency / provenance (R15–R19) จาก `monolith-mcp-layer`
- **C12** = identity / RLS `TO authenticated` / `public.resolve_actor()` จาก `line-oa-commerce`
- **LINE ingest + customer identity** = `line-oa-commerce`
- **Human verify / approval / SLA / escalation** = `monolith-workflow-copilot` (Phase 1)
- **Typhoon OCR self-host** = infra ภายใน DAPH (no public endpoint)

> ⚠️ Anti-fraud (R-FRAUD) + on-prem OCR constraint สืบทอดจาก `monolith-workflow-copilot` Req D (ที่เลื่อนมา Phase 2) — capture-spine คือบ้านจริงของ requirement กลุ่มนี้

## Glossary

- **Capture_Spine**: ระบบของโมดูลนี้ — pipeline วงปิด ingest → OCR → extract → verify → commit + audit
- **Capture_Artifact**: หน่วยงานหนึ่งชิ้น มี lifecycle (proposed → approved/rejected → emitted → superseded) ลอกโครง TCCK `agent_artifacts`
- **Capture_Type**: ชนิดของ capture (expense_document / site_survey / material_receipt / qc_capture / installation_proof / delivery_pod / spec_draft / ...) — row-extensible
- **Stage1_OCR**: ขั้นแปลงภาพ/PDF → ข้อความ ด้วย Typhoon OCR ที่ self-host ในเขต infra DAPH
- **Stage2_Extract**: ขั้นแปลงข้อความ → typed fields + per-field confidence (rules / LLM self-host)
- **Verify_Gate**: จุดที่มนุษย์ต้องยืนยันก่อน emit (บังคับเมื่อ field สำคัญ / confidence ต่ำ / suspicious)
- **Commit_Target**: ปลายทางของการ commit ต่อ capture_type (ledger / SiteSurveyZone / actual_purchase_price / Released_Spec / ...)
- **Verify_Rule**: กฎตรวจต่อ capture_type (checkpoint / guards_against / method / pfmea_ref / priority) — seed จาก PFMEA
- **Fraud_Signal**: สัญญาณเอกสารน่าสงสัย (VAT mismatch / vendor ไม่อยู่ใน master / total anomaly / duplicate doc)
- **Principal**: ผู้กระทำที่ resolve ผ่าน C12 `public.resolve_actor()` (ไม่เชื่อ id จาก client)
- **Capture_Audit_Log**: ตาราง append-only ของโมดูลนี้ บันทึกทุก transition โดยลบ PII/secret ค่าจริง
- **Customer_Identity**: อัตลักษณ์ลูกค้าจาก `line_oa_customer_identity` (project-scoped, ไม่ใช่ C12 principal)
- **Autonomy_Ladder_Tier**: ระดับเพดาน autonomy ตาม D2 (จาก mcp-layer) — capture-spine ใช้ human-verify เป็นหลัก

## Requirements

### Requirement 1: Ingest และ Idempotency

**User Story:** As a พนักงานทุกแผนก, I want ส่งภาพ/เอกสาร/ข้อความผ่าน LINE หรือ Gmail แล้วระบบสร้างงานให้อัตโนมัติ, so that ฉันไม่ต้องกรอกข้อมูลซ้ำและงานไม่หล่นหาย

#### Acceptance Criteria

1. WHEN ผู้ใช้ส่ง input ผ่าน LINE หรือ Gmail, THE Capture_Spine SHALL สร้าง Capture_Artifact (status = proposed, capture_type, source ∈ {line, email, app}) ผูก Principal ผ่าน C12 `public.resolve_actor()` และเก็บ raw_uri (on-prem) พร้อม idempotency key
2. IF input เดียวกันถูกส่งซ้ำ (idempotency key = hash เนื้อหา), THEN THE Capture_Spine SHALL NOT สร้าง Capture_Artifact ซ้ำ และ SHALL คืน artifact เดิม
3. THE Capture_Spine SHALL จัดเก็บ raw_uri ไว้ในที่เก็บภายใน infra DAPH (on-prem) เท่านั้น

### Requirement 2: On-prem OCR, Field Extraction และ PDPA

**User Story:** As ผู้ควบคุมข้อมูลส่วนบุคคล, I want การประมวลผล OCR/extraction ทั้งหมดอยู่ภายในองค์กร, so that ข้อมูลส่วนบุคคลไม่รั่วออกนอกองค์กร (PDPA-by-architecture)

#### Acceptance Criteria

1. WHEN ได้รับ input ภาพ/PDF, THE Capture_Spine SHALL เรียก Typhoon OCR (Stage1) ที่ self-host ในเขต infra DAPH แปลงเป็นข้อความ และ SHALL NOT ส่ง input หรือข้อความออกนอกองค์กร (no public endpoint)
2. THE Capture_Spine SHALL สกัด typed fields (Stage2) ตาม field schema ของ capture_type พร้อม `confidence` ต่อ field และเก็บ `ai_provider` + `model_version` เป็น provenance
3. THE Capture_Spine SHALL ประมวลผล OCR/extraction ทั้งหมดภายใน infra DAPH โดยไม่มี cross-border transfer
4. THE Capture_Spine SHALL redact PII ออกจาก audit และจำกัดเฉพาะ field ที่จำเป็น (data minimization)

### Requirement 3: Validation กับ Master Data

**User Story:** As ผู้ตรวจสอบ, I want ระบบเทียบข้อมูลที่สกัดได้กับ master, so that ข้อมูลที่ไม่ตรง master ถูก flag ให้คนตัดสินแทนที่จะหลุดเข้าระบบเงียบ ๆ

#### Acceptance Criteria

1. WHERE capture_type อ้างอิง master (vendor / material / process_step), THE Capture_Spine SHALL ตรวจ field ที่สกัดได้กับ master
2. IF ไม่พบใน master, THEN THE Capture_Spine SHALL mark field นั้นเป็น unverified โดยไม่ block (ให้คนตัดสิน)

### Requirement 4: Human Verify Gate (invariant)

**User Story:** As ผู้บริหาร, I want ทุก record ต้องผ่านการ verify โดยมนุษย์ก่อนเข้าระบบจริง, so that ไม่มีข้อมูล AI ที่ผิดหลุดเข้า business-layer โดยไม่มีคนตรวจ

#### Acceptance Criteria

1. THE Capture_Spine SHALL NOT commit เข้า Commit_Target จนกว่ามนุษย์ที่มีสิทธิ์ (C12) จะ verify
2. WHERE field สำคัญ (เงิน / ภาษี / ขนาด / ลายเซ็น) หรือ confidence < threshold หรือ is_suspicious = true, THE Capture_Spine SHALL บังคับให้มนุษย์ confirm ก่อน emit
3. THE Capture_Spine SHALL บังคับให้สถานะผ่าน verify ก่อนเปลี่ยนเป็น approved (verify-before-approve)

### Requirement 5: Promote / Commit Lifecycle

**User Story:** As เจ้าของกระบวนการ, I want การ commit เข้าระบบจริงเกิดเฉพาะหลังอนุมัติ และแก้ไม่ได้ย้อนหลัง, so that ข้อมูลที่ commit แล้วเชื่อถือได้และตรวจสอบย้อนได้

#### Acceptance Criteria

1. WHEN มนุษย์ approve, THE Capture_Spine SHALL เปลี่ยนสถานะเป็น emitted และ commit เข้า Commit_Target แบบ idempotent พร้อมลิงก์ entity (linked_entity_type/id)
2. THE Capture_Spine SHALL อนุญาตการ promote เฉพาะ artifact ที่ status = approved (approve-before-promote)
3. WHEN มนุษย์ reject, THE Capture_Spine SHALL เปลี่ยนสถานะเป็น rejected และ SHALL NOT แตะ business-layer
4. THE Capture_Spine SHALL ถือว่าสถานะ emitted / superseded เป็น terminal และ SHALL NOT แก้ไขย้อนหลัง (immutable; การแก้ = artifact ใหม่ + supersede)

### Requirement 6: Fail-safe (ไม่เดาค่า)

**User Story:** As ผู้ใช้, I want ระบบไม่เดาค่าที่สกัดไม่ได้, so that ไม่มี placeholder ปลอมเข้าระบบและฉันได้กรอกเองเมื่อจำเป็น

#### Acceptance Criteria

1. IF Stage1 หรือ Stage2 สกัดข้อมูลไม่ได้หรือข้อมูลขาด, THEN THE Capture_Spine SHALL NOT เติมค่าเดา (no placeholder) และ SHALL ส่งให้มนุษย์กรอก
2. IF กลไก governance / audit / storage ใดไม่พร้อมใช้งาน, THEN THE Capture_Spine SHALL block การดำเนินการ (no silent commit)

### Requirement 7: Audit Trail (append-only)

**User Story:** As ผู้ตรวจสอบ, I want บันทึกที่แก้ไม่ได้ของทุก transition, so that สืบย้อนได้ว่าใครทำอะไรเมื่อใดโดยไม่เปิดเผยข้อมูลส่วนบุคคล

#### Acceptance Criteria

1. WHEN เกิด transition ใด ๆ (ingest / ocr / extract / verify / emit / commit / reject), THE Capture_Spine SHALL บันทึก Capture_Audit_Log หนึ่งรายการ (actor ผ่าน `public.resolve_actor()`, capture_type, prev → next, เวลา UTC)
2. THE Capture_Spine SHALL เก็บ Capture_Audit_Log ในตารางแบบ append-only ที่ปฏิเสธ UPDATE และ DELETE ด้วยข้อจำกัดระดับฐานข้อมูล
3. THE Capture_Spine SHALL NOT บันทึกค่า PII หรือ secret จริงลง Capture_Audit_Log

### Requirement 8: Access Control (RLS + RPC)

**User Story:** As ผู้ดูแล IT, I want การเข้าถึง artifact ถูกควบคุมด้วย C12 ที่มีอยู่, so that แต่ละสาขา/บทบาทเห็นเฉพาะข้อมูลของตนโดยไม่ต้องนิยามโมเดลสิทธิ์ใหม่

#### Acceptance Criteria

1. THE Capture_Spine SHALL gate การอ่าน Capture_Artifact ผ่าน RLS `TO authenticated` ที่ reuse `public.is_governance_role()` และ `public.has_site_access(site_code)`
2. THE Capture_Spine SHALL ทำการ write ทั้งหมดผ่าน SECURITY DEFINER RPC ที่ re-check บทบาทผู้เรียกภายในฟังก์ชันและหาตัวผู้กระทำผ่าน `public.resolve_actor()`
3. IF ผู้ใช้พยายาม write โดยไม่มีบทบาทที่อนุญาต, THEN THE Capture_Spine SHALL ปฏิเสธและคืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ

### Requirement 9: Extensible per-Department (config-driven)

**User Story:** As สถาปนิกระบบ, I want เพิ่ม capture_type ใหม่ของแผนกได้ด้วย config, so that ขยายแผนกใหม่โดยไม่ต้องแก้ state machine หรือ core

#### Acceptance Criteria

1. THE Capture_Spine SHALL รองรับ capture_type ใหม่โดยกำหนด {field schema, verify_rules, commit_target} เป็น config
2. THE Capture_Spine SHALL NOT แก้ state machine หรือ core logic สำหรับการเพิ่มแผนก/capture_type ใหม่
3. THE Capture_Spine SHALL รองรับ instance ของ co-working (L1) เป็น config-add (cowork_expense / cowork_daily_sales / cowork_member / cowork_incident / cowork_maintenance) โดยผูกกับ multi-site (WO-0)

### Requirement 10: Anti-Fraud Signals

**User Story:** As ผู้ประกอบการ/บัญชี, I want ระบบ flag เอกสารการเงินที่น่าสงสัย, so that เอกสารปลอม/ยอดผิดไม่หลุดเข้า ledger โดยไม่มีคนตรวจ

#### Acceptance Criteria

1. WHEN capture เอกสารการเงิน, THE Capture_Spine SHALL รัน Fraud_Signal rules (config) และ flag `is_suspicious` (เช่น VAT mismatch / vendor not in master / total anomaly / duplicate doc) โดยไม่ auto-reject (กัน false positive)
2. WHERE artifact ถูก flag suspicious, THE Capture_Spine SHALL NOT auto-emit และ SHALL บังคับ human review (สอดคล้อง Requirement 4)
3. WHERE มนุษย์ verify ว่าไม่ใช่ fraud (false positive), THE Capture_Spine SHALL บันทึกและใช้ปรับ signal (feedback) โดยไม่ลงโทษผู้ส่ง
4. THE Fraud_Signal rules SHALL เป็น config (เพิ่ม signal ใหม่ได้โดยไม่แก้ core)

### Requirement 11: Verify Rules per Capture_Type (seed จาก PFMEA)

**User Story:** As ผู้จัดการคุณภาพ, I want กฎตรวจต่อชนิด capture ที่อิงความเสี่ยงจริง, so that field ความเสี่ยงสูงถูกตรวจก่อนและตรวจสอบย้อนถึง PFMEA ได้

#### Acceptance Criteria

1. THE Capture_Spine SHALL ใช้ Verify_Rule ต่อ capture_type ตรวจ extracted fields และ flag field ที่ไม่ผ่าน
2. THE Verify_Rule SHALL seed จาก PFMEA โดย trace `pfmea_ref` และ SHALL เป็น config (เพิ่มได้โดยไม่แก้ core)
3. THE Capture_Spine SHALL จัด priority ของ Verify_Rule ตามความเสี่ยง: computed RPN ก่อน (เช่น Cutting 280) แล้วจึง severity_only (SEV 9 → SEV 8) พร้อม requiresHumanReview

## Correctness Properties

แต่ละ property เขียนสำหรับ property-based testing บนชั้น logic + DB harness อ้างอิง state machine ลอก TCCK agent_artifact

### Property 1: ไม่มีการเปลี่ยน business-layer ก่อน emitted
*For any* Capture_Artifact การเปลี่ยนแปลง Commit_Target / business-layer SHALL เกิดขึ้นก็ต่อเมื่อ artifact ถึงสถานะ emitted เท่านั้น (no-commit-until-emitted)
**Validates: Requirements 4.1, 5.1, 5.2**

### Property 2: field สำคัญ / suspicious → บังคับ human confirm
*For any* artifact ที่มี field สำคัญ หรือ confidence < threshold หรือ is_suspicious = true การ emit SHALL ถูกบล็อกจนกว่ามนุษย์ confirm
**Validates: Requirements 4.2, 10.2**

### Property 3: Idempotent ingest
*For any* input ที่มี idempotency key เดิม การ ingest ซ้ำ SHALL ไม่สร้าง artifact ใหม่ และคืน artifact เดิม
**Validates: Requirements 1.2**

### Property 4: Fail-safe ไม่เดาค่า
*For any* การสกัดที่ไม่สำเร็จ/ข้อมูลขาด ระบบ SHALL ไม่เติมค่าเดา และ IF governance/audit/storage ไม่พร้อม THEN SHALL block (ไม่ commit เงียบ)
**Validates: Requirements 6.1, 6.2**

### Property 5: Provenance ครบ
*For any* artifact ที่ผ่าน Stage2 SHALL มี `ai_provider` + `model_version` + per-field `confidence` บันทึกไว้
**Validates: Requirements 2.2**

### Property 6: Terminal immutability
*For any* artifact ที่ถึงสถานะ emitted หรือ superseded สถานะนั้น SHALL ไม่ถูกแก้ย้อนหลัง (การแก้ = artifact ใหม่ + supersede)
**Validates: Requirements 5.4**

### Property 7: Audit completeness (ไม่มี PII)
*For any* transition ทุกครั้ง SHALL มี Capture_Audit_Log หนึ่งรายการครบ field (actor/capture_type/prev→next/UTC) โดยไม่มีค่า PII/secret และ audit SHALL ปฏิเสธ UPDATE/DELETE
**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: On-prem ไม่มี cross-border
*For any* การประมวลผล OCR/extraction SHALL ไม่มี outbound call ออกนอก org (on-prem boundary)
**Validates: Requirements 2.1, 2.3**

### Property 9: Extensible โดยไม่แก้ core
*For any* capture_type ใหม่ที่เพิ่มผ่าน config {field schema, verify_rules, commit_target} ระบบ SHALL ทำงานได้โดยไม่แก้ state machine/core
**Validates: Requirements 9.1, 9.2**

### Property 10: Suspicious ไม่ auto-emit
*For any* artifact ที่ flag suspicious การ emit SHALL ไม่เกิดอัตโนมัติ — ต้องผ่าน human review
**Validates: Requirements 10.1, 10.2**

### Property 11: ทุก Verify_Rule trace pfmea_ref
*For any* Verify_Rule ที่ active SHALL มี `pfmea_ref` ที่ trace กลับไป PFMEA ได้ และ priority เรียงตามความเสี่ยง (computed RPN ก่อน severity_only)
**Validates: Requirements 11.2, 11.3**

## Assumptions and Open Questions

### OQ-CS-1 — แผนกแรก (PENDING owner)
แผนกแรกที่ deploy = บัญชี (ROI ชัด) หรือ ติดตั้ง (compliance เจ็บที่สุด)? — ไม่บล็อก core (capture_type เป็น config)

### OQ-CS-2 — auto-approve (PENDING owner + data)
เปิด auto-approve เมื่อ confidence สูง (ยก TCCK D2 L2) ได้เมื่อมี baseline accuracy จาก data จริงเท่านั้น — Phase นี้ใช้ human-verify เป็นหลัก

### OQ-CS-3 — Typhoon OCR infra (PENDING infra/legal)
GPU/VRAM on-prem เพียงพอไหม + license เชิงพาณิชย์ (ต้องผ่านทนาย) — เป็น enabler ของ R-SPINE-2/8

### A-DEP — Dependency Phase 1 ก่อน
human verify / approval / SLA / escalation พึ่ง `monolith-workflow-copilot` (Phase 1) ต้องเสร็จก่อน; MCP governance (R15–19) พึ่ง `monolith-mcp-layer`; capture lifecycle ยก TCCK `agent_artifact` (proven)
