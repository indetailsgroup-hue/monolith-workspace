# รีวิว PRD v5.1 — ฉบับสมบูรณ์ (Consolidated Review Record)

วันที่: 2026-07-11 · ฉบับ: **v3.2 — Consolidated Complete Edition** (รวมผลรีวิวและมติทุกรอบเป็นบันทึกเดียว + scrutiny pass + มติทิศทางธุรกิจ ADR-065)
ผู้รีวิว: **AI Implementation Reviewer (Claude) — advisory review, non-authoritative**
Accountable approvers: **Product Owner, Tech Lead, Security Owner, Factory Owner** (การรับ PRD เป็น canonical และการอนุญาต factory pilot เป็นการตัดสินใจของมนุษย์เท่านั้น)
เอกสารที่รีวิว: `docs/prd/monolith-complete-prd-v5.th.md` (v5.1, audit ณ commit `d7b1c879`)

---

## 1. คำตัดสินที่เสนอ (ให้มนุษย์อนุมัติ)

> **AI reviewer เสนอให้อนุมัติ PRD v5.1 เป็น Target-State Canonical โดยยังไม่อนุมัติว่า production-ready**
> **Day-30 commitment จำกัดอยู่ที่การปิด P0 ทั้งห้าและ controlled factory pilot หนึ่งงาน หนึ่ง machine profile**
> **FR ใหม่ทั้งหมดถูก freeze เว้นแต่จำเป็นโดยตรงต่อ pilot**

จุดที่ทำให้ PRD เชื่อถือได้ไม่ใช่วิสัยทัศน์ — แต่คือ **วินัยหลักฐาน**: Evidence Tier E0-E4, Claim Ledger, As-Built matrix ที่ชี้ blocker เป็น file:line, Promotion Rule และประโยคทองใน §3 (verbatim): *"ห้ามใช้ requirement ใน PRD นี้ไป claim ว่า module ใด production-ready จนกว่าจะมี code, test, deployment evidence และ operational proof รองรับ"* — ตรง claim guardrails ของระบบ (ADR-056 marketing claim guardrails; แนวเดียวกับ re-quote gate ใน ADR-052 และ human-in-loop ใน ADR-062)

**ADR-064** (รับ canonical) ให้สร้าง**หลังจาก** Product Owner, Tech Lead, Security Owner และ Factory Owner ลงชื่อรับ scope นี้ครบทั้งสี่ (S17 มี IAM, signature และ key custody — Security Owner ต้องลงนามด้วย) — ไม่สร้างเพียงเพราะ AI reviewer แนะนำ

## 2. ผลตรวจสอบข้อกล่าวหา (verify กับโค้ดจริง)

| Blocker | ผลตรวจ | หมายเหตุจากผู้ implement |
| --- | --- | --- |
| `AB-EXP-01` CNC export ยอม FROZEN | ✅ **จริง** — `AppShell.tsx: canExport = gate OK && state !== 'DRAFT'` | **ความพลาดของ AI reviewer เอง** — เคยใช้ "Export ที่ FROZEN สำเร็จ" เป็นหลักฐานเดโม่; เมนู CNC ใน GateToolbar เช็ค RELEASED ถูก แต่ปุ่มหลักไม่เช็ค = ประตูสองบานกติกาไม่ตรงกัน |
| `AB-AUTH-01` role จาก localStorage + server เชื่อ x-actor-role header | ✅ จริง | เคยจดเป็น latent — ยกเป็น P0 ถูกต้อง เพราะ packet store/verify ผูก actor จาก header ที่ client กำหนดเอง |
| `AB-PKT-01` jobId สุ่ม + ZIP ไม่ deterministic | ✅ จริง — `job-${Date.now()}-random` | ขัดหลัก "Manufacturing is Deterministic" |
| `AB-PKT-02` server verify ตื้น (hash รวมทั้ง zip) | ✅ จริง — 0161 ตรวจแค่ sha รวม | ยังไม่ตรวจ manifest per-file, signature, gate/revision/machine profile |
| `AB-KEY-01` production pubkey เป็น placeholder | ✅ จริง — `publicKeyBase64: ""` | อันตรายเงียบที่สุด — โครง signature มีแต่กุญแจว่าง |

**ข้อสรุป: P0 blocker entries ใน As-Built matrix ได้รับการ corroborate จากโค้ดจริงครบทั้งห้ารายการ** — รีวิวนี้ยังไม่ได้ re-audit FR ทั้ง 17 รายการ สถานะช่องอื่นจึงอ้างอิงตาม auditor เดิม

## 3. สิ่งที่เห็นด้วยอย่างยิ่ง

