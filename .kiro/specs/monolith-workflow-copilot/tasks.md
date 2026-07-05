# Implementation Plan: Workflow, Approvals & AI Copilot (Phase 1 + 1.5)

## Overview

แผนการสร้างนี้ครอบคลุม **Phase 1 + Phase 1.5 — Workflow & Copilot Engine** (กระดูกสันหลังกลาง: identity binding, handoff engine, resolver/escalation/delegation, one-click approval, notification engine, Copilot advisory, audit, access control, SLA, business continuity) + **ส่วนขยาย Req 19–21**: Action Type Registry & Autonomy Classification (Req 19), Customer as Approver (Req 20), Revision Discipline & Design Locks (Req 21) — **ไม่รวม** โมดูล ERP อนาคตในหัวข้อ "ERP Extension Points" ของ design และ **ไม่รวม** Req D anti-fraud (→ capture-spine, Phase 2)

> **Phasing:** core (Req 1–18) + Req 19 + Req 20 + capture failure-audit = **Phase 1**; Req 21 (revision discipline + design locks + re-quote state machine) = **Phase 1.5** (queue แยกได้). **D2 ตัวเลือก C:** Autonomy_Ladder_Tier ใช้ classify/label เท่านั้น — ไม่ build execute_autonomous_action/guardrail/escalation_record

แนวทางสร้างเป็นแบบ **incremental + test-driven** บนแพลตฟอร์ม Supabase/PostgreSQL:
- **SQL migrations** — ตาราง + RLS `TO authenticated` + SECURITY DEFINER RPC + audit immutability triggers (ใน `supabase/migrations/`)
- **Supabase Edge Functions** — Deno/TypeScript เป็นชั้นเดินสาย HTTP/cron บาง ๆ (ใน `supabase/functions/`)
- **Pure TypeScript logic** — ตรรกะแกนกลางที่ทดสอบได้ (ใน `src/workflow/`) เพื่อรัน property-based test แบบ deterministic

ทุกอย่าง self-contained ใน `determined-williams` และ **นำ primitive ของ `line-oa-commerce` กลับมาใช้** (C12 helpers `current_app_roles`/`has_any_app_role`/`has_site_access`/`is_governance_role`/`resolve_actor`, Vault, Postback_Data_Contract, Message_Templates, รูปแบบ audit append-only, D2 Autonomy Ladder) และ **บริโภค Knowledge_Export ของ `daph-obsidian-second-brain`** — พึ่งพา ไม่ implement ซ้ำ

การทดสอบ: **Vitest + fast-check** สำหรับ property test ของ pure logic (ทุก Correctness Property 1–42 → 1 property test, ≥ 100 iteration, ติด tag `// Feature: monolith-workflow-copilot, Property N: ...`), **pgTAP / DB-harness** สำหรับ property ระดับฐานข้อมูล (รวม registry CHECK ของ Req 19), และ unit/integration/smoke ตาม Testing Strategy งานทดสอบทั้งหมดเป็น sub-task ทางเลือก (`*`)

## Tasks

- [x] 1. Scaffold โครงสร้าง migrations + types/constants + config
  - [x] 1.1 สร้าง migration เริ่มต้น (extensions, enums, schema baseline)
    - สร้าง `supabase/migrations/0001_init.sql`: enum สำหรับ work_item status / decision / channel / notification status / approval_quorum, เปิด extension ที่จำเป็น (pgcrypto/uuid)
    - วาง convention การตั้งชื่อ migration และ header reuse ของ C12 helpers (อ้างอิงตามชื่อ ไม่ redefine)
    - _Requirements: 10.3, 11.10, 15.1_
  - [x] 1.2 สร้าง TS types + constants ของ canonical process model
    - สร้าง `src/workflow/domain/constants.ts` + `src/workflow/domain/types.ts`: ลำดับ canonical `Sale → Area Measurement → Designer → 3D_Presentation → Production Planning → 3D_Rendering_Final → Factory → Installation` (รองรับ index เริ่มที่ 0), ชุด Sub_Process_Group {Office, Factory, Installation}, ชุด Approval_Quorum {unanimous, majority, first_response}, Notification_Category ที่ mute ได้
    - _Requirements: 2.1, 11.3, 11.8, 11.10, 15.1, 6.5_
  - [x] 1.3 สร้างโมดูล config ที่ตั้งค่าได้ (ไม่ hard-code)
    - สร้าง `src/workflow/domain/config.ts`: `RPN_Threshold`, `Budget_Ceiling`, ค่า SLA (สำหรับ 50%/100%/timeout), freshness threshold, retry/backoff count — อ่านจาก config
    - _Requirements: 8.7, 13.1, 13.4, 17.2, 18.3_

- [ ] 2. Data layer: ตาราง + RLS + audit immutability
  - [x] 2.1 สร้าง migration ตารางหลัก + RLS `TO authenticated`
    - สร้าง `supabase/migrations/0002_tables_rls.sql`: `identity_binding` (partial unique `(line_user_id) WHERE is_active`), `work_item` (version counter, data jsonb), `process_model`, `approval_request`, `approval_decision` (unique `webhook_event_id`), `delegation`, `copilot_suggestion` (CHECK options 2–3), `notification`, `capture_item`, `knowledge_import` (is_valid/is_current สำหรับ last-good)
    - ทุกตารางเปิด RLS, มีเฉพาะ `SELECT` policy `USING (public.is_governance_role() OR public.has_site_access(site_code))`, **ไม่มี** client write policy; ตาราง site_code ใช้ `text NULL`
    - _Requirements: 1.2, 2.1, 10.1, 10.2, 10.3, 16.1, 4.7, 16.5, 5.9, 11.5_
  - [x] 2.2 สร้าง migration audit log + immutability trigger
    - สร้าง `supabase/migrations/0003_audit_immutability.sql`: `workflow_audit_log` (append-only), trigger `trg_workflow_audit_log_immutable` raise บน UPDATE/DELETE, `REVOKE UPDATE, DELETE` จากทุก role
    - _Requirements: 9.1, 9.2_
  - [x] 2.3 สร้างโมดูล logic ประเมิน RLS predicate (pure)
    - สร้าง `src/workflow/access/rls.ts`: ฟังก์ชันประเมินสิทธิ์การอ่านตาม Governance/Branch role + `has_site_access` (รวมเคส site_code = NULL → false) เพื่อใช้ทดสอบ predicate แบบ deterministic
    - _Requirements: 9.4, 10.1, 10.2_
  - [x]* 2.4 เขียน property test สำหรับการประเมิน RLS
    - **Property 21: การอ่านคืนเฉพาะแถวที่ผู้เรียกมีสิทธิ์ (RLS)**
    - **Validates: Requirements 9.4, 10.1, 10.2**
  - [x]* 2.5 เขียน property test สำหรับการปฏิเสธ mutation ที่ไม่มีสิทธิ์
    - **Property 22: การปฏิเสธ mutation ที่ไม่มีสิทธิ์**
    - **Validates: Requirements 10.5**
  - [x]* 2.6 เขียน smoke test โครงสร้างความปลอดภัย
    - ตรวจ RLS เปิด + `TO authenticated` reuse C12 helpers, ไม่มี client write policy, RPC เป็น SECURITY DEFINER + เรียก `public.resolve_actor()`, audit append-only + trigger ปฏิเสธ UPDATE/DELETE
    - _Requirements: 4.2, 9.2, 10.3, 10.4_

