# Door & Drawer Complete Guide
# คู่มือประตูและลิ้นชักฉบับสมบูรณ์

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** Technical Reference
**Scope:** Door Types, Drawer Systems, Gap Calculations & Hardware Integration

---

> **Cross-References:**
> - [Master Hardware Database](../reference/master-hardware-database.md) - Hardware SKUs & specifications (Single Source of Truth)
> - [Formula Reference](../reference/formula-reference.md) - Calculation formulas (resolves drawer width conflict)
> - [Cross-Reference Index](../reference/cross-reference-index.md) - Document navigation
> - [Hardware Drilling Specifications](./hardware-drilling-specifications.md) - Drilling patterns for hardware
> - [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md) - Cabinet dimensions
>
> **Important:** สำหรับสูตร Drawer Width ที่ถูกต้อง ดู [Formula Reference §1](../reference/formula-reference.md) ซึ่งอธิบายความแตกต่างระหว่าง 42mm (MOVENTO/TANDEM) vs 26mm (Standard)

---

## บทนำ (Introduction)

เอกสารนี้เป็นคู่มือทางวิศวกรรมสำหรับ **ระบบประตูและลิ้นชัก** ครอบคลุมการคำนวณขนาด, การเลือกอุปกรณ์, และการส่งออกไปยัง CNC

### วัตถุประสงค์ (Objectives)

1. **Door Types**: ประตูแบบต่างๆ (Overlay, Inset, Partial Overlay)
2. **Drawer Systems**: ระบบลิ้นชัก (Standard, Inner, File Drawer)
3. **Gap Calculations**: สูตรคำนวณระยะเว้นขอบ
4. **Hardware Matching**: การเลือกบานพับและรางลิ้นชักที่เหมาะสม

---

## ส่วนที่ 1: ประเภทประตูตู้ (Door Types)

### 1.1 Full Overlay (ประตูปิดทับเต็ม)

ประตูปิดทับด้านหน้าโครงตู้ทั้งหมด เห็นโครงน้อยที่สุด

```
┌─────────────────────────────────────┐
│         DOOR (Full Overlay)         │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │        CABINET CARCASS        │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
        └── Overlay: 16-19mm ──┘
```

**สูตรคำนวณ:**

```typescript
interface FullOverlayDoor {
  type: 'full_overlay';
  overlay: number;        // 16-19mm ระยะทับหน้าโครง
  reveal: number;         // 3mm ระยะเว้นระหว่างบาน
}

function calculateFullOverlayDoor(
  openingWidth: number,
  openingHeight: number,
  config: FullOverlayDoor,
  materialThickness: number = 18,
  numberOfDoors: number = 1
): DoorDimensions {
  const totalOverlay = config.overlay * 2;
  const totalGap = config.reveal * (numberOfDoors - 1);

  return {
    width: (openingWidth + totalOverlay - totalGap) / numberOfDoors,
    height: openingHeight + totalOverlay,
    hingeType: 'full_overlay', // Clip Top 120° Full Overlay
    hingeCrankAngle: 0
  };
}
```

**ข้อกำหนด:**
| พารามิเตอร์ | ค่ามาตรฐาน | ช่วงที่ยอมรับ |
|------------|-----------|-------------|
| Overlay (ด้านข้าง) | 18mm | 16-19mm |
| Overlay (บน/ล่าง) | 18mm | 16-19mm |
| Reveal (ระยะเว้น) | 3mm | 2-4mm |
| Material Thickness | 18mm | 16-25mm |

---

### 1.2 Half Overlay (ประตูปิดทับครึ่ง)

ประตูปิดทับครึ่งหนึ่งของโครง ใช้เมื่อมี 2 ประตูใช้โครงเดียวกัน

```
┌────────────────┐┌────────────────┐
│   DOOR LEFT    ││   DOOR RIGHT   │
│  ┌──────────┐  ││  ┌──────────┐  │
│  │          │  ││  │          │  │
│  │  CARCASS │  ││  │  CARCASS │  │
│  │          │  ││  │          │  │
│  └──────────┘  ││  └──────────┘  │
│                ││                │
└────────────────┘└────────────────┘
   └─ 9mm ─┘  └─ 9mm ─┘
     Overlay   Overlay
```

**สูตรคำนวณ:**

```typescript
interface HalfOverlayDoor {
  type: 'half_overlay';
  overlay: number;        // 9mm ระยะทับหน้าโครง (ครึ่งเดียว)
  reveal: number;         // 3mm ระยะเว้นระหว่างบาน
}

function calculateHalfOverlayDoor(
  openingWidth: number,
  openingHeight: number,
  config: HalfOverlayDoor,
  materialThickness: number = 18
): DoorDimensions {
  // Half overlay ใช้กับตู้ที่มีแผ่นกลาง (center partition)
  const sideOverlay = config.overlay;  // 9mm = ครึ่งหนึ่งของ 18mm

  return {
    width: openingWidth + sideOverlay - config.reveal,
    height: openingHeight + (config.overlay * 2),
    hingeType: 'half_overlay', // Clip Top 120° Half Overlay
    hingeCrankAngle: 9  // 9mm crank
  };
}
```

---

### 1.3 Inset Door (ประตูฝังใน)

ประตูอยู่ระดับเดียวกับโครงตู้ ดูเรียบหรู

```
┌───────────────────────────────────┐
│                                   │
│  ┌─────────────────────────────┐  │
│  │                             │  │
│  │      DOOR (Inset)           │  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                   │
└───────────────────────────────────┘
   └─ 2mm gap ─┘
```

**สูตรคำนวณ:**

```typescript
interface InsetDoor {
  type: 'inset';
  gap: number;            // 2mm ระยะเว้นรอบประตู
  reveal: number;         // 3mm ระยะเว้นระหว่างบาน
}

function calculateInsetDoor(
  openingWidth: number,
  openingHeight: number,
  config: InsetDoor,
  numberOfDoors: number = 1
): DoorDimensions {
  const totalGap = config.gap * 2;
  const doorGap = config.reveal * (numberOfDoors - 1);

  return {
    width: (openingWidth - totalGap - doorGap) / numberOfDoors,
    height: openingHeight - totalGap,
    hingeType: 'inset', // Clip Top 120° Inset
    hingeCrankAngle: -4  // Negative crank for inset
  };
}
```

**ข้อควรระวัง:**
- ⚠️ Inset door ต้องการความแม่นยำสูง (tolerance ±0.5mm)
- ⚠️ การบิดงอของวัสดุจะเห็นชัดเจน
- ⚠️ ต้องการบานพับ Inset (Crank -4mm)

---

### 1.4 เปรียบเทียบประเภทประตู (Door Type Comparison)

| คุณสมบัติ | Full Overlay | Half Overlay | Inset |
|----------|--------------|--------------|-------|
| **ระยะทับ** | 16-19mm | 8-9mm | 0 (ฝังใน) |
| **ความซ่อนโครง** | สูง | ปานกลาง | ไม่มี |
| **ความยากในการผลิต** | ง่าย | ปานกลาง | ยาก |
| **Tolerance** | ±1.5mm | ±1.0mm | ±0.5mm |
| **ราคาบานพับ** | ปกติ | ปกติ | สูงกว่า |
| **การใช้งาน** | ทั่วไป | ตู้แบ่งช่อง | Premium |

---

## ส่วนที่ 2: การคำนวณตำแหน่งบานพับ (Hinge Position Calculation)

### 2.1 กฎมาตรฐาน (Standard Rules)

```typescript
interface HingePositionConfig {
  topOffset: number;      // ระยะห่างจากขอบบน (mm)
  bottomOffset: number;   // ระยะห่างจากขอบล่าง (mm)
  minHingeSpacing: number; // ระยะห่างขั้นต่ำระหว่างบานพับ (mm)
  maxHingeSpacing: number; // ระยะห่างสูงสุดระหว่างบานพับ (mm)
}

const STANDARD_HINGE_CONFIG: HingePositionConfig = {
  topOffset: 80,      // 80-100mm จากขอบบน
  bottomOffset: 80,   // 80-100mm จากขอบล่าง
  minHingeSpacing: 300,
  maxHingeSpacing: 500
};

function calculateHingePositions(
  doorHeight: number,
  config: HingePositionConfig = STANDARD_HINGE_CONFIG
): number[] {
  const positions: number[] = [];

  // บานพับบน
  positions.push(config.topOffset);

  // บานพับล่าง
  const bottomPosition = doorHeight - config.bottomOffset;
  positions.push(bottomPosition);

  // คำนวณบานพับตรงกลาง (ถ้าจำเป็น)
  const availableSpace = bottomPosition - config.topOffset;

  if (availableSpace > config.maxHingeSpacing) {
    // ต้องเพิ่มบานพับตรงกลาง
    const numberOfMiddleHinges = Math.ceil(
      (availableSpace - config.minHingeSpacing) / config.maxHingeSpacing
    );

    const spacing = availableSpace / (numberOfMiddleHinges + 1);

    for (let i = 1; i <= numberOfMiddleHinges; i++) {
      positions.push(config.topOffset + (spacing * i));
    }
  }

  return positions.sort((a, b) => a - b);
}
```

