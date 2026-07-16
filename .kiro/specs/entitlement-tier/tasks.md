# Implementation Plan — Entitlement & Multi-Tier SaaS

> Gate แรกคือการตัดสินใจ ไม่ใช่โค้ด — ห้ามข้าม Phase 0

## Phase 0: Owner Decision — ✅ ปิดแล้ว (5 ก.ค. 2026)

- [x] 0.1 ตัดสิน Req 10 → **แยก DB** — ADR-034 ใน `.kiro/steering/architecture-decisions.md`
- [x] ~~0.2 ถ้ารวม DB: mapping org↔site + C12~~ — ตกไปตามมติ 0.1 (แยก DB ใช้ draft ตรง ๆ)
- [ ] 0.3 ยืนยันราคา/ชื่อ tier กับ competitive research (OCC/PolyBoard/Mozaik) — ตอนนี้เป็น placeholder (ทำก่อนเปิดขาย ไม่ block Phase 1)

## Phase 1: Schema Landing — ✅ ปิดแล้ว (16 ก.ค. 2026, CI run `29511060231`)

- [x] 1.1 แปลง `schema-draft-v0.3.sql` เป็น migration จริง → `entitlement-db/supabase/migrations/` (5 ไฟล์, แตกแบบ byte-faithful จาก SSOT; ลำดับ dependency-correct: init → **functions → RLS** → triggers → seed เพราะ policies เรียก `is_member()`) — DB แยกตาม ADR-034 จึงอยู่นอก `supabase/` ของ DB ภายใน
- [x] 1.2 รัน `tests-negative.sql` บน scratch DB (ephemeral Supabase ใน CI — ADR-066 ไม่ apply) — **เขียวครบ P1–P5 + P1b** · การรันจริงครั้งแรกจับบั๊ก 2 ตัวใน draft ที่ไม่เคยถูกรัน: **[L10]** `platform.seats` เป็น roadmap → limit 0 → membership แรกสร้างไม่ได้เลย (org bootstrap ตาย) แก้โดย floor limit ที่ 1 ใน `enforce_seat_quota`; **[L11]** ไม่มี explicit grants → authenticated/anon โดน permission denied ระดับตาราง แก้ตาม convention (grant กว้าง + RLS คุมแถว) — ทั้งคู่แก้ที่ SSOT (v0.3.1) แล้ว re-split
- [x] 1.3 pgTAP negative tests → `entitlement-db/tests/entitlement_invariants.sql` (36 assertions: structural 19 + behavior 17 รวมเทสต์ L10) — อยู่ในโฟลเดอร์ DB แยก ไม่ใช่ `supabase/tests/` ของ DB ภายใน ตาม ADR-034 · CI: `.github/workflows/entitlement-db-verify.yml` (กัน vacuous green: บังคับ 5 migrations + PASS ครบ 6 blocks + pgTAP = 36 เป๊ะ)
- [ ] 1.4 (follow-up จาก known gap) concurrency harness ของ Property 2 — สอง connection แข่ง consume/insert พร้อมกัน (ทำไม่ได้ใน transaction เดียวของ pgTAP)

## Phase 2: Billing Integration — ✅ ปิดแล้ว (16 ก.ค. 2026, CI run `29513311558`)

- [x] 2.1 webhook Edge Function → `entitlement-db/supabase/functions/billing-webhook/` (thin transport + DI ตาม pattern edge-fn-verify) — **สองโหมด**: `stripe` (verify `stripe-signature` t/v1 HMAC-SHA256 + tolerance 5 นาที + constant-time compare; map subscription created/updated/deleted + invoice.paid; **org_id/plan_code ต้องมากับ subscription metadata — ไม่มี = 422 ไม่เขียน**) และ `manual` (Bearer secret + JSON contract ตรง — เส้นทางไม่ใช้ Stripe ตามที่ task เปิดไว้) · เขียน DB ผ่าน RPC service-role-only เท่านั้น (SSOT v0.3.2 [F6]: `billing_apply_subscription` idempotent upsert + `assert_service_role`) · vitest 18 เคส
- [x] 2.2 `billing_reset_usage()` (service-only, ลบเฉพาะ period ปัจจุบัน คืนจำนวนแถว — เก็บ history) เรียกจาก `invoice.paid` / `reset_usage:true` + pgTAP grace: past_due ใน 7 วันคง plan / เกิน 7 วันตกเป็น free / canceled ตกเป็น free ทันที · **design note รอ owner**: metering ยังเป็น calendar-month ตาม v0.3 (`consume` ใช้ YYYY-MM) — ถ้าต้องการ anchor ตามรอบบิลจริงต้องแก้ semantic ของ consume ด้วย
- [x] 2.3 `profiles.active_org_id` + `set_active_org()` (member-only) + `custom_access_token_hook()` (SSOT v0.3.2 [F5]) — GoTrue inject `claims.org_id`: active org (ถ้ายังเป็นสมาชิก) > membership แรก (deterministic เดียวกับ `current_org()` fallback) > ไม่ใส่ claim · execute เฉพาะ `supabase_auth_admin` (revoke หลัง blanket grant L11) · ลงทะเบียนใน `config.toml` แล้ว · `current_org()` อ่าน claim นี้อยู่แล้ว
- หลักฐานรวม: `tests/billing_invariants.sql` pgTAP **18/18** + vitest **18/18** + suite เดิม 36/36 + PASS 6 blocks — ทั้งหมดเขียวใน run เดียว

## Phase 3: App Layer

- [ ] 3.1 Entitlement bundle ตอน login (query §5 ของเอกสาร v0.3) + Zustand store + UI 3 สถานะ (enabled/locked/coming-soon)
- [ ] 3.2 ครอบ gate ทุก mutation จุดที่ขายเป็น tier (ตาราง 53 features → mapping ไปยัง action ในแอป)
- [ ] 3.3 หน้า pricing สาธารณะจาก anon read (plan สาธารณะเท่านั้น)
- [ ] 3.4 Error handling ตาม contract (org_access_denied / feature_roadmap / quota_exceeded ...)

## Phase 4: Enforcement ที่ยังขาด

- [ ] 4.1 `storage_usage(org_id, bytes)` + Storage hooks + เช็คใน upload function (เมื่อ cloud sync หลุด roadmap)
- [ ] 4.2 `platform.cabinets_per_project` enforce ใน app layer (นับใน projects.data)

## Phase 5: Release Process ผูกธง status

- [ ] 5.1 เพิ่มข้อ "พลิก `features.status` → implemented" เข้า release checklist ของทุกฟีเจอร์ roadmap ทั้ง 19 ตัว
- [ ] 5.2 Beta program runbook: ปลดด้วย `entitlement_overrides` (`reason='beta'`, มี `expires_at` เสมอ)
- [ ] 5.3 Sync Tier-Matrix HTML/เอกสารทุกครั้งที่ matrix ใน DB เปลี่ยน (กติกา: DB คือ SSOT)

## Deferred

- Multi-currency plans, annual billing, usage-based pricing ต่อ feature อื่น, partner/reseller tiers
