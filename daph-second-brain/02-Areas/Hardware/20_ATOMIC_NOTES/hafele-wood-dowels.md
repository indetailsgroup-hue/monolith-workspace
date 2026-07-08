---
note_type: product
vendor: hafele
system: connector
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.93 (MB 4.71)"]
sku: ["267.82.230", "267.82.235", "267.82.240", "267.82.340", "267.82.026", "267.82.130", "267.82.125", "267.82.140", "267.82.227", "267.82.248", "267.82.250", "267.82.350", "267.82.360", "267.82.450", "267.82.460", "267.82.612"]
# หมายเหตุ: label→SKU (Ø×L) แบบละเอียดอยู่ในตาราง body
specs:
  material: "Beech wood"
  surface_type: "Fluted (ร่องลอนตามยาว)"
  standard_diameters_mm: [5, 6, 8, 10, 12, 16]
conflicts:
  - field: sku_fluted_dowel
    note_value: "267.82.xxx (เช่น 8x30 = 267.82.230)"
    note_value_evidence: "blaetterkatalog (1).pdf:p.93 (MB 4.71)"
    monolith_value: "267.83.xxx (เช่น 8x30 = 267.83.230)"
    monolith_ref: "master-hardware-database.md:L317 (HAFELE_WOOD_DOWELS)"
    status: unresolved   # รหัส 267.83 ไม่พบใน catalog 2021 — อาจเป็นรุ่น pre-glued/variant/อ่านพลาด ยืนยันก่อนสรุป
needs_verify: [sku_fluted_dowel]
related_monolith:
  - "specs/reference/master-hardware-database.md"
tags: [hafele, dowel, connector, cabinet-connector, wood-dowel, kd-fitting]
last_verified_at: null
is_stale: false
---

# Häfele — Wooden Dowels (เดือยไม้กลม)

เดือยไม้บีชกลมผิวร่องลอนตามยาว (Fluted Beech Wood Dowels) ผลิตขึ้นเพื่อการประกอบกล่องเฟอร์นิเจอร์ แผงข้าง และชั้นวางของ ทั้งสำหรับการหยอดกาวปกติและการเจาะอัดด้วยเครื่องป้อนเดือยอัตโนมัติ (Suitable for automatic feed)

---

## 1. Technical Specifications (รายละเอียดขนาดและมาตรฐานการเจาะ)
- **วัสดุไม้**: ไม้บีช (Beech wood) แห้งอบเตา ผิวร่องลอนช่วยกระจายกาวได้รอบแกนเมื่อบีบอัดแผงตู้
- **ขนาดการเจาะรูนำ**: เส้นผ่านศูนย์กลางรูเจาะเจาะตามขนาดเดือย (Ø5, Ø6, Ø8, Ø10 mm)
- **ความลึกรูเจาะแผงบอร์ด**: ความลึกแนะนำ = **(ความยาวเดือย / 2) + 1 mm**
  - เดือยขนาด **8x30 mm**: ความลึกรูเจาะด้านละ **16 mm**
  - เดือยขนาด **10x40 mm**: ความลึกรูเจาะด้านละ **21 mm**

---

## 2. Product Range & Part Numbers ( beech wood fluted )

| ขนาด (Ø x L) | จำนวนพาร์ตโดยประมาณ / kg | หมายเลขสินค้า (Catalog No.) |
|---|---|---|
| **5 x 25 mm** | ~3,200 ชิ้น | `267.82.026` |
| **6 x 25 mm** | ~2,150 ชิ้น | `267.82.125` |
| **6 x 30 mm** | ~1,800 ชิ้น | `267.82.130` |
| **6 x 40 mm** | ~1,325 ชิ้น | `267.82.140` |
| **8 x 27 mm** | ~1,140 ชิ้น | `267.82.227` |
| **8 x 30 mm** | ~1,000 ชิ้น | `267.82.230` |
| **8 x 35 mm** | ~865 ชิ้น | `267.82.235` |
| **8 x 40 mm** | ~760 ชิ้น | `267.82.240` |
| **8 x 45 mm** | ~670 ชิ้น | `267.82.248` |
| **8 x 50 mm** | ~600 ชิ้น | `267.82.250` |
| **10 x 40 mm** | ~450 ชิ้น | `267.82.340` |
| **10 x 50 mm** | ~360 ชิ้น | `267.82.350` |
| **10 x 60 mm** | ~325 ชิ้น | `267.82.360` |
| **12 x 50 mm** | ~260 ชิ้น | `267.82.450` |
| **12 x 60 mm** | ~220 ชิ้น | `267.82.460` |
| **16 x 120 mm**| ~65 ชิ้น | `267.82.612` |

---

## ⚠️ ประเด็นขัดแย้งกับ MONOLITH
- โค้ดใน `master-hardware-database.md` ระบุเดือยไม้กลม fluted 8x30 เป็นรหัสพาร์ต `267.83.230` 
- แต่ข้อมูลจริงใน Complete Catalog 2021 แถบระบุพาร์ตเดือยไม้ธรรมดา fluted ทั้งหมดเป็นซีรีส์ขึ้นต้นด้วย `267.82.xxx` (เช่น 8x30 คือ `267.82.230`)
- **หมายเหตุรอยืนยัน (Needs Verify):** ซีรีส์ `267.83.xxx` อาจหมายถึงเดือยไม้ชนิดพิเศษเคลือบกาวในตัว (Pre-glued) หรือรุ่นปรับสเปกปีอื่น ต้องตรวจสอบเอกสารทางการของ Häfele เพิ่มเติม
