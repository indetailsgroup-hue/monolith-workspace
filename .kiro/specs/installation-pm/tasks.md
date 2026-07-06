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
- [x] 1.2 Wire lifecycle เข้า workflow — ✅ **`0094_installation_lifecycle_wiring.sql` (2026-07-06, ADR-039)**:
  - (a) ✅ CHECK `installation_approvals.subject` → `customer_acceptance` เดียว + comment table (มติ 1)
  - (b) ✅ RACI gate ใน adapter (rebase บน 0092 ตัวล่าสุด): `current_step='Installation'` → ผู้ promote ต้องมี app role ตรง `wf_approvers_for_step(knowledge, 'Installation', 'unanimous')` หรือ governance; ว่าง = fail-safe (มติ 2, Req 8.6); แจ้ง Sale/PM = **reuse tpl_celebrate ที่ rpc_complete_work_item ยิงอยู่แล้ว** (0034/0035 — ไม่ยิงซ้ำ)
  - (c) ✅ seed `installation_room_proof` — `commit_target='evidence_only'` (คอลัมน์ NOT NULL — ค่าไม่ตรง branch ไหน = emit+link เท่านั้น); soft verify "ทุกห้องมีรูป" อยู่ฝั่ง UI (1.5)
  - (d) 📝 T0 snapshot = ฝั่ง UI/bot — convention: insert `installation_audit_log` event `t0_snapshot` ตอนกด approve start (ลงกับ 1.6b/1.8b; ไม่มีงาน DB — insert policy รองรับแล้ว)
  - (e) ✅ `installation_projects.status` += `customer_review` (flow: active → customer_review → completed; จุดเข้า D-5 ลงกับ 1.8c)
  - (f) ✅ tests บน DB จริง 4 เคส: office promote ใบปิดบ้าน → block "ต้องเป็นหัวหน้าทีม" · room proof → emitted + work item ยัง in_progress · RACI/knowledge ว่าง → fail-safe block · หัวหน้าทีม (role ตรง RACI) → completed
