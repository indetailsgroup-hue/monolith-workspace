# 🚀 MONOLITH Production Deployment Checklist
## Go-Live สำหรับ DAPH Decor — ฉบับสมบูรณ์

> อิง: OPS-RUNBOOK-Provision.md + PRD + Deep Review (27 ส.ค. 2026)  
> เวลาโดยประมาณทั้งหมด: **~2 สัปดาห์** (เตรียม 5 วัน + verify 5 วัน + buffer 4 วัน)  
> **กติกา: ทำตามลำดับบนลงล่าง ห้ามข้ามขั้น — ระบบมี dependency chain**

---

## สถานะ: 🟡 = ยังไม่ทำ | ✅ = ทำแล้ว | ⏳ = กำลังทำ

---

## Phase 0 · ตัดสินใจเชิงธุรกิจ (Owner ต้องยืนยัน)

> ❗ ข้อเหล่านี้ไม่ใช่งานเทคนิค — เป็นมติที่ต้องก่อน go-live

| # | รายการ | ผู้รับผิดชอบ | สถานะ |
|---|--------|-------------|--------|
| 0.1 | ✍️ เลือก Go-live Strategy: **Big Bang** (ทั้งบริษัท) vs **Wave** (ทีมละ wave) | Owner + GM | 🟡 |
| 0.2 | ✍️ ยืนยันว่า Wave แรกคือใคร (แนะนำ: Designer + Production Planner + PM = 10-15 คน) | Owner | 🟡 |
| 0.3 | ✍️ กำหนดวัน Go-live (อย่าตรงกับงานด่วนลูกค้า) | Owner + PM | 🟡 |
| 0.4 | ✍️ งบประมาณ Supabase Pro (est. ~$25/mo เริ่มต้น) + LINE OA (ฟรี / ถ้าข้อความเกิน 200/mo = Premium) | Owner + Finance | 🟡 |
| 0.5 | ✍️ ส่ง Contract Template ให้ทนาย review (ดู CONTRACT-REVIEW-CHECKLIST.md) | Owner + Legal | 🟡 |
| 0.6 | ✍️ เตรียม Knowledge Export (RACI Matrix + Process Model) — approve ฉบับ official | Designer Mgr + PM | 🟡 |
| 0.7 | ✍️ ตั้งเรทแรงงาน (บาท/ชม.) + ช่วงราคาวัสดุ (per grade) สำหรับ Job Cost | Finance + Production | 🟡 |

---

## Phase 1 · Infrastructure Provision (ครั้งเดียว ~2 ชม.)

### 1A. Supabase Project

| # | รายการ | เวลา | สถานะ |
|---|--------|------|--------|
| 1A.1 | สร้าง Supabase project: region `ap-southeast-1` (Singapore), Postgres 17, ชื่อ `daph-ops-bridge-sg` | 5 min | 🟡 |
| 1A.2 | จด 4 ค่า → password manager: `Project ref`, `Project URL`, `anon key`, `service_role key` | 2 min | 🟡 |
| 1A.3 | เปิด PITR backup + ตั้ง billing alert + ยอมรับ DPA (Settings → Legal) | 5 min | 🟡 |
| 1A.4 | บันทึก exit criteria ADR-036 ลง issue tracker | 2 min | 🟡 |
| 1A.5 | เครื่อง dev: `supabase link --project-ref <ref>` | 1 min | 🟡 |

### 1B. LINE Channels (2 ช่อง)

| # | รายการ | เวลา | สถานะ |
|---|--------|------|--------|
| 1B.1 | สร้าง LINE Official Account + เปิด Messaging API | 15 min | 🟡 |
| 1B.2 | จด `channel_secret` + `channel_access_token` → password manager | 2 min | 🟡 |
| 1B.3 | ปิด auto-reply, เปิด webhook (URL ตั้งทีหลัง) | 2 min | 🟡 |
| 1B.4 | สร้าง LINE Login channel (สำหรับพนักงาน) | 10 min | 🟡 |
| 1B.5 | จด Login `channel_id` + `channel_secret` → password manager | 2 min | 🟡 |
| 1B.6 | ตั้ง Callback URL = `https://<org>.github.io/<repo>/` (รวม trailing slash) | 2 min | 🟡 |
| 1B.7 | ตั้ง Greeting Message: ข้อความต้อนรับ + "ทักได้เลยครับ" | 5 min | 🟡 |

