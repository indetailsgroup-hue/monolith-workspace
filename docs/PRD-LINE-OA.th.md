# PRD — ระบบสื่อสาร LINE OA ทั้งหมด (MONOLITH Repair Intelligence)

> **ภาษา:** ไทย · ฉบับภาษาอังกฤษ: `docs/PRD-LINE-OA.en.md` · HTML: `docs/PRD-LINE-OA.th.html` / `docs/PRD-LINE-OA.en.html`
> **ฉบับ:** 1.18 · 2 ตุลาคม 2026 (1.17, 1.16 และ 1.15 = 2 ต.ค. 2026 · 1.14, 1.13, 1.12, 1.11, 1.10, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3 และ 1.2 = 30 ก.ย. 2026 · 1.1 = 1 ส.ค. 2026 · 1.0 = 26 ก.ค. 2026)
> **สิ่งที่เปลี่ยนในฉบับ 1.18:** P0-9 รอบ 3 (1902a8eea และแก้ verifier ที่ 20132e1b4) บน `claude/line-p009-ingest-retry` การรีวิวอิสระค่ายเดียวกันครั้งที่สองของรอบ 2 ได้ผล ACCEPT WITH FOLLOW-UPS จากผู้ตรวจทั้งสอง ไม่มี blocker หรือ major ปิดแบบเขียนเทสต์ก่อนแล้ว: แถวที่หมดอายุแต่ event ถูก ingest ไปแล้วจะปิดแทนการ dead-letter, การหมดอายุเก็บ error ที่ทำให้เข้าคิวไว้, จำกัดจำนวนครั้งไว้ที่เพดาน, การส่งครั้งแรกเก็บ `received_at` ที่ปลอดภัยเรื่อง timezone ด้วย และการตรวจแบบ fail-closed ครอบคลุมสิทธิ์อ่านระดับคอลัมน์ case C พิสูจน์ได้ว่าไฟล์ migration ถูกรันจริง และโหมด `--recheck` ให้ผู้ตรวจทำการตรวจหลักฐานซ้ำได้ภายหลัง RED ล้ม 48 จาก 53, GREEN 53/53, จับ mutant ของ suite ได้ 14 ตัวและของ race 2 ตัว ยังไม่ push และรอการรีวิวข้ามค่าย
> **สิ่งที่เปลี่ยนในฉบับ 1.17:** P0-9 รอบ 2 (fb9bfd967) บน `claude/line-p009-ingest-retry` การรีวิวอิสระค่ายเดียวกันของรอบ 1 พบ blocker 0 major 5 minor 15 (Codex/Sol ใช้ไม่ได้จนถึง 7 ตุลาคม 2026) แก้แบบเขียนเทสต์ก่อนแล้ว: แถวเก่าหมดอายุแทนการ replay ช้า, error ที่ไม่ถูกจับของแถวหนึ่งไม่ทำให้คิวค้าง, `received_at` ปลอดภัยเรื่อง timezone, ล้าง `last_error` เมื่อสำเร็จ, service_role ไม่มี MAINTAIN, มีการตรวจสิทธิ์แบบ fail-closed, race พิสูจน์การทับซ้อนได้จริง, มีเทสต์สอง event และ fail-closed และหลักฐาน mutant อยู่ใน repo RED ล้ม 43 จาก 48, GREEN ผ่าน 48/48, mutant ของ suite 9 ตัวและของ race 2 ตัวถูกจับได้ทั้งหมด บันทึกข้อค้นพบใหม่ B13 (postback branch) ให้เจ้าของ ยังไม่ push และรอการรีวิวข้ามค่าย
> **สิ่งที่เปลี่ยนในฉบับ 1.16:** สร้าง P0-9 (B8) แบบเขียนเทสต์ก่อนใน migration 0200 บน branch ในเครื่องแยกต่างหาก `claude/line-p009-ingest-retry` (ฐาน 29e5e78d3, commit โค้ด 18a24483e) ตามคำสั่งเจ้าของ และสร้างก่อนมติ §8 ข้อ 7 เรื่อง P0-9 กับ `0175` ของ line-trust handler กลุ่มที่ล้มจะไม่ถูกนับเป็น processed อีกต่อไป: event เข้าคิวใหม่ `line_oa_inbound_retry` การส่งซ้ำของ event ที่อยู่ในคิวนับเป็น duplicate และ `rpc_line_inbound_retry_sweep` ซึ่งเรียกได้เฉพาะ service ประมวลผลแถวที่ถึงกำหนดซ้ำ (backoff 1/2/4/8 วินาที และ dead-letter พร้อม audit ที่ครั้งที่ 5) ไม่เพิ่ม cron หลักฐานที่ 0a355e29b: RED (chain ที่ยังไม่ apply 0200) ล้ม 31 จาก 35 ข้อใหม่ และข้อ 1 บันทึกว่า handler ที่ล้มได้ `events_processed` เป็น 1; GREEN ผ่าน 35/35, race ของ sweep สอง client เคลมแถวทั้ง 20 แถวแถวละครั้งเดียว และผลของ suite อื่นกับผล Python ทุกข้อเหมือนเดิม ยังไม่ merge เข้า branch นี้ ยังไม่ push และรอผู้ตรวจอิสระ
> **สิ่งที่เปลี่ยนในฉบับ 1.15:** PR #133 รันบน GitHub Actions ครั้งแรก ที่ a97c3c847 DB Verify ผ่าน suite LINE ทั้ง 5 ชุด (107/133/28/82/23 และ claim race ซ้ำ 0) แต่ผลรวมล้มที่ `trust_kernel_containment` (เพราะ `supabase/config.toml` ปิด storage) และที่ `repair_phase0_containment` ซึ่งรู้อยู่แล้ว commit 48b72d4c7 แก้ข้อค้นพบของ claim linter (แก้ REPORT ของชุดหลักฐานที่ปิดผนึก 8 ชุดแบบเปิดเผยตามทางเลือก ก ของเจ้าของ) เปิด storage และเพิ่ม preflight ของ shadow E2E ใน commit นั้น claim linters ผ่าน และ `trust_kernel_containment` ได้ 16/16 จากนั้นการตรวจฝั่งผู้สร้างก่อนส่งตรวจทำให้เทสต์ของ 0199 เข้มขึ้น (รอบ 2) คือ probe แบบ anon ที่เขียนข้อมูลได้จริง case identity หาย และการตรวจข้อความ ACL ของฟังก์ชัน พร้อมหลักฐาน RED-A, mutant และ GREEN ใหม่ ยังรอผู้ตรวจอิสระ ยังห้าม deploy และ Phase A ยังเป็น `EVIDENCE_INCOMPLETE`
> **สถานะเอกสาร:** รอเจ้าของ (คุณเดฟ) ตัดสินคำถามเปิดใน §8 — ทุกขั้นที่เสนอใน §9 ไม่เปิด cron และไม่ส่งข้อความหาลูกค้าจริง
> **หลักการเขียน:** ทุกแถวแยก "ทำงานจริง / มีโค้ดแต่ไม่ต่อสาย / อยู่แค่ spec" พร้อมอ้าง file:line และแยกหลักฐาน "ตรวจซ้ำได้ (มี raw output ใน repo)" ออกจาก "รายงานไว้ (ไม่มี raw output ใน repo)"
> **หมายเหตุความจริง:** เอกสารเดิม (`docs/LINE-Architecture-System-Complete.md:41`, `docs/PRD.md:514`) ระบุ "LINE OA Commerce ✅ 20/20" ซึ่งเกินจริงสำหรับ live path — เอกสารนี้คือบันทึกสถานะที่ตรงความจริงกว่า

---

## 0. สถานะการดำเนินการ (ฉบับ 1.18)

**P0-1 ถึง P0-6 ฉบับเดิมมี implementation และผ่านรีวิวข้ามค่ายแล้ว ส่วนการแก้ P0-11 ที่ 00651a6cd ผ่านการตรวจรับข้ามค่ายแล้ว P0-10 (0198) ผ่านการตรวจโค้ดและหลักฐานโดยผู้ตรวจอิสระที่ 87930836a (ผู้ตรวจไม่ได้รันซ้ำ) และงานติดตามรับด้าน source/หลักฐานที่บันทึกแบบจำกัดขอบเขตแล้ว ยังขาดการรันฐานข้อมูลซ้ำโดยผู้ตรวจและการตรวจข้ามค่าย ส่วน B12 (0199) สร้างในเครื่องแล้วและรอผู้ตรวจอิสระ และ P0-9 (0200) สร้างบน branch ในเครื่องแยกต่างหากและรอการรีวิวข้ามค่าย — Phase A ยังไม่ปิด**

**สถานะหลักฐาน Phase A:** `EVIDENCE_INCOMPLETE` — รอบล่าสุดในเครื่อง (GREEN ของ 0199) Python 72/72 และ pgTAP LINE 107/133/28/82/23 ผ่าน loop ครบทั้ง 14 suite แล้ว แต่ `repair_phase0_containment` ล้ม (6 จาก 8 ข้อ เพราะไม่มีฟังก์ชัน) GitHub Actions รันบน push ของ PR #133 แล้ว (ตารางด้านล่าง) แต่ผลรวมยังล้ม และยังไม่มีการตรวจ production, B12 (0199) รอผู้ตรวจอิสระ บน branch `claude/line-p009-ingest-retry` รอบ GREEN ของ P0-9 รอบ 3 (1902a8eea) ผ่าน suite ใหม่ 53/53 และ loop 15 suite ล้มเฉพาะ `repair_phase0_containment` โดย P0-9 รอการรีวิวข้ามค่าย งานติดตามรับด้าน source/หลักฐานแบบจำกัดขอบเขตแล้ว ยังขาดการรันซ้ำและการตรวจข้ามค่าย

- **Branch:** `codex/repair-intelligence-phase0-trust` · commit ที่ผ่านรีวิว: `46a203a6` (1 ส.ค. 2026) · ยังไม่ push และยังไม่ deploy
- **Migrations:** `0193_line_outbound_claim_and_record.sql`, `0194_line_outbound_retry_and_claim_fencing.sql`, `0195_line_outbound_timezone_safe_backoff.sql`, `0196_line_outbound_timezone_safe_sent_at.sql` + การแก้ `supabase/functions/line-outbound-sender/index.ts`
- **ผลต่อ environment จริง:** เพราะยังไม่ deploy ทุก environment ที่รันโค้ดเดิมยังมีบั๊ก B1–B6 อยู่ครบ

**หลักฐานที่ตรวจซ้ำได้ (raw output อยู่ใน repo):** ชุด `docs/governance/evidence/line-phase-a-2026-09-30/` รันเมื่อ 2026-09-30 04:46:33–04:46:37 UTC ที่ HEAD `5aa52315` ซึ่งโค้ดที่ทดสอบ (`supabase/`, `tests/line-oa-commerce/`) ตรงกับ `46a203a6` ทุก byte

| ไฟล์ | สิ่งที่บันทึก | ผล |
|---|---|---|
| `00-context.txt` | เวลา UTC, SHA, การยืนยันว่าโค้ดตรงกับ `46a203a6`, เวอร์ชันเครื่องมือ, คำสั่งที่ใช้, exit code | pgTAP exit 0 · vitest exit 0 |
| `01-precheck.txt` / `04-postcheck.txt` | ค่าตรวจ 7 รายการก่อนและหลังรัน: จำนวนคอลัมน์ A1–A4, function `rpc_claim_line_outbound_batch`, `rpc_record_line_send_result` แบบ 5 argument, extension pgTAP และจำนวนแถวใน 3 ตาราง LINE | ค่าที่ตรวจทั้ง 7 รายการก่อน–หลังตรงกัน (sha256 ของสองไฟล์ตรงกัน) และผลรันท้ายสุดแสดง ROLLBACK; ไม่พบสิ่งค้างในขอบเขตที่ตรวจ |
| `02-pgtap-wrapper.sql` / `03-pgtap-output.tap` | wrapper แบบ rollback และผล TAP ดิบ | 70/70 ok, 0 not ok, จบด้วย ROLLBACK |
| `05-vitest-output.txt` | ผล vitest ดิบ | 18 ไฟล์ / 73 เทสต์ผ่าน |
| `06-git-integration-check.txt` | ผลตรวจ git สำหรับ §8.1 ผูกกับ SHA | ดู §8.1 |
| `SHA256SUMS` | hash ของทุกไฟล์ในชุด | ตรวจด้วย `sha256sum -c SHA256SUMS` |