1. **ศูนย์ถ่วง = manufacturing truth + field execution** (§1) และ Non-Goals §6 — ตรงหลักเหล็ก human-in-loop ของ ADR-062/063
2. **FR-03 Spatial Evidence Compiler = ผู้เสนอหลักฐานให้คนยืนยัน** — superset ของ ADR-063 (ก้าว 0 = มือ; SpatialLM = ก้าวถัดไปเมื่อ ROI ถึง)
3. **Promotion Rule §34.5** — สิ่งเดียวกับวินัย "พิสูจน์สดก่อน claim" ที่ใช้มาตลอด
4. **Concept Sandbox แยกจาก truth chain ตั้งแต่กระดาษ** (FR-02)

## 4. ข้อแม้ / จุดที่ต้องตีความเคร่ง

1. **Scope trap**: 17 FR กว้างเกินสถานะธุรกิจ — FR-02/03/07/17 คือการลงทุนใหม่ใหญ่ ขณะ pilot ยังไม่เริ่ม → **FR freeze จนกว่า pilot รายแรกปิด** (ยกเว้นชิ้นที่ pilot ต้องใช้)
2. **หลักฐานจาก session/manual test มีสถานะเป็น `E0 candidate / REVERIFY` เท่านั้น** — FR-13/14/16 มีการทดสอบ E2E จริง (เช่น MCP Pending Invocation ผ่าน local เต็มวงจร + prod smoke, 10 ก.ค.) แต่จนกว่าจะมี artifact ผูก commit + environment + วันทดสอบใน CI จึงยังไม่ผ่าน gate ตาม Promotion Rule — งานที่ถูกคือแปลงเป็น CI evidence ไม่ใช่เถียงสถานะ
3. **AB-DB-01**: psql-based testing ครอบ RLS/negative cases มาตลอด 160+ migrations แบบ manual-scripted — ช่องว่างจริงคือ "ไม่มี CI DB artifact" ซึ่งต้องปิดตามข้อ 2

## 5. แผนปิด P0 — เรียงตาม dependency (ทั้งห้า = hard gate ก่อน pilot ห้ามเลื่อนตัวใด)

| ลำดับ | งาน | เหตุผลลำดับ |
| --- | --- | --- |
| 1 | **Server-owned identity** (ปิด AB-AUTH-01) | ทุกอย่างหลังจากนี้ต้องรู้ว่า "ใครทำ" อย่างปลอมไม่ได้ก่อน |
| 2 | **RELEASED-only invariant ทุกทางออก** (ปิด AB-EXP-01) | บังคับฝั่ง server/exporter ทุก entry point ไม่ใช่แก้ปุ่ม UI |
| 3 | **Canonical packet specification** | นิยาม identity ก่อน implement: `packetContentId` = hash ของ canonical content · `jobRunId` = ID ต่อการทำงานแต่ละครั้ง · signed identity รวม released revision + machine profile version + exporter version + schema version ("project+revision" ไม่พอ — ชนกันเมื่อ revision เดียวส่งหลายเครื่อง/หลาย exporter) |
| 4 | **Deterministic packet generation** (ปิด AB-PKT-01) | ควบคุม timestamp, ZIP metadata, file order, serialization ตาม spec ข้อ 3 |
| 5 | **Full verifier** (ปิด AB-PKT-02) | manifest per-file hash + signature + gate/revision/machine — พร้อม **tamper corpus** และพิสูจน์ fail-closed |
| 6 | **Key ceremony** (ปิด AB-KEY-01) | custody, rotation, revocation, ceremony evidence + negative tests — ตามมติ custody ใน §6 |

**ประมาณการที่สมจริง**: ~**2 สัปดาห์ implementation/integration + 2 สัปดาห์ verification, dry run และ evidence** — งานนี้ไม่ใช่แค่แก้โค้ด แต่รวม trust boundary changes, spoofing tests, tamper corpus และ ceremony

## 6. แผนปฏิบัติการสามสายขนาน + มติ owner (11 ก.ค. 2569)

| Track | ผู้ทำ | งาน |
| --- | --- | --- |
| **A** | บัญชี AI #1 | S17-1 Server-owned identity → S17-2 RELEASED invariant |
| **B** | บัญชี AI #2 | S17-3 Canonical packet spec → S17-4 Determinism → S17-5 Full verifier |
| **Human/Ops** | มนุษย์ (เริ่มวันแรก — ไม่รอถึง S17-6) | Key custody, machine profile confirmation, จอง factory slot, รายชื่อ approvers |

