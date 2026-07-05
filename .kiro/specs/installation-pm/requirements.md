# Requirements Document — Installation PM (Field/Site Project Management)

## Introduction

เอกสารนี้กำหนด requirements ของโมดูล **Installation PM** — การจัดการโปรเจกต์ติดตั้งหน้างาน (แนว KANNA) ฝังใน MONOLITH เพื่อปิด loop: `ออกแบบ → ผลิต → ส่งของ → ติดตั้งหน้างาน → รายงานภาพ → ลูกค้าอนุมัติ → ปิดงาน` — ปัจจุบัน MONOLITH จบที่ประตูโรงงาน (Factory Packet)

**สถานะ:** design proposal — แปลงจาก build plan ภายนอก (5 ก.ค. 2026) ผ่านการ verify กับเรโปจริงแล้ว 1 รอบ (แก้ over-claim 4 จุด — ดู §Reuse Map) — **ยังไม่ implement** รอ owner decisions (Req 12)

**ขอบเขต IP:** ลอกได้เฉพาะ*แนวคิดฟีเจอร์/เวิร์กโฟลว์* (field PM เป็นแนวคิดทั่วไป) — ห้ามคัดลอกโค้ด/แบรนด์/ชื่อ KANNA/ไอคอน/UI พิกเซล-ต่อ-พิกเซล

**Working artifacts (ในโฟลเดอร์นี้):** `design.md` · `tasks.md` · `build-plan-external-draft-2026-07-05.md` (ต้นฉบับภายนอก — archive พร้อมบันทึกแก้) — entitlement delta อยู่ที่ `../entitlement-tier/schema-draft-v0.4-delta.sql` + `tier-matrix-v0.4.html`

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
| Storage + media pipeline + push (FCM/APNs) | 🔴 net-new | ไม่พบ `storage.from(`/FCM/APNs ในโค้ด |
| MFA/2FA | 🔧 platform รองรับ | ยังไม่ได้เปิด/บังคับใช้ในระบบ |
| Entitlement gate | 📝 draft | v0.3 ยังไม่ deploy — block ที่ owner decision PRD §11 ข้อ 8 |
| Factory Packet ใน DB | 🔴 net-new | packet เป็น ZIP+receipt ฝั่ง client — ต้องมี Packet Registry (Req 3) |

> ตัวเลข reuse จริง ~40–50% (ไม่ใช่ 60–70% ตาม draft ภายนอก) — แต่ก็ยังถูกกว่า standalone อย่างมีนัยสำคัญ

## Requirements

### Requirement 1: Tenancy + Naming + RLS

1. THE ตารางใหม่ทุกตัว SHALL ผูก tenant scope ตาม convention C12 (`resolve_actor`, `TO authenticated`) + RLS fail-closed
2. THE ตาราง/คอลัมน์ใหม่ SHALL ไม่ใช้คำ `site` นำหน้า (ชนความหมาย C12) — ใช้ `installation_*` / `field_*`
3. THE External Member SHALL เข้าถึงได้เฉพาะ installation project ที่มี membership และเห็นเฉพาะข้อมูลของโปรเจกต์นั้น (ไม่เห็นข้อมูล org อื่น ๆ)

### Requirement 2: Installation Project + Task + Board

1. THE ระบบ SHALL มี installation_projects (ลูกค้า, สถานที่, ช่วงเวลา, สถานะ lifecycle: draft → scheduled → installing → customer_review → closed)
2. THE ระบบ SHALL มี installation_tasks (assignee, due, status, %progress) + มุมมอง Kanban board
3. WHEN โปรเจกต์เข้าสถานะ customer_review THE ระบบ SHALL สร้าง approval request ได้ (Req 7)
4. Gantt + company dashboard เป็น Phase 3 (ดู tasks.md) — ไม่อยู่ใน MVP

### Requirement 3: Packet Registry — สะพานผลิต↔ติดตั้ง (moat)

1. THE ระบบ SHALL มี packet_registry: packet_id, SHA-256, receipt reference, cabinet/panel index — ลงทะเบียนตอน export
2. THE installation_projects SHALL อ้าง packet_registry ได้ (0..n packets ต่อโปรเจกต์) — link **immutable หลังปิดงาน**
3. THE รูป/รายงานติดตั้ง SHALL ผูกถึงระดับ cabinet/panel id ใน packet ได้ (optional ต่อรูป)
4. THE การ verify SHALL ตรวจ SHA-256 กับ receipt ได้ตาม flow `monolith-receipt-verify` เดิม

### Requirement 4: Photo/Media Pipeline + Quota

1. THE upload SHALL ผ่าน media pipeline: บีบอัด + thumbnail (Edge Function) + จัดโฟลเดอร์ต่อโปรเจกต์
2. THE รูป SHALL เก็บ metadata: เวลา, ผู้ถ่าย, geo (ถ้ามี consent), ผูก task/panel ได้
3. THE annotation (วาด/มาร์กบนรูป) SHALL เก็บเป็น layer แยก ไม่ทำลายไฟล์ต้นฉบับ
4. THE storage ต่อ org SHALL enforce ด้วย `sitepm.photo_storage_gb` (stock_quota) — นับผ่าน `storage_usage` hook (net-new — entitlement tasks Phase 4.1)

### Requirement 5: Field Reports + Form Builder + e-Signature

1. THE daily report SHALL กรอกจากมือถือ แนบรูป และทำงาน**ออฟไลน์ได้** (Req 8)
2. THE custom form builder (field types: text/number/date/photo/signature/คำนวณ) เป็น Phase 3 — MVP ใช้ template คงที่
3. THE ลายเซ็น SHALL เก็บพร้อม timestamp + ผู้เซ็น + report version — report ที่เซ็นแล้ว immutable
4. THE report SHALL export เป็น PDF ได้