**ข้อจำกัดของชุดนี้:** ตรวจความครบถ้วนได้ด้วย hash แต่ยังรันซ้ำแบบอิสระไม่ได้ครบ — `02-pgtap-wrapper.sql` ใช้ absolute path ของเครื่องที่รัน และไม่ได้บันทึก baseline ของ shared stack ก่อนทดสอบ (รายการ migration ที่ apply แล้วและ fingerprint ของ schema); ค่าตรวจก่อน/หลังรันครอบคลุม 7 รายการเท่านั้น ไม่ใช่ snapshot ทั้งฐานข้อมูล — ชุดถัดไปต้องเป็นไปตามเกณฑ์ใน §9.1

**หลักฐานที่รายงานไว้ (ไม่มี raw output ใน repo):** ผลรันของรอบ A1–A4 วันที่ 1 ส.ค. 2026 อยู่ใน ledger ของ builder (`artifacts/wA1-ledger.md` ถึง `artifacts/wA4-ledger.md` ซึ่งไม่ได้ track ใน git) และใน commit message · คำตัดสินของรีวิวข้ามค่าย (A1–A3 ปฏิเสธ, A4 `SOL VERDICT: ACCEPT PHASE A4`) มาจาก thread รีวิวที่ไม่ได้เก็บใน repo

**หลักฐานขั้นที่ 1 บน stack ชั่วคราว** (ตรวจซ้ำได้ — raw output, สคริปต์ที่รันจาก repository root และ `SHA256SUMS` อยู่ในแต่ละชุด):

| ชุด | SHA ที่ทดสอบ | ผล |
|---|---|---|
| `docs/governance/evidence/line-phase-a-step1-2026-09-30/` (รอบ 1) | `ae990b4a` | หยุดที่ migration แรกเพราะ baseline ของฐานข้อมูลเปล่าเรียก `auth.jwt()` ไม่ได้ — ไม่ได้รันเทสต์ และไม่ใส่ shim |
| `docs/governance/evidence/line-phase-a-step1-attempt2-2026-09-30/` (รอบ 2) | `13e3cd9d` | migration chain จากศูนย์ 191/191 · pgTAP 70/70 · claim race 10+10 แถว ซ้ำ 0 · Python 56 ผ่าน / 8 ล้ม / 8 skip (skip ทั้งหมดเพราะ probe `resolve_actor()` ไม่ตรง signature จริง `resolve_actor(text)`) |
| `docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/` (รอบ 3) | `d48cfb6c` (แก้เฉพาะ probe 8 บรรทัด) | migration chain จากศูนย์ 191/191 · pgTAP 70/70 · claim race 10+10 แถว ซ้ำ 0 · Python 63 ผ่าน / 9 ล้ม / 0 skip |

**สภาพแวดล้อมของขั้นที่ 1:** stack ย่อยจาก image ในเครื่อง (postgres 17.6.1.158 + gotrue v2.195.0 + storage-api v1.66.4) บน docker network ชั่วคราว ไม่แตะ stack ที่แชร์ และลบทิ้งหลังรัน — ไม่เหมือน CI (`supabase start`) ทุก service จึงเป็นหลักฐานระดับเครื่อง ไม่ใช่ผล CI

**หลักฐาน P0-11 (30 กันยายน 2026):** `docs/governance/evidence/line-p011-red-attempt4-2026-09-30/` ยืนยัน RED: 70 เดิมผ่าน ส่วน 37 ข้อใหม่ล้ม 31 และ failure property เดิมล้ม `docs/governance/evidence/line-p011-green-2026-09-30/` ยืนยัน GREEN: migration จากศูนย์ 192 ไฟล์, pgTAP 107/107, claim race 10+10 ซ้ำ 0, Python 64 ผ่าน / 8 ล้มจาก B10 / 0 skip ตัวตรวจหลักฐานทั้งสองรอบ exit 0 ส่วน pytest exit 1 ตามผลจริง ระบุโค้ดที่รันด้วย base HEAD ร่วมกับ hash/patch ของ source ไม่ใช่ HEAD เพียงอย่างเดียว ตรวจรหัสลับที่สร้างผ่าน ค่าตรวจที่ระบุไว้ก่อน–หลังตรงกันเมื่อตัดเวลาบันทึกออก และลบ container/network ของงานแล้ว เก็บสามครั้งก่อนหน้าที่หยุดตอนเริ่มระบบก่อน migration/เทสต์ไว้เป็นบันทึกเริ่มระบบที่ไม่ครบ ใช้ bridge แยกและพอร์ต DB เฉพาะ loopback ปิดการรันงาน cron ไม่แตะ stack ที่แชร์หรือ credentials จริง การเพิ่ม 0197 เกิดหลังผลเทียบตาม SHA ใน §8.1

**ผลตรวจรับข้ามค่าย — หลักฐานที่รายงานไว้ (30 กันยายน 2026):** เจ้าของส่งคำตัดสิน ACCEPT ของผู้ตรวจอิสระสำหรับ P0-11/B11 ที่ commit `00651a6cd` ผู้ตรวจรายงานว่ารันซ้ำบน tree สะอาดกับ stack ชั่วคราว ได้ migration 192/192, pgTAP 107/107, claim race 10+10 ซ้ำ 0, Python 64 ผ่าน / 8 ล้มเฉพาะ P0-10 / 0 skip ตัวตรวจผ่านและลบ container แล้ว ไฟล์ดิบของรอบตรวจยังอยู่ใน scratchpad ภายนอกของผู้ตรวจ งานเอกสารรอบนี้ยังไม่ได้เปิดตรวจหรือนำเข้ามาใน repo hash ย่อที่รายงานคือ pgTAP `9f5870b5…`, pytest `7362d613…`, ตัวตรวจ `8c4b8f8d…` ใช้ระบุรายงาน ไม่ใช่ checksum เต็มที่ใช้ตรวจไฟล์ได้ ข้อจำกัดเรื่อง byte ของ source ยังเป็นไปตาม GREEN `12-source-verification.txt`: 20 ไฟล์ตรงกับ Git blob ทุก byte และ 207 ไฟล์ต่างเฉพาะ CRLF/LF ผลรับรองนี้ปิด B11/P0-11 และคืนสถานะผ่านการรับรองให้ P0-6 แต่ไม่ปิด Phase A ไม่อนุมัติ P0-10 และไม่อนุมัติ push/deploy

**หลักฐาน catalog ของ P0-10 (30 กันยายน 2026, commit da252d18a):** `docs/governance/evidence/line-p010-catalog-2026-09-30/` รัน checklist แบบอ่านอย่างเดียวที่อนุมัติบน stack ชั่วคราวที่สร้างจากศูนย์ที่ฐาน 6a41ebb69 (migration 192/192) ตารางทั้ง 8 มี owner เป็น `postgres` ฟังก์ชันผู้สมัคร 20 ตัวเป็น SECURITY DEFINER 20 identity ที่ owner คือ `postgres` สิทธิ์เขียนจึงมาจากความเป็นเจ้าของ ไม่ได้มาจากการเป็นสมาชิก `service_role` ไม่มี view หรือ rule ที่พึ่งพาตารางเหล่านี้ และ default ACL ให้สิทธิ์ตารางกับฟังก์ชันใหม่แก่ 3 role นี้อีก ผู้ตรวจอิสระยืนยัน checksum เทียบ Git blob และเห็นว่าหลักฐานพอสำหรับเสนอ 0198 (ผลตรวจที่เจ้าของส่งมา) ข้อจำกัดที่ยังอยู่คือการที่ gate หยุด commit ได้จริงในรอบนั้นเป็นเพียงคำรายงานของผู้สร้าง ไม่มีในชุดหลักฐาน ผลนี้พิสูจน์เฉพาะ chain ที่สร้างใหม่ ไม่ใช่ production

**หลักฐานการสร้าง P0-10 (30 กันยายน 2026, รอการตรวจรับอิสระ):** เจ้าของอนุมัติ 0198 โดยรวม `service_role` ในขอบเขต `docs/governance/evidence/line-p010-red-2026-09-30/` (ฐาน da252d18a ไม่มี 0198) ได้ migration 192 ไฟล์, pgTAP เดิม 107/107, pgTAP ใหม่ของ P0-10 ผ่าน 19 และล้มตรง 114 ข้อที่ตรวจสิทธิ์เขียน, claim race ซ้ำ 0, Python 64 ผ่าน / 8 ล้มจาก B10 / 0 skip ส่วน `docs/governance/evidence/line-p010-green-2026-09-30/` (ฐานเดียวกันบวก 0198 และไบต์เทสต์เดียวกัน) ได้ migration 193 ไฟล์, pgTAP 107/107 และ 133/133, claim race ซ้ำ 0, Python 72/72 ไม่มี skip และ catalog แสดงว่า 3 role ไม่มีสิทธิ์เขียนบนทั้ง 8 ตาราง โดย owner ยังมีสิทธิ์ครบและ EXECUTE ไม่เปลี่ยน ตัวตรวจของแต่ละรอบ exit 0, credential scan ระหว่างรันผ่าน และลบ container/network แล้ว ผู้สร้างไม่ตรวจรับงานตัวเอง P0-10 จึงยังเปิดอยู่จนกว่าจะผ่านการตรวจรับอิสระ

**ผลตรวจอิสระของ 87930836a — รายงานไว้ (30 กันยายน 2026):** เจ้าของส่งผลตรวจของผู้ตรวจอิสระมาว่า commit นี้ผ่านการตรวจโค้ดและหลักฐาน ไม่พบข้อผิดพลาดที่ขวางการรับงานในขอบเขต 0198 ผู้ตรวจยืนยัน gate 27 ข้อ, checksum เทียบ Git blob รวมของ transcript, tree ที่ gate ตรวจ `021e96f6…`, ความตรงกันของ migration และเทสต์ระหว่าง RED กับ GREEN, ผลดิบ, catalog (client ไม่มีสิทธิ์เขียน owner ยังมีครบ ส่วน function body, EXECUTE, membership และ default ACL ไม่เปลี่ยน) และความตรงกันของ HTML กับ renderer ผู้ตรวจไม่ได้รันฐานข้อมูลซ้ำ และขอให้ติดตาม 2 เรื่อง คือพิสูจน์เส้นทาง fail-closed และลงทะเบียน suite ใหม่ใน CI

**หลักฐานงานติดตาม P0-10 (30 กันยายน 2026, ในเครื่อง, รอผู้ตรวจอิสระ):** `docs/governance/evidence/line-p010-failclosed-red-2026-09-30/` รัน suite ใหม่ `supabase/tests/line_oa_client_write_revoke_fail_closed.sql` กับสำเนา mutant ของ 0198 ที่ตัดเฉพาะส่วนตรวจสิทธิ์คงเหลือ ผลคือล้มตรง 8 assertion ที่ตรวจการปฏิเสธและการ rollback โดยได้ SQLSTATE 00000 แทน 42501 ส่วน `docs/governance/evidence/line-p010-failclosed-green-2026-09-30/` รัน suite เดียวกันกับ 0198 จริงได้ 13/13 รอบเดียวกันได้ pgTAP ของ P0-10 133/133, เดิม 107/107, claim race ซ้ำ 0 และ Python 72/72 ไม่มี skip โดย 0198 ไม่ถูกแก้ รอบนี้รันขั้นฐานข้อมูลของ `db-verify.yml` ที่แก้แล้วในเครื่องด้วย ขั้น pgTAP หยุดที่ `repair_phase0_containment.sql:74` ซึ่งตรวจ `rpc_factory_job_record_packet` แบบ 12 argument ที่มีเฉพาะใน `0170_factory_jobs_list_real_fields.sql` บน origin/main เมื่อรันตัว loop เดียวกันเฉพาะ 3 suite ของ LINE ผ่านครบ (107, 133 และ 13) ผลทั้งหมดเป็นผลรันในเครื่อง ไม่ใช่ผล GitHub Actions

