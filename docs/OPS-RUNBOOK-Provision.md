# Ops Runbook — Provision ฉบับกดตามทีละขั้น (chain 0000→0131)

> **ฉบับนี้แทน** [OPS-RUNBOOK-Wave2.md](OPS-RUNBOOK-Wave2.md) (ยุค 0099) — รวมทุกอย่างที่เพิ่มหลังจากนั้น:
> Field PWA 4 บทบาท · LINE Login · การเงิน 4 งวด · โรงงาน 6 สถานี · roster · after-sales · lead follow-up ·
> Job Cost/C6 · cron 8 ตัว — **ทำตามลำดับบนลงล่าง ติ๊กทีละข้อ ห้ามข้าม** (ลำดับ seed สำคัญ)
>
> เวลาโดยประมาณทั้งหมด: ~2–3 ชั่วโมง (ไม่รวมรอ LINE อนุมัติ channel)

---

## P0 · เตรียมของก่อนเริ่ม (10 นาที)

- [ ] **P0.1** บัญชีพร้อม: Supabase (org DAPH) · LINE Developers Console (บัญชีบริษัท) · GitHub (repo นี้ สิทธิ์ admin)
- [ ] **P0.2** เครื่อง: `supabase` CLI login แล้ว (`supabase login`) · repo อยู่ที่ commit ล่าสุดของ `main`
- [ ] **P0.3** เปิด password manager ของบริษัท — ทุก secret ในเอกสารนี้จดที่นั่นที่เดียว **ห้าม commit / ห้ามแปะแชท**

## P1 · Supabase Project (15 นาที — ADR-036)

- [ ] **P1.1** Dashboard → New project: region **`ap-southeast-1` (Singapore)** · Postgres 17 · ชื่อ `daph-ops-bridge-sg`
- [ ] **P1.2** จด 4 ค่าใส่ password manager: `Project ref` · `Project URL` (`https://<ref>.supabase.co`) · `anon key` · `service_role key`
- [ ] **P1.3** ตั้งแต่วันแรก: เปิด **PITR backup** · ตั้ง **billing alert** · ยอมรับ **DPA** (Settings → Legal)
- [ ] **P1.4** บันทึก exit criteria ADR-036 ลง issue tracker: *ย้ายเข้าโครงสร้างไทยก่อน (ก) เปิด ledger production หรือ (ข) ข้อมูลลูกค้าจริงเต็มระบบ*
- [ ] **P1.5** ในเครื่อง: `supabase link --project-ref <ref>`

## P2 · LINE Channels (30 นาที + รออนุมัติ)

> ต้องมี **2 channels แยกกัน** ใต้ provider เดียวกัน

- [ ] **P2.1 LINE Official Account (Messaging API)** — ช่องทางคุยกับลูกค้า/กลุ่ม
  - สร้าง OA + เปิด Messaging API · จด `channel_secret` + ออก `channel_access_token` (long-lived) ใส่ password manager
  - ปิด auto-reply / เปิด webhook (URL จะตั้งใน P4.4)
- [ ] **P2.2 LINE Login channel** — สำหรับพนักงานเข้า Field PWA
  - สร้าง LINE Login channel · จด `channel_id` + `channel_secret`
  - **Callback URL** = URL ของ Field PWA บน GitHub Pages: `https://<org>.github.io/<repo>/` (ต้องตรงเป๊ะรวม trailing slash — โค้ดส่ง `location.origin + location.pathname`)
- [ ] **P2.3** OA console → ตั้ง **Greeting Message** ตอน add เพื่อน (C3.6 เดิม): ข้อความต้อนรับ + "ทักได้เลยครับ" — flow หลังจากนั้นระบบสร้าง conversation + identity เอง

## P3 · Secrets (15 นาที)

