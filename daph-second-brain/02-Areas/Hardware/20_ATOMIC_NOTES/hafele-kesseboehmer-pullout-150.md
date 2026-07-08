---
note_type: product
vendor: kesseboehmer
system: kitchen_pullout
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.855 (MB 7.21)"]
sku: ["549.24.260", "549.24.960", "549.24.360", "549.24.460", "545.61.250", "545.61.350", "545.61.450", "549.24.233", "549.24.933", "549.24.333", "549.24.633"]
specs:
  load_bearing_capacity_kg: 12
  cabinet_width_mm: 150
  min_cabinet_width_internal_mm: 112
  min_cabinet_depth_internal_mm: 481
  first_drill_hole_setback_dim_a_mm: 38
  mounting_side: "right"
conflicts: []
needs_verify:
  - first_drill_hole_setback_dim_a_mm
  - runner_vertical_spacing_system32_mm
  - door_bracket_drill_diameter_mm
related_monolith: []
tags: [kesseboehmer, pullout, narrow-cabinet, base-cabinet, kitchen-hardware, drillmap]
last_verified_at: null
is_stale: false
---

# Kesseböhmer No. 15 Pullout (ชุดตะแกรงดึงตู้แคบ No. 15)

ชุดอุปกรณ์ตะแกรงดึงหน้าแคบสำหรับขนาดตู้กว้าง 150 mm รุ่น **No. 15** ผลิตโดย **Kesseböhmer** และจัดจำหน่ายผ่าน **Häfele** มีระบบรางดึงเปิดแบบเต็มบานพร้อมระบบปิดนุ่มนวลและปิดอัตโนมัติในตัว (Self closing and soft closing) โดยยึดเข้ากับแผงข้างด้านขวาของตัวตู้เท่านั้น

---

## 1. Technical Specifications (ข้อมูลทางเทคนิค)

- **ขนาดหน้าตู้ภายนอก (Cabinet Width)**: **150 mm**
- **น้ำหนักบรรทุกสูงสุด (Load Bearing Capacity)**: **12 kg** (รวมน้ำหนักหน้าบานเฟรมและอุปกรณ์ภายใน)
- **การติดตั้ง (Mounting)**: ยึดติดกับแผงตู้ด้านขวาเท่านั้น (Right mounted)
- **มิติตู้ภายในตู้ต่ำสุดที่ต้องการ (Cabinet Internal Dimensions)**:
  - หน้ากว้างภายในตู้ใช้งาน (Internal Width): **$\ge 112$ mm**
  - ความลึกภายในตู้ใช้งาน (Internal Depth): **$\ge 481$ mm** (สำหรับตู้มุมตรง 90 องศา)
  - ความสูงภายในตู้สำหรับรุ่นตะแกรง 2 ชั้น (Internal Height - 2 Tiers): **$\ge 542$ mm**
  - ความสูงภายในตู้สำหรับรุ่นราวแขวนผ้าเช็ดมือ (Internal Height - Towel Rail): **$\ge 592$ mm**
- **การปรับหน้าบานประตู (3D Front Adjustment)**: สามารถปรับแต่งหน้าบานประตูได้ 3 ทิศทางโดยไม่ต้องใช้เครื่องมือช่วย (Tool-free)
- **ฟังก์ชัน Push-to-Open**: สามารถรองรับการกดเด้งได้โดยสั่งพาร์ตกลไก Push catch type 2 (รหัสสีเหลือง) เพิ่มเติมสำหรับการใช้งานแบบไม่มีมือจับ (Handless)

---

## 2. drillMap & CAD Specifications (ข้อมูลระยะเจาะยึดแผงข้างตู้)
*รายละเอียดพิกัดทางกลที่มีผลโดยตรงต่อการเขียนแบบและเจาะผลิต (drillMap critical):*