### 2.2 จำนวนบานพับตามน้ำหนักประตู (Hinge Count by Door Weight)

```typescript
interface DoorWeightCalculation {
  width: number;          // mm
  height: number;         // mm
  thickness: number;      // mm
  materialDensity: number; // kg/m³
}

const MATERIAL_DENSITIES: Record<string, number> = {
  'mdf': 750,
  'particleboard': 650,
  'plywood': 600,
  'solid_wood': 700,
  'melamine': 680
};

function calculateDoorWeight(door: DoorWeightCalculation): number {
  const volumeM3 = (door.width / 1000) * (door.height / 1000) * (door.thickness / 1000);
  return volumeM3 * door.materialDensity;
}

function getRequiredHingeCount(doorWeight: number, doorHeight: number): number {
  // ตาม Blum specification
  if (doorHeight <= 800 && doorWeight <= 4) {
    return 2;
  } else if (doorHeight <= 1200 && doorWeight <= 8) {
    return 3;
  } else if (doorHeight <= 1600 && doorWeight <= 12) {
    return 4;
  } else if (doorHeight <= 2000 && doorWeight <= 16) {
    return 5;
  } else {
    return 6;
  }
}
```

### 2.3 Drilling Pattern สำหรับบานพับ

```typescript
interface HingeDrillPattern {
  cupDiameter: number;     // 35mm สำหรับ Clip Top
  cupDepth: number;        // 13mm
  mountingHoles: {
    diameter: number;      // 8mm pilot hole
    depth: number;         // 11.5mm
    spacing: number;       // 45.5mm center-to-center
  };
  distanceFromEdge: number; // 3-5mm จากขอบประตู
}

const BLUM_CLIP_TOP_PATTERN: HingeDrillPattern = {
  cupDiameter: 35,
  cupDepth: 13,
  mountingHoles: {
    diameter: 8,
    depth: 11.5,
    spacing: 45.5
  },
  distanceFromEdge: 3
};

function generateHingeDrillingPoints(
  doorWidth: number,
  hingePositions: number[],
  pattern: HingeDrillPattern = BLUM_CLIP_TOP_PATTERN
): DrillPoint[] {
  const points: DrillPoint[] = [];

  // Cup hole center position
  const cupCenterX = pattern.cupDiameter / 2 + pattern.distanceFromEdge;

  for (const yPosition of hingePositions) {
    // Main cup hole
    points.push({
      x: cupCenterX,
      y: yPosition,
      diameter: pattern.cupDiameter,
      depth: pattern.cupDepth,
      type: 'hinge_cup'
    });

    // Mounting holes (2 holes per hinge)
    const halfSpacing = pattern.mountingHoles.spacing / 2;
    points.push({
      x: cupCenterX,
      y: yPosition - halfSpacing,
      diameter: pattern.mountingHoles.diameter,
      depth: pattern.mountingHoles.depth,
      type: 'mounting_hole'
    });
    points.push({
      x: cupCenterX,
      y: yPosition + halfSpacing,
      diameter: pattern.mountingHoles.diameter,
      depth: pattern.mountingHoles.depth,
      type: 'mounting_hole'
    });
  }

  return points;
}
```

---

## ส่วนที่ 3: ระบบลิ้นชัก (Drawer Systems)

### 3.1 ส่วนประกอบลิ้นชัก (Drawer Components)

```
┌─────────────────────────────────────────────────┐
│                  DRAWER FRONT                   │
│                                                 │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐  │
│  │              DRAWER BOX                    │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │                                     │  │  │
│  │  │            BOTTOM                   │  │  │
│  │  │                                     │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │  ↑ LEFT SIDE          RIGHT SIDE ↑       │  │
│  └───────────────────────────────────────────┘  │
│                    BACK                         │
└─────────────────────────────────────────────────┘
```

### 3.2 ประเภทลิ้นชัก (Drawer Types)

```typescript
type DrawerType =
  | 'standard'       // ลิ้นชักปกติ
  | 'inner'          // ลิ้นชักซ้อนใน (สำหรับ Inset)
  | 'file_drawer'    // ลิ้นชักแฟ้มเอกสาร
  | 'pot_drawer'     // ลิ้นชักหม้อ (Deep)
  | 'internal';      // ลิ้นชักภายใน (Blum Antaro)

interface DrawerTypeConfig {
  type: DrawerType;
  sideThickness: number;    // ความหนาแผ่นข้าง
  frontGap: number;         // ระยะเว้นหน้าบาน
  slideType: SlideType;     // ประเภทราง
  bottomSetback: number;    // ระยะร่นพื้น
}

const DRAWER_CONFIGS: Record<DrawerType, DrawerTypeConfig> = {
  standard: {
    type: 'standard',
    sideThickness: 16,
    frontGap: 3,
    slideType: 'side_mount',
    bottomSetback: 8
  },
  inner: {
    type: 'inner',
    sideThickness: 16,
    frontGap: 3,
    slideType: 'undermount',
    bottomSetback: 8
  },
  file_drawer: {
    type: 'file_drawer',
    sideThickness: 16,
    frontGap: 3,
    slideType: 'heavy_duty',
    bottomSetback: 12
  },
  pot_drawer: {
    type: 'pot_drawer',
    sideThickness: 16,
    frontGap: 3,
    slideType: 'heavy_duty',
    bottomSetback: 8
  },
  internal: {
    type: 'internal',
    sideThickness: 13,  // Blum Antaro/Legrabox
    frontGap: 0,
    slideType: 'integrated',
    bottomSetback: 0
  }
};
```

### 3.3 สูตรคำนวณขนาดลิ้นชัก (Drawer Dimension Formulas)

```typescript
interface CabinetOpening {
  width: number;        // ความกว้างช่องเปิด
  depth: number;        // ความลึกช่องเปิด
  height: number;       // ความสูงช่องเปิด
}

interface SlideSpecification {
  type: SlideType;
  slideThickness: number;      // ความหนารางแต่ละข้าง
  clearance: number;           // ระยะว่างสำหรับติดตั้ง
  extensionType: 'full' | 'partial' | 'over';
  lengthOptions: number[];     // ความยาวรางที่มี (mm)
}

const SLIDE_SPECS: Record<SlideType, SlideSpecification> = {
  side_mount: {
    type: 'side_mount',
    slideThickness: 12.5,
    clearance: 0.5,
    extensionType: 'full',
    lengthOptions: [250, 300, 350, 400, 450, 500, 550, 600]
  },
  undermount: {
    type: 'undermount',
    slideThickness: 0,  // ติดใต้ลิ้นชัก
    clearance: 13,      // ระยะสำหรับราง
    extensionType: 'full',
    lengthOptions: [270, 300, 350, 400, 450, 500, 550, 600]
  },
  heavy_duty: {
    type: 'heavy_duty',
    slideThickness: 13,
    clearance: 1,
    extensionType: 'over',
    lengthOptions: [350, 400, 450, 500, 550, 600, 650, 700]
  },
  integrated: {
    type: 'integrated',
    slideThickness: 13,  // Blum Legrabox
    clearance: 0,
    extensionType: 'full',
    lengthOptions: [270, 300, 350, 400, 450, 500, 550, 600]
  }
};

function calculateDrawerBoxDimensions(
  opening: CabinetOpening,
  config: DrawerTypeConfig,
  slideSpec: SlideSpecification,
  drawerHeight: number = 120
): DrawerBoxDimensions {
  // ความกว้างกล่องลิ้นชัก
  let boxWidth: number;
  if (slideSpec.type === 'undermount' || slideSpec.type === 'integrated') {
    // Undermount: หักเฉพาะ clearance
    boxWidth = opening.width - (slideSpec.clearance * 2);
  } else {
    // Side mount: หักความหนาราง 2 ข้าง
    boxWidth = opening.width - ((slideSpec.slideThickness + slideSpec.clearance) * 2);
  }

  // ความลึกกล่องลิ้นชัก
  // เลือกรางที่ใกล้เคียงความลึกตู้มากที่สุด
  const availableDepth = opening.depth - 20; // เว้นหลัง 20mm
  const slideLength = selectSlideLength(availableDepth, slideSpec.lengthOptions);
  const boxDepth = slideLength;

  // ความสูงกล่องลิ้นชัก
  const boxHeight = drawerHeight - config.bottomSetback;

  // ขนาดแผ่นแต่ละชิ้น
  return {
    // แผ่นข้าง (Left & Right Sides)
    sides: {
      width: boxDepth,
      height: boxHeight,
      thickness: config.sideThickness,
      quantity: 2
    },
    // แผ่นหน้า/หลัง (Front & Back)
    frontBack: {
      width: boxWidth - (config.sideThickness * 2),
      height: boxHeight,
      thickness: config.sideThickness,
      quantity: 2
    },
    // แผ่นพื้น (Bottom)
    bottom: {
      width: boxWidth - (config.sideThickness * 2) + 20, // ล้นเข้าร่อง 10mm ต่อข้าง
      height: boxDepth - (config.sideThickness * 2) + 20,
      thickness: 6, // หรือ 8mm
      quantity: 1
    },
    slideLength: slideLength,
    totalWidth: boxWidth,
    totalDepth: boxDepth,
    totalHeight: boxHeight
  };
}

function selectSlideLength(availableDepth: number, options: number[]): number {
  // เลือกรางที่ยาวที่สุดที่ใส่ได้
  const validOptions = options.filter(len => len <= availableDepth);
  return Math.max(...validOptions);
}
```

