# PRD — ระบบสื่อสาร LINE OA ทั้งหมด (MONOLITH Repair Intelligence)

> **ภาษา:** ไทย · ฉบับภาษาอังกฤษ: `docs/PRD-LINE-OA.en.md` · HTML: `docs/PRD-LINE-OA.th.html` / `docs/PRD-LINE-OA.en.html`
> **ฉบับ:** 1.2 · 30 กันยายน 2026 (1.1 = 1 ส.ค. 2026 · 1.0 = 26 ก.ค. 2026)
> **สิ่งที่เปลี่ยนในฉบับ 1.2:** เพิ่ม §0 สถานะการดำเนินการหลัง Phase A, เพิ่มคอลัมน์สถานะใน §6 P0, แก้ชื่อไฟล์หลักฐาน guard ใน §2.1, ระบุว่าหลักฐาน B1 เป็นโค้ดก่อนแก้, เพิ่มข้อมูลแผน amendment ในคำถามข้อ 7 — ข้อค้นพบเดิมใน §2 คงไว้ทั้งหมดเป็นบันทึกการตรวจ
> **สถานะเอกสาร:** รอเจ้าของ (คุณเดฟ) ตัดสินคำถามเปิดใน §8 ก่อนเข้าสู่ Phase B–D
> **หลักการเขียน:** ทุกแถวแยก "ทำงานจริง / มีโค้ดแต่ไม่ต่อสาย / อยู่แค่ spec" พร้อมอ้าง file:line — สถานะ verify จากโค้ดจริงเมื่อ 26 ก.ค. และ 1 ส.ค. 2026 ยกเว้นที่ระบุว่า "จากรอบตรวจก่อน"
> **หมายเหตุความจริง:** เอกสารเดิม (`docs/LINE-Architecture-System-Complete.md:40`, `docs/PRD.md:512`) ระบุ "LINE OA Commerce ✅ 20/20" ซึ่งเกินจริงสำหรับ live path — เอกสารนี้คือบันทึกสถานะที่ตรงความจริงกว่า

---

## 0. สถานะการดำเนินการ (ฉบับ 1.2)

**Phase A (P0-1 ถึง P0-6) สร้างเสร็จและผ่านรีวิวข้ามค่ายแล้ว — แต่อยู่บน branch เท่านั้น ยังไม่ push และยังไม่ deploy**

- **Branch:** `codex/repair-intelligence-phase0-trust` · commit ที่ผ่านรีวิว: `46a203a6` (1 ส.ค. 2026)
- **Migrations:** `0193_line_outbound_claim_and_record.sql`, `0194_line_outbound_retry_and_claim_fencing.sql`, `0195_line_outbound_timezone_safe_backoff.sql`, `0196_line_outbound_timezone_safe_sent_at.sql` + การแก้ `supabase/functions/line-outbound-sender/index.ts`
- **ผลรีวิวข้ามค่าย:** รอบ A1, A2, A3 ถูกปฏิเสธ (มีหลักฐาน file:line ทุกครั้ง) → รอบ A4 ได้ `SOL VERDICT: ACCEPT PHASE A4`
- **หลักฐานที่ผู้ตรวจรับรันเอง:** pgTAP 70/70 ใน rollback wrapper (0193→0196 รวมเทสต์ที่รันใต้ timezone `Asia/Bangkok`) · vitest 18 ไฟล์ / 73 เทสต์ · ไม่มีการรั่วไปยัง stack ที่แชร์ · ไม่มี `cron.schedule` ใน 0193–0196
- **ผลต่อ environment จริง:** เพราะยังไม่ deploy ทุก environment ที่รันโค้ดเดิมยังมีบั๊ก B1–B6 อยู่ครบ