- [ ] 3. Knowledge import (read-only, last-good)
  - [x] 3.1 สร้างโมดูล validate schema + last-good (pure)
    - สร้าง `src/workflow/knowledge/import.ts`: validate โครงสร้าง Knowledge_Export (PFMEA_Risk_Row, process model + canonical order เริ่มที่ 0, RACI_Map, Approval_Quorum/step, Knowledge_Freshness); invalid → ปฏิเสธและคง last-good
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8, 11.9, 11.10_
  - [x] 3.2 สร้าง `rpc_import_knowledge` SECURITY DEFINER
    - สร้าง `supabase/migrations/0010_rpc_import_knowledge.sql`: read-only import, บันทึก source_version/imported_at/review_status/quorum, set is_current เฉพาะ export ที่ valid, ไม่ write-back Obsidian, audit การ import
    - _Requirements: 11.5, 11.6, 11.7, 11.9, 11.10_
  - [x]* 3.3 เขียน property test สำหรับความถูกต้องของ import + last-good
    - **Property 23: ความถูกต้องของการนำเข้า Knowledge_Export และการคง last-good**
    - **Validates: Requirements 11.5, 11.8**
  - [x]* 3.4 เขียน schema-shape validation test ของ Knowledge_Export
    - ตรวจ PFMEA_Risk_Row / process model / RACI_Map / Knowledge_Freshness / Approval_Quorum ครบรูปแบบ
    - _Requirements: 11.2, 11.3, 11.4, 11.9, 11.10, 15.1_

- [ ] 4. Identity binding (Req 1)
  - [x] 4.1 สร้างโมดูล logic identity binding (pure)
    - สร้าง `src/workflow/identity/binding.ts`: บังคับความไม่ซ้ำของ LINE_User_Id ต่อ binding ที่ active, resolve บทบาทผ่าน `current_app_roles()` (ไม่เก็บซ้ำ), ตรรกะ revoke-มีผลทันที (ไม่ส่ง direct push แม้ระเบียนยัง active)
    - _Requirements: 1.2, 1.3, 1.5_
  - [x] 4.2 สร้าง RPC create/revoke identity binding
    - สร้าง `supabase/migrations/0011_rpc_identity_binding.sql`: บันทึก binding + Department + (อ้าง) C12_Role, resolve ผู้กระทำผ่าน `resolve_actor()`, audit ทั้ง create/revoke
    - _Requirements: 1.1, 1.6_
  - [x]* 4.3 เขียน property test ความไม่ซ้ำของ binding ที่ active
    - **Property 1: ความไม่ซ้ำของ Identity_Binding ที่ active**
    - **Validates: Requirements 1.2**
  - [x]* 4.4 เขียน property test การเพิกถอน binding หยุด direct notification
    - **Property 3: การเพิกถอน binding หยุด direct notification ทันที**
    - **Validates: Requirements 1.5**
  - [ ]* 4.5 เขียน unit test การสร้าง Identity_Binding
    - ตรวจการบันทึก binding พร้อม Department/บทบาท
    - _Requirements: 1.1_

- [ ] 5. Handoff engine + concurrency (Req 2, 16, 12.1)
  - [x] 5.1 สร้างโมดูล logic บังคับลำดับ canonical (pure)
    - สร้าง `src/workflow/handoff/canonical.ts`: อนุญาต handoff เฉพาะขั้นถัดไปติดกัน + ต้องมีใน process model; มิฉะนั้น error invalid sequence / unknown step; กำหนดเจ้าของใหม่จาก RACI_Map; ตรวจ site_code ∈ active
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 2.7, 10.6_
  - [x] 5.2 สร้างโมดูล logic optimistic locking + atomic transition (pure)
    - สร้าง `src/workflow/handoff/locking.ts`: ตรรกะ compare version → fail เมื่อเปลี่ยนก่อน commit, transition แบบ all-or-nothing
    - _Requirements: 16.2, 16.3, 16.4_
  - [x] 5.3 สร้าง `rpc_create_work_item` SECURITY DEFINER
    - สร้าง `supabase/migrations/0012_rpc_create_work_item.sql`: ตรวจ site_code ∈ `get_active_site_codes()`, ตรวจ first_step ∈ process model, สร้างที่ step แรก version=0, audit
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 10.6_
  - [x] 5.4 สร้าง `rpc_handoff_work_item` SECURITY DEFINER
    - สร้าง `supabase/migrations/0013_rpc_handoff_work_item.sql`: optimistic lock บน expected_version, บังคับลำดับ canonical, กำหนดเจ้าของใหม่จาก RACI, increment version, audit handoff (ขั้นเดิม/ใหม่/ผู้กระทำผ่าน `resolve_actor()`) atomic
    - _Requirements: 2.3, 2.4, 2.5, 2.7, 16.1, 16.3, 16.4_
  - [x] 5.5 สร้างโมดูล logic capture-once-reuse (pure)
    - สร้าง `src/workflow/handoff/capture-reuse.ts`: นำ `work_item.data` ที่ป้อนแล้วกลับมาใช้ในขั้นถัดไปโดยไม่ขอซ้ำ
    - _Requirements: 12.1_
  - [x]* 5.6 เขียน property test การบังคับลำดับ canonical
    - **Property 4: การบังคับลำดับ canonical ของ Process_Step**
    - **Validates: Requirements 2.1, 2.3, 2.5, 2.7**
  - [x]* 5.7 เขียน property test Site_Code active เท่านั้น
    - **Property 5: Site_Code ยอมรับเมื่อ active เท่านั้น**
    - **Validates: Requirements 2.6, 10.6**
  - [x]* 5.8 เขียน property test optimistic locking + atomicity
    - **Property 29: Optimistic locking และ atomicity ของ state transition**
    - **Validates: Requirements 16.2, 16.3, 16.4**
  - [x]* 5.9 เขียน property test capture-once-reuse
    - **Property 24: Capture-once-reuse**
    - **Validates: Requirements 12.1**
  - [ ]* 5.10 เขียน unit test current step/owner
    - ตรวจการเก็บ current Process_Step + เจ้าของปัจจุบัน
    - _Requirements: 2.2_

