# รายงานสรุปงาน — LINE OA Outbound Trust + Repair Phase 0 (รอบ Wave 3.x / Phase A)

**ฉบับ:** ภาษาไทย
**วันที่รวบรวมรายงาน:** 30 กันยายน 2026
**วันที่ commit งานทั้งหมด (ตาม git):** 1 สิงหาคม 2026
**Worktree:** `MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust`
**Branch:** `codex/repair-intelligence-phase0-trust` — 62 commits เหนือ `main` · **ยังไม่ push ที่ใดเลย**
**สถานะ Repair Phase 0:** `EVIDENCE_INCOMPLETE` / `PENDING_OWNER_APPROVAL` — **ไม่เปลี่ยน**
**การส่งข้อความหาลูกค้าจริง:** ยังไม่เปิด ไม่มี cron ไม่มีการ activate ใด ๆ

> **กฎที่ยึดตลอดรอบ:** แยก "มีในโค้ดจริง" ออกจาก "อยู่แค่ spec" ทุกข้อ · อ้าง `file:line` เสมอ · เทสต์ผ่าน ≠ ต่อสายเข้า live path · ห้ามอ่อนกฎความปลอดภัยเพื่อให้ผ่าน · คนสร้าง ≠ คนรีวิว (SoD) · ปิดงานด้วยผลเทสต์จริง ไม่ใช่คำกล่าวอ้าง

---

## 1. บทบาทและวิธีทำงาน (ตามที่เจ้าของกำหนด)

| บทบาท | ใคร | ทำอะไร |
|---|---|---|
| ผู้วางแผน + ผู้ตรวจรับ (gate) | Claude | แตกงาน, ตรวจสถานะจริงจากโค้ด, **รันเทสต์ด้วยตัวเองซ้ำ**, commit ให้เมื่อผ่าน, ไม่รับคำกล่าวอ้าง |
| ผู้ลงมือ (builder) | Codex | เขียนโค้ด/migration/เทสต์แบบ TDD (RED ก่อน) — **ไม่ commit เอง** |
| ผู้รีวิวข้ามค่าย | Sol (Codex อีกสาย) | รีวิวเชิงปรปักษ์ก่อนรับทุก wave — มีอำนาจปฏิเสธ |

**วงจร:** Codex สร้าง → Claude ตรวจ+commit → Sol รีวิว → ถ้า REJECT วนแก้ใหม่ทั้งรอบ

ข้อค้นพบสำคัญของรอบนี้: **การรีวิวข้ามค่ายจับของจริงได้ทุกครั้ง** — จาก 7 wave ที่ส่งรีวิว Sol ปฏิเสธ 5 ครั้ง และทุกครั้งมีหลักฐาน `file:line` ที่ตรวจสอบได้ ไม่มีการปฏิเสธลอย ๆ

---

## 2. ส่วนที่ 1 — ตรวจสถานะจริงของระบบ LINE OA ทั้งหมด

ผลตรวจถูกบันทึกเป็น PRD ฉบับใหม่: **`docs/PRD-LINE-OA.md`** (ฉบับ 1.1)

### 2.1 ✅ ทำงานจริง (ต่อสายครบ มีผู้เรียกบน live path)

| ความสามารถ | หลักฐาน |
|---|---|
| ขาเข้า: `line-webhook` ส่ง raw body + signature เข้า RPC, คืน 401 เมื่อลายเซ็นผิด | `supabase/functions/line-webhook/index.ts:87-127` |
| กันซ้ำด้วย `webhook_event_id` UNIQUE | `00000000000022_line_oa_ingest_webhook.sql` |
| Router กลุ่ม (`#ผูก`, `#ปัญหา`, รูป, การ์ดตรวจรับ) | `0097_line_group_bot_flows.sql:101` |
| Guard กลุ่มลูกค้า fail-closed (template ที่ไม่ใช่ลูกค้าเข้ากลุ่มลูกค้าไม่ได้) | `0095_line_groups_identity.sql:102,145` + re-wire `0101_scrutiny3_fixes.sql:16` |
| แจ้งเตือนพนักงาน + cron ทุก 1 นาที, SKIP LOCKED, backoff, dead-letter | `0089_cron_schedules.sql:87-96`, claim v3 `0084` |
| Staff LINE Login + binding + consent | `0105_staff_bind_login.sql:86-92` |
| Token rotation cron | `0154_line_token_rotation.sql:77` |
| การยิงข้อความเข้าคิวขาออก (~60 จุด insert ตรง) | `0097:140`, `0098:93`, `0100:513`, `0101`, `0107`, `0111`, `0114:94`, `0127`, `0134`, `0136`, `0143` |