### 3.4 การคำนวณหน้าบานลิ้นชัก (Drawer Front Calculation)

```typescript
interface DrawerFrontConfig {
  overlay: number;          // ระยะทับข้าง
  topGap: number;           // ระยะเว้นบน
  bottomGap: number;        // ระยะเว้นล่าง
  revealBetweenDrawers: number; // ระยะเว้นระหว่างลิ้นชัก
}

const STANDARD_DRAWER_FRONT_CONFIG: DrawerFrontConfig = {
  overlay: 18,
  topGap: 2,
  bottomGap: 2,
  revealBetweenDrawers: 3
};

interface DrawerBank {
  totalHeight: number;      // ความสูงรวมของช่องลิ้นชักทั้งหมด
  numberOfDrawers: number;  // จำนวนลิ้นชัก
  drawerHeights?: number[]; // ความสูงแต่ละลิ้นชัก (ถ้าไม่เท่ากัน)
}

function calculateDrawerFronts(
  openingWidth: number,
  bank: DrawerBank,
  config: DrawerFrontConfig = STANDARD_DRAWER_FRONT_CONFIG
): DrawerFront[] {
  const fronts: DrawerFront[] = [];

  // ความกว้างหน้าบาน
  const frontWidth = openingWidth + (config.overlay * 2);

  // ความสูงรวมที่ใช้ได้
  const availableHeight = bank.totalHeight + (config.overlay * 2);
  const totalGaps = config.topGap + config.bottomGap +
    (config.revealBetweenDrawers * (bank.numberOfDrawers - 1));
  const usableHeight = availableHeight - totalGaps;

  if (bank.drawerHeights) {
    // ใช้ความสูงที่กำหนด
    for (let i = 0; i < bank.numberOfDrawers; i++) {
      fronts.push({
        width: frontWidth,
        height: bank.drawerHeights[i],
        index: i
      });
    }
  } else {
    // แบ่งเท่าๆ กัน
    const eachHeight = usableHeight / bank.numberOfDrawers;
    for (let i = 0; i < bank.numberOfDrawers; i++) {
      fronts.push({
        width: frontWidth,
        height: eachHeight,
        index: i
      });
    }
  }

  return fronts;
}
```

---

## ส่วนที่ 4: ระบบยึดหน้าบานลิ้นชัก (Drawer Front Mounting)

### 4.1 Front Adjustment Cam (Blum)

```typescript
interface FrontAdjusterConfig {
  systemType: 'eccentric_cam' | 'front_fixing_bracket';
  horizontalAdjustment: number;  // ±2mm
  verticalAdjustment: number;    // ±2mm
  depthAdjustment: number;       // ±2mm
}

const BLUM_FRONT_ADJUSTER: FrontAdjusterConfig = {
  systemType: 'front_fixing_bracket',
  horizontalAdjustment: 2,
  verticalAdjustment: 2,
  depthAdjustment: 2
};

interface FrontFixingDrillPattern {
  boxSideDrill: {
    diameter: number;      // 8mm
    depth: number;         // 11.5mm
    fromBottom: number;    // 35mm
    fromFront: number;     // 37mm
  };
  frontDrill: {
    diameter: number;      // 6mm pilot
    fromSide: number;      // 37mm from side edge
    fromBottom: number;    // 35mm
  };
}

const BLUM_FRONT_FIXING_PATTERN: FrontFixingDrillPattern = {
  boxSideDrill: {
    diameter: 8,
    depth: 11.5,
    fromBottom: 35,
    fromFront: 37
  },
  frontDrill: {
    diameter: 6,
    fromSide: 37,
    fromBottom: 35
  }
};
```

### 4.2 Positioning Template

```
          ┌─────────────────────────────┐
          │       DRAWER FRONT          │
          │                             │
   35mm ──┼──●──────────────────────●───┼── 35mm
          │  ↑                      ↑   │
          │  37mm                 37mm  │
          │                             │
          │                             │
          │                             │
          │                             │
          └─────────────────────────────┘
```

---

## ส่วนที่ 5: Drawer Slide Selection Matrix

### 5.1 Load Capacity Guide

| ประเภทราง | Load Capacity | แนะนำใช้กับ |
|-----------|---------------|------------|
| Side Mount Standard | 25-35 kg | ลิ้นชักทั่วไป |
| Side Mount Heavy | 40-50 kg | ลิ้นชักครัว |
| Undermount | 30-40 kg | ลิ้นชักคุณภาพ |
| Undermount Heavy | 50-60 kg | ลิ้นชักหม้อ |
| Full Extension Heavy | 60-80 kg | ลิ้นชักเครื่องมือ |
| Blum Tandem | 30 kg | ลิ้นชักทั่วไป |
| Blum Movento | 40-60 kg | ลิ้นชักหนัก |

### 5.2 Slide Length Selection

```typescript
function recommendSlideLength(
  cabinetDepth: number,
  cabinetType: 'base' | 'wall' | 'tall'
): SlideRecommendation {
  const recommendations: SlideRecommendation = {
    availableLengths: [],
    recommended: 0,
    minLength: 0,
    maxLength: 0
  };

  // ลบระยะสำหรับหลังตู้และหน้าบาน
  const usableDepth = cabinetDepth - 50; // 30mm หลัง + 20mm หน้า

  const standardLengths = [250, 270, 300, 350, 400, 450, 500, 550, 600];

  recommendations.availableLengths = standardLengths.filter(
    len => len <= usableDepth && len >= usableDepth - 100
  );

  recommendations.recommended = Math.max(...recommendations.availableLengths);
  recommendations.minLength = Math.min(...recommendations.availableLengths);
  recommendations.maxLength = Math.max(...recommendations.availableLengths);

  return recommendations;
}
```

---

## ส่วนที่ 6: Soft Close & Motion Systems

### 6.1 Blumotion Integration

```typescript
interface SoftCloseConfig {
  type: 'integrated' | 'add_on' | 'tip_on';
  compatibleSystems: string[];
  closingForce: 'light' | 'standard' | 'heavy';
}

const SOFT_CLOSE_OPTIONS: Record<string, SoftCloseConfig> = {
  'blumotion_integrated': {
    type: 'integrated',
    compatibleSystems: ['Tandem', 'Movento', 'Legrabox'],
    closingForce: 'standard'
  },
  'blumotion_addon': {
    type: 'add_on',
    compatibleSystems: ['Tandem 550H', 'Movento 760H'],
    closingForce: 'standard'
  },
  'tip_on_blumotion': {
    type: 'tip_on',
    compatibleSystems: ['Tandem', 'Movento', 'Legrabox'],
    closingForce: 'standard'
  }
};
```

### 6.2 Servo-Drive (Electric)

```typescript
interface ServoDriveConfig {
  triggerType: 'touch' | 'proximity' | 'switch';
  powerRequirement: '12V' | '24V';
  openingDistance: number;  // mm
  openingSpeed: number;     // mm/s
  compatibleDrawers: string[];
}

const SERVO_DRIVE_CONFIG: ServoDriveConfig = {
  triggerType: 'touch',
  powerRequirement: '24V',
  openingDistance: 10,  // เปิดออกมา 10mm
  openingSpeed: 300,
  compatibleDrawers: ['Legrabox', 'Movento']
};
```

---

## ส่วนที่ 7: DXF Export for Doors & Drawers

### 7.1 Layer Naming Convention

