# Prompt: Häfele Ch6 Locks & Security → Atomic Notes (ingest `blaetterkatalog (1).pdf`, Chapter 6)

> ใช้สั่ง AI สกัด **ระบบกุญแจ/ระบบล็อค (Locks & Security)** ของ Häfele จาก Chapter 6 ของ `blaetterkatalog (1).pdf`
> ออกมาเป็น **atomic notes ตรง schema ของ vault** — copy หยอดลง `20_ATOMIC_NOTES/` ได้ทันที
> รวม scope lock + governance ค่าเจาะ (Ø18 / backset) แบบ draft+needs_verify ในตัว

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน **Chapter 6 (Locks & Security / Locking Systems)** ของแคตตาล็อก Häfele Complete 2021
(`blaetterkatalog (1).pdf` — Chapter 6 อยู่ในช่วงระหว่าง Ch5 hinges (~p.211) กับ Ch7 kitchen (~p.855);
หน้า lock ที่พบเบื้องต้นอยู่ราว p.661–714) แล้วสร้าง **atomic notes** (โน้ตละ 1 ผลิตภัณฑ์/สเปก/ชิ้นเล็ก)

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- **แบรนด์เดียว = Häfele เท่านั้น** · ไฟล์เดียว `blaetterkatalog (1).pdf` · **เฉพาะ Chapter 6 (Locks & Security)**
- ทำเฉพาะ **ระบบกุญแจ/ล็อค**:
  - **Symo 3000 interchangeable system** — แยก **lock cases (เสื้อล็อค)** กับ **cylinder cores (ไส้กุญแจถอดเปลี่ยน)** เป็นคนละโน้ต
  - **Fixed cylinder furniture locks** — plate cylinder / pin tumbler (ไส้กุญแจตายตัว)
  - ประเภทเสื้อล็อค: deadbolt rim / latchbolt rim / roller shutter rim / inlaid / mortice / espagnolette
  - **ชิ้นประกอบ/เสริม:** strike plate, rosette/escutcheon, removal key, master key, cam/ตัวขับ, สกรูทุกไซส์ → แยกเป็นโน้ตของมันเอง
- **ห้ามทำหมวดอื่น** (hinge, drawer, connector, sliding, kitchen, wardrobe) — พบให้ข้าม
- ถ้าไม่พบข้อมูลของหมวดย่อยใด → ระบุ "ไม่ระบุในเอกสาร" ห้ามเติมจากความรู้ทั่วไป/เว็บ

## กฎเด็ดขาด (Governance — ห้ามฝ่าฝืน)
1. **ห้ามเดา/แต่งตัวเลข-รหัส** ไม่พบ → `null` + เพิ่มชื่อ field ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้หน้า **เป๊ะรายค่า** เช่น `"hafele-catalog-2021:p.662"` (ห้ามอ้างเป็นช่วงกว้างรวมๆ)
3. `truth_layer: draft` เสมอ · ค่าจากตาราง text layer = `review_status: review_ready` · ค่าจากภาพแบบแปลน = `review_status: unreviewed`
4. **ค่าเจาะทุกตัวเป็น drillMap-critical → ต้องใส่ลง `needs_verify` เสมอ** (จนกว่าวิศวกรยืนยัน) ได้แก่:
   - `cylinder_boring_dia_mm` (เช่น Ø18 / Ø22)
   - `backset_D_mm` (ระยะ backset ทุกค่า)
   - `boring_depth_mm`, `mounting_hole_pattern` ตำแหน่งรู/ระยะ pitch
5. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`)
6. **1 โน้ต = 1 ผลิตภัณฑ์/สเปก** · ชิ้นเล็ก (strike plate, rosette, key, สกรู) แยกโน้ต
7. `sku` = **flat list ของ string เท่านั้น** เช่น `["235.50.701","235.50.702"]` — ห้าม nested map (label→SKU ไว้ในตาราง body)
8. **ห้ามตัดสินเองว่าฝั่งไหนถูก** — ระบบ locks อาจไม่มี counterpart ใน MONOLITH (เป็น baseline ใหม่) → ปล่อย `conflicts: []` ได้ ถ้าเจอค่าที่น่าจะชน drillMap ค่อยใส่ `conflicts`

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ — ห้ามมีข้อความนอก fence)
````
FILE: 20_ATOMIC_NOTES/hafele-lock-<series>-<variant>.md
```md
---
note_type: product            # product | fitting_spec | system_moc
vendor: hafele
system: locking_system        # enum ใหม่สำหรับระบบกุญแจ (≠ latch)
truth_layer: draft
review_status: review_ready   # review_ready (จากตาราง) | unreviewed (จากภาพแบบแปลน)
sku: []                       # flat list ของ string
source_refs: []               # ["hafele-catalog-2021:p.xx"] — รายค่า
specs:                        # ใส่เฉพาะที่พบจริง ที่เหลือ null
  lock_family:                # Symo 3000 | Fixed cylinder | ...
  lock_type:                  # deadbolt_rim | latchbolt_rim | roller_shutter_rim | inlaid | mortice | espagnolette | cylinder_core
  core_system:                # interchangeable (ถอดเปลี่ยนได้) | fixed (ตายตัว)
  cylinder_boring_dia_mm:     # ⚠️ drillMap-critical (Ø18 / Ø22)
  backset_D_mm:               # ⚠️ drillMap-critical (ค่าเดียว หรือ {min,max} ถ้า adjustable)
  boring_depth_mm:            # ⚠️ drillMap-critical
  mounting_hole_pattern:      # ตำแหน่งรู/ระยะยึด — ถ้าเป็นภาพอ่านพิกัดไม่ได้ ใส่ null + note ใน body
  housing_dim_mm:             # ขนาดเสื้อล็อค (LxWxH) ถ้ามี
  rosette_dia_mm:             # Ø rosette/escutcheon ถ้ามี
  keying:                     # KD (keyed different) | KA (keyed alike) | MK (master key) — ถ้าระบุ
  handing:                    # left | right | reversible | n/a
  finishes: []
needs_verify: []              # ต้องมี cylinder_boring_dia_mm / backset_D_mm / boring_depth_mm เสมอถ้าสกัดได้
conflicts: []                 # [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
related_monolith: []          # ปกติว่าง (locks ยังไม่มี counterpart ใน MONOLITH)
tags: [hafele, locking_system]
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> draft/review_ready — สรุป 1 บรรทัดว่าโน้ตนี้คืออะไร

## สรุป
<!-- ผลิตภัณฑ์นี้คืออะไร · Symo ถอดเปลี่ยน หรือ fixed · ใช้กับงานแบบไหน -->

## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
<!-- Markdown table: variant → SKU → backset/keying/finish พร้อมหน้าอ้างอิงรายแถว -->

## ค่าเจาะ (drillMap-critical — pending engineer sign-off)
<!-- ระบุ Ø boring, backset D, depth พร้อมหน้า; ย้ำว่าอยู่ใน needs_verify รอวิศวกรยืนยัน
     ถ้าพิกัดรูมาจากภาพแบบแปลนที่อ่านตัวเลขไม่ได้ → หมายเหตุไว้ ห้ามเดา -->

## เชื่อมกับ MONOLITH
<!-- ปกติ: ยังไม่มี counterpart ใน MONOLITH (baseline ใหม่) — ระบุเช่นนี้ถ้าไม่พบ -->

## อ้างอิง
- Source: [[hafele-catalog-2021]] · MOC: [[hafele-locks-moc]]
```
````

## ความครบ & การตั้งชื่อ
- ครบ 100% — รวม strike plate, rosette, removal/master key, cam, สกรูทุกไซส์ (แต่ละชิ้น = โน้ตของมันเอง)
- filename = kebab-case: `hafele-lock-<series>-<variant>.md`
  เช่น `hafele-lock-symo-cases.md`, `hafele-lock-symo-cores.md`, `hafele-lock-fixed-cylinder.md`, `hafele-lock-strike-plate.md`
- เชื่อม `[[wikilink]]` ไป `[[hafele-catalog-2021]]` และ `[[hafele-locks-moc]]`

## Data Integrity
- ระบุหน้า **รายค่า** ทุกโน้ต · เอกสารไม่ครบ ทำเท่าที่มี ห้ามเติมจากแหล่งอื่น
- Ø18 / backset / depth ที่อ่านจากภาพแบบแปลน (ไม่ใช่ตัวเลขใน text) = drawing-derived → `review_status: unreviewed` + อยู่ใน `needs_verify`
- ห้ามสรุป "ค่าชัดเจน ยืนยันได้แล้ว" — ค่าเจาะทุกตัวยังต้องผ่านวิศวกรก่อนใช้ผลิต

**Instruction:** วิเคราะห์เฉพาะ **Chapter 6 Locks & Security ของ Häfele** จาก `blaetterkatalog (1).pdf`
สร้าง atomic notes ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก ออกเป็นบล็อก `FILE:` + ```md เรียงต่อกัน
ไม่มีข้อความอื่นนอก fence — ผมจะนำไปหยอดลง vault โดยตรง
