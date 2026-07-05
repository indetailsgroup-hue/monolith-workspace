# Requirements Document — Installation PM (Field/Site Project Management)

## Introduction

เอกสารนี้กำหนด requirements ของโมดูล **Installation PM** — การจัดการโปรเจกต์ติดตั้งหน้างาน (แนว KANNA) ฝังใน MONOLITH เพื่อปิด loop: `ออกแบบ → ผลิต → ส่งของ → ติดตั้งหน้างาน → รายงานภาพ → ลูกค้าอนุมัติ → ปิดงาน` — ปัจจุบัน MONOLITH จบที่ประตูโรงงาน (Factory Packet)

**สถานะ:** approved design — ผ่าน verify กับเรโปจริง + grill owner decisions แล้ว (5 ก.ค. 2026) — **มติ 4 ข้อ (ADR-034/035 + amendment):** (1) v1 = dogfood ภายใน DAPH บน DB เดิม (C12) ไม่ gate ด้วย entitlement, (2) entitlement SaaS แยก DB, (3) MVP = PWA + offline-lite upload queue (ไม่มี two-way sync) → mobile/full-sync ตัดสินด้วย baseline จากงานจริง, (4) **MVP เกาะ line_oa + workflow spine**: งานติดตั้ง = work_item ขั้น Installation, รูป = capture `installation_proof`, แจ้งเตือนช่างผ่าน LINE — ห้ามสร้างระบบขนาน

**ขอบเขต IP:** ลอกได้เฉพาะ*แนวคิดฟีเจอร์/เวิร์กโฟลว์* (field PM เป็นแนวคิดทั่วไป) — ห้ามคัดลอกโค้ด/แบรนด์/ชื่อ KANNA/ไอคอน/UI พิกเซล-ต่อ-พิกเซล

**Working artifacts (ในโฟลเดอร์นี้):** `design.md` · `tasks.md` · `build-plan-external-draft-2026-07-05.md` (ต้นฉบับภายนอก — archive พร้อมบันทึกแก้) · **`capture-type-customer-requirement-draft.sql`** (ใบบันทึกความต้องการ — 9 field จาก "สำหรับคุณชุ.xlsx" 2025 + verify rules ตาม PFMEA Sale) · **`form-templates-installation-v0.1.md`** (checklist ติดตั้งจาก Installation.xlsx — T0 site-readiness + ครัว/ห้องทั่วไป × เลนช่าง 1/2/3; **P1/P2/P3 = ช่างคนที่ 1/2/3** ยืนยันโดย owner) — entitlement delta อยู่ที่ `../entitlement-tier/schema-draft-v0.4-delta.sql` + `tier-matrix-v0.4.html`

## Glossary

- **Installation Project**: โปรเจกต์ติดตั้งหน้างาน 1 งาน (ลูกค้า/สถานที่/ช่วงเวลา) — **ตั้งใจไม่ใช้คำว่า `site`** เพราะใน C12 `site` = ขอบเขต tenant (`has_site_access`) คนละความหมาย
- **Packet Registry**: ตารางลงทะเบียน Factory Packet (id, SHA-256, receipt ref) — สะพานเชื่อมการผลิต ↔ การติดตั้ง (ปัจจุบัน packet เป็น artifact ฝั่ง client **ยังไม่มีใน DB**)
- **Field Report**: รายงานหน้างาน (daily/custom form) กรอกจากมือถือ แนบรูป/ลายเซ็น
- **External Member**: ช่าง/พาร์ตเนอร์ภายนอกที่เข้าถึงได้เฉพาะโปรเจกต์ที่ถูกเชิญ
- **Sync Protocol**: กติกา offline sync (`client_rev` + `updated_at` + tombstone) — ต้องล็อกก่อนเขียน mobile

## Reuse Map (ผลตรวจกับเรโปจริง 2026-07-05)

