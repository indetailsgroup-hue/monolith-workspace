# Master Hardware Database
# ฐานข้อมูลอุปกรณ์หลัก

**Version:** 1.0.0
**Last Updated:** 2026-01-10
**Status:** Single Source of Truth
**Scope:** All Cabinet Hardware Components

---

## บทนำ (Introduction)

เอกสารนี้เป็น **Single Source of Truth** สำหรับข้อมูลอุปกรณ์ทั้งหมดในระบบ MONOLITH Designer เพื่อแก้ปัญหา:
- Hardware Database ซ้ำซ้อนในหลายเอกสาร
- ข้อมูลไม่ sync กัน
- ไม่มี Häfele cross-reference

**หลักการ:** เอกสารอื่นทุกฉบับต้อง **import** จากที่นี่ ห้ามสร้าง Hardware Database ซ้ำ

---

## ส่วนที่ 1: Blum Drawer Systems

### 1.1 MOVENTO Runners (Wooden Drawers)

```typescript
// specs/reference/hardware/blum-movento.ts

export const BLUM_MOVENTO_RUNNERS = {
  // =================================================================
  // 40kg Class (760H Series) - Standard Load
  // =================================================================
  'MOV_40_270': {
    itemNo: '760H2700S',
    loadClass: 40,
    nominalLength: 270,
    extensionType: 'FULL',
    softClose: true,
    tipOn: false
  },
  'MOV_40_300': { itemNo: '760H3000S', loadClass: 40, nominalLength: 300, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_350': { itemNo: '760H3500S', loadClass: 40, nominalLength: 350, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_400': { itemNo: '760H4000S', loadClass: 40, nominalLength: 400, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_450': { itemNo: '760H4500S', loadClass: 40, nominalLength: 450, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_500': { itemNo: '760H5000S', loadClass: 40, nominalLength: 500, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_550': { itemNo: '760H5500S', loadClass: 40, nominalLength: 550, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_40_600': { itemNo: '760H6000S', loadClass: 40, nominalLength: 600, extensionType: 'FULL', softClose: true, tipOn: false },

  // =================================================================
  // 60kg Class (766H Series) - Heavy Duty
  // =================================================================
  'MOV_60_270': { itemNo: '766H2700S', loadClass: 60, nominalLength: 270, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_300': { itemNo: '766H3000S', loadClass: 60, nominalLength: 300, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_350': { itemNo: '766H3500S', loadClass: 60, nominalLength: 350, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_400': { itemNo: '766H4000S', loadClass: 60, nominalLength: 400, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_450': { itemNo: '766H4500S', loadClass: 60, nominalLength: 450, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_500': { itemNo: '766H5000S', loadClass: 60, nominalLength: 500, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_550': { itemNo: '766H5500S', loadClass: 60, nominalLength: 550, extensionType: 'FULL', softClose: true, tipOn: false },
  'MOV_60_600': { itemNo: '766H6000S', loadClass: 60, nominalLength: 600, extensionType: 'FULL', softClose: true, tipOn: false },
} as const;

export const BLUM_MOVENTO_LOCKING = {
  standard: {
    itemNo: 'T51.7601',
    name: 'MOVENTO Locking Device',
    type: 'FRONT_LOCK',
    material: 'Steel/Plastic',
    finish: 'Nickel'
  }
} as const;
```

### 1.2 TANDEM Runners (Wooden Drawers)

