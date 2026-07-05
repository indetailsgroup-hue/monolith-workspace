# MONOLITH — Entitlement/Tier Matrix + Supabase Multi-Tier Schema
### Design Proposal v0.3 · 5 ก.ค. 2026
*อัปเดตจาก v0.2 — เพิ่มชั้น Trust/Tool-Wear/CO2/STEP + ระบบธง `implemented`/`roadmap` ที่ DB บังคับจริง — DDL ฉบับเต็ม: `MONOLITH-schema-multitier-v0.3.sql` (source of truth เดียว)*

> **สถานะ:** design proposal — คำถาม owner (C12: แยก DB / รวม DB) ยังเปิดอยู่
> **Spec ใน repo:** `.kiro/specs/entitlement-tier/` (requirements/design/tasks — สร้างพร้อม v0.3)

---

## Changelog v0.2 → v0.3

| Tag | การเปลี่ยนแปลง |
|-----|----------------|
| **F1** | เพิ่ม `features.status` enum (`implemented` \| `roadmap`) — ธงความพร้อมจริงของ capability เก็บที่ DB เป็น source of truth เดียว (UI/pricing ดึงไปแสดง "coming soon" เอง) |
| **F2** | **Roadmap hard-block ที่ resolver**: `has_feature`/`feature_limit` คืน false/0 สำหรับ feature ที่ `status='roadmap'` **ไม่ว่า plan จะ map ไว้อย่างไร** — ปลดได้ทางเดียวคือ `entitlement_overrides` รายองค์กร (= ช่องทาง **beta program** ใส่ `reason='beta'`) · `assert_feature` โยน error แยก `feature_roadmap` (ให้ UI ขึ้น "coming soon" ไม่ใช่ "upgrade") |
| **F3** | Seed ขยาย **42 → 53 features** (212 entitlement rows): เพิ่มหมวด **Trust** (`trust.signed_export`, `trust.audit_chain`), `cam.tool_wear`, `report.co2`, `export.step`, `export.pdf_report`, `export.cutlist_dialects`, `design.clearance_check`, `design.multi_cabinet`, `nest.optimizer_pro`, `hardware.engine_packs` |
| **F4** | **จัดสถานะซื่อตรงตามหลักฐานในโค้ด MONOLITH**: implemented 34 · roadmap 19 — ไม่ใช่แค่ 2 ตัวใหม่ แต่รวมของเดิมที่ matrix ขายไว้แต่โค้ดยังไม่มี (ดูตารางด้านล่าง) |

---

## 1. ธง Roadmap — รายการ 19 ตัว (ตามหลักฐาน ณ 2026-07-05)

| กลุ่ม | feature_key | เหตุผลที่เป็น roadmap |
|-------|-------------|----------------------|
| Label | `label.basic`, `label.advance`, `label.no_watermark` | ยังไม่พบระบบ label/barcode ในโค้ด |
| Cloud | `storage.cloud_enabled`, `storage.cloud_mb` | โค้ดจริงเป็น localStorage/local-first; Yjs cloud sync = design doc |
| Nesting | `nest.advance` (true-shape/NFP), `nest.offcut_inventory`, `nest.optimizer_pro` (SA/GA) | โค้ดมีเฉพาะ FFDH rectangular |
| CAM | `cam.dogbone`, `cam.kerf_bending`, `export.six_side_drill` | dogbone ไม่พบ; kerf = spec พร้อมแต่ Phase 0 ยังไม่เริ่ม; six-side ยังไม่ verify |
| Hardware | `hardware.engine_packs`, `design.custom_hardware_lib` | engines 23 ตอน = design library; org-scoped lib ต้องมี tenancy ก่อน |
| SaaS/ทีม | `platform.seats` | multi-user org ยังไม่มี |
| Integration | `ai.design_assist`, `integration.erp`, `integration.api`, `platform.sso`, `platform.self_host` | ยังไม่มีทั้งกลุ่ม |

**Implemented เด่นที่เพิ่งเข้า matrix:** `trust.signed_export` + `trust.audit_chain` (Ed25519 receipt + `monolith-verify` offline + merkle — ของแพงสุดที่ไม่เคยอยู่ใน matrix), `cam.tool_wear` (D6), `report.co2`, `export.step`/`pdf_report`/`cutlist_dialects` (server exporters), `design.clearance_check` (swing/pull envelopes), `design.multi_cabinet` (snap)

