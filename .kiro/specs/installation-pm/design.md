# Design Document — Installation PM

> สถานะ: approved design (grill 5 ก.ค. 2026 — ADR-034/035): v1 = dogfood ภายใน DAPH บน DB เดิม (C12) · MVP = PWA + offline-lite · D-6 full sync = design สำรอง รอ baseline
> อ่านคู่กับ `requirements.md` — เลข D-x อ้างถึงการตัดสินใจเชิงออกแบบในเอกสารนี้

## D-1: Naming — เลี่ยงคำ `site`

ใน C12 `site` = ขอบเขต tenant (`has_site_access`) ถ้าตั้ง `site_projects` จะสับสนใน RLS policy ทันที → ใช้ **`installation_projects`** และ prefix `installation_*`/`field_*` ทั้งชุด (feature keys ใน entitlement ใช้ `sitepm.*` ได้เพราะเป็น namespace การขาย ไม่ใช่ชื่อตาราง)

## D-2: Data Model (org-scoped + RLS ทุกตาราง — convention C12)

**Tenancy (มติ ADR-035):** v1 อยู่ DB เดิม — **ไม่มี org_id/tenant col** ใช้ convention C12 ตรง ๆ (roles + site_code จาก JWT, `resolve_actor` เป็น audit actor) + `installation_memberships` คุมการเข้าถึงของช่างภายนอกรายโปรเจกต์; เวอร์ชัน SaaS ในอนาคตอยู่ DB แยก (ADR-034) ค่อย re-scope tenancy ตอนนั้น

**Staffing model (owner 5 ก.ค. 2026):** ห้องละ 3 ช่าง (คนละเลน checklist) ทุกห้องขนานกัน + หัวหน้างาน 1 คน/บ้าน (เช่น บ้าน 5 ห้อง = 16 คน) → โครงสร้างต้องมีชั้น "ห้อง": บ้าน (project + foreman) → ห้อง (room_type) → เลนช่าง (subtask + assignee)

```
(C12 DB เดิม — single company)
  installation_projects ─*:1─ work_items (ขั้น Installation — lifecycle จริงอยู่ที่ workflow; ดู D-11)
  installation_projects (foreman = หัวหน้างาน 1 คน/บ้าน — approver start/finish)
                         ─┬─1:*─ installation_rooms     (room_type: kitchen/bedroom/... — เสร็จ = 3 เลนครบ + รูป Wrapping)
                          │        └─1:*─ installation_tasks (เลนช่าง 1/2/3 จาก template + assignee ช่างจริง)
                          ├─1:*─ installation_photos     (storage_path, thumb_path, meta, room_ref?, panel_ref?)
                          │        └─1:*─ photo_annotations (layer JSON — ไม่แตะไฟล์ต้นฉบับ)
                          ├─1:*─ field_reports            (template_ref, values jsonb, signature?, status)
                          ├─1:*─ installation_chat_messages
                          ├─1:*─ installation_approvals   (channel: line|link, result, postback_id UNIQUE)
                          ├─1:*─ installation_audit_log   (append-only)
                          └─*:*─ packet_registry           (ผ่าน installation_packets join)
installation_memberships (project_id, user_id, member_type: internal|external, role)
form_templates (org-scoped, versioned, immutable หลัง publish)
packet_registry (packet_id, sha256, receipt_ref, manifest jsonb: cabinet/panel index)
```

หลักการ: ทุกตาราง = tenant col + RLS fail-closed · external member ผ่าน `installation_memberships` เท่านั้น (policy แยกจาก org member) · report ที่เซ็นแล้ว + approval + audit = **immutable** (no UPDATE/DELETE policy)

## D-3: Packet Registry — สะพานผลิต↔ติดตั้ง

ปัจจุบัน Factory Packet เป็น ZIP + Ed25519 receipt ฝั่ง client — **ไม่มีใน DB** ออกแบบ:

- ตอน export สำเร็จ → client เรียก RPC `register_packet(packet_id, sha256, receipt_ref, manifest)` (idempotent ตาม packet_id)
- `manifest` เก็บ index ของ cabinet/panel (id + ชื่อ) พอสำหรับ link รูป/task — **ไม่เก็บเนื้อ packet** (ZIP อยู่ storage/ลูกค้า) → DB ไม่บวม, ความจริงยังอยู่ที่ artifact + receipt
- verify = โหลด artifact แล้วเช็ค SHA-256 กับ registry + `monolith-receipt-verify` เดิม (ไม่สร้างกลไก verify ใหม่)
- เกี่ยวพัน owner decision ข้อ 5 (Released_Spec contract) — ถ้า contract นั้น landing ก่อน ให้ registry ใช้ id space เดียวกัน

