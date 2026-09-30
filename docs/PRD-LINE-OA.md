# PRD — ระบบสื่อสาร LINE OA ทั้งหมด (MONOLITH Repair Intelligence)

> **ฉบับ:** 1.1 · 1 สิงหาคม 2026 (1.0 = 26 ก.ค. 2026; รอบ verify แรกโดยเซสชันก่อนหน้า 26 ก.ค., re-verify + B8/B9 โดยเซสชันนี้ 1 ส.ค.)
> **สถานะเอกสาร:** รอเจ้าของ (คุณเดฟ) ตัดสินคำถามเปิดใน §8 ก่อนลงมือเฟสถัดไป
> **หลักการเขียน:** ทุกแถวแยก "ทำงานจริง / มีโค้ดแต่ไม่ต่อสาย / อยู่แค่ spec" พร้อมอ้าง file:line
> — สถานะทั้งหมด verify จากโค้ดจริงเมื่อ 2026-07-26 ยกเว้นที่ระบุว่า "จากรอบตรวจก่อน"
> **หมายเหตุความจริง:** เอกสารเดิม (`docs/LINE-Architecture-System-Complete.md:40`, `docs/PRD.md:512`)
> ระบุ "LINE OA Commerce ✅ 20/20" — **เกินจริงสำหรับ live path** เอกสารนี้คือบันทึกสถานะที่ตรงความจริงกว่า

---

## 1. ปัญหา (Problem Statement)

MONOLITH ใช้ LINE เป็นช่องทางหลักติดต่อลูกค้าและช่างหน้างาน (ลูกค้าไทยอยู่บน LINE)
ขาเข้า (webhook, กลุ่ม, การ์ดตรวจรับ) ต่อสายครบและมี guard แน่น **แต่ขาออกหาลูกค้ายังเปิดใช้จริงไม่ได้**:
ตัวส่ง (`line-outbound-sender`) มีบั๊กร้ายแรง 3 ตัวที่ทำให้ถ้ารันจริงจะ **วนส่งข้อความซ้ำหาลูกค้าไม่รู้จบทุกแถว**
และไม่มีตารางเวลา (cron) เรียกมันในเรโปเลย ขณะที่ sweep รายคืนหลายตัวยิงข้อความลูกค้าเข้าคิวทุกวัน
ถ้าไม่ปิดช่องว่างก่อนขยายการส่งหาลูกค้า ความเสี่ยงคือสแปมกลุ่มลูกค้า = ความเชื่อมั่นแบรนด์พังทันที

---

## 2. สถานะจริงของระบบ (Verified Status Matrix)

### 2.1 ✅ ทำงานจริง — ต่อสายครบ มีตัวเรียกบน live path

| ความสามารถ | หลักฐาน | ระดับตรวจ |
|---|---|---|
| **ขาเข้า:** `line-webhook` → `rpc_ingest_line_webhook` ตรวจ HMAC, กันซ้ำด้วย `webhook_event_id` UNIQUE, แยกกลุ่ม/1:1 | `supabase/functions/line-webhook/`, `00000000000022_line_oa_ingest_webhook.sql`, HMAC `00000000000010` | จากรอบตรวจก่อน |
| **Group flows:** router `fn_line_handle_group_event` — `#ผูก`, `#ปัญหา`, รูป → capture, การ์ดตรวจรับ Flex | `0097_line_group_bot_flows.sql:101` | จากรอบตรวจก่อน + เปิดยืนยัน insert paths 2026-07-26 |
| **Guard กลุ่มลูกค้า:** `fn_line_guard_customer_group` fail-closed — template ที่ไม่ใช่ `audience='customer'` เข้ากลุ่มลูกค้าไม่ได้ | `0095:102` | จากรอบตรวจก่อน |
| **แจ้งเตือนพนักงาน:** `notification-retry-worker` + cron ทุก 1 นาที, claim แบบ `FOR UPDATE SKIP LOCKED`, exponential backoff 5 ครั้ง, dead-letter | cron: `0089_cron_schedules.sql:87` (ยืนยัน 2026-07-26), claim v3: `0084` | ยืนยัน cron 2026-07-26 |
| **Staff LINE Login + binding + consent:** `line-login` edge fn → `rpc_line_login_upsert` เก็บ `consent_at` ตอนผูก | `0105_staff_bind_login.sql:86-92` (ยืนยัน 2026-07-26) | ยืนยัน 2026-07-26 |
| **Token rotation:** cron `wf-line-token-refresh` เดือนละ 3 ครั้ง | `0154_line_token_rotation.sql:77` (ยืนยัน 2026-07-26) | ยืนยัน 2026-07-26 |
| **การยิงข้อความเข้าคิวขาออก** (จาก webhook flows + sweep รายคืน) — insert ตรง ~60 จุด | `0097:140`, `0098:93`, `0100:513`, `0101`, `0107`, `0111`, `0114:94`, `0127`, `0134`, `0136`, `0143` (ยืนยัน 2026-07-26) | ยืนยัน 2026-07-26 |

