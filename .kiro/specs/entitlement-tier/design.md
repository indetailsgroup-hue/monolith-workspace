# Design Document — Entitlement & Multi-Tier SaaS

## Overview

Freemium ladder 4 tiers × 53 features (implemented 34 / roadmap 19) — plan แยกจาก entitlement, gate 4 แบบ, บังคับ 3 ชั้น, DB เป็นด่านสุดท้าย — DDL จริงทั้งหมดอยู่ `schema-draft-v0.3.sql` (SSOT, รันได้เลยบน scratch DB)

```
UI (bundle + status → enabled/locked/coming-soon)
  → Edge Function (assert_feature / consume / feature_limit)
    → DB: RLS (11 ตาราง) + triggers (projects/machines/seats) + advisory locks
Resolution: override(≤expiry) > [roadmap→deny] > plan_entitlements(effective_plan) > deny
effective_plan: active/trialing → plan · past_due grace 7d · else 'free'
```

## Architecture Decisions

| # | ตัดสินใจ | เหตุผล |
|---|----------|--------|
| D-1 | Matrix เก็บใน DB (`plan_entitlements`) ไม่ hardcode | ปรับ pricing/tier ไม่ต้อง deploy |
| D-2 | `limit_value = null` = ∞ (resolver คืน −1); ไม่มี row = deny (0/false) | fail-safe default-deny → **seed ต้องครบทุกช่อง 53×4** (บทเรียน v0.1 ที่ Free พังเพราะ seed 21/42) |
| D-3 | ไม่มี/หมดสภาพ subscription → fallback plan `free` + past_due grace 7 วัน | บัตรตัดไม่ผ่านต้องไม่ล็อกทั้งระบบ (บทเรียน review L5) |
| D-4 | `features.status` roadmap = hard-block ที่ resolver, ปลดได้เฉพาะ override (beta) | กันขายของที่ยังไม่มีด้วยกลไก ไม่ใช่ด้วยวินัย |
| D-5 | SECURITY DEFINER ทุกตัวขึ้นต้นด้วย `assert_org_access` | ปิด cross-org quota burn/entitlement leak (บทเรียน S2) |
| D-6 | ทุก check-then-write ใช้ `pg_advisory_xact_lock(hash(org|feature))` | ปิด TOCTOU (บทเรียน S3) |
| D-7 | `nest.max_sheets`, `platform.cabinets_per_project` = `limit_param` ไม่ใช่ quota | เป็นเพดานต่อครั้ง ไม่ใช่การนับสะสม (บทเรียน L8) |
| D-8 | anon อ่าน catalog เฉพาะ plan สาธารณะ; Enterprise `is_public=false` | pricing page ทำงานได้โดยไม่ leak ดีลพิเศษ |
| D-9 | **Open**: แยก DB vs รวม DB กับ C12 (Req 10) — จนกว่าจะตัดสิน spec นี้เป็น design-stage เท่านั้น | ถ้ารวม: org↔site mapping + RLS convention เดิมของ repo |

## สถานะ Feature 53 ตัว (สรุป — รายละเอียดในตาราง matrix v0.3)

- **implemented 34**: design core 6 (create/generator/divide_cell/door_drawer/clearance/multi_cabinet), fitting 3, edge 2, bom 3, nest.basic + max_sheets, cam.machine_origin/advance_machine/tool_wear, export 7 (gcode/dxf/p2p/panel_saw/step/pdf/cutlist_dialects), machine.profiles, platform.projects/cabinets_per_project/local_first, report.co2, **trust.signed_export/audit_chain**, support.priority
- **roadmap 19**: label×3, cloud×2, nest.advance/offcut/optimizer_pro, cam.dogbone/kerf_bending, export.six_side_drill, hardware.engine_packs, design.custom_hardware_lib, platform.seats, ai.design_assist, integration.erp/api, platform.sso/self_host

## Error Contract

`org_access_denied` (insufficient_privilege) · `not_entitled: <key>` · `feature_roadmap: <key>` (feature_not_supported → UI "coming soon") · `wrong_gate_kind` · `quota_exceeded: <key>` (check_violation) · `unknown_feature`

## ประวัติ Security Review

- **v0.1→v0.2 (2026-07-05):** S1 profiles ไม่มี RLS · S2 definer ไม่เช็คสมาชิก (cross-org quota burn) · S3 race consume/trigger · S4 current_org ไม่ deterministic · L5 ไม่มี fallback free · L6 seed ไม่ครบทำ Free พัง · L7 assert กับ quota เงียบ · L8 gate ชนิดผิด · L9 pricing anon
- **v0.2→v0.3:** F1 status column · F2 roadmap hard-block + beta override + error แยก · F3 seed 53 · F4 จัดสถานะซื่อตรง (roadmap 19 ไม่ใช่ 2)

## Test Strategy

`tests-negative.sql` (scratch DB, สองผู้ใช้สอง org) ครอบ Correctness Properties 1–5 ใน requirements — บังคับเขียวก่อน deploy; เมื่อรวมเข้า Supabase จริงให้แปลงเป็น pgTAP ใน `supabase/tests/` ตาม convention ของ repo
