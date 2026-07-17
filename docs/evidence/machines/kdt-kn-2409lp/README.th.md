# Machine Evidence — KDT KN-2409LP (documented level)

**วันที่รับเข้า:** 17 ก.ค. 2026 · **ผู้ส่งมอบ:** owner (คุณเดฟ)
**ที่มา:** เอกสาร deep-research 2 ฉบับที่ owner ส่งมอบ — รับเข้าเป็น **owner-supplied documented evidence**
ตามคำสั่งตรงของ owner ("เอาตามนี้เลยครับ") โดยการรับเข้าไม่ยกระดับค่าที่ยังไม่ได้ตรวจหน้าเครื่องให้เป็น verified fact

| ไฟล์ | เนื้อหา | สถานะในตัวเอกสารเอง |
|---|---|---|
| `assessment.html` | Machine Capability Assessment + Delivery Contract baseline (`MCA-DAPH-KN2409LP-INITIAL@0.1`) | **`MANUFACTURING RELEASE: PROHIBITED` · `NOT_ASSESSED`** — ค่าเป็น published/typical ยังไม่มีค่าจากเครื่องจริง |
| `machine-profile.html` | Machine Profile owner-answered (`KDT-KN-2409LP-CTRL@0.3-draft`) | `machine_verification_pending` — ทุกช่องติดป้ายที่มา (ยืนยันแล้ว/ตามเอกสาร/ต้องเช็กเครื่อง/ยังไม่รู้) |

## มติ owner (17 ก.ค. 2026) — บริบท CT-DEC-002 FO-5

> "เอาตามนี้เลยครับ เราต้องใส่อีกหลายเครื่อง เป็นไปไม่ได้ที่จะถ่ายหน้าเครื่องทุกเครื่องในตอนนี้
> ต้องทำงานเราไปก่อน ไว้วิศวกรอยู่หน้าเครื่อง แล้วให้เซ็ตให้อีกรอบก่อนทำงานจริง"

แปลเป็นกติกา (บันทึกเป็น ADR-070):
1. **Machine onboarding = documented-profile first** — เครื่องเข้าระบบด้วย profile ระดับเอกสาร
   ที่ติดป้ายที่มาต่อค่า (pattern เอกสารชุดนี้) โดยไม่ block งาน implementation/สาย S17
2. **Bench verification โดยวิศวกรหน้าเครื่อง = บังคับก่อนทำงานจริง** — ตาม gate ในตัว assessment เอง
   (checklist D ข้อ 1–6 + Release Gate E: nameplate, versions, tool table, origin, import, transfer,
   known-good job, simulation, dry-run, first-article, human acceptance)
3. **ไม่มีทางลัดสู่การตัดจริง**: `manufacturing_release: PROHIBITED` คงอยู่จนผ่าน gate E ครบ และ
   CT-DEC-002 §11.6 บังคับ "machine profile calibrated" เป็นเงื่อนไข real-cut อยู่แล้วอีกชั้น —
   การรับ evidence ระดับเอกสารจึง**ไม่เปิดช่อง**ให้ shadow mode หลุดเป็นการตัดจริง

## ความสัมพันธ์กับ `kdt_mvp_v1` (CT-DEC-002 FO-5)

- สิ่งที่เอกสารระบุในระดับ documented: **KDT / NCstudio (Weihong) / native = G-code `.nc`**
  → **ทิศทาง KDT path ของ `kdt_mvp_v1` มีหลักฐานเอกสารรองรับ** แต่ยังไม่ใช่การยืนยันเครื่องจริง
- สิ่งที่ยังยืนยันไม่ได้: suffix "LP" บน nameplate, รุ่นการ์ด, เวอร์ชัน NCstudio/WoodSystem,
  tool table, origin จริง, delivery channel → ค่าเหล่านี้ผูกกับ bench session ของวิศวกร
- FO-5 ใน sign-off checklist จึงบันทึกเป็น **conditional** (documented-level ณ วันเซ็น +
  bench verification เป็น hard gate ก่อน real cut) — ไม่ติ๊กเป็น "ยืนยันจากโรงงานแล้ว"

## Multi-machine

Owner ระบุว่าจะมีเครื่องเพิ่มอีกหลายเครื่อง — โฟลเดอร์ `docs/evidence/machines/<machine-id>/`
คือ pattern ต่อเครื่อง: assessment + profile + README มติ + manifest — เครื่องถัดไปใช้โครงเดียวกัน
