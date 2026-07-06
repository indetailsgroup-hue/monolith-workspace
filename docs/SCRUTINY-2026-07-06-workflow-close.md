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
| F8 | 🟡 ต่ำ | **Pre-existing:** `rpc_accept_requote` (0024) เมื่อครบทั้งคู่ → in_progress แต่**ไม่ revert/ไม่ re-lock** ตาม Req 21.10 | ✅ แก้ (`0087`, ADR-037): `rpc_request_scope_change(+p_gate)` เก็บ gate ใน `_requote` → accept ครบคู่: ปลด lock gate + revert `current_step`/`current_order` (inverse `fn_wf_step_for_gate`) + เคลียร์ `_requote` → trigger 0084 re-lock เองเมื่อ gate ผ่านใหม่; mirror+tests `requote-fsm.ts`/`gate-wiring.ts` |

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

## Findings เพิ่มจาก grill-with-docs (6 ก.ค. 2026 — รอบ ops/F8)

| # | ระดับ | เรื่อง | สถานะ |
|---|-------|--------|--------|
| F9 | 🔴 สูง | **Workflow templates ไม่เคยถูก seed** — keys `tpl_sla_reminder/timeout/timeout_pm/celebrate` ถูกอ้างใน 0033–0035 + scheduler แต่ไม่มี insert เข้า `line_oa_message_templates` เลย → deploy วันนี้ทุก notification = `template_unresolvable` | ✅ แก้ (`0085`): seed 5 keys (รวม `tpl_daily_digest` ที่ 0060 อ้าง — ไล่ให้ครบทุก key จริงตามสปิริต F9) vertical null, ≤200, น้ำเสียง Req 12.2 |
| F10 | 🟠 กลาง | **`in_quiet_hours` ไม่มีใครคำนวณ** — เป็น boolean param ที่ทุก caller ปล่อย default false → digest ไม่มีทางเกิดจริง; และ Quiet_Hours ไม่เคยมีค่าจริงจนกระทั่ง grill นี้ (owner กำหนด **20:00–08:00 ไทย, digest 08:00**) | ✅ แก้ (`0086`): `fn_wf_in_quiet_hours()` (Asia/Bangkok) + `p_in_quiet_hours` default null=DB คำนวณ ทั้ง dispatch/complete + scheduler เลิก hardcode false + mirror `quiet-hours.ts` (regression guard: caller ห้ามส่ง flag) |
| F11 | 🟡 ต่ำ | **ตาราง staff↔LINE binding ซ้ำสองระบบ** — `identity_binding` (มีจริง) vs `line_staff_identity` (installation-pm spec) → ผูกสองรอบ/drift | ✅ ADR-038: ยุบเป็น `identity_binding` เดียว + แก้ spec ครบ (requirements/line-architecture/tasks/LINE system doc) |

**มติ ops จาก grill:** ADR-036 (hosted SG bridge + exit criteria) · cron = pg_cron+pg_net ผ่าน migration (repo-as-code) · แผนเต็ม = `docs/OPS-RUNBOOK-Wave2.md`

## Scrutiny รอบสอง — งาน Wave2 B1–B5 + installation-pm 0090–0092 (6 ก.ค. 2026)

> ขอบเขต: commits `1f13922e`/`9bfc0c3b`/`a8499b5d` (migrations 0085–0092 + offline-queue TS + scheduler)
> วิธีเดิม: ไล่ producer→consumer จริง + พิสูจน์ทุกข้อสงสัยด้วยการรันบน DB/เทสต์ ไม่ตัดสินจากการอ่าน