| บั๊ก | สถานะ ณ ฉบับ 1.2 |
|---|---|
| B1 หยิบคิวไม่มี lock | ✅ แก้บน branch — sender เรียก `rpc_claim_line_outbound_batch` (`index.ts:676-687`), `FOR UPDATE SKIP LOCKED`, reclaim ตาม timeout, fencing ด้วย `claim_token` |
| B2 service role บันทึกผลไม่ได้ | ✅ แก้บน branch — ตรวจ service context จาก SQL role (`current_setting('role')`) ไม่ใช่ JWT; ด่านของผู้ใช้ไม่ถูกผ่อน |
| B3 แถวกลุ่มบันทึกผลไม่ได้ | ✅ แก้บน branch — LEFT JOIN + vertical จาก `line_groups` + fallback `monolith` ตาม 0097 |
| B4 ไม่มี transition guard | ✅ แก้บน branch — บันทึกได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้วคืน `recorded=false` ไม่มี audit ซ้ำ |
| B5 ล้มครั้งเดียวตายถาวร | ✅ แก้บน branch — แยก transient/permanent + exponential backoff (1 วินาที × 2^n สูงสุด 5 นาที) + เพดาน 5 ครั้ง |
| B6 ไม่มี cron | ⏸ ตั้งใจยังไม่ตั้ง — เป็นงาน Phase C รอคำตอบ §8 ข้อ 1, 2, 4 |
| B7 เทสต์ตาบอด | ✅ มีเทสต์ใหม่ที่ชน Postgres จริง (pgTAP) และเทสต์ที่ตรวจว่า sender ต่อสายเข้า RPC จริง |
| B8 `handler_error` นับว่าสำเร็จ | 🔴 ยังไม่แก้ — P0-9 ยังไม่ได้สร้าง |
| B9 `line-login` ไม่ใช้ state/nonce | 🔴 ยังไม่แก้ — อยู่ใน P1 |

**ยังไม่ได้พิสูจน์ (ห้ามอ้างเกิน):** Python property suites ไม่เคยรัน (เครื่องที่ใช้ไม่มี python) · เทสต์ claim แข่งกัน 2 client ถูกข้ามเพราะต้องระบุ DSN ของ stack ชั่วคราวโดยเฉพาะ · ยังไม่มีการรัน CI, Edge Function จริง หรือ LINE API จริง · พฤติกรรม `X-Line-Retry-Key` ฝั่ง LINE เป็นการรับประกันภายนอก — ด่านใน DB อย่างเดียวไม่กัน worker 2 ตัวที่ lease หมดอายุยิงถึง LINE พร้อมกัน

**บั๊กเพิ่มเติมที่พบและแก้ระหว่าง Phase A:** `next_attempt_at` และ `sent_at` เคยรับค่า `timezone('utc', now())` (timestamp ไม่มี time zone) ใส่คอลัมน์ `timestamptz` ทำให้ในไทย backoff กลายเป็นศูนย์และเวลาส่งถูกบันทึกเร็วไป ~7 ชั่วโมง — แก้ใน 0195/0196 พร้อมเทสต์ใต้ `Asia/Bangkok`

---

## 1. ปัญหา (Problem Statement)

MONOLITH ใช้ LINE เป็นช่องทางหลักติดต่อลูกค้าและช่างหน้างาน (ลูกค้าไทยอยู่บน LINE) ขาเข้า (webhook, กลุ่ม, การ์ดตรวจรับ) ต่อสายครบและมี guard แน่น แต่ขาออกหาลูกค้ายังเปิดใช้จริงไม่ได้: ตัวส่ง (`line-outbound-sender`) มีบั๊กร้ายแรงที่ทำให้ถ้ารันจริงจะวนส่งข้อความซ้ำหาลูกค้าไม่รู้จบทุกแถว และไม่มีตารางเวลา (cron) เรียกมันในเรโปเลย ขณะที่ sweep รายคืนหลายตัวยิงข้อความลูกค้าเข้าคิวทุกวัน ถ้าไม่ปิดช่องว่างก่อนขยายการส่งหาลูกค้า ความเสี่ยงคือสแปมกลุ่มลูกค้า และความเชื่อมั่นแบรนด์เสียหายทันที