- [ ] **P3.1 Supabase Vault** (Dashboard → Project Settings → Vault) — สร้าง 6 รายการชื่อ**ตรงตัว**:
  | ชื่อใน Vault | ค่า | ใช้โดย |
  |---|---|---|
  | `line_channel_secret` * | จาก P2.1 | line-webhook (ตรวจ signature) |
  | `line_channel_access_token` * | จาก P2.1 | line-outbound-sender / media worker |
  | `line_login_channel_id` | จาก P2.2 | edge fn `line-login` |
  | `line_login_channel_secret` | จาก P2.2 | edge fn `line-login` |
  | `wf_edge_base_url` | `https://<ref>.supabase.co` | pg_cron → edge (0089) |
  | `wf_edge_service_key` | service_role key | pg_cron → edge (0089) |

  \* ชื่อ ref สองตัวแรกต้องตรงกับที่ seed ใน `line_oa_channels` (P5.1) — เปิดไฟล์ seed เทียบก่อนกด
- [ ] **P3.2 GitHub repo → Settings → Secrets → Actions** — 4 รายการ:
  - `FIELD_SUPABASE_URL` = Project URL
  - `FIELD_SUPABASE_ANON_KEY` = anon key
  - `VITE_LINE_LOGIN_CHANNEL_ID` = channel id จาก P2.2
  - `VITE_MONOLITH_URL` = URL เปิด MONOLITH desktop (มีเมื่อไหร่ค่อยตั้ง — ไม่ตั้ง ปุ่ม "เปิดใน MONOLITH" จะซ่อนเอง)

## P4 · Deploy (20 นาที)

- [ ] **P4.1** `supabase db push` — apply migrations ทั้งหมด 0000→0131 · ตรวจ: `supabase migration list` ตรงกับ repo ทุกแถว
- [ ] **P4.2** ตรวจ cron เกิดครบ **9 ตัว** (SQL Editor):
  ```sql
  select jobname, schedule from cron.job order by jobname;
  -- ต้องเห็น: wf-after-sales-sweep · wf-daily-digest · wf-gate-sla-sweep · wf-issue-sla-sweep
  --          wf-lead-followup-sweep · wf-media-fetch · wf-notification-retry · wf-payment-overdue-sweep · wf-sla-sweep
  ```
- [ ] **P4.3** Deploy edge functions **11 ตัว**:
  ```
  supabase functions deploy line-webhook line-outbound-sender approval-postback \
    web-fallback-api notification-retry-worker sla-sweep-scheduler \
    capture-ingest field-capture capture-media-worker line-login doc-view
  ```
- [ ] **P4.3b** ตรวจว่า deploy อ่าน verify_jwt จาก config.toml: 4 endpoint สาธารณะ (line-webhook / approval-postback / line-login / doc-view) ต้องเปิดได้โดยไม่มี JWT — ทดสอบ: curl doc-view?token=มั่ว ต้องได้หน้า HTML ไม่ใช่ 401
- [ ] **P4.4** LINE Developers (OA จาก P2.1) → Webhook URL = `https://<ref>.supabase.co/functions/v1/line-webhook` → กด Verify ต้อง 200
- [ ] **P4.5** ตรวจ Storage bucket `installation-media` เกิดจาก migration (Dashboard → Storage) — ไม่มี = รัน 0099 ส่วน bucket ซ้ำใน SQL Editor
- [ ] **P4.6 Field PWA**: GitHub repo → Settings → Pages → Source = GitHub Actions → รัน workflow `field-app-pages` (Actions → Run workflow) → เปิด URL ที่ได้ เห็นหน้า login = ผ่าน

## P5 · Seed ตามลำดับ (30 นาที — **ลำดับสำคัญ ห้ามสลับ**)

