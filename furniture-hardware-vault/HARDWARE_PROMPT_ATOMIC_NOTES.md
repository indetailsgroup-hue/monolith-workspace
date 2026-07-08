# Prompt: สร้าง Atomic Notes พร้อมหยอดลง Obsidian Vault

> ให้ AI สกัดข้อมูลฮาร์ดแวร์จากแคตตาล็อก → ออกมาเป็น **atomic notes ตรง schema ของ vault**
> (1 ผลิตภัณฑ์/สเปก = 1 ไฟล์) ผม copy ลง vault ได้ทันทีโดยไม่ต้องจัดรูปแบบใหม่

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่านเอกสาร/แคตตาล็อกที่แนบ แล้วสร้าง **atomic notes** (โน้ตละ 1 แนวคิด/ผลิตภัณฑ์/สเปก)
ในรูปแบบไฟล์ Markdown + YAML frontmatter ที่หยอดลง vault ได้ทันที

## กฎเด็ดขาด (ห้ามฝ่าฝืน)
1. ห้ามเดา/แต่งตัวเลข-รหัส ไม่พบในเอกสาร → ใส่ `null` + เพิ่ม key ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้ไฟล์+หน้า (เช่น `"Blum-2024:p.76-77"`)
3. `truth_layer: draft` เสมอ · ถ้าค่ามาจากตารางแคตตาล็อกตรงๆ ใช้ `review_status: review_ready`,
   ถ้าเป็นการอนุมาน/ความรู้ทั่วไป ใช้ `unreviewed` + `derived: true`
4. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (เช่น `_mm`, `_kg`, `_deg`)
5. ห้ามปนข้ามแบรนด์ในโน้ตเดียว · 1 โน้ต = 1 แบรนด์
6. ความครบ 100% — รวมชิ้นเล็ก (sleeve, screw, cap, spacer, damper) แต่จัดเป็นโน้ตของมันเอง
7. **ทุกค่าที่ยังไม่ยืนยัน → ใส่ key ลง `needs_verify`** · ถ้าค่าใดอาจชนกับค่าใน MONOLITH (drillMap/hardware specs) → ใส่ลง `conflicts` พร้อมระบุค่า 2 ฝั่ง + หลักฐาน (ดู schema) **ห้ามตัดสินเองว่าฝั่งไหนถูก**

## รูปแบบผลลัพธ์ (สำคัญ — ทำตามเป๊ะ)
ออกมาเป็นบล็อกต่อโน้ต โดยบรรทัดแรกบอก path ปลายทาง แล้วตามด้วย code fence ```md ที่มีทั้ง frontmatter+body
ทำซ้ำได้หลายโน้ต ห้ามมีข้อความอื่นนอก fence:

````
FILE: 20_ATOMIC_NOTES/<vendor>-<series>-<variant>.md
```md
---
note_type: product           # product | fitting_spec | system_moc | source | validation_checklist
vendor:                      # blum | salice | hafele | accuride | grass | kesseboehmer | italiana_ferramenta
system:                      # hinge | mounting_plate | runner | drawer_box | lift | connector | sleeve | screw | damper | latch | shelf_support | lighting | sliding_door | kitchen_pullout | wardrobe_system | locking_system | leveller
truth_layer: draft
review_status: review_ready  # unreviewed | review_ready | verified
angle_deg:                   # ถ้าเกี่ยวกับบานพับ
sku: []                      # ⚠️ flat list ของ string เท่านั้น เช่น ["262.26.033","262.26.533"] — ห้ามทำเป็น nested map/label (label→SKU ให้อยู่ในตาราง body)
source_refs: []              # ["file:p.xx"]
specs:                       # ใส่เฉพาะที่พบ ที่เหลือ null
  cup_diameter_mm:
  cup_depth_mm:
  tab_TB_mm: {min: , max: }
  mounting_plate_spacing_MD_mm: []
  front_overlay_FA: []       # [{application, MD, TB, FA}]
  min_gap_F: []              # [{FD, TB, F}]
  load_rating_kg:
  adjustment_mm: {side: , height: , depth: }