---

## 2. สถานะจริงของระบบ (Verified Status Matrix)

> ส่วนนี้คือบันทึกการตรวจเมื่อ 26 ก.ค. และ 1 ส.ค. 2026 (ก่อน Phase A) — สถานะหลังแก้ดูที่ §0

### 2.1 ✅ ทำงานจริง — ต่อสายครบ มีตัวเรียกบน live path

| ความสามารถ | หลักฐาน | ระดับตรวจ |
|---|---|---|
| **ขาเข้า:** `line-webhook` → `rpc_ingest_line_webhook` ตรวจ HMAC, กันซ้ำด้วย `webhook_event_id` UNIQUE, แยกกลุ่ม/1:1 | `supabase/functions/line-webhook/index.ts:87-127`, `00000000000022_line_oa_ingest_webhook.sql`, HMAC `00000000000010` | ยืนยัน 1 ส.ค. 2026 |
| **Group flows:** router `fn_line_handle_group_event` — `#ผูก`, `#ปัญหา`, รูป → capture, การ์ดตรวจรับ Flex | `0097_line_group_bot_flows.sql:101` | จากรอบตรวจก่อน + ยืนยัน insert paths 26 ก.ค. |
| **Guard กลุ่มลูกค้า:** `fn_line_guard_customer_group` fail-closed — template ที่ไม่ใช่ `audience='customer'` เข้ากลุ่มลูกค้าไม่ได้ | `0095_line_groups_identity.sql:102,145` + re-wire `0101_scrutiny3_fixes.sql:16` | ยืนยัน 1 ส.ค. 2026 |
| **แจ้งเตือนพนักงาน:** `notification-retry-worker` + cron ทุก 1 นาที, claim แบบ `FOR UPDATE SKIP LOCKED`, exponential backoff 5 ครั้ง, dead-letter | cron `0089_cron_schedules.sql:87`, claim v3 `0084` | ยืนยัน cron 26 ก.ค. |
| **Staff LINE Login + binding + consent:** `line-login` → `rpc_line_login_upsert` เก็บ `consent_at` ตอนผูก | `0105_staff_bind_login.sql:86-92` | ยืนยัน 26 ก.ค. |
| **Token rotation:** cron `wf-line-token-refresh` เดือนละ 3 ครั้ง | `0154_line_token_rotation.sql:77` | ยืนยัน 26 ก.ค. |
| **การยิงข้อความเข้าคิวขาออก** (จาก webhook flows + sweep รายคืน) — insert ตรง ~60 จุด | `0097:140`, `0098:93`, `0100:513`, `0101`, `0107`, `0111`, `0114:94`, `0127`, `0134`, `0136`, `0143` | ยืนยัน 26 ก.ค. |

### 2.2 🔴 มีโค้ด + เทสต์ผ่าน แต่ใช้งานจริงไม่ได้ (บั๊กที่ verify แล้ว)