- [ ] **P5.1** `line_oa_channels` 1 แถว (vertical `monolith`, Vault refs ชื่อตรง P3.1) — SQL Editor
- [ ] **P5.2** Knowledge import: `rpc_import_knowledge` จาก Knowledge_Export ฉบับ approved — *ไม่มี import ที่ `is_current` = ทุก RACI resolve จะ fail-safe block ทั้งระบบ (ตามดีไซน์)*
- [ ] **P5.3** ผูกตัวตนพนักงาน Wave แรกทุกคน — สองทางเลือก:
  - ทาง ก (แนะนำ): ออก bind link จากระบบ (`rpc_field_issue_staff_bind` → ส่งลิงก์ `?bind=<token>` ให้กด LINE Login เอง — consent + binding + auth ครบจังหวะเดียว)
  - ทาง ข (มือ): insert `identity_binding` ตรง (ต้องมี `employee_id`, `line_user_id`, `department`, `app_role`, `site_code`)
  - **สำคัญ:** `app_role` ต้องครบทุกคนที่เป็นผู้อนุมัติ/ผู้รับ route: ค่าที่ระบบ match = `B1 B2 B4 C1 C2 D1 D3 D4 E2 E5 E6 E7 HSE Sale` + roles ระดับ governance (`admin`/`operations`/`finance`/`executive_owner` ใน app_metadata.roles)
- [ ] **P5.4** `ops_contacts` — ผู้รับตามบทบาทกลาง (จำเป็นต่อ SLA/escalation/รายงาน):
  ```sql
  select rpc_field_set_ops_contact('D1', '<uuid PM>');      -- SLA ไต่ + shop drawing requote + รายงาน
  select rpc_field_set_ops_contact('D2', '<uuid ผจก.โครงการ>'); -- รายงานประจำวัน
  select rpc_field_set_ops_contact('D3', '<uuid หัวหน้าฝ่ายติดตั้ง>'); -- รายงานประจำวัน
  select rpc_field_set_ops_contact('B1', '<uuid หัวหน้าออกแบบ>');   -- gate SLA escalate
  select rpc_field_set_ops_contact('F3', '<uuid เจ้าหน้าที่การเงิน>'); -- งวดค้างชำระ escalate
  ```
- [ ] **P5.5** Config ตัวเลข (governance ทั้งหมด):
  ```sql
  select rpc_field_set_lead_config(3, 7, '<uuid H1 หัวหน้าขาย>'); -- ตาม lead 3/7 วัน + FYI H1
  select rpc_field_set_labor_rate(<เรทแรงงาน บาท/ชม.>);          -- Job Cost (ตั้งช้า = backfill ได้)
  select rpc_field_set_price_rate('<เกรดวัสดุ>', <min>, <max>);   -- ช่วงราคา Sale ต่อเกรด (ทุกเกรดที่ขาย)
  -- SLA gate โรงงาน: default 240 นาที — ปรับ: update factory_gate_config set sla_minutes=... where station=...;
  ```
- [ ] **P5.6** Designer profiles (B1 กรอก ~10 นาที): `select rpc_field_set_designer_profile('<uuid>', array['โมเดิร์น','มินิมอล']);` ต่อคน
- [ ] **P5.7** กลุ่มโรงงานถาวร 1 กลุ่ม: สร้างกลุ่ม LINE ทีมโรงงาน + ดึง OA เข้า → ในระบบออกรหัส (`rpc_field_issue_bind_code` จากบ้าน dummy ไม่ได้ — factory ใช้คำสั่ง `#ผูก <code> โรงงาน` ที่ handler รองรับ; ออก code ผ่านบ้านแรกที่เปิดจริงก็ได้)

## P6 · Verify ทีละวงจร (45 นาที — dogfood เต็มวง)

> ใช้บ้านทดสอบ 1 หลัง ชื่อ "บ้านทดสอบระบบ" — จบแล้วปิด lead/บ้านทิ้งได้ ทุกอย่างอยู่ใน audit

