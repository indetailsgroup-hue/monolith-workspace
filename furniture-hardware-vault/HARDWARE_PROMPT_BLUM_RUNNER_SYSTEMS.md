# Prompt: Blum Runner Systems → Atomic Notes (ingest `BIun 412-535 Runner systems.pdf`)

> ใช้สั่ง AI สกัดข้อมูล **ระบบรางเลื่อนของ Blum** จากไฟล์ `BIun 412-535 Runner systems.pdf` ไฟล์เดียว
> ⚠️ ไฟล์นี้เป็น **runner systems เท่านั้น** — กล่องลิ้นชัก (LEGRABOX/MERIVOBOX/TANDEMBOX) อยู่คนละไฟล์ `BIun 198-411 3 〉 Box systems.pdf` (ทำแยกรอบ)
> ออกมาเป็น **atomic notes ตรง schema ของ vault** — copy หยอดลง `20_ATOMIC_NOTES/` ได้ทันที

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน `BIun 412-535 Runner systems.pdf` (แคตตาล็อก Blum — Runner systems) แล้วสร้าง **atomic notes**
(โน้ตละ 1 ผลิตภัณฑ์/สเปก/ชิ้นเล็ก) ในรูปแบบ Markdown + YAML frontmatter ที่หยอดลง vault ได้ทันที

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- **แบรนด์เดียว = Blum เท่านั้น** ทุกค่า/รหัสผูกกับไฟล์ `BIun 412-535 Runner systems.pdf` + เลขหน้าจริง
- ทำ **เฉพาะ Runner/Slide Systems** เท่านั้น:
  - **Undermount runners:** MOVENTO, TANDEM (รวม BLUMOTION / TIP-ON / TIP-ON BLUMOTION / SERVO-DRIVE variants)
  - **รุ่นรับน้ำหนัก:** 30 kg / 40 kg / 50 kg / 60 kg / 70 kg (ถ้ามีในเล่ม)
  - **ชิ้นประกอบ/เสริม:** locking device (ตัวล็อกราง), front/rear fixing bracket, depth adjuster, tilt adjuster, synchronization rod, motion unit (BLUMOTION/TIP-ON), สกรู/อะแดปเตอร์ทุกไซส์
- **ห้ามสรุปกล่องลิ้นชัก (box), hinge, AVENTOS/lift** ในรอบนี้ — ถ้าพบให้ข้าม
- ถ้าไฟล์ไม่มีข้อมูลของหมวดใด → ระบุ "ไม่ระบุในเอกสาร" (ห้ามเอาค่าจากแหล่งอื่น/ความรู้ทั่วไปมาเติม)

## กฎเด็ดขาด (Governance — ห้ามฝ่าฝืน)
1. **ห้ามเดา/แต่งตัวเลข-รหัส** ไม่พบในเอกสาร → ใส่ `null` + เพิ่มชื่อ field ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้ไฟล์+หน้าจริง **รายค่า** เช่น `"BIun 412-535 Runner systems.pdf:p.420"`
3. `truth_layer: draft` เสมอ · ค่าจากตาราง text layer = `review_status: review_ready` · ค่าจากภาพแบบแปลน = `review_status: unreviewed` + ใส่ field ลง `needs_verify`
4. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`, `_kg`)
5. **1 โน้ต = 1 ผลิตภัณฑ์/สเปก** · ชิ้นเล็ก (bracket, locking device, สกรู) แยกเป็นโน้ตของมันเอง
6. `sku` = **flat list ของ string เท่านั้น** เช่น `["766H4500S","760H4500S"]` — ห้ามทำเป็น nested map (label→SKU ไว้ในตาราง body)
7. **ห้ามตัดสินเองว่าค่าฝั่งไหนถูก** เมื่อสงสัยว่าชนกับ MONOLITH → บันทึกลง `conflicts` ทั้งสองฝั่ง (ดูด้านล่าง)

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ — ห้ามมีข้อความนอก fence)
````
FILE: 20_ATOMIC_NOTES/blum-runner-<series>-<variant>.md
```md
---
note_type: product            # product | fitting_spec | system_moc
vendor: blum
system: runner                # รอบนี้ใช้ runner เท่านั้น
truth_layer: draft
review_status: review_ready   # review_ready (จากตาราง) | unreviewed (จากภาพแบบแปลน)
sku: []                       # flat list ของ string
source_refs: []               # ["BIun 412-535 Runner systems.pdf:p.xx"] — รายค่า
specs:                        # ใส่เฉพาะที่พบจริง ที่เหลือ null
  system_family:              # MOVENTO | TANDEM | ...
  mount_type:                 # undermount | side-mount
  load_rating_kg:             # 30 | 40 | 50 | 60 | 70
  extension_type:             # full | over-travel | partial
  nominal_length_NL_mm: []    # ⚠️ list ทุก NL ที่มีจริง (drillMap-critical — ดู conflict list)
  side_clearance_mm:          # ⚠️ drillMap-critical (ระยะเผื่อข้างต่อข้าง)
  cabinet_depth_min_mm:
  drill_pattern:              # ระยะรูเจาะยึด runner / pitch — ถ้าเป็นภาพอ่านไม่ได้ ใส่ null + note
  motion_tech: []             # [BLUMOTION, TIP-ON, TIP-ON BLUMOTION, SERVO-DRIVE]
  soft_close:
  push_to_open:
  finishes: []
