# Scrutiny Report — งานปิด workflow-copilot (Phase 13/14/Req 21) · 2026-07-06

> Adversarial self-review ของงานที่ ship เมื่อ 2026-07-06 (migrations 0081/0082/0083 + workers + claims "134/134")
> วิธี: ไล่ identity/data-flow จริงจาก producer → consumer ทุกเส้น ไม่เชื่อ comment ตัวเอง
> ผล: พบ **8 findings** — แก้ทันที 4 (F1/F2/F3/F6 → migration `0084` + worker + tests), บันทึกเป็น follow-up/accepted 4

## Findings

| # | ระดับ | เรื่อง | สถานะ |
|---|-------|--------|--------|
| F1 | 🔴 สูง | **Recipient resolution ของ 0081 พังสำหรับ notification หลักของระบบ** — target ของ SLA sweep = `{approval_request_id, escalate_to}` (ไม่มี owner/line_user_id) → reminder/timeout ทุกใบจะ `recipient_unresolvable` → failed ถาวร; และ `resolved_approver` เป็น **approver ref (app-role ref ตาม ADR-018)** ไม่ใช่ email/uuid (พิสูจน์จาก `has_any_app_role(array[resolved_approver])` ใน 0031) → ไม่มีทาง map ref → LINE | ✅ แก้ (0084): `identity_binding.app_role` + resolution chain: line_user_id → employee uuid → approval_request (employee: binding.app_role = ref / **customer: `line_oa_customer_identity`**) → escalate_to |
| F2 | 🔴 สูง | **0083 มี RPC แต่ไม่มี caller** — `rpc_apply_design_lock_for_step` ไม่ถูกเรียกจากที่ไหนในโค้ด = ผมย้าย wiring gap ขึ้นชั้น (DB→app) ไม่ใช่ปิด — ผิดซ้ำ pattern เดียวกับที่ตัวเองวิจารณ์ | ✅ แก้ (0084): trigger `trg_work_item_apply_design_lock` — status `awaiting_approval → in_progress` (ผล approve จาก decision RPC ทั้ง employee/customer โดยไม่แก้ RPC ที่ test แล้ว) → apply lock ของ `current_step` อัตโนมัติ; best-effort + audit เมื่อพลาด (lock fail ห้าม block การอนุมัติ) |
| F3 | 🟠 กลาง | **กติกา ≤200 ตัวอักษร (Req 6.8/6.10/12.5/12.6) ไม่เคยถูกบังคับบนเส้นส่งจริง** — `composeMessage` (task 11.3) เป็น pure logic ที่ไม่มีใคร wire; dispatch เก็บ template_key+slots โดยไม่ render; worker ส่งข้อความยาวเท่าไรก็ได้ | ✅ แก้ (0084): claim v3 คืน `resolve_error='segment_too_long'` สำหรับ non-Direct ที่ render เกิน 200 (reject ตาม Req 12.5/12.6); Direct เกิน 200 = ส่งเต็มไม่ตัด (Req 6.10); worker เชื่อ verdict ของ DB |
| F4 | 🟡 ต่ำ | Template selection ใน `fn_wf_render_notification_text` เลือก shared (vertical null) ก่อน — **กลับทิศกับ 0040** ที่เลือก vertical-specific ก่อน | 🗒 ยอมรับ+บันทึก: workflow เป็น internal ไม่มี conversation vertical จึงตั้งใจให้ shared นำ — เขียนไว้ใน comment ของ 0081 แล้ว; ถ้าภายหลังมี template แยก vertical สำหรับ workflow ค่อยกลับทิศ |
| F5 | 🟡 ต่ำ | Delegation dedup: สอง approver เดิม delegate ไปคนเดียวกัน → 1 request → quorum unanimous เหลือเสียงเดียว (คนเดียวถืออำนาจสองสาย) | 🗒 ยอมรับ: spec ไม่ได้ห้าม และสอดคล้อง unique index เดิม; ทางป้องกันเชิงนโยบาย = ไม่ตั้ง delegation ซ้อนไปคนเดียวกัน — บันทึกเป็นข้อสังเกตใน 0082 |
| F6 | 🟡 ต่ำ | เอกสาร/คอมเมนต์ 0082 + `resolve-with-delegation.ts` บอก identity = email/uid (`resolve_actor`) แต่ความจริง = **approver ref (role ref)** — โค้ดทำงานถูก (opaque text) แต่คนอ่านจะผูก delegation ผิด | ✅ แก้ (0084): `comment on function rpc_create_delegation` ระบุ semantics จริง + แก้ doc ใน TS |
| F7 | 🟡 ต่ำ | Ordering contract ของ reject→classify: ถ้าเรียก `rpc_reject_design_gate` ก่อน decision RPC, สถานะ `awaiting_requote` จะถูก decision ทับเป็น `rework` | 🗒 บันทึก contract: caller (UI/Edge) ต้องบันทึก reject ผ่าน decision RPC ก่อน แล้วค่อย classify — เขียนใน 0083 header แล้ว + tasks |
| F8 | 🟡 ต่ำ | **Pre-existing (ไม่ใช่ของรอบนี้):** `rpc_accept_requote` (0024) เมื่อครบทั้งคู่ → in_progress แต่**ไม่ re-lock gate ที่แก้** ตาม Req 21.10 ("revert ไป gate ที่ field ถูกแก้แล้ว re-lock") | 📌 Follow-up: ต้องรู้ว่า field ไหนถูกแก้ (มาจาก scope_change payload) — เพิ่ม param ให้ accept_requote หรือเก็บ gate ใน `_requote` state; ไม่บล็อก Wave 2 (soft model) |