```typescript
const DOOR_DRAWER_LAYERS = {
  // Hinge related
  HINGE_CUP: 'DRILL_Z_35_13',           // Cup hole
  HINGE_MOUNT: 'DRILL_Z_8_11.5',        // Mounting holes

  // Mounting plate on carcass
  MOUNTING_PLATE: 'DRILL_X_5_13',       // System 32 holes

  // Drawer slides
  SLIDE_MOUNT_SIDE: 'DRILL_Y_5_12',     // Side mounting
  SLIDE_MOUNT_BOTTOM: 'DRILL_Z_4_10',   // Undermount

  // Front fixing
  FRONT_FIX_BOX: 'DRILL_Y_8_11.5',      // On drawer box
  FRONT_FIX_FRONT: 'DRILL_X_6_15',      // On front panel

  // Drawer bottom groove
  DADO_BOTTOM: 'MILL_DADO_6_10',        // 6mm wide, 10mm deep

  // Edge banding
  EDGE_VISIBLE: 'EDGE_2MM',
  EDGE_HIDDEN: 'EDGE_0.4MM'
};
```

### 7.2 Export Function

```typescript
interface DXFExportOptions {
  includeHinges: boolean;
  includeSlides: boolean;
  includeDado: boolean;
  includeEdgeBanding: boolean;
  scale: number;
}

function exportDoorToDXF(
  door: DoorDimensions,
  hingePositions: number[],
  options: DXFExportOptions
): DXFDocument {
  const doc = new DXFDocument();

  // Panel outline
  doc.addLayer('OUTLINE', { color: 7 });
  doc.addRectangle('OUTLINE', 0, 0, door.width, door.height);

  // Hinge cups
  if (options.includeHinges) {
    doc.addLayer(DOOR_DRAWER_LAYERS.HINGE_CUP, { color: 1 });

    for (const y of hingePositions) {
      const x = 35 / 2 + 3;  // Cup center
      doc.addCircle(DOOR_DRAWER_LAYERS.HINGE_CUP, x, y, 35 / 2);
    }
  }

  // Edge banding
  if (options.includeEdgeBanding) {
    doc.addLayer(DOOR_DRAWER_LAYERS.EDGE_VISIBLE, { color: 3 });
    doc.addPolyline(DOOR_DRAWER_LAYERS.EDGE_VISIBLE, [
      [0, 0], [door.width, 0], [door.width, door.height],
      [0, door.height], [0, 0]
    ]);
  }

  return doc;
}

function exportDrawerBoxToDXF(
  drawer: DrawerBoxDimensions,
  options: DXFExportOptions
): DXFDocument[] {
  const docs: DXFDocument[] = [];

  // Left side panel
  const leftSide = new DXFDocument();
  leftSide.setName('Drawer_Left_Side');
  leftSide.addRectangle('OUTLINE', 0, 0, drawer.sides.width, drawer.sides.height);

  // Dado for bottom
  if (options.includeDado) {
    leftSide.addLayer(DOOR_DRAWER_LAYERS.DADO_BOTTOM, { color: 4 });
    leftSide.addLine(DOOR_DRAWER_LAYERS.DADO_BOTTOM,
      10, 10,  // Start: 10mm from front, 10mm from bottom
      drawer.sides.width - 10, 10  // End
    );
  }

  docs.push(leftSide);

  // Similar for right side, front, back, bottom
  // ...

  return docs;
}
```

---

## ส่วนที่ 8: Validation Rules

### 8.1 Door Validation

```typescript
interface DoorValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateDoor(
  door: DoorDimensions,
  opening: { width: number; height: number },
  doorType: 'full_overlay' | 'half_overlay' | 'inset'
): DoorValidationResult {
  const result: DoorValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // ขนาดขั้นต่ำ/สูงสุด
  if (door.width < 200) {
    result.errors.push('ความกว้างประตูต่ำกว่า 200mm');
    result.isValid = false;
  }
  if (door.width > 600) {
    result.warnings.push('ความกว้างเกิน 600mm อาจต้องใช้บานพับเสริม');
  }

  if (door.height < 300) {
    result.errors.push('ความสูงประตูต่ำกว่า 300mm');
    result.isValid = false;
  }
  if (door.height > 2400) {
    result.errors.push('ความสูงเกิน 2400mm ไม่รองรับ');
    result.isValid = false;
  }

  // สัดส่วน
  const ratio = door.height / door.width;
  if (ratio > 5) {
    result.warnings.push('สัดส่วนความสูง/กว้าง เกิน 5:1 อาจบิดงอ');
  }

  // น้ำหนัก
  const weight = calculateDoorWeight({
    width: door.width,
    height: door.height,
    thickness: 18,
    materialDensity: 700
  });

  if (weight > 16) {
    result.warnings.push(`น้ำหนักประตู ${weight.toFixed(1)}kg อาจต้องใช้บานพับพิเศษ`);
  }

  return result;
}
```

### 8.2 Drawer Validation

```typescript
function validateDrawer(
  drawer: DrawerBoxDimensions,
  opening: CabinetOpening
): DoorValidationResult {
  const result: DoorValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // ตรวจสอบความกว้าง
  if (drawer.totalWidth > opening.width - 25) {
    result.errors.push('ลิ้นชักกว้างเกินไป ไม่เหลือที่ว่างสำหรับราง');
    result.isValid = false;
  }

  // ตรวจสอบความลึก
  if (drawer.slideLength > opening.depth - 30) {
    result.errors.push('รางยาวเกินความลึกตู้');
    result.isValid = false;
  }

  // ตรวจสอบความสูง
  if (drawer.totalHeight > opening.height - 15) {
    result.warnings.push('ลิ้นชักสูงมาก อาจติดขอบบน');
  }

  // ตรวจสอบแผ่นพื้น
  if (drawer.bottom.thickness < 6) {
    result.errors.push('แผ่นพื้นบางเกินไป ต้องอย่างน้อย 6mm');
    result.isValid = false;
  }

  return result;
}
```

---

## ส่วนที่ 9: Blum Wooden Drawer Systems (MOVENTO/TANDEM)

ระบบรางลิ้นชักสำหรับงานไม้ (Wooden Drawer Systems) ของ Blum ครอบคลุมทั้งรุ่น **MOVENTO** (รุ่นท็อป ปรับ 4 มิติ) และ **TANDEM** (รุ่นมาตรฐาน)

### 9.1 Wood Drawer Architect Engine

หลักการ **"Internal Width First"** - คำนวณจากความกว้างภายในลิ้นชักก่อน เพื่อให้มั่นใจว่าลิ้นชักจะใส่รางได้พอดี

```
สูตรหลัก: Internal Drawer Width = Cabinet LW - 42mm
```

นี่คือค่าคงที่ของราง Blum MOVENTO/TANDEM เพื่อให้มีที่ว่างสำหรับราง

### 9.2 Master Hardware Database

