# Implementation Plan — Installation PM

> Gate แรกคือการตัดสินใจ ไม่ใช่โค้ด — ห้ามข้าม Phase 0 (pattern เดียวกับ entitlement-tier)

## Phase 0: Decisions + Spikes

- [x] 0.1 ~~Owner ตัดสิน PRD §11 ข้อ 8~~ → **แยก DB** (ADR-034, grill 5 ก.ค. 2026) — ข้อสันนิษฐาน "หลักฐานฝั่งรวม DB" ถูกหักล้าง: v1 เป็น internal อยู่ DB เดิมอยู่แล้ว
- [x] 0.2 ~~MVP scope~~ → **dogfood + PWA + offline-lite upload queue** (ADR-035)
- [x] 0.3* Spike: offline-lite queue prototype (D-6a) — ✅ **ผ่าน 2026-07-06**: `src/installation/offline-queue/` (queue core + IndexedDB adapter + sw-bridge, 21 tests) — idempotent id/restart survival/backoff/poison isolation พิสูจน์ครบ; ข้อค้นพบ: Background Sync = Chromium เท่านั้น → รองรับ 2 กลยุทธ์ตั้งแต่แรก (`pickSyncStrategy`) — ผล+งานต่อยอดใน `spike-0.3-offline-lite-queue.md`
- [ ] 0.4* Spike: Supabase Realtime load test (D-7) — 🟡 **harness เสร็จ 2026-07-06** (`scripts/spikes/realtime-load-test.mjs` — 51 subscribers/3 บ้าน, เกณฑ์ delivery ≥99.5% + p95 <2s); **การรันจริงรอ provisioning (runbook Wave2 ขั้น A — ops)**; ผลชี้ทาง task 1.9 (FAIL → ใช้ LINE พอ) — `spike-0.4-realtime-load-test.md`
- [x] 0.5 ~~ยืนยันฟีเจอร์ AI voice ของ KANNA~~ → ✅ **ยืนยันแล้ว 2026-07-06**: หน้า features ทางการ (lp.kanna4u.com/en/features) ระบุ **"AI Voice Reporting"** (dictate site reports hands-free) + AI MCP + AI Assistance → Phase 4 voice-to-report เป็นฟีเจอร์ที่คู่แข่งมีจริง คงลำดับความสำคัญเดิม

## Phase 1: Web MVP — PWA + offline-lite เกาะ line_oa/workflow spine (D-11)

- [x] 1.1 Migrations — ✅ **`0090_installation_pm_core.sql` (2026-07-06, apply ผ่าน local DB จริงทั้ง chain)**: 8 ตาราง + audit (9 รวม annotations) — projects (+work_item_id partial-unique + foreman_employee_id) / rooms (room_type + display_name ภาษาคน) / tasks (lane 1–3 = ช่างคนที่ N, unique(room,lane)) / memberships (+`fn_installation_is_member` security definer กัน RLS recursion) / photos+annotations / field_reports / approvals (postback_id UNIQUE) / audit_log; RLS fail-closed ทุกตาราง (governance | site | member); immutability triggers (audit append-only, report เซ็นแล้ว, approval ตัดสินแล้ว — ทดสอบ reject จริงบน DB); **client_submission_id partial-UNIQUE บน photos/reports = จุดเสียบ idempotency ของ spike 0.3**; หมายเหตุ: คอลัมน์ `values` ใน D-2 → `report_values` (VALUES เป็น reserved keyword)
- [ ] 1.2 Wire lifecycle เข้า workflow: start/finish ผ่าน `rpc_handoff_work_item`/completion เดิม — approval หัวหน้าทีม Installation + auto-notify ทำงานตาม workflow spec (ห้าม bypass); subtask ครบ ≠ auto-complete (ปิดงานผ่าน capture proof เท่านั้น)
- [ ] 1.3 Photo path: PWA upload → `rpc_capture_ingest` (`installation_proof`) + **LINE photo → capture** route; verify → promote → commit ปิด work item (0063 — มีแล้ว แค่ต่อ UI)
- [ ] 1.4 Media processing บน capture artifact: compress/thumbnail Edge Function + นับ storage เป็น baseline ต้นทุน (net-new เดียวของ media)
- [ ] 1.5 Web UI: project list/detail (จัดกลุ่ม work items ต่อ job + SiteSurveyZone read-only) + Kanban (work item + subtask) + PWA
- [ ] 1.5b Seed capture_type `customer_requirement` (จาก `capture-type-customer-requirement-draft.sql`) + L3 adapter `work_item_open` (pattern 0063) — เปิดโปรเจกต์ลูกค้าจากใบบันทึกความต้องการ verified
- [x] 1.5c Seed `form_templates` — ✅ **`0091_installation_form_templates.sql` (2026-07-06)**: ตาราง form_templates (versioned, unique(key,version), immutable หลัง publish — trigger อนุญาตเฉพาะ retire, ทดสอบ reject จริงบน DB) + seed 7 templates published (T0 site readiness 8 items + ครัว 3 เลน + ห้องทั่วไป 3 เลน; ประปา = conditional item เลน 2 ตามมติ owner; Wrapping = `photo_required:true`); RLS: อ่านทุกคน เขียน governance — **เหลือ sanity check กับหัวหน้าทีมตอน rollout จริง**
- [ ] 1.6 Daily report (template คงที่จาก 1.5c) + แนบรูป + PDF export
- [ ] 1.6b **[UX tenet]** default view ต่อบทบาท: ช่าง = "งานของฉันวันนี้" (เลนตัวเอง, ชื่อห้องภาษาคน, ไม่มี id/key), หัวหน้า = ภาพรวมบ้าน; bot ใช้**ปุ่ม**ไม่ใช่ command; หลังบ้าน infer ห้อง/เลนก่อนถาม (D-12)
- [ ] 1.7 **Offline-lite queue (D-6a)**: report+รูปเข้าคิวตอนเน็ตหลุด + UI สถานะคิว (บอก "ค้างส่ง N" ไม่ใช้ศัพท์ sync/queue) + baseline metrics
- [ ] 1.8 LINE groups + staff identity (Req 13, `line-architecture-v0.1.md`): migrations **ขยาย `identity_binding` (ADR-038: +consent_at/bound_at/revoked_at — ไม่สร้าง line_staff_identity)**/`line_groups`/`line_group_members`/`line_bind_codes` + extend templates (`audience`) + outbound (`target_type/target_id`) + inbound (`source_type/line_group_id`) — **guardrail audience เป็น DB CHECK**
- [ ] 1.8b Bot flows: join event → `#ผูก` → binding; member sync; รูปกลุ่ม internal → capture `installation_proof` + quick reply เลือกห้อง/เลน; `#ปัญหา` → issue + แจ้งหัวหน้า; ลิงก์ผูก staff identity (LINE Login + consent)
- [ ] 1.8c LINE templates: 'inst_approval_request' (ลูกค้า — D-5, `audience='customer'`) + curated progress update + แจ้งเตือนทีม internal (งานใหม่/approval result/เตือนรายงาน)
- [ ] 1.9 Chat in-app ต่อโปรเจกต์ (Realtime — ตามผล spike 0.4; ถ้า spike ไม่ผ่าน → LINE พอสำหรับ MVP)
- [ ] 1.10* Negative tests: Correctness Properties 1, 2, 5 + RLS external member + queue idempotency + subtask-ไม่-complete-work-item