### 2.2 🔴 บั๊กที่ยืนยันแล้ว (B1–B9)

| # | ปัญหา | หลักฐาน |
|---|---|---|
| B1 | หยิบคิวไม่มี row lock → รันคาบกัน = ส่งซ้ำ | `line-outbound-sender/index.ts:589-602` (ก่อนแก้) |
| B2 | **บันทึกผลถูกปฏิเสธทุกแถว** — sender ใช้ service role แต่ RPC เช็ค role จาก JWT `app_metadata` และ grant ให้แค่ `authenticated` | `00000000000041:162`, `00000000000000_c12_foundation.sql:36`, `00000000000041:253-258` |
| B3 | แถวกลุ่มบันทึกผลไม่ได้ถาวร (INNER JOIN กับ conversations) | `00000000000041:143-148` vs `0097:140` |
| B4 | ไม่มี transition guard → flip `sent`→`failed` / audit ซ้ำได้ | `00000000000041:143,194-210` |
| B5 | ส่งพลาดครั้งเดียว = ตายถาวร | `00000000000041:179-199` |
| B6 | **ไม่มี cron เรียก `line-outbound-sender`** ในเรโป | grep `cron.schedule` ทั้ง migrations |
| B7 | เทสต์เดิมตาบอดต่อ B1–B4 (ฉีด deps ปลอมทั้งชุด) | `tests/line-oa-commerce/ts/senderClaimAndRecord.integration.test.ts:43` |
| B8 | **`handler_error` ถูกนับว่าสำเร็จ + เหตุการณ์หายถาวร** | `0097:281` (คืนค่า), `0097:437-438` (skip list ไม่ครอบ), `0097:454` (นับ processed), `0097:429-433` (dedupe) |
| B9 | `line-login` ไม่ consume OAuth `state`/OIDC `nonce` | `supabase/functions/line-login/index.ts:2,9` |

> B8 และ B9 พบครั้งแรกจากเอกสาร research 31 ก.ค. 2026 ของเรโป product แล้วยืนยันว่ามีในเรโปนี้ด้วย (บั๊กตรงกันถึงระดับเลขบรรทัด — โค้ดสายพันธุ์เดียวกัน)

### 2.3 ⚫ โค้ดครบ เทสต์ผ่าน แต่ **ไม่มีผู้เรียกเลย**

| ระบบ | นิยามที่ | ผล grep |
|---|---|---|
| Autonomy gate + brand-voice ≤200 ตัวอักษร (`rpc_send_line_outbound`) | `00000000000040:131` | **0 caller** — มีแต่ใน tests/spec/comment |
| Ordering (`rpc_create_line_order`, `line_oa_orders`) | `00000000000050:397` | 0 caller |
| Forecast sync (`rpc_sync_line_forecast`) | `00000000000060:88` | 0 caller |
| R-03 identity merge | `00000000000021:96` | 0 caller |
| Auto-close 24 ชม. | `00000000000061:50` | `cron.schedule` อยู่ใน comment |
| TCCK vertical | กระจายใน schema | ไม่มี flow ต่อสาย |

### 2.4 📝 อยู่แค่ spec

- **Consent ฝั่งลูกค้า** — ไม่มีช่องเก็บเลย และไม่มีด่านเช็คก่อนส่ง (พนักงานมี `identity_binding.consent_at`, `0088:10`)
- หน้า admin จัดการ template (ตอนนี้ seed ผ่าน migration เท่านั้น)

### 2.5 การแก้บันทึกที่เคยเกินจริง

เอกสารเดิม `docs/PRD.md:512` และ `docs/LINE-Architecture-System-Complete.md:40` ระบุ "LINE OA Commerce ✅ เสร็จ 20/20" ซึ่ง**ไม่ตรง live path** — ได้ใส่ banner ⚠️ ชี้ไป `docs/PRD-LINE-OA.md` ในทั้งสองไฟล์แล้ว

---

## 3. ส่วนที่ 2 — LINE Phase A: แก้บั๊กขาออก (อนุมัติโดยเจ้าของ)