### 2.2 🔴 มีโค้ด + เทสต์ผ่าน แต่ **ใช้งานจริงไม่ได้** (บั๊กที่ verify แล้ว)

| # | ปัญหา | หลักฐาน (ยืนยัน 2026-07-26 ทั้งหมด) |
|---|---|---|
| B1 | **หยิบคิวไม่มี lock** — `claimPending` เป็น `SELECT ... status='pending' ... limit` เฉย ๆ ไม่มี `FOR UPDATE SKIP LOCKED` ไม่มี claim marker → รันคาบกัน = ส่งซ้ำ | `line-outbound-sender/index.ts:589-602` |
| B2 | **บันทึกผลส่งถูกปฏิเสธทุกแถว** — sender เรียก `rpc_record_line_send_result` ด้วย service role แต่ RPC เช็ค `is_governance_role() or has_site_access()` ซึ่งอ่าน role จาก JWT `app_metadata` (service role ไม่มี → `[]`) และ grant EXECUTE ให้แค่ `authenticated` → ส่งสำเร็จบน LINE แต่บันทึกไม่ได้ → แถวค้าง `pending` → **วนส่งซ้ำไม่รู้จบทุกแถว** | เช็คสิทธิ์: `00000000000041:162`, ที่มา role: `00000000000000_c12_foundation.sql:36`, grant: `00000000000041:253-258`, ฝั่ง sender: `index.ts:576-584, 664-669` |
| B3 | **แถวกลุ่มบันทึกผลไม่ได้ถาวร** — RPC ใช้ INNER JOIN `line_oa_conversations` แต่แถวกลุ่ม (จาก 0097+) มี `conversation_id` NULL → "not found" เสมอ | `00000000000041:143-148` vs `0097:140` |
| B4 | **ไม่มี transition guard** — `v_current_status` ถูกโหลด+lock แล้วไม่เคยเช็ค → แถว `sent` ถูก flip เป็น `failed`/บันทึกซ้ำ/audit ซ้ำได้ ขัดกับ comment ที่อ้าง "a single delivery wins" | `00000000000041:143` (โหลด), `:194-210` (update ไม่เช็ค) |
| B5 | **ส่งพลาดครั้งเดียว = ตายถาวร** — `failed` เป็นสถานะจบ ไม่มี migration ใดกู้กลับ `pending` | `00000000000041:179-199` + grep ทั้ง migrations |
| B6 | **ไม่มี cron เรียก `line-outbound-sender`** ในเรโป — cron ที่มีจริงคือ notification-retry/sla/digest (`0089:87-96`), media-fetch (`0099:140`), token refresh (`0154:77`) → ข้อความลูกค้าจาก sweep รายคืน (`0114`, `0116`, `0140`) กองในคิวโดยไม่มีตัวส่งตามตาราง | grep `cron.schedule` ทั้ง migrations |
| B7 | **เทสต์ที่มีตาบอดต่อ B1–B4** — integration test ฉีด deps ปลอมทั้งชุด ไม่เคยชน Postgres/สิทธิ์จริง | `tests/line-oa-commerce/ts/senderClaimAndRecord.integration.test.ts:43` |
| B8 | **Handler ล้มถูกนับเป็น processed + เหตุการณ์หายถาวร** — `fn_line_handle_group_event` จับ exception แล้วคืน `'handler_error:...'` แต่ skip list ใน ingest ไม่รวม prefix นี้ → insert inbound row + audit + นับ `events_processed` ตามปกติ และเพราะ inbound row เกิดแล้ว การ redeliver จาก LINE จะโดน dedupe เป็น duplicate → เหตุการณ์ที่ประมวลผลล้มเหลว**หายถาวรแบบรายงานว่าสำเร็จ** (พบครั้งแรกใน research 2026-07-31 ของเรโป product — ยืนยันว่ามีในเรโปนี้ด้วย 2026-08-01) | คืนค่า: `0097:281`, skip list: `0097:437-438`, นับ processed: `0097:454`, dedupe: `0097:429-433` |
| B9 | **`line-login` ไม่ consume OAuth `state`/OIDC `nonce`** — รับแค่ `{code, redirect_uri, bind_token?}` → เสี่ยง callback swap/replay (มีตัวช่วยบรรเทา: การผูกครั้งแรกต้องมี `bind_token` จากออฟฟิศ แต่ login รอบถัดไปไม่มีด่านนี้) (ยืนยันในเรโปนี้ 2026-08-01 — ตรงกับ finding ของ research เรโป product) | `supabase/functions/line-login/index.ts:2,9` |