```typescript
// src/services/hardware/masterDb.ts

export type SystemType =
  | 'BLUM_MOVENTO'      // Synchronised, 40/60kg, 4D Adjustment
  | 'BLUM_TANDEM_FULL'  // Standard, 30kg, Full Extension
  | 'BLUM_TANDEM_PART'; // Standard, 30kg, Partial Extension

export interface HardwareItem {
  id: string;
  brand: 'HAFELE' | 'BLUM';
  itemNo: string;
  name: string;
  category: 'RUNNER_UNDERMOUNT' | 'LOCKING_DEVICE';
  specs: {
    loadCapacity?: number;    // 30, 40, 60 kg
    nominalLength?: number;   // NL
    extension?: 'FULL' | 'PARTIAL';
    minCabinetDepth?: number; // NL + 3mm
    lockingFamily?: 'MOVENTO' | 'TANDEM';
    hand?: 'LEFT' | 'RIGHT';
  };
}

export const MASTER_DB = {
  runners_wood: {
    // =================================================================
    // MOVENTO (Page 410) - The Professional Choice
    // =================================================================
    // 40kg Full Extension (760H)
    mov_40_450: {
      id: 'mov_760h_450', brand: 'BLUM', itemNo: '760H4500S',
      name: 'MOVENTO 40kg NL450',
      category: 'RUNNER_UNDERMOUNT',
      specs: {
        loadCapacity: 40, nominalLength: 450, extension: 'FULL',
        minCabinetDepth: 453, lockingFamily: 'MOVENTO'
      }
    },
    mov_40_500: {
      id: 'mov_760h_500', brand: 'BLUM', itemNo: '760H5000S',
      name: 'MOVENTO 40kg NL500',
      category: 'RUNNER_UNDERMOUNT',
      specs: {
        loadCapacity: 40, nominalLength: 500, extension: 'FULL',
        minCabinetDepth: 503, lockingFamily: 'MOVENTO'
      }
    },

    // 60kg Heavy Duty (766H)
    mov_60_500: {
      id: 'mov_766h_500', brand: 'BLUM', itemNo: '766H5000S',
      name: 'MOVENTO 60kg NL500',
      category: 'RUNNER_UNDERMOUNT',
      specs: {
        loadCapacity: 60, nominalLength: 500, extension: 'FULL',
        minCabinetDepth: 503, lockingFamily: 'MOVENTO'
      }
    },

    // =================================================================
    // TANDEM (Page 430) - The Standard Choice
    // =================================================================
    // 30kg Full Extension (560H)
    tan_full_500: {
      id: 'tan_560h_500', brand: 'BLUM', itemNo: '560H5000B',
      name: 'TANDEM Full 30kg NL500',
      category: 'RUNNER_UNDERMOUNT',
      specs: {
        loadCapacity: 30, nominalLength: 500, extension: 'FULL',
        minCabinetDepth: 503, lockingFamily: 'TANDEM'
      }
    },

    // 30kg Partial Extension (550H)
    tan_part_500: {
      id: 'tan_550h_500', brand: 'BLUM', itemNo: '550H5000B',
      name: 'TANDEM Part 30kg NL500',
      category: 'RUNNER_UNDERMOUNT',
      specs: {
        loadCapacity: 30, nominalLength: 500, extension: 'PARTIAL',
        minCabinetDepth: 503, lockingFamily: 'TANDEM'
      }
    },
  },

  locking_devices: {
    // =================================================================
    // LOCKING DEVICES (Page 420, 452)
    // =================================================================
    // MOVENTO Series (T51.7601) - ปรับซ้ายขวา/สูงต่ำได้
    lock_mov_L: {
      id: 'lock_mov_l', brand: 'BLUM', itemNo: 'T51.7601 L',
      name: 'Locking Device MOVENTO (L)',
      category: 'LOCKING_DEVICE',
      specs: { hand: 'LEFT' }
    },
    lock_mov_R: {
      id: 'lock_mov_r', brand: 'BLUM', itemNo: 'T51.7601 R',
      name: 'Locking Device MOVENTO (R)',
      category: 'LOCKING_DEVICE',
      specs: { hand: 'RIGHT' }
    },

    // TANDEM Series (T51.1700) - รุ่นมาตรฐาน
    lock_tan_L: {
      id: 'lock_tan_l', brand: 'BLUM', itemNo: 'T51.1700 L',
      name: 'Locking Device TANDEM (L)',
      category: 'LOCKING_DEVICE',
      specs: { hand: 'LEFT' }
    },
    lock_tan_R: {
      id: 'lock_tan_r', brand: 'BLUM', itemNo: 'T51.1700 R',
      name: 'Locking Device TANDEM (R)',
      category: 'LOCKING_DEVICE',
      specs: { hand: 'RIGHT' }
    },
  }
};
```

### 9.3 Wooden Drawer Engine

Engine คำนวณ Cutlist ที่รองรับความหนาไม้หลากหลาย (16/19mm)

```typescript
// src/services/engineering/woodDrawerEngine.ts

export interface WoodDrawerPlan {
  isValid: boolean;
  specs: {
    runner: HardwareItem;
    locks: { left: HardwareItem; right: HardwareItem };
  };
  cutList: {
    sides: { length: number; height: number; qty: number };
    frontBack: { width: number; height: number; qty: number };
    bottom: { width: number; length: number; qty: number };
  };
  drilling: {
    cabinet: { x: number; y: number }[];
    drawerBack: { x: number; y: number; dia: number }[]; // รูเจาะหลัง (Hook)
    drawerBottom: { x: number; y: number }[];            // รูเจาะพื้น (Lock)
  };
  meta: {
    outerWidth: number;    // SKW
    internalWidth: number; // LW_drawer
    drawerLength: number;  // SKL
  };
}

interface Options {
  cabinetLW: number;      // ความกว้างภายในตู้
  cabinetLT: number;      // ความลึกภายในตู้
  drawerHeight: number;   // ความสูงกล่อง
  woodThickness: number;  // 16mm หรือ 19mm
  system: SystemType;
  totalLoad?: number;
}

export const calculateWoodDrawer = (opts: Options): WoodDrawerPlan => {
  const { cabinetLW, cabinetLT, drawerHeight, woodThickness, system } = opts;
  const db = MASTER_DB.runners_wood;
  const dbLocks = MASTER_DB.locking_devices;

  // 1. SELECT RUNNER
  const availableNL = [450, 500];
  const targetNL = availableNL.reverse().find(nl => cabinetLT >= nl + 3) || 500;

  let runner = db.mov_40_500; // Default
  if (system === 'BLUM_MOVENTO') {
    runner = (opts.totalLoad && opts.totalLoad > 40)
      ? db.mov_60_500
      : db.mov_40_500;
  } else if (system === 'BLUM_TANDEM_PART') {
    runner = db.tan_part_500;
  } else {
    runner = db.tan_full_500;
  }

  // 2. SELECT LOCKING DEVICES
  const family = runner.specs.lockingFamily;
  const locks = {
    left: family === 'MOVENTO' ? dbLocks.lock_mov_L : dbLocks.lock_tan_L,
    right: family === 'MOVENTO' ? dbLocks.lock_mov_R : dbLocks.lock_tan_R,
  };

  // 3. DIMENSION CALCULATION (Critical Logic)
  // สูตร: Internal Drawer Width = Cabinet LW - 42mm
  const internalWidth = cabinetLW - 42;

  // คำนวณ Outer Width (SKW) จากความหนาไม้
  const boxOuterWidth = internalWidth + (2 * woodThickness);

  // Drawer Length (SKL) = NL - 10mm
  const boxLength = runner.specs.nominalLength! - 10;

  // 4. CUTLIST GENERATION
  const sides = { length: boxLength, height: drawerHeight, qty: 2 };
  const frontBack = { width: internalWidth, height: drawerHeight, qty: 2 };
  const bottom = { width: internalWidth, length: boxLength, qty: 1 };

  // 5. DRILLING POSITIONS

  // 5.1 Cabinet Runner (System 32)
  const cabDrill = [
    { x: 37, y: 0 },
    { x: 261, y: 0 },
    { x: 293, y: 0 }
  ];

  // 5.2 Drawer Back (Rear Hook) - 7mm from inner side, 11mm from bottom
  const backDrill = [
    { x: 7, y: 11, dia: 6 },
    { x: frontBack.width - 7, y: 11, dia: 6 }
  ];

  // 5.3 Locking Device (Drawer Bottom) - ~10mm from inner edge
  const bottomDrill = [
    { x: 10, y: 10 },
    { x: bottom.width - 10, y: 10 }
  ];

  return {
    isValid: true,
    specs: { runner, locks },
    cutList: { sides, frontBack, bottom },
    drilling: { cabinet: cabDrill, drawerBack: backDrill, drawerBottom: bottomDrill },
    meta: { outerWidth: boxOuterWidth, internalWidth, drawerLength: boxLength }
  };
};
```

### 9.4 CAM Generator for Wood Drawer

```typescript
// src/services/cam/generators/woodDrawerOp.ts

export const generateWoodDrawerOps = (
  cabinetId: string,
  drawerBoxId: string,
  opts: any
): MachineOp[] => {
  const plan = calculateWoodDrawer(opts);
  if (!plan.isValid) return [];

  const ops: MachineOp[] = [];
  const drawerY = opts.drawerY || 50;

  // === 1. CABINET OPS (Runner Mounting) ===
  plan.drilling.cabinet.forEach((hole, i) => {
    ops.push({
      id: `${cabinetId}-run-${i}`,
      type: 'DRILL', face: 'FACE',
      x: hole.x,
      y: drawerY + 37,
      diameter: 5, depth: 13,
      hardwareId: plan.specs.runner.itemNo
    });
  });

  // === 2. DRAWER COMPONENT OPS ===

  // 2.1 Rear Hook (Back Panel) - รู 6mm สำหรับเกี่ยวเดือยราง
  plan.drilling.drawerBack.forEach((hole, i) => {
    ops.push({
      id: `${drawerBoxId}-back-hook-${i}`,
      type: 'DRILL', face: 'FACE',
      x: hole.x, y: hole.y,
      diameter: hole.dia, depth: 10,
      hardwareId: 'BLUM-HOOK'
    });
  });

  // 2.2 Locking Device (Bottom Panel) - รูนำศูนย์สำหรับยึดตัวล็อค
  plan.drilling.drawerBottom.forEach((hole, i) => {
    ops.push({
      id: `${drawerBoxId}-lock-pilot-${i}`,
      type: 'DRILL', face: 'BOTTOM',
      x: hole.x, y: hole.y,
      diameter: 2.5, depth: 10,
      hardwareId: plan.specs.locks.left.itemNo
    });
  });

  return ops;
};
```

### 9.5 MOVENTO vs TANDEM Comparison

