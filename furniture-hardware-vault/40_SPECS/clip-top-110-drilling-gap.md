---
note_type: fitting_spec
vendor: blum
system: hinge
truth_layer: draft
review_status: review_ready
source_refs: ["Blum-2024:p.65"]
specs:
  hinge: CLIP top 110°
  cup_diameter_mm: 35
  TB_range_mm: "3-7"        # drilling distance (ระยะเจาะถ้วยจากขอบ)
  MD_options_mm: [0, 3, 6, 9]
related_monolith:
  - "src/core/manufacturing/drillMap/"
  - "src/core/designer/policy.ts"
tags: [spec, blum, clip-top, drilling, overlay, gap]
last_verified_at: null
is_stale: false
---

# Spec: CLIP top 110° — Drilling Distance (TB), Overlay (FA), Min Gap (F)

> สถานะ **review_ready** — ตารางจากแคตตาล็อกจริง (หน้า 65) พร้อมยืนยันเป็น verified
> นี่คือข้อมูลที่ map ตรงกับ **drillMap** ของ MONOLITH

## ความสัมพันธ์ TB / MD → Front Overlay (FA) — หน้าบานทับขอบ (overlay)
TB = drilling distance (ระยะเจาะถ้วยจากขอบหน้าบาน), MD = mounting plate spacing

| MD (mm) | TB=3 | TB=4 | TB=5 | TB=6 | TB=7 |
|---|---|---|---|---|---|
| 0 | FA 14 | 15 | 16 | 17 | 18 |
| 3 | FA 11 | 12 | 13 | 14 | 15 |
| 6 | FA 8 | 9 | 10 | 11 | 12 |
| 9 | FA 5 | 6 | 7 | 8 | 9 |

> สรุปสูตร: **FA ≈ 18 − MD − (7 − TB)** → overlay เพิ่มเมื่อ TB เพิ่ม / ลดเมื่อ MD เพิ่ม

## ช่องไฟขั้นต่ำ (Min Gap F) — ขอบหน้าบานรัศมี R=1mm, อ้างอิง MD=0
หน่วย mm ตามระยะเจาะ TB = 3 / 4 / 5 / 6 / 7

| FD (ความหนาหน้าบาน) | TB3 | TB4 | TB5 | TB6 | TB7 |
|---|---|---|---|---|---|
| 16 | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 |
| 18 | 0.8 | 0.8 | 0.8 | 0.8 | 0.8 |
| 19 | 1.0 | 1.0 | 0.9 | 0.9 | 0.9 |
| 20 | 1.2 | 1.2 | 1.2 | 1.2 | 1.1 |
| 22 | 1.5 | 1.4 | 1.4 | 1.3 | 1.3 |
| 24 | 2.2 | 2.0 | 2.0 | 1.9 | 1.9 |
| 26 | 3.5 | 3.1 | 2.9 | 2.7 | 2.6 |
| 28–30 | แนะนำให้ทดลองติดตั้งจริง (trial recommended) | | | | |

## เชื่อมกับ MONOLITH
- TB (ระยะเจาะถ้วยจากขอบ) + cup Ø35 → พารามิเตอร์เจาะถ้วยบานพับใน `drillMap`
- FA (front overlay) → ใช้คำนวณตำแหน่งหน้าบานสัมพันธ์กับตัวตู้ (overlay logic)
- F (min gap) → ใช้ตรวจ clearance ระหว่างหน้าบานที่ติดกัน (กันชนกันเมื่อเปิด)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] (หน้า 65) · [[blum-clip-top-family]]
- Validation: [[CK-blum-hinge-specs]]
