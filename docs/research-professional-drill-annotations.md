# Deep Research: Professional Drill Annotation Standards
## มืออาชีพระดับโลกแสดง Drill Annotations อย่างไร

---

## 1. ISO 128-22 — มาตรฐานสากล Leader Lines

มาตรฐาน **ISO 128-22:1999** กำหนดกฎหลักสำหรับ leader lines และ reference lines ในแบบเทคนิคทุกประเภท:

### กฎสำคัญ

| กฎ | รายละเอียด |
|----|-----------|
| **มุมขั้นต่ำ 15°** | Leader line ต้องทำมุมอย่างน้อย 15° กับเส้นข้างเคียง (dimension lines, edges) |
| **ห้ามแนวตั้ง/แนวนอน** | Leader line ไม่ควรเป็นแนว vertical หรือ horizontal ตรงๆ |
| **ห้ามตัดกัน** | Leader lines ต้องไม่ตัดผ่านกัน (should not cross each other) |
| **ไม่ขนานกับเส้นอื่น** | ห้ามขนานกับ extension lines, dimension lines, หรือ section lines |
| **จบด้วย dot หรือ arrow** | ปลาย leader ที่ชี้ตำแหน่ง ใช้จุด (dot) สำหรับพื้นผิว หรือลูกศร (arrow) สำหรับ edge |
| **Reference line แนวนอน** | ปลายที่มีข้อความ ใช้เส้นแนวนอนสั้นๆ (reference line) แล้ววางข้อความเหนือเส้น |

### การจัดกลุ่ม Leaders ที่อยู่ใกล้กัน

- Leaders ที่ชี้ไปยังจุดใกล้กัน ควรเรียงเป็น **fan-out** จากจุดข้อความ
- Leaders ที่อยู่ติดกัน ควรทำมุม **ขนานกัน** (parallel adjacent leaders)
- ข้อความเรียงซ้อนกันในแนวตั้ง ด้วยระยะห่างสม่ำเสมอ (uniform spacing ≥ 0.7mm ในแบบ, ~8mm ในงานใหญ่)

---

## 2. วิธีแสดงของ Software ระดับมืออาชีพ

### 2.1 HOMAG woodWOP

- ใช้ **ID number + สัญลักษณ์** แทนชื่อเต็ม (เช่น "H1", "D2" แทน "Minifix® 15 with rim")
- Bore labels แสดง **Ø diameter × depth** เท่านั้น (เช่น "Ø15 × 13.5")
- สีแยกตาม machining type: เจาะ = น้ำเงิน, ร่อง = เขียว, ตัด = แดง
- Workpiece แสดงเป็น **wireframe + bore symbols** ไม่ใช่ solid
- **Legend table** ด้านข้าง map ID → รายละเอียดเต็ม

### 2.2 Blum DYNALOG

- ใช้ **BXF format** (Blum Exchange Format) — XML เก็บข้อมูลครบ
- แบบพิมพ์ (print output) แสดง:
  - **Exploded view** ของตู้ + panel แต่ละแผ่นแยก
  - **Bore pattern** บน panel เป็น **วงกลมเปล่า** (outline circles) + dimension lines
  - **ตารางข้อมูล** (parts list) ระบุชื่อ, รหัส, จำนวน แยกต่างหาก
- ไม่มี label ข้อความวางทับบน bore — ใช้ **ตัวเลข reference** + ตารางแทน

### 2.3 imos iX CAD/CAM

- **Object-oriented** — manufacturing data ถูก derive จาก 3D model อัตโนมัติ
- แสดง drill pattern เป็น **color-coded circles** บน 2D projection:
  - Face bore = วงกลมทึบ
  - Edge bore = วงกลมครึ่ง
- Labels ใช้ **running number** (1, 2, 3...) + legend sidebar
- Context menu ให้ isolate machining operations ทีละตัว

### 2.4 PYTHA 3D CAD

- **Live bore holes** อัปเดตอัตโนมัติเมื่อแก้ไขวัตถุ
- แสดง bore pattern เป็น **cross-section view** + depth indicator
- ใช้ **patented "footprint" technology** สำหรับ hardware placement
- Technical drawing output: bore = symbol + dimension, ไม่ใช่ full-text label

### 2.5 Häfele CAD/CAM Data

- ให้ 40,000+ articles ในรูป 2D/3D CAD data
- 18,000+ CAM data sets: drilling, grooves, milling
- **Technical illustrations** ใน catalog ใช้สไตล์:
  - เส้นบาง (thin lines) สำหรับ leader
  - ตัวเลข reference กำกับ + callout table ด้านข้าง
  - Dimensions แยกชั้น (layer) จาก labels

---

## 3. หลักการออกแบบ Annotations ระดับมืออาชีพ

### 3.1 ลำดับชั้น (Hierarchy)

```
Primary:   Bore circle/symbol + dimension (Ø × depth)
Secondary: Reference number → lookup table
Tertiary:  Full product name (ใน table/legend เท่านั้น)
```

**หลักการ**: ยิ่งใกล้ bore ยิ่งกระชับ — ข้อมูลเต็มอยู่ใน table ด้านข้าง

### 3.2 Label Format — อุตสาหกรรมใช้อะไร

| ระดับ | รูปแบบ | ตัวอย่าง |
|-------|--------|---------|
| **Minimal** (woodWOP style) | ID + Ø × depth | `H1: Ø15×13.5` |
| **Compact** (ISO style) | Ø depth + short name | `Ø15×13.5 Minifix` |
| **Full** (catalog style) | Full product + catalog no. | `Minifix® 15 with rim (262.24.503)` |

**ซอฟต์แวร์ระดับโลกใช้ Minimal หรือ Compact** — Full name อยู่ใน legend table