```typescript
// specs/reference/hardware/blum-tandem.ts

export const BLUM_TANDEM_RUNNERS = {
  // =================================================================
  // Full Extension (560H Series)
  // =================================================================
  'TAN_FULL_30_270': { itemNo: '560H2700B', loadClass: 30, nominalLength: 270, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_300': { itemNo: '560H3000B', loadClass: 30, nominalLength: 300, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_350': { itemNo: '560H3500B', loadClass: 30, nominalLength: 350, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_400': { itemNo: '560H4000B', loadClass: 30, nominalLength: 400, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_450': { itemNo: '560H4500B', loadClass: 30, nominalLength: 450, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_500': { itemNo: '560H5000B', loadClass: 30, nominalLength: 500, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_550': { itemNo: '560H5500B', loadClass: 30, nominalLength: 550, extensionType: 'FULL', softClose: true },
  'TAN_FULL_30_600': { itemNo: '560H6000B', loadClass: 30, nominalLength: 600, extensionType: 'FULL', softClose: true },

  // =================================================================
  // Partial Extension (550H Series) - 3/4 Extension
  // =================================================================
  'TAN_PART_30_270': { itemNo: '550H2700B', loadClass: 30, nominalLength: 270, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_300': { itemNo: '550H3000B', loadClass: 30, nominalLength: 300, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_350': { itemNo: '550H3500B', loadClass: 30, nominalLength: 350, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_400': { itemNo: '550H4000B', loadClass: 30, nominalLength: 400, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_450': { itemNo: '550H4500B', loadClass: 30, nominalLength: 450, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_500': { itemNo: '550H5000B', loadClass: 30, nominalLength: 500, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_550': { itemNo: '550H5500B', loadClass: 30, nominalLength: 550, extensionType: 'PARTIAL', softClose: true },
  'TAN_PART_30_600': { itemNo: '550H6000B', loadClass: 30, nominalLength: 600, extensionType: 'PARTIAL', softClose: true },
} as const;

export const BLUM_TANDEM_LOCKING = {
  standard: {
    itemNo: 'T51.1700',
    name: 'TANDEM Locking Device',
    type: 'FRONT_LOCK',
    material: 'Steel/Plastic',
    finish: 'Nickel'
  }
} as const;
```

### 1.3 LEGRABOX Runners (Metal Box System)

```typescript
// specs/reference/hardware/blum-legrabox.ts

export type LegraboxHeightCode = 'N' | 'M' | 'K' | 'C' | 'F';

export const BLUM_LEGRABOX_RUNNERS = {
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
} as const;

export const BLUM_LEGRABOX_SIDES: Record<LegraboxHeightCode, {
  itemNoLeft: string;
  itemNoRight: string;
  height: number;
  backHeight: number;
  minFrontHeight: number;
  maxFrontHeight: number;
}> = {
  N: { itemNoLeft: 'ZN7.30FIIE-L', itemNoRight: 'ZN7.30FIIE-R', height: 66.5, backHeight: 63, minFrontHeight: 0, maxFrontHeight: 119 },
  M: { itemNoLeft: 'ZM7.30FIIE-L', itemNoRight: 'ZM7.30FIIE-R', height: 90.5, backHeight: 84, minFrontHeight: 120, maxFrontHeight: 159 },
  K: { itemNoLeft: 'ZK7.30FIIE-L', itemNoRight: 'ZK7.30FIIE-R', height: 128.5, backHeight: 116, minFrontHeight: 160, maxFrontHeight: 219 },
  C: { itemNoLeft: 'ZC7.30FIIE-L', itemNoRight: 'ZC7.30FIIE-R', height: 177, backHeight: 167, minFrontHeight: 220, maxFrontHeight: 279 },
  F: { itemNoLeft: 'ZF7.30FIIE-L', itemNoRight: 'ZF7.30FIIE-R', height: 241, backHeight: 218, minFrontHeight: 280, maxFrontHeight: 999 },
};

export const BLUM_LEGRABOX_FRONT_FIXING = {
  expando: {
    itemNo: 'ZF7N70E2',
    type: 'EXPANDO',
    adjustmentX: 2,
    adjustmentY: 2,
    adjustmentZ: 2,
  },
  screwOn: {
    itemNo: 'ZF7N7002',
    type: 'SCREW_ON',
    adjustmentX: 0,
    adjustmentY: 0,
    adjustmentZ: 0,
  }
} as const;
```

### 1.4 Blum Hinges