- [x] 6. Checkpoint — ตรวจฐาน data layer + handoff
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Approver resolver + escalation + delegation routing (Req 3, 8, 14)
  - [x] 7.1 สร้างโมดูล logic หา Approver จาก RACI + C12 (pure)
    - สร้าง `src/workflow/resolver/approver.ts`: เซ็ต Approver = Accountable ใน RACI_Map ∩ `has_any_app_role()`; หลายคน → ครบทุกคน + ผูก quorum; ว่าง → fail-safe block + escalate executive_owner + audit; ใช้ RACI ฉบับล่าสุด
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 7.2 สร้างโมดูล logic เกณฑ์ escalation ตามความเสี่ยง/งบ (pure)
    - สร้าง `src/workflow/resolver/escalation.ts`: Design draft → หัวหน้า Designer เสมอ; Production release → executive_owner iff RPN > threshold หรือ budget > ceiling มิฉะนั้นหัวหน้า Production Planning; จัดซื้อเกินงบ → executive_owner ทันที; Installation → หัวหน้า Installation + แจ้ง Sale/PM; อ่าน threshold จาก config
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  - [x] 7.3 สร้างโมดูล logic delegation routing ตามช่วงเวลา (pure)
    - สร้าง `src/workflow/resolver/delegation-routing.ts`: ถ้าเวลาปัจจุบัน ∈ [start,end] ของ delegation ที่ valid → route ไป Acting_Approver มิฉะนั้นกลับ Approver เดิม
    - _Requirements: 14.4_
  - [x] 7.4 สร้าง `rpc_resolve_approver` SECURITY DEFINER
    - สร้าง `supabase/migrations/0014_rpc_resolve_approver.sql`: รวม resolver + escalation + delegation routing, สร้าง Approval_Request ครบทุกคน + บันทึก quorum จาก Knowledge_Export, audit escalation พร้อมเงื่อนไข/ค่า
    - _Requirements: 3.1, 3.3, 8.8, 15.5_
  - [x]* 7.5 เขียน property test การหา Approver + fail-safe escalation
    - **Property 6: การหา Approver จาก RACI + C12 และ fail-safe escalation**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  - [x]* 7.6 เขียน property test เกณฑ์ escalation ตามความเสี่ยง/งบประมาณ
    - **Property 17: เกณฑ์การยกระดับการอนุมัติตามความเสี่ยง/งบประมาณ**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
  - [ ]* 7.7 เขียน unit test RACI ฉบับล่าสุดถูกใช้กับ request ใหม่
    - _Requirements: 3.6_

- [ ] 8. Approval decision RPC + quorum (Req 4, 15, 16)
  - [x] 8.1 สร้างโมดูล logic รวมผล quorum (pure)
    - สร้าง `src/workflow/approval/quorum.ts`: unanimous/majority/first_response รวม fail-fast เมื่อ rejected; ผลล้มเหลว → rework path
    - _Requirements: 15.2, 15.3, 15.4, 15.6, 15.7, 15.8_
  - [x] 8.2 สร้างโมดูล logic anti-impersonation + authz re-check (pure)
    - สร้าง `src/workflow/approval/authz.ts`: ผู้ตัดสินผ่าน `resolve_actor()` (ไม่เชื่อ client id); ผู้กด ≠ Approver หรือ id ตรงแต่ authz อื่นไม่ผ่าน → reject + คง BLOCKED; ผลต่อ Work_Item (block→approved unblock/continue, rejected→rework)
    - _Requirements: 4.3, 4.4, 4.8, 4.9, 4.10, 4.11_
  - [x] 8.3 สร้างโมดูล logic idempotency (pure)
    - สร้าง `src/workflow/approval/idempotency.ts`: webhook_event_id ซ้ำ → คืนผลเดิม, ไม่ double-apply, retry หลังล้มเหลวสำเร็จได้อิสระ
    - _Requirements: 4.7, 16.5_
  - [x] 8.4 สร้าง `rpc_record_approval_decision` SECURITY DEFINER
    - สร้าง `supabase/migrations/0015_rpc_record_approval_decision.sql`: ถอด/ตรวจ Encrypted_Postback ภายใน RPC (ไม่รั่วความลับ), `ON CONFLICT (webhook_event_id) DO NOTHING`, optimistic lock บน version, รวม quorum, unblock/approve/rework, audit การตัดสิน (UTC)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 16.2, 16.4, 16.5_
  - [x]* 8.5 เขียน property test การกันการปลอมตัว + คงสถานะ blocked
    - **Property 7: การกันการปลอมตัวและการคงสถานะ blocked**
    - **Validates: Requirements 4.3, 4.4, 4.9**
  - [x]* 8.6 เขียน property test Encrypted_Postback ไม่ถูกต้องถูกปฏิเสธโดยไม่รั่วความลับ
    - **Property 8: Encrypted_Postback ที่ไม่ถูกต้องถูกปฏิเสธโดยไม่รั่วความลับ**
    - **Validates: Requirements 4.5**
  - [x]* 8.7 เขียน property test idempotency + retry อิสระ
    - **Property 9: Idempotency ของการอนุมัติและการ retry ที่อิสระ**
    - **Validates: Requirements 4.7, 16.5**
  - [x]* 8.8 เขียน property test ผลของ Approval_Decision ต่อ Work_Item
    - **Property 10: ผลของ Approval_Decision ต่อ Work_Item**
    - **Validates: Requirements 4.8, 4.10, 4.11**
  - [x]* 8.9 เขียน property test ความหมายการรวมผล Approval_Quorum
    - **Property 28: ความหมายการรวมผล Approval_Quorum (ผ่าน/ล้มเหลว)**
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.6, 15.7, 15.8**
  - [ ]* 8.10 เขียน unit test render LINE Flex ปุ่ม Encrypted_Postback
    - _Requirements: 4.1_

- [ ] 9. Delegation RPCs (Req 14)
  - [x] 9.1 สร้างโมดูล logic อนุญาตการมอบหมาย (pure)
    - สร้าง `src/workflow/delegation/authorize.ts`: อนุญาต iff Acting_Approver มี C12_Role เพียงพอตาม Process_Step (`has_any_app_role()`) มิฉะนั้น reject
    - _Requirements: 14.2, 14.3_
  - [x] 9.2 สร้าง `rpc_create_delegation` SECURITY DEFINER
    - สร้าง `supabase/migrations/0016_rpc_create_delegation.sql`: ตรวจสิทธิ์ Acting_Approver, บันทึก delegation + start/end, audit ผู้กระทำผ่าน `resolve_actor()`
    - _Requirements: 14.1, 14.2, 14.3, 14.5_
  - [x] 9.3 สร้าง `rpc_revoke_delegation` SECURITY DEFINER
    - สร้าง `supabase/migrations/0017_rpc_revoke_delegation.sql`: executive_owner เพิกถอน → Approval_Request ถัดไปกลับ Approver เดิม + audit
    - _Requirements: 14.5, 14.6_
  - [x]* 9.4 เขียน property test การมอบหมาย + routing ตามช่วงเวลา
    - **Property 27: การมอบหมายผ่านเมื่อบทบาทเพียงพอเท่านั้น และการ route ตามช่วงเวลา**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.6**

