# Kerf Bending Algorithms for CNC Manufacturing
# อัลกอริทึมและวิศวกรรมการผลิตสำหรับการดัดไม้ด้วยรอยตัด (Kerf Bending)

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** Advanced Manufacturing Technique
**Target:** In-house CNC CAM System (Stand-alone)

---

> **Cross-References:**
> - [Formula Reference](../reference/formula-reference.md) - Kerf width values (§2) - clarifies kerf width differences
> - [Cross-Reference Index](../reference/cross-reference-index.md) - Document navigation
> - [Cut Optimization Algorithms](./cut-optimization-algorithms.md) - Sheet nesting (include kerf waste)
> - [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md) - Curved component design

---

## บทคัดย่อผู้บริหาร (Executive Summary)

รายงานนี้เป็นคู่มืออ้างอิงทางวิศวกรรมสำหรับการพัฒนา **ระบบ Kerf Bending** ภายในองค์กร ครอบคลุม:

1. **สูตรคำนวณและกฎการออกแบบร่อง (Kerf Rules)** สำหรับไม้แผ่น 6-18mm
2. **อัลกอริทึม Flattening/Unroll** สำหรับแปลงพื้นผิว 3D เป็น 2D
3. **สถาปัตยกรรมซอฟต์แวร์** สำหรับระบบ CAD/CAM ภายใน
4. **กลยุทธ์สร้าง G-code** ที่เหมาะสมสำหรับเครื่อง CNC
5. **ขั้นตอน Calibration และ QA** สำหรับการผลิตจริง

### Kerf Bending คืออะไร?

**Kerf Bending** คือเทคนิคการดัดไม้แผ่นโดยการสร้างร่อง (slots) หลายร่องด้าน **concave** (ด้านใน) ให้เหลือชั้นเนื้อบาง ๆ (web) ที่ทำหน้าที่เป็น living hinge เมื่อดัดจริง ช่องว่างของร่องจะปิด (gap closure) และผิวด้านนอกยืดเล็กน้อยเพื่อรักษาความยาวโค้ง

**ข้อดี:**
- ✅ ดัดไม้แผ่นเป็นรูปโค้งได้โดยไม่ต้องใช้ไอน้ำหรือความร้อน
- ✅ รัศมีโค้งควบคุมได้แม่นยำ (ถ้าคำนวณถูกต้อง)
- ✅ ผลิตด้วย CNC Router อัตโนมัติ

**ข้อจำกัด:**
- ❌ เหมาะสำหรับ developable surfaces เท่านั้น (cylinder, cone)
- ❌ ด้านใน (concave) จะมีร่องเห็น ไม่เรียบเหมือนไม้ดัดด้วยไอน้ำ
- ❌ ต้องคำนวณและ calibrate แม่นยำ มิฉะนั้นจะแตกหรือโค้งไม่ตรงเป้า

---

## ส่วนที่ 1: หลักการทางวิศวกรรม (Engineering Principles)

### 1.1 ตัวแปรหลัก (Key Variables)

| สัญลักษณ์ | ชื่อภาษาไทย | ชื่อภาษาอังกฤษ | หน่วย | ค่าทั่วไป |
|-----------|-------------|-----------------|-------|-----------|
| $T$ | ความหนาแผ่นไม้ | Panel Thickness | mm | 6, 9, 12, 18 |
| $k$ | ความกว้างรอยตัด | Kerf Width | mm | 3.0-3.5 |
| $t_{web}$ | ความหนาชั้นเนื้อเหลือ | Web Thickness | mm | 1.2-2.5 |
| $p$ | ระยะห่างร่อง | Slot Spacing | mm | 6-25 |
| $L_{slot}$ | ความยาวร่อง | Slot Length | mm | W - 2×margin |
| $R$ | รัศมีโค้ง | Bend Radius | mm | 150-1000 |
| $\kappa$ | ความโค้ง (Curvature) | Curvature | 1/mm | 1/R |
| $\gamma$ | ปัจจัยชดเชย Spring-back | Spring-back Factor | - | 0.08-0.15 |

### 1.2 ปริมาณเนื้อที่ต้องถูกลบ (Arc Length Mismatch)