```typescript
// specs/reference/hardware/blum-hinges.ts

export const BLUM_CLIP_TOP_HINGES = {
  // =================================================================
  // Standard Clip Top (110°)
  // =================================================================
  'CLIP_110_FULL': {
    itemNo: '71T3550',
    angle: 110,
    overlay: 'FULL',
    overlayMm: 18,
    boring: { diameter: 35, depth: 11.5 },
    screwSpacing: 45
  },
  'CLIP_110_HALF': {
    itemNo: '71T3650',
    angle: 110,
    overlay: 'HALF',
    overlayMm: 9,
    boring: { diameter: 35, depth: 11.5 },
    screwSpacing: 45
  },
  'CLIP_110_INSET': {
    itemNo: '71T3750',
    angle: 110,
    overlay: 'INSET',
    overlayMm: -3,
    boring: { diameter: 35, depth: 11.5 },
    screwSpacing: 45
  },

  // =================================================================
  // Wide Angle Clip Top (155°)
  // =================================================================
  'CLIP_155_FULL': {
    itemNo: '71T6550',
    angle: 155,
    overlay: 'FULL',
    overlayMm: 18,
    boring: { diameter: 35, depth: 11.5 },
    screwSpacing: 45
  },
  'CLIP_155_HALF': {
    itemNo: '71T6650',
    angle: 155,
    overlay: 'HALF',
    overlayMm: 9,
    boring: { diameter: 35, depth: 11.5 },
    screwSpacing: 45
  },
} as const;

export const BLUM_MOUNTING_PLATES = {
  'PLATE_0MM': { itemNo: '175H3100', height: 0, type: 'CLIP' },
  'PLATE_3MM': { itemNo: '175H3130', height: 3, type: 'CLIP' },
  'PLATE_6MM': { itemNo: '175H3160', height: 6, type: 'CLIP' },
  'PLATE_9MM': { itemNo: '175H3190', height: 9, type: 'CLIP' },
} as const;
```

---

## ส่วนที่ 2: Häfele Cabinet Fittings

### 2.1 Minifix Connectors

```typescript
// specs/reference/hardware/hafele-minifix.ts

export const HAFELE_MINIFIX = {
  // =================================================================
  // Minifix 15 System (Standard)
  // =================================================================
  'MINIFIX_15_CAM': {
    itemNo: '262.26.034',
    name: 'Minifix 15 Cam Housing',
    diameter: 15,
    depth: 12.7,
    boring: { diameter: 15, depth: 12.7 },
    material: 'Zinc alloy'
  },

  // =================================================================
  // S200 Connecting Bolts
  // =================================================================
  'S200_BOLT_24': {
    itemNo: '262.27.670',
    name: 'Connecting Bolt S200',
    shaftLength: 24,
    threadDiameter: 6,
    threadLength: 11,
    sleeveHeight: 14,  // B - 10 = 24 - 10
    material: 'Steel zinc-plated'
  },
  'S200_BOLT_34': {
    itemNo: '262.28.670',
    name: 'Connecting Bolt S200',
    shaftLength: 34,
    threadDiameter: 6,
    threadLength: 11,
    sleeveHeight: 24,  // B - 10 = 34 - 10
    material: 'Steel zinc-plated'
  },

  // =================================================================
  // Sleeves
  // =================================================================
  'SLEEVE_10X14': {
    itemNo: '262.29.014',
    name: 'Sleeve for S200',
    outerDiameter: 10,
    innerDiameter: 7,
    height: 14,
    forBolt: 'S200_BOLT_24'
  },
  'SLEEVE_10X24': {
    itemNo: '262.29.024',
    name: 'Sleeve for S200',
    outerDiameter: 10,
    innerDiameter: 7,
    height: 24,
    forBolt: 'S200_BOLT_34'
  },
} as const;

// Häfele catalog reference: Pages 1-17
```

### 2.2 Wood Dowels

```typescript
// specs/reference/hardware/hafele-dowels.ts

export const HAFELE_WOOD_DOWELS = {
  // =================================================================
  // Fluted Dowels (Standard)
  // =================================================================
  'DOWEL_8X30_FLUTED': {
    itemNo: '267.83.230',
    name: 'Wood Dowel Fluted',
    diameter: 8,
    length: 30,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: false
  },
  'DOWEL_8X35_FLUTED': {
    itemNo: '267.83.235',
    name: 'Wood Dowel Fluted',
    diameter: 8,
    length: 35,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: false
  },
  'DOWEL_8X40_FLUTED': {
    itemNo: '267.83.240',
    name: 'Wood Dowel Fluted',
    diameter: 8,
    length: 40,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: false
  },
  'DOWEL_10X40_FLUTED': {
    itemNo: '267.83.340',
    name: 'Wood Dowel Fluted',
    diameter: 10,
    length: 40,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: false
  },

  // =================================================================
  // Pre-Glued Dowels
  // =================================================================
  'DOWEL_8X30_PREGLUED': {
    itemNo: '267.84.230',
    name: 'Wood Dowel Pre-Glued',
    diameter: 8,
    length: 30,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: true
  },
  'DOWEL_8X35_PREGLUED': {
    itemNo: '267.84.235',
    name: 'Wood Dowel Pre-Glued',
    diameter: 8,
    length: 35,
    type: 'FLUTED',
    material: 'Beech',
    preGlued: true
  },

  // =================================================================
  // Plastic Dowels
  // =================================================================
  'DOWEL_8X30_PLASTIC': {
    itemNo: '267.85.230',
    name: 'Plastic Dowel',
    diameter: 8,
    length: 30,
    type: 'RIBBED',
    material: 'Plastic',
    preGlued: false
  },
} as const;

// Häfele catalog reference: 267-84-239
```

