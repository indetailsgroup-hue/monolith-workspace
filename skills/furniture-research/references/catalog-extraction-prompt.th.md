# Prompt มาตรฐาน: ถอดรหัสข้อมูลแคตตาล็อกอุปกรณ์เฟอร์นิเจอร์ (แยกตามแบรนด์)

> ไฟล์นี้เป็น **Reusable Prompt + Output Template** สำหรับงานถอดข้อมูลฮาร์ดแวร์/ฟิตติ้ง
> เฟอร์นิเจอร์จากแคตตาล็อก (Häfele, Salice, Blum, Grass, Accuride ฯลฯ) โดยยึด
> **แบรนด์ (Brand) เป็นมิติจัดระเบียบหลัก**
>
> โครงสร้างไฟล์:
> 1. [ส่วนที่ 1 — Prompt](#ส่วนที่-1--prompt-คัดลอกไปใช้งาน) (คัดลอกไปใช้)
> 2. [ส่วนที่ 2 — ตัวอย่างผลลัพธ์ Häfele](#ส่วนที่-2--ตัวอย่างผลลัพธ์-sample-output--häfele)
> 3. [ส่วนที่ 3 — JSON Schema สำหรับ import](#ส่วนที่-3--json-schema-สำหรับ-import-เข้าระบบ)
> 4. [ส่วนที่ 4 — CSV Schema / Template](#ส่วนที่-4--csv-schema--template)

---

## ส่วนที่ 1 — Prompt (คัดลอกไปใช้งาน — ฉบับกระชับ < 5,000 ตัวอักษร)

```markdown
**Role:** Expert Furniture Hardware Specifier & Technical Data Analyst

**Task:** ถอดและสรุปข้อมูลอุปกรณ์ฮาร์ดแวร์/ฟิตติ้งเฟอร์นิเจอร์จากแคตตาล็อกให้พร้อมทำสเปก
โดย **ยึด "แบรนด์ (Brand)" เป็นมิติหลัก** ข้อมูลมาจากไฟล์แยกตามแบรนด์ (Häfele, Salice,
Blum, Grass, Accuride ฯลฯ) แต่ละแบรนด์มีระบบรหัส/ระบบเจาะ/ค่าสเปกของตัวเอง —
**ห้ามปนข้ามแบรนด์ในตารางเดียวโดยไม่ระบุที่มา**

**ลำดับชั้น (Hierarchy):** แบรนด์ → ประเภทอุปกรณ์ (Category) → รุ่น/รายการ
มีหลายแบรนด์ให้ทำซ้ำครบทุกแบรนด์ แล้วปิดท้ายด้วย Cross-Brand Reference

**Brand Header (ทุกแบรนด์ เท่าที่มี):** ชื่อแบรนด์/ผู้ผลิต, ชื่อ-ปีแคตตาล็อก,
ไฟล์ต้นทาง+เลขหน้า, ระบบเจาะ (เช่น System 32), รูปแบบรหัสสินค้า (Part No. pattern)

**Output:**
1. ภาษาไทย + คำทับศัพท์อังกฤษในศัพท์เทคนิค (Technical terms)
2. จัดหมวดตามลำดับประกอบจริง: บานพับ (Hinges) → เพลทรอง (Mounting Plates) →
   ระบบหน่วง (Soft-close/SMOVE) → ข้อต่อ (Connectors/Minifix) → น็อต-สกรู (Fasteners)
3. ตาราง Order Information (Markdown) คอลัมน์แรกต้องเป็น "แบรนด์":
   แบรนด์ | การใช้งาน/ทับขอบ (Full/Half/Inset) | การยึด (Screw-on/Dowel/Knock-in/
   INSERTA/EXPANDO/Self-adhesive) | รุ่น/ประเภท | วัสดุ/สีผิว | รหัสสินค้า
   (มีรหัสผู้ผลิตใส่วงเล็บ เช่น Häfele 329.17.800 / Salice C2PPA99) | แหล่งอ้างอิง (ไฟล์+หน้า)
4. Planning & Calculation ต่อหมวด (เท่าที่มี): ความหนาบาน (FD); ระยะเจาะ (TB)+ช่วงค่า;
   ความลึก/Ø ถ้วย (35mm); ตารางแปลง TB→ทับขอบ (FA)+ช่องไฟต่ำสุด (F); ระยะ System 32
   (pitch 32, รูยึด Ø5/Ø37, ถ้วย Ø35, damper Ø10, bolt Ø5 หัว Ø6.5); น้ำหนักรองรับ
   (คงหน่วยเดิม lbs/kg); ปรับ 3 ทิศ (Side/Height/Depth); มุมเปิด + เงื่อนไขพิเศษ
   (0-protrusion, เพลทหนา X mm, angled spacer ฯลฯ)
5. Legend ตัวย่อสี/วัสดุที่หัวแต่ละหมวด (เช่น NI=นิกเกิล, ONS=Onyx black, TI=ไทเทเนียม,
   ●=มีสปริง, ○=ไม่มีสปริง)
6. ครบ 100% ห้ามตกชิ้นเล็ก: Sleeves M4/M6, สกรูทุกไซส์ (chipboard/euro/system/pan/
   truss), จิ๊กเจาะ (Drill guide/Depth gauge), ลิ่มปรับองศา (Angled spacer), ฝาครอบ
   (Cover caps), ตัวหน่วง (Damper), กุญแจขัน (Tightening key) → หมวด Accessories & Fasteners

**Cross-Brand Reference (เมื่อมี ≥ 2 แบรนด์):** จับคู่เมื่อเอกสารระบุชัดว่าใช้แทนกันได้
หรือสเปกตรงกัน พร้อมสถานะ: "ระบุว่าใช้แทนกันได้" / "เทียบจากสเปก ต้องตรวจสอบจริง" /
"ข้อมูลไม่พอ — ห้ามสรุป" + หมายเหตุความต่างที่กระทบการประกอบ

**Data Integrity:**
- ห้ามปนข้ามแบรนด์ ทุกค่า/รหัสผูกกับแบรนด์+ไฟล์ต้นทางจริง
- ห้ามเดา/แต่งตัวเลข-รหัส ไม่พบให้ระบุ "ไม่ระบุในเอกสาร"
- ห้ามยกสเปกแบรนด์หนึ่งไปใช้อีกแบรนด์ เว้นแต่เอกสารระบุชัด
- คงหน่วยเดิม + กำกับหน่วยทุกค่า
- แบบแปลนเจาะที่เป็นข้อความไม่ได้ ให้หมายเหตุแทนการเดา
- ระบุไฟล์+เลขหน้าทุกหมวด; เอกสารไม่ครบทำเท่าที่มี ห้ามเติมจากแบรนด์อื่น
```

---

## ส่วนที่ 2 — ตัวอย่างผลลัพธ์ (Sample Output) — Häfele

> ⚠️ **คำเตือนเรื่องข้อมูล (อ่านก่อนใช้):** ค่าตัวเลข รหัสสินค้า และเลขหน้าทั้งหมด
> ในส่วนนี้เป็น **ตัวอย่างประกอบรูปแบบ (illustrative example)** เพื่อแสดง "หน้าตา
> ผลลัพธ์ที่ถูกต้อง" เท่านั้น **ไม่ใช่ข้อมูลจริงจากแคตตาล็อก** เมื่อใช้งานจริงต้อง
> แทนที่ทุกค่าด้วยข้อมูลที่อ่านได้จากเอกสารต้นทาง และลบคำเตือนนี้ออก

# Häfele

## Brand Header
- **แบรนด์ (Brand):** Häfele
- **ผู้ผลิต/ผู้จัดจำหน่าย (Manufacturer / Distributor):** Häfele GmbH & Co KG
- **แคตตาล็อก (Catalog / Edition / Year):** _ตัวอย่าง_ — Häfele Complete Catalogue (illustrative)
- **ไฟล์ต้นทาง (Source file):** `hafele_hinges_sample.pdf` (illustrative)
- **ช่วงเลขหน้าอ้างอิง (Pages):** น.04–07 (illustrative)
- **ระบบเจาะ/มาตรฐาน (Drilling system):** System 32 (pitch 32 mm), Cup Ø 35 mm
- **รูปแบบรหัสสินค้า (Part No. pattern):** XXX.XX.XXX (เช่น 329.17.800)

## Legend (หมายเหตุสัญลักษณ์ของหมวดบานพับ)
- **NI** = ชุบนิกเกิล (Nickel-plated)
- **ONS** = Onyx black (สีดำออนิกซ์)
- **●** = มีสปริง (Self-closing / sprung)
- **○** = ไม่มีสปริง (Free-swinging)
- **FD** = Door thickness (ความหนาหน้าบาน)
- **TB** = Tab / Drilling distance (ระยะเจาะขอบถ้วย)
- **FA** = Front overlay (ระยะทับขอบหน้าบาน)

### หมวด 1: บานพับถ้วย (Concealed Hinges)

**Planning & Calculation** _(ค่าตัวอย่าง — ต้องยืนยันกับเอกสารจริง)_
- ความหนาหน้าบานที่รองรับ (FD): 16–24 mm
- เส้นผ่านศูนย์กลางถ้วย (Cup Ø): 35 mm | ความลึกถ้วย (Cup depth): 11.5 mm
- ระยะเจาะขอบ (TB): ปรับได้ 3–6 mm
- มุมเปิด (Opening angle): 110°
- น้ำหนักรองรับ (Load): ไม่ระบุในเอกสาร (ขึ้นกับจำนวนบานพับต่อบาน)
- การปรับตั้ง 3 ทิศทาง (Adjustment): Side ±2 mm / Height ±2 mm / Depth −0.5 … +2.8 mm
- เงื่อนไขพิเศษ: ต้องใช้คู่กับเพลทรอง (Mounting Plate) — ดูหมวด 2

**ตารางแปลงระยะเจาะ → ระยะทับขอบ** _(TB → FA, ค่าตัวอย่าง)_

| ระยะเจาะ TB (mm) | ระยะทับขอบ FA (mm) | ช่องไฟขั้นต่ำ F (mm) |
|---|---|---|
| 3 | 18 | 1.5 |
| 4 | 16 | 2.0 |
| 5 | 14 | 3.0 |
| 6 | 12 | 4.0 |

**Order Information**

| แบรนด์ | Application / Overlay | Fixing | Model / Type | Material / Finish | Part No. | Source |
|---|---|---|---|---|---|---|
| Häfele | Full overlay ● | Screw-on | Metalla 510 110° | เหล็กชุบนิกเกิล (NI) | 329.17.800 *(illustrative)* | hafele_hinges_sample.pdf น.04 |
| Häfele | Full overlay ● | INSERTA | Metalla 510 110° | เหล็กชุบนิกเกิล (NI) | 329.17.802 *(illustrative)* | hafele_hinges_sample.pdf น.04 |
| Häfele | Half overlay ● | Screw-on | Metalla 510 110° | เหล็กชุบนิกเกิล (NI) | 329.18.800 *(illustrative)* | hafele_hinges_sample.pdf น.05 |
| Häfele | Inset ● | Screw-on | Metalla 510 110° | เหล็กชุบนิกเกิล (NI) | 329.19.800 *(illustrative)* | hafele_hinges_sample.pdf น.05 |

### หมวด 2: เพลทรอง (Mounting Plates)

**Planning & Calculation** _(ค่าตัวอย่าง)_
- ความสูงเพลท (Plate height / distance D): 0 / 3 / 6 mm
- ระบบยึด: System 32 (รูยึด Ø5, ระยะ 37 mm)
- การปรับ Height ที่ตัวเพลท: ±2 mm (ขึ้นกับรุ่น)

**Order Information**

| แบรนด์ | Application / Overlay | Fixing | Model / Type | Material / Finish | Part No. | Source |
|---|---|---|---|---|---|---|
| Häfele | Distance 0 mm | Screw-on (Ø5/37) | Cross plate | เหล็กชุบนิกเกิล (NI) | 329.71.500 *(illustrative)* | hafele_hinges_sample.pdf น.06 |
| Häfele | Distance 3 mm | Screw-on (Ø5/37) | Cross plate | เหล็กชุบนิกเกิล (NI) | 329.71.503 *(illustrative)* | hafele_hinges_sample.pdf น.06 |
| Häfele | Distance 0 mm | EXPANDO (Ø8) | Cross plate | เหล็กชุบนิกเกิล (NI) | 329.72.500 *(illustrative)* | hafele_hinges_sample.pdf น.06 |

### หมวด 3: ระบบหน่วง (Soft-close / SMOVE)

**Order Information**

| แบรนด์ | Application | Fixing | Model / Type | Material / Finish | Part No. | Source |
|---|---|---|---|---|---|---|
| Häfele | Clip-on damper สำหรับบานพับ | Clip-on (damper Ø10) | Soft-close adapter | พลาสติก/เหล็ก | 329.99.700 *(illustrative)* | hafele_hinges_sample.pdf น.07 |

### Accessories & Fasteners (ห้ามละเว้นชิ้นเล็ก)

| แบรนด์ | รายการ (Item) | Type / Size | Material / Finish | Part No. | Source |
|---|---|---|---|---|---|
| Häfele | สกรูยึดเพลท (Chipboard screw) | Ø3.5 × 16 mm | เหล็กชุบนิกเกิล | 011.xx.xxx *(illustrative)* | น.07 |
| Häfele | ฝาครอบตกแต่ง (Cover cap) | สำหรับแขนบานพับ | พลาสติก ONS | 329.90.xxx *(illustrative)* | น.07 |
| Häfele | ตัวหน่วง (Damper unit) | Clip-on Ø10 | — | 329.99.700 *(illustrative)* | น.07 |
| Häfele | จิ๊กเจาะ (Drilling jig) | Cup Ø35 / System 32 | — | ไม่ระบุในเอกสาร | — |

---

## ส่วนที่ 3 — JSON Schema สำหรับ import เข้าระบบ

โครงสร้าง JSON ออกแบบให้ **แบรนด์เป็น root** → หมวดหมู่ → รายการสินค้า เพื่อให้
ทุกระเบียนผูกกับแบรนด์และแหล่งอ้างอิงเสมอ (ตรงกับกฎ "ห้ามปนข้ามแบรนด์")

### 3.1 JSON Schema (Draft 2020-12) สำหรับ validate

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tcck.local/schemas/hardware-catalog.schema.json",
  "title": "Furniture Hardware Catalog Extraction",
  "type": "object",
  "required": ["brand", "categories"],
  "properties": {
    "brand": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "manufacturer": { "type": "string" },
        "catalog_edition": { "type": "string" },
        "year": { "type": ["integer", "null"] },
        "source_file": { "type": "string" },
        "pages": { "type": "string" },
        "drilling_system": { "type": "string" },
        "part_no_pattern": { "type": "string" }
      }
    },
    "legend": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["symbol", "meaning"],
        "properties": {
          "symbol": { "type": "string" },
          "meaning": { "type": "string" }
        }
      }
    },
    "categories": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["category_name", "items"],
        "properties": {
          "category_name": { "type": "string" },
          "planning": {
            "type": "object",
            "description": "ใช้ null หรือ 'ไม่ระบุในเอกสาร' เมื่อไม่พบข้อมูล ห้ามเดา",
            "properties": {
              "door_thickness_mm": { "type": ["string", "null"] },
              "drilling_distance_TB_mm": { "type": ["string", "null"] },
              "cup_diameter_mm": { "type": ["number", "null"] },
              "cup_depth_mm": { "type": ["number", "null"] },
              "opening_angle_deg": { "type": ["number", "null"] },
              "load_capacity": { "type": ["string", "null"] },
              "adjustment_side_mm": { "type": ["string", "null"] },
              "adjustment_height_mm": { "type": ["string", "null"] },
              "adjustment_depth_mm": { "type": ["string", "null"] },
              "tb_to_fa_table": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "TB_mm": { "type": "number" },
                    "FA_mm": { "type": "number" },
                    "min_gap_F_mm": { "type": "number" }
                  }
                }
              },
              "special_conditions": { "type": ["string", "null"] }
            }
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["brand", "part_no", "source"],
              "properties": {
                "brand": { "type": "string" },
                "application_overlay": { "type": "string", "description": "Full / Half-Dual / Inset / Distance ..." },
                "fixing": { "type": "string", "description": "Screw-on / Dowel / Knock-in / INSERTA / EXPANDO / Self-adhesive / Clip-on" },
                "model_type": { "type": "string" },
                "material_finish": { "type": "string" },
                "part_no": { "type": "string" },
                "manufacturer_part_no": { "type": ["string", "null"] },
                "spring": { "type": ["boolean", "null"], "description": "true=มีสปริง(●), false=ไม่มี(○), null=ไม่ระบุ" },
                "source": {
                  "type": "object",
                  "required": ["file"],
                  "properties": {
                    "file": { "type": "string" },
                    "page": { "type": ["string", "null"] }
                  }
                },
                "data_status": {
                  "type": "string",
                  "enum": ["from_document", "not_specified", "illustrative"],
                  "description": "ระบุที่มาของค่า เพื่อกันข้อมูลเดา"
                }
              }
            }
          }
        }
      }
    },
    "cross_brand_reference": {
      "type": "array",
      "description": "เติมเมื่อมี ≥ 2 แบรนด์เท่านั้น",
      "items": {
        "type": "object",
        "properties": {
          "function": { "type": "string" },
          "matches": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "brand": { "type": "string" },
                "part_no": { "type": "string" }
              }
            }
          },
          "equivalence_status": {
            "type": "string",
            "enum": [
              "stated_interchangeable",
              "spec_match_verify_required",
              "insufficient_data"
            ]
          },
          "notes": { "type": "string" }
        }
      }
    }
  }
}
```

### 3.2 ตัวอย่างข้อมูล JSON (สอดคล้องกับ Sample Output ด้านบน — illustrative)

```json
{
  "brand": {
    "name": "Häfele",
    "manufacturer": "Häfele GmbH & Co KG",
    "catalog_edition": "Complete Catalogue (illustrative)",
    "year": null,
    "source_file": "hafele_hinges_sample.pdf",
    "pages": "04-07",
    "drilling_system": "System 32, Cup Ø35",
    "part_no_pattern": "XXX.XX.XXX"
  },
  "legend": [
    { "symbol": "NI", "meaning": "ชุบนิกเกิล (Nickel-plated)" },
    { "symbol": "ONS", "meaning": "Onyx black" },
    { "symbol": "●", "meaning": "มีสปริง (sprung)" },
    { "symbol": "○", "meaning": "ไม่มีสปริง" }
  ],
  "categories": [
    {
      "category_name": "Concealed Hinges (บานพับถ้วย)",
      "planning": {
        "door_thickness_mm": "16-24",
        "drilling_distance_TB_mm": "3-6",
        "cup_diameter_mm": 35,
        "cup_depth_mm": 11.5,
        "opening_angle_deg": 110,
        "load_capacity": "ไม่ระบุในเอกสาร",
        "adjustment_side_mm": "±2",
        "adjustment_height_mm": "±2",
        "adjustment_depth_mm": "-0.5 ... +2.8",
        "tb_to_fa_table": [
          { "TB_mm": 3, "FA_mm": 18, "min_gap_F_mm": 1.5 },
          { "TB_mm": 4, "FA_mm": 16, "min_gap_F_mm": 2.0 },
          { "TB_mm": 5, "FA_mm": 14, "min_gap_F_mm": 3.0 },
          { "TB_mm": 6, "FA_mm": 12, "min_gap_F_mm": 4.0 }
        ],
        "special_conditions": "ต้องใช้คู่กับ Mounting Plate"
      },
      "items": [
        {
          "brand": "Häfele",
          "application_overlay": "Full overlay",
          "fixing": "Screw-on",
          "model_type": "Metalla 510 110°",
          "material_finish": "เหล็กชุบนิกเกิล (NI)",
          "part_no": "329.17.800",
          "manufacturer_part_no": null,
          "spring": true,
          "source": { "file": "hafele_hinges_sample.pdf", "page": "04" },
          "data_status": "illustrative"
        }
      ]
    }
  ],
  "cross_brand_reference": []
}
```

---

## ส่วนที่ 4 — CSV Schema / Template

CSV ทำเป็นโครง **flat (1 แถว = 1 รายการสินค้า)** เหมาะกับ import เข้า spreadsheet/DB
โดยทุกแถวพก `brand` และ `source_*` ไปด้วยเสมอ ค่าที่ไม่พบให้ใส่ `ไม่ระบุในเอกสาร`
(ห้ามเว้นว่างแบบกำกวมหรือเดา)

### 4.1 ตารางนิยามคอลัมน์ (Column Dictionary)

| คอลัมน์ | ความหมาย | ตัวอย่าง / ค่าที่ใช้ได้ |
|---|---|---|
| `brand` | แบรนด์ (มิติหลัก) | Häfele, Salice |
| `category` | หมวดอุปกรณ์ | Concealed Hinges |
| `application_overlay` | ลักษณะใช้งาน/ทับขอบ | Full overlay, Half, Inset, Distance 3mm |
| `fixing` | รูปแบบยึด-ติดตั้ง | Screw-on, Dowel, INSERTA, EXPANDO, Clip-on |
| `model_type` | รุ่น/ประเภท | Metalla 510 110° |
| `material_finish` | วัสดุ/สีผิว | เหล็กชุบนิกเกิล (NI) |
| `part_no` | รหัสสินค้าหลัก | 329.17.800 |
| `manufacturer_part_no` | รหัสคู่ผู้ผลิต (ถ้ามี) | C2PPA99 |
| `spring` | สปริง | yes / no / ไม่ระบุในเอกสาร |
| `door_thickness_mm` | ความหนาหน้าบาน | 16-24 |
| `drilling_distance_TB_mm` | ระยะเจาะ TB | 3-6 |
| `cup_diameter_mm` | Ø ถ้วย | 35 |
| `cup_depth_mm` | ความลึกถ้วย | 11.5 |
| `opening_angle_deg` | มุมเปิด | 110 |
| `load_capacity` | น้ำหนักรองรับ (คงหน่วยเดิม) | 25 kg / ไม่ระบุในเอกสาร |
| `adjustment_side_mm` | ปรับด้านข้าง | ±2 |
| `adjustment_height_mm` | ปรับสูง-ต่ำ | ±2 |
| `adjustment_depth_mm` | ปรับลึก | -0.5...+2.8 |
| `source_file` | ไฟล์ต้นทาง | hafele_hinges_sample.pdf |
| `source_page` | เลขหน้า | 04 |
| `data_status` | สถานะข้อมูล | from_document / not_specified / illustrative |

### 4.2 CSV Template (header + ตัวอย่างแถว — illustrative)

```csv
brand,category,application_overlay,fixing,model_type,material_finish,part_no,manufacturer_part_no,spring,door_thickness_mm,drilling_distance_TB_mm,cup_diameter_mm,cup_depth_mm,opening_angle_deg,load_capacity,adjustment_side_mm,adjustment_height_mm,adjustment_depth_mm,source_file,source_page,data_status
Häfele,Concealed Hinges,Full overlay,Screw-on,Metalla 510 110°,เหล็กชุบนิกเกิล (NI),329.17.800,,yes,16-24,3-6,35,11.5,110,ไม่ระบุในเอกสาร,±2,±2,-0.5...+2.8,hafele_hinges_sample.pdf,04,illustrative
Häfele,Concealed Hinges,Full overlay,INSERTA,Metalla 510 110°,เหล็กชุบนิกเกิล (NI),329.17.802,,yes,16-24,3-6,35,11.5,110,ไม่ระบุในเอกสาร,±2,±2,-0.5...+2.8,hafele_hinges_sample.pdf,04,illustrative
Häfele,Mounting Plates,Distance 0mm,Screw-on,Cross plate,เหล็กชุบนิกเกิล (NI),329.71.500,,,,,,,,ไม่ระบุในเอกสาร,,±2,,hafele_hinges_sample.pdf,06,illustrative
Häfele,Accessories & Fasteners,-,Screw-on,Chipboard screw Ø3.5x16,เหล็กชุบนิกเกิล,011.00.000,,,,,,,,,,,,hafele_hinges_sample.pdf,07,illustrative
```

> **เคล็ดการใช้กับ Prompt:** เพิ่มบรรทัดท้าย Prompt ว่า
> *"นอกจากผลลัพธ์ Markdown แล้ว ให้ส่งออกข้อมูลเดียวกันในรูปแบบ JSON ตาม schema
> ในไฟล์นี้ และ/หรือ CSV ตาม header ที่กำหนด โดยตั้ง `data_status` เป็น
> `from_document` ทุกค่าที่อ่านจากเอกสารจริง และ `not_specified` เมื่อไม่พบ"*