สำหรับโค้งมุม $\theta$ (องศา) ที่รัศมีนอก $R_{out}$:

**ความยาวผิวนอก:**
```
L_out = (θ/360) × 2πR_out
```

**ความยาวผิวใน:**
```
L_in = (θ/360) × 2π(R_out - T)
```

**ความต่างความยาว (ต้องลบออก):**
```
ΔL = L_out - L_in = (θ/360) × 2π × T
```

**จำนวนร่องที่ต้องการ:**
```
N ≈ ΔL / k_eff
```

โดยที่ $k_{eff}$ คือความกว้างรอยตัดที่มีผลจริง (อาจต่างจากเส้นผ่านศูนย์กลางดอกเล็กน้อยตาม runout, chip load)

---

## ส่วนที่ 2: สูตรคำนวณและกฎออกแบบร่อง (Kerf Design Rules)

### 2.1 มุมยอมได้ต่อร่อง (Allowable Angle per Slot)

```
θ_allow = C_mat × atan(k / t_web)
```

โดยที่:
- $C_{mat}$: ค่าคงที่วัสดุ (ไม้อัด = 1.1, MDF = 1.0)
- จำกัดสูงสุด ~ 0.35-0.5 rad (20-30°)

**เหตุผล:** ถ้ามุมมากเกินไป ชั้นเนื้อบาง (web) จะแตกเพราะ stress concentration

### 2.2 ระยะห่างร่อง (Slot Spacing)

สำหรับความโค้งท้องถิ่น $\kappa(s) = 1/R(s)$ ณ ตำแหน่ง $s$:

```
p(s) = clamp( θ_allow / max(κ, ε), p_min, p_max )
```

**ข้อจำกัด:**
- $p_{min} \geq 1.8 \times k$ (ป้องกันร่องชนกัน)
- $p_{max} \leq 25$ mm (ไม้จะไม่โค้งเรียบถ้าห่างเกินไป)
- $\varepsilon = 10^{-9}$ (ป้องกัน division by zero)

### 2.3 ความหนาชั้นเนื้อ (Web Thickness)

**กฎความปลอดภัย:**
```
t_web ≥ t_web_min
```

**ค่าแนะนำ:**
- ไม้อัด 6mm: $t_{web} = 1.2-1.5$ mm
- ไม้อัด 9mm: $t_{web} = 1.5-2.0$ mm
- MDF 9mm: $t_{web} = 1.5-2.0$ mm
- ไม้อัด 12mm: $t_{web} = 2.0-2.5$ mm

### 2.4 ความลึกร่อง (Slot Depth)

```
d = T - t_web
```

**ตัวอย่าง:**
```
ไม้อัด 6mm, ต้องการ t_web = 1.2mm
→ d = 6 - 1.2 = 4.8mm
```

### 2.5 ความยาวร่อง (Slot Length)

```
L_slot = W - 2 × edge_margin
```

โดยที่:
- $W$: ความกว้างชิ้นงาน
- $edge\_margin$: ระยะขอบปลอดภัย (แนะนำ ≥ 8mm)

**หมายเหตุ:** ปลายร่องควรทำโค้งรัศมี $k/2$ เพื่อลด stress concentration

### 2.6 การชดเชย Spring-back

ไม้จะพยายาม "คืนรูป" หลังดัด (spring-back) ดังนั้นต้องออกแบบร่องให้โค้งมากกว่าเป้าหมายเล็กน้อย:

```
κ'(s) = κ(s) × (1 + γ)
R_design = 1 / κ'(s)
```

**ค่า γ แนะนำ:**
- ไม้อัด: 0.10-0.12 (10-12%)
- MDF: 0.12-0.15 (12-15%)

---

## ส่วนที่ 3: อัลกอริทึม Flattening/Unroll

### 3.1 กรณีอินพุต 2D Curve (แนะนำสำหรับ MVP)

**Input:** Polyline/Spline จาก DXF/SVG
**Output:** ตำแหน่งร่อง + มุมหมุน

**ขั้นตอน:**

