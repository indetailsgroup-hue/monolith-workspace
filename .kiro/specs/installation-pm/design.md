# Design Document — Installation PM

> สถานะ: design proposal — รอ owner decisions (requirements Req 12) ก่อน implement
> อ่านคู่กับ `requirements.md` — เลข D-x อ้างถึงการตัดสินใจเชิงออกแบบในเอกสารนี้

## D-1: Naming — เลี่ยงคำ `site`

ใน C12 `site` = ขอบเขต tenant (`has_site_access`) ถ้าตั้ง `site_projects` จะสับสนใน RLS policy ทันที → ใช้ **`installation_projects`** และ prefix `installation_*`/`field_*` ทั้งชุด (feature keys ใน entitlement ใช้ `sitepm.*` ได้เพราะเป็น namespace การขาย ไม่ใช่ชื่อตาราง)

## D-2: Data Model (org-scoped + RLS ทุกตาราง — convention C12)

```
tenants (ตาม decision PRD §11 ข้อ 8: organizations ใหม่ หรือ sites เดิมของ C12)
  ─1:*─ installation_projects ─┬─1:*─ installation_tasks      (assignee, due, status, progress_pct)
                               ├─1:*─ installation_photos     (storage_path, thumb_path, meta, panel_ref?)
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

## D-6: Offline Sync Protocol (ล็อกก่อนเขียน mobile — Req 8.1)

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

## D-8: Entitlement Integration

- Delta v0.4: +8 features หมวด `site_pm` — **roadmap ทั้งหมด** — ดู `../entitlement-tier/schema-draft-v0.4-delta.sql` (53→61 features, seed 244 rows)
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

## ความเสี่ยงหลัก (สืบทอด + เพิ่ม)

1. **Sync (D-6)** — ผิดแล้วแก้ยากสุด → Phase 0.3 prototype ก่อนเขียนจริง
2. **Storage cost (D-4)** — quota + lifecycle ตั้งแต่วันแรก
3. **Realtime ยังไม่เคยใช้ในเรโป (D-7)** — spike + load test ก่อนผูกกับ MVP
4. **Decision ข้อ 8 ค้าง** — schema นี้เขียนลง DB ไหนยังไม่รู้ → ทุก DDL ในเอกสารนี้เป็น draft จนกว่า ADR ออก
5. **KANNA อยู่ในตลาดไทยแล้ว** (ยืนยันจากภายนอก 2026-07-05: 70,000+ บริษัท/100+ ประเทศ, ISO27001, รองรับภาษาไทย) — แข่งด้วย vertical integration + LINE ไม่ใช่ความกว้างฟีเจอร์