## D-4: Media Pipeline

- Upload → Supabase Storage path `org/{tenant}/inst/{project}/orig/...` → Edge Function trigger: compress + thumbnail → `.../thumb/`
- Quota: ก่อน upload เรียก `feature_limit('sitepm.photo_storage_gb')` เทียบ `storage_usage(tenant)` (ตารางนับ bytes — net-new, สอดคล้อง entitlement tasks Phase 4.1) — enforce ที่ Edge Function + นับจริงหลัง upload (กัน TOCTOU ด้วย advisory lock pattern เดิม)
- Lifecycle: policy ต่อ org (เช่น archive/ลบ orig หลัง N ปี เก็บ thumb) — ลด storage cost ซึ่งเป็นต้นทุนโตเร็วสุด
- Annotation = JSON layer (stroke/shape/text) เก็บใน `photo_annotations` render ทับตอนแสดง/ตอน export PDF

## D-5: LINE Approval Flow (reuse line-oa)

> **มติ grill 1.2 ข้อ 1 (owner, 6 ก.ค. 2026):** `installation_approvals` มีหน้าที่เดียว = **customer_acceptance** (ลูกค้าตรวจรับบ้าน); subject `start`/`finish` ตัดออกจาก CHECK ของ 0090 ตอน implement 1.2 — start/finish เป็นของ workflow approval loop 100% (Req 8.6 workflow: entry gate เข้าขั้น Installation = start · completion ผ่าน capture proof = finish); การ์ด Flex ในกลุ่ม LINE เป็นแค่*ช่องทางกด*ที่ยิงเข้า decision RPC เดิม ไม่ใช่ระบบอนุมัติที่สอง (หลักเดียวกับ "กลุ่ม LINE ≠ authorization")
>
> **มติ grill 1.2 ข้อ 2 (owner, 6 ก.ค. 2026):** enforce "finish ต้องเป็นหัวหน้าทีม Installation" (Req 8.6) ด้วย **RACI gate ใน adapter 'Work_Item complete' — pattern ADR-031**: เมื่อ `current_step='Installation'` ผู้ promote ต้องมี app role ตรง approver ref ของขั้น Installation จาก `knowledge_import` current (แหล่งอำนาจเดียวกับ start) หรือ governance; RACI ว่าง → fail-safe block; ไม่สร้าง approval รอบสอง (SLA ของการรอ finish = SLA ของขั้น Installation เอง); พ่วง: adapter ยิงแจ้ง Sale/PM (fyi group) ตอน complete ถ้ายังไม่มีใครยิง
>
> **มติ grill 1.2 ข้อ 3 (owner, 6 ก.ค. 2026):** แยกสอง capture type — **`installation_room_proof`** (รูป Wrapping รายเลน/ห้อง, `commit_target='evidence_only'` (คอลัมน์ NOT NULL — ค่านี้ไม่ตรง branch ไหน) → promote = verify+เก็บ evidence+link `installation_room`; ศูนย์โค้ด adapter) vs **`installation_proof`** (= **ใบปิดบ้านใบเดียว** หัวหน้าทีมส่งเมื่อทุกห้องเสร็จ → complete ผ่าน RACI gate มติข้อ 2); verify rule ของใบปิดบ้าน "ทุกห้องมี room proof" = **soft** (เตือนใน UI ไม่ block ที่ DB — บ้านอาจมีห้องยกเลิกกลางทาง อำนาจตัดสินอยู่ที่หัวหน้า + เหตุผลลง audit); UX: ช่างแค่ถ่ายรูปจบเลน หลังบ้าน route เป็น room proof เอง — ปุ่ม "ส่งปิดบ้าน" มีเฉพาะมุมหัวหน้า
>
> **มติ grill 1.2 ข้อ 4 (owner, 6 ก.ค. 2026):** T0 site readiness ผูกกับ start แบบ **soft + audit snapshot** — UI/Flex แสดง T0 ก่อนปุ่มอนุมัติ; ตอน approve start แนบ snapshot สถานะ T0 (ครบ/ขาดข้อไหน) ลง audit log; **ไม่ hard-block ที่ DB** เพราะ T0 มีข้อ conditional ตามบ้าน (เช่น Water supply ในบ้านไม่มีงานประปา) — hard gate บนเช็คลิสต์ conditional = สอนให้ติ๊กเพื่อผ่าน เสีย signal จริง; อำนาจ+ความรับผิดอยู่ที่หัวหน้าทีมซึ่ง Req 8.6 แต่งตั้งเป็น approver อยู่แล้ว
>
> **มติ grill 1.2 ข้อ 5 (owner, 6 ก.ค. 2026):** การตรวจรับของลูกค้า = **closure ระดับ project แยกชั้นจาก workflow** — work item ปิดเมื่อใบปิดบ้านผ่าน (งานช่างจบ = นาฬิกา operational หยุด); จากนั้น `installation_projects`: `active → customer_review → completed`; ลูกค้าไม่รับ → **ไม่ reopen work item** — บันทึกเหตุผลลง `installation_approvals.reason` + แจ้งทีม แล้วเดินเป็น punch list/rework flow ใหม่ (นิยามละเอียด Phase ถัดไป); ห้ามเพิ่ม Installation เข้า `wf_is_customer_approval_step` (นั่นคุม entry gate — ลูกค้าจะกลายเป็นผู้อนุมัติ "เริ่มติดตั้ง" ซึ่งผิดความหมาย)

