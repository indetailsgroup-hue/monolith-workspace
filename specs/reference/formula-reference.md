# Formula Reference
# สูตรคำนวณอ้างอิง

**Version:** 1.1.0
**Last Updated:** 2026-01-12
**Status:** Single Source of Truth
**Scope:** All Calculation Formulas

---

## บทนำ (Introduction)

เอกสารนี้รวบรวม **สูตรคำนวณทั้งหมด** ที่ใช้ในระบบ MONOLITH Designer เพื่อแก้ปัญหา:
- สูตรขัดแย้งกันในหลายเอกสาร (เช่น Drawer Width: 42mm vs 26mm)
- ไม่ชัดเจนว่าสูตรไหนใช้กับ Hardware ไหน
- หน่วยและสัญลักษณ์ไม่สอดคล้องกัน

---

## ส่วนที่ 1: Drawer Width Calculations (แก้ไขความขัดแย้ง)

### 1.1 ปัญหาที่พบ

```
❌ CONFLICT DETECTED:

Document 1 (door-drawer-complete-guide.md):
  boxWidth = cabinetLW - 42mm  (for MOVENTO/TANDEM)

Document 2 (parametric-cabinet-calculations.md):
  boxWidth = opening - 26mm    (generic formula)

Difference: 16mm!
```

### 1.2 คำอธิบายและการแก้ไข

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DRAWER WIDTH FORMULA CLARIFICATION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠️ IMPORTANT: ทั้งสองสูตรถูกต้อง แต่ใช้กับ Hardware คนละประเภท!             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ FORMULA A: boxWidth = cabinetLW - 42mm                              │    │
│  │                                                                     │    │
│  │ ใช้กับ: Blum Wooden Drawer Systems                                  │    │
│  │   - MOVENTO                                                         │    │
│  │   - TANDEM                                                          │    │
│  │                                                                     │    │
│  │ ที่มา: 42mm = Runner 12.5mm × 2 + Clearance 8.5mm × 2              │    │
│  │        (ความหนาราง + ช่องว่างเพิ่มเติมสำหรับ locking device)        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ FORMULA B: boxWidth = opening - 26mm                                │    │
│  │                                                                     │    │
│  │ ใช้กับ: Standard Side Mount / Generic Runners                       │    │
│  │   - Hettich Quadro                                                  │    │
│  │   - Generic ball bearing slides                                     │    │
│  │                                                                     │    │
│  │ ที่มา: 26mm = (Runner 12.5mm + Clearance 0.5mm) × 2                 │    │
│  │        (ความหนาราง + ช่องว่างมาตรฐาน)                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ FORMULA C: (LEGRABOX - Metal Box System)                            │    │
│  │                                                                     │    │
│  │ bottomWidth = cabinetLW - 35mm                                      │    │
│  │ backWidth = cabinetLW - 38mm                                        │    │
│  │                                                                     │    │
│  │ หมายเหตุ: LEGRABOX ไม่ใช้ไม้ทำแผ่นข้าง (ใช้โลหะ)                    │    │
│  │           สูตรนี้คำนวณเฉพาะแผ่นพื้นและแผ่นหลัง                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Master Formula Table

| Drawer System | Formula | Deduction | Applies To |
|---------------|---------|-----------|------------|
| **Blum MOVENTO** | `LW - 42` | 42mm | Wooden drawer box width |
| **Blum TANDEM** | `LW - 42` | 42mm | Wooden drawer box width |
| **Blum LEGRABOX Bottom** | `LW - 35` | 35mm | Metal box bottom panel |
| **Blum LEGRABOX Back** | `LW - 38` | 38mm | Metal box back panel |
| **Standard Side Mount** | `Opening - 26` | 26mm | Generic wooden drawer |
| **Undermount Generic** | `Opening - 26` | 26mm | Generic undermount |

### 1.4 Implementation Code

```typescript
// specs/reference/formulas/drawer-width.ts

type DrawerSystem = 'MOVENTO' | 'TANDEM' | 'LEGRABOX' | 'STANDARD_SIDE' | 'UNDERMOUNT';

interface DrawerWidthResult {
  boxWidth: number;
  bottomWidth?: number;  // For LEGRABOX
  backWidth?: number;    // For LEGRABOX
  deduction: number;
  formula: string;
}

export function calculateDrawerWidth(
  cabinetLW: number,
  system: DrawerSystem
): DrawerWidthResult {
  switch (system) {
    case 'MOVENTO':
    case 'TANDEM':
      return {
        boxWidth: cabinetLW - 42,
        deduction: 42,
        formula: 'LW - 42 (Blum Wooden Drawer)'
      };

    case 'LEGRABOX':
      return {
        boxWidth: 0,  // No wooden box
        bottomWidth: cabinetLW - 35,
        backWidth: cabinetLW - 38,
        deduction: 35,  // Primary deduction
        formula: 'LW - 35 (Bottom), LW - 38 (Back)'
      };

    case 'STANDARD_SIDE':
    case 'UNDERMOUNT':
    default:
      return {
        boxWidth: cabinetLW - 26,
        deduction: 26,
        formula: 'LW - 26 (Standard)'
      };
  }
}
```