### 2.3 Häfele Hinges (Metalla 510)

```typescript
// specs/reference/hardware/hafele-hinges.ts

export const HAFELE_METALLA_510 = {
  // =================================================================
  // Metalla 510 Standard (110°)
  // =================================================================
  'METALLA_110_FULL': {
    itemNo: '311.01.500',
    angle: 110,
    overlay: 'FULL',
    overlayMm: 18,
    boring: { diameter: 35, depth: 11.5 },
    softClose: false
  },
  'METALLA_110_HALF': {
    itemNo: '311.01.501',
    angle: 110,
    overlay: 'HALF',
    overlayMm: 9,
    boring: { diameter: 35, depth: 11.5 },
    softClose: false
  },
  'METALLA_110_INSET': {
    itemNo: '311.01.502',
    angle: 110,
    overlay: 'INSET',
    overlayMm: -3,
    boring: { diameter: 35, depth: 11.5 },
    softClose: false
  },

  // =================================================================
  // Metalla 510 with Soft Close
  // =================================================================
  'METALLA_110_FULL_SC': {
    itemNo: '311.02.500',
    angle: 110,
    overlay: 'FULL',
    overlayMm: 18,
    boring: { diameter: 35, depth: 11.5 },
    softClose: true
  },
  'METALLA_110_HALF_SC': {
    itemNo: '311.02.501',
    angle: 110,
    overlay: 'HALF',
    overlayMm: 9,
    boring: { diameter: 35, depth: 11.5 },
    softClose: true
  },
} as const;

// Häfele Selection 15, 16, 17
```

---

## ส่วนที่ 3: Hardware Equivalence Table

### 3.1 Blum ↔ Häfele Cross-Reference

```typescript
// specs/reference/hardware/equivalence-table.ts

/**
 * HARDWARE EQUIVALENCE TABLE
 *
 * Maps Blum products to Häfele equivalents for interchangeability
 * Note: Dimensions may differ slightly - always verify before substituting
 */

export const HARDWARE_EQUIVALENCE = {
  // =================================================================
  // Hinges (110° Full Overlay)
  // =================================================================
  hinges_110_full: {
    blum: 'CLIP_110_FULL',      // 71T3550
    hafele: 'METALLA_110_FULL', // 311.01.500
    compatible: true,
    notes: 'Same 35mm boring, mounting plates may differ'
  },

  // =================================================================
  // Hinges (110° Half Overlay)
  // =================================================================
  hinges_110_half: {
    blum: 'CLIP_110_HALF',      // 71T3650
    hafele: 'METALLA_110_HALF', // 311.01.501
    compatible: true,
    notes: 'Same 35mm boring'
  },

  // =================================================================
  // Drawer Runners - No direct equivalent
  // =================================================================
  drawer_runners: {
    blum_movento: 'BLUM_MOVENTO_RUNNERS',
    blum_tandem: 'BLUM_TANDEM_RUNNERS',
    hafele_equivalent: null,
    notes: 'Häfele uses different runner systems (Quadro, Matrix). Not directly interchangeable.'
  },

  // =================================================================
  // Cabinet Connectors
  // =================================================================
  minifix_connector: {
    blum: null,  // Blum doesn't make Minifix
    hafele: 'MINIFIX_15_CAM',
    notes: 'Häfele is the primary Minifix supplier'
  },

  // =================================================================
  // Wood Dowels - Universal
  // =================================================================
  dowel_8x30: {
    blum: null,
    hafele: 'DOWEL_8X30_FLUTED',
    generic: true,
    notes: 'Standard dowel size, any supplier acceptable'
  },
} as const;
```

### 3.2 Quick Lookup Table