| # | ระดับ | เรื่อง | สถานะ |
|---|-------|--------|--------|
| S1 | 🟠 กลาง | `installation_memberships_sel` (0090) ไม่มี branch `has_site_access` — office staff เขียน memberships ได้ (ins/upd มี site branch) แต่**อ่านไม่ได้** → จัดทีมแล้วมองไม่เห็นรายชื่อ | ✅ แก้ (0093) — ทดสอบจริง: office เห็น 1 / stranger เห็น 0 |
| S2 | 🟡 ต่ำ (UX tenet) | Template 0085 หลุดศัพท์ระบบถึงผู้ใช้: `tpl_sla_timeout_pm` render `{{escalate_to}}` (= 'project_manager' ref ดิบ), `tpl_daily_digest` render `{{categories}}` (= JSON array) — ขัด D-12 "ห้ามโชว์ศัพท์ระบบ" | ✅ แก้ (0093) — ตัด slot ออกจาก body (ค่ายังอยู่ใน notification.slots ให้หลังบ้าน); ยืนยัน render ไม่เหลือ ref + ≤200 |
| S3 | 🟠 กลาง | **Offline queue double-submit**: `online` + `visibilitychange` ยิงพร้อมกัน (ปลดล็อกจอตอนเน็ตกลับ) → flush ซ้อน → รายการเดียวถูก submit 2 ครั้ง — พิสูจน์ด้วยเทสต์ (fail ก่อนแก้จริง) | ✅ แก้: in-flight guard ระดับ instance + 2 regression tests; ข้าม context (window↔SW) กันไม่ได้ที่ client → **สัญญา SubmitFn: server ต้อง treat duplicate submissionId เป็น success** (จดใน spike doc + type doc) |
| S4 | 🟡 ต่ำ | 0087 revert: gate ที่ map เป็น step ซึ่งไม่อยู่ใน process_model ปัจจุบัน (knowledge เปลี่ยนระหว่างรอ requote) → set `current_step` ใหม่แต่ `current_order` ค้างเก่า = ไม่ตรงกัน | ✅ แก้ (0093): fail-safe — revert เฉพาะเมื่อ map ครบทั้ง step+order; ไม่ครบ = ปลด lock ตามปกติ คง step เดิม + audit `revert_skipped_unmapped`; ทดสอบทั้ง mapped (revert ✓) และ unmapped (คงเดิม ✓) |

### ตรวจแล้วสะอาด (พิสูจน์ด้วยหลักฐาน ไม่ใช่อ่านผ่าน)

- **F10 ปิดสนิท**: ไล่ caller ของ `rpc_dispatch_notification` ทั้งเรโป — ไม่มีใคร hardcode `p_in_quiet_hours` เหลือ (0034 ถูก 0035→0086 ทับตามลำดับ chain)
- ไม่มี caller `rpc_request_scope_change(uuid)` 1-arg ค้าง (0083 เป็นไฟล์ประวัติศาสตร์ — chain apply ผ่านจริงทั้งเส้น)
- `rpc_complete_work_item` ทุก caller (adapter 0063→0092) เรียก 2-arg → ได้ default null = DB คำนวณ quiet hours ✓
- FK chain ลบ project ที่มีรูปผูกห้อง: **ไม่ block** (photos โดน cascade ผ่าน project_id ในคำสั่งเดียวกัน — NO ACTION ตรวจท้าย statement) — พิสูจน์ด้วย DELETE จริง
- 0092 rebase บน 0079 (ตัวล่าสุดจริง — ตรวจ replacement chain 6 ชั้น) ไม่ใช่ 0063 ที่ task เดิมอ้าง
- ข้อสังเกตบันทึกไว้: RLS policy ที่มี subquery ไปตารางอื่น ต้องการ SELECT grant บนตารางนั้นด้วยถ้าวันหนึ่งเปิด direct-table access (สถาปัตยกรรมปัจจุบัน RPC-only จึงไม่กระทบ)

## ปิดรอบ B1–B5 (go-ahead 6 ก.ค. 2026 — migrations 0085–0089)

- `0085` seed templates (F9 ✅) · `0086` quiet-hours DB default (F10 ✅) · `0087` requote full revert (F8 ✅, ADR-037) · `0088` identity_binding lifecycle cols (ADR-038) · `0089` cron pg_cron+pg_net (Vault refs `wf_edge_base_url`/`wf_edge_service_key`)
- Verification: `tsc -b` 0 errors · full vitest **4,455/4,455 (246 files)** — เพิ่ม 11 tests (quiet-hours mirror 4, stepForGate roundtrip 3, requote revert 3, scheduler no-hardcode guard 1)
- เหลือฝั่ง ops ตาม runbook: A (provision) → C (deploy+seed รวม Vault cron secrets) → D (verify)