- [ ] 1.3 Photo path: PWA upload → `rpc_capture_ingest` (`installation_proof`) + **LINE photo → capture** route; verify → promote → commit ปิด work item (0063 — มีแล้ว แค่ต่อ UI)
- [x] 1.4 Media pipeline (ครึ่ง load-bearing) — ✅ **`0099` + Edge Fn `capture-media-worker` (2026-07-06)**: ดึง content จาก LINE API (`line-message://<id>` **มีอายุจำกัด — ต้องดึงก่อนหาย**) → Storage bucket `installation-media` (private, path คีย์ artifact id = idempotent upsert) + **นับ `media_bytes` = storage baseline ต้นทุน (D-4)**; claim/record ผ่าน RPC (สถาปัตยกรรม RPC-only), Vault token name-then-id, attempts≤5, cron ทุก 5 นาที (`wf-media-fetch`); ทดสอบ RPC บน DB จริง + 7 unit tests; **follow-up ที่เหลือของ 1.4: compress/thumbnail** (ไม่ block dogfood — ต้นฉบับปลอดภัยแล้ว; ทำตอนต้นทุน storage เริ่มมีนัยจาก baseline)
- [ ] 1.5 Field PWA — **grill ผ่านแล้ว (ADR-040, 5 มติ owner 7 ก.ค. 2026) — พร้อม implement รอ go-ahead**; build เป็น 3 Waves ปล่อยใช้ทันทีต่อ Wave:
  - **Wave A — office console** (`packages/field-app` scaffold + ครั้งเดียว: Vite+React+PWA manifest+SW, DAPH field tokens, supabase client, GitHub Pages CI):
    (a) RPC ชุด field (RPC-only): `rpc_field_create_project` (เปิดบ้าน + **preset 5 ห้อง** + สร้างเลน 3/ห้องจาก form_templates ตาม room_type) · `rpc_field_assign_lane` (มอบช่างเข้าเลน) · `rpc_field_issue_bind_code` (ออกรหัส #ผูก 48ชม./2ครั้ง) · `rpc_field_list_projects`/`rpc_field_project_detail`
    (b) หน้าจอ: login (magic link — office ก่อน) → รายการบ้าน → เปิดบ้านใหม่ (ชื่อ+โฟร์แมน+preset) → รายละเอียดบ้าน (ห้อง/เลน/มอบช่าง/รหัสผูก/สถานะกลุ่ม LINE)
  - **Wave B — มุมหัวหน้าทีม**: edge fn `line-login` (session+binding+consent จังหวะเดียว — ADR-040 ข้อ 2) → T0 checklist (audit snapshot ตอน approve start — ADR-039 ข้อ 4) → ภาพรวมบ้าน/ทุกเลน → ปุ่ม "ส่งปิดบ้าน" (capture installation_proof → RACI gate) → "ส่งตรวจรับ" (`rpc_request_customer_acceptance` — มีแล้ว 0098) → รายการ #ปัญหา (`installation_issues`)
  - **Wave C — มุมช่าง**: งานของฉันวันนี้ (เลนตัวเอง — infer จาก identity_binding→assignee) + ติ๊ก checklist + ถ่ายรูป **เข้าคิว offline** (เสียบ `src/installation/offline-queue` spike 0.3 — server duplicate-tolerant ผ่าน client_submission_id UNIQUE ที่มีแล้ว 0090) + "ค้างส่ง N รายการ"
- [x] 1.5b Seed capture_type `customer_requirement` + L3 adapter `work_item_open` — ✅ **`0092` (2026-07-06)**: adapter #6 ใน `rpc_capture_promote` (**rebase บน 0079 ตัวล่าสุด — ไม่ใช่ 0063** ที่ task เดิมอ้าง; ตรวจ replacement chain แล้ว) → เปิด work_item step แรกผ่าน `rpc_create_work_item` (reuse); ทดสอบบน DB จริง: promote → work_item 'Sale' in_progress + **PII ไม่ copy เข้า work_item.data** (เก็บแค่ capture_artifact_id + project_name — PDPA) + fail-safe ไม่มีช่องทางติดต่อ → raise (PFMEA Scrap 100%) + idempotent (promote ซ้ำ → เปิด 1 ใบ); seed จาก draft verbatim (cloud_allowed=false คงเดิม)
- [x] 1.5c Seed `form_templates` — ✅ **`0091_installation_form_templates.sql` (2026-07-06)**: ตาราง form_templates (versioned, unique(key,version), immutable หลัง publish — trigger อนุญาตเฉพาะ retire, ทดสอบ reject จริงบน DB) + seed 7 templates published (T0 site readiness 8 items + ครัว 3 เลน + ห้องทั่วไป 3 เลน; ประปา = conditional item เลน 2 ตามมติ owner; Wrapping = `photo_required:true`); RLS: อ่านทุกคน เขียน governance — **เหลือ sanity check กับหัวหน้าทีมตอน rollout จริง**
- [ ] 1.6 Daily report (template คงที่จาก 1.5c) + แนบรูป + PDF export
- [ ] 1.6b **[UX tenet]** default view ต่อบทบาท: ช่าง = "งานของฉันวันนี้" (เลนตัวเอง, ชื่อห้องภาษาคน, ไม่มี id/key), หัวหน้า = ภาพรวมบ้าน; bot ใช้**ปุ่ม**ไม่ใช่ command; หลังบ้าน infer ห้อง/เลนก่อนถาม (D-12)
- [ ] 1.7 **Offline-lite queue (D-6a)**: report+รูปเข้าคิวตอนเน็ตหลุด + UI สถานะคิว (บอก "ค้างส่ง N" ไม่ใช้ศัพท์ sync/queue) + baseline metrics
- [x] 1.8 LINE groups + staff identity migrations — ✅ **`0088` (identity_binding +consent_at/bound_at/revoked_at — ADR-038) + `0095` (2026-07-06)**: `line_groups` (unique active ต่อ project+type — บ้านละ 2 กลุ่ม) / `line_group_members` (ประวัติ join/leave, member_kind staff|customer|guest, unique active) / `line_bind_codes` (หมดอายุ+uses_left) + templates `audience` (default internal = fail-closed) + outbound `target_type/target_id` + inbound `source_type/line_group_id` (conversation_id → nullable + CHECK exactly-one-target — invariant 1:1 เดิมคงผ่าน CHECK) — **guardrail G1 = trigger** (CHECK ข้ามตารางไม่ได้): ส่งเข้ากลุ่ม customer เฉพาะ audience ∈ (customer,both), กลุ่มไม่ผูก = block; ทดสอบบน DB จริง 6 เคส; RLS fail-closed (member events เขียนได้เฉพาะ service role)
- [x] 1.8b Bot flows — ✅ **`0097_line_group_bot_flows.sql` (2026-07-06)**: `fn_line_handle_group_event` + `rpc_ingest_line_webhook` เพิ่ม group branch (rebase บน 00022 — เส้น 1:1 เดิมไม่แตะ) + sender รองรับ `target_type='group'` (push ไป groupId ตรง ๆ, vertical จาก `line_groups.vertical_context` ที่จำตอน #ผูก):
  - join → prompt `#ผูก` (template whitelist สำหรับกลุ่มยังไม่ผูก) · `#ผูก <code> <ทีม|ลูกค้า>` → validate staff identity + code (48ชม./uses_left) → ผูก + ack · memberJoined/Left → sync (kind: staff|customer|guest จาก identity_binding/customer_identity) · leave → archive
  - รูปกลุ่ม internal → capture **`installation_room_proof`** (ตาม ADR-039 ข้อ 3 — ไม่ใช่ installation_proof ที่ task เดิมเขียน) + ack; เลือกห้อง/เลน = quick reply/UI (1.6b)
  - `#ปัญหา` → `installation_issues` + direct push แจ้งโฟร์แมน (`{employee_id}` ผ่าน resolution chain 0084) + ack
  - **PDPA v1**: แชทธรรมดา**ไม่เก็บ** (ไม่มี inbound row — ไม่มี side effect จึง idempotent-safe); เก็บเฉพาะ event ที่ระบบทำงานด้วย
  - ทดสอบ 7 flows บน DB จริง (join/bind guest fail/bind ok/member kinds/photo→capture/issue+notify/plain ignored); เหลือของ 1.8b เดิม: **ลิงก์ผูก staff identity (LINE Login + consent)** → ย้ายไปทำกับ PWA (1.5/1.6b — ต้องมีหน้า consent)
  - ⚠️ note ส่งต่อ 1.4: capture รูปจาก LINE เก็บ `raw_uri='line-message://<id>'` — ต้องมี worker fetch content จาก LINE API เข้า Storage ภายในช่วงที่ LINE ยังเก็บ content
- [x] 1.8c — ✅ **`0098_customer_acceptance_flex.sql` (2026-07-06)**: flow ตรวจรับลูกค้า D-5 ครบเส้น:
  - `rpc_request_customer_acceptance(project)` — idempotent (pending เดิม = คืนใบเดิม ไม่ spam ลูกค้า); project → customer_review + สร้าง approvals พร้อม `approve_token` (secret ต่อใบ กันปลอม postback) + enqueue Flex เข้ากลุ่ม customer
  - templates: `tpl_inst_approval_request` (**Flex** — `message_kind='flex'` คอลัมน์ใหม่, audience customer, ปุ่ม รับงาน/ขอแก้ไข) + acceptance_ack (customer) + acceptance_result (internal) + progress_update (customer — curated flow ใช้จาก PWA)
  - postback branch ใน `fn_line_handle_group_event` (rebase 0097): validate id+token+pending+กลุ่มตรงบ้าน → approved = project completed / rejected = คง customer_review (punch list — ADR-039 มติ 5, ไม่ reopen work item) + ack ลูกค้า + แจ้งกลุ่ม internal + audit
  - sender รองรับ Flex: `MessageTemplate.messageKind` + `buildOutboundMessage` (JSON พัง/รูปแบบผิด = failed ไม่ส่งมั่ว) — 6 unit tests
  - ทดสอบ DB จริง 5 เคส: ส่งตรวจรับ→Flex 1 ใบ · idempotent · token ผิด block · approve→completed+ack+แจ้งทีม · กดซ้ำ→already_decided; เตือนรายงานประจำวัน = 1.6 (template ตอน daily report landing)
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
