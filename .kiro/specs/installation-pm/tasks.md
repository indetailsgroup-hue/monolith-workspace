# Implementation Plan — Installation PM

> Gate แรกคือการตัดสินใจ ไม่ใช่โค้ด — ห้ามข้าม Phase 0 (pattern เดียวกับ entitlement-tier)

## Phase 0: Decisions + Spikes

- [x] 0.1 ~~Owner ตัดสิน PRD §11 ข้อ 8~~ → **แยก DB** (ADR-034, grill 5 ก.ค. 2026) — ข้อสันนิษฐาน "หลักฐานฝั่งรวม DB" ถูกหักล้าง: v1 เป็น internal อยู่ DB เดิมอยู่แล้ว
- [x] 0.2 ~~MVP scope~~ → **dogfood + PWA + offline-lite upload queue** (ADR-035)
- [ ] 0.3* Spike: offline-lite queue prototype (D-6a) — service worker + IndexedDB + Background Sync + idempotent submission id (แทน sync prototype เดิม — full sync D-6 เลื่อนไปตาม baseline)
- [ ] 0.4* Spike: Supabase Realtime load test (การใช้ครั้งแรกในเรโป — D-7)
- [ ] 0.5 ยืนยันฟีเจอร์ AI voice ของ KANNA จาก App Store changelog (ตอนนี้ unverified) — มีผลแค่ลำดับความสำคัญ Phase 4

## Phase 1: Web MVP — PWA + offline-lite เกาะ line_oa/workflow spine (D-11)

- [ ] 1.1 Migrations: installation_projects (**+work_item_id link**) / installation_tasks (subtask ใต้ work_item) / memberships / photo metadata+annotations / field_reports / approvals / audit_log — **convention C12 เดิม ไม่มี tenant col** (ADR-035) + RLS fail-closed
- [ ] 1.2 Wire lifecycle เข้า workflow: start/finish ผ่าน `rpc_handoff_work_item`/completion เดิม — approval หัวหน้าทีม Installation + auto-notify ทำงานตาม workflow spec (ห้าม bypass); subtask ครบ ≠ auto-complete (ปิดงานผ่าน capture proof เท่านั้น)
- [ ] 1.3 Photo path: PWA upload → `rpc_capture_ingest` (`installation_proof`) + **LINE photo → capture** route; verify → promote → commit ปิด work item (0063 — มีแล้ว แค่ต่อ UI)
- [ ] 1.4 Media processing บน capture artifact: compress/thumbnail Edge Function + นับ storage เป็น baseline ต้นทุน (net-new เดียวของ media)
- [ ] 1.5 Web UI: project list/detail (จัดกลุ่ม work items ต่อ job + SiteSurveyZone read-only) + Kanban (work item + subtask) + PWA
- [ ] 1.5b Seed capture_type `customer_requirement` (จาก `capture-type-customer-requirement-draft.sql`) + L3 adapter `work_item_open` (pattern 0063) — เปิดโปรเจกต์ลูกค้าจากใบบันทึกความต้องการ verified
- [ ] 1.5c Review `form-templates-installation-v0.1.md` กับหัวหน้าทีม Installation (ปม ⚠ home_office ประปา + assignee model ทีม 5 คน/3 เลน) → seed `form_templates`
- [ ] 1.6 Daily report (template คงที่จาก 1.5c) + แนบรูป + PDF export
- [ ] 1.7 **Offline-lite queue (D-6a)**: report+รูปเข้าคิวตอนเน็ตหลุด + UI สถานะคิว + baseline metrics (อัตราเข้าคิว offline)
- [ ] 1.8 LINE templates: 'inst_approval_request' (ลูกค้า — D-5) + แจ้งเตือนช่าง (งานใหม่/approval result/เตือนรายงาน) ผ่าน outbound เดิม
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