- **ระยะเจาะรูแรกเยื้องขอบหน้าตู้ (Dim. A Setback)**:
  - สำหรับ Kesseböhmer No. 15 กำหนดระยะห่างรูเจาะแรกของรางเทียบกับขอบหน้าตู้ด้านใน (Dim. A) ดังนี้:
    $$\text{Dim. A} = 38.0\text{ mm}$$
  
  > [!WARNING]
  > **ข้อควรระวังในการทำโมเดล CAD (Preventing Manufacturing Errors)**:
  > ในแคตตาล็อก Häfele หน้าถัดไป (p.856) จะเป็นรุ่นตู้แคบดึงข้าง 150 mm ที่เป็นแบรนด์ของ Häfele เอง ซึ่งมีระยะรูแรก **Dim. A = 13.0 mm** (ไม่ใช่ 38.0 mm)
  > ในการทำโปรแกรม CNC เจาะบอร์ดข้าง (drillMap) หรือเขียนแบบชิ้นส่วน ต้องแยกประเภทของพาร์ตสินค้าให้ชัดเจนว่าเป็นแบรนด์ Kesseböhmer (38.0 mm) หรือ Häfele (13.0 mm) เพื่อหลีกเลี่ยงไม่ให้การเจาะยึดหน้าบานมีช่องว่างด้านหน้าตู้คลาดเคลื่อนจากสเปกจริง

- **ระยะห่างรูเจาะแนวตั้งในระบบ System 32**:
  - `runner_vertical_spacing_system32_mm`: **needs_verify** (ระยะความสูงระหว่างรูเจาะยึดรางตัวล่างและตัวบน)
- **รูเจาะยึดโครงบานหน้าประตู (Door Bracket Fixing)**:
  - `door_bracket_drill_diameter_mm`: **needs_verify** (กำหนดพิกัดเจาะยึดพาร์ตเหล็กกับบานประตูตู้)

---

## 3. Product Range & SKU Mappings

### 3.1 Base Unit Pull Outs (ชุดตะแกรงพร้อมเฟรมรางดึง 2 ชั้น)
มาพร้อมที่คั่นตะแกรงโค้งกันขวดล้ม (Curved separator):

- ** Classic (ราวกลมชุบโครเมียม/ขาว)**: พาร์ต `549.24.260` | อลูมิเนียม RAL 9006 `549.24.960`
- ** Style (ราวแบนชุบโครเมียม/ขาว)**: พาร์ต `549.24.360`
- ** Style (ราวแบนสีเทาแอนทราไซต์)**: พาร์ต `549.24.460`

### 3.2 Towel Rail Pull Outs (ชุดอุปกรณ์ดึงสำหรับราวแขวนผ้าเช็ดมือ)
- ** Classic (ราวกลมชุบโครเมียม/ขาว)**: พาร์ต `549.24.233` | อลูมิเนียม RAL 9006 `549.24.933`
- ** Style (ราวแบนชุบโครเมียม/ขาว)**: พาร์ต `549.24.333`
- ** Style (ราวแบนสีเทาแอนทราไซต์)**: พาร์ต `549.24.633`

### 3.3 Accessories (อุปกรณ์ประกอบ)
- **ที่คั่นตะแกรงโค้งกันขวดล้มแบบสั่งแยก (Curved separator)**:
  - รุ่น Classic (โครเมียม): `545.61.250`
  - รุ่น Style (โครเมียม): `545.61.350`
  - รุ่น Style (แอนทราไซต์): `545.61.450`

---

## 4. Related Code Integration
- `related_monolith`: *ไม่มี (ฟีเจอร์สำหรับอนาคต)*
- **รางเลื่อนสำหรับการประกอบ**: ระบบ No. 15 Pullout ใช้ชุดรางข้างเฉพาะของ Kesseböhmer (Proprietary right-side runners) โดยเฟรมตะแกรงจะเข้าล็อกกับรางเลื่อนโดยตรง จึงห้ามเชื่อมโยงกับราง Blum Tandem หรือรางลิ้นชักชนิดอื่นในซอร์สโค้ด