| # | ปัญหา | หลักฐาน |
|---|---|---|
| B1 | **หยิบคิวไม่มี lock** — `claimPending` เป็น `SELECT ... status='pending' ... limit` ไม่มี `FOR UPDATE SKIP LOCKED` ไม่มี claim marker → รันคาบกัน = ส่งซ้ำ | `line-outbound-sender/index.ts:589-602` (โค้ดก่อนแก้ — ถูกแทนที่แล้วบน branch) |
| B2 | **บันทึกผลส่งถูกปฏิเสธทุกแถว** — sender เรียก `rpc_record_line_send_result` ด้วย service role แต่ RPC เช็ค `is_governance_role() or has_site_access()` ซึ่งอ่าน role จาก JWT `app_metadata` (service role ไม่มี → `[]`) และ grant EXECUTE ให้แค่ `authenticated` → ส่งสำเร็จบน LINE แต่บันทึกไม่ได้ → แถวค้าง `pending` → **วนส่งซ้ำไม่รู้จบทุกแถว** | `00000000000041:162`, `00000000000000_c12_foundation.sql:36`, `00000000000041:253-258`, ฝั่ง sender `index.ts:576-584, 664-669` (ก่อนแก้) |
| B3 | **แถวกลุ่มบันทึกผลไม่ได้ถาวร** — RPC ใช้ INNER JOIN `line_oa_conversations` แต่แถวกลุ่ม (จาก 0097+) มี `conversation_id` เป็น NULL → "not found" เสมอ | `00000000000041:143-148` เทียบ `0097:140` |
| B4 | **ไม่มี transition guard** — `v_current_status` ถูกโหลด+lock แล้วไม่เคยเช็ค → แถว `sent` ถูก flip เป็น `failed` / บันทึกซ้ำ / audit ซ้ำได้ | `00000000000041:143` (โหลด), `:194-210` (update ไม่เช็ค) |
| B5 | **ส่งพลาดครั้งเดียว = ตายถาวร** — `failed` เป็นสถานะจบ ไม่มี migration ใดกู้กลับ `pending` | `00000000000041:179-199` + grep ทั้ง migrations |
| B6 | **ไม่มี cron เรียกตัวส่งลูกค้าในเรโป** — cron ที่มีจริงคือ notification-retry/sla/digest (`0089:87-96`), media-fetch (`0099:140`), token refresh (`0154:77`) → ข้อความลูกค้าจาก sweep รายคืน (`0114`, `0116`, `0140`) กองในคิว | grep `cron.schedule` ทั้ง migrations |
| B7 | **เทสต์ที่มีตาบอดต่อ B1–B4** — integration test ฉีด deps ปลอมทั้งชุด ไม่เคยชน Postgres/สิทธิ์จริง | `tests/line-oa-commerce/ts/senderClaimAndRecord.integration.test.ts:43` |
| B8 | **Handler ล้มถูกนับเป็น processed + เหตุการณ์หายถาวร** — `fn_line_handle_group_event` จับ exception แล้วคืน `'handler_error:...'` แต่ skip list ใน ingest ไม่รวม prefix นี้ → insert inbound row + audit + นับ `events_processed` และเพราะ inbound row เกิดแล้ว การ redeliver จาก LINE จะโดน dedupe → เหตุการณ์ที่ล้มหายถาวรแบบรายงานว่าสำเร็จ (พบครั้งแรกใน research 31 ก.ค. 2026 ของเรโป product แล้วยืนยันในเรโปนี้ 1 ส.ค.) | `0097:281` (คืนค่า), `0097:437-438` (skip list), `0097:454` (นับ processed), `0097:429-433` (dedupe) |
| B9 | **ตัว login ของพนักงานไม่ใช้ OAuth state / OIDC nonce** — `line-login` รับแค่ `{code, redirect_uri, bind_token?}` → เสี่ยง callback swap/replay (การผูกครั้งแรกบรรเทาได้ด้วย `bind_token` จากออฟฟิศ แต่ login รอบถัดไปไม่มีด่านนี้) | `supabase/functions/line-login/index.ts:2,9` |

### 2.3 ⚫ โค้ดสมบูรณ์ + เทสต์ผ่าน แต่ไม่มีผู้เรียกเลย (ตายสนิท) — รอตัดสินเก็บหรือลบ