### 3.1 ลำดับการทำงานและผลรีวิว

| รอบ | สร้างอะไร | Commit | ผล Sol |
|---|---|---|---|
| **A1** | `0193` — claim RPC + record RPC ใหม่ (แถวกลุ่ม, service role, transition guard, retry bound) | `a70da502` | ❌ **REJECT** — RPC ไม่มีผู้เรียก (sender ยังใช้ SELECT เดิม) + P0-6 ไม่มี transient/permanent |
| **A2** | `0194` + ต่อสาย sender เข้า RPC จริง, `next_attempt_at`, `claim_token` fencing, `X-Line-Retry-Key`, ลงทะเบียน suite ใน CI | `ff564c85` | ❌ **REJECT** — จำแนกความล้มเหลวยังผิด + backoff เพี้ยนตาม timezone |
| **A3** | `0195` — ส่งต่อ error ที่เคยถูกทิ้ง, backoff timezone-safe | `1b6769ff` | ❌ **REJECT** — **แก้เกิน** ทำให้ flow `#ผูก` ของ 0097 ตายถาวร + `sent_at` ยังเพี้ยน |
| **A4** | `0196` — คืน monolith fallback ให้กลุ่มที่ยังไม่ผูก, `sent_at := now()`, UUID guard, HTTP 408 transient | `46a203a6` | ✅ **ACCEPT PHASE A4** |

### 3.2 สิ่งที่แก้จบแล้วบนเส้นทางที่รันจริง

- **B1 ส่งซ้ำ** — `claimPending` เรียก `rpc_claim_line_outbound_batch` จริง (`index.ts:676-687`); claim แบบ `FOR UPDATE SKIP LOCKED` + reclaim ตาม timeout + `claim_token` fencing กันคนถือ lease ค้างเขียนทับ
- **B2 service role** — ตรวจ service context จาก **SQL role** (`current_setting('role')`) ไม่ใช่ JWT → ปลอม claim ใน JWT ไม่ผ่าน; ด่านของมนุษย์ (governance/site) ไม่ถูกผ่อนเลย
- **B3 แถวกลุ่ม** — LEFT JOIN + vertical จาก `line_groups` + fallback `monolith` ตาม 0097 + audit site เป็น NULL
- **B4 transition guard** — บันทึกได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้ว → `recorded=false` ไม่มี audit ซ้ำ
- **B5/P0-6 retry** — แยก transient (network/timeout/5xx/429/408/ลูกอัป lookup error) กับ permanent (config ที่ไม่มีจริง/template ปิด/slot ไม่ตรง/4xx อื่น) + exponential backoff + เพดาน 5 ครั้ง
- **P0-5** — `X-Line-Retry-Key = outbound row id` บน push ทุกชนิด (text/flex/image); reply ไม่ใส่ (reply token ใช้ครั้งเดียวอยู่แล้ว)
- **บั๊ก timezone 2 จุดที่ถ้าไม่เจอจะร้าย** — `next_attempt_at` และ `sent_at` เคยรับค่า `timezone('utc', now())` (timestamp ไม่มี tz) ใส่คอลัมน์ `timestamptz` → ในไทย backoff กลายเป็นศูนย์ และเวลาส่งเพี้ยน ~7 ชั่วโมง (ผมรีโปรดิวซ์เองยืนยันก่อนแก้)

### 3.3 หลักฐาน (gate รันเองแยกจาก builder)

- **pgTAP 70/70** ผ่าน ใน rollback wrapper `BEGIN; 0193; 0194; 0195; 0196; suite; ROLLBACK` — รวมเทสต์ regression ที่รันใต้ `set local timezone='Asia/Bangkok'` ทั้ง backoff และ `sent_at`
- **vitest 18 ไฟล์ / 73 เทสต์** ผ่าน
- **ไม่มี leak บน stack ที่แชร์** (ตรวจคอลัมน์หลังรัน = 0)
- **ไม่มี `cron.schedule`** ใน 0193–0196 และไม่มีการ activate การส่งจริง

### 3.4 สิ่งที่ยัง **ไม่ได้** พิสูจน์ (Sol ระบุเอง — ห้ามพูดเกิน)