needs_verify: []              # NL / side_clearance / drill_pattern ต้องอยู่ที่นี่เสมอถ้าสกัดได้
conflicts: []                 # [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
related_monolith: []
tags: [blum, runner]
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> draft/review_ready — สรุป 1 บรรทัดว่าโน้ตนี้คืออะไร

## สรุป
<!-- รางรุ่นนี้คืออะไร · undermount/side · รับกี่ kg · ใช้กับกล่องตระกูลไหน -->

## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
<!-- Markdown table: NL → SKU → load → motion พร้อมหน้าอ้างอิงรายแถว -->

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
<!-- ระบุ NL ที่มีจริง, side clearance, drill pattern/pitch พร้อมหน้า; ย้ำว่าอยู่ใน needs_verify -->

## เชื่อมกับ MONOLITH
<!-- ราง map กับค่าใดใน drillMap/Production; ถ้ายังไม่ทราบฝั่งโค้ดให้ระบุ "รอ cross-check ตอน ingest" -->

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
```
````

## 🔁 Conflict Detection กับ MONOLITH (flag ทันที — อย่าตัดสินเอง)
ค่ากลุ่มนี้เป็น input ตรงของ drillMap/การประกอบจริง ถ้าสกัดได้ **ให้ใส่ลง `needs_verify` เสมอ** และถ้าเห็นว่า "อาจ" ต่าง ให้ใส่ `conflicts`:
- **Nominal Length (NL) ที่มีจริงของแต่ละ load class** โดยเฉพาะ **รุ่น 70 kg** — เคยมีปัญหาที่ระบบสมมุติว่ามี NL ครบทุกช่วง (270–600) ทั้งที่จริงผลิตเฉพาะบางช่วง (เช่น 450–650) → ระบุชัดว่าเล่มนี้ลิสต์ NL ใดบ้างต่อ load class
- **side_clearance_mm** (ระยะเผื่อข้างต่อข้าง) — เกี่ยวกับการคำนวณความกว้างกล่อง (เคยมีปม double-deduction ใน Production.ts)
- **drill_pattern / runner fixing pitch** (ระยะรูเจาะยึดราง, ระยะจากขอบ)

รูปแบบ field `conflicts`:
```yaml
conflicts:
  - field: nominal_length_NL_mm
    note_value: [450, 500, 550, 600, 650]
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.xx '70 kg: NL 450–650'"
    monolith_value: null      # จะ cross-check ตอน ingest
    monolith_ref: null
    status: unresolved
```
ถ้าไม่แน่ใจว่าชนหรือไม่ → ใส่ลง `needs_verify` ไว้ก่อน ดีกว่าปล่อยผ่าน

## ความครบ & การตั้งชื่อ
- ครบ 100% — รวม locking device, front/rear bracket, depth/tilt adjuster, motion unit, สกรูทุกไซส์ (แต่ละชิ้น = โน้ตของมันเอง)
- filename = kebab-case: `blum-runner-<series>-<variant>.md`
  เช่น `blum-runner-movento-760h.md`, `blum-runner-tandem-560h.md`, `blum-runner-locking-device.md`
- เชื่อม `[[wikilink]]` ไป source note และ `[[blum-runner-systems-moc]]`

## Data Integrity
- ระบุไฟล์+หน้า **รายค่า** ทุกโน้ต · เอกสารไม่ครบ ทำเท่าที่มี ห้ามเติมจากแหล่งอื่น
- ค่าที่อ่านจากภาพแบบแปลน (NL/pitch ที่ไม่ใช่ตัวเลขใน text) = drawing-derived → `review_status: unreviewed` + อยู่ใน `needs_verify`
- **ห้ามสรุป "มี NL ครบทุกช่วง"** ถ้าเอกสารไม่ได้ลิสต์ — ระบุเฉพาะที่เห็นจริง

**Instruction:** วิเคราะห์เฉพาะ **Runner Systems ของ Blum** จาก `BIun 412-535 Runner systems.pdf`
สร้าง atomic notes ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก ออกเป็นบล็อก `FILE:` + ```md เรียงต่อกัน
ไม่มีข้อความอื่นนอก fence — ผมจะนำไปหยอดลง vault โดยตรง