| Feature | MOVENTO | TANDEM Full | TANDEM Partial |
|---------|---------|-------------|----------------|
| **Load Capacity** | 40/60 kg | 30 kg | 30 kg |
| **Extension** | Full + Sync | Full | 3/4 |
| **Adjustment** | 4D | 2D | 2D |
| **Locking Device** | T51.7601 | T51.1700 | T51.1700 |
| **Item No. (NL500)** | 760H5000S | 560H5000B | 550H5000B |
| **Min Cabinet Depth** | NL + 3mm | NL + 3mm | NL + 3mm |
| **Price Level** | Premium | Standard | Economy |

### 9.6 Drawer Width Calculation (Wood Box)

```
┌─────────────────────────────────────────────────────────┐
│                    CABINET (LW)                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                  RUNNER GAP                      │   │
│  │  ┌───────────────────────────────────────────┐  │   │
│  │  │              DRAWER BOX                   │  │   │
│  │  │  ┌─────────────────────────────────────┐  │  │   │
│  │  │  │         INTERNAL WIDTH              │  │  │   │
│  │  │  │         (LW - 42mm)                 │  │  │   │
│  │  │  └─────────────────────────────────────┘  │  │   │
│  │  │  ←──────── Wood Thickness ─────────────→  │  │   │
│  │  └───────────────────────────────────────────┘  │   │
│  │  ←──────────── Outer Width (SKW) ────────────→  │   │
│  └─────────────────────────────────────────────────┘   │
│  ←─────────────────── 21mm ───→  ←────── 21mm ───────→ │
└─────────────────────────────────────────────────────────┘

สูตร:
- Internal Width = Cabinet LW - 42mm (ค่าคงที่)
- Outer Width (SKW) = Internal Width + (2 × Wood Thickness)
- Drawer Length (SKL) = Nominal Length (NL) - 10mm
```

### 9.7 Wood Thickness Compatibility

| Wood Thickness | Internal Width | Outer Width | Notes |
|----------------|----------------|-------------|-------|
| 16mm | LW - 42 | LW - 42 + 32 = LW - 10 | Standard |
| 18mm | LW - 42 | LW - 42 + 36 = LW - 6 | Common |
| 19mm | LW - 42 | LW - 42 + 38 = LW - 4 | Premium |

**ตัวอย่าง: Cabinet LW = 500mm, Wood 16mm**
```
Internal Width = 500 - 42 = 458mm
Outer Width = 458 + 32 = 490mm
Gap (each side) = (500 - 490) / 2 = 5mm ✓
```

### 9.8 Drilling Pattern Reference

```
DRAWER BACK PANEL (Face View):
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                                         │
│                                         │
│  ○                                   ○  │ ← Rear Hook Holes
│  ↑                                   ↑  │
│ 7mm                               7mm   │
└─────────────────────────────────────────┘
  ↑ 11mm from bottom

DRAWER BOTTOM (Top View):
┌─────────────────────────────────────────┐
│  ○                                   ○  │ ← Locking Device
│  ↑                                   ↑  │    Pilot Holes
│ 10mm                              10mm  │
│  ←─────────── 10mm from front ─────────→│
└─────────────────────────────────────────┘
```

---

## ส่วนที่ 10: Blum LEGRABOX System (Box Systems)

ระบบลิ้นชักกล่องโลหะ **LEGRABOX** ของ Blum เป็นระบบลิ้นชักแบบ Box System ที่รวมแผ่นข้างและรางเป็นชิ้นเดียว ให้ความสวยงามและติดตั้งง่าย

### 10.1 Drawer Kinetics Engine

Engine อัจฉริยะที่คำนวณขนาด LEGRABOX โดยอัตโนมัติ:

```typescript
// src/services/engineering/legraboxKineticsEngine.ts

/**
 * LEGRABOX Drawer Kinetics Engine
 * Architecture v12.0 - Complete Box System Integration
 *
 * Key Principles:
 * 1. Auto-Sizing: เลือกรหัสความสูงอัตโนมัติตามหน้าบาน
 * 2. Dynamic Configuration: คำนวณแผ่นพื้นและหลังตามรหัสที่เลือก
 * 3. Drilling Matrix: กำหนดตำแหน่งเจาะตรงตามมาตรฐาน Blum
 */

export type HeightCode = 'N' | 'M' | 'K' | 'C' | 'F';
export type LoadClass = 40 | 70;

export interface LegraboxConfig {
  heightCode: HeightCode;
  loadClass: LoadClass;
  nominalLength: number;  // NL: 270, 300, 350, 400, 450, 500, 550, 600
  cabinetLW: number;      // Cabinet Internal Width
}

// LEGRABOX Height Code Specifications (Page 198-411)
export const HEIGHT_SPECS: Record<HeightCode, {
  sideHeight: number;    // ความสูงแผ่นข้าง
  backHeight: number;    // ความสูงแผ่นหลัง
  minFrontHeight: number; // ความสูงหน้าบานต่ำสุด
  maxFrontHeight: number; // ความสูงหน้าบานสูงสุด
}> = {
  N: { sideHeight: 66.5, backHeight: 63, minFrontHeight: 0, maxFrontHeight: 119 },
  M: { sideHeight: 90.5, backHeight: 84, minFrontHeight: 120, maxFrontHeight: 159 },
  K: { sideHeight: 128.5, backHeight: 116, minFrontHeight: 160, maxFrontHeight: 219 },
  C: { sideHeight: 177, backHeight: 167, minFrontHeight: 220, maxFrontHeight: 279 },
  F: { sideHeight: 241, backHeight: 218, minFrontHeight: 280, maxFrontHeight: 999 }
};

/**
 * Auto-select height code based on front panel height
 */
export function autoSelectHeightCode(frontHeight: number): HeightCode {
  if (frontHeight < 120) return 'N';
  if (frontHeight < 160) return 'M';
  if (frontHeight < 220) return 'K';
  if (frontHeight < 280) return 'C';
  return 'F';
}
```

### 10.2 LEGRABOX Hardware Database

```typescript
// Master Hardware Database for LEGRABOX

export const LEGRABOX_RUNNERS = {
  // =================================================================
  // 40kg Class (750.XXXS Series) - Standard
  // =================================================================
  'LGB_40_270': { itemNo: '750.2701S', loadClass: 40, nominalLength: 270 },
  'LGB_40_300': { itemNo: '750.3001S', loadClass: 40, nominalLength: 300 },
  'LGB_40_350': { itemNo: '750.3501S', loadClass: 40, nominalLength: 350 },
  'LGB_40_400': { itemNo: '750.4001S', loadClass: 40, nominalLength: 400 },
  'LGB_40_450': { itemNo: '750.4501S', loadClass: 40, nominalLength: 450 },
  'LGB_40_500': { itemNo: '750.5001S', loadClass: 40, nominalLength: 500 },
  'LGB_40_550': { itemNo: '750.5501S', loadClass: 40, nominalLength: 550 },
  'LGB_40_600': { itemNo: '750.6001S', loadClass: 40, nominalLength: 600 },

  // =================================================================
  // 70kg Class (753.XXXS Series) - Heavy Duty
  // =================================================================
  'LGB_70_270': { itemNo: '753.2701S', loadClass: 70, nominalLength: 270 },
  'LGB_70_300': { itemNo: '753.3001S', loadClass: 70, nominalLength: 300 },
  'LGB_70_350': { itemNo: '753.3501S', loadClass: 70, nominalLength: 350 },
  'LGB_70_400': { itemNo: '753.4001S', loadClass: 70, nominalLength: 400 },
  'LGB_70_450': { itemNo: '753.4501S', loadClass: 70, nominalLength: 450 },
  'LGB_70_500': { itemNo: '753.5001S', loadClass: 70, nominalLength: 500 },
  'LGB_70_550': { itemNo: '753.5501S', loadClass: 70, nominalLength: 550 },
  'LGB_70_600': { itemNo: '753.6001S', loadClass: 70, nominalLength: 600 },
};

export const LEGRABOX_SIDES: Record<HeightCode, {
  itemNoLeft: string;
  itemNoRight: string;
  height: number;
  backHeight: number;
}> = {
  N: { itemNoLeft: 'ZN7.30FIIE-L', itemNoRight: 'ZN7.30FIIE-R', height: 66.5, backHeight: 63 },
  M: { itemNoLeft: 'ZM7.30FIIE-L', itemNoRight: 'ZM7.30FIIE-R', height: 90.5, backHeight: 84 },
  K: { itemNoLeft: 'ZK7.30FIIE-L', itemNoRight: 'ZK7.30FIIE-R', height: 128.5, backHeight: 116 },
  C: { itemNoLeft: 'ZC7.30FIIE-L', itemNoRight: 'ZC7.30FIIE-R', height: 177, backHeight: 167 },
  F: { itemNoLeft: 'ZF7.30FIIE-L', itemNoRight: 'ZF7.30FIIE-R', height: 241, backHeight: 218 },
};

export const LEGRABOX_FRONT_FIXING = {
  // EXPANDO Front Fixing (Standard)
  expando: {
    itemNo: 'ZF7N70E2',
    type: 'EXPANDO',
    adjustmentX: 2,  // ±2mm
    adjustmentY: 2,  // ±2mm
    adjustmentZ: 2,  // ±2mm
  },
  // Screw-on Front Fixing (Economy)
  screwOn: {
    itemNo: 'ZF7N7002',
    type: 'SCREW_ON',
    adjustmentX: 0,
    adjustmentY: 0,
    adjustmentZ: 0,
  }
};
```

