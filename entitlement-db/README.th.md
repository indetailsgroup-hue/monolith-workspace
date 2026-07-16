# MONOLITH Entitlement DB — Schema Landing (Phase 1)

> **แยกจาก DB ภายในโดยสิ้นเชิงตาม ADR-034** — DB ปัจจุบันของ repo (`supabase/` ที่ root)
> เป็น internal ops ของ DAPH บริษัทเดียว (C12, site_code, ไม่มีตาราง tenancy)
> ส่วน entitlement/SaaS เป็นลูกค้าภายนอกหลายองค์กร (`organizations` + RLS)
> → เมื่อเปิดขายจริงให้สร้าง**โปรเจกต์ Supabase ใหม่**แล้ว apply migration chain ในโฟลเดอร์นี้
> (การ deploy เป็นงาน human-driven เท่านั้น — ADR-066)

## โครงสร้าง

```
entitlement-db/
├── supabase/
│   ├── config.toml                      # โปรเจกต์แยก (monolith-entitlement) — CI harness
│   └── migrations/                      # แตกจาก schema-draft-v0.3.sql (SSOT) แบบ byte-faithful
│       ├── 20260716000001_entitlement_init.sql       # extensions + tenancy + billing core + domain
│       ├── 20260716000002_entitlement_functions.sql  # resolver 9 ตัว (SECURITY DEFINER + assert_org_access)
│       ├── 20260716000003_entitlement_rls.sql        # RLS 11 ตาราง (ต้องมาหลัง functions — policies เรียก is_member())
│       ├── 20260716000004_entitlement_triggers.sql   # stock-quota triggers (projects/machines/seats)
│       └── 20260716000005_entitlement_seed.sql       # 4 plans · 53 features · 212 mapping rows
├── tests/
│   ├── tests-negative.sql               # Phase 1.2 — behavior properties P1–P5 + P1b (psql, rollback)
│   └── entitlement_invariants.sql       # Phase 1.3 — pgTAP 35 assertions (structural + behavior)
└── README.th.md
```

## กติกา SSOT

- **`.kiro/specs/entitlement-tier/schema-draft-v0.3.sql` = SSOT ของ DDL** — migration ในนี้คือ
  การแตกไฟล์แบบ byte-faithful (ตรวจ SHA ต่อ section ตอน landing) **ห้ามแก้ migration ตรง ๆ**
  ให้แก้ที่ spec ก่อนแล้วค่อย re-split
- `schema-draft-v0.4-delta.sql` (Site PM 8 features, 53→61) **ยังเป็น proposal รอ owner review**
  — ยังไม่ landing จนกว่าจะอนุมัติ
- Tier matrix ใน DB คือ SSOT ของ pricing เมื่อระบบวิ่งจริง (design D-1) — sync เอกสาร HTML
  ทุกครั้งที่ matrix เปลี่ยน (tasks Phase 5.3)
- ราคาใน seed (`plans.price_cents`) เป็น **placeholder** จนกว่า task 0.3 (ยืนยันราคากับ
  competitive research) จะปิด — ห้ามใช้ขายจริง

## รันเทสต์ (CI = เส้นทางหลัก)

CI workflow `.github/workflows/entitlement-db-verify.yml` จะ:
1. `supabase start` ใน `entitlement-db/` (ephemeral container — **ไม่ใช่** hosted/prod,
   ADR-066 จึงไม่ apply — precedent เดียวกับ `db-verify.yml`)
2. รัน `tests/tests-negative.sql` (ต้องเห็น `PASS P1/P2/P3/P4/P5/P1b` ครบ ไม่มี exception)
3. รัน `tests/entitlement_invariants.sql` (pgTAP 35 assertions — TAP ต้องไม่มี `not ok`)

รันเองในเครื่อง (ต้องมี Docker + Supabase CLI):

```bash
cd entitlement-db
supabase start          # apply migration chain
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/tests-negative.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -v ON_ERROR_STOP=1 -f tests/entitlement_invariants.sql
```

## สถานะ Phase (จาก `.kiro/specs/entitlement-tier/tasks.md`)

- Phase 0 ✅ (ADR-034: แยก DB) — 0.3 ราคา = ก่อนเปิดขาย ไม่ block
- **Phase 1 = โฟลเดอร์นี้** (1.1 migrations ✓ · 1.2 negative tests ✓ · 1.3 pgTAP ✓ — หลักฐาน = CI run)
- Phase 2–5 (billing/app layer/enforcement/release process) ยังไม่เริ่ม
- Known gap: concurrency variant ของ Property 2 (สอง connection แข่งกัน) ต้อง harness แยก —
  ยังไม่ครอบใน CI นี้ (ระบุใน tests-negative.sql ท้ายไฟล์)
