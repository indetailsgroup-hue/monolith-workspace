# Prompt: Italiana Ferramenta → Atomic Notes (ingest 5 product PDFs)

> ใช้สั่ง AI สกัด **อุปกรณ์ Italiana Ferramenta** (levellers, cams & dowels, cross dowels, insert nuts, shelf supports)
> จาก PDF 5 ไฟล์ใน `Furniture_Hardware_Specs/Documents/` ออกมาเป็น **atomic notes ตรง schema ของ vault**
> รวม scope lock + governance ค่าเจาะ CNC (draft + needs_verify) ในตัว

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน PDF ของ Italiana Ferramenta แล้วสร้าง **atomic notes** (โน้ตละ 1 ผลิตภัณฑ์/สเปก/ชิ้นเล็ก)
ในรูปแบบ Markdown + YAML frontmatter ที่หยอดลง `20_ATOMIC_NOTES/` ได้ทันที

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- **แบรนด์เดียว = Italiana Ferramenta เท่านั้น** ทุกค่า/รหัสผูกกับไฟล์ต้นทาง + เลขหน้าจริง
- ไฟล์ต้นทาง (5 ไฟล์ ใน `Furniture_Hardware_Specs/Documents/`):
  1. `Integrato_Tech.pdf` → **leveller** (ขาปรับระดับ Integrato Tech)
  2. `Cams_and_dowels.pdf` → **connector** (cam + dowel)
  3. `Cross_dowels.pdf` → **connector** (cross dowel / barrel)
  4. `Insert_Nuts.pdf` → **connector** (insert nut)
  5. `Entry_Level_Shelf_Supports.pdf` → **shelf_support**
- **1 โน้ตผูกกับ 1 ไฟล์/หมวดเท่านั้น** — ห้ามรวมข้ามไฟล์ · ถ้าไฟล์ใดไม่มีข้อมูลพอ → ระบุ "ไม่ระบุในเอกสาร"
- ห้ามดึงข้อมูลจากแบรนด์อื่น/เว็บ/ความรู้ทั่วไปมาเติม

## กฎเด็ดขาด (Governance — ห้ามฝ่าฝืน)
1. **ห้ามเดา/แต่งตัวเลข-รหัส** ไม่พบ → `null` + เพิ่มชื่อ field ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้ไฟล์+หน้า **เป๊ะรายค่า** เช่น `"Integrato_Tech.pdf:p.4"`
3. `truth_layer: draft` เสมอ · ค่าจากตาราง text layer = `review_status: review_ready` · ค่าจากภาพแบบแปลน = `review_status: unreviewed`
4. **ค่าเจาะ/CNC ทุกตัวเป็น drillMap-critical → ต้องใส่ลง `needs_verify` เสมอ + ติด tag `drillmap`** ได้แก่:
   - `boring_dia_mm` (เช่น Ø31 leveller, Ø15/Ø25 cam, Ø10/Ø14/Ø16 cross-dowel, Ø5 shelf pin, Ø ของ insert-nut)
   - `boring_depth_mm` (เช่น 12.4 / 13.4)
   - `backset_mm` / `axis_spacing_mm` / `edge_distance_mm`
   - `thread_size` ของ insert nut (M4/M6/M8) + รูเจาะที่คู่กัน
5. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`, `_kg`)
6. **1 โน้ต = 1 ผลิตภัณฑ์/สเปก** · ชิ้นเล็ก (cap, spacer, retainer, screw) แยกโน้ต
7. `sku` = **flat list ของ string เท่านั้น** — ห้าม nested map (label→SKU ไว้ในตาราง body)
8. **ห้ามตัดสินเองว่าฝั่งไหนถูก** — Italiana Ferramenta น่าจะยังไม่มี counterpart ใน MONOLITH (baseline ใหม่) → `conflicts: []` ได้
   ยกเว้นค่าที่ "อาจ" ชนกับ Häfele connector/cam ที่มีอยู่แล้ว → ใส่ `conflicts` พร้อมหลักฐาน 2 ฝั่ง

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ — ห้ามมีข้อความนอก fence)
````
FILE: 20_ATOMIC_NOTES/italiana-ferramenta-<system>-<variant>.md
```md
---
note_type: product            # product | fitting_spec | system_moc
vendor: italiana_ferramenta
system: leveller              # leveller | connector | shelf_support  (เลือกตามไฟล์ต้นทาง)
truth_layer: draft
review_status: review_ready   # review_ready (จากตาราง) | unreviewed (จากภาพแบบแปลน)
sku: []                       # flat list ของ string
source_refs: []               # ["Integrato_Tech.pdf:p.x"] — รายค่า
specs:                        # ใส่เฉพาะที่พบจริง ที่เหลือ null
  product_family:             # Integrato Tech | Cam&Dowel | Cross dowel | Insert nut | Minisecury | ...
  boring_dia_mm:              # ⚠️ drillMap-critical
  boring_depth_mm:            # ⚠️ drillMap-critical
  backset_mm:                 # ⚠️ drillMap-critical (ถ้ามี)
  axis_spacing_mm:            # ⚠️ ระยะแกน/ระยะรูคู่ (ถ้ามี)
  thread_size:                # M4 | M6 | M8 (insert nut/dowel) ถ้ามี
  length_mm:                  # ความยาว/ช่วง (เช่น 8–24)
  adjustment_mm:              # ระยะปรับ (leveller เช่น 12/20)
  load_rating_kg:             # การรับน้ำหนัก (เช่น 175 kg/pc)
  material:                   # zinc alloy | brass | polyamide | steel ...
  finishes: []