กติกา worktree (มติปรับ 11 ก.ค. หลัง scrutiny — owner ตอบ ก): **Track A/B แตก clean git worktree จาก head ล่าสุดของ origin/main ณ เวลาเปิด worktree** — มติเดิมชี้ `f9740559` ตายตัว ปรับได้เพราะ verify แล้วว่า delta หลังจากนั้นเป็น docs/tasks ล้วน; **เงื่อนไข: ก่อนแตกต้อง verify ซ้ำว่า delta จาก `f9740559` ยังไม่มีโค้ดปน ถ้ามีให้หยุดถาม owner** — ห้ามแตกจาก local `main` และห้ามใช้ worktree ที่ dirty ร่วมกัน

### มติ Key custody

- Private signing key อยู่ใน **managed KMS/HSM แบบ non-exportable**
- **Security Owner = Key Owner** · Tech Lead ดูแล integration แต่ไม่เห็น raw private key
- create / rotate / revoke ต้อง **Product Owner + Security Owner อนุมัติร่วม**
- Recovery ใช้ governance **2-of-3** ถ้ามีมนุษย์เพียงพอ; ช่วง pilot ที่มีสองคน ใช้ 2-of-2 ได้ โดย key ยังอยู่ใน KMS และมี recovery procedure แยก
- Factory Owner อนุมัติการใช้ packet ใน pilot แต่ไม่ถือกุญแจ
- อ้างอิง separation of duties / split knowledge: NIST SP 800-57 Part 1 Rev.5, FIPS 140-3

### มติ Machine profile + กำหนดการ pilot

- Profile: **`kdt_mvp_v1`** (default export route; footprint ที่วัดซ้ำได้ ณ scrutiny 11 ก.ค.: identifier `kdt_mvp_v1` = 7 ไฟล์ / 11 จุดในโค้ด src+server · คำว่า KDT ทุกบริบท = 82 ไฟล์ / 602 จุด ในจำนวนนี้เป็นไฟล์เทสต์ 26 ไฟล์ / 346 จุด — ตัวเลขที่เคยรายงาน "8 ไฟล์/~239 refs" วัดซ้ำไม่ได้ จึงถอนออก) — **เฉพาะเมื่อเครื่องจริงและ controller รองรับ KDT path; ห้ามเลือกเพียงเพราะ test เยอะ** (รอยืนยันจากโรงงาน)
- จองช่วง: **dry run/no-cut 29–31 ก.ค. 2569 · controlled cut 4–6 ส.ค. · recovery/re-run buffer 7–9 ส.ค.**
- **ข้อสังเกตกำหนดการ (จาก scrutiny)**: ประมาณการ 2+2 สัปดาห์นับจาก 11 ก.ค. จะจบ ~8 ส.ค. — ตารางนี้พอดีก็ต่อเมื่อ Track A/B ขนานกันจริงจน implementation จบ ~25 ก.ค., dry run 29–31 ก.ค. นับเป็นส่วนหนึ่งของช่วง verification และ controlled cut 4–6 ส.ค. อยู่ปลายช่วงพอดี (margin ≈ 0) — **ถ้า implementation หลุดจาก 25 ก.ค. ให้เลื่อน slot ไป buffer 7–9 ส.ค. หรือเลื่อนจองใหม่ทันที ห้ามบีบช่วง verification**

### มติทิศทางธุรกิจ (Grill Q1–Q5 — owner ตอบ ก ทั้งห้า, 11 ก.ค. 2569 → ADR-065)

- **Q1 นิยาม "ทดลองใช้จริง" รอบแรก** = Business/Field dogfood: เปิดบ้านจริง 1 หลังวิ่งเต็มสาย LINE→สัญญา→เงิน→ติดตั้ง→ตรวจรับ — **การผลิตใช้กระบวนการเดิมของโรงงาน**
- **Q2 เดินขนาน**: dogfood เริ่มทันที // S17 วิ่งสามสายตามแผน — S17 ปิดเมื่อไหร่ บ้าน dogfood ยกระดับเป็น controlled factory pilot
- **Q3 Designer = shadow mode**: ออก packet ตามปกติ **ติดป้าย NOT-FOR-PRODUCTION** โรงงานตัดจากใบสั่งเดิม เทียบ packet กับของจริง = evidence ป้อน S17 จากงานจริงทุกใบ
- **Q4 มือทำ**: Claude = dogfood ops + support + แปลง session evidence เป็น CI artifact (งาน REVERIFY) · บัญชี AI A/B = S17 Track A/B · owner = custody + approvers + ลูกค้า/โรงงาน
- **Q5 Gate "ตัดจริง"**: S17 ครบ 5 + ADR-064 ลงชื่อครบ 4 + dogfood ผ่านเต็มสาย ≥1 งาน + machine profile 1 ตัว calibrate กับโรงงาน
- **เส้นแดงเส้นเดียว**: ห้ามตัดชิ้นงานจริงจาก packet จนกว่า S17 ปิด — คนละโดเมนกับการใช้ระบบรับลูกค้า/คุมงาน/เก็บเงิน