### 2.3 ⚫ โค้ดสมบูรณ์ + เทสต์ผ่าน แต่ **ไม่มีผู้เรียกเลย (ตายสนิท)** — รอตัดสินเก็บ/ลบ

| ระบบ | นิยามที่ | ผลตรวจ caller (2026-07-26) |
|---|---|---|
| **Autonomy gate + brand-voice ≤200 ตัวอักษร** (`rpc_send_line_outbound`) | `00000000000040:131` | **0 caller** — อ้างถึงเฉพาะใน tests / spec / comment; ทางส่งจริงทั้งหมด insert ตรงเข้าคิว (§2.1 แถวสุดท้าย) = gate ไม่เคยคุมข้อความจริงแม้แต่ข้อความเดียว |
| **Ordering** (`rpc_create_line_order`, `line_oa_orders`) | `00000000000050:397` | 0 caller นอกเทสต์/spec |
| **Forecast sync** (`rpc_sync_line_forecast`) | `00000000000060:88` | 0 caller นอกเทสต์/spec |
| **R-03 identity merge** (`rpc_evaluate_identity_merge_candidate`) | `00000000000021:96` | 0 caller นอกเทสต์/spec |
| **Auto-close 24 ชม.** (session timeout sweep) | `00000000000061:50` | `cron.schedule` อยู่ใน **comment** — ไม่เคยถูกตั้งจริง |
| **TCCK vertical** (multi-vertical food) | กระจายใน schema (`vertical_context`) | ไม่มี flow ฝั่ง TCCK ต่อสาย (จากรอบตรวจก่อน) |

### 2.4 📝 อยู่แค่ spec — ยังไม่มีโค้ด

- PDPA consent gate ฝั่ง**ลูกค้า** — ตอนนี้ consent มีเฉพาะพนักงาน (`identity_binding.consent_at`, `0088:10`;
  ตั้งใจไว้ว่า "Phase 1.8 — ห้าม backfill consent ที่ไม่เคยเกิด" `0088:14-15`)
  **ลูกค้าไม่มีช่อง consent เลย และไม่มีด่านเช็ค consent ก่อนส่งในทุกทางส่ง**
- หน้า admin จัดการ template (ตอนนี้ seed ผ่าน migration เท่านั้น)
- Guardrails G4/G5/G7/G12 บางส่วน (ดู `docs/LINE-Architecture-System-Complete.md` §6)

---

## 3. เป้าหมาย (Goals)

1. **ศูนย์ข้อความซ้ำ:** เปิดตัวส่งลูกค้าได้โดยพิสูจน์ (ด้วยเทสต์ชน Postgres จริง) ว่ารันคาบกัน/ล้มกลางทางแล้วไม่เกิดส่งซ้ำ
2. **ทุกข้อความมีผลจบ:** แถวคิวทุกแถวจบที่ `sent` หรือ `failed` พร้อมเหตุผล — ไม่มีค้าง `pending` เกิน SLA และ `failed` ชั่วคราวได้ retry
3. **สเปกตรงความจริง:** ทุก subsystem ใน `.kiro/specs/line-oa-commerce/tasks.md` ถูก mark ตามสถานะจริง (live / dead / removed) — ไม่มี "✅ 20/20" ที่ไม่ตรง live path
4. **PDPA มีเจ้าภาพ:** มีมติเจ้าของเป็นลายลักษณ์อักษรว่า consent gate ลูกค้าต้องมีก่อนขยายหรือยอมรับความเสี่ยงชั่วคราว
5. **Ops ตรวจสอบได้:** มีรายการ cron/deploy ที่ต้องมีบน environment จริงชัดเจน (ต่อยอด `docs/OPS-RUNBOOK-Wave2.md`)

