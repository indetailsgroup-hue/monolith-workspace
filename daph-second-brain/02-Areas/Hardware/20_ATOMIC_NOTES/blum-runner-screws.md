---
note_type: product
vendor: blum
system: accessory
truth_layer: draft
review_status: review_ready
sku:
  - "609.1500"
  - "661.1450.HG"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.428"
  - "BIun 412-535 Runner systems.pdf:p.452"
specs:
  system_family: null
  type: screw
  finishes: [nickel plated]
  materials: [steel]
needs_verify: []
conflicts: []
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, accessory, fasteners, screw]
last_verified_at: null
is_stale: false
---

# Blum Runner Fasteners & Screws

> draft/review_ready — สกรูเจาะยึดคลิปและยึดรางลิ้นชักซ่อนใต้เข้ากับแผงข้างตู้และกล่องลิ้นชักไม้

## สรุป
ประเภทและขนาดสกรูมาตรฐานที่แนะนำสำหรับติดตั้งระบบรางลิ้นชักซ่อนใต้ของ Blum (ทั้ง MOVENTO และ TANDEM) 
- **Chipboard Screws (สกรูเกลียวปล่อยไม้ทั่วไป):** รหัส `609.1500` (ขนาด Ø 3.5 x 15 mm) หัวเตเปอร์แฉก (Pozidriv) สำหรับยึดตัวล็อกหน้าบาน (Locking Device) และอุปกรณ์เสริมขนาดเล็กใต้ก้นกล่องไม้
- **System Screws (Euro Screws - สกรูระบบเจาะนำหัวเฉพาะ):** รหัส `661.1450.HG` (ขนาด Ø 6.0 x 14.5 mm) สำหรับยึดตัวรางซ่อนใต้ (cabinet profiles) เข้ากับแผงข้างตู้ไม้ที่เจาะนำพิกัดรู Ø 5 mm (System 32)

## ตารางรหัสและสเปก
| SKU | ประเภทสกรู | ขนาด (mm) | หัวสกรู | วัสดุ/ผิว | การใช้งานหลัก | Page Reference |
|---|---|---|---|---|---|---|
| 609.1500 | Chipboard screw | Ø 3.5 x 15 | Pozidriv flat head | Steel / Nickel plated | ยึดตัวล็อกบาน T51.7601 / T51.1700.04 | p.428, p.452 |
| 661.1450.HG | System screw (Euro) | Ø 6.0 x 14.5 | Pozidriv pan head | Steel / Nickel plated | ยึดรางหลักตระกูล 760H / 766H / 560H | p.428, p.460 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **เจาะนำสำหรับสกรูระบบ (`661.1450.HG`):** เจาะนำขนาดเส้นผ่านศูนย์กลาง **Ø 5.0 mm** (ความลึกขั้นต่ำ $11.5–12.5 \text{ mm}$ ตามมาตรฐาน System 32 จากขอบหน้าตู้ระยะรูแรก $37\text{ mm}$)
- **เจาะนำสำหรับสกรูเกลียวไม้ (`609.1500`):** เจาะนำขนาดเส้นผ่านศูนย์กลาง **Ø 2.5–3.0 mm** (ความลึกประมาณ $10\text{ mm}$ ใต้ก้นกล่องลิ้นชักเพื่อประคองไม้ไม่ให้แตกแยก)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