1. **Resample with Equal Arc-length**
   ```python
   def resample_curve(curve, ds=1.0):
       """Sample curve every ds mm along arc length"""
       samples = []
       s = 0
       while s < curve.length:
           point = curve.point_at_length(s)
           tangent = curve.tangent_at_length(s)
           samples.append((s, point, tangent))
           s += ds
       return samples
   ```

2. **Compute Curvature**
   ```python
   def compute_curvature(samples):
       """Estimate κ(s) using finite difference"""
       curvatures = []
       for i in range(1, len(samples)-1):
           s_prev, p_prev, t_prev = samples[i-1]
           s_curr, p_curr, t_curr = samples[i]
           s_next, p_next, t_next = samples[i+1]

           # Curvature ≈ dθ/ds
           angle_prev = atan2(t_prev.y, t_prev.x)
           angle_next = atan2(t_next.y, t_next.x)
           d_angle = angle_next - angle_prev
           d_s = s_next - s_prev

           kappa = d_angle / d_s if d_s > 0 else 0
           curvatures.append((s_curr, kappa))

       return curvatures
   ```

3. **Plan Slot Positions**
   ```python
   def plan_slots(samples, curvatures, params):
       slots = []
       s = params.edge_margin
       L = samples[-1][0]  # Total length

       while s < L - params.edge_margin:
           kappa = interpolate_curvature(s, curvatures)

           # Calculate spacing
           theta_allow = params.C_mat * atan(params.k / params.t_web)
           theta_allow = min(theta_allow, 0.5)  # Max 0.5 rad

           p = theta_allow / max(kappa, 1e-9)
           p = clamp(p, params.p_min, params.p_max)

           # Get position and angle
           pos, tangent = interpolate_position(s, samples)
           angle = atan2(tangent.y, tangent.x) + pi/2  # Normal

           slots.append({
               's': s,
               'x': pos.x,
               'y': pos.y,
               'angle': angle,
               'spacing': p,
               'depth': params.T - params.t_web,
               'length': params.W - 2*params.edge_margin
           })

           s += p

       return slots
   ```

### 3.2 กรณีอินพุต 3D Body (Advanced)

รองรับเฉพาะ **Developable Surfaces** (Cylinder, Cone, Ruled Surface)

**ขั้นตอน Unroll:**

1. **Tessellate** พื้นผิว 3D → Triangle Mesh
2. เลือก Face อ้างอิงวางบนระนาบ XY
3. **Chain-unfold**: หมุน neighbor faces ตามแกนขอบร่วมจนอยู่บนระนาบเดียวกัน
4. **Validate**: ตรวจสอบความคลาดพื้นที่ ≤ 1%, ความยาวขอบ ≤ 0.2mm
5. ส่งต่อ Flattened Outline ให้ Slot Planner

**⚠️ สำคัญ:** พื้นผิวที่มี **Double Curvature** (เช่น ทรงกลม) ไม่สามารถคลี่ได้โดยไม่มีการบิดเบือน ต้องใช้เทคนิค Lattice Pattern แทน

---

## ส่วนที่ 4: สถาปัตยกรรมซอฟต์แวร์ (System Architecture)

### 4.1 โมดูลหลัก (Main Modules)

```
┌─────────────────────────────────────────────────────────────┐
│                    Kerf Bending System                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [DXF/SVG Parser] ──→ [Curve Model]                         │
│         │                                                     │
│         ↓                                                     │
│  [Curvature Sampler] ──→ [Kerf Planner]                     │
│                              │                                │
│                              ↓                                │
│                    [Toolpath Generator]                       │
│                         ├────────┬─────────┐                 │
│                         ↓        ↓         ↓                 │
│                  [PostProcessor] [DXF]  [JSON]              │
│                       GRBL     Exporter Report               │
│                         │                                     │
│                         ↓                                     │
│                  [Simulator/Backplot]                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 โครงสร้างข้อมูล (Data Structures)

```typescript
// Material Specification
interface MaterialSpec {
  name: string
  thickness_mm: number
  c_mat: number           // Material constant
  springback_gamma: number // 0.08-0.15
}

