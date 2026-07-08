---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku: []
source_refs:
  - "hardware-drilling-specifications.md:L451"
  - "BIun 198-411 Box systems.pdf:p.196 (overview)"
specs:
  type: drawer box system (premium)
  load_rating_kg: 40
  length_min_mm: 270
  length_max_mm: 650
  side_clearance_min_mm: 10
  side_clearance_max_mm: 15
  servo_drive_compatible: true
  side_thickness_mm: 12.8          # ความหนาผนัง drawer side (จาก catalog overview) — ไม่ใช่ความสูง
  motion_technologies: [BLUMOTION, SERVO-DRIVE, TIP-ON BLUMOTION, TIP-ON]
  variants: [pure, free]
needs_verify:
  - side_thickness_mm              # ยืนยันเลขหน้า catalog (overview อ้าง p.196 แต่ box section เริ่ม p.198)
related_monolith: ["src/core/manufacturing/drillMap/", "src/core/fitting/FittingCatalogue.ts"]
tags: [blum, legrabox, drawer-box]
last_verified_at: null
is_stale: false
---

# Blum LEGRABOX — Drawer Box System

> review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียม ด้านข้างบางตั้งฉาก รับน้ำหนัก 40kg
> (โน้ตแรกของหมวด **Drawer Box Systems**)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ (ไม่ใช่ลิ้นชักไม้ประกอบเอง) ด้านข้างโลหะบาง รองรับ SERVO-DRIVE (เปิดด้วยไฟฟ้า/กดเปิด)

## สเปก
| พารามิเตอร์ | ค่า |
|---|---|
| Load capacity | 40 kg |
| Available length (NL) | 270–650 mm |
| Side clearance | 10–15 mm |
| SERVO-DRIVE | รองรับ |

## เชื่อมกับ MONOLITH
- LEGRABOX = ระบบสำเร็จ → MONOLITH คำนวณเฉพาะ **แผ่นพื้น (bottom) + แผ่นหลัง (back)** ที่ตัดเอง
  ส่วนข้าง/หน้าเป็นชิ้นส่วนสำเร็จของ Blum (ต่างจากลิ้นชักไม้ที่ตัดครบทุกแผ่น)

## คุณสมบัติจาก catalog overview (เพิ่มจาก Box ingest)
- Drawer side หนา **12.8 mm** (ผนัง side ไม่ใช่ความสูง) · ดีไซน์เส้นตรงทั้งในและนอก · รองรับ branding บน side
- แนวคิด **2-shell drawer side design**
- รองรับ motion technology หลายแบบบน cabinet profile เดียวกัน: **BLUMOTION · SERVO-DRIVE · TIP-ON BLUMOTION · TIP-ON**
- มี 2 variant: **pure** / **free** (รายละเอียดความสูง N/M/K/C/F อยู่ในโน้ตย่อยแต่ละ height class)

## อ้างอิง
- Source: [[hardware-drilling-specifications]] (L451) · [[blum-catalogue-2024-2025]] (Box overview)
- MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
- ⚠️ ยืนยันกับแคตตาล็อก Blum (Box หน้า 198–411) ก่อน verified