| ความสามารถ | ระดับ | หลักฐาน/หมายเหตุ |
|-----------|-------|------------------|
| Multi-tenant RLS + IAM C12 | ✅ ใช้ได้วันนี้ | `src/iam/scope.ts`, `resolve_actor`/`has_site_access` (migrations 0074–0079) |
| LINE OA infra (webhook/outbound/templates/order) | ✅ ใช้ได้วันนี้ | line-oa-commerce 20/20 tasks, 31 properties |
| Audit pattern (append-only) | ✅ ใช้ได้วันนี้ | pattern จาก `line_oa_audit_log` — **ไม่ใช่** Trust Chain (นั่นคือ manufacturing provenance) |
| PDPA machinery | ✅ ใช้ได้วันนี้ | `Data_Minimization_Boundary` + PII redaction จาก MCP layer |
| Customer approval ผ่าน LINE | 🔧 infra มี ต้องต่อยอด | outbound + template governance มี; **approval Flex flow = งานใหม่** |
| Supabase Realtime (chat/presence) | 🔧 platform-only | **ไม่มีการใช้ใน `src/` เลย** — chat เป็น net-new ทั้งก้อน |
| Photo ingest + verify + ปิดงาน | ✅ ใช้ได้วันนี้ | capture spine: `installation_proof` (0051) → verified → **commit ปิด work item** (0063); `site_survey` → SiteSurveyZone (0073) |
| Workflow ขั้น Installation | ✅ ใช้ได้วันนี้ | canonical process มี Sub_Process_Group Installation + approval start/finish (หัวหน้าทีม) + auto-notify Sale/PM |
| Media processing (thumbnail/compress) + push (FCM/APNs) | 🔴 net-new | ไม่พบ `storage.from(`/FCM/APNs ในโค้ด — push เลื่อนได้เพราะแจ้งเตือนหลักใช้ LINE |
| MFA/2FA | 🔧 platform รองรับ | ยังไม่ได้เปิด/บังคับใช้ในระบบ |
| Entitlement gate | 📝 draft | v0.3 ยังไม่ deploy — block ที่ owner decision PRD §11 ข้อ 8 |
| Factory Packet ใน DB | 🔴 net-new | packet เป็น ZIP+receipt ฝั่ง client — ต้องมี Packet Registry (Req 3) |

> ตัวเลข reuse จริง ~40–50% (ไม่ใช่ 60–70% ตาม draft ภายนอก) — แต่ก็ยังถูกกว่า standalone อย่างมีนัยสำคัญ

## Requirements

### Requirement 1: Tenancy + Naming + RLS

1. THE ตารางใหม่ทุกตัว SHALL ผูก tenant scope ตาม convention C12 (`resolve_actor`, `TO authenticated`) + RLS fail-closed
2. THE ตาราง/คอลัมน์ใหม่ SHALL ไม่ใช้คำ `site` นำหน้า (ชนความหมาย C12) — ใช้ `installation_*` / `field_*`
3. THE External Member SHALL เข้าถึงได้เฉพาะ installation project ที่มี membership และเห็นเฉพาะข้อมูลของโปรเจกต์นั้น (ไม่เห็นข้อมูล org อื่น ๆ)

### Requirement 2: Installation Project + Task + Board — **เกาะ workflow spine (มติ owner 5 ก.ค. 2026)**

1. THE ระบบ SHALL มี installation_projects (ลูกค้า, สถานที่, ช่วงเวลา, สถานะ lifecycle: draft → scheduled → installing → customer_review → closed) **ผูกกับ work_item ของขั้น Installation ใน canonical process** (`work_item_id` link — ไม่สร้าง lifecycle ขนาน)
2. THE งานติดตั้ง start/finish SHALL เดินผ่าน workflow RPCs เดิม (`rpc_handoff_work_item` ฯลฯ) เพื่อให้ approval + notification เดิมทำงาน (workflow Req: approver = หัวหน้าทีม Installation, auto-notify Sale/PM) — **ห้าม bypass workflow**
3. THE โครงสร้างหน้างาน SHALL เป็น 3 ชั้นตาม staffing model จริง (owner 5 ก.ค. 2026): **บ้าน** (project + หัวหน้างาน 1 คน = approver) → **ห้อง** (`installation_rooms`, room_type) → **เลนช่าง** (`installation_tasks` จาก template — ห้องละ 3 เลน คนละ assignee, ทุกห้องขนานกัน; เช่น บ้าน 5 ห้อง = 15 ช่าง + หัวหน้า 1 = 16 คน) — ไม่ซ้ำซ้อนกับ process step; ห้องเสร็จ = 3 เลนครบ + รูป Wrapping; บ้านเสร็จ = ทุกห้องเสร็จ → customer_review
4. WHEN โปรเจกต์เข้าสถานะ customer_review THE ระบบ SHALL สร้าง approval request ได้ (Req 7)
5. Gantt + company dashboard เป็น Phase 3 (ดู tasks.md) — ไม่อยู่ใน MVP

### Requirement 3: Packet Registry — สะพานผลิต↔ติดตั้ง (moat)

1. THE ระบบ SHALL มี packet_registry: packet_id, SHA-256, receipt reference, cabinet/panel index — ลงทะเบียนตอน export
2. THE installation_projects SHALL อ้าง packet_registry ได้ (0..n packets ต่อโปรเจกต์) — link **immutable หลังปิดงาน**
3. THE รูป/รายงานติดตั้ง SHALL ผูกถึงระดับ cabinet/panel id ใน packet ได้ (optional ต่อรูป)
4. THE การ verify SHALL ตรวจ SHA-256 กับ receipt ได้ตาม flow `monolith-receipt-verify` เดิม