## สิ่งที่ scrutiny ยืนยันว่าถูกต้อง (ไม่ใช่ finding)

- 0082 rebase บน 0031 ครบ: signature (uuid,int,int), customer leg, attempt/gate_order, on-conflict — ตรวจซ้ำแล้ว
- Lease/backoff race: worker ตายกลางแบตช์ → lease หมดอายุ → re-claim ได้; backoff 1s→16s ภายใต้ maxAttempts 5 ไม่ชน cap — ตามดีไซน์
- SECURITY DEFINER + revoke/grant pattern ตรง 0061; inner fn ถูกเรียกในบริบท definer — สิทธิ์ถูกต้อง
- Token/PII ไม่หลุด log ทุก path (error = status code เท่านั้น)
- e2e 2 ตัวที่ skip = conditional skip เดิมจาก commit `bd518325` — ไม่ใช่ผลจากงานรอบนี้

## Verification หลังแก้

- `tsc -b` 0 errors · worker tests 10/10 (เพิ่ม case resolve_error) · full suite รันซ้ำหลัง commit นี้
- 0084 เป็น additive ทั้งหมด: คอลัมน์ใหม่ nullable, claim replace เฉพาะตัวที่ 0081 สร้าง (caller เดียว), trigger ใหม่ไม่แตะ RPC เดิม

## บทเรียน (เพิ่มจากรอบก่อน)

1. **"wiring ปิดแล้ว" ต้องพิสูจน์ด้วย caller จริง ไม่ใช่ RPC ที่พร้อมให้เรียก** — F2 คือผมทำผิด pattern ที่ตัวเองเพิ่งวิจารณ์ ภายในวันเดียวกัน
2. **ตาม identity ให้สุดสาย producer→consumer** — ผมยืนยัน "identity align" ที่ชั้น delegation↔resolved_approver แต่ไม่ได้ตามต่อว่า resolved_approver คืออะไรจริง ๆ (role ref) และ target ของ notification จริงหน้าตาเป็นยังไง (F1)
3. Pure logic ที่ property-test เขียว **ไม่นับว่า requirement ถูก enforce** จนกว่าจะชี้ได้ว่าใครเรียกมันบน path จริง (F3 — composeMessage)