---

## ส่วนที่ 2: Kerf Width Clarification

### 2.1 ปัญหาที่พบ

```
❌ CONFLICT DETECTED:

kerf-bending-algorithms.md:
  k = 3.0-3.5mm (Kerf Width)

cut-optimization-algorithms.md:
  sawKerf = 3-4mm (Panel Saw)
  sawKerf = 6-10mm (CNC Router)
```

### 2.2 คำอธิบายและการแก้ไข

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KERF WIDTH CLARIFICATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠️ ค่า Kerf Width ต่างกันเพราะเป็นการใช้งานคนละประเภท!                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ KERF BENDING (สำหรับดัดโค้ง):                                       │    │
│  │                                                                     │    │
│  │   k = 3.0 - 3.5mm                                                   │    │
│  │                                                                     │    │
│  │   ใช้ใบเลื่อยบาง (Thin Kerf Blade) เพื่อ:                           │    │
│  │   - สร้างร่องที่แคบ ดัดได้โค้งมากกว่า                               │    │
│  │   - ลด waste material                                              │    │
│  │   - Tool diameter: ~3.0mm                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PANEL SAW CUTTING (สำหรับตัดแยกชิ้น):                                │    │
│  │                                                                     │    │
│  │   sawKerf = 3 - 4mm                                                 │    │
│  │                                                                     │    │
│  │   ใช้ใบเลื่อยมาตรฐาน:                                               │    │
│  │   - Scoring blade: 3.0mm                                           │    │
│  │   - Main blade: 3.2-4.0mm                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ CNC ROUTER CUTTING:                                                 │    │
│  │                                                                     │    │
│  │   routerKerf = 6 - 10mm                                             │    │
│  │                                                                     │    │
│  │   ใช้ Router Bit ขนาดใหญ่กว่า:                                      │    │
│  │   - Standard bit: 6mm (1/4")                                       │    │
│  │   - Large bit: 8mm, 10mm, 12mm                                     │    │
│  │   - Compression bit: 6-10mm                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Kerf Width Summary Table

| Tool/Operation | Kerf Width | Use Case |
|----------------|------------|----------|
| **Thin Kerf Blade** | 3.0-3.5mm | Kerf bending |
| **Panel Saw** | 3.0-4.0mm | Sheet cutting |
| **CNC Router 6mm** | 6mm | Contour cutting |
| **CNC Router 8mm** | 8mm | General milling |
| **CNC Router 10mm** | 10mm | Heavy milling |
| **CNC Router 12mm** | 12mm | Large contours |

---

## ส่วนที่ 3: Cut Size Formula (Edge Deduction)

### 3.1 Master Formula

```typescript
// Cut Size = Finish Size - Edge Thicknesses
// ⚠️ Pre-milling is NOT added to cut size (it's a machine operation only)

cutWidth = finishWidth - leftEdgeThickness - rightEdgeThickness
cutHeight = finishHeight - topEdgeThickness - bottomEdgeThickness
```

### 3.2 Implementation

```typescript
// src/core/types/Cabinet.ts
export function calculateCutSize(
  finishSize: number,
  edge1: number,
  edge2: number,
  _preMillPerSide: number = 0.5  // Reference only, not used in calculation
): number {
  // Cut Size = Finish Size - Edge Thicknesses
  // This is the panel size AFTER pre-milling, ready for edge banding
  return finishSize - (edge1 + edge2);
}
```

### 3.3 Examples

| Finish Size | Edges | Cut Size |
|-------------|-------|----------|
| 600mm | 1.2mm × 2 (both sides) | 600 - 1.2 - 1.2 = **597.6mm** |
| 1000mm | 1.2mm × 2 (top + bottom) | 1000 - 1.2 - 1.2 = **997.6mm** |
| 600mm | 1.2mm × 1 (front only) | 600 - 1.2 - 0 = **598.8mm** |
| 500mm | 2.0mm × 2 (ABS thick) | 500 - 2.0 - 2.0 = **496mm** |

### 3.4 Important Notes

- **Pre-milling** (0.5-1.0mm) is a machine operation during edge banding
- Pre-milling is stored in Manufacturing Parameters for reference only
- It does **NOT** affect the Cut Size calculation
- Cut Size is the dimension **after** pre-milling, ready for edge banding

---

## ส่วนที่ 4: Shelf Setback Formulas

### 4.1 Base Formula

```typescript
// Shelf Depth Calculation
D_shelf = D_internal - S_front - S_rear

// Where:
// D_shelf    = Shelf depth (mm)
// D_internal = Internal cabinet depth (mm)
// S_front    = Front setback (mm)
// S_rear     = Rear setback (mm)
```

### 4.2 Setback Values by Cabinet Type

| Cabinet Type | S_front | S_rear | Notes |
|--------------|---------|--------|-------|
| **Standard Base** | 20-25mm | 10mm | Normal shelving |
| **Standard Wall** | 20-25mm | 10mm | Normal shelving |
| **With LED Strip** | 20-25mm | 20mm | Extra space for wiring |
| **Appliance Cabinet** | 30mm | 50-100mm | Ventilation clearance |
| **Open Shelf (no door)** | 0mm | 10mm | Flush with front |
| **Glass Door** | 5mm | 10mm | Minimal protrusion |

### 4.3 Hinge Clearance Formula

```typescript
// Front setback must account for hinge protrusion
S_front = hingeProtrusion + clearance

// Standard values:
// hingeProtrusion = 20mm (Blum Clip Top)
// clearance = 3-5mm

// Result: S_front = 23-25mm (standard)
```

---

## ส่วนที่ 4: Door Size Formulas

### 4.1 Overlay Types

```typescript
// Full Overlay
W_door = W_opening + (overlay × 2)
H_door = H_opening + (overlay × 2)
// overlay = 18mm (standard)

// Half Overlay
W_door = W_opening + (overlay × 2)
H_door = H_opening + (overlay × 2)
// overlay = 9mm

// Inset
W_door = W_opening - (gap × 2)
H_door = H_opening - (gap × 2)
// gap = 2mm
// Note: tolerance = ±0.5mm (critical!)
```

### 4.2 Quick Reference

| Opening | Full Overlay | Half Overlay | Inset |
|---------|--------------|--------------|-------|
| 300×600 | 336×636 | 318×618 | 296×596 |
| 400×700 | 436×736 | 418×718 | 396×696 |
| 450×800 | 486×836 | 468×818 | 446×796 |
| 500×1000 | 536×1036 | 518×1018 | 496×996 |
| 600×1200 | 636×1236 | 618×1218 | 596×1196 |

---

## ส่วนที่ 5: Hinge Position Formulas

### 5.1 Standard Spacing

```typescript
// Top hinge from top edge
Y_top = 80mm  // Range: 80-100mm

// Bottom hinge from bottom edge
Y_bottom = 80mm  // Range: 80-100mm

// Middle hinge(s) - evenly distributed
Y_middle = (H_door - Y_top - Y_bottom) / (hingeCount - 1)

// Minimum spacing between hinges
minSpacing = 300mm

// Maximum spacing between hinges
maxSpacing = 500mm
```

### 5.2 Hinge Count by Door Size

| Door Height | Weight ≤4kg | ≤8kg | ≤12kg | ≤16kg |
|-------------|-------------|------|-------|-------|
| ≤800mm | 2 | 2 | 3 | 3 |
| ≤1200mm | 3 | 3 | 4 | 4 |
| ≤1600mm | 3 | 4 | 4 | 5 |
| ≤2000mm | 4 | 4 | 5 | 5 |
| ≤2400mm | 4 | 5 | 5 | 6 |

### 5.3 Hinge Boring Position

```typescript
// Distance from door edge to hinge cup center
X_hinge = 21.5mm  // For 18mm panel thickness

// Formula: X_hinge = (panelThickness / 2) + 12.5mm
// Example: (18 / 2) + 12.5 = 21.5mm
```

---

## ส่วนที่ 6: Minifix Joint Formulas

### 6.1 Sleeve Height Formula

```typescript
// Sleeve height depends on bolt shaft length (B)
sleeveHeight = B - 10

// Examples:
// B24 variant: sleeveH = 24 - 10 = 14mm
// B34 variant: sleeveH = 34 - 10 = 24mm
```

### 6.2 Joint Count Formula

```typescript
// Number of joints based on panel length
const CENTER_THRESHOLD = 400;

if (panelLength <= CENTER_THRESHOLD) {
  jointCount = 2;  // Left + Right only
} else {
  jointCount = 3;  // Left + Center + Right
}
```

### 6.3 Dowel Offset

```typescript
// System 32 dowel placement
dowelOffset = 32mm  // From Minifix bolt center

// Pattern:
// Single dowel: offsetX = +32mm (right side)
// Pair: offsetX = -32mm (left) and +32mm (right)
```

---

## ส่วนที่ 7: LEGRABOX Cutlist Formulas

### 7.1 Bottom Panel

```typescript
bottomWidth = cabinetLW - 35
bottomDepth = nominalLength - 10

// Where:
// cabinetLW = Cabinet internal width (mm)
// nominalLength = Runner length (270, 300, ..., 600mm)
```

### 7.2 Back Panel

```typescript
backWidth = cabinetLW - 38
backHeight = HEIGHT_SPECS[heightCode].backHeight

// Height by code:
// N: 63mm, M: 84mm, K: 116mm, C: 167mm, F: 218mm
```

### 7.3 Height Code Selection

```typescript
function autoSelectHeightCode(frontHeight: number): HeightCode {
  if (frontHeight < 120) return 'N';
  if (frontHeight < 160) return 'M';
  if (frontHeight < 220) return 'K';
  if (frontHeight < 280) return 'C';
  return 'F';
}
```

---

## ส่วนที่ 8: Cost Calculation Formulas

### 8.1 Panel Cost

```typescript
// Area in m²
areaM2 = (width / 1000) × (depth / 1000)

// Core material cost
coreCost = areaM2 × pricePerSqm

// Surface cost (if HPL/Veneer)
surfaceCost = areaM2 × surfacePricePerSqm × 2  // Both sides

// Edge banding cost
edgeCost = (edgeLength / 1000) × pricePerMeter

// Total
totalCost = coreCost + surfaceCost + edgeCost + laborCost
```

### 8.2 Material Prices (Reference)

| Material | Price (THB/m²) | Notes |
|----------|----------------|-------|
| **PB 18mm** | 450 | Particleboard |
| **MDF 18mm** | 550 | Medium density |
| **Plywood 18mm** | 900 | Birch |
| **HPL Surface** | 350 | Per side |
| **Veneer** | 500-1500 | Varies by species |

| Edge Banding | Price (THB/m) |
|--------------|---------------|
| **PVC 0.5mm** | 8 |
| **PVC 1.0mm** | 12 |
| **ABS 2.0mm** | 25 |
| **Acrylic 3mm** | 80 |

---

## ส่วนที่ 9: Tolerance Matrix

### 9.1 Manufacturing Tolerances

| Dimension Type | Tolerance | Notes |
|----------------|-----------|-------|
| **Panel cutting** | ±0.5mm | CNC/Panel saw |
| **Hinge boring** | ±0.2mm | Critical for alignment |
| **Dowel boring** | ±0.2mm | For proper fit |
| **Minifix boring** | ±0.2mm | Critical for locking |
| **Edge banding** | ±0.3mm | After trimming |
| **Inset door gap** | ±0.5mm | Critical - requires precision |
| **Overlay door** | ±1.0mm | Less critical |
| **Drawer width** | ±0.5mm | For smooth operation |

---

## ส่วนที่ 10: Variable Naming Conventions

### 10.1 Standard Prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| `W_` | Width | `W_door`, `W_opening` |
| `H_` | Height | `H_door`, `H_cabinet` |
| `D_` | Depth | `D_shelf`, `D_internal` |
| `T_` | Thickness | `T_panel`, `T_edge` |
| `S_` | Setback/Spacing | `S_front`, `S_rear` |
| `Y_` | Y-position | `Y_hinge`, `Y_top` |
| `X_` | X-position | `X_boring`, `X_center` |

### 10.2 Standard Suffixes

| Suffix | Meaning | Example |
|--------|---------|---------|
| `_min` | Minimum | `spacing_min` |
| `_max` | Maximum | `spacing_max` |
| `_internal` | Internal dimension | `D_internal` |
| `_external` | External dimension | `W_external` |
| `_total` | Total/Sum | `cost_total` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-12 | Added Cut Size formula section (Section 3); Clarified pre-milling is NOT added to cut size |
| 1.0.0 | 2026-01-10 | Initial consolidation, resolved drawer width conflict |

---

**Cross-References:**
- [Master Hardware Database](./master-hardware-database.md) - Hardware specifications
- [Hardware Drilling Specifications](../manufacturing/hardware-drilling-specifications.md)
- [Door & Drawer Complete Guide](../manufacturing/door-drawer-complete-guide.md)
- [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md)