// Machine Specification
interface MachineSpec {
  name: string
  controller: 'GRBL' | 'Mach3'
  tool_diameter_mm: number
  kerf_width_mm: number   // Actual measured kerf
  max_rpm: number
  max_feed_mm_per_min: number
}

// Process Parameters
interface ProcessSpec {
  material: MaterialSpec
  machine: MachineSpec

  // Geometry
  width_mm: number        // Workpiece width
  r_min_mm: number        // Minimum bend radius

  // Slot Parameters
  t_web_mm: number        // Web thickness
  p_min_mm: number        // Min spacing
  p_max_mm: number        // Max spacing
  edge_margin_mm: number  // Edge safety margin

  // Machining
  feed_mm_per_min: number
  stepdown_mm: number     // Depth per pass
  safe_z_mm: number
}

// Slot Event
interface SlotEvent {
  index: number
  s_at_mm: number         // Arc length position
  x: number               // X coordinate
  y: number               // Y coordinate
  angle_deg: number       // Rotation angle (normal to curve)
  spacing_mm: number      // Distance to next slot
  depth_mm: number        // Cut depth
  length_mm: number       // Slot length
}

// Toolpath
interface Toolpath {
  slots: SlotEvent[]
  gcode_lines: string[]
  estimated_time_min: number
  tool_wear_mm: number
}
```

### 4.3 Database Schema

```sql
-- Materials Library
CREATE TABLE material (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  thickness_mm REAL NOT NULL,
  c_mat REAL NOT NULL DEFAULT 1.1,
  springback_gamma REAL NOT NULL DEFAULT 0.10
);

-- Machines
CREATE TABLE machine (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  controller TEXT NOT NULL,
  tool_diameter_mm REAL NOT NULL,
  kerf_width_mm REAL NOT NULL,
  max_rpm INTEGER,
  max_feed_mm_per_min REAL
);