### Requirement 6: Chat + Notifications

1. THE แชท SHALL ผูกต่อ installation project (Supabase Realtime) — internal + external members
2. THE push notification (FCM/APNs) SHALL แจ้ง: assigned task, mention, approval result, report submitted
3. THE ข้อความ SHALL อยู่ใต้ RLS เดียวกับโปรเจกต์ (external member เห็นเฉพาะห้องของโปรเจกต์ตน)

### Requirement 7: Customer Approval ผ่าน LINE (reuse line-oa)

1. THE approval request SHALL ส่งผ่าน line-oa outbound เดิม เป็น **pre-approved Flex template + named slots** — สอดคล้อง template governance เดิม (**ไม่มี free-text LLM**)
2. WHEN ลูกค้ากดอนุมัติ/ปฏิเสธ (postback) THE ระบบ SHALL บันทึกผล + เหตุผล + timestamp แบบ idempotent (pattern webhook เดิม)
3. THE ผลอนุมัติ SHALL ผูกกับ packet/report ที่เกี่ยวข้อง → provenance ครบ: ใคร อนุมัติอะไร ของที่ผลิตล็อตไหน
4. WHEN ลูกค้าไม่มี LINE THE ระบบ SHALL มี fallback (secure link อีเมล/SMS) — Phase 3

### Requirement 8: Offline-First Mobile

1. THE sync protocol (client_rev + updated_at + tombstone + กติกา conflict ต่อ entity) SHALL ถูกล็อกเป็นเอกสาร**ก่อน**เขียนโค้ด mobile (design.md §D-6)
2. THE conflict default SHALL เป็น last-write-wins ต่อ row ยกเว้น report values ใช้ field-merge — **ห้าม silent data loss**: ฝั่งแพ้ถูกเก็บเป็น conflict copy ให้ผู้ใช้กู้ได้
3. THE mobile app (React Native) SHALL ใช้ Supabase backend + RLS + entitlement เดิมร่วมกัน — ไม่มี backend แยก
4. THE MVP web (Phase 1) SHALL เป็น responsive + PWA (ออนไลน์) — offline เต็มรูปแบบเป็น Phase 2 track แยก

### Requirement 9: Entitlement Gating (v0.4 delta)

1. THE ฟีเจอร์ Site-PM ทั้ง 8 keys SHALL เพิ่มใน matrix เป็น **`status='roadmap'` ทั้งหมด** จนกว่าแต่ละตัวจะ ship (กติกา anti-vaporware v0.3)
2. THE gate SHALL ใช้ kind จริงของ schema: `boolean`/`stock_quota`/`metered_quota`/`limit_param` — ดู `../entitlement-tier/schema-draft-v0.4-delta.sql`
3. THE การพลิก roadmap→implemented SHALL ผูก release checklist ต่อฟีเจอร์ (สืบทอด entitlement Req 6.5)

### Requirement 10: PDPA

1. THE รูปหน้างาน/ชื่อ/อีเมล/geo = ข้อมูลส่วนบุคคล — SHALL มี consent record + privacy notice + สิทธิเจ้าของข้อมูล (access/delete)
2. THE ข้อมูลที่ส่งออกนอกระบบ (LINE, PDF, MCP) SHALL ผ่าน redaction ตาม pattern `Data_Minimization_Boundary` เดิม
3. THE retention SHALL กำหนดต่อ org (default + lifecycle policy ลบ media ตามอายุ)

### Requirement 11: Audit

1. THE เหตุการณ์สำคัญ (สร้าง/ปิดโปรเจกต์, ผูก packet, submit/sign report, approval) SHALL เขียน append-only audit ตาราง `installation_audit_log` (pattern `line_oa_audit_log`)
2. THE audit SHALL ไม่แก้/ลบได้ และ query ได้ตาม RLS org

### Requirement 12: Owner Decisions (blocking)

1. Owner SHALL ตัดสิน **PRD §11 ข้อ 8** (แยก DB vs รวม C12) ก่อน — โมดูลนี้เป็น**หลักฐานเพิ่มน้ำหนักฝั่ง "รวม DB"** (ต้อง join line_oa_*, workflow, packet_registry)
2. Owner SHALL ยืนยัน MVP scope: (ก) web-PWA ก่อน + mobile ทีหลัง (ข้อเสนอของ spec นี้) หรือ (ข) mobile ตั้งแต่ Phase 1 (ตาม draft ภายนอก — เสี่ยง timeline)
3. ห้าม implement จนกว่าจะตัดสินทั้ง 2 ข้อ — บันทึกเป็น ADR

## Correctness Properties (สำหรับ test)

1. **Cross-org/external isolation**: external member เห็นเฉพาะโปรเจกต์ที่มี membership; ข้าม org ล้มเหลวทุกทาง
2. **Packet linkage integrity**: ไม่มี dangling packet ref; link เป็น immutable หลังปิดงาน; SHA-256 verify ผ่านตาม receipt เดิม
3. **Media quota atomicity**: N concurrent uploads → ไม่ทะลุ `photo_storage_gb`
4. **Sync convergence**: ทุก conflict scenario → converge โดยไม่มี silent data loss (ฝั่งแพ้มี conflict copy)
5. **Approval provenance**: ทุก approval → audit row + ผูก packet/report; postback ซ้ำ = idempotent
6. **Roadmap gating**: `sitepm.*` ทุกตัว = false/0 ทุก plan จนกว่า flip (ยกเว้น beta override)