needs_verify: []              # ค่าเจาะ/CNC ทุกตัวที่สกัดได้ ต้องอยู่ที่นี่เสมอ
conflicts: []                 # [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
related_monolith: []          # ปกติว่าง (baseline ใหม่)
tags: [italiana_ferramenta, drillmap]
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> draft/review_ready — สรุป 1 บรรทัดว่าโน้ตนี้คืออะไร

## สรุป
<!-- ผลิตภัณฑ์นี้คืออะไร ใช้กับงานแบบไหน -->

## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
<!-- Markdown table: variant → SKU → ขนาด/วัสดุ/สีผิว พร้อมหน้าอ้างอิงรายแถว -->

## ค่าเจาะ/CNC (drillMap-critical — pending engineer sign-off)
<!-- ระบุ Ø boring, depth, backset, axis spacing พร้อมหน้า; ย้ำว่าอยู่ใน needs_verify รอวิศวกรยืนยัน
     ถ้าพิกัดมาจากภาพแบบแปลนที่อ่านตัวเลขไม่ได้ → หมายเหตุไว้ ห้ามเดา -->

## เชื่อมกับ MONOLITH
<!-- ปกติ: baseline ใหม่ ยังไม่มี counterpart; ถ้าค่าใกล้เคียง Häfele connector/cam ที่มีอยู่ → ระบุว่าอาจ cross-check -->

## อ้างอิง
- Source: [[italiana-ferramenta-specs]] · MOC: [[italiana-ferramenta-moc]]
- Validation: [[CK-italiana-ferramenta-specs]]
```
````

## ความครบ & การตั้งชื่อ
- ครบ 100% — รวม cap, spacer, retainer, สกรู/อะแดปเตอร์ทุกไซส์ (แต่ละชิ้น = โน้ตของมันเอง หรือรวมเป็นตารางย่อยถ้าเป็นชุดเดียวกัน)
- filename = kebab-case: `italiana-ferramenta-<system>-<variant>.md`
  เช่น `italiana-ferramenta-leveller-integrato.md`, `italiana-ferramenta-connector-cams-dowels.md`,
  `italiana-ferramenta-connector-cross-dowels.md`, `italiana-ferramenta-connector-insert-nuts.md`,
  `italiana-ferramenta-shelf-support-entry-level.md`
- เชื่อม `[[wikilink]]` ไป `[[italiana-ferramenta-specs]]` และ `[[italiana-ferramenta-moc]]`

## Data Integrity
- ระบุไฟล์+หน้า **รายค่า** ทุกโน้ต · เอกสารไม่ครบ ทำเท่าที่มี ห้ามเติมจากแหล่งอื่น
- ค่าเจาะที่อ่านจากภาพแบบแปลน (ไม่ใช่ตัวเลขใน text) = drawing-derived → `review_status: unreviewed` + อยู่ใน `needs_verify`
- **ห้ามสรุป "ค่าชัดเจน ยืนยันได้แล้ว"** — ค่าเจาะ CNC ทุกตัวต้องผ่านวิศวกรก่อนใช้ผลิต

**Instruction:** วิเคราะห์เฉพาะ **อุปกรณ์ Italiana Ferramenta** จาก PDF 5 ไฟล์ข้างต้น (ไฟล์ละหมวดตามที่ระบุ)
สร้าง atomic notes ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก ออกเป็นบล็อก `FILE:` + ```md เรียงต่อกัน
ไม่มีข้อความอื่นนอก fence — ผมจะนำไปหยอดลง vault โดยตรง