| ระบบ | นิยามที่ | ผลตรวจ caller |
|---|---|---|
| **Autonomy gate + brand-voice ≤200 ตัวอักษร** (`rpc_send_line_outbound`) | `00000000000040:131` | **0 caller** — อ้างถึงเฉพาะใน tests / spec / comment; ทางส่งจริงทั้งหมด insert ตรงเข้าคิว จึงไม่เคยคุมข้อความจริงแม้แต่ข้อความเดียว |
| **Ordering** (`rpc_create_line_order`, `line_oa_orders`) | `00000000000050:397` | 0 caller นอกเทสต์/spec |
| **Forecast sync** (`rpc_sync_line_forecast`) | `00000000000060:88` | 0 caller นอกเทสต์/spec |
| **R-03 identity merge** (`rpc_evaluate_identity_merge_candidate`) | `00000000000021:96` | 0 caller นอกเทสต์/spec |
| **Auto-close 24 ชม.** (session timeout sweep) | `00000000000061:50` | `cron.schedule` อยู่ใน comment — ไม่เคยถูกตั้งจริง |
| **TCCK vertical** (multi-vertical food) | กระจายใน schema (`vertical_context`) | ไม่มี flow ฝั่ง TCCK ต่อสาย (จากรอบตรวจก่อน) |

### 2.4 📝 อยู่แค่ spec — ยังไม่มีโค้ด

- **Consent ฝั่งลูกค้า (PDPA):** ลูกค้าไม่มีช่อง consent เลย และไม่มีด่านเช็ค consent ก่อนส่งในทุกทางส่ง
- **Consent ที่มีอยู่เป็นของพนักงานเท่านั้น:** `identity_binding.consent_at` (`0088:10`) โดยตั้งใจไว้ว่า "Phase 1.8 — ห้าม backfill consent ที่ไม่เคยเกิด" (`0088:14-15`)
- **หน้า admin จัดการ template:** ตอนนี้ seed ผ่าน migration เท่านั้น
- **Guardrails G4/G5/G7/G12 บางส่วน:** ดู `docs/LINE-Architecture-System-Complete.md` §6

---

## 3. เป้าหมาย (Goals)

1. **ศูนย์ข้อความซ้ำ:** เปิดตัวส่งลูกค้าได้โดยพิสูจน์ด้วยเทสต์ชน Postgres จริงว่ารันคาบกันหรือล้มกลางทางแล้วไม่เกิดส่งซ้ำ
2. **ทุกข้อความมีผลจบ:** แถวคิวทุกแถวจบที่ `sent` หรือ `failed` พร้อมเหตุผล — ไม่มีค้าง `pending` เกิน SLA และความล้มเหลวชั่วคราวได้ retry
3. **สเปกตรงความจริง:** ทุก subsystem ใน `.kiro/specs/line-oa-commerce/tasks.md` ถูก mark ตามสถานะจริง (live / dead / removed) — ไม่มี "✅ 20/20" ที่ไม่ตรง live path
4. **PDPA มีเจ้าภาพ:** มีมติเจ้าของเป็นลายลักษณ์อักษรว่า consent gate ลูกค้าต้องมีก่อนขยาย หรือยอมรับความเสี่ยงชั่วคราว
5. **Ops ตรวจสอบได้:** มีรายการ cron/deploy ที่ต้องมีบน environment จริงชัดเจน (ต่อยอด `docs/OPS-RUNBOOK-Wave2.md`)

## 4. นอกขอบเขต (Non-Goals)

1. **ไม่ทำ free-text/LLM ตอบลูกค้า** — หลักเหล็ก template-only คงเดิม (แก้ที่การต่อสาย ไม่อ่อนเกณฑ์)
2. **ไม่ฟื้น ordering/forecast/TCCK ในเฟสนี้** — รอมติเก็บหรือลบ (§8 ข้อ 5) ห้ามต่อสายเงียบ ๆ
3. **ไม่ทำหน้า admin template ในเฟสนี้** — รอมติ (§8 ข้อ 6)
4. **ไม่แตะ repo manufacturing OS** — คนละระบบ
5. **ไม่ผ่อน RLS/สิทธิ์ระดับผู้ใช้** — การแก้ B2 คือให้ระบบรู้จัก service context ไม่ใช่ถอดด่านของมนุษย์

---

## 5. User Stories

**ลูกค้า (ผู้รับข้อความ):**