### Requirement 4: Photo/Media — **เข้า capture spine (มติ owner 5 ก.ค. 2026)**

1. THE รูปหลักฐานติดตั้ง SHALL ingest ผ่าน capture spine เดิม (`rpc_capture_ingest`, capture_type **`installation_proof`** — มีอยู่แล้ว 0051 พร้อม verify rules; ADR-033: manual entry, cloud_allowed=false) — verified แล้ว **commit ปิด work item อัตโนมัติ** (0063) — ห้ามสร้าง pipeline ขนาน
2. THE ช่าง SHALL ส่งรูปได้ 2 ทาง: (ก) PWA upload → capture ingest (ข) **ส่งผ่าน LINE** → line_oa webhook → capture (channel เดิมตาม ADR-033)
3. THE media processing (บีบอัด + thumbnail Edge Function) SHALL ทำงานบน capture artifact — เป็นส่วน net-new เดียวของ Req นี้
4. THE รูป SHALL เก็บ metadata: เวลา, ผู้ถ่าย, geo (ถ้ามี consent), ผูก work_item/subtask/panel ได้; annotation เก็บเป็น layer แยก ไม่ทำลายต้นฉบับ
5. THE ข้อมูลวัดหน้างานก่อนติดตั้ง SHALL อ่านจาก **SiteSurveyZone** เดิม (0073 — capture_type `site_survey`) แสดงในหน้าโปรเจกต์ — read-only reuse
6. v1 internal ไม่มี quota gate — นับ storage เป็น baseline ต้นทุน; `sitepm.photo_storage_gb` ใช้กับเวอร์ชัน SaaS (ADR-034)

### Requirement 5: Field Reports + Form Builder + e-Signature

1. THE daily report SHALL กรอกจากมือถือ แนบรูป และทำงาน**ออฟไลน์ได้** (Req 8)
2. THE custom form builder (field types: text/number/date/photo/signature/คำนวณ) เป็น Phase 3 — MVP ใช้ template คงที่จาก SOP จริง: `form-templates-installation-v0.1.md` (T0 site-readiness + ครัว/ห้องทั่วไป × เลนช่าง 3 เลน)
3. THE ลายเซ็น SHALL เก็บพร้อม timestamp + ผู้เซ็น + report version — report ที่เซ็นแล้ว immutable
4. THE report SHALL export เป็น PDF ได้

### Requirement 6: Notifications ผ่าน LINE OA + Chat

1. THE notification หลักของช่าง SHALL ส่งผ่าน **line_oa outbound เดิม** (pre-approved template + named slots): งานใหม่/handoff, approval result, เตือนส่งรายงาน — ช่างไทยอยู่บน LINE อยู่แล้ว ไม่ต้องรอ push infra (มติ owner 5 ก.ค. 2026)
2. THE แชท in-app ต่อโปรเจกต์ (Supabase Realtime) SHALL เป็นส่วนเสริม — ผลจาก spike 0.4 ตัดสินว่าเข้า MVP หรือเลื่อน (การคุยหลักช่วงแรกอยู่ใน LINE ได้)
3. THE web push (FCM) SHALL เป็น Phase 2/3 — ไม่ block MVP
4. THE ข้อความ/การแจ้งเตือน SHALL อยู่ใต้ RLS เดียวกับโปรเจกต์ (external member เห็นเฉพาะของโปรเจกต์ตน)

### Requirement 7: Customer Approval ผ่าน LINE (reuse line-oa)

1. THE approval request SHALL ส่งผ่าน line-oa outbound เดิม เป็น **pre-approved Flex template + named slots** — สอดคล้อง template governance เดิม (**ไม่มี free-text LLM**)
2. WHEN ลูกค้ากดอนุมัติ/ปฏิเสธ (postback) THE ระบบ SHALL บันทึกผล + เหตุผล + timestamp แบบ idempotent (pattern webhook เดิม)
3. THE ผลอนุมัติ SHALL ผูกกับ packet/report ที่เกี่ยวข้อง → provenance ครบ: ใคร อนุมัติอะไร ของที่ผลิตล็อตไหน
4. WHEN ลูกค้าไม่มี LINE THE ระบบ SHALL มี fallback (secure link อีเมล/SMS) — Phase 3

### Requirement 8: Offline — MVP = offline-lite; full sync = conditional-on-baseline (ADR-035)