### 1C. Secrets (Vault + GitHub)

| # | รายการ | ที่เก็บ | สถานะ |
|---|--------|--------|--------|
| 1C.1 | `line_channel_secret` | Supabase Vault | 🟡 |
| 1C.2 | `line_channel_access_token` | Supabase Vault | 🟡 |
| 1C.3 | `line_login_channel_id` | Supabase Vault | 🟡 |
| 1C.4 | `line_login_channel_secret` | Supabase Vault | 🟡 |
| 1C.5 | `wf_edge_base_url` (`https://<ref>.supabase.co`) | Supabase Vault | 🟡 |
| 1C.6 | `wf_edge_service_key` (service_role key) | Supabase Vault | 🟡 |
| 1C.7 | `line_messaging_channel_id` | Supabase Vault | 🟡 |
| 1C.8 | `FIELD_SUPABASE_URL` | GitHub Secrets | 🟡 |
| 1C.9 | `FIELD_SUPABASE_ANON_KEY` | GitHub Secrets | 🟡 |
| 1C.10 | `VITE_LINE_LOGIN_CHANNEL_ID` | GitHub Secrets | 🟡 |
| 1C.11 | `VITE_MONOLITH_URL` (ตั้งทีหลังได้) | GitHub Secrets | 🟡 |

---

## Phase 2 · Deploy Application (~30 min)

### 2A. Database

| # | รายการ | คำสั่ง | สถานะ |
|---|--------|--------|--------|
| 2A.1 | Push all migrations (0000→latest) | `supabase db push` | 🟡 |
| 2A.2 | ตรวจ migration list ตรง repo | `supabase migration list` | 🟡 |
| 2A.3 | ตรวจ cron jobs 12 ตัว | SQL: `select jobname from cron.job` | 🟡 |
| 2A.4 | ตรวจ Storage bucket `installation-media` | Dashboard → Storage | 🟡 |

### 2B. Edge Functions

| # | รายการ | จำนวน | สถานะ |
|---|--------|-------|--------|
| 2B.1 | Deploy core functions (11 ตัว) | `supabase functions deploy line-webhook line-outbound-sender approval-postback web-fallback-api notification-retry-worker sla-sweep-scheduler capture-ingest field-capture capture-media-worker line-login doc-view` | 🟡 |
| 2B.2 | Deploy MCP functions (3 ตัว) | `mcp-server mcp-approval-callback mcp-pending-cleanup` | 🟡 |
| 2B.3 | Deploy capture functions (2 ตัว) | `capture-ocr-extract customer-design-view` | 🟡 |
| 2B.4 | ตรวจ public endpoints (no JWT): `line-webhook`, `approval-postback`, `line-login`, `doc-view` | curl test → 200 | 🟡 |

### 2C. LINE Webhook

| # | รายการ | สถานะ |
|---|--------|--------|
| 2C.1 | LINE Developers → Webhook URL = `https://<ref>.supabase.co/functions/v1/line-webhook` | 🟡 |
| 2C.2 | กด Verify → ต้อง 200 OK | 🟡 |

### 2D. Field PWA

| # | รายการ | สถานะ |
|---|--------|--------|
| 2D.1 | GitHub Pages → Source = GitHub Actions | 🟡 |
| 2D.2 | Run workflow `field-app-pages` | 🟡 |
| 2D.3 | เปิด URL ที่ได้ → เห็นหน้า login = ผ่าน | 🟡 |

### 2E. MONOLITH Desktop (CAD/CAM)

| # | รายการ | สถานะ |
|---|--------|--------|
| 2E.1 | Build production: `npm run build` → dist/ ไม่มี error | 🟡 |
| 2E.2 | Deploy ไป hosting (Vercel/Netlify/self-host) | 🟡 |
| 2E.3 | ตั้ง env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | 🟡 |
| 2E.4 | ทดสอบ: เปิดเว็บ → เห็น 3D Canvas + login ได้ | 🟡 |

