# คู่มือการใช้งาน — Furniture Hardware Vault

คู่มือ "วิธีดำเนินงาน" ของ vault (ต่างจาก `README.md` ที่เป็น overview และ `50_MOC/hardware-home.md` ที่เป็นจุดนำทางเนื้อหา)
อ่านอันนี้เมื่อต้องการ: เพิ่มข้อมูลฮาร์ดแวร์ใหม่ · รีวิว conflict · เข้าใจ schema/governance

---

## 1. ภาพรวม workflow (สกัด → ingest → verify)

```
แคตตาล็อก PDF
   │
   ├─ มี text layer?  ──ใช่──► Kiro สกัดเองด้วย Python (pypdf) ได้ตรง
   │                  ──ไม่──► ภาพล้วน → ใช้ AI vision + prompt
   ▼
AI/Kiro ออก atomic notes (รูปแบบ FILE:+```md```)
   ▼
Kiro ingest: ลง 20_ATOMIC_NOTES/ + กันซ้ำ + cross-check กับ MONOLITH
   ▼
เจอค่าต่างจาก MONOLITH? ──► บันทึกใน conflicts[] + CONFLICT-REGISTER (status: unresolved)
   ▼
วิศวกรรีวิว (ENGINEER-REVIEW-WORKSHEET) → ตัดสิน → แก้โค้ด (ถ้า FIX) + รันเทสต์
   ▼
อัปเดต status: resolved · ตั้ง truth_layer: verified เมื่อมนุษย์ยืนยัน
```

## 2. จะเพิ่มข้อมูลฮาร์ดแวร์ชุดใหม่ ทำยังไง
1. **เลือก prompt ให้ตรงงาน** (อยู่ที่ root ของ vault):
   - `HARDWARE_PROMPT_ATOMIC_NOTES.md` — ตัวหลัก ออกเป็น atomic note ตรง schema (ใช้ได้ทุกหมวด)
   - `HARDWARE_PROMPT_BOX_RUNNER.md` — ล็อก scope เฉพาะลิ้นชัก/ราง (กันวกไปทำบานพับ)
   - `HARDWARE_PROMPT_BLUM_BOX_VISION.md` — สำหรับ PDF ภาพล้วน (Blum) อ่านด้วย vision
2. **เช็คว่า PDF เป็น text หรือภาพ:** ถ้า Kiro สกัด text ได้ → ทำเองได้; ถ้าภาพล้วน → ต้องใช้ AI vision
3. **แนบทีละหมวด/ช่วงหน้า** อย่ายัดทั้งเล่ม (AI อ่านพลาดง่าย)
4. **ส่งผลกลับมาให้ Kiro** → Kiro ingest + เช็ค governance + เติม register ถ้ามี conflict

## 3. กติกา governance (ห้ามฝ่าฝืน)
1. **`truth_layer: draft` เสมอ** จนกว่ามนุษย์จะ verify → ห้ามเอาค่า draft ไปใส่โค้ดผลิตจริง
2. **ทุกค่าเทคนิค/รหัส ต้องมี `source_refs`** ชี้ไฟล์+หน้า (เช่น `"blaetterkatalog (1).pdf:p.24"`)
3. **ห้ามเดา** — ไม่พบในเอกสารใส่ `null` + เพิ่มชื่อ field ลง `needs_verify`
4. **ห้ามปนแบรนด์/นิยามข้ามกัน** — เช่น cup depth Blum 13.5 ≠ Salice 8/11/15.5; backHeight LEGRABOX ≠ TANDEMBOX
5. **เจอค่าต่างจาก MONOLITH = flag เป็น conflict** อย่าตัดสินเองว่าฝั่งไหนถูก อย่าแก้โค้ดเอง
6. **part number ที่ "หาไม่เจอใน catalog" ≠ "ผิด"** — ใช้โทน "รอยืนยันกับ Häfele ทางการ"

## 4. Schema ของ atomic note (สรุป)
ดูเต็มใน `HARDWARE_PROMPT_ATOMIC_NOTES.md` · จุดที่พลาดบ่อย:
- `sku:` = **flat list ของ string** เช่น `["262.26.033","262.26.533"]` — **ห้าม nested map** (label→SKU ให้อยู่ในตาราง body)
- `system:` ∈ hinge|mounting_plate|runner|drawer_box|lift|connector|sleeve|screw|damper|latch|shelf_support|lighting|sliding_door
- `conflicts:` = `[{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]`
  - status: `unresolved` | `catalog_confirmed_pending_engineering` | `resolved`
- `needs_verify:` = list ของชื่อ field ที่ยังไม่ verify
- โน้ตทุกตัวลิงก์: Source `[[<source>]]` · MOC `[[<system-moc>]]` · Validation `[[CK-...]]`

## 5. การจัดการ Conflict (สำคัญสุดต่อ MONOLITH)
- ศูนย์รวม: [[CONFLICT-REGISTER]] (dashboard + ลำดับ P1–P7 + action)
- วิศวกรกรอกการตัดสินที่: [[ENGINEER-REVIEW-WORKSHEET]]
- **drillMap-critical** (ระยะเจาะ/ความลึก/ความกว้างตัด) = ความรุนแรงสูงสุด ต้องรีวิวก่อนผลิต
- หลังวิศวกรตัดสิน FIX → ทีม dev แก้ + `npm run test:gate` + อัปเดต status เป็น resolved

## 6. ข้อเท็จจริงหลักที่ยืนยันแล้ว (อ้างได้)
- **System 32 first-hole = 37mm** (backset จากขอบหน้า) — ยืนยันจากหลายแหล่ง
- **System 32:** pitch 32mm · รูยึด Ø5 · ถ้วยบานพับ Ø35 · damper Ø10
- **Häfele Metalla 510 cup depth:** standard 11mm · zero-protrusion/blind-corner **13.5mm** (verified) · thin door 8mm
- **ถ้วยบานพับ Ø35** ใช้ดอกเดียวกับ guide cup ของ Slido F-Line11 (tooling reuse)

## 7. โครงโฟลเดอร์ (ย่อ)
`00_INBOX` ดิบ · `10_SOURCES` 1 แคตตาล็อก/โน้ต · `20_ATOMIC_NOTES` 1 ผลิตภัณฑ์/โน้ต ·
`30_SYSTEMS` MOC ต่อระบบ · `40_SPECS` สเปกตัวเลขกลาง · `50_MOC` จุดนำทาง ·
`60_VALIDATION` checklist + conflict register · `90_TEMPLATES` templates

## 8. หมวดที่ ingest แล้ว / ที่เหลือ
- ✅ Hinge (Blum/Salice/Häfele Metalla 510) · Box (LEGRABOX/MERIVOBOX/TANDEMBOX) · Runner (MOVENTO/TANDEM)
- ✅ Connector/Dowel/Shelf (Häfele Ch4) · Lighting (Loox) · Sliding door (Slido Ch10)
- ⬜ ตัวเลือกถัดไป (drillMap relevance): Ch7 kitchen pullout (สูง) · Ch6 locks Ø18 (กลาง) · Ch8 wardrobe (กลาง)