- [x] 10. Checkpoint — ตรวจ resolver/approval/delegation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Notification engine + suppression matrix + queue (Req 6, 1.4, 12.3)
  - [x] 11.1 สร้างโมดูล logic จัดเส้นทาง direct vs group (pure)
    - สร้าง `src/workflow/notification/routing.ts`: ความรับผิดชอบ/อนุมัติส่วนตัว → direct_push; handoff ข้ามทีม/FYI → group_message
    - _Requirements: 6.1, 6.2_
  - [x] 11.2 สร้างโมดูล logic suppression matrix (pure)
    - สร้าง `src/workflow/notification/suppression.ts`: mute เหนือสุดเสมอ (รวม Direct); Direct ข้ามเฉพาะ Quiet_Hours; non-Direct ใน Quiet_Hours → ระงับ + สะสม Daily_Digest; non-Direct ไม่ข้าม mute/quiet ทุกกรณี
    - _Requirements: 6.3, 6.5, 6.6, 6.9_
  - [x] 11.3 สร้างโมดูล logic ประกอบเทมเพลต + บังคับ ≤ 200 (pure)
    - สร้าง `src/workflow/notification/template.ts`: ประกอบจาก Message_Templates (ปฏิเสธ free-text), Direct เกิน 200 → queue ไม่ truncate; segment อื่นเกิน 200 → reject; ภาษาไทยน้ำเสียงอบอุ่น
    - _Requirements: 6.7, 6.8, 6.10, 12.2, 12.5, 12.6_
  - [x] 11.4 สร้างโมดูล logic ยกระดับเมื่อไม่มี binding active (pure)
    - สร้าง `src/workflow/notification/missing-binding.ts`: ไม่มี binding active ขณะส่ง → ยกระดับหัวหน้าแผนกที่มี binding ทันที + audit คู่ (original failure + escalation); ไม่ block/queue รอ setup
    - _Requirements: 1.4_
  - [x] 11.5 สร้างโมดูล logic celebrate completion (pure)
    - สร้าง `src/workflow/notification/celebrate.ts`: ส่งคำยินดีเฉพาะเมื่อจบ Process_Step สุดท้ายจริง (ไม่ใช่ปิด/ยกเลิกมือ); ยังส่งได้แม้มี error อื่นใน operation เดียวกัน
    - _Requirements: 12.3, 12.7_
  - [x] 11.6 สร้าง `rpc_dispatch_notification` SECURITY DEFINER
    - สร้าง `supabase/migrations/0018_rpc_dispatch_notification.sql`: รวม routing + suppression + template + missing-binding escalation, insert แถว `pending`/`queued` ใน notification queue
    - _Requirements: 1.4, 6.1, 6.2, 6.7, 6.8, 9.5_
  - [x]* 11.7 เขียน property test การจัดเส้นทางการแจ้งเตือน direct vs group
    - **Property 12: การจัดเส้นทางการแจ้งเตือน direct vs group**
    - **Validates: Requirements 6.1, 6.2**
  - [x]* 11.8 เขียน property test เมทริกซ์การระงับการแจ้งเตือน
    - **Property 13: เมทริกซ์การระงับการแจ้งเตือน (mute เหนือกว่า, Direct ข้ามเวลาเท่านั้น)**
    - **Validates: Requirements 6.3, 6.5, 6.6, 6.9**
  - [x]* 11.9 เขียน property test เนื้อหาผูกเทมเพลต ≤ 200 + queue ไม่ truncate
    - **Property 14: เนื้อหาผูกเทมเพลต ความยาว ≤ 200 และ queue ไม่ truncate**
    - **Validates: Requirements 6.7, 6.8, 6.10, 12.2, 12.5, 12.6**
  - [x]* 11.10 เขียน property test การยกระดับเมื่อไม่มี binding active
    - **Property 2: ไม่มี binding ที่ active ขณะต้องส่ง → ยกระดับทันทีพร้อม audit สองรายการ**
    - **Validates: Requirements 1.4**
  - [x]* 11.11 เขียน property test celebrate completion
    - **Property 25: การแสดงความยินดีเมื่อจบขั้นสุดท้ายเท่านั้น**
    - **Validates: Requirements 12.3, 12.7**
  - [ ]* 11.12 เขียน unit test การส่ง Daily_Digest รวม
    - _Requirements: 6.4_

- [x] 12. Notification retry worker logic + web fallback (Req 18) — **Phase 13 ปิดแล้ว (2026-07-06)**
  - [x] 12.1 สร้างโมดูล logic exponential backoff (pure)
    - สร้าง `src/workflow/notification/backoff.ts`: คำนวณ next_attempt_at เพิ่มขึ้นแบบ exponential, นับ retry, ครบจำนวน → Delivery_Failure คงไว้แม้ recover ภายหลัง
    - _Requirements: 18.1, 18.2, 18.3_
  - [x] 12.2 สร้าง `rpc_record_notification_result` SECURITY DEFINER
    - สร้าง `supabase/migrations/0019_rpc_record_notification_result.sql`: failed → เก็บ error_detail (scrub ความลับ) ไม่ mark sent; ครบ retry → log Delivery_Failure คงถาวร
    - _Requirements: 9.5, 18.3_
  - [x]* 12.3 เขียน property test ความต่อเนื่องทางธุรกิจ + ไม่พึ่งพา LINE ช่องทางเดียว
    - **Property 31: ความต่อเนื่องทางธุรกิจและการไม่พึ่งพา LINE ช่องทางเดียว**
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**
  - [x] 12.4 ปิด delivery chain จริง (พบ+แก้บั๊ก 2026-07-06)
    - **บั๊กเดิม:** worker POST body ไป line-outbound-sender (batch worker ไม่อ่าน body) → notification ถูก mark 'sent' โดยไม่มีการส่งถึงพนักงานจริง; backoff คงที่ 2s ไม่ใช้ retry_count
    - **แก้:** `supabase/migrations/0081_notification_delivery_resolution.sql` — claim RPC resolve ผู้รับ (identity_binding) + render template ที่ approve แล้ว (free-text ban ที่ DB) + Vault token ref; worker ส่ง LINE push ตรง + backoff mirror `backoff.ts` + poison rows (recipient/template unresolvable) record fail โดยไม่เรียก send
    - **Test:** `tests/workflow/ts/notificationRetryWorker.integration.test.ts` (5 tests)
    - _Requirements: 18.1, 18.2, 18.3, 6.7_

- [x] 13. SLA sweep logic (Req 13)
  - [x] 13.1 สร้างโมดูล logic SLA/reminder/timeout (pure)
    - สร้าง `src/workflow/sla/sweep.ts`: คำนวณ SLA_Deadline จาก config, reminder ที่ ≥ 50% และ 100%, escalation ทันทีเมื่อเกิน timeout โดยไม่รอ formal status; reminder จัดเป็น Direct_Responsibility_Item
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [x]* 13.2 เขียน property test SLA reminder + timeout escalation
    - **Property 26: SLA reminder และ timeout escalation**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5**

- [ ] 14. Copilot suggestion builder (Req 5, 17, 12.4)
  - [x] 14.1 สร้างโมดูล logic Copilot builder (pure)
    - สร้าง `src/workflow/copilot/builder.ts`: 2–3 ตัวเลือก (≥4 → ปฏิเสธ), แต่ละตัวมี pros/cons, อ้าง PFMEA_Risk_Row + RPN เสมอ, จัด Autonomy_Tier ตาม D2 ก่อนนำเสนอ, advisory-only ไม่เปลี่ยน state อัตโนมัติ, tier ต้องอนุมัติ/Approval_Mechanism ไม่พร้อม → fail-safe block
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 12.4_
  - [x] 14.2 สร้างโมดูล logic freshness/trust (pure)
    - สร้าง `src/workflow/copilot/freshness.ts`: แสดง source_version + imported_at; เก่ากว่า threshold → warning + ยังแสดง; review_status ≠ approved → mark low confidence (ไม่ซ่อน); stale แสดงพร้อม warning เสมอ
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [x] 14.3 สร้าง RPC บันทึก Copilot_Suggestion + audit
    - สร้าง `supabase/migrations/0020_rpc_record_copilot_suggestion.sql`: persist suggestion (options/citation/autonomy_tier/freshness flags) + audit ทุก suggestion
    - _Requirements: 5.8_
  - [x]* 14.4 เขียน property test รูปร่าง Copilot_Suggestion + การกำกับ D2
    - **Property 11: รูปร่าง Copilot_Suggestion และการกำกับ D2**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 12.4**
  - [x]* 14.5 เขียน property test ความสดใหม่และความน่าเชื่อถือของความรู้
    - **Property 30: ความสดใหม่และความน่าเชื่อถือของความรู้**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4**