- [ ] **V1 ท่อแจ้งเตือน**: เรียก `notification-retry-worker` + `sla-sweep-scheduler` ด้วยมือ (POST เปล่า + service key) → 200; แถวทดสอบเดิน queued→sent → **LINE push ถึงมือถือจริง**
- [ ] **V2 Sale เปิดงาน**: login PWA (magic link ก่อน) → งานขาย → เปิดใบความต้องการ → ได้รหัส `#ผูก` ทันที → ตั้งกลุ่ม LINE ลูกค้าทดสอบ → พิมพ์ `#ผูก <code> ลูกค้า` → bot ack **มีชื่อบ้านถูกต้อง**
- [ ] **V3 LINE Login พนักงาน**: เปิด PWA มือถือ → เข้าด้วย LINE → กลับมา login สำเร็จ (ตรวจ P2.2 callback ถ้า error `redirect_uri`)
- [ ] **V4 ราคา/สัญญา/เงิน**: ช่วงราคา (เรทที่ตั้ง) → ตั้งแผน 4 งวด → generate สัญญา (เนื้อหาถูก ไม่มี `%%`) → ส่ง → บันทึกเซ็น → **การ์ดงวด 1 เข้ากลุ่มอัตโนมัติ** → F3 กดรับเงิน
  - ⚖️ **Legal gate (ADR-044 R-6)**: ก่อนใช้สัญญา/VO กับลูกค้าจริง — ผ่าน [CONTRACT-REVIEW-CHECKLIST.md](CONTRACT-REVIEW-CHECKLIST.md) (ส่งทนาย review skeleton ครั้งเดียว) — ระหว่างยังไม่ผ่าน เอกสารมี marker "รอทนาย review" กำกับอยู่แล้ว
- [ ] **V5 Roster**: เลือกดีไซเนอร์จาก list → อนุมัติ → คนถูกมอบหมายได้ push → เชิญเข้ากลุ่ม → สถานะเป็น ✅ อยู่ในกลุ่มเอง
- [ ] **V6 โรงงาน**: `#ผูก <code> โรงงาน` ในกลุ่มโรงงาน → รายงานสถานีแรก (block ถ้างวดก่อนผลิตไม่เข้า → override PM ต้องใส่เหตุผล) → **การ์ด "เริ่มผลิต" เข้ากลุ่มลูกค้า** → gate assembly → designer เห็นในคิว + approve → การ์ดที่ 2
- [ ] **V7 หัวหน้า**: หน้าหัวหน้า → เข้างานติ๊กทีม → แจ้งปัญหา (เลือก "ของขาด" → คนที่ role E6 ได้ push) → เย็นกดเลิกงาน+ส่งรายงาน → D1/D2/D3 ได้รายงาน + Job Cost มี man-hours
- [ ] **V8 ปิดงาน**: ช่างติ๊กเลน+ถ่ายรูป (offline ได้ — เปิด airplane mode ทดสอบ retry) → ปิดบ้าน → QC ผ่าน → ส่งตรวจรับ (block ถ้า issue ค้าง/QC ไม่ผ่าน) → ลูกค้ากดการ์ด Flex → **การ์ดขอบคุณ+ประกัน 1 ปี** อัตโนมัติ
- [ ] **V9 หลังบ้าน**: `rpc_field_job_cost_summary` เห็นต้นทุน+P&L | `rpc_field_sales_summary` เห็นยอด | audit log ครบทุก event | **ไม่มี secret/PII ใน function logs**
- [ ] **V10** ลบ/ปิดข้อมูลบ้านทดสอบ (ปิด lead + mark cancelled) → เปิดผู้ใช้จริง Wave แรก

## P7 · สัปดาห์แรก (เฝ้าดู)

- [ ] ดู `notification` failed rate — `recipient_unresolvable` สูง = `app_role` binding ไม่ครบ (กลับไป P5.3)
- [ ] ดู audit `cron_secrets_missing` = Vault P3.1 ไม่ครบ · `gate_sla_escalated` ถี่ = SLA สั้นไปหรือ designer ล้นมือ
- [ ] `lost_reasons` เริ่มมีข้อมูล → ส่งต่อ H3/H4 การตลาด
- [ ] จด friction จากผู้ใช้จริงทุกข้อ → รอบ grill ถัดไป

## สิ่งที่จงใจไม่ทำตอนนี้ (คงเดิมจาก Wave2)

- CI auto-deploy functions/migrations — manual รอบแรกเพื่อคุมลำดับ seed; ตั้ง CI หลัง V10 เสถียร
- Self-host ไทย — เป็น exit ของ ADR-036 ไม่ใช่เงื่อนไขเปิดใช้งาน
- Payment gateway / e-signature / commission — ปัดตกโดยมติแล้วทั้งหมด (ADR-041/Sale-3/Sale-4)
