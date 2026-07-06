# Ops Runbook — เปิด Pilot Wave 2 (workflow/LINE)
### ผลจาก grill-with-docs · 6 กรกฎาคม 2026

> แผน ops ที่คมแล้วสำหรับพาระบบ workflow/LINE (โค้ดครบ 134/134 + scrutiny 0084) ขึ้นใช้งานจริง
> **มติที่ยึด:** ADR-036 (hosted SG bridge + exit criteria) · ADR-037 (requote full-revert — รอ go-ahead implement) · ADR-038 (identity_binding ตารางเดียว) · Quiet_Hours 20:00–08:00 ไทย / Digest 08:00 ไทย (glossary workflow spec)
> **ตาม skill:** เอกสารนี้คือ deliverable — การ implement แต่ละข้อเป็นขั้นแยกที่ต้องขอ go-ahead

## 0. ภาพรวมลำดับงาน

```
A. Provision (ครั้งเดียว)          B. Code ที่ค้างจาก grill (ขอ go-ahead)   C. Deploy + Seed        D. Verify + เปิด Wave 2
A1 สร้าง Supabase project SG   →  B1 seed templates (F9)                →  C1 db push (มิเกรชันทั้งหมด) →  D1 sweep แห้ง (dry-run)
A2 DPA + billing alert + backup    B2 คำนวณ in_quiet_hours ใน DB (F10)      C2 functions deploy ×7        D2 ทดสอบ 1 work item จริง
A3 LINE channel (secrets→Vault)    B3 cron migration (pg_cron+pg_net)       C3 seed data (§C3)            D3 เปิดผู้ใช้ Wave 2
                                   B4 F8 requote revert (ADR-037)
```

## A. Provision (ops ครั้งเดียว — ADR-036)

- **A1** สร้าง project: region `ap-southeast-1` (สิงคโปร์) · Postgres 17 (ตรง config.toml) · ตั้งชื่อสื่อ bridge เช่น `daph-ops-bridge-sg`
- **A2** ตั้งแต่วันแรก: DPA กับ Supabase · billing alert · backup policy (PITR) · **บันทึก exit criteria ของ ADR-036 ลง issue tracker**: ย้ายเข้าโครงสร้างไทยก่อน (ก) เปิด ledger production หรือ (ข) ข้อมูลลูกค้าจริงเต็มระบบ
- **A3** LINE Official Account: เก็บ `channel_secret` + `channel_access_token` เข้า **Vault** (ชื่อ ref จดไว้ใช้ใน C3) — Edge Functions ไม่ถือ secret ตรง (pattern เดิม)
- **A4** `supabase link` + เก็บ project ref/keys ใน password manager ของ owner (ไม่ commit)

## B. โค้ดค้างจาก grill — ✅ **implement ครบ 5 ข้อแล้ว (2026-07-06, migrations 0085–0089)**

| # | งาน | ที่มา | สาระ | สถานะ |
|---|------|-------|------|-------|
| B1 | **Seed workflow templates** | **F9 (พบใน grill)** — keys `tpl_sla_reminder`, `tpl_sla_timeout`, `tpl_sla_timeout_pm`, `tpl_celebrate` (0033–0035/scheduler) ถูกอ้างแต่**ไม่เคย seed** → ถ้า deploy วันนี้ทุก notification = `template_unresolvable` | migration seed เข้า `line_oa_message_templates` (vertical null = shared, ≤200 ตัวอักษร, น้ำเสียงไทยอบอุ่นตาม Req 12.2) — ต้องผ่าน template governance review | ✅ `0085` — 5 keys (เพิ่ม `tpl_daily_digest` ที่ 0060 อ้างด้วย); review ผ่าน PR นี้ |
| B2 | **คำนวณ `in_quiet_hours` ที่ DB** | **F10 (พบใน grill)** — ทุก caller ส่ง default false → digest ไม่มีทางเกิดจริง | แก้ `rpc_dispatch_notification`: default ของ `p_in_quiet_hours` = คำนวณจากนาฬิกา DB (`Asia/Bangkok` ∈ 20:00–08:00) เมื่อ caller ไม่ส่งค่า — ค่าตาม glossary ที่ owner กำหนด | ✅ `0086` — `fn_wf_in_quiet_hours()` + default null ทั้ง dispatch/complete + scheduler เลิก hardcode false + TS mirror `quiet-hours.ts` |
| B3 | **Cron migration (pg_cron + pg_net)** | มติ grill Q2 — schedule เป็น code ใน repo | migration เดียว: enable `pg_cron`+`pg_net` → `cron.schedule` 3 รายการ: `notification-retry` ทุก 1 นาที · `sla-sweep` ทุก 15 นาที · `daily-digest` `0 1 * * *` UTC (= 08:00 ไทย, POST body `{"assemble_digest":true}`) — ยิง HTTP ไป Edge Functions โดย service key อ่านจาก Vault (ห้าม hardcode) | ✅ `0089` — Vault refs: `wf_edge_base_url` + `wf_edge_service_key` (seed ใน C3); local dev ไม่มี extension → ข้ามอย่างปลอดภัย |
| B4 | **F8 requote full-revert** | ADR-037 | `rpc_request_scope_change(+p_gate)` เก็บ gate ใน `_requote` → accept ครบคู่: ปลด lock gate นั้น + revert `current_step` (inverse `fn_wf_gate_for_step`) → เข้าวงจรอนุมัติใหม่ → trigger 0084 re-lock เอง + tests | ✅ `0087` — `fn_wf_step_for_gate` + revert step/order + เคลียร์ `_requote`; mirror+tests ใน `requote-fsm.ts`/`gate-wiring.ts` |
| B5 | **ADR-038 binding extension** | grill Q5 | migration: `identity_binding` += `consent_at`,`bound_at`,`revoked_at` (โครงรองรับ bind-link/LINE Login flow ของ installation-pm Phase 1.8) | ✅ `0088` — backfill `bound_at`=created_at; `consent_at` คง null จนมี PDPA flow จริง |