- [ ] 15. Field view + atomic capture (Req 7)
  - [x] 15.1 สร้างโมดูล logic Field_View (pure)
    - สร้าง `src/workflow/field/view.ts`: แสดง Process_Step ปัจจุบัน + เช็กลิสต์จาก SOS/JES; มีความรู้ → Obsidian_Deep_Link, ไม่มี → ซ่อน link + ข้อความ "ยังไม่มีเอกสารมาตรฐาน"
    - _Requirements: 7.1, 7.2, 7.4, 7.5_
  - [x] 15.2 สร้าง `rpc_record_capture` SECURITY DEFINER (atomic) + `rpc_log_capture_failure` (§1 — STEP 2-FIX)
    - สร้าง `supabase/migrations/0021_rpc_record_capture.sql`: `rpc_record_capture` ผูก Capture_Item ↔ Work_Item ↔ Process_Step ↔ ผู้บันทึก (`resolve_actor()`) ใน transaction เดียว; ส่วนใดล้มเหลว (รวม actor resolution) → **raise exception** ทำให้ business transaction roll back ทั้งก้อน ไม่ผูกบางส่วน; audit เมื่อสำเร็จ
    - เพิ่ม `rpc_log_capture_failure(work_item_id, process_step, failure_reason, actor_hint)` SECURITY DEFINER: append failure-audit เข้า `workflow_audit_log` อย่างเดียว ไม่แตะ business data, scrub secret; **ไม่ใช้ dblink/pg_background**
    - _Requirements: 7.3, 7.6, 7.7, 7.8, 7.9_
  - [x]* 15.6 เขียน property test capture rollback preserves failure-audit
    - **Property 40: capture rollback preserves failure-audit (§1)** — test ว่า business roll back แต่ failure-audit ติด ผ่าน caller-driven separate transaction (Edge catch → `rpc_log_capture_failure`); mark **best-effort** (ไม่ durable-guaranteed)
    - **Validates: Requirements 7.7, 7.9, 9.5, 9.6**
  - [x]* 15.3 เขียน property test Obsidian_Deep_Link แสดงเมื่อมีความรู้เท่านั้น
    - **Property 15: Obsidian_Deep_Link แสดงเมื่อมีความรู้เท่านั้น**
    - **Validates: Requirements 7.4, 7.5**
  - [x]* 15.4 เขียน property test ความเป็น atomic ของการบันทึก Capture_Item
    - **Property 16: ความเป็น atomic ของการบันทึก Capture_Item**
    - **Validates: Requirements 7.3, 7.7, 7.8**
  - [ ]* 15.5 เขียน unit test Field_View แสดงขั้นตอน/เช็กลิสต์ (ทางเลือก `*`)
    - _Requirements: 7.1, 7.2_

- [ ] 16. Audit completeness + secret-scrub-preserve (Req 9)
  - [x] 16.1 สร้างโมดูล logic audit writer + secret scrub (pure)
    - สร้าง `src/workflow/audit/writer.ts`: ประกอบรายการ audit ครบ field (event_type, work_item, process_step, site_code เมื่อทราบ, ผู้กระทำผ่าน `resolve_actor()`, UTC); scrub ความลับทุกเส้นทาง; เขียนแถวก่อนแล้ว scrub best-effort retry — คงแถว audit เสมอแม้ scrub ล้มเหลว
    - _Requirements: 9.1, 9.3, 9.5, 9.6_
  - [x] 16.2 สร้าง `rpc_query_audit` SECURITY DEFINER (read helper)
    - สร้าง `supabase/migrations/0022_rpc_query_audit.sql`: คืนเฉพาะแถวที่เคารพ RLS
    - _Requirements: 9.4_
  - [x]* 16.3 เขียน property test ความครบถ้วนของ Workflow_Audit_Log
    - **Property 18: ความครบถ้วนของ Workflow_Audit_Log**
    - **Validates: Requirements 9.1**
  - [x]* 16.4 เขียน property test การลบความลับออกจากทุกผลลัพธ์
    - **Property 19: การลบความลับออกจากทุกผลลัพธ์**
    - **Validates: Requirements 9.3, 9.5**
  - [x]* 16.5 เขียน property test การคงรายการ audit แม้การ scrub ล้มเหลว
    - **Property 20: การคงรายการ audit แม้การ scrub ล้มเหลว**
    - **Validates: Requirements 9.6**

- [x] 17. Edge Functions wiring (Deno/TypeScript)
  - [x] 17.1 สร้าง Edge Function `approval-postback`
    - สร้าง `supabase/functions/approval-postback/index.ts`: รับ LINE postback (raw body + signature + webhook_event_id), เรียก `rpc_record_approval_decision` (ถอด/ตรวจทำใน RPC), reuse Postback_Data_Contract, ไม่ทำ business logic เอง, scrub ความลับ
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 17.2 สร้าง Edge Function `web-fallback-api`
    - สร้าง `supabase/functions/web-fallback-api/index.ts`: endpoint สำรอง `TO authenticated` บันทึก Approval_Decision ผ่าน `rpc_record_approval_decision` เส้นทางเดียวกับ LINE (authz/idempotency/quorum เหมือนกัน)
    - _Requirements: 18.4, 18.5_
  - [x] 17.3 สร้าง Edge Function `sla-sweep-scheduler`
    - สร้าง `supabase/functions/sla-sweep-scheduler/index.ts`: cron เรียก logic SLA (reminder 50%/100%, timeout escalation ทันที) + ประกอบ/ส่ง Daily_Digest
    - _Requirements: 13.2, 13.3, 13.4, 13.6, 6.4_
  - [x] 17.4 สร้าง Edge Function `notification-retry-worker`
    - สร้าง `supabase/functions/notification-retry-worker/index.ts`: claim แถว `pending`, ส่งผ่าน LINE, เรียก `rpc_record_notification_result`, retry exponential backoff, scrub token จาก log
    - _Requirements: 18.1, 18.2, 18.3_
  - [x] 17.5 สร้าง Edge Function `field-capture` (orchestrate capture + failure-audit §1)
    - สร้าง `supabase/functions/field-capture/index.ts`: เรียก `rpc_record_capture` → **ถ้า throw → catch แล้วเรียก `rpc_log_capture_failure` ในการเรียกครั้งใหม่ (transaction แยก)** เพื่อให้ failure-audit ติดแม้ business tx roll back (Property 40); scrub secret
    - _Requirements: 7.7, 7.9_

- [x] 18. Integration + smoke tests
  - [x]* 18.1 เขียน integration test การ consume Knowledge_Export จริง
    - ตรวจ import จริงจาก export → process model/RACI/quorum/freshness พร้อมใช้
    - _Requirements: 11.1_
  - [x]* 18.2 เขียน integration test การแจ้ง Sale/PM อัตโนมัติในขั้น Installation
    - ตรวจ outbound notification ไป Sale และ PM เมื่อ Installation start/finish
    - _Requirements: 8.6_