## 4. นอกขอบเขต (Non-Goals)

1. **ไม่ทำ free-text/LLM ตอบลูกค้า** — หลักเหล็ก template-only คงเดิม (แก้ที่การต่อสาย ไม่อ่อนเกณฑ์)
2. **ไม่ฟื้น ordering/forecast/TCCK ในเฟสนี้** — รอมติเก็บ/ลบ (§8 ข้อ 5) ห้ามต่อสายเงียบ ๆ
3. **ไม่ทำหน้า admin template ในเฟสนี้** — รอมติ (§8 ข้อ 6)
4. **ไม่แตะ repo manufacturing OS** — คนละระบบ
5. **ไม่ผ่อน RLS/สิทธิ์ระดับผู้ใช้** — การแก้ B2 คือให้ระบบรู้จัก service context ไม่ใช่ถอดด่านของมนุษย์

---

## 5. User Stories

**ลูกค้า (ผู้รับข้อความ):**
- ในฐานะลูกค้า ฉันต้องได้รับข้อความแจ้งสถานะงานซ่อม **ครั้งเดียวต่อเหตุการณ์** เพื่อไม่รู้สึกถูกสแปม
- ในฐานะลูกค้า ฉันต้องได้รับเฉพาะข้อความที่เหมาะกับกลุ่มลูกค้า (ไม่หลุดข้อความภายใน) — มีแล้ว (guard 0095)

**ช่าง/หัวหน้าทีม (กลุ่ม internal):**
- ในฐานะช่าง ฉันส่งรูป/`#ปัญหา` ในกลุ่มแล้วระบบรับเข้า capture/issue ได้ — มีแล้ว (0097)

**พนักงานออฟฟิศ:**
- ในฐานะพนักงาน ฉันได้รับแจ้งเตือนงานผ่าน LINE ตาม backoff ที่ถูกต้อง — มีแล้ว (0084/0089)

**เจ้าของ (คุณเดฟ):**
- ในฐานะเจ้าของ ฉันต้องรู้ว่าข้อความลูกค้าทุกแถวจบอย่างไร (sent/failed + เหตุผล + audit) และมั่นใจว่าไม่มีการส่งซ้ำ
- ในฐานะเจ้าของ ฉันต้องเห็นสถานะระบบตรงความจริง ไม่ใช่ตามเอกสารที่อ้างเสร็จ

---

## 6. Requirements

### P0 — ต้องมีก่อนเปิดส่งลูกค้าจริง (แก้ B1–B7)