1. THE MVP (Phase 1) SHALL เป็น web responsive + PWA + **offline-lite upload queue**: service worker + IndexedDB เก็บ report/รูปตอนเน็ตหลุด ส่งเมื่อสัญญาณกลับ — **คิวทางเดียว ไม่มี two-way sync = ไม่มี conflict resolution ใน v1**
2. THE offline-lite queue SHALL idempotent (client-generated id ต่อ submission — retry ไม่สร้างซ้ำ) และแสดงสถานะคิวให้ช่างเห็น (pending/sent/failed)
3. THE ระบบ SHALL เก็บ baseline จากงานจริง: อัตรา submit ผ่านคิว offline, จุด/ความถี่ที่ไม่มีสัญญาณ — เป็นข้อมูลตัดสิน Phase 2
4. IF baseline ยืนยันว่าจำเป็น THEN mobile (React Native) + full sync protocol (design.md D-6: LWW + conflict copy + field-merge) SHALL ถูก implement เป็น Phase 2 — sync protocol ต้องล็อก + prototype ก่อนเขียนโค้ด; **ห้าม implement ก่อน baseline ยืนยัน**

### Requirement 9: Entitlement Gating — เฉพาะเวอร์ชัน SaaS (ADR-034/035)

1. THE **v1 internal (dogfood) SHALL ไม่ gate ด้วย entitlement** — ของใช้เองในบริษัท ควบคุมด้วย C12 roles ตามปกติ
2. THE ฟีเจอร์ `sitepm.*` ทั้ง 8 keys ใน matrix v0.4 = availability ของ**เวอร์ชัน SaaS ในอนาคต** (DB แยกตาม ADR-034) — คงเป็น `status='roadmap'` จนกว่าเวอร์ชันขายจะ ship จริง (กติกา anti-vaporware v0.3)
3. THE การพลิก roadmap→implemented SHALL ผูก release checklist ของ**เวอร์ชัน SaaS** — dogfood ship ภายในไม่นับเป็นเหตุ flip

### Requirement 10: PDPA

1. THE รูปหน้างาน/ชื่อ/อีเมล/geo = ข้อมูลส่วนบุคคล — SHALL มี consent record + privacy notice + สิทธิเจ้าของข้อมูล (access/delete)
2. THE ข้อมูลที่ส่งออกนอกระบบ (LINE, PDF, MCP) SHALL ผ่าน redaction ตาม pattern `Data_Minimization_Boundary` เดิม
3. THE retention SHALL กำหนดต่อ org (default + lifecycle policy ลบ media ตามอายุ)

### Requirement 11: Audit

1. THE เหตุการณ์สำคัญ (สร้าง/ปิดโปรเจกต์, ผูก packet, submit/sign report, approval) SHALL เขียน append-only audit ตาราง `installation_audit_log` (pattern `line_oa_audit_log`)
2. THE audit SHALL ไม่แก้/ลบได้ และ query ได้ตาม RLS org

### Requirement 12: Owner Decisions ✅ ตัดสินครบ (grill 5 ก.ค. 2026 — ADR-034/035)

1. ~~PRD §11 ข้อ 8~~ → **แยก DB** (ADR-034) — หมายเหตุ: ข้อสันนิษฐานเดิมของ spec ที่ว่าโมดูลนี้เป็น "หลักฐานฝั่งรวม DB" **ถูกหักล้างใน grill** — join line_oa_*/workflow เป็นเรื่อง internal v1 (อยู่ DB เดิมอยู่แล้ว) ไม่เกี่ยวกับลูกค้า SaaS
2. ~~MVP scope~~ → **dogfood ภายใน + PWA + offline-lite** (ADR-035) — ไม่ใช่ทั้ง (ก) เดิมและ (ข): เพิ่มคิว upload ทางเดียวเข้า Phase 1 โดยไม่แตะ two-way sync
3. Implement เริ่มได้ — เหลือ spikes ใน tasks Phase 0 (Realtime load test) ก่อนผูก chat กับ MVP

## Correctness Properties (สำหรับ test)

1. **Cross-org/external isolation**: external member เห็นเฉพาะโปรเจกต์ที่มี membership; ข้าม org ล้มเหลวทุกทาง
2. **Packet linkage integrity**: ไม่มี dangling packet ref; link เป็น immutable หลังปิดงาน; SHA-256 verify ผ่านตาม receipt เดิม
3. **Media quota atomicity**: N concurrent uploads → ไม่ทะลุ `photo_storage_gb`
4. **Sync convergence**: ทุก conflict scenario → converge โดยไม่มี silent data loss (ฝั่งแพ้มี conflict copy)
5. **Approval provenance**: ทุก approval → audit row + ผูก packet/report; postback ซ้ำ = idempotent
6. **Roadmap gating**: `sitepm.*` ทุกตัว = false/0 ทุก plan จนกว่า flip (ยกเว้น beta override)