- [x] 19. Checkpoint — core Phase 1 (Req 1–18) ครบ
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Action Type Registry & Autonomy Classification (Req 19) — **Phase 1** · classify เท่านั้น (D2 ตัวเลือก C)
  - [x] 20.1 สร้าง migration `0004_autonomy_registry.sql`
    - enum `autonomy_ladder_tier` ('L0_advisory','L1_propose','L2_auto_within_guardrail','L3_auto_with_notify' — นิยาม 4 ใช้ L0/L1) + enum `risk_class` ('low','medium','high')
    - table `action_type_registry` (action_type PK, risk_class, max_allowed_tier, r02_bound, risk_source manual/derived, description)
    - **CHECK สองตัวแยกกัน — ห้าม merge:** `atr_ceiling_for_risk` = `(risk_class='low') OR (max_allowed_tier IN ('L0_advisory','L1_propose'))` (Req 19.2 invariant ถาวร) **และ** `atr_phase_tier_cap` = `max_allowed_tier IN ('L0_advisory','L1_propose')` แบบไม่มีเงื่อนไข risk_class (Req 19.11 phase-scoped, เข้มกว่า); + `atr_r02_implies_high`
    - RLS `SELECT TO authenticated`; write ผ่าน RPC เท่านั้น; seed actions จาก ACTION_TYPE_REGISTRY_SEED (risk_source manual/derived)
    - _Requirements: 19.1, 19.2, 19.7, 19.8, 19.11_
  - [x] 20.2 สร้างโมดูล logic derive/classify risk (pure)
    - สร้าง `src/workflow/autonomy/registry.ts`: derive risk จาก export (High→high/Medium→medium/Low→low/`severity_only`·`not_assessed`→high fail-safe ceiling); classify tier + **clamp ทุก action ≤ L1 ใน phase นี้** แม้ risk=low; unregistered → reject
    - _Requirements: 19.3, 19.4, 19.5, 19.6, 19.11_
  - [x] 20.3 สร้าง RPC `upsert_action_type` / `derive_risk_from_export` / `classify_autonomy_tier` SECURITY DEFINER
    - `supabase/migrations/0004_autonomy_registry.sql` (ต่อ): re-check `is_governance_role()` (19.10); derived ไม่ทับ manual + audit เดิม→ใหม่ (19.9); classify = lookup เท่านั้น **ไม่มี execute path** (19.5)
    - _Requirements: 19.4, 19.5, 19.9, 19.10_
  - [x]* 20.4 เขียน property test REG-1 (r02_bound ⇒ high)
    - **Property 32: REG-1 — r02_bound ⇒ high risk**
    - **Validates: Requirements 19.1, 19.2**
  - [x]* 20.5 เขียน property test REG-2 (risk≠low ⇒ tier ≤ L1 invariant)
    - **Property 33: REG-2 — risk ≠ low ⇒ tier ≤ L1 (invariant ถาวร)**
    - **Validates: Requirements 19.2**
  - [x]* 20.6 เขียน property test REG-3 (classify clamp ≤ L1)
    - **Property 34: REG-3 — classify_autonomy_tier clamp ≤ L1 ใน phase นี้**
    - **Validates: Requirements 19.5, 19.11**
  - [x]* 20.7 เขียน property test phase-cap CHECK (ทุก row รวม low)
    - **Property 42: ทุก action_type max_allowed_tier ≤ L1 ใน phase นี้ (§5)** — insert/update max_tier ∉ {L0,L1} ถูกปฏิเสธโดย `atr_phase_tier_cap` ไม่ว่า risk_class ใด (รวม low)
    - **Validates: Requirements 19.11**

- [x] 21. Customer as Approver (Req 20) — **Phase 1** · Edge gatekeeper (ลูกค้าไม่เป็น DB principal)
  > **prereq cross-spec:** second-brain `raci-data.ts` (STEP 4 — customer = approver + quorum unanimous) ต้องเสร็จก่อน import จริงเข้า resolver (Req 20.2)
  - [x] 21.1 สร้าง migration `0023_customer_approver.sql`
    - `work_item` += `primary_customer_id uuid NULL`, `approver_kind text NOT NULL DEFAULT 'employee'`; `approval_request` += `approver_kind text CHECK (approver_kind IN ('employee','customer'))`
    - `primary_customer_id` = `primary_customer_approver` (ผู้เซ็นสัญญา 1 คน/โครงการ); ลูกค้าคนอื่น = informed/consulted ไม่ใช่ quorum (Req 20.9)
    - **ไม่มี** customer RLS policy / Supabase session / JWT helper (คง RLS `TO authenticated` = พนักงานล้วน)
    - _Requirements: 20.1, 20.2, 20.9_
  - [x] 21.2 ขยาย `rpc_resolve_approver` รองรับ customer (มิกซ์ set)
    - step ∈ {Designer, 3D_Presentation, 3D_Rendering_Final} → set = { internal Designer lead (RACI), Customer_Approver (`primary_customer_id`) } quorum=unanimous; **§3 reconcile:** Req 8.4 (Designer lead ไม่ escalate) ไม่ override การเพิ่ม customer; primary_customer_id NULL → internal เดี่ยว (degrade single); customer ไม่มี binding → binding flow / escalate PM
    - _Requirements: 20.2, 20.5, 20.7, 20.8, 20.9_
  - [x] 21.3 ขยาย `rpc_record_approval_decision` รองรับ customer ผ่าน `line_oa_customer_identity`
    - resolve customer ผ่าน `line_oa_resolve_customer_identity`; authorize iff resolved customer_id = `work_item.primary_customer_id` AND Encrypted_Postback signature; ไม่เชื่อ client id (anti-impersonation); audit ด้วย customer_id ไม่บันทึก PII; quorum logic เดิม
    - WHEN customer reject → Revision_Reason classify โดย internal (PM/lead) ลูกค้าให้ free-text เท่านั้น (Req 20.10 — เชื่อมกับ `rpc_classify_revision` task 22.4)
    - _Requirements: 20.3, 20.4, 20.6, 20.10_
  - [x] 21.4 ขยาย SLA sweep + binding flow ครอบ customer
    - reminder LINE 50/100% → timeout escalate Project_Manager; binding ไม่สำเร็จใน SLA → escalate PM + audit
    - _Requirements: 20.8, 20.11_
  - [x] 21.5 สร้าง Edge Function `customer-design-view` (LIFF gatekeeper — Req 20.12)
    - สร้าง `supabase/functions/customer-design-view/index.ts`: verify LINE identity (LIFF idToken) → ดึงเฉพาะ design-presentation artifacts (board/3D/layout/drawing + คำขออนุมัติ) ของ Work_Item ที่ `primary_customer_id` ตรง **server-side** → ซ่อน cost/BOM unit price/production internals/PFMEA/RACI/โครงการอื่น; **ไม่ใช่ DB VIEW + RLS** (ลูกค้าไม่ query DB ตรง ไม่มี Supabase session)
    - _Requirements: 20.12_
  - [x]* 21.6 เขียน property test CAR-1 (project-scoped)
    - **Property 35: CAR-1 — Customer_Approver เป็น project-scoped**
    - **Validates: Requirements 20.1, 20.3**
  - [x]* 21.7 เขียน property test CAR-2 (unanimous {lead+customer})
    - **Property 36: CAR-2 — design/3D ผ่านเมื่อ unanimous {internal lead + customer}**
    - **Validates: Requirements 20.2, 8.4**

