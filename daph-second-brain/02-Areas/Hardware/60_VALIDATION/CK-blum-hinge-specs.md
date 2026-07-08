---
note_type: validation_checklist
target_note: ["blum-hinge-110-standard", "blum-hinge-110-special", "blum-hinge-107", "blum-clip-100", "blum-clip-top-family", "blum-clip-top-mounting-plate", "blum-cristallo-glass-hinges", "blum-expando-thin-door-hinge", "blum-blumotion-addon", "blum-tip-on-hinge", "blum-modul-hinge", "blum-hinge-accessories", "blum-aventos-hk-xs", "hinge-cup-35mm-system32", "clip-top-110-drilling-gap"]
review_roles: [hardware_engineer, production]
truth_layer: draft
review_status: unreviewed
tags: [validation, blum, hinge]
---

# Validation: Blum CLIP top Hinge Specs

รับรองสเปกบานพับ Blum ก่อนเลื่อนเป็น `verified` และก่อนนำค่าไปใส่โค้ด MONOLITH

## เกณฑ์รับรอง
- [ ] OCR หน้า 68–197 ของแคตตาล็อก Blum 2024-2025 แล้ว
- [ ] cup Ø35mm ตรงกับแคตตาล็อก (ยืนยันหน้า)
- [ ] ความลึกเจาะถ้วย (drill_depth_mm) มีค่าจริง + source หน้า
- [ ] ระยะถ้วยจากขอบ (C-distance) + ตาราง overlay มีค่าจริง
- [ ] SKU ตรงกับแคตตาล็อก
- [ ] ภาระรับ (load_rating_kg) มีค่าจริง
- [ ] **first-hole ของ System 32 ตรงกับค่า 37mm ใน MONOLITH** (`policy.ts`) — ยืนยัน/หรือแจ้งต่าง
- [ ] มนุษย์ (hardware engineer) ยืนยันครบ → set `truth_layer: verified`, `review_status: verified`

## ผลตรวจ
<!-- บันทึกค่าที่พบจาก OCR + ความไม่ตรงกับโค้ด MONOLITH (ถ้ามี) -->