---

## Phase 3 · Seed Data (ลำดับสำคัญ ห้ามสลับ! ~30 min)

| # | รายการ | ทำไมสำคัญ | สถานะ |
|---|--------|-----------|--------|
| 3.1 | `line_oa_channels` 1 แถว (vertical `monolith`) | ไม่มี = ส่งข้อความไม่ได้ | 🟡 |
| 3.2 | Knowledge Import (`rpc_import_knowledge`) | ไม่มี = RACI resolve block ทั้งระบบ | 🟡 |
| 3.3 | ผูกตัวตนพนักงาน Wave แรก (`identity_binding`) | ไม่มี = ระบบ route หาคนไม่เจอ | 🟡 |
| 3.4 | ตั้ง `app_role` ให้ผู้อนุมัติทุกคน | ไม่มี = notification `recipient_unresolvable` | 🟡 |
| 3.5 | `ops_contacts` — PM, ผจก.โครงการ, หัวหน้าออกแบบ, การเงิน | ไม่มี = escalation ส่งไม่ถึง | 🟡 |
| 3.6 | Config ตัวเลข: labor rate, price rate, market bands, SLA | ไม่มี = Job Cost ไม่ทำงาน | 🟡 |
| 3.7 | Designer profiles (สไตล์ที่ถนัด) | ไม่มี = roster ไม่ match | 🟡 |
| 3.8 | สร้างกลุ่ม LINE ทีมโรงงาน + ผูก OA | ไม่มี = การ์ดโรงงานส่งไม่ได้ | 🟡 |

---

## Phase 4 · Security & Compliance

| # | รายการ | ความเสี่ยงถ้าไม่ทำ | สถานะ |
|---|--------|-------------------|--------|
| 4.1 | ✅ ตรวจ RLS policies ครอบคลุมทุกตาราง | Data leak | 🟡 |
| 4.2 | ✅ ตรวจไม่มี secret/PII ใน function logs | PDPA violation | 🟡 |
| 4.3 | ✅ Contract template ผ่านทนาย review | Legal risk | 🟡 |
| 4.4 | ✅ PDPA consent flow ใน LINE (ข้อมูล+รูป) | กฎหมาย | 🟡 |
| 4.5 | ✅ Backup policy ทำงาน (PITR test restore) | Data loss | 🟡 |
| 4.6 | ✅ Service role key ไม่ expose ใน client-side code | Critical security | 🟡 |
| 4.7 | ✅ CORS ตั้งถูก (อนุญาตเฉพาะ domain ที่ใช้) | XSS risk | 🟡 |
| 4.8 | ✅ Rate limiting บน public endpoints | DDoS | 🟡 |

---

## Phase 5 · Testing & Verification (Dogfood ~45 min)

> ใช้ "บ้านทดสอบระบบ" 1 หลัง — ทดสอบเต็มวง จบแล้วปิดทิ้ง

