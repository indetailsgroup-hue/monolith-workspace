# Requirements Document

## Introduction

เอกสารนี้กำหนด requirements ของโมดูล **Entitlement & Multi-Tier SaaS** — ระบบ plan/tier (Free/Plus/Advance/Enterprise) + entitlement resolution + quota enforcement สำหรับ MONOLITH ในรูปแบบ SaaS (แนว OneClickCabinet freemium ladder) — multi-tenant (org-based) บน Supabase/Postgres

**สถานะ:** design-stage — DDL draft ผ่าน security review 2 รอบแล้ว (v0.1→v0.2 ปิด S1–S4/L5–L9, v0.2→v0.3 เพิ่มธง roadmap) — **ยังไม่ deploy** รอ owner decision ข้อ C12 (Req 10)

**Working artifacts (ทั้งหมดอยู่ในโฟลเดอร์ spec นี้):** `schema-draft-v0.3.sql` (DDL — SSOT ของ schema) · `tests-negative.sql` (negative tests) · `schema-design-v0.3.md/.html` (design rationale + changelog) · `tier-matrix-v0.3.html` (ตาราง 53 features interactive) · `entitlement-tier-spec.html` (spec bundle) · `research-oneclickcabinet-v4.1.md` (competitive research ต้นทางของ freemium ladder) — สำเนาประวัติ v0.1/v0.2 อยู่ที่ `one clik/` นอก repo

**Reuse-not-fork (เงื่อนไข):** ถ้าคำตอบ Req 10 คือ "รวม DB" ต้อง map `organizations ↔ sites` และใช้ C12 pattern (`resolve_actor`, `has_site_access`) — ห้ามมี identity สองระบบใน DB เดียว

## Glossary

- **Plan**: bundle ที่ลูกค้าซื้อ (`free`/`plus`/`advance`/`enterprise`)
- **Entitlement**: สิทธิ์ที่ resolve ได้จริง = override รายองค์กร > plan default > deny
- **Gate 4 แบบ**: `boolean` · `stock_quota` (นับของจริง) · `metered_quota` (นับต่อรอบบิล) · `limit_param` (เพดานต่อการทำงานครั้งเดียว)
- **Feature Status**: `implemented` (มีหลักฐานในโค้ด) | `roadmap` (ยังไม่มีจริง — ห้ามขาย)
- **Effective Plan**: plan ที่มีผลจริงหลังคิดสถานะ subscription (grace/fallback free)
- **Beta Override**: `entitlement_overrides` ที่ปลด feature roadmap ให้ pilot org (`reason='beta'`)

## Requirements

### Requirement 1: Tenancy + RLS ทุกตาราง

1. THE ทุกตารางที่มีข้อมูลผู้ใช้/องค์กร SHALL เปิด RLS (รวม `profiles`) — fail-closed
2. THE domain rows SHALL ผูก `org_id` และ CRUD ได้เฉพาะสมาชิก org
3. THE `profiles` SHALL ให้เจ้าของจัดการของตัวเอง และเพื่อนร่วม org อ่านชื่อกันได้เท่านั้น

### Requirement 2: แยก Plan ออกจาก Entitlement

1. THE tier matrix SHALL เก็บใน `plan_entitlements` (data-driven) — ห้าม hardcode tier ในโค้ด
2. THE `entitlement_overrides` SHALL ทับ plan ได้ต่อ (org, feature) พร้อม `expires_at` — ใช้ทำ grandfathering/ดีลพิเศษ/beta

### Requirement 3: Gate 4 แบบ

1. THE ระบบ SHALL รองรับ gate: boolean / stock_quota / metered_quota / limit_param ตาม `features.kind`
2. THE `assert_feature` SHALL ใช้ได้เฉพาะ boolean — kind อื่นโยน `wrong_gate_kind`
3. THE stock quota SHALL enforce ที่ DB trigger (projects / machine_profiles / memberships-seats) แบบ atomic
4. THE metered `consume()` SHALL atomic (advisory lock ต่อ org+feature) — สอง request พร้อมกันทะลุ limit ไม่ได้

### Requirement 4: Security Boundary (สืบทอดจาก review v0.2)

