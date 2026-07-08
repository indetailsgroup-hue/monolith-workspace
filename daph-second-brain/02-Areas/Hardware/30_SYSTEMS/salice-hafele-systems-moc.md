---
note_type: system_moc
vendor: [salice, hafele]
system: hinge
truth_layer: draft
review_status: review_ready
tags: [moc, salice, hafele]
---

# 🔩 Salice / Häfele — Hinges & Door Systems (MOC)

Source: [[salice-hafele-catalog]]

## บานพับ Salice
- [[salice-concealed-hinge]] — concealed 110°/155°/165° (cup Ø35, **depth 11mm**, reverse-spring)
- [[salice-folding-invisible-hinge]] — folding / invisible (cup depth 9mm)

## เพลท / โช้ค / อุปกรณ์
- [[salice-mounting-plate-smove]] — cruciform/in-line/angled plates + SMOVE + accessories

## ระบบไร้มือจับ / บานยก (Häfele)
- [[hafele-push-latch]] — magnetic PUSH latch
- [[hafele-free-flap]] — lid/flap stay (lift)

## ระบบข้อต่อ เดือยไม้ และรับชั้น (Häfele Chapter 4)
- [[hafele-minifix-fasteners]] — Minifix 12/15 cams, S100/S200/S300/C100 bolts, spreading sleeves
- [[hafele-rafix-system]] — Rafix 20/30 cams, Rafix Tab 20, bolts, cover caps
- [[hafele-confirmat-screws]] — Confirmat one-piece screws (5mm/7mm), pressure plates, stepped drill bits
- [[hafele-wood-dowels]] — fluted beech dowels, plastic/pre-glued dowels
- [[hafele-shelf-supports]] — shelf supports for wooden and glass shelves (zinc alloy, steel pins, secured lugs)

## เทียบกับ Blum (จุดต่างที่กระทบการเจาะ)
| รายการ | Salice | Blum |
|---|---|---|
| Cup Ø | 35mm | 35mm |
| Cup depth | **8/11/12/15.5mm + Thick 40mm** (ตามซีรีส์) · folding 9mm | 13.5mm |
| Tab/TB (110°) | 3–8mm (Thick door ถึง 15) | 3–7mm |
| Plate height | 0,2,3,4,6,9,11,12,18,21mm | 0/3mm |
| ปรับตั้ง | Side −1.5/+4.5 · Height ±2 · Depth −0.5/+2.8mm | Side ±3 · Height ±2 · Depth +3−2 |

> สำคัญ: cup depth Salice ต่างกันตามซีรีส์ (8/11/12/15.5) — drillMap ต้องเลือกตามรุ่นที่สเปก
> สูตรคำนวณ overlay ทั่วไป: [[hinge-overlay-formula]]

## Cross-brand (substitution)
- Häfele 329.xx = **Direct Equivalent** ของ Salice model (ตารางใน [[salice-concealed-hinge]])
  → ใช้เป็น substitution_group: Salice ↔ Häfele สลับได้ (สเปกเดียวกัน)
- แต่ Salice ↔ **Blum** สลับไม่ได้ทันที: ค่า Constant/cup depth ต่างกัน ต้องคำนวณ overlay + เจาะใหม่

## งานที่เหลือ
- [ ] รับรอง [[CK-salice-hafele-specs]] → verified
- [ ] แปลงน้ำหนัก Free Flap lbs→kg เป็น spec note