- Python property suites **ไม่เคยรัน** (เครื่องนี้ไม่มี python ติดตั้ง)
- เทสต์ claim แข่งกัน 2 client **ข้ามไป** เพราะต้องมี DSN ของ stack ชั่วคราวโดยเฉพาะ
- **ยังไม่มีการรัน CI / Edge Function จริง / LINE API จริง** สักครั้ง
- พฤติกรรม retry key ฝั่ง LINE เป็นการรับประกันภายนอก — ด่านใน DB อย่างเดียวไม่กัน worker 2 ตัวที่ lease หมดอายุยิงถึง LINE พร้อมกัน
- **P0-9 (B8 — `handler_error`) ยังไม่ได้สร้าง** ทั้งที่อยู่ในขอบเขต Phase A ที่อนุมัติแล้ว

---

## 4. ส่วนที่ 3 — Repair Phase 0: Wave 3 → 3.4

| Wave | สาระ | ผล Sol |
|---|---|---|
| **3** | LOW-1 org status load-bearing, LOW-4 sha256 เต็ม, accepted-risks, negative-control harness | ❌ REJECT — (1) context ที่ mint ก่อนปิด org ยังใช้ mutate ได้ (2) harness อ้าง "every gate" เกินจริง |
| **3.1** | `0192` recheck org+site ตอน consume (pgTAP 18→21), harness ซื่อตรง, accepted-risks ตรงความจริง, regen exit review | ❌ REJECT — final gate ยอมรับ report หาย + exit review อ้างหลักฐาน 18 ข้อเก่า |
| **3.2** | `REQUIRED_REPORT_MANIFEST` (28 report ลบตัวไหนก็ตก), TAP 21/21 ใหม่, `0192` fail-fast เจอ overload แปลกปลอม, ranges 0189–0192 | ✅ **ACCEPT** |
| **3.3** | evidence issuer เลิก hardcode `verified:false`, `build-evidence-manifest.mjs` + ต่อสาย CI, TAP name mapping, db-verify ถึง 0192, docs verifier ครอบ governance docs | ❌ REJECT — (1) manifest ปลอมที่สอดคล้องกันเองยังเซ็นผ่าน (2) final gate รับ `{"verified":true}` เปล่า + ไม่บังคับผล evidence job |
| **3.4** | issuer คำนวณ sha256 จากไบต์จริง + pin git/CI, บังคับ `RELEASE_SIGNER_KEY_IDS` + https + แยก origin, final gate ตรวจ attestation จริง, TAP ชนกัน = `EVIDENCE_CONFLICT` | ❌ REJECT — issuer ยัง**ไม่อ่านความหมาย**ในไบต์ (ไม่คำนวณ pass/fail ใหม่) + ไม่ pin ตัวเอง |

**บั๊กเด่นที่พบระหว่างทาง:** stack ที่แชร์ (127.0.0.1:54322) มี `consume_verified_action_context(uuid,text,boolean)` จากสาขาอื่นค้างอยู่ ทำให้เรียกแบบ 2 argument กำกวม (42725) — `0192` จึง fail-fast พร้อมข้อความชัดเมื่อเจอ DB แบบนี้

---

## 5. เอกสารและไฟล์ที่เกิดขึ้นในรอบนี้

| ไฟล์ | หน้าที่ |
|---|---|
| `docs/PRD-LINE-OA.md` | **PRD ระบบ LINE ทั้งหมด** ฉบับ 1.1 — สถานะจริง 4 ระดับ + requirements + คำถามรอเจ้าของ |
| `supabase/migrations/0193_line_outbound_claim_and_record.sql` | claim RPC + record RPC ใหม่ |
| `supabase/migrations/0194_line_outbound_retry_and_claim_fencing.sql` | `next_attempt_at`, `p_failure_class`, `claim_token` |
| `supabase/migrations/0195_line_outbound_timezone_safe_backoff.sql` | backoff timezone-safe |
| `supabase/migrations/0196_line_outbound_timezone_safe_sent_at.sql` | `sent_at := now()` + sweep |
| `supabase/tests/line_outbound_claim_record.sql` | pgTAP 70 assertions (รวม Asia/Bangkok regression) |
| `supabase/functions/line-outbound-sender/index.ts` | เรียก claim RPC, จำแนกความล้มเหลว, ส่ง claim token, `X-Line-Retry-Key` |
| `tests/line-oa-commerce/ts/*.unit.test.ts` (6 ไฟล์ใหม่) | เทสต์ wiring/classification/fencing/retry-key/CI registration |
| `tests/line-oa-commerce/concurrency/claim-race.mjs` | harness 2 client (ต้องระบุ DSN ชั่วคราวเอง) |
| `supabase/migrations/0192_repair_phase0_consume_org_recheck.sql` | Phase 0: recheck org/site ตอน consume + fail-fast overload |
| `scripts/trust-kernel/evidence-manifest-integrity.mjs` | โมดูลกลางกัน builder/issuer/gate ไถลจากกัน |
| `scripts/trust-kernel/build-evidence-manifest.mjs` | สร้าง EvidenceManifestV1 จาก report tree ของ CI |