## Phase 2: Mobile + Full Offline — **conditional: เปิดเมื่อ baseline จาก 1.6 ยืนยันว่าจำเป็น** (Req 8.4)

- [ ] 2.0 Gate: review baseline (อัตรา offline, จุดอับสัญญาณ, feedback ช่าง) → owner ตัดสินเปิด/ปิด Phase นี้
- [ ] 2.1 Sync prototype (D-6) — 2 clients + conflict ทุก scenario Property 4; เลือก client store (PowerSync/WatermelonDB/RxDB)
- [ ] 2.2 React Native shell + auth + โปรเจกต์/task
- [ ] 2.3 Offline sync ตาม protocol D-6 + sync_conflicts UI
- [ ] 2.4 Push: FCM/APNs + device tokens + fan-out Edge Function (ถ้าไม่ทำ Phase 2 → web push แทนใน Phase 3)
- [ ] 2.5* Sync convergence tests (Property 4) — ทุก conflict matrix ต้องเขียว

## Phase 3: Commercial

- [ ] 3.1 Gantt + project dashboard
- [ ] 3.2 Form builder (versioned templates) + e-signature + photo report
- [ ] 3.3 Sub-project, calendar + sync, import/export CSV
- [ ] 3.4 Approval fallback ไม่มี LINE (secure link)
- [ ] 3.5 PDPA ครบวงจร: consent UI, retention/lifecycle job, purge + audit

## Phase 4: Scale / AI

- [ ] 4.1 Company-wide dashboard (enterprise)
- [ ] 4.2 AI voice reporting (speech-to-text → เติมฟอร์ม) — net-new stack; ทบทวนความจำเป็นตามผล 0.5
- [ ] 4.3 เชื่อม accounting/costing เดิม (ต้นทุนติดตั้งเข้างบโปรเจกต์)
- [ ] 4.4 MFA enforcement (Supabase MFA) สำหรับ org ที่เปิด

## Entitlement Flips (ทำคู่ทุก Phase — กติกา v0.3 Req 6.5)

- [ ] F1 Phase 1 ship → flip `sitepm.projects`, `sitepm.line_approval` (+`sitepm.photo_storage_gb` เมื่อ quota enforce จริง)
- [ ] F2 Phase 2 ship → flip `sitepm.mobile_offline`
- [ ] F3 Phase 3 ship → flip `sitepm.gantt`, `sitepm.custom_report`
- [ ] F4 Phase 4 ship → flip `sitepm.company_dashboard`, `sitepm.ai_voice_report`

## Deferred

- IP/device restriction ต่อ org, หลายภาษา (EN), partner/reseller access, BIM/แปลนอาคาร

## UX Tenet queue (จาก docs/UX-Tenet-System-Audit-v1.md)

- [ ] U1 Survey mobile form: "งานวัดของฉันวันนี้" (ที่อยู่+แผนที่+ข้อมูล sale แนบเอง — ไม่ต้องปริ้น) + ฟอร์มไล่ตามลำดับวัดจริง + แบบฟอร์มความต้องการ (LADY/MAN checklist) บนมือถือ (S3)
- [ ] U2 ปุ่ม "แจ้งปัญหา" pattern เดียวกันที่โรงงาน (รูป→ปุ่ม→route ซ่อมบำรุง/QA) — reuse จาก 1.8b (S5)
- [ ] U3 Customer reject flow: ปุ่มเหตุผลง่าย + ระบบ route เข้า revision เอง; ลิงก์ดูแบบหมดอายุ = ขอใหม่ 1 tap (S4)