- [ ] 22. Revision Discipline & Design Locks (Req 21) — **Phase 1.5** (queue แยกได้ ไม่บล็อก core)
  - [x] 22.1 สร้าง migration `0024_revision_discipline.sql`
    - `revision_event` (gate, reason enum, reason_classified_by, classification_basis, appeal_status, customer_comment, billable); `design_lock_field_config` seed **4-gate** (G1/G2/G3 customer, G4 internal — ตาม DESIGN_LOCK_FIELDS)
    - `work_item` += `revision_count int`, `design_locks jsonb`; status enum += `awaiting_requote`, `awaiting_customer_acceptance`
    - _Requirements: 21.1, 21.3, 21.12_
  - [x] 22.2 สร้างโมดูล logic classify revision + threshold (pure)
    - สร้าง `src/workflow/revision/classify.ts` + `threshold.ts`: deterministic ก่อน (∩ locked_fields → scope_change; ≠ signed spec → daph_defect; else customer_change; ไม่ชัด → pm_judgment); นับเฉพาะ customer_change > 1/gate → billable + escalate PM (Soft, ไม่คิดเงิน, ไม่ hard-block); daph_defect → QA_Metric ไม่นับ
    - _Requirements: 21.1, 21.2, 21.4, 21.5, 21.8, 21.9, 21.13, 21.15, 21.16_
  - [x] 22.3 สร้างโมดูล logic re-quote state machine (pure)
    - สร้าง `src/workflow/revision/requote-fsm.ts`: `awaiting_requote` → internal approved (PM+exec single consolidated, ชุดราคาเดียว) → `awaiting_customer_acceptance` → customer accept → revert ไป gate ที่ field ถูกแก้ + re-lock + proceed; ถ้า customer ไม่รับใน SLA → คง `awaiting_requote`, escalate PM, ไม่ปลด lock, ไม่เดินต่อ; **"re-quote approved" = internal + customer accept ครบทั้งคู่**
    - _Requirements: 21.6, 21.10, 21.11, 21.17_
  - [x] 22.4 สร้าง RPC ของ Req 21 SECURITY DEFINER
    - `supabase/migrations/0024_revision_discipline.sql` (ต่อ): `rpc_record_design_lock` / `rpc_classify_revision` / `rpc_request_scope_change` / `rpc_accept_requote` (customer accept ผ่าน Edge gatekeeper เดียวกับ Req 20) / `rpc_appeal_revision_reason` (→ executive_owner); daph_defect rate feed QA_Metric
    - _Requirements: 21.6, 21.7, 21.10, 21.11, 21.14, 21.17_
  - [x]* 22.5 เขียน property test CAR-3 (lock → scope_change)
    - **Property 37: CAR-3 — change แตะ field ที่ lock → scope_change**
    - **Validates: Requirements 21.4, 21.12**
  - [x]* 22.6 เขียน property test CAR-4 (เกิน 1/gate → escalate)
    - **Property 38: CAR-4 — revision เกิน 1/gate → escalate (ไม่ silent absorb, ไม่ hard-block)**
    - **Validates: Requirements 21.5, 21.15**
  - [x]* 22.7 เขียน property test CAR-5 (daph_defect → QA_Metric)
    - **Property 39: CAR-5 — daph_defect ไม่นับ threshold → QA_Metric**
    - **Validates: Requirements 21.2, 21.13**
  - [x]* 22.8 เขียน property test re-quote ไม่ proceed ก่อน customer accept
    - **Property 41: re-quote ไม่ proceed ก่อน customer accept (§2)** — ปลด lock/เดินต่อ เกิดเมื่อ internal (PM+exec single consolidated) **และ** customer accept ครบทั้งคู่เท่านั้น
    - **Validates: Requirements 21.6, 21.10, 21.17**