**หลักฐานปรับ CI ของ P0-10 (30 กันยายน 2026, ในเครื่อง, รอผู้ตรวจอิสระ):** ฐาน `a0ea86320` เก็บชุดใหม่ที่ `docs/governance/evidence/line-p010-ci-hardening-red-2026-09-30/` และ `docs/governance/evidence/line-p010-ci-hardening-green-2026-09-30/` RED ล้มตรง 20 assertions ที่ตรวจการปฏิเสธ/rollback เมื่อใช้ mutant ที่ตัด guard ส่วน GREEN ผ่าน fail-closed 28/28, เดิม 107/107, P0-10 133/133, Python 72/72 ไม่มี skip และ claim race 10+10 ซ้ำ 0 Unit tests ของตัวตรวจ TAP ผ่าน 22/22 full loop ในเครื่องไปถึงทุก suite แล้ว และเก็บ stdout, stderr, exit code แยกกัน ล้มเฉพาะ containment ที่รู้จัก: exit 3, ผล 6/8 และไม่มีฟังก์ชัน 12 argument ตาม signature ที่กำหนด สรุป LINE ผ่านแต่ pgTAP เต็มไม่ผ่านอย่างถูกต้อง verifier ปฏิเสธ failure ที่ต่างออกไป Metadata ระบุ local ไม่อ้างว่าเป็น GitHub Actions ไม่แก้ 0198 และชุดหลักฐานเก่า

**หลักฐาน B12 / P0-12 (30 กันยายน 2026, ในเครื่อง, รอผู้ตรวจอิสระ):** เจ้าของอนุมัติให้สร้าง matrix ในรอบเดียว และตัดสินให้การบันทึกผลส่งเป็น service-only `supabase/migrations/0199_line_oa_restrict_definer_execute.sql` revoke EXECUTE บน 20 identity จนได้ผลดังนี้

- anon ไม่มีสิทธิ์เลย
- helper ภายใน 3 ตัวเรียกได้เฉพาะ owner
- ทางเข้าของ service คง service_role
- RPC ของ field-app และที่ยังไม่รู้ผู้เรียกคง authenticated และ service_role
- PUBLIC ไม่มีสิทธิ์เลย

migration ไม่ grant เพิ่ม และล้มแบบปิดไว้ก่อน `docs/governance/evidence/line-p012-red-a-2026-09-30/` (ฐาน 5119396a7 ไม่มี 0199) แสดงว่า suite matrix ใหม่ล้มตรง 46 ข้อที่ตรวจ matrix, PUBLIC และการปฏิเสธ ส่วน assertion ของเส้นทางที่ต้องยังทำงานผ่านทั้งหมด `docs/governance/evidence/line-p012-red-b-2026-09-30/` แสดงว่า suite fail-closed ล้มตรง 12 ข้อที่ตรวจการปฏิเสธและ rollback เมื่อรันกับ mutant ที่ตัดขั้นตรวจหลัง revoke ออก `docs/governance/evidence/line-p012-green-2026-09-30/` ได้ migration 194 ไฟล์, matrix 82/82, fail-closed ของ 0199 23/23, suite เดิม 107/107, P0-10 133/133, fail-closed ของ 0198 28/28, Python 72/72 และ claim race ซ้ำ 0 ในรอบนั้น runner 14 suite ในเครื่องล้มเฉพาะ suite containment เดิม รอบ 2 (2 ตุลาคม 2026, `docs/governance/evidence/line-p012b-red-a-2026-10-02/`, `-red-mutants-` และ `-green-`) ทำให้เทสต์เข้มขึ้นบน 48b72d4c7 โดยไม่แก้ 0199 เมื่อไม่มี 0199 suite matrix ล้มตรง 47 ข้อ รวม probe การเขียนข้อใหม่ซึ่งแสดงว่าการเรียกแบบ anon ด้วยค่าจริง 4 แบบเขียนข้อมูลได้ก่อน rollback และ suite เดิมล้มตรงข้อ 23, 41 และ 43 mutant B ล้มตรง 12 ข้อ และ mutant C (ตัดการตรวจ identity) ล้มตรง 2 ข้อของ fail-closed ส่วน GREEN ได้ matrix 82/82, fail-closed ของ 0199 27/27, suite เดิม 107/107, P0-10 133/133, fail-closed ของ 0198 28/28, Python 72/72 และ claim race ซ้ำ 0

เทสต์เดิมเปลี่ยนตามนโยบาย 2 จุด suite เดิมตรวจว่า authenticated ไม่มี EXECUTE บน recorder แล้ว และ suite ของ P0-10 เรียก `fn_prod_curated` ผ่าน `rpc_field_create_appointment` แทนการเรียกตรงด้วย service_role caller register ของ ops และการยืนยันจากเจ้าของ manufacturing เรื่อง `fn_prod_curated` ยังไม่มา จึงห้าม deploy จนกว่าจะได้คำตอบและตรวจ production catalog แล้ว

**หลักฐาน P0-9 / B8 (2 ตุลาคม 2026 ในเครื่อง รอการรีวิวข้ามค่าย):** เจ้าของเลือกให้ทำ P0-9 แบบเขียนเทสต์ก่อนโดยไม่รอมติ §8 ข้อ 7 จึงสร้างบน branch ในเครื่องของตัวเอง `claude/line-p009-ingest-retry` จาก 29e5e78d3 และยังไม่ merge เข้า branch นี้ `supabase/migrations/0200_line_inbound_handler_retry.sql` แก้เฉพาะ group branch ของ `rpc_ingest_line_webhook` (ส่วนอื่นของ body จาก 0097, signature และ EXECUTE matrix ของ 0199 คงเดิม และแถวของกลุ่มได้ `received_at` ที่ปลอดภัยเรื่อง timezone) และเพิ่มตาราง `line_oa_inbound_retry` กับ `rpc_line_inbound_retry_sweep` ที่เรียกได้เฉพาะ service งานนี้ผ่านการรีวิวอิสระค่ายเดียวกันสองครั้ง (Codex ใช้ไม่ได้จนถึง 7 ตุลาคม 2026): รอบ 2 (fb9bfd967) ตอบ blocker 0 major 5 minor 15 และรอบ 3 (1902a8eea) ปิดข้อติดตามของการรีวิวครั้งที่สอง ซึ่งผู้ตรวจทั้งสองให้ผล ACCEPT WITH FOLLOW-UPS ไม่มี blocker หรือ major sweep จะ dead-letter แถวที่อยู่ในคิวเกิน 10 นาที (reason expired และเก็บ error เดิมไว้) โดยไม่รัน handler เว้นแต่ event นั้นถูก ingest โดยการส่งอื่นไปแล้ว ทำให้ล้มเฉพาะแถวที่เกิด error ใดก็ตาม จำกัดจำนวนครั้งไว้ที่เพดาน และล้าง `last_error` เมื่อสำเร็จ service_role มีแค่ SELECT และ migration ปิดท้ายด้วยการตรวจสิทธิ์แบบ fail-closed ที่ครอบคลุมสิทธิ์อ่านระดับคอลัมน์ด้วย suite `supabase/tests/line_inbound_handler_retry.sql` มี 53 ข้อ และจำลองความล้มเหลวด้วย trigger สำหรับเทสต์ภายใน transaction ที่ rollback `docs/governance/evidence/line-p009-r3-red-2026-10-02/` (chain ที่ยังไม่ apply 0200) ล้ม 48 จาก 53 ข้อ ข้อ 7, 39, 40 และ 41 เป็น control ข้อ 48 รันไฟล์ migration เอง และข้อ 1 บันทึกว่า handler ที่ล้มได้ `events_processed` เป็น 1 ซึ่งคือ B8 RED หลายข้อแสดงเพียงว่ายังไม่มี object ของคิว จึงมี `docs/governance/evidence/line-p009-r3-mutants-2026-10-02/` ที่ apply 0200 ฉบับที่จงใจทำให้ผิด 14 ฉบับ และแสดงว่าแต่ละฉบับถูก assertion ที่ระบุไว้จับได้ และแสดงว่า race สอง client ล้มเมื่อ sweep ใช้ `FOR UPDATE` อย่างเดียวหรือไม่มี lock สำหรับเคลม ขณะที่ harness ของรอบ 1 ยังผ่านฉบับ `FOR UPDATE` อย่างเดียว `docs/governance/evidence/line-p009-r3-green-2026-10-02/` (195 migration) ผ่าน 53/53 โดย loop 15 suite ล้มเฉพาะ `repair_phase0_containment` race พิสูจน์การทับซ้อนได้ (client B ทำงานภายใน transaction ที่ client A ยังเปิดอยู่ และแต่ละฝั่งเคลม 10 จาก 20 แถว) claim race ฝั่ง outbound ซ้ำ 0 เทสต์ของ CI harness ผ่าน และ Python ทุก suite (106 กรณี: ผ่าน 93 ข้าม 13 ซึ่งเป็น probe ที่รู้อยู่แล้ว ล้ม 0) ได้ผลทุกข้อเหมือน RED ตัวเลข 72/72 ข้างบนนับเฉพาะ suite ที่จำเป็นบนเส้นทาง record/claim ของ outbound ผู้ตรวจทำการตรวจซ้ำได้ทุกข้อ ยกเว้นการสแกน credential ของแต่ละรอบ ด้วย `scripts/verify-line-p009-evidence.py <bundle> <mode> --recheck` ซึ่งผ่านที่ 20132e1b4 สำหรับหลักฐานรอบ 3 ทั้งสามชุด หลักฐานรอบ 1 และรอบ 2 (`line-p009-*` และ `line-p009-r2-*`) เก็บไว้เป็นประวัติและถูกแทนที่แล้ว ไม่มี cron เรียก sweep จึงไม่ใช่การเปิดใช้งาน

**งานที่ยังเปิดของ P0-9:**

- การรีวิวข้ามค่ายของรอบ 3 (Codex/Sol ใช้ได้อีกครั้งหลัง 7 ตุลาคม 2026)
- มติของเจ้าของ: ระยะหมดอายุ 10 นาที; ระยะเวลาเก็บ payload ของแถว dead-letter ซึ่งมีข้อความแชท; จะเพิ่ม sweep ที่เรียกได้เฉพาะ service เข้า B12 matrix ที่เจ้าของอนุมัติหรือไม่ (`docs/governance/line-b12-permission-matrix.th.md` ครอบคลุม 20 identity เดิม)
- ข้อจำกัดที่รู้แล้ว: อายุนับจากเวลาที่เข้าคิว ไม่ใช่เวลาของ event ใน LINE; ภายในช่วง 10 นาที event ที่ retry อาจมาถึงหลัง event ที่ใหม่กว่าของกลุ่มเดียวกัน (เช่น `memberJoined` ที่ retry หลัง `memberLeft`); `query_canceled` (statement timeout) ยังทำให้ sweep ทั้งรอบล้ม; การส่งครั้งแรกพร้อมกันสองครั้งของ event เดียวที่ล้มยืนยันด้วยการอ่านโค้ด ยังไม่มีเทสต์
- B13 (ด้านล่าง) อยู่นอก P0-9 เพราะต้องแก้ handler ใน `0107`
- CI: trigger ของ push ไม่ครอบคลุม `claude/**` แต่ pull request (เช่น PR ที่ซ้อนบน `codex/repair-intelligence-phase0-trust`) รันทั้งสอง workflow
- การรวม branch: `origin/main` (110890a3f) มี migration ถึง `0224` แล้ว รวมถึงไฟล์ `0200_*` อีกสองไฟล์และ `0208_outbound_dead_letter.sql` ของตัวเอง §8 ข้อ 7 จึงต้องตัดสินเลข migration ของ branch นี้ด้วย

**ทำไม Phase A ยังไม่ปิด:**

