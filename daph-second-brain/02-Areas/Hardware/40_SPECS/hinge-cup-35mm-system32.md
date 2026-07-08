---
note_type: fitting_spec
vendor: blum
system: hinge
truth_layer: draft
review_status: review_ready
source_refs: ["Blum-2024:p.64-193"]
specs:
  hinge_cup_diameter_mm: 35
  system32_pitch_mm: 32
  system32_first_hole_mm: null    # VERIFY — เทียบกับ MONOLITH (37mm)
related_monolith:
  - "src/core/designer/policy.ts"          # SYSTEM_32
  - "src/core/manufacturing/drillMap/"
tags: [spec, system32, hinge-cup, drilling]
last_verified_at: null
is_stale: false
---

# Spec: Hinge Cup Ø35 + System 32 boring

สเปกเชิงตัวเลขกลางที่ใช้ร่วมหลายผลิตภัณฑ์ และ map ตรงกับค่าคงที่ใน MONOLITH

## ค่าหลัก
| พารามิเตอร์ | ค่า | source | สถานะ |
|---|---|---|---|
| ถ้วยบานพับ (cup) | Ø **35 mm** | Blum-2024 (มาตรฐานยุโรป) | ยืนยันเชิงอุตสาหกรรม |
| System 32 pitch | **32 mm** | Blum-2024 | ยืนยัน |
| ระยะรูแรก (first hole) | _VERIFY_ | ตารางแคตตาล็อก | **ต้องตรวจ** |

## ⚠️ ประเด็นเชื่อม MONOLITH (สำคัญ)
MONOLITH ใช้ `SYSTEM_32.firstHoleZ = 37 mm` (`src/core/designer/policy.ts`)
และเพิ่งมีเหตุการณ์ค่าถูกสลับ 37↔50 โดยไม่มีหลักฐาน

**ภารกิจ:** OCR หน้าตาราง System 32 ของ Blum → ยืนยันว่า first-hole = 37mm จริง
แล้ว set `system32_first_hole_mm` + `truth_layer: verified` → ใช้โน้ตนี้เป็นหลักฐานอ้างอิงค่าในโค้ด

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-hinge-systems-moc]]
- Validation: [[CK-blum-hinge-specs]]