- [x] 23. Final checkpoint — ตรวจ Phase 1 + Phase 1.5 ครบ
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- งานที่มาร์ก `*` เป็น sub-task ทางเลือก (unit / property / integration / smoke test) ข้ามได้สำหรับ MVP ที่เร็วขึ้น แต่แนะนำให้ทำเพื่อ traceability
- Correctness Property แต่ละข้อ (1–42) ถูก implement ด้วย property-based test **ตัวเดียว** (fast-check, ≥ 100 iteration, ติด tag `// Feature: monolith-workflow-copilot, Property N: ...`)
- Property ระดับฐานข้อมูล (idempotency unique, RLS, immutability, registry CHECK) เสริมด้วย pgTAP / DB-harness; pure logic ใช้ fast-check โดย mock LINE/Supabase
- **Property 40 (capture failure-audit) เป็น best-effort** — ไม่ durable-guaranteed: ถ้า Edge Function ตายหลัง business tx fail ก่อนเรียก `rpc_log_capture_failure` → failure-audit อาจหาย; ยอมรับได้สำหรับ capture failure (ต่างจาก approval audit ที่ต้อง durable)
- ทุก task อ้างอิงเลข requirement เพื่อ traceability; checkpoint แทรกที่ break เพื่อ validate แบบ incremental
- โมดูลนี้ **พึ่งพา** primitive ของ `line-oa-commerce` (C12/Vault/Postback/Message_Templates/audit/D2) และ Knowledge_Export ของ `daph-obsidian-second-brain` — ไม่ implement ซ้ำ
- **Phasing:** core (task 1–19) + Req 19 (task 20) + Req 20 (task 21) + capture failure-audit (task 15.2/15.6/17.5) = **Phase 1**; Req 21 (task 22, revision discipline + design locks + re-quote state machine) = **Phase 1.5** (queue แยกได้ ไม่บล็อก core)
- **prereq cross-spec:** second-brain `raci-data.ts` (STEP 4) ต้องเสร็จก่อน task 21 import จริง (customer = approver + quorum unanimous)
- **D2 ตัวเลือก C:** ไม่มี task ใด build `execute_autonomous_action` / guardrail / escalation_record — Autonomy_Ladder_Tier ใช้ classify/label เท่านั้น
- ขอบเขต = **Phase 1 + Phase 1.5** ไม่รวม ERP Extension Points (CRM, Manufacturing, Procurement, Finance) และ Req D anti-fraud (→ capture-spine, Phase 2)
- **ADR-017 + ADR-018 (rework — migration 0031, deploy-verified กับ export จริง):** process_model re-key เป็น **`canonical_order`** (process_step = label ซ้ำได้); `work_item.current_order` + `approval_request.gate_order`; handoff adjacency = order+1; approval เฉพาะขั้น `requiresApproval` (6 จาก 28); approver source = `approvers[].ref` (unanimous) / `accountable` (single); quorum scope ตาม `(work_item, gate_order, attempt)`. signature เปลี่ยน: `rpc_create_work_item(site, data)`, `rpc_handoff_work_item(id, ver, target_order, owner)`, `rpc_resolve_approver(id, canonical_order, sla)` — decision RPC คง signature. verify: import→28 rows, Designer(unanimous)→2 legs จาก approvers array, Installation 2 gates แยกด้วย gate_order. pure-logic: `import.ts approversForStep` + tests
- **0032 (re-scrutinize fix — handoff gate enforcement, deploy-verified):** `rpc_handoff_work_item` อนุญาตเฉพาะ status=`in_progress` (ปฏิเสธ awaiting_approval/blocked/rework) + เข้าขั้น requiresApproval → set `awaiting_approval` อัตโนมัติ (กั้น handoff ออกจนกว่า decision จะ approve → in_progress) → ปิดช่อง bypass ที่ approval ไม่ถูกบังคับ (Req 4); `rpc_record_capture` ผูก `canonical_order` (disambiguate ชื่อขั้นซ้ำ). verify: bypass handoff ออกจาก awaiting_approval ถูก reject, gate ผ่านเมื่อ in_progress, capture บันทึก order
- **0033 (re-scrutinize 0032 fix — terminal state, deploy-verified):** `rpc_complete_work_item` — ขั้นสุดท้าย (`current_order = max`) + `status='in_progress'` (gate ผ่าน) → `completed` + audit + **celebrate notification** (Req 12.3/12.7); reject ถ้ายังไม่ถึงขั้นสุดท้าย/gate pending. `rpc_create_work_item` mirror gate logic (ขั้นแรก requiresApproval → awaiting_approval). verify: order 0→reject, last+awaiting→reject, last+in_progress→completed+celebrate=1
- **0034 (re-scrutinize 0033 fix A+B — celebrate via dispatch + idempotent complete, deploy-verified):** A (MEDIUM) celebrate เดิม insert notification ตรง target ว่าง `{}` → ส่งไม่ถึงใคร + bypass routing/suppression/template; แก้: route ผ่าน `rpc_dispatch_notification` (intent=`fyi`→`group_message`, target={work_item_id,site_code,owner}, template `tpl_celebrate` → ผ่าน suppression/template Req 6) แบบ best-effort (exception sub-block → celebrate fail ไม่ย้อน completion, Req 12.7). B (NIT) double-complete idempotent: `status='completed'` → return `'completed'` ก่อนเช็ค version (ไม่ error เพี้ยน). verify (db reset เขียว + e2e): complete→completed+version 0→1; celebrate notification channel=group_message + target มี work_item_id (ไม่ว่าง); double-complete→completed idempotent + version คงที่ 1. 125 vitest เขียว
- **0035 (re-scrutinize 0034 fix C1 — celebrate respect quiet hours, deploy-verified):** C1 (MEDIUM) 0034 hardcode `p_in_quiet_hours=false` → celebrate (group_message/non-Direct) ส่งทันทีแม้ quiet hours → ขัด Req 6.9 (non-Direct ห้ามข้าม Quiet_Hours) + Req 6.6 (ควรเข้า digest). รากปัญหา: RPC ไม่มี quiet-hours context + suppression model ขับเคลื่อนด้วย caller. แก้: `drop` signature เดิม (uuid,int) → recreate `rpc_complete_work_item(uuid, int, p_in_quiet_hours boolean default false)` แล้ว forward เข้า `rpc_dispatch_notification` (call site 2-arg เดิม resolve ผ่าน default ไม่ break); mute คง false ที่ระดับ dispatch (group broadcast — per-user mute ตอน delivery). scrutinize อื่นผ่านหมด: best-effort block, exactly-once celebrate (double-complete return early ก่อน insert), idempotent early-return, template_key เป็น key string. verify (db reset เขียว + e2e): 2-arg→completed+celebrate delivered (1 row); quiet=true→celebrate suppressed_digest (0 row + audit); work item ยัง completed (Req 12.7). 125 vitest เขียว
- **D1 (KNOWN-GAP, pre-existing ใน 0018 — track สำหรับ Phase 2):** digest path ของ `rpc_dispatch_notification` เขียน audit `suppressed_digest` แล้ว `return null` โดย**ไม่ persist** notification ไว้ส่งภายหลัง; enum `wf_notification_status` = {queued, pending, sent, failed} ไม่มี state digest และ sla-sweep-scheduler ไม่มีโค้ดประกอบ digest จาก suppressed rows → non-Direct notification ที่โดน suppress ช่วง quiet hours (รวม celebrate ที่ 0035 route เข้าไปถูกต้อง) **หายจริง ไม่เคยถูกส่งใน Daily_Digest** → ขัด Req 6.4. แก้ใน Phase 2: เพิ่ม status `digest_pending` (persist suppressed non-Direct แทน drop) + ให้ sla-sweep-scheduler ดึงไปรวมส่งตามรอบ digest. **ไม่ใช่ defect ของ 0035** (0035 ทำถูกตาม contract ของ dispatch)
- **D1 RESOLVED (0059 + 0060, deploy-verified):** (1) `0059` เพิ่ม enum `digest_pending` (แยก migration กัน unsafe-use). (2) `0060` แก้ `rpc_dispatch_notification` — quiet-hours non-Direct → **persist** notification `status='digest_pending'` (แทน return null) + เพิ่ม `rpc_assemble_daily_digest(site)` รวม digest_pending เป็น "ข้อความเดียว" (Req 6.4): claim FOR UPDATE SKIP LOCKED → insert 1 digest summary (queued) → mark ต้นฉบับ `sent` → audit. worker (`rpc_claim_pending_notifications` claims queued/pending) ไม่หยิบ digest_pending. wire `sla-sweep-scheduler` Edge: `runDigest` + body flag `assemble_digest` (แยกจาก SLA sweep ที่ถี่กว่า) → assemble ต่อ active site. verify e2e: quiet→digest_pending persisted, worker_claim=0, assemble→1 queued summary+2 sent, re-assemble→null (no empty digest). 204 vitest เขียว (เพิ่ม 2 digest scheduler tests).
- **scrutinize D1 → fix N10 (0061, deploy-verified):** N10 (MEDIUM) `rpc_assemble_daily_digest` filter `site_code = p_site_code` ไม่ match null + scheduler loop เฉพาะ active sites → digest_pending ที่ `site_code IS NULL` (เช่น celebrate ของ work_item ไม่มี site) orphan ถาวร. แก้: assemble ใช้ `site_code IS NOT DISTINCT FROM p_site_code` (รองรับ null) + เพิ่ม `rpc_assemble_pending_digests()` กวาดทุก distinct site (รวม null) ที่มี digest_pending; refactor scheduler ใช้ single dep `assembleDigests` → `rpc_assemble_pending_digests`. verify: pending_before=2(null+D2)→assemble_all=2 digests→pending_after=0 (no orphan)+2 queued summaries. N1/N8 LOW note (return-id/sent-status), N3 PASS (resolve_actor default 'system'). 204 vitest เขียว.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "3.1", "4.1", "5.1", "5.2", "5.5", "7.1", "7.2", "7.3", "8.1", "8.2", "8.3", "9.1", "11.1", "11.2", "11.3", "11.4", "11.5", "12.1", "13.1", "14.1", "14.2", "15.1", "16.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "5.3", "5.4", "5.6", "5.7", "5.8", "5.9", "5.10", "7.4", "7.5", "7.6", "7.7", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "9.2", "9.3", "9.4", "11.6", "11.7", "11.8", "11.9", "11.10", "11.11", "11.12", "12.2", "12.3", "13.2", "14.3", "14.4", "14.5", "15.2", "15.3", "15.4", "15.5", "16.2", "16.3", "16.4", "16.5"] },
    { "id": 4, "tasks": ["2.6", "17.1", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 5, "tasks": ["18.1", "18.2", "15.6", "19"] },
    { "id": 6, "tasks": ["20.1", "20.2", "21.1", "22.1", "22.2", "22.3"] },
    { "id": 7, "tasks": ["20.3", "21.2", "21.3", "21.4", "21.5", "22.4"] },
    { "id": 8, "tasks": ["20.4", "20.5", "20.6", "20.7", "21.6", "21.7", "22.5", "22.6", "22.7", "22.8", "23"] }
  ]
}
```

> **Phasing within graph:** waves 0–5 = core Phase 1 (Req 1–18); wave 6–8 = Req 19/20 (Phase 1) + Req 21 (Phase 1.5). task 22.* (Req 21) queue แยกได้โดยไม่บล็อก task 20/21 — รันเป็น Phase 1.5 หลัง core เขียว