| # | Test Case | คาดหวัง | สถานะ |
|---|-----------|---------|--------|
| 5.1 | **ท่อแจ้งเตือน**: เรียก `notification-retry-worker` + `sla-sweep-scheduler` | 200 + LINE push ถึงจริง | 🟡 |
| 5.2 | **Sale เปิดงาน**: PWA → เปิดใบความต้องการ → ได้ `#ผูก` code | Code ถูกต้อง | 🟡 |
| 5.3 | **LINE Login พนักงาน**: มือถือ → LINE Login → PWA login สำเร็จ | ไม่ redirect_uri error | 🟡 |
| 5.4 | **ราคา/สัญญา/เงิน**: ตั้งแผน 4 งวด → generate สัญญา → ส่ง → การ์ดงวด 1 เข้ากลุ่ม | เนื้อหาถูก ไม่มี `%%` | 🟡 |
| 5.5 | **Roster**: เลือก Designer → อนุมัติ → push ถึงคนถูก | Notification ถูกคน | 🟡 |
| 5.6 | **โรงงาน**: `#ผูก code โรงงาน` → รายงานสถานี → การ์ด "เริ่มผลิต" เข้ากลุ่มลูกค้า | Gate block ถ้างวดไม่เข้า | 🟡 |
| 5.7 | **หัวหน้าติดตั้ง**: เข้างาน → ติ๊กทีม → แจ้งปัญหา → เลิกงาน → รายงาน + Job Cost | Man-hours บันทึก | 🟡 |
| 5.8 | **ปิดบ้าน**: ช่างถ่ายรูป → ปิดบ้าน → QC → ส่งตรวจรับ → ลูกค้ากด Flex → การ์ดขอบคุณ+ประกัน | Block ถ้า issue ค้าง | 🟡 |
| 5.9 | **Offline mode**: เปิด airplane → ถ่ายรูป → เปิด internet → sync ขึ้น | Retry สำเร็จ | 🟡 |
| 5.10 | **Audit trail**: ตรวจ audit log ครบทุก event | ไม่มี gap | 🟡 |
| 5.11 | **CAD → Factory**: ออกแบบตู้ → Gate pass → Export packet → Factory job | Deterministic hash | 🟡 |
| 5.12 | **Cut List XLSX**: Download → เปิด Excel → 3 tabs ข้อมูลถูก | ไม่มี cell ว่าง | 🟡 |
| 5.13 | **Nesting PDF**: Export → เปิด PDF → sheet layouts ถูก | สัดส่วนตรง | 🟡 |

---

## Phase 6 · Training & Onboarding

| # | กลุ่ม | เนื้อหา | ระยะเวลา | สถานะ |
|---|-------|---------|----------|--------|
| 6.1 | **Designer** (3-5 คน) | 3D Cabinet Builder, Material, Hardware, Gate, Export | 2 วัน | 🟡 |
| 6.2 | **Production Planner** (2-3 คน) | Cut List, Nesting, DXF, Factory Packet | 1 วัน | 🟡 |
| 6.3 | **Sales** (3-5 คน) | PWA ใบความต้องการ, LINE workflow | 0.5 วัน | 🟡 |
| 6.4 | **Installation Team Lead** (5+ คน) | Field app, photo capture, report | 0.5 วัน | 🟡 |
| 6.5 | **PM** (1-2 คน) | Dashboard, SLA, escalation, approve | 1 วัน | 🟡 |
| 6.6 | **Finance** (1-2 คน) | งวดจ่าย, Job Cost, ใบเสร็จ | 0.5 วัน (เมื่อ Finance UI พร้อม) | 🟡 |
| 6.7 | สร้าง Quick-start guide (1 หน้า per role) | Thai language, screenshots | 1 วัน | 🟡 |

---

## Phase 7 · Monitoring & Observability (สัปดาห์แรก)

| # | รายการ | Action ถ้าผิดปกติ | สถานะ |
|---|--------|------------------|--------|
| 7.1 | ดู `notification` failed rate | `recipient_unresolvable` สูง → binding ไม่ครบ (P3) | 🟡 |
| 7.2 | ดู `cron_secrets_missing` audit | Vault ไม่ครบ → เติม secret | 🟡 |
| 7.3 | ดู `gate_sla_escalated` frequency | ถี่ → SLA สั้นไป หรือ designer ล้น | 🟡 |
| 7.4 | ดู `delivery_failure` audit | LINE push ไม่ถึง → token หมดอายุ / block | 🟡 |
| 7.5 | ตรวจ function execution time | >10s → optimize | 🟡 |
| 7.6 | จด friction ทุกข้อจากผู้ใช้จริง | รอบ review ถัดไป | 🟡 |
| 7.7 | ตรวจ Supabase billing (bandwidth/storage) | ไม่ให้เกินงบ | 🟡 |

---

## Phase 8 · Rollback Plan (ถ้าเกิดปัญหาหนัก)

| สถานการณ์ | Action |
|-----------|--------|
| Database corrupted | Restore จาก PITR (Supabase Dashboard → Backups) |
| Edge Function crash | `supabase functions deploy <fn>` จาก commit ก่อนหน้า |
| LINE webhook fail | ปิด webhook ใน LINE console → ใช้ manual process ชั่วคราว |
| User ใช้ไม่ได้ทั้งระบบ | Revert migration: `supabase db reset` (⚠️ extreme — ใช้เมื่อจำเป็นจริงๆ) |
| CAD/CAM deploy fail | Revert hosting ไป commit ก่อน (Vercel/Netlify auto-rollback) |