```
installation_projects (customer_review)
  → สร้าง installation_approvals (pending)
  → enqueue line_oa_outbound_messages ด้วย template ใหม่ 'inst_approval_request'
     (pre-approved Flex + named slots: {{project_name}}, {{report_url}}, {{approve_token}}) — ไม่มี free-text
  → ลูกค้ากดปุ่ม → LINE postback → line-webhook เดิม (HMAC + idempotent ตาม webhook_event_id)
  → route ตาม postback type ใหม่ 'inst_approval' → update approvals (result, reason, at) + audit row
  → Realtime notify ทีม + push
```

- ต้องเพิ่ม: template 1 ตัว (ผ่าน template governance เดิม), postback route 1 ตัว, identity mapping ลูกค้า↔โปรเจกต์ (reuse `line_oa_customer_identity`)
- ลูกค้าไม่มี LINE → Phase 3: secure link (signed URL อายุสั้น) ผลเข้า table เดียวกัน

## D-6a: Offline-Lite Upload Queue (MVP — ADR-035)

- Service worker + IndexedDB: report submission + รูป เข้าคิวเมื่อ offline → Background Sync/retry เมื่อกลับ online
- Idempotent ด้วย client-generated submission id (UNIQUE ที่ server — retry ไม่ซ้ำ)
- UI สถานะคิว: pending/sent/failed ต่อรายการ — ช่างเห็นว่าของค้างส่งกี่ชิ้น
- **อ่านอย่างเดียวตอน offline** ใช้ cache ล่าสุด (stale-while-revalidate) — ไม่มีการแก้ข้อมูลสองทาง = ไม่มี conflict
- Metric baseline: นับ submission ที่เข้าคิว offline vs ส่งตรง + timestamp gap → ใช้ตัดสิน Phase 2

## D-6: Full Sync Protocol (design สำรอง — ห้าม implement ก่อน baseline ยืนยัน; Req 8.4)

- ทุก row ที่ sync ได้: `updated_at` (server), `client_rev` (uuid ต่อ write), `deleted_at` (tombstone)
- Pull: delta ตาม `updated_at > last_sync` ต่อโปรเจกต์ · Push: batch พร้อม `base_rev` ต่อ row
- Conflict (base_rev ไม่ตรง):
  - default = **LWW ต่อ row** + เก็บฝั่งแพ้เป็น `sync_conflicts` row (กู้คืนได้ — ห้าม silent loss)
  - `field_reports.values` = **field-merge** (กรอกคนละช่องไม่ชนกัน) — ชนช่องเดียวกัน → LWW ช่องนั้น + conflict copy
  - report ที่ **เซ็นแล้ว/approval/audit** = immutable → ฝั่ง offline ที่แก้ของ immutable = reject ทั้ง batch row นั้น
