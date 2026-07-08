# Prompt: Blum Hinge Systems → Atomic Notes (ingest `BIun 68-197 Hinge systems.pdf`)

> ใช้สั่ง AI สกัดข้อมูล **ระบบบานพับของ Blum** จากไฟล์ `BIun 68-197 Hinge systems.pdf` ไฟล์เดียว
> ⚠️ ไฟล์นี้เป็น **hinge systems เท่านั้น** — กล่อง/ราง อยู่คนละไฟล์ (`BIun 198-411 3 〉`, `BIun 412-535`) และ AVENTOS/lift ก็คนละหมวด
> ออกมาเป็น **atomic notes ตรง schema ของ vault** — copy หยอดลง `20_ATOMIC_NOTES/` ได้ทันที
> 🎯 **เป้าหมายพิเศษ:** ค่า cup depth จากเล่มนี้คือแหล่ง Blum ทางการที่จะช่วยยืนยัน/ปิด Conflict #6

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน `BIun 68-197 Hinge systems.pdf` (แคตตาล็อก Blum — Hinge systems) แล้วสร้าง **atomic notes**
(โน้ตละ 1 ผลิตภัณฑ์/สเปก/ชิ้นเล็ก) ในรูปแบบ Markdown + YAML frontmatter ที่หยอดลง vault ได้ทันที

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- **แบรนด์เดียว = Blum เท่านั้น** ทุกค่า/รหัสผูกกับไฟล์ `BIun 68-197 Hinge systems.pdf` + เลขหน้าจริง
- ทำ **เฉพาะ Hinge Systems** เท่านั้น:
  - **CLIP top BLUMOTION / CLIP top** ทุกองศา: 110° (standard), 107°, 120°, 155° (zero protrusion), 170° (wide angle)
  - **Specialty hinges:** blind corner, bi-fold, profile door, thick door, angled (+/− องศา), glass door ถ้ามี
  - **Mounting plates (เพลทรอง):** cruciform / straight, screw-on / INSERTA / EXPANDO, ระยะ MD/spacing
  - **Hinge accessories:** angle restriction clip, BLUMOTION add-on unit, cover cap, depth/side/height adjusters, สกรู
- **ห้ามสรุป box, runner, AVENTOS/lift** ในรอบนี้ — ถ้าพบให้ข้าม
- ถ้าไฟล์ไม่มีข้อมูลของหมวดใด → ระบุ "ไม่ระบุในเอกสาร" (ห้ามเอาค่าจากแหล่งอื่น/ความรู้ทั่วไป/เว็บมาเติม)