needs_verify: []             # list ชื่อ field ที่ยังไม่ได้ verify โดยมนุษย์ (เช่น [cup_depth_mm])
conflicts: []                # ถ้าค่าชนกับ MONOLITH ใส่: [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
                             # status: unresolved | catalog_confirmed_pending_engineering | resolved
related_monolith: []         # path โค้ดที่ใช้ค่านี้ (เช่น src/core/manufacturing/drillMap/)
tags: []
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> สถานะ draft/review_ready — สรุปสั้น 1 บรรทัดว่าโน้ตนี้คืออะไร

## สรุป
<!-- ผลิตภัณฑ์/สเปกนี้คืออะไร ใช้กับงานแบบไหน -->

## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
<!-- Markdown table -->

## เชื่อมกับ MONOLITH
<!-- ค่านี้ map กับค่าคงที่/โมดูลใด; ถ้าเป็นค่าเจาะ ระบุว่าเข้ากับ drillMap อย่างไร -->

## อ้างอิง
- Source: [[<source-note>]] · MOC: [[<system-moc>]] · Validation: [[CK-...]]
```
````

## กติกาการตั้งชื่อ & ลิงก์
- filename = kebab-case: `vendor-series-variant.md` (เช่น `blum-hinge-110-standard.md`)
- โฟลเดอร์: ผลิตภัณฑ์→`20_ATOMIC_NOTES/` · สเปกตัวเลขกลาง→`40_SPECS/` · MOC→`30_SYSTEMS/`
- เชื่อมด้วย `[[wikilink]]` ไปยัง source note, system MOC, และโน้ตที่เกี่ยวข้อง
- ถ้ามี ≥2 แบรนด์ที่เอกสารระบุว่าใช้แทนกันได้ → ใส่ field `substitution_group` + โน้ตใน body

## เลือก note_type ให้ถูก
- **product** = 1 ผลิตภัณฑ์/รุ่น (บานพับ, ราง, เพลท, สกรู)
- **fitting_spec** = ตารางตัวเลขกลางที่ใช้ร่วมหลายผลิตภัณฑ์ (เช่น cup Ø35+System32, ตาราง TB→FA)
- **system_moc** = แผนที่นำทางของระบบ (Hinge / Runner / Drawer)

## Data Integrity
- ระบุไฟล์+หน้าทุกโน้ต · เอกสารไม่ครบ ทำเท่าที่มี ห้ามเติมจากแบรนด์อื่น
- ภาพแบบแปลนเจาะที่เป็นข้อความไม่ได้ → หมายเหตุไว้ใน body แทนการเดา
- ทุกฟิลด์ "ระยะเจาะ" = input ตรงของ drillMap → ต้อง verified (มนุษย์) ก่อนใช้ผลิตจริง

## การแจ้ง Conflict กับ MONOLITH (สำคัญ)
- ถ้าค่าที่สกัดได้ "อาจ" ต่างจากค่าที่ระบบ MONOLITH ใช้ (เช่น cup depth, drill depth, runner NL, side clearance) → **อย่าตัดสินว่าฝั่งไหนถูก** ให้บันทึกทั้งสองฝั่งใน `conflicts`:
  ```yaml
  conflicts:
    - field: cup_depth_mm
      note_value: 13.5
      note_value_evidence: "blaetterkatalog (1).pdf:p.191 'Drilling depth: Hinge cup 13.5 mm'"
      monolith_value: null         # ใส่ถ้ารู้ค่าฝั่งโค้ด ไม่รู้ใส่ null
      monolith_ref: null           # path/บรรทัดถ้ารู้
      status: unresolved
  ```
- ค่าที่เป็น drillMap-critical แต่ยังไม่ได้ตรวจกับมนุษย์ → ใส่ชื่อ field ลง `needs_verify` ด้วยเสมอ
- ถ้าไม่มี conflict/ยังไม่ทราบค่าฝั่งโค้ด → ปล่อย `conflicts: []` ได้ (ผมจะ cross-check กับ MONOLITH ตอน ingest เอง)

**Instruction:** จากเอกสารที่แนบ สร้าง atomic notes ตามรูปแบบข้างต้น ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก
ออกเป็นบล็อก FILE:+```md เรียงต่อกัน — ผมจะนำไปหยอดลง vault โดยตรง