**การพลิกธง:** feature ship จริง → `update features set status='implemented' where key=...` → plan ที่ map ไว้ปลดเองอัตโนมัติ ไม่ต้องแตะ matrix (ผูกกับ release process — ดู tasks ใน spec)

---

## 2. Tier Matrix (53 features)

ดูตาราง interactive พร้อม badge `roadmap`: **`MONOLITH-Tier-Matrix-v0.3.html`** (ค่า tier ของ 42 ตัวเดิมคงเดิมทั้งหมด; 11 ตัวใหม่ตามตารางใน §1 ของ v0.3 review)

สาระใหม่ต่อ tier: **Advance** ได้เพิ่ม trust.signed_export, tool_wear, STEP, cutlist dialects, (อนาคต: optimizer_pro, engine_packs, kerf, six-side) · **Plus** ได้เพิ่ม pdf_report, co2, clearance_check, multi_cabinet · **Enterprise** ได้ trust.audit_chain เพิ่มจากชุด SSO/self-host/API เดิม

---

## 3. Gating Mechanics (4 แบบ — เท่า v0.2) + ชั้น status

ลำดับ resolve ต่อ feature:
```
1. unknown feature                      → deny (false/0)
2. entitlement_overrides (ยังไม่หมดอายุ) → ชนะเสมอ (ช่อง beta ปลด roadmap ได้)
3. status = 'roadmap'                   → deny (plan ไม่มีผล)   ← ใหม่ [F2]
4. plan_entitlements ของ effective_plan → ตามค่า
5. ไม่มี mapping                        → deny
```
`effective_plan()`: active/trialing → plan · past_due grace 7 วัน · อื่น → `free` (เท่า v0.2)

**Error contract ฝั่ง app (เพิ่ม 1 ตัว):** `org_access_denied` · `not_entitled` · **`feature_roadmap` (→ แสดง "coming soon")** · `wrong_gate_kind` · `quota_exceeded` · `unknown_feature`

---

## 4. โครง Schema — จุดต่างจาก v0.2 มีที่เดียว

- `features` + คอลัมน์ `status public.feature_status not null default 'implemented'`
- `has_feature` / `feature_limit` / `assert_feature` เพิ่ม logic ตาม §3
- ที่เหลือ (tenancy, RLS 11 ตาราง, triggers atomic 3 ตัว, advisory locks, anon pricing read) **เหมือน v0.2 ทุกประการ** — ดู DDL จริงในไฟล์ .sql

---

## 5. วิธีใช้จากฝั่ง App (เพิ่มจาก v0.2)

```sql
-- bundle ตอน login: ส่ง status ไปด้วยเพื่อ render "coming soon"
select f.key, f.kind, f.status,
       case when f.kind = 'boolean' then public.has_feature(:org, f.key) end as enabled,
       case when f.kind <> 'boolean' then public.feature_limit(:org, f.key) end as lim
from public.features f;
```
```ts
// UI 3 สถานะ: enabled | locked (upgrade) | coming-soon (roadmap)
const ui = (f) => f.status === 'roadmap' && !f.enabled ? 'coming-soon'
                : f.enabled ? 'enabled' : 'locked';
```
Beta program: `insert into entitlement_overrides(org_id, feature_key, bool_value, reason, expires_at) values (:org,'cam.kerf_bending',true,'beta','2026-12-31');`

---

## 6. Next Steps

1. ตอบ owner decision C12 (แยก/รวม DB) → กำหนดปลายทาง deploy
2. รัน `tests-negative.sql` (ในชุด `.kiro/specs/entitlement-tier/`) บน scratch DB — ยืนยัน RLS ข้าม org, quota block, roadmap block, grace/free fallback
3. Stripe sync Edge Function + reset counters ต้นรอบ
4. Byte-tracking สำหรับ `storage.cloud_mb` (เมื่อ cloud sync หลุด roadmap)
5. ผูก "พลิกธง status" เข้า release checklist ของทุกฟีเจอร์ใน §1

---

*ชุดไฟล์ v0.3: `.sql` (DDL — SSOT) · เอกสารนี้ · `MONOLITH-Tier-Matrix-v0.3.html` (interactive) · spec ใน repo `.kiro/specs/entitlement-tier/` — v0.1/v0.2 เก็บเป็นประวัติ*
