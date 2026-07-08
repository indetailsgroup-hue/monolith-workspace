---
note_type: validation_checklist
target_note: ["blum-servo-drive-uno-waste-bin", "blum-distance-bumper", "blum-legrabox-pure-n", "blum-legrabox-pure-m", "blum-legrabox-pure-k", "blum-legrabox-pure-c", "blum-legrabox-pure-f", "blum-legrabox-free-c", "blum-merivobox-n", "blum-merivobox-m", "blum-merivobox-k", "blum-merivobox-e", "blum-tandembox-antaro-n", "blum-tandembox-antaro-m", "blum-tandembox-antaro-k", "blum-tandembox-antaro-c", "blum-tandembox-antaro-d", "blum-box-cabinet-profile-750", "blum-box-cabinet-profile-753", "blum-box-accessories"]
review_roles: [hardware_engineer, production]
truth_layer: draft
review_status: unreviewed
tags: [validation, blum, drawer_box]
---

# Validation: Blum Box Systems Specs

## เกณฑ์รับรอง
- [ ] backHeight / side height ของแต่ละ height class ตรง catalog + ระบุหน้า
- [ ] ระยะเจาะฐาน (X/Y/Z) + ค่า A (drive unit) ของ SERVO-DRIVE uno cross-check กับ MONOLITH ก่อนใช้ผลิต
- [ ] รหัสสินค้า (SKU) ครบ — distance bumper, fixing brackets ฯลฯ
- [ ] NL, side clearance, load rating ยืนยันต่อรุ่น
- [ ] มนุษย์ (hardware engineer) ยืนยัน → set verified

## 🔴 CONFLICT ค้างตรวจ — LEGRABOX backHeight (catalog vs MONOLITH)
> ห้ามแก้/ลบโค้ดจนกว่าจะยืนยันนิยาม + ตัดสินโดยวิศวกร
- [ ] เทียบค่า backHeight (mm): **N** cat=39/mono=63 · **M** cat=63/mono=84 · **K** cat=101/mono=116 · **C** cat=148/mono=167 · **F** cat=212/mono=218
- [ ] M/K/C ของ MONOLITH (84/116/167) = TANDEMBOX antaro เป๊ะ → น่าจะ copy-paste ผิดเฉพาะ 3 ตัวนี้
- [ ] **N กับ F อธิบายไม่ได้ด้วยทฤษฎี copy-paste** (mono N=63≠TAN 69; F=218≠TAN D199) → ตรวจแยก
- [ ] ยืนยันว่า catalog เป็น "wood/chipboard back cut height" จริง (p.207 MB203) ก่อนสรุป
- [ ] side height ตรงกันทั้งสองฝั่ง (66.5/90.5/128.5/177/241) → confidence อ่านสินค้าถูกตัว

## ✅ CONFLICT — LEGRABOX 70kg runner (753) NL range (RESOLVED 2026-06)
- [x] **MONOLITH `BLUM_LEGRABOX_RUNNERS`:** Commented out entries `LGB_70_270` to `LGB_70_400` in both database and guide files.
- [x] **Blum Catalog & eShop Proof:** Ran a complete PDF scan over the 758-page catalog and web search. Verified that the 70kg runner (753) is only manufactured in nominal lengths **450–650 mm** (part numbers `753.4501S` to `753.6501S`). Shorter nominal lengths (270-400mm) do not exist for the 70kg class.
- [x] Updated atomic note `blum-box-cabinet-profile-753` conflict status to `resolved`.

## ผลตรวจ
- 2026-06: verify MONOLITH `master-hardware-database.md` แล้ว — backHeight L156-160 (N63/M84/K116/C167/F218), 70kg runners L138-145 (270→600) ตรงตามที่ Agent อ้าง
- ทั้งสอง conflict สถานะ `unresolved` ในโน้ต atomic — **ยังไม่แตะโค้ด MONOLITH**