1. THE SECURITY DEFINER functions ทุกตัว SHALL เรียก `assert_org_access(p_org)` — ผู้ใช้นอก org ได้ `org_access_denied` (service role ผ่าน)
2. THE `current_org()` fallback SHALL deterministic (order by created_at, org_id)

### Requirement 5: Effective Plan + Fallback Free

1. WHEN subscription เป็น active/trialing THE ระบบ SHALL ใช้ plan นั้น
2. WHEN past_due ภายใน grace 7 วันหลัง period_end THE ระบบ SHALL คงใช้ plan เดิม
3. WHEN เกิน grace / canceled / paused / ไม่มี subscription THE ระบบ SHALL ตกเป็น plan `free` — ของฟรีต้องไม่หาย (ห้ามล็อกลูกค้าทั้งระบบ)

### Requirement 6: Feature Status + Roadmap Hard-Block

1. THE `features.status` SHALL เป็น source of truth เดียวของความพร้อม (implemented/roadmap)
2. WHEN status = 'roadmap' THE resolver SHALL คืน false/0 **ไม่ว่า plan จะ map ไว้อย่างไร**
3. THE `entitlement_overrides` SHALL เป็นช่องเดียวที่ปลด roadmap ได้ (beta program)
4. THE `assert_feature` กับ roadmap SHALL โยน error แยก `feature_roadmap` (UI ขึ้น "coming soon" ไม่ใช่ "upgrade")
5. THE การพลิก roadmap→implemented SHALL ผูกกับ release checklist ของฟีเจอร์นั้น (ไม่พลิกก่อน ship)

### Requirement 7: บังคับ 3 ชั้น

1. UI: gate จาก entitlement bundle (รวม `status` เพื่อ render 3 สถานะ: enabled/locked/coming-soon)
2. API/Edge Function: `assert_feature`/`consume`/`feature_limit` ก่อน mutation ทุกครั้ง
3. DB: RLS + triggers เป็นด่านสุดท้าย — ห้ามเชื่อ UI

### Requirement 8: Pricing Page สาธารณะ

1. THE anon SHALL อ่าน `plans` (เฉพาะ `is_public`), `features`, `plan_entitlements` (เฉพาะ plan สาธารณะ) ได้
2. THE Enterprise plan SHALL `is_public=false`

### Requirement 9: Negative Tests (บังคับก่อน deploy)

1. THE test suite SHALL ยืนยัน: ข้าม org อ่าน/เขียนไม่ได้ · `consume` ข้าม org ได้ `org_access_denied` · insert เกิน quota ถูก block ทุก trigger · roadmap ถูก block แม้ plan map · beta override ปลด roadmap ได้ · past_due เกิน grace ตกเป็น free · anon เห็นเฉพาะ plan สาธารณะ (ดู `tests-negative.sql`)

### Requirement 10: Owner Decision — สถาปัตยกรรม DB (blocking)

1. Owner SHALL ตัดสิน: (ก) SaaS **แยก DB** (โปรเจกต์ Supabase ใหม่) หรือ (ข) **รวม DB** กับ line-oa/workflow — ถ้า (ข) ต้อง map org↔site + ใช้ C12 + ปรับ RLS ให้เข้า convention (`TO authenticated` + `resolve_actor`)
2. ห้าม deploy DDL จนกว่าจะตัดสิน — บันทึกผลเป็น ADR

## Correctness Properties (สำหรับ test)

1. Cross-org isolation: ∀ user, org ที่ไม่เป็นสมาชิก → SELECT/INSERT/RPC ล้มเหลวทุกทาง
2. Quota atomicity: N concurrent inserts/consumes → ไม่มีทางเกิน limit
3. Roadmap block: status='roadmap' → has_feature=false ∀ plan (ยกเว้น override)
4. Fallback monotone: sub หมดสภาพ → entitlement เท่ากับ plan free เป๊ะ (ไม่มากไม่น้อยกว่า)
5. Seed completeness: ∀ (plan × feature) มี mapping row (53×4) — ไม่มี default-deny หลุดกับ feature ที่ตั้งใจให้