---

## 6. คำถามที่รอเจ้าของตัดสิน (ยังไม่มีใครตอบ — ห้ามเดาแทน)

| # | คำถาม | บล็อกอะไร |
|---|---|---|
| 1 | Environment จริงมี cron เรียก `line-outbound-sender` ไหม (ในเรโปไม่มีแน่นอน) | ถ้ามีอยู่ = บั๊กเดินอยู่จริง ต้องรีบ deploy ของที่แก้แล้ว |
| 2 | ต้องมี human-approval ก่อนส่งหาลูกค้าจริงไหม | P1 |
| 3 | Autonomy gate + brand-voice: wire ให้ live หรือเลิกอย่างเป็นทางการ + แก้ `tasks.md:157` | P0-7 |
| 4 | ส่งลูกค้าโดยไม่มี consent gate รับได้ชั่วคราวไหม (PDPA) | P0-8 / P1 |
| 5 | Subsystem ที่ตายสนิท (ordering/forecast/R-03/auto-close/TCCK) เก็บหรือลบ | P2 |
| 6 | ต้องมีหน้า admin จัดการ template ไหม | P2 |
| 7 | เรโปไหนเป็น authoritative ของ LINE subsystem (เรโปนี้ vs เรโป product ที่มี Trust Kernel `0171–0179`) | การนำงานไปใช้ข้ามเรโป |

**ข้อ 7 มีข้อมูลใหม่:** แผน amendment ของเรโป product (26 ก.ค. 2026) ยืนยันว่าเรโป product เป็นเจ้าของ roadmap LINE Trust Kernel โดย `0178` = atomic outbox ซึ่งทับกับ P0-1 ของเรา — งาน Phase A ในเรโปนี้จึงทำเป็น **patch แยกชัดต่อบั๊ก** เพื่อ port ไปได้ ไม่แย่งเลข migration

---

## 7. คิวงานถัดไป

1. **P0-9 (B8)** — `handler_error` ต้องไม่ถูกนับว่าสำเร็จ และต้องมี **retry state ของเราเอง** (ห้ามพึ่ง LINE redelivery เพราะ LINE ไม่รับประกัน)
2. **Wave 3.5** — issuer ต้อง re-derive ผล pass/fail จากไบต์ report จริง + pin ตัวเอง/โมดูล integrity + บังคับ tracked tree สะอาด
3. **Phase C (ต้องรอคำตอบข้อ 1, 2, 4)** — ตั้ง cron จริง + consent gate + human-approval ก่อนเปิดส่งลูกค้า
4. **Phase D (รอคำตอบข้อ 5, 6)** — เก็บกวาด subsystem ที่ตาย + admin UI

---

## 8. บทเรียนที่จดไว้ใช้ต่อ

1. **"batch DB layer" ไม่พอ** — RPC ที่ถูกต้องแต่ไม่มีใครเรียก = ไม่ได้แก้อะไร (Sol จับได้ที่ A1) ต่อไปนี้ทุก batch ต้องตรวจ consumer ด้วย
2. **การแก้ที่ระวังเกินไปก็อันตราย** — A3 ทำให้ flow onboarding ตายถาวรเพราะตีความ "ไม่มีแถว" ว่าเป็นความล้มเหลว
3. **Session ของ builder ไม่ตายพร้อม timeout** — MCP ตัดที่ 30 นาทีแต่ process ยังเขียนไฟล์ต่อ เคยทำให้เกิด import ซ้ำและแก้ไฟล์ทับกับ gate → ตอนนี้ builder ต้องเขียน sentinel file ตอนจบ และ gate รอ tree นิ่งก่อน commit
4. **Sandbox ของ builder เขียน `.git/worktrees` ไม่ได้** → builder ไม่ commit, gate commit แทน และระบุไว้ใน commit message ทุกครั้ง
