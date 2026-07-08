# Prompt: Blum Box Systems → Atomic Notes (Vision / image-only PDF)

> ใช้กับ `BIun 198-411 ... Box systems.pdf` (Blum แคตตาล็อก หน้า 198–411 — **เป็นภาพสแกนล้วน ไม่มี text layer** ต้องอ่านด้วยสายตา)
> ผลลัพธ์ = atomic notes หยอดลง Obsidian vault ได้ทันที

---

**Role:** Expert Furniture Hardware Specifier & Knowledge Engineer (Obsidian Zettelkasten)

**Task:** อ่าน **ภาพ** จากแคตตาล็อก Blum ที่แนบ (เป็น PDF สแกน ไม่มี text layer) แล้วสร้าง **atomic notes**
เฉพาะ **ระบบลิ้นชัก/กล่องลิ้นชัก (Box Systems)** ของ Blum — โน้ตละ 1 รุ่น/สเปก/ชิ้นส่วน

## 🔒 SCOPE LOCK
- รอบนี้ทำ **เฉพาะ Blum Box Systems**: LEGRABOX · TANDEMBOX · MERIVOBOX (+ accessories/fasteners ของระบบเหล่านี้)
- **ห้ามทำบานพับ (CLIP top), AVENTOS, runner เดี่ยวๆ ที่ไม่ใช่ส่วนของ box** ในรอบนี้ — ถ้าพบให้ข้าม
- 1 โน้ต = 1 แบรนด์ (Blum เท่านั้น) = 1 รุ่น/แนวคิด

## กฎเด็ดขาด (ห้ามฝ่าฝืน)
1. **อ่านจากภาพจริงเท่านั้น** — ห้ามเดา/เติมตัวเลข-รหัสจากความจำหรือความรู้ทั่วไป
2. ตัวเลข/รหัสที่อ่านจากภาพไม่ชัด → ใส่ `null` + เพิ่ม key ลง `needs_verify` + หมายเหตุว่า "อ่านจากภาพไม่ชัด หน้า p.xx"
3. ทุกค่าเทคนิค/รหัส ต้องมี `source_refs` ชี้หน้า เช่น `"BIun 198-411 Box systems.pdf:p.xx"`
4. `truth_layer: draft` เสมอ · ค่าที่อ่านจากภาพชัดเจน = `review_status: review_ready` · อนุมาน = `unreviewed` + `derived: true`
5. คงหน่วยเดิม + ระบุหน่วยในชื่อ field (`_mm`, `_kg`)
6. ครบ 100% — รวมชิ้นเล็ก (rail/runner ของ box, front fixing bracket, gallery/railing, ฝาครอบ, สกรู) แต่แยกเป็นโน้ตของมันเอง
7. **ค่า drillMap-critical** (side clearance, ความกว้าง/ลึกขั้นต่ำ, NL, ระยะรูเจาะ, load rating) → ใส่ `needs_verify` เสมอ และถ้าอาจชน MONOLITH ให้ใส่ `conflicts` (ดูด้านล่าง) — **ห้ามตัดสินเองว่าฝั่งไหนถูก**

## รูปแบบผลลัพธ์ (ทำตามเป๊ะ)
ออกเป็นบล็อกต่อโน้ต บรรทัดแรกบอก path แล้วตามด้วย code fence ```md ทำซ้ำหลายโน้ตได้ ห้ามมีข้อความอื่นนอก fence:

````
FILE: 20_ATOMIC_NOTES/blum-<system>-<variant>.md
```md
---
note_type: product            # product | fitting_spec
vendor: blum
system: drawer_box            # drawer_box | runner | connector | damper | screw | accessory
truth_layer: draft
review_status: review_ready
sku: []                       # รหัส Blum ทุกตัวที่อ่านได้ (เช่น 770K4502S)
source_refs: []               # ["BIun 198-411 Box systems.pdf:p.xx"]
specs:                        # ใส่เฉพาะที่อ่านได้จากภาพ ที่เหลือ null
  system_family:              # LEGRABOX | TANDEMBOX | MERIVOBOX
  height_class:               # เช่น N/M/K/C/F (LEGRABOX) หรือ M/K/D/B (TANDEMBOX) — ตามที่ภาพระบุ
  side_height_mm:
  nominal_length_NL_mm: []    # list ทุก NL ที่ระบุ
  load_rating_kg:
  extension_type:             # full | partial | over-travel
  cabinet_width_min_mm:
  side_clearance_mm:          # ระยะเผื่อข้างต่อข้าง
  soft_close:                 # true/false/null (BLUMOTION)
  push_to_open:               # true/false/null (TIP-ON)
  drill_pattern:              # ระยะรูเจาะ/ตำแหน่งยึด ถ้าภาพระบุ
finishes: []                  # สี/วัสดุที่ระบุ
needs_verify: []              # field ที่อ่านไม่ชัด/ยังไม่ verify
conflicts: []                 # [{field, note_value, note_value_evidence, monolith_value, monolith_ref, status}]
                              # ไม่รู้ค่าฝั่งโค้ดให้ monolith_value/ref = null, status: unresolved
related_monolith: []
tags: []
last_verified_at: null
is_stale: false
---

# <ชื่อโน้ตอ่านง่าย> (เช่น Blum LEGRABOX pure ความสูง N)

> draft/review_ready — สรุปสั้น 1 บรรทัด

## สรุป
<!-- รุ่นนี้คืออะไร ใช้กับงานแบบไหน -->

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
<!-- Markdown table: NL × รหัส, height class, load ฯลฯ -->

## เชื่อมกับ MONOLITH
<!-- ค่านี้ map กับ drawer/runner logic ใด; ถ้าค่าอาจต่างจากระบบ ให้ชี้ไปที่ field conflicts -->

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-hinge-systems-moc]] (หรือ MOC ลิ้นชักถ้ามี) · Validation: [[CK-blum-hinge-specs]]
```
````

## การแจ้ง Conflict กับ MONOLITH
ถ้าค่าที่อ่านได้ "อาจ" ต่างจากระบบ MONOLITH (เช่น side_clearance_mm, NL, load) → บันทึกทั้งสองฝั่ง อย่าตัดสินเอง:
```yaml
conflicts:
  - field: side_clearance_mm
    note_value: 13
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.xx (อ่านจากภาพ diagram)"
    monolith_value: null     # ไม่รู้ค่าฝั่งโค้ดให้ null — ผู้ ingest จะ cross-check เอง
    monolith_ref: null
    status: unresolved
```

## Data Integrity
- ระบุหน้าทุกโน้ต · อ่านไม่ออก/ไม่ชัด ให้หมายเหตุ "อ่านจากภาพไม่ชัด" แทนการเดา
- ห้ามยกสเปก Häfele/Salice มาใช้กับ Blum · ทุกค่าผูกกับหน้าจริงของไฟล์ Blum นี้
- รหัสสินค้า Blum มักลงท้ายด้วยตัวอักษร (เช่น 770K..S = soft-close) — ถ้าเดาตัวอักษรท้ายไม่ได้ ให้ใส่เท่าที่เห็น + needs_verify

**Instruction:** อ่านภาพแคตตาล็อก Blum Box Systems ที่แนบ สร้าง atomic notes ครบทุกรุ่น/สเปก/ชิ้นเล็ก
ออกเป็นบล็อก FILE:+```md เรียงต่อกัน — ผมจะนำไปหยอดลง vault โดยตรง
ถ้าภาพเยอะให้ทยอยทำเป็นช่วงหน้า (เช่น LEGRABOX ก่อน แล้ว TANDEMBOX) และบอกช่วงหน้าที่ทำในแต่ละรอบ