- Client store: เลือกใน Phase 2 spike ระหว่าง PowerSync / WatermelonDB / RxDB (เกณฑ์: RLS-compat, attachment queue, maturity) — **ห้ามตัดสินใน spec นี้** ต้องมี prototype ก่อน (tasks Phase 0.3)
- Media offline: คิวรูปแยกจาก row sync (upload ทีหลัง, report อ้างรูปด้วย local id → reconcile)

## D-7: Chat + Push

- Supabase Realtime channel ต่อโปรเจกต์ (**การใช้ Realtime ครั้งแรกในเรโป** — ต้อง load test ก่อนใช้จริง เพราะยังไม่มีที่ไหนพิสูจน์)
- Push: FCM (Android/web) + APNs (iOS) ผ่าน Edge Function fan-out — เก็บ device tokens ใต้ RLS ของผู้ใช้
- แจ้งเตือน: task assigned, @mention, approval result, report submitted

## D-8: Entitlement Integration (เฉพาะเวอร์ชัน SaaS — v1 internal ไม่ gate)

- v1 dogfood: ไม่แตะ entitlement เลย (ADR-035) — คุมด้วย C12 roles
- Delta v0.4: +8 features หมวด `site_pm` — **roadmap ทั้งหมด** — availability ของเวอร์ชัน SaaS (DB แยก, ADR-034) — ดู `../entitlement-tier/schema-draft-v0.4-delta.sql` (53→61 features, seed 244 rows)
- ความสัมพันธ์กับ `storage.cloud_mb` (มีอยู่แล้ว, roadmap): `sitepm.photo_storage_gb` เป็นโควตา**แยก**สำหรับ media หน้างาน (ต้นทุน/ราคาแยกจาก cloud project storage) — ตั้งใจไม่รวม
- UI 3 สถานะเดิม (enabled/locked/coming-soon) ใช้ได้ทันทีเมื่อ entitlement landing

## D-9: PDPA

- Consent: ตอนเชิญ external member + ตอนเปิดใช้ geo-tag (per-project toggle, default off)
- Redaction: export/LINE/MCP ผ่าน `Data_Minimization_Boundary` pattern เดิม (allowedFields + PII scrub)
- สิทธิเจ้าของข้อมูล: ลบรูป/ข้อมูลส่วนตัว → soft-delete + purge job (audit เก็บ event โดยไม่เก็บเนื้อ PII)

## D-10: สิ่งที่ตัดออกจาก draft ภายนอก (พร้อมเหตุผล)

| ของใน draft | การตัดสิน | เหตุผล |
|---|---|---|
| "Trust Chain เป็น audit log ของ site events" | ❌ ใช้ `installation_audit_log` แทน | Trust Chain = manufacturing provenance ไม่ใช่ audit อเนกประสงค์ |
| "reuse AI stack ทำ voice reporting" | เลื่อนเป็น Phase 4 + ระบุว่าเป็น net-new | เรโปมี MCP governance ไม่ใช่ speech-to-text; ฟีเจอร์ KANNA นี้ยัง unverified ด้วย |
| MVP 3–5 เดือนรวม mobile offline | แยก track: Phase 1 web-PWA, Phase 2 mobile | N5 เดี่ยว ๆ ก็กินเวลาระดับนั้น; ทีมปัจจุบันเป็น web/R3F |
| ชื่อ `site_project` | เปลี่ยน `installation_projects` | ชน C12 (D-1) |
| "Entitlement v0.3 ✅ มีแล้ว" | ระบุตรง: 📝 draft ยังไม่ deploy | block ที่ PRD §11 ข้อ 8 |

## D-11: Workflow + Capture Integration (มติ owner 5 ก.ค. 2026 — "line_oa/workflow ด้วย")

หลักการ: **Installation PM เป็น lens บน spine เดิม ไม่ใช่ระบบขนาน** — สิ่งที่มีอยู่แล้วและต้องเกาะ:

| Spine เดิม | ใช้ทำอะไรใน Installation PM |
|---|---|
| `work_items` + `process_model` (ขั้น Installation ใน canonical process) | lifecycle งานติดตั้งจริง — start/finish ผ่าน `rpc_handoff_work_item`/completion → approval หัวหน้าทีม Installation + auto-notify Sale/PM ทำงานเองตาม workflow spec |
| capture `installation_proof` (0051, verify rules + manual entry ตาม ADR-033) | รูปหลักฐานติดตั้ง: ingest → verify → promote → **commit 'Work_Item complete' (0063)** — การปิดงานด้วยรูปมีอยู่แล้ว |
| capture `site_survey` → `SiteSurveyZone` (0062/0073) | ข้อมูลวัดหน้างานก่อนติดตั้ง — แสดง read-only ในหน้าโปรเจกต์ |
| line_oa webhook/outbound + templates | (ก) ช่างส่งรูปผ่าน LINE → capture (ข) แจ้งเตือนช่าง: งานใหม่/approval/เตือนรายงาน (ค) ลูกค้าอนุมัติ (D-5) — **โครงกลุ่ม + staff identity + guardrails ทั้งหมด: `line-architecture-v0.1.md` (Req 13)** |

สิ่งที่ Installation PM **เพิ่ม** (ไม่ทับของเดิม): มุมมองโปรเจกต์ (จัดกลุ่ม work items ต่อ job ลูกค้า + Kanban), subtask หน้างาน, media processing (thumbnail/compress บน capture artifact), annotation layer, field report + PDF, offline-lite queue (D-6a), packet registry (D-3)

ข้อควรระวัง: `installation_tasks` ห้ามมี state ที่ขัด work_item (single source of truth = workflow) — subtask เสร็จครบไม่ auto-complete work item (ต้องผ่าน capture proof ตาม flow เดิม)

## D-12: UX Tenet — หน้าบ้านง่าย หลังบ้านรับความยาก (ผ่าน audit `ux-tenet-audit-v1.md`)

กติกาถาวรที่ทุก touchpoint ของ Installation PM ต้องผ่าน (PRD §1 Governing UX Tenet):
1. **ไม่มี command บังคับ** — action เริ่มจากการกระทำธรรมชาติ (ส่งรูป/เข้ากลุ่ม/กดปุ่ม) แล้ว bot เสนอ**ปุ่ม**; hashtag = shortcut ทางเลือก
2. **ห้ามโชว์ id/key/ศัพท์ระบบ** ให้ผู้ใช้หน้างาน — ห้อง = ชื่อภาษาคน, งาน = "งานของคุณ"; id/version/key/capture_type = หลังบ้านล้วน
3. **หลังบ้านเดาก่อนถาม** — infer ห้อง/เลน/โปรเจกต์จาก subtask assignment + group binding → ถามเฉพาะเมื่อกำกวม (ถามด้วยปุ่มภาษาคน)
4. **approval = Flex การ์ดเดียวในกลุ่ม LINE** — หัวหน้า approve start/finish จากการ์ด ไม่ต้องเปิด workflow console
5. **default view ต่อบทบาท** — ช่าง = "งานของฉันวันนี้" (เลนตัวเอง); หัวหน้า = ภาพรวมบ้าน/Kanban; ลูกค้า = เฉพาะ curated
6. **ราคาหลังบ้าน:** ทุกข้อข้างบนย้ายภาระ inference/routing มาที่ back-end → group binding ต้องแน่น, subtask assignment ต้องชัด, การ match ต้องแม่น (ส่วนที่ต้องคิดรอบคอบที่สุดตามมติ owner)

## ความเสี่ยงหลัก (สืบทอด + เพิ่ม)

1. **Sync (D-6)** — ผิดแล้วแก้ยากสุด → Phase 0.3 prototype ก่อนเขียนจริง
2. **Storage cost (D-4)** — quota + lifecycle ตั้งแต่วันแรก
3. **Realtime ยังไม่เคยใช้ในเรโป (D-7)** — spike + load test ก่อนผูกกับ MVP
4. ~~Decision ข้อ 8 ค้าง~~ → ✅ ปิดแล้ว (ADR-034/035): v1 ลง DB เดิม convention C12 — DDL ใน D-2 พร้อมแปลงเป็น migration
5. **KANNA อยู่ในตลาดไทยแล้ว** (ยืนยันจากภายนอก 2026-07-05: 70,000+ บริษัท/100+ ประเทศ, ISO27001, รองรับภาษาไทย) — แข่งด้วย vertical integration + LINE ไม่ใช่ความกว้างฟีเจอร์
