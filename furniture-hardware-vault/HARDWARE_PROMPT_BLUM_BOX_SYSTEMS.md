# Prompt: Blum Box Systems → Atomic Notes (ingest `BIun 198-411 3 〉 Box systems.pdf`)

> ใช้สั่ง AI สกัดข้อมูล **ระบบกล่องลิ้นชักของ Blum** จากไฟล์ `BIun 198-411 3 〉 Box systems.pdf` ไฟล์เดียว
> ⚠️ ไฟล์นี้เป็น **box systems เท่านั้น** — รางเลื่อน (MOVENTO/TANDEM) อยู่คนละไฟล์ `BIun 412-535 Runner systems.pdf` (ทำแยกรอบ)
> ออกมาเป็น **atomic notes ตรง schema ของ vault** — copy หยอดลง `20_ATOMIC_NOTES/` ได้ทันที
> รวม scope lock (box/runner เท่านั้น) + conflict detection กับ MONOLITH ในตัว

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน `BIun 198-411 3 〉 Box systems.pdf` (แคตตาล็อก Blum — Box systems) แล้วสร้าง **atomic notes**
(โน้ตละ 1 ผลิตภัณฑ์/สเปก/ชิ้นเล็ก) ในรูปแบบ Markdown + YAML frontmatter ที่หยอดลง vault ได้ทันที

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- **แบรนด์เดียว = Blum เท่านั้น** ทุกค่า/รหัสผูกกับไฟล์ `BIun 198-411 3 〉 Box systems.pdf` + เลขหน้าจริง
- ทำ **เฉพาะ Drawer Box Systems** เท่านั้น:
  - **Drawer box systems:** LEGRABOX, MERIVOBOX, TANDEMBOX (antaro/intivo), Nova ถ้ามี
  - **ชิ้นประกอบ/เสริม:** front fixing bracket, rear fixing bracket, tip-on / blumotion / servo-drive units, railing/reling, gallery, divider, สกรู/อะแดปเตอร์ทุกไซส์
- ⚠️ **ห้ามทำรางเลื่อน (MOVENTO/TANDEM runner)** ในรอบนี้ — อยู่คนละไฟล์ `BIun 412-535 Runner systems.pdf` (ถ้าพบ cross-reference ในไฟล์กล่อง ให้ระบุชื่อรางได้ แต่ห้ามสกัดสเปกรางจากไฟล์นี้)
- **ห้ามสรุป Hinges, mounting plate, AVENTOS/lift** ในรอบนี้เด็ดขาด — ถ้าพบให้ข้าม
- ถ้าไฟล์ไม่มีข้อมูลของหมวดใด → ระบุ "ไม่ระบุในเอกสาร" (ห้ามเอาค่าจากแหล่งอื่น/ความรู้ทั่วไปมาเติม)

## กฎเด็ดขาด (Governance — ห้ามฝ่าฝืน)
1. **ห้ามเดา/แต่งตัวเลข-รหัส** ไม่พบในเอกสาร → ใส่ `null` + เพิ่มชื่อ field ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้ไฟล์+หน้าจริง เช่น `"BIun 198-411 3 〉 Box systems.pdf:p.196"`
3. `truth_layer: draft` เสมอ · ค่าที่อ่านจากตารางแคตตาล็อกตรงๆ ใช้ `review_status: review_ready` ·
   ค่าที่อ่านจากภาพแบบแปลน (drawing-derived) ใช้ `review_status: unreviewed` + ใส่ field ลง `needs_verify`
4. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`, `_kg`, `_deg`)
5. **1 โน้ต = 1 ผลิตภัณฑ์/สเปก** · ห้ามยัดหลายรุ่นในโน้ตเดียว · ชิ้นเล็ก (bracket, สกรู, cap) แยกเป็นโน้ตของมันเอง
6. `sku` = **flat list ของ string เท่านั้น** เช่น `["770M5002S","770M6002S"]` — ห้ามทำเป็น nested map
   (ถ้าต้อง map label→SKU ให้ไปอยู่ในตารางใน body)
7. **ห้ามตัดสินเองว่าค่าฝั่งไหนถูก** เมื่อสงสัยว่าชนกับ MONOLITH → บันทึกลง `conflicts` ทั้งสองฝั่ง (ดูด้านล่าง)

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ — ห้ามมีข้อความนอก fence)
บรรทัดแรกบอก path ปลายทาง แล้วตามด้วย ```md ที่มี frontmatter+body ครบ ทำซ้ำหลายโน้ตเรียงต่อกัน:

````
FILE: 20_ATOMIC_NOTES/blum-<system>-<series>-<variant>.md
```md
---
note_type: product            # product | fitting_spec | system_moc
vendor: blum
system: drawer_box            # รอบนี้ใช้ drawer_box เท่านั้น (runner อยู่คนละไฟล์)
truth_layer: draft
review_status: review_ready   # review_ready (จากตาราง) | unreviewed (จากภาพแบบแปลน)
sku: []                       # flat list ของ string
source_refs: []               # ["BIun 198-411 3 〉 Box systems.pdf:p.xx"]
specs:                        # ใส่เฉพาะที่พบจริง ที่เหลือ null
  system_family:              # LEGRABOX | MERIVOBOX | TANDEMBOX
  height_class:               # เช่น N/M/K/C/F (LEGRABOX) หรือ null
  side_height_mm:             # ความสูงด้านข้างลิ้นชัก
  back_height_mm:             # ⚠️ drillMap-critical (ดู conflict list)
  nominal_length_NL_mm: []    # list ทุกความยาวที่มีจริง
  load_rating_kg:             # + ระบุ class ถ้ามี
  extension_type:             # full | over-travel | partial
  cabinet_width_min_mm:
  side_clearance_mm:          # ⚠️ drillMap-critical (ระยะเผื่อข้างต่อข้าง)
  drill_pattern:              # ระยะรูเจาะ runner / front fixing — ถ้าเป็นภาพอ่านไม่ได้ ใส่ null + note
  motion_tech: []             # [BLUMOTION, SERVO-DRIVE, TIP-ON BLUMOTION, TIP-ON]
  soft_close:
  push_to_open:
  finishes: []
needs_verify: []              # ชื่อ field ที่ยังไม่ verify โดยมนุษย์ (drillMap-critical ต้องอยู่ที่นี่เสมอจนกว่าจะ verified)
conflicts: []                 # [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
related_monolith: []
tags: [blum]
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> draft/review_ready — สรุป 1 บรรทัดว่าโน้ตนี้คืออะไร

## สรุป
<!-- ผลิตภัณฑ์นี้คืออะไร ใช้กับงานแบบไหน -->

## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
<!-- Markdown table: label → SKU → ค่าสเปก พร้อมหน้าอ้างอิง -->

## เชื่อมกับ MONOLITH
<!-- ค่านี้ map กับ drillMap/ค่าคงที่ใดบ้าง; ถ้ายังไม่ทราบฝั่งโค้ดให้ระบุว่า "รอ cross-check ตอน ingest" -->

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[hardware-home]]
```
````

## 🔁 Conflict Detection กับ MONOLITH (flag ทันที — อย่าตัดสินเอง)
ค่ากลุ่มนี้เป็น input ตรงของ drillMap/การประกอบจริง ถ้าสกัดได้ **ให้ใส่ลง `needs_verify` เสมอ** และถ้าเห็นว่า "อาจ" ต่างจากค่าที่เคยรู้ ให้ใส่ลง `conflicts`:
- **back_height_mm ของ LEGRABOX** (height class N/M/K/C/F) — ค่านี้เคยถูกใส่ผิดเป็นของ TANDEMBOX มาก่อน → ถ้าเอกสารให้ค่า ให้ระบุชัดว่าเป็นของ LEGRABOX height-class ไหน
- **Nominal Length (NL) ที่มีจริงของรุ่น 70 kg** — ถ้าเอกสารระบุว่ามีเฉพาะบางความยาว (เช่น 450–650) ให้ระบุชัด อย่าสมมุติว่ามีทุกความยาว
- **side_clearance_mm** (ระยะเผื่อข้างต่อข้าง) + **cabinet_width_min_mm**
- **drill_pattern / front-fixing position** ของ runner

รูปแบบ field `conflicts`:
```yaml
conflicts:
  - field: back_height_mm
    note_value: 39
    note_value_evidence: "BIun 198-411 3 〉 Box systems.pdf:p.xx 'LEGRABOX N: back height 39 mm'"
    monolith_value: null      # ไม่รู้ค่าฝั่งโค้ดให้ null — จะ cross-check ตอน ingest
    monolith_ref: null
    status: unresolved
```
ถ้าไม่แน่ใจว่าชนหรือไม่ → ใส่ลง `needs_verify` ไว้ก่อน ดีกว่าปล่อยผ่าน

## ความครบ & การตั้งชื่อ
- ครบ 100% — รวมชิ้นเล็ก (front/rear fixing bracket, tip-on/blumotion/servo unit, reling/gallery, divider, สกรูทุกไซส์) แต่ละชิ้นเป็นโน้ตของมันเอง
- filename = kebab-case: `blum-<system>-<series>-<variant>.md`
  เช่น `blum-drawer-box-legrabox-n.md`, `blum-runner-movento-760h.md`, `blum-drawer-box-tip-on-blumotion-unit.md`
- เชื่อม `[[wikilink]]` ไป source note และ MOC

**Instruction:** วิเคราะห์เฉพาะ **Drawer Box Systems ของ Blum** จาก `BIun 198-411 3 〉 Box systems.pdf`
สร้าง atomic notes ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก ออกเป็นบล็อก `FILE:` + ```md เรียงต่อกัน
ไม่มีข้อความอื่นนอก fence — ผมจะนำไปหยอดลง vault โดยตรง