- **P0-9 (B8) สร้างแล้วแต่ยังไม่ผ่านการตรวจรับ** — 0200 บน branch ในเครื่อง `claude/line-p009-ingest-retry` (รอบ 3, 1902a8eea) รอการรีวิวข้ามค่าย และอาจทับซ้อนกับ `0175` unified ingress ที่ branch `codex/line-trust-wave1-main` วางแผนไว้ (ยังเป็นเลขจอง ไม่มีโค้ด) §8 ข้อ 7 จึงยังเป็นผู้ตัดสินว่า branch ใดเป็นเจ้าของ
- **Python suites ที่จำเป็นผ่านเฉพาะเมื่อมี 0198:** ถ้าไม่มี ผ่าน 64 ล้ม 8 ข้อสิทธิ์ B10 ถ้ามี ผ่าน 72/72 ไม่มี skip (ผลรันในเครื่อง)
- **B12 สร้างแล้วแต่ยังไม่ผ่านการตรวจรับ:** 0199 รอผู้ตรวจอิสระ และห้าม deploy จนกว่าจะได้ caller register ของ ops และการยืนยันจากเจ้าของ manufacturing เรื่อง `fn_prod_curated` (`docs/governance/line-b12-permission-matrix.th.md`)
- **CI ยังไม่ผ่าน:** ในเครื่องรันครบ 14 suite รวม LINE ทั้งห้าแล้ว (บน `claude/line-p009-ingest-retry` เป็น 15 suite และ LINE หก) แต่ยังเก็บ containment ที่ล้มเป็นไม่ผ่าน ไม่ได้นับว่าผ่าน การแก้ dependency ต้องผ่านมติรวม branch หรือขอบเขตแก้แยก งานนี้ไม่แก้ source ฝั่ง manufacturing

| บั๊ก | สถานะ ณ ฉบับ 1.18 |
|---|---|
| B1 หยิบคิวไม่มี lock | ✅ มี implementation บน branch — sender เรียก `rpc_claim_line_outbound_batch` (`index.ts:740-744`), `FOR UPDATE SKIP LOCKED`, reclaim ตาม timeout, fencing ด้วย `claim_token` — เทสต์ 2 client ผ่านบน stack ชั่วคราว (รอบ 2 และ 3: 10+10 แถว ซ้ำ 0) ยังไม่มีผล CI |
| B2 service role บันทึกผลไม่ได้ | ✅ มี implementation บน branch — ตรวจ service context จาก SQL role (`current_setting('role')`) ไม่ใช่ JWT; ด่านของผู้ใช้ไม่ถูกผ่อน |
| B3 แถวกลุ่มบันทึกผลไม่ได้ | ✅ มี implementation บน branch — LEFT JOIN + vertical จาก `line_groups` + fallback `monolith` ตาม 0097 |
| B4 ไม่มี transition guard | ✅ มี implementation บน branch — บันทึกได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้วคืน `recorded=false` ไม่มี audit ซ้ำ |
| B5 ล้มครั้งเดียวตายถาวร | ✅ มี implementation บน branch — แยก transient/permanent + exponential backoff (1 วินาที × 2^n สูงสุด 5 นาที) + เพดาน 5 ครั้ง |
| B6 ไม่มี cron | ⏸ ตั้งใจยังไม่ตั้ง — เป็นงาน Phase C รอคำตอบ §8 ข้อ 1, 2, 4 |
| B7 เทสต์ตาบอด | ✅ มีเทสต์ใหม่ที่ชน Postgres จริง (pgTAP) และเทสต์ที่ตรวจว่า sender ต่อสายเข้า RPC จริง |
| B8 `handler_error` นับว่าสำเร็จ | 🟡 แก้แล้วใน 0200 บน branch ในเครื่อง `claude/line-p009-ingest-retry` — รอบ 3 ที่ 1902a8eea มีหลักฐาน RED/GREEN/mutant; รอการรีวิวข้ามค่าย; ยังไม่ merge ไม่ push ไม่ deploy; อาจทับซ้อนกับ `0175` ที่ line-trust จองไว้ (มติข้อ 7) |
| B9 `line-login` ไม่ใช้ state/nonce | 🔴 ยังไม่แก้ — อยู่ใน P1; อาจทับซ้อนกับ `0176` ที่ line-trust จองไว้ |
| B10 role ฝั่ง client มีสิทธิ์เขียนและ TRUNCATE บนตาราง LINE | 🟡 แก้บน branch ใน 0198 แล้ว — ผ่านการตรวจโค้ดและหลักฐานโดยผู้ตรวจอิสระที่ 87930836a (ผู้ตรวจไม่ได้รันซ้ำ); เทสต์ fail-closed และการลงทะเบียน CI สร้างแล้ว รอผู้ตรวจ; ยังไม่ได้รัน CI; ยังไม่ deploy |
| B11 ความล้มเหลวที่ error detail เป็นช่องว่างล้วน | ✅ มี implementation ใน 0197 และหลักฐาน RED/GREEN ในเครื่อง; ผ่านการตรวจรับข้ามค่ายที่ 00651a6cd แล้ว |
| B12 client role เรียก EXECUTE ฟังก์ชัน SECURITY DEFINER ที่เขียนข้อมูลได้ | 🟡 แก้บน branch ใน 0199 แล้ว — RED-A/RED-B/GREEN ในเครื่องผ่าน; รอผู้ตรวจอิสระ; ห้าม deploy จนกว่าจะได้ caller register ของ ops และการยืนยันจาก manufacturing; ยังไม่ทราบว่า production เปิดหรือไม่ |
| B13 postback branch เปลี่ยน error ชั่วคราวเป็นผลแบบเพิกเฉย | 🔴 พบในการรีวิว P0-9 วันที่ 2 ต.ค. 2026 ยังไม่แก้ — ต้องแก้ handler ใน `0107` และรอมติเจ้าของ |

**หมายเหตุแก้ข้อมูลเดิม:** ฉบับก่อนอธิบายว่าไม่ได้รัน Python เพราะเครื่องไม่มี interpreter คำอธิบายนั้นขึ้นกับสภาพแวดล้อมและใช้เหมารวมทุกเครื่องหรือ sandbox ไม่ได้ หลักฐานรอบ 3 บันทึก Python 3.14.2 พร้อม pytest, hypothesis และ psycopg และผลรันจริง แต่ไม่ได้พิสูจน์ว่าสาเหตุที่ session ก่อนรัน Python ไม่ได้คืออะไร

**ยังไม่ได้พิสูจน์ (ห้ามอ้างเกิน):** CI · ผลบน stack ที่เหมือน CI ครบทุก service · การรัน Edge Function จริงหรือ LINE API จริง · พฤติกรรม `X-Line-Retry-Key` ฝั่ง LINE (ย้ายเป็น gate G-C1 ก่อนเปิดส่งจริง — §9.2) — ด่านใน DB อย่างเดียวไม่กัน worker 2 ตัวที่ lease หมดอายุยิงถึง LINE พร้อมกัน

**บั๊กเพิ่มเติมที่พบและแก้ระหว่าง Phase A:** `next_attempt_at` และ `sent_at` เคยรับค่า `timezone('utc', now())` (timestamp ไม่มี time zone) ใส่คอลัมน์ `timestamptz` ทำให้ในไทย backoff กลายเป็นศูนย์และเวลาส่งถูกบันทึกเร็วไป ~7 ชั่วโมง — แก้ใน 0195/0196 พร้อมเทสต์ใต้ `Asia/Bangkok`

---

**งานติดตามหลักฐาน (30 กันยายน 2026, ฐาน 3bdd6f3e):** เทสต์ตัวตรวจชุดใหม่ได้ 22 ผ่าน / 11 ล้มกับ implementation เดิม แล้วผ่าน 33/33 หลังแก้ เก็บรอบ local ใหม่ใน `docs/governance/evidence/line-p010-evidence-followup-2026-09-30/` ไม่แก้ bundle เก่า ระบุ `fullPgTapPass` ว่าครอบคลุม pgTAP เท่านั้น alias เดิม `fullPass/pass` มีความหมายเดียวกัน ส่วน `workflowPass=null` หมายถึงยังไม่ได้ประเมิน `provenanceComplete` ตรวจรูปแบบข้อมูลที่ส่งมา ไม่ใช่รับรองความแท้จากภายนอก Runner local ส่งข้อมูลที่มาครบ ส่วน Actions workflow ที่ไม่แก้ยังไม่ส่ง source digest มี Codex agent แยกรายงานผลรีวิวโค้ด/หลักฐานของ 3bdd6f3e และ patch ติดตาม ไม่ใช่รันฐานข้อมูลซ้ำหรือรับรองข้ามค่าย เอกสาร `docs/governance/line-p010-integration-b12-followup.th.md` บันทึกความเสี่ยง grant หากลง 0170 หลัง 0191 และการตัดสินใจผู้เรียก B12 งานนี้ไม่ได้แก้ containment หรือ B12

**Actions provenance และการรับหลักฐาน local:** ผู้ตรวจ Codex แยกแบบอ่านอย่างเดียวให้ accept-with-limits แก่ E1/E2/E3 ที่ `e7e2c52ce169b07978802c026255f08f71221d39` ตรวจ checksum หลักฐาน 93 รายการ source 252 แถว และผลที่บันทึก unit 33/33 กับ Python 72 ข้อจาก Git เป็นการรับ source และหลักฐาน local ไม่ใช่ผู้ตรวจรันฐานข้อมูลซ้ำหรือรับรองข้ามค่าย/production Patch ถัดมาเก็บ manifest แบบกำหนดขอบเขตและเรียงลำดับก่อนเริ่มฐานข้อมูล ส่ง digest ผ่าน GITHUB_ENV และแนบพร้อมจำนวน migration ตรวจการต่อ workflow ในเครื่อง ยังไม่มีผล Actions ย่อหน้าก่อนหน้าเป็นสถานะก่อนต่อข้อมูล ทะเบียน `docs/governance/line-rpc-caller-register.th.md` พร้อมให้ ops เติม ผู้เรียกภายนอกและเจ้าของ manufacturing/integration ยังไม่ยืนยัน Containment, B12 และ P0-9 ยังเปิดอยู่

### ขอบเขตการรับรองปัจจุบัน

ให้ตารางนี้เป็นสถานะปัจจุบันหลัก ย่อหน้าผลรันที่ระบุวันที่ด้านล่างเก็บสถานะตอนส่งมอบในอดีต การรับ E1/E2/E3 บันทึกใน REVIEW.txt ที่ commit f8fc5b632 ไม่ใช่ใบรับรองว่าผู้ตรวจรันฐานข้อมูลเอง

| ชั้นการตรวจ | สถานะปัจจุบัน | สิ่งที่ยังต้องทำ |
| --- | --- | --- |
| Source และหลักฐาน local ที่บันทึก | ACCEPT WITH LIMITS สำหรับ E1/E2/E3; ตรวจ source wiring ของ Actions แล้ว | รักษาขอบเขตคำรับรองของผู้ตรวจ |
| รันฐานข้อมูลซ้ำโดยผู้ตรวจ / ตรวจข้ามค่ายรอบติดตาม | ยังไม่ครบ | ผู้ตรวจแยกรันและส่งคำตัดสิน |
| พฤติกรรมในเครื่อง | ผลเดิม LINE 107/133/28 และ Python 72 ผ่าน แต่ containment ล้ม | แก้ dependency factory บน schema รวมโดยไม่ลด assertion |
| GitHub Actions | รันแล้วเมื่อ push ของ PR #133: DB Verify ที่ a97c3c847 ผ่าน suite LINE ทั้ง 5 ชุดแต่ผลรวมล้ม (containment) และ Trust Kernel Verify ที่ 48b72d4c7 ผ่าน claim linters และ `trust_kernel_containment` แต่ล้มที่ `repair_phase0_containment`, shadow E2E (ยังไม่ได้ตั้ง secret) และ final gate ข้อความที่คัดมาอยู่ใน `docs/governance/evidence/line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt` | workflow แบบ `pull_request` ของ main รอแก้ merge conflict ก่อน และ DB workflow ยังไม่มี Python suites |
| Phase A / production | EVIDENCE_INCOMPLETE / ยังไม่อนุมัติ | รีวิว P0-9 และ B12, รวมระบบและเกณฑ์รับงานครบ; production และส่งจริงมีด่านแยก |

