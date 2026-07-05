# Implementation Plan — Installation PM

> Gate แรกคือการตัดสินใจ ไม่ใช่โค้ด — ห้ามข้าม Phase 0 (pattern เดียวกับ entitlement-tier)

## Phase 0: Decisions + Spikes (blocking)

- [ ] 0.1 Owner ตัดสิน PRD §11 ข้อ 8 (แยก DB vs รวม C12) — โมดูลนี้คือหลักฐานฝั่ง "รวม DB" (join line_oa_*/workflow/packet_registry) — บันทึก ADR
- [ ] 0.2 Owner ยืนยัน MVP scope: (ก) web-PWA ก่อน [ข้อเสนอ spec นี้] vs (ข) mobile ตั้งแต่แรก [draft ภายนอก]
- [ ] 0.3* Spike: sync prototype (D-6) — 2 clients + conflict ทุก scenario ใน Correctness Property 4; เลือก client store (PowerSync/WatermelonDB/RxDB)
- [ ] 0.4* Spike: Supabase Realtime load test (การใช้ครั้งแรกในเรโป — D-7)
- [ ] 0.5 ยืนยันฟีเจอร์ AI voice ของ KANNA จาก App Store changelog (ตอนนี้ unverified) — มีผลแค่ลำดับความสำคัญ Phase 4

## Phase 1: Web MVP (หลัง 0.1–0.2)

- [ ] 1.1 Migrations: installation_projects / tasks / memberships / photos / annotations / field_reports / chat / approvals / audit_log + RLS ตาม convention จาก ADR 0.1
- [ ] 1.2 Packet Registry + RPC `register_packet` (idempotent) + ผูก export flow เดิม
- [ ] 1.3 Web UI: project list/detail + Kanban + task CRUD (responsive + PWA)
- [ ] 1.4 Media pipeline: upload → compress/thumbnail Edge Function + storage_usage counter + quota check
- [ ] 1.5 Daily report (template คงที่) + แนบรูป + PDF export
- [ ] 1.6 Chat ต่อโปรเจกต์ (Realtime — ตามผล spike 0.4) + in-app notifications
- [ ] 1.7 LINE approval: template 'inst_approval_request' + postback route + approvals table (D-5)
- [ ] 1.8* Negative tests: Correctness Properties 1, 2, 3, 5 + RLS external member

## Phase 2: Mobile + Offline (track แยก — เริ่มได้หลัง 0.3)

- [ ] 2.1 React Native shell + auth + โปรเจกต์/task แบบ online
- [ ] 2.2 Offline sync ตาม protocol D-6 (client store จาก spike) + sync_conflicts UI
- [ ] 2.3 Media offline queue + reconcile local id
- [ ] 2.4 Push: FCM/APNs + device tokens + fan-out Edge Function
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
