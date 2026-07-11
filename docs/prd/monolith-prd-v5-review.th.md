# รีวิว PRD v5.1 (Evidence-Control Revision) — AI Implementation Review

วันที่รีวิว: 2026-07-11 (v2.2 — รอบ 3: evidence-tier ถูกชั้น + PRD/roadmap เข้า repo)
ผู้รีวิว: **AI Implementation Reviewer (Claude) — advisory review, non-authoritative**
Accountable approvers: **Product Owner, Tech Lead, Security Owner, Factory Owner** (การรับ PRD เป็น canonical และการอนุญาต factory pilot เป็นการตัดสินใจของมนุษย์เท่านั้น)
เอกสารที่รีวิว: `monolith-complete-prd-v5.th.md` (v5.1, audit ณ commit `d7b1c879`)

---

## 1. คำตัดสินที่เสนอ (ให้มนุษย์อนุมัติ)

> **AI reviewer เสนอให้อนุมัติ PRD v5.1 เป็น Target-State Canonical โดยยังไม่อนุมัติว่า production-ready**
> **Day-30 commitment จำกัดอยู่ที่การปิด P0 ทั้งห้าและ controlled factory pilot หนึ่งงาน หนึ่ง machine profile**
> **FR ใหม่ทั้งหมดถูก freeze เว้นแต่จำเป็นโดยตรงต่อ pilot**

จุดที่ทำให้ PRD เชื่อถือได้ไม่ใช่วิสัยทัศน์ — แต่คือ **วินัยหลักฐาน**: Evidence Tier E0-E4, Claim Ledger, As-Built matrix ที่ชี้ blocker เป็น file:line, Promotion Rule และประโยคทองใน §3: *"ห้ามใช้ requirement ใน PRD ไป claim ว่า production-ready จนกว่าจะมี evidence"* — ตรง claim guardrails ของระบบ (ADR-052/056/062)

ADR-064 (รับ canonical) ให้สร้าง**หลังจาก** Product Owner, Tech Lead, **Security Owner** และ Factory Owner ลงชื่อรับ scope นี้ (S17 มี IAM, signature และ key custody — Security Owner ต้องลงนามด้วย) — ไม่สร้างเพียงเพราะ AI reviewer แนะนำ

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
| 3 | **Canonical packet specification** | นิยาม identity ก่อน implement: `packetContentId` = hash ของ canonical content · `jobRunId` = ID ต่อการทำงานแต่ละครั้ง · signed identity รวม released revision + machine profile version + exporter version + schema version (แก้ข้อเสนอเดิม "project+revision" ที่ไม่พอ — ชนกันเมื่อ revision เดียวส่งหลายเครื่อง/หลาย exporter) |
| 4 | **Deterministic packet generation** (ปิด AB-PKT-01) | ควบคุม timestamp, ZIP metadata, file order, serialization ตาม spec ข้อ 3 |
| 5 | **Full verifier** (ปิด AB-PKT-02) | manifest per-file hash + signature + gate/revision/machine — พร้อม **tamper corpus** และพิสูจน์ fail-closed |
| 6 | **Key ceremony** (ปิด AB-KEY-01) | custody, rotation, revocation, ceremony evidence + negative tests — ต้องมีมติ owner เรื่อง custody |

**ประมาณการที่สมจริง** (แก้จาก v1 ที่ประเมินต่ำเกิน): ~**2 สัปดาห์ implementation/integration + 2 สัปดาห์ verification, dry run และ evidence** — งานนี้ไม่ใช่แค่แก้โค้ด แต่รวม trust boundary changes, spoofing tests, tamper corpus และ ceremony

## 6. งานเอกสารค้าง

- ✅ ฉบับ EN (`monolith-prd-v5-review.en.md` / `.en.html`) — สร้างแล้วตามกฎเอกสารโครงการ
- ✅ นำเอกสารทั้งสี่เข้า git repo + SHA-256 manifest (v2.1 — แก้จุด "commit กล่าวถึงแต่ไม่ตรึงเนื้อหา")

## 7. หมายเหตุความสด (แยก baseline ชัด)

| รายการ | Commit |
| --- | --- |
| Code audit baseline (PRD §34) | `d7b1c879` |
| Review v1 reference | `2ce27cbf` |
| S17 governance update | `8d42710a` |
| P0 closure commits | **none** ณ v2.1 — ข้อค้นพบยังไม่ล้าสมัย |

เอกสารรีวิวชุดนี้ (4 ไฟล์ + SHA-256 manifest) ถูกนำเข้า version control ที่ `determined-williams/docs/prd/` ตั้งแต่ v2.1 — **ชั้นหลักฐานที่ถูกต้อง: review = Git-pinned E3 synthesis (content-addressed/tamper-evident — commit ยังไม่ signed จึงไม่เรียก immutable); โค้ด/เทสต์ที่ review ชี้ = E0; ตัว commit = E0 สำหรับพิสูจน์ว่า "เนื้อหารีวิวนี้ถูกบันทึก" ไม่ใช่พิสูจน์ว่า "ข้อสรุปทุกข้อถูกต้อง"**; สำเนาเดิมใน parent folder ถือเป็น superseded; PRD v5 + roadmap v1 ที่ถูกรีวิวถูกนำเข้า repo เดียวกันแล้ว (v2.2)