| Req | รายละเอียด | Acceptance criteria (เทสต์ชน Postgres จริง, RED ก่อน) |
|---|---|---|
| P0-1 | **Claim คิวแบบ atomic:** เพิ่ม `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... WHERE status='pending' AND (claimed_at IS NULL OR claimed_at < now()-timeout) FOR UPDATE SKIP LOCKED) RETURNING` (ไม่เพิ่มค่า enum ใหม่ — เลี่ยงข้อจำกัด `ALTER TYPE` และ blast radius ผู้อ่าน status) | สอง client claim พร้อมกัน → ไม่มีแถวซ้ำ; แถว claim ค้างเกิน timeout → ถูก re-claim ได้ |
| P0-2 | **Service context บันทึกผลได้:** grant + ให้ `rpc_record_line_send_result` รู้จัก service role เป็น system actor โดยไม่อ่อนด่าน role ของผู้ใช้ | เรียกด้วย service role → บันทึกได้; เรียกด้วย user ไร้ role → ถูกปฏิเสธเหมือนเดิม |
| P0-3 | **แถวกลุ่มบันทึกผลได้:** LEFT JOIN + ดึง vertical/audit จาก `line_groups` เมื่อ `conversation_id` NULL | แถว group → recordResult สำเร็จ + audit ครบ |
| P0-4 | **Transition guard:** บันทึกผลได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้ว → `recorded=false` no-op | บันทึกซ้ำ/flip `sent`→`failed` → ถูกปฏิเสธ, audit ไม่ซ้ำ |
| P0-5 | **LINE-level dedupe:** ใส่ `X-Line-Retry-Key` = outbound id ในการ push (`index.ts:542-549`) | ปิดหน้าต่างส่งซ้ำข้าม timeout (ส่งแล้วแต่บันทึกพลาด) |
| P0-6 | **Retry จำกัดครั้งสำหรับ transient failure** (แนว claim v3 ของ 0084) + dead-letter | LINE ตอบ 5xx → retry ตาม backoff; เกินเพดาน → `failed` พร้อมเหตุผล |
| P0-7 | **ตัดสิน autonomy gate (§8 ข้อ 3) แล้วทำตามมติ:** wire ให้ live หรือลบ + แก้ `tasks.md:157` | ไม่เหลือโค้ด "อ้างว่าคุม" ที่ไม่ได้คุมจริง |
| P0-8 | **มติ cron + consent (§8 ข้อ 1, 2, 4) บันทึกเป็นลายลักษณ์อักษร** ก่อนเปิดส่งจริง | runbook ระบุ cron ที่ต้องมี; มติ consent ลงเอกสาร |
| P0-9 | **`handler_error` ต้องไม่นับเป็น processed (B8):** เหตุการณ์ที่ handler ล้มต้องมี **retry state ของเราเอง** (บันทึกเป็นแถว retry + sweep แบบเดียวกับ notification claim v3 ของ 0084) — **ห้ามพึ่ง LINE redelivery เพราะ LINE ไม่รับประกัน redelivery** — ไม่นับ processed และไม่ทำให้แถวที่ล้มโดน dedupe เป็น duplicate | จำลอง handler ล้ม → event เข้าคิว retry ภายในระบบและถูกประมวลผลซ้ำจนสำเร็จหรือครบเพดาน → dead-letter + audit; ไม่มี false success; ไม่ต้องรอ LINE ส่งซ้ำ |

### P1 — ควรมีเร็ว ๆ นี้

- **`line-login` consume `state`/`nonce` (B9):** ผูก state ที่ server ออก, ใช้ครั้งเดียว, หมดอายุสั้น — AC: replay `code`/callback swap ถูกปฏิเสธ, login ปกติผ่าน
  *(อยู่ P1 ไม่ใช่ P0 เพราะเป็นเส้น login พนักงาน ไม่ได้อยู่บนทางส่งลูกค้า — ไม่บล็อกการเปิดส่ง แต่บล็อกความน่าเชื่อถือของ identity/audit จึงต้องทำเร็ว)*
- Consent gate ลูกค้าก่อนส่ง (ถ้ามติ §8 ข้อ 4 = ต้องมี): ช่อง consent ฝั่งลูกค้า + ด่านเช็คใน claim/ส่ง
- Human-approval ก่อนส่งหาลูกค้า (ถ้ามติ §8 ข้อ 2 = ต้องมี)
- Metric/alert: แถว `pending` ค้างเกิน SLA, อัตรา `failed`, dead-letter
- LINE quota/cost awareness: push/multicast กิน quota (reply ไม่กิน) — ควรมี counter ต่อเดือน + แจ้งเตือนก่อนชนเพดาน

> **นิยาม SLA ชั่วคราว (จนกว่า ops จะกำหนดจริง):** แถว `pending` ต้องถูกหยิบภายใน 15 นาทีหลังเปิด cron — ทุกที่ที่เอกสารนี้อ้าง "SLA" ให้ใช้ค่านี้ไปก่อน

### P2 — อนาคต (ห้ามทำก่อนมี มติ)

- ฟื้นหรือลบ ordering / forecast / R-03 / auto-close / TCCK (§8 ข้อ 5)
- หน้า admin จัดการ template (§8 ข้อ 6)

---

## 7. Success Metrics

