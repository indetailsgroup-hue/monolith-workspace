---
note_type: fitting_spec
vendor: [salice, generic]
system: hinge
truth_layer: draft
review_status: review_ready
source_refs: ["Salice-Hafele:hinge-protocol", "Salice:Selection3.pdf p.9.9-9.45"]
specs:
  formula: "Overlay = (Constant + K) - H"
  crank_constant: { full_overlay: 15, half_dual_1_2: 10, half_overlay: 6, inset: -2 }
  tab_K_typical_mm: "3-6"
related_monolith: ["src/core/manufacturing/drillMap/", "src/core/designer/policy.ts"]
tags: [spec, hinge, overlay, formula, crank]
last_verified_at: null
is_stale: false
---

# Spec: Hinge Overlay Calculation (Crank Constant)

> review_ready — สูตรเรขาคณิตทั่วไปของบานพับซ่อน (สอดคล้องกับตาราง FA ของ Blum)
> ใช้ใน drillMap เพื่อคำนวณตำแหน่งหน้าบานจากระยะเจาะ

## สูตร
```
Overlay (D) = (Constant + K) − H
Inset:       H = (−2 + K) + A
```
- **K (Tab)** = ระยะเจาะถ้วยจากขอบหน้าบาน (= TB ของ Blum), ทั่วไป 3–6mm
- **H** = ความสูง/ความหนาเพลทรอง (= MD ของ Blum)
- **A** = ช่องไฟขั้นต่ำ (min gap) เพื่อไม่ให้หน้าบานชนขอบ

## ค่า Constant (C) ตามชนิดแขน (Crank)
| Overlay | Crank | Constant C | สูตร D |
|---|---|---|---|
| Full overlay | A | 15 | (15+K)−H |
| 1/2" overlay | D | 10 | (10+K)−H |
| Half overlay | G | 6 | (6+K)−H |
| Inset | P | −2 | H=(−2+K)+A |

> เทียบ Blum: full-overlay MD0 ให้ FA 14–18 ที่ TB 3–7 → ตรงกับ (15+K)−0 (K=TB−... ใกล้เคียง)
> เป็นสูตรเดียวกันเชิงหลักการ ใช้ generalize ใน drillMap ได้

## ตัวอย่าง min gap (A) — 200 Series 110° (ตารางจริง, หน้า 9.37)
หน่วย mm ตามความหนาบาน T × ระยะเจาะ K
| K \ T | 16 | 19 | 22 | 26 |
|---|---|---|---|---|
| K=3 | 0.5 | 1.2 | 2.43 | 7.8 |
| K=6 | 0.5 | 1.2 | 2.12 | 4.4 |

→ บานหนาขึ้น (T↑) ต้องการช่องไฟมากขึ้น; เพิ่ม K ช่วยลด A ที่บานหนา (เช่น T26: K3→7.8 vs K6→4.4)

## เงื่อนไขมุมเปิด (Salice)
- **94°** — บานหนา (thick door สูงสุด ~35mm, K ได้ถึง 9mm) ลดมุมเลี่ยงชนผนัง
- **105°** — บานบางพิเศษ 10mm (cup depth 8mm)
- **155° / 165°** — Zero Protrusion (เหมาะตู้มีลิ้นชักภายใน)

## ⚠️ Cross-brand warning
ห้ามถือว่า Crank A ของ Blum กับ Salice มีค่า Constant เท่ากัน — สลับแบรนด์ต้องปรับ K หรือ H
มิฉะนั้น overlay คลาดเคลื่อนทันที (ดู cross-brand ใน [[salice-hafele-systems-moc]])

## ⚠️ หมายเหตุ governance
- สูตรนี้เป็นหลักการทั่วไป (อาจมาจากความรู้โดเมนของ AI ร่วมกับเอกสาร) — **ยืนยันค่า Constant
  กับแคตตาล็อก Salice จริงก่อน verified**
- การอ้างมาตรฐาน ANSI/BHMA A156.9 = บริบท ไม่ใช่ค่าที่ต้องใส่ drillMap

## อ้างอิง
- Source: [[salice-hafele-catalog]] · เทียบ [[clip-top-110-drilling-gap]] (Blum) · [[salice-concealed-hinge]]


## Zero Protrusion — constraint (155°/165°)
ฟังก์ชัน Zero Protrusion (บานไม่ยื่นเข้าตู้ → ลิ้นชักภายในดึงออกได้) ทำงานสมบูรณ์ **เฉพาะ**:
- บานพับ 155° หรือ 165°
- ติดตั้งแบบ **Full Overlay**
- ใช้เพลทสูง **0 หรือ 2mm เท่านั้น** (เพลท ≥3mm → ฟังก์ชันเสีย)

## มุมเปิด ↔ Gap (A) ที่ต้องการ
ยิ่งมุมเปิดกว้าง ยิ่งต้องการ gap มากขึ้น (ที่ K=3, T=24mm):
| มุมเปิด | Gap A ที่ต้องการ |
|---|---|
| 110° | 3.7mm |
| 120° | 8.19mm |
→ บานหนาในตู้ที่ gap น้อย ควรเลี่ยงบานพับมุมกว้าง (กันบานเบียดกัน)

## Angle reduction
- Angle reduction clip: ลดมุม **94° → 86°** (กันบานชนผนัง/เครื่องใช้ไฟฟ้า)