- ในฐานะลูกค้า ฉันต้องได้รับข้อความแจ้งสถานะงานซ่อมครั้งเดียวต่อเหตุการณ์ เพื่อไม่รู้สึกถูกสแปม
- ในฐานะลูกค้า ฉันต้องได้รับเฉพาะข้อความที่เหมาะกับกลุ่มลูกค้า ไม่หลุดข้อความภายใน — มีแล้ว (guard 0095)

**ช่าง/หัวหน้าทีม (กลุ่ม internal):**

- ในฐานะช่าง ฉันส่งรูปหรือ `#ปัญหา` ในกลุ่มแล้วระบบรับเข้า capture/issue ได้ — มีแล้ว (0097)

**พนักงานออฟฟิศ:**

- ในฐานะพนักงาน ฉันได้รับแจ้งเตือนงานผ่าน LINE ตาม backoff ที่ถูกต้อง — มีแล้ว (0084/0089)

**เจ้าของ (คุณเดฟ):**

- ในฐานะเจ้าของ ฉันต้องรู้ว่าข้อความลูกค้าทุกแถวจบอย่างไร (sent/failed + เหตุผล + audit) และมั่นใจว่าไม่มีการส่งซ้ำ
- ในฐานะเจ้าของ ฉันต้องเห็นสถานะระบบตรงความจริง ไม่ใช่ตามเอกสารที่อ้างว่าเสร็จ

---

## 6. Requirements

### P0 — ต้องมีก่อนเปิดส่งลูกค้าจริง (แก้ B1–B8)