| Category | Blum | Häfele | Interchangeable |
|----------|------|--------|-----------------|
| **Hinge 110° Full** | 71T3550 | 311.01.500 | Yes (same boring) |
| **Hinge 110° Half** | 71T3650 | 311.01.501 | Yes (same boring) |
| **Hinge 110° Inset** | 71T3750 | 311.01.502 | Yes (same boring) |
| **Hinge 155°** | 71T6550 | N/A | No equivalent |
| **Drawer Runner** | 760H series | Quadro series | No (different system) |
| **Minifix 15** | N/A | 262.26.034 | Häfele only |
| **S200 Bolt 24** | N/A | 262.27.670 | Häfele only |
| **Wood Dowel 8×30** | N/A | 267.83.230 | Universal |

---

## ส่วนที่ 4: Drilling Specifications Summary

### 4.1 Standard Boring Dimensions

```typescript
// specs/reference/hardware/drilling-specs.ts

export const DRILLING_SPECS = {
  // =================================================================
  // Hinge Boring (Universal - Blum & Häfele)
  // =================================================================
  hinge_cup: {
    diameter: 35,
    depth: 11.5,      // 11.5-13mm depending on hinge
    centerFromEdge: 21.5,  // Standard for 18mm panel
    tolerance: 0.5
  },

  // =================================================================
  // Minifix Boring
  // =================================================================
  minifix_cam: {
    diameter: 15,
    depth: 12.7,
    tolerance: 0.2
  },
  minifix_bolt: {
    diameter: 5,      // Pilot hole for 6mm thread
    depth: 12,
    tolerance: 0.3
  },
  minifix_sleeve: {
    diameter: 10,
    depth: 14,        // For B24 (use 24 for B34)
    tolerance: 0.2
  },

  // =================================================================
  // Wood Dowel Boring
  // =================================================================
  dowel_8mm: {
    diameter: 8,
    depth: 16,        // Half of 30mm dowel + 1mm
    tolerance: 0.2
  },
  dowel_10mm: {
    diameter: 10,
    depth: 21,        // Half of 40mm dowel + 1mm
    tolerance: 0.2
  },

  // =================================================================
  // Shelf Pin Boring (System 32)
  // =================================================================
  shelf_pin: {
    diameter: 5,
    depth: 10,
    spacing: 32,      // System 32
    edgeMargin: 37,   // First hole from edge
    tolerance: 0.3
  },

  // =================================================================
  // Runner Mounting Holes
  // =================================================================
  runner_mount: {
    diameter: 5,
    depth: 13,
    tolerance: 0.3
  },
} as const;
```

---

## ส่วนที่ 5: Usage Guidelines

### 5.1 How to Import

```typescript
// In your component/service file:

// Import specific hardware
import { BLUM_MOVENTO_RUNNERS } from '@/specs/reference/hardware/blum-movento';
import { HAFELE_MINIFIX } from '@/specs/reference/hardware/hafele-minifix';

// Import all Blum
import * as BlumHardware from '@/specs/reference/hardware/blum';

// Import drilling specs
import { DRILLING_SPECS } from '@/specs/reference/hardware/drilling-specs';

// Example usage
const runner = BLUM_MOVENTO_RUNNERS['MOV_40_500'];
console.log(runner.itemNo);  // '760H5000S'
```

### 5.2 Never Duplicate

```typescript
// ❌ WRONG - Don't create local hardware database
const localRunners = {
  'MOV_40_500': { itemNo: '760H5000S', ... }  // DUPLICATE!
};

// ✅ CORRECT - Import from master database
import { BLUM_MOVENTO_RUNNERS } from '@/specs/reference/hardware/blum-movento';
const runner = BLUM_MOVENTO_RUNNERS['MOV_40_500'];
```

### 5.3 Adding New Hardware

1. Add to appropriate file in `specs/reference/hardware/`
2. Follow existing naming conventions
3. Include all required fields (itemNo, dimensions, etc.)
4. Update equivalence table if applicable
5. Update this document's version number

---

## ส่วนที่ 6: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-10 | Initial consolidation from multiple documents |

---

**Cross-References:**
- [Hardware Drilling Specifications](../manufacturing/hardware-drilling-specifications.md) - Uses this database
- [Door & Drawer Complete Guide](../manufacturing/door-drawer-complete-guide.md) - Uses this database
- [Formula Reference](./formula-reference.md) - Calculation formulas

**Source Documents:**
- Blum Catalog 2025 (Pages 2, 5, 6, 13, 14-67, 64, 74-76, 84, 150, 410-452)
- Häfele Furniture Fittings Handbook
- Häfele Selection 12-17
