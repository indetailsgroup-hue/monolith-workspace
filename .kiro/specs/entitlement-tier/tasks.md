# Implementation Plan — Entitlement & Multi-Tier SaaS

> Gate แรกคือการตัดสินใจ ไม่ใช่โค้ด — ห้ามข้าม Phase 0

## Phase 0: Owner Decision — ✅ ปิดแล้ว (5 ก.ค. 2026)

- [x] 0.1 ตัดสิน Req 10 → **แยก DB** — ADR-034 ใน `.kiro/steering/architecture-decisions.md`
- [x] ~~0.2 ถ้ารวม DB: mapping org↔site + C12~~ — ตกไปตามมติ 0.1 (แยก DB ใช้ draft ตรง ๆ)
- [ ] 0.3 ยืนยันราคา/ชื่อ tier กับ competitive research (OCC/PolyBoard/Mozaik) — ตอนนี้เป็น placeholder (ทำก่อนเปิดขาย ไม่ block Phase 1)

## Phase 1: Schema Landing

- [ ] 1.1 แปลง `schema-draft-v0.3.sql` เป็น migration จริงตามปลายทางจาก Phase 0 (แตกไฟล์ตาม convention: init → RLS → functions → triggers → seed)
- [ ] 1.2* รัน `tests-negative.sql` บน scratch DB — เขียวครบ Correctness Properties 1–5
- [ ] 1.3* pgTAP negative tests ใน `supabase/tests/` (แปลงจาก tests-negative)

## Phase 2: Billing Integration

- [ ] 2.1 Stripe (หรือ manual) webhook Edge Function — service role อัปเดต `subscriptions` (status/plan/period)
- [ ] 2.2 Reset `usage_counters` ต้นรอบบิล + เทสต์ grace 7 วัน / fallback free
- [ ] 2.3 JWT `org_id` claim ผ่าน custom access-token hook (ผู้ใช้หลาย org)

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