## กฎเด็ดขาด (Governance — ห้ามฝ่าฝืน)
1. **ห้ามเดา/แต่งตัวเลข-รหัส** ไม่พบในเอกสาร → ใส่ `null` + เพิ่มชื่อ field ลง `needs_verify`
2. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้ไฟล์+หน้าจริง **รายค่า** เช่น `"BIun 68-197 Hinge systems.pdf:p.77"`
3. `truth_layer: draft` เสมอ
4. **แยกชัดว่าค่ามาจากไหน (สำคัญสำหรับ #6):**
   - ค่าที่พิมพ์เป็น **ตัวเลขใน text layer** (เช่น "min 11.7") → `review_status: review_ready` + ระบุใน body ว่า **text-verified**
   - ค่าที่อ่านจาก **เส้น dimension บนภาพแบบแปลน** → `review_status: unreviewed` + ระบุว่า **drawing-derived** + ใส่ลง `needs_verify`
5. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`, `_deg`)
6. **1 โน้ต = 1 ผลิตภัณฑ์/สเปก** · ชิ้นเล็ก (cap, clip, add-on, สกรู) แยกเป็นโน้ตของมันเอง
7. `sku` = **flat list ของ string เท่านั้น** เช่น `["71B3550","71T3550"]` — ห้าม nested map (label→SKU ไว้ในตาราง body)
8. **ห้ามตัดสินเองว่าฝั่งไหนถูก** เมื่อค่าชนกับโน้ตเดิม/MONOLITH → บันทึกลง `conflicts` ทั้งสองฝั่ง

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ — ห้ามมีข้อความนอก fence)
````
FILE: 20_ATOMIC_NOTES/blum-hinge-<variant>.md   (หรือ blum-mounting-plate-<variant>.md)
```md
---
note_type: product            # product | fitting_spec | system_moc
vendor: blum
system: hinge                 # hinge | mounting_plate
truth_layer: draft
review_status: review_ready   # review_ready (text) | unreviewed (drawing-derived)
angle_deg:                    # 110 | 107 | 120 | 155 | 170 ... (ถ้าเป็นบานพับ)
sku: []                       # flat list ของ string
source_refs: []               # ["BIun 68-197 Hinge systems.pdf:p.xx"] — รายค่า
specs:                        # ใส่เฉพาะที่พบจริง ที่เหลือ null
  cup_diameter_mm:            # ปกติ 35
  cup_depth_mm:               # ⚠️ drillMap-critical + ผูก Conflict #6 (ดูด้านล่าง)
  cup_distance_C_mm:          # ระยะถ้วยจากขอบ
  tab_TB_mm: {min: , max: }
  drill_pattern:              # ระยะรูสกรูถ้วย (เช่น 45/9.5) — ถ้าเป็นภาพอ่านไม่ได้ ใส่ null + note
  mounting_plate_spacing_MD_mm: []
  overlay_range_mm:
  boss_fixing: []             # [INSERTA, Screw-on, Knock-in/EXPANDO]
  soft_close:
  load_rating_kg:
needs_verify: []              # cup_depth_mm / drill_pattern ต้องอยู่ที่นี่เสมอถ้าเป็น drawing-derived
conflicts: []                 # ดู schema ด้านล่าง
related_monolith: []          # เช่น src/core/manufacturing/drillMap/, HingeCatalog.ts
tags: [blum, hinge]
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย>

> draft/review_ready — สรุป 1 บรรทัด

## สรุป
## ตารางรหัส/สเปก (เท่าที่มีในเอกสาร)
## ความลึกถ้วย (Cup Depth) — ระบุชัดว่า text-verified หรือ drawing-derived + หน้า
## เชื่อมกับ MONOLITH
## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-hinge-systems-moc]]
```
````

## 🎯 Conflict #6 hook — cup depth (สำคัญที่สุดของรอบนี้)
ใน vault มีโน้ตบานพับ Blum อยู่แล้ว พร้อมค่า cup depth ที่ยัง **pending engineer sign-off** (drawing-derived):
| โน้ตเดิม | angle | cup_depth_mm ปัจจุบัน | สถานะ |
|---|---|---|---|
| [[blum-hinge-110-standard]] | 110° | 13.0 | drawing-derived (รอเซ็น) |
| [[blum-hinge-155]] | 155° | 11.7 | text-verified |
| [[blum-hinge-170]] | 170° | 11.0 | drawing-derived (รอเซ็น) |

**สิ่งที่ต้องทำกับ cup_depth ทุกบานพับที่สกัดได้จาก `BIun 68-197`:**
1. ระบุค่า + หน้า + **text-verified หรือ drawing-derived**
2. เทียบกับค่าในโน้ตเดิมข้างบน แล้วใส่ `conflicts`:
   - ถ้า **ตรงกัน + เป็น text-verified** → `status: catalog_confirmed_pending_engineering` (ช่วยยกระดับความเชื่อมั่น #6)
   - ถ้า **ต่างกัน** → `status: unresolved` + บันทึกค่า 2 ฝั่ง ห้ามตัดสินเอง
```yaml
conflicts:
  - field: cup_depth_mm
    note_value: 13.0            # ค่าจาก BIun 68-197 ที่สกัดได้
    note_value_evidence: "BIun 68-197 Hinge systems.pdf:p.xx '...'"
    monolith_value: 13.0        # ค่าในโน้ต/โค้ดเดิม (110°=13.0, 155°=11.7, 170°=11.0)
    monolith_ref: "[[blum-hinge-110-standard]] / HingeCatalog.ts"
    status: catalog_confirmed_pending_engineering   # หรือ unresolved ถ้าต่าง
```
- cup_depth / drill_pattern เป็น drillMap-critical → ใส่ `needs_verify` เสมอจนกว่าวิศวกรเซ็น (แม้จะ text-verified ก็ยังต้องมนุษย์ยืนยันก่อนผลิต)

## ความครบ & การตั้งชื่อ
- ครบ 100% — รวม mounting plate, angle clip, BLUMOTION add-on, cover cap, สกรูทุกไซส์ (แต่ละชิ้น = โน้ตของมันเอง)
- filename = kebab-case: `blum-hinge-<variant>.md` / `blum-mounting-plate-<variant>.md`
  ⚠️ **ห้ามทับโน้ตเดิม** `blum-hinge-110-standard.md`, `blum-hinge-155.md`, `blum-hinge-170.md` — ถ้าเป็นบานพับเดียวกัน ให้เสนอเป็น **update โน้ตเดิม** (เพิ่ม source_refs + conflict) ไม่ใช่สร้างไฟล์ซ้ำ
- เชื่อม `[[wikilink]]` ไป source note และ `[[blum-hinge-systems-moc]]`

## Data Integrity
- ระบุไฟล์+หน้า **รายค่า** ทุกโน้ต · เอกสารไม่ครบ ทำเท่าที่มี ห้ามเติมจากแหล่งอื่น
- **ห้ามสรุป "ยืนยันแล้ว/verified"** สำหรับค่าเจาะ — แม้ text-verified ก็ยัง pending engineer sign-off

**Instruction:** วิเคราะห์เฉพาะ **Hinge Systems ของ Blum** จาก `BIun 68-197 Hinge systems.pdf`
สร้าง atomic notes ครบทุกผลิตภัณฑ์/สเปก/ชิ้นเล็ก ออกเป็นบล็อก `FILE:` + ```md เรียงต่อกัน
สำหรับบานพับ 110°/155°/170° ที่มีโน้ตอยู่แล้ว ให้เสนอเป็น **update** (FILE: ชี้ไฟล์เดิม) พร้อม conflict #6 hook
ไม่มีข้อความอื่นนอก fence — ผมจะนำไปหยอด/merge ลง vault เอง