### 10.3 Cutlist Calculation Engine

```typescript
// LEGRABOX Cutlist Formulas (Critical!)

export interface LegraboxCutlist {
  bottom: {
    width: number;   // LW - 35mm
    depth: number;   // NL - 10mm
  };
  back: {
    width: number;   // LW - 38mm
    height: number;  // Depends on height code
  };
}

/**
 * Calculate LEGRABOX cutlist dimensions
 *
 * Critical Formulas:
 * - Bottom Width  = Cabinet LW - 35mm
 * - Bottom Depth  = Nominal Length - 10mm
 * - Back Width    = Cabinet LW - 38mm
 * - Back Height   = Based on height code (N/M/K/C/F)
 */
export function calculateLegraboxCutlist(
  cabinetLW: number,
  nominalLength: number,
  heightCode: HeightCode
): LegraboxCutlist {
  const heightSpec = HEIGHT_SPECS[heightCode];

  return {
    bottom: {
      width: cabinetLW - 35,
      depth: nominalLength - 10
    },
    back: {
      width: cabinetLW - 38,
      height: heightSpec.backHeight
    }
  };
}

/**
 * Complete LEGRABOX drawer plan generation
 */
export interface LegraboxDrawerPlan {
  isValid: boolean;
  heightCode: HeightCode;
  runner: {
    itemNo: string;
    loadClass: number;
    nominalLength: number;
  };
  sides: {
    left: string;
    right: string;
    height: number;
  };
  cutlist: LegraboxCutlist;
  frontFix: {
    itemNo: string;
    xPosition: number;  // 15.5mm from inner side
  };
  drilling: {
    cabinet: { x: number; y: number; dia: number; depth: number }[];
  };
}

export function generateLegraboxPlan(
  cabinetLW: number,
  cabinetDepth: number,
  frontHeight: number,
  loadRequired: number = 30
): LegraboxDrawerPlan {
  // 1. Auto-select height code
  const heightCode = autoSelectHeightCode(frontHeight);
  const heightSpec = HEIGHT_SPECS[heightCode];
  const sideSpec = LEGRABOX_SIDES[heightCode];

  // 2. Select runner based on load and cabinet depth
  const loadClass: LoadClass = loadRequired > 40 ? 70 : 40;
  const availableNL = [270, 300, 350, 400, 450, 500, 550, 600];
  const maxNL = cabinetDepth - 3; // min clearance 3mm
  const nominalLength = availableNL.reverse().find(nl => nl <= maxNL) || 270;

  const runnerKey = `LGB_${loadClass}_${nominalLength}`;
  const runner = LEGRABOX_RUNNERS[runnerKey as keyof typeof LEGRABOX_RUNNERS];

  // 3. Calculate cutlist
  const cutlist = calculateLegraboxCutlist(cabinetLW, nominalLength, heightCode);

  // 4. Drilling positions (System 32 compatible)
  const cabinetDrilling = [
    { x: 37, y: 0, dia: 5, depth: 13 },
    { x: 261, y: 0, dia: 5, depth: 13 },
    { x: 389, y: 0, dia: 5, depth: 13 }
  ];

  return {
    isValid: true,
    heightCode,
    runner: {
      itemNo: runner.itemNo,
      loadClass: runner.loadClass,
      nominalLength: runner.nominalLength
    },
    sides: {
      left: sideSpec.itemNoLeft,
      right: sideSpec.itemNoRight,
      height: sideSpec.height
    },
    cutlist,
    frontFix: {
      itemNo: LEGRABOX_FRONT_FIXING.expando.itemNo,
      xPosition: 15.5  // Fixed position from inner side
    },
    drilling: {
      cabinet: cabinetDrilling
    }
  };
}
```

### 10.4 CAM Generator for LEGRABOX

```typescript
// src/services/cam/generators/legraboxOp.ts

export interface LegraboxMachineOp {
  id: string;
  type: 'DRILL' | 'MILL';
  face: 'LEFT' | 'RIGHT' | 'BOTTOM' | 'FACE';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  hardwareRef: string;
}

export function generateLegraboxCabinetOps(
  cabinetId: string,
  drawerY: number,  // Y position of drawer in cabinet
  plan: LegraboxDrawerPlan
): LegraboxMachineOp[] {
  const ops: LegraboxMachineOp[] = [];

  // LEFT SIDE - Runner mounting holes
  plan.drilling.cabinet.forEach((hole, i) => {
    ops.push({
      id: `${cabinetId}-L-run-${i}`,
      type: 'DRILL',
      face: 'LEFT',
      x: hole.x,
      y: drawerY + 37,  // System 32 row
      diameter: hole.dia,
      depth: hole.depth,
      hardwareRef: plan.runner.itemNo
    });
  });

  // RIGHT SIDE - Runner mounting holes (mirror)
  plan.drilling.cabinet.forEach((hole, i) => {
    ops.push({
      id: `${cabinetId}-R-run-${i}`,
      type: 'DRILL',
      face: 'RIGHT',
      x: hole.x,
      y: drawerY + 37,
      diameter: hole.dia,
      depth: hole.depth,
      hardwareRef: plan.runner.itemNo
    });
  });

  return ops;
}

export function generateLegraboxComponentOps(
  drawerId: string,
  plan: LegraboxDrawerPlan
): LegraboxMachineOp[] {
  const ops: LegraboxMachineOp[] = [];

  // BOTTOM PANEL - No drilling required (slides into side rails)

  // BACK PANEL - Optional adjustment holes
  // Position: 15.5mm from each side
  ops.push({
    id: `${drawerId}-back-L`,
    type: 'DRILL',
    face: 'FACE',
    x: 15.5,
    y: plan.cutlist.back.height / 2,
    diameter: 5,
    depth: 10,
    hardwareRef: 'LEGRABOX-BACK-CONN'
  });

  ops.push({
    id: `${drawerId}-back-R`,
    type: 'DRILL',
    face: 'FACE',
    x: plan.cutlist.back.width - 15.5,
    y: plan.cutlist.back.height / 2,
    diameter: 5,
    depth: 10,
    hardwareRef: 'LEGRABOX-BACK-CONN'
  });

  return ops;
}
```

### 10.5 Height Code Auto-Selection Logic

```
FRONT HEIGHT → HEIGHT CODE SELECTION:

┌─────────────────────────────────────────────────────────────────┐
│  Front Height (mm)  │  Code  │  Side Height  │  Back Height    │
├─────────────────────┼────────┼───────────────┼─────────────────┤
│     0 - 119         │   N    │    66.5mm     │     63mm        │
│   120 - 159         │   M    │    90.5mm     │     84mm        │
│   160 - 219         │   K    │   128.5mm     │    116mm        │
│   220 - 279         │   C    │   177mm       │    167mm        │
│   280+              │   F    │   241mm       │    218mm        │
└─────────────────────┴────────┴───────────────┴─────────────────┘

ตัวอย่าง:
- หน้าบาน 140mm → รหัส M (90.5mm side, 84mm back)
- หน้าบาน 200mm → รหัส K (128.5mm side, 116mm back)
- หน้าบาน 300mm → รหัส F (241mm side, 218mm back)
```

### 10.6 LEGRABOX Cutlist Diagram

```
BOTTOM PANEL:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                        BOTTOM                               │
│                                                             │
│                  Width = LW - 35mm                          │
│                  Depth = NL - 10mm                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

BACK PANEL:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         BACK                                │  Height varies
│                                                             │  by code:
│                  Width = LW - 38mm                          │  N=63, M=84,
│                                                             │  K=116, C=167,
│                                                             │  F=218
└─────────────────────────────────────────────────────────────┘

CUTLIST EXAMPLE (Cabinet LW=500mm, NL=450mm, Code K):
┌──────────────────────────────────────────────────────────────┐
│  Part      │  Width    │  Depth/Height  │  Qty  │  Material │
├────────────┼───────────┼────────────────┼───────┼───────────┤
│  Bottom    │  465mm    │  440mm         │   1   │  16mm MDF │
│  Back      │  462mm    │  116mm         │   1   │  16mm MDF │
│  Sides     │  LEGRABOX │  128.5mm       │   2   │  Metal    │
└──────────────────────────────────────────────────────────────┘
```

