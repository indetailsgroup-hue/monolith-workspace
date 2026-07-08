---
note_type: product
vendor: blum
system: hinge
truth_layer: draft
review_status: review_ready
sku: []                       # VERIFY: part numbers จากตารางแคตตาล็อก
source_refs: ["Blum-2024:p.76-149"]
specs:
  boring_pattern: drill-in cup
  cup_diameter_mm: 35
  drill_depth_mm: null        # VERIFY จากตาราง
  cup_mounting: [INSERTA, screw-on, knock-in]
  adjustment_axes: 3
  clip_on: true
  soft_close: BLUMOTION (in-arm) หรือ unsprung/spring
related_monolith: ["src/core/fitting/FittingCatalogue.ts", "src/core/manufacturing/drillMap/"]
tags: [blum, hinge, clip-top, blumotion]
last_verified_at: null
is_stale: false
---

# Blum CLIP top BLUMOTION / CLIP top (family)

> สถานะ **draft / review_ready** — taxonomy + ค่าหลักจากสรุปแคตตาล็อก (หน้า 76–149)
> ยังต้องเติม **part numbers + ระยะเจาะ C/overlay** จากตารางจริงก่อนเลื่อนเป็น verified

## สรุป
บานพับซ่อนพรีเมียมของ Blum ปรับได้ 3 ทิศทาง ติดตั้งแบบคลิปออน (ไม่ใช้เครื่องมือ)
มีทั้งแบบมีระบบปิดนุ่ม **BLUMOTION ในตัว** และแบบสปริงปกติ (CLIP top)
ยึดถ้วยได้ 3 แบบ: **INSERTA** (กดล็อก) / **Screw-on** (สกรูเกลียวปล่อย) / **Knock-in** (ตอก)

## ตารางองศา/การใช้งาน
| การใช้งาน | องศา | หมายเหตุ | โน้ตแยก |
|---|---|---|---|
| มาตรฐาน | **110°** | ใช้บ่อยสุด (มี/ไม่มี BLUMOTION) | |
| overlay ใหญ่ | 110° special | สำหรับแผงข้างหนา | |
| หน้าบานหนา ≥15mm | **107°** | | |
| มาตรฐาน | CLIP **100°** | | |
| มุมกว้าง | **155°** | 0-protrusion, เหมาะตู้มีลิ้นชักซ่อนใน, ใช้กับบาน mitred | |
| มุมกว้างสุด | **170°** | | |
| โปรไฟล์/หนา | **95°** profile/thick | หน้าบานเซาะร่อง | |
| มุมกว้าง 0-protrusion | **125°** | | |
| ตู้เข้ามุม inset | 95° / 83° | blind corner | |
| ตู้เข้ามุม overlay | 95° | blind corner | |
| กรอบอะลูมิเนียม | **95°** (แคบ/มาตรฐาน) | → งานอลูมิเนียม Daph | |
| หน้าบานบาง 8–14mm | 110° (EXPANDO T) | ไม่เจาะทะลุ | [[blum-expando-thin-door-hinge]] |
| กระจก | CRISTALLO 110° / glass 94° | | [[blum-cristallo-glass-hinges]] |
| กรอบเล็ก | mini 94° | | |
| บานเฟี้ยม | 60° bi-fold | หน้าบาน 15–19mm | |
| เปิดเข้าใน | 110° / COMPACT 107° | | |
| มุมเอียง | +45°…−45° | ใช้ angled spacer ±5° (ดู mounting plate) | |

## Drilling
- ถ้วย: Ø35mm (ดู [[hinge-cup-35mm-system32]])
- **ตารางระยะเจาะ TB / overlay FA / ช่องไฟ F ของ 110° → [[clip-top-110-drilling-gap]]** (ข้อมูลจริงหน้า 65)
- ระยะถ้วยจากขอบ (C) สำหรับองศาอื่น: VERIFY จากตารางในแคตตาล็อก

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] (หน้า 76–149) · MOC: [[blum-hinge-systems-moc]]
- Validation: [[CK-blum-hinge-specs]]
- ใช้คู่กับ [[blum-clip-top-mounting-plate]] · soft-close add-on: [[blum-blumotion-addon]]