ข้อมูลส่งต่อเจ้าของงานและ ops อยู่ใน [ทะเบียนผู้เรียก](governance/line-rpc-caller-register.th.md) การอนุมัติปัจจุบันให้ปรับสถานะและเตรียมส่งต่อ ส่วนสิทธิ์ B12 รายตัวและมติสถาปัตยกรรมยังรอข้อมูล ตารางนี้ไม่ได้อนุมัติ migration ใหม่หรือ push

## 1. ปัญหา (Problem Statement)

MONOLITH ใช้ LINE เป็นช่องทางหลักติดต่อลูกค้าและช่างหน้างาน (ลูกค้าไทยอยู่บน LINE) ขาเข้า (webhook, กลุ่ม, การ์ดตรวจรับ) ต่อสายครบและมี guard แน่น แต่ขาออกหาลูกค้ายังเปิดใช้จริงไม่ได้: ตัวส่ง (`line-outbound-sender`) มีบั๊กร้ายแรงที่ทำให้ถ้ารันจริงจะวนส่งข้อความซ้ำหาลูกค้าไม่รู้จบทุกแถว และไม่มีตารางเวลา (cron) เรียกมันในเรโปเลย ขณะที่ sweep รายคืนหลายตัวยิงข้อความลูกค้าเข้าคิวทุกวัน ถ้าไม่ปิดช่องว่างก่อนขยายการส่งหาลูกค้า ความเสี่ยงคือสแปมกลุ่มลูกค้า และความเชื่อมั่นแบรนด์เสียหายทันที

---

## 2. สถานะจริงของระบบ (Verified Status Matrix)

> B1–B9 เป็นบันทึกตรวจวันที่ 26 ก.ค. และ 1 ส.ค. 2026 ก่อน Phase A ส่วน B10–B12 เป็นผลพบจากหลักฐานและ catalog วันที่ 30 ก.ย. 2026 สถานะหลังแก้ดู §0

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
| B8 | **Handler ล้มถูกนับเป็น processed + เหตุการณ์หายถาวร** — `fn_line_handle_group_event` จับ exception แล้วคืน `'handler_error:...'` แต่ skip list ใน ingest ไม่รวม prefix นี้ → insert inbound row + audit + นับ `events_processed` และเพราะ inbound row เกิดแล้ว การ redeliver จาก LINE จะโดน dedupe → เหตุการณ์ที่ล้มหายถาวรแบบรายงานว่าสำเร็จ (พบครั้งแรกใน research 31 ก.ค. 2026 บน branch `codex/line-trust-wave1-main` แล้วยืนยันบน branch นี้ 1 ส.ค. — ทั้งสอง branch แตกมาจาก base เดียวกันจึงมีบั๊กเดียวกัน) | `0097:281` (คืนค่า), `0097:437-438` (skip list), `0097:454` (นับ processed), `0097:429-433` (dedupe) |
| B9 | **ตัว login ของพนักงานไม่ใช้ OAuth state / OIDC nonce** — `line-login` รับแค่ `{code, redirect_uri, bind_token?}` → เสี่ยง callback swap/replay (การผูกครั้งแรกบรรเทาได้ด้วย `bind_token` จากออฟฟิศ แต่ login รอบถัดไปไม่มีด่านนี้) | `supabase/functions/line-login/index.ts:2,9` |
| B10 | **role ฝั่ง client ยังมีสิทธิ์เขียนตรงบนตาราง LINE ทั้ง 8 ตาราง** — ผลล้มรอบ 3 แสดง INSERT/UPDATE/DELETE/TRUNCATE บน 7 ตาราง ส่วน `line_oa_audit_log` ยังมี INSERT/TRUNCATE เพราะ 0005 revoke UPDATE/DELETE แล้ว นี่คือช่องว่างของ grant ที่พบจาก image/chain ที่สร้างใหม่ ไม่ใช่หลักฐานการโจมตีหรือการพิสูจน์สาเหตุเดียว RLS ไม่ควบคุม TRUNCATE แต่หลักฐานนี้ยังไม่ได้สาธิตเส้นทางสั่ง TRUNCATE จากภายนอก ผลตรวจ TRUNCATE บน stack ที่แชร์เป็นรายงานไว้เท่านั้น (ไม่มี raw output ที่นี่) | `test_clients_hold_no_write_grants` ใน `07-pytest-output.txt` ของรอบ 3; `00000000000005_line_oa_audit_immutability.sql:67-80` |
| B11 | **ความล้มเหลวที่ error detail เป็นช่องว่างล้วนถูกบันทึกโดยไม่มีเหตุผลที่อ่านได้** — `rpc_record_line_send_result` ใช้ `btrim()` ซึ่งตัดแค่ช่องว่าง ไม่ตัด `\r`, `\n`, `\t`; Hypothesis พบว่า detail `'\r'` ถูกเก็บเป็น `'\r'` ขัดกับ AC ของ P0-6 ที่ความล้มเหลวต้องมีเหตุผล — มีมาตั้งแต่ 0041 และถูกยกมาใน 0193–0196 · ถูกซ่อนไว้เพราะ suite นี้เคย skip · พบ 30 ก.ย. 2026 | `0196_line_outbound_timezone_safe_sent_at.sql:162`, `00000000000041_line_oa_record_send_result.sql:180`, `test_failure_handling` ใน `07-pytest-output.txt` ของขั้นที่ 1 รอบ 3 |
| B12 | **client role เรียก EXECUTE ฟังก์ชัน SECURITY DEFINER ที่เขียนข้อมูลได้** — default ACL ของแพลตฟอร์มให้ EXECUTE บนฟังก์ชันใหม่แก่ `anon`, `authenticated` และ `service_role` ขณะที่ migration revoke EXECUTE จาก PUBLIC เท่านั้น บน chain ที่สร้างใหม่ `anon` เรียก EXECUTE ได้ 18 จาก 20 routine แบบ DEFINER ที่เขียนตาราง `line_oa_*` รวม `fn_prod_curated` ที่ใส่ข้อความ push เข้ากลุ่มลูกค้าโดยไม่ตรวจผู้เรียก routine แบบ DEFINER ทำงานในสิทธิ์ owner ดังนั้น 0198 ไม่ได้ปิดทางนี้ ยังไม่ทราบว่า production เปิดฟังก์ชันเหล่านี้ผ่าน PostgREST หรือไม่ | catalog `line-p010-catalog-2026-09-30/08-analysis.txt` ส่วน E; `0107_factory_group_milestones.sql:50-61`; ผลสำรวจ `docs/governance/line-p010-execute-survey.th.md` |
| B13 | **postback branch ซ่อนความล้มเหลวชั่วคราว** — `fn_line_handle_group_event` จับ error ทุกชนิดในบล็อก postback แล้วคืน `postback_malformed_ignored` ผลนี้ไม่อยู่ใน skip list ของ ingest จึงถูกเก็บและนับเป็น processed และการส่งซ้ำนับเป็น duplicate → การกดอนุมัติ/ปฏิเสธของลูกค้าอาจหายได้ เช่นเมื่อ lock timeout เกิดที่ `installation_approvals ... for update` (พบโดยการรีวิว P0-9 แบบอิสระ วันที่ 2 ต.ค. 2026 ยังไม่มีเทสต์ที่จำลองได้) | `0107:402-416` |

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
4. **ไม่แก้ manufacturing OS — คนละระบบ (ขอบเขตระบบ):** ไม่แก้โค้ด, migration หรือเอกสารของ manufacturing OS แม้จะอยู่ใน product repo หรือ branch เดียวกัน — การพบว่าสอง worktree เป็น repo เดียวกันไม่ได้ขยายขอบเขตงานนี้
5. **ไม่แตะ checkout หรือ worktree อื่น (ขอบเขต checkout):** รวม `codex/line-trust-wave1-main` — การรวม branch ทำได้หลังเจ้าของอนุมัติแผน §8 ข้อ 7 เท่านั้น
6. **ไม่ผ่อน RLS/สิทธิ์ระดับผู้ใช้** — การแก้ B2 คือให้ระบบรู้จัก service context ไม่ใช่ถอดด่านของมนุษย์
7. **ไม่ทำงานแจ้งเตือน deploy (ย้ายจาก Slack ไป LINE):** workflow แจ้งเตือน deploy อยู่ใน governance repo ไม่ใช่ product repo — ถ้าจะย้ายไป LINE ต้องเป็น PR แยกใน governance repo ที่ตัดสิน LINE channel ผู้รับ และวิธีจัดการ Slack เดิมก่อน และไม่นับเป็นเกณฑ์ปิด Phase A

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

### P0 — ต้องมีก่อนเปิดส่งลูกค้าจริง (แก้ B1–B8, B10, B11; B12 เป็นข้อเสนอ)