## 7. นโยบายชั้นหลักฐานของบันทึกฉบับนี้

- เอกสารรีวิวนี้ = **Git-pinned E3 synthesis** (content-addressed/tamper-evident ผ่าน git + SHA-256 manifest — commit ไม่ signed จึงไม่เรียก immutable)
- โค้ด/เทสต์ที่รีวิวอ้าง = **E0**
- ตัว commit = E0 สำหรับพิสูจน์ว่า *"เนื้อหารีวิวนี้ถูกบันทึก"* — ไม่ใช่พิสูจน์ว่า *"ข้อสรุปทุกข้อถูกต้อง"*
- เอกสารที่ถูกรีวิว (PRD v5 ครบ 5 ไฟล์) และ roadmap v1 (5 ไฟล์) อยู่ใน version control เดียวกันที่ `docs/prd/` แล้ว; สำเนาใน parent folder = superseded
- **ข้อกำหนด manifest (จาก scrutiny)**: SHA-256 คิดจาก byte ของไฟล์แบบ **LF-normalized UTF-8** · hex **ตัวพิมพ์เล็ก** รูปแบบ GNU coreutils (`<hash><space><space><filename>`) · `docs/prd/**` ถูกบังคับ `text eol=lf` ผ่าน `.gitattributes` เพื่อให้ byte เหมือนกันทุก platform/checkout — ก่อนหน้านี้ manifest ของ PRD/roadmap ใช้ hex ตัวพิมพ์ใหญ่ (Get-FileHash) และไฟล์ HTML บางไฟล์ hash จาก byte CRLF ซึ่งทำให้ตัวตรวจมาตรฐานรายงาน FAIL ปลอมได้ — แก้เป็นมาตรฐานเดียวทั้งชุดแล้ว; ไฟล์ `.sha256` เองพิสูจน์ตัวเองไม่ได้ integrity ของมันพึ่ง git history

## 8. Baselines

| รายการ | Commit |
| --- | --- |
| Code audit baseline (PRD §34) | `d7b1c879` |
| Review v1 reference | `2ce27cbf` |
| S17 governance update | `8d42710a` |
| Review เข้า repo (v2.1) | `8329262e` |
| PRD/roadmap เข้า repo + มติ custody/machine (v2.2) | `c0d2b61a` |
| P0 closure commits | **none** ณ v3.0 — ข้อค้นพบยังไม่ล้าสมัย |

## 9. ประวัติฉบับ (Revision History)

| ฉบับ | สาระ |
| --- | --- |
| v1 | รีวิวแรก + verify P0 ทั้งห้ากับโค้ดจริง |
| v2 | ตาม owner meta-review รอบ 1: AI = advisory non-authoritative · estimate 2+2 สัปดาห์ · P0 เรียง dependency · packet identity สามชั้น · E0 candidate/REVERIFY · เพิ่มฉบับ EN |
| v2.1 | รอบ 2: นำเอกสารรีวิวเข้า version control + SHA-256 manifest · verdict = "เสนอให้อนุมัติ" · Security Owner ใน approvers · แยก baselines ชัด · จำกัดข้อสรุปเฉพาะ P0 ห้ารายการ |
| v2.2 | รอบ 3: evidence tier ถูกชั้น (E3 synthesis / tamper-evident) · PRD v5 + roadmap v1 เข้า repo |
| **v3.0** | **ฉบับสมบูรณ์ — รวมทุกรอบเป็นบันทึกเดียว + ผนวกมติ custody / machine profile / แผนสามสายขนาน / กำหนดการ pilot** |
| **v3.1** | **Scrutiny pass**: quote §3 เป็น verbatim · ถอนตัวเลข KDT ที่วัดซ้ำไม่ได้ (แทนด้วยค่าที่วัดได้ + วิธีวัด) · เพิ่มข้อสังเกต margin กำหนดการ · ระบุมาตรฐาน manifest (LF + lowercase hex) + `.gitattributes` · หมายเหตุ origin/main เลื่อนหลังมติ (delta docs-only) · EN แก้ "customer pilot" → "pilot" |
| **v3.2** | **มติทิศทางธุรกิจ (ADR-065)**: owner ตอบ ก ทั้งห้า — dogfood ขนาน S17 · Designer shadow mode NOT-FOR-PRODUCTION · แบ่งมือทำสามฝ่าย · gate ตัดจริง 4 เงื่อนไข · จุด branch A/B = head ล่าสุด origin/main (แทน f9740559 ตายตัว) |
