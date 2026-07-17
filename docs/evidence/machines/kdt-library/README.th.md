# KDT Machine Intelligence Library — 83 รายการ (documented level)

**รับเข้า:** 17 ก.ค. 2026 (มติ owner ก×3) · **ผู้จัดทำ:** external research AI (deep-research) ส่งมอบโดย owner
**Input hash ตอนรับเข้า:** ทั้งชุด 688 ไฟล์ = `bb45762b8b59` (dir-hash sorted) — ตรง byte กับต้นฉบับที่ owner ส่งมอบ
**ต้นทาง third-party PDFs:** pin ไว้ที่ `../kdt-primary-sources.th.md` (ไม่ commit ตัวไฟล์)
**Generator:** `tools/kdt-library-build/` (Python 6 ไฟล์ — rebuild ได้โดยไม่พึ่ง AI ภายนอก)

## สิ่งที่ชุดนี้เป็น / ไม่เป็น

- แค็ตตาล็อกสองภาษา (TH/EN) ของเครื่อง/ไลน์ KDT **83 รายการ**: โปรไฟล์เครื่อง + รายงานประเมิน
  ความเข้ากันได้ต่อรุ่น + [ทะเบียนช่องว่างหลักฐาน](evidence-gap-register.th.html) + [แค็ตตาล็อก](index.html)
- **ทุกค่า = "Verified in documents" เท่านั้น — ไม่เคยเป็น "Observed in operation"**
  ทุกรุ่นตั้งต้น `NOT_ASSESSED` + `manufacturing_release = PROHIBITED` (ท่าทีเดียวกับ ADR-070)
- ห้าม infer ค่าจากรุ่นพี่น้อง/คู่มือตระกูล · ไม่มี secret/path จริงในเอกสาร
- **ไม่ใช่การอนุมัติการผลิตใดๆ** — เส้นทางสู่การใช้จริงต่อเครื่อง = fleet-onboarding-kit
  (`../fleet-onboarding-kit.html` v1.1): `DOC_PROVISIONAL → ENGINEER_VERIFIED` + เช็กลิสต์วิศวกร 8 ข้อ

## ความครอบคลุม (จาก executive report)

| ระดับหลักฐาน (ต่อ 7 กลุ่มข้อมูล) | จำนวน |
|---|---|
| สูง (6–7) | 9 |
| ปานกลาง (3–5) | 61 |
| ต่ำ (0–2) | 13 |

## เครื่องนำร่อง Daph (2 ตัว)

| เครื่อง | ตระกูล | สถานะ |
|---|---|---|
| **KN-2409LP** (nesting) | Nesting Tech | `DOC_PROVISIONAL` — FO-5 conditional (ADR-070) |
| **KD-610R** (เจาะหกด้าน) | Six-sided drilling | `DOC_PROVISIONAL` — เพิ่มเข้า fleet register แล้ว (P0) |

## ⚠️ ความสัมพันธ์กับหลักฐาน FO-5 (สำคัญ)

โฟลเดอร์ `../kdt-kn-2409lp/` คือ **bytes ที่ลายเซ็น Factory Owner (17 ก.ค.) อ้างอิง — แช่แข็ง ห้ามแทนที่**
Library นี้มี profile KN-2409LP ฉบับ rebuild ใหม่กว่า (`models/kn-2409lp/`) — ใช้เป็นฉบับอ่าน/ทำงานต่อได้
แต่การ activate เครื่องจริงยังยึด bench verification ของวิศวกรเป็นหลักฐานชั้นสุดท้ายเสมอ (ADR-070)

## กติกาใช้งาน

1. เริ่มที่ [index.html](index.html) — ค้น/กรองตามตระกูล, ระดับหลักฐาน, Daph-critical
2. งานออฟฟิศ (CAD/CAM/nesting/simulation) ใช้ได้ทันทีทุกรุ่น (P0)
3. **ห้ามตัดงานจาก MONOLITH packet ทุกกรณี** จน S17 ปิด + real-cut gate ผ่าน (CT-DEC-002 §11.6)
4. เพิ่มเครื่องใหม่ → intake ตาม kit §6 → research → เข้า register → วิศวกร bench ก่อนใช้จริง
5. Integrity: ตรวจทั้งชุดด้วย `node scripts/verify-sha256-manifest.mjs docs/evidence/machines/kdt-fleet-evidence.sha256`