| Req | รายละเอียด | Acceptance criteria (เทสต์ชน Postgres จริง, RED ก่อน) | สถานะ (1.15) |
|---|---|---|---|
| P0-1 | **Claim คิวแบบ atomic:** เพิ่ม `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (ไม่เพิ่มค่า enum ใหม่ เพื่อเลี่ยงข้อจำกัด `ALTER TYPE` และผลกระทบต่อผู้อ่าน status) | สอง client claim พร้อมกัน → ไม่มีแถวซ้ำ; แถว claim ค้างเกิน timeout → ถูก re-claim ได้ | ✅ มี implementation (0193 + ต่อสาย sender) + หลักฐาน 2 client บน stack ชั่วคราว (ขั้นที่ 1 รอบ 2–3) — ผล CI รอขั้นที่ 5 |
| P0-2 | **Service context บันทึกผลได้:** grant + ให้ `rpc_record_line_send_result` รู้จัก service role เป็น system actor โดยไม่อ่อนด่าน role ของผู้ใช้ | เรียกด้วย service role → บันทึกได้; ผู้ใช้ไร้ role → ถูกปฏิเสธเหมือนเดิม | ✅ มี implementation + หลักฐาน pgTAP (0193); ตั้งแต่ 0199 ถอนเส้นทางบันทึกของผู้ใช้แล้ว การบันทึกเป็น service-only ตามมติเจ้าของ |
| P0-3 | **แถวกลุ่มบันทึกผลได้:** LEFT JOIN + ดึง vertical/audit จาก `line_groups` เมื่อ `conversation_id` เป็น NULL | แถว group → recordResult สำเร็จ + audit ครบ | ✅ มี implementation + หลักฐาน (0193 + fallback 0196) |
| P0-4 | **Transition guard:** บันทึกผลได้เฉพาะแถวที่ยัง `pending`; แถวจบแล้ว → `recorded=false` no-op | บันทึกซ้ำ / flip `sent`→`failed` → ถูกปฏิเสธ, audit ไม่ซ้ำ | ✅ มี implementation + หลักฐาน (0193 + fencing 0194) |
| P0-5 | **LINE-level dedupe:** ใส่ `X-Line-Retry-Key` = outbound id ในการ push | Phase A (ฝั่งเรา): ทุก push มี header = outbound id, reply ไม่มี; ตอบ 409 ที่มี `x-line-accepted-request-id` → ถือว่าส่งแล้ว ไม่ retry; 409 ที่ไม่มี header นี้ → permanent · Phase C (ฝั่ง LINE): gate G-C1 ใน §9.2 | ✅ ฝั่งเรามีหลักฐาน unit test (`senderRetryKey.unit.test.ts`, `senderFailureClassification.unit.test.ts:84`) · ฝั่ง LINE ย้ายเป็น gate G-C1 ไม่ใช่เกณฑ์ปิด Phase A |
| P0-6 | **Retry จำกัดครั้งสำหรับความล้มเหลวชั่วคราว** (แนว claim v3 ของ 0084) + dead-letter | LINE ตอบ 5xx → retry ตาม backoff; เกินเพดาน → `failed` พร้อมเหตุผล | ✅ มี retry และการจัดการเหตุผลแล้ว (0194–0197); pgTAP 107/107 ผ่าน; P0-11 ผ่านการตรวจรับข้ามค่ายที่ 00651a6cd แล้ว |
| P0-7 | **ตัดสิน autonomy gate (§8 ข้อ 3) แล้วทำตามมติ:** wire ให้ live หรือลบ + แก้ `tasks.md:157` | ไม่เหลือโค้ดที่อ้างว่าคุมแต่ไม่ได้คุมจริง | ⏸ รอมติข้อ 3 |
| P0-8 | **มติ cron + consent (§8 ข้อ 1, 2, 4) บันทึกเป็นลายลักษณ์อักษร** ก่อนเปิดส่งจริง | runbook ระบุ cron ที่ต้องมี; มติ consent ลงเอกสาร | ⏸ รอมติข้อ 1, 2, 4 |
| P0-9 | **Handler ที่ล้มต้องไม่นับเป็น processed (B8):** `handler_error` — เหตุการณ์ที่ handler ล้มต้องมี retry state ของเราเอง (แถว retry + sweep แบบ claim v3 ของ 0084) — ห้ามพึ่ง LINE redelivery เพราะ LINE ไม่รับประกัน — ไม่นับ processed และไม่ทำให้แถวที่ล้มโดน dedupe | จำลอง handler ล้ม → event เข้าคิว retry ภายในระบบและถูกประมวลผลซ้ำจนสำเร็จหรือครบเพดาน → dead-letter + audit; ไม่มี false success | 🟡 สร้างแล้วใน 0200 บน branch ในเครื่อง `claude/line-p009-ingest-retry` (รอบ 3 ที่ 1902a8eea มีหลักฐาน RED/GREEN/mutant) — รอการรีวิวข้ามค่าย; อาจทับซ้อนกับ `0175` ที่ line-trust จองไว้ มติข้อ 7 ยังเปิด |
| P0-10 | **ปิดสิทธิ์เขียนตรงของ role ฝั่ง client (B10):** revoke INSERT, UPDATE, DELETE และ TRUNCATE บน 8 ตาราง `line_oa_*` จาก `anon`, `authenticated` และ `service_role` (ขอบเขตที่เจ้าของอนุมัติ; PUBLIC ไม่มีสิทธิ์เหล่านี้) คง SELECT, EXECUTE และสิทธิ์อื่นทั้งหมดไว้ | ดูเกณฑ์ใน §9.1 ขั้นที่ 1b | 🟡 0198 ผ่านการตรวจโค้ดและหลักฐานโดยผู้ตรวจอิสระที่ 87930836a (ผู้ตรวจไม่ได้รันซ้ำ); งานติดตามรับ source/หลักฐานแบบจำกัดขอบเขตแล้ว ยังขาดการรันซ้ำและตรวจข้ามค่าย; ยังไม่ได้รัน CI |
| P0-11 | **ความล้มเหลวต้องมีเหตุผลที่ไม่ว่าง (B11):** แทนค่าที่มีแต่ whitespace ตามนิยาม Python ด้วย placeholder เดิม | property เดิมผ่าน; pgTAP เพิ่ม 37 กรณีครอบคลุม whitespace 29 ตัว ค่าผสม ข้อความที่มีความหมาย และการ scrub token | ✅ มี implementation ใน 0197; ผ่านการตรวจรับข้ามค่ายที่ 00651a6cd แล้ว |
| P0-12 | **จำกัด EXECUTE บนฟังก์ชัน SECURITY DEFINER ที่เขียนข้อมูล (B12)** ตาม matrix ราย identity ที่เจ้าของอนุมัติ | matrix และแผนใน `docs/governance/line-b12-permission-matrix.th.md`: ทุกช่อง DENY ถูกปฏิเสธที่ ACL ของฟังก์ชัน เส้นทางที่คงไว้ยังทำงานโดยตรวจจากข้อมูล และ migration ล้มแบบปิดไว้ก่อนเมื่อมีสิทธิ์คงเหลือ สิทธิ์ที่ต้องคงหายไป หรือ overload ที่ไม่ได้จัดประเภท | 🟡 สร้างใน 0199 พร้อมหลักฐาน RED-A/RED-B/GREEN; เทสต์เข้มขึ้นในรอบ 2 (RED-A/mutant/GREEN); suite LINE ผ่านบน GitHub Actions ที่ a97c3c847; รอผู้ตรวจอิสระ; ห้าม deploy จนกว่าจะได้คำตอบจาก ops และ manufacturing |

### P1 — ควรมีเร็ว ๆ นี้

- **B9 — ให้ login ของพนักงานใช้ state และ nonce:** แก้ `line-login` ให้ผูก state ที่ server ออก ใช้ครั้งเดียว หมดอายุสั้น — AC: replay `code` หรือ callback swap ถูกปฏิเสธ, login ปกติผ่าน (อยู่ P1 ไม่ใช่ P0 เพราะเป็นเส้น login พนักงาน ไม่ได้อยู่บนทางส่งลูกค้า; อาจทับซ้อนกับ `0176` identity step-up ที่ line-trust จองไว้)
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
| 7 | **แผนรวม branch:** branch นี้ (`codex/repair-intelligence-phase0-trust`) กับ `codex/line-trust-wave1-main` เป็น branch ของ product repo เดียวกัน — ต้องอนุมัติลำดับการรวม, เลือกโมเดล tenant ที่เป็น canonical, ตัดสินเจ้าของงานที่อาจทับซ้อน (P0-1–P0-6 เทียบ `0178`, P0-9 เทียบ `0175`, B9 เทียบ `0176`) และตัดสินว่าใครแก้ conflict ในไฟล์ฝั่ง manufacturing OS ตามผลตรวจด้านล่าง | สถาปัตย์/ธุรกิจ | P0-9, การ push/merge ของทั้งสอง branch, Phase C |

### 8.1 ผลตรวจการรวม branch (ข้อ 7)

> ตรวจเมื่อ 2026-09-30 04:52 UTC จาก git ref ในเครื่องเท่านั้น (ไม่ fetch, ไม่ checkout, ไม่เปลี่ยน ref, ไม่แตะ worktree อื่น) — raw output: `docs/governance/evidence/line-phase-a-2026-09-30/06-git-integration-check.txt` · ผลตรวจนี้เป็นข้อมูลประกอบการตัดสินใจเท่านั้น การพบว่าเป็น repo เดียวกัน **ไม่ได้** อนุญาตให้รวม branch หรือขยายขอบเขตไป manufacturing OS

| หัวข้อ | ผลตรวจ |
|---|---|
| Repo | worktree ของ branch นี้และของ line-trust ใช้ `.git` เดียวกันของ `determined-williams` และ origin เดียวกัน `github.com/indetailsgroup-hue/monolith-workspace` — ส่วน governance root `determined-williams (2)` ยังเป็นคนละ repo |
| SHA ที่ตรวจ | branch นี้ `5aa52315` · line-trust `69c87930` · merge-base `dd1119af` (18 ก.ค. 2026) |
| จำนวน commit หลัง merge-base | branch นี้ 65 (ที่ `5aa52315`) · line-trust 129 (ที่ `69c87930`) — ตัวเลขของ branch นี้เพิ่มทุกครั้งที่มี commit เอกสาร |
| เทียบ `origin/main` | ref ในเครื่อง `57b69513` (1 ส.ค. 2026 — ยังไม่ fetch): branch นี้นำหน้า 65 / ตามหลัง 118 · line-trust นำหน้า 47 / ตามหลัง 36 |
| เลข migration ชนกันตรง ๆ | ไม่มี — branch นี้มี `0180`–`0196`, line-trust มี `0171`–`0173` (และ `0163`, `0170` ที่มาจาก main) |
| Migration ที่ branch นี้ยังขาด | `0163_storage_hash_verdict_semantics.sql` และ `0170_factory_jobs_list_real_fields.sql` (อยู่บน main แล้ว) |
| Trust Kernel `0180`–`0188` | มีเฉพาะบน branch นี้ — ไม่อยู่บน main และไม่อยู่บน line-trust |
| ลองรวมในหน่วยความจำ (`git merge-tree`) | conflict 7 ไฟล์ — ไฟล์โครงสร้างร่วม 4 ไฟล์: `.github/workflows/db-verify.yml`, `.gitignore`, `package.json`, `package-lock.json` · ไฟล์ฝั่ง factory ของ manufacturing OS 3 ไฟล์: `server/src/api/routes/factory.ts`, `supabase/functions/factory-api/index.ts`, `supabase/functions/factory-api/index.test.ts` — ไม่มีไฟล์ runtime ของ LINE |
| Git ref ชื่อซ้ำ | มีจริง 2 ตัว: `refs/heads/codex/repair-intelligence-phase0-trust (1)` และ `refs/remotes/origin/main (1)` — git เตือนและข้าม; สาเหตุยังไม่ยืนยัน (สันนิษฐานว่าเกิดจากโปรแกรม sync ไฟล์); ยังไม่ได้ลบ ต้องให้เจ้าของ repo ลบก่อนรวม |
| Runtime ของ LINE | line-trust ยังไม่แก้ `line-outbound-sender`, `line-webhook`, `line-login` หรือ `_shared/line-oa` |

**พฤติกรรมที่ซ้ำกันหรืออาจทับซ้อน**

| เรื่อง | ประเภท | branch นี้ | line-trust | ความเสี่ยงเมื่อรวม |
|---|---|---|---|---|
| โมเดล tenant / organization / site / membership | ซ้ำแล้วจริง — มีโค้ดทั้งสองฝั่ง | `monolith_tenant`, `monolith_organization`, `monolith_site`, `monolith_membership*`, `verified_action_context` (0180, 0189) | `tenants`, `organizations`, `sites`, `tenant_memberships`, `access_grants`, `auth_subjects`, `project_parties` (0171) | แหล่งความจริงเรื่อง tenant และสิทธิ์สองชุด ชื่อตารางไม่ชนแต่ข้อมูลจะแยกกัน ต้องเลือกชุด canonical ก่อนรวม |
| สิทธิ์ของผู้เรียกฝั่ง service | ซ้ำแล้วจริง — มีโค้ดทั้งสองฝั่ง | ตรวจ SQL role `current_setting('role')` = `service_role` (0193) | ตาราง `service_principals` + `rpc_authorize_business_action` (0173) | กลไกให้สิทธิ์ service สองแบบ — ต้องตัดสินว่า sender ต้องผ่าน policy decision ของ 0173 หรือไม่ |
| คิวขาออก LINE | อาจทับซ้อนตามแผน — อีกฝั่งยังเป็นเลขจอง | claim, fencing, backoff บน `line_oa_outbound_messages` (0193–0196) | จอง `0178` = atomic outbox (ยังไม่มีโค้ด) | ถ้า line-trust สร้าง outbox ใหม่ภายหลังจะมีคิวสองแบบ; และ 0194 ลบ `rpc_record_line_send_result` แบบ 3 argument ที่ schema ของ line-trust ยังมีอยู่ |
| ingest ที่ล้มแล้วหาย (B8) | อาจทับซ้อนตามแผน — มีโค้ดฝั่งนี้เท่านั้น (0200 บน branch ในเครื่อง ยังไม่ merge) | P0-9 สร้างใน 0200 บน `claude/line-p009-ingest-retry`: `line_oa_inbound_retry` + `rpc_line_inbound_retry_sweep` | จอง `0175` = unified ingress พร้อม processing state, retry, dead letter | ถ้าสร้างทั้งสองฝั่งจะได้ retry ของ ingest สองชุด — ต้องมีเจ้าของเดียว |
| login พนักงาน (B9) | อาจทับซ้อนตามแผน — ยังไม่มีโค้ดทั้งสองฝั่ง | P1 ยังไม่ได้สร้าง | จอง `0176` = identity binding + step-up | ควรทำฝั่งเดียว |
| ตาราง LINE ที่ใช้ร่วมกัน | ต้องพิสูจน์ความเข้ากันได้ | sender อ่าน `line_groups.vertical_context` และ `line_oa_channels.channel_access_token_ref` | 0171/0172 เพิ่ม `tenant_id` (nullable, FK NOT VALID) ใน `line_oa_channels` และ `tenant_id`, `canonical_site_id` + constraint ใน `line_groups` | น่าจะเข้ากันได้เพราะเป็นการเพิ่มคอลัมน์ แต่ยังไม่ได้พิสูจน์ — ต้องรัน pgTAP ของ branch นี้บน schema ที่รวมแล้ว |
| ลำดับเลข migration | ความเสี่ยงด้านลำดับ | `0180`–`0196` | `0171`–`0173` และจอง `0174`–`0179` | ถ้า environment ใด apply `0180`+ ของ branch นี้ก่อน แล้ว `0174`–`0179` ของ line-trust ตามมาทีหลัง จะเป็นการ apply ย้อนลำดับ — ต้องออก amendment ของ line-trust หรือห้าม apply `0180`+ จนกว่าจะตกลงลำดับ |

---

## 9. ลำดับงาน (Phasing)

1. **Phase A — 🟡 ยังไม่ปิด:** `EVIDENCE_INCOMPLETE`; P0-9 สร้างใน 0200 บน branch ในเครื่องแล้วและรอการรีวิวข้ามค่าย P0-10 (0198) ผ่านรีวิวโค้ด/หลักฐานแล้ว งานติดตามรับ source/หลักฐานแบบจำกัดขอบเขต ยังขาดการรันซ้ำโดยผู้ตรวจและการตรวจข้ามค่าย P0-11 ผ่านการตรวจรับที่ 00651a6cd แล้ว B12 ยังเปิดอยู่ และยังไม่มีหลักฐาน CI (§9.1)
2. **Phase B (หลังมติข้อ 3):** P0-7 — wire หรือลบ autonomy gate + แก้ spec ให้ตรง
3. **Phase C (หลังมติข้อ 1, 2, 4 และหลังปิด Phase A):** push + deploy งาน Phase A, ผ่าน gate ใน §9.2, ตั้ง cron จริง, เพิ่ม consent gate และ human-approval ถ้ามีมติ → เปิดส่งลูกค้า
4. **Phase D (หลังมติข้อ 5, 6):** เก็บกวาด subsystem ที่ตาย + admin UI

**เงื่อนไขปิดทุก Phase:** แนบผลเทสต์จริง ไม่รับคำกล่าวอ้าง; ห้าม log token; ห้ามอ่อนกฎความปลอดภัยเพื่อให้ผ่าน; ทุก wave ต้องผ่านรีวิวข้ามค่ายก่อนรับ

### 9.1 ขั้นตอนถัดไปที่เสนอเพื่อปิด Phase A (รออนุมัติ)

> **ข้อห้ามทุกขั้น:** ไม่เปิด cron ใด ๆ, ไม่ deploy, ไม่ส่งข้อความหาลูกค้าจริง, ไม่ push โดยไม่ได้รับอนุมัติจากเจ้าของ และไม่แก้ manufacturing OS — ฟังก์ชัน retry/sweep ที่สร้างใหม่เรียกได้จากเทสต์หรือด้วยมือเท่านั้นจนถึง Phase C
>
> **รูปแบบหลักฐานที่รับ:** raw output ใน repo พร้อม SHA ของ commit ที่ทดสอบ, คำสั่งที่ใช้, เวลา UTC, exit code และ `SHA256SUMS` — ผลที่ "รายงานไว้" อย่างเดียวไม่นับเป็นหลักฐานปิดงาน
>
> **ต้องรันซ้ำได้โดยอิสระ (เพิ่มจากชุด 2026-09-30):** wrapper และคำสั่งทั้งหมดรันจาก repository root ด้วย path แบบ relative (เช่น `\ir` ใน psql) โดยไม่มี absolute path ของเครื่องที่รัน; บันทึก baseline ของฐานข้อมูลก่อนทดสอบ คือรายการ migration ที่ apply แล้ว (`supabase_migrations.schema_migrations`) และ fingerprint ของ schema (sha256 ของ `pg_dump --schema-only`) หรือสร้างฐานข้อมูลจากศูนย์ด้วย migration chain ของ SHA ที่ทดสอบ; บันทึกค่าตรวจก่อน/หลังรันโดยระบุชัดว่าตรวจอะไรบ้าง และอ้างผลเฉพาะในขอบเขตที่ตรวจ
>
> **ด่านตรวจความลับ:** ก่อน commit ชุดหลักฐานต้องตรวจไฟล์ผลลัพธ์หารหัสผ่าน, JWT และ DSN ที่มีรหัสผ่าน เมื่อพบข้อมูลดังกล่าวหรือตัวตรวจทำงานผิดพลาดต้องหยุด commit ไม่ใช่เพียงพิมพ์ผล ชุดหลักฐาน P0-10 เก็บสคริปต์ gate ไว้ในชุดแล้ว และ commit ที่สร้าง P0-10 มี wrapper ที่รัน gate ก่อน commit พร้อม transcript ของการรันนั้น การที่ commit เกิดขึ้นเฉพาะเมื่อ gate ผ่านจริงยังเป็นหลักฐานการรันที่รายงานไว้ แต่โค้ดของ wrapper และ tree ที่ gate ตรวจซึ่งบันทึกไว้ตรวจสอบเองได้ gate ของงานติดตามอนุญาตค่าที่ไม่ใช่ความลับเพียงค่าเดียว คือ DSN ค่าเริ่มต้นสำหรับเครื่อง local ตามเอกสารของ Supabase CLI ที่มีอยู่แล้วใน `db-verify.yml`

#### ขั้นที่ 1 — ปิดหลักฐานทดสอบที่ค้างของ P0-1 ถึง P0-6 (เริ่มได้ทันที ไม่ขึ้นกับมติ)

- **สถานะ (1.15):** pgTAP LINE ในเครื่อง 107/133/28/82/27 และ Python 72/72 ผ่าน claim race 10+10 ซ้ำ 0 (GREEN รอบ 2) รันครบทั้ง 14 suite แต่ pgTAP เต็มยังไม่ผ่านเพราะ containment รันไม่ครบ บน GitHub Actions suite LINE ทั้ง 5 ชุดผ่านที่ a97c3c847 (run 36748427203) ขั้นที่ 1 ยังไม่ปิด

- รัน `tests/line-oa-commerce/concurrency/claim-race.mjs` บน Postgres ชั่วคราวที่สร้างจากศูนย์ ไม่ใช่ stack ที่แชร์
- **เกณฑ์รับงาน:** สอง connection claim แถว pending ชุดเดียวกันพร้อมกัน → แถวที่ซ้ำกัน = 0 และแถวที่ถูก claim รวมกัน = จำนวนแถวทั้งหมด; cleanup ยืนยันว่าแถว outbound และ conversation ที่ harness สร้างเหลือ 0 ไม่ใช่การรับรองทั้งฐานข้อมูล
- **Python suites ที่จำเป็น:** ทุกไฟล์ใน `tests/line-oa-commerce/py/` ที่อ้างถึง `rpc_record_line_send_result`, `rpc_claim_line_outbound_batch` หรือ `line_oa_outbound_messages` — ตรวจ 30 ก.ย. 2026 ได้ 12 ไฟล์: `test_access_control_config_smoke.py`, `test_ai_action_audit_property.py`, `test_failure_handling_property.py`, `test_idempotent_processing_property.py`, `test_outbound_status_recording_property.py`, `test_reply_push_fallback_property.py`, `test_rls_read_scoping_property.py`, `test_schema_structure_smoke.py`, `test_secret_non_exposure_property.py`, `test_signature_verification_property.py`, `test_strict_consistency_property.py`, `test_unauthorized_mutation_denial_property.py`
- **เกณฑ์รับงาน:** ทั้ง 12 ไฟล์ต้องรันจริงและผ่าน — ถ้า suite ที่จำเป็นถูก skip ด้วยเหตุผลใดก็ตาม (รวมเหตุผลด้านสภาพแวดล้อม) ให้บันทึกเหตุผลได้ แต่ไม่นับว่าผ่าน สถานะหลักฐานคงเป็น `EVIDENCE_INCOMPLETE` และขั้นที่ 5 ปิดไม่ได้

#### ขั้นที่ 1b — ปิด B10 และ B11 (P0-10 ตรวจแล้ว งานติดตามรับ source/หลักฐานแบบจำกัดขอบเขตแล้ว ยังขาดการรันซ้ำและตรวจข้ามค่าย; P0-11 ผ่านการตรวจรับแล้ว)

**B10 / P0-10 — ผลวิเคราะห์ผลกระทบแบบอ่านอย่างเดียว (30 ก.ย. 2026, อ่าน source ใน repo เท่านั้น; เก็บไว้เป็นบันทึกก่อนอนุมัติ และให้ใช้หลักฐาน catalog ด้านล่างแทนในจุดที่ต่างกัน):**

- **ตารางและสิทธิ์ที่เสนอ:** INSERT, UPDATE, DELETE และ TRUNCATE บน `line_oa_channels`, `line_oa_conversations`, `line_oa_inbound_messages`, `line_oa_outbound_messages`, `line_oa_customer_identity`, `line_oa_message_templates`, `line_oa_orders` และ `line_oa_audit_log` คง SELECT เดิมไว้ ไม่ใช่การรับรอง read isolation เพิ่มเติม
- **role ฝั่ง client และ PUBLIC:** handoff รายงานว่าค้นไม่พบผู้เขียนตรงผ่าน PostgREST ใน `supabase/functions`, `src` หรือ `server` ให้ถือเป็นผลค้นเบื้องต้น ต้องตรวจ dynamic caller, grant ที่สืบทอด และสิทธิ์ที่มีผลจริงก่อนสรุปความเข้ากันได้ PUBLIC เป็นเป้าหมายของ grant ไม่ใช่ role สำหรับ login
- **Service role แยกพิจารณา:** sender อ่าน 3 ตารางในกลุ่ม `line_oa_*` คือ `line_oa_conversations`, `line_oa_channels` และ `line_oa_message_templates` ที่ `line-outbound-sender/index.ts:770-835` และยังอ่าน resource อื่น เช่น `line_groups` ซึ่งอยู่นอกข้อเสนอ 8 ตารางนี้ เสนอ revoke สิทธิ์เขียนโดยคง SELECT; ops ต้องระบุผู้เขียนจากเครื่องมือนอก repo ที่ใช้ service key ก่อนอนุมัติ การ bypass RLS ไม่ได้แทนที่การตรวจสิทธิ์ตารางตามปกติ
- **ผู้เขียนในฐานข้อมูล:** handoff รายงานผลสแกนประมาณ 33 function ที่เป็น `SECURITY DEFINER` ข้อนี้ยังไม่พิสูจน์ว่า revoke แล้วปลอดภัย ต้องตรวจนิยามที่มีผลจริง, owner, สิทธิ์ของ owner, EXECUTE grants และ call chain บน schema ที่สร้างใหม่ ผลสแกนยังไม่ใช่ inventory ที่ยืนยันว่าครบ
- **Fixtures:** pgTAP และ `test_rls_read_scoping_property.py` ที่ตรวจใช้ session owner (`postgres`) เขียน fixture และสลับ role รอบการเรียก RPC แล้ว reset จึงลดความเสี่ยงที่มองเห็น แต่ยังต้องรันเทสต์ที่จำเป็นทั้งหมดหลังเปลี่ยนสิทธิ์
- **การรวมงาน:** handoff รายงานว่า 0171–0173 ของ line-trust ไม่แก้ grant ของตารางเหล่านี้ ต้องตรวจ SHA ที่เลือกนำมารวมและเลข migration อีกครั้งก่อน implement 0197 ใช้สำหรับ P0-11 แล้ว ส่วนเลข `0198` เป็นข้อเสนอ ยังไม่ใช่เลขจองที่อนุมัติแล้ว
- **ด่าน audit เสริม ต้องมีมติ:** trigger ระดับ statement สามารถปฏิเสธ TRUNCATE ตามปกติขณะที่เปิดใช้งาน แต่รับรอง append-only ต่อ owner หรือ superuser ที่ปิดหรือลบ trigger ได้ไม่ได้ ต้องมีมาตรการปฏิบัติการแยก

**หลักฐาน catalog และมติ (30 ก.ย. 2026):** หลักฐาน catalog (da252d18a) ใช้แทนจำนวนผู้เขียนโดยประมาณด้านบน ได้ฟังก์ชัน DEFINER ที่ยืนยันแล้ว 20 identity โดย owner คือเจ้าของตาราง และแสดงว่า PUBLIC ไม่มีสิทธิ์เขียน ops รายงานผ่านเจ้าของว่าไม่มีเครื่องมือภายนอกเขียนตารางเหล่านี้ด้วย service key ซึ่งเป็นคำยืนยัน ไม่ใช่การตรวจพิสูจน์ เจ้าของอนุมัติขอบเขตด้านล่างโดยรวม `service_role`

**Migration (ผ่านรีวิวโค้ด/หลักฐานที่ 87930836a; งานติดตามรับด้าน source/หลักฐานแบบจำกัดขอบเขตแล้ว ยังขาดการรันซ้ำและการตรวจข้ามค่าย):** `supabase/migrations/0198_line_oa_revoke_client_write_grants.sql` revoke INSERT, UPDATE, DELETE และ TRUNCATE บน 8 ตารางจาก `anon`, `authenticated` และ `service_role` เมื่อ role นั้นมีอยู่ (รูปแบบ 0005) โดยไม่ใช้ CASCADE ไม่เปลี่ยน SELECT, EXECUTE, REFERENCES, TRIGGER, MAINTAIN, owner, membership และ default privileges และล้มแบบปิดไว้ก่อน: หากหลัง revoke ยังมี role ใดใน 3 role นี้มีสิทธิ์เขียนที่มีผลจริงระดับตารางหรือคอลัมน์ migration จะ raise และ rollback

**เกณฑ์รับงานและหลักฐาน P0-10:** suite ใหม่ `supabase/tests/line_oa_client_write_revoke.sql` (133 assertion) ตรวจสิทธิ์ที่มีผลจริง 3 role × 8 ตาราง × 4 สิทธิ์ รวมระดับคอลัมน์ และลองเขียนจริง 96 ครั้งด้วย SET LOCAL ROLE ซึ่งต้องล้มด้วย 42501 และข้อความ "permission denied for table" ตรงตัว ตรวจว่า USAGE ของ schema ยังอยู่ จึงไม่ใช่การปฏิเสธระดับ schema และตรวจว่า service role ยัง SELECT 3 ตารางของ sender ได้ รวมถึงเส้นทาง DEFINER ที่ตรวจจากข้อมูลจริง ได้แก่ webhook ingress, trigger welcome, `fn_prod_curated`, claim และ record ผล RED และ GREEN อยู่ใน §0 0198 ผ่านการตรวจโค้ดและหลักฐานโดยผู้ตรวจอิสระที่ 87930836a โดยผู้ตรวจไม่ได้รันฐานข้อมูลซ้ำ

**งานติดตาม P0-10 (สร้างแล้ว รับ source/หลักฐานแบบจำกัดขอบเขต):** suite fail-closed มี 28 assertions รัน 0198 จริงภายใน savepoint ตรวจสิทธิ์คงเหลือ 5 กรณี: anon สืบทอด INSERT/UPDATE, anon ได้ column UPDATE จาก grantor อื่น, authenticated สืบทอด DELETE, service_role สืบทอด TRUNCATE และ anon ได้ column INSERT จาก grantor อื่น ระบุ inheritance ชัดเจน ตรวจ error 42501 ของกรณีนั้นและการคืน direct grant หลัง harness rollback พร้อมเทียบ table/column ACL และ membership options/grantor ผลนี้พิสูจน์ขอบเขต transaction/savepoint นี้ ไม่ใช่ migration runner ทุกแบบ ตัวตรวจ TAP บังคับให้ plan และลำดับข้อครบ exit เป็นศูนย์ ไม่มี failure/skip/TODO และ upload stderr กับผลราย suite การตรวจหลัง 0198 บังคับว่ามีครบ 8 ตารางและ 3 role Gate ของ commit ใช้ hash จาก staged files และหยุดเมื่อสร้าง tree/hash ไม่สำเร็จ สิ่งที่ยังต้องมีคือ การรันฐานข้อมูลซ้ำโดยผู้ตรวจและการตรวจข้ามค่าย, CI เต็มหลังได้อนุมัติ push, การแก้ dependency containment แยก และ production catalog gate ก่อน deploy

**B12 / P0-12 (0199 สร้างแล้ว รอผู้ตรวจอิสระ):** matrix, มติของเจ้าของ และหลักฐานอยู่ใน §0 และ `docs/governance/line-b12-permission-matrix.th.md` ก่อน deploy ต้องได้ caller register ของ ops และการยืนยันจาก manufacturing ที่ยังขาด ต้องรัน CI หลังได้อนุมัติ push และต้องตรวจ production catalog แบบอ่านอย่างเดียว ฟังก์ชันที่สร้างใหม่หรือสร้างซ้ำยังได้ EXECUTE ตาม default ซึ่งเป็นการตัดสินนโยบายแยก

**การสร้าง B11 / P0-11:** เจ้าของอนุมัติให้ session นี้สร้าง 0197 ฟังก์ชันตัด whitespace 29 ตัวให้ตรงกับ `str.strip()` ของ Python 3.14.2 ด้วยชุด Unicode ชัดเจน รวม U+00A0 และ U+3000 คง signature, ACL, guard, fencing, retry, เวลา และการ scrub token เดิม Python assertion เดิมผ่าน โดยแก้เพียงคอมเมนต์เรื่อง btrim ที่ผิด 70 pgTAP เดิมและ 37 กรณีใหม่ผ่านครบ ผ่านการตรวจรับข้ามค่ายที่ 00651a6cd แล้ว และไม่ได้รับอนุมัติ deploy หรือ push

#### ขั้นที่ 2 — ตัดสินแผนรวม branch (§8 ข้อ 7)

- ลบ git ref ชื่อซ้ำสองตัว (เจ้าของ repo ทำ)
- เลือกโมเดล tenant canonical ระหว่าง `monolith_*` กับ `tenants/organizations/sites`
- ตัดสินเจ้าของงานที่อาจทับซ้อน: คิวขาออก (0193–0196 เทียบ 0178), ingest retry (P0-9 เทียบ 0175), login พนักงาน (B9 เทียบ 0176)
- ตัดสินลำดับเลข migration (amendment ของ line-trust หรือห้าม apply `0180`+ ชั่วคราว)
- ตัดสินว่าใครแก้ conflict 3 ไฟล์ฝั่ง factory ของ manufacturing OS — ไม่ใช่งานนี้ตามข้อห้าม §4 ข้อ 4
- **เกณฑ์รับงาน:** มติทั้งห้าข้อบันทึกเป็นลายลักษณ์อักษรทั้งไทยและอังกฤษ และอ้างถึงได้จากเอกสารนี้

#### ขั้นที่ 3 — สร้าง P0-9 ใน branch ที่มติขั้นที่ 2 กำหนด

- **เกณฑ์รับงาน:** RED ก่อน — จำลอง handler ล้มแล้วพิสูจน์ว่าปัจจุบันได้ inbound row + `events_processed` เพิ่ม (false success); GREEN — event ที่ล้มไม่ถูกนับ processed, ไม่ถูก dedupe, เข้าคิว retry ภายในระบบ, ประมวลผลซ้ำจนสำเร็จหรือครบเพดาน แล้วไป dead-letter พร้อม audit; ไม่พึ่ง LINE redelivery; ไม่มี cron ใหม่; ผ่านรีวิวข้ามค่าย
- **สถานะ (1.16):** สร้างก่อนขั้นที่ 2 ตามคำสั่งเจ้าของ บน branch ในเครื่อง `claude/line-p009-ingest-retry` (โค้ด 18a24483e หลักฐาน 0a355e29b) RED และ GREEN ของรอบ 1 บันทึกไว้ใน a473c718e (ถูกแทนที่แล้ว) ที่ยังเปิดคือการรีวิวข้ามค่าย และมติขั้นที่ 2 ว่า branch ใดเป็นเจ้าของ retry ของ ingest
- **สถานะ (1.17):** รอบ 2 ที่ fb9bfd967 ตอบการรีวิวอิสระค่ายเดียวกันแล้ว RED ล้ม 43 จาก 48, GREEN 48/48 และหลักฐาน mutant บันทึกไว้ใน 7f0eacc2c (ถูกแทนที่แล้ว) ที่ยังเปิดคือการรีวิวข้ามค่าย มติของเจ้าของที่ระบุใน §0 และมติขั้นที่ 2
- **สถานะ (1.18):** รอบ 3 ที่ 1902a8eea ปิดข้อติดตามของการรีวิวครั้งที่สอง RED ล้ม 48 จาก 53, GREEN 53/53 และจับ mutant ของ suite ได้ 14 ตัวกับของ race 2 ตัว ตามที่ระบุใน §0 ที่ยังเปิดคือการรีวิวข้ามค่าย มติของเจ้าของที่ระบุใน §0 และมติขั้นที่ 2

#### ขั้นที่ 4 — รวม branch ในเครื่องและตรวจบน schema ที่รวมแล้ว (หลังได้มติขั้นที่ 2 เท่านั้น)

- **เกณฑ์รับงาน:** conflict 4 ไฟล์โครงสร้างร่วมแก้แล้ว (suite list ใน `db-verify.yml` ต้องมีครบทั้งสองฝั่ง); conflict 3 ไฟล์ฝั่ง factory แก้โดยผู้ที่มติกำหนด ไม่ใช่งานนี้; migration chain ทั้งหมด apply จากศูนย์ได้ตามลำดับเลข; pgTAP ของทั้งสอง branch และ vitest ผ่านบน schema ที่รวมแล้ว; ผลลองรวมผ่านรีวิวข้ามค่ายก่อนขอ push

#### ขั้นที่ 5 — ปิด Phase A

- **สถานะ (1.15):** full loop ในเครื่องรันครบ 14 suite เก็บ failure ของ containment ตามจริง ขณะที่ LINE ผ่าน ไม่ใช้ผลรันที่กรอง suite แทน CI เต็ม GitHub Actions รันแล้วเมื่อ push หลังเจ้าของอนุมัติ (run 36748427202 และ 36748427203 ที่ a97c3c847 และ 36795389505 ที่ 48b72d4c7 ข้อความที่คัดมาอยู่ใน `docs/governance/evidence/line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt`) ผลรวมยังล้ม
- **เกณฑ์รับงาน:** ขั้นที่ 1, 1b และ 2–4 ผ่าน โดย suite ที่จำเป็นไม่มีทั้ง skip และ fail; หลังเจ้าของอนุมัติ push แล้ว CI (`db-verify.yml` ที่มี suite `line_outbound_claim_record`) รันเขียวจริง; สถานะหลักฐานจึงเปลี่ยนจาก `EVIDENCE_INCOMPLETE` ได้ — พฤติกรรมฝั่ง LINE ของ P0-5 ไม่ใช่เกณฑ์ปิด Phase A (อยู่ที่ G-C1 ใน §9.2); ไม่มี cron และไม่มีการส่งข้อความหาลูกค้า

### 9.2 Gate ก่อนเปิดส่งจริง (Phase C)

- **G-C1 — ยืนยัน retry key ฝั่ง LINE (P0-5):** ตรวจพฤติกรรม `X-Line-Retry-Key` บน LINE channel สำหรับทดสอบ ส่ง push ซ้ำสองครั้งด้วย retry key เดียวกันไปยังผู้รับทดสอบภายในที่ไม่ใช่ลูกค้า — **เกณฑ์รับงาน:** ผู้รับได้ข้อความครั้งเดียว; ครั้งที่สองได้ HTTP 409 พร้อม `x-line-accepted-request-id`; แถวคิวถูกบันทึกเป็น `sent` ครั้งเดียว; แนบ raw output ตามรูปแบบใน §9.1 — ต้องได้อนุมัติจากเจ้าของก่อนรัน และห้ามใช้ channel หรือผู้รับที่เป็นลูกค้าจริง