## C. Deploy + Seed

- **C1** `supabase db push` — apply migrations ทั้งหมด (0000…0084 + ของใหม่จาก B) — ตรวจ `supabase migration list` ตรงกับ repo
- **C2** `supabase functions deploy` ×8: `line-webhook`, `line-outbound-sender`, `approval-postback`, `web-fallback-api`, `notification-retry-worker`, `sla-sweep-scheduler`, `capture-ingest`/`field-capture`, **`capture-media-worker` (0099 — ดึงรูป LINE เข้า Storage)** · ตั้ง LINE webhook URL ชี้ `line-webhook`
- **C3 Seed data (ลำดับสำคัญ):**
  1. `line_oa_channels` 1 แถว (vertical `monolith`, Vault refs จาก A3)
  2. ~~Templates จาก B1~~ ✅ อยู่ใน migration `0085` แล้ว — มากับ `db push` (C1) เอง
  3. Knowledge import: `rpc_import_knowledge` จาก Knowledge_Export ฉบับ approved (RACI/process model — ถ้าไม่มี import ที่ `is_current` ทุก resolve จะ fail-safe block)
  4. **`identity_binding`**: ผู้ใช้ Wave 2 ทุกคน (LINE Login ผูกครั้งเดียว) + **`app_role` สำหรับผู้อนุมัติ** (map approver ref → คน — ไม่มีข้อมูลนี้ reminder/timeout จะ `recipient_unresolvable` ตามดีไซน์ 0084)
  5. **Vault secrets สำหรับ cron (B3/0089)**: `wf_edge_base_url` = `https://<ref>.supabase.co` + `wf_edge_service_key` = service role key (Dashboard → Vault) — ยังไม่ seed ก็ไม่ error: job จะ audit `cron_secrets_missing` แล้วข้ามจนกว่าจะครบ
  6. **LINE OA console (ศูนย์โค้ด — G1 จากคำถาม "ลูกค้าคนที่ 1")**: ตั้ง Greeting Message ตอน add เพื่อน (ข้อความต้อนรับ + แนะนำให้ทักได้เลย) — flow ต่อจากนั้น (conversation + customer identity) ระบบสร้างเองอัตโนมัติ
- **C4** Env ของ functions: `SUPABASE_URL`/`SERVICE_ROLE_KEY` (อัตโนมัติ) — ไม่มี secret เพิ่ม

## D. Verify + เปิด Wave 2

- **D1** Dry-run: เรียก `sla-sweep-scheduler` (POST เปล่า) + `notification-retry-worker` ด้วยมือ → summary ต้อง 200; แถว notification ทดสอบ 1 แถวต้องเดินครบ queued→sent (LINE push ถึงจริง)
- **D2** ทดสอบ end-to-end 1 work item: create → handoff → resolve approver (มี delegation ทดสอบ 1 ราย → ต้อง route) → กดอนุมัติจาก LINE → reject 1 รอบที่ design gate → classify → (ถ้า B4 แล้ว) scope_change → requote loop
- **D3** เช็ค audit log ครบทุก event + ไม่มี secret/PII ใน function logs → เปิดผู้ใช้ Wave 2 (office staff ตาม PRD §4)
- **D4** สัปดาห์แรก: ดู `notification` failed rate + `delivery_failure` audit — ถ้า `recipient_unresolvable` สูง = app_role bindings ไม่ครบ (C3.4)

## Findings ใหม่จาก grill (เพิ่มเข้า scrutiny report)

- **F9**: workflow template keys ไม่เคย seed → B1
- **F10**: `in_quiet_hours` ไม่มีใครคำนวณ (Quiet_Hours เพิ่งได้ค่าจริง 20:00–08:00 จาก grill นี้) → B2
- **F11 (terminology)**: ตาราง binding ซ้ำสองระบบ → ยุบแล้วตาม ADR-038

## สิ่งที่จงใจไม่ทำตอนนี้

- CI auto-deploy ของ functions/migrations — รอบแรก manual ตาม runbook เพื่อคุมลำดับ seed; ตั้ง CI หลัง D3 เสถียร
- Self-host ไทย — เป็น exit ของ ADR-036 ไม่ใช่เงื่อนไขเปิด Wave 2
