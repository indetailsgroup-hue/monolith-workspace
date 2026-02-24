# Hardware & Drilling Specifications
# ข้อกำหนดอุปกรณ์และรูปแบบการเจาะ

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** Technical Reference
**Scope:** Cabinet Hardware Systems & CNC Drilling Patterns

---

> **Cross-References:**
> - [Master Hardware Database](../reference/master-hardware-database.md) - Hardware SKUs & specifications (Single Source of Truth)
> - [Formula Reference](../reference/formula-reference.md) - Calculation formulas
> - [Cross-Reference Index](../reference/cross-reference-index.md) - Document navigation
> - [Door & Drawer Complete Guide](./door-drawer-complete-guide.md) - Door/Drawer engineering
> - [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md) - Cabinet dimensions

---

## บทนำ (Introduction)

เอกสารนี้เป็นคู่มืออ้างอิงทางวิศวกรรมสำหรับ **ระบบอุปกรณ์ตู้ (Hardware Systems)** และ **รูปแบบการเจาะ (Drilling Patterns)** ที่ใช้ในการผลิตตู้เฟอร์นิเจอร์ ครอบคลุมข้อมูลทางเทคนิคที่จำเป็นสำหรับการออกแบบ การคำนวณ และการส่งออกไฟล์ CNC

### วัตถุประสงค์ (Objectives)

1. **มาตรฐานการเจาะ**: กำหนดรูปแบบการเจาะตามระบบ 32mm
2. **Hardware Catalog**: รายละเอียดอุปกรณ์พร้อมข้อกำหนดการติดตั้ง
3. **CNC Integration**: Layer definitions สำหรับ DXF export
4. **Compatibility Matrix**: ตารางความเข้ากันได้ของอุปกรณ์

---

## ส่วนที่ 1: ระบบ 32 มิลลิเมตร (32mm System)

### 1.1 หลักการพื้นฐาน

**ระบบ 32mm** (หรือ System 32) คือมาตรฐานสากลสำหรับการผลิตตู้เฟอร์นิเจอร์ โดยกำหนดให้รูเจาะทุกรูอยู่บน Grid ที่มีระยะห่าง 32mm

**ข้อดี:**
- ✅ ความเข้ากันได้สากล (ใช้กับอุปกรณ์จากผู้ผลิตต่างๆ ได้)
- ✅ ลดความผิดพลาดในการผลิต (ตำแหน่งรูคงที่)
- ✅ ยืดหยุ่นในการปรับระดับชั้น (ใช้รูเดียวกันได้)
- ✅ เหมาะสำหรับ CNC อัตโนมัติ

### 1.2 Grid Layout

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    37mm ────┐                                           │
│             │                                           │
│    ●────●────●────●────●────●────●────●────●────●       │ ← Row 1
│    │    │    │    │    │    │    │    │    │    │       │
│   32mm  32   32   32   32   32   32   32   32   32      │
│    │    │    │    │    │    │    │    │    │    │       │
│    ●────●────●────●────●────●────●────●────●────●       │ ← Row 2
│                                                         │
│    ← 37mm from front edge                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**ค่าคงที่ระบบ 32mm:**

| พารามิเตอร์ | ค่า | หน่วย | คำอธิบาย |
|-------------|-----|-------|----------|
| Grid Spacing | 32 | mm | ระยะห่างระหว่างรู |
| Front Setback | 37 | mm | ระยะจากขอบหน้าถึงแถวแรก |
| Rear Setback | 37 | mm | ระยะจากขอบหลังถึงแถวสุดท้าย |
| Row Spacing | 32 | mm | ระยะระหว่างแถว (ถ้ามี 2 แถว) |
| Hole Diameter | 5 | mm | เส้นผ่านศูนย์กลางรูมาตรฐาน |
| Hole Depth | 13 | mm | ความลึกรูมาตรฐาน |

### 1.3 การคำนวณจำนวนรู (Hole Count Calculation)

**สูตร:**
```
N_holes = floor((H_panel - 2×setback) / 32) + 1
```

**ตัวอย่าง:**
```
แผ่นข้างสูง 720mm
Setback = 37mm
พื้นที่ใช้งาน = 720 - (2×37) = 646mm
N_holes = floor(646 / 32) + 1 = 20 + 1 = 21 รู
```

### 1.4 TypeScript Implementation

```typescript
interface System32Config {
  gridSpacing: number      // 32mm
  frontSetback: number     // 37mm
  rearSetback: number      // 37mm (หรือจากขอบล่าง)
  holeDiameter: number     // 5mm
  holeDepth: number        // 13mm
}

interface DrillHole {
  x: number
  y: number
  diameter: number
  depth: number
  type: 'shelf_pin' | 'dowel' | 'confirmat' | 'hinge'
}

function generateSystem32Holes(
  panelHeight: number,
  panelDepth: number,
  config: System32Config
): DrillHole[] {
  const holes: DrillHole[] = []

  // คำนวณจำนวนรูในแนวตั้ง
  const usableHeight = panelHeight - config.frontSetback - config.rearSetback
  const verticalCount = Math.floor(usableHeight / config.gridSpacing) + 1

  // สร้างแถวรู (2 แถว: หน้า 37mm และหลัง panelDepth - 37mm)
  const rowPositions = [config.frontSetback, panelDepth - config.frontSetback]

  for (const rowX of rowPositions) {
    for (let i = 0; i < verticalCount; i++) {
      const y = config.frontSetback + (i * config.gridSpacing)

      holes.push({
        x: rowX,
        y: y,
        diameter: config.holeDiameter,
        depth: config.holeDepth,
        type: 'shelf_pin'
      })
    }
  }

  return holes
}

// Default configuration
const DEFAULT_SYSTEM32: System32Config = {
  gridSpacing: 32,
  frontSetback: 37,
  rearSetback: 37,
  holeDiameter: 5,
  holeDepth: 13
}
```

---

## ส่วนที่ 2: ประเภทการเจาะ (Drilling Types)

### 2.1 Shelf Pin Holes (รูหมุดชั้น)

**วัตถุประสงค์:** รองรับชั้นปรับระดับได้

| พารามิเตอร์ | ค่ามาตรฐาน | หมายเหตุ |
|-------------|------------|----------|
| Diameter | 5mm | สำหรับหมุด 5mm |
| Depth | 13mm | ≤ T_panel - 3mm |
| Spacing | 32mm | ตามระบบ 32mm |
| Edge Distance | 37mm | ระยะจากขอบหน้า/หลัง |

**DXF Layer:** `DRILL_V_5_D13`

```typescript
interface ShelfPinSpec {
  diameter: 5
  depth: 13
  minEdgeDistance: 37
  gridSpacing: 32
}
```

### 2.2 Confirmat Screw Holes (รูสกรูดาว)

**วัตถุประสงค์:** ยึดแผ่นไม้เข้าด้วยกัน (Construction Joint)

**Confirmat 7×50mm (มาตรฐาน):**

| พารามิเตอร์ | หน้าแผ่น (Face) | ขอบแผ่น (Edge) |
|-------------|-----------------|----------------|
| Diameter | 8mm | 5mm |
| Depth | 12mm (ทะลุ) | 37mm |
| Countersink | Yes (Ø11mm × 3mm) | No |

**DXF Layers:**
- Face: `DRILL_V_8_THRU` + `CSINK_11_D3`
- Edge: `DRILL_H_5_D37`

```typescript
interface ConfirmatSpec {
  screwSize: '7x50' | '5x40'
  faceDrill: {
    diameter: number      // 8mm
    depth: 'through'      // ทะลุ
    countersink: {
      diameter: number    // 11mm
      depth: number       // 3mm
    }
  }
  edgeDrill: {
    diameter: number      // 5mm
    depth: number         // 37mm
  }
  minEdgeDistance: number // 25mm
  minEndDistance: number  // 50mm
}

const CONFIRMAT_7x50: ConfirmatSpec = {
  screwSize: '7x50',
  faceDrill: {
    diameter: 8,
    depth: 'through',
    countersink: { diameter: 11, depth: 3 }
  },
  edgeDrill: {
    diameter: 5,
    depth: 37
  },
  minEdgeDistance: 25,
  minEndDistance: 50
}
```

### 2.3 Dowel Holes (รูหมุดไม้)

**วัตถุประสงค์:** ยึดแผ่นไม้แบบซ่อน (Invisible Joint)

| พารามิเตอร์ | ค่ามาตรฐาน | หมายเหตุ |
|-------------|------------|----------|
| Diameter | 8mm | สำหรับหมุดไม้ 8mm |
| Depth | 13mm | ทั้งสองด้าน |
| Spacing | 32mm | หรือ 64mm (ตามโหลด) |
| Edge Distance | 37mm | ระยะจากขอบ |

**DXF Layer:** `DRILL_V_8_D13` หรือ `DRILL_H_8_D13`

```typescript
interface DowelSpec {
  diameter: 8
  depth: 13
  spacing: 32 | 64
  minEdgeDistance: 37
  tolerance: 0.1  // ความคลาดเคลื่อนยอมได้ ±0.1mm
}
```

### 2.4 Minifix/Cam Lock Holes (รูล็อคแคม)

**วัตถุประสงค์:** ยึดแบบถอดประกอบได้ (Knock-down)

**Minifix 15mm (Häfele/Blum):**

| พารามิเตอร์ | Housing (แผ่นหลัก) | Bolt (แผ่นรอง) |
|-------------|-------------------|----------------|
| Diameter | 15mm | 8mm |
| Depth | 12.5mm | ทะลุ |
| Edge Distance | 34mm | 9.5mm (center) |

**DXF Layers:**
- Housing: `DRILL_V_15_D12.5`
- Bolt: `DRILL_H_8_THRU`

```typescript
interface MinifixSpec {
  housingDrill: {
    diameter: 15
    depth: 12.5
    edgeDistance: 34
  }
  boltDrill: {
    diameter: 8
    depth: 'through'
    centerFromEdge: 9.5
  }
}
```

### 2.5 Hinge Cup Holes (รูบานพับ)

**วัตถุประสงค์:** ติดตั้งบานพับซ่อน (Concealed Hinge)

**Blum Clip Top 35mm:**

| พารามิเตอร์ | ค่า | หมายเหตุ |
|-------------|-----|----------|
| Cup Diameter | 35mm | มาตรฐานยุโรป |
| Cup Depth | 12.5mm | |
| Pilot Holes | 2 × Ø5mm × 10mm | ห่างจากศูนย์กลาง 22.5mm |
| Edge Distance | 3-6mm | ขึ้นอยู่กับ overlay |

**DXF Layer:** `HINGE_CUP_35`

```typescript
interface HingeCupSpec {
  cupDiameter: 35
  cupDepth: 12.5
  pilotHoles: {
    diameter: 5
    depth: 10
    spacing: 45  // ระยะระหว่าง pilot holes
  }
  edgeDistance: number  // 3-6mm ขึ้นอยู่กับ overlay
}

// ระยะขอบตาม Overlay
const HINGE_EDGE_DISTANCE = {
  'full_overlay': 3,    // บานทับขอบ
  'half_overlay': 5,    // บานทับครึ่ง
  'inset': 6            // บานเฝือง
}
```

---

## ส่วนที่ 3: Hardware Catalog

### 3.1 Hinges (บานพับ)

#### 3.1.1 Concealed Hinges (บานพับซ่อน)

| รุ่น | Opening Angle | Overlay | Door Thickness | Weight Capacity |
|------|---------------|---------|----------------|-----------------|
| Blum Clip Top 110° | 110° | 0-22mm | 16-25mm | 4kg |
| Blum Clip Top 155° | 155° | 0-22mm | 16-25mm | 4kg |
| Blum Clip Top BLUMOTION | 110° | 0-22mm | 16-25mm | 4kg (soft-close) |
| Hettich Sensys 110° | 110° | 0-23mm | 15-25mm | 4kg |
| Grass Tiomos 110° | 110° | 0-21mm | 16-24mm | 3.5kg |

**Drilling Pattern (Blum Clip Top):**

```
              ← 22.5mm →
                  ↓
    ○─────────────●─────────────○
    ↑             ↑             ↑
  Pilot         Cup          Pilot
  5×10        35×12.5        5×10

  ← Edge Distance (3-6mm) →
```

```typescript
interface HingeSpec {
  brand: string
  model: string
  openingAngle: number    // 110, 155, etc.
  overlayRange: {
    min: number
    max: number
  }
  doorThicknessRange: {
    min: number
    max: number
  }
  weightCapacity: number  // kg
  softClose: boolean
  drilling: HingeCupSpec
  mountingPlate: MountingPlateSpec
}

interface MountingPlateSpec {
  type: 'cruciform' | 'linear'
  height: number          // 0mm, 3mm, 6mm, 9mm
  screwPattern: {
    diameter: number
    depth: number
    spacing: number
  }
}
```

#### 3.1.2 จำนวนบานพับตามขนาดบาน (Hinge Quantity)

| ความสูงบาน | จำนวนบานพับ | ตำแหน่ง |
|------------|-------------|---------|
| ≤ 600mm | 2 | 100mm จากบน/ล่าง |
| 601-1000mm | 2 | 80mm จากบน/ล่าง |
| 1001-1400mm | 3 | 80mm, กลาง, 80mm |
| 1401-2000mm | 4 | 80mm, 1/3, 2/3, 80mm |
| > 2000mm | 5 | 80mm, กระจายเท่าๆ |

```typescript
function calculateHingePositions(doorHeight: number): number[] {
  const positions: number[] = []
  const topOffset = doorHeight > 600 ? 80 : 100
  const bottomOffset = topOffset

  if (doorHeight <= 1000) {
    // 2 hinges
    positions.push(topOffset, doorHeight - bottomOffset)
  } else if (doorHeight <= 1400) {
    // 3 hinges
    positions.push(topOffset, doorHeight / 2, doorHeight - bottomOffset)
  } else if (doorHeight <= 2000) {
    // 4 hinges
    positions.push(
      topOffset,
      doorHeight / 3,
      (doorHeight / 3) * 2,
      doorHeight - bottomOffset
    )
  } else {
    // 5 hinges
    const spacing = (doorHeight - topOffset - bottomOffset) / 4
    for (let i = 0; i < 5; i++) {
      positions.push(topOffset + (i * spacing))
    }
  }

  return positions
}
```

### 3.2 Drawer Slides (รางลิ้นชัก)

#### 3.2.1 Ball Bearing Slides (รางลูกปืน)

| รุ่น | Extension | Load Capacity | Lengths | Features |
|------|-----------|---------------|---------|----------|
| Standard Side Mount | Full | 35kg | 250-600mm | พื้นฐาน |
| Heavy Duty Side Mount | Full | 50kg | 350-700mm | โหลดหนัก |
| Soft-Close Side Mount | Full | 35kg | 300-550mm | ปิดนุ่ม |

**Clearance Requirements:**
- ระยะหักออกจากความกว้างตู้: **12.7mm ต่อข้าง** (รวม 25.4mm)

```typescript
interface BallBearingSlideSpec {
  type: 'side_mount' | 'center_mount'
  extension: 'full' | '3/4' | '1/2'
  loadCapacity: number    // kg
  lengths: number[]       // available lengths in mm
  clearancePerSide: 12.7  // mm
  softClose: boolean
  mountingHoles: {
    slotLength: number    // สำหรับการปรับระดับ
    holeSpacing: number
    holeDiameter: number
  }
}
```

#### 3.2.2 Undermount Slides (รางซ่อน)

| รุ่น | Load Capacity | Lengths | Features |
|------|---------------|---------|----------|
| Blum Tandem 500 | 30kg | 250-600mm | ซ่อนใต้ลิ้นชัก |
| Blum Tandem 550H (BLUMOTION) | 30kg | 270-650mm | ซ่อน + ปิดนุ่ม |
| Blum Legrabox | 40kg | 270-650mm | Premium + SERVO-DRIVE |
| Hettich Actro 5D | 40kg | 300-650mm | Full extension |

**Clearance Requirements:**
- ระยะหักออก: **10-15mm** (ขึ้นอยู่กับรุ่น)
- ต้องการความลึกก้นลิ้นชัก: **12-16mm**

```typescript
interface UndermountSlideSpec {
  brand: string
  model: string
  loadCapacity: number
  lengths: number[]
  clearance: number       // 10-15mm
  drawerBottomThickness: number  // ความหนาก้นลิ้นชัก
  drawerSideThickness: {
    min: number           // 12mm
    max: number           // 19mm
  }
  mountingPattern: {
    type: 'front_bracket' | 'rear_socket'
    holes: DrillHole[]
  }
}
```

### 3.3 Lift Systems (ระบบยกบาน)

#### 3.3.1 Aventos HK-S (Blum)

**สำหรับ:** บานเปิดขึ้นขนาดเล็ก-กลาง

| พารามิเตอร์ | ค่า |
|-------------|-----|
| Front Height | 280-350mm |
| Front Width | ≤ 1800mm |
| Front Weight | 1.5-9kg |
| Opening Angle | 107° |

```typescript
interface AventosHKSSpec {
  frontHeight: { min: 280, max: 350 }
  frontWidth: { max: 1800 }
  frontWeight: { min: 1.5, max: 9 }
  openingAngle: 107
  powerFactor: number  // คำนวณจาก weight × height
  mountingHoles: DrillHole[]
}
```

#### 3.3.2 Aventos HF (Blum)

**สำหรับ:** บานพับขึ้นแบบ Bi-fold

| พารามิเตอร์ | ค่า |
|-------------|-----|
| Front Height | 480-1040mm |
| Front Width | ≤ 1800mm |
| Front Weight | 3.5-17.5kg (ต่อบาน) |

### 3.4 Shelf Supports (หมุดรองชั้น)

| ประเภท | Diameter | Length | Load Capacity | ใช้กับ |
|--------|----------|--------|---------------|--------|
| Metal Pin | 5mm | 16mm | 15kg/pin | ชั้นทั่วไป |
| Plastic Pin | 5mm | 14mm | 10kg/pin | ชั้นเบา |
| Glass Shelf Support | 5mm | 20mm | 8kg/pin | ชั้นกระจก |
| Locking Pin | 5mm | 18mm | 20kg/pin | ชั้นยึดแน่น |

---

## ส่วนที่ 4: Compatibility Matrix

### 4.1 Panel Thickness Compatibility

| อุปกรณ์ | 15mm | 16mm | 18mm | 19mm | 25mm |
|---------|------|------|------|------|------|
| Blum Clip Top 110° | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Confirmat 7×50 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dowel 8×30 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Minifix 15mm | ❌ | ✅ | ✅ | ✅ | ✅ |
| System 32 (13mm deep) | ❌ | ⚠️ | ✅ | ✅ | ✅ |

**Legend:** ✅ Compatible, ⚠️ Limited, ❌ Not Compatible

### 4.2 Door Size Limits by Hinge

| บานพับ | Max Width | Max Height | Max Weight |
|--------|-----------|------------|------------|
| Blum Clip Top 110° | 600mm | 2000mm | 16kg (4 hinges) |
| Blum Clip Top 155° | 400mm | 2000mm | 16kg |
| Heavy Duty (Grass) | 800mm | 2400mm | 25kg |

### 4.3 Drawer Width Limits by Slide

| รางลิ้นชัก | Min Width | Max Width | Max Depth |
|------------|-----------|-----------|-----------|
| Ball Bearing 35kg | 300mm | 900mm | 600mm |
| Ball Bearing 50kg | 300mm | 1000mm | 700mm |
| Blum Tandem 30kg | 280mm | 900mm | 650mm |
| Blum Legrabox 40kg | 280mm | 1200mm | 650mm |

---

## ส่วนที่ 5: DXF Layer Naming Convention

### 5.1 Drilling Layers

```
DRILL_[Axis]_[Diameter]_[Depth/Type]

Axis:
- V = Vertical (ตั้งฉากกับหน้าแผ่น)
- H = Horizontal (ขนานกับหน้าแผ่น)
- Z = Z-axis (from top/bottom edge)

Diameter: เส้นผ่านศูนย์กลางเป็น mm

Depth/Type:
- D[xx] = Depth in mm
- THRU = Through hole (ทะลุ)
```

**ตัวอย่าง:**
- `DRILL_V_5_D13` - รูแนวตั้ง Ø5mm ลึก 13mm (Shelf Pin)
- `DRILL_V_8_D12` - รูแนวตั้ง Ø8mm ลึก 12mm (Dowel)
- `DRILL_V_35_D12.5` - รูแนวตั้ง Ø35mm ลึก 12.5mm (Hinge Cup)
- `DRILL_H_5_D37` - รูแนวนอน Ø5mm ลึก 37mm (Confirmat Edge)
- `DRILL_V_8_THRU` - รูทะลุ Ø8mm (Minifix Bolt)

### 5.2 Special Operations

```
[Operation]_[Details]

Operations:
- CSINK = Countersink
- HINGE = Hinge drilling pattern
- SAW = Saw cut / Routing
- POCKET = Pocket milling
```

**ตัวอย่าง:**
- `CSINK_11_D3` - Countersink Ø11mm ลึก 3mm
- `HINGE_CUP_35` - Hinge cup pattern (รวม pilot holes)
- `SAW_GROOVE_D8` - Groove ลึก 8mm (สำหรับแผ่นหลัง)
- `POCKET_15_D12.5` - Pocket Ø15mm ลึก 12.5mm (Minifix housing)

### 5.3 Layer Color Standards

| Layer | Color (DXF Code) | Purpose |
|-------|-----------------|---------|
| CUT_OUT | White (7) | Profile cut |
| DRILL_V_* | Red (1) | Vertical drilling |
| DRILL_H_* | Yellow (2) | Horizontal drilling |
| HINGE_CUP_* | Green (3) | Hinge patterns |
| SAW_GROOVE_* | Cyan (4) | Grooving |
| CSINK_* | Magenta (6) | Countersinking |
| ANNOTATION | Grey (8) | Non-cutting |

---

## ส่วนที่ 6: Validation Rules

### 6.1 Minimum Edge Distances

```typescript
interface EdgeDistanceRules {
  shelfPin: 37,      // mm from panel edge
  confirmat: 25,     // mm from panel edge
  dowel: 37,         // mm from panel edge
  minifix: 34,       // mm from panel edge (housing)
  hingeCup: 3,       // mm from door edge (minimum)
}
```

### 6.2 Collision Detection

```typescript
function validateDrillingPattern(
  holes: DrillHole[],
  panelWidth: number,
  panelHeight: number,
  panelThickness: number
): ValidationResult {
  const errors: string[] = []

  for (const hole of holes) {
    // Check edge distance
    if (hole.x < EDGE_DISTANCE_RULES[hole.type]) {
      errors.push(`Hole at (${hole.x}, ${hole.y}) too close to left edge`)
    }
    if (hole.y < EDGE_DISTANCE_RULES[hole.type]) {
      errors.push(`Hole at (${hole.x}, ${hole.y}) too close to bottom edge`)
    }

    // Check depth vs thickness
    if (hole.depth > panelThickness - 3) {
      errors.push(`Hole at (${hole.x}, ${hole.y}) depth exceeds safe limit`)
    }

    // Check for collisions with other holes
    for (const other of holes) {
      if (hole === other) continue
      const distance = Math.sqrt(
        Math.pow(hole.x - other.x, 2) +
        Math.pow(hole.y - other.y, 2)
      )
      const minDistance = (hole.diameter + other.diameter) / 2 + 3
      if (distance < minDistance) {
        errors.push(`Hole collision detected at (${hole.x}, ${hole.y})`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  }
}
```

### 6.3 Hardware Compatibility Check

```typescript
function validateHardwareCompatibility(
  hardware: HardwareItem,
  panel: PanelSpec
): ValidationResult {
  const errors: string[] = []

  // Check thickness compatibility
  if (panel.thickness < hardware.minThickness) {
    errors.push(
      `Panel thickness ${panel.thickness}mm is below minimum ` +
      `${hardware.minThickness}mm for ${hardware.name}`
    )
  }

  // Check drilling depth vs panel thickness
  const maxDepth = hardware.drilling.maxDepth
  const safeDepth = panel.thickness - 3  // Leave 3mm minimum

  if (maxDepth > safeDepth) {
    errors.push(
      `Drilling depth ${maxDepth}mm would exceed safe limit ` +
      `${safeDepth}mm for panel thickness ${panel.thickness}mm`
    )
  }

  // Check load capacity
  if (hardware.type === 'shelf_support') {
    const requiredCapacity = calculateShelfLoad(panel)
    if (hardware.loadCapacity * 4 < requiredCapacity) {  // 4 pins
      errors.push(
        `Shelf supports may not handle expected load of ${requiredCapacity}kg`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  }
}
```

---

## ส่วนที่ 7: G-code Generation for Drilling

### 7.1 Drilling Cycle (G81)

```gcode
; Standard drilling cycle
G81 X[x] Y[y] Z-[depth] R2 F[feed]

; Example: Shelf pin hole
G81 X37.000 Y37.000 Z-13.000 R2.000 F500
```

### 7.2 Peck Drilling Cycle (G83)

สำหรับรูลึก (depth > 3 × diameter):

```gcode
; Peck drilling cycle
G83 X[x] Y[y] Z-[depth] R2 Q[peck_depth] F[feed]

; Example: Confirmat edge hole (deep)
G83 X9.000 Y50.000 Z-37.000 R2.000 Q5.000 F300
```

### 7.3 Boring Cycle (G85)

สำหรับรูที่ต้องการความแม่นยำสูง (Hinge cup):

```gcode
; Boring cycle with controlled retract
G85 X[x] Y[y] Z-[depth] R2 F[feed]

; Example: Hinge cup
G85 X22.000 Y100.000 Z-12.500 R2.000 F200
```

### 7.4 Complete Drilling Program Example

```gcode
; MONOLITH Drilling Program
; Panel: LEFT_SIDE
; Material: PB 18mm
; Date: 2026-01-10

; Setup
G21              ; Metric
G90              ; Absolute
G17              ; XY plane
G94              ; Feed per minute
M03 S18000       ; Spindle on

; Tool: 5mm drill
T1 M06
G43 H1 Z50.000   ; Tool length comp

; Shelf pin holes (System 32)
G81 R2.000 F500
X37.000 Y37.000 Z-13.000
X37.000 Y69.000 Z-13.000
X37.000 Y101.000 Z-13.000
X37.000 Y133.000 Z-13.000
; ... (continue for all holes)
G80              ; Cancel cycle

; Tool: 8mm drill (Dowels)
T2 M06
G43 H2 Z50.000
G81 R2.000 F400
X50.000 Y9.000 Z-13.000
X150.000 Y9.000 Z-13.000
; ...
G80

; Tool: 35mm Forstner (Hinge cups)
T3 M06
G43 H3 Z50.000
G85 R2.000 F150
X22.000 Y100.000 Z-12.500
X22.000 Y620.000 Z-12.500
G80

; End
M05              ; Spindle off
G91 G28 Z0       ; Return to home
M30              ; End program
```

---

## ภาคผนวก A: Hardware Database Schema

```sql
-- Hardware Types
CREATE TABLE hardware_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL  -- 'hinge', 'slide', 'lift', 'support', 'fastener'
);

-- Hardware Items
CREATE TABLE hardware (
  id TEXT PRIMARY KEY,
  type_id TEXT REFERENCES hardware_type(id),
  brand TEXT,
  model TEXT,
  description TEXT,
  load_capacity_kg REAL,
  min_thickness_mm REAL,
  max_thickness_mm REAL,
  cost_thb REAL,
  safety_rating TEXT  -- 'SAFE', 'WARN', 'UNSAFE'
);

-- Drilling Patterns
CREATE TABLE drilling_pattern (
  hardware_id TEXT REFERENCES hardware(id),
  hole_index INTEGER,
  x_offset_mm REAL,
  y_offset_mm REAL,
  diameter_mm REAL,
  depth_mm REAL,
  axis TEXT,  -- 'V', 'H', 'Z'
  hole_type TEXT,  -- 'pilot', 'main', 'countersink'
  PRIMARY KEY (hardware_id, hole_index)
);

-- Panel-Hardware Assignments
CREATE TABLE panel_hardware (
  panel_id TEXT,
  hardware_id TEXT REFERENCES hardware(id),
  position_x_mm REAL,
  position_y_mm REAL,
  rotation_deg REAL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  PRIMARY KEY (panel_id, hardware_id, position_x_mm, position_y_mm)
);
```

---

## ภาคผนวก B: Quick Reference

### Drilling Depths by Panel Thickness

| Panel Thickness | Max Depth | Safe Depth | Shelf Pin | Dowel | Hinge Cup |
|-----------------|-----------|------------|-----------|-------|-----------|
| 16mm | 13mm | 13mm | ✅ 13mm | ✅ 13mm | ⚠️ 12mm |
| 18mm | 15mm | 15mm | ✅ 13mm | ✅ 13mm | ✅ 12.5mm |
| 19mm | 16mm | 16mm | ✅ 13mm | ✅ 13mm | ✅ 12.5mm |
| 25mm | 22mm | 22mm | ✅ 13mm | ✅ 15mm | ✅ 12.5mm |

### Common Hole Patterns

| Application | Diameter | Depth | Spacing | Edge Distance |
|-------------|----------|-------|---------|---------------|
| Shelf Pin | 5mm | 13mm | 32mm | 37mm |
| Dowel | 8mm | 13mm | 32/64mm | 37mm |
| Confirmat Face | 8mm | through | - | 25mm |
| Confirmat Edge | 5mm | 37mm | - | 50mm from end |
| Hinge Cup | 35mm | 12.5mm | - | 3-6mm |
| Minifix Housing | 15mm | 12.5mm | - | 34mm |

---

## สรุป (Conclusion)

เอกสารนี้ครอบคลุมข้อกำหนดทางเทคนิคสำหรับระบบอุปกรณ์และการเจาะทั้งหมดที่ใช้ในการผลิตตู้เฟอร์นิเจอร์

### จุดสำคัญ:

1. **ระบบ 32mm** เป็นมาตรฐานสากล - ใช้ Grid Spacing 32mm และ Edge Distance 37mm
2. **Layer Naming Convention** - ใช้รูปแบบ `DRILL_[Axis]_[Diameter]_[Depth]` สำหรับ DXF
3. **Validation** - ต้องตรวจสอบ Edge Distance, Depth vs Thickness, และ Collision Detection
4. **Hardware Compatibility** - ตรวจสอบความเข้ากันได้ของอุปกรณ์กับความหนาแผ่น

---

## ส่วนที่ 8: Blum Complete Hardware Database (Architecture v14.0)

ส่วนนี้รวบรวม SKU ทั้งหมดของ Blum ที่ยังไม่ได้ครอบคลุมในส่วนก่อนหน้า รวมถึง Lift Systems, Box Systems, และ Hinges รุ่นประหยัด

### 8.1 Master Hardware Database

```typescript
// src/services/hardware/masterDb.ts

export type SystemType =
  // Existing Systems
  | 'BLUM_MOVENTO' | 'BLUM_TANDEM_FULL' | 'BLUM_TANDEM_PART'
  // Lift Systems
  | 'AVENTOS_HS_TOP' | 'AVENTOS_HL_TOP' | 'AVENTOS_HK_TOP' | 'AVENTOS_HK_S'
  // Box Systems
  | 'MERIVOBOX' | 'TANDEMBOX_ANTARO' | 'METABOX_320'
  // Hinges
  | 'HINGE_MODUL';

export interface HardwareItem {
  id: string;
  brand: 'HAFELE' | 'BLUM';
  itemNo: string;
  name: string;
  category: 'LIFT_MECHANISM' | 'DRAWER_SIDE' | 'HINGE_CUP' | 'ACCESSORY';
  specs: {
    // Lift Specs
    powerFactorMin?: number;
    powerFactorMax?: number;
    minCabinetHeight?: number;
    rodDeduction?: number;     // ค่าลบสำหรับตัดเหล็กโยง (LW - X)

    // Drawer Specs
    nominalLength?: number;
    cutlist?: {
      bottomWidthDed: number;  // ค่าลบความกว้างพื้น (LW - X)
      bottomDepthDed: number;  // ค่าลบความลึกพื้น (NL - Y)
      backWidthDed: number;    // ค่าลบความกว้างหลัง (LW - Z)
    };
    drillPattern?: 'MERIVO_M' | 'TANDEM_STD' | 'METABOX';

    // Hinge Specs
    openingAngle?: number;
  };
}
```

### 8.2 Lift Systems (AVENTOS HS, HL, HK top, HK-S)

```typescript
export const LIFT_SYSTEMS = {
  // =================================================================
  // AVENTOS HS top (Up & Over) - Requires Stabilizer Rod
  // =================================================================
  hs_top_set: {
    id: 'hs_top_b', brand: 'BLUM', itemNo: '22S2500',
    name: 'HS top Set B',
    category: 'LIFT_MECHANISM',
    specs: {
      minCabinetHeight: 526,
      rodDeduction: 129  // สูตรตัดเหล็กโยง: LW - 129mm
    }
  },

  // =================================================================
  // AVENTOS HL top (Lift Up) - Requires Stabilizer Rod
  // =================================================================
  hl_top_set: {
    id: 'hl_top_25', brand: 'BLUM', itemNo: '22L2500',
    name: 'HL top Set 25',
    category: 'LIFT_MECHANISM',
    specs: {
      minCabinetHeight: 390,
      rodDeduction: 129  // สูตรตัดเหล็กโยง: LW - 129mm
    }
  },

  // =================================================================
  // AVENTOS HK top (Stay Lift - Modern Standard)
  // =================================================================
  hk_top_27: {
    id: 'hk_top_27', brand: 'BLUM', itemNo: '22K2700',
    name: 'HK top Medium',
    category: 'LIFT_MECHANISM',
    specs: {
      powerFactorMin: 1730,
      powerFactorMax: 5200
    }
  },

  // =================================================================
  // AVENTOS HK-S (Small Stay Lift)
  // =================================================================
  hks_weak: {
    id: 'hks_20k2', brand: 'BLUM', itemNo: '20K2B00',
    name: 'HK-S Weak',
    category: 'LIFT_MECHANISM',
    specs: {
      powerFactorMin: 220,
      powerFactorMax: 500
    }
  },

  // =================================================================
  // Cross Stabilizer Rod (สำหรับ HS/HL)
  // =================================================================
  rod_oval: {
    id: 'rod_1061', brand: 'BLUM', itemNo: '20Q1061',
    name: 'Cross Stabilizer Rod',
    category: 'ACCESSORY',
    specs: {}
  },
};
```

### 8.3 Box Systems (MERIVOBOX, TANDEMBOX, METABOX)

```typescript
export const BOX_SYSTEMS = {
  // =================================================================
  // MERIVOBOX (Platform) - Bottom: LW-51
  // =================================================================
  merivo_m: {
    id: 'meri_m_500', brand: 'BLUM', itemNo: '470M5002',
    name: 'MERIVOBOX M NL500',
    category: 'DRAWER_SIDE',
    specs: {
      nominalLength: 500,
      cutlist: {
        bottomWidthDed: 51,  // Bottom = LW - 51mm
        bottomDepthDed: 26,  // Bottom Depth = NL - 26mm
        backWidthDed: 51     // Back = LW - 51mm
      },
      drillPattern: 'MERIVO_M'
    }
  },

  // =================================================================
  // TANDEMBOX antaro (Classic) - Bottom: LW-75 (16mm)
  // =================================================================
  antaro_m: {
    id: 'antaro_m_500', brand: 'BLUM', itemNo: '378M5002',
    name: 'TANDEMBOX antaro M NL500',
    category: 'DRAWER_SIDE',
    specs: {
      nominalLength: 500,
      cutlist: {
        bottomWidthDed: 75,  // Bottom = LW - 75mm
        bottomDepthDed: 24,  // Bottom Depth = NL - 24mm
        backWidthDed: 87     // Back = LW - 87mm
      },
      drillPattern: 'TANDEM_STD'
    }
  },

  // =================================================================
  // METABOX (Economy) - Bottom: LW-31
  // =================================================================
  meta_m: {
    id: 'meta_320_500', brand: 'BLUM', itemNo: '320M5000',
    name: 'METABOX 320M NL500',
    category: 'DRAWER_SIDE',
    specs: {
      nominalLength: 500,
      cutlist: {
        bottomWidthDed: 31,  // Bottom = LW - 31mm
        bottomDepthDed: 2,   // Bottom Depth = NL - 2mm
        backWidthDed: 31     // Back = LW - 31mm
      },
      drillPattern: 'METABOX'
    }
  },
};
```

### 8.4 MODUL Hinge (Economy)

```typescript
export const HINGE_SYSTEMS = {
  // =================================================================
  // MODUL HINGE (Page 2) - Economy Option
  // =================================================================
  modul_100: {
    id: 'mod_100', brand: 'BLUM', itemNo: '91M2550',
    name: 'MODUL 100° Slide-on',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 100
    }
  },
};
```

### 8.5 Box Systems Comparison

| Feature | MERIVOBOX | TANDEMBOX antaro | METABOX |
|---------|-----------|------------------|---------|
| **Profile Shape** | Straight L | Curved | Sloped |
| **Bottom Deduction** | LW - 51mm | LW - 75mm | LW - 31mm |
| **Back Deduction** | LW - 51mm | LW - 87mm | LW - 31mm |
| **Depth Deduction** | NL - 26mm | NL - 24mm | NL - 2mm |
| **Drill Pattern** | MERIVO_M | TANDEM_STD | METABOX |
| **Price Level** | Premium | Standard | Economy |
| **Visual Style** | Modern | Classic Rounded | Industrial |

### 8.6 Lift Engineering Engine

```typescript
// src/services/engineering/finalEngine.ts

export const calculateFinalLift = (
  kh: number,       // Cabinet Height
  width: number,    // Internal Width
  weight: number,   // Front Weight
  system: SystemType
) => {
  const db = LIFT_SYSTEMS;
  const LF = kh * weight; // Lift Factor

  let mech: HardwareItem | undefined;
  let rodLength: number | undefined;

  switch (system) {
    case 'AVENTOS_HK_TOP':
      mech = db.hk_top_27;
      break;
    case 'AVENTOS_HK_S':
      mech = db.hks_weak;
      break;
    case 'AVENTOS_HS_TOP':
    case 'AVENTOS_HL_TOP':
      mech = system === 'AVENTOS_HS_TOP' ? db.hs_top_set : db.hl_top_set;
      // Formula: Rod = Internal Width - Deduction (129mm)
      rodLength = width - (mech.specs.rodDeduction || 129);
      break;
  }

  // Drill Position (from cabinet top)
  let drillY = 0;
  if (system === 'AVENTOS_HK_TOP') drillY = 173;
  else if (system === 'AVENTOS_HK_S') drillY = 100;
  else if (system === 'AVENTOS_HS_TOP') drillY = 240;
  else if (system === 'AVENTOS_HL_TOP') drillY = 150;

  return { isValid: !!mech, mech, rodLength, drillY };
};
```

### 8.7 Box Engineering Engine

```typescript
export const calculateFinalDrawer = (
  lw: number,       // Internal Width
  system: SystemType
) => {
  const db = BOX_SYSTEMS;
  let side: HardwareItem;

  if (system === 'MERIVOBOX') side = db.merivo_m;
  else if (system === 'TANDEMBOX_ANTARO') side = db.antaro_m;
  else if (system === 'METABOX_320') side = db.meta_m;
  else side = db.merivo_m; // Default

  const c = side.specs.cutlist!;

  // CUTLIST FORMULA
  const cutList = {
    bottom: {
      w: lw - c.bottomWidthDed,
      d: side.specs.nominalLength! - c.bottomDepthDed
    },
    back: {
      w: lw - c.backWidthDed,
      h: 84  // Standard M height
    }
  };

  // DRILL PATTERN Y (from Drawer Base)
  let drillY = 32;
  if (side.specs.drillPattern === 'METABOX') drillY = 33;
  else if (side.specs.drillPattern === 'TANDEM_STD') drillY = 33;

  return { isValid: true, side, cutList, drillY };
};
```

### 8.8 CAM Operations Generator

```typescript
// src/services/cam/generators/finalOp.ts

export const generateFinalOps = (opts: any): MachineOp[] => {
  const ops: MachineOp[] = [];

  // === LIFT OPERATIONS ===
  if (opts.type === 'LIFT') {
    const res = calculateFinalLift(opts.kh, opts.lw, opts.weight, opts.system);

    // 1. Mechanism Drill
    if (res.mech) {
      ops.push({
        id: 'lift-mech', type: 'DRILL', face: 'FACE',
        x: 37, y: res.drillY,
        diameter: 5, depth: 13, hardwareId: res.mech.itemNo
      });
    }

    // 2. Cross Stabilizer Rod Cut (สำหรับ HS/HL)
    if (res.rodLength) {
      ops.push({
        id: 'cut-rod', type: 'CUT_METAL',
        params: { length: res.rodLength, material: 'ALU_OVAL' },
        hardwareId: '20Q1061'
      });
    }
  }

  // === DRAWER OPERATIONS ===
  else if (opts.type === 'DRAWER') {
    const res = calculateFinalDrawer(opts.lw, opts.system);

    // Pattern differs by system
    const xPositions = res.side.specs.drillPattern === 'METABOX'
      ? [37, 165]           // 2-hole pattern
      : [37, 224, 256];     // 3-hole pattern

    xPositions.forEach(x => {
      ops.push({
        id: `run-${x}`, type: 'DRILL', face: 'FACE',
        x: x, y: opts.drawerY + res.drillY,
        diameter: 5, depth: 13, hardwareId: res.side.itemNo
      });
    });
  }

  return ops;
};
```

### 8.9 Lift Systems Drilling Reference

```
AVENTOS HS top:
┌─────────────────────────────────────────┐
│                 TOP                      │
├─────────────────────────────────────────┤
│                                         │
│  ○                                   ○  │ ← Mechanism (240mm from top)
│  │                                   │  │
│  │←───── Cross Stabilizer Rod ─────→│  │
│  │       (LW - 129mm)               │  │
│                                         │
│                                         │
└─────────────────────────────────────────┘

AVENTOS HK top:
┌─────────────────────────────────────────┐
│                 TOP                      │
├─────────────────────────────────────────┤
│  ○                                   ○  │ ← Mechanism (173mm from top)
│                                         │
│          (No Rod Required)              │
│                                         │
└─────────────────────────────────────────┘

AVENTOS HK-S:
┌─────────────────────────────────────────┐
│                 TOP                      │
├─────────────────────────────────────────┤
│  ○                                   ○  │ ← Mechanism (100mm from top)
│                                         │
│       (Compact / Small Cabinets)        │
│                                         │
└─────────────────────────────────────────┘
```

### 8.10 Box Systems Drilling Reference

```
MERIVOBOX (3-hole pattern):
┌─────────────────────────────────────────┐
│           CABINET SIDE                  │
│                                         │
│  ○──────────────────○────○              │
│  37mm            224mm  256mm           │
│                                         │
│  Y = Drawer Base + 32mm                 │
└─────────────────────────────────────────┘

TANDEMBOX antaro (3-hole pattern):
┌─────────────────────────────────────────┐
│           CABINET SIDE                  │
│                                         │
│  ○──────────────────○────○              │
│  37mm            224mm  256mm           │
│                                         │
│  Y = Drawer Base + 33mm                 │
└─────────────────────────────────────────┘

METABOX (2-hole pattern):
┌─────────────────────────────────────────┐
│           CABINET SIDE                  │
│                                         │
│  ○────────────○                         │
│  37mm       165mm                       │
│                                         │
│  Y = Drawer Base + 33mm                 │
└─────────────────────────────────────────┘
```

### 8.11 Cutlist Quick Reference

| System | Bottom Width | Bottom Depth | Back Width |
|--------|--------------|--------------|------------|
| MERIVOBOX | LW - 51 | NL - 26 | LW - 51 |
| TANDEMBOX antaro | LW - 75 | NL - 24 | LW - 87 |
| METABOX | LW - 31 | NL - 2 | LW - 31 |
| Wood Drawer (MOVENTO) | LW - 42 | NL - 10 | LW - 42 |

**ตัวอย่าง: Cabinet LW = 500mm, NL = 500mm**

| System | Bottom W | Bottom D | Back W |
|--------|----------|----------|--------|
| MERIVOBOX | 449mm | 474mm | 449mm |
| TANDEMBOX antaro | 425mm | 476mm | 413mm |
| METABOX | 469mm | 498mm | 469mm |
| Wood Drawer | 458mm | 490mm | 458mm |

### 8.12 Cross Stabilizer Rod Cutting Formula

สำหรับ AVENTOS HS top และ HL top ต้องใช้เหล็กโยง (Cross Stabilizer Rod) เพื่อยึดกลไกทั้ง 2 ฝั่ง

```
Rod Length = Internal Cabinet Width - 129mm

ตัวอย่าง:
- Cabinet LW = 900mm → Rod = 900 - 129 = 771mm
- Cabinet LW = 600mm → Rod = 600 - 129 = 471mm
```

```typescript
function calculateRodLength(cabinetLW: number): number {
  const ROD_DEDUCTION = 129; // mm
  return cabinetLW - ROD_DEDUCTION;
}

// CAM Operation for Metal Cutting
function generateRodCutOp(rodLength: number): MachineOp {
  return {
    id: 'cut-rod',
    type: 'CUT_METAL',
    params: {
      length: rodLength,
      material: 'ALU_OVAL',
      stockItem: '20Q1061'
    }
  };
}
```

---

## ส่วนที่ 9: Blum Hinge & HK-XS Linked System (Architecture v11.0)

ส่วนนี้รวบรวมข้อมูลจากไฟล์ Blum 68-197 (ระบบบานพับและบานยก) โดยเน้น **Linked Kinematics** - ความสัมพันธ์ระหว่างบานพับ (Hinge) และโช๊คช่วยยก (HK-XS) ที่ต้องคำนวณร่วมกัน

### 9.1 Engineering Logic Highlights

| Feature | Description |
|---------|-------------|
| **Linked Kinematics** | ตำแหน่งเจาะโช๊ค HK-XS ($H$) อ้างอิงค่า $MD$ และ $K$ จากบานพับที่เลือก |
| **Blum Solver** | สูตร $FA = TB + 10 - MD$ แม่นยำกว่าสูตรทั่วไป |
| **Pattern Recognition** | ระยะเจาะรูสกรู 45/9.5mm (Blum Standard) |

### 9.2 Master Hardware Database (Hinge & Lift)

```typescript
// src/services/hardware/masterDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'SC_8_60'
  // --- BLUM SYSTEMS ---
  | 'BLUM_HK_XS'         // Stay Lift
  | 'BLUM_CLIP_110'      // Standard
  | 'BLUM_CLIP_155'      // Zero Protrusion
  | 'BLUM_CLIP_THIN'     // Thin Door
  | 'BLUM_CLIP_BLIND';   // Blind Corner

export interface HardwareItem {
  id: string;
  brand: 'HAFELE' | 'BLUM';
  itemNo: string;
  name: string;
  category: 'LIFT' | 'HINGE_CUP' | 'HINGE_PLATE' | 'ACCESSORY';
  specs: {
    // Hinge Specs
    cupDepth?: number;       // Standard 13mm
    openingAngle?: number;
    pattern?: string;        // '45/9.5'
    crankConstant?: number;  // ค่าคงที่ของรุ่น (TB3->FA13 => K=10)
    crank?: number;          // 0 (Full), 9.5 (Half), 18 (Inset)

    // Lift Specs
    powerFactorMin?: number; // LF = KH * Weight
    powerFactorMax?: number;

    // Plate Specs
    distance?: number;       // MD (0, 3, 9)
  };
}

export const MASTER_DB = {
  // =================================================================
  // 1. AVENTOS HK-XS (Page 64)
  // =================================================================
  lifts: {
    hkxs_weak: {
      id: 'hkxs_20k1101', brand: 'BLUM', itemNo: '20K1101',
      name: 'HK-XS Weak (LF 200-1000)', category: 'LIFT',
      specs: { powerFactorMin: 200, powerFactorMax: 1000 }
    },
    hkxs_med: {
      id: 'hkxs_20k1301', brand: 'BLUM', itemNo: '20K1301',
      name: 'HK-XS Medium (LF 500-1500)', category: 'LIFT',
      specs: { powerFactorMin: 500, powerFactorMax: 1500 }
    },
    hkxs_strong: {
      id: 'hkxs_20k1501', brand: 'BLUM', itemNo: '20K1501',
      name: 'HK-XS Strong (LF 800-1800)', category: 'LIFT',
      specs: { powerFactorMin: 800, powerFactorMax: 1800 }
    },

    // Brackets
    hkxs_cab: {
      id: 'hkxs_cab', brand: 'BLUM', itemNo: '20K5101',
      name: 'Cabinet Fixing', category: 'ACCESSORY', specs: {}
    },
    hkxs_front: {
      id: 'hkxs_front', brand: 'BLUM', itemNo: '20K4101',
      name: 'Front Fixing', category: 'ACCESSORY', specs: {}
    },
  },

  // =================================================================
  // 2. CLIP TOP BLUMOTION (Page 74-76)
  // =================================================================
  hinges: {
    // Standard 110° (Page 76 - Table)
    // Formula: Overlay = TB + 10 - MD
    b110_full: {
      id: 'b110_full', brand: 'BLUM', itemNo: '71B3550',
      name: 'CLIP top 110° Full', category: 'HINGE_CUP',
      specs: {
        openingAngle: 110, crank: 0, crankConstant: 10,
        cupDepth: 13, pattern: '45/9.5'
      }
    },
    b110_half: {
      id: 'b110_half', brand: 'BLUM', itemNo: '71B3650',
      name: 'CLIP top 110° Half', category: 'HINGE_CUP',
      specs: {
        openingAngle: 110, crank: 9.5, crankConstant: 10,
        cupDepth: 13, pattern: '45/9.5'
      }
    },
    b110_inset: {
      id: 'b110_inset', brand: 'BLUM', itemNo: '71B3750',
      name: 'CLIP top 110° Inset', category: 'HINGE_CUP',
      specs: {
        openingAngle: 110, crank: 18, crankConstant: 10,
        cupDepth: 13, pattern: '45/9.5'
      }
    },

    // Wide Angle 155° (Page 84)
    b155_zero: {
      id: 'b155_zero', brand: 'BLUM', itemNo: '71B7550',
      name: 'CLIP top 155° Zero', category: 'HINGE_CUP',
      specs: {
        openingAngle: 155, crank: 0, crankConstant: 10,
        cupDepth: 11.5, pattern: '45/9.5'
      }
    },
  },

  plates: {
    // Mounting Plates (MD 0, 3, 9) - Page 150
    bp_d0: {
      id: 'bp_d0', brand: 'BLUM', itemNo: '173H7100',
      name: 'Cruciform Plate D0', category: 'HINGE_PLATE',
      specs: { distance: 0 }
    },
    bp_d3: {
      id: 'bp_d3', brand: 'BLUM', itemNo: '173H7130',
      name: 'Cruciform Plate D3', category: 'HINGE_PLATE',
      specs: { distance: 3 }
    },
    bp_d9: {
      id: 'bp_d9', brand: 'BLUM', itemNo: '175H7190',
      name: 'Cruciform Plate D9', category: 'HINGE_PLATE',
      specs: { distance: 9 }
    },
  }
};
```

### 9.3 Blum Engineering Engine

หัวใจสำคัญ: เชื่อมโยงผลลัพธ์การคำนวณ Hinge (MD, Crank) ไปสู่สูตรของ HK-XS

```typescript
// src/services/engineering/blumEngine.ts
import { MASTER_DB, HardwareItem, SystemType } from '../hardware/masterDb';

interface HingeResult {
  cup: HardwareItem;
  plate: HardwareItem;
  bestTB: number; // Drilling Distance (3-7mm)
  bestMD: number; // Plate Spacing
}

// === 1. HINGE SOLVER ===
// คำนวณหาคู่ TB และ MD ที่ดีที่สุดสำหรับระยะทับขอบ (Overlay) ที่ต้องการ
export const calculateBlumHinge = (
  overlay: number,
  system: SystemType
): HingeResult => {
  const db = MASTER_DB.hinges;
  const plates = MASTER_DB.plates;

  // 1.1 Select Arm Type
  let cup = db.b110_full;
  if (system === 'BLUM_CLIP_155') {
    cup = db.b155_zero;
  } else {
    // Auto-select based on Overlay target
    if (overlay >= 11) cup = db.b110_full;      // Full (~14-19mm)
    else if (overlay >= 2) cup = db.b110_half;  // Half (~5-9mm)
    else cup = db.b110_inset;                   // Inset
  }

  // 1.2 Geometry Solver
  // Formula: Overlay = TB + Fixed - Crank - MD
  const Fixed = cup.specs.crankConstant || 10;
  const Crank = cup.specs.crank || 0;

  let bestTB = 5; // Default standard
  let bestMD = 0;
  let minDiff = 999;

  const availTB = [3, 4, 5, 6]; // Blum drilling distances
  const availMD = [0, 3, 9];    // Available plates

  for (const TB of availTB) {
    for (const MD of availMD) {
      const calcOverlay = TB + Fixed - Crank - MD;
      const diff = Math.abs(calcOverlay - overlay);

      if (diff < minDiff) {
        minDiff = diff;
        bestTB = TB;
        bestMD = MD;
      }
    }
  }

  // Map MD to Plate SKU
  let plate = plates.bp_d0;
  if (bestMD === 3) plate = plates.bp_d3;
  if (bestMD === 9) plate = plates.bp_d9;

  return { cup, plate, bestTB, bestMD };
};

// === 2. HK-XS CALCULATOR ===
// สูตรหน้า 64: H = 137 + MD + K + SOB
// ต้องรับค่า MD และ K จากบานพับที่คำนวณได้ข้างบน
export const calculateHKXS = (
  cabinetHeight: number,
  frontWeight: number,
  topThickness: number, // SOB
  hingeInfo: { md: number; crank: number } // ข้อมูลจาก Hinge Result
) => {
  const db = MASTER_DB.lifts;

  // Power Factor
  const LF = cabinetHeight * frontWeight;

  // Mechanism Selection
  let mech = db.hkxs_weak;
  if (LF > 1500) mech = db.hkxs_strong;
  else if (LF > 1000) mech = db.hkxs_med;

  // Calculate Drill Position Y (From Top Edge)
  // H = 137 + MD + K + SOB
  const drillY = 137 + hingeInfo.md + hingeInfo.crank + topThickness;

  return {
    isValid: true,
    mechanism: mech,
    drillY_cabinet: drillY,
    powerFactor: LF
  };
};
```

### 9.4 Blum Overlay Calculation Formula

```
BLUM OVERLAY FORMULA (Page 76):

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Overlay (FA) = TB + Fixed - Crank - MD                        │
│                                                                 │
│   Where:                                                        │
│   • TB    = Drilling Distance (3-6mm from door edge)            │
│   • Fixed = Crank Constant (10 for CLIP top 110°)               │
│   • Crank = Arm Type (0=Full, 9.5=Half, 18=Inset)               │
│   • MD    = Mounting Distance (0, 3, 9mm plate options)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

EXAMPLE CALCULATIONS:

Full Overlay (TB=5, Crank=0, MD=0):
  FA = 5 + 10 - 0 - 0 = 15mm ✓

Half Overlay (TB=5, Crank=9.5, MD=0):
  FA = 5 + 10 - 9.5 - 0 = 5.5mm ✓

Inset (TB=5, Crank=18, MD=0):
  FA = 5 + 10 - 18 - 0 = -3mm (negative = inset)
```

### 9.5 HK-XS Drilling Position Formula

```
HK-XS DRILL POSITION (Page 64):

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   H = 137 + MD + K + SOB                                        │
│                                                                 │
│   Where:                                                        │
│   • 137 = Base constant (mm)                                    │
│   • MD  = Mounting Distance from Hinge Plate                    │
│   • K   = Crank value from Hinge Cup                            │
│   • SOB = Top Panel Thickness (typically 18mm)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CABINET SIDE VIEW:
┌─────────────────────────────────────────┐
│              TOP (SOB)                   │
├─────────────────────────────────────────┤
│                                         │
│  ○─────────────────────○                │ ← H = 137 + MD + K + SOB
│  │                     │                │
│  │    HK-XS Mechanism  │                │
│  │                     │                │
│                                         │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘

EXAMPLE: Full Overlay Hinge (MD=0, K=0) with 18mm Top:
  H = 137 + 0 + 0 + 18 = 155mm from cabinet top edge
```

### 9.6 CAM Generator for Blum Hinge & HK-XS

```typescript
// src/services/cam/generators/blumOp.ts
import { calculateBlumHinge, calculateHKXS } from '../../engineering/blumEngine';
import { MachineOp } from './types';

export const generateBlumOps = (
  doorId: string,
  cabinetId: string,
  opts: {
    overlay: number;
    hingeSystem: SystemType;
    doorHeight: number;
    cabinetHeight?: number;
    frontWeight?: number;
    topThickness?: number;
    system?: string;
  }
): MachineOp[] => {
  const ops: MachineOp[] = [];

  // 1. คำนวณ Hinge ก่อนเสมอ (เพราะ HK-XS ต้องใช้ค่า MD/Crank)
  const hingeRes = calculateBlumHinge(
    opts.overlay,
    opts.hingeSystem || 'BLUM_CLIP_110'
  );
  const { cup, plate, bestTB } = hingeRes;

  // === HINGE OPERATIONS ===
  // คำนวณจำนวนบานพับตามความสูง (หน้า 75)
  const qty = opts.doorHeight > 900 ? 3 : 2;
  const margin = 100;

  for (let i = 0; i < qty; i++) {
    const y = Math.round(
      margin + ((opts.doorHeight - 2 * margin) / (qty - 1)) * i
    );

    // 1.1 Door Cup (Pattern 45/9.5)
    const cupX = bestTB + 17.5;
    ops.push({
      id: `${doorId}-cup-${i}`,
      type: 'DRILL',
      face: 'FACE',
      x: cupX,
      y: y,
      diameter: 35,
      depth: 13,
      hardwareId: cup.itemNo
    });

    // Screw Holes (45mm spacing, 9.5mm offset)
    [-22.5, 22.5].forEach(offY => {
      ops.push({
        id: `${doorId}-scr-${i}-${offY}`,
        type: 'DRILL',
        face: 'FACE',
        x: cupX - 9.5,
        y: y + offY,
        diameter: 2.5,
        depth: 5 // Pilot Hole
      });
    });

    // 1.2 Cabinet Plate (System 32)
    [-16, 16].forEach(offY => {
      ops.push({
        id: `${cabinetId}-plt-${i}-${offY}`,
        type: 'DRILL',
        face: 'FACE',
        x: 37,
        y: y + offY,
        diameter: 5,
        depth: 13,
        hardwareId: plate.itemNo
      });
    });
  }

  // === AVENTOS HK-XS OPERATIONS ===
  if (opts.system === 'BLUM_HK_XS' && opts.cabinetHeight && opts.frontWeight) {
    // ส่งค่า MD และ Crank จากบานพับเข้าไปคำนวณ
    const liftRes = calculateHKXS(
      opts.cabinetHeight,
      opts.frontWeight,
      opts.topThickness || 18, // SOB
      { md: hingeRes.bestMD, crank: cup.specs.crank || 0 }
    );

    // Cabinet Fixing (3 holes for mechanism)
    const yFromTop = liftRes.drillY_cabinet;

    [0, 32, 64].forEach(offset => {
      ops.push({
        id: `${cabinetId}-hkxs-${offset}`,
        type: 'DRILL',
        face: 'FACE',
        x: 37, // Standard X for Blum Lifts
        y: yFromTop + offset,
        diameter: 5,
        depth: 13,
        hardwareId: liftRes.mechanism.itemNo
      });
    });

    // Front Fixing (Approx 125.5 + MD + K from top of door)
    const frontVal = 125.5 + hingeRes.bestMD + (cup.specs.crank || 0);
    ops.push({
      id: `${doorId}-hkxs-front`,
      type: 'DRILL',
      face: 'FACE',
      x: 50,
      y: frontVal,
      diameter: 5,
      depth: 10
    });
  }

  return ops;
};
```

### 9.7 Hinge Drilling Pattern (45/9.5mm Standard)

```
DOOR PANEL - HINGE CUP DRILLING:

     ┌─────────────────────────────────────────┐
     │                DOOR EDGE                 │
     │                                         │
     │     ○ ←── Screw Hole (2.5mm)            │  ↑
     │     │                                   │  │ 22.5mm
     │ ●───┼─────────────────────────●         │  ↓
     │     │                         ↑         │  ← Cup Center (35mm dia)
     │     ○ ←── Screw Hole          │ 9.5mm   │  ↑
     │                               ↓         │  │ 22.5mm
     │                                         │  ↓
     │     ↑                                   │
     │     TB + 17.5mm (Cup Center X)          │
     │                                         │
     └─────────────────────────────────────────┘
     ←─────────────────────────────────────────→
                    Door Width

Screw Pattern: 45mm total spacing (22.5mm each side of cup center)
Screw Offset:  9.5mm from cup center toward door edge
```

### 9.8 HK-XS Power Factor Selection

| Power Factor (LF) | Mechanism | Item No. | Application |
|-------------------|-----------|----------|-------------|
| 200 - 1000 | HK-XS Weak | 20K1101 | Light fronts |
| 500 - 1500 | HK-XS Medium | 20K1301 | Standard fronts |
| 800 - 1800 | HK-XS Strong | 20K1501 | Heavy fronts |

**Power Factor Formula:**
```
LF = Cabinet Height (mm) × Front Weight (kg)

Example:
- Cabinet Height: 400mm
- Front Weight: 3kg
- LF = 400 × 3 = 1200

→ Select: HK-XS Medium (20K1301)
```

### 9.9 CLIP top Hinge Selection Matrix

| Overlay Target | Arm Type | Crank Value | Item No. | Use Case |
|----------------|----------|-------------|----------|----------|
| 14-19mm | Full | 0 | 71B3550 | Standard full overlay |
| 5-9mm | Half | 9.5 | 71B3650 | Shared partition |
| -3 to 0mm | Inset | 18 | 71B3750 | Flush with frame |
| 14-19mm | 155° Zero | 0 | 71B7550 | Corner cabinets |

### 9.10 Mounting Plate Distance Options

| Plate | Distance (MD) | Item No. | Effect on Overlay |
|-------|---------------|----------|-------------------|
| D0 | 0mm | 173H7100 | Maximum overlay |
| D3 | 3mm | 173H7130 | -3mm from maximum |
| D9 | 9mm | 175H7190 | -9mm from maximum |

### 9.11 Complete Linked Calculation Example

```typescript
// Example: Wall Cabinet with HK-XS Lift + CLIP top Hinges

const cabinetConfig = {
  width: 600,
  height: 400,
  depth: 350,
  topThickness: 18,
  frontWeight: 3  // kg
};

const doorConfig = {
  overlay: 15,  // Full overlay target
  height: 380
};

// Step 1: Calculate Hinge (this determines MD and Crank)
const hingeResult = calculateBlumHinge(doorConfig.overlay, 'BLUM_CLIP_110');

console.log('Hinge Result:');
console.log('  Cup:', hingeResult.cup.itemNo);           // 71B3550
console.log('  Plate:', hingeResult.plate.itemNo);       // 173H7100
console.log('  TB:', hingeResult.bestTB, 'mm');          // 5mm
console.log('  MD:', hingeResult.bestMD, 'mm');          // 0mm
console.log('  Actual Overlay:',
  hingeResult.bestTB + 10 - hingeResult.cup.specs.crank - hingeResult.bestMD
);  // 15mm

// Step 2: Calculate HK-XS using Hinge values
const liftResult = calculateHKXS(
  cabinetConfig.height,
  cabinetConfig.frontWeight,
  cabinetConfig.topThickness,
  { md: hingeResult.bestMD, crank: hingeResult.cup.specs.crank || 0 }
);

console.log('HK-XS Result:');
console.log('  Mechanism:', liftResult.mechanism.itemNo);  // 20K1301
console.log('  Power Factor:', liftResult.powerFactor);    // 1200
console.log('  Drill Y:', liftResult.drillY_cabinet, 'mm'); // 155mm from top

// Step 3: Generate CAM Operations
const ops = generateBlumOps('DOOR-001', 'CAB-001', {
  overlay: doorConfig.overlay,
  hingeSystem: 'BLUM_CLIP_110',
  doorHeight: doorConfig.height,
  cabinetHeight: cabinetConfig.height,
  frontWeight: cabinetConfig.frontWeight,
  topThickness: cabinetConfig.topThickness,
  system: 'BLUM_HK_XS'
});

console.log('Generated Operations:', ops.length);
// Hinges: 2 cups + 4 screws + 4 plates = 10
// HK-XS: 3 cabinet + 1 front = 4
// Total: 14 operations
```

### 9.12 Drilling Reference Diagram

```
COMPLETE WALL CABINET WITH HK-XS + HINGES:

                    ← Cabinet Width (600mm) →
     ┌─────────────────────────────────────────────────────────────┐
     │                    TOP PANEL (18mm)                          │
     ├─────────────────────────────────────────────────────────────┤
     │                                                              │
     │  ○──○──○ ←── HK-XS (H = 137 + MD + K + SOB)                 │
     │                                                              │
     │                                                              │
     │  ○    ○ ←── Hinge Plate #1 (Y = 100mm)                      │
     │  ↑                                                           │
     │  37mm (System 32)                                            │
     │                                                              │
     │                                                              │
     │                                                              │
     │  ○    ○ ←── Hinge Plate #2 (Y = doorHeight - 100mm)         │
     │                                                              │
     │                                                              │
     └─────────────────────────────────────────────────────────────┘
                           CABINET SIDE

DOOR PANEL:
     ┌─────────────────────────────────────────┐
     │                                         │
     │  ○ ←── HK-XS Front Fixing (125.5 + MD + K)
     │                                         │
     │  ○                                      │
     │  ●──○ ←── Hinge Cup #1 + Screws         │
     │  ○                                      │
     │                                         │
     │                                         │
     │  ○                                      │
     │  ●──○ ←── Hinge Cup #2 + Screws         │
     │  ○                                      │
     │                                         │
     └─────────────────────────────────────────┘
```

---

## ส่วนที่ 10: Blum AVENTOS Lift Systems (Architecture v10.0)

ส่วนนี้รวบรวมข้อมูลจากไฟล์ Blum 14-67 (ระบบบานยก AVENTOS) โดยเน้น **Lift Intelligence Engine** ที่คำนวณ Power Factor และเลือกอุปกรณ์อัตโนมัติ

### 10.1 Engineering Logic Highlights

| Feature | Description |
|---------|-------------|
| **Power Factor Physics** | คำนวณค่า $LF = KH \times Weight$ เลือกเบอร์โช๊คที่รับแรงได้พอดี |
| **Structural Milling** | สร้าง Pocket Milling สำหรับ HKi ที่ต้องฝังอุปกรณ์ลงในเนื้อไม้ |
| **Kinematic Safety** | ตรวจสอบความหนาไม้ก่อนอนุญาตใช้รุ่นฝัง (HKi requires ≥16mm) |

### 10.2 Master Hardware Database (Lift Systems)

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'SC_8_60' | 'TOFIX_25' | 'LAMELLO_P' | 'DOVETAIL_RAIL'
  | 'HINGE_110' | 'HINGE_ALU_105_PUSH'
  // --- BLUM AVENTOS ---
  | 'AVENTOS_HKI'     // รุ่นฝังใน (Integrated)
  | 'AVENTOS_HF_TOP'; // รุ่นบานพับคู่ (Bi-fold)

export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'LIFT_MECHANISM' | 'LIFT_ARM' | 'LIFT_COVER' | 'HINGE_CUP';
  specs: {
    powerFactorMin?: number;
    powerFactorMax?: number;
    minCabinetHeight?: number;
    maxCabinetHeight?: number;
    isIntegrated?: boolean;          // True = ต้องกัดร่องฝัง
    millSpec?: { w: number; h: number; d: number; r: number }; // Milling Dimensions
  };
}

export const HAFELE_MASTER_DB = {
  lifts: {
    // =================================================================
    // AVENTOS HKi (Integrated) - PDF Page 5
    // Requires Side Panel Milling: ~128x265mm, Depth 12mm (for 16mm panel)
    // =================================================================

    // Weak (420-1610)
    hki_2300: {
      id: 'hki_24k2300', itemNo: '24K2300',
      name: 'AVENTOS HKi (LF 420-1610)',
      category: 'LIFT_MECHANISM',
      specs: {
        powerFactorMin: 420, powerFactorMax: 1610,
        isIntegrated: true,
        millSpec: { w: 128, h: 265, d: 12, r: 4 }
      }
    },
    // Medium (930-2800)
    hki_2500: {
      id: 'hki_24k2500', itemNo: '24K2500',
      name: 'AVENTOS HKi (LF 930-2800)',
      category: 'LIFT_MECHANISM',
      specs: {
        powerFactorMin: 930, powerFactorMax: 2800,
        isIntegrated: true,
        millSpec: { w: 128, h: 265, d: 12, r: 4 }
      }
    },
    // Strong (1730-5200)
    hki_2700: {
      id: 'hki_24k2700', itemNo: '24K2700',
      name: 'AVENTOS HKi (LF 1730-5200)',
      category: 'LIFT_MECHANISM',
      specs: {
        powerFactorMin: 1730, powerFactorMax: 5200,
        isIntegrated: true,
        millSpec: { w: 128, h: 265, d: 12, r: 4 }
      }
    },
    // X-Strong (2600-7800)
    hki_2800: {
      id: 'hki_24k2800', itemNo: '24K2800',
      name: 'AVENTOS HKi (LF 2600-7800)',
      category: 'LIFT_MECHANISM',
      specs: {
        powerFactorMin: 2600, powerFactorMax: 7800,
        isIntegrated: true,
        millSpec: { w: 128, h: 265, d: 12, r: 4 }
      }
    },

    // =================================================================
    // AVENTOS HF top (Bi-Fold) - PDF Page 13
    // =================================================================

    // Mechanisms (Set)
    hf_2500: {
      id: 'hf_22f2500', itemNo: '22F2500',
      name: 'HF top Mech (LF 2700-13500)',
      category: 'LIFT_MECHANISM',
      specs: { powerFactorMin: 2700, powerFactorMax: 13500 }
    },
    hf_2800: {
      id: 'hf_22f2800', itemNo: '22F2800',
      name: 'HF top Mech (LF 10000-19300)',
      category: 'LIFT_MECHANISM',
      specs: { powerFactorMin: 10000, powerFactorMax: 19300 }
    },

    // Telescopic Arms (Selected by Cabinet Height KH)
    hf_arm_35: {
      id: 'hf_arm_35', itemNo: '20F3500',
      name: 'HF Arm (KH 560-710)',
      category: 'LIFT_ARM',
      specs: { minCabinetHeight: 560, maxCabinetHeight: 710 }
    },
    hf_arm_38: {
      id: 'hf_arm_38', itemNo: '20F3800',
      name: 'HF Arm (KH 700-900)',
      category: 'LIFT_ARM',
      specs: { minCabinetHeight: 700, maxCabinetHeight: 900 }
    },
    hf_arm_39: {
      id: 'hf_arm_39', itemNo: '20F3900',
      name: 'HF Arm (KH 760-1040)',
      category: 'LIFT_ARM',
      specs: { minCabinetHeight: 760, maxCabinetHeight: 1040 }
    },

    // Center Hinge (Finger Safety)
    hf_center_hinge: {
      id: 'hf_ctr', itemNo: '78Z5550',
      name: 'CLIP top Center Hinge',
      category: 'HINGE_CUP',
      specs: { cupDia: 35 }
    },
  },

  // Cover Caps
  lift_covers: {
    hki_cover: {
      id: 'hki_cov', itemNo: '24K8000',
      name: 'HKi Cover Set',
      category: 'LIFT_COVER',
      specs: {}
    },
  }
};
```

### 10.3 Lift Intelligence Engine

```typescript
// src/services/engineering/liftEngine.ts
import { HAFELE_MASTER_DB, HardwareItem, SystemType } from '../hardware/hafeleDb';

export interface LiftPlan {
  isValid: boolean;
  powerFactor: number;
  specs: {
    mechanism: HardwareItem;
    arm?: HardwareItem;
    centerHinge?: HardwareItem;
  };
  meta: {
    millPocket?: { x: number; y: number; w: number; h: number; d: number; r: number };
    drillPos?: { x: number; y: number };
  };
  issues: string[];
}

interface Options {
  cabinetHeight: number;       // KH
  frontWeight: number;         // FG (Combined Weight)
  system: SystemType;
  sideThickness: number;       // SWD
}

export const calculateLiftPlan = (opts: Options): LiftPlan => {
  const { cabinetHeight, frontWeight, system, sideThickness } = opts;
  const issues: string[] = [];
  const db = HAFELE_MASTER_DB.lifts;

  // 1. CALCULATE POWER FACTOR (LF)
  // Formula: LF = KH (mm) * FG (kg)
  const LF = cabinetHeight * frontWeight;

  let mechanism: HardwareItem | undefined;
  let arm: HardwareItem | undefined;
  let centerHinge: HardwareItem | undefined;

  // 2. MECHANISM SELECTION
  if (system === 'AVENTOS_HKI') {
    // Validation: Side Panel Thickness (Page 5: min 16mm)
    if (sideThickness < 16) {
      issues.push(
        `AVENTOS HKi requires side panel thickness ≥ 16mm (Current: ${sideThickness}mm)`
      );
    }

    // Select HKi based on LF
    const candidates = [db.hki_2300, db.hki_2500, db.hki_2700, db.hki_2800];
    mechanism = candidates.find(
      m => LF >= m.specs.powerFactorMin! && LF <= m.specs.powerFactorMax!
    );

  } else if (system === 'AVENTOS_HF_TOP') {
    // Select HF based on LF
    if (LF >= 2600 && LF <= 13500) mechanism = db.hf_2500;
    else if (LF > 13500 && LF <= 19300) mechanism = db.hf_2800;

    // Select Arm based on KH
    const arms = [db.hf_arm_35, db.hf_arm_38, db.hf_arm_39];
    arm = arms.find(
      a => cabinetHeight >= a.specs.minCabinetHeight! &&
           cabinetHeight <= a.specs.maxCabinetHeight!
    );

    if (!arm) {
      issues.push(`No telescopic arm found for Cabinet Height ${cabinetHeight}mm`);
    }

    centerHinge = db.hf_center_hinge;
  }

  if (!mechanism) {
    issues.push(`Power Factor ${Math.round(LF)} out of range for ${system}`);
  }

  // 3. MANUFACTURING META
  let millPocket = undefined;
  let drillPos = undefined;

  if (mechanism && mechanism.specs.isIntegrated) {
    // === HKi MILLING (Page 6) ===
    // Y Position: Approx 22mm from top inner edge
    // X Position: 12mm from front edge (approx)
    const m = mechanism.specs.millSpec!;
    millPocket = {
      x: 50, // Offset for CNC origin
      y: 22, // Offset from Top
      w: m.w, h: m.h, d: m.d, r: m.r
    };
  } else if (mechanism) {
    // === HF DRILLING (Page 20) ===
    // Top pin 47mm from top edge, 37mm from front
    drillPos = { x: 37, y: 47 };
  }

  return {
    isValid: issues.length === 0 && !!mechanism,
    powerFactor: LF,
    specs: { mechanism: mechanism!, arm, centerHinge },
    meta: { millPocket, drillPos },
    issues
  };
};
```

### 10.4 Power Factor Calculation Formula

```
POWER FACTOR FORMULA:

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   LF = KH × FG                                                  │
│                                                                 │
│   Where:                                                        │
│   • LF = Power Factor (Lift Factor)                             │
│   • KH = Cabinet Height (mm)                                    │
│   • FG = Front Weight (kg) - Combined weight of all panels      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

EXAMPLE:
- Cabinet Height (KH): 600mm
- Front Weight (FG): 4kg (single door)
- LF = 600 × 4 = 2400

→ Select: AVENTOS HKi 24K2500 (LF 930-2800)
```

### 10.5 AVENTOS HKi Power Factor Selection

| Item No. | Power Factor Range | Application |
|----------|-------------------|-------------|
| 24K2300 | 420 - 1610 | Light fronts |
| 24K2500 | 930 - 2800 | Standard fronts |
| 24K2700 | 1730 - 5200 | Heavy fronts |
| 24K2800 | 2600 - 7800 | Extra heavy fronts |

### 10.6 AVENTOS HF top Configuration

| Component | Item No. | Range/Specification |
|-----------|----------|---------------------|
| **Mechanism (Light)** | 22F2500 | LF 2700-13500 |
| **Mechanism (Heavy)** | 22F2800 | LF 10000-19300 |
| **Arm 35** | 20F3500 | KH 560-710mm |
| **Arm 38** | 20F3800 | KH 700-900mm |
| **Arm 39** | 20F3900 | KH 760-1040mm |
| **Center Hinge** | 78Z5550 | Door-to-door connection |

### 10.7 CAM Generator for Lift Systems

```typescript
// src/services/cam/generators/liftOp.ts
import { calculateLiftPlan } from '../../engineering/liftEngine';
import { MachineOp } from './types';

export const generateLiftOps = (
  sideId: string,
  doorId: string,
  opts: {
    cabinetHeight: number;
    frontWeight: number;
    system: SystemType;
    sideThickness: number;
  }
): MachineOp[] => {
  const plan = calculateLiftPlan(opts);
  if (!plan.isValid) return [];

  const ops: MachineOp[] = [];
  const { mechanism, centerHinge } = plan.specs;

  // === A. AVENTOS HKi (POCKET MILLING) ===
  if (plan.meta.millPocket) {
    const m = plan.meta.millPocket;

    // Side Panel Milling
    ops.push({
      id: `${sideId}-hki-pocket`,
      type: 'MILL_POCKET',
      face: 'FACE', // Inner Face
      x: m.x,
      y: m.y,
      params: {
        length: m.h, // 265mm
        width: m.w,  // 128mm
        depth: m.d,  // 12mm (Leave 4mm skin on 16mm panel)
        cornerR: m.r // 4mm corner radius
      },
      hardwareId: mechanism.itemNo
    });

    // Front Fixing Bracket
    ops.push({
      id: `${doorId}-hki-bracket`,
      type: 'DRILL',
      face: 'FACE',
      x: 50,
      y: 150,
      diameter: 5,
      depth: 10,
      hardwareId: 'HKI-BRACKET'
    });
  }

  // === B. AVENTOS HF TOP (SURFACE DRILLING) ===
  else if (plan.meta.drillPos) {
    const d = plan.meta.drillPos;

    // 1. Side Panel Mechanism (2 pins)
    [0, 32].forEach(off => {
      ops.push({
        id: `${sideId}-hf-mech-${off}`,
        type: 'DRILL',
        face: 'FACE',
        x: d.x,
        y: d.y + off,
        diameter: 5,
        depth: 13,
        hardwareId: mechanism.itemNo
      });
    });

    // 2. Center Hinge (Door-to-Door)
    if (centerHinge) {
      ops.push({
        id: `${doorId}-hf-center`,
        type: 'DRILL',
        face: 'FACE',
        x: 21.5,
        y: 30, // Standard Hinge Position
        diameter: 35,
        depth: 12,
        hardwareId: centerHinge.itemNo
      });
    }
  }

  return ops;
};
```

### 10.8 HKi Milling Specification

```
AVENTOS HKi POCKET MILLING (Page 6):

┌─────────────────────────────────────────────────────────────────┐
│                    CABINET SIDE PANEL                           │
│                                                                 │
│    ┌──────────────────────────────────────┐                     │
│    │                                      │ ← 22mm from top     │
│    │    ┌────────────────────────────┐    │                     │
│    │    │                            │    │                     │
│    │    │      POCKET AREA           │    │                     │
│    │    │      128mm × 265mm         │    │                     │
│    │    │      Depth: 12mm           │    │                     │
│    │    │      Corner R: 4mm         │    │                     │
│    │    │                            │    │                     │
│    │    └────────────────────────────┘    │                     │
│    │                                      │                     │
│    └──────────────────────────────────────┘                     │
│                                                                 │
│    ← 50mm from front edge                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CRITICAL: Side Panel Thickness must be ≥ 16mm
         Pocket depth 12mm leaves 4mm skin
```

### 10.9 HF top Drilling Reference

```
AVENTOS HF top DRILLING (Page 20):

CABINET SIDE PANEL:
┌─────────────────────────────────────────────────────────────────┐
│                         TOP                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ○ ←── 47mm from top                                            │
│  │                                                               │
│  ○ ←── 47mm + 32mm = 79mm from top                              │
│  ↑                                                               │
│  37mm from front edge                                            │
│                                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

DOOR PANEL (Bi-Fold Center Hinge):
┌─────────────────────────────────────────┐
│           TOP DOOR (Bottom Edge)        │
│                                         │
│    ●──────────●──────────●              │ ← Center Hinge Cups
│   21.5mm    Center     21.5mm           │    35mm diameter
│                                         │
└─────────────────────────────────────────┘
```

### 10.10 Lift System Comparison

| Feature | AVENTOS HKi | AVENTOS HF top |
|---------|-------------|----------------|
| **Type** | Integrated (Hidden) | Bi-Fold (Surface) |
| **Installation** | Pocket Milling | Surface Mounting |
| **Min Panel Thickness** | 16mm | 16mm |
| **Power Factor Range** | 420-7800 | 2700-19300 |
| **Arm Type** | Integrated | Telescopic |
| **Door Configuration** | Single | Bi-Fold (2 doors) |
| **Aesthetics** | Premium (Hidden) | Standard |
| **Price Level** | Premium | Standard |

### 10.11 Complete Implementation Example

```typescript
// Example: Wall Cabinet with AVENTOS HKi

const cabinetConfig = {
  width: 900,
  height: 600,
  depth: 350,
  sideThickness: 18  // 18mm panel (≥16mm required)
};

const frontWeight = 4; // kg

// Generate Lift Plan
const liftPlan = calculateLiftPlan({
  cabinetHeight: cabinetConfig.height,
  frontWeight: frontWeight,
  system: 'AVENTOS_HKI',
  sideThickness: cabinetConfig.sideThickness
});

console.log('Lift Plan:');
console.log('  Power Factor:', liftPlan.powerFactor);        // 2400
console.log('  Mechanism:', liftPlan.specs.mechanism.itemNo); // 24K2500
console.log('  Valid:', liftPlan.isValid);                   // true

// Generate CAM Operations
const ops = generateLiftOps('SIDE-L', 'DOOR-001', {
  cabinetHeight: cabinetConfig.height,
  frontWeight: frontWeight,
  system: 'AVENTOS_HKI',
  sideThickness: cabinetConfig.sideThickness
});

console.log('Operations:', ops.length);  // 2 (pocket + bracket)
console.log('Pocket Milling:', ops[0].params);
// { length: 265, width: 128, depth: 12, cornerR: 4 }
```

### 10.12 Safety Validation Rules

```typescript
// Validation rules for lift systems

function validateLiftConfiguration(opts: LiftOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Panel Thickness Check (HKi only)
  if (opts.system === 'AVENTOS_HKI' && opts.sideThickness < 16) {
    errors.push('HKi requires minimum 16mm side panel thickness');
  }

  // 2. Power Factor Range Check
  const LF = opts.cabinetHeight * opts.frontWeight;
  if (opts.system === 'AVENTOS_HKI') {
    if (LF < 420) errors.push('Power Factor too low for HKi (min: 420)');
    if (LF > 7800) errors.push('Power Factor too high for HKi (max: 7800)');
  } else if (opts.system === 'AVENTOS_HF_TOP') {
    if (LF < 2700) errors.push('Power Factor too low for HF (min: 2700)');
    if (LF > 19300) errors.push('Power Factor too high for HF (max: 19300)');
  }

  // 3. Cabinet Height Range (HF Arm Selection)
  if (opts.system === 'AVENTOS_HF_TOP') {
    if (opts.cabinetHeight < 560) {
      errors.push('Cabinet too short for HF (min: 560mm)');
    }
    if (opts.cabinetHeight > 1040) {
      errors.push('Cabinet too tall for HF (max: 1040mm)');
    }
  }

  // 4. Weight Warning
  if (opts.frontWeight > 15) {
    warnings.push('Front weight exceeds 15kg - consider reinforcement');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

---

## ส่วนที่ 11: Advanced Mounting Engine - Häfele Metalla 510 & Mounting Plates (Architecture v9.0)

ระบบ **Advanced Mounting Engine** รองรับบานพับ Häfele Metalla 510 Push สำหรับเฟรมอลูมิเนียม และ Mounting Plates หลากหลายรูปแบบ (Linear/Cruciform, Screw/Euro, Zinc/Steel)

### 11.1 Engineering Logic Highlights

1. **Aluminium Frame Support**: ระบบเจาะสำหรับเฟรมอลูมิเนียม 17-24mm (ไม่เจาะถ้วย 35mm)
2. **Plate Strategy**: เลือกฐานรองได้ละเอียด (Linear vs Cruciform, Zinc vs Steel, Screw vs Euro)
3. **Extended Distance**: รองรับระยะ D สูงสุด 12mm สำหรับงานแก้ปัญหาหน้างาน
4. **Push Mechanism**: รองรับบานพับ Push สำหรับงานออกแบบไร้มือจับ
5. **Fixing Method Intelligence**: แยกแยะ Euro Screw (5mm) และ Chipboard Screw (3mm)

### 11.2 Master Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'SC_8_60' | 'U_12_10' | 'TOFIX_25' | 'LAMELLO_P' | 'DOVETAIL_RAIL'
  // --- STANDARD HINGES ---
  | 'HINGE_110' | 'HINGE_155' | 'HINGE_165' | 'HINGE_THIN' | 'HINGE_BLIND_SM' | 'HINGE_BLIND_LG'
  | 'HINGE_PROFILE_94' | 'HINGE_REBATED_110' | 'HINGE_CORNER_70' | 'HINGE_FRIDGE'
  | 'HINGE_ANGLE_VAR'
  // --- ALUMINIUM FRAME (Selection 17) ---
  | 'HINGE_ALU_105_PUSH';

export type PlateType = 'LINEAR' | 'CRUCIFORM';
export type PlateMaterial = 'STEEL' | 'ZINC';
export type FixingMethod = 'SCREW' | 'EURO';

export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'HINGE_CUP' | 'HINGE_PLATE' | 'ACCESSORY';
  specs: {
    // Hinge Specs
    cupDepth?: number;
    cupDia?: number;
    openingAngle?: number;
    crankConstant?: number;
    pattern?: string;        // '48/6', 'ALU_FRAME'
    isPush?: boolean;

    // Plate Specs
    distance?: number;       // D (0, 2, 3, 6, 9, 12)
    type?: PlateType;
    material?: PlateMaterial;
    fixing?: FixingMethod;
  };
}

export const HAFELE_MASTER_DB = {
  hinges: {
    // =================================================================
    // ALUMINIUM FRAME HINGES (Selection 17 - Page 1)
    // =================================================================
    // Metalla 510 Push สำหรับเฟรมอลูมิเนียมกว้าง 17-24mm
    // Note: รุ่น Push ต้องใช้คู่กับตัวกดกระเด้ง (สั่งแยก)

    h_alu_full: {
      id: 'h_alu_full',
      itemNo: '329.23.810',
      name: 'Metalla 510 Alu Push Full Overlay',
      category: 'HINGE_CUP',
      specs: {
        openingAngle: 105,
        crankConstant: 18,  // K = 18 (Full Overlay)
        pattern: 'ALU_FRAME',
        cupDepth: 0,        // No cup drilling
        isPush: true
      }
    } as HardwareItem,

    h_alu_half: {
      id: 'h_alu_half',
      itemNo: '329.23.830',
      name: 'Metalla 510 Alu Push Half Overlay',
      category: 'HINGE_CUP',
      specs: {
        openingAngle: 105,
        crankConstant: 9,   // K = 9 (Half Overlay)
        pattern: 'ALU_FRAME',
        cupDepth: 0,
        isPush: true
      }
    } as HardwareItem,

    h_alu_inset: {
      id: 'h_alu_inset',
      itemNo: '329.23.840',
      name: 'Metalla 510 Alu Push Inset',
      category: 'HINGE_CUP',
      specs: {
        openingAngle: 105,
        crankConstant: -2,  // K = -2 (Inset)
        pattern: 'ALU_FRAME',
        cupDepth: 0,
        isPush: true
      }
    } as HardwareItem,
  },

  plates: {
    // =================================================================
    // MOUNTING PLATES EXPANSION (Selection 17 - Page 2-5)
    // =================================================================

    // --- 1. Linear Plates (Zinc) - Page 2 ---
    // Screw Fixing (Chipboard)
    pl_lin_sc_d0: {
      id: 'pl_lin_sc_d0',
      itemNo: '329.67.040',
      name: 'Linear Zinc Screw D0',
      category: 'HINGE_PLATE',
      specs: { distance: 0, type: 'LINEAR', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    pl_lin_sc_d3: {
      id: 'pl_lin_sc_d3',
      itemNo: '329.67.043',
      name: 'Linear Zinc Screw D3',
      category: 'HINGE_PLATE',
      specs: { distance: 3, type: 'LINEAR', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    // Euro Fixing
    pl_lin_eu_d0: {
      id: 'pl_lin_eu_d0',
      itemNo: '329.67.000',
      name: 'Linear Zinc Euro D0',
      category: 'HINGE_PLATE',
      specs: { distance: 0, type: 'LINEAR', material: 'ZINC', fixing: 'EURO' }
    } as HardwareItem,

    // --- 2. Cruciform Plates (Zinc) - Page 3 & 5 ---
    // Screw Fixing - Standard Distance
    pl_crux_zn_sc_d0: {
      id: 'pl_crux_zn_sc_d0',
      itemNo: '329.71.500',
      name: 'Cruciform Zinc Screw D0',
      category: 'HINGE_PLATE',
      specs: { distance: 0, type: 'CRUCIFORM', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    pl_crux_zn_sc_d2: {
      id: 'pl_crux_zn_sc_d2',
      itemNo: '329.71.502',
      name: 'Cruciform Zinc Screw D2',
      category: 'HINGE_PLATE',
      specs: { distance: 2, type: 'CRUCIFORM', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    // High Distance (Page 5 - For Blind Corner/Thick Door)
    pl_crux_zn_sc_d9: {
      id: 'pl_crux_zn_sc_d9',
      itemNo: '329.73.608',
      name: 'Cruciform Zinc Screw D9',
      category: 'HINGE_PLATE',
      specs: { distance: 9, type: 'CRUCIFORM', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    pl_crux_zn_sc_d12: {
      id: 'pl_crux_zn_sc_d12',
      itemNo: '329.73.609',
      name: 'Cruciform Zinc Screw D12',
      category: 'HINGE_PLATE',
      specs: { distance: 12, type: 'CRUCIFORM', material: 'ZINC', fixing: 'SCREW' }
    } as HardwareItem,

    // Euro Fixing (Page 3)
    pl_crux_zn_eu_d0: {
      id: 'pl_crux_zn_eu_d0',
      itemNo: '329.71.510',
      name: 'Cruciform Zinc Euro D0',
      category: 'HINGE_PLATE',
      specs: { distance: 0, type: 'CRUCIFORM', material: 'ZINC', fixing: 'EURO' }
    } as HardwareItem,

    // --- 3. Cruciform Plates (Steel) - Page 4 ---
    pl_crux_st_sc_d0: {
      id: 'pl_crux_st_sc_d0',
      itemNo: '329.68.000',
      name: 'Cruciform Steel Screw D0',
      category: 'HINGE_PLATE',
      specs: { distance: 0, type: 'CRUCIFORM', material: 'STEEL', fixing: 'SCREW' }
    } as HardwareItem,
  },

  accessories: {
    // Screw for Alu Frame (Page 1)
    screw_alu: {
      id: 'scr_alu',
      itemNo: '028.01.062',
      name: 'Screw for Alu Frame',
      category: 'ACCESSORY',
      specs: {}
    } as HardwareItem
  }
};
```

### 11.3 Overlay Formula for Aluminium Frame Hinges

```
OVERLAY CALCULATION (Metalla 510 Alu):

Overlay = E + K - D

Where:
- E = Cup Distance (3-7mm for Alu Frame)
- K = Crank Constant (Full=18, Half=9, Inset=-2)
- D = Plate Distance (0, 2, 3, 6, 9, 12mm)

┌─────────────────────────────────────────────────────────────────┐
│  Crank Type   │   K    │  Overlay Range*  │   Use Case         │
├───────────────┼────────┼──────────────────┼────────────────────┤
│  Full Overlay │  +18   │   14-19mm        │  Standard Cabinets │
│  Half Overlay │   +9   │    5-10mm        │  Two-Door Meeting  │
│  Inset        │   -2   │    0-3mm         │  Flush Doors       │
└───────────────┴────────┴──────────────────┴────────────────────┘

*With E=4mm (standard), D=0mm
```

### 11.4 Plate Selection Matrix

```
PLATE SELECTION GUIDE:

┌─────────────────────────────────────────────────────────────────────────┐
│  Type        │  Material  │  Fixing  │  Distance  │  Item No      │ Use │
├──────────────┼────────────┼──────────┼────────────┼───────────────┼─────┤
│  Linear      │  Zinc      │  Screw   │  D0        │  329.67.040   │  A  │
│  Linear      │  Zinc      │  Screw   │  D3        │  329.67.043   │  A  │
│  Linear      │  Zinc      │  Euro    │  D0        │  329.67.000   │  B  │
├──────────────┼────────────┼──────────┼────────────┼───────────────┼─────┤
│  Cruciform   │  Zinc      │  Screw   │  D0        │  329.71.500   │  C  │
│  Cruciform   │  Zinc      │  Screw   │  D2        │  329.71.502   │  C  │
│  Cruciform   │  Zinc      │  Screw   │  D9        │  329.73.608   │  D  │
│  Cruciform   │  Zinc      │  Screw   │  D12       │  329.73.609   │  D  │
│  Cruciform   │  Zinc      │  Euro    │  D0        │  329.71.510   │  E  │
├──────────────┼────────────┼──────────┼────────────┼───────────────┼─────┤
│  Cruciform   │  Steel     │  Screw   │  D0        │  329.68.000   │  F  │
└──────────────┴────────────┴──────────┴────────────┴───────────────┴─────┘

Use Cases:
A = Narrow space, visible edge (Linear)
B = Pre-drilled Euro holes (Linear)
C = Standard application (most common)
D = Thick doors, blind corners, site adjustment
E = Pre-drilled Euro holes (Cruciform)
F = Heavy-duty, steel cabinet
```

### 11.5 Advanced Hinge Engine

```typescript
// src/services/engineering/hingeEngine.ts

import { HAFELE_MASTER_DB, HardwareItem, SystemType, FixingMethod, PlateType } from '../hardware/hafeleDb';

export interface HingePlan {
  isValid: boolean;
  quantity: number;
  positions: number[];
  specs: {
    cup: HardwareItem;
    plate: HardwareItem;
    accessory?: HardwareItem
  };
  meta: {
    cupDistanceE: number;
    plateDistanceD: number;
    fixing: FixingMethod;
    pattern: string;
    actualOverlay: number;
  };
}

interface HingeOptions {
  doorHeight: number;
  doorWeight: number;
  overlay: number;
  system: SystemType;
  preferredFixing?: FixingMethod;   // 'SCREW' (Default) or 'EURO'
  preferredPlateType?: PlateType;   // 'CRUCIFORM' (Default) or 'LINEAR'
}

/**
 * Smart Hardware Selection with Overlay Solver
 */
const selectHardware = (
  system: SystemType,
  overlay: number,
  fixing: FixingMethod,
  plateType: PlateType
) => {
  const db = HAFELE_MASTER_DB.hinges;
  const plates = HAFELE_MASTER_DB.plates;

  // 1. SELECT CUP based on system and overlay
  let cup: HardwareItem;
  let accessory: HardwareItem | undefined;

  if (system === 'HINGE_ALU_105_PUSH') {
    // Aluminium Frame Hinge Selection
    if (overlay >= 14) {
      cup = db.h_alu_full;       // Full Overlay (14-19mm)
    } else if (overlay >= 5) {
      cup = db.h_alu_half;       // Half Overlay (5-10mm)
    } else {
      cup = db.h_alu_inset;      // Inset (0-3mm)
    }

    // Alu frame requires special screws
    accessory = HAFELE_MASTER_DB.accessories.screw_alu;
  } else {
    // Standard hinge selection (fallback)
    cup = db.h_alu_full; // Would normally select from 110/155 etc.
  }

  // 2. SOLVER: Find best E and D combination
  // Formula: Overlay = E + K - D
  const K = cup.specs.crankConstant || 0;

  let bestE = 4;      // Default cup distance
  let bestD = 0;      // Default plate distance
  let minDiff = 999;

  const availPlates = [0, 2, 3, 6, 9, 12];
  const availE = [3, 4, 5, 6, 7];  // Alu Frame E range

  for (const E of availE) {
    for (const D of availPlates) {
      const calcOverlay = E + K - D;
      const diff = Math.abs(calcOverlay - overlay);

      // Preference: Smaller D is better, Standard E (4-5) is better
      if (diff < minDiff || (diff === minDiff && D < bestD)) {
        minDiff = diff;
        bestE = E;
        bestD = D;
      }
    }
  }

  // 3. MATCH PLATE SKU from database
  const allPlates = Object.values(plates);
  let plate = allPlates.find(p =>
    p.specs.distance === bestD &&
    p.specs.fixing === fixing &&
    p.specs.type === plateType
  );

  // Fallback if exact match not found
  if (!plate) {
    plate = allPlates.find(p =>
      p.specs.distance === bestD &&
      p.specs.fixing === fixing
    ) || plates.pl_crux_zn_sc_d0;
  }

  return { cup, plate, accessory, bestD, bestE };
};

/**
 * Calculate complete hinge plan
 */
export const calculateHingePlan = (opts: HingeOptions): HingePlan => {
  const {
    doorHeight,
    doorWeight,
    system,
    overlay,
    preferredFixing = 'SCREW',
    preferredPlateType = 'CRUCIFORM'
  } = opts;

  // 1. Hardware Selection
  const selection = selectHardware(system, overlay, preferredFixing, preferredPlateType);
  const { cup, plate, accessory, bestD, bestE } = selection;

  // 2. Quantity Calculation (Same as standard hinges)
  const qty = (doorHeight > 2100 || doorWeight > 17) ? 5 :
              (doorHeight > 1600 || doorWeight > 12) ? 4 :
              (doorHeight > 900  || doorWeight > 6)  ? 3 : 2;

  // 3. Position Calculation (System 32 aligned)
  const positions: number[] = [];
  const margin = 96;  // 3 × 32mm from edge
  const span = doorHeight - (2 * margin);

  for (let i = 0; i < qty; i++) {
    positions.push(Math.round(margin + (span / (qty - 1)) * i));
  }

  // 4. Calculate actual overlay achieved
  const actualOverlay = bestE + (cup.specs.crankConstant || 0) - bestD;

  return {
    isValid: true,
    quantity: qty,
    positions,
    specs: {
      cup,
      plate,
      accessory
    },
    meta: {
      cupDistanceE: bestE,
      plateDistanceD: bestD,
      actualOverlay,
      fixing: preferredFixing,
      pattern: cup.specs.pattern || '48/6'
    }
  };
};
```

### 11.6 CAM Generator for Advanced Mounting

```typescript
// src/services/cam/generators/hingeOp.ts

import { calculateHingePlan, HingePlan } from '../../engineering/hingeEngine';

export interface MachineOp {
  id: string;
  type: 'DRILL' | 'MILL';
  face: 'FACE' | 'EDGE' | 'BACK';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareId: string;
}

/**
 * Generate drilling operations for hinges
 * Supports both standard cups and aluminium frame mounting
 */
export const generateHingeOps = (
  doorId: string,
  cabinetId: string,
  opts: any
): MachineOp[] => {
  const plan = calculateHingePlan(opts);
  if (!plan.isValid) return [];

  const ops: MachineOp[] = [];
  const { cup, plate, accessory } = plan.specs;

  // Determine Plate Drill Diameter based on fixing method
  // Euro uses 5mm, Chipboard Screw uses 3mm pilot
  const plateHoleDia = plan.meta.fixing === 'EURO' ? 5 : 3;

  plan.positions.forEach((yPos, i) => {

    // === 1. DOOR OPERATIONS ===
    if (plan.meta.pattern === 'ALU_FRAME') {
      // ⚠️ ALUMINIUM FRAME: NO 35mm CUP HOLE!
      // Drill pilot holes for frame screws instead
      const screwCenterX = 20.5;  // Per Häfele spec

      [-24, 24].forEach(offsetY => {
        ops.push({
          id: `${doorId}-alu-pilot-${i}-${offsetY}`,
          type: 'DRILL',
          face: 'FACE',
          x: screwCenterX,
          y: yPos + offsetY,
          diameter: 3.0,  // Pilot hole for Alu Screw
          depth: 10,
          hardwareId: accessory?.itemNo || 'ALU-SCREW'
        });
      });
    } else {
      // STANDARD 35mm CUP HOLE
      const cupCenterX = plan.meta.cupDistanceE + 17.5;

      ops.push({
        id: `${doorId}-cup-${i}`,
        type: 'DRILL',
        face: 'FACE',
        x: cupCenterX,
        y: yPos,
        diameter: 35,
        depth: cup.specs.cupDepth || 12,
        hardwareId: cup.itemNo
      });

      // Screw Holes (48/6 pattern)
      [-24, 24].forEach(offsetY => {
        ops.push({
          id: `${doorId}-cup-scr-${i}-${offsetY}`,
          type: 'DRILL',
          face: 'FACE',
          x: cupCenterX - 6,
          y: yPos + offsetY,
          diameter: 2.5,
          depth: 5,
          hardwareId: 'HINGE-SCREW'
        });
      });
    }

    // === 2. CABINET OPERATIONS (PLATE) ===
    // Drill 2 holes spaced 32mm apart (Offset Y ±16)
    [-16, 16].forEach(offsetY => {
      ops.push({
        id: `${cabinetId}-plt-${i}-${offsetY}`,
        type: 'DRILL',
        face: 'FACE',
        x: 37,  // System 32 edge distance
        y: yPos + offsetY,
        diameter: plateHoleDia,  // ✅ Dynamic: 3mm vs 5mm
        depth: 13,
        hardwareId: plate.itemNo
      });
    });
  });

  return ops;
};
```

### 11.7 Drilling Pattern Diagrams

```
ALUMINIUM FRAME HINGE (Metalla 510 Push):

DOOR PANEL (Alu Frame 17-24mm):
┌─────────────────────────────────────────┐
│                                         │
│     No 35mm cup hole!                   │
│                                         │
│         ●  ← Pilot 3mm @ Y+24           │
│        20.5mm from edge                 │
│         ●  ← Pilot 3mm @ Y-24           │
│                                         │
│     Screw spacing: 48mm (24+24)         │
│                                         │
└─────────────────────────────────────────┘

CABINET SIDE PANEL:
┌─────────────────────────────────────────┐
│                                         │
│         ●  ← Plate hole @ Y+16          │
│   37mm  │                               │
│   from  │  Diameter: 5mm (Euro)         │
│   edge  │            3mm (Screw)        │
│         ●  ← Plate hole @ Y-16          │
│                                         │
│     Hole spacing: 32mm (16+16)          │
│                                         │
└─────────────────────────────────────────┘


STANDARD HINGE (35mm Cup):

DOOR PANEL:
┌─────────────────────────────────────────┐
│                                         │
│         ●  ← Screw 2.5mm @ Y+24         │
│                                         │
│     ◯──────── 35mm Cup @ E+17.5mm       │
│                                         │
│         ●  ← Screw 2.5mm @ Y-24         │
│                                         │
│     Cup center = E + 17.5mm from edge   │
│     Screw offset = -6mm from cup center │
│                                         │
└─────────────────────────────────────────┘
```

### 11.8 Plate Geometry Comparison

```
LINEAR PLATE (Narrow):
┌────┐
│    │
│ ●  │  Width: 12mm
│    │  For narrow spaces
│ ●  │  Visible edge applications
│    │
└────┘

CRUCIFORM PLATE (Standard):
┌────────────┐
│            │
│  ●    ●    │  Width: 35mm
│            │  Most common
│  ●    ●    │  Better stability
│            │
└────────────┘

Distance Options:
┌─────────────────────────────────────────────────────┐
│  D0   │  D2   │  D3   │  D6   │  D9   │  D12  │
├───────┼───────┼───────┼───────┼───────┼───────┤
│  0mm  │  2mm  │  3mm  │  6mm  │  9mm  │  12mm │
│       │       │       │       │       │       │
│ Std   │ Minor │ Minor │ Med   │ Thick │ Max   │
│       │ adj.  │ adj.  │ adj.  │ door  │ adj.  │
└───────┴───────┴───────┴───────┴───────┴───────┘
```

### 11.9 Visual Component

```typescript
// src/components/3d/hardware/MasterHinge.tsx

import React, { useMemo } from 'react';
import { calculateHingePlan } from '../../../services/engineering/hingeEngine';

const mm = (v: number) => v / 1000;

interface MasterHingeProps {
  doorHeight: number;
  doorWeight: number;
  overlay: number;
  system: 'HINGE_ALU_105_PUSH' | 'HINGE_110' | string;
  preferredFixing?: 'SCREW' | 'EURO';
  preferredPlateType?: 'LINEAR' | 'CRUCIFORM';
}

export const MasterHinge: React.FC<MasterHingeProps> = (props) => {
  const plan = useMemo(() => calculateHingePlan(props as any), [props]);

  if (!plan?.isValid) return null;

  const { cup, plate } = plan.specs;

  return (
    <group>
      {plan.positions.map((y, i) => (
        <group key={i} position={[0, mm(y), 0]}>

          {/* CUP Visual */}
          <group position={[mm(21.5), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            {plan.meta.pattern === 'ALU_FRAME' ? (
              // Aluminium Frame Hinge Visual (No Cup)
              <mesh position={[0, mm(-2), 0]}>
                <boxGeometry args={[mm(40), mm(15), mm(3)]} />
                <meshStandardMaterial color="#90A4AE" metalness={0.8} />
              </mesh>
            ) : (
              // Standard Cup Visual
              <mesh>
                <cylinderGeometry args={[mm(17.5), mm(17.5), mm(2), 32]} />
                <meshStandardMaterial color="#CFD8DC" />
              </mesh>
            )}
          </group>

          {/* PLATE Visual */}
          <group position={[mm(-20), 0, mm(15)]}>
            <mesh position={[mm(-25), 0, mm(-5)]}>
              {/* Shape changes based on Plate Type */}
              {plate.specs.type === 'LINEAR' ? (
                // Linear Plate (Narrow)
                <boxGeometry args={[
                  mm(12),
                  mm(48),
                  mm((plate.specs.distance || 0) + 2)
                ]} />
              ) : (
                // Cruciform Plate (Wide)
                <boxGeometry args={[
                  mm(35),
                  mm(48),
                  mm((plate.specs.distance || 0) + 2)
                ]} />
              )}
              <meshStandardMaterial
                color={plate.specs.material === 'STEEL' ? "#B0BEC5" : "#CFD8DC"}
              />
            </mesh>
          </group>

        </group>
      ))}
    </group>
  );
};
```

### 11.10 Quick Reference Tables

**Metalla 510 Alu Push Hinges:**

| Model | Item No | Crank K | Overlay Range | Application |
|-------|---------|---------|---------------|-------------|
| Full Overlay | 329.23.810 | +18 | 14-19mm | Standard cabinets |
| Half Overlay | 329.23.830 | +9 | 5-10mm | Two doors meeting |
| Inset | 329.23.840 | -2 | 0-3mm | Flush doors |

**Mounting Plates Summary:**

| Type | Material | Fixing | Distances Available |
|------|----------|--------|---------------------|
| Linear | Zinc | Screw | D0, D3 |
| Linear | Zinc | Euro | D0 |
| Cruciform | Zinc | Screw | D0, D2, D9, D12 |
| Cruciform | Zinc | Euro | D0 |
| Cruciform | Steel | Screw | D0 |

**Drilling Diameter by Fixing Method:**

| Fixing Method | Cabinet Hole Ø | Door Hole Ø | Notes |
|---------------|----------------|-------------|-------|
| Screw (Chipboard) | 3mm pilot | 35mm cup / 3mm pilot | Most common |
| Euro (Pre-drilled) | 5mm | 35mm cup / 3mm pilot | System cabinets |
| Alu Frame | 3mm pilot (cabinet) | 3mm pilot (frame) | No cup hole |

### 11.11 Complete Implementation Example

```typescript
// Example: Aluminium frame door on standard cabinet

const aluDoorConfig = {
  doorHeight: 700,
  doorWeight: 4,
  overlay: 16,
  system: 'HINGE_ALU_105_PUSH' as const,
  preferredFixing: 'SCREW' as const,
  preferredPlateType: 'CRUCIFORM' as const
};

// Generate plan
const plan = calculateHingePlan(aluDoorConfig);

console.log('=== Aluminium Frame Hinge Plan ===');
console.log('Hinge:', plan.specs.cup.name);          // 'Metalla 510 Alu Push Full'
console.log('Plate:', plan.specs.plate.name);        // 'Cruciform Zinc Screw D0'
console.log('Accessory:', plan.specs.accessory?.name); // 'Screw for Alu Frame'
console.log('Quantity:', plan.quantity);              // 2
console.log('Positions:', plan.positions);            // [96, 604]
console.log('Actual Overlay:', plan.meta.actualOverlay); // 22mm (E=4 + K=18 - D=0)
console.log('Pattern:', plan.meta.pattern);           // 'ALU_FRAME'

// Generate CAM operations
const ops = generateHingeOps('DOOR-001', 'CAB-001', aluDoorConfig);

console.log('\n=== CAM Operations ===');
console.log('Total operations:', ops.length);  // 8 (4 door pilots + 4 plate holes)

// Door operations (Alu Frame - pilot holes only)
const doorOps = ops.filter(op => op.id.includes('DOOR'));
console.log('Door ops:', doorOps.length);      // 4 (2 positions × 2 pilots each)
console.log('Door hole Ø:', doorOps[0].diameter); // 3mm (pilot)

// Cabinet operations (plate holes)
const cabOps = ops.filter(op => op.id.includes('CAB'));
console.log('Cabinet ops:', cabOps.length);    // 4 (2 positions × 2 holes each)
console.log('Cabinet hole Ø:', cabOps[0].diameter); // 3mm (Screw fixing)
```

---

## ส่วนที่ 12: Hinge Specialist Engine - Specialty Hinges (Architecture v8.0)

ระบบ **Hinge Specialist Engine** รองรับบานพับพิเศษครบทุกรูปแบบ จาก Häfele Selection 16 รวมถึง Profile Doors, Rebated Doors, Blind Corner, Angled Applications และ Refrigerator Hinges

### 12.1 Engineering Logic Highlights

1. **Complex Geometry**: รองรับตู้เข้ามุมทุกรูปแบบ (15° ถึง 70° Bi-fold) และ Blind Corner
2. **Material Intelligence**: ปรับความลึกเจาะอัตโนมัติ (9mm บานบังใบ / 13mm บานหนา Profile)
3. **Pattern Awareness**: รองรับระยะรูเจาะสกรูพิเศษ (52/7.5 และ 45/9.5)
4. **Hardware Safety**: บังคับใช้ Plate D=9mm สำหรับ Small Blind Corner

### 12.2 Master Hardware Database - Specialty Hinges

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'SC_8_60' | 'U_12_10' | 'TOFIX_25' | 'LAMELLO_P' | 'DOVETAIL_RAIL'
  // --- STANDARD ---
  | 'HINGE_110' | 'HINGE_155' | 'HINGE_165' | 'HINGE_THIN'
  // --- SPECIALTY (Selection 16) ---
  | 'HINGE_PROFILE_94'   // บานหนา/บานคิ้ว (เจาะลึก 13mm)
  | 'HINGE_REBATED_110'  // บานบังใบ (เจาะตื้น 9mm)
  | 'HINGE_BLIND_SM'     // Blind Corner เล็ก (ใช้ Plate D9)
  | 'HINGE_BLIND_LG'     // Blind Corner ใหญ่
  | 'HINGE_CORNER_70'    // บานพับตู้เข้ามุม (Bi-fold)
  | 'HINGE_ANGLE_15'     // หน้าบานเอียง +15°
  | 'HINGE_ANGLE_24'     // หน้าบานเอียง +24°
  | 'HINGE_ANGLE_30'     // หน้าบานเอียง +30°
  | 'HINGE_ANGLE_37'     // หน้าบานเอียง +37°
  | 'HINGE_ANGLE_45'     // หน้าบานเอียง +45°
  | 'HINGE_FRIDGE';      // ตู้เย็น (Flat Design)

export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'HINGE_CUP' | 'HINGE_PLATE';
  specs: {
    cupDepth: number;       // ความลึกเจาะถ้วย (Critical Spec)
    cupDia: number;         // 35mm
    openingAngle: number;
    crankConstant?: number; // ค่า K
    pattern?: string;       // '48/6' (Std), '52/7.5' (Profile), '45/9.5' (Fridge)
    distance?: number;      // Plate Distance
  };
}

export const HAFELE_SPECIALTY_HINGES = {
  // =================================================================
  // 9.1 PROFILE / THICK DOORS (Selection 16 - Page 1-2)
  // =================================================================
  // ⚠️ Critical: เจาะลึก 13mm | Pattern 52/7.5
  // สำหรับบานหนา >24mm หรือบานคิ้ว (Profile Door)

  h_prof_full: {
    id: 'h_prof_full',
    itemNo: '329.05.605',
    name: 'Profile 94° Full Overlay',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 94,
      cupDepth: 13.0,      // Deep drilling
      cupDia: 35,
      pattern: '52/7.5',   // Special screw pattern
      crankConstant: 19    // K = 19 (Full)
    }
  } as HardwareItem,

  h_prof_half: {
    id: 'h_prof_half',
    itemNo: '329.05.614',
    name: 'Profile 94° Half Overlay',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 94,
      cupDepth: 13.0,
      cupDia: 35,
      pattern: '52/7.5',
      crankConstant: 8     // K = 8 (Half)
    }
  } as HardwareItem,

  h_prof_inset: {
    id: 'h_prof_inset',
    itemNo: '329.05.632',
    name: 'Profile 94° Inset',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 94,
      cupDepth: 13.0,
      cupDia: 35,
      pattern: '52/7.5',
      crankConstant: -1    // K = -1 (Inset)
    }
  } as HardwareItem,

  // =================================================================
  // 9.2 REBATED DOORS (Selection 16 - Page 3)
  // =================================================================
  // ⚠️ Critical: เจาะตื้น 9mm สำหรับบานบังใบ/กระจก

  h_rebated: {
    id: 'h_rebated',
    itemNo: '329.26.611',
    name: 'Rebated 110° Full',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      cupDepth: 9.0,       // Shallow drilling!
      cupDia: 35,
      pattern: '48/6',     // Standard pattern
      crankConstant: 13
    }
  } as HardwareItem,

  // =================================================================
  // 9.3 BLIND CORNER (Selection 16 - Page 5-6)
  // =================================================================
  // Small Blind requires D=9 Plate (Mandatory)

  h_blind_sm: {
    id: 'h_blind_sm',
    itemNo: '329.34.601',
    name: 'Blind Corner Small 94°',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 94,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  h_blind_lg: {
    id: 'h_blind_lg',
    itemNo: '329.35.600',
    name: 'Blind Corner Large 110°',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // =================================================================
  // 9.4 CORNER UNIT / BI-FOLD (Selection 16 - Page 7)
  // =================================================================

  h_corner_70: {
    id: 'h_corner_70',
    itemNo: '329.19.700',
    name: 'Bi-fold Corner 70°',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 70,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // =================================================================
  // 9.5 ANGLED APPLICATIONS (Selection 16 - Page 9-10)
  // =================================================================
  // For angled cabinet faces (diagonal corners, end panels)

  h_angle_15: {
    id: 'h_angle_15',
    itemNo: '329.96.600',
    name: 'Angle Hinge +15°',
    category: 'HINGE_CUP',
    specs: { openingAngle: 94, cupDepth: 11.0, cupDia: 35, pattern: '48/6' }
  } as HardwareItem,

  h_angle_24: {
    id: 'h_angle_24',
    itemNo: '329.96.601',
    name: 'Angle Hinge +24°',
    category: 'HINGE_CUP',
    specs: { openingAngle: 94, cupDepth: 11.0, cupDia: 35, pattern: '48/6' }
  } as HardwareItem,

  h_angle_30: {
    id: 'h_angle_30',
    itemNo: '329.96.602',
    name: 'Angle Hinge +30°',
    category: 'HINGE_CUP',
    specs: { openingAngle: 94, cupDepth: 11.0, cupDia: 35, pattern: '48/6' }
  } as HardwareItem,

  h_angle_37: {
    id: 'h_angle_37',
    itemNo: '329.96.604',
    name: 'Angle Hinge +37°',
    category: 'HINGE_CUP',
    specs: { openingAngle: 94, cupDepth: 11.0, cupDia: 35, pattern: '48/6' }
  } as HardwareItem,

  h_angle_45: {
    id: 'h_angle_45',
    itemNo: '329.96.605',
    name: 'Angle Hinge +45°',
    category: 'HINGE_CUP',
    specs: { openingAngle: 94, cupDepth: 11.0, cupDia: 35, pattern: '48/6' }
  } as HardwareItem,

  // =================================================================
  // 9.6 REFRIGERATOR (Selection 16 - Page 11)
  // =================================================================
  // ⚠️ Pattern 45/9.5 (Special screw spacing)

  h_fridge: {
    id: 'h_fridge',
    itemNo: '329.23.600',
    name: 'Refrigerator 94° Flat',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 94,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '45/9.5'    // Unique screw pattern!
    }
  } as HardwareItem
};

// Special Plates for Blind Corner
export const SPECIALTY_PLATES = {
  d0: {
    id: 'pl_d0',
    itemNo: '329.67.060',
    name: 'Plate D=0',
    category: 'HINGE_PLATE',
    specs: { distance: 0 }
  } as HardwareItem,

  d2: {
    id: 'pl_d2',
    itemNo: '329.67.062',
    name: 'Plate D=2',
    category: 'HINGE_PLATE',
    specs: { distance: 2 }
  } as HardwareItem,

  d3: {
    id: 'pl_d3',
    itemNo: '329.67.063',
    name: 'Plate D=3',
    category: 'HINGE_PLATE',
    specs: { distance: 3 }
  } as HardwareItem,

  // ✅ MANDATORY for Small Blind Corner (Page 6)
  d9_blind: {
    id: 'pl_d9',
    itemNo: '329.88.609',
    name: 'Blind Corner Plate D=9',
    category: 'HINGE_PLATE',
    specs: { distance: 9 }
  } as HardwareItem
};
```

### 12.3 Drilling Depth by Hinge Type

```
CRITICAL DRILLING DEPTHS:

┌─────────────────────────────────────────────────────────────────────────┐
│  Hinge Type         │  Cup Depth  │  Pattern   │  Min Door Thick  │ Use │
├─────────────────────┼─────────────┼────────────┼──────────────────┼─────┤
│  Standard 110/155   │   11mm      │   48/6     │     16mm         │  A  │
│  Profile 94°        │   13mm      │   52/7.5   │     24mm         │  B  │
│  Rebated 110°       │    9mm      │   48/6     │     14mm         │  C  │
│  Blind Corner       │   11mm      │   48/6     │     16mm         │  D  │
│  Angle 15°-45°      │   11mm      │   48/6     │     16mm         │  E  │
│  Bi-fold 70°        │   11mm      │   48/6     │     16mm         │  F  │
│  Refrigerator       │   11mm      │   45/9.5   │     16mm         │  G  │
└─────────────────────┴─────────────┴────────────┴──────────────────┴─────┘

Use Cases:
A = Standard overlay doors (most common)
B = Thick doors >24mm, profile/framed doors
C = Rebated/rabbeted doors, glass frame doors
D = L-shaped corner cabinets
E = Diagonal corner, angled end panels
F = Corner unit bi-fold doors
G = Built-in refrigerator cabinets


⚠️ SAFETY RULE:
Maximum drill depth = Door Thickness - 2mm
(Never drill through the door face!)
```

### 12.4 Screw Pattern Variations

```
SCREW HOLE PATTERNS:

STANDARD (48/6) - Most Hinges:
┌─────────────────────────────────────┐
│                                     │
│         ●  ← Screw @ Y+24           │
│         │                           │
│     ◯───┤  ← 35mm Cup               │
│         │   (6mm offset from center)│
│         ●  ← Screw @ Y-24           │
│                                     │
│   Total spacing: 48mm (24+24)       │
│   X offset: 6mm from cup center     │
└─────────────────────────────────────┘


PROFILE (52/7.5) - Thick Door Hinges:
┌─────────────────────────────────────┐
│                                     │
│         ●  ← Screw @ Y+26           │
│         │                           │
│     ◯───┤  ← 35mm Cup               │
│         │   (7.5mm offset)          │
│         ●  ← Screw @ Y-26           │
│                                     │
│   Total spacing: 52mm (26+26)       │
│   X offset: 7.5mm from cup center   │
└─────────────────────────────────────┘


REFRIGERATOR (45/9.5) - Fridge Hinges:
┌─────────────────────────────────────┐
│                                     │
│         ●  ← Screw @ Y+22.5         │
│         │                           │
│     ◯───┤  ← 35mm Cup               │
│         │   (9.5mm offset)          │
│         ●  ← Screw @ Y-22.5         │
│                                     │
│   Total spacing: 45mm (22.5+22.5)   │
│   X offset: 9.5mm from cup center   │
└─────────────────────────────────────┘
```

### 12.5 Specialty Hinge Selection Engine

```typescript
// src/services/engineering/hingeEngine.ts

import {
  HAFELE_SPECIALTY_HINGES,
  SPECIALTY_PLATES,
  HardwareItem,
  SystemType
} from '../hardware/hafeleDb';

export interface HingePlan {
  isValid: boolean;
  quantity: number;
  positions: number[];
  specs: {
    cup: HardwareItem;
    plate: HardwareItem;
  };
  meta: {
    cupDistanceE: number;
    plateDistanceD: number;
    drillDepth: number;
    pattern: string;
  };
}

interface HingeOptions {
  doorHeight: number;
  doorWeight: number;
  doorThickness: number;
  overlay: number;
  system: SystemType;
}

/**
 * Select specialty hardware based on application
 */
const selectSpecialtyHardware = (
  system: SystemType,
  overlay: number,
  thickness: number
): { cup: HardwareItem; plate: HardwareItem } | null => {
  const db = HAFELE_SPECIALTY_HINGES;
  const plates = SPECIALTY_PLATES;

  switch (system) {
    // === 1. PROFILE / THICK DOOR (>24mm) ===
    case 'HINGE_PROFILE_94':
      if (overlay >= 12) return { cup: db.h_prof_full, plate: plates.d0 };
      if (overlay >= 5)  return { cup: db.h_prof_half, plate: plates.d0 };
      return { cup: db.h_prof_inset, plate: plates.d0 };

    // === 2. REBATED DOOR (Glass/Profile Frame) ===
    case 'HINGE_REBATED_110':
      return { cup: db.h_rebated, plate: plates.d0 };

    // === 3. BLIND CORNER ===
    case 'HINGE_BLIND_SM':
      // ⚠️ MANDATORY: Small Blind requires D=9 Plate!
      return { cup: db.h_blind_sm, plate: plates.d9_blind };
    case 'HINGE_BLIND_LG':
      return { cup: db.h_blind_lg, plate: plates.d3 };

    // === 4. BI-FOLD / CORNER UNIT ===
    case 'HINGE_CORNER_70':
      return { cup: db.h_corner_70, plate: plates.d0 };

    // === 5. ANGLED APPLICATIONS ===
    case 'HINGE_ANGLE_15':
      return { cup: db.h_angle_15, plate: plates.d0 };
    case 'HINGE_ANGLE_24':
      return { cup: db.h_angle_24, plate: plates.d0 };
    case 'HINGE_ANGLE_30':
      return { cup: db.h_angle_30, plate: plates.d0 };
    case 'HINGE_ANGLE_37':
      return { cup: db.h_angle_37, plate: plates.d0 };
    case 'HINGE_ANGLE_45':
      return { cup: db.h_angle_45, plate: plates.d0 };

    // === 6. REFRIGERATOR ===
    case 'HINGE_FRIDGE':
      return { cup: db.h_fridge, plate: plates.d0 };

    default:
      return null; // Not a specialty hinge
  }
};

/**
 * Calculate complete hinge plan for specialty applications
 */
export const calculateSpecialtyHingePlan = (opts: HingeOptions): HingePlan => {
  const { doorHeight, doorWeight, system, overlay, doorThickness } = opts;

  // 1. Select Hardware
  const selection = selectSpecialtyHardware(system, overlay, doorThickness);

  if (!selection) {
    // Fallback to standard hinges
    return {
      isValid: false,
      quantity: 0,
      positions: [],
      specs: { cup: {} as HardwareItem, plate: {} as HardwareItem },
      meta: { cupDistanceE: 0, plateDistanceD: 0, drillDepth: 0, pattern: '' }
    };
  }

  const { cup, plate } = selection;

  // 2. Calculate Quantity (Weight Graph)
  const qty = (doorHeight > 2100 || doorWeight > 17) ? 5 :
              (doorHeight > 1600 || doorWeight > 12) ? 4 :
              (doorHeight > 900  || doorWeight > 6)  ? 3 : 2;

  // 3. Calculate Positions (System 32 aligned)
  const positions: number[] = [];
  const margin = 96;  // 3 × 32mm from edge
  const span = doorHeight - (2 * margin);

  for (let i = 0; i < qty; i++) {
    positions.push(Math.round(margin + (span / (qty - 1)) * i));
  }

  // 4. Safety Check: Maximum drill depth
  const safeDepth = Math.min(
    cup.specs.cupDepth,
    doorThickness - 2  // Never drill through!
  );

  return {
    isValid: true,
    quantity: qty,
    positions,
    specs: { cup, plate },
    meta: {
      cupDistanceE: 4,  // Standard E
      plateDistanceD: plate.specs.distance || 0,
      drillDepth: safeDepth,
      pattern: cup.specs.pattern || '48/6'
    }
  };
};
```

### 12.6 CAM Generator with Pattern Support

```typescript
// src/services/cam/generators/hingeOp.ts

import { calculateSpecialtyHingePlan, HingePlan } from '../../engineering/hingeEngine';

export interface MachineOp {
  id: string;
  type: 'DRILL' | 'MILL';
  face: 'FACE' | 'EDGE' | 'BACK';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareId: string;
}

/**
 * Generate drilling operations for specialty hinges
 * Supports multiple screw patterns (48/6, 52/7.5, 45/9.5)
 */
export const generateSpecialtyHingeOps = (
  doorId: string,
  cabinetId: string,
  opts: any
): MachineOp[] => {
  const plan = calculateSpecialtyHingePlan(opts);
  if (!plan.isValid) return [];

  const ops: MachineOp[] = [];
  const { cup, plate } = plan.specs;

  // Safety: Maximum drill depth check
  const safeDepth = Math.min(plan.meta.drillDepth, opts.doorThickness - 2);

  // Pattern-specific screw offsets
  let screwOffsetY = 24;   // Half of spacing (48/2 = 24)
  let screwOffsetX = 6;    // X offset from cup center

  if (plan.meta.pattern === '52/7.5') {
    // Profile Door Pattern
    screwOffsetY = 26;     // 52/2 = 26
    screwOffsetX = 7.5;
  } else if (plan.meta.pattern === '45/9.5') {
    // Refrigerator Pattern
    screwOffsetY = 22.5;   // 45/2 = 22.5
    screwOffsetX = 9.5;
  }

  plan.positions.forEach((yPos, i) => {

    // === 1. DOOR CUP HOLE ===
    const cupCenterX = 21.5;  // E + 17.5 (Standard E=4)

    ops.push({
      id: `${doorId}-cup-${i}`,
      type: 'DRILL',
      face: 'FACE',
      x: cupCenterX,
      y: yPos,
      diameter: 35,
      depth: safeDepth,  // ✅ Dynamic depth per hinge type
      hardwareId: cup.itemNo
    });

    // === 2. SCREW HOLES (Dynamic Pattern) ===
    [-1, 1].forEach(dir => {
      ops.push({
        id: `${doorId}-scr-${i}-${dir}`,
        type: 'DRILL',
        face: 'FACE',
        x: cupCenterX - screwOffsetX,  // Offset from cup center
        y: yPos + (screwOffsetY * dir),
        diameter: 2.5,
        depth: 5,
        hardwareId: 'HINGE-SCREW'
      });
    });

    // === 3. CABINET PLATE HOLES (Standard System 32) ===
    [-16, 16].forEach(offsetY => {
      ops.push({
        id: `${cabinetId}-plt-${i}-${offsetY}`,
        type: 'DRILL',
        face: 'FACE',
        x: 37,  // Standard X distance
        y: yPos + offsetY,
        diameter: 5,
        depth: 13,
        hardwareId: plate.itemNo
      });
    });
  });

  return ops;
};
```

### 12.7 Application Selection Diagram

```
SPECIALTY HINGE SELECTION FLOWCHART:

                    ┌─────────────────┐
                    │  Door Type?     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Thick/Profile │   │   Rebated     │   │ Corner/Angled │
│   (>24mm)     │   │ (Glass Frame) │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   │
   PROFILE_94          REBATED_110              │
   Depth: 13mm         Depth: 9mm               │
   Pattern: 52/7.5     Pattern: 48/6            │
                                                │
        ┌───────────────────────────────────────┤
        │                                       │
        ▼                                       ▼
┌───────────────┐                      ┌───────────────┐
│ Blind Corner? │                      │ Angle Needed? │
└───────┬───────┘                      └───────┬───────┘
        │                                      │
   ┌────┴────┐                    ┌────┬────┬────┬────┐
   │         │                    │    │    │    │    │
   ▼         ▼                    ▼    ▼    ▼    ▼    ▼
 Small     Large                 15°  24°  30°  37°  45°
(D=9!)    (D=3)                  └────┴────┴────┴────┘
                                        ANGLE_XX


SPECIAL CASES:
┌─────────────────┐       ┌─────────────────┐
│  Bi-fold Door?  │       │  Refrigerator?  │
│                 │       │                 │
│   CORNER_70     │       │   FRIDGE        │
│   Depth: 11mm   │       │   Depth: 11mm   │
│   Pattern: 48/6 │       │   Pattern: 45/9.5│
└─────────────────┘       └─────────────────┘
```

### 12.8 Visual Component with Depth Indicator

```typescript
// src/components/3d/hardware/MasterHinge.tsx

import React, { useMemo } from 'react';
import { calculateSpecialtyHingePlan } from '../../../services/engineering/hingeEngine';

const mm = (v: number) => v / 1000;

interface MasterHingeProps {
  doorHeight: number;
  doorWeight: number;
  doorThickness: number;
  overlay: number;
  system: string;
}

export const MasterHinge: React.FC<MasterHingeProps> = (props) => {
  const plan = useMemo(() => calculateSpecialtyHingePlan(props as any), [props]);

  if (!plan?.isValid) return null;

  const { cup, plate } = plan.specs;

  // Color Coding for QA Visualization
  // Red = Deep (Profile), Green = Shallow (Rebated), Gray = Standard
  const depthColor = plan.meta.drillDepth > 12
    ? "#EF5350"   // Red - Deep (Profile)
    : (plan.meta.drillDepth < 10
      ? "#66BB6A" // Green - Shallow (Rebated)
      : "#B0BEC5" // Gray - Standard
    );

  return (
    <group>
      {plan.positions.map((y, i) => (
        <group key={i} position={[0, mm(y), 0]}>

          {/* CUP Visual */}
          <group position={[mm(21.5), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            {/* Cup Ring */}
            <mesh>
              <cylinderGeometry args={[mm(17.5), mm(17.5), mm(1), 32]} />
              <meshStandardMaterial color="#CFD8DC" />
            </mesh>

            {/* Depth Visualizer (Color-coded) */}
            <mesh position={[0, 0, mm(-plan.meta.drillDepth / 2)]}>
              <cylinderGeometry args={[
                mm(17),
                mm(17),
                mm(plan.meta.drillDepth),
                32
              ]} />
              <meshStandardMaterial
                color={depthColor}
                transparent
                opacity={0.8}
              />
            </mesh>
          </group>

          {/* ARM & PLATE */}
          <group position={[mm(-20), 0, mm(15)]}>
            {/* Hinge Arm */}
            <mesh>
              <boxGeometry args={[mm(60), mm(20), mm(5)]} />
              <meshStandardMaterial color="#90A4AE" />
            </mesh>

            {/* Plate (Height based on D value) */}
            <mesh position={[mm(-25), 0, mm(-5)]}>
              <boxGeometry args={[
                mm(10),
                mm(48),
                mm((plate.specs.distance || 0) + 2)
              ]} />
              <meshStandardMaterial color="#546E7A" />
            </mesh>
          </group>

        </group>
      ))}
    </group>
  );
};
```

### 12.9 Quick Reference Tables

**Specialty Hinges Summary:**

| Type | Item No | Angle | Depth | Pattern | Plate | Application |
|------|---------|-------|-------|---------|-------|-------------|
| Profile Full | 329.05.605 | 94° | 13mm | 52/7.5 | D0 | Thick/Frame doors |
| Profile Half | 329.05.614 | 94° | 13mm | 52/7.5 | D0 | Thick/Frame doors |
| Profile Inset | 329.05.632 | 94° | 13mm | 52/7.5 | D0 | Thick/Frame doors |
| Rebated | 329.26.611 | 110° | 9mm | 48/6 | D0 | Glass frame doors |
| Blind Small | 329.34.601 | 94° | 11mm | 48/6 | **D9** | L-corner (small) |
| Blind Large | 329.35.600 | 110° | 11mm | 48/6 | D3 | L-corner (large) |
| Bi-fold 70° | 329.19.700 | 70° | 11mm | 48/6 | D0 | Corner units |
| Angle +15° | 329.96.600 | 94° | 11mm | 48/6 | D0 | Angled panels |
| Angle +24° | 329.96.601 | 94° | 11mm | 48/6 | D0 | Angled panels |
| Angle +30° | 329.96.602 | 94° | 11mm | 48/6 | D0 | Angled panels |
| Angle +37° | 329.96.604 | 94° | 11mm | 48/6 | D0 | Angled panels |
| Angle +45° | 329.96.605 | 94° | 11mm | 48/6 | D0 | Angled panels |
| Refrigerator | 329.23.600 | 94° | 11mm | 45/9.5 | D0 | Built-in fridge |

**Screw Pattern Reference:**

| Pattern | Y Spacing | X Offset | Cup Dia | Hinge Types |
|---------|-----------|----------|---------|-------------|
| 48/6 | 48mm (±24) | 6mm | 35mm | Standard, Blind, Angle, Corner |
| 52/7.5 | 52mm (±26) | 7.5mm | 35mm | Profile/Thick doors |
| 45/9.5 | 45mm (±22.5) | 9.5mm | 35mm | Refrigerator |

**Minimum Door Thickness:**

| Hinge Type | Min Thickness | Cup Depth | Safety Margin |
|------------|---------------|-----------|---------------|
| Rebated | 14mm | 9mm | 5mm |
| Standard | 16mm | 11mm | 5mm |
| Profile | 24mm | 13mm | 11mm |

### 12.10 Complete Implementation Example

```typescript
// Example: Profile door hinge for thick framed door

const profileDoorConfig = {
  doorHeight: 720,
  doorWeight: 8,
  doorThickness: 28,  // Thick profile door
  overlay: 16,
  system: 'HINGE_PROFILE_94' as const
};

// Generate plan
const plan = calculateSpecialtyHingePlan(profileDoorConfig);

console.log('=== Profile Door Hinge Plan ===');
console.log('Hinge:', plan.specs.cup.name);        // 'Profile 94° Full Overlay'
console.log('Item No:', plan.specs.cup.itemNo);   // '329.05.605'
console.log('Plate:', plan.specs.plate.name);     // 'Plate D=0'
console.log('Quantity:', plan.quantity);           // 3
console.log('Positions:', plan.positions);         // [96, 360, 624]
console.log('Drill Depth:', plan.meta.drillDepth); // 13mm
console.log('Pattern:', plan.meta.pattern);        // '52/7.5'

// Generate CAM operations
const ops = generateSpecialtyHingeOps('DOOR-001', 'CAB-001', profileDoorConfig);

console.log('\n=== CAM Operations ===');
console.log('Total operations:', ops.length);  // 15 (3 cups + 6 screws + 6 plates)

// Verify screw pattern
const screwOps = ops.filter(op => op.id.includes('scr'));
console.log('Screw Y positions:', screwOps.map(op => op.y));
// Profile pattern: Y spacing = 52mm (26 + 26)

// Example: Small Blind Corner (D=9 required)
const blindCornerConfig = {
  doorHeight: 600,
  doorWeight: 5,
  doorThickness: 18,
  overlay: 12,
  system: 'HINGE_BLIND_SM' as const
};

const blindPlan = calculateSpecialtyHingePlan(blindCornerConfig);
console.log('\n=== Blind Corner Plan ===');
console.log('Plate:', blindPlan.specs.plate.name);     // 'Blind Corner Plate D=9'
console.log('Plate D:', blindPlan.meta.plateDistanceD); // 9 (MANDATORY!)
```

---

## ส่วนที่ 13: Hinge Kinematics Engine - Häfele Metalla 510 Standard (Architecture v7.0)

ระบบ **Hinge Kinematics Engine** รองรับบานพับ Häfele Metalla 510 ครบทุก Series (Standard, 155°, 165°, Thin Door, Blind Corner) จาก Selection 15 พร้อมระบบคำนวณอัตโนมัติระดับวิศวกรรม

### 13.1 Engineering Logic Highlights

1. **Smart Balancing**: คำนวณจำนวนบานพับ (2-5 ตัว) อัตโนมัติตามกราฟน้ำหนักและความสูงหน้าบาน
2. **Safety Depth Guard**: ตรวจสอบความหนาบาน หากเป็น Thin Door (<15mm) สลับไปใช้รุ่นถ้วยตื้น 8.0mm
3. **Overlay Solver**: คำนวณหาคู่ระยะเจาะ (Cup E) และฐานรอง (Plate D) จากสูตร `Overlay = E + K - D`
4. **Application Aware**: เลือกรุ่น 155° Zero Protrusion อัตโนมัติเมื่อมีลิ้นชักภายใน

### 13.2 Master Hardware Database - Standard Hinges

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'SC_8_60' | 'U_12_10' | 'TOFIX_25' | 'LAMELLO_P' | 'DOVETAIL_RAIL'
  // HINGE SYSTEMS
  | 'HINGE_110'      // Standard 110°
  | 'HINGE_155'      // Zero Protrusion (ลิ้นชักใน)
  | 'HINGE_165'      // Wide Angle
  | 'HINGE_THIN'     // Thin Door (เจาะตื้น 8mm)
  | 'HINGE_BLIND';   // Blind Corner

export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'HINGE_CUP' | 'HINGE_PLATE';
  specs: {
    // Hinge Specs
    cupDepth?: number;       // 11.0-13.5mm (Standard) vs 8.0mm (Thin)
    cupDia?: number;         // 35mm
    openingAngle?: number;   // 110, 155, 165
    crankConstant?: number;  // ค่า K สำหรับคำนวณ Overlay
    pattern?: string;        // "48/6" (Standard Pattern)

    // Plate Specs
    distance?: number;       // ความสูงฐาน D (0, 2, 3)
  };
}

export const HAFELE_STANDARD_HINGES = {
  // =================================================================
  // METALLA 510 HINGES (Selection 15)
  // =================================================================

  // --- 1. Standard 110° Soft Close (Page 14) ---
  // Full Overlay (ทับขอบ) -> K = 13
  h110_full: {
    id: 'h110_full',
    itemNo: '329.17.600',
    name: 'Metalla 510 110° Full Overlay',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      crankConstant: 13,    // K for Overlay calculation
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // Half Overlay (กลางขอบ) -> K = 4
  h110_half: {
    id: 'h110_half',
    itemNo: '329.17.602',
    name: 'Metalla 510 110° Half Overlay',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      crankConstant: 4,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // Inset (ฝังใน) -> K = -5
  h110_inset: {
    id: 'h110_inset',
    itemNo: '329.17.603',
    name: 'Metalla 510 110° Inset',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      crankConstant: -5,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // --- 2. Wide Angle 155° Zero Protrusion (Page 12) ---
  // สำหรับตู้ที่มีลิ้นชักภายใน (Internal Drawers)
  h155_full: {
    id: 'h155_full',
    itemNo: '329.29.217',
    name: 'Metalla 510 155° Zero Protrusion',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 155,
      crankConstant: 13,
      cupDepth: 11.5,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // --- 3. Thin Door 105° (Page 15) ---
  // ⚠️ CRITICAL: เจาะลึกเพียง 8.0mm (สำหรับหน้าบานหนา 10-16mm)
  h_thin_full: {
    id: 'h_thin_full',
    itemNo: '329.28.600',
    name: 'Metalla 510 Thin Door 105°',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 105,
      crankConstant: 13,
      cupDepth: 8.0,        // Shallow drilling!
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // --- 4. Wide Angle 165° (Page 16) ---
  h165_full: {
    id: 'h165_full',
    itemNo: '329.07.700',
    name: 'Metalla 510 165° Full Overlay',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 165,
      crankConstant: 13,
      cupDepth: 11.0,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,

  // --- 5. Blind Corner (Page 10) ---
  h_blind: {
    id: 'h_blind',
    itemNo: '329.11.705',
    name: 'Metalla 510 Blind Corner',
    category: 'HINGE_CUP',
    specs: {
      openingAngle: 110,
      crankConstant: -99,   // Special (not applicable)
      cupDepth: 11.5,
      cupDia: 35,
      pattern: '48/6'
    }
  } as HardwareItem,
};

// --- MOUNTING PLATES (Page 8) ---
export const STANDARD_PLATES = {
  d0: {
    id: 'plate_d0',
    itemNo: '329.67.060',
    name: 'Mounting Plate D=0',
    category: 'HINGE_PLATE',
    specs: { distance: 0 }
  } as HardwareItem,

  d2: {
    id: 'plate_d2',
    itemNo: '329.67.062',
    name: 'Mounting Plate D=2',
    category: 'HINGE_PLATE',
    specs: { distance: 2 }
  } as HardwareItem,

  d3: {
    id: 'plate_d3',
    itemNo: '329.67.063',
    name: 'Mounting Plate D=3',
    category: 'HINGE_PLATE',
    specs: { distance: 3 }
  } as HardwareItem
};
```

### 13.3 Overlay Calculation Formula

```
OVERLAY FORMULA (Metalla 510 Standard):

Overlay = E + K - D

Where:
- E = Cup Distance from door edge (3-6mm)
- K = Crank Constant (depends on hinge type)
- D = Plate Distance (0, 2, 3mm)

┌─────────────────────────────────────────────────────────────────────────┐
│  Hinge Type          │   K    │  Typical Overlay  │   Application       │
├──────────────────────┼────────┼───────────────────┼─────────────────────┤
│  110° Full Overlay   │  +13   │   15-19mm         │  Standard cabinets  │
│  110° Half Overlay   │   +4   │    6-10mm         │  Two doors meeting  │
│  110° Inset          │   -5   │   -2 to +2mm      │  Flush doors        │
│  155° Zero Protrusion│  +13   │   15-19mm         │  Internal drawers   │
│  165° Wide Angle     │  +13   │   15-19mm         │  Corner access      │
│  105° Thin Door      │  +13   │   15-19mm         │  Thin panels <15mm  │
└──────────────────────┴────────┴───────────────────┴─────────────────────┘


SOLVER EXAMPLE:
Target Overlay = 16mm
Using 110° Full (K=13)

Try E=3, D=0: Overlay = 3 + 13 - 0 = 16mm ✅ Perfect!
Try E=5, D=2: Overlay = 5 + 13 - 2 = 16mm ✅ Also works!
```

### 13.4 Hinge Quantity Graph

```
HINGE QUANTITY BY HEIGHT & WEIGHT (Page 1):

┌─────────────────────────────────────────────────────────────────────────┐
│  Door Height (mm)    │  ≤6kg  │  ≤12kg  │  ≤17kg  │  >17kg  │
├──────────────────────┼────────┼─────────┼─────────┼─────────┤
│  ≤900mm              │   2    │    2    │    3    │    3    │
│  ≤1200mm             │   2    │    3    │    3    │    4    │
│  ≤1600mm             │   3    │    3    │    4    │    4    │
│  ≤2100mm             │   3    │    4    │    4    │    5    │
│  >2100mm             │   4    │    4    │    5    │    5    │
└──────────────────────┴────────┴─────────┴─────────┴─────────┘

Formula (Simplified):
qty = (height > 2100 || weight > 17) ? 5 :
      (height > 1600 || weight > 12) ? 4 :
      (height > 900  || weight > 6)  ? 3 : 2;
```

### 13.5 Hinge Kinematics Engine

```typescript
// src/services/engineering/hingeEngine.ts

import {
  HAFELE_STANDARD_HINGES,
  STANDARD_PLATES,
  HardwareItem,
  SystemType
} from '../hardware/hafeleDb';

export interface HingePlan {
  isValid: boolean;
  quantity: number;
  positions: number[];  // Y positions from bottom edge
  specs: {
    cup: HardwareItem;
    plate: HardwareItem;
  };
  meta: {
    cupDistanceE: number;    // 3-6mm
    plateDistanceD: number;  // 0, 2, 3mm
    actualOverlay: number;
  };
}

interface HingeOptions {
  doorHeight: number;
  doorWeight: number;       // kg
  doorThickness: number;    // mm
  overlay: number;          // Target overlay (e.g., 16mm)
  system?: SystemType;
  isInternalDrawer?: boolean;
}

/**
 * Calculate hinge quantity based on height and weight graph
 */
const getHingeCount = (height: number, weight: number): number => {
  if (height > 2100 || weight > 17) return 5;
  if (height > 1600 || weight > 12) return 4;
  if (height > 900  || weight > 6)  return 3;
  return 2;
};

/**
 * Select appropriate hinge based on application
 */
const selectHinge = (
  system: SystemType,
  overlay: number,
  isThinDoor: boolean,
  hasInternalDrawer: boolean
): HardwareItem => {
  const db = HAFELE_STANDARD_HINGES;

  // ✅ Safety: Force Thin Door Hinge (8mm depth) for thin panels
  if (isThinDoor) return db.h_thin_full;

  // Application-specific selection
  if (hasInternalDrawer || system === 'HINGE_155') return db.h155_full;
  if (system === 'HINGE_165') return db.h165_full;
  if (system === 'HINGE_BLIND') return db.h_blind;

  // Standard 110° selection based on overlay
  if (overlay >= 10) return db.h110_full;   // Full Overlay
  if (overlay >= 0)  return db.h110_half;   // Half Overlay
  return db.h110_inset;                      // Inset
};

/**
 * Calculate complete hinge plan with Overlay Solver
 */
export const calculateStandardHingePlan = (opts: HingeOptions): HingePlan => {
  const {
    doorHeight,
    doorWeight,
    doorThickness,
    overlay,
    system = 'HINGE_110',
    isInternalDrawer = false
  } = opts;

  // 1. Check Thin Door condition (<15mm = thin)
  const isThinDoor = doorThickness < 15;

  // 2. Calculate quantity from graph
  const qty = getHingeCount(doorHeight, doorWeight);

  // 3. Select hardware
  const cup = selectHinge(system, overlay, isThinDoor, isInternalDrawer);
  const K = cup.specs.crankConstant || 0;

  // 4. SOLVER: Find best E (3-6mm) and D (0,2,3) combination
  // Formula: Overlay = E + K - D
  let bestE = 3;
  let bestD = 0;
  let minDiff = 999;

  const availPlates = [0, 2, 3];
  const availE = [3, 4, 5, 6];

  for (const E of availE) {
    for (const D of availPlates) {
      const calcOverlay = E + K - D;
      const diff = Math.abs(calcOverlay - overlay);

      if (diff < minDiff) {
        minDiff = diff;
        bestE = E;
        bestD = D;
      }
    }
  }

  // 5. Map D to Plate item
  let plate = STANDARD_PLATES.d0;
  if (bestD === 2) plate = STANDARD_PLATES.d2;
  if (bestD === 3) plate = STANDARD_PLATES.d3;

  // 6. Calculate positions (System 32 aligned)
  const positions: number[] = [];
  const margin = 96;  // 32 × 3mm from edges

  if (qty === 2) {
    positions.push(margin, doorHeight - margin);
  } else {
    const span = doorHeight - (2 * margin);
    const step = span / (qty - 1);

    for (let i = 0; i < qty; i++) {
      const rawY = margin + (step * i);
      positions.push(Math.round(rawY));
    }
  }

  return {
    isValid: minDiff <= 2.5,  // Accept up to 2.5mm error (adjustable on-site)
    quantity: qty,
    positions,
    specs: { cup, plate },
    meta: {
      cupDistanceE: bestE,
      plateDistanceD: bestD,
      actualOverlay: bestE + K - bestD
    }
  };
};
```

### 13.6 CAM Generator for Standard Hinges

```typescript
// src/services/cam/generators/hingeOp.ts

import { calculateStandardHingePlan, HingePlan } from '../../engineering/hingeEngine';

export interface MachineOp {
  id: string;
  type: 'DRILL' | 'MILL';
  face: 'FACE' | 'EDGE' | 'BACK';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareId: string;
}

/**
 * Generate drilling operations for standard hinges
 * Pattern 48/6 for all Metalla 510 series
 */
export const generateStandardHingeOps = (
  doorId: string,
  cabinetId: string,
  opts: any
): MachineOp[] => {
  const plan = calculateStandardHingePlan(opts);
  if (!plan.isValid) return [];

  const ops: MachineOp[] = [];
  const { cup, plate } = plan.specs;

  plan.positions.forEach((yPos, i) => {

    // === 1. DOOR OPERATIONS (CUP) ===
    // Center X = Cup Distance E + Radius (17.5mm)
    const cupCenterX = plan.meta.cupDistanceE + 17.5;

    // 1.1 Main Cup Hole (35mm diameter)
    ops.push({
      id: `${doorId}-cup-${i}`,
      type: 'DRILL',
      face: 'FACE',
      x: cupCenterX,
      y: yPos,
      diameter: 35,
      // ✅ CRITICAL: Use depth from spec (8mm for Thin, 11mm for Standard)
      depth: cup.specs.cupDepth || 11,
      hardwareId: cup.itemNo
    });

    // 1.2 Screw Holes (Pattern 48/6)
    // 48mm apart (Y ±24mm), Offset 6mm from center X
    const screwX = cupCenterX - 6;
    [-24, 24].forEach(offsetY => {
      ops.push({
        id: `${doorId}-cup-screw-${i}-${offsetY}`,
        type: 'DRILL',
        face: 'FACE',
        x: screwX,
        y: yPos + offsetY,
        diameter: 2.5,  // Pilot hole
        depth: 5,
        hardwareId: 'HINGE-SCREW'
      });
    });

    // === 2. CABINET OPERATIONS (PLATE) ===
    // System 32 mounting, X = 37mm from front edge
    const plateX = 37;
    [-16, 16].forEach(offsetY => {
      ops.push({
        id: `${cabinetId}-plate-${i}-${offsetY}`,
        type: 'DRILL',
        face: 'FACE',
        x: plateX,
        y: yPos + offsetY,
        diameter: 5,  // System 32 hole
        depth: 13,
        hardwareId: plate.itemNo
      });
    });
  });

  return ops;
};
```

### 13.7 Drilling Pattern Diagram

```
STANDARD HINGE DRILLING (Pattern 48/6):

DOOR PANEL (Face View):
┌─────────────────────────────────────────┐
│                                         │
│         ●  ← Screw 2.5mm @ Y+24         │
│         │     (X = E + 17.5 - 6)        │
│         │                               │
│     ◯───┴───── 35mm Cup                 │
│         │      (X = E + 17.5mm)         │
│         │      Depth = 8mm (Thin)       │
│         │             or 11mm (Std)     │
│         ●  ← Screw 2.5mm @ Y-24         │
│                                         │
│   E = Cup distance from edge (3-6mm)    │
│   Pattern spacing: 48mm (24+24)         │
│   Screw offset: 6mm from cup center     │
└─────────────────────────────────────────┘


CABINET SIDE PANEL (Face View):
┌─────────────────────────────────────────┐
│                                         │
│         ●  ← Plate hole @ Y+16          │
│   37mm  │     (5mm dia, 13mm deep)      │
│   from  │                               │
│   edge  │                               │
│         │                               │
│         ●  ← Plate hole @ Y-16          │
│                                         │
│   Plate spacing: 32mm (16+16)           │
│   Standard System 32 pattern            │
└─────────────────────────────────────────┘
```

### 13.8 Thin Door Safety System

```
THIN DOOR DETECTION & SAFETY:

┌─────────────────────────────────────────────────────────────────────────┐
│  Door Thickness  │  Hinge Type       │  Cup Depth  │  Safety Status     │
├──────────────────┼───────────────────┼─────────────┼────────────────────┤
│  <10mm           │  NOT SUPPORTED    │    N/A      │  ⛔ Error          │
│  10-14mm         │  THIN DOOR 105°   │   8.0mm     │  ✅ Auto-selected  │
│  15-17mm         │  STANDARD 110°    │  11.0mm     │  ✅ Normal         │
│  18-24mm         │  STANDARD 110°    │  11.0mm     │  ✅ Normal         │
│  >24mm           │  PROFILE (v8.0)   │  13.0mm     │  ✅ See Section 12 │
└──────────────────┴───────────────────┴─────────────┴────────────────────┘


SAFETY RULE:
If doorThickness < 15mm:
  → Force select THIN DOOR hinge (8mm cup depth)
  → Prevents drilling through door face!

MINIMUM CLEARANCE:
- Thin Door: 10mm panel - 8mm cup = 2mm clearance ✅
- Standard:  16mm panel - 11mm cup = 5mm clearance ✅

⚠️ NEVER drill cup depth > (doorThickness - 2mm)
```

### 13.9 Visual Component

```typescript
// src/components/3d/hardware/MasterHinge.tsx

import React, { useMemo } from 'react';
import { calculateStandardHingePlan } from '../../../services/engineering/hingeEngine';

const mm = (v: number) => v / 1000;

interface MasterHingeProps {
  doorHeight: number;
  doorWeight: number;
  doorThickness: number;
  overlay: number;
  system?: string;
  isInternalDrawer?: boolean;
}

export const MasterHinge: React.FC<MasterHingeProps> = (props) => {
  const plan = useMemo(() => calculateStandardHingePlan(props as any), [props]);

  if (!plan?.isValid) return null;

  const { cup, plate } = plan.specs;

  // Color coding: Orange = Thin Door (warning), Gray = Standard
  const cupColor = cup.specs.cupDepth! < 10 ? "#FF9800" : "#CFD8DC";

  return (
    <group>
      {plan.positions.map((y, i) => (
        <group key={i} position={[0, mm(y), 0]}>

          {/* 1. Cup on Door */}
          <group
            position={[mm(plan.meta.cupDistanceE + 17.5), 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            {/* Cup Ring */}
            <mesh>
              <cylinderGeometry args={[mm(17.5), mm(17.5), mm(2), 32]} />
              <meshStandardMaterial color={cupColor} metalness={0.6} />
            </mesh>

            {/* Cup Body (shows depth) */}
            <mesh position={[0, mm(-cup.specs.cupDepth! / 2), 0]}>
              <cylinderGeometry args={[
                mm(17),
                mm(17),
                mm(cup.specs.cupDepth!),
                32
              ]} />
              <meshStandardMaterial color="#90A4AE" />
            </mesh>
          </group>

          {/* 2. Arm & Plate on Cabinet */}
          <group position={[mm(-20), 0, mm(15)]}>
            {/* Hinge Arm */}
            <mesh>
              <boxGeometry args={[mm(60), mm(20), mm(5)]} />
              <meshStandardMaterial color="#B0BEC5" />
            </mesh>

            {/* Mounting Plate */}
            <mesh position={[mm(-25), 0, mm(-5)]}>
              <boxGeometry args={[
                mm(10),
                mm(45),
                mm((plate.specs.distance || 0) + 2)
              ]} />
              <meshStandardMaterial color="#78909C" />
            </mesh>
          </group>

        </group>
      ))}
    </group>
  );
};
```

### 13.10 Quick Reference Tables

**Metalla 510 Standard Hinges:**

| Type | Item No | Angle | K | Depth | Application |
|------|---------|-------|---|-------|-------------|
| 110° Full | 329.17.600 | 110° | +13 | 11mm | Standard full overlay |
| 110° Half | 329.17.602 | 110° | +4 | 11mm | Two doors meeting |
| 110° Inset | 329.17.603 | 110° | -5 | 11mm | Flush doors |
| 155° Zero | 329.29.217 | 155° | +13 | 11.5mm | Internal drawers |
| 165° Wide | 329.07.700 | 165° | +13 | 11mm | Corner access |
| 105° Thin | 329.28.600 | 105° | +13 | 8mm | Thin doors <15mm |
| Blind Corner | 329.11.705 | 110° | N/A | 11.5mm | L-shaped corners |

**Standard Mounting Plates:**

| Plate | Item No | Distance D | Use Case |
|-------|---------|------------|----------|
| D=0 | 329.67.060 | 0mm | Standard (most common) |
| D=2 | 329.67.062 | 2mm | Fine overlay adjustment |
| D=3 | 329.67.063 | 3mm | Reduced overlay |

**Overlay Quick Calculator:**

| E (mm) | K | D (mm) | Overlay Result |
|--------|---|--------|----------------|
| 3 | +13 | 0 | 16mm (Full) |
| 4 | +13 | 0 | 17mm (Full) |
| 5 | +13 | 2 | 16mm (Full) |
| 3 | +4 | 0 | 7mm (Half) |
| 5 | +4 | 2 | 7mm (Half) |
| 3 | -5 | 0 | -2mm (Inset) |
| 6 | -5 | 3 | -2mm (Inset) |

### 13.11 Complete Implementation Example

```typescript
// Example: Standard cabinet door with hinge plan

const standardDoorConfig = {
  doorHeight: 720,
  doorWeight: 8,
  doorThickness: 18,
  overlay: 16,
  system: 'HINGE_110' as const,
  isInternalDrawer: false
};

// Generate plan
const plan = calculateStandardHingePlan(standardDoorConfig);

console.log('=== Standard Hinge Plan ===');
console.log('Hinge:', plan.specs.cup.name);        // 'Metalla 510 110° Full Overlay'
console.log('Item No:', plan.specs.cup.itemNo);   // '329.17.600'
console.log('Plate:', plan.specs.plate.name);     // 'Mounting Plate D=0'
console.log('Quantity:', plan.quantity);           // 3
console.log('Positions:', plan.positions);         // [96, 360, 624]
console.log('Cup Depth:', plan.specs.cup.specs.cupDepth); // 11mm
console.log('Actual Overlay:', plan.meta.actualOverlay);   // 16mm

// Generate CAM operations
const ops = generateStandardHingeOps('DOOR-001', 'CAB-001', standardDoorConfig);

console.log('\n=== CAM Operations ===');
console.log('Total operations:', ops.length);  // 15 (3 cups + 6 screws + 6 plates)

// Verify cup depth
const cupOps = ops.filter(op => op.id.includes('cup-') && !op.id.includes('screw'));
console.log('Cup depth:', cupOps[0].depth);  // 11mm (Standard)


// Example: Thin door (auto-safety switch)
const thinDoorConfig = {
  doorHeight: 600,
  doorWeight: 3,
  doorThickness: 12,  // Thin door!
  overlay: 16,
  system: 'HINGE_110' as const
};

const thinPlan = calculateStandardHingePlan(thinDoorConfig);

console.log('\n=== Thin Door Plan ===');
console.log('Hinge:', thinPlan.specs.cup.name);  // 'Metalla 510 Thin Door 105°'
console.log('Cup Depth:', thinPlan.specs.cup.specs.cupDepth); // 8mm (SAFETY!)
console.log('Clearance:', thinDoorConfig.doorThickness - thinPlan.specs.cup.specs.cupDepth!);
// Output: 4mm clearance ✅


// Example: Cabinet with internal drawers (155° Zero Protrusion)
const drawerCabinetConfig = {
  doorHeight: 720,
  doorWeight: 6,
  doorThickness: 18,
  overlay: 16,
  system: 'HINGE_155' as const,
  isInternalDrawer: true
};

const drawerPlan = calculateStandardHingePlan(drawerCabinetConfig);

console.log('\n=== Drawer Cabinet Plan ===');
console.log('Hinge:', drawerPlan.specs.cup.name);  // 'Metalla 510 155° Zero Protrusion'
console.log('Angle:', drawerPlan.specs.cup.specs.openingAngle);  // 155°
// Zero protrusion allows drawers to fully extend!
```

---

## ส่วนที่ 14: Dovetail Linear Engine (Architecture v6.0)

ระบบ **Ixconnect Dovetail** ของ Häfele เป็นระบบยึดแผ่นชั้นแบบ "รางลิ้นราง" (Dovetail Slot) ที่ให้ความแข็งแรงสูงและถอดประกอบง่าย เหมาะสำหรับชั้นวางของที่รับน้ำหนักมาก

### 14.1 Advanced Linear Logic

ระบบ Dovetail มีความซับซ้อนกว่าระบบ Connector แบบจุด เพราะต้องจัดการ 2 มิติ:

```
DUAL INSTALLATION MODES:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  MODE 1a: RAIL SYSTEM (DOVETAIL_RAIL)                          │
│  ─────────────────────────────────────                          │
│  ฝังรางอลูมิเนียมในร่องที่กัดไว้                                │
│                                                                 │
│  ┌────────────────────────────────────┐                        │
│  │  ╔══════════════════════════════╗  │ ← Aluminium Rail       │
│  │  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  │   (261.30.030)         │
│  │  ╚══════════════════════════════╝  │                        │
│  │           SHELF EDGE               │                        │
│  └────────────────────────────────────┘                        │
│                                                                 │
│  MODE 1b: DIRECT SYSTEM (DOVETAIL_DIRECT)                      │
│  ─────────────────────────────────────────                      │
│  กัดร่อง Dovetail ลงบนไม้โดยตรง (ไม่ใช้ราง)                    │
│                                                                 │
│  ┌────────────────────────────────────┐                        │
│  │  ╲══════════════════════════════╱  │ ← Routed Groove        │
│  │   ╲▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓╱   │   (Direct in Wood)     │
│  │    ╲════════════════════════╱    │                        │
│  │           SHELF EDGE               │                        │
│  └────────────────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

DYNAMIC SPACING:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. Rail Fixing Screws: ทุก 200mm ตลอดความยาวราง               │
│     ├──200mm──├──200mm──├──200mm──├──200mm──┤                  │
│     ●         ●         ●         ●         ●                   │
│                                                                 │
│  2. Sleeve Distribution: 6 ตัว/เมตร (กระจายอัตโนมัติ)          │
│     ├───166mm───├───166mm───├───166mm───├───166mm───┤          │
│     ▣           ▣           ▣           ▣           ▣           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 14.2 Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'MINIFIX_12' | 'MAXIFIX_35'
  | 'SC_8_60' | 'U_12_10' | 'CC_8_5_30' | 'TOFIX_25'
  | 'LAMELLO_P'
  | 'DOVETAIL_RAIL'    // แบบฝังรางอลูมิเนียม (Installation 1a)
  | 'DOVETAIL_DIRECT'; // แบบกัดร่องไม้โดยตรง (Installation 1b)

export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'CONNECTOR_DOVETAIL' | 'RAIL_DOVETAIL' | string;
  specs: {
    drillDepth: number;
    width?: number;          // ความกว้างร่อง/ฐาน
    height?: number;         // ความลึกร่อง
    length?: number;         // ความยาวตัว
    dowelCount?: number;     // จำนวนเดือยนำศูนย์ (0, 1, 2)
    dowelSpacing?: number;   // ระยะห่างเดือย (32mm)
    screwInterval?: number;  // ระยะแนะนำการยิงสกรูราง (200mm)
    isLinear?: boolean;      // เป็นสินค้าเส้นยาว
  };
}

export const DOVETAIL_HARDWARE = {
  // =================================================================
  // 1. RAIL (ตัวผู้ - ฝังที่ชั้นวาง)
  // =================================================================
  rail_alu_raw: {
    id: 'dt_rail_raw',
    itemNo: '261.30.030',
    name: 'Alu Dovetail Rail (3000mm)',
    category: 'RAIL_DOVETAIL',
    specs: {
      isLinear: true,
      width: 12,          // กว้าง 12mm
      height: 10.5,       // ลึก 10.5mm
      length: 3000,
      screwInterval: 200, // ยิงสกรูทุกๆ 200mm
      drillDepth: 10.5
    }
  } as HardwareItem,

  // =================================================================
  // 2. SLEEVES (ตัวเมีย - ติดที่แผงข้าง)
  // =================================================================

  // 2.1 Short Sleeve (Standard) - ยิงสกรูผิวหน้า
  sleeve_std: {
    id: 'dt_sleeve_std',
    itemNo: '261.30.790',
    name: 'Dovetail Sleeve (Short)',
    category: 'CONNECTOR_DOVETAIL',
    specs: {
      length: 9,
      width: 9,
      drillDepth: 0,      // Surface Mount
      dowelCount: 0
    }
  } as HardwareItem,

  // 2.2 Long Sleeve (41mm) - Variant 1: ไม่มีเดือย
  sleeve_long_0d: {
    id: 'dt_long_0d',
    itemNo: '261.30.780',
    name: 'Long Sleeve 41mm (No Dowel)',
    category: 'CONNECTOR_DOVETAIL',
    specs: {
      length: 41,
      width: 9,
      drillDepth: 0,
      dowelCount: 0
    }
  } as HardwareItem,

  // 2.3 Long Sleeve (41mm) - Variant 2: มีเดือยกลาง 1 ตัว
  sleeve_long_1d: {
    id: 'dt_long_1d',
    itemNo: '261.30.781',
    name: 'Long Sleeve 41mm (1 Dowel)',
    category: 'CONNECTOR_DOVETAIL',
    specs: {
      length: 41,
      width: 9,
      drillDepth: 5,
      dowelCount: 1,
      dowelSpacing: 0
    }
  } as HardwareItem,

  // 2.4 Long Sleeve (41mm) - Variant 3: มีเดือย 2 ตัว (นิยมสุด)
  sleeve_long_2d: {
    id: 'dt_long_2d',
    itemNo: '261.30.782',
    name: 'Long Sleeve 41mm (2 Dowels)',
    category: 'CONNECTOR_DOVETAIL',
    specs: {
      length: 41,
      width: 9,
      drillDepth: 5,
      dowelCount: 2,
      dowelSpacing: 32
    }
  } as HardwareItem
};
```

### 14.3 Dovetail Engineering Engine

```typescript
// src/services/engineering/dovetailEngine.ts
import { DOVETAIL_HARDWARE, HardwareItem, SystemType } from '../hardware/hafeleDb';

export interface DovetailPlan {
  isValid: boolean;
  system: SystemType;
  specs: {
    rail: HardwareItem;    // Rail (ตัวผู้)
    sleeve: HardwareItem;  // Sleeve (ตัวเมีย)
  };
  sleevePositions: {
    x: number;
    rotationY: number;
    dowelOffsets: number[]
  }[];
  meta: {
    railLength: number;
    railFixingPoints: number[]; // จุดยิงสกรูยึดราง
    grooveSpec: { w: number; d: number; l: number };
    sleeveCount: number;
    minThickness: number;
  };
}

export type SleeveVariant = 'SHORT' | 'LONG_0D' | 'LONG_1D' | 'LONG_2D';

interface DovetailOptions {
  length: number;           // ความยาวชั้นวาง
  thickness: number;        // ความหนาชั้นวาง
  system: SystemType;       // DOVETAIL_RAIL หรือ DOVETAIL_DIRECT
  sleeveVariant?: SleeveVariant;
}

/**
 * Dovetail Joinery Calculator
 *
 * Key Formulas:
 * - Sleeve Count = ceil(length × 6 / 1000) with minimum 2
 * - Screw Count = ceil(length / 200)
 * - Margin = 50mm from each edge
 */
export function calculateDovetailPlan(opts: DovetailOptions): DovetailPlan {
  const {
    length,
    thickness,
    system,
    sleeveVariant = 'SHORT'
  } = opts;

  // =================================================================
  // 1. VALIDATION (Min Thickness 19mm per Häfele spec)
  // =================================================================
  if (thickness < 19) {
    return {
      isValid: false,
      system,
      specs: {} as any,
      sleevePositions: [],
      meta: {
        railLength: 0,
        railFixingPoints: [],
        grooveSpec: { w: 0, d: 0, l: 0 },
        sleeveCount: 0,
        minThickness: 19
      }
    };
  }

  // =================================================================
  // 2. HARDWARE SELECTION
  // =================================================================
  const rail = DOVETAIL_HARDWARE.rail_alu_raw;

  let sleeve: HardwareItem;
  switch (sleeveVariant) {
    case 'LONG_0D': sleeve = DOVETAIL_HARDWARE.sleeve_long_0d; break;
    case 'LONG_1D': sleeve = DOVETAIL_HARDWARE.sleeve_long_1d; break;
    case 'LONG_2D': sleeve = DOVETAIL_HARDWARE.sleeve_long_2d; break;
    default:        sleeve = DOVETAIL_HARDWARE.sleeve_std;
  }

  // =================================================================
  // 3. SLEEVE DISTRIBUTION (6 Sleeves per Meter)
  // =================================================================
  const sleeveDensity = 6 / 1000; // 6 per meter
  const sleeveCount = Math.max(2, Math.ceil(length * sleeveDensity));

  // กระจายตำแหน่งโดยเว้นขอบ (Margin 50mm)
  const margin = 50;
  const workingSpan = length - (margin * 2);
  const sleeveStep = workingSpan / (sleeveCount - 1);

  const sleevePositions: DovetailPlan['sleevePositions'] = [];
  for (let i = 0; i < sleeveCount; i++) {
    const x = margin + (sleeveStep * i);

    // Calculate dowel offsets based on variant
    const dowelOffsets: number[] = [];
    if (sleeve.specs.dowelCount === 2) {
      const offset = sleeve.specs.dowelSpacing! / 2; // 16mm
      dowelOffsets.push(-offset, offset);
    } else if (sleeve.specs.dowelCount === 1) {
      dowelOffsets.push(0);
    }

    sleevePositions.push({
      x,
      rotationY: 0,
      dowelOffsets
    });
  }

  // =================================================================
  // 4. RAIL FIXING SCREWS (เฉพาะ DOVETAIL_RAIL)
  // =================================================================
  const railFixingPoints: number[] = [];
  if (system === 'DOVETAIL_RAIL') {
    const screwInterval = rail.specs.screwInterval!; // 200mm
    const screwCount = Math.ceil(length / screwInterval);
    const screwStep = length / (screwCount + 1);

    for (let i = 1; i <= screwCount; i++) {
      railFixingPoints.push(Math.round(screwStep * i));
    }
  }

  return {
    isValid: true,
    system,
    specs: { rail, sleeve },
    sleevePositions,
    meta: {
      railLength: length,
      railFixingPoints,
      grooveSpec: {
        w: rail.specs.width!,   // 12mm
        d: rail.specs.height!,  // 10.5mm
        l: length
      },
      sleeveCount,
      minThickness: 19
    }
  };
}
```

### 14.4 CAM Generator for Dovetail

```typescript
// src/services/cam/generators/dovetailOp.ts
import { calculateDovetailPlan, DovetailPlan } from '../../engineering/dovetailEngine';

export interface DovetailMachineOp {
  id: string;
  type: 'MILL_FULL_SLOT' | 'DRILL';
  face: 'EDGE' | 'FACE';
  x: number;
  y: number;
  params?: {
    length: number;
    width: number;
    depth: number;
    toolProfile: string;
  };
  diameter?: number;
  depth?: number;
  hardwareRef: string;
}

/**
 * Generate CNC operations for Dovetail shelf mounting
 *
 * Operations:
 * 1. SHELF EDGE: Mill dovetail groove (full length)
 * 2. SHELF EDGE: Rail fixing screws (every 200mm)
 * 3. SIDE PANEL: Sleeve mounting holes
 */
export function generateDovetailOps(
  partId: string,
  opts: Parameters<typeof calculateDovetailPlan>[0]
): DovetailMachineOp[] {
  const plan = calculateDovetailPlan(opts);
  if (!plan.isValid) return [];

  const ops: DovetailMachineOp[] = [];
  const { rail, sleeve } = plan.specs;

  // =================================================================
  // 1. SHELF EDGE: MILL DOVETAIL GROOVE (กัดร่องยาวตลอดแนว)
  // =================================================================
  ops.push({
    id: `${partId}-dt-groove`,
    type: 'MILL_FULL_SLOT',
    face: 'EDGE',
    x: 0,
    y: 0, // Center of edge
    params: {
      length: plan.meta.railLength,
      width: plan.meta.grooveSpec.w,   // 12mm
      depth: plan.meta.grooveSpec.d,   // 10.5mm
      toolProfile: 'DOVETAIL-CUTTER-12'
    },
    hardwareRef: rail.itemNo
  });

  // =================================================================
  // 2. SHELF EDGE: RAIL FIXING SCREWS (เฉพาะแบบใส่ราง)
  // =================================================================
  if (plan.system === 'DOVETAIL_RAIL') {
    plan.meta.railFixingPoints.forEach((pos, i) => {
      ops.push({
        id: `${partId}-dt-rail-screw-${i}`,
        type: 'DRILL',
        face: 'EDGE',
        x: pos,
        y: 0,
        diameter: 3,  // Pilot Hole 3mm
        depth: 10,
        hardwareRef: 'SCREW-3x13'
      });
    });
  }

  // =================================================================
  // 3. SIDE PANEL: SLEEVE MOUNTING
  // =================================================================
  plan.sleevePositions.forEach((set, i) => {

    // 3.1 Long Sleeve with 2 Dowels (รุ่นยอดนิยม 261.30.782)
    if (sleeve.specs.dowelCount === 2) {
      set.dowelOffsets.forEach((offset, j) => {
        ops.push({
          id: `${partId}-dt-sleeve-${i}-d${j}`,
          type: 'DRILL',
          face: 'FACE',
          x: set.x + offset,
          y: 37, // System 32 distance from front
          diameter: 5,
          depth: sleeve.specs.drillDepth,
          hardwareRef: sleeve.itemNo
        });
      });
    }

    // 3.2 Long Sleeve with 1 Dowel
    else if (sleeve.specs.dowelCount === 1) {
      ops.push({
        id: `${partId}-dt-sleeve-${i}-d0`,
        type: 'DRILL',
        face: 'FACE',
        x: set.x,
        y: 37,
        diameter: 5,
        depth: sleeve.specs.drillDepth,
        hardwareRef: sleeve.itemNo
      });
    }

    // 3.3 Short Sleeve / No Dowel (Screw Only)
    else {
      ops.push({
        id: `${partId}-dt-sleeve-${i}-pilot`,
        type: 'DRILL',
        face: 'FACE',
        x: set.x,
        y: 37,
        diameter: 3, // Pilot Hole
        depth: 5,
        hardwareRef: sleeve.itemNo
      });
    }
  });

  return ops;
}
```

### 14.5 Visual Component

```typescript
// src/components/3d/hardware/DovetailConnector.tsx
import React, { useMemo } from 'react';
import { calculateDovetailPlan } from '../../../services/engineering/dovetailEngine';

const mm = (v: number) => v / 1000;

interface DovetailConnectorProps {
  length: number;
  thickness: number;
  system: 'DOVETAIL_RAIL' | 'DOVETAIL_DIRECT';
  sleeveVariant?: 'SHORT' | 'LONG_0D' | 'LONG_1D' | 'LONG_2D';
}

export const DovetailConnector: React.FC<DovetailConnectorProps> = (props) => {
  const plan = useMemo(() => calculateDovetailPlan(props), [props]);

  if (!plan.isValid) return null;

  const { system, specs, meta } = plan;

  return (
    <group>
      {/* 1. Rail / Groove (ยาวตลอดแนว) */}
      <mesh
        position={[mm(meta.railLength / 2), 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <boxGeometry args={[
          mm(meta.grooveSpec.d),  // 10.5mm height
          mm(meta.railLength),    // Full length
          mm(meta.grooveSpec.w)   // 12mm width
        ]} />
        {system === 'DOVETAIL_RAIL' ? (
          // Aluminium rail appearance
          <meshStandardMaterial
            color="#E0E0E0"
            metalness={0.8}
            roughness={0.2}
          />
        ) : (
          // Empty groove (wood visible)
          <meshBasicMaterial
            color="#3E2723"
            wireframe
            opacity={0.3}
            transparent
          />
        )}
      </mesh>

      {/* 2. Sleeves */}
      {plan.sleevePositions.map((set, i) => (
        <group
          key={i}
          position={[mm(set.x), mm(-8), 0]}
          rotation={[0, 0, Math.PI]}
        >
          <mesh>
            {/* Shape differs by variant (Short vs Long) */}
            {specs.sleeve.specs.length! > 20 ? (
              <boxGeometry args={[mm(41), mm(8), mm(9)]} />
            ) : (
              <cylinderGeometry args={[mm(4), mm(3), mm(8), 4]} />
            )}
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>

          {/* Visual Dowels (if 2-dowel variant) */}
          {specs.sleeve.specs.dowelCount === 2 && (
            <>
              <mesh position={[mm(16), mm(4), 0]}>
                <cylinderGeometry args={[mm(2.5), mm(2.5), mm(5)]} />
                <meshBasicMaterial color="#333" />
              </mesh>
              <mesh position={[mm(-16), mm(4), 0]}>
                <cylinderGeometry args={[mm(2.5), mm(2.5), mm(5)]} />
                <meshBasicMaterial color="#333" />
              </mesh>
            </>
          )}

          {/* Visual Dowel (if 1-dowel variant) */}
          {specs.sleeve.specs.dowelCount === 1 && (
            <mesh position={[0, mm(4), 0]}>
              <cylinderGeometry args={[mm(2.5), mm(2.5), mm(5)]} />
              <meshBasicMaterial color="#333" />
            </mesh>
          )}
        </group>
      ))}

      {/* 3. Rail Fixing Screw Indicators (Rail mode only) */}
      {system === 'DOVETAIL_RAIL' && meta.railFixingPoints.map((pos, i) => (
        <mesh key={`screw-${i}`} position={[mm(pos), mm(-2), 0]}>
          <cylinderGeometry args={[mm(1.5), mm(1.5), mm(4)]} />
          <meshStandardMaterial color="#666" metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
};
```

### 14.6 Sleeve Variant Comparison

| Variant | Item No | Length | Dowels | Dowel Spacing | Use Case |
|---------|---------|--------|--------|---------------|----------|
| **Short** | 261.30.790 | 9mm | 0 | - | Quick install, screw mount |
| **Long 0D** | 261.30.780 | 41mm | 0 | - | Extended grip, no positioning |
| **Long 1D** | 261.30.781 | 41mm | 1 | Center | Center alignment |
| **Long 2D** | 261.30.782 | 41mm | 2 | 32mm | System 32 compatible (recommended) |

### 14.7 Installation Mode Comparison

| Feature | DOVETAIL_RAIL | DOVETAIL_DIRECT |
|---------|---------------|-----------------|
| **Rail** | Aluminium 261.30.030 | None (routed groove) |
| **Groove Width** | 12mm | 12mm |
| **Groove Depth** | 10.5mm | 10.5mm |
| **Rail Screws** | Every 200mm | N/A |
| **Min Thickness** | 19mm | 19mm |
| **Strength** | Higher (metal rail) | Standard |
| **Cost** | Higher (rail + sleeves) | Lower (sleeves only) |
| **Removable** | Yes | Yes |
| **Best For** | Heavy-duty shelving | Standard shelving |

### 14.8 Drilling Pattern Diagram

```
SHELF EDGE (Side View):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    ╔══════════════════════════════════════════════════════╗    │
│    ║  DOVETAIL GROOVE (12mm W × 10.5mm D)                 ║    │
│    ╚══════════════════════════════════════════════════════╝    │
│         ↑         ↑         ↑         ↑         ↑              │
│       Screw     Screw     Screw     Screw     Screw            │
│       (200mm intervals - RAIL mode only)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SIDE PANEL (Face View):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  50mm    166mm    166mm    166mm    166mm    166mm    50mm     │
│   ├───────┼────────┼────────┼────────┼────────┼───────┤        │
│   ▣       ▣        ▣        ▣        ▣        ▣       ▣        │
│   │       │        │        │        │        │       │        │
│   └───────┴────────┴────────┴────────┴────────┴───────┘        │
│              ↑ SLEEVE POSITIONS (6 per meter)                  │
│                                                                 │
│              Y = 37mm from front edge (System 32)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SLEEVE DETAIL (2-Dowel Variant):
┌─────────────────────────────────────┐
│                                     │
│      ●────── 32mm ──────●          │
│     5mm                 5mm         │
│     dia                 dia         │
│                                     │
│   ┌─────────────────────────┐      │
│   │        SLEEVE           │      │ 41mm length
│   │       (261.30.782)      │      │
│   └─────────────────────────┘      │
│                                     │
└─────────────────────────────────────┘
```

### 14.9 Calculation Examples

```typescript
// Example 1: Standard shelf 600mm with Rail System
const shelfPlan = calculateDovetailPlan({
  length: 600,
  thickness: 19,
  system: 'DOVETAIL_RAIL',
  sleeveVariant: 'LONG_2D'
});

console.log('=== Dovetail Plan (600mm Shelf) ===');
console.log('Valid:', shelfPlan.isValid);           // true
console.log('Sleeve Count:', shelfPlan.meta.sleeveCount);  // 4
console.log('Sleeve Positions:', shelfPlan.sleevePositions.map(s => s.x));
// [50, 216.67, 383.33, 550]

console.log('Rail Screws:', shelfPlan.meta.railFixingPoints);
// [150, 300, 450] (every 200mm, distributed)

console.log('Groove:', shelfPlan.meta.grooveSpec);
// { w: 12, d: 10.5, l: 600 }


// Example 2: Long shelf 1200mm with Direct System
const longShelfPlan = calculateDovetailPlan({
  length: 1200,
  thickness: 25,
  system: 'DOVETAIL_DIRECT',
  sleeveVariant: 'SHORT'
});

console.log('\n=== Dovetail Plan (1200mm Shelf) ===');
console.log('Sleeve Count:', longShelfPlan.meta.sleeveCount);  // 8
console.log('Rail Screws:', longShelfPlan.meta.railFixingPoints);
// [] (empty - Direct mode has no rail screws)


// Example 3: Invalid - Too thin
const thinPlan = calculateDovetailPlan({
  length: 600,
  thickness: 16,  // < 19mm minimum!
  system: 'DOVETAIL_RAIL'
});

console.log('\n=== Thin Panel Plan ===');
console.log('Valid:', thinPlan.isValid);  // false
console.log('Min Thickness:', thinPlan.meta.minThickness);  // 19mm


// Example 4: Generate CAM operations
const ops = generateDovetailOps('SHELF-001', {
  length: 600,
  thickness: 19,
  system: 'DOVETAIL_RAIL',
  sleeveVariant: 'LONG_2D'
});

console.log('\n=== CAM Operations ===');
console.log('Total operations:', ops.length);
// 1 groove + 3 rail screws + 8 dowel holes = 12 operations

const grooveOp = ops.find(op => op.type === 'MILL_FULL_SLOT');
console.log('Groove tool:', grooveOp?.params?.toolProfile);
// 'DOVETAIL-CUTTER-12'

const screwOps = ops.filter(op => op.id.includes('rail-screw'));
console.log('Rail screws:', screwOps.length);  // 3

const dowelOps = ops.filter(op => op.id.includes('sleeve'));
console.log('Sleeve dowel holes:', dowelOps.length);  // 8 (4 sleeves × 2 dowels)
```

### 14.10 Technical Reference Table

| Parameter | Value | Unit | Description |
|-----------|-------|------|-------------|
| **Groove Width** | 12 | mm | Dovetail slot width |
| **Groove Depth** | 10.5 | mm | Dovetail slot depth |
| **Min Panel Thickness** | 19 | mm | Minimum shelf thickness |
| **Sleeve Density** | 6 | per meter | Standard sleeve distribution |
| **Screw Interval** | 200 | mm | Rail fixing screw spacing |
| **Edge Margin** | 50 | mm | Distance from shelf edge to first sleeve |
| **System 32 Y** | 37 | mm | Sleeve Y position from front edge |
| **Dowel Diameter** | 5 | mm | Positioning dowel diameter |
| **Dowel Depth** | 5 | mm | Dowel hole depth |
| **Pilot Hole** | 3 | mm | Screw pilot hole diameter |
| **Rail Length** | 3000 | mm | Standard aluminium rail length |

---

## ส่วนที่ 15: Lamello P-System Engine (Architecture v5.5)

ระบบ **Lamello P-System** (Clamex P-14, P-10, Medius) เป็นระบบข้อต่อแบบ T-Slot ที่ให้ความแข็งแรงสูงและถอดประกอบได้ ใช้กลไก Lever Lock ที่ยึดแน่นเพียงหมุนด้วยไขควงปากแบน

### 15.1 Medius Intelligence System

ระบบ Medius ถูกออกแบบมาเพื่อแก้ปัญหา "Back-to-Back Installation" บนแผงกลาง (Center Panel) โดยใช้ความลึกร่องต่างกันทั้งสองด้าน:

```
MEDIUS CONCEPT (Center Panel Back-to-Back):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  STANDARD P-14 (Both sides same depth):                        │
│  ─────────────────────────────────────                          │
│                                                                 │
│  ┌─────────┬────────────────────┬─────────┐                    │
│  │ SHELF L │   CENTER PANEL     │ SHELF R │                    │
│  │         │    (16mm thick)    │         │                    │
│  │  ◀───   │   14.7 + 14.7 = 29.4mm       │   ───▶  │                    │
│  │  14.7mm │   ❌ COLLISION!    │  14.7mm │                    │
│  └─────────┴────────────────────┴─────────┘                    │
│                                                                 │
│  MEDIUS P-14/10 (Different depths):                            │
│  ───────────────────────────────────                            │
│                                                                 │
│  ┌─────────┬────────────────────┬─────────┐                    │
│  │ SHELF L │   CENTER PANEL     │ SHELF R │                    │
│  │         │    (16mm thick)    │         │                    │
│  │  ◀───   │   10 + 10 = 20mm  │   ───▶  │                    │
│  │  14.7mm │   ✅ Safe gap!    │  14.7mm │                    │
│  └─────────┴────────────────────┴─────────┘                    │
│                                                                 │
│  Edge (Shelf): 14.7mm depth (Lever side)                       │
│  Face (Center): 10mm depth (Anchor side)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'MINIFIX_12' | 'MAXIFIX_35'
  | 'SC_8_60' | 'U_12_10' | 'CC_8_5_30' | 'TOFIX_25'
  | 'LAMELLO_P'      // Lamello P-System
  | 'DOVETAIL_RAIL'
  | 'DOVETAIL_DIRECT';

export type BoardThickness = 12 | 13 | 15 | 16 | 18 | 19 | 22 | 23 | 25 | 26 | 29 | 34;

export interface LamelloItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'CONNECTOR_LAMELLO';
  specs: {
    drillDepth: number;      // Edge groove depth (Lever side)
    faceDepth: number;       // Face groove depth (Anchor side)
    diameter: number;        // T-Slot width (7mm)
    length: number;          // Arc length (66mm / 52mm)
    accessDia: number;       // Access hole diameter (6mm)
    accessDist: number;      // Access hole distance from edge
    minThickness: number;    // Minimum board thickness
    toolProfile: string;     // CNC tool profile code
  };
}

export const LAMELLO_HARDWARE = {
  // =================================================================
  // Clamex P-14 (Standard for >= 16mm panels)
  // =================================================================
  p14: {
    id: 'clamex_p14',
    itemNo: '267.91.136',
    name: 'Lamello Clamex P-14',
    category: 'CONNECTOR_LAMELLO',
    specs: {
      drillDepth: 14.7,    // Edge depth 14.7mm (standard)
      faceDepth: 14.7,     // Face depth same
      diameter: 7,         // T-Slot width 7mm
      length: 66,          // Arc length 66mm
      accessDia: 6,        // Access hole 6mm
      accessDist: 6,       // 6mm from edge
      minThickness: 16,
      toolProfile: 'P-SYSTEM-14'
    }
  } as LamelloItem,

  // =================================================================
  // Clamex P-10 (Thin Panels >= 13mm)
  // =================================================================
  p10: {
    id: 'clamex_p10',
    itemNo: '267.91.130',
    name: 'Lamello Clamex P-10',
    category: 'CONNECTOR_LAMELLO',
    specs: {
      drillDepth: 10,      // Edge depth 10mm
      faceDepth: 10,       // Face depth same
      diameter: 7,
      length: 52,          // Shorter arc (52mm)
      accessDia: 6,
      accessDist: 6,
      minThickness: 13,
      toolProfile: 'P-SYSTEM-10'
    }
  } as LamelloItem,

  // =================================================================
  // Clamex P Medius 14/10 (Center Panel - Back-to-Back)
  // =================================================================
  medius: {
    id: 'clamex_medius',
    itemNo: '267.91.138',
    name: 'Lamello Clamex P Medius 14/10',
    category: 'CONNECTOR_LAMELLO',
    specs: {
      drillDepth: 14.7,    // Edge (Lever side): 14.7mm
      faceDepth: 10,       // Face (Anchor side): 10mm ONLY!
      diameter: 7,
      length: 66,
      accessDia: 6,
      accessDist: 6,
      minThickness: 16,    // Center panel min 16mm
      toolProfile: 'P-SYSTEM-MEDIUS'
    }
  } as LamelloItem
};
```

### 15.3 Lamello Engineering Engine

```typescript
// src/services/engineering/lamelloEngine.ts
import { LAMELLO_HARDWARE, LamelloItem } from '../hardware/hafeleDb';

export interface LamelloPlan {
  isValid: boolean;
  system: 'LAMELLO_P';
  specs: {
    connector: LamelloItem;
  };
  positions: {
    x: number;
    rotationY: number;
  }[];
  meta: {
    edgeGrooveDepth: number;  // Lever side depth
    faceGrooveDepth: number;  // Anchor side depth
    isMedius: boolean;
    slotLength: number;
    accessHole: { dia: number; dist: number };
  };
}

interface LamelloOptions {
  length: number;           // Panel length
  thickness: number;        // Panel thickness
  isCenterPanel?: boolean;  // Flag for center panel (Medius)
}

/**
 * Lamello P-System Joinery Calculator
 *
 * Selection Logic:
 * - Center Panel (back-to-back): Use Medius (Edge=14.7, Face=10)
 * - Standard >= 16mm: Use P-14 (Edge=14.7, Face=14.7)
 * - Thin 13-15mm: Use P-10 (Edge=10, Face=10)
 * - < 13mm: Invalid
 */
export function calculateLamelloPlan(opts: LamelloOptions): LamelloPlan {
  const { length, thickness, isCenterPanel = false } = opts;

  // =================================================================
  // 1. CONNECTOR SELECTION
  // =================================================================
  let connector: LamelloItem;

  if (isCenterPanel) {
    // Center panel: Use Medius for back-to-back installation
    if (thickness < 16) {
      return createInvalidPlan('Center panel requires min 16mm thickness');
    }
    connector = LAMELLO_HARDWARE.medius;
  } else if (thickness >= 16) {
    // Standard thick panel: Use P-14
    connector = LAMELLO_HARDWARE.p14;
  } else if (thickness >= 13) {
    // Thin panel: Use P-10
    connector = LAMELLO_HARDWARE.p10;
  } else {
    // Too thin for Lamello
    return createInvalidPlan('Panel too thin for Lamello (min 13mm)');
  }

  // =================================================================
  // 2. POSITION CALCULATION
  // =================================================================
  const margin = 60; // Lamello needs 50-80mm from edge for tool access
  const positions: LamelloPlan['positions'] = [];

  // Left position
  positions.push({ x: margin, rotationY: 0 });

  // Right position
  positions.push({ x: length - margin, rotationY: Math.PI });

  // Center position (for long panels > 600mm)
  if (length > 600) {
    positions.push({ x: length / 2, rotationY: 0 });
  }

  // Extra positions for very long panels
  if (length > 1200) {
    positions.push({ x: length / 3, rotationY: 0 });
    positions.push({ x: (length / 3) * 2, rotationY: Math.PI });
  }

  return {
    isValid: true,
    system: 'LAMELLO_P',
    specs: { connector },
    positions,
    meta: {
      edgeGrooveDepth: connector.specs.drillDepth,
      faceGrooveDepth: connector.specs.faceDepth,
      isMedius: isCenterPanel,
      slotLength: connector.specs.length,
      accessHole: {
        dia: connector.specs.accessDia,
        dist: connector.specs.accessDist
      }
    }
  };
}

function createInvalidPlan(reason: string): LamelloPlan {
  return {
    isValid: false,
    system: 'LAMELLO_P',
    specs: {} as any,
    positions: [],
    meta: {
      edgeGrooveDepth: 0,
      faceGrooveDepth: 0,
      isMedius: false,
      slotLength: 0,
      accessHole: { dia: 0, dist: 0 }
    }
  };
}
```

### 15.4 CAM Generator for Lamello

```typescript
// src/services/cam/generators/lamelloOp.ts
import { calculateLamelloPlan, LamelloPlan } from '../../engineering/lamelloEngine';

export interface LamelloMachineOp {
  id: string;
  type: 'MILL_T_SLOT' | 'DRILL';
  face: 'EDGE' | 'FACE';
  x: number;
  y: number;
  params?: {
    length: number;
    depth: number;
    width: number;
    toolProfile: string;
  };
  diameter?: number;
  depth?: number;
  hardwareRef: string;
}

/**
 * Generate CNC operations for Lamello P-System
 *
 * Operations per connector:
 * 1. SHELF EDGE: T-Slot milling (Lever side)
 * 2. SHELF FACE: Access hole drilling (6mm)
 * 3. SIDE PANEL FACE: T-Slot milling (Anchor side) - separate function
 */
export function generateLamelloShelfOps(
  partId: string,
  opts: Parameters<typeof calculateLamelloPlan>[0]
): LamelloMachineOp[] {
  const plan = calculateLamelloPlan(opts);
  if (!plan.isValid) return [];

  const ops: LamelloMachineOp[] = [];
  const { connector } = plan.specs;

  plan.positions.forEach((pos, i) => {
    // =================================================================
    // 1. EDGE T-SLOT (Shelf edge - Lever side)
    // =================================================================
    ops.push({
      id: `${partId}-lamello-edge-${i}`,
      type: 'MILL_T_SLOT',
      face: 'EDGE',
      x: pos.x,
      y: 0, // Center of edge thickness
      params: {
        length: connector.specs.length,      // 66mm or 52mm
        depth: connector.specs.drillDepth,   // 14.7mm or 10mm
        width: connector.specs.diameter,     // 7mm
        toolProfile: connector.specs.toolProfile
      },
      hardwareRef: connector.itemNo
    });

    // =================================================================
    // 2. ACCESS HOLE (Shelf face - for screwdriver)
    // =================================================================
    ops.push({
      id: `${partId}-lamello-access-${i}`,
      type: 'DRILL',
      face: 'FACE',
      x: pos.x,
      y: connector.specs.accessDist, // 6mm from edge
      diameter: connector.specs.accessDia,   // 6mm
      depth: connector.specs.drillDepth,     // Through to T-Slot
      hardwareRef: `${connector.itemNo}-ACCESS`
    });
  });

  return ops;
}

/**
 * Generate T-Slot operations for mating panel (Side panel face)
 * Uses faceGrooveDepth which differs for Medius (10mm vs 14.7mm)
 */
export function generateLamelloMatingOps(
  partId: string,
  shelfY: number,  // Y position of shelf on side panel
  plan: LamelloPlan
): LamelloMachineOp[] {
  if (!plan.isValid) return [];

  const ops: LamelloMachineOp[] = [];
  const { connector } = plan.specs;

  plan.positions.forEach((pos, i) => {
    // FACE T-SLOT (Side panel - Anchor side)
    // Note: Uses faceGrooveDepth (10mm for Medius, 14.7mm for standard)
    ops.push({
      id: `${partId}-lamello-face-${i}`,
      type: 'MILL_T_SLOT',
      face: 'FACE',
      x: pos.x,
      y: shelfY,
      params: {
        length: connector.specs.length,
        depth: plan.meta.faceGrooveDepth,  // KEY: Different for Medius!
        width: connector.specs.diameter,
        toolProfile: connector.specs.toolProfile
      },
      hardwareRef: connector.itemNo
    });
  });

  return ops;
}
```

### 15.5 Visual Component

```typescript
// src/components/3d/hardware/LamelloConnector.tsx
import React, { useMemo } from 'react';
import { calculateLamelloPlan } from '../../../services/engineering/lamelloEngine';

const mm = (v: number) => v / 1000;

interface LamelloConnectorProps {
  length: number;
  thickness: number;
  isCenterPanel?: boolean;
}

export const LamelloConnector: React.FC<LamelloConnectorProps> = (props) => {
  const plan = useMemo(() => calculateLamelloPlan(props), [props]);

  if (!plan.isValid) return null;

  const { connector } = plan.specs;

  return (
    <group>
      {plan.positions.map((pos, i) => (
        <group
          key={i}
          position={[mm(pos.x), 0, 0]}
          rotation={[0, pos.rotationY, 0]}
        >
          {/* 1. T-Slot Body (Capsule/Biscuit Shape) */}
          <mesh position={[0, mm(connector.specs.drillDepth / 2), 0]}>
            <boxGeometry args={[
              mm(connector.specs.length),    // 66mm or 52mm
              mm(connector.specs.drillDepth), // 14.7mm or 10mm
              mm(7)                           // 7mm width
            ]} />
            <meshStandardMaterial color="#263238" /> {/* Black plastic */}
          </mesh>

          {/* 2. Zinc Lever (Locking Mechanism) */}
          <mesh position={[0, mm(connector.specs.drillDepth / 2), 0]}>
            <cylinderGeometry args={[mm(4), mm(4), mm(connector.specs.drillDepth), 16]} />
            <meshStandardMaterial color="#B0BEC5" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* 3. Access Hole Indicator (Red marker) */}
          <mesh
            position={[0, mm(connector.specs.accessDist), mm(5)]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[mm(3), mm(3), mm(10), 16]} />
            <meshBasicMaterial color="#EF5350" wireframe transparent opacity={0.7} />
          </mesh>

          {/* 4. Medius Indicator (Green for special depth) */}
          {plan.meta.isMedius && (
            <mesh position={[mm(20), mm(5), 0]}>
              <sphereGeometry args={[mm(3), 8, 8]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
};
```

### 15.6 Connector Variant Comparison

| Variant | Item No | Edge Depth | Face Depth | Slot Length | Min Thickness | Use Case |
|---------|---------|------------|------------|-------------|---------------|----------|
| **P-14** | 267.91.136 | 14.7mm | 14.7mm | 66mm | 16mm | Standard panels |
| **P-10** | 267.91.130 | 10mm | 10mm | 52mm | 13mm | Thin panels |
| **Medius** | 267.91.138 | 14.7mm | 10mm | 66mm | 16mm | Center panel (back-to-back) |

### 15.7 T-Slot Milling Diagram

```
T-SLOT PROFILE (Cross Section):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    EDGE VIEW (Shelf side - Lever):                             │
│    ────────────────────────────────                             │
│                                                                 │
│    ┌─────────────────────────────────────┐                     │
│    │           SHELF PANEL               │                     │
│    │                                     │                     │
│    │    ╔═════════════════════════╗     │                     │
│    │    ║    T-SLOT GROOVE        ║     │ ← 14.7mm or 10mm    │
│    │    ║    (7mm wide)           ║     │                     │
│    │    ╚═════════════════════════╝     │                     │
│    │              ↑                      │                     │
│    │         66mm / 52mm                 │                     │
│    └──────────────────────────────────────┘                     │
│              │                                                  │
│              │                                                  │
│              ▼                                                  │
│    ┌──────────────────────────────────────┐                    │
│    │         SIDE PANEL (Face)           │                     │
│    │                                      │                     │
│    │    ╔═════════════════════════╗      │                     │
│    │    ║   MATING T-SLOT         ║      │ ← faceDepth        │
│    │    ║   (Anchor side)         ║      │   (10mm for Medius)│
│    │    ╚═════════════════════════╝      │                     │
│    │                                      │                     │
│    └──────────────────────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

ACCESS HOLE POSITION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│         SHELF PANEL (Top View):                                │
│         ───────────────────────                                 │
│                                                                 │
│    ┌─────────────────────────────────────────────────────────┐ │
│    │                                                         │ │
│    │    ○ ← Access Hole (6mm dia, 6mm from edge)            │ │
│    │    │                                                    │ │
│    │    │                                                    │ │
│    │    ▼                                                    │ │
│    │   ╔══════════════════════════════════════════╗         │ │
│    │   ║           T-SLOT (66mm long)             ║ ← EDGE  │ │
│    │   ╚══════════════════════════════════════════╝         │ │
│    │                                                         │ │
│    └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│    Access hole allows screwdriver to rotate the lever          │
│    and lock the connector                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.8 Position Layout

```
LAMELLO POSITION DISTRIBUTION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Short Panel (≤600mm): 2 connectors                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  60mm                                          60mm   │     │
│  │   ├──┐                                      ┌──┤      │     │
│  │   ◆  │                                      │  ◆      │     │
│  │      │          SHELF (600mm)               │         │     │
│  │      │                                      │         │     │
│  └──────┴──────────────────────────────────────┴─────────┘     │
│                                                                 │
│  Medium Panel (600-1200mm): 3 connectors                       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  60mm              center                     60mm    │     │
│  │   ├──┐               ◆                     ┌──┤       │     │
│  │   ◆  │                                     │  ◆       │     │
│  │      │           SHELF (900mm)             │          │     │
│  └──────┴──────────────────────────────────────┴─────────┘     │
│                                                                 │
│  Long Panel (>1200mm): 5 connectors                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  60mm    1/3       center       2/3          60mm     │     │
│  │   ├──┐    ◆          ◆          ◆         ┌──┤        │     │
│  │   ◆  │                                    │  ◆        │     │
│  │      │          SHELF (1500mm)            │           │     │
│  └──────┴──────────────────────────────────────┴─────────┘     │
│                                                                 │
│  ◆ = Lamello P-System connector                                │
│  Margin: 60mm from edge (tool access requirement)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.9 Calculation Examples

```typescript
// Example 1: Standard shelf on 18mm panel
const standardPlan = calculateLamelloPlan({
  length: 800,
  thickness: 18,
  isCenterPanel: false
});

console.log('=== Standard Shelf Plan ===');
console.log('Valid:', standardPlan.isValid);           // true
console.log('Connector:', standardPlan.specs.connector.name);
// 'Lamello Clamex P-14'
console.log('Edge Depth:', standardPlan.meta.edgeGrooveDepth);  // 14.7mm
console.log('Face Depth:', standardPlan.meta.faceGrooveDepth);  // 14.7mm
console.log('Is Medius:', standardPlan.meta.isMedius);          // false
console.log('Positions:', standardPlan.positions.length);       // 3 (>600mm)


// Example 2: Center panel (back-to-back)
const centerPanelPlan = calculateLamelloPlan({
  length: 600,
  thickness: 16,
  isCenterPanel: true  // KEY: Triggers Medius selection
});

console.log('\n=== Center Panel Plan (Medius) ===');
console.log('Connector:', centerPanelPlan.specs.connector.name);
// 'Lamello Clamex P Medius 14/10'
console.log('Edge Depth:', centerPanelPlan.meta.edgeGrooveDepth);  // 14.7mm
console.log('Face Depth:', centerPanelPlan.meta.faceGrooveDepth);  // 10mm (DIFFERENT!)
console.log('Is Medius:', centerPanelPlan.meta.isMedius);          // true


// Example 3: Thin panel (13mm)
const thinPanelPlan = calculateLamelloPlan({
  length: 500,
  thickness: 13,
  isCenterPanel: false
});

console.log('\n=== Thin Panel Plan ===');
console.log('Connector:', thinPanelPlan.specs.connector.name);
// 'Lamello Clamex P-10'
console.log('Slot Length:', thinPanelPlan.meta.slotLength);  // 52mm (shorter)
console.log('Edge Depth:', thinPanelPlan.meta.edgeGrooveDepth);  // 10mm


// Example 4: Too thin (invalid)
const invalidPlan = calculateLamelloPlan({
  length: 500,
  thickness: 12,  // < 13mm minimum!
  isCenterPanel: false
});

console.log('\n=== Invalid Plan ===');
console.log('Valid:', invalidPlan.isValid);  // false


// Example 5: Generate CAM operations
const shelfOps = generateLamelloShelfOps('SHELF-001', {
  length: 800,
  thickness: 18
});

console.log('\n=== CAM Operations ===');
console.log('Total shelf ops:', shelfOps.length);  // 6 (3 positions × 2 ops)

const tSlotOps = shelfOps.filter(op => op.type === 'MILL_T_SLOT');
console.log('T-Slot operations:', tSlotOps.length);  // 3

const accessOps = shelfOps.filter(op => op.type === 'DRILL');
console.log('Access hole operations:', accessOps.length);  // 3
console.log('Access hole diameter:', accessOps[0].diameter);  // 6mm


// Example 6: Generate mating panel operations (Side panel)
const matingOps = generateLamelloMatingOps('SIDE-001', 300, standardPlan);

console.log('\n=== Mating Panel Operations ===');
console.log('Face T-Slot ops:', matingOps.length);  // 3
console.log('Face depth:', matingOps[0].params?.depth);  // 14.7mm (or 10mm for Medius)
```

### 15.10 Technical Reference Table

| Parameter | P-14 | P-10 | Medius | Unit | Description |
|-----------|------|------|--------|------|-------------|
| **Edge Groove Depth** | 14.7 | 10 | 14.7 | mm | Lever side depth |
| **Face Groove Depth** | 14.7 | 10 | 10 | mm | Anchor side depth |
| **Slot Width** | 7 | 7 | 7 | mm | T-Slot width |
| **Slot Length** | 66 | 52 | 66 | mm | Arc length |
| **Access Hole Dia** | 6 | 6 | 6 | mm | Screwdriver access |
| **Access Hole Dist** | 6 | 6 | 6 | mm | Distance from edge |
| **Min Thickness** | 16 | 13 | 16 | mm | Minimum panel thickness |
| **Tool Profile** | P-SYSTEM-14 | P-SYSTEM-10 | P-SYSTEM-MEDIUS | - | CNC cutter code |
| **Edge Margin** | 60 | 60 | 60 | mm | Min distance from panel edge |

### 15.11 CNC Tool Requirements

| Tool | Description | Use |
|------|-------------|-----|
| **Lamello Zeta P2** | Dedicated handheld P-System cutter | Manual/Semi-auto |
| **T-Slot Cutter 7mm** | CNC router bit for T-Slot | CNC machining |
| **6mm Drill Bit** | Standard drill for access hole | CNC/Manual |
| **Flathead Screwdriver** | For lever rotation | Assembly |

---

## ส่วนที่ 16: Ixconnect & Tofix System Engine (Architecture v5.0)

ระบบ **Ixconnect** (SC, U, CC) และ **Tofix** เป็นข้อต่อแบบ One-Piece และ Semi-Concealed ที่รองรับงานที่ซับซ้อนกว่า Minifix ทั่วไป โดยมีคุณสมบัติ Advanced Drilling Logic ที่ต้องเจาะ 2 แกนในจุดเดียว

### 16.1 Advanced Drilling Logic

ระบบนี้รองรับการเจาะหลายแบบที่ซับซ้อน:

```
MULTI-AXIS BORING CONCEPT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  STANDARD MINIFIX (Single Axis per Part):                      │
│  ──────────────────────────────────────                         │
│                                                                 │
│  SIDE PANEL:        SHELF:                                      │
│  ┌─────────┐        ┌─────────────────┐                        │
│  │    ○    │        │        │        │                        │
│  │  Face   │        │   Edge Only     │                        │
│  │  Only   │        │        ↓        │                        │
│  └─────────┘        └─────────────────┘                        │
│                                                                 │
│  IXCONNECT SC/U (Dual Axis - Same Part):                       │
│  ────────────────────────────────────────                       │
│                                                                 │
│  ┌─────────────────────────────────────┐                       │
│  │           SHELF PANEL               │                       │
│  │                                      │                       │
│  │    ○ ←── Access Hole (Face)         │ ← 6mm @ distB        │
│  │    │     at 25mm or 45mm            │                       │
│  │    │                                 │                       │
│  │    ▼                                 │                       │
│  │   ══════════════════════════ ← Edge │ ← 8mm or 12mm        │
│  │   Connector Body (60mm deep)        │                       │
│  └─────────────────────────────────────┘                       │
│                                                                 │
│  TOFIX (Dynamic Formula):                                       │
│  ────────────────────────                                       │
│                                                                 │
│  ┌─────────────────────────────────────┐                       │
│  │           SIDE PANEL                │                       │
│  │                                      │                       │
│  │         ┌───────┐ ← Housing 25mm    │                       │
│  │         │   ○   │   @ A position    │                       │
│  │         └───────┘                    │                       │
│  │              ↑                       │                       │
│  │    A = TopThickness - 1.5mm         │ ← Dynamic!           │
│  │              │                       │                       │
│  │   ═══════════╪══════════════ ← Edge │ ← Neck 7mm           │
│  │              │                       │                       │
│  └─────────────────────────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 16.2 Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts

export type SystemType =
  | 'MINIFIX_15' | 'MINIFIX_12' | 'MAXIFIX_35'
  | 'SC_8_60'    // Ixconnect One-piece (8mm)
  | 'U_12_10'    // Ixconnect Heavy Duty (12mm)
  | 'CC_8_5_30'  // Claw Connector (Drawer)
  | 'TOFIX_25'   // Tofix (Semi-concealed)
  | 'LAMELLO_P'
  | 'DOVETAIL_RAIL'
  | 'DOVETAIL_DIRECT';

export type BoardThickness = 12 | 13 | 15 | 16 | 18 | 19 | 22 | 23 | 25 | 26 | 29 | 34;

export interface IxconnectItem {
  id: string;
  itemNo: string;
  name: string;
  category: 'CONNECTOR_ONE_PIECE' | 'HOUSING_TOFIX' | 'BOLT';
  specs: {
    drillDepth: number;      // Edge drill depth
    diameter: number;        // Edge drill diameter
    distB?: number;          // Access hole distance from edge
    accessDia?: number;      // Access hole diameter
    matingDia?: number;      // Mating panel drill diameter
    neckDia?: number;        // Neck drill diameter (Tofix)
    length?: number;         // Connector length
  };
}

export const IXCONNECT_HARDWARE = {
  // =================================================================
  // IXCONNECT SC 8/60 (One-Piece Connector)
  // =================================================================
  sc_8_60: {
    id: 'sc_8_60',
    itemNo: '262.11.117',
    name: 'Ixconnect SC 8/60 (Red/Grey)',
    category: 'CONNECTOR_ONE_PIECE',
    specs: {
      diameter: 8,        // Edge drill 8mm
      drillDepth: 60,     // Edge depth 60mm (55mm body + margin)
      accessDia: 6,       // Face access hole 6mm
      distB: 25,          // Access hole 25mm from edge
      matingDia: 8        // Mating panel 8mm
    }
  } as IxconnectItem,

  // =================================================================
  // IXCONNECT U 12/10 (Heavy Duty Spreading)
  // =================================================================
  u_12_10: {
    id: 'u_12_10',
    itemNo: '262.11.600',
    name: 'Ixconnect U 12/10 Spreading',
    category: 'CONNECTOR_ONE_PIECE',
    specs: {
      diameter: 12,       // Edge drill 12mm
      drillDepth: 55,     // Edge depth 55mm (54mm body + margin)
      accessDia: 6,       // Face access hole 6mm
      distB: 45,          // Access hole 45mm from edge
      matingDia: 10       // Mating panel 10mm
    }
  } as IxconnectItem,

  // =================================================================
  // IXCONNECT CC 8/5/30 Claw (Drawer Connector)
  // =================================================================
  cc_8_5_30: {
    id: 'cc_8_5_30',
    itemNo: '262.11.113',
    name: 'Ixconnect CC 8/5/30 Claw',
    category: 'CONNECTOR_ONE_PIECE',
    specs: {
      diameter: 5,        // Edge drill 5mm (drawer side)
      drillDepth: 30,     // Edge depth 30mm
      matingDia: 8,       // Face drill 8mm (drawer front)
      distB: 30           // Installation distance
    }
  } as IxconnectItem
};

export const TOFIX_HARDWARE = {
  // =================================================================
  // TOFIX Housing 25mm
  // =================================================================
  housing_25: {
    id: 'tofix_25',
    itemNo: '261.95.704',
    name: 'Tofix Housing 25mm (White)',
    category: 'HOUSING_TOFIX',
    specs: {
      diameter: 25,       // Face drill 25mm
      drillDepth: 12.5,   // Housing depth
      neckDia: 7          // Edge neck drill 7mm
    }
  } as IxconnectItem,

  // =================================================================
  // TOFIX Bolt
  // =================================================================
  bolt_std: {
    id: 'tofix_bolt',
    itemNo: '261.95.010',
    name: 'Tofix Bolt',
    category: 'BOLT',
    specs: {
      diameter: 5,
      drillDepth: 11
    }
  } as IxconnectItem
};
```

### 16.3 Ixconnect & Tofix Engineering Engine

```typescript
// src/services/engineering/ixconnectEngine.ts
import {
  IXCONNECT_HARDWARE,
  TOFIX_HARDWARE,
  IxconnectItem
} from '../hardware/hafeleDb';

export type IxconnectSystem = 'SC_8_60' | 'U_12_10' | 'CC_8_5_30' | 'TOFIX_25';

export interface IxconnectPlan {
  isValid: boolean;
  system: IxconnectSystem;
  specs: {
    main: IxconnectItem;
    mating?: IxconnectItem;
  };
  positions: {
    x: number;
    yOffset: number;      // Access hole or Housing Y position
    rotationY: number;
    dowelOffsets: number[];
  }[];
  meta: {
    edgeDrill: { dia: number; depth: number };
    faceDrill: { dia: number; depth: number; distB: number };
    useDowels: boolean;
    formula?: string;     // For Tofix: "A = TopThickness - 1.5"
  };
}

interface IxconnectOptions {
  length: number;
  thickness: number;        // Panel thickness
  targetThickness?: number; // Target panel thickness (for Tofix)
  system: IxconnectSystem;
}

/**
 * Ixconnect & Tofix Joinery Calculator
 *
 * Key Features:
 * - SC 8/60: Edge 8mm + Face Access 6mm @ 25mm
 * - U 12/10: Edge 12mm + Face Access 6mm @ 45mm
 * - CC 8/5/30: Edge 5mm (Drawer, no dowels)
 * - TOFIX: Housing 25mm + Neck 7mm with dynamic formula
 */
export function calculateIxconnectPlan(opts: IxconnectOptions): IxconnectPlan {
  const { length, thickness, targetThickness = 19, system } = opts;

  let main: IxconnectItem;
  let mating: IxconnectItem | undefined;
  let yOffset = 0;
  let margin = 50;
  let useDowels = true;
  let formula: string | undefined;

  // =================================================================
  // SYSTEM SELECTION
  // =================================================================
  switch (system) {
    case 'SC_8_60':
      main = IXCONNECT_HARDWARE.sc_8_60;
      yOffset = main.specs.distB!;  // 25mm
      break;

    case 'U_12_10':
      main = IXCONNECT_HARDWARE.u_12_10;
      yOffset = main.specs.distB!;  // 45mm
      break;

    case 'CC_8_5_30':
      main = IXCONNECT_HARDWARE.cc_8_5_30;
      yOffset = main.specs.distB!;  // 30mm
      useDowels = false;  // Claw doesn't use dowels
      margin = 32;        // Drawer standard margin
      break;

    case 'TOFIX_25':
      main = TOFIX_HARDWARE.housing_25;
      mating = TOFIX_HARDWARE.bolt_std;
      // TOFIX FORMULA: A = B - 9 + 7.5 = TargetThickness - 1.5
      yOffset = targetThickness - 1.5;
      formula = `A = ${targetThickness} - 1.5 = ${yOffset}mm`;
      break;

    default:
      return createInvalidPlan(system, 'Unknown system');
  }

  // =================================================================
  // POSITION CALCULATION
  // =================================================================
  const positions: IxconnectPlan['positions'] = [];
  const dowelOffsets = useDowels ? [32] : [];

  // Left position
  positions.push({
    x: margin,
    yOffset,
    rotationY: 0,
    dowelOffsets
  });

  // Right position
  positions.push({
    x: length - margin,
    yOffset,
    rotationY: Math.PI,
    dowelOffsets
  });

  // Center position (for long panels > 600mm, not for Claw)
  if (length > 600 && system !== 'CC_8_5_30') {
    positions.push({
      x: length / 2,
      yOffset,
      rotationY: 0,
      dowelOffsets: useDowels ? [-32, 32] : []
    });
  }

  // =================================================================
  // BUILD META
  // =================================================================
  let faceDrill = { dia: 0, depth: 0, distB: 0 };

  if (system === 'TOFIX_25') {
    faceDrill = {
      dia: main.specs.diameter,    // 25mm
      depth: main.specs.drillDepth, // 12.5mm
      distB: yOffset
    };
  } else if (main.specs.accessDia) {
    faceDrill = {
      dia: main.specs.accessDia,   // 6mm
      depth: 14,                    // Through to edge drill
      distB: main.specs.distB!
    };
  }

  return {
    isValid: true,
    system,
    specs: { main, mating },
    positions,
    meta: {
      edgeDrill: {
        dia: system === 'TOFIX_25' ? main.specs.neckDia! : main.specs.diameter,
        depth: system === 'TOFIX_25' ? yOffset + 13 : main.specs.drillDepth
      },
      faceDrill,
      useDowels,
      formula
    }
  };
}

function createInvalidPlan(system: IxconnectSystem, reason: string): IxconnectPlan {
  return {
    isValid: false,
    system,
    specs: {} as any,
    positions: [],
    meta: {
      edgeDrill: { dia: 0, depth: 0 },
      faceDrill: { dia: 0, depth: 0, distB: 0 },
      useDowels: false
    }
  };
}
```

### 16.4 CAM Generator for Ixconnect & Tofix

```typescript
// src/services/cam/generators/ixconnectOp.ts
import { calculateIxconnectPlan, IxconnectPlan } from '../../engineering/ixconnectEngine';

export interface IxconnectMachineOp {
  id: string;
  type: 'DRILL';
  face: 'EDGE' | 'FACE';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareRef: string;
}

/**
 * Generate CNC operations for Ixconnect and Tofix systems
 *
 * Operations per connector:
 * - SC/U: Edge drill (8/12mm) + Face access hole (6mm)
 * - CC: Edge drill (5mm) only
 * - TOFIX: Face housing (25mm) + Edge neck (7mm)
 */
export function generateIxconnectOps(
  partId: string,
  opts: Parameters<typeof calculateIxconnectPlan>[0]
): IxconnectMachineOp[] {
  const plan = calculateIxconnectPlan(opts);
  if (!plan.isValid) return [];

  const ops: IxconnectMachineOp[] = [];
  const { main, mating } = plan.specs;

  plan.positions.forEach((pos, i) => {
    const { system } = plan;

    // =================================================================
    // IXCONNECT SC/U/CC - One-Piece Connectors
    // =================================================================
    if (system === 'SC_8_60' || system === 'U_12_10' || system === 'CC_8_5_30') {

      // 1. EDGE DRILL (Connector body)
      ops.push({
        id: `${partId}-conn-edge-${i}`,
        type: 'DRILL',
        face: 'EDGE',
        x: pos.x,
        y: 0,
        diameter: plan.meta.edgeDrill.dia,
        depth: plan.meta.edgeDrill.depth,
        hardwareRef: main.itemNo
      });

      // 2. FACE DRILL (Access hole) - Only for SC and U
      if (plan.meta.faceDrill.dia > 0 && system !== 'CC_8_5_30') {
        ops.push({
          id: `${partId}-access-face-${i}`,
          type: 'DRILL',
          face: 'FACE',
          x: pos.x,
          y: plan.meta.faceDrill.distB,
          diameter: plan.meta.faceDrill.dia,
          depth: plan.meta.faceDrill.depth,
          hardwareRef: `${main.itemNo}-ACCESS`
        });
      }
    }

    // =================================================================
    // TOFIX SYSTEM
    // =================================================================
    else if (system === 'TOFIX_25') {

      // 1. FACE DRILL (Housing 25mm)
      ops.push({
        id: `${partId}-tofix-house-${i}`,
        type: 'DRILL',
        face: 'FACE',
        x: pos.x,
        y: pos.yOffset,  // Calculated from formula
        diameter: plan.meta.faceDrill.dia,
        depth: plan.meta.faceDrill.depth,
        hardwareRef: main.itemNo
      });

      // 2. EDGE DRILL (Neck for bolt access)
      ops.push({
        id: `${partId}-tofix-neck-${i}`,
        type: 'DRILL',
        face: 'EDGE',
        x: pos.x,
        y: 0,
        diameter: plan.meta.edgeDrill.dia,   // 7mm
        depth: plan.meta.edgeDrill.depth,    // yOffset + 13mm
        hardwareRef: main.itemNo
      });
    }

    // =================================================================
    // DOWELS (Common)
    // =================================================================
    if (plan.meta.useDowels) {
      pos.dowelOffsets.forEach((off, j) => {
        const xPos = pos.rotationY ? pos.x - off : pos.x + off;
        ops.push({
          id: `${partId}-dowel-${i}-${j}`,
          type: 'DRILL',
          face: 'EDGE',
          x: xPos,
          y: 0,
          diameter: 8,
          depth: 30,
          hardwareRef: 'DOWEL-8x30'
        });
      });
    }
  });

  return ops;
}
```

### 16.5 Visual Component

```typescript
// src/components/3d/hardware/IxconnectConnector.tsx
import React, { useMemo } from 'react';
import { calculateIxconnectPlan } from '../../../services/engineering/ixconnectEngine';

const mm = (v: number) => v / 1000;

interface IxconnectConnectorProps {
  length: number;
  thickness: number;
  targetThickness?: number;
  system: 'SC_8_60' | 'U_12_10' | 'CC_8_5_30' | 'TOFIX_25';
}

export const IxconnectConnector: React.FC<IxconnectConnectorProps> = (props) => {
  const plan = useMemo(() => calculateIxconnectPlan(props), [props]);

  if (!plan.isValid) return null;

  const { main } = plan.specs;
  const { system } = plan;

  return (
    <group>
      {plan.positions.map((pos, i) => (
        <group
          key={i}
          position={[mm(pos.x), 0, 0]}
          rotation={[0, pos.rotationY, 0]}
        >
          {/* SC 8/60 - Red/Grey connector */}
          {system === 'SC_8_60' && (
            <group>
              {/* Body in edge */}
              <mesh position={[0, mm(plan.meta.edgeDrill.depth / 2), 0]}>
                <cylinderGeometry args={[
                  mm(plan.meta.edgeDrill.dia / 2),
                  mm(plan.meta.edgeDrill.dia / 2),
                  mm(plan.meta.edgeDrill.depth),
                  16
                ]} />
                <meshStandardMaterial color="#D32F2F" />
              </mesh>
              {/* Access hole marker */}
              <mesh
                position={[0, mm(plan.meta.faceDrill.distB), mm(5)]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[mm(3), mm(3), mm(10), 16]} />
                <meshBasicMaterial color="#222" wireframe />
              </mesh>
            </group>
          )}

          {/* U 12/10 - Grey heavy duty connector */}
          {system === 'U_12_10' && (
            <group>
              <mesh position={[0, mm(plan.meta.edgeDrill.depth / 2), 0]}>
                <cylinderGeometry args={[
                  mm(plan.meta.edgeDrill.dia / 2),
                  mm(plan.meta.edgeDrill.dia / 2),
                  mm(plan.meta.edgeDrill.depth),
                  16
                ]} />
                <meshStandardMaterial color="#90A4AE" />
              </mesh>
              <mesh
                position={[0, mm(plan.meta.faceDrill.distB), mm(5)]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[mm(3), mm(3), mm(10), 16]} />
                <meshBasicMaterial color="#222" wireframe />
              </mesh>
            </group>
          )}

          {/* CC 8/5/30 - Claw for drawer */}
          {system === 'CC_8_5_30' && (
            <mesh position={[0, mm(15), 0]}>
              <boxGeometry args={[mm(5), mm(30), mm(12)]} />
              <meshStandardMaterial color="#C0C0C0" metalness={0.6} />
            </mesh>
          )}

          {/* TOFIX - Housing */}
          {system === 'TOFIX_25' && (
            <group
              position={[0, mm(pos.yOffset), 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <mesh>
                <cylinderGeometry args={[mm(12.5), mm(12.5), mm(12.5), 32]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
              {/* Cap */}
              <mesh position={[0, mm(6.1), 0]}>
                <boxGeometry args={[mm(20), mm(1), mm(5)]} />
                <meshBasicMaterial color="#795548" />
              </mesh>
            </group>
          )}

          {/* Dowels */}
          {pos.dowelOffsets.map((off, j) => (
            <group key={j} position={[mm(off), 0, 0]}>
              <mesh position={[0, mm(15), 0]}>
                <cylinderGeometry args={[mm(4), mm(4), mm(30), 16]} />
                <meshStandardMaterial color="#D7CCC8" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
};
```

### 16.6 System Comparison Table

| Feature | SC 8/60 | U 12/10 | CC 8/5/30 | TOFIX 25 |
|---------|---------|---------|-----------|----------|
| **Item No** | 262.11.117 | 262.11.600 | 262.11.113 | 261.95.704 |
| **Edge Drill** | 8mm × 60mm | 12mm × 55mm | 5mm × 30mm | 7mm × (A+13)mm |
| **Face Drill** | 6mm @ 25mm | 6mm @ 45mm | None | 25mm @ A |
| **Access Dist** | 25mm | 45mm | 30mm | Formula |
| **Use Dowels** | Yes | Yes | No | Yes |
| **Use Case** | Standard | Heavy Duty | Drawer | Top Mount |
| **Color** | Red/Grey | Grey | Silver | White |

### 16.7 Drilling Pattern Diagrams

```
IXCONNECT SC 8/60 (Dual-Axis Drilling):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SHELF PANEL (Top View):                                       │
│  ──────────────────────                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │    ○ ←── Access Hole (6mm dia)                         │   │
│  │    │     25mm from edge                                 │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │   ════════════════════════════════════════════ ← EDGE  │   │
│  │   │         Edge Drill: 8mm × 60mm deep                │   │
│  │   ▼                                                    │   │
│  │   ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●  │   │
│  │           Connector Body (55mm)                        │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ● = Access hole connects to edge drill for screwdriver        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

IXCONNECT U 12/10 (Heavy Duty):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Same concept but:                                              │
│  - Edge: 12mm × 55mm                                           │
│  - Access: 6mm @ 45mm from edge                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │                                                         │   │
│  │    ○ ←── 45mm from edge (larger spread for HD)         │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │   ════════════════════════════════════════════ ← EDGE  │   │
│  │   │         Edge Drill: 12mm × 55mm deep               │   │
│  │   ▼                                                    │   │
│  │   ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

TOFIX 25 (Dynamic Formula):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SIDE PANEL (Cross Section):                                   │
│  ───────────────────────────                                    │
│                                                                 │
│       TOP PANEL (Thickness = B)                                │
│       ┌────────────────────────────────┐                       │
│       │         ● ← Bolt              │                        │
│       │         │   (5mm × 11mm)       │                        │
│       └─────────┼──────────────────────┘                        │
│                 │                                               │
│  A = B - 1.5mm  │ ← Formula!                                   │
│                 │                                               │
│  SIDE   ┌───────┼───────┐                                      │
│  PANEL  │       │       │                                      │
│         │   ┌───▼───┐   │ ← Housing 25mm @ position A          │
│         │   │   ○   │   │                                      │
│         │   └───────┘   │                                      │
│         │               │                                      │
│   EDGE ═╪═══════════════╪══                                     │
│         │               │                                      │
│         │   ↑           │                                      │
│         │   Neck 7mm    │ ← Depth = A + 13mm                   │
│         │   (for bolt)  │                                      │
│         └───────────────┘                                      │
│                                                                 │
│  Example: If TopThickness = 19mm                               │
│           A = 19 - 1.5 = 17.5mm                                │
│           Neck depth = 17.5 + 13 = 30.5mm                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

IXCONNECT CC 8/5/30 (Drawer Claw):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  DRAWER SIDE (Edge View):                                      │
│  ────────────────────────                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   DRAWER SIDE PANEL                                     │   │
│  │                                                         │   │
│  │   ════════════════════════════════════════════ ← EDGE  │   │
│  │   │         Edge Drill: 5mm × 30mm                     │   │
│  │   ▼                                                    │   │
│  │   ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●                     │   │
│  │           Claw Connector                               │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  - No face drilling required                                    │
│  - No dowels (Claw self-aligns)                                │
│  - Margin: 32mm (drawer standard)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 16.8 Calculation Examples

```typescript
// Example 1: Standard shelf with SC 8/60
const scPlan = calculateIxconnectPlan({
  length: 800,
  thickness: 18,
  system: 'SC_8_60'
});

console.log('=== SC 8/60 Plan ===');
console.log('Valid:', scPlan.isValid);              // true
console.log('Connector:', scPlan.specs.main.name);  // 'Ixconnect SC 8/60'
console.log('Edge Drill:', scPlan.meta.edgeDrill);  // { dia: 8, depth: 60 }
console.log('Face Drill:', scPlan.meta.faceDrill);  // { dia: 6, depth: 14, distB: 25 }
console.log('Positions:', scPlan.positions.length); // 3 (>600mm)
console.log('Uses Dowels:', scPlan.meta.useDowels); // true


// Example 2: Heavy duty with U 12/10
const uPlan = calculateIxconnectPlan({
  length: 600,
  thickness: 18,
  system: 'U_12_10'
});

console.log('\n=== U 12/10 Plan ===');
console.log('Edge Drill:', uPlan.meta.edgeDrill);  // { dia: 12, depth: 55 }
console.log('Access Dist:', uPlan.meta.faceDrill.distB);  // 45mm


// Example 3: Drawer with Claw CC
const clawPlan = calculateIxconnectPlan({
  length: 400,
  thickness: 16,
  system: 'CC_8_5_30'
});

console.log('\n=== CC Claw Plan ===');
console.log('Edge Drill:', clawPlan.meta.edgeDrill);  // { dia: 5, depth: 30 }
console.log('Uses Dowels:', clawPlan.meta.useDowels); // false
console.log('Positions:', clawPlan.positions.length); // 2 (drawer margin 32mm)


// Example 4: Tofix with dynamic formula
const tofixPlan = calculateIxconnectPlan({
  length: 600,
  thickness: 18,
  targetThickness: 25,  // Top panel is 25mm thick
  system: 'TOFIX_25'
});

console.log('\n=== TOFIX 25 Plan ===');
console.log('Formula:', tofixPlan.meta.formula);
// 'A = 25 - 1.5 = 23.5mm'
console.log('Housing Y:', tofixPlan.positions[0].yOffset);  // 23.5mm
console.log('Face Drill:', tofixPlan.meta.faceDrill);
// { dia: 25, depth: 12.5, distB: 23.5 }
console.log('Edge (Neck):', tofixPlan.meta.edgeDrill);
// { dia: 7, depth: 36.5 } (23.5 + 13)


// Example 5: Generate CAM operations
const ops = generateIxconnectOps('SHELF-001', {
  length: 800,
  thickness: 18,
  system: 'SC_8_60'
});

console.log('\n=== CAM Operations ===');
console.log('Total ops:', ops.length);
// 3 connectors × (1 edge + 1 face + 1 dowel) = 9 ops

const edgeOps = ops.filter(op => op.face === 'EDGE' && !op.id.includes('dowel'));
console.log('Edge drills:', edgeOps.length);  // 3
console.log('Edge dia:', edgeOps[0].diameter); // 8mm

const faceOps = ops.filter(op => op.face === 'FACE');
console.log('Face drills:', faceOps.length);  // 3
console.log('Face Y pos:', faceOps[0].y);     // 25mm
```

### 16.9 Technical Reference Table

| Parameter | SC 8/60 | U 12/10 | CC 8/5/30 | TOFIX 25 | Unit |
|-----------|---------|---------|-----------|----------|------|
| **Edge Diameter** | 8 | 12 | 5 | 7 | mm |
| **Edge Depth** | 60 | 55 | 30 | A+13 | mm |
| **Face Diameter** | 6 | 6 | - | 25 | mm |
| **Face Depth** | 14 | 14 | - | 12.5 | mm |
| **Distance B** | 25 | 45 | 30 | A | mm |
| **Mating Drill** | 8 | 10 | 8 | 5 | mm |
| **Dowel Offset** | 32 | 32 | - | 32 | mm |
| **Edge Margin** | 50 | 50 | 32 | 50 | mm |

### 16.10 Tofix Formula Reference

```
TOFIX DRILLING DIMENSION FORMULA:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Given:                                                         │
│  - B = Top Panel Thickness (targetThickness)                   │
│  - Housing position from catalog = B - 9 + 7.5                 │
│                                                                 │
│  Simplified:                                                    │
│  ┌─────────────────────────────────────┐                       │
│  │                                     │                       │
│  │   A = B - 1.5 mm                    │                       │
│  │                                     │                       │
│  │   Neck Depth = A + 13 mm            │                       │
│  │                                     │                       │
│  └─────────────────────────────────────┘                       │
│                                                                 │
│  Examples:                                                      │
│  ┌────────────────┬─────────┬──────────────┐                   │
│  │ Top Thickness  │    A    │  Neck Depth  │                   │
│  ├────────────────┼─────────┼──────────────┤                   │
│  │     16mm       │ 14.5mm  │   27.5mm     │                   │
│  │     18mm       │ 16.5mm  │   29.5mm     │                   │
│  │     19mm       │ 17.5mm  │   30.5mm     │                   │
│  │     22mm       │ 20.5mm  │   33.5mm     │                   │
│  │     25mm       │ 23.5mm  │   36.5mm     │                   │
│  └────────────────┴─────────┴──────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 17: Master Joinery System Engine (Architecture v4.5)

ระบบ **Master Joinery** รวมข้อมูลจาก Häfele Catalog ทั้ง 17 หน้า ครอบคลุม Minifix 12/15, Maxifix 35, S100/S200/S300 Bolts, Mitre Joints, Double-ended Bolts และ Dowels

**Key Features:**
- **Correct Engineering Logic**: แยกแยะระหว่าง Distance B (ระยะเจาะจากขอบ) และ Distance A (ระยะกึ่งกลางความหนา)
- **Auto-Selection**: เลือก CAM อัตโนมัติตามความหนาไม้
- **Mitre Intelligence**: คำนวณ Inset F ตามตารางองศา พร้อมลบ 20mm เมื่อใช้ B=24

### 17.1 Master Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts

/**
 * Master Hardware Database for Minifix/Maxifix Joinery Systems
 * Architecture v4.5 - Complete Catalog Integration
 *
 * Critical Distinction:
 * - Distance A (distA): ระยะกึ่งกลางความหนาไม้ - ใช้ตรวจสอบรุ่น CAM
 * - Distance B (distB): ระยะเจาะจากขอบ - ใช้กำหนดตำแหน่งเจาะ Cam Housing บนหน้าบาน
 */

export type SystemType = 'MINIFIX_15' | 'MINIFIX_12' | 'MAXIFIX_35';
export type BoardThickness = 12 | 13 | 15 | 16 | 18 | 19 | 23 | 26 | 29 | 34;
export type JointAngle = 90 | 100 | 110 | 120 | 130 | 135 | 140 | 150 | 160 | 170 | 180;

export interface HardwareItem {
  id: string;
  itemNo: string;       // รหัสสินค้าจริง (BOM)
  name: string;
  category: 'CAM' | 'BOLT' | 'DOWEL' | 'SLEEVE' | 'CAP';
  specs: {
    drillDepth: number;     // ความลึกเจาะ (D)
    diameter: number;       // ขนาดดอกสว่าน (mm)
    distA?: number;         // ระยะกึ่งกลางความหนาไม้ (A) - ใช้ตรวจสอบความหนา
    distB?: number;         // ระยะเจาะจากขอบ (B) - ใช้กำหนดตำแหน่งเจาะ Cam
    length?: number;        // ความยาวตัวสินค้า
    housingDia?: number;    // ขนาดเบ้า Cam (12/15/35)
    thread?: string;        // ประเภทเกลียว (Special, M6, etc.)
  };
}

export const HAFELE_MASTER_DB = {
  // =================================================================
  // 1. HOUSINGS (CAMS) - เลือกตามความหนาไม้ (PDF Page 2-3, 15)
  // =================================================================
  cams: {
    // --- Minifix 15 (Zinc Alloy) ---
    mf15_12: { id: 'mf15_12', itemNo: '262.26.070', name: 'Minifix 15 (12mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 9.5, distA: 6.0 } },
    mf15_13: { id: 'mf15_13', itemNo: '262.26.031', name: 'Minifix 15 (13mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 11.0, distA: 6.5 } },
    mf15_15: { id: 'mf15_15', itemNo: '262.26.032', name: 'Minifix 15 (15mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 12.0, distA: 7.5 } },
    mf15_16: { id: 'mf15_16', itemNo: '262.26.033', name: 'Minifix 15 (16mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 12.5, distA: 8.0 } }, // Standard 16mm
    mf15_18: { id: 'mf15_18', itemNo: '262.26.034', name: 'Minifix 15 (18mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 13.5, distA: 9.0 } },
    mf15_19: { id: 'mf15_19', itemNo: '262.26.035', name: 'Minifix 15 (19mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 14.0, distA: 9.5 } }, // Standard 19mm
    mf15_23: { id: 'mf15_23', itemNo: '262.26.036', name: 'Minifix 15 (23mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 16.5, distA: 11.5 } },
    mf15_29: { id: 'mf15_29', itemNo: '262.26.038', name: 'Minifix 15 (29mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 19.5, distA: 14.5 } },
    mf15_34: { id: 'mf15_34', itemNo: '262.26.081', name: 'Minifix 15 (34mm)', category: 'CAM', specs: { diameter: 15, drillDepth: 22.5, distA: 17.0 } },

    // --- Minifix 12 (Small) ---
    mf12_std: { id: 'mf12_std', itemNo: '262.17.020', name: 'Minifix 12', category: 'CAM', specs: { diameter: 12, drillDepth: 9.5, distA: 6.0 } },

    // --- Maxifix 35 (Heavy Duty) ---
    maxi_35: { id: 'maxi_35', itemNo: '262.87.013', name: 'Maxifix 35 Housing', category: 'CAM', specs: { diameter: 35, drillDepth: 15.5, distA: 9.5 } } // For 19mm+
  },

  // =================================================================
  // 2. CONNECTING BOLTS (แกนยึด) - PDF Page 5-16
  // =================================================================
  bolts: {
    // --- S200 (Standard) ---
    s200_b24: { id: 's200_b24', itemNo: '262.27.670', name: 'S200 Bolt (B=24)', category: 'BOLT', specs: { distB: 24, length: 24, drillDepth: 11, diameter: 5 } },
    s200_b34: { id: 's200_b34', itemNo: '262.28.670', name: 'S200 Bolt (B=34)', category: 'BOLT', specs: { distB: 34, length: 34, drillDepth: 11, diameter: 5 } },

    // --- S100 (Classic) ---
    s100_b24: { id: 's100_b24', itemNo: '262.27.020', name: 'S100 Bolt (B=24)', category: 'BOLT', specs: { distB: 24, length: 24, drillDepth: 8, diameter: 5 } },

    // --- S300 (High Torque) ---
    s300_b24: { id: 's300_b24', itemNo: '262.27.462', name: 'S300 Bolt (B=24)', category: 'BOLT', specs: { distB: 24, length: 24, drillDepth: 11, diameter: 5 } },

    // --- Mitre Joint (ข้อต่อองศา) PDF Page 13 ---
    mitre_b24: { id: 'mitre_b24', itemNo: '262.12.822', name: 'Mitre Bolt (B=24)', category: 'BOLT', specs: { distB: 24, length: 44, drillDepth: 11, diameter: 7 } },
    mitre_b44: { id: 'mitre_b44', itemNo: '262.12.804', name: 'Mitre Bolt (B=44)', category: 'BOLT', specs: { distB: 44, length: 64, drillDepth: 11, diameter: 7 } },

    // --- Double Ended (แผงกลาง) PDF Page 12 ---
    double_b24: { id: 'double_b24', itemNo: '262.27.109', name: 'Double Bolt (B=24)', category: 'BOLT', specs: { distB: 24, length: 48, drillDepth: 0, diameter: 8 } },

    // --- Maxifix Bolts PDF Page 16 ---
    maxi_b35: { id: 'maxi_b35', itemNo: '262.87.931', name: 'Maxifix Bolt (B=35)', category: 'BOLT', specs: { distB: 35, length: 35, drillDepth: 12, diameter: 9 } },
    maxi_b55: { id: 'maxi_b55', itemNo: '262.87.932', name: 'Maxifix Bolt (B=55)', category: 'BOLT', specs: { distB: 55, length: 55, drillDepth: 12, diameter: 9 } },
  },

  // =================================================================
  // 3. DOWELS & SLEEVES - PDF Page 1
  // =================================================================
  dowels: {
    // Standard Fluted
    wd_8x30: { id: 'wd_8x30', itemNo: '267.83.230', name: 'Wood Dowel 8x30', category: 'DOWEL', specs: { diameter: 8, length: 30, drillDepth: 15 } },
    wd_8x35: { id: 'wd_8x35', itemNo: '267.83.235', name: 'Wood Dowel 8x35', category: 'DOWEL', specs: { diameter: 8, length: 35, drillDepth: 18 } },
    wd_8x40: { id: 'wd_8x40', itemNo: '267.83.240', name: 'Wood Dowel 8x40', category: 'DOWEL', specs: { diameter: 8, length: 40, drillDepth: 20 } },
    // Pre-glued
    pg_8x30: { id: 'pg_8x30', itemNo: '267.84.230', name: 'Pre-glued 8x30', category: 'DOWEL', specs: { diameter: 8, length: 30, drillDepth: 15 } },
    // Plastic Exact
    pl_8x30: { id: 'pl_8x30', itemNo: '267.70.700', name: 'Plastic Exact 8x30', category: 'DOWEL', specs: { diameter: 8, length: 30, drillDepth: 15 } }
  },

  sleeves: {
    m6_glue: { id: 'm6_glue', itemNo: '039.33.462', name: 'M6 Glue-in Sleeve', category: 'SLEEVE', specs: { diameter: 8, drillDepth: 11, length: 11 } },
    m6_spread: { id: 'm6_spread', itemNo: '039.00.267', name: 'M6 Spread Sleeve', category: 'SLEEVE', specs: { diameter: 8, drillDepth: 9, length: 9 } }
  }
};
```

### 17.2 CAM Housing Thickness Map

```
MINIFIX 15 CAM SELECTION BY BOARD THICKNESS:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Thickness  │  Item No      │  Drill Depth │  Distance A       │
│  (mm)       │               │  (mm)        │  (mm)             │
├─────────────┼───────────────┼──────────────┼───────────────────┤
│    12       │  262.26.070   │    9.5       │    6.0            │
│    13       │  262.26.031   │   11.0       │    6.5            │
│    15       │  262.26.032   │   12.0       │    7.5            │
│    16       │  262.26.033   │   12.5       │    8.0  ★         │
│    18       │  262.26.034   │   13.5       │    9.0            │
│    19       │  262.26.035   │   14.0       │    9.5  ★         │
│    23       │  262.26.036   │   16.5       │   11.5            │
│    29       │  262.26.038   │   19.5       │   14.5            │
│    34       │  262.26.081   │   22.5       │   17.0            │
│                                                                 │
│  ★ = Most common thicknesses                                   │
│                                                                 │
│  FORMULA: Distance A ≈ Thickness / 2                           │
│           Drill Depth ≈ Thickness × 0.7                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SYSTEM COMPARISON:
┌─────────────────────────────────────────────────────────────────┐
│  System      │  Housing Dia  │  Min Thickness  │  Use Case      │
├──────────────┼───────────────┼─────────────────┼────────────────┤
│  MINIFIX 12  │    12mm       │     10mm        │  Small/Light   │
│  MINIFIX 15  │    15mm       │     12mm        │  Standard ★    │
│  MAXIFIX 35  │    35mm       │     19mm        │  Heavy Duty    │
└─────────────────────────────────────────────────────────────────┘
```

### 17.3 Joinery Engineering Engine

```typescript
// src/services/engineering/joineryEngine.ts
import { HAFELE_MASTER_DB, HardwareItem, BoardThickness, SystemType, JointAngle } from '../hardware/hafeleDb';

export interface JoineryPlan {
  isValid: boolean;
  issues: string[];
  specs: {
    bolt: HardwareItem;
    cam: HardwareItem;
    dowel: HardwareItem;
    sleeve?: HardwareItem;
  };
  sets: {
    x: number;
    rotationY: number;
    dowelOffsets: number[];
  }[];
  meta: {
    margin: number;
    mitreInset?: number;
    formula?: string;
  };
}

// =================================================================
// MITRE INSET TABLE (PDF Page 13 - For B=44)
// [Angle][Thickness] = Inset F (mm)
// =================================================================
const MITRE_TABLE_B44: Record<number, Record<number, number>> = {
  90:  { 16: 52.0, 19: 53.5, 29: 58.5 },
  100: { 16: 50.4, 19: 51.6, 29: 55.9 },
  110: { 16: 49.4, 19: 50.4, 29: 54.2 },
  120: { 16: 48.6, 19: 49.5, 29: 52.4 },
  130: { 16: 47.9, 19: 48.6, 29: 51.1 },
  135: { 16: 47.3, 19: 47.9, 29: 50.0 },
  140: { 16: 46.9, 19: 47.3, 29: 49.3 },
  150: { 16: 46.0, 19: 46.2, 29: 47.5 },
  160: { 16: 45.2, 19: 45.1, 29: 45.9 },
  170: { 16: 44.5, 19: 44.3, 29: 44.6 },
  180: { 16: 44.0, 19: 44.0, 29: 44.0 }
};

interface JoineryOptions {
  length: number;
  thickness: BoardThickness;
  system?: SystemType;
  angle?: JointAngle;           // 90 = Standard, other = Mitre
  boltType?: 'STANDARD' | 'MITRE' | 'DOUBLE' | 'MAXIFIX';
  boltLength?: 24 | 34 | 44 | 55;   // Drilling Distance B
  dowelType?: string;
}

/**
 * Calculate joinery plan with auto-selection
 *
 * Key Rule (PDF Page 13):
 * "For drilling dim. B 24 mm, 20 mm must be deducted from inset F"
 */
export const calculateJoinery = (opts: JoineryOptions): JoineryPlan => {
  const {
    length,
    thickness,
    system = 'MINIFIX_15',
    angle = 90,
    boltType = 'STANDARD',
    boltLength = 24,
    dowelType = 'wd_8x30'
  } = opts;

  const issues: string[] = [];

  // =================================================================
  // 1. AUTO-SELECT CAM (ตามความหนาไม้)
  // =================================================================
  let cam: HardwareItem;

  if (system === 'MAXIFIX_35') {
    cam = HAFELE_MASTER_DB.cams.maxi_35;
    if (thickness < 19) {
      issues.push(`Maxifix requires minimum 19mm thickness, got ${thickness}mm`);
    }
  } else if (system === 'MINIFIX_12') {
    cam = HAFELE_MASTER_DB.cams.mf12_std;
  } else {
    // MINIFIX_15 Auto-Selection Logic
    const db = HAFELE_MASTER_DB.cams;
    if (thickness <= 12) cam = db.mf15_12;
    else if (thickness === 13) cam = db.mf15_13;
    else if (thickness === 15) cam = db.mf15_15;
    else if (thickness === 16) cam = db.mf15_16;
    else if (thickness === 18) cam = db.mf15_18;
    else if (thickness === 19) cam = db.mf15_19;
    else if (thickness <= 23) cam = db.mf15_23;
    else if (thickness <= 29) cam = db.mf15_29;
    else cam = db.mf15_34;
  }

  // =================================================================
  // 2. AUTO-SELECT BOLT
  // =================================================================
  let bolt: HardwareItem;

  if (system === 'MAXIFIX_35') {
    bolt = boltLength === 55
      ? HAFELE_MASTER_DB.bolts.maxi_b55
      : HAFELE_MASTER_DB.bolts.maxi_b35;
  } else if (boltType === 'MITRE') {
    bolt = boltLength === 24
      ? HAFELE_MASTER_DB.bolts.mitre_b24
      : HAFELE_MASTER_DB.bolts.mitre_b44;
  } else if (boltType === 'DOUBLE') {
    bolt = HAFELE_MASTER_DB.bolts.double_b24;
  } else {
    // Standard S200
    bolt = boltLength === 34
      ? HAFELE_MASTER_DB.bolts.s200_b34
      : HAFELE_MASTER_DB.bolts.s200_b24;
  }

  // =================================================================
  // 3. DOWEL
  // =================================================================
  const dowel = HAFELE_MASTER_DB.dowels[dowelType as keyof typeof HAFELE_MASTER_DB.dowels]
    || HAFELE_MASTER_DB.dowels.wd_8x30;

  // =================================================================
  // 4. MARGIN CALCULATION (Critical for Mitre Joints!)
  // =================================================================
  let margin = bolt.specs.distB!;
  let mitreInset: number | undefined;
  let formula: string | undefined;

  if (boltType === 'MITRE' && angle !== 180) {
    // Mitre Inset F from table (base value for B=44)
    const closestThickness = thickness <= 16 ? 16 : thickness <= 19 ? 19 : 29;
    const fBase = MITRE_TABLE_B44[angle]?.[closestThickness] || 53.5;

    // KEY RULE: If B=24, deduct 20mm from F
    mitreInset = (boltLength === 24) ? fBase - 20 : fBase;
    margin = mitreInset;
    formula = boltLength === 24
      ? `F = ${fBase} - 20 = ${mitreInset}mm (B=24 rule)`
      : `F = ${fBase}mm (B=44)`;
  }

  // =================================================================
  // 5. LAYOUT GENERATION
  // =================================================================
  const sets: JoineryPlan['sets'] = [];
  const dowelSpacing = 32;

  // Left position
  sets.push({
    x: margin,
    rotationY: 0,
    dowelOffsets: [dowelSpacing]
  });

  // Right position
  sets.push({
    x: length - margin,
    rotationY: Math.PI,
    dowelOffsets: [dowelSpacing]
  });

  // Center position for long panels (>450mm)
  if (length > 450) {
    sets.push({
      x: length / 2,
      rotationY: 0,
      dowelOffsets: [-dowelSpacing, dowelSpacing]
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
    specs: { bolt, cam, dowel },
    sets,
    meta: { margin, mitreInset, formula }
  };
};
```

### 17.4 CAM Operation Generator

```typescript
// src/services/cam/generators/masterOp.ts
import { calculateJoinery, JoineryPlan } from '../../engineering/joineryEngine';
import { BoardThickness, SystemType, JointAngle } from '../../hardware/hafeleDb';

export interface MasterMachineOp {
  id: string;
  type: 'DRILL';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  face: 'FACE' | 'EDGE';
  hardwareId: string;
}

/**
 * Generate CNC operations for Minifix/Maxifix joinery
 *
 * Operations per connector set:
 * - Bolt Channel (Edge Boring): Drilled into mating panel edge
 * - CAM Housing (Face Boring): Drilled into receiving panel face
 * - Dowels (Edge Boring): Alignment pins
 *
 * IMPORTANT: CAM Housing Y Position = Bolt's Distance B
 * (NOT the CAM's Distance A - that's for thickness validation only!)
 */
export const generateMasterOps = (
  partId: string,
  length: number,
  thickness: BoardThickness,
  system: SystemType = 'MINIFIX_15',
  angle: JointAngle = 90,
  boltType: 'STANDARD' | 'MITRE' | 'DOUBLE' | 'MAXIFIX' = 'STANDARD',
  boltLength: 24 | 34 | 44 | 55 = 24
): MasterMachineOp[] => {

  const plan = calculateJoinery({
    length,
    thickness,
    system,
    angle,
    boltType,
    boltLength
  });

  if (!plan.isValid) return [];

  const ops: MasterMachineOp[] = [];
  const { bolt, cam, dowel } = plan.specs;

  plan.sets.forEach((set, i) => {

    // =================================================================
    // 1. BOLT CHANNEL (Edge Boring - เจาะสันบาน)
    // This goes into the MATING panel (e.g., shelf edge)
    // =================================================================
    ops.push({
      id: `${partId}-bolt-${i}`,
      type: 'DRILL',
      x: set.x,
      y: 0, // Center of edge
      diameter: bolt.specs.diameter,
      depth: (bolt.specs.length || bolt.specs.distB!) + 1, // เจาะลึกเผื่อ 1mm
      face: 'EDGE',
      hardwareId: bolt.itemNo
    });

    // =================================================================
    // 2. CAM HOUSING (Face Boring - เจาะหน้าบาน)
    // This goes into the RECEIVING panel (e.g., side panel)
    //
    // CRITICAL: Y position = Bolt's Distance B
    // The CAM's distA is for THICKNESS validation, not Y positioning!
    // =================================================================
    ops.push({
      id: `${partId}-cam-${i}`,
      type: 'DRILL',
      x: set.x,
      y: bolt.specs.distB!, // ระยะจากขอบ = Drilling Distance B
      diameter: cam.specs.diameter,
      depth: cam.specs.drillDepth,
      face: 'FACE',
      hardwareId: cam.itemNo
    });

    // =================================================================
    // 3. DOWELS (Edge Boring)
    // Alignment pins on either side of bolt
    // =================================================================
    set.dowelOffsets.forEach((off, j) => {
      const realOffset = set.rotationY !== 0 ? -off : off;
      ops.push({
        id: `${partId}-dowel-${i}-${j}`,
        type: 'DRILL',
        x: set.x + realOffset,
        y: 0, // Center of edge
        diameter: dowel.specs.diameter,
        depth: dowel.specs.drillDepth,
        face: 'EDGE',
        hardwareId: dowel.itemNo
      });
    });

  });

  return ops;
};
```

### 17.5 Visual Component

```typescript
// src/components/visual/hardware/MasterConnector.tsx
import React, { useMemo } from 'react';
import { calculateJoinery } from '../../../services/engineering/joineryEngine';
import { BoardThickness, SystemType, JointAngle } from '../../../services/hardware/hafeleDb';

const mm = (v: number) => v / 1000;

interface Props {
  length: number;
  thickness: BoardThickness;
  system?: SystemType;
  angle?: JointAngle;
  boltType?: 'STANDARD' | 'MITRE' | 'DOUBLE' | 'MAXIFIX';
  boltLength?: 24 | 34 | 44 | 55;
}

export const MasterConnector: React.FC<Props> = ({
  length,
  thickness,
  system = 'MINIFIX_15',
  angle = 90,
  boltType = 'STANDARD',
  boltLength = 24
}) => {

  const plan = useMemo(() =>
    calculateJoinery({ length, thickness, system, angle, boltType, boltLength }),
  [length, thickness, system, angle, boltType, boltLength]);

  if (!plan.isValid) return null;
  const { bolt, cam, dowel } = plan.specs;

  // Color mapping
  const camColor = system === 'MAXIFIX_35' ? '#5D4037' : '#C0C0C0';
  const boltColor = boltType === 'MITRE' ? '#FFD54F' : '#888888';

  return (
    <group>
      {plan.sets.map((set, i) => (
        <group
          key={i}
          position={[mm(set.x), 0, 0]}
          rotation={[0, set.rotationY, 0]}
        >

          {/* === CAM HOUSING === */}
          <group
            position={[0, mm(bolt.specs.distB || 34), 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            {/* Main Cylinder */}
            <mesh>
              <cylinderGeometry args={[
                mm(cam.specs.diameter / 2),
                mm(cam.specs.diameter / 2),
                mm(cam.specs.drillDepth),
                32
              ]} />
              <meshStandardMaterial color={camColor} metalness={0.4} />
            </mesh>
            {/* Cam Slot */}
            <mesh position={[0, mm(cam.specs.drillDepth / 2 + 0.1), 0]}>
              <boxGeometry args={[mm(cam.specs.diameter / 1.5), mm(0.5), mm(1)]} />
              <meshBasicMaterial color="#222" />
            </mesh>
          </group>

          {/* === BOLT === */}
          <mesh position={[0, mm((bolt.specs.distB || 34) / 2), 0]}>
            <cylinderGeometry args={[
              mm(bolt.specs.diameter / 2),
              mm(bolt.specs.diameter / 2),
              mm(bolt.specs.distB || 34),
              12
            ]} />
            <meshStandardMaterial color={boltColor} metalness={0.6} />
          </mesh>

          {/* Bolt Head */}
          <mesh position={[0, mm(1), 0]}>
            <cylinderGeometry args={[mm(4), mm(4), mm(2), 6]} />
            <meshStandardMaterial color={boltColor} />
          </mesh>

          {/* === DOWELS === */}
          {set.dowelOffsets.map((off, j) => (
            <group key={j} position={[mm(off), 0, 0]}>
              <mesh position={[0, mm(dowel.specs.length! / 2), 0]}>
                <cylinderGeometry args={[
                  mm(dowel.specs.diameter / 2),
                  mm(dowel.specs.diameter / 2),
                  mm(dowel.specs.length || 30),
                  16
                ]} />
                <meshStandardMaterial color="#D7CCC8" />
              </mesh>
            </group>
          ))}

        </group>
      ))}
    </group>
  );
};
```

### 17.6 Bolt Series Comparison

```
CONNECTING BOLT SERIES:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Series  │  Item No      │  Dist B  │  Drill Dia │  Use Case           │
├──────────┼───────────────┼──────────┼────────────┼─────────────────────┤
│  S100    │  262.27.020   │   24mm   │    5mm     │  Classic, Economy   │
│  S200    │  262.27.670   │   24mm   │    5mm     │  Standard ★         │
│  S200    │  262.28.670   │   34mm   │    5mm     │  Deeper panels      │
│  S300    │  262.27.462   │   24mm   │    5mm     │  High torque        │
│  Mitre   │  262.12.822   │   24mm   │    7mm     │  Angled joints      │
│  Mitre   │  262.12.804   │   44mm   │    7mm     │  Angled joints HD   │
│  Double  │  262.27.109   │   24mm   │    8mm     │  Center panels      │
│  Maxifix │  262.87.931   │   35mm   │    9mm     │  Heavy duty         │
│  Maxifix │  262.87.932   │   55mm   │    9mm     │  Heavy duty deep    │
│                                                                         │
│  ★ = Recommended for most applications                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 17.7 Mitre Joint Drilling Diagram

```
MITRE JOINT DRILLING (PDF Page 13):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  CRITICAL RULE:                                                 │
│  ══════════════                                                 │
│  "For drilling dim. B 24 mm, 20 mm must be deducted from F"    │
│                                                                 │
│           Panel 1                                               │
│           ┌─────────────────────────┐                          │
│           │                    ╲    │                           │
│           │                     ╲   │                           │
│           │                      ╲  │                           │
│           │         ○ ← Cam       ╲ │ ← Mitre cut              │
│           │         │              ╲│                           │
│           │         │               │                           │
│           │         │               │                           │
│           │    F ←──┤               │                           │
│           │         │               │                           │
│           │         │               │                           │
│           ├─────────┼───────────────┤                           │
│           │         │               │                           │
│           │         │               │                           │
│           │         ▼ Bolt          │                           │
│           │         ●               │                           │
│           │        ╱                │                           │
│           │       ╱ Panel 2         │                           │
│           │      ╱                  │                           │
│           └─────────────────────────┘                           │
│                                                                 │
│  INSET F VALUES (B=44 base):                                   │
│  ┌─────────┬────────┬────────┬────────┐                        │
│  │ Angle   │  16mm  │  19mm  │  29mm  │                        │
│  ├─────────┼────────┼────────┼────────┤                        │
│  │   90°   │  52.0  │  53.5  │  58.5  │                        │
│  │  120°   │  48.6  │  49.5  │  52.4  │                        │
│  │  135°   │  47.3  │  47.9  │  50.0  │                        │
│  │  180°   │  44.0  │  44.0  │  44.0  │                        │
│  └─────────┴────────┴────────┴────────┘                        │
│                                                                 │
│  FOR B=24: F = TableValue - 20mm                               │
│  Example: 90° @ 19mm → F = 53.5 - 20 = 33.5mm                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 17.8 Drilling Pattern Diagrams

```
STANDARD JOINT (90°):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SIDE PANEL (Receiving - has CAM housing):                     │
│  ──────────────────────────────────────────                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │    ○ ← CAM Housing (15mm dia)                          │   │
│  │    │   Position Y = Distance B (24/34mm)               │   │
│  │    │                                                    │   │
│  │    ●─●─● ← Dowel holes (8mm)                           │   │
│  │                                                         │   │
│  │    X position = Margin from edge                        │   │
│  │    (24mm for B=24, 34mm for B=34)                       │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SHELF PANEL (Mating - has bolt channel):                      │
│  ────────────────────────────────────────                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                        SHELF                            │   │
│  │                                                         │   │
│  │   ════════════════════════════════════════════ ← EDGE  │   │
│  │   │         Edge Drill: 5mm dia                        │   │
│  │   ▼         Depth = B + 1mm                            │   │
│  │   ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●  │   │
│  │           Bolt Channel                                  │   │
│  │   ●─●─● ← Dowel holes                                  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

DOUBLE-ENDED BOLT (Center Panel):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│           LEFT          CENTER          RIGHT                   │
│           PANEL         PANEL           PANEL                   │
│           ┌──────┐    ┌──────┐        ┌──────┐                 │
│           │      │    │      │        │      │                 │
│           │  ○───┼────┼──●───┼────────┼───○  │                 │
│           │ CAM  │    │BOLT  │        │ CAM  │                 │
│           │      │    │      │        │      │                 │
│           │      │    │      │        │      │                 │
│           └──────┘    └──────┘        └──────┘                 │
│                                                                 │
│  Double-ended bolt connects through center panel               │
│  - Bolt goes in center panel edge (8mm × 48mm)                │
│  - CAMs in both side panels                                    │
│  - Allows flat-pack furniture assembly                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 17.9 Calculation Examples

```typescript
// Example 1: Standard 18mm shelf with Minifix 15
const standardPlan = calculateJoinery({
  length: 800,
  thickness: 18,
  system: 'MINIFIX_15',
  boltLength: 24
});

console.log('=== Standard 18mm Shelf ===');
console.log('CAM:', standardPlan.specs.cam.name);
// 'Minifix 15 (18mm)' - Auto-selected!
console.log('CAM Item:', standardPlan.specs.cam.itemNo);
// '262.26.034'
console.log('Bolt:', standardPlan.specs.bolt.name);
// 'S200 Bolt (B=24)'
console.log('Margin:', standardPlan.meta.margin);
// 24mm


// Example 2: Heavy duty with Maxifix
const maxifixPlan = calculateJoinery({
  length: 600,
  thickness: 19,
  system: 'MAXIFIX_35',
  boltLength: 35
});

console.log('\n=== Maxifix Heavy Duty ===');
console.log('CAM Dia:', maxifixPlan.specs.cam.specs.diameter);
// 35mm
console.log('Bolt Dia:', maxifixPlan.specs.bolt.specs.diameter);
// 9mm


// Example 3: Mitre joint at 120°
const mitrePlan = calculateJoinery({
  length: 500,
  thickness: 19,
  boltType: 'MITRE',
  boltLength: 24,
  angle: 120
});

console.log('\n=== Mitre Joint 120° ===');
console.log('Formula:', mitrePlan.meta.formula);
// 'F = 49.5 - 20 = 29.5mm (B=24 rule)'
console.log('Actual Margin:', mitrePlan.meta.margin);
// 29.5mm (NOT 49.5mm!)


// Example 4: Generate CAM operations
const ops = generateMasterOps(
  'SHELF-001',
  800,
  18,
  'MINIFIX_15',
  90,
  'STANDARD',
  24
);

console.log('\n=== CAM Operations ===');
console.log('Total ops:', ops.length);
// 9 (3 sets × 3 ops per set)

const edgeOps = ops.filter(op => op.face === 'EDGE' && op.id.includes('bolt'));
console.log('Bolt channels:', edgeOps.length);  // 3
console.log('Bolt dia:', edgeOps[0].diameter);  // 5mm
console.log('Bolt depth:', edgeOps[0].depth);   // 25mm (24+1)

const faceOps = ops.filter(op => op.face === 'FACE');
console.log('CAM housings:', faceOps.length);   // 3
console.log('CAM dia:', faceOps[0].diameter);   // 15mm
console.log('CAM Y pos:', faceOps[0].y);        // 24mm (= Distance B!)
```

### 17.10 Technical Reference Table

| Parameter | Minifix 12 | Minifix 15 | Maxifix 35 | Unit |
|-----------|------------|------------|------------|------|
| **Housing Dia** | 12 | 15 | 35 | mm |
| **Min Thickness** | 10 | 12 | 19 | mm |
| **Max Thickness** | 15 | 34 | 50+ | mm |
| **Standard Bolt** | S200 (24) | S200 (24/34) | Maxi (35/55) | mm |
| **Bolt Diameter** | 5 | 5 | 9 | mm |
| **Dowel Standard** | 8×30 | 8×30 | 8×35 | mm |
| **Load Capacity** | Light | Standard | Heavy | - |
| **Price Level** | Economy | Standard | Premium | - |

### 17.11 Distance A vs Distance B Clarification

```
CRITICAL DISTINCTION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  DISTANCE A (distA):                                           │
│  ═══════════════════                                            │
│  - ระยะกึ่งกลางความหนาไม้                                       │
│  - ใช้สำหรับ: เลือกรุ่น CAM ที่เหมาะสม                          │
│  - ไม่ใช่ตำแหน่งเจาะ!                                           │
│                                                                 │
│  ┌─────────────────────┐                                       │
│  │                     │                                       │
│  │ ← A → ○ ← A →       │  A ≈ Thickness / 2                   │
│  │      CAM            │                                       │
│  │                     │                                       │
│  └─────────────────────┘                                       │
│  ↑_____Thickness_____↑                                         │
│                                                                 │
│  DISTANCE B (distB):                                           │
│  ═══════════════════                                            │
│  - ระยะเจาะจากขอบแผ่นไม้                                        │
│  - ใช้สำหรับ: กำหนดตำแหน่ง Y ของ CAM Housing บนหน้าบาน         │
│  - นี่คือตำแหน่งเจาะจริง!                                       │
│                                                                 │
│  PANEL EDGE                                                     │
│       │                                                         │
│       │← B →│                                                   │
│       │     ○ ← CAM Housing position                           │
│       │                                                         │
│       │                                                         │
│       ▼                                                         │
│  ═══════════════════════                                        │
│                                                                 │
│  COMMON MISTAKE:                                                │
│  ❌ Using CAM's distA for Y position                           │
│  ✅ Using BOLT's distB for Y position                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 17.12 Quality Validation Checklist

```typescript
// Validation helper for joinery plans
export function validateJoineryPlan(plan: JoineryPlan): string[] {
  const errors: string[] = [];

  // 1. Check CAM matches thickness
  const cam = plan.specs.cam;
  const expectedDistA = cam.specs.distA;
  // distA should be approximately half the board thickness

  // 2. Check bolt distance is reasonable
  const bolt = plan.specs.bolt;
  if (bolt.specs.distB! < 20) {
    errors.push('Bolt distance B too short - may cause breakout');
  }

  // 3. Check connector spacing
  const positions = plan.sets.map(s => s.x);
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i] - positions[i - 1];
    if (gap < 100) {
      errors.push(`Connectors too close: ${gap}mm between positions`);
    }
  }

  // 4. Check margin from edge
  if (plan.meta.margin < 20) {
    errors.push(`Edge margin too small: ${plan.meta.margin}mm`);
  }

  return errors;
}
```

---

## ส่วนที่ 18: Wood Dowels Complete System (Architecture v4.0)

ระบบ **Wood Dowels** รวบรวมข้อมูลจาก Häfele Catalog ครบถ้วนทุกรุ่น ครอบคลุม Fluted (ร่องมาตรฐาน), Pre-Glued (อัดกาวในตัว) และ Plastic Exact พร้อม Dynamic Drill Depth Logic ที่สัมพันธ์กับความยาวเดือย

**Key Features:**
- **Complete SKU Coverage**: รองรับ Dowel หลากหลายขนาด (6x30 ถึง 8x40)
- **Dynamic Engineering**: ความลึกเจาะ (Drill Depth) คำนวณอัตโนมัติตามความยาวเดือย
- **Category-Aware Rendering**: แสดงผล 3D ต่างกันตามชนิดวัสดุ (ไม้/กาว/พลาสติก)

### 18.1 Wood Dowels Hardware Database

```typescript
// src/services/hardware/hafeleDb.ts - Dowels Section

/**
 * Wood Dowels Complete Database
 * Architecture v4.0 - All Variants from Häfele Catalog 267-84-239
 *
 * Categories:
 * - Fluted: Standard wood dowels with glue grooves
 * - Pre-Glued: Water-activated adhesive coating
 * - Plastic: EXACT positioning dowels
 *
 * Drill Depth Formula:
 * - drillDepth = length / 2 (symmetric insertion)
 * - Standard 8x30: 15mm per side
 * - Standard 8x35: 18mm per side (deeper)
 * - Standard 8x40: 20mm per side
 */

export type DowelSelector =
  | 'STANDARD_6x30'
  | 'STANDARD_8x30'
  | 'STANDARD_8x35'
  | 'STANDARD_8x40'
  | 'PREGLUED_8x30'
  | 'PREGLUED_8x35'
  | 'PLASTIC_EXACT';

export interface DowelItem {
  id: string;
  itemNo: string;       // Häfele SKU for BOM
  name: string;
  category: 'Standard' | 'Pre-Glued' | 'Plastic';
  specs: {
    diameter: number;   // Drill bit size (mm)
    length: number;     // Total dowel length (mm)
    drillDepth: number; // Depth per side (mm)
  };
}

export const DOWEL_CATALOG: Record<DowelSelector, DowelItem> = {
  // =================================================================
  // GROUP A: Wood Dowels (Fluted) - Standard Glue Grooves
  // Material: Kiln-dried hardwood
  // =================================================================
  'STANDARD_6x30': {
    id: 'dowel_fluted_6x30',
    itemNo: '267.83.130',
    name: 'Wood Dowel 6x30mm (Fluted)',
    category: 'Standard',
    specs: { diameter: 6, length: 30, drillDepth: 15 }
  },

  'STANDARD_8x30': {
    id: 'dowel_fluted_8x30',
    itemNo: '267.83.230',
    name: 'Wood Dowel 8x30mm (Fluted)',
    category: 'Standard',
    specs: { diameter: 8, length: 30, drillDepth: 15 }
  },

  'STANDARD_8x35': {
    id: 'dowel_fluted_8x35',
    itemNo: '267.83.235',
    name: 'Wood Dowel 8x35mm (Fluted)',
    category: 'Standard',
    specs: { diameter: 8, length: 35, drillDepth: 18 }  // Deeper insertion
  },

  'STANDARD_8x40': {
    id: 'dowel_fluted_8x40',
    itemNo: '267.83.240',
    name: 'Wood Dowel 8x40mm (Fluted)',
    category: 'Standard',
    specs: { diameter: 8, length: 40, drillDepth: 20 }
  },

  // =================================================================
  // GROUP B: Pre-Glued Dowels (Water Activated)
  // "Simply replace your glue with water"
  // =================================================================
  'PREGLUED_8x30': {
    id: 'dowel_preglued_8x30',
    itemNo: '267.84.230',
    name: 'Pre-Glued Dowel 8x30mm (Water Activated)',
    category: 'Pre-Glued',
    specs: { diameter: 8, length: 30, drillDepth: 15 }
  },

  'PREGLUED_8x35': {
    id: 'dowel_preglued_8x35',
    itemNo: '267.84.235',
    name: 'Pre-Glued Dowel 8x35mm (Water Activated)',
    category: 'Pre-Glued',
    specs: { diameter: 8, length: 35, drillDepth: 18 }
  },

  // =================================================================
  // GROUP C: EXACT Plastic Dowel
  // Precision positioning, no glue required
  // =================================================================
  'PLASTIC_EXACT': {
    id: 'dowel_plastic_exact',
    itemNo: '267.70.700',
    name: 'EXACT Plastic Dowel 8x30mm (White)',
    category: 'Plastic',
    specs: { diameter: 8, length: 30, drillDepth: 15 }
  }
};
```

### 18.2 Dowel Specifications Table

```
WOOD DOWELS - COMPLETE CATALOG:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Category    │  Size    │  Item No      │  Drill Dia  │  Drill Depth       │
├──────────────┼──────────┼───────────────┼─────────────┼────────────────────┤
│              │          │               │             │                    │
│  STANDARD    │  6×30    │  267.83.130   │    6mm      │    15mm            │
│  (Fluted)    │  8×30 ★  │  267.83.230   │    8mm      │    15mm            │
│              │  8×35    │  267.83.235   │    8mm      │    18mm            │
│              │  8×40    │  267.83.240   │    8mm      │    20mm            │
│              │          │               │             │                    │
├──────────────┼──────────┼───────────────┼─────────────┼────────────────────┤
│              │          │               │             │                    │
│  PRE-GLUED   │  8×30    │  267.84.230   │    8mm      │    15mm            │
│  (Water Act) │  8×35    │  267.84.235   │    8mm      │    18mm            │
│              │          │               │             │                    │
├──────────────┼──────────┼───────────────┼─────────────┼────────────────────┤
│              │          │               │             │                    │
│  PLASTIC     │  8×30    │  267.70.700   │    8mm      │    15mm            │
│  (EXACT)     │          │               │             │                    │
│              │          │               │             │                    │
└──────────────┴──────────┴───────────────┴─────────────┴────────────────────┘

★ = Most common for furniture joinery

DRILL DEPTH FORMULA:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Drill Depth = Dowel Length / 2                               │
│                                                                 │
│   Examples:                                                     │
│   - 8×30mm → 15mm per side (30 ÷ 2)                           │
│   - 8×35mm → 18mm per side (35 ÷ 2, rounded up)               │
│   - 8×40mm → 20mm per side (40 ÷ 2)                           │
│                                                                 │
│   Why not exactly half?                                         │
│   - 8×35 uses 18mm (not 17.5) for machining convenience        │
│   - Always round UP for secure fit                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 18.3 Dowel Engineering Engine

```typescript
// src/services/engineering/dowelEngine.ts
import { DOWEL_CATALOG, DowelSelector, DowelItem } from '../hardware/hafeleDb';

export interface DowelPlan {
  isValid: boolean;
  issues: string[];
  dowel: DowelItem;
  positions: {
    x: number;
    depth: number;
  }[];
  meta: {
    totalDowels: number;
    spacing: number;
    margin: number;
  };
}

interface DowelOptions {
  length: number;
  thickness: number;
  dowelType?: DowelSelector;
  minSpacing?: number;      // Default: 32mm (System 32)
  edgeMargin?: number;      // Default: 37mm
  maxDowels?: number;       // Limit number of dowels
}

/**
 * Calculate dowel positions for panel joinery
 *
 * Layout Rules:
 * - Edge margin: 37mm from each end (System 32 compatible)
 * - Spacing: 32mm intervals (or multiple)
 * - Center alignment for odd positions
 */
export function calculateDowelPlan(opts: DowelOptions): DowelPlan {
  const {
    length,
    thickness,
    dowelType = 'STANDARD_8x30',
    minSpacing = 32,
    edgeMargin = 37,
    maxDowels = 10
  } = opts;

  const issues: string[] = [];
  const dowel = DOWEL_CATALOG[dowelType];

  // =================================================================
  // VALIDATION
  // =================================================================

  // Check thickness vs dowel diameter
  if (thickness < dowel.specs.diameter * 2) {
    issues.push(`Panel thickness ${thickness}mm too thin for ${dowel.specs.diameter}mm dowels`);
  }

  // Check minimum length
  const minLength = edgeMargin * 2 + minSpacing;
  if (length < minLength) {
    issues.push(`Panel length ${length}mm too short (min: ${minLength}mm)`);
  }

  // Check drill depth vs thickness
  if (dowel.specs.drillDepth > thickness - 3) {
    issues.push(`Drill depth ${dowel.specs.drillDepth}mm too deep for ${thickness}mm panel`);
  }

  if (issues.length > 0) {
    return {
      isValid: false,
      issues,
      dowel,
      positions: [],
      meta: { totalDowels: 0, spacing: 0, margin: edgeMargin }
    };
  }

  // =================================================================
  // POSITION CALCULATION
  // =================================================================
  const positions: DowelPlan['positions'] = [];
  const usableLength = length - (edgeMargin * 2);

  // Calculate number of dowels
  let numDowels = Math.floor(usableLength / minSpacing) + 1;
  numDowels = Math.min(numDowels, maxDowels);
  numDowels = Math.max(numDowels, 2); // Minimum 2 dowels

  // Calculate actual spacing
  const actualSpacing = usableLength / (numDowels - 1);

  // Generate positions
  for (let i = 0; i < numDowels; i++) {
    positions.push({
      x: edgeMargin + (i * actualSpacing),
      depth: dowel.specs.drillDepth
    });
  }

  return {
    isValid: true,
    issues: [],
    dowel,
    positions,
    meta: {
      totalDowels: numDowels,
      spacing: actualSpacing,
      margin: edgeMargin
    }
  };
}

/**
 * Get dowel by selector with fallback
 */
export function getDowel(selector: DowelSelector): DowelItem {
  return DOWEL_CATALOG[selector] || DOWEL_CATALOG['STANDARD_8x30'];
}

/**
 * Recommend dowel based on panel thickness
 */
export function recommendDowel(thickness: number): DowelSelector {
  if (thickness <= 15) return 'STANDARD_6x30';
  if (thickness <= 18) return 'STANDARD_8x30';
  if (thickness <= 22) return 'STANDARD_8x35';
  return 'STANDARD_8x40';
}
```

### 18.4 CAM Generator for Dowels

```typescript
// src/services/cam/generators/dowelOp.ts
import { calculateDowelPlan, DowelPlan } from '../../engineering/dowelEngine';
import { DowelSelector } from '../../hardware/hafeleDb';

export interface DowelMachineOp {
  id: string;
  type: 'DRILL';
  face: 'EDGE' | 'FACE';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareRef: string;
  description?: string;
}

/**
 * Generate CNC drilling operations for dowels
 *
 * Dowels require matched holes on both mating panels:
 * - Panel A (EDGE): Dowel inserted into edge
 * - Panel B (FACE): Mating holes on face
 */
export function generateDowelOps(
  partId: string,
  opts: {
    length: number;
    thickness: number;
    dowelType?: DowelSelector;
    face: 'EDGE' | 'FACE';
  }
): DowelMachineOp[] {
  const plan = calculateDowelPlan(opts);
  if (!plan.isValid) return [];

  const ops: DowelMachineOp[] = [];
  const { dowel, positions } = plan;

  positions.forEach((pos, i) => {
    ops.push({
      id: `${partId}-dowel-${opts.face.toLowerCase()}-${i}`,
      type: 'DRILL',
      face: opts.face,
      x: pos.x,
      y: opts.face === 'FACE' ? plan.meta.margin : 0, // Face: distance from edge
      diameter: dowel.specs.diameter,
      depth: pos.depth,
      hardwareRef: dowel.itemNo,
      description: `${dowel.name} - Position ${i + 1}`
    });
  });

  return ops;
}

/**
 * Generate matched dowel operations for both panels
 *
 * Returns operations for:
 * - Edge panel (e.g., shelf edge)
 * - Face panel (e.g., cabinet side)
 */
export function generateMatchedDowelOps(
  panelAId: string,
  panelBId: string,
  opts: {
    length: number;
    thickness: number;
    dowelType?: DowelSelector;
  }
): {
  panelA: DowelMachineOp[];
  panelB: DowelMachineOp[];
} {
  const edgeOps = generateDowelOps(panelAId, { ...opts, face: 'EDGE' });
  const faceOps = generateDowelOps(panelBId, { ...opts, face: 'FACE' });

  return {
    panelA: edgeOps,
    panelB: faceOps
  };
}
```

### 18.5 Visual Component

```typescript
// src/components/visual/hardware/DowelSystem.tsx
import React, { useMemo } from 'react';
import { calculateDowelPlan } from '../../../services/engineering/dowelEngine';
import { DowelSelector } from '../../../services/hardware/hafeleDb';

const mm = (v: number) => v / 1000;

interface Props {
  length: number;
  thickness: number;
  dowelType?: DowelSelector;
  showLabels?: boolean;
}

export const DowelSystem: React.FC<Props> = ({
  length,
  thickness,
  dowelType = 'STANDARD_8x30',
  showLabels = false
}) => {
  const plan = useMemo(() =>
    calculateDowelPlan({ length, thickness, dowelType }),
  [length, thickness, dowelType]);

  if (!plan.isValid) return null;

  const { dowel, positions } = plan;

  // Color mapping by category
  const getDowelColor = () => {
    switch (dowel.category) {
      case 'Plastic': return '#FFFFFF';      // White
      case 'Pre-Glued': return '#8D6E63';    // Dark brown (adhesive)
      default: return '#D7CCC8';             // Natural wood
    }
  };

  // Groove texture (only for wood dowels)
  const showGrooves = dowel.category !== 'Plastic';

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={[mm(pos.x), 0, 0]}>

          {/* Main Dowel Cylinder */}
          <mesh position={[0, mm(dowel.specs.length / 2), 0]}>
            <cylinderGeometry args={[
              mm(dowel.specs.diameter / 2),
              mm(dowel.specs.diameter / 2),
              mm(dowel.specs.length),
              16
            ]} />
            <meshStandardMaterial
              color={getDowelColor()}
              roughness={dowel.category === 'Plastic' ? 0.3 : 0.7}
            />
          </mesh>

          {/* Fluting Grooves (visual detail) */}
          {showGrooves && (
            <>
              {[0, Math.PI/3, 2*Math.PI/3, Math.PI, 4*Math.PI/3, 5*Math.PI/3].map((angle, j) => (
                <mesh
                  key={j}
                  position={[
                    mm(dowel.specs.diameter/2 * 0.9) * Math.cos(angle),
                    mm(dowel.specs.length / 2),
                    mm(dowel.specs.diameter/2 * 0.9) * Math.sin(angle)
                  ]}
                >
                  <boxGeometry args={[mm(0.3), mm(dowel.specs.length * 0.8), mm(0.3)]} />
                  <meshBasicMaterial
                    color="#5D4037"
                    transparent
                    opacity={0.3}
                  />
                </mesh>
              ))}
            </>
          )}

          {/* Pre-Glued indicator (adhesive coating) */}
          {dowel.category === 'Pre-Glued' && (
            <mesh position={[0, mm(dowel.specs.length / 2), 0]}>
              <cylinderGeometry args={[
                mm(dowel.specs.diameter / 2 + 0.1),
                mm(dowel.specs.diameter / 2 + 0.1),
                mm(dowel.specs.length),
                16
              ]} />
              <meshBasicMaterial
                color="#FFC107"
                transparent
                opacity={0.2}
                wireframe
              />
            </mesh>
          )}

        </group>
      ))}
    </group>
  );
};
```

### 18.6 Category Comparison

| Feature | Standard (Fluted) | Pre-Glued | Plastic EXACT |
|---------|-------------------|-----------|---------------|
| **Material** | Kiln-dried hardwood | Hardwood + Adhesive | Polyethylene |
| **Color** | Natural wood | Brown (coated) | White |
| **Adhesive** | Requires PVA glue | Water-activated | None required |
| **Best For** | General joinery | Production speed | Knockdown furniture |
| **Strength** | High | High | Medium |
| **Price** | $ | $$ | $ |
| **Reusable** | No | No | Yes |

### 18.7 Drilling Pattern Diagram

```
DOWEL JOINT DRILLING PATTERN:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PANEL A (Edge - e.g., Shelf):                                 │
│  ─────────────────────────────                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   EDGE                                                   │   │
│  │   ═══════════════════════════════════════════════════   │   │
│  │   │     │           │           │           │     │     │   │
│  │   ▼     ▼           ▼           ▼           ▼     ▼     │   │
│  │   ●     ●           ●           ●           ●     ●     │   │
│  │   │     │           │           │           │     │     │   │
│  │  37mm  69mm        ...         ...        L-69  L-37    │   │
│  │                                                         │   │
│  │   Depth: 15-20mm (depends on dowel length)             │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PANEL B (Face - e.g., Cabinet Side):                          │
│  ────────────────────────────────────                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   ●     ●           ●           ●           ●     ●     │   │
│  │   │     │           │           │           │     │     │   │
│  │   ▼     ▼           ▼           ▼           ▼     ▼     │   │
│  │   ○     ○           ○           ○           ○     ○     │   │
│  │                                                         │   │
│  │   Same X positions as Panel A                           │   │
│  │   Y = Distance from edge (typically 37mm)               │   │
│  │   Depth: Same as Panel A                                │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ● = Drill position (8mm diameter)                             │
│  ○ = Mating hole on face                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SPACING CALCULATION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Given: Panel Length = 800mm, Margin = 37mm                    │
│                                                                 │
│  Usable Length = 800 - (37 × 2) = 726mm                        │
│  Desired Spacing = 32mm (System 32)                            │
│                                                                 │
│  Number of Dowels = floor(726 / 32) + 1 = 23 + 1 = 24          │
│  (May be limited by maxDowels parameter)                       │
│                                                                 │
│  Actual Spacing = 726 / (N - 1)                                │
│                                                                 │
│  For N = 6 dowels: Spacing = 726 / 5 = 145.2mm                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 18.8 Integration with Minifix System

```typescript
// Dowels are often used alongside Minifix connectors
// This shows how they work together in the joinery system

import { calculateJoinery } from './joineryEngine';
import { calculateDowelPlan } from './dowelEngine';

/**
 * Combined joinery plan for shelf installation
 *
 * Layout (for 800mm shelf):
 * - Position 0-100mm: Minifix #1 with 1 dowel
 * - Position 350-450mm: Center Minifix with 2 dowels
 * - Position 700-800mm: Minifix #2 with 1 dowel
 *
 * The Minifix engine already includes dowels in its sets,
 * but for dowel-only joints, use the DowelEngine directly.
 */

// Example: Minifix with integrated dowels
const minifixPlan = calculateJoinery({
  length: 800,
  thickness: 18,
  system: 'MINIFIX_15',
  dowelType: 'wd_8x30'  // From Section 17
});

// Example: Dowel-only joint (no Minifix)
const dowelOnlyPlan = calculateDowelPlan({
  length: 800,
  thickness: 18,
  dowelType: 'STANDARD_8x30',
  minSpacing: 64,  // Wider spacing for visual panels
  maxDowels: 5
});

console.log('Minifix dowels:', minifixPlan.sets.flatMap(s => s.dowelOffsets).length);
console.log('Standalone dowels:', dowelOnlyPlan.meta.totalDowels);
```

### 18.9 Calculation Examples

```typescript
// Example 1: Standard shelf with 8x30 dowels
const shelfPlan = calculateDowelPlan({
  length: 600,
  thickness: 18,
  dowelType: 'STANDARD_8x30'
});

console.log('=== Standard Shelf Dowels ===');
console.log('Dowel:', shelfPlan.dowel.name);
// 'Wood Dowel 8x30mm (Fluted)'
console.log('SKU:', shelfPlan.dowel.itemNo);
// '267.83.230'
console.log('Drill Depth:', shelfPlan.dowel.specs.drillDepth);
// 15mm
console.log('Total Dowels:', shelfPlan.meta.totalDowels);
// Calculated based on length


// Example 2: Thick panel with 8x40 dowels
const thickPlan = calculateDowelPlan({
  length: 800,
  thickness: 25,
  dowelType: 'STANDARD_8x40'
});

console.log('\n=== Thick Panel Dowels ===');
console.log('Drill Depth:', thickPlan.dowel.specs.drillDepth);
// 20mm (deeper for longer dowel)


// Example 3: Production line with Pre-Glued
const productionPlan = calculateDowelPlan({
  length: 500,
  thickness: 18,
  dowelType: 'PREGLUED_8x35'
});

console.log('\n=== Production Pre-Glued ===');
console.log('Category:', productionPlan.dowel.category);
// 'Pre-Glued'
console.log('Note: Activate with water instead of glue');


// Example 4: Generate CAM operations
const ops = generateDowelOps('SHELF-001', {
  length: 600,
  thickness: 18,
  dowelType: 'STANDARD_8x30',
  face: 'EDGE'
});

console.log('\n=== CAM Operations ===');
console.log('Operations:', ops.length);
ops.forEach(op => {
  console.log(`  ${op.id}: X=${op.x}mm, Dia=${op.diameter}mm, Depth=${op.depth}mm`);
});
```

### 18.10 Technical Reference Table

| Parameter | 6×30 | 8×30 | 8×35 | 8×40 | Unit |
|-----------|------|------|------|------|------|
| **Diameter** | 6 | 8 | 8 | 8 | mm |
| **Length** | 30 | 30 | 35 | 40 | mm |
| **Drill Depth** | 15 | 15 | 18 | 20 | mm |
| **Min Panel Thick** | 12 | 16 | 16 | 18 | mm |
| **Drill Bit** | 6mm | 8mm | 8mm | 8mm | - |
| **Standard SKU** | 267.83.130 | 267.83.230 | 267.83.235 | 267.83.240 | - |
| **Pre-Glued SKU** | - | 267.84.230 | 267.84.235 | - | - |

### 18.11 Best Practices

```
DOWEL SELECTION GUIDE:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  WHEN TO USE EACH TYPE:                                        │
│  ══════════════════════                                         │
│                                                                 │
│  STANDARD (Fluted):                                            │
│  - General furniture assembly                                   │
│  - Custom woodworking                                           │
│  - When using PVA/wood glue                                    │
│  - Best structural strength                                     │
│                                                                 │
│  PRE-GLUED:                                                    │
│  - Production environments                                      │
│  - Faster assembly (no glue application)                       │
│  - Consistent bond quality                                      │
│  - Keep dry until use!                                         │
│                                                                 │
│  PLASTIC EXACT:                                                │
│  - Knockdown furniture (IKEA-style)                            │
│  - When disassembly may be needed                              │
│  - Positioning aids (not structural)                           │
│  - Lower strength requirement                                   │
│                                                                 │
│  SIZE SELECTION:                                                │
│  ═══════════════                                                │
│                                                                 │
│  Panel Thickness  │  Recommended Dowel                         │
│  ─────────────────┼────────────────────                         │
│  12-15mm          │  6×30                                       │
│  16-18mm          │  8×30 (most common)                        │
│  19-22mm          │  8×35                                       │
│  23mm+            │  8×40                                       │
│                                                                 │
│  SPACING GUIDELINES:                                            │
│  ═══════════════════                                            │
│                                                                 │
│  - Minimum: 32mm (System 32)                                   │
│  - Maximum: 150mm (for structural joints)                      │
│  - Edge margin: 37mm standard                                   │
│  - Min 2 dowels per joint, max as needed                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 19: Minifix Universal System - Consolidated Implementation (Architecture v4.0 Refactor)

ส่วนนี้รวบรวม **Implementation Pattern** สำหรับระบบ Minifix & Dowel แบบครบวงจร โดยยึดหลักการ:

1. **Engine as Truth**: Logic การวางตำแหน่งและการคำนวณอยู่ที่ Service Layer เท่านั้น
2. **Visual as Consumer**: Component 3D รับผลลัพธ์มา Render ห้ามคำนวณเอง
3. **CAM Completeness**: สร้าง Operation ครบถ้วน (Face Boring + Edge Boring)
4. **Guard Rails**: มี Validation Result ส่งออกไปให้ Gate ตรวจสอบ

### 19.1 Data Layer - Hardware Specification

```typescript
// src/services/hardware/hafeleDb.ts
// Spec Lock: ห้าม Hardcode ตัวเลขใน Logic - ดึงจาก DB เท่านั้น

export type BoltVariant = 'B24' | 'B34';
export type BoardThickness = 16 | 19;

// Contract สำหรับ Spec สินค้า
export interface HardwareItem {
  id: string;
  itemNo: string;
  name: string;
  params: {
    drillDepth: number;   // ความลึกเจาะ
    diameter: number;     // ขนาดดอกสว่าน
    length?: number;      // ความยาวตัวสินค้า (Visual)
    sleeveH?: number;     // ความสูงปลอก (B34)
    distA?: number;       // ระยะเจาะ Face Boring (Cam)
  };
}

export const HAFELE_CATALOG = {
  // =================================================================
  // S200 Connecting Bolts
  // =================================================================
  bolts: {
    B24: {
      id: "bolt_b24",
      itemNo: "262.27.670",
      name: "S200 Econo S Bolt (B=24mm)",
      params: { length: 24, drillDepth: 11, diameter: 5, sleeveH: 0 }
    } as HardwareItem,
    B34: {
      id: "bolt_b34",
      itemNo: "262.28.670",
      name: "S200 Econo S Bolt (B=34mm)",
      params: { length: 34, drillDepth: 11, diameter: 5, sleeveH: 10 }
    } as HardwareItem
  },

  // =================================================================
  // Minifix 15 Cams
  // =================================================================
  cams: {
    t16: {
      id: "cam_16mm",
      itemNo: "262.26.033",
      name: "Minifix 15 Cam (For 16mm)",
      params: { drillDepth: 12.5, diameter: 15, distA: 8.0 }
    } as HardwareItem,
    t19: {
      id: "cam_19mm",
      itemNo: "262.26.035",
      name: "Minifix 15 Cam (For 19mm)",
      params: { drillDepth: 14.0, diameter: 15, distA: 9.5 }
    } as HardwareItem
  },

  // =================================================================
  // Wood Dowels
  // =================================================================
  dowels: {
    standard: {
      id: "dowel_8x30",
      itemNo: "267.83.230",
      name: "Wood Dowel 8x30mm (Fluted)",
      params: { length: 30, drillDepth: 15, diameter: 8 }
    } as HardwareItem
  }
};
```

### 19.2 Engineering Engine - Logic Core

```typescript
// src/services/engineering/joineryEngine.ts
// Deterministic Resolver: คำนวณตำแหน่งเจาะและส่ง isValid ให้ Gate

import { HAFELE_CATALOG, BoltVariant, BoardThickness, HardwareItem } from '../hardware/hafeleDb';

export interface FittingSet {
  x: number;              // ตำแหน่งแกน X บนแผ่น
  rotationY: number;      // 0 หรือ PI (Visual/Machine Orientation)
  dowelOffsets: number[]; // ตำแหน่ง Dowel เทียบกับ Bolt (+/- 32)
}

export interface JoineryPlan {
  sets: FittingSet[];
  specs: {
    bolt: HardwareItem;
    cam: HardwareItem;
    dowel: HardwareItem;
  };
  isValid: boolean;
  issues: string[]; // ส่งเข้า Report Bundle (A6)
}

/**
 * Calculate Minifix joinery plan
 *
 * Layout Constants:
 * - MARGIN_TO_BOLT: 35mm from panel edge to bolt center
 * - BOLT_TO_DOWEL: 32mm from bolt to dowel (System 32)
 *
 * Placement Rules:
 * - Left set: x = 35mm
 * - Right set: x = length - 35mm (rotated 180°)
 * - Center set: x = length / 2 (only if length > 400mm)
 */
export const calculateMinifixPlan = (
  panelLength: number,
  variant: BoltVariant = 'B24',
  thickness: BoardThickness = 19
): JoineryPlan => {

  const sets: FittingSet[] = [];
  const issues: string[] = [];
  let isValid = true;

  // =================================================================
  // VALIDATION (Gate A5.G)
  // =================================================================
  if (panelLength < 100) {
    isValid = false;
    issues.push(`Panel length ${panelLength}mm is too short for Minifix (min 100mm)`);
  }

  // =================================================================
  // CONSTANTS
  // =================================================================
  const MARGIN_TO_BOLT = 35;
  const BOLT_TO_DOWEL = 32;

  // =================================================================
  // PLACEMENT LOGIC
  // =================================================================
  if (isValid) {
    // LEFT SET
    sets.push({
      x: MARGIN_TO_BOLT,
      dowelOffsets: [BOLT_TO_DOWEL], // Dowel อยู่ด้านใน (+32)
      rotationY: 0
    });

    // RIGHT SET
    sets.push({
      x: panelLength - MARGIN_TO_BOLT,
      dowelOffsets: [BOLT_TO_DOWEL], // เมื่อหมุน 180° +32 จะชี้เข้ากลาง
      rotationY: Math.PI
    });

    // CENTER SET (Rule: > 400mm)
    if (panelLength > 400) {
      sets.push({
        x: panelLength / 2,
        dowelOffsets: [-BOLT_TO_DOWEL, BOLT_TO_DOWEL], // ประกบ 2 ข้าง
        rotationY: 0
      });
    }
  }

  return {
    sets,
    specs: {
      bolt: HAFELE_CATALOG.bolts[variant],
      cam: thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19,
      dowel: HAFELE_CATALOG.dowels.standard
    },
    isValid,
    issues
  };
};
```

### 19.3 Visual Layer - Consumer Component

```typescript
// src/components/visual/hardware/MinifixSystem.tsx
// Consumer: แสดงผล 3D ตาม Plan ที่ได้รับ - ห้ามมี Logic คำนวณ

import React, { useMemo } from 'react';
import { calculateMinifixPlan } from '../../../services/engineering/joineryEngine';
import { BoltVariant, BoardThickness } from '../../../services/hardware/hafeleDb';

const mm = (v: number) => v / 1000;

interface Props {
  length: number;
  jointType: 'OVERLAY' | 'INSET';
  position: 'TOP' | 'BOTTOM';
  variant?: BoltVariant;
  thickness?: BoardThickness;
}

export const MinifixSystem: React.FC<Props> = ({
  length,
  jointType,
  position,
  variant = 'B24',
  thickness = 19
}) => {
  // =================================================================
  // 1. RESOLVE PLAN (Single Source of Truth)
  // =================================================================
  const plan = useMemo(() =>
    calculateMinifixPlan(length, variant, thickness),
  [length, variant, thickness]);

  if (!plan.isValid) return null;

  const { bolt, cam, dowel } = plan.specs;

  // =================================================================
  // 2. VISUAL ORIENTATION MAPPING
  // =================================================================
  const getGroupRotation = () => {
    if (jointType === 'OVERLAY') {
      // Bolt ตั้งฉาก (Vertical)
      return position === 'TOP' ? [Math.PI, 0, 0] : [0, 0, 0];
    } else {
      // Bolt นอนราบ (Inset)
      return [0, 0, -Math.PI / 2];
    }
  };

  return (
    <group>
      {plan.sets.map((set, i) => (
        <group
          key={i}
          position={[mm(set.x), 0, 0]}
          rotation={getGroupRotation() as any}
        >
          <group rotation={[0, set.rotationY, 0]}>

            {/* === BOLT GROUP === */}
            <group>
              {/* Bolt Shaft */}
              <mesh position={[0, mm(bolt.params.length! / 2), 0]}>
                <cylinderGeometry args={[
                  mm(3.5), mm(3.5), mm(bolt.params.length!), 16
                ]} />
                <meshStandardMaterial color="#888" metalness={0.7} />
              </mesh>

              {/* Cam Housing */}
              <group
                position={[0, mm(bolt.params.length!), 0]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <mesh>
                  <cylinderGeometry args={[
                    mm(7.5), mm(7.5), mm(cam.params.drillDepth), 32
                  ]} />
                  <meshStandardMaterial color="#C0C0C0" metalness={0.5} />
                </mesh>
                {/* Cam Slot */}
                <mesh
                  position={[0, mm(cam.params.drillDepth / 2 + 0.1), 0]}
                  rotation={[0, 0, Math.PI / 4]}
                >
                  <boxGeometry args={[mm(8), mm(0.5), mm(1.5)]} />
                  <meshBasicMaterial color="#333" />
                </mesh>
              </group>

              {/* Sleeve (B34 only) */}
              {bolt.params.sleeveH! > 0 && (
                <mesh position={[0, mm(bolt.params.length! - 15), 0]}>
                  <cylinderGeometry args={[mm(4.5), mm(4.5), mm(10), 16]} />
                  <meshStandardMaterial color="#D32F2F" />
                </mesh>
              )}
            </group>

            {/* === DOWEL GROUP === */}
            {set.dowelOffsets.map((offset, j) => (
              <group key={j} position={[mm(offset), 0, 0]}>
                <mesh position={[0, mm(15), 0]}>
                  <cylinderGeometry args={[
                    mm(4), mm(4), mm(30), 16
                  ]} />
                  <meshStandardMaterial color="#D7CCC8" />
                </mesh>
              </group>
            ))}

          </group>
        </group>
      ))}
    </group>
  );
};
```

### 19.4 CAM Pipeline - Operation Generator

```typescript
// src/services/cam/generators/minifixOpGenerator.ts
// แปลง Plan เป็น Machine Operations

import { calculateMinifixPlan, JoineryPlan } from '../../engineering/joineryEngine';
import { BoltVariant, BoardThickness } from '../../hardware/hafeleDb';

export interface DrillOperation {
  id: string;
  type: 'DRILL';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  face: 'FACE' | 'EDGE';
  hardwareRef: string;
}

/**
 * Generate CNC drilling operations for Minifix system
 *
 * Operations per set:
 * - 1× Edge Boring (Bolt shaft)
 * - 1× Face Boring (Cam housing)
 * - N× Edge Boring (Dowels)
 *
 * GUARANTEE: Visual ตรงกับผลิตจริง 100% (ใช้ Engine เดียวกัน)
 */
export const generateMinifixOperations = (
  partId: string,
  length: number,
  variant: BoltVariant,
  thickness: BoardThickness
): DrillOperation[] => {

  // =================================================================
  // 1. CALL SAME ENGINE AS VISUAL
  // =================================================================
  const plan = calculateMinifixPlan(length, variant, thickness);

  if (!plan.isValid) {
    // ส่ง Error เข้า Report Bundle
    return [];
  }

  const ops: DrillOperation[] = [];
  const { bolt, cam, dowel } = plan.specs;

  plan.sets.forEach((set, i) => {
    // =================================================================
    // 2.1 EDGE BORING - Bolt Shaft
    // =================================================================
    ops.push({
      id: `${partId}-bolt-${i}`,
      type: 'DRILL',
      x: set.x,
      y: 0, // กึ่งกลางสันไม้
      diameter: bolt.params.diameter,
      depth: bolt.params.drillDepth,
      face: 'EDGE',
      hardwareRef: bolt.itemNo
    });

    // =================================================================
    // 2.2 FACE BORING - Cam Housing
    // Position: Same X as Bolt, Y = distA from edge
    // =================================================================
    ops.push({
      id: `${partId}-cam-${i}`,
      type: 'DRILL',
      x: set.x,
      y: cam.params.distA!, // 8.0mm (16mm) or 9.5mm (19mm)
      diameter: cam.params.diameter,
      depth: cam.params.drillDepth,
      face: 'FACE',
      hardwareRef: cam.itemNo
    });

    // =================================================================
    // 2.3 EDGE BORING - Dowels
    // =================================================================
    set.dowelOffsets.forEach((offset, j) => {
      // Calculate offset based on orientation
      const realOffset = set.rotationY !== 0 ? -offset : offset;

      ops.push({
        id: `${partId}-dowel-${i}-${j}`,
        type: 'DRILL',
        x: set.x + realOffset,
        y: 0,
        diameter: dowel.params.diameter,
        depth: dowel.params.drillDepth,
        face: 'EDGE',
        hardwareRef: dowel.itemNo
      });
    });
  });

  return ops;
};
```

### 19.5 Architecture Diagram

```
MINIFIX UNIVERSAL SYSTEM - DATA FLOW:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │  HAFELE_CATALOG │  ← Single Source of Truth (Spec Lock)                │
│  │  (hafeleDb.ts)  │                                                       │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │           JOINERY ENGINE (joineryEngine.ts)                  │           │
│  │                                                              │           │
│  │  Input: panelLength, variant, thickness                      │           │
│  │                                                              │           │
│  │  Output: JoineryPlan {                                       │           │
│  │    sets: FittingSet[]                                        │           │
│  │    specs: { bolt, cam, dowel }                               │           │
│  │    isValid: boolean                                          │           │
│  │    issues: string[]                                          │           │
│  │  }                                                           │           │
│  │                                                              │           │
│  └────────────────────┬────────────────────────────┬────────────┘           │
│                       │                            │                        │
│           ┌───────────┴───────────┐    ┌───────────┴───────────┐           │
│           ▼                       ▼    ▼                       ▼           │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐    │
│  │  VISUAL LAYER   │      │   CAM PIPELINE  │      │  VALIDATION     │    │
│  │  (MinifixSystem │      │  (minifixOp     │      │  (Gate A5.G)    │    │
│  │   .tsx)         │      │   Generator.ts) │      │                 │    │
│  │                 │      │                 │      │  isValid →      │    │
│  │  Consumes Plan  │      │  Converts Plan  │      │  issues →       │    │
│  │  Renders 3D     │      │  to DrillOps    │      │  Report Bundle  │    │
│  │                 │      │                 │      │                 │    │
│  └─────────────────┘      └─────────────────┘      └─────────────────┘    │
│           │                       │                        │               │
│           ▼                       ▼                        ▼               │
│     React Three           CNC Machine             User Feedback           │
│     Fiber Canvas          Operations              / Error Display          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 19.6 Placement Rules Visual

```
MINIFIX PLACEMENT PATTERN:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Panel Length = 600mm (Example)                                │
│                                                                 │
│  ←─────────────────── 600mm ───────────────────→               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  ●──○     ←── Left Set (x=35mm)                        │   │
│  │  35mm                                                   │   │
│  │                                                         │   │
│  │             ○──●──○  ←── Center Set (x=300mm)          │   │
│  │             (only if length > 400mm)                    │   │
│  │                                                         │   │
│  │                                        ○──●  ←── Right Set  │
│  │                                       565mm (rotated 180°)  │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ● = Bolt/Cam position                                         │
│  ○ = Dowel position (+/- 32mm from bolt)                       │
│                                                                 │
│  CONSTANTS:                                                     │
│  - MARGIN_TO_BOLT = 35mm                                       │
│  - BOLT_TO_DOWEL = 32mm (System 32)                           │
│  - CENTER_THRESHOLD = 400mm                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

DRILLING OPERATIONS PER SET:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  For each FittingSet:                                          │
│                                                                 │
│  1. BOLT (Edge Boring)                                         │
│     - Face: EDGE                                                │
│     - X: set.x                                                  │
│     - Y: 0 (center of edge)                                    │
│     - Diameter: 5mm                                             │
│     - Depth: 11mm                                               │
│                                                                 │
│  2. CAM (Face Boring)                                          │
│     - Face: FACE                                                │
│     - X: set.x                                                  │
│     - Y: distA (8.0mm for 16mm, 9.5mm for 19mm)               │
│     - Diameter: 15mm                                            │
│     - Depth: 12.5mm (16mm) or 14.0mm (19mm)                   │
│                                                                 │
│  3. DOWELS (Edge Boring) × N                                   │
│     - Face: EDGE                                                │
│     - X: set.x + offset (adjusted for rotation)                │
│     - Y: 0                                                      │
│     - Diameter: 8mm                                             │
│     - Depth: 15mm                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 19.7 Usage Examples

```typescript
// =================================================================
// Example 1: Generate plan for 600mm shelf
// =================================================================
const plan = calculateMinifixPlan(600, 'B24', 19);

console.log('=== 600mm Shelf Plan ===');
console.log('Valid:', plan.isValid);           // true
console.log('Sets:', plan.sets.length);        // 3 (left, right, center)
console.log('Bolt:', plan.specs.bolt.itemNo);  // '262.27.670'
console.log('Cam:', plan.specs.cam.itemNo);    // '262.26.035' (19mm)

plan.sets.forEach((set, i) => {
  console.log(`Set ${i}: x=${set.x}mm, rotation=${set.rotationY}`);
  console.log(`  Dowels at: ${set.dowelOffsets.map(o => set.x + o).join(', ')}mm`);
});


// =================================================================
// Example 2: Short panel (no center set)
// =================================================================
const shortPlan = calculateMinifixPlan(350, 'B24', 16);

console.log('\n=== 350mm Panel ===');
console.log('Sets:', shortPlan.sets.length);   // 2 (left, right only)
console.log('Cam:', shortPlan.specs.cam.itemNo); // '262.26.033' (16mm)


// =================================================================
// Example 3: Invalid panel (too short)
// =================================================================
const invalidPlan = calculateMinifixPlan(50, 'B24', 19);

console.log('\n=== 50mm Invalid ===');
console.log('Valid:', invalidPlan.isValid);    // false
console.log('Issues:', invalidPlan.issues);    // ['Panel length 50mm is too short...']


// =================================================================
// Example 4: Generate CAM operations
// =================================================================
const ops = generateMinifixOperations('SHELF-001', 600, 'B24', 19);

console.log('\n=== CAM Operations ===');
console.log('Total:', ops.length);
// 3 sets × (1 bolt + 1 cam + avg 1.33 dowels) ≈ 10 operations

const faceOps = ops.filter(op => op.face === 'FACE');
const edgeOps = ops.filter(op => op.face === 'EDGE');

console.log('Face boring (Cam):', faceOps.length);  // 3
console.log('Edge boring (Bolt+Dowel):', edgeOps.length);  // 7


// =================================================================
// Example 5: Visual component usage
// =================================================================
// <MinifixSystem
//   length={600}
//   jointType="OVERLAY"
//   position="TOP"
//   variant="B24"
//   thickness={19}
// />
```

### 19.8 Validation Gate

```typescript
// src/services/validation/joineryGate.ts

import { JoineryPlan } from '../engineering/joineryEngine';

export interface ValidationResult {
  canProceed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Gate A5.G - Validate joinery plan before production
 */
export function validateJoineryPlan(plan: JoineryPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check basic validity
  if (!plan.isValid) {
    errors.push(...plan.issues);
  }

  // 2. Check minimum sets
  if (plan.sets.length < 2) {
    errors.push('Minimum 2 fitting sets required');
  }

  // 3. Check set spacing
  if (plan.sets.length >= 2) {
    const positions = plan.sets.map(s => s.x).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) {
      const gap = positions[i] - positions[i - 1];
      if (gap < 100) {
        warnings.push(`Sets ${i - 1} and ${i} are close: ${gap}mm gap`);
      }
      if (gap > 400) {
        warnings.push(`Large gap between sets ${i - 1} and ${i}: ${gap}mm`);
      }
    }
  }

  // 4. Check hardware compatibility
  const { bolt, cam, dowel } = plan.specs;
  if (bolt.params.diameter > dowel.params.diameter) {
    warnings.push('Bolt diameter larger than dowel - unusual configuration');
  }

  return {
    canProceed: errors.length === 0,
    errors,
    warnings
  };
}
```

### 19.9 Technical Reference

| Component | Property | B24 (16mm) | B24 (19mm) | B34 (19mm) | Unit |
|-----------|----------|------------|------------|------------|------|
| **Bolt** | Length | 24 | 24 | 34 | mm |
| **Bolt** | Drill Depth | 11 | 11 | 11 | mm |
| **Bolt** | Diameter | 5 | 5 | 5 | mm |
| **Bolt** | Sleeve | 0 | 0 | 10 | mm |
| **Cam** | Drill Depth | 12.5 | 14.0 | 14.0 | mm |
| **Cam** | Diameter | 15 | 15 | 15 | mm |
| **Cam** | Distance A | 8.0 | 9.5 | 9.5 | mm |
| **Dowel** | Length | 30 | 30 | 30 | mm |
| **Dowel** | Drill Depth | 15 | 15 | 15 | mm |
| **Dowel** | Diameter | 8 | 8 | 8 | mm |

### 19.10 Key Principles Summary

```
ARCHITECTURE PRINCIPLES:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. ENGINE AS TRUTH                                            │
│     ═══════════════                                             │
│     - All placement logic in joineryEngine.ts                  │
│     - No calculations in visual components                      │
│     - CAM generator uses same engine                           │
│                                                                 │
│  2. VISUAL AS CONSUMER                                         │
│     ═══════════════════                                         │
│     - Components receive JoineryPlan                           │
│     - Only render, never calculate                              │
│     - useMemo for plan resolution                              │
│                                                                 │
│  3. CAM COMPLETENESS                                           │
│     ═════════════════                                           │
│     - Face boring: Cam housing                                  │
│     - Edge boring: Bolt shaft + Dowels                         │
│     - Hardware reference for BOM                                │
│                                                                 │
│  4. GUARD RAILS                                                │
│     ═══════════                                                 │
│     - isValid flag for gate checking                           │
│     - issues array for error reporting                          │
│     - Validation gate before production                         │
│                                                                 │
│  5. SPEC LOCK                                                  │
│     ═════════                                                   │
│     - All dimensions from HAFELE_CATALOG                       │
│     - No hardcoded values in logic                              │
│     - Easy to update when catalog changes                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 20: Universal Minifix System with Operation Manual (Architecture v3.5)

ระบบ **Universal Minifix** พร้อมคู่มือปฏิบัติงานครบถ้วน รองรับทุกรูปแบบการประกอบ (Overlay/Inset) และทุกตำแหน่ง (Top/Bottom) โดยใช้ Häfele Wood Dowel รุ่น Fluted เป็นมาตรฐาน

### 20.1 Hardware Database (hardware_db.ts)

**สำหรับแผนกจัดซื้อและคลังสินค้า (BOM Generation)**

```typescript
// src/services/hardware/hardware_db.ts

/**
 * Häfele Hardware Database
 * Architecture v3.5 - Universal Minifix System
 *
 * Purpose:
 * - BOM Generation for Procurement
 * - Warehouse Management (Item Numbers)
 * - Engineering Calculations (Dimensions)
 */

export type BoltVariant = 'B24' | 'B34';
export type BoardThickness = 16 | 19;

export const HAFELE_CATALOG = {
  // =================================================================
  // 🔩 1. CONNECTING BOLTS (แกนเหล็ก)
  // Reference: Häfele Catalog PDF Page 3-4
  // =================================================================
  bolts: {
    B24: {
      id: "bolt_b24",
      itemNo: "262.27.670",        // S200 Econo Unfinished (Standard)
      name: "S200 Econo S Bolt (B=24mm)",
      length: 24,                  // Total bolt length
      sleeveH: 0,                  // No plastic sleeve
      params: {
        drillDia: 5,               // Pilot hole diameter
        drillDepth: 11,            // Edge boring depth
        headDia: 7,                // Head diameter for visual
        threadDia: 5               // Thread diameter
      }
    },
    B34: {
      id: "bolt_b34",
      itemNo: "262.28.670",        // S200 Econo Unfinished (High Strength)
      name: "S200 Econo S Bolt (B=34mm)",
      length: 34,                  // Longer for thick panels
      sleeveH: 10,                 // Red plastic sleeve (depth spacer)
      params: {
        drillDia: 5,
        drillDepth: 11,
        headDia: 7,
        threadDia: 5
      }
    }
  },

  // =================================================================
  // ⚙️ 2. MINIFIX 15 CAMS (ตัวเรือนล็อค)
  // Reference: Häfele Catalog PDF Page 5-6
  // =================================================================
  cams: {
    t16: {
      id: "cam_16mm",
      itemNo: "262.26.033",        // For 16mm board thickness
      name: "Minifix 15 Cam (For 16mm)",
      depth: 12.5,                 // Housing depth
      distA: 8.0,                  // Distance from surface to bolt center
      params: {
        boreDia: 15,               // Housing bore diameter
        boreDepth: 12.5            // Depth of housing bore
      }
    },
    t19: {
      id: "cam_19mm",
      itemNo: "262.26.035",        // For 19mm board thickness
      name: "Minifix 15 Cam (For 19mm)",
      depth: 14.0,                 // Deeper housing
      distA: 9.5,                  // Greater offset for thicker board
      params: {
        boreDia: 15,
        boreDepth: 14.0
      }
    }
  },

  // =================================================================
  // 🪵 3. WOOD DOWELS (เดือยไม้)
  // Reference: Häfele Catalog PDF 267-84-239
  // =================================================================
  dowels: {
    // Standard Fluted (มีร่องกาว - ยอดนิยม)
    standard: {
      id: "dowel_8x30",
      itemNo: "267.83.230",        // ✅ Standard Item Number
      name: "Wood Dowel 8x30mm (Fluted)",
      description: "เดือยไม้บีชแท้ แบบมีร่องกาว (Standard)",
      material: "Beech Wood",
      diameter: 8,
      length: 30,
      drillDepth: 15,              // ฝังข้างละ 15mm (length/2)
      spacing: 32,                 // ระยะห่างมาตรฐาน System 32
      fluted: true,
      params: {
        boreDia: 8,                // Matching hole diameter
        boreDepth: 15              // Half of dowel length
      }
    },

    // Pre-Glued (อัดกาวในตัว)
    preglued: {
      id: "dowel_8x30_pre",
      itemNo: "267.84.230",        // ✅ Pre-glued variant
      name: "Pre-glued Dowel 8x30mm",
      description: "เดือยไม้อัดกาวในตัว ใช้น้ำฉีดกระตุ้นกาว",
      material: "Beech Wood + Water-Activated Adhesive",
      diameter: 8,
      length: 30,
      drillDepth: 15,
      fluted: true,
      activationMethod: "Water spray",
      params: {
        boreDia: 8,
        boreDepth: 15
      }
    },

    // Standard 8x35mm (ยาวกว่าสำหรับไม้หนา)
    standard_35: {
      id: "dowel_8x35",
      itemNo: "267.83.235",
      name: "Wood Dowel 8x35mm (Fluted)",
      diameter: 8,
      length: 35,
      drillDepth: 17,              // Rounded up from 17.5
      params: {
        boreDia: 8,
        boreDepth: 17
      }
    },

    // Standard 8x40mm (สำหรับงานหนัก)
    standard_40: {
      id: "dowel_8x40",
      itemNo: "267.83.240",
      name: "Wood Dowel 8x40mm (Fluted)",
      diameter: 8,
      length: 40,
      drillDepth: 20,
      params: {
        boreDia: 8,
        boreDepth: 20
      }
    }
  }
} as const;

// Type exports for strict typing
export type BoltSpec = typeof HAFELE_CATALOG.bolts.B24;
export type CamSpec = typeof HAFELE_CATALOG.cams.t16;
export type DowelSpec = typeof HAFELE_CATALOG.dowels.standard;
```

### 20.2 Layout Engine (layout_engine.ts)

**สำหรับฝ่ายผลิตและเครื่อง CNC (คำนวณตำแหน่งเจาะ)**

```typescript
// src/services/engineering/layout_engine.ts

/**
 * Universal Minifix Layout Engine
 * Architecture v3.5 - Automatic Fitting Set Calculation
 *
 * Purpose:
 * - Calculate fitting set positions
 * - Determine dowel placement relative to bolts
 * - Handle rotation for symmetric drilling
 */

import { HAFELE_CATALOG } from './hardware_db';

// =================================================================
// PLACEMENT CONSTANTS (System 32 Compatible)
// =================================================================
const MARGIN_TO_BOLT = 35;    // Distance from panel edge to bolt center
const BOLT_TO_DOWEL = 32;     // System 32 spacing between bolt and dowel

export interface FittingSet {
  id: string;
  x: number;                   // Position from left edge (mm)
  dowelOffsets: number[];      // Relative positions of dowels to bolt
  rotationY: number;           // 0 = normal, Math.PI = flipped
  hardwareRefs: {
    bolt: string;
    cam: string;
    dowels: string[];
  };
}

export interface LayoutPlan {
  sets: FittingSet[];
  panelLength: number;
  isValid: boolean;
  issues: string[];
}

/**
 * Calculate Universal Layout for any panel length
 *
 * Layout Pattern:
 * ┌──────────────────────────────────────────────────────────────┐
 * │                                                              │
 * │   [Edge]--35--[Bolt]--32--[Dowel]    Center    [Dowel]--32--[Bolt]--35--[Edge]
 * │         Left Set                                      Right Set
 * │                                                              │
 * │   For panels > 400mm: Add center set                        │
 * │   [Dowel]--32--[Bolt]--32--[Dowel]                         │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 */
export function calculateUniversalLayout(
  panelLength: number,
  variant: 'B24' | 'B34' = 'B24',
  thickness: 16 | 19 = 19
): LayoutPlan {
  const sets: FittingSet[] = [];
  const issues: string[] = [];

  // Validation
  if (panelLength < 150) {
    issues.push(`Panel too short: ${panelLength}mm (min 150mm)`);
  }

  // Select hardware
  const bolt = HAFELE_CATALOG.bolts[variant];
  const cam = thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19;
  const dowel = HAFELE_CATALOG.dowels.standard;

  // =================================================================
  // 1. LEFT SET (ชุดซ้าย)
  // Pattern: [Edge] --35--> [Bolt] --32--> [Dowel]
  // Dowel on inner side (toward center)
  // =================================================================
  sets.push({
    id: 'set-left',
    x: MARGIN_TO_BOLT,
    dowelOffsets: [BOLT_TO_DOWEL],  // Dowel +32mm inward
    rotationY: 0,
    hardwareRefs: {
      bolt: bolt.itemNo,
      cam: cam.itemNo,
      dowels: [dowel.itemNo]
    }
  });

  // =================================================================
  // 2. RIGHT SET (ชุดขวา)
  // Pattern: [Dowel] <--32-- [Bolt] <--35-- [Edge]
  // Rotated 180° so Cam access hole faces inward
  // =================================================================
  sets.push({
    id: 'set-right',
    x: panelLength - MARGIN_TO_BOLT,
    dowelOffsets: [BOLT_TO_DOWEL],  // After rotation: points inward
    rotationY: Math.PI,              // 180° rotation
    hardwareRefs: {
      bolt: bolt.itemNo,
      cam: cam.itemNo,
      dowels: [dowel.itemNo]
    }
  });

  // =================================================================
  // 3. CENTER SET (ชุดกลาง) - เมื่อความยาว > 400mm
  // Pattern: [Dowel] <--32-- [Bolt] --32--> [Dowel]
  // Two dowels flanking the center bolt
  // =================================================================
  if (panelLength > 400) {
    sets.push({
      id: 'set-center',
      x: panelLength / 2,
      dowelOffsets: [-BOLT_TO_DOWEL, BOLT_TO_DOWEL],  // Both sides
      rotationY: 0,
      hardwareRefs: {
        bolt: bolt.itemNo,
        cam: cam.itemNo,
        dowels: [dowel.itemNo, dowel.itemNo]
      }
    });
  }

  // =================================================================
  // 4. ADDITIONAL SETS for very long panels (>800mm)
  // =================================================================
  if (panelLength > 800) {
    // Quarter positions
    const quarterLeft = panelLength * 0.25;
    const quarterRight = panelLength * 0.75;

    sets.push({
      id: 'set-quarter-left',
      x: quarterLeft,
      dowelOffsets: [BOLT_TO_DOWEL],
      rotationY: 0,
      hardwareRefs: {
        bolt: bolt.itemNo,
        cam: cam.itemNo,
        dowels: [dowel.itemNo]
      }
    });

    sets.push({
      id: 'set-quarter-right',
      x: quarterRight,
      dowelOffsets: [BOLT_TO_DOWEL],
      rotationY: Math.PI,
      hardwareRefs: {
        bolt: bolt.itemNo,
        cam: cam.itemNo,
        dowels: [dowel.itemNo]
      }
    });
  }

  return {
    sets,
    panelLength,
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Get flat list of all drill positions for CNC
 */
export interface DrillPosition {
  x: number;
  y: number;
  type: 'BOLT' | 'CAM' | 'DOWEL';
  face: 'FACE' | 'EDGE';
  diameter: number;
  depth: number;
  hardwareRef: string;
}

export function getDrillPositions(
  layout: LayoutPlan,
  thickness: 16 | 19 = 19
): DrillPosition[] {
  const positions: DrillPosition[] = [];
  const cam = thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19;
  const bolt = HAFELE_CATALOG.bolts.B24;
  const dowel = HAFELE_CATALOG.dowels.standard;

  for (const set of layout.sets) {
    // Bolt position (Edge boring)
    positions.push({
      x: set.x,
      y: 0,  // On edge
      type: 'BOLT',
      face: 'EDGE',
      diameter: bolt.params.drillDia,
      depth: bolt.params.drillDepth,
      hardwareRef: set.hardwareRefs.bolt
    });

    // Cam position (Face boring)
    positions.push({
      x: set.x,
      y: cam.distA,  // Distance A from surface
      type: 'CAM',
      face: 'FACE',
      diameter: cam.params.boreDia,
      depth: cam.params.boreDepth,
      hardwareRef: set.hardwareRefs.cam
    });

    // Dowel positions (Edge boring)
    set.dowelOffsets.forEach((offset, i) => {
      // Apply rotation for correct offset direction
      const actualOffset = set.rotationY === Math.PI ? -offset : offset;
      positions.push({
        x: set.x + actualOffset,
        y: 0,  // On edge
        type: 'DOWEL',
        face: 'EDGE',
        diameter: dowel.params.boreDia,
        depth: dowel.params.boreDepth,
        hardwareRef: set.hardwareRefs.dowels[i]
      });
    });
  }

  return positions;
}
```

### 20.3 Visual Component (MinifixSystem.tsx)

**สำหรับหน้างานติดตั้ง (Installation Guide) - 3D Visualization**

```typescript
// src/components/3d/MinifixSystem.tsx

import React, { useMemo } from 'react';
import { HAFELE_CATALOG, BoltVariant, BoardThickness } from '@/services/hardware/hardware_db';
import { calculateUniversalLayout, LayoutPlan, FittingSet } from '@/services/engineering/layout_engine';

const mm = (v: number) => v / 1000; // Convert mm to Three.js units (meters)

// =================================================================
// COMPONENT PROPS
// =================================================================
interface MinifixSystemProps {
  length: number;                          // Panel length (mm)
  jointType: 'OVERLAY' | 'INSET';         // Joint configuration
  position: 'TOP' | 'BOTTOM';             // Panel position in cabinet
  variant?: BoltVariant;                  // B24 or B34
  thickness?: BoardThickness;             // 16 or 19mm
  showLabels?: boolean;                   // Show item numbers
}

// =================================================================
// MAIN COMPONENT
// =================================================================
export const MinifixSystem: React.FC<MinifixSystemProps> = ({
  length,
  jointType,
  position,
  variant = 'B24',
  thickness = 19,
  showLabels = false
}) => {

  // Compute layout using Engine (Engine as Truth)
  const layout = useMemo<LayoutPlan>(() =>
    calculateUniversalLayout(length, variant, thickness),
    [length, variant, thickness]
  );

  // Select hardware specs from catalog (Spec Lock)
  const bolt = HAFELE_CATALOG.bolts[variant];
  const cam = thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19;
  const dowel = HAFELE_CATALOG.dowels.standard;

  // =================================================================
  // ORIENTATION LOGIC (Critical for correct assembly)
  // =================================================================
  /**
   * Determines hardware orientation based on joint type and position
   *
   * OVERLAY (ทับขอบ):
   *   - Cam housing is in SIDE panel
   *   - Bolt/Dowel are VERTICAL (perpendicular to Top/Bottom panel)
   *   - TOP: Bolt points down (-Y)
   *   - BOTTOM: Bolt points up (+Y)
   *
   * INSET (ฝังใน):
   *   - Cam housing is in TOP/BOTTOM panel
   *   - Bolt/Dowel are HORIZONTAL (parallel to panel surface)
   *   - Bolt points toward side panel (-X or +X)
   */
  const getOrientation = (): [number, number, number] => {
    if (jointType === 'OVERLAY') {
      // Vertical orientation
      if (position === 'TOP') {
        return [Math.PI, 0, 0]; // Bolt points down
      }
      return [0, 0, 0];         // Bolt points up
    } else {
      // INSET: Horizontal orientation
      return [0, 0, -Math.PI / 2]; // Bolt lies flat
    }
  };

  const groupRotation = getOrientation();

  return (
    <group>
      {layout.sets.map((set, i) => (
        <FittingSetVisual
          key={set.id}
          set={set}
          bolt={bolt}
          cam={cam}
          dowel={dowel}
          groupRotation={groupRotation}
          showLabels={showLabels}
        />
      ))}
    </group>
  );
};

// =================================================================
// FITTING SET VISUAL (Sub-component)
// =================================================================
interface FittingSetVisualProps {
  set: FittingSet;
  bolt: typeof HAFELE_CATALOG.bolts.B24;
  cam: typeof HAFELE_CATALOG.cams.t16;
  dowel: typeof HAFELE_CATALOG.dowels.standard;
  groupRotation: [number, number, number];
  showLabels: boolean;
}

const FittingSetVisual: React.FC<FittingSetVisualProps> = ({
  set,
  bolt,
  cam,
  dowel,
  groupRotation,
  showLabels
}) => {
  return (
    <group
      position={[mm(set.x), 0, 0]}
      rotation={groupRotation}
    >
      {/* Rotate individual set (for left/right symmetry) */}
      <group rotation={[0, set.rotationY, 0]}>

        {/* === BOLT ASSEMBLY === */}
        <group>
          {/* Shaft (ก้าน) */}
          <mesh position={[0, mm(bolt.length / 2), 0]}>
            <cylinderGeometry args={[mm(3.5), mm(3.5), mm(bolt.length), 16]} />
            <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Head (หัว) */}
          <mesh position={[0, mm(bolt.length), 0]}>
            <sphereGeometry args={[mm(3.5)]} />
            <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Sleeve (ปลอก - B34 only) */}
          {bolt.sleeveH > 0 && (
            <mesh position={[0, mm(bolt.length - 15), 0]}>
              <cylinderGeometry args={[mm(4.5), mm(4.5), mm(10), 16]} />
              <meshStandardMaterial color="#D32F2F" /> {/* Red plastic */}
            </mesh>
          )}

          {/* Thread (เกลียว) */}
          <mesh position={[0, mm(-5), 0]}>
            <cylinderGeometry args={[mm(2.5), mm(1), mm(10), 12]} />
            <meshStandardMaterial color="#555555" metalness={0.7} />
          </mesh>
        </group>

        {/* === CAM HOUSING === */}
        <group position={[0, mm(bolt.length), 0]} rotation={[Math.PI / 2, 0, 0]}>
          {/* Main housing */}
          <mesh>
            <cylinderGeometry args={[mm(7.5), mm(7.5), mm(cam.depth), 32]} />
            <meshStandardMaterial color="#C0C0C0" metalness={0.6} roughness={0.4} />
          </mesh>

          {/* Screwdriver slot (ร่องไขควง) */}
          <mesh position={[0, mm(cam.depth / 2 + 0.1), 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[mm(8), mm(0.5), mm(1.5)]} />
            <meshBasicMaterial color="#333333" />
          </mesh>
        </group>

        {/* === WOOD DOWELS (267.83.230) === */}
        {set.dowelOffsets.map((offset, j) => (
          <group key={j} position={[mm(offset), 0, 0]}>
            {/* Dowel body */}
            <mesh>
              <cylinderGeometry args={[mm(4), mm(4), mm(dowel.length), 16]} />
              <meshStandardMaterial color="#D7CCC8" /> {/* Wood color */}
            </mesh>

            {/* Fluted texture (ลายร่องกาว) */}
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <mesh key={angle} rotation={[0, (angle * Math.PI) / 180, 0]}>
                <boxGeometry args={[mm(0.3), mm(dowel.length - 2), mm(8.2)]} />
                <meshBasicMaterial color="#8D6E63" transparent opacity={0.5} />
              </mesh>
            ))}
          </group>
        ))}

      </group>
    </group>
  );
};

export default MinifixSystem;
```

### 20.4 CAM Generator for CNC

```typescript
// src/services/cam/generators/minifixUniversalOps.ts

import { LayoutPlan, getDrillPositions, DrillPosition } from '@/services/engineering/layout_engine';
import { HAFELE_CATALOG } from '@/services/hardware/hardware_db';

export interface CNCOperation {
  id: string;
  type: 'DRILL';
  face: 'FACE' | 'EDGE' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  x: number;
  y: number;
  z: number;
  diameter: number;
  depth: number;
  rpm: number;
  feedRate: number;
  hardwareRef: string;
  comment: string;
}

// =================================================================
// DEFAULT MACHINING PARAMETERS
// =================================================================
const MACHINING_PARAMS = {
  BOLT: { rpm: 2800, feedRate: 3.5 },
  CAM: { rpm: 2500, feedRate: 2.5 },
  DOWEL: { rpm: 2800, feedRate: 3.5 }
};

/**
 * Generate CNC operations for Minifix Universal System
 */
export function generateMinifixUniversalOps(
  panelId: string,
  layout: LayoutPlan,
  thickness: 16 | 19 = 19
): CNCOperation[] {
  const ops: CNCOperation[] = [];
  const positions = getDrillPositions(layout, thickness);

  positions.forEach((pos, i) => {
    const machiningParams = MACHINING_PARAMS[pos.type];

    ops.push({
      id: `${panelId}-minifix-${i}`,
      type: 'DRILL',
      face: pos.face,
      x: pos.x,
      y: pos.y,
      z: 0,
      diameter: pos.diameter,
      depth: pos.depth,
      rpm: machiningParams.rpm,
      feedRate: machiningParams.feedRate,
      hardwareRef: pos.hardwareRef,
      comment: `${pos.type} hole for ${pos.hardwareRef}`
    });
  });

  return ops;
}

/**
 * Generate G-code for Biesse CNC
 */
export function generateBiesseGCode(ops: CNCOperation[]): string {
  const lines: string[] = [
    '; Minifix Universal System - G-code',
    '; Generated by MONOLITH Designer',
    'G90 ; Absolute positioning',
    'G21 ; Metric units',
    ''
  ];

  ops.forEach((op, i) => {
    lines.push(`; Operation ${i + 1}: ${op.comment}`);
    lines.push(`G0 X${op.x.toFixed(2)} Y${op.y.toFixed(2)} ; Rapid to position`);
    lines.push(`S${op.rpm} M3 ; Spindle on`);
    lines.push(`G1 Z-${op.depth.toFixed(2)} F${op.feedRate * 1000} ; Drill`);
    lines.push(`G0 Z5 ; Retract`);
    lines.push('');
  });

  lines.push('M5 ; Spindle off');
  lines.push('G0 X0 Y0 Z50 ; Home');
  lines.push('M30 ; Program end');

  return lines.join('\n');
}

/**
 * Generate BOM from layout
 */
export interface BOMItem {
  itemNo: string;
  name: string;
  quantity: number;
  unit: string;
}

export function generateMinifixBOM(layout: LayoutPlan): BOMItem[] {
  const items: Map<string, BOMItem> = new Map();

  for (const set of layout.sets) {
    // Bolt
    const bolt = HAFELE_CATALOG.bolts.B24;
    if (!items.has(bolt.itemNo)) {
      items.set(bolt.itemNo, { itemNo: bolt.itemNo, name: bolt.name, quantity: 0, unit: 'pc' });
    }
    items.get(bolt.itemNo)!.quantity += 1;

    // Cam
    const cam = HAFELE_CATALOG.cams.t19;
    if (!items.has(cam.itemNo)) {
      items.set(cam.itemNo, { itemNo: cam.itemNo, name: cam.name, quantity: 0, unit: 'pc' });
    }
    items.get(cam.itemNo)!.quantity += 1;

    // Dowels
    const dowel = HAFELE_CATALOG.dowels.standard;
    if (!items.has(dowel.itemNo)) {
      items.set(dowel.itemNo, { itemNo: dowel.itemNo, name: dowel.name, quantity: 0, unit: 'pc' });
    }
    items.get(dowel.itemNo)!.quantity += set.dowelOffsets.length;
  }

  return Array.from(items.values());
}
```

### 20.5 Drilling Pattern Diagrams

```
UNIVERSAL MINIFIX LAYOUT - PANEL VIEW (TOP DOWN):

Panel Length: 600mm Example
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ┌─────┐                      ┌─────┐                      ┌─────┐     │
│   │Dowel│                      │Dowel│                      │Dowel│     │
│   │ 67  │                      │ 268 │                      │ 533 │     │
│   └──┬──┘                      └──┬──┘                      └──┬──┘     │
│      │-32                    -32 │ +32                    -32 │         │
│   ┌──┴──┐                      ┌─┴───┐                      ┌─┴───┐    │
│   │Bolt │                      │Bolt │                      │Bolt │    │
│   │ 35  │                      │ 300 │                      │ 565 │    │
│   └─────┘                      └─────┘                      └─────┘    │
│     Left Set                  Center Set                   Right Set    │
│     (rotY=0)                   (rotY=0)                   (rotY=π)     │
│                                                                          │
│   ←─── 35mm ───→           ←── Center ──→           ←─── 35mm ───→     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                ↑ 600mm Total ↑


OVERLAY JOINT - SIDE VIEW:

Side Panel (Vertical)         Top/Bottom Panel (Horizontal)
┌──────────────────┐         ┌─────────────────────────────────┐
│                  │         │                                 │
│    ┌──────┐      │         │   ○ Bolt (Vertical, pointing    │
│    │ CAM  │←─────┼─────────┼───● down for TOP panel)         │
│    │Housing│     │         │   ○ Dowel                       │
│    └──────┘      │         │                                 │
│                  │         └─────────────────────────────────┘
│     ● = Cam bore │
│    (15mm dia)    │
└──────────────────┘


INSET JOINT - SIDE VIEW:

Side Panel (Vertical)         Top/Bottom Panel (Horizontal)
┌──────────────────┐         ┌─────────────────────────────────┐
│                  │         │                                 │
│   ○ Bolt (Horiz) │←────────┼───┌──────┐ CAM Housing          │
│   ○ Dowel        │         │   │ CAM  │ (in Top/Bottom)      │
│                  │         │   └──────┘                      │
│                  │         │                                 │
└──────────────────┘         └─────────────────────────────────┘
```

### 20.6 CNC Drilling Specifications

```
EDGE BORING (ขอบแผ่น):
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   Component     │  Diameter  │  Depth    │  Tool     │  RPM   │
│  ──────────────┼────────────┼───────────┼───────────┼─────── │
│   Bolt Hole     │   5mm      │  11mm     │  Brad Pt  │  2800  │
│   Dowel Hole    │   8mm      │  15mm     │  Brad Pt  │  2800  │
│                                                                │
│   Position: Y=0 (center of edge thickness)                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘

FACE BORING (หน้าแผ่น):
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   Component     │  Diameter  │  Depth    │  Tool     │  RPM   │
│  ──────────────┼────────────┼───────────┼───────────┼─────── │
│   Cam Housing   │  15mm      │  12.5mm*  │  Forstner │  2500  │
│                                                                │
│   * 12.5mm for 16mm board, 14.0mm for 19mm board              │
│                                                                │
│   Position Y (Distance A):                                     │
│   - 16mm board: Y = 8.0mm from surface                        │
│   - 19mm board: Y = 9.5mm from surface                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 20.7 Operation Manual (คู่มือปฏิบัติงาน)

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    OPERATION MANUAL - MINIFIX UNIVERSAL                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  📦 1. WAREHOUSE (คลังสินค้า)                                             ║
║  ════════════════════════════                                            ║
║                                                                          ║
║  Standard Kit per Joint Set:                                             ║
║  ┌─────────────────────────────────────────────────────────────────┐    ║
║  │  Item No.      │  Description              │  Qty  │  Unit      │    ║
║  ├────────────────┼───────────────────────────┼───────┼────────────┤    ║
║  │  262.27.670    │  S200 Bolt B=24mm         │   1   │  pc        │    ║
║  │  262.26.035    │  Minifix 15 Cam (19mm)    │   1   │  pc        │    ║
║  │  267.83.230    │  Wood Dowel 8x30 Fluted   │  1-2  │  pc        │    ║
║  └─────────────────────────────────────────────────────────────────┘    ║
║                                                                          ║
║  Optional Pre-glued: 267.84.230 (ต้องมีน้ำฉีดกระตุ้นกาว)                 ║
║                                                                          ║
║  ────────────────────────────────────────────────────────────────────    ║
║                                                                          ║
║  🔧 2. PRODUCTION (ฝ่ายผลิต/CNC)                                         ║
║  ═══════════════════════════════                                         ║
║                                                                          ║
║  Drilling Parameters:                                                    ║
║  ┌─────────────────────────────────────────────────────────────────┐    ║
║  │  Position               │  From Edge  │  Hole Type  │  Remarks  │    ║
║  ├─────────────────────────┼─────────────┼─────────────┼───────────┤    ║
║  │  Bolt                   │   35mm      │  5mm×11mm   │  Edge     │    ║
║  │  Dowel (from Bolt)      │   ±32mm     │  8mm×15mm   │  Edge     │    ║
║  │  Cam Housing            │   At Bolt X │  15mm×14mm  │  Face     │    ║
║  └─────────────────────────────────────────────────────────────────┘    ║
║                                                                          ║
║  Pattern Rule:                                                           ║
║  - Bolt always 35mm from panel edge                                      ║
║  - Dowel always 32mm from Bolt (System 32)                              ║
║  - Dowel always on INNER side (toward panel center)                      ║
║                                                                          ║
║  ────────────────────────────────────────────────────────────────────    ║
║                                                                          ║
║  🛠️ 3. INSTALLATION (ฝ่ายติดตั้ง)                                        ║
║  ═════════════════════════════════                                       ║
║                                                                          ║
║  OVERLAY Configuration:                                                  ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │  • Bolt/Dowel are VERTICAL (ตั้งฉาก)                              │   ║
║  │  • Exit from Top/Bottom panel face                                │   ║
║  │  • Cam housing in SIDE panel                                      │   ║
║  │                                                                   │   ║
║  │  TOP Panel:    Bolt points DOWN (-Y)                              │   ║
║  │  BOTTOM Panel: Bolt points UP (+Y)                                │   ║
║  └──────────────────────────────────────────────────────────────────┘   ║
║                                                                          ║
║  INSET Configuration:                                                    ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │  • Bolt/Dowel are HORIZONTAL (นอนราบ)                             │   ║
║  │  • Exit from Top/Bottom panel EDGE                                │   ║
║  │  • Cam housing in TOP/BOTTOM panel                                │   ║
║  │                                                                   │   ║
║  │  Bolt points toward side panel                                    │   ║
║  └──────────────────────────────────────────────────────────────────┘   ║
║                                                                          ║
║  ⚠️ CRITICAL: Dowel always supports load on INNER side                  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 20.8 Hardware Reference Table

| Component | Item No. | Size | Drill Dia | Drill Depth | Notes |
|-----------|----------|------|-----------|-------------|-------|
| **Bolt B24** | 262.27.670 | B=24mm | 5mm | 11mm | Standard |
| **Bolt B34** | 262.28.670 | B=34mm | 5mm | 11mm | With sleeve |
| **Cam 16mm** | 262.26.033 | ø15mm | 15mm | 12.5mm | A=8.0mm |
| **Cam 19mm** | 262.26.035 | ø15mm | 15mm | 14.0mm | A=9.5mm |
| **Dowel Std** | 267.83.230 | 8×30mm | 8mm | 15mm | Fluted |
| **Dowel Pre** | 267.84.230 | 8×30mm | 8mm | 15mm | Pre-glued |
| **Dowel 35** | 267.83.235 | 8×35mm | 8mm | 17mm | Long |
| **Dowel 40** | 267.83.240 | 8×40mm | 8mm | 20mm | Heavy duty |

### 20.9 Set Count by Panel Length

| Panel Length | Left Set | Center Set | Quarter Sets | Right Set | Total |
|--------------|----------|------------|--------------|-----------|-------|
| 150-400mm | 1 | 0 | 0 | 1 | **2** |
| 401-800mm | 1 | 1 | 0 | 1 | **3** |
| 801-1200mm | 1 | 1 | 2 | 1 | **5** |
| >1200mm | 1 | 1 | 4+ | 1 | **7+** |

### 20.10 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE v3.5 DATA FLOW                          │
│                                                                         │
│   ┌──────────────────┐                                                  │
│   │  HAFELE_CATALOG  │ ◄── Single Source of Truth                      │
│   │  (hardware_db)   │     All item numbers and dimensions             │
│   └────────┬─────────┘                                                  │
│            │                                                            │
│            ▼                                                            │
│   ┌──────────────────┐                                                  │
│   │  LAYOUT_ENGINE   │ ◄── Calculation Engine                          │
│   │  (layout_engine) │     Placement logic, no hardcoded values        │
│   └────────┬─────────┘                                                  │
│            │                                                            │
│     ┌──────┴──────┐                                                     │
│     │             │                                                     │
│     ▼             ▼                                                     │
│ ┌──────────┐  ┌──────────┐                                              │
│ │  VISUAL  │  │   CAM    │                                              │
│ │Component │  │Generator │                                              │
│ │(Consumer)│  │(Consumer)│                                              │
│ └──────────┘  └──────────┘                                              │
│     │             │                                                     │
│     ▼             ▼                                                     │
│ ┌──────────┐  ┌──────────┐                                              │
│ │  3D View │  │ CNC Code │                                              │
│ │  (R3F)   │  │ (G-code) │                                              │
│ └──────────┘  └──────────┘                                              │
│                                                                         │
│  Key Principles:                                                        │
│  ✅ Engine as Truth - All logic in layout_engine                       │
│  ✅ Visual as Consumer - Components only render                        │
│  ✅ Spec Lock - All values from HAFELE_CATALOG                         │
│  ✅ System 32 - 37mm setback, 32mm spacing                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 21: Minifix Joint System - Complete Engineering Logic (Architecture v3.0)

ระบบ **Minifix Joint** ฉบับสมบูรณ์ที่รวม Engineering Logic, BOM Generation, และ 3D Visualization พร้อมรองรับทุกเงื่อนไข Overlay/Inset และ Top/Bottom ตามมาตรฐาน Häfele

### 21.1 Hardware Database (hardware_db.ts)

**สำหรับคลังสินค้าและจัดซื้อ - รหัสสินค้าตรงตาม Häfele Catalog**

```typescript
// src/services/hardware/hardware_db.ts

/**
 * Häfele Hardware Database
 * Architecture v3.0 - Complete Engineering Reference
 *
 * Item Numbers verified against:
 * - S200 Bolt Series (Page 3-4)
 * - Minifix 15 Cam Series (Page 5-6)
 * - Glue-in Dowel Series (Page 7)
 */

export type BoltVariant = 'B24' | 'B34';
export type BoardThickness = 16 | 19;

export const HAFELE_CATALOG = {
  // =================================================================
  // 🔩 S200 CONNECTING BOLTS (แกนเหล็ก)
  // Reference: Häfele Catalog Page 3-4
  // =================================================================
  bolts: {
    B24: {
      id: "bolt_b24",
      itemNo: "262.27.670",        // Unfinished version
      name: "S200 Econo S Bolt (B=24mm)",
      description: "Standard bolt for 16-19mm panels",
      length: 24,                  // Total bolt length (mm)
      sleeveH: 0,                  // No plastic sleeve
      drillDepth: 11,              // Edge boring depth (mm)
      headDia: 7,                  // Head diameter for visual
      shaftDia: 5,                 // Shaft diameter
      application: "Standard cabinet joints"
    },
    B34: {
      id: "bolt_b34",
      itemNo: "262.28.670",        // Unfinished version
      name: "S200 Econo S Bolt (B=34mm)",
      description: "Extended bolt for thick panels or high load",
      length: 34,                  // Longer for better grip
      sleeveH: 10,                 // Red plastic sleeve (depth spacer)
      drillDepth: 11,              // Same edge boring depth
      headDia: 7,
      shaftDia: 5,
      application: "Heavy-duty or thick panel joints"
    }
  },

  // =================================================================
  // ⚙️ MINIFIX 15 CAMS (ตัวเรือนล็อค)
  // Reference: Häfele Catalog Page 5-6
  // =================================================================
  cams: {
    t16: {
      id: "cam_16mm",
      itemNo: "262.26.033",        // For 16mm board (Unfinished)
      name: "Minifix 15 Cam (For 16mm)",
      description: "Cam housing for 16mm panel thickness",
      depth: 12.5,                 // Housing depth (mm)
      distA: 8.0,                  // Distance from surface to bolt center
      boreDia: 15,                 // Housing bore diameter
      finish: "Unfinished Zinc"
    },
    t19: {
      id: "cam_19mm",
      itemNo: "262.26.035",        // For 19mm board (Unfinished)
      name: "Minifix 15 Cam (For 19mm)",
      description: "Cam housing for 19mm panel thickness",
      depth: 14.0,                 // Deeper housing
      distA: 9.5,                  // Greater offset for thicker board
      boreDia: 15,
      finish: "Unfinished Zinc"
    }
  },

  // =================================================================
  // 🪵 WOODEN DOWELS (เดือยไม้)
  // Reference: Häfele Catalog Page 7
  // =================================================================
  dowel: {
    id: "dowel_8x30",
    itemNo: "039.33.462",          // Glue-in Dowel
    name: "Wooden Dowel 8x30mm",
    description: "Beech wood glue-in dowel for reinforcement",
    material: "Beech Wood",
    diameter: 8,                   // Dowel diameter (mm)
    length: 30,                    // Total length (mm)
    drillDepth: 15,                // Embed depth per side (length/2)
    spacing: 32,                   // System 32 compatible spacing
    fluted: true                   // Has glue grooves
  }
} as const;

// Type exports
export type BoltSpec = typeof HAFELE_CATALOG.bolts.B24;
export type CamSpec = typeof HAFELE_CATALOG.cams.t16;
export type DowelSpec = typeof HAFELE_CATALOG.dowel;
```

### 21.2 Layout Engine (layout_engine.ts)

**สำหรับ CNC และ Production - คำนวณตำแหน่งเจาะตามกฎ < 400mm และ > 400mm**

```typescript
// src/services/engineering/layout_engine.ts

/**
 * Minifix Joint Layout Engine
 * Architecture v3.0 - Position Calculation for CNC
 *
 * Key Rules:
 * 1. Panel < 400mm: 2 sets (Left + Right)
 * 2. Panel > 400mm: 3 sets (Left + Center + Right)
 * 3. Center set has dowels on BOTH sides
 * 4. Edge sets have dowel on INNER side only
 */

export interface JointSet {
  id: string;
  x: number;                // Position from left edge (mm)
  hasLeftDowel: boolean;    // Has dowel at -32mm offset
  hasRightDowel: boolean;   // Has dowel at +32mm offset
  rotationY: number;        // Rotation for Cam direction (0 or Math.PI)
  type: 'LEFT' | 'CENTER' | 'RIGHT';
}

export interface JointLayout {
  sets: JointSet[];
  panelLength: number;
  setCount: number;
  isValid: boolean;
  issues: string[];
}

// Placement constants
const EDGE_MARGIN = 35;           // Distance from edge to bolt center
const DOWEL_OFFSET = 32;          // System 32 spacing
const MIN_PANEL_LENGTH = 100;     // Minimum supported length
const CENTER_THRESHOLD = 400;     // Add center set above this length

/**
 * Calculate Joint Layout for any panel length
 *
 * Visual Pattern:
 *
 * Panel < 400mm (2 sets):
 * ┌─────────────────────────────────────────────────────────┐
 * │  [Bolt]--32--[Dowel]              [Dowel]--32--[Bolt]  │
 * │    35mm                                          35mm   │
 * │  Left Set                                  Right Set    │
 * └─────────────────────────────────────────────────────────┘
 *
 * Panel > 400mm (3 sets):
 * ┌────────────────────────────────────────────────────────────────┐
 * │  [Bolt]--32--[Dowel]  [Dowel]--32--[Bolt]--32--[Dowel]  [Dowel]--32--[Bolt]  │
 * │    35mm                       Center                              35mm       │
 * │  Left Set                   Center Set                       Right Set       │
 * └────────────────────────────────────────────────────────────────┘
 */
export function calculateJointLayout(panelLength: number): JointLayout {
  const sets: JointSet[] = [];
  const issues: string[] = [];

  // Validation
  if (panelLength < MIN_PANEL_LENGTH) {
    issues.push(`Panel too short: ${panelLength}mm (min ${MIN_PANEL_LENGTH}mm)`);
  }

  // =================================================================
  // 1. LEFT SET (ชุดซ้าย)
  // Pattern: [Edge] --35mm--> [Bolt] --32mm--> [Dowel]
  // Dowel is on RIGHT (inner side, toward center)
  // =================================================================
  sets.push({
    id: 'joint-left',
    x: EDGE_MARGIN,
    hasLeftDowel: false,
    hasRightDowel: true,        // Dowel toward center
    rotationY: 0,               // Cam faces right (normal)
    type: 'LEFT'
  });

  // =================================================================
  // 2. RIGHT SET (ชุดขวา)
  // Pattern: [Dowel] <--32mm-- [Bolt] <--35mm-- [Edge]
  // Dowel is on LEFT (inner side, toward center)
  // Rotated 180° so Cam access faces inward (same as left)
  // =================================================================
  sets.push({
    id: 'joint-right',
    x: panelLength - EDGE_MARGIN,
    hasLeftDowel: true,         // Dowel toward center
    hasRightDowel: false,
    rotationY: Math.PI,         // 180° rotation for symmetry
    type: 'RIGHT'
  });

  // =================================================================
  // 3. CENTER SET (ชุดกลาง) - Only for panels > 400mm
  // Pattern: [Dowel] <--32mm-- [Bolt] --32mm--> [Dowel]
  // Dowels on BOTH sides for maximum support
  // =================================================================
  if (panelLength > CENTER_THRESHOLD) {
    sets.push({
      id: 'joint-center',
      x: panelLength / 2,
      hasLeftDowel: true,       // Both sides
      hasRightDowel: true,
      rotationY: 0,
      type: 'CENTER'
    });
  }

  return {
    sets,
    panelLength,
    setCount: sets.length,
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Generate CNC drill positions from layout
 */
export interface DrillHole {
  x: number;
  y: number;
  type: 'BOLT' | 'CAM' | 'DOWEL';
  face: 'FACE' | 'EDGE';
  diameter: number;
  depth: number;
  setId: string;
}

export function generateDrillPositions(
  layout: JointLayout,
  thickness: 16 | 19 = 19
): DrillHole[] {
  const holes: DrillHole[] = [];
  const camDepth = thickness === 16 ? 12.5 : 14.0;
  const camDistA = thickness === 16 ? 8.0 : 9.5;

  for (const set of layout.sets) {
    // Bolt hole (Edge boring)
    holes.push({
      x: set.x,
      y: 0,
      type: 'BOLT',
      face: 'EDGE',
      diameter: 5,
      depth: 11,
      setId: set.id
    });

    // Cam housing (Face boring)
    holes.push({
      x: set.x,
      y: camDistA,
      type: 'CAM',
      face: 'FACE',
      diameter: 15,
      depth: camDepth,
      setId: set.id
    });

    // Dowel holes (Edge boring)
    if (set.hasRightDowel) {
      holes.push({
        x: set.x + DOWEL_OFFSET,
        y: 0,
        type: 'DOWEL',
        face: 'EDGE',
        diameter: 8,
        depth: 15,
        setId: set.id
      });
    }

    if (set.hasLeftDowel) {
      holes.push({
        x: set.x - DOWEL_OFFSET,
        y: 0,
        type: 'DOWEL',
        face: 'EDGE',
        diameter: 8,
        depth: 15,
        setId: set.id
      });
    }
  }

  return holes;
}
```

### 21.3 Visual Component (MinifixJoint.tsx)

**สำหรับ 3D Visualization - ทิศทาง Overlay/Inset ที่ถูกต้อง**

```typescript
// src/components/3d/MinifixJoint.tsx

import React, { useMemo } from 'react';
import { HAFELE_CATALOG, BoltVariant, BoardThickness } from '@/services/hardware/hardware_db';
import { calculateJointLayout, JointLayout, JointSet } from '@/services/engineering/layout_engine';

const mm = (v: number) => v / 1000; // Convert mm to Three.js meters

// =================================================================
// COMPONENT PROPS
// =================================================================
interface MinifixJointProps {
  length: number;                          // Panel length (mm)
  jointType: 'OVERLAY' | 'INSET';         // Joint configuration
  position: 'TOP' | 'BOTTOM';             // Panel position
  variant?: BoltVariant;                  // B24 or B34
  thickness?: BoardThickness;             // 16 or 19mm
  debug?: boolean;                        // Show debug info
}

// =================================================================
// MAIN COMPONENT
// =================================================================
export const MinifixJoint: React.FC<MinifixJointProps> = ({
  length,
  jointType,
  position,
  variant = 'B24',
  thickness = 19,
  debug = false
}) => {

  // Calculate layout (Engine as Truth)
  const layout = useMemo<JointLayout>(() =>
    calculateJointLayout(length),
    [length]
  );

  // Get hardware specs (Spec Lock)
  const boltSpec = HAFELE_CATALOG.bolts[variant];
  const camSpec = thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19;
  const dowelSpec = HAFELE_CATALOG.dowel;

  // =================================================================
  // ORIENTATION LOGIC (Critical Engineering Decision)
  // =================================================================
  /**
   * Joint Type Orientation Rules:
   *
   * OVERLAY (ทับขอบ):
   * ┌──────────────────────────────────────────────────────────┐
   * │  "Overlay cam จะอยู่กับแผงข้าง (Side Panel)"              │
   * │                                                          │
   * │  TOP PANEL:                                              │
   * │    ┌─────────┐                                           │
   * │    │   TOP   │ ← Bolt embedded here (vertical, down)     │
   * │    └────┬────┘                                           │
   * │         │ Bolt points DOWN (-Y)                          │
   * │         ▼                                                │
   * │    ┌────┴────┐                                           │
   * │    │  SIDE   │ ← Cam housing here                        │
   * │    └─────────┘                                           │
   * │                                                          │
   * │  BOTTOM PANEL:                                           │
   * │    ┌─────────┐                                           │
   * │    │  SIDE   │ ← Cam housing here                        │
   * │    └────┬────┘                                           │
   * │         │                                                │
   * │         ▲ Bolt points UP (+Y)                            │
   * │    ┌────┴────┐                                           │
   * │    │ BOTTOM  │ ← Bolt embedded here (vertical, up)       │
   * │    └─────────┘                                           │
   * └──────────────────────────────────────────────────────────┘
   *
   * INSET (ฝังใน):
   * ┌──────────────────────────────────────────────────────────┐
   * │  "Inset cam จะอยู่กับแผง Top (Top/Bottom Panel)"         │
   * │                                                          │
   * │    ┌─────────┐      ┌─────────┐                          │
   * │    │  SIDE   │──────│   TOP   │                          │
   * │    │         │ Bolt │  (Cam)  │                          │
   * │    │ (Bolt)  │ →    │         │                          │
   * │    └─────────┘      └─────────┘                          │
   * │                                                          │
   * │    Bolt is HORIZONTAL (parallel to floor)                │
   * │    Points from Side edge toward Top/Bottom panel         │
   * └──────────────────────────────────────────────────────────┘
   */
  const getGroupRotation = (): [number, number, number] => {
    if (jointType === 'OVERLAY') {
      // OVERLAY: Bolt is VERTICAL in Top/Bottom panel
      if (position === 'TOP') {
        return [Math.PI, 0, 0];  // Bolt points DOWN (-Y)
      } else {
        return [0, 0, 0];        // Bolt points UP (+Y)
      }
    } else {
      // INSET: Bolt is HORIZONTAL in Side panel
      return [0, 0, -Math.PI / 2];  // Bolt lies flat, points toward Top/Bottom
    }
  };

  const groupRotation = getGroupRotation();

  return (
    <group>
      {layout.sets.map((set) => (
        <JointSetVisual
          key={set.id}
          set={set}
          boltSpec={boltSpec}
          camSpec={camSpec}
          dowelSpec={dowelSpec}
          groupRotation={groupRotation}
          debug={debug}
        />
      ))}
    </group>
  );
};

// =================================================================
// JOINT SET VISUAL (Sub-component)
// =================================================================
interface JointSetVisualProps {
  set: JointSet;
  boltSpec: typeof HAFELE_CATALOG.bolts.B24;
  camSpec: typeof HAFELE_CATALOG.cams.t16;
  dowelSpec: typeof HAFELE_CATALOG.dowel;
  groupRotation: [number, number, number];
  debug: boolean;
}

const JointSetVisual: React.FC<JointSetVisualProps> = ({
  set,
  boltSpec,
  camSpec,
  dowelSpec,
  groupRotation,
  debug
}) => {
  return (
    <group
      position={[mm(set.x), 0, 0]}
      rotation={groupRotation}
    >
      {/* Apply set-specific rotation (Left/Right symmetry) */}
      <group rotation={[0, set.rotationY, 0]}>

        {/* === BOLT ASSEMBLY === */}
        <group>
          {/* Shaft */}
          <mesh position={[0, mm(boltSpec.length / 2), 0]}>
            <cylinderGeometry args={[mm(3.5), mm(3.5), mm(boltSpec.length), 16]} />
            <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Head (cam engagement point) */}
          <mesh position={[0, mm(boltSpec.length), 0]}>
            <sphereGeometry args={[mm(3.5)]} />
            <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Sleeve (B34 only) */}
          {boltSpec.sleeveH > 0 && (
            <mesh position={[0, mm(boltSpec.length - boltSpec.sleeveH / 2 - 5), 0]}>
              <cylinderGeometry args={[mm(4.5), mm(4.5), mm(boltSpec.sleeveH), 16]} />
              <meshStandardMaterial color="#D32F2F" />
            </mesh>
          )}

          {/* Thread tip */}
          <mesh position={[0, mm(-5), 0]}>
            <cylinderGeometry args={[mm(2.5), mm(1), mm(10), 12]} />
            <meshStandardMaterial color="#555555" metalness={0.7} />
          </mesh>
        </group>

        {/* === CAM HOUSING === */}
        <group position={[0, mm(boltSpec.length), 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[mm(7.5), mm(7.5), mm(camSpec.depth), 32]} />
            <meshStandardMaterial color="#C0C0C0" metalness={0.6} roughness={0.4} />
          </mesh>

          {/* Cross slot */}
          <mesh position={[0, mm(camSpec.depth / 2 + 0.05), 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[mm(8), mm(0.5), mm(2)]} />
            <meshBasicMaterial color="#222222" />
          </mesh>
        </group>

        {/* === DOWELS === */}
        {set.hasRightDowel && (
          <mesh position={[mm(32), mm(dowelSpec.length / 2), 0]}>
            <cylinderGeometry args={[mm(4), mm(4), mm(dowelSpec.length), 16]} />
            <meshStandardMaterial color="#D2B48C" />
          </mesh>
        )}

        {set.hasLeftDowel && (
          <mesh position={[mm(-32), mm(dowelSpec.length / 2), 0]}>
            <cylinderGeometry args={[mm(4), mm(4), mm(dowelSpec.length), 16]} />
            <meshStandardMaterial color="#D2B48C" />
          </mesh>
        )}

        {/* Debug label */}
        {debug && (
          <mesh position={[0, mm(50), 0]}>
            <sphereGeometry args={[mm(3)]} />
            <meshBasicMaterial color={
              set.type === 'LEFT' ? '#2196F3' :
              set.type === 'RIGHT' ? '#F44336' : '#4CAF50'
            } />
          </mesh>
        )}

      </group>
    </group>
  );
};

export default MinifixJoint;
```

### 21.4 Joint Type Comparison Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    OVERLAY vs INSET JOINT CONFIGURATION                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐   ║
║  │         OVERLAY JOINT           │  │          INSET JOINT            │   ║
║  │    (Cam in SIDE panel)          │  │    (Cam in TOP/BOTTOM panel)    │   ║
║  └─────────────────────────────────┘  └─────────────────────────────────┘   ║
║                                                                              ║
║  TOP PANEL VIEW:                      TOP PANEL VIEW:                        ║
║  ┌──────────────────┐                 ┌──────────────────┐                  ║
║  │    ↓ ↓ ↓ ↓ ↓    │ Bolts point     │     ● ● ●        │ Cam housings     ║
║  │   ○ ○ ○ ○ ○     │ DOWN into       │   ←─────────→    │ visible on       ║
║  │    TOP PANEL    │ side panels     │    TOP PANEL     │ top surface      ║
║  └──────────────────┘                 └──────────────────┘                  ║
║                                                                              ║
║  SIDE PANEL VIEW:                     SIDE PANEL VIEW:                       ║
║  ┌──────────────────┐                 ┌──────────────────┐                  ║
║  │     ● ● ●        │ Cam housings    │     → → →        │ Bolts point      ║
║  │    SIDE PANEL    │ visible on      │     ○ ○ ○        │ toward TOP       ║
║  │                  │ side surface    │    SIDE PANEL    │ panel            ║
║  └──────────────────┘                 └──────────────────┘                  ║
║                                                                              ║
║  Code Usage:                          Code Usage:                            ║
║  <MinifixJoint                        <MinifixJoint                         ║
║    jointType="OVERLAY"                  jointType="INSET"                   ║
║    position="TOP"                       position="TOP"                      ║
║    ...                                  ...                                 ║
║  />                                   />                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 21.5 Panel Length Rules

```
JOINT SET COUNT BY PANEL LENGTH:

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PANEL < 400mm (2 Sets)                                                    │
│  ═══════════════════════                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  [Bolt]─32─[Dowel]                          [Dowel]─32─[Bolt]      │   │
│  │   35mm                                                   35mm      │   │
│  │  ══════                                                 ══════     │   │
│  │  Left Set                                             Right Set    │   │
│  │  (rotY=0)                                             (rotY=π)     │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Example: 350mm panel                                                       │
│  - Left:  x = 35mm,  dowel at 67mm                                         │
│  - Right: x = 315mm, dowel at 283mm                                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PANEL > 400mm (3 Sets)                                                    │
│  ═══════════════════════                                                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  [B]─32─[D]      [D]─32─[B]─32─[D]      [D]─32─[B]                   │ │
│  │   35mm               Center                 35mm                      │ │
│  │  ══════            ════════════           ══════                     │ │
│  │  Left               Center Set             Right                     │ │
│  │  (rotY=0)           (rotY=0)             (rotY=π)                   │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Example: 600mm panel                                                       │
│  - Left:   x = 35mm,  dowel at 67mm                                        │
│  - Center: x = 300mm, dowels at 268mm and 332mm                           │
│  - Right:  x = 565mm, dowel at 533mm                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 21.6 BOM Generation

```typescript
// src/services/bom/minifixBom.ts

import { HAFELE_CATALOG, BoltVariant, BoardThickness } from '@/services/hardware/hardware_db';
import { JointLayout } from '@/services/engineering/layout_engine';

export interface BOMLine {
  itemNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

export function generateMinifixBOM(
  layout: JointLayout,
  variant: BoltVariant = 'B24',
  thickness: BoardThickness = 19
): BOMLine[] {
  const bom: BOMLine[] = [];
  const bolt = HAFELE_CATALOG.bolts[variant];
  const cam = thickness === 16 ? HAFELE_CATALOG.cams.t16 : HAFELE_CATALOG.cams.t19;
  const dowel = HAFELE_CATALOG.dowel;

  // Count components
  const boltCount = layout.sets.length;
  const camCount = layout.sets.length;
  let dowelCount = 0;
  for (const set of layout.sets) {
    if (set.hasLeftDowel) dowelCount++;
    if (set.hasRightDowel) dowelCount++;
  }

  // Generate BOM lines
  bom.push({
    itemNo: bolt.itemNo,
    description: bolt.name,
    quantity: boltCount,
    unit: 'pc'
  });

  bom.push({
    itemNo: cam.itemNo,
    description: cam.name,
    quantity: camCount,
    unit: 'pc'
  });

  bom.push({
    itemNo: dowel.itemNo,
    description: dowel.name,
    quantity: dowelCount,
    unit: 'pc'
  });

  return bom;
}
```

### 21.7 CNC Output Generation

```typescript
// src/services/cam/generators/minifixJointOps.ts

import { JointLayout, generateDrillPositions, DrillHole } from '@/services/engineering/layout_engine';

export interface CNCOperation {
  id: string;
  opType: 'DRILL';
  face: 'FACE' | 'EDGE';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  rpm: number;
  feedRate: number;
  comment: string;
}

const MACHINING_PARAMS = {
  BOLT:  { rpm: 2800, feedRate: 3.5, comment: 'Bolt pilot hole' },
  CAM:   { rpm: 2500, feedRate: 2.5, comment: 'Cam housing bore' },
  DOWEL: { rpm: 2800, feedRate: 3.5, comment: 'Dowel hole' }
};

export function generateMinifixCNCOps(
  panelId: string,
  layout: JointLayout,
  thickness: 16 | 19 = 19
): CNCOperation[] {
  const holes = generateDrillPositions(layout, thickness);
  const ops: CNCOperation[] = [];

  holes.forEach((hole, i) => {
    const params = MACHINING_PARAMS[hole.type];
    ops.push({
      id: `${panelId}-mfx-${i}`,
      opType: 'DRILL',
      face: hole.face,
      x: hole.x,
      y: hole.y,
      diameter: hole.diameter,
      depth: hole.depth,
      rpm: params.rpm,
      feedRate: params.feedRate,
      comment: `${params.comment} (${hole.setId})`
    });
  });

  return ops;
}

/**
 * Generate G-code output
 */
export function toGCode(ops: CNCOperation[]): string {
  const lines: string[] = [
    '; Minifix Joint Operations',
    '; Generated by MONOLITH Designer v3.0',
    'G90 ; Absolute',
    'G21 ; Metric',
    ''
  ];

  ops.forEach((op, i) => {
    lines.push(`; Op ${i + 1}: ${op.comment}`);
    lines.push(`G0 X${op.x.toFixed(2)} Y${op.y.toFixed(2)}`);
    lines.push(`S${op.rpm} M3`);
    lines.push(`G1 Z-${op.depth.toFixed(2)} F${op.feedRate * 1000}`);
    lines.push('G0 Z5');
    lines.push('');
  });

  lines.push('M5');
  lines.push('G0 X0 Y0 Z50');
  lines.push('M30');

  return lines.join('\n');
}
```

### 21.8 Hardware Reference Table

| Component | Item No. | Description | Diameter | Depth | Notes |
|-----------|----------|-------------|----------|-------|-------|
| **Bolt B24** | 262.27.670 | S200 Econo S Bolt | 5mm shaft | 11mm | Standard |
| **Bolt B34** | 262.28.670 | S200 Econo S Bolt | 5mm shaft | 11mm | With sleeve |
| **Cam 16mm** | 262.26.033 | Minifix 15 Cam | 15mm bore | 12.5mm | A=8.0mm |
| **Cam 19mm** | 262.26.035 | Minifix 15 Cam | 15mm bore | 14.0mm | A=9.5mm |
| **Dowel** | 039.33.462 | Glue-in Dowel | 8mm bore | 15mm | 8×30mm |

### 21.9 Usage Examples

```typescript
// Example 1: Standard base cabinet (Overlay joint)
const layout1 = calculateJointLayout(600);
console.log('Set count:', layout1.setCount); // 3

const bom1 = generateMinifixBOM(layout1, 'B24', 19);
// Output:
// - 262.27.670: S200 Bolt B24 × 3
// - 262.26.035: Minifix 15 Cam (19mm) × 3
// - 039.33.462: Wooden Dowel 8x30 × 4

// Example 2: Small drawer front (Inset joint)
const layout2 = calculateJointLayout(350);
console.log('Set count:', layout2.setCount); // 2

// Example 3: React component usage
<MinifixJoint
  length={600}
  jointType="OVERLAY"
  position="TOP"
  variant="B24"
  thickness={19}
/>
```

### 21.10 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE v3.0 - MINIFIX JOINT SYSTEM                 │
│                                                                             │
│   ┌───────────────────┐                                                     │
│   │  HAFELE_CATALOG   │ ◄── Single Source (Item Numbers & Dimensions)      │
│   │  (hardware_db.ts) │                                                     │
│   └─────────┬─────────┘                                                     │
│             │                                                               │
│             ▼                                                               │
│   ┌───────────────────┐                                                     │
│   │  LAYOUT_ENGINE    │ ◄── Position Calculator                            │
│   │ (layout_engine.ts)│     - < 400mm: 2 sets                              │
│   │                   │     - > 400mm: 3 sets                              │
│   └─────────┬─────────┘     - Dowel placement rules                        │
│             │                                                               │
│      ┌──────┼──────┬──────────┐                                            │
│      │      │      │          │                                            │
│      ▼      ▼      ▼          ▼                                            │
│  ┌──────┐ ┌────┐ ┌────┐ ┌─────────┐                                       │
│  │Visual│ │CNC │ │BOM │ │Validate │                                       │
│  │ 3D   │ │Ops │ │Gen │ │  Gate   │                                       │
│  └──────┘ └────┘ └────┘ └─────────┘                                       │
│                                                                             │
│  Key Principles:                                                            │
│  ✅ Engine as Truth - Layout logic centralized                             │
│  ✅ Spec Lock - All values from HAFELE_CATALOG                             │
│  ✅ Orientation Logic - Overlay/Inset handled correctly                    │
│  ✅ System 32 Compatible - 35mm margin, 32mm spacing                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 22: Smart Panel Joint System - Pattern Calculation (Architecture v2.5)

ระบบ **Smart Panel Joint** ที่แยก Logic การคำนวณตำแหน่งออกจาก Component แสดงผล พร้อมรองรับเงื่อนไข B24/B34 และการจัดวาง Dowel แบบอัตโนมัติ

### 22.1 Engineering Conditions

ระบบนี้แปลงเงื่อนไขทางวิศวกรรมเป็น Code 2 ส่วนหลัก:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ENGINEERING CONDITIONS TO CODE                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  1. PLACEMENT LOGIC (เงื่อนไขความยาวแผ่นไม้):                                ║
║  ═══════════════════════════════════════════                                 ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐ ║
║  │  Panel Length    │  Joint Sets  │  Pattern                            │ ║
║  ├──────────────────┼──────────────┼─────────────────────────────────────┤ ║
║  │  B < 400mm       │  2 sets      │  Left + Right (1 dowel each inner)  │ ║
║  │  A > 400mm       │  3 sets      │  Left + Center + Right              │ ║
║  │                  │              │  (Center has 2 dowels both sides)   │ ║
║  └────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║  2. HARDWARE SPEC (เงื่อนไขสเปคอุปกรณ์):                                     ║
║  ══════════════════════════════════════                                      ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐ ║
║  │  Variant  │  Shaft Length  │  Sleeve Height  │  Formula                │ ║
║  ├───────────┼────────────────┼─────────────────┼─────────────────────────┤ ║
║  │  B = 24   │  24mm          │  14mm           │  sleeveH = B - 10       │ ║
║  │  B = 34   │  34mm          │  24mm           │  sleeveH = B - 10       │ ║
║  └────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 22.2 Layout Calculation Utility (layoutUtils.ts)

**Logic คำนวณตำแหน่ง - แยกออกจาก Component เพื่อ Reusability**

```typescript
// src/services/engineering/layoutUtils.ts

/**
 * Smart Panel Joint Layout Calculator
 * Architecture v2.5 - Separated Logic for Reusability
 *
 * Key Rules:
 * - Panel < 400mm: 2 joints (Left + Right)
 * - Panel > 400mm: 3 joints (Left + Center + Right)
 * - Edge joints have 1 dowel (inner side)
 * - Center joint has 2 dowels (both sides)
 */

export interface FittingNode {
  id: string;
  x: number;              // Position X on panel (mm)
  rotationY: number;      // Rotation: 0 or Math.PI (180°)
  dowelOffsets: number[]; // Relative dowel positions (e.g., [32] or [-32, 32])
  type: 'LEFT' | 'CENTER' | 'RIGHT';
}

export interface LayoutResult {
  joints: FittingNode[];
  panelLength: number;
  jointCount: number;
  totalDowels: number;
  isValid: boolean;
}

// Constants
const EDGE_DIST = 35;    // Distance from edge to Minifix center (per drawing)
const DOWEL_GAP = 32;    // System 32 spacing
const MIN_LENGTH = 100;  // Minimum panel length
const CENTER_THRESHOLD = 400;  // Add center joint above this

/**
 * Calculate joint layout for any panel length
 *
 * Visual Pattern:
 *
 * Panel < 400mm:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                                                             │
 * │  [Edge]--35--[MFX]--32--[Dowel]  ←---→  [Dowel]--32--[MFX]--35--[Edge]
 * │              Left                             Right (rotated 180°)
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Panel > 400mm:
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │                                                                       │
 * │  [E]--35--[MFX]--32--[D]   [D]--32--[MFX]--32--[D]   [D]--32--[MFX]--35--[E]
 * │           Left                    Center                    Right     │
 * │                                                                       │
 * └───────────────────────────────────────────────────────────────────────┘
 */
export function calculateJointLayout(panelLength: number): LayoutResult {
  const joints: FittingNode[] = [];

  // Validation
  if (panelLength < MIN_LENGTH) {
    return {
      joints: [],
      panelLength,
      jointCount: 0,
      totalDowels: 0,
      isValid: false
    };
  }

  // =================================================================
  // 1. LEFT JOINT (ชุดซ้าย)
  // Pattern: [Edge] --35--> [Minifix] --32--> [Dowel]
  // Dowel on inner side (+32)
  // =================================================================
  joints.push({
    id: 'joint-left',
    x: EDGE_DIST,
    rotationY: 0,
    dowelOffsets: [DOWEL_GAP],  // 1 dowel at +32 (toward center)
    type: 'LEFT'
  });

  // =================================================================
  // 2. RIGHT JOINT (ชุดขวา)
  // Pattern: [Dowel] <--32-- [Minifix] <--35-- [Edge]
  // Rotated 180° so bolt head faces same direction as left
  // After rotation, +32 effectively points toward center
  // =================================================================
  joints.push({
    id: 'joint-right',
    x: panelLength - EDGE_DIST,
    rotationY: Math.PI,         // 180° rotation
    dowelOffsets: [DOWEL_GAP],  // 1 dowel (points inward after rotation)
    type: 'RIGHT'
  });

  // =================================================================
  // 3. CENTER JOINT (ชุดกลาง) - Only when length > 400mm
  // Pattern: [Dowel] <--32-- [Minifix] --32--> [Dowel]
  // Two dowels on both sides for maximum support
  // =================================================================
  if (panelLength > CENTER_THRESHOLD) {
    joints.push({
      id: 'joint-center',
      x: panelLength / 2,
      rotationY: 0,
      dowelOffsets: [-DOWEL_GAP, DOWEL_GAP],  // 2 dowels: left (-32) and right (+32)
      type: 'CENTER'
    });
  }

  // Calculate totals
  const totalDowels = joints.reduce((sum, j) => sum + j.dowelOffsets.length, 0);

  return {
    joints,
    panelLength,
    jointCount: joints.length,
    totalDowels,
    isValid: true
  };
}

/**
 * Get drill positions for CNC from layout result
 */
export interface DrillPosition {
  x: number;
  y: number;
  type: 'MINIFIX' | 'DOWEL';
  diameter: number;
  depth: number;
  jointId: string;
}

export function getDrillPositions(layout: LayoutResult): DrillPosition[] {
  const positions: DrillPosition[] = [];

  for (const joint of layout.joints) {
    // Minifix hole
    positions.push({
      x: joint.x,
      y: 0,
      type: 'MINIFIX',
      diameter: 5,
      depth: 11,
      jointId: joint.id
    });

    // Dowel holes
    joint.dowelOffsets.forEach((offset) => {
      // Apply rotation correction for right joint
      const actualOffset = joint.rotationY === Math.PI ? -offset : offset;
      positions.push({
        x: joint.x + actualOffset,
        y: 0,
        type: 'DOWEL',
        diameter: 8,
        depth: 15,
        jointId: joint.id
      });
    });
  }

  return positions;
}
```

### 22.3 Joint Selector Component (JointSelector.tsx)

**Component แสดงผล - รองรับการเปลี่ยนรุ่น B24/B34**

```typescript
// src/components/3d/JointSelector.tsx

import React from 'react';

// Helper: Convert mm to Three.js units (meters)
const mm = (v: number) => v / 1000;

// =================================================================
// MATERIAL DEFINITIONS
// =================================================================
interface JointMaterials {
  metal?: any;      // Zinc/Steel for shaft and head
  zinc?: any;       // Zinc diecast for cam housing
  plastic?: any;    // Red/White plastic for sleeve
  darkMetal?: any;  // Dark metal for thread
  wood?: any;       // Wood color for dowel
  black?: any;      // Black for visual marks
}

// =================================================================
// COMPONENT PROPS
// =================================================================
interface JointSelectorProps {
  variant?: 'B24' | 'B34';       // Bolt variant selection
  dowelOffsets?: number[];       // Dowel positions as array
  materials?: JointMaterials;    // Material references
  showLabels?: boolean;          // Debug labels
}

// =================================================================
// HARDWARE SPECS BY VARIANT
// =================================================================
const HARDWARE_SPECS = {
  B24: {
    shaftLength: 24,     // B = 24mm
    sleeveHeight: 14,    // B - 10 = 14mm
    threadLength: 11,
    shaftDia: 3.75,
    sleeveDia: 4,
    headDia: 3.5,
    camDepth: 12,
    camDia: 7.5
  },
  B34: {
    shaftLength: 34,     // B = 34mm
    sleeveHeight: 24,    // B - 10 = 24mm
    threadLength: 11,
    shaftDia: 3.75,
    sleeveDia: 4,
    headDia: 3.5,
    camDepth: 12,
    camDia: 7.5
  }
};

// =================================================================
// MAIN COMPONENT
// =================================================================
export const JointSelector: React.FC<JointSelectorProps> = ({
  variant = 'B24',
  dowelOffsets = [32],
  materials = {},
  showLabels = false
}) => {

  // Get specs for selected variant
  const specs = HARDWARE_SPECS[variant];
  const { shaftLength, sleeveHeight, threadLength, shaftDia, sleeveDia, headDia, camDepth, camDia } = specs;

  return (
    <group>
      {/* =================================================================
          PART 1: MINIFIX HARDWARE
          Origin (0,0,0) is at the wood joint interface
          ================================================================= */}
      <group>
        {/* SHAFT: Runs from surface (0) into wood by B length */}
        <mesh position={[0, mm(shaftLength / 2), 0]}>
          <cylinderGeometry args={[mm(shaftDia), mm(shaftDia), mm(shaftLength), 16]} />
          <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} {...materials.metal} />
        </mesh>

        {/* BALL HEAD: At end of shaft (distance B) */}
        <mesh position={[0, mm(shaftLength), 0]}>
          <sphereGeometry args={[mm(headDia), 16, 16]} />
          <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} {...materials.metal} />
        </mesh>

        {/* CAM HOUSING: Mounted at shaft end position */}
        <group position={[0, mm(shaftLength), 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[mm(camDia), mm(camDia), mm(camDepth), 32]} />
            <meshStandardMaterial color="#C0C0C0" metalness={0.6} roughness={0.4} {...materials.zinc} />
          </mesh>

          {/* Cross slot visual (screwdriver mark) */}
          <mesh position={[0, mm(camDepth / 2 + 0.1), 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[mm(8), mm(0.5), mm(1)]} />
            <meshBasicMaterial color="#222222" {...materials.black} />
          </mesh>
        </group>

        {/* SLEEVE: Plastic sleeve, height varies by variant */}
        {/* Origin 0, extends in negative Y direction */}
        <mesh position={[0, mm(-sleeveHeight / 2), 0]}>
          <cylinderGeometry args={[mm(sleeveDia), mm(sleeveDia), mm(sleeveHeight), 16]} />
          <meshStandardMaterial color="#D32F2F" {...materials.plastic} />
        </mesh>

        {/* THREAD: Extends beyond sleeve */}
        <mesh position={[0, mm(-sleeveHeight - threadLength / 2), 0]}>
          <cylinderGeometry args={[mm(2.5), mm(2.5), mm(threadLength), 16]} />
          <meshStandardMaterial color="#555555" metalness={0.7} {...materials.darkMetal} />
        </mesh>
      </group>

      {/* =================================================================
          PART 2: DOWELS (Loop creates based on array length)
          Supports both 1 dowel (edge) and 2 dowels (center)
          ================================================================= */}
      {dowelOffsets.map((offset, i) => (
        <group key={i} position={[mm(offset), 0, 0]}>
          {/* Dowel 8x30mm: Offset Y by -15mm (embeds into side panel) */}
          <mesh position={[0, mm(-15), 0]}>
            <cylinderGeometry args={[mm(4), mm(4), mm(30), 16]} />
            <meshStandardMaterial color="#D2B48C" {...materials.wood} />
          </mesh>

          {/* Optional: Debug label */}
          {showLabels && (
            <mesh position={[0, mm(20), 0]}>
              <sphereGeometry args={[mm(2)]} />
              <meshBasicMaterial color="#4CAF50" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
};

export default JointSelector;
```

### 22.4 Smart Panel Integration (SmartPanel.tsx)

**ไฟล์หลักที่รวม Logic และ Component เข้าด้วยกัน**

```typescript
// src/components/3d/SmartPanel.tsx

import React, { useMemo } from 'react';
import { calculateJointLayout, LayoutResult } from '@/services/engineering/layoutUtils';
import { JointSelector } from './JointSelector';

const mm = (v: number) => v / 1000;

// =================================================================
// COMPONENT PROPS
// =================================================================
interface SmartPanelProps {
  length: number;                    // Panel length in mm
  width?: number;                    // Panel width in mm
  thickness?: number;                // Panel thickness in mm
  variant?: 'B24' | 'B34';          // Bolt variant
  showWireframe?: boolean;          // Show panel as wireframe
  showJoints?: boolean;             // Show joint hardware
  debug?: boolean;                  // Show debug info
}

// =================================================================
// MAIN COMPONENT
// =================================================================
export const SmartPanel: React.FC<SmartPanelProps> = ({
  length = 500,
  width = 300,
  thickness = 19,
  variant = 'B24',
  showWireframe = true,
  showJoints = true,
  debug = false
}) => {

  // Calculate joint positions using separated logic
  const layout = useMemo<LayoutResult>(() =>
    calculateJointLayout(length),
    [length]
  );

  // Material definitions
  const materials = useMemo(() => ({
    metal: { color: '#888888', metalness: 0.8, roughness: 0.3 },
    zinc: { color: '#C0C0C0', metalness: 0.6, roughness: 0.4 },
    plastic: { color: '#D32F2F' },
    darkMetal: { color: '#555555', metalness: 0.7 },
    wood: { color: '#D2B48C' },
    black: { color: '#222222' }
  }), []);

  return (
    <group>
      {/* =================================================================
          PANEL VISUALIZATION (Reference)
          ================================================================= */}
      {showWireframe && (
        <mesh position={[mm(length / 2), mm(-thickness / 2), 0]}>
          <boxGeometry args={[mm(length), mm(thickness), mm(width)]} />
          <meshStandardMaterial
            color="#F5F5F5"
            wireframe={true}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* =================================================================
          JOINT HARDWARE (Loop through calculated positions)
          ================================================================= */}
      {showJoints && layout.joints.map((joint) => (
        <group
          key={joint.id}
          position={[mm(joint.x), 0, 0]}
          rotation={[0, joint.rotationY, 0]}  // Apply 180° for right joint
        >
          <JointSelector
            variant={variant}
            dowelOffsets={joint.dowelOffsets}
            materials={materials}
            showLabels={debug}
          />

          {/* Debug: Joint type indicator */}
          {debug && (
            <mesh position={[0, mm(40), 0]}>
              <sphereGeometry args={[mm(3)]} />
              <meshBasicMaterial color={
                joint.type === 'LEFT' ? '#2196F3' :
                joint.type === 'RIGHT' ? '#F44336' : '#4CAF50'
              } />
            </mesh>
          )}
        </group>
      ))}

      {/* Debug: Layout info */}
      {debug && (
        <group position={[mm(length / 2), mm(60), 0]}>
          {/* Visual indicator for panel length */}
        </group>
      )}
    </group>
  );
};

export default SmartPanel;
```

### 22.5 Layout Pattern Diagrams

```
JOINT LAYOUT BY PANEL LENGTH:

╔══════════════════════════════════════════════════════════════════════════════╗
║  PANEL < 400mm (2 JOINTS)                                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║     ┌────────────────────────────────────────────────────────────────┐      ║
║     │                         PANEL                                  │      ║
║     │                                                                │      ║
║     │  ┌─────┐                                      ┌─────┐         │      ║
║     │  │Dowel│                                      │Dowel│         │      ║
║     │  │ +32 │                                      │ +32*│  *after │      ║
║     │  └──┬──┘                                      └──┬──┘  rotation║      ║
║     │     │                                            │            │      ║
║     │  ┌──┴──┐                                      ┌──┴──┐         │      ║
║     │  │ MFX │                                      │ MFX │         │      ║
║     │  │ 35  │                                      │ L-35│         │      ║
║     │  └─────┘                                      └─────┘         │      ║
║     │   Left                                         Right          │      ║
║     │  (rotY=0)                                    (rotY=π)         │      ║
║     │                                                                │      ║
║     └────────────────────────────────────────────────────────────────┘      ║
║              ↑                                              ↑               ║
║             35mm                                          35mm              ║
║                                                                              ║
║  Example: 350mm panel                                                        ║
║  - Joint Left:  x = 35mm,  dowelOffsets = [32]   → Dowel at 67mm           ║
║  - Joint Right: x = 315mm, dowelOffsets = [32]   → Dowel at 283mm          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║  PANEL > 400mm (3 JOINTS)                                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║     ┌────────────────────────────────────────────────────────────────────┐  ║
║     │                              PANEL                                 │  ║
║     │                                                                    │  ║
║     │  ┌───┐           ┌───┐       ┌───┐           ┌───┐                │  ║
║     │  │ D │           │ D │       │ D │           │ D │                │  ║
║     │  │+32│           │-32│       │+32│           │+32│                │  ║
║     │  └─┬─┘           └─┬─┘       └─┬─┘           └─┬─┘                │  ║
║     │    │               │           │               │                  │  ║
║     │  ┌─┴─┐           ┌─┴───────────┴─┐           ┌─┴─┐                │  ║
║     │  │MFX│           │     CENTER    │           │MFX│                │  ║
║     │  │35 │           │      MFX      │           │L35│                │  ║
║     │  └───┘           └───────────────┘           └───┘                │  ║
║     │  Left              Center (L/2)              Right                │  ║
║     │                                                                    │  ║
║     └────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  Example: 600mm panel                                                        ║
║  - Joint Left:   x = 35mm,  dowelOffsets = [32]      → Dowel at 67mm       ║
║  - Joint Center: x = 300mm, dowelOffsets = [-32, 32] → Dowels at 268, 332mm║
║  - Joint Right:  x = 565mm, dowelOffsets = [32]      → Dowel at 533mm      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 22.6 Hardware Spec Comparison

```
B24 vs B34 VARIANT COMPARISON:

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  B24 VARIANT                         B34 VARIANT                           │
│  ═══════════                         ═══════════                           │
│                                                                             │
│       ┌───┐                                ┌───┐                           │
│       │CAM│                                │CAM│                           │
│       └─┬─┘                                └─┬─┘                           │
│         │                                    │                             │
│    ┌────┴────┐ B=24mm                  ┌────┴────┐ B=34mm                 │
│    │  SHAFT  │                         │  SHAFT  │                         │
│    │         │                         │         │                         │
│    └────┬────┘                         │         │                         │
│  ═══════╪═══════ Surface               │         │                         │
│    ┌────┴────┐                         └────┬────┘                         │
│    │ SLEEVE  │ H=14mm              ═════════╪═════════ Surface             │
│    └────┬────┘                         ┌────┴────┐                         │
│         │                              │ SLEEVE  │ H=24mm                  │
│    ┌────┴────┐ Thread                  │         │                         │
│    │  ····   │ 11mm                    └────┬────┘                         │
│    └─────────┘                              │                              │
│                                        ┌────┴────┐ Thread                  │
│                                        │  ····   │ 11mm                    │
│                                        └─────────┘                         │
│                                                                             │
│  Formula: sleeveH = B - 10                                                 │
│  B24: 24 - 10 = 14mm                                                       │
│  B34: 34 - 10 = 24mm                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 22.7 Usage Examples

```typescript
// Example 1: Short panel (< 400mm)
const layout1 = calculateJointLayout(350);
console.log('Joint count:', layout1.jointCount);  // 2
console.log('Total dowels:', layout1.totalDowels); // 2

// Example 2: Long panel (> 400mm)
const layout2 = calculateJointLayout(600);
console.log('Joint count:', layout2.jointCount);  // 3
console.log('Total dowels:', layout2.totalDowels); // 4

// Example 3: Get CNC drill positions
const drills = getDrillPositions(layout2);
drills.forEach(d => {
  console.log(`${d.type} at x=${d.x}mm, dia=${d.diameter}mm, depth=${d.depth}mm`);
});
// Output:
// MINIFIX at x=35mm, dia=5mm, depth=11mm
// DOWEL at x=67mm, dia=8mm, depth=15mm
// MINIFIX at x=565mm, dia=5mm, depth=11mm
// DOWEL at x=533mm, dia=8mm, depth=15mm
// MINIFIX at x=300mm, dia=5mm, depth=11mm
// DOWEL at x=268mm, dia=8mm, depth=15mm
// DOWEL at x=332mm, dia=8mm, depth=15mm

// Example 4: React component usage
<SmartPanel
  length={600}
  variant="B24"
  showWireframe={true}
  showJoints={true}
  debug={false}
/>

// Example 5: Change variant
<SmartPanel
  length={450}
  variant="B34"  // Longer shaft, taller sleeve
/>
```

### 22.8 Quick Reference Table

| Panel Length | Joint Count | Dowel Count | Left Dowels | Center Dowels | Right Dowels |
|--------------|-------------|-------------|-------------|---------------|--------------|
| 150mm | 2 | 2 | 1 | - | 1 |
| 300mm | 2 | 2 | 1 | - | 1 |
| 400mm | 2 | 2 | 1 | - | 1 |
| 401mm | 3 | 4 | 1 | 2 | 1 |
| 600mm | 3 | 4 | 1 | 2 | 1 |
| 800mm | 3 | 4 | 1 | 2 | 1 |
| 1000mm | 3 | 4 | 1 | 2 | 1 |

### 22.9 Variant Specification Table

| Property | B24 | B34 | Unit | Formula |
|----------|-----|-----|------|---------|
| **Shaft Length** | 24 | 34 | mm | B |
| **Sleeve Height** | 14 | 24 | mm | B - 10 |
| **Thread Length** | 11 | 11 | mm | Fixed |
| **Shaft Diameter** | 3.75 | 3.75 | mm | Fixed |
| **Head Diameter** | 3.5 | 3.5 | mm | Fixed |
| **Cam Diameter** | 7.5 | 7.5 | mm | Fixed |
| **Cam Depth** | 12 | 12 | mm | Fixed |

### 22.10 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE v2.5 - SMART PANEL SYSTEM                   │
│                                                                             │
│   ┌───────────────────┐                                                     │
│   │   layoutUtils.ts  │ ◄── Pure Logic (No UI Dependencies)                │
│   │                   │                                                     │
│   │ calculateJoint()  │     - Panel length rules                           │
│   │ getDrillPos()     │     - Dowel placement                              │
│   └─────────┬─────────┘     - CNC positions                                │
│             │                                                               │
│             │ LayoutResult                                                  │
│             │                                                               │
│   ┌─────────▼─────────┐     ┌───────────────────┐                          │
│   │  SmartPanel.tsx   │────►│ JointSelector.tsx │                          │
│   │   (Container)     │     │   (Presentation)  │                          │
│   │                   │     │                   │                          │
│   │ - Loop joints     │     │ - Variant B24/B34 │                          │
│   │ - Apply rotation  │     │ - Draw hardware   │                          │
│   │ - Material refs   │     │ - Draw dowels     │                          │
│   └───────────────────┘     └───────────────────┘                          │
│                                                                             │
│  Key Principles:                                                            │
│  ✅ Separation of Concerns - Logic separate from UI                        │
│  ✅ Reusability - layoutUtils can be used anywhere                         │
│  ✅ Configurability - Variant selection (B24/B34)                          │
│  ✅ Testability - Pure functions easy to unit test                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 23: Minifix 3D Visualization - Implementation Errata & Best Practices

เอกสารนี้รวบรวม **ข้อผิดพลาดที่พบ (Errata)** และ **แนวปฏิบัติที่ถูกต้อง (Best Practices)** สำหรับการ implement ระบบ Minifix 3D visualization

### 23.1 Errata Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MINIFIX 3D IMPLEMENTATION ERRATA                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Issue #  │  Component        │  Severity  │  Description                   │
├───────────┼───────────────────┼────────────┼────────────────────────────────┤
│  ERR-001  │  Dowel Rotation   │  🔴 HIGH   │  rotationX: 90 ทำให้เดือยนอน   │
│  ERR-002  │  Position Overlap │  ⚠️ MEDIUM │  offsetX: 0 ซ้อนทับกับน็อต     │
│  ERR-003  │  Origin Point     │  🎯 DESIGN │  Origin ควรอยู่ที่ขอบไม้       │
│  ERR-004  │  Cam Rotation     │  🔒 LOW    │  rotation ล็อกตายตัว            │
└───────────┴───────────────────┴────────────┴────────────────────────────────┘
```

---

### 23.2 ERR-001: Dowel Rotation Error (🔴 HIGH)

#### ปัญหา

ในไฟล์ Config มีการกำหนดค่า `rotationX: 90` ซึ่งทำให้ CylinderGeometry ใน Three.js ถูกหมุนผิดทิศทาง

```typescript
// ❌ WRONG - Config ที่ผิดพลาด
dowel: {
  // ...
  rotationX: 90,  // หมุนแกน X 90° = เดือยนอนราบ
  // ...
}
```

#### การวิเคราะห์

```
THREE.JS CYLINDER GEOMETRY DEFAULT ORIENTATION:

   Default (rotation = 0):              After rotationX: 90°:

        ┌─────┐                             ─────────────────
        │     │  ← Axis Y (Up)              └───────────────┘
        │     │                                  ↑
        │     │                               Axis Z (Forward)
        └─────┘

   เดือยตั้งตรง ✅                        เดือยนอนราบ ❌
   (ขนานกับน็อต)                         (ขนานกับพื้น)
```

#### วิธีแก้ไข

```typescript
// ✅ CORRECT - Config ที่ถูกต้อง
export const DEFAULT_MINIFIX_CONFIG = {
  // ...
  dowel: {
    offsetX: 32,    // ระยะห่างจากน็อต (System 32)
    offsetY: 0,
    offsetZ: 0,
    rotationX: 0,   // ✅ แก้จาก 90 เป็น 0 ให้ตั้งตรง
    rotationY: 0,
    rotationZ: 0
  }
}
```

---

### 23.3 ERR-002: Position Overlap (⚠️ MEDIUM)

#### ปัญหา

ค่า `offsetX: 0` ใน Config ทำให้เดือยไม้ถูกสร้างที่จุดเดียวกับน็อต Minifix (0,0,0)

```typescript
// ❌ WRONG - ค่า offset = 0
dowel: {
  offsetX: 0,  // เดือยซ้อนทับกับน็อต
  offsetY: 0,
  offsetZ: 0,
  // ...
}
```

#### ผลกระทบ

```
Z-FIGHTING DIAGRAM:

   Position (0,0,0):                    Visual Result:

        ┌─────┐                         ┌─────┐
        │Bolt │                         │▓▓▓▓▓│ ← Z-fighting
        │ + ⟵─│── Dowel at same pos     │▓▓▓▓▓│   (flickering)
        │Dowel│                         │▓▓▓▓▓│
        └─────┘                         └─────┘

   Model Overlap                        Render Artifact
```

#### วิธีแก้ไข

```typescript
// ✅ CORRECT - กำหนด offset ตามมาตรฐาน System 32
dowel: {
  offsetX: 32,   // ✅ ระยะห่าง 32mm จากน็อต
  offsetY: 0,
  offsetZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0
}
```

#### ระยะ Offset มาตรฐาน

```
SYSTEM 32 DOWEL PLACEMENT:

   ← 32mm →│← 32mm →

   ○       ●       ○
   Dowel   Bolt    Dowel

   Standard Pattern:
   - Single: offsetX = 32 (right side)
   - Pair: offsetX = -32 (left), +32 (right)
```

---

### 23.4 ERR-003: Origin Point Design Issue (🎯 DESIGN)

#### ปัญหา

Code ปัจจุบันยึด "หัวน็อต (Ball Head)" เป็นจุด Origin (0,0,0) แล้วยืดก้านลงไปหาเกลียว

```typescript
// ❌ CURRENT APPROACH - Origin at Ball Head
//
//        ● ← Ball Head = Origin (0,0,0)
//        │
//        │ Shaft
//        │
//        ├──── Interface (เลื่อนตำแหน่งเมื่อเปลี่ยน B)
//        │
//        │ Thread
//        ▼
```

#### ผลกระทบ

```
PROBLEM WHEN CHANGING VARIANT:

   B24 Variant:                    B34 Variant:

   ● ← Origin (0,0,0)              ● ← Origin (0,0,0)
   │                               │
   │ 24mm Shaft                    │
   │                               │ 34mm Shaft
   ├──── Interface @ -24mm         │
   │                               │
   ▼                               ├──── Interface @ -34mm ← MOVED!
                                   │
                                   ▼

   เมื่อเปลี่ยนจาก B24 → B34:
   - หัวน็อตอยู่ที่เดิม
   - แต่รอยต่อไม้ (Interface) เลื่อนลง 10mm
   - ทำให้การประกอบผิดเพี้ยน!
```

#### วิธีแก้ไข (Refactor)

```typescript
// ✅ CORRECT APPROACH - Origin at Wood Interface
//
//        │ Thread (ออกไปทางลบ)
//        │
//   ─────┼───── Interface = Origin (0,0,0)
//        │
//        │ Shaft (เข้าไปทาง +Y)
//        │
//        ● ← Ball Head @ +B (ขยับตาม Variant)
```

#### Implementation

```typescript
// ✅ CORRECTED - Origin at Interface
case 'minifix_15':
  const cfg = minifixConfig;
  const B = cfg.bolt.shaftLength; // 24 or 34
  const sleeveH = cfg.sleeve.height;

  return (
    <group>
      {/* --- ZONE 1: ฝังในเนื้อไม้ (0 → +B) --- */}

      {/* SHAFT: Origin (0) → Ball Head (B) */}
      <mesh position={[0, mm(B / 2), 0]}>
        <cylinderGeometry args={[
          mm(cfg.bolt.shaftDiameter / 2),
          mm(cfg.bolt.shaftDiameter / 2),
          mm(B)
        ]} />
      </mesh>

      {/* BALL HEAD: ปลายสุดที่ระยะ B */}
      <mesh position={[0, mm(B), 0]}>
        <sphereGeometry args={[mm(cfg.bolt.ballDiameter / 2)]} />
      </mesh>

      {/* CAM HOUSING: อยู่ที่ระยะ B (ขยับตาม Variant) */}
      <group position={[mm(cfg.cam.offsetX), mm(B + cfg.cam.offsetY), 0]}>
        {/* Cam mesh */}
      </group>

      {/* --- ZONE 2: รอยต่อและเกลียว (0 → Negative) --- */}

      {/* SLEEVE: อยู่รอบ Origin */}
      <mesh position={[0, mm(sleeveH / 2), 0]}>
        <cylinderGeometry args={[
          mm(cfg.sleeve.diameter / 2),
          mm(cfg.sleeve.diameter / 2),
          mm(sleeveH)
        ]} />
      </mesh>

      {/* THREAD: ยื่นออกไปทางลบ */}
      <mesh position={[0, mm(-cfg.bolt.threadLength / 2), 0]}>
        <cylinderGeometry args={[
          mm(cfg.bolt.threadDiameter / 2),
          mm(cfg.bolt.threadDiameter / 2),
          mm(cfg.bolt.threadLength)
        ]} />
      </mesh>
    </group>
  );
```

#### Origin Point Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ORIGIN POINT COMPARISON                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ❌ WRONG: Origin at Ball Head       ✅ CORRECT: Origin at Interface       │
│                                                                              │
│         ●════ Origin (0,0,0)                  Thread                         │
│         ║                                        ║                           │
│       Shaft                                      ▼                           │
│         ║                              ─────────●═══════ Origin (0,0,0)      │
│   ─────╫───── Interface (ลอย)                  ║                             │
│         ║                                     Shaft                          │
│       Thread                                   ║                             │
│         ▼                                      ●                             │
│                                            Ball Head                         │
│                                                                              │
│   ปัญหา:                              ข้อดี:                                 │
│   - Interface เลื่อนเมื่อเปลี่ยน B     - Interface คงที่                     │
│   - ยากต่อการจัดตำแหน่ง               - จัดตำแหน่งง่าย                        │
│   - พิกัดสับสน                         - พิกัดเป็นระบบ                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 23.5 ERR-004: Cam Rotation Locked (🔒 LOW)

#### ปัญหา

ค่า rotation ของ Cam Housing ถูกกำหนดไว้ตายตัว ทำให้หมุนหันรูไขควงไปทิศอื่นไม่ได้

```typescript
// ❌ WRONG - Hardcoded rotation
<group
  position={[...]}
  rotation={[Math.PI/2, 0, 0]}  // ล็อกตายตัว!
>
```

#### ผลกระทบ

```
CAM SCREW SLOT ORIENTATION:

   Locked (current):              Needed for different panels:

   ┌───────────┐                  ┌───────────┐  ┌───────────┐
   │   ━━━━    │ ← Slot หันหน้า   │     ┃     │  │    ╲╱     │
   │           │                  │     ┃     │  │    ╱╲     │
   └───────────┘                  └───────────┘  └───────────┘

   Only one direction             Slot หันซ้าย    Slot หันเฉียง
```

#### วิธีแก้ไข

```typescript
// ✅ CORRECT - Config-driven rotation
<group
  position={[mm(cfg.cam.offsetX), mm(B + cfg.cam.offsetY), mm(cfg.cam.offsetZ)]}
  rotation={[
    Math.PI/2 + (cfg.cam.rotationX || 0) * Math.PI / 180, // Base + Config
    (cfg.cam.rotationY || 0) * Math.PI / 180,
    (cfg.cam.rotationZ || 0) * Math.PI / 180
  ]}
>
  {/* Cam mesh */}
</group>
```

#### Config Structure

```typescript
interface CamConfig {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotationX: number;  // องศา (degrees) - บวกกับ base rotation
  rotationY: number;  // องศา (degrees)
  rotationZ: number;  // องศา (degrees)
  diameter: number;
  depth: number;
}
```

---

### 23.6 Corrected Default Config

```typescript
// src/stores/hardwareConfig.ts

export const DEFAULT_MINIFIX_CONFIG = {
  bolt: {
    shaftLength: 24,       // B value (24 or 34)
    shaftDiameter: 3.75,   // mm
    threadLength: 11,      // mm (fixed)
    threadDiameter: 6,     // mm
    ballDiameter: 3.5,     // mm
  },

  sleeve: {
    height: 14,            // sleeveH = B - 10 (24 - 10 = 14)
    diameter: 8,           // mm
  },

  cam: {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotationX: 0,          // degrees - added to base PI/2
    rotationY: 0,
    rotationZ: 0,
    diameter: 15,          // mm
    depth: 12,             // mm
  },

  // ✅ CORRECTED DOWEL CONFIG
  dowel: {
    offsetX: 32,           // ✅ ระยะห่าง 32mm (ไม่ใช่ 0)
    offsetY: 0,
    offsetZ: 0,
    rotationX: 0,          // ✅ แก้จาก 90 เป็น 0
    rotationY: 0,
    rotationZ: 0,
    diameter: 8,           // mm
    length: 30,            // mm
  },

  // Optional: Assembly-level rotation
  assemblyRotation: {
    x: 0,                  // degrees
    y: 0,
    z: 0,
  }
};

// Variant B34
export const MINIFIX_B34_CONFIG = {
  ...DEFAULT_MINIFIX_CONFIG,
  bolt: {
    ...DEFAULT_MINIFIX_CONFIG.bolt,
    shaftLength: 34,       // B = 34
  },
  sleeve: {
    ...DEFAULT_MINIFIX_CONFIG.sleeve,
    height: 24,            // sleeveH = 34 - 10 = 24
  },
};
```

---

### 23.7 Complete Implementation Reference

```typescript
// src/components/canvas/JointSelector.tsx

import * as THREE from 'three';

interface MinifixVisualizerProps {
  config: typeof DEFAULT_MINIFIX_CONFIG;
  materials: {
    brass: THREE.Material;
    zinc: THREE.Material;
    plastic: THREE.Material;
    wood: THREE.Material;
  };
}

function MinifixVisualizer({ config, materials }: MinifixVisualizerProps) {
  const cfg = config;
  const B = cfg.bolt.shaftLength;
  const sleeveH = cfg.sleeve.height;

  // Convert mm to Three.js units (assuming 1 unit = 1mm)
  const mm = (value: number) => value;

  // Convert degrees to radians
  const deg2rad = (deg: number) => deg * Math.PI / 180;

  // Assembly rotation from config
  const assemblyRot: [number, number, number] = [
    deg2rad(cfg.assemblyRotation?.x || 0),
    deg2rad(cfg.assemblyRotation?.y || 0),
    deg2rad(cfg.assemblyRotation?.z || 0),
  ];

  return (
    <group rotation={assemblyRot}>
      {/* ============================================= */}
      {/* ZONE 1: Inside Wood Panel (0 → +B)           */}
      {/* ============================================= */}

      {/* SHAFT: Runs from Interface (0) to Ball Head (B) */}
      <mesh
        position={[0, mm(B / 2), 0]}
        material={materials.zinc}
      >
        <cylinderGeometry args={[
          mm(cfg.bolt.shaftDiameter / 2),
          mm(cfg.bolt.shaftDiameter / 2),
          mm(B)
        ]} />
      </mesh>

      {/* BALL HEAD: At end of shaft (position B) */}
      <mesh
        position={[0, mm(B), 0]}
        material={materials.zinc}
      >
        <sphereGeometry args={[mm(cfg.bolt.ballDiameter / 2)]} />
      </mesh>

      {/* CAM HOUSING: At position B (moves with variant) */}
      <group
        position={[
          mm(cfg.cam.offsetX),
          mm(B + cfg.cam.offsetY),
          mm(cfg.cam.offsetZ)
        ]}
        rotation={[
          Math.PI / 2 + deg2rad(cfg.cam.rotationX || 0),
          deg2rad(cfg.cam.rotationY || 0),
          deg2rad(cfg.cam.rotationZ || 0),
        ]}
      >
        <mesh material={materials.zinc}>
          <cylinderGeometry args={[
            mm(cfg.cam.diameter / 2),
            mm(cfg.cam.diameter / 2),
            mm(cfg.cam.depth)
          ]} />
        </mesh>
      </group>

      {/* ============================================= */}
      {/* ZONE 2: Interface & Thread (0 → Negative)    */}
      {/* ============================================= */}

      {/* SLEEVE: Around interface, height = sleeveH */}
      <mesh
        position={[0, mm(sleeveH / 2), 0]}
        material={materials.plastic}
      >
        <cylinderGeometry args={[
          mm(cfg.sleeve.diameter / 2),
          mm(cfg.sleeve.diameter / 2),
          mm(sleeveH)
        ]} />
      </mesh>

      {/* THREAD: Extends outward (negative Y) */}
      <mesh
        position={[0, mm(-cfg.bolt.threadLength / 2), 0]}
        material={materials.zinc}
      >
        <cylinderGeometry args={[
          mm(cfg.bolt.threadDiameter / 2),
          mm(cfg.bolt.threadDiameter / 2),
          mm(cfg.bolt.threadLength)
        ]} />
      </mesh>

      {/* ============================================= */}
      {/* ZONE 3: Wood Dowels (Separate from bolt)     */}
      {/* ============================================= */}

      {/* DOWEL: Offset from bolt per System 32 */}
      <mesh
        position={[
          mm(cfg.dowel.offsetX),
          mm(cfg.dowel.offsetY),
          mm(cfg.dowel.offsetZ)
        ]}
        rotation={[
          deg2rad(cfg.dowel.rotationX || 0),
          deg2rad(cfg.dowel.rotationY || 0),
          deg2rad(cfg.dowel.rotationZ || 0),
        ]}
        material={materials.wood}
      >
        <cylinderGeometry args={[
          mm(cfg.dowel.diameter / 2),
          mm(cfg.dowel.diameter / 2),
          mm(cfg.dowel.length)
        ]} />
      </mesh>
    </group>
  );
}
```

---

### 23.8 Visual Reference Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              MINIFIX 3D COMPONENT STRUCTURE (Corrected)                      │
│                                                                              │
│                            ↑ +Y (into panel)                                 │
│                            │                                                 │
│                            │  ● Ball Head @ Y = B                            │
│                            │  │                                              │
│                            │  │ Shaft (length = B)                           │
│                            │  │                                              │
│   ┌────────┐               │  ┃                    ┌────────┐                │
│   │ PANEL  │───────────────┼──╋────────────────────│ PANEL  │                │
│   │  TOP   │      Interface│= ╋ = Origin (0,0,0)   │ BOTTOM │                │
│   └────────┘               │  ┃                    └────────┘                │
│                            │  │                                              │
│                            │  │ Thread (length = 11)                         │
│                            │  ▼                                              │
│                            │                                                 │
│                            │     ○ ← Dowel @ X = 32mm                        │
│                            │                                                 │
│                            ↓ -Y (out of panel)                               │
│                                                                              │
│   Component Positions:                                                       │
│   ────────────────────                                                       │
│   Ball Head:  Y = +B (24 or 34mm)                                            │
│   Shaft:      Y = 0 to +B (centered at B/2)                                  │
│   Cam:        Y = +B + offsetY                                               │
│   Sleeve:     Y = 0 to +sleeveH (centered at sleeveH/2)                      │
│   Thread:     Y = 0 to -11 (centered at -5.5)                                │
│   Dowel:      X = +32mm (or -32mm for pair)                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 23.9 Testing Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION TESTING CHECKLIST                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  □ ERR-001: Dowel stands upright (parallel to bolt shaft)                   │
│  □ ERR-002: Dowel is visible and not overlapping with bolt                  │
│  □ ERR-003: Changing B24 → B34 keeps interface at same position             │
│  □ ERR-004: Cam can be rotated by changing config values                    │
│                                                                              │
│  Visual Tests:                                                               │
│  ────────────                                                                │
│  □ Bolt and dowel are parallel when viewed from side                        │
│  □ Dowel is offset 32mm from bolt center                                    │
│  □ No Z-fighting/flickering between components                              │
│  □ Sleeve wraps around interface point                                      │
│                                                                              │
│  Functional Tests:                                                           │
│  ─────────────────                                                           │
│  □ Config changes reflect in 3D model                                       │
│  □ B24 shows shorter assembly than B34                                      │
│  □ Cam rotation changes screw slot orientation                              │
│  □ Multiple dowels can be placed at ±32mm                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 23.10 Summary Table

| Issue | Problem | Solution | Priority |
|-------|---------|----------|----------|
| **ERR-001** | `rotationX: 90` makes dowel horizontal | Change to `rotationX: 0` | 🔴 HIGH |
| **ERR-002** | `offsetX: 0` causes overlap | Set `offsetX: 32` | ⚠️ MEDIUM |
| **ERR-003** | Origin at ball head causes drift | Move origin to interface | 🎯 DESIGN |
| **ERR-004** | Cam rotation hardcoded | Add config-driven rotation | 🔒 LOW |

---

**เอกสารอ้างอิง:**
- Blum Technical Documentation
- Blum Catalog Pages 2, 5, 6, 13, 14-67, 64, 74-76, 84, 150, 410, 420, 430, 452
- Häfele Catalog PDF Pages 1-17 (Minifix, Maxifix, S-Series, Mitre, Double, Dowels)
- Häfele Wood Dowels Catalog 267-84-239 (Fluted, Pre-Glued, Plastic)
- Häfele Selection 12 (Ixconnect SC/U/CC & Tofix)
- Häfele Selection 13 (Lamello P-System)
- Häfele Selection 14 (Ixconnect Dovetail)
- Häfele Selection 15 (Metalla 510 Standard Hinges)
- Häfele Selection 16 (Specialty Hinges)
- Häfele Selection 17 (Metalla 510 & Mounting Plates)
- Hettich Product Catalog
- Häfele Furniture Fittings Handbook
- European Kitchen Cabinet Standards (EN 16121)