---

## Phase 9 · สิ่งที่จงใจไม่ทำตอน Go-live

| รายการ | เหตุผล | ทำเมื่อไหร่ |
|--------|--------|------------|
| CI/CD auto-deploy | Manual รอบแรกเพื่อคุม seed order | หลัง Week 2 เสถียร |
| Self-host ในไทย | Exit criteria ADR-036 — ไม่ใช่เงื่อนไข go-live | เมื่อข้อมูลลูกค้าเต็มระบบ |
| Payment gateway | ปัดตก ADR-041 — ใช้ bank transfer + manual confirm | ถ้า volume สูงพอ |
| E-signature | ปัดตก — ใช้ LINE tap approve แทน | อนาคต |
| Commission system | ปัดตก Sale-3/Sale-4 | อนาคต |
| Multi-tenant SaaS | Not in scope | ไม่ทำ |

---

## Phase 10 · Success Criteria (ผ่าน Go-live)

| # | เกณฑ์ | วิธีตรวจ |
|---|-------|---------|
| ✅ | Migrations ครบ + cron 12 ตัวทำงาน | `cron.job` count = 12 |
| ✅ | Edge functions 17 ตัว deploy สำเร็จ | Dashboard → Functions |
| ✅ | LINE webhook verify = 200 | LINE Console |
| ✅ | Dogfood test V1–V10 ผ่านครบ | Checklist ด้านบน |
| ✅ | ไม่มี PII ใน logs | Supabase Logs inspect |
| ✅ | ผู้ใช้ Wave 1 login ได้ + เห็นงานตัวเอง | ทดสอบ 3 คนจาก 3 role |
| ✅ | Contract template ผ่านทนาย (ถ้าจะใช้สัญญา) | ลายเซ็นทนาย |
| ✅ | Knowledge import `is_current` = true | SQL verify |
| ✅ | Owner sign-off | ลายเซ็น GM/MD |

---

## 📋 สรุป Timeline แนะนำ

```
สัปดาห์ 1:
  วันจันทร์     Phase 0 (มติเจ้าของ) + Phase 1A-1B (Provision)
  วันอังคาร     Phase 1C (Secrets) + Phase 2 (Deploy)
  วันพุธ        Phase 3 (Seed) + Phase 4 (Security check)
  วันพฤหัสบดี   Phase 5 (Dogfood testing V1-V7)
  วันศุกร์      Phase 5 (V8-V13) + fix issues

สัปดาห์ 2:
  วันจันทร์-อังคาร    Phase 6 (Training: Designer + Planner)
  วันพุธ             Phase 6 (Training: Sales + Install + PM)
  วันพฤหัสบดี        🚀 GO-LIVE (เปิดผู้ใช้ Wave 1)
  วันศุกร์           Phase 7 (Monitor วันแรก)

สัปดาห์ 3:
  ทั้งสัปดาห์         Phase 7 (Monitor + fix friction)
```

---

## 🔑 คำเตือนสำคัญ

1. **อย่า go-live โดยไม่มี Knowledge Import** — ระบบจะ block ทั้งหมดตาม design (fail-safe)
2. **อย่าข้าม Legal gate** — สัญญา/VO ที่ไม่ผ่านทนายมีความเสี่ยงสูง
3. **เริ่ม Wave เล็ก** — 10 คนก่อน เก็บ friction 1 สัปดาห์ แล้วค่อยขยาย
4. **Secret ทุกตัวต้องอยู่ใน Vault/password manager เท่านั้น** — ห้าม commit, ห้ามแปะแชท
5. **สัปดาห์แรกต้องมีคนเฝ้า** — เจอ `recipient_unresolvable` สูง = binding ไม่ครบ → แก้ทันที

---

> เอกสารนี้สร้างจาก: `docs/OPS-RUNBOOK-Provision.md`, `docs/OPS-RUNBOOK-Wave2.md`, `docs/CONTRACT-REVIEW-CHECKLIST.md`, `docs/PRD.md`, codebase v13.4.0