### 3.3 Leader Line Layout Rules

1. **Dog-leg leader**: เส้นเฉียงจาก bore → หักมุมเป็น horizontal reference line → ข้อความเหนือ reference line
2. **Consistent angle**: leaders ทุกตัวใน group ใช้มุมเดียวกัน (ปกติ 30° หรือ 45°)
3. **Stacking**: labels ซ้อนกันในแนวตั้ง ด้วยระยะห่างคงที่ (8-12mm)
4. **Fan-out**: ถ้า bore อยู่ใกล้กัน leaders fan ออกจากจุดเดียว
5. **No crossing**: เส้นห้ามตัดกัน — จัดลำดับจากใกล้ไปไกล
6. **Margin alignment**: ข้อความทุกตัว align left ที่ขอบเดียวกัน

### 3.4 สี (Color Coding)

| ประเภท | สี (อุตสาหกรรมทั่วไป) |
|--------|---------------------|
| Face bore (เจาะหน้า) | น้ำเงิน (Blue) |
| Edge bore (เจาะข้าง) | เขียว (Green) |
| Through bore (เจาะทะลุ) | แดง (Red) |
| Groove/Slot | ม่วง (Purple) |
| Reference dimension | เทา (Gray) |

### 3.5 Typography

- **Font size**: bore ID/Ø ใช้ขนาดเล็ก (7-9pt ในแบบ A4)
- **Font weight**: Regular (ไม่ bold) สำหรับ labels, Bold สำหรับ headlines เท่านั้น
- **Spacing**: text อยู่เหนือ reference line อย่างน้อย 2× line thickness

---

## 4. ปัญหาของ MONOLITH ตอนนี้ vs มาตรฐาน

| ปัญหาปัจจุบัน | มาตรฐาน/Best Practice |
|-------------|---------------------|
| Label แสดงชื่อเต็ม "S200 Connecting bolt", "Minifix® 15 with rim" ซึ่งยาวเกินไป | ใช้ Compact format: `Ø8×24 S200` หรือ reference number `#1` + legend |
| Leader lines มุมต่างกันไป ไม่สม่ำเสมอ | Leaders ควรขนานกัน ใช้มุมเดียว (30° หรือ 45°) |
| Labels ซ้อนทับกันเมื่อ bore อยู่ใกล้กัน | ต้องมี collision avoidance — stack ออกจากกันด้วย fixed spacing |
| ไม่มี reference line (เส้นแนวนอนสั้นๆ ต่อจาก leader) | ISO 128-22 กำหนดให้มี horizontal reference line + text above |
| สีไม่แยก bore type ชัดเจน | ใช้ color coding ตาม bore type (face/edge/through) |
| ไม่มี legend table | Software มืออาชีพทุกตัวมี legend สำหรับ full details |

---

## 5. แนวทางปรับปรุง MONOLITH (Actionable Recommendations)

### Option A: "woodWOP Style" — Minimal + Legend

```
On bore:     ○ (circle symbol only)
Near bore:   Short ID label → "H1", "H2", "D1"
Sidebar:     Legend table mapping ID → full details

Example on drawing:
  H1 ─── ○ Ø15×13.5
  H2 ─── ○ Ø8×24
  D1 ─── ○ Ø8×30

Legend:
  H1  Minifix® 15 with rim (262.24.503)    Face bore Ø15×13.5
  H2  S200 Connecting bolt                  Edge bore Ø8×24
  D1  Wood Dowel 8×30 (Fluted)             Through bore Ø8×30
```

**ข้อดี**: สะอาดที่สุด, ไม่มี clutter, มือโปรใช้กัน
**ข้อเสีย**: ต้องสร้าง legend UI ใน sidebar

### Option B: "Compact ISO" — Short Label + Dog-leg Leader

```
On drawing (with dog-leg leader lines):

    Ø15×13.5 Minifix ──────┐
                            │  (vertical stacking)
    Ø8×24 S200 ─────────┐  │
                         │  │
    Ø8×30 Dowel ──────┐  │  │
                      ↓  ↓  ↓
                      ●  ●  ●  (bore positions)
```

**ข้อดี**: เห็นข้อมูลหลักทันทีโดยไม่ต้องดู legend
**ข้อเสีย**: ยังต้อง manage spacing / collision

### Option C: "Hybrid" — Compact Label + Toggle Detail Level

- **Default view**: แสดงแค่ Ø × depth (e.g., "Ø15×13.5")
- **Hover/click**: แสดง full name + catalog no.
- **X-Ray mode detail toggle**: สลับระหว่าง minimal/compact/full

**ข้อดี**: flexible, user เลือก level of detail ได้
**ข้อเสีย**: ซับซ้อนกว่าในการ implement

---

## 6. สรุป

**สิ่งที่มืออาชีพระดับโลกมีร่วมกัน:**

1. **Label สั้นกระชับ** — ใช้ Ø × depth + short name, ไม่ใช่ full product name
2. **Leader lines ขนานกัน** — มุมเดียวกัน, ไม่ตัดกัน, มี dog-leg + reference line
3. **Stacked alignment** — labels เรียงในแนวตั้ง align ชิดซ้าย, spacing สม่ำเสมอ
4. **Color-coded by bore type** — Face=Blue, Edge=Green, Through=Red
5. **Legend/Table แยก** — full details อยู่ใน table ด้านข้าง ไม่ใช่บน drawing
6. **Collision-free** — มี algorithm จัด labels ไม่ให้ซ้อนกัน

---

*Research date: 7 March 2026*
*Sources: ISO 128-22:1999, HOMAG woodWOP documentation, Blum DYNALOG/BXF, imos iX CAD/CAM, PYTHA 3D CAD, Häfele CAD/CAM data catalog*