- **นำ (ทันที):** อัตราส่งซ้ำ = 0 ใน load test claim พร้อมกัน; 100% ของแถวคิวจบ `sent/failed` ภายใน SLA; เทสต์ RED→GREEN ครบทุก AC
- **ตาม (30–90 วัน):** ไม่มี report ลูกค้าโดนข้อความซ้ำ; แถว dead-letter < 1%/สัปดาห์; spec-vs-จริง desync = 0 รายการ

---

## 8. คำถามเปิด — รอคุณเดฟตัดสิน (ห้ามเดาแทน)

| # | คำถาม | ประเภท | บล็อกอะไร |
|---|---|---|---|
| 1 | Environment จริงมี cron เรียก `line-outbound-sender` ไหม (เรโปไม่มีแน่นอน — มีแต่ ops ยืนยันได้) | Ops | P0-8; ถ้ามีอยู่ = บั๊ก B2 กำลังเดินอยู่จริง ต้องรีบปิด |
| 2 | ต้องมี human-approval ก่อนส่งหาลูกค้าจริงไหม | ธุรกิจ | P1 |
| 3 | Autonomy gate + brand-voice: wire ให้ live หรือเลิกอย่างเป็นทางการ + แก้ tasks.md | ธุรกิจ/สถาปัตย์ | P0-7 |
| 4 | ส่งลูกค้าโดยไม่มี consent gate รับได้ชั่วคราวไหม หรือต้องมีก่อนขยาย (PDPA) | กฎหมาย/ธุรกิจ | P0-8, P1 |
| 5 | Subsystem ตายสนิท (§2.3): เก็บไว้ต่อสายภายหลัง หรือลบ + แก้ spec | ธุรกิจ | P2 |
| 6 | ต้องมีหน้า admin ให้พนักงานจัดการ template เองไหม | ธุรกิจ | P2 |
| 7 | **การประสานสองเรโป:** โค้ด LINE ในเรโปนี้กับเรโป product (`determined-williams`, worktree `line-trust-wave1-main`) เป็นสายพันธุ์เดียวกัน (บั๊กตรงกันถึงระดับบรรทัด เช่น `0097:281`) และเรโป product มีโปรแกรม Trust Kernel `0173–0179` ของตัวเอง (research 2026-07-31) — จะให้เรโปไหนเป็น authoritative ของ LINE subsystem? แก้ที่นี่แล้ว port ไป, รอ Trust Kernel, หรือแยกอิสระ? (เสี่ยง split-brain ถ้าไม่ตัดสิน) | สถาปัตย์/ธุรกิจ | ไม่บล็อกการเริ่ม Phase A (ทำเป็น patch ที่ port ได้ — ดู §9) แต่บล็อกการ merge/นำไปใช้ข้ามเรโป |

---

## 9. ลำดับงาน (Phasing)

1. **Phase A (พร้อมเริ่มทันที ไม่รอมติ):** P0-1 … P0-6, P0-9 — TDD ชน Postgres จริง, SoD คนสร้าง ≠ คนรีวิว
   *(ความสัมพันธ์กับคำถามข้อ 7: บั๊กเหล่านี้อยู่ในเรโปนี้จริงไม่ว่ามติ cross-repo จะออกทางไหน จึง**เริ่มได้เลย** — เงื่อนไขเดียวคือทำ fix เป็น patch ที่ port ได้ (migration + diff แยกชัดต่อบั๊ก) เพื่อไม่ทำงานทิ้งถ้ามติให้เรโป product เป็น authoritative; คำตอบข้อ 7 กำหนด "เอาไปใช้ที่ไหน" ไม่ใช่ "เริ่มเมื่อไหร่")*
2. **Phase B (หลังมติข้อ 3):** P0-7 — wire หรือลบ autonomy gate + แก้ spec ให้ตรง
3. **Phase C (หลังมติข้อ 1, 2, 4):** ตั้ง cron จริง + (ถ้ามี) consent gate + human-approval → เปิดส่งลูกค้า
4. **Phase D (หลังมติข้อ 5, 6):** เก็บกวาด subsystem ตาย + admin UI

**เงื่อนไขปิดทุก Phase:** ผลเทสต์จริงแนบ ไม่รับคำกล่าวอ้าง; ห้าม log token; ห้ามอ่อนกฎความปลอดภัยเพื่อให้ผ่าน