-- Jobs
CREATE TABLE job (
  id TEXT PRIMARY KEY,
  material_id TEXT REFERENCES material(id),
  machine_id TEXT REFERENCES machine(id),
  width_mm REAL NOT NULL,
  r_min_mm REAL NOT NULL,
  t_web_mm REAL NOT NULL,
  p_min_mm REAL NOT NULL,
  p_max_mm REAL NOT NULL,
  edge_margin_mm REAL NOT NULL,
  feed_mm_per_min REAL NOT NULL,
  stepdown_mm REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Slot Paths (Details)
CREATE TABLE slot_path (
  job_id TEXT REFERENCES job(id),
  idx INTEGER,
  s_at_mm REAL,
  x REAL,
  y REAL,
  angle_deg REAL,
  spacing_mm REAL,
  depth_mm REAL,
  length_mm REAL,
  PRIMARY KEY(job_id, idx)
);
```

---

## ส่วนที่ 5: การสร้าง G-code และกลยุทธ์ Toolpath

### 5.1 G-code Header (Setup)

```gcode
; Kerf Bending Job - Plywood 6mm
; Generated: 2026-01-10 14:30:00
; Estimated Time: 8.5 minutes

G21         ; Units: Millimeters
G90         ; Absolute positioning
G17         ; XY Plane
G94         ; Feed per minute
M03 S18000  ; Spindle on, 18000 RPM
G0 Z10.000  ; Move to safe Z
```

### 5.2 Priority Logic (ลำดับงาน)

1. **เจาะรู** (Drilling) - แรงแนวแกน สูง
2. **Kerf Slots** ทั้งหมด - ตัดร่องโดยยังไม่ตัดขาด
3. **Profile Cut-out** - ตัดขาดเป็นขั้นตอนสุดท้าย

**เหตุผล:** ถ้าตัดขาดก่อน ชิ้นงานอาจขยับหรือสั่น ทำให้ร่องไม่แม่นยำ

### 5.3 Serpentine Toolpath (ลด Air Move)

แทนที่จะยกขึ้นและเลื่อนกลับไปจุดเริ่มต้นทุกร่อง ให้ตัดแบบ "งูเลื้อย":

```
Slot #1: ←────────────  (ซ้ายไปขวา)
Slot #2: ────────────→  (ขวาไปซ้าย)
Slot #3: ←────────────  (ซ้ายไปขวา)
```

**Pseudo-code:**
```python
for i, slot in enumerate(slots):
    if i % 2 == 0:  # Even - Left to Right
        start = slot.left_point
        end = slot.right_point
    else:           # Odd - Right to Left
        start = slot.right_point
        end = slot.left_point

    emit_gcode(f"G0 X{start.x:.3f} Y{start.y:.3f}")
    emit_gcode(f"G1 Z{-slot.depth:.3f} F{feed_plunge}")
    emit_gcode(f"G1 X{end.x:.3f} Y{end.y:.3f} F{feed_cut}")
    emit_gcode(f"G0 Z{safe_z}")
```

### 5.4 Depth Ramping (ลดแรงกระแทก)

แทนที่จะ plunge ลงเต็มความลึกทันที ให้แบ่งเป็นหลาย pass:

```python
depth_remaining = slot.depth
z = 0

while depth_remaining > 0:
    step = min(stepdown_mm, depth_remaining)
    z -= step

    emit_gcode(f"G1 Z{z:.3f} F{feed_plunge}")
    emit_gcode(f"G1 X{end.x:.3f} Y{end.y:.3f} F{feed_cut}")

    depth_remaining -= step
```

### 5.5 ตัวอย่าง G-code สมบูรณ์

```gcode
; Setup
G21 G90 G17 G94
M03 S18000
G0 Z10.000

; Slot #1 (Left to Right)
G0 X50.000 Y100.000
G1 Z-2.400 F300
G1 Z-4.800 F300      ; Final depth (6 - 1.2 = 4.8mm)
G1 X150.000 Y100.000 F1000
G0 Z10.000

; Slot #2 (Right to Left - Serpentine)
G0 X150.000 Y106.000
G1 Z-2.400 F300
G1 Z-4.800 F300
G1 X50.000 Y106.000 F1000
G0 Z10.000

; Slot #3 (Left to Right)
G0 X50.000 Y112.000
G1 Z-2.400 F300
G1 Z-4.800 F300
G1 X150.000 Y112.000 F1000
G0 Z10.000

; End
M05              ; Spindle off
G0 Z50.000       ; Safe height
M30              ; Program end
```

---

## ส่วนที่ 6: Calibration และ Quality Assurance

### 6.1 การ Calibrate k_eff (Effective Kerf Width)

**วัตถุประสงค์:** หาค่าความกว้างรอยตัดจริง (อาจต่างจากเส้นผ่านศูนย์กลางดอก)

**ขั้นตอน:**

1. ตัดแถบทดลอง (test coupon) ด้วยร่อง 10 ร่อง ความยาวคงที่ 100mm
2. วัดความกว้างรวมของร่องทั้งหมดด้วย caliper: `W_total`
3. คำนวณ: `k_eff = W_total / 10`
4. บันทึกค่าใน Machine Spec

**ตัวอย่าง:**
```
ดอกตัด 3.175mm (1/8")
วัดได้: W_total = 32.8mm
→ k_eff = 32.8 / 10 = 3.28mm
```

### 6.2 การ Calibrate γ (Spring-back Factor)

**วัตถุประสงค์:** หาค่าชดเชยสำหรับแรง spring-back ของวัสดุ

**ขั้นตอน:**

1. ออกแบบ test piece โค้งรัศมีเป้าหมาย `R_target = 200mm`
2. ตัดร่องตามสูตรโดยไม่ชดเชย (γ = 0)
3. ดัดเข้าจิ๊กคงรูป แล้วปล่อย
4. วัดรัศมีจริงหลังปล่อย: `R_measured`
5. คำนวณ: `γ = (R_measured / R_target) - 1`

**ตัวอย่าง:**
```
R_target = 200mm
R_measured = 220mm
→ γ = (220 / 200) - 1 = 0.10 (10%)
```

**หมายเหตุ:** ค่า γ ขึ้นกับวัสดุ, ความชื้น, และทิศทางเสี้ยนไม้

### 6.3 ตารางพารามิเตอร์แนะนำ (Recommended Parameters)

#### ไม้อัด (Plywood) - ความชื้น 8-12%

| ความหนา | t_web | p_min | p_max | Feed (mm/min) | Stepdown | γ |
|---------|-------|-------|-------|---------------|----------|---|
| 6mm | 1.2-1.5 | 6 | 20 | 800-1200 | 2.0 | 0.10 |
| 9mm | 1.5-2.0 | 8 | 22 | 700-1100 | 2.5 | 0.10 |
| 12mm | 2.0-2.5 | 10 | 25 | 600-1000 | 3.0 | 0.12 |
| 18mm | 2.5-3.0 | 12 | 25 | 500-900 | 3.0 | 0.12 |

#### MDF (Medium Density Fiberboard)

| ความหนา | t_web | p_min | p_max | Feed (mm/min) | Stepdown | γ |
|---------|-------|-------|-------|---------------|----------|---|
| 6mm | 1.2-1.5 | 6 | 18 | 600-1000 | 1.5 | 0.12 |
| 9mm | 1.5-2.0 | 8 | 20 | 500-900 | 2.0 | 0.15 |
| 12mm | 2.0-2.5 | 10 | 22 | 400-800 | 2.5 | 0.15 |

### 6.4 กฎความปลอดภัย (Safety Rules)

#### Validation Checks (Pre-flight)

```typescript
function validateSlotPlan(slots: SlotEvent[], params: ProcessSpec): ValidationResult {
  const errors = []

  // Rule 1: Web thickness minimum
  if (params.t_web_mm < params.material.thickness_mm * 0.15) {
    errors.push(`Web too thin: ${params.t_web_mm}mm < 15% of thickness`)
  }

  // Rule 2: Spacing minimum (prevent slot collision)
  if (params.p_min_mm < 1.8 * params.machine.kerf_width_mm) {
    errors.push(`Spacing too small: ${params.p_min_mm}mm < 1.8 × kerf`)
  }

  // Rule 3: Edge margin
  if (params.edge_margin_mm < 8) {
    errors.push(`Edge margin too small: ${params.edge_margin_mm}mm < 8mm`)
  }

  // Rule 4: Slot collision with holes/hardware
  for (const slot of slots) {
    if (collidesWith(slot, hardwareHoles)) {
      errors.push(`Slot #${slot.index} collides with hardware hole`)
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  }
}
```

#### การป้องกันชิ้นงานขยับ

- ใช้ Vacuum Table หรือ Fixture รองรับชิ้นงานจนกว่าจะตัดขาดเป็นขั้นตอนสุดท้าย
- เพิ่ม Tabs (ที่ยึดชิ้นงาน) หากชิ้นงานใหญ่
- ตรวจสอบว่าร่องไม่ตัดผ่าน Tabs

### 6.5 Key Performance Indicators (KPIs)

| ตัวชี้วัด | เป้าหมาย | วิธีวัด |
|----------|---------|---------|
| **คลาดรัศมี** | ≤ 5% | วัด R จริง vs R เป้าหมาย |
| **First Time Yield (FTY)** | ≥ 95% | ชิ้นผ่าน / ชิ้นทั้งหมด |
| **เวลาตัดต่อชิ้น** | - | จาก G-code simulator |
| **อัตราสึกทูล** | - | เปรียบเทียบกับมาตรฐาน |
| **ความแตกหัก** | 0% | ตรวจสอบ visual |

---

## ส่วนที่ 7: ตัวอย่าง Configuration และ CLI

### 7.1 ไฟล์กำหนดค่า (config.yaml)

```yaml
material:
  name: "Plywood Grade A"
  thickness_mm: 6.0
  c_mat: 1.1
  springback_gamma: 0.10

machine:
  name: "CNC Router #1"
  controller: "GRBL"
  tool_diameter_mm: 3.175
  kerf_width_mm: 3.28
  max_rpm: 24000
  max_feed_mm_per_min: 3000

process:
  width_mm: 100
  r_min_mm: 150
  t_web_mm: 1.2
  p_min_mm: 6
  p_max_mm: 20
  edge_margin_mm: 8
  feed_mm_per_min: 1000
  stepdown_mm: 2.0
  safe_z_mm: 10.0

output:
  gcode_file: "output.nc"
  dxf_file: "output_slots.dxf"
  report_file: "report.json"
```

### 7.2 Command Line Interface (Draft)

```bash
# Basic usage
kerf-bend plan \
  --in curve.dxf \
  --out output.nc \
  --config config.yaml

# With inline parameters
kerf-bend plan \
  --in curve.dxf \
  --out output.nc \
  --T 6 \
  --W 100 \
  --kerf 3.28 \
  --tweb 1.2 \
  --pmin 6 \
  --pmax 20 \
  --edge 8 \
  --gamma 0.10 \
  --feed 1000 \
  --stepdown 2

# Calibration mode
kerf-bend calibrate kerf \
  --width 100 \
  --slots 10 \
  --length 100 \
  --out calibration_kerf.nc

kerf-bend calibrate springback \
  --radius 200 \
  --width 50 \
  --out calibration_springback.nc
```

---

## ส่วนที่ 8: การทดสอบและ QA Checklist

### 8.1 Pre-Production Checklist

- [ ] **Material Specification ถูกต้อง**: ตรวจสอบความหนา, ชนิด, ความชื้น
- [ ] **Machine Calibration ล่าสุด**: k_eff และ γ ถูกต้อง
- [ ] **Validation Rules ผ่าน**: t_web, p_min, edge_margin
- [ ] **Simulation/Backplot**: ตรวจสอบ toolpath visual
- [ ] **ไม่มี Slot Collision**: กับรู hardware หรือขอบ
- [ ] **Fixture/Vacuum พร้อม**: ชิ้นงานจะไม่ขยับ

### 8.2 Post-Production Inspection

- [ ] **วัดรัศมีหลังดัด**: เทียบกับ R_target (ยอมให้ผิดพลาด ±5%)
- [ ] **ตรวจสอบความแตก**: ไม่มี crack ที่ชั้น web
- [ ] **ตรวจสอบความเรียบ**: ผิวโค้งสม่ำเสมอ ไม่มี kink
- [ ] **วัดความยาวรวม**: ตรงกับที่ออกแบบ (±1%)

---

## สรุป (Conclusion)

เอกสารนี้นำเสนอ **ชุดสูตร อัลกอริทึม และสถาปัตยกรรมซอฟต์แวร์** ที่สมบูรณ์สำหรับการพัฒนาระบบ Kerf Bending ภายในองค์กร โดยไม่ต้องพึ่งพาซอฟต์แวร์ภายนอก

### จุดสำคัญ (Key Takeaways):

1. **สูตรคำนวณ:**
   - ระยะห่างร่อง: `p(s) = θ_allow / κ(s)`
   - มุมยอมได้: `θ_allow = C_mat × atan(k/t_web)`
   - Spring-back: `κ' = κ × (1 + γ)`

2. **ข้อจำกัดความปลอดภัย:**
   - `t_web ≥ 15% ของความหนาแผ่น`
   - `p_min ≥ 1.8 × k`
   - `edge_margin ≥ 8mm`

3. **กระบวนการผลิต:**
   - Calibrate ก่อนใช้งานจริง (k_eff, γ)
   - ใช้ Serpentine Toolpath ลด air move
   - Depth Ramping ป้องกันดอกหัก
   - ตัดขาด (cut-out) เป็นขั้นตอนสุดท้าย

4. **Quality Assurance:**
   - FTY ≥ 95%
   - คลาดรัศมี ≤ 5%
   - ไม่มี crack ที่ชั้น web

การนำระบบนี้ไปใช้จริงต้องผ่านขั้นตอน Calibration และทดสอบกับวัสดุจริงของโรงงานเสมอ เพราะพฤติกรรมไม้แต่ละชนิดแตกต่างกัน

---

**เอกสารอ้างอิง (References):**
- Computational Geometry: Algorithms and Applications (de Berg et al.)
- CNC Machining Handbook (Alan Overby)
- Wood Handbook: Wood as an Engineering Material (USDA Forest Service)
- GRBL G-code Reference
- Kerf Bending Research Papers (MIT, ETH Zurich)
