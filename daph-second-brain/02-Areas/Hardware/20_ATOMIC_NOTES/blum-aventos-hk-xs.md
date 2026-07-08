---
note_type: product
vendor: blum
system: lift          # AVENTOS = ระบบบานยก (lift system) ไม่ใช่บานพับ
truth_layer: draft
review_status: review_ready
sku: ["956.1004"]    # TIP-ON ที่ใช้ร่วม (stay lift ≤600mm)
source_refs: ["Blum-2024:p.64"]
specs:
  type: stay lift (HK-XS)
  variants: [Standard, TIP-ON]
  drilling_H_formula: "H = 137 + MD + K + SOB"
  K_straight_mm: 0
  K_cranked_mm: 9.5
  K_double_cranked_mm: 18
  min_internal_height_LH_mm: 200
  min_internal_depth_LT_mm: 100
  Y_formula: "Y = (FH - X) * 0.3"
related_monolith: ["src/core/manufacturing/drillMap/", "src/core/fitting/FittingCatalogue.ts"]
tags: [blum, aventos, hk-xs, lift, stay-lift]
last_verified_at: null
is_stale: false
---

# Blum AVENTOS HK-XS — Stay Lift (Standard / TIP-ON)

> review_ready — ข้อมูลจากแคตตาล็อกจริง (หน้า 64)

## สรุป
ระบบ **บานยก (stay lift)** สำหรับหน้าบานตู้ลอย/ตู้บน เปิดยกขึ้น มี 2 แบบ: Standard และ **TIP-ON**
(กดเปิดสำหรับบานไร้มือจับ — ใช้ TIP-ON [[blum-tip-on-hinge|956.1004]] เมื่อหน้าบานยกสูง ≤ 600 mm)

## สูตรตำแหน่งเจาะ (Drilling position)
```
H = 137 + MD + K + SOB
```
- **MD** = mounting plate spacing (ระยะเพลท)
- **SOB** = top panel thickness (ความหนาแผงบน)
- **K** = cranking of hinge arm:
  | แขนบานพับ | K (mm) |
  |---|---|
  | Straight (ตรง) | 0 |
  | Cranked (โค้ง) | 9.5 |
  | Double cranked (โค้งคู่) | 18 |

## ความต้องการพื้นที่ (Space requirement)
- **LH** (internal cabinet height) ขั้นต่ำ **200 mm** (เมื่อใช้กับ visible wall hanging bracket)
- **LT** (internal cabinet depth) ขั้นต่ำ **100 mm**
- **Y = (FH − X) × 0.3** โดย FH = front height

## ตาราง X (ใช้กับ CLIP top BLUMOTION 110°)
| FD ความหนาหน้าบาน (mm) | 16 | 19 | 22 | 24 |
|---|---|---|---|---|
| ระยะ X (mm) | 45 | 34 | 23 | 15 |

## การประกอบหน้าบาน (Front assembly)
- หน้าบานไม้: สกรูเกลียวปล่อย **609.1×00** × 2
- กรอบอะลูมิเนียมกว้าง: สกรูหัวจม **660.0950** × 2
- กรอบอะลูมิเนียมแคบ (กว้าง 19mm): ทำ side front overlay (SFA) ได้ 11–18 mm

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] (หน้า 64) · MOC: [[blum-hinge-systems-moc]]
- สกรู/part no.: [[blum-hinge-accessories]]