| Req | รายละเอียด | Acceptance criteria (เทสต์ชน Postgres จริง, RED ก่อน) | สถานะ (1.2) |
|---|---|---|---|
| P0-1 | **Claim คิวแบบ atomic:** เพิ่ม `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (ไม่เพิ่มค่า enum ใหม่ เพื่อเลี่ยงข้อจำกัด `ALTER TYPE` และผลกระทบต่อผู้อ่าน status) | สอง client claim พร้อมกัน → ไม่มีแถวซ้ำ; แถว claim ค้างเกิน timeout → ถูก re-claim ได้ | ✅ บน branch (0193 + ต่อสาย sender) — เทสต์ 2 client ยังไม่ได้รัน |
| P0-2 | **Service context บันทึกผลได้:** grant + ให้ `rpc_record_line_send_result` รู้จัก service role เป็น system actor โดยไม่อ่อนด่าน role ของผู้ใช้ | เรียกด้วย service role → บันทึกได้; ผู้ใช้ไร้ role → ถูกปฏิเสธเหมือนเดิม | ✅ บน branch (0193) |
| P0-3 | **แถวกลุ่มบันทึกผลได้:** LEFT JOIN + ดึง vertical/audit จาก `line_groups` เมื่อ `conversation_id` เป็น NULL | แถว group → recordResult สำเร็จ + audit ครบ | ✅ บน branch (0193 + fallback 0196) |
| P0-4 | **Transition guard:** บันทึกผลได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้ว → `recorded=false` no-op | บันทึกซ้ำ / flip `sent`→`failed` → ถูกปฏิเสธ, audit ไม่ซ้ำ | ✅ บน branch (0193 + fencing 0194) |
| P0-5 | **LINE-level dedupe:** ใส่ `X-Line-Retry-Key` = outbound id ในการ push | ปิดหน้าต่างส่งซ้ำข้าม timeout (ส่งแล้วแต่บันทึกพลาด) | ✅ บน branch — พฤติกรรมฝั่ง LINE ยังไม่ได้พิสูจน์ |
| P0-6 | **Retry จำกัดครั้งสำหรับความล้มเหลวชั่วคราว** (แนว claim v3 ของ 0084) + dead-letter | LINE ตอบ 5xx → retry ตาม backoff; เกินเพดาน → `failed` พร้อมเหตุผล | ✅ บน branch (0194–0196) |
| P0-7 | **ตัดสิน autonomy gate (§8 ข้อ 3) แล้วทำตามมติ:** wire ให้ live หรือลบ + แก้ `tasks.md:157` | ไม่เหลือโค้ดที่อ้างว่าคุมแต่ไม่ได้คุมจริง | ⏸ รอมติข้อ 3 |
| P0-8 | **มติ cron + consent (§8 ข้อ 1, 2, 4) บันทึกเป็นลายลักษณ์อักษร** ก่อนเปิดส่งจริง | runbook ระบุ cron ที่ต้องมี; มติ consent ลงเอกสาร | ⏸ รอมติข้อ 1, 2, 4 |
| P0-9 | **Handler ที่ล้มต้องไม่นับเป็น processed (B8):** `handler_error` — เหตุการณ์ที่ handler ล้มต้องมี retry state ของเราเอง (แถว retry + sweep แบบ claim v3 ของ 0084) — ห้ามพึ่ง LINE redelivery เพราะ LINE ไม่รับประกัน — ไม่นับ processed และไม่ทำให้แถวที่ล้มโดน dedupe | จำลอง handler ล้ม → event เข้าคิว retry ภายในระบบและถูกประมวลผลซ้ำจนสำเร็จหรือครบเพดาน → dead-letter + audit; ไม่มี false success | 🔴 ยังไม่ได้สร้าง |

### P1 — ควรมีเร็ว ๆ นี้

- **B9 — ให้ login ของพนักงานใช้ state และ nonce:** แก้ `line-login` ให้ผูก state ที่ server ออก ใช้ครั้งเดียว หมดอายุสั้น — AC: replay `code` หรือ callback swap ถูกปฏิเสธ, login ปกติผ่าน (อยู่ P1 ไม่ใช่ P0 เพราะเป็นเส้น login พนักงาน ไม่ได้อยู่บนทางส่งลูกค้า แต่บล็อกความน่าเชื่อถือของ identity/audit จึงต้องทำเร็ว)
- **Consent gate ลูกค้าก่อนส่ง** (ถ้ามติ §8 ข้อ 4 = ต้องมี): ช่อง consent ฝั่งลูกค้า + ด่านเช็คใน claim/ส่ง
- **Human-approval ก่อนส่งหาลูกค้า** (ถ้ามติ §8 ข้อ 2 = ต้องมี)
- **Metric/alert:** แถว `pending` ค้างเกิน SLA, อัตรา `failed`, dead-letter
- **LINE quota/cost awareness:** push/multicast กิน quota (reply ไม่กิน) — ควรมี counter ต่อเดือน + แจ้งเตือนก่อนชนเพดาน

> **นิยาม SLA ชั่วคราว (จนกว่า ops จะกำหนดจริง):** แถว `pending` ต้องถูกหยิบภายใน 15 นาทีหลังเปิด cron — ทุกที่ที่เอกสารนี้อ้าง "SLA" ให้ใช้ค่านี้ไปก่อน

### P2 — อนาคต (ห้ามทำก่อนมีมติ)

- ฟื้นหรือลบ ordering / forecast / R-03 / auto-close / TCCK (§8 ข้อ 5)
- หน้า admin จัดการ template (§8 ข้อ 6)

---

## 7. Success Metrics

- **ตัวชี้วัดนำ (ทันที):** อัตราส่งซ้ำ = 0 ใน load test claim พร้อมกัน; 100% ของแถวคิวจบ `sent/failed` ภายใน SLA; เทสต์ RED→GREEN ครบทุก AC
- **ตัวชี้วัดตาม (30–90 วัน):** ไม่มีรายงานลูกค้าโดนข้อความซ้ำ; แถว dead-letter น้อยกว่า 1% ต่อสัปดาห์; ความไม่ตรงระหว่าง spec กับของจริง = 0 รายการ

---

## 8. คำถามเปิด — รอคุณเดฟตัดสิน (ห้ามเดาแทน)

| # | คำถาม | ประเภท | บล็อกอะไร |
|---|---|---|---|
| 1 | Environment จริงมี cron เรียก `line-outbound-sender` ไหม (เรโปไม่มีแน่นอน — มีแต่ ops ยืนยันได้) | Ops | P0-8; ถ้ามีอยู่ = บั๊ก B1–B5 กำลังเดินอยู่จริง เพราะงานแก้ยังไม่ deploy |
| 2 | ต้องมี human-approval ก่อนส่งหาลูกค้าจริงไหม | ธุรกิจ | P1 |
| 3 | Autonomy gate + brand-voice: wire ให้ live หรือเลิกอย่างเป็นทางการ + แก้ `tasks.md` | ธุรกิจ/สถาปัตย์ | P0-7 |
| 4 | ส่งลูกค้าโดยไม่มี consent gate รับได้ชั่วคราวไหม หรือต้องมีก่อนขยาย (PDPA) | กฎหมาย/ธุรกิจ | P0-8, P1 |
| 5 | Subsystem ที่ตายสนิท (§2.3): เก็บไว้ต่อสายภายหลัง หรือลบ + แก้ spec | ธุรกิจ | P2 |
| 6 | ต้องมีหน้า admin ให้พนักงานจัดการ template เองไหม | ธุรกิจ | P2 |
| 7 | **การประสานสองเรโป:** โค้ด LINE ในเรโปนี้กับเรโป product (`determined-williams`, worktree `line-trust-wave1-main`) เป็นสายพันธุ์เดียวกัน (บั๊กตรงกันถึงระดับบรรทัด เช่น `0097:281`) — จะให้เรโปไหนเป็น authoritative ของ LINE subsystem: แก้ที่นี่แล้ว port ไป, รอ Trust Kernel, หรือแยกอิสระ | สถาปัตย์/ธุรกิจ | ไม่บล็อก Phase A แต่บล็อกการ merge หรือนำไปใช้ข้ามเรโป |

**ข้อมูลเพิ่มเติมสำหรับข้อ 7:** แผน amendment ของเรโป product (26 ก.ค. 2026, `docs/superpowers/plans/2026-07-26-line-trust-kernel-wave-1-amendment.th.md`) ยืนยันว่าเรโป product เป็นเจ้าของ roadmap LINE Trust Kernel — จัดสรร `0171`–`0174` ให้ Wave 1 และจอง `0175`–`0179` ไว้ โดย `0178` = atomic outbox ซึ่งทับกับ P0-1 ของเรา งาน Phase A ในเรโปนี้จึงใช้เลข `0193`–`0196` (นอกช่วงที่จองไว้) และทำเป็น patch แยกชัดต่อบั๊กเพื่อ port ไปได้

---

## 9. ลำดับงาน (Phasing)

1. **Phase A — ✅ สร้างเสร็จบน branch ยกเว้น P0-9:** P0-1 ถึง P0-6 ผ่านรีวิวข้ามค่ายแล้ว (§0); P0-9 ยังค้าง — ทำเป็น patch ที่ port ได้ (migration + diff แยกชัดต่อบั๊ก) เพื่อไม่ทำงานทิ้งถ้ามติข้อ 7 ให้เรโป product เป็น authoritative
2. **Phase B (หลังมติข้อ 3):** P0-7 — wire หรือลบ autonomy gate + แก้ spec ให้ตรง
3. **Phase C (หลังมติข้อ 1, 2, 4):** push + deploy งาน Phase A, ตั้ง cron จริง, เพิ่ม consent gate และ human-approval ถ้ามีมติ → เปิดส่งลูกค้า
4. **Phase D (หลังมติข้อ 5, 6):** เก็บกวาด subsystem ที่ตาย + admin UI

**เงื่อนไขปิดทุก Phase:** แนบผลเทสต์จริง ไม่รับคำกล่าวอ้าง; ห้าม log token; ห้ามอ่อนกฎความปลอดภัยเพื่อให้ผ่าน; ทุก wave ต้องผ่านรีวิวข้ามค่ายก่อนรับ