### 10.7 Cabinet Drilling Pattern (LEGRABOX)

```
CABINET SIDE PANEL (Face View):

           ← Back of Cabinet                Front of Cabinet →
     ┌─────────────────────────────────────────────────────────────┐
     │                                                             │
     │     ●              ●              ●                         │
     │   37mm           261mm          389mm                       │
     │     ↓              ↓              ↓                         │
     │  ┌─────────────────────────────────────────────────────┐   │
     │  │                    DRAWER AREA                       │   │
     │  │                                                      │   │
     │  │                                                      │   │
     │  └─────────────────────────────────────────────────────┘   │
     │                                                             │
     │  ● = Drilling Position (5mm dia, 13mm depth)                │
     │                                                             │
     └─────────────────────────────────────────────────────────────┘

FRONT FIXING BRACKET POSITION:
┌─────────────────────────────────────────┐
│              DRAWER FRONT               │
│                                         │
│  ○ ←── 15.5mm from inner side          │
│                                         │
│                                         │
│                                         │
│                                    ○ ←──│── 15.5mm from inner side
│                                         │
└─────────────────────────────────────────┘
```

### 10.8 Runner Load Class Comparison

| Specification | 40kg Class (750) | 70kg Class (753) |
|---------------|------------------|------------------|
| **Series** | 750.XXXS | 753.XXXS |
| **Load Capacity** | 40 kg | 70 kg |
| **Use Case** | Standard drawers | Heavy/Large drawers |
| **Available NL** | 270-600mm | 270-600mm |
| **Soft Close** | Included | Included |
| **Price Level** | Standard | Premium |

### 10.9 Height Code Comparison

| Code | Side Height | Back Height | Front Range | Best For |
|------|-------------|-------------|-------------|----------|
| **N** | 66.5mm | 63mm | <120mm | Shallow drawers |
| **M** | 90.5mm | 84mm | 120-159mm | Standard drawers |
| **K** | 128.5mm | 116mm | 160-219mm | Medium drawers |
| **C** | 177mm | 167mm | 220-279mm | Deep drawers |
| **F** | 241mm | 218mm | 280mm+ | Extra deep/Pot drawers |

### 10.10 Complete Implementation Example

```typescript
// Example: Generate LEGRABOX drawer for a base cabinet

const cabinetConfig = {
  width: 600,
  depth: 560,
  internalWidth: 564,  // LW = 600 - 18×2
  internalDepth: 540   // After back panel
};

const drawerFrontHeight = 180; // mm

// Generate plan
const plan = generateLegraboxPlan(
  cabinetConfig.internalWidth,
  cabinetConfig.internalDepth,
  drawerFrontHeight,
  35  // Expected load in kg
);

console.log('Generated LEGRABOX Plan:');
console.log('Height Code:', plan.heightCode);           // 'K'
console.log('Runner:', plan.runner.itemNo);              // '750.5001S'
console.log('Bottom:', plan.cutlist.bottom);             // { width: 529, depth: 490 }
console.log('Back:', plan.cutlist.back);                 // { width: 526, height: 116 }
console.log('Sides:', plan.sides.height, 'mm');          // 128.5mm

// Generate CAM operations
const cabinetOps = generateLegraboxCabinetOps('CAB-001', 100, plan);
const componentOps = generateLegraboxComponentOps('DRW-001', plan);

console.log('Cabinet drilling operations:', cabinetOps.length);  // 6
console.log('Component operations:', componentOps.length);       // 2
```

---

## ส่วนที่ 11: Quick Reference Tables

### 11.1 Door Size Matrix

| ช่องเปิด (W×H) | Full Overlay | Half Overlay | Inset |
|----------------|--------------|--------------|-------|
| 300×600 | 336×636 | 318×636 | 296×596 |
| 400×700 | 436×736 | 418×736 | 396×696 |
| 450×800 | 486×836 | 468×836 | 446×796 |
| 500×1000 | 536×1036 | 518×1036 | 496×996 |
| 600×1200 | 636×1236 | 618×1236 | 596×1196 |

*สูตร: Full Overlay = Opening + 36mm (Overlay 18mm × 2)*

### 11.2 Drawer Box Width Matrix

| ช่องเปิด (W) | Side Mount | Undermount | Legrabox |
|--------------|------------|------------|----------|
| 300 | 274 | 274 | 274 |
| 400 | 374 | 374 | 374 |
| 450 | 424 | 424 | 424 |
| 500 | 474 | 474 | 474 |
| 600 | 574 | 574 | 574 |
| 800 | 774 | 774 | 774 |
| 900 | 874 | 874 | 874 |

*สูตร: Box Width = Opening - 26mm (Slide 12.5mm + Clearance 0.5mm × 2)*

### 11.3 Hinge Count by Door Size

| Door Height | Door Weight ≤4kg | ≤8kg | ≤12kg | ≤16kg |
|-------------|------------------|------|-------|-------|
| ≤800mm | 2 hinges | 2 | 3 | 3 |
| ≤1200mm | 3 hinges | 3 | 4 | 4 |
| ≤1600mm | 3 hinges | 4 | 4 | 5 |
| ≤2000mm | 4 hinges | 4 | 5 | 5 |
| ≤2400mm | 4 hinges | 5 | 5 | 6 |

---

## ภาคผนวก: Implementation Example

### Complete Door & Drawer Generation

```typescript
// Example: Generate complete door and drawer specifications for a base cabinet

const baseCabinet = {
  width: 600,
  height: 720,
  depth: 560,
  materialThickness: 18
};

// Calculate internal opening
const opening = {
  width: baseCabinet.width - (baseCabinet.materialThickness * 2),
  height: baseCabinet.height - baseCabinet.materialThickness, // No top panel
  depth: baseCabinet.depth - baseCabinet.materialThickness - 20 // Back + clearance
};

// Generate door
const doorConfig: FullOverlayDoor = {
  type: 'full_overlay',
  overlay: 18,
  reveal: 3
};

const door = calculateFullOverlayDoor(
  opening.width,
  opening.height,
  doorConfig,
  baseCabinet.materialThickness,
  2  // Two doors
);

console.log('Door dimensions:', door);
// { width: 306, height: 756, hingeType: 'full_overlay', hingeCrankAngle: 0 }

// Generate hinge positions
const hingePositions = calculateHingePositions(door.height);
console.log('Hinge positions:', hingePositions);
// [80, 378, 676]  (3 hinges)

// Generate drawer box for lower drawer
const drawerConfig = DRAWER_CONFIGS.standard;
const slideSpec = SLIDE_SPECS.side_mount;

const drawerBox = calculateDrawerBoxDimensions(
  { width: opening.width, depth: opening.depth, height: 150 },
  drawerConfig,
  slideSpec,
  150
);

console.log('Drawer box:', drawerBox);
// { sides: {...}, frontBack: {...}, bottom: {...}, slideLength: 500, ... }

// Validate
const doorValidation = validateDoor(door, opening, 'full_overlay');
const drawerValidation = validateDrawer(drawerBox, opening);

console.log('Door valid:', doorValidation.isValid);
console.log('Drawer valid:', drawerValidation.isValid);
```

---

## บทสรุป (Summary)

เอกสารนี้ครอบคลุมทุกแง่มุมของการออกแบบและคำนวณประตูและลิ้นชักสำหรับตู้เฟอร์นิเจอร์:

1. **Door Types**: Full Overlay, Half Overlay, Inset พร้อมสูตรคำนวณ
2. **Hinge Calculation**: ตำแหน่งและจำนวนบานพับตามน้ำหนักและขนาด
3. **Drawer Systems**: ส่วนประกอบ, ประเภท, และการคำนวณขนาด
4. **Slide Selection**: การเลือกรางตามน้ำหนักและความยาว
5. **DXF Export**: Layer naming และ export functions
6. **Validation**: ตรวจสอบความถูกต้องของขนาด
7. **Blum Wooden Drawer Systems**: MOVENTO/TANDEM พร้อม Wood Drawer Architect Engine
8. **Hardware Database**: Master DB สำหรับ Runners และ Locking Devices
9. **LEGRABOX Box System**: ระบบลิ้นชักกล่องโลหะ พร้อม Drawer Kinetics Engine และ Auto Height Selection
10. **CAM Integration**: G-code generation สำหรับ drilling patterns

**Reference Documents:**
- [Hardware & Drilling Specifications](./hardware-drilling-specifications.md)
- [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md)
- [Kerf Bending Algorithms](./kerf-bending-algorithms.md)
